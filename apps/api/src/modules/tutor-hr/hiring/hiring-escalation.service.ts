import { Injectable, Logger } from '@nestjs/common';

import { PrismaService, PrismaTxClient } from '../../../common/prisma/prisma.service';

import { HiringScheduleService } from './hiring-schedule.service';
import { addWorkingMinutes } from './working-hours.util';

const SLA_ALLOWED_WORKING_MINUTES = 120;
const SCAN_BATCH = 200;

export interface EscalationScanResult {
  checked: number;
  escalated: number;
  notificationsWritten: number;
  dueDatesFilled: number;
  skippedNoSchedule: boolean;
}

/**
 * Server-side overdue escalation for demo evaluations. Run periodically by the housekeeping
 * queue (see HousekeepingProcessor); it does not depend on any dashboard being open.
 *
 * Delivery evidence: an escalation row is created only together with the in-app Notification
 * row in one transaction. `notificationId` / `deliveredAt` come from that persisted row;
 * nothing is marked delivered without it. Other channels (email/WhatsApp) are not implemented.
 */
@Injectable()
export class HiringEscalationService {
  private readonly logger = new Logger(HiringEscalationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly schedules: HiringScheduleService,
  ) {}

  async runScan(now: Date = new Date()): Promise<EscalationScanResult> {
    const result: EscalationScanResult = { checked: 0, escalated: 0, notificationsWritten: 0, dueDatesFilled: 0, skippedNoSchedule: false };

    // 1. Backfill due dates for demos completed before a schedule was configured.
    const undated = await this.prisma.tutorDemoBooking.findMany({
      where: { status: 'ATTENDED', evaluation: null, evaluationDueAt: null, completedAt: { not: null } },
      select: { id: true, completedAt: true },
      take: SCAN_BATCH,
    });
    for (const b of undated) {
      const sch = await this.schedules.getEffective(b.completedAt as Date);
      if (!sch) { result.skippedNoSchedule = true; continue; }
      await this.prisma.tutorDemoBooking.updateMany({
        where: { id: b.id, evaluationDueAt: null },
        data: { evaluationDueAt: addWorkingMinutes(b.completedAt as Date, SLA_ALLOWED_WORKING_MINUTES, sch) },
      });
      result.dueDatesFilled++;
    }

    // 2. Escalate overdue, unevaluated demos that have not been escalated yet.
    const overdue = await this.prisma.tutorDemoBooking.findMany({
      where: {
        status: 'ATTENDED',
        evaluation: null,
        evaluationDueAt: { lt: now },
        escalations: { none: {} },
      },
      select: {
        id: true, tutorLeadId: true, assignedToUserId: true, evaluationDueAt: true,
        tutorLead: { select: { businessId: true } },
      },
      orderBy: { evaluationDueAt: 'asc' },
      take: SCAN_BATCH,
    });
    result.checked = overdue.length;
    if (!overdue.length) return result;

    // Confirmed: overdue evaluations escalate to the Head of Tutor Management only.
    const heads = await this.prisma.user.findMany({
      where: { status: 'ACTIVE', userRoles: { some: { role: { code: 'TUTOR_HEAD' } } } },
      select: { id: true },
    });
    if (!heads.length) {
      // Nothing is recorded, so these are picked up again once a Tutor Head exists.
      this.logger.warn(`${overdue.length} overdue evaluation(s) not escalated: no active Tutor Head`);
      return result;
    }

    for (const b of overdue) {
      try {
        await this.prisma.$transaction(async (tx: PrismaTxClient) => {
          for (const { id: userId } of heads) {
            const exists = await tx.tutorEvaluationEscalation.findUnique({
              where: { bookingId_recipientUserId: { bookingId: b.id, recipientUserId: userId } },
            });
            if (exists) continue;
            const n = await tx.notification.create({
              data: {
                recipientUserId: userId,
                type: 'TUTOR_EVALUATION_OVERDUE',
                entityType: 'TutorLead',
                entityId: b.tutorLeadId,
                action: `/tutor-hr/hiring/candidates/${b.tutorLeadId}`,
                message: `Demo evaluation for candidate ${b.tutorLead.businessId} is overdue.`,
              },
            });
            await tx.tutorEvaluationEscalation.create({
              data: { bookingId: b.id, recipientUserId: userId, recipientKind: 'TUTOR_HEAD', notificationId: n.id, deliveredAt: n.createdAt },
            });
            result.notificationsWritten++;
          }
        });
        result.escalated++;
      } catch (e) {
        // One bad booking must not block the rest; it is retried on the next scan.
        this.logger.error(`Escalation failed for booking ${b.id}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    return result;
  }

  /**
   * The caller's own overdue-evaluation escalations with the context shown in the inbox.
   * Tutor Head recipients receive every escalation (older ASSIGNED_MANAGER rows stay readable
   * by their recipient), so scoping by recipient is the whole access rule. Read state comes from the Notification
   * row; deliveredAt is the stored delivery evidence and is never changed by reading.
   */
  async listForUser(userId: string, now: Date = new Date(), limit = 50) {
    const rows = await this.prisma.tutorEvaluationEscalation.findMany({
      where: { recipientUserId: userId },
      orderBy: { escalatedAt: 'desc' },
      take: Math.min(Math.max(limit, 1), 100),
      include: {
        booking: {
          select: {
            id: true, scheduledAt: true, completedAt: true, evaluationDueAt: true,
            assignedTo: { select: { id: true, email: true } },
            evaluation: { select: { evaluatedAt: true } },
            tutorLead: { select: { id: true, businessId: true, firstName: true, lastName: true } },
          },
        },
      },
    });
    const ids = rows.map((r) => r.notificationId).filter((x): x is string => !!x);
    const notifications = ids.length
      ? await this.prisma.notification.findMany({ where: { id: { in: ids }, recipientUserId: userId }, select: { id: true, readAt: true, createdAt: true } })
      : [];
    const byId = new Map(notifications.map((n) => [n.id, n]));

    return rows.map((r) => {
      const b = r.booking;
      const due = b.evaluationDueAt;
      const evaluatedAt = b.evaluation?.evaluatedAt ?? null;
      const end = evaluatedAt ?? now;
      const overdueMinutes = due && end > due ? Math.floor((end.getTime() - due.getTime()) / 60_000) : 0;
      const n = r.notificationId ? byId.get(r.notificationId) : undefined;
      return {
        notificationId: r.notificationId,
        recipientKind: r.recipientKind,
        notifiedAt: n?.createdAt ?? r.deliveredAt,
        deliveredAt: r.deliveredAt,
        readAt: n?.readAt ?? null,
        candidate: {
          id: b.tutorLead.id,
          candidateId: b.tutorLead.businessId,
          name: `${b.tutorLead.firstName} ${b.tutorLead.lastName}`.trim() || null,
        },
        bookingId: b.id,
        demoScheduledAt: b.scheduledAt,
        demoCompletedAt: b.completedAt,
        evaluationDueAt: due,
        assignedManager: b.assignedTo.email,
        evaluationStatus: evaluatedAt ? 'EVALUATED' : 'OVERDUE',
        evaluatedAt,
        overdueMinutes,
      };
    });
  }
}
