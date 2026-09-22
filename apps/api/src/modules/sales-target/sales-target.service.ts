import { Injectable, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../../common/audit/audit.service';
import { SetSalesTargetDto } from './dto/set-target.dto';

@Injectable()
export class SalesTargetService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Get all targets for a user in a given year (for the counsellor's own history).
   */
  async getTargetsForUser(userId: string, year: number) {
    return this.prisma.salesTarget.findMany({
      where: { userId, periodYear: year },
      orderBy: { periodMonth: 'asc' },
      include: { history: { orderBy: { changedAt: 'desc' } } },
    });
  }

  /**
   * Get all counsellors' active targets for a given month (Sales Head / CEO view).
   */
  async getAllTargets(year: number, month: number) {
    return this.prisma.salesTarget.findMany({
      where: { periodYear: year, periodMonth: month },
      include: {
        user: {
          include: {
            employee: true,
          },
        },
        history: { orderBy: { changedAt: 'desc' } },
      },
    });
  }

  /**
   * Create or UPDATE a counsellor's monthly target.
   *
   * If a target already exists for this counsellor/month, the PREVIOUS configuration
   * is snapshotted into SalesTargetHistory before the update is applied.
   *
   * This preserves full history of mid-month target changes.
   */
  async setTarget(dto: SetSalesTargetDto, actorUserId: string) {
    return this.prisma.$transaction(async (tx) => {
      // Check for an existing target to snapshot
      const existing = await tx.salesTarget.findUnique({
        where: {
          userId_periodYear_periodMonth: {
            userId: dto.userId,
            periodYear: dto.periodYear,
            periodMonth: dto.periodMonth,
          },
        },
      });

      // Upsert the active target row
      const target = await tx.salesTarget.upsert({
        where: {
          userId_periodYear_periodMonth: {
            userId: dto.userId,
            periodYear: dto.periodYear,
            periodMonth: dto.periodMonth,
          },
        },
        update: {
          targetType: dto.targetType,
          targetValue: dto.targetValue,
          setByUserId: actorUserId,
        },
        create: {
          userId: dto.userId,
          periodYear: dto.periodYear,
          periodMonth: dto.periodMonth,
          targetType: dto.targetType,
          targetValue: dto.targetValue,
          setByUserId: actorUserId,
        },
      });

      // If an existing target was changed, snapshot the previous values into history
      if (existing) {
        const typeChanged = existing.targetType !== dto.targetType;
        const valueChanged = Number(existing.targetValue) !== dto.targetValue;

        if (typeChanged || valueChanged) {
          await tx.salesTargetHistory.create({
            data: {
              salesTargetId: target.id,
              userId: dto.userId,
              periodMonth: dto.periodMonth,
              periodYear: dto.periodYear,
              previousType: existing.targetType,
              previousValue: existing.targetValue,
              newType: dto.targetType,
              newValue: dto.targetValue,
              changedByUserId: actorUserId,
            },
          });
        }
      }

      // Record audit event
      await this.audit.recordInTx(tx, {
        entityType: 'SalesTarget',
        entityId: target.id,
        action: existing ? 'SALES_TARGET_UPDATED' : 'SALES_TARGET_CREATED',
        actorUserId,
        oldValue: existing
          ? { targetType: existing.targetType, targetValue: String(existing.targetValue) }
          : undefined,
        newValue: { targetType: dto.targetType, targetValue: String(dto.targetValue) },
        metadata: { counsellorUserId: dto.userId, period: `${dto.periodYear}-${dto.periodMonth}` },
      });

      return target;
    });
  }

  /**
   * Calculate achievement for a counsellor in a given month.
   *
   * CONVERSION_PERCENTAGE:
   *   Numerator:   Leads WHERE current assignedToUserId = userId
   *                AND a LeadStatusHistory row exists WITH newStatus='PAID'
   *                AND that PAID transition changedAt is within [start, end).
   *   Denominator: Leads WHERE a LeadAssignmentHistory row exists WITH newOwnerUserId = userId
   *                AND that assignment assignedAt is within [start, end).
   *   Credit:      Follows current Lead.assignedToUserId at the time the PAID transition occurs
   *                (i.e., we look up who owns the lead when the status-history PAID row is created).
   *
   * REVENUE_AED:
   *   SUM(amount) from TargetCreditLedger WHERE salesOwnerId = userId AND timestamp in month.
   *   This is already the source of truth per existing Finance backend rules.
   */
  async getProgress(userId: string, month: number, year: number) {
    const target = await this.prisma.salesTarget.findUnique({
      where: {
        userId_periodYear_periodMonth: { userId, periodYear: year, periodMonth: month },
      },
      include: { history: { orderBy: { changedAt: 'desc' } } },
    });

    if (!target) return { target: null, progress: 0, actual: 0, required: 0, denominatorCount: 0 };

    const start = new Date(year, month - 1, 1);
    const end = new Date(year, month, 1);

    if (target.targetType === 'REVENUE_AED') {
      const ledger = await this.prisma.targetCreditLedger.aggregate({
        _sum: { amount: true },
        where: {
          salesOwnerId: userId,
          timestamp: { gte: start, lt: end },
        },
      });
      const actual = Number(ledger._sum?.amount || 0);
      const targetVal = Number(target.targetValue);
      return {
        target,
        actual,
        progress: targetVal > 0 ? actual / targetVal : 0,
        required: targetVal,
        denominatorCount: null,
      };
    } else {
      // CONVERSION_PERCENTAGE
      //
      // Denominator: ALL leads that were ASSIGNED to this counsellor during this calendar month.
      // We use LeadAssignmentHistory where newOwnerUserId = userId AND assignedAt in [start, end).
      const denominatorRows = await this.prisma.leadAssignmentHistory.findMany({
        where: {
          newOwnerUserId: userId,
          assignedAt: { gte: start, lt: end },
        },
        select: { leadId: true },
        distinct: ['leadId'],
      });
      const denominatorCount = denominatorRows.length;
      const denominatorLeadIds = denominatorRows.map((r) => r.leadId);

      // Numerator: Leads where a PAID status transition occurred in [start, end)
      // AND the lead was owned by this counsellor at the time (current assignedToUserId is our proxy,
      // since the business rule says credit follows current owner when lead reaches PAID).
      // We join LeadStatusHistory (newStatus=PAID, changedAt in range) with Lead (assignedToUserId = userId).
      const paidTransitions = await this.prisma.leadStatusHistory.findMany({
        where: {
          newStatus: 'PAID',
          changedAt: { gte: start, lt: end },
          lead: {
            assignedToUserId: userId,
          },
        },
        select: { leadId: true },
        distinct: ['leadId'],
      });
      const numeratorCount = paidTransitions.length;

      const targetPct = Number(target.targetValue); // e.g. 20 means 20%
      const actualPct = denominatorCount > 0 ? (numeratorCount / denominatorCount) * 100 : 0;
      const required = denominatorCount > 0 ? Math.ceil((targetPct / 100) * denominatorCount) : 0;

      return {
        target,
        actual: actualPct,          // achieved % (e.g. 15.5)
        progress: targetPct > 0 ? actualPct / targetPct : 0, // ratio 0-N (e.g. 0.775)
        required,                    // how many PAID leads needed (e.g. 8 out of 40)
        numeratorCount,              // how many PAID leads achieved
        denominatorCount,            // total assigned leads this month
      };
    }
  }

  /**
   * Set Team Target for a given month and department
   */
  async setTeamTarget(dto: any, actorUserId: string) {
    return this.prisma.teamSalesTarget.upsert({
      where: {
        departmentId_periodYear_periodMonth: {
          departmentId: dto.departmentId,
          periodYear: dto.periodYear,
          periodMonth: dto.periodMonth,
        },
      },
      update: {
        targetType: dto.targetType,
        targetValue: dto.targetValue,
        setByUserId: actorUserId,
      },
      create: {
        departmentId: dto.departmentId,
        periodMonth: dto.periodMonth,
        periodYear: dto.periodYear,
        targetType: dto.targetType,
        targetValue: dto.targetValue,
        setByUserId: actorUserId,
      },
    });
  }

  /**
   * Get Team Target and calculate the unallocated remainder (Lead's responsibility)
   */
  async getTeamTarget(departmentId: string, year: number, month: number) {
    const teamTarget = await this.prisma.teamSalesTarget.findUnique({
      where: {
        departmentId_periodYear_periodMonth: {
          departmentId,
          periodYear: year,
          periodMonth: month,
        },
      },
    });

    const individualTargets = await this.prisma.salesTarget.findMany({
      where: {
        periodYear: year,
        periodMonth: month,
        user: { employee: { departmentId } },
      },
    });

    let totalAllocated = 0;
    individualTargets.forEach(t => {
      if (t.targetType === 'REVENUE_AED') {
        totalAllocated += Number(t.targetValue);
      }
    });

    const targetValue = teamTarget ? Number(teamTarget.targetValue) : 0;
    const unallocated = Math.max(0, targetValue - totalAllocated);

    const start = new Date(year, month - 1, 1);
    const end = new Date(year, month, 1);

    const teamLedger = await this.prisma.targetCreditLedger.aggregate({
      _sum: { amount: true },
      where: {
        salesOwner: { employee: { departmentId } },
        timestamp: { gte: start, lt: end },
      },
    });
    
    const teamActual = Number(teamLedger._sum?.amount || 0);
    const teamProgress = targetValue > 0 ? (teamActual / targetValue) * 100 : 0;

    return {
      teamTarget,
      totalAllocated,
      unallocated,
      teamActual,
      teamProgress,
    };
  }

  /**
   * Set Team Target and individual allocations in a single batch
   */
  async setTeamBundle(dto: any, actorUserId: string) {
    return this.prisma.$transaction(async (tx) => {
      // 1. Set the overall team target
      const teamTarget = await tx.teamSalesTarget.upsert({
        where: {
          departmentId_periodYear_periodMonth: {
            departmentId: dto.departmentId,
            periodYear: dto.periodYear,
            periodMonth: dto.periodMonth,
          },
        },
        update: {
          targetType: dto.targetType,
          targetValue: dto.targetValue,
          setByUserId: actorUserId,
        },
        create: {
          departmentId: dto.departmentId,
          periodMonth: dto.periodMonth,
          periodYear: dto.periodYear,
          targetType: dto.targetType,
          targetValue: dto.targetValue,
          setByUserId: actorUserId,
        },
      });

      // 2. Process individual allocations
      if (dto.allocations && Array.isArray(dto.allocations)) {
        for (const alloc of dto.allocations) {
          const existing = await tx.salesTarget.findUnique({
            where: {
              userId_periodYear_periodMonth: {
                userId: alloc.userId,
                periodYear: dto.periodYear,
                periodMonth: dto.periodMonth,
              },
            },
          });

          if (existing) {
            await tx.salesTargetHistory.create({
              data: {
                salesTargetId: existing.id,
                userId: existing.userId,
                periodMonth: existing.periodMonth,
                periodYear: existing.periodYear,
                previousType: existing.targetType,
                previousValue: existing.targetValue,
                newType: alloc.targetType,
                newValue: alloc.targetValue,
                changedByUserId: actorUserId,
              },
            });

            await tx.salesTarget.update({
              where: { id: existing.id },
              data: {
                targetType: alloc.targetType,
                targetValue: alloc.targetValue,
                setByUserId: actorUserId,
              },
            });
          } else {
            await tx.salesTarget.create({
              data: {
                userId: alloc.userId,
                periodMonth: dto.periodMonth,
                periodYear: dto.periodYear,
                targetType: alloc.targetType,
                targetValue: alloc.targetValue,
                setByUserId: actorUserId,
              },
            });
          }
        }
      }
      return teamTarget;
    });
  }

  async deleteTarget(id: string) {
    return this.prisma.salesTarget.delete({
      where: { id },
    });
  }

  async deleteTeamTarget(departmentId: string, year: number, month: number) {
    return this.prisma.teamSalesTarget.deleteMany({
      where: {
        departmentId,
        periodYear: year,
        periodMonth: month,
      },
    });
  }
}
