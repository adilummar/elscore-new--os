import { ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { MentoringTutorAssignmentStatus, Prisma } from '@prisma/client';

import { PrismaService, PrismaTxClient } from '../../common/prisma/prisma.service';
import { AvailabilityWindow, DayNumber, minutesToClock } from '../tutor/tutor-availability';

import { MentoringAllocationService } from './mentoring-allocation.service';
import { assertMeetingStarted, assertWorkable, loadLockedActivation } from './mentoring-guards';
import { stableJson } from './mentoring-handover-fields';
import { MentoringHistoryService } from './mentoring-history.service';
import { ScheduleValue, SubjectSchedule, isScheduleValue } from './subject-schedule';
import {
  BusyBlock,
  MatchTarget,
  RequiredSession,
  SESSION_STATUS_LABELS,
  SessionCheck,
  StoredSession,
  TutorFacts,
  TutorMatch,
  Verdict,
  busyFromDatedBooking,
  busyFromStored,
  describeHours,
  describeMatch,
  evaluateTutor,
  rankMatches,
  requiredSessions,
  toStoredSessions,
  DATED_BOOKING_HORIZON_DAYS,
} from './tutor-matching';

const SCHEDULE_FIELD = 'timetable.schedule';
const LIVE: MentoringTutorAssignmentStatus[] = ['ACTIVE', 'NEEDS_REVIEW'];
const DATED_STATUSES = new Set(['SCHEDULED', 'ASSIGNED', 'IN_PROGRESS']);

interface TutorRecord extends TutorFacts {
  userId: string;
  subjectNames: string[];
  gradeNames: string[];
}

export interface TutorSessionView extends SessionCheck {
  statusLabel: string;
}

export interface TutorView {
  tutorProfileId: string;
  name: string;
  initials: string;
  photoUrl: string | null;
  subjects: string[];
  levels: string[];
  hours: string;
  verdict: Verdict;
  summary: string;
  availableCount: number;
  total: number;
  sessions: TutorSessionView[];
  ineligible: string | null;
  canAssign: boolean;
  isCurrent: boolean;
}

export interface AssignmentView {
  id: string;
  subjectId: string;
  subjectName: string;
  status: MentoringTutorAssignmentStatus;
  tutorProfileId: string;
  tutorName: string;
  initials: string;
  photoUrl: string | null;
  subjects: string[];
  levels: string[];
  /** The classes the tutor was confirmed for, in words. */
  sessions: string[];
  /** Why the assignment needs review, with the sessions that no longer fit. */
  reviewDetail: unknown;
  assignedAt: Date;
}

export interface CandidateList {
  subjectId: string;
  subjectName: string;
  gradeId: string;
  gradeName: string;
  ready: boolean;
  notReady: string | null;
  sessions: Array<{ key: string; label: string }>;
  tutors: TutorView[];
  current: AssignmentView | null;
  canUpdateAvailability: boolean;
}

const initialsOf = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p.charAt(0).toUpperCase())
    .join('');

const minutesOf = (d: Date) => d.getUTCHours() * 60 + d.getUTCMinutes();

/** The part of a subject schedule a tutor is confirmed against. A change to any of it needs the tutor re-checked. */
function coreOf(subject: Pick<SubjectSchedule, 'frequency' | 'gradeId'>, sessions: StoredSession[]) {
  return { frequency: subject.frequency, gradeId: subject.gradeId, sessions };
}

/**
 * Tutor selection for a subject of a student's schedule. Everything that decides whether a tutor can teach is decided
 * here on the server: the page only shows what this service returns, and an assignment is checked again inside a
 * transaction that holds the student's row and the tutor's row, so two Mentors cannot book the same time.
 */
@Injectable()
export class MentoringTutorService {
  private readonly logger = new Logger(MentoringTutorService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly history: MentoringHistoryService,
  ) {}

  // ─── Reading ───────────────────────────────────────────────────────────────

