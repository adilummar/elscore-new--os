import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  PayrollPaymentStatus,
  PayrollRunStatus,
  Prisma,
  SessionCancellationReason,
  TutorClassRecordStatus,
} from '@prisma/client';
import { formatInTimeZone, fromZonedTime } from 'date-fns-tz';

import { AuditService } from '../../common/audit/audit.service';
import { IdGeneratorService } from '../../common/id-generator/id-generator.service';
import { PrismaService, PrismaTxClient } from '../../common/prisma/prisma.service';
import { isValidCalendarDate } from '../../common/utils/calendar-date.util';

import { CreateTutorPayableRunDto } from './dto/create-tutor-payable-run.dto';
import { RecordPaymentDto } from './dto/record-payment.dto';

@Injectable()
export class TutorPayableService {
  private readonly timezone: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly idGenerator: IdGeneratorService,
    private readonly configService: ConfigService,
  ) {
    this.timezone = this.configService.get<string>('crm.businessTimezone') || 'Asia/Kolkata';
  }

  /**
   * Create a new draft tutor payable run for a specified period.
   * Finds verified, payroll-ready tutor class records, resolves effective-dated tutor hourly rates,
   * and calculates itemized tutor earnings.
   */
  async createDraftRun(dto: CreateTutorPayableRunDto, actorUserId: string) {
    if (!isValidCalendarDate(dto.periodStart) || !isValidCalendarDate(dto.periodEnd)) {
      throw new BadRequestException('periodStart and periodEnd must be valid calendar dates (YYYY-MM-DD)');
    }

    if (dto.periodStart > dto.periodEnd) {
      throw new BadRequestException('periodStart must be on or before periodEnd');
    }

    return this.prisma.$transaction(async (tx: PrismaTxClient) => {
      // 1. Transactional domain-level advisory lock serializing all tutor payable run mutations
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('tutor-payable-run-mutation-lock'))`;

      // 2. Reject if an overlapping run already exists (unless cancelled)
      const existingRun = await tx.tutorPayableRun.findFirst({
        where: {
          status: { not: PayrollRunStatus.CANCELLED },
          periodStart: { lte: dto.periodEnd },
          periodEnd: { gte: dto.periodStart },
        },
      });

      if (existingRun) {
        if (existingRun.status === PayrollRunStatus.FINALIZED) {
          throw new ConflictException(
            `A finalized tutor payable run already overlaps period ${dto.periodStart} to ${dto.periodEnd}: [${existingRun.periodStart} to ${existingRun.periodEnd}] (${existingRun.businessId})`,
          );
        }
        throw new ConflictException(
          `A draft tutor payable run already overlaps period ${dto.periodStart} to ${dto.periodEnd}: [${existingRun.periodStart} to ${existingRun.periodEnd}] (${existingRun.businessId})`,
        );
      }

      // 3. Convert period bounds to UTC based on business timezone
      const startUtc = fromZonedTime(`${dto.periodStart} 00:00:00`, this.timezone);
      const endUtc = fromZonedTime(`${dto.periodEnd} 23:59:59.999`, this.timezone);

      // 4. Query eligible verified class records
      // Must be status=VERIFIED, isPayrollReady=true, cancellation=NOT_CANCELLED,
      // scheduledStart in range, and NOT already included in an active DRAFT or FINALIZED payable run
      const classRecords = await tx.tutorClassRecord.findMany({
        where: {
          status: TutorClassRecordStatus.VERIFIED,
          isPayrollReady: true,
          cancellation: SessionCancellationReason.NOT_CANCELLED,
          scheduledStart: {
            gte: startUtc,
            lte: endUtc,
          },
          payableItems: {
            none: {
              payableRun: {
                status: { in: [PayrollRunStatus.DRAFT, PayrollRunStatus.FINALIZED] },
              },
            },
          },
        },
        include: {
          tutor: {
            select: {
              id: true,
              email: true,
              employee: {
                select: {
                  id: true,
                  businessId: true,
                  firstName: true,
                  lastName: true,
                  tutorProfile: {
                    select: {
                      id: true,
                      rates: {
                        orderBy: [{ effectiveFrom: 'desc' }, { createdAt: 'desc' }],
                      },
                    },
                  },
                },
              },
            },
          },
        },
        orderBy: { scheduledStart: 'asc' },
      });

      if (classRecords.length === 0) {
        throw new BadRequestException(
          `No eligible verified class records found for period ${dto.periodStart} to ${dto.periodEnd}`,
        );
      }

      // 5. Build items and match effective rates
      const itemsToCreate: Array<{
        tutorId: string;
        tutorProfileId: string;
        classRecordId: string;
        tutorRateId: string;
        classDate: Date;
        workedMinutes: number;
        hourlyRate: Prisma.Decimal;
        currency: string;
        amount: Prisma.Decimal;
      }> = [];

      let totalAmount = new Prisma.Decimal(0);
      let totalMinutes = 0;
      const distinctTutors = new Set<string>();

      for (const record of classRecords) {
        const emp = record.tutor?.employee;
        const profile = emp?.tutorProfile;

        if (!profile) {
          throw new BadRequestException(
            `Tutor profile not found for tutor user ID ${record.tutorId} (Class record: ${record.businessId})`,
          );
        }

        // Determine class calendar date in business timezone
        const classDateStr = formatInTimeZone(record.scheduledStart, this.timezone, 'yyyy-MM-dd');

        // Match rate effective on scheduledStart timestamp:
        // effectiveFrom <= scheduledStart && (effectiveTo == null || effectiveTo > scheduledStart)
        const matchingRate = profile.rates.find((r) => {
          if (r.effectiveFrom > record.scheduledStart) return false;
          if (r.effectiveTo && r.effectiveTo <= record.scheduledStart) return false;
          return true;
        });

        if (!matchingRate) {
          throw new BadRequestException(
            `No active tutor rate found for tutor ${emp.firstName} ${emp.lastName} on class date ${classDateStr} (Class record: ${record.businessId})`,
          );
        }

        // Calculate hours worked and amount
        const workedMinutes =
          record.workedMinutes != null && record.workedMinutes > 0
            ? record.workedMinutes
            : Math.max(0, Math.round((record.scheduledEnd.getTime() - record.scheduledStart.getTime()) / 60000));

        const hours = workedMinutes / 60;
        const rateNumber = Number(matchingRate.hourlyRate);
        const amountNum = Math.round(hours * rateNumber * 100) / 100;
        const amount = new Prisma.Decimal(amountNum.toFixed(2));

        totalAmount = totalAmount.add(amount);
        totalMinutes += workedMinutes;
        distinctTutors.add(record.tutorId);

        itemsToCreate.push({
          tutorId: record.tutorId,
          tutorProfileId: profile.id,
          classRecordId: record.id,
          tutorRateId: matchingRate.id,
          classDate: record.scheduledStart,
          workedMinutes,
          hourlyRate: matchingRate.hourlyRate,
          currency: matchingRate.currency || 'AED',
          amount,
        });
      }

      const totalHours = new Prisma.Decimal((totalMinutes / 60).toFixed(2));

      // 6. Generate business ID and persist
      const businessId = await this.idGenerator.nextIdInTx(tx, 'TPR');

      const payableRun = await tx.tutorPayableRun.create({
        data: {
          businessId,
          periodStart: dto.periodStart,
          periodEnd: dto.periodEnd,
          currency: 'AED',
          status: PayrollRunStatus.DRAFT,
          totalAmount,
          totalHours,
          classCount: itemsToCreate.length,
          tutorCount: distinctTutors.size,
          notes: dto.notes?.trim() || null,
          createdByUserId: actorUserId,
          items: {
            create: itemsToCreate.map((item) => ({
              tutorId: item.tutorId,
              tutorProfileId: item.tutorProfileId,
              classRecordId: item.classRecordId,
              tutorRateId: item.tutorRateId,
              classDate: item.classDate,
              workedMinutes: item.workedMinutes,
              hourlyRate: item.hourlyRate,
              currency: item.currency,
              amount: item.amount,
              paymentStatus: PayrollPaymentStatus.UNPAID,
            })),
          },
        },
        include: {
          items: {
            include: {
              classRecord: {
                select: {
                  id: true,
                  businessId: true,
                  scheduledStart: true,
                  scheduledEnd: true,
                  workedMinutes: true,
                },
              },
            },
          },
        },
      });

      // 7. Audit logging
      await this.audit.recordInTx(tx, {
        action: 'tutor.payable.create',
        entityType: 'tutor_payable_run',
        entityId: payableRun.id,
        actorUserId,
        metadata: {
          businessId: payableRun.businessId,
          periodStart: dto.periodStart,
          periodEnd: dto.periodEnd,
          classCount: payableRun.classCount,
          tutorCount: payableRun.tutorCount,
          totalAmount: payableRun.totalAmount.toString(),
          totalHours: payableRun.totalHours.toString(),
        },
      });

      return payableRun;
    });
  }

  /**
   * List tutor payable runs.
   */
  async getRuns(status?: PayrollRunStatus) {
    return this.prisma.tutorPayableRun.findMany({
      where: status ? { status } : undefined,
      orderBy: { createdAt: 'desc' },
      include: {
        createdBy: { select: { id: true, email: true, employee: { select: { firstName: true, lastName: true } } } },
        finalizedBy: { select: { id: true, email: true, employee: { select: { firstName: true, lastName: true } } } },
      },
    });
  }

  /**
   * Get tutor payable run by ID with itemized entries.
   */
  async getRunById(id: string) {
    const run = await this.prisma.tutorPayableRun.findUnique({
      where: { id },
      include: {
        createdBy: { select: { id: true, email: true, employee: { select: { firstName: true, lastName: true } } } },
        finalizedBy: { select: { id: true, email: true, employee: { select: { firstName: true, lastName: true } } } },
        items: {
          orderBy: { classDate: 'asc' },
          include: {
            tutor: {
              select: {
                id: true,
                email: true,
                employee: {
                  select: {
                    id: true,
                    businessId: true,
                    firstName: true,
                    lastName: true,
                  },
                },
              },
            },
            classRecord: {
              select: {
                id: true,
                businessId: true,
                scheduledStart: true,
                scheduledEnd: true,
                workedMinutes: true,
                status: true,
              },
            },
            tutorRate: {
              select: {
                id: true,
                hourlyRate: true,
                currency: true,
                effectiveFrom: true,
                effectiveTo: true,
              },
            },
            paidBy: { select: { id: true, email: true, employee: { select: { firstName: true, lastName: true } } } },
          },
        },
      },
    });

    if (!run) {
      throw new NotFoundException(`Tutor payable run with ID ${id} not found`);
    }

    return run;
  }

  /**
   * Finalize a tutor payable run.
   * Locks the run and its constituent class records permanently.
   */
  async finalizeRun(id: string, actorUserId: string) {
    return this.prisma.$transaction(async (tx: PrismaTxClient) => {
      // 1. Transactional domain-level advisory lock serializing all tutor payable run mutations
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('tutor-payable-run-mutation-lock'))`;

      const run = await tx.tutorPayableRun.findUnique({
        where: { id },
        include: {
          items: {
            select: {
              id: true,
              classRecordId: true,
            },
          },
        },
      });

      if (!run) {
        throw new NotFoundException(`Tutor payable run with ID ${id} not found`);
      }

      if (run.status === PayrollRunStatus.FINALIZED) {
        throw new BadRequestException('Tutor payable run is already finalized');
      }

      if (run.status === PayrollRunStatus.CANCELLED) {
        throw new BadRequestException('Cannot finalize a cancelled tutor payable run');
      }

      // 2. Reject finalization if any other finalized run overlaps this period
      const overlappingFinalized = await tx.tutorPayableRun.findFirst({
        where: {
          id: { not: id },
          status: PayrollRunStatus.FINALIZED,
          periodStart: { lte: run.periodEnd },
          periodEnd: { gte: run.periodStart },
        },
      });

      if (overlappingFinalized) {
        throw new ConflictException(
          `Cannot finalize run: an overlapping tutor payable run is already finalized: [${overlappingFinalized.periodStart} to ${overlappingFinalized.periodEnd}] (${overlappingFinalized.businessId})`,
        );
      }

      // 3. Atomically verify that none of this run's class records have already been finalized in another run
      const classRecordIds = run.items.map((item) => item.classRecordId);
      if (classRecordIds.length > 0) {
        const conflictingItem = await tx.tutorPayableItem.findFirst({
          where: {
            classRecordId: { in: classRecordIds },
            payableRunId: { not: id },
            payableRun: {
              status: PayrollRunStatus.FINALIZED,
            },
          },
          include: {
            payableRun: {
              select: { businessId: true },
            },
            classRecord: {
              select: { businessId: true },
            },
          },
        });

        if (conflictingItem) {
          throw new ConflictException(
            `Cannot finalize run: class record ${conflictingItem.classRecord.businessId} has already been finalized in tutor payable run ${conflictingItem.payableRun.businessId}`,
          );
        }
      }

      const finalized = await tx.tutorPayableRun.update({
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
        action: 'tutor.payable.finalize',
        entityType: 'tutor_payable_run',
        entityId: id,
        actorUserId,
        metadata: {
          businessId: finalized.businessId,
          totalAmount: finalized.totalAmount.toString(),
          totalHours: finalized.totalHours.toString(),
          classCount: finalized.classCount,
          tutorCount: finalized.tutorCount,
        },
      });

      return finalized;
    });
  }

  /**
   * Cancel a draft tutor payable run.
   */
  async cancelDraftRun(id: string, actorUserId: string) {
    return this.prisma.$transaction(async (tx: PrismaTxClient) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('tutor-payable-run-mutation-lock'))`;

      const run = await tx.tutorPayableRun.findUnique({
        where: { id },
      });

      if (!run) {
        throw new NotFoundException(`Tutor payable run with ID ${id} not found`);
      }

      if (run.status === PayrollRunStatus.FINALIZED) {
        throw new BadRequestException('Finalized tutor payable runs cannot be cancelled');
      }

      if (run.status === PayrollRunStatus.CANCELLED) {
        throw new BadRequestException('Tutor payable run is already cancelled');
      }

      const cancelled = await tx.tutorPayableRun.update({
        where: { id },
        data: { status: PayrollRunStatus.CANCELLED },
      });

      await this.audit.recordInTx(tx, {
        action: 'tutor.payable.cancel',
        entityType: 'tutor_payable_run',
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
   * Record payment confirmation for a specific tutor payable item.
   * Can ONLY be performed on items belonging to a FINALIZED payable run.
   */
  async recordItemPayment(itemId: string, dto: RecordPaymentDto, actorUserId: string) {
    return this.prisma.$transaction(async (tx: PrismaTxClient) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('tutor-payable-item-' || ${itemId}))`;

      const item = await tx.tutorPayableItem.findUnique({
        where: { id: itemId },
        include: {
          payableRun: true,
          tutor: {
            select: {
              id: true,
              email: true,
              employee: { select: { firstName: true, lastName: true, businessId: true } },
            },
          },
        },
      });

      if (!item) {
        throw new NotFoundException(`Tutor payable item with ID ${itemId} not found`);
      }

      if (item.payableRun.status !== PayrollRunStatus.FINALIZED) {
        throw new BadRequestException(
          'Cannot record payment for an unfinalized tutor payable run. The run must be finalized first.',
        );
      }

      if (item.paymentStatus === PayrollPaymentStatus.PAID) {
        throw new BadRequestException('Payment has already been recorded for this item');
      }

      const updatedItem = await tx.tutorPayableItem.update({
        where: { id: itemId },
        data: {
          paymentStatus: PayrollPaymentStatus.PAID,
          paidAt: new Date(),
          paidByUserId: actorUserId,
          paymentReference: dto.paymentReference?.trim() || null,
          paymentNotes: dto.paymentNotes?.trim() || null,
        },
        include: {
          tutor: {
            select: {
              id: true,
              email: true,
              employee: { select: { firstName: true, lastName: true, businessId: true } },
            },
          },
          paidBy: { select: { id: true, email: true, employee: { select: { firstName: true, lastName: true } } } },
        },
      });

      await this.audit.recordInTx(tx, {
        action: 'tutor.payable.payment.record',
        entityType: 'tutor_payable_item',
        entityId: itemId,
        actorUserId,
        metadata: {
          payableRunId: item.payableRunId,
          payableBusinessId: item.payableRun.businessId,
          tutorId: item.tutorId,
          amount: item.amount.toString(),
          paymentReference: dto.paymentReference,
        },
      });

      return updatedItem;
    });
  }
}
