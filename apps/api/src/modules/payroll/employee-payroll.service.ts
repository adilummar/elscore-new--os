import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EmploymentStatus, PayrollPaymentStatus, PayrollRunStatus, Prisma } from '@prisma/client';

import { AuditService } from '../../common/audit/audit.service';
import { IdGeneratorService } from '../../common/id-generator/id-generator.service';
import { PrismaService, PrismaTxClient } from '../../common/prisma/prisma.service';
import { isValidCalendarDate } from '../../common/utils/calendar-date.util';

import { CreatePayrollRunDto } from './dto/create-payroll-run.dto';
import { RecordPaymentDto } from './dto/record-payment.dto';

@Injectable()
export class EmployeePayrollService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly idGenerator: IdGeneratorService,
  ) {}

  /**
   * Create a new draft employee payroll run for a specified period.
   * Calculates gross and net amounts based on approved, effective compensation records.
   */
  async createDraftRun(dto: CreatePayrollRunDto, actorUserId: string) {
    if (!isValidCalendarDate(dto.periodStart) || !isValidCalendarDate(dto.periodEnd)) {
      throw new BadRequestException('periodStart and periodEnd must be valid calendar dates (YYYY-MM-DD)');
    }

    if (dto.periodStart > dto.periodEnd) {
      throw new BadRequestException('periodStart must be on or before periodEnd');
    }

    return this.prisma.$transaction(async (tx: PrismaTxClient) => {
      // 1. Transactional domain-level advisory lock serializing all payroll run mutations
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('employee-payroll-run-mutation-lock'))`;

      // 2. Reject if an overlapping run already exists (unless cancelled)
      const existingRun = await tx.employeePayrollRun.findFirst({
        where: {
          status: { not: PayrollRunStatus.CANCELLED },
          periodStart: { lte: dto.periodEnd },
          periodEnd: { gte: dto.periodStart },
        },
      });

      if (existingRun) {
        if (existingRun.status === PayrollRunStatus.FINALIZED) {
          throw new ConflictException(
            `A finalized employee payroll run already overlaps period ${dto.periodStart} to ${dto.periodEnd}: [${existingRun.periodStart} to ${existingRun.periodEnd}] (${existingRun.businessId})`,
          );
        }
        throw new ConflictException(
          `A draft employee payroll run already overlaps period ${dto.periodStart} to ${dto.periodEnd}: [${existingRun.periodStart} to ${existingRun.periodEnd}] (${existingRun.businessId})`,
        );
      }

      // 3. Find all eligible employees (PROBATION, ACTIVE, NOTICE_PERIOD, ON_LEAVE)
      const eligibleStatuses: EmploymentStatus[] = [
        EmploymentStatus.PROBATION,
        EmploymentStatus.ACTIVE,
        EmploymentStatus.NOTICE_PERIOD,
        EmploymentStatus.ON_LEAVE,
      ];

      const employees = await tx.employee.findMany({
        where: {
          employmentStatus: { in: eligibleStatuses },
        },
        include: {
          compensations: {
            where: {
              isActive: true,
              effectiveFrom: { lte: dto.periodEnd },
              OR: [
                { effectiveTo: null },
                { effectiveTo: { gte: dto.periodStart } },
              ],
            },
            orderBy: [{ effectiveFrom: 'desc' }, { createdAt: 'desc' }],
          },
          department: { select: { id: true, name: true } },
        },
      });

      if (employees.length === 0) {
        throw new BadRequestException('No eligible employees found for payroll generation');
      }

      // 4. Validate that EVERY eligible employee has an active approved compensation row
      const itemsToCreate: Array<{
        employeeId: string;
        compensationId: string;
        baseSalary: Prisma.Decimal;
        grossAmount: Prisma.Decimal;
        deductions: Prisma.Decimal;
        netAmount: Prisma.Decimal;
      }> = [];

      let totalGross = new Prisma.Decimal(0);
      let totalDeductions = new Prisma.Decimal(0);
      let totalNet = new Prisma.Decimal(0);

      for (const emp of employees) {
        if (!emp.compensations || emp.compensations.length === 0) {
          throw new BadRequestException(
            `Employee ${emp.businessId} (${emp.firstName} ${emp.lastName}) has no active compensation configured for period ${dto.periodStart} to ${dto.periodEnd}`,
          );
        }

        // FIN-AUD-002: Mid-period salary changes or multiple intersecting compensations cannot be safely automated without proration
        if (emp.compensations.length > 1) {
          throw new BadRequestException(
            `Employee ${emp.businessId} (${emp.firstName} ${emp.lastName}) has multiple active compensation records intersecting period ${dto.periodStart} to ${dto.periodEnd}. Automated unprorated salary calculation is not permitted for mid-period salary changes. Please create split payroll runs or manual adjustments.`,
          );
        }

        const comp = emp.compensations[0];
        if (comp.effectiveFrom > dto.periodStart) {
          throw new BadRequestException(
            `Employee ${emp.businessId} (${emp.firstName} ${emp.lastName}) has compensation starting mid-period on ${comp.effectiveFrom} (after period start ${dto.periodStart}). Automated unprorated salary calculation is not permitted for mid-period compensation revisions. Please create split payroll runs or manual adjustments.`,
          );
        }

        if (comp.effectiveTo && comp.effectiveTo < dto.periodEnd) {
          throw new BadRequestException(
            `Employee ${emp.businessId} (${emp.firstName} ${emp.lastName}) has compensation ending mid-period on ${comp.effectiveTo} (before period end ${dto.periodEnd}). Automated unprorated salary calculation is not permitted for mid-period compensation revisions. Please create split payroll runs or manual adjustments.`,
          );
        }

        const baseSalary = comp.baseSalary;
        const grossAmount = baseSalary;
        const deductions = new Prisma.Decimal(0);
        const netAmount = grossAmount.sub(deductions);

        totalGross = totalGross.add(grossAmount);
        totalDeductions = totalDeductions.add(deductions);
        totalNet = totalNet.add(netAmount);

        itemsToCreate.push({
          employeeId: emp.id,
          compensationId: comp.id,
          baseSalary,
          grossAmount,
          deductions,
          netAmount,
        });
      }

      // 5. Generate human-readable business ID and persist run and items
      const businessId = await this.idGenerator.nextIdInTx(tx, 'PR');

      const payrollRun = await tx.employeePayrollRun.create({
        data: {
          businessId,
          periodStart: dto.periodStart,
          periodEnd: dto.periodEnd,
          currency: 'INR',
          status: PayrollRunStatus.DRAFT,
          totalGross,
          totalDeductions,
          totalNet,
          employeeCount: itemsToCreate.length,
          notes: dto.notes?.trim() || null,
          createdByUserId: actorUserId,
          items: {
            create: itemsToCreate.map((item) => ({
              employeeId: item.employeeId,
              compensationId: item.compensationId,
              currency: 'INR',
              baseSalary: item.baseSalary,
              grossAmount: item.grossAmount,
              deductions: item.deductions,
              netAmount: item.netAmount,
              paymentStatus: PayrollPaymentStatus.UNPAID,
            })),
          },
        },
        include: {
          items: {
            include: {
              employee: {
                select: {
                  id: true,
                  businessId: true,
                  firstName: true,
                  lastName: true,
                  jobTitle: true,
                  department: { select: { name: true } },
                },
              },
            },
          },
        },
      });

      // 6. Audit logging
      await this.audit.recordInTx(tx, {
        action: 'payroll.run.create',
        entityType: 'employee_payroll_run',
        entityId: payrollRun.id,
        actorUserId,
        metadata: {
          businessId: payrollRun.businessId,
          periodStart: dto.periodStart,
          periodEnd: dto.periodEnd,
          employeeCount: payrollRun.employeeCount,
          totalNet: payrollRun.totalNet.toString(),
        },
      });

      return payrollRun;
    });
  }

  /**
   * List employee payroll runs.
   */
  async getRuns(status?: PayrollRunStatus) {
    return this.prisma.employeePayrollRun.findMany({
      where: status ? { status } : undefined,
      orderBy: { createdAt: 'desc' },
      include: {
        createdBy: { select: { id: true, email: true, employee: { select: { firstName: true, lastName: true } } } },
        finalizedBy: { select: { id: true, email: true, employee: { select: { firstName: true, lastName: true } } } },
      },
    });
  }

  /**
   * Get full details of a specific payroll run including items.
   * Field-level privacy is preserved: sensitive PAN and bank accounts are omitted.
   */
  async getRunById(id: string) {
    const run = await this.prisma.employeePayrollRun.findUnique({
      where: { id },
      include: {
        createdBy: { select: { id: true, email: true, employee: { select: { firstName: true, lastName: true } } } },
        finalizedBy: { select: { id: true, email: true, employee: { select: { firstName: true, lastName: true } } } },
        items: {
          orderBy: { employee: { businessId: 'asc' } },
          include: {
            employee: {
              select: {
                id: true,
                businessId: true,
                firstName: true,
                lastName: true,
                jobTitle: true,
                department: { select: { id: true, name: true } },
              },
            },
            paidBy: { select: { id: true, email: true, employee: { select: { firstName: true, lastName: true } } } },
          },
        },
      },
    });

    if (!run) {
      throw new NotFoundException(`Employee payroll run with ID ${id} not found`);
    }

    return run;
  }

  /**
   * Finalize an employee payroll run.
   * Freezes run and item amounts permanently.
   */
  async finalizeRun(id: string, actorUserId: string) {
    return this.prisma.$transaction(async (tx: PrismaTxClient) => {
      // 1. Transactional domain-level advisory lock serializing all payroll run mutations
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('employee-payroll-run-mutation-lock'))`;

      const run = await tx.employeePayrollRun.findUnique({
        where: { id },
      });

      if (!run) {
        throw new NotFoundException(`Employee payroll run with ID ${id} not found`);
      }

      if (run.status === PayrollRunStatus.FINALIZED) {
        throw new BadRequestException('Payroll run is already finalized');
      }

      if (run.status === PayrollRunStatus.CANCELLED) {
        throw new BadRequestException('Cannot finalize a cancelled payroll run');
      }

      // 2. Reject finalization if any other finalized run overlaps this period
      const overlappingFinalized = await tx.employeePayrollRun.findFirst({
        where: {
          id: { not: id },
          status: PayrollRunStatus.FINALIZED,
          periodStart: { lte: run.periodEnd },
          periodEnd: { gte: run.periodStart },
        },
      });

      if (overlappingFinalized) {
        throw new ConflictException(
          `Cannot finalize run: an overlapping employee payroll run is already finalized: [${overlappingFinalized.periodStart} to ${overlappingFinalized.periodEnd}] (${overlappingFinalized.businessId})`,
        );
      }

      const finalized = await tx.employeePayrollRun.update({
        where: { id },
        data: {
          status: PayrollRunStatus.FINALIZED,
          finalizedByUserId: actorUserId,
          finalizedAt: new Date(),
        },
        include: {
          items: true,
        },
      });

      await this.audit.recordInTx(tx, {
        action: 'payroll.run.finalize',
        entityType: 'employee_payroll_run',
        entityId: id,
        actorUserId,
        metadata: {
          businessId: finalized.businessId,
          totalGross: finalized.totalGross.toString(),
          totalNet: finalized.totalNet.toString(),
          employeeCount: finalized.employeeCount,
        },
      });

      return finalized;
    });
  }

  /**
   * Cancel a draft employee payroll run.
   * Finalized runs cannot be cancelled.
   */
  async cancelDraftRun(id: string, actorUserId: string) {
    return this.prisma.$transaction(async (tx: PrismaTxClient) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('employee-payroll-run-mutation-lock'))`;

      const run = await tx.employeePayrollRun.findUnique({
        where: { id },
      });

      if (!run) {
        throw new NotFoundException(`Employee payroll run with ID ${id} not found`);
      }

      if (run.status === PayrollRunStatus.FINALIZED) {
        throw new BadRequestException('Finalized payroll runs cannot be cancelled');
      }

      if (run.status === PayrollRunStatus.CANCELLED) {
        throw new BadRequestException('Payroll run is already cancelled');
      }

      const cancelled = await tx.employeePayrollRun.update({
        where: { id },
        data: { status: PayrollRunStatus.CANCELLED },
      });

      await this.audit.recordInTx(tx, {
        action: 'payroll.run.cancel',
        entityType: 'employee_payroll_run',
        entityId: id,
        actorUserId,
        metadata: {
          businessId: run.businessId,
        },
      });

      return cancelled;
    });
  }

  /**
   * Record payment for a specific employee payroll item.
   * Can ONLY be performed on items belonging to a FINALIZED payroll run.
   */
  async recordItemPayment(itemId: string, dto: RecordPaymentDto, actorUserId: string) {
    return this.prisma.$transaction(async (tx: PrismaTxClient) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('emp-payroll-item-' || ${itemId}))`;

      const item = await tx.employeePayrollItem.findUnique({
        where: { id: itemId },
        include: { payrollRun: true, employee: true },
      });

      if (!item) {
        throw new NotFoundException(`Payroll item with ID ${itemId} not found`);
      }

      if (item.payrollRun.status !== PayrollRunStatus.FINALIZED) {
        throw new BadRequestException(
          'Cannot record payment for an unfinalized payroll run. The run must be finalized first.',
        );
      }

      if (item.paymentStatus === PayrollPaymentStatus.PAID) {
        throw new BadRequestException('Payment has already been recorded for this item');
      }

      const updatedItem = await tx.employeePayrollItem.update({
        where: { id: itemId },
        data: {
          paymentStatus: PayrollPaymentStatus.PAID,
          paidAt: new Date(),
          paidByUserId: actorUserId,
          paymentReference: dto.paymentReference?.trim() || null,
          paymentNotes: dto.paymentNotes?.trim() || null,
        },
        include: {
          employee: {
            select: {
              id: true,
              businessId: true,
              firstName: true,
              lastName: true,
            },
          },
          paidBy: { select: { id: true, email: true, employee: { select: { firstName: true, lastName: true } } } },
        },
      });

      await this.audit.recordInTx(tx, {
        action: 'payroll.payment.record',
        entityType: 'employee_payroll_item',
        entityId: itemId,
        actorUserId,
        metadata: {
          payrollRunId: item.payrollRunId,
          payrollBusinessId: item.payrollRun.businessId,
          employeeId: item.employeeId,
          employeeBusinessId: item.employee.businessId,
          netAmount: item.netAmount.toString(),
          paymentReference: dto.paymentReference,
        },
      });

      return updatedItem;
    });
  }
}