  private async storedSchedule(db: PrismaTxClient, handoverId: string | null): Promise<ScheduleValue | null> {
    if (!handoverId) return null;
    const row = await db.enrollmentHandoverField.findUnique({ where: { handoverId_fieldKey: { handoverId, fieldKey: SCHEDULE_FIELD } } });
    return row && isScheduleValue(row.value) ? row.value : null;
  }

  /** Working hours, subjects, levels and status for the tutors, by profile id. */
  private async loadTutors(db: PrismaTxClient, ids: string[]): Promise<Map<string, TutorRecord>> {
    const out = new Map<string, TutorRecord>();
    if (ids.length === 0) return out;
    const [profiles, subjectLinks, gradeLinks, slots] = await Promise.all([
      db.tutorProfile.findMany({ where: { id: { in: ids } } }),
      db.tutorSubject.findMany({ where: { tutorProfileId: { in: ids }, isActive: true } }),
      db.tutorGrade.findMany({ where: { tutorProfileId: { in: ids }, isActive: true } }),
      db.tutorAvailabilitySlot.findMany({ where: { tutorProfileId: { in: ids }, isActive: true } }),
    ]);
    const [employees, subjects, grades] = await Promise.all([
      db.employee.findMany({ where: { id: { in: profiles.map((p) => p.employeeId) } } }),
      db.subject.findMany({ where: { id: { in: subjectLinks.map((l) => l.subjectId) } } }),
      db.grade.findMany({ where: { id: { in: gradeLinks.map((l) => l.gradeId) } } }),
    ]);
    const subjectName = new Map(subjects.map((s) => [s.id, s.name]));
    const gradeName = new Map(grades.map((g) => [g.id, g.name]));
    for (const p of profiles) {
      const employee = employees.find((e) => e.id === p.employeeId);
      const windows: AvailabilityWindow[] = slots
        .filter((s) => s.tutorProfileId === p.id)
        .map((s) => ({ day: s.dayOfWeek as DayNumber, start: minutesToClock(minutesOf(s.startTime)), end: minutesToClock(minutesOf(s.endTime)) }));
      const mySubjects = subjectLinks.filter((l) => l.tutorProfileId === p.id);
      const myGrades = gradeLinks.filter((l) => l.tutorProfileId === p.id);
      out.set(p.id, {
        tutorProfileId: p.id,
        userId: employee?.userId ?? '',
        name: employee ? `${employee.firstName} ${employee.lastName}`.trim() : 'Tutor',
        photoUrl: p.profilePhotoUrl ?? null,
        active: p.tutorOperationalStatus === 'ACTIVE' && employee?.employmentStatus === 'ACTIVE',
        subjectIds: mySubjects.map((l) => l.subjectId),
        gradeIds: myGrades.map((l) => l.gradeId),
        windows,
        subjectNames: mySubjects.map((l) => subjectName.get(l.subjectId) ?? '').filter(Boolean).sort(),
        gradeNames: myGrades.map((l) => gradeName.get(l.gradeId) ?? '').filter(Boolean).sort(),
      });
    }
    return out;
  }

