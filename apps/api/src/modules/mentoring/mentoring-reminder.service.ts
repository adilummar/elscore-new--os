import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';

import { PrismaService, PrismaTxClient } from '../../common/prisma/prisma.service';

export const REMINDER_NOTIFICATION_TYPE = 'MENTORING_REMINDER';

export interface PrepareReminderInput {
  kind: string;
  entityType: string;
  entityId: string;
  activationId?: string | null;
  recipientUserId: string;
  message: string;
  /** When it should go out. Empty means it is sent when someone sends it. */
  scheduledFor?: Date | null;
  /** A page to open from the notification, for example "/tutor-portal". */
  action?: string | null;
}

export interface ReminderView {
  id: string;
  kind: string;
  entityType: string;
  entityId: string;
  status: 'PREPARED' | 'SENT' | 'ACKNOWLEDGED' | 'CANCELLED';
  statusLabel: string;
  message: string;
  scheduledFor: string | null;
  preparedAt: string;
  sentAt: string | null;
  acknowledgedAt: string | null;
  /** The notification that proves the reminder was delivered. Null until it is. */
  deliveryEvidence: string | null;
}

const LABELS: Record<ReminderView['status'], string> = { PREPARED: 'Reminder prepared', SENT: 'Reminder sent', ACKNOWLEDGED: 'Acknowledged', CANCELLED: 'Cancelled' };
const view = (r: { id: string; kind: string; entityType: string; entityId: string; status: ReminderView['status']; message: string; scheduledFor: Date | null; preparedAt: Date; sentAt: Date | null; acknowledgedAt: Date | null; notificationId: string | null }): ReminderView => ({
  id: r.id, kind: r.kind, entityType: r.entityType, entityId: r.entityId, status: r.status, statusLabel: LABELS[r.status], message: r.message, scheduledFor: r.scheduledFor?.toISOString() ?? null,
  preparedAt: r.preparedAt.toISOString(), sentAt: r.sentAt?.toISOString() ?? null, acknowledgedAt: r.acknowledgedAt?.toISOString() ?? null, deliveryEvidence: r.notificationId,
});

/**
 * In-app reminders. A reminder is "sent" only when the notification that delivers it has really been created: both are
 * written in one transaction, the notification id is stored as the evidence, and the database refuses a sent reminder
 * without it. A reminder is "acknowledged" only when the person it was for says so. Nothing here reaches outside the app.
 */
@Injectable()
export class MentoringReminderService {
  constructor(private readonly prisma: PrismaService) {}

  private keyOf(i: { kind: string; entityType: string; entityId: string; recipientUserId: string }) {
    return `${i.kind}:${i.entityType}:${i.entityId}:${i.recipientUserId}`;
  }

  /** Prepares a reminder. Preparing the same one again returns the one already there. Takes the caller's transaction. */
  async prepare(db: PrismaTxClient, input: PrepareReminderInput, actorUserId: string) {
    if (!input.message?.trim()) throw new BadRequestException('Write the reminder message.');
    if (input.message.length > 500) throw new BadRequestException('The reminder message must be 500 characters or fewer.');
    if (!(await db.user.findUnique({ where: { id: input.recipientUserId } }))) throw new BadRequestException('The person to remind does not exist.');
    const key = this.keyOf(input);
    const existing = await db.mentoringReminder.findFirst({ where: { currentKey: key } });
    if (existing) return existing;
    return db.mentoringReminder.create({
      data: {
        kind: input.kind, entityType: input.entityType, entityId: input.entityId, activationId: input.activationId ?? null, recipientUserId: input.recipientUserId, status: 'PREPARED', currentKey: key,
        scheduledFor: input.scheduledFor ?? null, message: input.message.trim(), preparedByUserId: actorUserId,
      },
    });
  }

