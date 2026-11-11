import { Injectable, Logger } from '@nestjs/common';

import { PrismaService, PrismaTxClient } from '../../common/prisma/prisma.service';
import { addDays } from '../tutor/tutor-calendar';

import { CLASS_REMINDER_ENTITY, MentoringClassService, UPDATE_DAILY_REMINDERS } from './mentoring-class.service';
import { MentoringReminderService } from './mentoring-reminder.service';
import { localMomentOf } from './mentoring-sla';
import { MentoringSlaService } from './mentoring-sla.service';

/** The name shown and stored for what the automatic reminders do. It is not a user account. */
export const SYSTEM_ACTOR = 'system';
/** How many days ahead the reminders are prepared. */
export const PREPARE_DAYS_AHEAD = 7;

export interface ReminderRunResult { prepared: number; late: number; withdrawn: number; sent: number; failed: number }

/**
 * The automatic reminders of the Mentoring module. One run does three things, in this order, and is safe to repeat or to run at
 * the same time as another run (a reminder is keyed by what it is for, so it exists once and is sent once):
 *
 *  1. Withdraw prepared reminders that no longer apply: the student is paused, cancelled or not eligible, or the class was
 *     reported, cancelled or moved.
 *  2. Prepare the 45 minute class reminder for every class in the next days of every eligible student.
 *  3. Send every prepared reminder whose time has come, as an in-app notification. A reminder counts as sent only once that
 *     notification exists.
 *
 * Nothing here writes to WhatsApp. WhatsApp sharing stays manual, with a separate confirmation by a named person.
 */
@Injectable()
export class MentoringReminderJobsService {
  private readonly logger = new Logger(MentoringReminderJobsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly classes: MentoringClassService,
    private readonly reminders: MentoringReminderService,
    private readonly sla: MentoringSlaService,
  ) {}

  private get db() {
    return this.prisma as unknown as PrismaTxClient;
  }

  async run(now: Date = new Date()): Promise<ReminderRunResult> {
    const withdrawn = await this.withdrawNoLongerApplicable();
    const { prepared, late, failed: prepareFailed } = await this.prepareClassReminders(now);
    const updates = await this.prepareUpdateReminders(now);
    const { sent, failed } = await this.reminders.sendDue(SYSTEM_ACTOR, now);
    const result = { prepared, late, withdrawn, sent, failed: failed + prepareFailed + updates.failed };
    if (result.prepared || result.sent || result.withdrawn || result.failed) this.logger.log(`Mentoring reminders: ${JSON.stringify(result)}`);
    return result;
  }

  /** Cancels prepared class reminders for a student who is not eligible any more, or a class that is no longer open. */
  async withdrawNoLongerApplicable(): Promise<number> {
    const prepared = await this.db.mentoringReminder.findMany({ where: { status: 'PREPARED', entityType: CLASS_REMINDER_ENTITY } });
    if (prepared.length === 0) return 0;
    const activationIds = [...new Set(prepared.map((r) => r.activationId).filter((i): i is string => !!i))];
    const eligible = await this.classes.eligibleActivationIds(this.db, activationIds);
    const sessions = await this.db.mentoringClassSession.findMany({ where: { id: { in: prepared.map((r) => r.entityId) } } });
    let withdrawn = 0;
    for (const r of prepared) {
      const session = sessions.find((s) => s.id === r.entityId);
      const open = !!session && (session.status === 'SCHEDULED' || session.status === 'RESCHEDULED');
      if ((r.activationId && eligible.has(r.activationId)) && open) continue;
      try {
        await this.prisma.$transaction((tx: PrismaTxClient) => this.reminders.cancel(tx, r.id));
        withdrawn += 1;
      } catch {
        // Sent in the meantime, so it stands.
      }
    }
    return withdrawn;
  }

  /** Prepares the pending-update reminders of the classes of the last few days that nobody has reported on. */
  async prepareUpdateReminders(now: Date): Promise<{ prepared: number; failed: number }> {
    const today = localMomentOf(now, (await this.sla.workingNow(this.db, now)).timeZone).date;
    const occurrences = await this.classes.eligibleOccurrences(this.db, addDays(today, -(UPDATE_DAILY_REMINDERS + 2)), today);
    let prepared = 0;
    let failed = 0;
    for (const o of occurrences) {
      try {
        const made = await this.prisma.$transaction((tx: PrismaTxClient) => this.classes.prepareUpdateReminders(tx, o, now, SYSTEM_ACTOR));
        if (made.tutor !== null) prepared += 1;
      } catch {
        failed += 1;
      }
    }
    return { prepared, failed };
  }

  /** Prepares the reminder of every class in the next days of every eligible student. */
  async prepareClassReminders(now: Date): Promise<{ prepared: number; late: number; failed: number }> {
    const today = localMomentOf(now, (await this.sla.workingNow(this.db, now)).timeZone).date;
    const occurrences = await this.classes.eligibleOccurrences(this.db, today, addDays(today, PREPARE_DAYS_AHEAD));
    let prepared = 0;
    let late = 0;
    let failed = 0;
    for (const o of occurrences) {
      try {
        const made = await this.prisma.$transaction((tx: PrismaTxClient) => this.classes.prepareAutomaticReminder(tx, o, now, SYSTEM_ACTOR));
        if (made) {
          prepared += 1;
          if (made.late) late += 1;
        }
      } catch {
        failed += 1;
      }
    }
    return { prepared, late, failed };
  }
}
