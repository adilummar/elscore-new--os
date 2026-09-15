import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InvoiceStatus, InvoiceLineItemType, Prisma } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';

import { AuditService } from '../../common/audit/audit.service';
import { IdGeneratorService } from '../../common/id-generator/id-generator.service';
import { PrismaService, PrismaTxClient } from '../../common/prisma/prisma.service';

import { CreateInvoiceDto, CreateInvoiceLineItemDto, CreateInstallmentDto } from './dto/invoice.dto';


@Injectable()
export class InvoiceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly idGenerator: IdGeneratorService,
    private readonly auditService: AuditService,
  ) {}

  async createDraft(dto: CreateInvoiceDto, actorUserId: string) {
    return this.prisma.$transaction(async (tx: PrismaTxClient) => {
      // Create invoice ID
      const businessId = await this.idGenerator.nextIdInTx(tx, 'INV');

      // Verify student
      const student = await tx.student.findUnique({
        where: { id: dto.studentId },
      });
      if (!student) throw new NotFoundException('Student not found');

      let subtotal = new Decimal(0);
      for (const item of dto.lineItems) {
        subtotal = subtotal.add(new Decimal(item.unitAmount).mul(item.quantity));
      }

      const discount = new Decimal(dto.discountAmount || 0);
      if (discount.lessThan(0)) {
        throw new BadRequestException('Discount cannot be negative');
      }

      const total = subtotal.sub(discount);
      if (total.lessThan(0)) {
        throw new BadRequestException('Discount cannot exceed subtotal');
      }

      const invoice = await tx.invoice.create({
        data: {
          businessId,
          studentId: dto.studentId,
          leadId: dto.leadId || student.leadId,
          status: InvoiceStatus.DRAFT,
          subtotal,
          discountAmount: discount,
          total,
          amountPaid: new Decimal(0),
          outstanding: total,
          createdBy: actorUserId,
          lineItems: {
            create: dto.lineItems.map(item => ({
              type: item.type,
              description: item.description,
              quantity: item.quantity,
              unitAmount: new Decimal(item.unitAmount),
              totalAmount: new Decimal(item.unitAmount).mul(item.quantity),
            })),
          },
          installments: dto.installments && dto.installments.length > 0 ? {
            create: dto.installments.map(inst => ({
              sequence: inst.sequence,
              amount: new Decimal(inst.amount),
              dueDate: new Date(inst.dueDate),
            }))
          } : undefined,
        },
        include: {
          lineItems: true,
          installments: true,
        },
      });

      await this.auditService.recordInTx(tx, {
        action: 'INVOICE_DRAFTED',
        actorUserId,
        entityId: invoice.id,
        entityType: 'INVOICE',
        metadata: { businessId },
      });

      return invoice;
    });
  }

  async issueInvoice(id: string, actorUserId: string) {
    return this.prisma.$transaction(async (tx: PrismaTxClient) => {
      const invoice = await tx.invoice.findUnique({ where: { id } });
      if (!invoice) throw new NotFoundException('Invoice not found');
      if (invoice.status !== InvoiceStatus.DRAFT) {
        throw new BadRequestException('Only DRAFT invoices can be issued');
      }

      const updated = await tx.invoice.update({
        where: { id },
        data: {
          status: InvoiceStatus.ISSUED,
          issuedAt: new Date(),
          issuedBy: actorUserId,
        },
        include: {
          lineItems: true,
          installments: true,
        },
      });

      await this.auditService.recordInTx(tx, {
        action: 'INVOICE_ISSUED',
        actorUserId,
        entityId: id,
        entityType: 'INVOICE',
        metadata: { businessId: invoice.businessId },
      });

      return updated;
    });
  }

  async voidInvoice(id: string, actorUserId: string) {
    return this.prisma.$transaction(async (tx: PrismaTxClient) => {
      const invoice = await tx.invoice.findUnique({
        where: { id },
        include: { payments: true }
      });
      if (!invoice) throw new NotFoundException('Invoice not found');
      
      if (invoice.payments.some((p: { status: string }) => p.status === 'SUCCESS')) {
        throw new BadRequestException('Cannot void invoice with successful payments. Reverse payments or issue refunds first.');
      }

      const updated = await tx.invoice.update({
        where: { id },
        data: {
          status: InvoiceStatus.VOIDED,
          voidedAt: new Date(),
        },
      });

      await this.auditService.recordInTx(tx, {
        action: 'INVOICE_VOIDED',
        actorUserId,
        entityId: id,
        entityType: 'INVOICE',
        metadata: { businessId: invoice.businessId },
      });

      return updated;
    });
  }

  async getInvoice(id: string) {
    const invoice = await this.prisma.invoice.findUnique({
      where: { id },
      include: {
        lineItems: true,
        installments: true,
        payments: {
          where: { status: 'SUCCESS' },
          include: { receipt: true },
        },
      },
    });
    if (!invoice) throw new NotFoundException('Invoice not found');
    return invoice;
  }

  async generatePdf(id: string): Promise<Buffer> {
    const invoice = await this.getInvoice(id);
    
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const PDFDocument = require('pdfkit');
    return new Promise((resolve, reject) => {
      try {
        const doc = new PDFDocument({ margin: 50 });
        const buffers: Buffer[] = [];
        
        doc.on('data', (chunk: any) => buffers.push(chunk));
        doc.on('end', () => resolve(Buffer.concat(buffers)));

        // Basic Invoice PDF Structure
        doc.fontSize(20).text('INVOICE', { align: 'center' }).moveDown();
        doc.fontSize(12).text(`Business ID: ${invoice.businessId}`);
        doc.text(`Status: ${invoice.status}`);
        doc.text(`Student ID: ${invoice.studentId}`);
        doc.text(`Issued At: ${invoice.issuedAt ? invoice.issuedAt.toISOString() : 'N/A'}`);
        doc.moveDown();

        doc.fontSize(14).text('Line Items:', { underline: true }).moveDown(0.5);
        invoice.lineItems.forEach((item) => {
          doc.fontSize(12).text(`- ${item.type}: ${item.description}`);
          doc.text(`  Qty: ${item.quantity} | Unit: ${item.unitAmount} | Total: ${item.totalAmount}`);
          doc.moveDown(0.5);
        });

        doc.moveDown();
        doc.fontSize(14).text('Summary:', { underline: true }).moveDown(0.5);
        doc.fontSize(12).text(`Subtotal: ${invoice.subtotal.toString()}`);
        doc.text(`Discount: ${invoice.discountAmount.toString()}`);
        doc.text(`Total: ${invoice.total.toString()}`);
        doc.text(`Amount Paid: ${invoice.amountPaid.toString()}`);
        doc.text(`Outstanding: ${invoice.outstanding.toString()}`);

        doc.end();
      } catch (err) {
        reject(err);
      }
    });
  }
}