  /** Sends a prepared reminder: creates the notification, then records it as the evidence. Sending twice sends once. */
  async send(db: PrismaTxClient, reminderId: string, actorUserId: string, action: string | null = null, now: Date = new Date()) {
    const reminder = await db.mentoringReminder.findUnique({ where: { id: reminderId } });
    if (!reminder) throw new NotFoundException('Reminder not found');
    if (reminder.status === 'SENT' || reminder.status === 'ACKNOWLEDGED') return reminder;
    if (reminder.status === 'CANCELLED') throw new ConflictException('This reminder was cancelled.');
    const notification = await db.notification.create({
      data: { recipientUserId: reminder.recipientUserId, type: REMINDER_NOTIFICATION_TYPE, entityType: reminder.entityType, entityId: reminder.entityId, action, message: reminder.message, dedupeKey: `reminder:${reminder.id}` },
    });
    return db.mentoringReminder.update({ where: { id: reminder.id }, data: { status: 'SENT', sentAt: now, sentByUserId: actorUserId, notificationId: notification.id } });
  }

  /** Cancels a reminder that has not gone out. One that was sent cannot be unsent. */
  async cancel(db: PrismaTxClient, reminderId: string) {
    const reminder = await db.mentoringReminder.findUnique({ where: { id: reminderId } });
    if (!reminder) throw new NotFoundException('Reminder not found');
    if (reminder.status !== 'PREPARED') throw new ConflictException('A reminder that was sent cannot be cancelled.');
    return db.mentoringReminder.update({ where: { id: reminderId }, data: { status: 'CANCELLED', currentKey: null } });
  }

  /** Sends every prepared reminder whose time has come. Each goes in its own transaction, so one failure stops no other. */
  async sendDue(actorUserId: string, now: Date = new Date()): Promise<{ sent: number; failed: number }> {
    const due = await (this.prisma as unknown as PrismaTxClient).mentoringReminder.findMany({ where: { status: 'PREPARED', scheduledFor: { lte: now } } });
    let sent = 0;
    let failed = 0;
    for (const r of due) {
      try {
        await this.prisma.$transaction((tx: PrismaTxClient) => this.send(tx, r.id, actorUserId, null, now));
        sent += 1;
      } catch {
        failed += 1;
      }
    }
    return { sent, failed };
  }

  /** The person it was for says they have seen it. Nobody else can say it for them, and an unsent reminder cannot be acknowledged. */
  async acknowledge(reminderId: string, userId: string, now: Date = new Date()): Promise<ReminderView> {
    return this.prisma.$transaction(async (tx: PrismaTxClient) => {
      const reminder = await tx.mentoringReminder.findUnique({ where: { id: reminderId } });
      if (!reminder || reminder.recipientUserId !== userId) throw new ForbiddenException('This reminder is not yours.');
      if (reminder.status === 'ACKNOWLEDGED') return view(reminder);
      if (reminder.status !== 'SENT') throw new ConflictException('This reminder has not been sent yet.');
      if (reminder.notificationId) await tx.notification.update({ where: { id: reminder.notificationId }, data: { readAt: now } });
      return view((await tx.mentoringReminder.update({ where: { id: reminder.id }, data: { status: 'ACKNOWLEDGED', acknowledgedAt: now } })));
    });
  }

  /** The reminders addressed to this person, newest first. A prepared one is not shown to them until it is sent. */
  async mine(userId: string): Promise<ReminderView[]> {
    const rows = await (this.prisma as unknown as PrismaTxClient).mentoringReminder.findMany({ where: { recipientUserId: userId, status: { in: ['SENT', 'ACKNOWLEDGED'] } } });
    return rows.sort((a, b) => (b.sentAt?.getTime() ?? 0) - (a.sentAt?.getTime() ?? 0)).map((r) => view(r as never));
  }

  /** The reminders about one thing, for the people running it. */
  async about(entityType: string, entityId: string): Promise<ReminderView[]> {
    const rows = await (this.prisma as unknown as PrismaTxClient).mentoringReminder.findMany({ where: { entityType, entityId } });
    return rows.sort((a, b) => a.preparedAt.getTime() - b.preparedAt.getTime()).map((r) => view(r as never));
  }
}