  /**
   * Everything already booked for these tutors: their other recurring assignments (another student's, or another
   * subject of this student) and dated bookings such as demos. `ignoreAssignmentId` leaves out the assignment being
   * re-checked, so a tutor never clashes with themselves.
   */
  private async busyFor(
    db: PrismaTxClient,
    tutors: Map<string, TutorRecord>,
    ctx: { activationId: string; subjectId: string; ignoreAssignmentId?: string },
  ): Promise<Map<string, BusyBlock[]>> {
    const out = new Map<string, BusyBlock[]>([...tutors.keys()].map((id) => [id, []]));
    const ids = [...tutors.keys()];
    if (ids.length === 0) return out;

    const [assignments, rows] = await Promise.all([
      db.mentoringTutorAssignment.findMany({ where: { tutorProfileId: { in: ids }, status: { in: LIVE } } }),
      db.mentoringTutorAssignmentSession.findMany({ where: { tutorProfileId: { in: ids } } }),
    ]);
    const byId = new Map(assignments.map((a) => [a.id, a]));
    for (const row of rows) {
      const a = byId.get(row.assignmentId);
      if (!a || a.id === ctx.ignoreAssignmentId) continue;
      // The current tutor of this very subject is being replaced or re-checked, so it is not a clash.
      if (a.activationId === ctx.activationId && a.subjectId === ctx.subjectId) continue;
      out.get(row.tutorProfileId)?.push(
        busyFromStored(
          { dayNumber: row.dayOfWeek as DayNumber, frequency: row.frequency as StoredSession['frequency'], week: (row.week as 1 | 2 | null) ?? null, occurrences: row.occurrences as StoredSession['occurrences'], startMinute: row.startMinute, endMinute: row.endMinute },
          a.activationId === ctx.activationId ? 'THIS_STUDENT' : 'ANOTHER_STUDENT',
        ),
      );
    }

    // One-off bookings in the next few weeks: demo sessions the tutor is assigned to and classes already scheduled.
    const userIds = [...tutors.values()].map((t) => t.userId).filter(Boolean);
    const profileOf = new Map([...tutors.values()].map((t) => [t.userId, t.tutorProfileId]));
    const now = new Date();
    const horizon = new Date(now.getTime() + DATED_BOOKING_HORIZON_DAYS * 86_400_000);
    const zone = process.env.SYSTEM_TIMEZONE ?? 'Asia/Kolkata';
    if (userIds.length > 0) {
      const [demos, classes] = await Promise.all([
        db.demoSessionTutorAssignment.findMany({ where: { tutorId: { in: userIds }, status: 'ACTIVE' }, include: { session: true } }),
        db.tutorClassRecord.findMany({ where: { tutorId: { in: userIds }, cancellation: 'NOT_CANCELLED', scheduledStart: { gte: now, lte: horizon } } }),
      ]);
      for (const d of demos) {
        const s = d.session;
        if (!s || !DATED_STATUSES.has(s.status) || s.scheduledEnd < now || s.scheduledStart > horizon) continue;
        const block = busyFromDatedBooking(s.scheduledStart, s.scheduledEnd, zone);
        const profileId = profileOf.get(d.tutorId);
        if (block && profileId) out.get(profileId)?.push(block);
      }
      for (const c of classes) {
        const block = busyFromDatedBooking(c.scheduledStart, c.scheduledEnd, zone);
        const profileId = profileOf.get(c.tutorId);
        if (block && profileId) out.get(profileId)?.push(block);
      }
    }
    return out;
  }

  /** The saved subject schedule a tutor is matched against, or the reason it cannot be matched yet. */
  private async subjectTarget(
    db: PrismaTxClient,
    handoverId: string | null,
    subjectId: string,
  ): Promise<{ ok: true; subject: SubjectSchedule; required: RequiredSession[]; target: MatchTarget } | { ok: false; message: string; subject?: SubjectSchedule }> {
    const schedule = await this.storedSchedule(db, handoverId);
    const subject = schedule?.subjects.find((s) => s.subjectId === subjectId);
    if (!subject) return { ok: false, message: 'Save the schedule with this subject first. Tutors are matched against the saved schedule.' };
    const required = requiredSessions(subject);
    if (!required.ok) return { ok: false, message: required.message, subject };
    return {
      ok: true,
      subject,
      required: required.sessions,
      target: { subjectId: subject.subjectId, subjectName: subject.subjectName, gradeId: subject.gradeId, gradeName: subject.gradeName },
    };
  }

  private viewOf(tutor: TutorRecord, match: TutorMatch, currentTutorId: string | null): TutorView {
    return {
      tutorProfileId: tutor.tutorProfileId,
      name: tutor.name,
      initials: initialsOf(tutor.name),
      photoUrl: tutor.photoUrl,
      subjects: tutor.subjectNames,
      levels: tutor.gradeNames,
      hours: describeHours(tutor.windows),
      verdict: match.verdict,
      summary: describeMatch(match),
      availableCount: match.availableCount,
      total: match.total,
      sessions: match.sessions.map((s) => ({ ...s, statusLabel: SESSION_STATUS_LABELS[s.status] })),
      ineligible: match.ineligible,
      canAssign: match.canAssign,
      isCurrent: tutor.tutorProfileId === currentTutorId,
    };
  }

