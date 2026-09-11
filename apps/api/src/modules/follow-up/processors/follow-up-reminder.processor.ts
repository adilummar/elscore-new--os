import { Processor } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import { FollowUpStatus } from '@prisma/client';
import { Job } from 'bullmq';

import { PrismaService } from '../../../common/prisma/prisma.service';
import { BaseJobProcessor } from '../../../common/queue/base-job-processor';
import { JOBS, QUEUES } from '../../../common/queue/queue.constants';

export interface FollowUpReminderJobData {
  idempotencyKey: string;
  followUpId: string;
}

/**
 * Sends a 10-minute reminder notification for a scheduled follow-up.
 * Notifies CURRENT lead owner (assignedToUserId), not historical creator.
 * Idempotent: skips if follow-up is already COMPLETED.
 */
@Injectable()
@Processor(QUEUES.DEADLINE_MONITOR)
export class FollowUpReminderProcessor extends BaseJobProcessor {
  constructor(private readonly prisma: PrismaService) {
    super(FollowUpReminderProcessor.name);
  }

  protected async processJob(job: Job<FollowUpReminderJobData>): Promise<void> {
    if (job.name !== JOBS.FOLLOWUP_REMINDER) return;

    const { followUpId, idempotencyKey } = job.data;
    this.logger.log('Reminder job [' + idempotencyKey + '] for FUP ' + followUpId);

    const fup = await this.prisma.followUp.findUnique({
      where: { id: followUpId },
      select: { id: true, businessId: true, status: true, leadId: true },
    });
    if (!fup) { this.logger.warn('FUP ' + followUpId + ' not found — skip'); return; }
    if (fup.status === FollowUpStatus.COMPLETED) { this.logger.log('FUP ' + followUpId + ' already COMPLETED — skip'); return; }

    const lead = await this.prisma.lead.findUnique({
      where: { id: fup.leadId },
      select: { assignedToUserId: true },
    });
    if (!lead?.assignedToUserId) { this.logger.warn('FUP ' + followUpId + ': lead has no assignee — skip'); return; }

    await this.prisma.notification.create({
      data: {
        recipientUserId: lead.assignedToUserId,
        type: 'FOLLOWUP_REMINDER',
        entityType: 'FollowUp',
        entityId: fup.id,
        message: 'Reminder: Follow-up ' + fup.businessId + ' is scheduled in 10 minutes.',
      },
    });
    this.logger.log('Reminder sent for FUP ' + fup.businessId + ' to user ' + lead.assignedToUserId);
  }
}
