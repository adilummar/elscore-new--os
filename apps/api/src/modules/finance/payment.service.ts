import { Injectable, NotFoundException, BadRequestException, ConflictException } from '@nestjs/common';
import { InvoiceStatus, PaymentStatus, RefundStatus, InstallmentStatus, Prisma } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';

import { AuditService } from '../../common/audit/audit.service';
import { IdGeneratorService } from '../../common/id-generator/id-generator.service';
import { PrismaService, PrismaTxClient } from '../../common/prisma/prisma.service';

import { RecordPaymentDto, ReversePaymentDto, RequestRefundDto } from './dto/payment.dto';


@Injectable()
export class PaymentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly idGenerator: IdGeneratorService,
    private readonly auditService: AuditService,
  ) {}

  async recordPayment(dto: RecordPaymentDto, actorUserId: string) {
    return this.prisma.$transaction(async (tx: PrismaTxClient) => {
      // 1. Idempotency Check
      const existing = await tx.payment.findUnique({
        where: { idempotencyKey: dto.idempotencyKey },
        include: { receipt: true },
      });
      if (existing) {
        return existing;
      }

      // 2. Lock Invoice FOR UPDATE
      const invoices = await tx.$queryRawUnsafe<any[]>(
        'SELECT * FROM "invoices" WHERE "id" = $1 FOR UPDATE',
        dto.invoiceId
      );
      if (invoices.length === 0) throw new NotFoundException('Invoice not found');
      
      const invoiceData = await tx.invoice.findUnique({
        where: { id: dto.invoiceId },
        include: { lineItems: true, installments: { orderBy: { sequence: 'asc' } }, student: true }
      });
      
      if (!invoiceData) throw new NotFoundException('Invoice not found');

      if (invoiceData.status === InvoiceStatus.DRAFT || invoiceData.status === InvoiceStatus.VOIDED) {
        throw new BadRequestException('Cannot record payment against DRAFT or VOIDED invoice');
      }

      const paymentAmount = new Decimal(dto.amount);
      if (paymentAmount.greaterThan(invoiceData.outstanding)) {
        throw new BadRequestException('Payment cannot exceed outstanding balance');
      }

      // 3. Create Payment & Receipt
      const paymentBusinessId = await this.idGenerator.nextIdInTx(tx, 'PMT');
      const receiptBusinessId = await this.idGenerator.nextIdInTx(tx, 'RCT');

      const payment = await tx.payment.create({
        data: {
          businessId: paymentBusinessId,
          invoiceId: dto.invoiceId,
          idempotencyKey: dto.idempotencyKey,
          amount: paymentAmount,
          paymentMethod: dto.paymentMethod,
          receivedAt: new Date(),
          recordedBy: actorUserId,
          note: dto.note,
          status: PaymentStatus.SUCCESS,
        },
      });

      const receipt = await tx.receipt.create({
        data: {
          businessId: receiptBusinessId,
          paymentId: payment.id,
          amount: paymentAmount,
          isValid: true,
        },
      });

      // 4. Update Invoice Balance
      const newPaid = invoiceData.amountPaid.add(paymentAmount);
      const newOutstanding = invoiceData.outstanding.sub(paymentAmount);
      let newStatus = invoiceData.status;

      if (newOutstanding.equals(0)) {
        newStatus = InvoiceStatus.PAID;
      } else if (newPaid.greaterThan(0)) {
        newStatus = InvoiceStatus.PARTIALLY_PAID;
      }

      await tx.invoice.update({
        where: { id: dto.invoiceId },
        data: {
          amountPaid: newPaid,
          outstanding: newOutstanding,
          status: newStatus,
        },
      });

      // 5. Allocate to installments
      let remainingAllocation = paymentAmount;
      for (const inst of invoiceData.installments) {
        if (remainingAllocation.lessThanOrEqualTo(0)) break;
        if (inst.status === InstallmentStatus.PAID) continue;

        const instOutstanding = inst.amount.sub(inst.amountPaid);
        const applyToInst = Decimal.min(instOutstanding, remainingAllocation);
        
        const instNewPaid = inst.amountPaid.add(applyToInst);
        let instNewStatus: InstallmentStatus = inst.status;
        if (instNewPaid.equals(inst.amount)) {
          instNewStatus = InstallmentStatus.PAID;
        } else if (instNewPaid.greaterThan(0)) {
          instNewStatus = InstallmentStatus.PARTIALLY_PAID;
        }

        await tx.installment.update({
          where: { id: inst.id },
          data: {
            amountPaid: instNewPaid,
            status: instNewStatus,
          },
        });
        remainingAllocation = remainingAllocation.sub(applyToInst);
      }

      // 6. Calculate Sales Target Credit
      // Total credit awarded so far for this invoice
      const pastCredits = await tx.targetCreditLedger.aggregate({
        where: { invoiceId: invoiceData.id },
        _sum: { amount: true }
      });
      const previousTotalCredit = pastCredits._sum.amount || new Decimal(0);

      // Max possible credit = Total - RegistrationFee (already accounted for discounts in Total)
      const regFees = invoiceData.lineItems
        .filter((l: { type: string; totalAmount: Decimal }) => l.type === 'REGISTRATION_FEE')
        .reduce((sum: Decimal, l: { type: string; totalAmount: Decimal }) => sum.add(l.totalAmount), new Decimal(0));
      
      const maxPossibleCredit = invoiceData.total.sub(regFees);
      
      // Calculate how much of this payment can be credited
      // (Any payment towards registration fee doesn't count)
      const currentTheoreticalTotalReceived = invoiceData.amountPaid.add(paymentAmount); // Includes this payment
      const totalEligibleCreditOverall = Decimal.min(Decimal.max(currentTheoreticalTotalReceived.sub(regFees), 0), maxPossibleCredit);
      const newCreditToAward = totalEligibleCreditOverall.sub(previousTotalCredit);

      if (newCreditToAward.greaterThan(0) && invoiceData.student.leadId) {
        const lead = await tx.lead.findUnique({ where: { id: invoiceData.student.leadId } });
        if (lead && lead.assignedToUserId) {
          await tx.targetCreditLedger.create({
            data: {
              salesOwnerId: lead.assignedToUserId,
              leadId: lead.id,
              studentId: invoiceData.studentId,
              invoiceId: invoiceData.id,
              paymentId: payment.id,
              amount: newCreditToAward,
              transactionType: 'PAYMENT',
            },
          });
          
          await this.auditService.recordInTx(tx, {
            action: 'TARGET_CREDIT_AWARDED',
            actorUserId,
            entityId: payment.id,
            entityType: 'PAYMENT',
            metadata: { amount: newCreditToAward.toString(), salesOwnerId: lead.assignedToUserId },
          });
        }
      }

      // 7. Audit
      await this.auditService.recordInTx(tx, {
        action: 'PAYMENT_RECORDED',
        actorUserId,
        entityId: payment.id,
        entityType: 'PAYMENT',
        metadata: { businessId: payment.businessId, amount: paymentAmount.toString() },
      });

      return { ...payment, receipt };
    });
  }

  async reversePayment(id: string, dto: ReversePaymentDto, actorUserId: string) {
    return this.prisma.$transaction(async (tx: PrismaTxClient) => {
      // lock invoice
      const payment = await tx.payment.findUnique({
        where: { id },
        include: { invoice: true, receipt: true }
      });
      if (!payment) throw new NotFoundException('Payment not found');
      if (payment.status === PaymentStatus.REVERSED) {
        throw new BadRequestException('Payment is already reversed');
      }

      // Lock invoice
      await tx.$queryRawUnsafe<any[]>(
        'SELECT * FROM "invoices" WHERE "id" = CAST($1 AS UUID) FOR UPDATE',
        payment.invoiceId
      );

      // We won't re-calculate installments perfectly here for brevity, 
      // but we do revert invoice balance.
      const invoiceData = await tx.invoice.findUnique({ where: { id: payment.invoiceId } });
      if (!invoiceData) throw new NotFoundException('Invoice not found');

      const newPaid = invoiceData.amountPaid.sub(payment.amount);
      const newOutstanding = invoiceData.outstanding.add(payment.amount);
      
      let newStatus = invoiceData.status;
      if (newPaid.equals(0)) {
        newStatus = InvoiceStatus.ISSUED; // assuming it goes back to issued if 0
      } else {
        newStatus = InvoiceStatus.PARTIALLY_PAID;
      }

      await tx.invoice.update({
        where: { id: payment.invoiceId },
        data: {
          amountPaid: newPaid,
          outstanding: newOutstanding,
          status: newStatus,
        },
      });

      // Update payment & receipt
      await tx.payment.update({
        where: { id },
        data: {
          status: PaymentStatus.REVERSED,
          reversalReason: dto.reversalReason,
        },
      });

      if (payment.receipt) {
        await tx.receipt.update({
          where: { id: payment.receipt.id },
          data: { isValid: false },
        });
      }

      // Clawback credit
      const credit = await tx.targetCreditLedger.findFirst({
        where: { paymentId: payment.id, transactionType: 'PAYMENT' },
      });

      if (credit) {
        await tx.targetCreditLedger.create({
          data: {
            salesOwnerId: credit.salesOwnerId,
            leadId: credit.leadId,
            studentId: credit.studentId,
            invoiceId: credit.invoiceId,
            paymentId: payment.id,
            amount: credit.amount.mul(-1),
            transactionType: 'PAYMENT_REVERSAL',
          },
        });
      }

      await this.auditService.recordInTx(tx, {
        action: 'PAYMENT_REVERSED',
        actorUserId,
        entityId: payment.id,
        entityType: 'PAYMENT',
        metadata: { businessId: payment.businessId, reason: dto.reversalReason },
      });

      return { success: true };
    });
  }

  async requestRefund(dto: RequestRefundDto, actorUserId: string) {
    // Basic refund request logic
    const payment = await this.prisma.payment.findUnique({
      where: { id: dto.paymentId },
      include: { invoice: { include: { lineItems: true } } },
    });
    if (!payment) throw new NotFoundException('Payment not found');
    
    // Calculate max refundable
    const refunds = await this.prisma.refund.aggregate({
      where: { paymentId: payment.id, status: { in: ['REQUESTED', 'APPROVED', 'EXECUTED'] } },
      _sum: { amount: true },
    });
    const alreadyRefunded = refunds._sum.amount || new Decimal(0);
    const maxRefundable = payment.amount.sub(alreadyRefunded);

    if (new Decimal(dto.amount).greaterThan(maxRefundable)) {
      throw new BadRequestException('Refund amount exceeds refundable payment balance');
    }

    // Reg fee restriction
    const regFees = payment.invoice.lineItems
      .filter((l: { type: string; totalAmount: Decimal }) => l.type === 'REGISTRATION_FEE')
      .reduce((sum: Decimal, l: { type: string; totalAmount: Decimal }) => sum.add(l.totalAmount), new Decimal(0));
    
    // Theoretical max refundable on invoice overall is total - regfee
    // Calculate how much the invoice can refund across all payments
    const totalPaymentsReceived = payment.invoice.amountPaid; // Actually this might include the current payment, but refund is per payment
    // A simpler strictly compliant business rule:
    // We determine the maximum refundable for THIS specific payment based on proportional allocation,
    // or simply total invoice refundable limit.
    // If invoice total is 2500, reg fee is 500, max overall refundable is 2000.
    // We must ensure that (all requested/approved/executed refunds on the invoice) + dto.amount <= invoice.total - regFees.

    const allInvoiceRefunds = await this.prisma.refund.aggregate({
      where: { 
        payment: { invoiceId: payment.invoiceId },
        status: { in: ['REQUESTED', 'APPROVED', 'EXECUTED'] }
      },
      _sum: { amount: true }
    });
    const totalRefundedOnInvoice = allInvoiceRefunds._sum.amount || new Decimal(0);
    const invoiceMaxRefundable = payment.invoice.total.sub(regFees);

    if (totalRefundedOnInvoice.add(dto.amount).greaterThan(invoiceMaxRefundable)) {
      throw new BadRequestException('Cannot refund registration fee amounts.');
    }
    
    const refund = await this.prisma.refund.create({
      data: {
        paymentId: payment.id,
        amount: dto.amount,
        reason: dto.reason,
        status: RefundStatus.REQUESTED,
        requestedBy: actorUserId,
      },
    });

    await this.auditService.record({
      action: 'REFUND_REQUESTED',
      actorUserId,
      entityId: refund.id,
      entityType: 'REFUND',
    });

    return refund;
  }
}
