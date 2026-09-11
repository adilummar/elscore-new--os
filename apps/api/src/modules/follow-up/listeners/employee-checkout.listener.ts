import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OnEvent } from '@nestjs/event-emitter';
import { FollowUpStatus } from '@prisma/client';
import { Queue } from 'bullmq';
import { endOfDay, startOfDay } from 'date-fns';
import { fromZonedTime, toZonedTime } from 'date-fns-tz';

import { EmployeeCheckedOutPayload } from '../../../common/events/employee-checked-out.event';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { JOBS, QUEUES } from '../../../common/queue/queue.constants';

/**
 * CRM integration boundary for the Attendance module.
 * When a Sales employee checks out, sends a consolidated notification to Sales Head
 * if they have incomplete Follow-ups due today.
 * DO NOT implement Attendance logic here.
 */
@Injectable()
export class EmployeeCheckoutListener {
  private readonly logger = new Logger(EmployeeCheckoutListener.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    @InjectQueue(QUEUES.NOTIFICATIONS) private readonly notificationsQueue: Queue,
  ) {}

  @OnEvent('employee.checked-out', { async: true })
  async handleEmployeeCheckedOut(payload: EmployeeCheckedOutPayload): Promise<void> {
    this.logger.log('Employee checked-out event for userId ' + payload.userId);

    const tz = this.config.get<string>('crm.businessTimezone') ?? 'Asia/Kolkata';
    const nowInTz = toZonedTime(new Date(), tz);
    const todayStart = fromZonedTime(startOfDay(nowInTz), tz);
    const todayEnd = fromZonedTime(endOfDay(nowInTz), tz);

    const incompleteFups = await this.prisma.followUp.findMany({
      where: {
        lead: { assignedToUserId: payload.userId },
        status: { in: [FollowUpStatus.SCHEDULED, FollowUpStatus.OVERDUE] },
        scheduledAt: { gte: todayStart, lte: todayEnd },
      },
      select: { id: true, businessId: true },
    });

    if (incompleteFups.length === 0) {
      this.logger.log('No incomplete FUPs today for user ' + payload.userId);
      return;
    }

    const salesHeads = await this.prisma.userRole.findMany({
      where: { role: { code: 'SALES_HEAD' } },
      select: { userId: true },
    });

    if (salesHeads.length === 0) {
      this.logger.warn('No SALES_HEAD users found — cannot send checkout notification');
      return;
    }

    const dateStr = todayStart.toISOString().slice(0, 10);
    const baseKey = 'checkout-notify-' + payload.userId + '-' + dateStr;

    for (const sh of salesHeads) {
      const jobId = baseKey + '-' + sh.userId;
      await this.notificationsQueue.add(
        JOBS.FOLLOWUP_CHECKOUT_NOTIFY,
        {
          idempotencyKey: jobId,
          employeeUserId: payload.userId,
          employeeId: payload.employeeId,
          salesHeadUserId: sh.userId,
          incompleteFupCount: incompleteFups.length,
          followUpBusinessIds: incompleteFups.map((f) => f.businessId),
          checkedOutAt: payload.checkedOutAt.toISOString(),
        },
        { jobId },
      );
    }

    this.logger.log('Checkout notification enqueued for ' + salesHeads.length + ' Sales Head(s) — ' + incompleteFups.length + ' incomplete FUPs');
  }
}