  /** The tutors who teach this subject, ranked, with the reason for every session that does not fit. Assigned Mentor only. */
  async candidates(activationId: string, subjectId: string, userId: string, canUpdateAvailability: boolean): Promise<CandidateList> {
    const db = this.prisma as unknown as PrismaTxClient;
    const activation = await db.mentoringActivation.findUnique({ where: { id: activationId }, include: { stages: true } });
    if (!activation) throw new NotFoundException('Student not found');
    MentoringAllocationService.assertAssignedMentor(activation, userId);
    assertWorkable(activation);
    assertMeetingStarted(activation);

    const [resolved, current] = await Promise.all([this.subjectTarget(db, activation.handoverId, subjectId), this.currentAssignment(db, activationId, subjectId)]);
    const currentView = current ? (await this.assignmentViews(db, [current]))[0] : null;
    const subject = resolved.subject;
    const base = {
      subjectId,
      subjectName: subject?.subjectName ?? '',
      gradeId: subject?.gradeId ?? '',
      gradeName: subject?.gradeName ?? '',
      current: currentView,
      canUpdateAvailability,
    };
    if (!resolved.ok) return { ...base, ready: false, notReady: resolved.message, sessions: [], tutors: [] };

    const links = await db.tutorSubject.findMany({ where: { subjectId, isActive: true } });
    const tutors = await this.loadTutors(db, [...new Set(links.map((l) => l.tutorProfileId))]);
    const busy = await this.busyFor(db, tutors, { activationId, subjectId });
    const items = [...tutors.values()].map((t) => {
      const match = evaluateTutor(resolved.required, t, busy.get(t.tutorProfileId) ?? [], resolved.target);
      return { name: t.name, match, view: this.viewOf(t, match, current?.tutorProfileId ?? null) };
    });
    return {
      ...base,
      ready: true,
      notReady: null,
      sessions: resolved.required.map((r) => ({ key: r.key, label: r.label })),
      tutors: rankMatches(items).map((i) => i.view),
    };
  }

  private async currentAssignment(db: PrismaTxClient, activationId: string, subjectId: string) {
    return db.mentoringTutorAssignment.findFirst({ where: { activationId, subjectId, status: { in: LIVE } } });
  }

  /** The student's tutors for the workspace page. */
  async assignmentsFor(activationId: string): Promise<AssignmentView[]> {
    const db = this.prisma as unknown as PrismaTxClient;
    const rows = await db.mentoringTutorAssignment.findMany({ where: { activationId, status: { in: LIVE } }, orderBy: { assignedAt: 'asc' } });
    return this.assignmentViews(db, rows);
  }

  private async assignmentViews(
    db: PrismaTxClient,
    rows: Array<{ id: string; subjectId: string; status: MentoringTutorAssignmentStatus; tutorProfileId: string; scheduleSnapshot: Prisma.JsonValue; reviewDetail: Prisma.JsonValue | null; assignedAt: Date }>,
  ): Promise<AssignmentView[]> {
    if (rows.length === 0) return [];
    const tutors = await this.loadTutors(db, [...new Set(rows.map((r) => r.tutorProfileId))]);
    return rows.map((r) => {
      const t = tutors.get(r.tutorProfileId);
      const snap = (r.scheduleSnapshot ?? {}) as { subjectName?: string; labels?: string[] };
      return {
        id: r.id,
        subjectId: r.subjectId,
        subjectName: snap.subjectName ?? '',
        status: r.status,
        tutorProfileId: r.tutorProfileId,
        tutorName: t?.name ?? 'Tutor',
        initials: initialsOf(t?.name ?? 'Tutor'),
        photoUrl: t?.photoUrl ?? null,
        subjects: t?.subjectNames ?? [],
        levels: t?.gradeNames ?? [],
        sessions: snap.labels ?? [],
        reviewDetail: r.reviewDetail,
        assignedAt: r.assignedAt,
      };
    });
  }

  // ─── Assigning ─────────────────────────────────────────────────────────────

