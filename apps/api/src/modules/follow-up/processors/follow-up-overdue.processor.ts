import { Processor } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import { FollowUpStatus } from '@prisma/client';
import { Job } from 'bullmq';

import { AuditService } from '../../../common/audit/audit.service';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { BaseJobProcessor } from '../../../common/queue/base-job-processor';
import { JOBS, QUEUES } from '../../../common/queue/queue.constants';

export interface FollowUpOverdueJobData {
  idempotencyKey: string;
  followUpId: string;
}

/**
 * Transitions a SCHEDULED follow-up to OVERDUE and notifies the current lead owner.
 * Idempotent: skips if already OVERDUE or COMPLETED.
 * Notifies CURRENT lead owner (assignedToUserId), not historical creator.
 */
@Injectable()
@Processor(QUEUES.DEADLINE_MONITOR)
export class FollowUpOverdueProcessor extends BaseJobProcessor {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {
    super(FollowUpOverdueProcessor.name);
  }

  protected async processJob(job: Job<FollowUpOverdueJobData>): Promise<void> {
    if (job.name !== JOBS.FOLLOWUP_OVERDUE) return;

    const { followUpId, idempotencyKey } = job.data;
    this.logger.log('Overdue job [' + idempotencyKey + '] for FUP ' + followUpId);

    const fup = await this.prisma.followUp.findUnique({
      where: { id: followUpId },
      select: { id: true, businessId: true, status: true, leadId: true, scheduledAt: true },
    });
    if (!fup) { this.logger.warn('FUP ' + followUpId + ' not found — skip'); return; }
    if (fup.status !== FollowUpStatus.SCHEDULED) { this.logger.log('FUP ' + followUpId + ' is ' + fup.status + ' — skip overdue'); return; }
    if (fup.scheduledAt > new Date()) { this.logger.warn('FUP ' + followUpId + ' scheduledAt in future — skip'); return; }

    await this.prisma.$transaction(async (tx) => {
      await tx.followUp.update({ where: { id: followUpId }, data: { status: FollowUpStatus.OVERDUE } });
      await this.audit.recordInTx(tx, { entityType: 'FollowUp', entityId: followUpId, action: 'FOLLOW_UP_OVERDUE', newValue: { businessId: fup.businessId, scheduledAt: fup.scheduledAt.toISOString() } });
    });
    this.logger.log('FUP ' + fup.businessId + ' transitioned to OVERDUE');

    const lead = await this.prisma.lead.findUnique({
      where: { id: fup.leadId },
      select: { assignedToUserId: true },
    });
    if (!lead?.assignedToUserId) { this.logger.warn('FUP ' + followUpId + ': lead has no assignee — skip notification'); return; }

    await this.prisma.notification.create({
      data: {
        recipientUserId: lead.assignedToUserId,
        type: 'FOLLOWUP_OVERDUE',
        entityType: 'FollowUp',
        entityId: followUpId,
        message: 'Follow-up ' + fup.businessId + ' is now overdue.',
      },
    });
    this.logger.log('Overdue notification sent for FUP ' + fup.businessId + ' to user ' + lead.assignedToUserId);
  }
}
