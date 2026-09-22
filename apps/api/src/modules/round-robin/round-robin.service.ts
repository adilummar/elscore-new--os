import { Injectable, Logger, ConflictException } from '@nestjs/common';
import { RoundRobinDailyState, Prisma } from '@prisma/client';

import { AuditService } from '../../common/audit/audit.service';
import { PrismaService, PrismaTxClient } from '../../common/prisma/prisma.service';

export interface RoundRobinAssignmentResult {
  userId: string | null;
  queueBefore: string[];
  queueAfter: string[];
  eligibleMemberIds: string[];
  rrSequence: number;
  rrPosition: number;
}

@Injectable()
export class RoundRobinService {
  private readonly logger = new Logger(RoundRobinService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  private async getOrCreateState(tx: Prisma.TransactionClient) {
    let state = await tx.roundRobinState.findUnique({ where: { id: 'singleton' } });
    if (!state) {
      state = await tx.roundRobinState.create({ data: { id: 'singleton' } });
    }
    return state;
  }

  async getCounsellor(userId: string) {
    return this.prisma.roundRobinCounsellorState.findUnique({ where: { userId } });
  }

  async performDailyReset() {
    await this.prisma.roundRobinCounsellorState.updateMany({
      data: { dailyState: 'ACTIVE' }
    });
  }

  async performHistoryCleanup() {
    const { subMonths } = require('date-fns');
    const { toZonedTime, fromZonedTime } = require('date-fns-tz');
    const tz = 'Asia/Kolkata';

    const now = new Date();
    const tzNow = toZonedTime(now, tz);
    const cutoffTzDate = subMonths(tzNow, 1);
    const cutoffDate = fromZonedTime(cutoffTzDate, tz);

    const result = await this.prisma.leadDistributionEvent.deleteMany({
      where: {
        createdAt: { lt: cutoffDate }
      }
    });
    this.logger.log(`Cleaned up ${result.count} old distribution events`);
  }

  async getConfig() {
    const state = await this.prisma.roundRobinState.findUnique({ where: { id: 'singleton' } });
    const counsellors = await this.prisma.roundRobinCounsellorState.findMany({
      include: { 
        user: { 
          select: { 
            id: true, 
            email: true, 
            status: true,
            employee: { select: { firstName: true, lastName: true, department: { select: { name: true } } } },
            userRoles: { include: { role: true } }
          } 
        } 
      },
    });
    return {
      isPaused: state?.isPaused ?? false,
      lastAssignedUserId: state?.lastAssignedUserId,
      counsellors,
    };
  }

  async setPaused(isPaused: boolean, actorUserId: string) {
    return this.prisma.$transaction(async (tx: PrismaTxClient) => {
      const state = await tx.roundRobinState.upsert({
        where: { id: 'singleton' },
        update: { isPaused },
        create: { id: 'singleton', isPaused },
      });
      await this.audit.recordInTx(tx, {
        entityType: 'RoundRobinState',
        entityId: 'singleton',
        action: isPaused ? 'ROUND_ROBIN_PAUSED' : 'ROUND_ROBIN_RESUMED',
        actorUserId,
        newValue: { isPaused },
      });
      return state;
    });
  }

  async updateCounsellor(userId: string, data: { isEligible?: boolean; dailyState?: RoundRobinDailyState }, actorUserId: string) {
    return this.prisma.$transaction(async (tx: PrismaTxClient) => {
      // Check if trying to set INACTIVE_FULL_DAY
      if (data.dailyState === RoundRobinDailyState.INACTIVE_FULL_DAY) {
        const { startOfDay } = require('date-fns');
        const { toZonedTime, fromZonedTime } = require('date-fns-tz');
        const tz = 'Asia/Kolkata';
        const nowInTz = toZonedTime(new Date(), tz);
        const startOfToday = fromZonedTime(startOfDay(nowInTz), tz);
        
        const contactedLead = await tx.leadStatusHistory.findFirst({
          where: {
            changedByUserId: userId,
            newStatus: 'CONTACTED',
            changedAt: { gte: startOfToday },
          },
        });
        if (contactedLead) {
          throw new ConflictException('Cannot set Full Day inactivity. Counsellor has already worked a Lead today.');
        }
      }

      const existing = await tx.roundRobinCounsellorState.findUnique({ where: { userId } });
      const wasEligibleAndActive = existing ? (existing.isEligible && existing.dailyState === RoundRobinDailyState.ACTIVE) : false;
      const isNowEligibleAndActive = (data.isEligible ?? (existing?.isEligible ?? true)) && (data.dailyState ?? (existing?.dailyState ?? RoundRobinDailyState.ACTIVE)) === RoundRobinDailyState.ACTIVE;

      const shouldSetReturning = !wasEligibleAndActive && isNowEligibleAndActive;

      const cs = await tx.roundRobinCounsellorState.upsert({
        where: { userId },
        update: {
          ...data,
          ...(shouldSetReturning ? { lastReturnedAt: new Date() } : {}),
        },
        create: {
          userId,
          isEligible: data.isEligible ?? true,
          dailyState: data.dailyState ?? RoundRobinDailyState.ACTIVE,
          ...(shouldSetReturning ? { lastReturnedAt: new Date() } : {}),
        },
      });

      await this.audit.recordInTx(tx, {
        entityType: 'RoundRobinCounsellorState',
        entityId: userId,
        action: 'ROUND_ROBIN_COUNSELLOR_UPDATED',
        actorUserId,
        newValue: data,
      });

      return cs;
    });
  }

  private calculateQueue(counsellors: any[], lastAssignedUserId: string | null): string[] {
    const returning = counsellors.filter(c => c.lastReturnedAt !== null);
    returning.sort((a, b) => a.lastReturnedAt!.getTime() - b.lastReturnedAt!.getTime());

    let nextIndex = 0;
    if (lastAssignedUserId) {
      const lastIndex = counsellors.findIndex(c => c.userId === lastAssignedUserId);
      if (lastIndex !== -1) {
        nextIndex = (lastIndex + 1) % counsellors.length;
      } else {
        const nextCounsellor = counsellors.find(c => c.userId > lastAssignedUserId!);
        if (nextCounsellor) {
          nextIndex = counsellors.indexOf(nextCounsellor);
        } else {
          nextIndex = 0;
        }
      }
    }

    const orderedNormal: string[] = [];
    for (let i = 0; i < counsellors.length; i++) {
       const idx = (nextIndex + i) % counsellors.length;
       const c = counsellors[idx];
       if (c.lastReturnedAt === null) {
          orderedNormal.push(c.userId);
       }
    }
    
    return [...returning.map(c => c.userId), ...orderedNormal];
  }

  async getDistributionHistory(query: any, userId: string, hasReadAll: boolean, hasReadTeam: boolean) {
    const where: Prisma.LeadDistributionEventWhereInput = {};

    if (query.date || query.from || query.to) {
      const { startOfDay, endOfDay } = require('date-fns');
      const { toZonedTime, fromZonedTime } = require('date-fns-tz');
      const tz = 'Asia/Kolkata';
      
      let start: Date | undefined;
      let end: Date | undefined;

      if (query.date) {
        const tzDate = toZonedTime(query.date, tz);
        start = fromZonedTime(startOfDay(tzDate), tz);
        end = fromZonedTime(endOfDay(tzDate), tz);
      } else {
        if (query.from) {
          start = fromZonedTime(startOfDay(toZonedTime(query.from, tz)), tz);
        }
        if (query.to) {
          end = fromZonedTime(endOfDay(toZonedTime(query.to, tz)), tz);
        }
      }

      if (start || end) {
        where.eventDate = {};
        if (start) where.eventDate.gte = start;
        if (end) where.eventDate.lte = end;
      }
    }

    if (query.method) where.assignmentMethod = query.method;
    
    // Support either counsellorId or assignedTo as per requirements
    const targetUserId = query.assignedTo || query.counsellorId;
    if (targetUserId) where.newOwnerUserId = targetUserId;
    
    if (query.leadId) where.leadId = query.leadId;
    if (query.source) where.source = query.source;

    // RBAC rules
    if (!hasReadAll) {
      if (hasReadTeam) {
        const user = await this.prisma.user.findUnique({
          where: { id: userId },
          include: { employee: true },
        });
        if (user?.employee?.departmentId) {
          const teamUsers = await this.prisma.user.findMany({
            where: { employee: { departmentId: user.employee.departmentId } },
            select: { id: true },
          });
          const teamUserIds = teamUsers.map(u => u.id);
          // If a specific targetUserId was requested, ensure it's in the team
          if (targetUserId) {
            if (!teamUserIds.includes(targetUserId)) {
              return { data: [], pagination: { nextCursor: null, hasNextPage: false, limit: query.limit ?? 50 } };
            }
          } else {
            where.newOwnerUserId = { in: teamUserIds };
          }
        } else {
          where.newOwnerUserId = targetUserId ? (targetUserId === userId ? userId : 'NO_ACCESS') : userId; 
        }
      } else {
        where.newOwnerUserId = targetUserId ? (targetUserId === userId ? userId : 'NO_ACCESS') : userId;
      }
    }

    const limit = query.limit ? parseInt(query.limit) : 50;
    const take = Math.min(limit + 1, 101);

    const items = await this.prisma.leadDistributionEvent.findMany({
      where,
      take,
      ...(query.cursor ? { cursor: { id: require('../../common/pagination/paginate.util').decodeCursor(query.cursor) }, skip: 1 } : {}),
      orderBy: [
        { eventDate: 'desc' },
        { dailyDistributionOrder: 'desc' }
      ],
      include: {
        lead: { select: { id: true, firstName: true, lastName: true, primaryPhone: true } },
        previousOwner: { select: { id: true, employee: { select: { firstName: true, lastName: true } } } },
        newOwner: { select: { id: true, employee: { select: { firstName: true, lastName: true } } } },
        assignedByUser: { select: { id: true, employee: { select: { firstName: true, lastName: true } } } },
      }
    });

    const hasNextPage = items.length > limit;
    const data = hasNextPage ? items.slice(0, limit) : items;
    const nextCursor = hasNextPage && data.length > 0 ? require('../../common/pagination/paginate.util').encodeCursor(data[data.length - 1].id) : null;

    return { data, pagination: { nextCursor, hasNextPage, limit } };
  }

  async getNextAssignee(tx: Prisma.TransactionClient): Promise<RoundRobinAssignmentResult> {
    await tx.$executeRaw`SELECT * FROM round_robin_state WHERE id = 'singleton' FOR UPDATE`;
    const state = await this.getOrCreateState(tx);

    const emptyResult: RoundRobinAssignmentResult = {
      userId: null, queueBefore: [], queueAfter: [], eligibleMemberIds: [], rrSequence: 0, rrPosition: 0,
    };

    if (state.isPaused) return emptyResult;

    const counsellors = await tx.roundRobinCounsellorState.findMany({
      where: {
        isEligible: true,
        dailyState: RoundRobinDailyState.ACTIVE,
        user: { status: 'ACTIVE' },
      },
      orderBy: { userId: 'asc' },
    });

    if (counsellors.length === 0) return emptyResult;

    const queueBefore = this.calculateQueue(counsellors, state.lastAssignedUserId);
    const eligibleMemberIds = counsellors.map(c => c.userId);

    const nextUserId = queueBefore[0];
    const rrPosition = eligibleMemberIds.indexOf(nextUserId) + 1; // 1-based index in sorted eligible pool

    // Increment sequence
    const updatedState = await tx.roundRobinState.update({
      where: { id: 'singleton' },
      data: { 
        lastAssignedUserId: nextUserId,
        assignmentSequence: { increment: 1 } 
      },
    });

    const rrSequence = updatedState.assignmentSequence;

    // Determine queue after
    const counsellorsAfter = counsellors.map(c => {
      if (c.userId === nextUserId) {
        return { ...c, lastReturnedAt: null };
      }
      return c;
    });
    const queueAfter = this.calculateQueue(counsellorsAfter, nextUserId);

    // Update the counsellor state if it was a returning one
    const assignedCounsellor = counsellors.find(c => c.userId === nextUserId);
    if (assignedCounsellor && assignedCounsellor.lastReturnedAt !== null) {
      await tx.roundRobinCounsellorState.update({
        where: { userId: nextUserId },
        data: { lastReturnedAt: null },
      });
    }

    return {
      userId: nextUserId,
      queueBefore,
      queueAfter,
      eligibleMemberIds,
      rrSequence,
      rrPosition,
    };
  }
}