  private refusal(name: string, match: TutorMatch): string {
    if (match.ineligible) return `${name} cannot be assigned. ${match.ineligible}`;
    const failing = match.sessions.filter((s) => s.status !== 'AVAILABLE').map((s) => `${s.label}: ${s.reason}`);
    return `${name} is not available for every session, so cannot be assigned. ${failing.join(' ')}`;
  }

  private async lockTutor(tx: PrismaTxClient, tutorProfileId: string) {
    await tx.$executeRaw`SELECT 1 FROM tutor_profiles WHERE id = ${tutorProfileId} FOR UPDATE`;
  }

  private async endAssignment(tx: PrismaTxClient, assignmentId: string, userId: string | null, reason: string) {
    await tx.mentoringTutorAssignment.update({
      where: { id: assignmentId },
      data: { status: 'ENDED', currentKey: null, endedAt: new Date(), endedByUserId: userId, endReason: reason },
    });
    await tx.mentoringTutorAssignmentSession.deleteMany({ where: { assignmentId } });
  }

  private async writeSessions(tx: PrismaTxClient, assignmentId: string, tutorProfileId: string, stored: StoredSession[]) {
    await tx.mentoringTutorAssignmentSession.createMany({
      data: stored.map((s) => ({ assignmentId, tutorProfileId, dayOfWeek: s.dayNumber, frequency: s.frequency, week: s.week, occurrences: s.occurrences, startMinute: s.startMinute, endMinute: s.endMinute })),
    });
  }

  /**
   * Assigns a tutor to a subject. The tutor must teach the subject at the student's level, be active, and be free for
   * every session of the saved schedule. The check runs again here, inside the transaction, with the student's row and
   * the tutor's row locked, whatever the page showed a moment ago.
   */
  async assign(activationId: string, subjectId: string, tutorProfileId: string, userId: string): Promise<AssignmentView> {
    return this.prisma.$transaction(async (tx: PrismaTxClient) => {
      const activation = await loadLockedActivation(tx, activationId);
      MentoringAllocationService.assertAssignedMentor(activation, userId);
      assertWorkable(activation);
      assertMeetingStarted(activation);
      await this.lockTutor(tx, tutorProfileId);

      const resolved = await this.subjectTarget(tx, activation.handoverId, subjectId);
      if (!resolved.ok) throw new ConflictException(resolved.message);
      const tutors = await this.loadTutors(tx, [tutorProfileId]);
      const tutor = tutors.get(tutorProfileId);
      if (!tutor) throw new NotFoundException('Tutor not found');

      const busy = (await this.busyFor(tx, tutors, { activationId, subjectId })).get(tutorProfileId) ?? [];
      const match = evaluateTutor(resolved.required, tutor, busy, resolved.target);
      if (!match.canAssign) throw new ConflictException(this.refusal(tutor.name, match));

      const stored = toStoredSessions(resolved.required);
      const core = coreOf(resolved.subject, stored);
      const current = await this.currentAssignment(tx, activationId, subjectId);
      if (current && current.tutorProfileId === tutorProfileId && current.status === 'ACTIVE' && stableJson((current.scheduleSnapshot as { core?: unknown })?.core) === stableJson(core)) {
        return (await this.assignmentViews(tx, [current]))[0];
      }
      if (current) await this.endAssignment(tx, current.id, userId, current.tutorProfileId === tutorProfileId ? 'Re-confirmed after a schedule change' : 'Replaced by another tutor');

      const created = await tx.mentoringTutorAssignment.create({
        data: {
          activationId,
          subjectId,
          tutorProfileId,
          status: 'ACTIVE',
          currentKey: `${activationId}:${subjectId}`,
          scheduleSnapshot: { subjectName: resolved.subject.subjectName, gradeName: resolved.subject.gradeName, core, labels: resolved.required.map((r) => r.label) } as unknown as Prisma.InputJsonValue,
          assignedByUserId: userId,
        },
      });
      await this.writeSessions(tx, created.id, tutorProfileId, stored);

      const previous = current ? (await this.loadTutors(tx, [current.tutorProfileId])).get(current.tutorProfileId) : undefined;
      await this.history.record(tx, {
        activationId,
        type: current ? 'MENTORING_TUTOR_REASSIGNED' : 'MENTORING_TUTOR_ASSIGNED',
        actorUserId: userId,
        reason: current ? `Replaced ${previous?.name ?? 'the earlier tutor'}` : null,
        payload: {
          subjectId,
          subjectName: resolved.subject.subjectName,
          tutorProfileId,
          tutorName: tutor.name,
          previousTutorProfileId: current?.tutorProfileId ?? null,
          previousTutorName: previous?.name ?? null,
          sessions: resolved.required.map((r) => r.label),
        },
      });
      return (await this.assignmentViews(tx, [created]))[0];
    });
  }

