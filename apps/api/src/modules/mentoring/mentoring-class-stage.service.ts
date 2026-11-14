import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';

import { PrismaService, PrismaTxClient } from '../../common/prisma/prisma.service';

import { StageChecklist, StageKey, StoredStage, checkStageSubmission, durationOf, isStoredStage, sameChecklist, stageStatuses, suggestedStage } from './class-stage';
import { MentoringClassService, SessionRow } from './mentoring-class.service';
import { MentoringHistoryService } from './mentoring-history.service';
import { clockMinutes, localMomentOf } from './mentoring-sla';
import { MentoringSlaService } from './mentoring-sla.service';

const dayOf = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : null);

export interface StageSubmissionView { stage: StoredStage; version: number; submittedAt: string; submittedBy: string | null; checklist: StageChecklist }

/**
 * The class workflow's stored parts: the Mentor's Before Class and After Class submissions, and the Mentor-corrected actual time. Both belong to
 * the assigned Mentor, are refused once the class is verified or cancelled, and write to the class's own event log, so nothing is overwritten
 * without a trace. Evidence (shares, voice, activities) and the tutor's own update are never changed here.
 */
@Injectable()
export class MentoringClassStageService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly classes: MentoringClassService,
    private readonly history: MentoringHistoryService,
    private readonly sla: MentoringSlaService,
  ) {}

  private get db() {
    return this.prisma as unknown as PrismaTxClient;
  }

  private open(session: SessionRow) {
    if (session.status === 'CANCELLED') throw new ConflictException('This class was cancelled, so it cannot be changed.');
    if (session.status === 'VERIFIED' || session.status === 'NOT_CONDUCTED') throw new ConflictException('This class is verified, so this can no longer be changed.');
  }

  private async mentorCtx(tx: PrismaTxClient, userId: string, key: string) {
    const o = await this.classes.occurrenceForKey(tx, key);
    const activation = await this.classes.mentorGuard(tx, o.activationId, userId);
    const session = await this.classes.ensureSession(tx, o);
    return { o, session, activation };
  }

  private async nameOf(db: PrismaTxClient, id: string | null | undefined): Promise<string | null> {
    if (!id) return null;
    const e = await db.employee.findUnique({ where: { userId: id } });
    return e ? `${e.firstName} ${e.lastName}`.trim() : null;
  }

  /** The options a Mentor can choose from for Activities given: the active ones, plus any this class already recorded. */
  async optionsFor(db: PrismaTxClient, previous: StageChecklist | null) {
    const rows = await db.mentoringActivityOption.findMany({ where: {} });
    const kept = new Set((previous?.activities ?? []).map((a) => a.code));
    return rows.sort((a, b) => a.sortOrder - b.sortOrder || a.label.localeCompare(b.label)).map((o) => ({ code: o.code, label: o.label, active: o.isActive || kept.has(o.code) }));
  }

  private asChecklist(v: unknown): StageChecklist | null {
    return v && typeof v === 'object' && !Array.isArray(v) && (v as StageChecklist).items ? (v as StageChecklist) : null;
  }

  /** Submits (or corrects) one stage. Repeating the same submission changes nothing and is not a new version. */
  async submit(userId: string, key: string, stage: unknown, body: unknown, now: Date = new Date()) {
    if (!isStoredStage(stage)) throw new BadRequestException('That stage is not submitted here. Actual Time and Verification are read from what is recorded.');
    return this.prisma.$transaction(async (tx: PrismaTxClient) => {
      const { session } = await this.mentorCtx(tx, userId, key);
      this.open(session);
      const existing = await tx.mentoringClassStageSubmission.findUnique({ where: { sessionId_stage: { sessionId: session.id, stage } } });
      const previous = this.asChecklist(existing?.checklist);
      const options = await this.optionsFor(tx, previous);
      const checked = checkStageSubmission(stage, body, options, previous);
      if (!checked.ok) throw new BadRequestException(checked.message);
      if (existing && sameChecklist(previous, checked.value)) {
        return { stage, version: existing.version, submittedAt: existing.submittedAt.toISOString(), already: true };
      }
      const data = { checklist: checked.value as never, submittedByUserId: userId, submittedAt: now };
      const row = existing
        ? await tx.mentoringClassStageSubmission.update({ where: { id: existing.id }, data: { ...data, version: existing.version + 1 } })
        : await tx.mentoringClassStageSubmission.create({ data: { sessionId: session.id, stage, version: 1, ...data } });
      await this.classes.logEvent(tx, session.id, existing ? 'STAGE_CORRECTED' : 'STAGE_SUBMITTED', userId, {
        payload: { stage, version: row.version, checklist: checked.value, ...(existing ? { previous: { checklist: previous, submittedByUserId: existing.submittedByUserId, submittedAt: existing.submittedAt.toISOString() } } : {}) },
      });
      return { stage, version: row.version, submittedAt: row.submittedAt.toISOString(), already: false };
    });
  }

  /**
   * The Mentor's own record of when teaching really started and ended. It does not touch the scheduled time, the tutor's reported time or the
   * verified minutes. If there was no change in time, the Mentor confirms the scheduled time was followed without requiring start/end or reason.
   * If there was a difference, a reason and valid start/end times are required, and the earlier value goes into the audit event.
   */
  async setMentorActualTime(userId: string, key: string, body: unknown, now: Date = new Date()) {
    const r = body && typeof body === 'object' && !Array.isArray(body) ? (body as Record<string, unknown>) : null;
    if (!r) throw new BadRequestException('Send the actual time details.');

    const noChange = r.timeChanged === false || r.followedSchedule === true;
    const clear = r.clear === true;

    return this.prisma.$transaction(async (tx: PrismaTxClient) => {
      const { session } = await this.mentorCtx(tx, userId, key);
      this.open(session);
      const today = localMomentOf(now, (await this.sla.workingNow(tx, now)).timeZone).date;
      if ((dayOf(session.date) as string) > today) throw new ConflictException('This class has not happened yet.');
      const prev = { start: session.mentorActualStartMinute ?? null, end: session.mentorActualEndMinute ?? null };

      if (noChange || (clear && r.timeChanged !== true)) {
        const hadActual = session.mentorActualStartMinute !== null || session.mentorActualEndMinute !== null;
        if (!hadActual && noChange) {
          const lastEvent = await tx.mentoringClassSessionEvent.findFirst({
            where: { sessionId: session.id, kind: 'MENTOR_SCHEDULED_TIME_CONFIRMED' },
            orderBy: { createdAt: 'desc' },
          });
          if (lastEvent) {
            return {
              sessionId: session.id,
              timeChanged: false,
              actual: null,
              confirmedSchedule: { startMinute: session.startMinute, endMinute: session.endMinute },
              already: true,
            };
          }
        }

        if (hadActual) {
          await tx.mentoringClassSession.update({
            where: { id: session.id },
            data: {
              mentorActualStartMinute: null,
              mentorActualEndMinute: null,
              mentorActualReason: null,
              mentorActualByUserId: null,
              mentorActualAt: null,
            },
          });
        }

        const reason = typeof r.reason === 'string' ? r.reason.trim() : null;
        const eventType = noChange ? 'MENTOR_SCHEDULED_TIME_CONFIRMED' : 'MENTOR_ACTUAL_TIME_CLEARED';
        await this.classes.logEvent(tx, session.id, eventType, userId, {
          reason,
          payload: {
            scheduled: { startMinute: session.startMinute, endMinute: session.endMinute },
            previousActual: prev,
            reportedByTutor: { startMinute: session.actualStartMinute ?? null, endMinute: session.actualEndMinute ?? null },
          },
        });

        await this.history.record(tx, {
          activationId: session.activationId,
          type: noChange ? 'MENTORING_CLASS_SCHEDULE_CONFIRMED' : 'MENTORING_CLASS_ACTUAL_TIME_CLEARED',
          actorUserId: userId,
          reason,
          payload: { sessionId: session.id, scheduled: { startMinute: session.startMinute, endMinute: session.endMinute }, previousActual: prev },
        });

        return {
          sessionId: session.id,
          timeChanged: false,
          actual: null,
          confirmedSchedule: { startMinute: session.startMinute, endMinute: session.endMinute },
          already: false,
        };
      }

      // YES path: actual class time differed from schedule
      const start = typeof r.start === 'string' ? clockMinutes(r.start) : null;
      const end = typeof r.end === 'string' ? clockMinutes(r.end) : null;
      if (start === null || end === null) throw new BadRequestException('Enter the actual start and end time, like 16:30 and 17:30.');
      if (end <= start) throw new BadRequestException('The class must end after it starts, on the same day.');

      const reason = typeof r.reason === 'string' ? r.reason.trim() : '';
      if (!reason) throw new BadRequestException('Say why the actual time differed from the schedule.');
      if (reason.length > 1000) throw new BadRequestException('The reason must be 1000 characters or fewer.');

      const next = { start, end };
      if (prev.start === next.start && prev.end === next.end && session.mentorActualReason === reason) {
        return { sessionId: session.id, timeChanged: true, actual: { startMinute: next.start, endMinute: next.end }, already: true };
      }

      await tx.mentoringClassSession.update({
        where: { id: session.id },
        data: {
          mentorActualStartMinute: start,
          mentorActualEndMinute: end,
          mentorActualReason: reason,
          mentorActualByUserId: userId,
          mentorActualAt: now,
        },
      });

      await this.classes.logEvent(tx, session.id, 'MENTOR_ACTUAL_TIME_SET', userId, {
        reason,
        payload: {
          previous: prev,
          new: next,
          scheduled: { startMinute: session.startMinute, endMinute: session.endMinute },
          reportedByTutor: { startMinute: session.actualStartMinute ?? null, endMinute: session.actualEndMinute ?? null },
        },
      });

      await this.history.record(tx, {
        activationId: session.activationId,
        type: 'MENTORING_CLASS_ACTUAL_TIME_RECORDED',
        actorUserId: userId,
        reason,
        payload: { sessionId: session.id, previous: prev, new: next },
      });

      return { sessionId: session.id, timeChanged: true, actual: { startMinute: next.start, endMinute: next.end }, already: false };
    });
  }

  /**
   * What the class page adds to the workspace: the stage statuses, each stored submission, the Mentor-corrected time, the activity choices and
   * whether the class can be rescheduled. `facts` comes from the workspace the caller already built, so nothing is worked out twice.
   */
  async extra(sessionId: string, facts: { status: string; tutorSubmitted: boolean; tutorActual: { start: number | null; end: number | null } | null; canWork: boolean }) {
    const db = this.db;
    const session = (await db.mentoringClassSession.findUnique({ where: { id: sessionId } })) as SessionRow;
    const rows = await db.mentoringClassStageSubmission.findMany({ where: { sessionId } });
    const submissions: StageSubmissionView[] = [];
    for (const r of rows) {
      submissions.push({ stage: r.stage as StoredStage, version: r.version, submittedAt: r.submittedAt.toISOString(), submittedBy: await this.nameOf(db, r.submittedByUserId), checklist: this.asChecklist(r.checklist) ?? { items: {} } });
    }
    const stored = { BEFORE: submissions.some((s) => s.stage === 'BEFORE'), AFTER: submissions.some((s) => s.stage === 'AFTER') };
    const mentorActual = session.mentorActualStartMinute != null && session.mentorActualEndMinute != null
      ? { startMinute: session.mentorActualStartMinute, endMinute: session.mentorActualEndMinute, minutes: durationOf(session.mentorActualStartMinute, session.mentorActualEndMinute), reason: session.mentorActualReason ?? null, by: await this.nameOf(db, session.mentorActualByUserId), at: session.mentorActualAt?.toISOString() ?? null }
      : null;

    const lastTimingEvent = await db.mentoringClassSessionEvent.findFirst({
      where: {
        sessionId,
        kind: { in: ['MENTOR_SCHEDULED_TIME_CONFIRMED', 'MENTOR_ACTUAL_TIME_SET', 'MENTOR_ACTUAL_TIME_CLEARED'] },
      },
      orderBy: { createdAt: 'desc' },
    });
    const confirmedSchedule = !mentorActual && lastTimingEvent?.kind === 'MENTOR_SCHEDULED_TIME_CONFIRMED'
      ? { by: await this.nameOf(db, lastTimingEvent.actorUserId), at: lastTimingEvent.createdAt.toISOString() }
      : null;

    const actualRecorded = !!mentorActual || !!confirmedSchedule;
    const f = { status: facts.status, tutorSubmitted: facts.tutorSubmitted, actualRecorded };
    const afterSub = submissions.find((s) => s.stage === 'AFTER') ?? null;
    return {
      stages: { steps: stageStatuses(stored, f), suggested: suggestedStage(stored, f), submissions },
      mentorActual,
      confirmedSchedule,
      activityChoices: await this.optionsFor(db, afterSub?.checklist ?? null),
      canReschedule: facts.canWork && (facts.status === 'SCHEDULED' || facts.status === 'RESCHEDULED'),
    };
  }
}
