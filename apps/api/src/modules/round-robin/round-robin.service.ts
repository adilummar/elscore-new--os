import { Injectable, Logger, ConflictException } from '@nestjs/common';
import { RoundRobinDailyState, Prisma } from '@prisma/client';

import { AuditService } from '../../common/audit/audit.service';
import { PrismaService } from '../../common/prisma/prisma.service';

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

  async getConfig() {
    const state = await this.prisma.roundRobinState.findUnique({ where: { id: 'singleton' } });
    const counsellors = await this.prisma.roundRobinCounsellorState.findMany({
      include: { user: { select: { id: true, email: true, status: true } } },
    });
    return {
      isPaused: state?.isPaused ?? false,
      lastAssignedUserId: state?.lastAssignedUserId,
      counsellors,
    };
  }

  async setPaused(isPaused: boolean, actorUserId: string) {
    return this.prisma.$transaction(async (tx) => {
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
    return this.prisma.$transaction(async (tx) => {
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

  async getNextAssignee(tx: Prisma.TransactionClient): Promise<string | null> {
    await tx.$executeRaw`SELECT * FROM round_robin_state WHERE id = 'singleton' FOR UPDATE`;
    const state = await this.getOrCreateState(tx);

    if (state.isPaused) return null;

    const counsellors = await tx.roundRobinCounsellorState.findMany({
      where: {
        isEligible: true,
        dailyState: RoundRobinDailyState.ACTIVE,
        user: { status: 'ACTIVE' },
      },
      orderBy: { userId: 'asc' },
    });

    if (counsellors.length === 0) return null;

    const returning = counsellors.filter(c => c.lastReturnedAt !== null);
    if (returning.length > 0) {
      returning.sort((a, b) => a.lastReturnedAt!.getTime() - b.lastReturnedAt!.getTime());
      const nextUserId = returning[0].userId;
      
      await tx.roundRobinCounsellorState.update({
        where: { userId: nextUserId },
        data: { lastReturnedAt: null },
      });
      await tx.roundRobinState.update({
        where: { id: 'singleton' },
        data: { lastAssignedUserId: nextUserId },
      });
      
      return nextUserId;
    }

    let nextIndex = 0;
    if (state.lastAssignedUserId) {
      const lastIndex = counsellors.findIndex(c => c.userId === state.lastAssignedUserId);
      if (lastIndex !== -1) {
        nextIndex = (lastIndex + 1) % counsellors.length;
      } else {
        const nextCounsellor = counsellors.find(c => c.userId > state.lastAssignedUserId!);
        if (nextCounsellor) {
          nextIndex = counsellors.indexOf(nextCounsellor);
        } else {
          nextIndex = 0;
        }
      }
    }

    const nextUserId = counsellors[nextIndex].userId;

    await tx.roundRobinState.update({
      where: { id: 'singleton' },
      data: { lastAssignedUserId: nextUserId },
    });

    return nextUserId;
  }
}