  /** The Mentor removes the tutor from a subject. The assignment stays in the history. */
  async unassign(activationId: string, subjectId: string, reason: string | null, userId: string): Promise<{ removed: boolean }> {
    return this.prisma.$transaction(async (tx: PrismaTxClient) => {
      const activation = await loadLockedActivation(tx, activationId);
      MentoringAllocationService.assertAssignedMentor(activation, userId);
      assertWorkable(activation);
      assertMeetingStarted(activation);

      const current = await this.currentAssignment(tx, activationId, subjectId);
      if (!current) return { removed: false };
      const tutor = (await this.loadTutors(tx, [current.tutorProfileId])).get(current.tutorProfileId);
      const why = reason?.trim() || 'Removed by the Mentor';
      await this.endAssignment(tx, current.id, userId, why);
      await this.history.record(tx, {
        activationId,
        type: 'MENTORING_TUTOR_REMOVED',
        actorUserId: userId,
        reason: why,
        payload: { subjectId, tutorProfileId: current.tutorProfileId, tutorName: tutor?.name ?? null },
      });
      return { removed: true };
    });
  }

  // ─── Keeping assignments honest when something changes ─────────────────────

  /**
   * Re-checks one assignment against the student's saved schedule and the tutor's current hours and bookings.
   * A tutor who no longer fits is never dropped silently: the assignment is flagged for review with the sessions that
   * clash, the earlier booking stays in place, and the change goes into the history.
   */
  private async reassess(tx: PrismaTxClient, activationId: string, a: { id: string; subjectId: string; tutorProfileId: string; status: MentoringTutorAssignmentStatus; scheduleSnapshot: Prisma.JsonValue; reviewDetail: Prisma.JsonValue | null }, schedule: ScheduleValue | null, actorUserId: string | null, trigger: string) {
    await this.lockTutor(tx, a.tutorProfileId);
    const subject = schedule?.subjects.find((s) => s.subjectId === a.subjectId);
    const snap = (a.scheduleSnapshot ?? {}) as { subjectName?: string; core?: unknown };
    const event = (type: string, extra: Record<string, unknown>, reason: string | null = null) =>
      this.history.record(tx, { activationId, type, actorUserId, reason, payload: { subjectId: a.subjectId, subjectName: subject?.subjectName ?? snap.subjectName ?? null, tutorProfileId: a.tutorProfileId, trigger, ...extra } });

    if (!subject) {
      await this.endAssignment(tx, a.id, actorUserId, 'The subject was removed from the schedule');
      await event('MENTORING_TUTOR_REMOVED', {}, 'The subject was removed from the schedule');
      return;
    }

    const flag = async (detail: Record<string, unknown>) => {
      if (a.status === 'NEEDS_REVIEW' && stableJson(a.reviewDetail) === stableJson(detail)) return;
      await tx.mentoringTutorAssignment.update({ where: { id: a.id }, data: { status: 'NEEDS_REVIEW', reviewDetail: detail as Prisma.InputJsonValue } });
      await event('MENTORING_TUTOR_NEEDS_REVIEW', { detail }, 'The tutor no longer fits this schedule');
    };

    const required = requiredSessions(subject);
    if (!required.ok) return flag({ reason: required.message, sessions: [] });

    const tutors = await this.loadTutors(tx, [a.tutorProfileId]);
    const tutor = tutors.get(a.tutorProfileId);
    if (!tutor) return flag({ reason: 'The tutor could not be found.', sessions: [] });
    const target: MatchTarget = { subjectId: subject.subjectId, subjectName: subject.subjectName, gradeId: subject.gradeId, gradeName: subject.gradeName };
    const busy = (await this.busyFor(tx, tutors, { activationId, subjectId: a.subjectId, ignoreAssignmentId: a.id })).get(a.tutorProfileId) ?? [];
    const match = evaluateTutor(required.sessions, tutor, busy, target);

    if (!match.canAssign) {
      return flag({
        reason: match.ineligible ?? 'Some sessions no longer fit the tutor.',
        sessions: match.sessions.filter((s) => s.status !== 'AVAILABLE').map((s) => ({ key: s.key, label: s.label, status: s.status, reason: s.reason })),
      });
    }

    const stored = toStoredSessions(required.sessions);
    const core = coreOf(subject, stored);
    if (a.status === 'ACTIVE' && stableJson(snap.core) === stableJson(core)) return;
    await tx.mentoringTutorAssignmentSession.deleteMany({ where: { assignmentId: a.id } });
    await this.writeSessions(tx, a.id, a.tutorProfileId, stored);
    await tx.mentoringTutorAssignment.update({
      where: { id: a.id },
      data: {
        status: 'ACTIVE',
        reviewDetail: Prisma.JsonNull,
        scheduleSnapshot: { subjectName: subject.subjectName, gradeName: subject.gradeName, core, labels: required.sessions.map((r) => r.label) } as unknown as Prisma.InputJsonValue,
      },
    });
    await event(a.status === 'NEEDS_REVIEW' ? 'MENTORING_TUTOR_CONFIRMED' : 'MENTORING_TUTOR_SCHEDULE_UPDATED', { sessions: required.sessions.map((r) => r.label) });
  }

