import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { AuditService } from '../../common/audit/audit.service';
import { PrismaTxClient } from '../../common/prisma/prisma.service';

import { MENTORING_HEAD_ROLE_CODE } from './mentoring.constants';

export interface MentoringEventInput {
  activationId: string;
  stageId?: string | null;
  taskId?: string | null;
  type: string;
  actorUserId?: string | null;
  fromStatus?: string | null;
  toStatus?: string | null;
  reason?: string | null;
  payload?: Record<string, unknown>;
}

export interface MentoringNotificationInput {
  recipientUserIds: Array<string | null | undefined>;
  type: string;
  activationId: string;
  message: string;
  /** Stable key; combined with the recipient so a retried transaction never duplicates a notification. */
  dedupeKey: string;
  excludeUserId?: string | null;
}

/**
 * Append-only history, audit entries and in-app notifications for Mentoring.
 * Everything is written inside the caller's transaction so history can never disagree with state.
 */
@Injectable()
export class MentoringHistoryService {
  constructor(private readonly audit: AuditService) {}

  async record(tx: PrismaTxClient, input: MentoringEventInput): Promise<void> {
    await tx.mentoringEvent.create({
      data: {
        activationId: input.activationId,
        stageId: input.stageId ?? null,
        taskId: input.taskId ?? null,
        type: input.type,
        actorUserId: input.actorUserId ?? null,
        fromStatus: input.fromStatus ?? null,
        toStatus: input.toStatus ?? null,
        reason: input.reason ?? null,
        payload: (input.payload ?? undefined) as Prisma.InputJsonValue | undefined,
      },
    });

    if (input.actorUserId) {
      await this.audit.recordInTx(tx, {
        entityType: 'MentoringActivation',
        entityId: input.activationId,
        action: input.type,
        actorUserId: input.actorUserId,
        reason: input.reason ?? undefined,
        newValue: {
          stageId: input.stageId ?? null,
          taskId: input.taskId ?? null,
          from: input.fromStatus ?? null,
          to: input.toStatus ?? null,
          ...(input.payload ?? {}),
        },
      });
    }
  }

  async notify(tx: PrismaTxClient, input: MentoringNotificationInput): Promise<void> {
    const recipients = Array.from(
      new Set(input.recipientUserIds.filter((id): id is string => !!id && id !== input.excludeUserId)),
    );
    if (recipients.length === 0) return;

    await tx.notification.createMany({
      data: recipients.map((recipientUserId) => ({
        recipientUserId,
        type: input.type,
        entityType: 'MentoringActivation',
        entityId: input.activationId,
        action: `/mentoring/students/${input.activationId}`,
        message: input.message,
        dedupeKey: `${input.dedupeKey}:${recipientUserId}`,
      })),
      skipDuplicates: true,
    });
  }

  /** Active users holding the Mentoring Head role. */
  async headUserIds(tx: PrismaTxClient): Promise<string[]> {
    const rows = await tx.userRole.findMany({
      where: { role: { code: MENTORING_HEAD_ROLE_CODE }, user: { status: 'ACTIVE' } },
      select: { userId: true },
    });
    return rows.map((r) => r.userId);
  }
}