  /** Called inside the transaction that saves a schedule: every tutor of this student is checked against the new one. */
  async revalidateForSchedule(tx: PrismaTxClient, activation: { id: string; handoverId: string | null }, schedule: ScheduleValue | null, userId: string): Promise<void> {
    const rows = await tx.mentoringTutorAssignment.findMany({ where: { activationId: activation.id, status: { in: LIVE } }, orderBy: { tutorProfileId: 'asc' } });
    for (const a of rows) await this.reassess(tx, activation.id, a, schedule, userId, 'SCHEDULE_CHANGED');
  }

  /** A tutor's working hours changed: every student subject they teach is checked again and flagged if it no longer fits. */
  async revalidateForTutor(tutorProfileId: string, actorUserId: string | null): Promise<number> {
    const rows = await (this.prisma as unknown as PrismaTxClient).mentoringTutorAssignment.findMany({ where: { tutorProfileId, status: { in: LIVE } } });
    let changed = 0;
    for (const row of rows) {
      await this.prisma.$transaction(async (tx: PrismaTxClient) => {
        const activation = await loadLockedActivation(tx, row.activationId);
        const fresh = await tx.mentoringTutorAssignment.findUnique({ where: { id: row.id } });
        if (!fresh || fresh.status === 'ENDED') return;
        const schedule = await this.storedSchedule(tx, activation.handoverId);
        const before = `${fresh.status}:${stableJson(fresh.reviewDetail)}`;
        await this.reassess(tx, activation.id, fresh, schedule, actorUserId, 'TUTOR_AVAILABILITY_CHANGED');
        const after = await tx.mentoringTutorAssignment.findUnique({ where: { id: row.id } });
        if (after && `${after.status}:${stableJson(after.reviewDetail)}` !== before) changed++;
      });
    }
    return changed;
  }

  @OnEvent('tutor.availability.changed', { async: true })
  async onAvailabilityChanged(event: { tutorProfileId: string; actorUserId: string | null }): Promise<void> {
    try {
      await this.revalidateForTutor(event.tutorProfileId, event.actorUserId);
    } catch (error) {
      this.logger.error(`Re-checking tutor assignments after an availability change failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}

