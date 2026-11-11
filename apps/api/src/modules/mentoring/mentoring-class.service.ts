import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';

import { IdGeneratorService } from '../../common/id-generator/id-generator.service';
import { PrismaService, PrismaTxClient } from '../../common/prisma/prisma.service';
import { TutorCalendarInput, addDays, checkWindow, isDateString, resolveDay } from '../tutor/tutor-calendar';
import { loadCalendars } from '../tutor/tutor-calendar.data';

import { EligibilityReason, OPEN_CLASS_STATUSES, TIMETABLE_STAGE, classEligibility, ineligibleMessage } from './class-eligibility';
import {
  ChecklistItem, ClassStatus, DisplayState, Occurrence, ReminderState, STATE_LABELS, TUTOR_CAN_UPDATE, CAN_REMIND, MENTOR_CAN_REVIEW, checkMentorNotes, checkTutorUpdate, checklistOf, displayState,
  occurrencesBetween, parseClassKey, payableAmount, verificationWarnings, MAX_CLASS_MINUTES, CAN_RESCHEDULE,
 OverrideRow, RuleRow } from './class-session';
import { checkReason, verificationBlockers } from './class-workspace';
import { MentoringAccessService, MentoringScope } from './mentoring-access.service';
import { MentoringAllocationService } from './mentoring-allocation.service';
import { loadLockedActivation } from './mentoring-guards';
import { MentoringHistoryService } from './mentoring-history.service';
import { MentoringReminderService } from './mentoring-reminder.service';
import { clockMinutes, localMomentOf, zonedInstant } from './mentoring-sla';
import { MentoringSlaService } from './mentoring-sla.service';
import { MentoringTutorService } from './mentoring-tutor.service';

const LIVE_ASSIGNMENT = ['ACTIVE', 'NEEDS_REVIEW'] as const;
/** A reminder belongs to one slot: a class that is moved needs a new reminder for its new time. */
/** The tutor is reminded this long before a class starts. */
export const CLASS_REMINDER_LEAD_MINUTES = 45;
export const CLASS_REMINDER_ENTITY = 'ClassSession';
const slotKind = (date: string, startMinute: number) => `CLASS_REMINDER:${date}:${startMinute}`;
const ENTITY = 'ClassSession';
const MAX_RANGE_DAYS = 31;
const dayOf = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : null);
const asDate = (d: string) => new Date(`${d}T00:00:00Z`);

export interface ClassView {
  key: string;
  sessionId: string | null;
  activationId: string;
  studentName: string;
  subjectId: string;
  subjectName: string;
  tutorProfileId: string;
  tutorName: string;
  date: string;
  startMinute: number;
  endMinute: number;
  scheduledMinutes: number;
  moved: boolean;
  /** The stored lifecycle status, or SCHEDULED when nothing has happened to the class yet. */
  status: ClassStatus;
  state: DisplayState;
  stateLabel: string;
  reminder: { status: ReminderState; sentAt: string | null; acknowledgedAt: string | null } | null;
  /** Whether the tutor has acknowledged the reminder. */
  tutorConfirmation: 'ACKNOWLEDGED' | 'SENT' | 'NOT_SENT';
  mentorVerification: 'VERIFIED' | 'NOT_CONDUCTED' | 'PENDING';
  update: UpdateView | null;
  checklist: ChecklistItem[];
  mentorRemarks: string | null;
  returned: { reason: string; kind: string } | null;
  verified: { at: string; minutes: number } | null;
  sla: { state: string; label: string; dueAt: string; overdueMinutes: number } | null;
  /** The common Meet link of the class, when one was set. */
  meetLink: string | null;
  cancelled: { at: string; reason: string } | null;
  /** The voice recording, in three separate facts: uploaded, shared in the group (a person's word), and verified by the Mentor. */
  voice: { uploaded: boolean; shared: boolean; sharedAt: string | null; attachmentId: string | null; fileName: string | null; uploadedAt: string | null; mentorVerifiedAt: string | null };
  activityCounts: { created: number; shared: number; completed: number };
  exception: { status: string | null; reason: string | null; decisionNote: string | null };
  /** A class is consumed only after the Mentor verified it. The same row drives the student's and the tutor's views. */
  consumption: 'CONSUMED' | 'NOT_CONSUMED';
  /** What stands between this class and its verification. Empty when it can be verified, or when it has not been reported yet. */
  blockers: string[];
}

export interface UpdateView {
  conducted: boolean | null;
  actualStartMinute: number | null;
  actualEndMinute: number | null;
  actualMinutes: number | null;
  subjectCovered: string | null;
  topicsCovered: string | null;
  attendance: string | null;
  participation: string | null;
  classNotes: string | null;
  notConductedReason: string | null;
  activities: string[];
  otherActivity: string | null;
  evaluationRemarks: string | null;
  coveredRemarks: string | null;
  voice: { sentAt: string | null; receivedAt: string | null; remarks: string | null };
  submittedAt: string | null;
}

export interface ClassFilters { subjectId?: string; tutorProfileId?: string; status?: string; state?: string; activationId?: string; from?: string; to?: string; limit?: number | string }

export type SessionRow = NonNullable<Awaited<ReturnType<PrismaTxClient['mentoringClassSession']['findUnique']>>>;

/**
 * Daily classes. A class is the tutor assignment's own recurrence for a date; a row is stored only when something happens to
 * it. The tutor reports, the assigned Mentor verifies, and only a verified class becomes a tutor class record for payroll.
 * Verifying never pays anyone: it makes the record the existing payroll run reads, and nothing more.
 */
@Injectable()
export class MentoringClassService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: MentoringAccessService,
    private readonly history: MentoringHistoryService,
    private readonly sla: MentoringSlaService,
    private readonly reminders: MentoringReminderService,
    private readonly ids: IdGeneratorService,
    private readonly tutors: MentoringTutorService,
  ) {}

  private get db() {
    return this.prisma as unknown as PrismaTxClient;
  }

  // ─── Finding classes ───────────────────────────────────────────────────────────────────────────────────────────
  private async occurrences(db: PrismaTxClient, where: Record<string, unknown>, from: string, to: string): Promise<Occurrence[]> {
    const found = await db.mentoringTutorAssignment.findMany({ where: { ...where, status: { in: [...LIVE_ASSIGNMENT] } } });
    // Classes are generated only for students who are Active with an approved timetable.
    const eligible = await this.eligibleActivationIds(db, [...new Set(found.map((a) => a.activationId))]);
    const assignments = found.filter((a) => eligible.has(a.activationId));
    if (assignments.length === 0) return [];
    const ids = assignments.map((a) => a.id);
    const [rules, overrides] = await Promise.all([db.mentoringTutorAssignmentSession.findMany({ where: { assignmentId: { in: ids } } }), db.mentoringTutorAssignmentOverride.findMany({ where: { assignmentId: { in: ids } } })]);
    return occurrencesBetween(from, to, {
      assignments: assignments.map((a) => ({ id: a.id, activationId: a.activationId, subjectId: a.subjectId, tutorProfileId: a.tutorProfileId, startDate: dayOf(a.startDate), endDate: dayOf(a.endDate) })),
      rules: rules.map((r): RuleRow => ({ assignmentId: r.assignmentId, dayOfWeek: r.dayOfWeek, frequency: r.frequency as RuleRow['frequency'], week: (r.week as 1 | 2 | null) ?? null, occurrences: r.occurrences, startMinute: r.startMinute, endMinute: r.endMinute })),
      overrides: overrides.map((o): OverrideRow => ({ assignmentId: o.assignmentId, date: dayOf(o.date) as string, originalStartMinute: o.originalStartMinute, kind: o.kind, newDate: dayOf(o.newDate), newStartMinute: o.newStartMinute, newEndMinute: o.newEndMinute })),
    });
  }

  /** The class a key names, only if the assignment's rule really produces it. Nothing else can be reminded, updated or verified. */
  async occurrenceForKey(db: PrismaTxClient, key: unknown): Promise<Occurrence> {
    const parsed = parseClassKey(key);
    if (!parsed) throw new BadRequestException('That is not a class.');
    const moved = await db.mentoringTutorAssignmentOverride.findMany({ where: { assignmentId: parsed.assignmentId, date: asDate(parsed.originalDate), originalStartMinute: parsed.originalStartMinute } });
    const end = moved.find((o) => o.newDate)?.newDate;
    const list = await this.occurrences(db, { id: parsed.assignmentId }, parsed.originalDate, end ? dayOf(end) ?? parsed.originalDate : parsed.originalDate);
    const found = list.find((o) => o.key === key);
    if (!found) throw new NotFoundException('That class is not on the schedule.');
    return found;
  }

  async ensureSession(db: PrismaTxClient, o: Occurrence): Promise<SessionRow> {
    const existing = await db.mentoringClassSession.findFirst({ where: { assignmentId: o.assignmentId, originalDate: asDate(o.originalDate), originalStartMinute: o.originalStartMinute } });
    if (existing) return existing;
    const profile = await db.tutorProfile.findUnique({ where: { id: o.tutorProfileId } });
    const employee = profile ? await db.employee.findUnique({ where: { id: profile.employeeId } }) : null;
    if (!employee) throw new ConflictException('This class has no tutor with a user account, so it cannot be tracked.');
    return db.mentoringClassSession.create({
      data: {
        activationId: o.activationId, assignmentId: o.assignmentId, subjectId: o.subjectId, tutorProfileId: o.tutorProfileId, tutorUserId: employee.userId, originalDate: asDate(o.originalDate), originalStartMinute: o.originalStartMinute,
        date: asDate(o.date), startMinute: o.startMinute, endMinute: o.endMinute, status: o.moved ? 'RESCHEDULED' : 'SCHEDULED', activities: [],
      },
    });
  }

  async logEvent(db: PrismaTxClient, sessionId: string, kind: string, actorUserId: string | null, extra: { reason?: string | null; from?: string | null; to?: string | null; payload?: Record<string, unknown> } = {}) {
    await db.mentoringClassSessionEvent.create({ data: { sessionId, kind, actorUserId, reason: extra.reason ?? null, fromStatus: extra.from ?? null, toStatus: extra.to ?? null, payload: (extra.payload ?? undefined) as never } });
  }

  // ─── Building what the screen shows ────────────────────────────────────────────────────────────────────────────
  private async build(db: PrismaTxClient, bases: Array<{ occurrence: Occurrence | null; session: SessionRow | null }>, now: Date): Promise<ClassView[]> {
    if (bases.length === 0) return [];
    const working = await this.sla.workingNow(db, now);
    const sessions = bases.map((b) => b.session).filter((s): s is SessionRow => !!s);
    const sessionIds = sessions.map((s) => s.id);
    const activationIds = [...new Set(bases.map((b) => b.occurrence?.activationId ?? (b.session as SessionRow).activationId))];
    const subjectIds = [...new Set(bases.map((b) => b.occurrence?.subjectId ?? (b.session as SessionRow).subjectId))];
    const profileIds = [...new Set(bases.map((b) => b.occurrence?.tutorProfileId ?? (b.session as SessionRow).tutorProfileId))];
    const [reminders, slaItems, activations, subjects, profiles] = await Promise.all([
      sessionIds.length ? db.mentoringReminder.findMany({ where: { entityType: ENTITY, entityId: { in: sessionIds }, status: { in: ['PREPARED', 'SENT', 'ACKNOWLEDGED'] } } }) : [],
      sessionIds.length ? db.mentoringSlaItem.findMany({ where: { entityType: ENTITY, entityId: { in: sessionIds } } }) : [],
      db.mentoringActivation.findMany({ where: { id: { in: activationIds } } }),
      db.subject.findMany({ where: { id: { in: subjectIds } } }),
      db.tutorProfile.findMany({ where: { id: { in: profileIds } } }),
    ]);
    const [attachments, activityRows] = await Promise.all([
      sessionIds.length ? db.mentoringClassAttachment.findMany({ where: { sessionId: { in: sessionIds }, supersededAt: null } }) : [],
      sessionIds.length ? db.mentoringClassActivity.findMany({ where: { sessionId: { in: sessionIds }, removedAt: null } }) : [],
    ]);
    const [students, employees] = await Promise.all([db.student.findMany({ where: { id: { in: activations.map((a) => a.studentId) } } }), db.employee.findMany({ where: { id: { in: profiles.map((p) => p.employeeId) } } })]);
    const studentName = (activationId: string) => {
      const a = activations.find((x) => x.id === activationId);
      const s = students.find((x) => x.id === a?.studentId);
      return s ? `${s.firstName} ${s.lastName ?? ''}`.trim() : 'Student';
    };
    const tutorName = (profileId: string) => {
      const p = profiles.find((x) => x.id === profileId);
      const e = employees.find((x) => x.id === p?.employeeId);
      return e ? `${e.firstName} ${e.lastName}`.trim() : 'Tutor';
    };
    const slaView = async (item: { policyKey: string; dueAt: Date; startedAt: Date; status: string; firstResponseAt: Date | null; completedAt: Date | null; targetMinutes: number }) => {
      const { slaView: compute } = await import('./mentoring-sla');
      const { DEFAULT_POLICIES } = await import('./mentoring-sla');
      const policy = DEFAULT_POLICIES[item.policyKey] ?? DEFAULT_POLICIES.CLASS_UPDATE_REVIEW;
      return compute({ status: item.status as 'OPEN' | 'COMPLETED' | 'CANCELLED', startedAt: item.startedAt, dueAt: item.dueAt, firstResponseAt: item.firstResponseAt, completedAt: item.completedAt }, { ...policy, targetMinutes: item.targetMinutes }, working, now);
    };

    const out: ClassView[] = [];
    for (const b of bases) {
      const s = b.session;
      const base = b.occurrence ?? { key: '', activationId: (s as SessionRow).activationId, subjectId: (s as SessionRow).subjectId, tutorProfileId: (s as SessionRow).tutorProfileId, date: dayOf((s as SessionRow).date) as string, startMinute: (s as SessionRow).startMinute, endMinute: (s as SessionRow).endMinute, moved: false };
      const key = b.occurrence?.key ?? `${(s as SessionRow).assignmentId}~${dayOf((s as SessionRow).originalDate)}~${(s as SessionRow).originalStartMinute}`;
      const date = s ? (dayOf(s.date) as string) : base.date;
      const startMinute = s ? s.startMinute : base.startMinute;
      const endMinute = s ? s.endMinute : base.endMinute;
      const status = (s?.status ?? (base.moved ? 'RESCHEDULED' : 'SCHEDULED'));
      const reminder = s ? reminders.find((r) => r.entityId === s.id && r.kind === slotKind(dayOf(s.date) as string, s.startMinute)) ?? null : null;
      const item = s ? slaItems.filter((i) => i.entityId === s.id).sort((x, y) => y.startedAt.getTime() - x.startedAt.getTime())[0] ?? null : null;
      const state = displayState({ status, date, endMinute }, (reminder?.status as ReminderState) ?? null, now, working);
      const sla = item && item.status === 'OPEN' ? await slaView(item) : null;
      const att = s ? attachments.find((x) => x.sessionId === s.id) ?? null : null;
      const acts = s ? activityRows.filter((x) => x.sessionId === s.id) : [];
      const workspace = { voiceUploaded: !!att, voiceShared: !!att?.sharedAt, activitiesCreated: acts.length, activitiesShared: acts.filter((x) => x.sharedAt).length, exceptionStatus: s?.exceptionStatus ?? null };
      const blockers = s && s.tutorSubmittedAt && s.conducted === true && status === 'AWAITING_MENTOR_VERIFICATION'
        ? verificationBlockers({ conducted: s.conducted, tutorSubmitted: true, voiceUploaded: workspace.voiceUploaded, voiceShared: workspace.voiceShared, activitiesCreated: workspace.activitiesCreated, activitiesShared: workspace.activitiesShared, exceptionApproved: s.exceptionStatus === 'APPROVED' })
        : [];
      out.push({
        key, sessionId: s?.id ?? null, activationId: base.activationId, studentName: studentName(base.activationId), subjectId: base.subjectId, subjectName: subjects.find((x) => x.id === base.subjectId)?.name ?? 'Subject',
        tutorProfileId: base.tutorProfileId, tutorName: tutorName(base.tutorProfileId), date, startMinute, endMinute, scheduledMinutes: endMinute - startMinute, moved: b.occurrence?.moved ?? false,
        status, state, stateLabel: STATE_LABELS[state],
        reminder: reminder ? { status: reminder.status as ReminderState, sentAt: reminder.sentAt?.toISOString() ?? null, acknowledgedAt: reminder.acknowledgedAt?.toISOString() ?? null } : null,
        tutorConfirmation: reminder?.status === 'ACKNOWLEDGED' ? 'ACKNOWLEDGED' : reminder?.status === 'SENT' ? 'SENT' : 'NOT_SENT',
        mentorVerification: status === 'VERIFIED' ? 'VERIFIED' : status === 'NOT_CONDUCTED' ? 'NOT_CONDUCTED' : 'PENDING',
        update: s && s.tutorSubmittedAt ? this.updateView(s) : null,
        checklist: checklistOf(
          s ? { ...s, workspace } : { tutorSubmittedAt: null, voiceSentAt: null, voiceReceivedAt: null, activities: [], evaluationRemarks: null, coveredRemarks: null, status, workspace },
          { status: (reminder?.status as ReminderState) ?? null, sentAt: reminder?.sentAt ?? null, acknowledgedAt: reminder?.acknowledgedAt ?? null },
        ),
        mentorRemarks: s?.mentorRemarks ?? null,
        returned: s?.returnedReason ? { reason: s.returnedReason, kind: s.returnedKind ?? 'CORRECTION' } : null,
        verified: s?.verifiedAt && s.verifiedMinutes !== null ? { at: s.verifiedAt.toISOString(), minutes: s.verifiedMinutes } : null,
        sla: sla ? { state: sla.state, label: sla.label, dueAt: item?.dueAt.toISOString() ?? '', overdueMinutes: sla.overdueMinutes } : null,
        meetLink: s?.meetLink ?? null,
        cancelled: s?.cancelledAt && s.cancelReason ? { at: s.cancelledAt.toISOString(), reason: s.cancelReason } : null,
        voice: { uploaded: !!att, shared: !!att?.sharedAt, sharedAt: att?.sharedAt?.toISOString() ?? null, attachmentId: att?.id ?? null, fileName: att?.fileName ?? null, uploadedAt: att?.createdAt.toISOString() ?? null, mentorVerifiedAt: att?.mentorVerifiedAt?.toISOString() ?? null },
        activityCounts: { created: acts.length, shared: workspace.activitiesShared, completed: acts.filter((x) => x.completion === 'COMPLETED').length },
        exception: { status: s?.exceptionStatus ?? null, reason: s?.exceptionReason ?? null, decisionNote: s?.exceptionDecisionNote ?? null },
        consumption: status === 'VERIFIED' && (s?.verifiedMinutes ?? 0) > 0 ? 'CONSUMED' : 'NOT_CONSUMED',
        blockers,
      });
    }
    return out;
  }

  private updateView(s: SessionRow): UpdateView {
    return {
      conducted: s.conducted, actualStartMinute: s.actualStartMinute, actualEndMinute: s.actualEndMinute, actualMinutes: s.actualMinutes, subjectCovered: s.subjectCovered, topicsCovered: s.topicsCovered,
      attendance: s.attendance, participation: s.participation, classNotes: s.classNotes, notConductedReason: s.notConductedReason, activities: s.activities, otherActivity: s.otherActivity,
      evaluationRemarks: s.evaluationRemarks, coveredRemarks: s.coveredRemarks, voice: { sentAt: s.voiceSentAt?.toISOString() ?? null, receivedAt: s.voiceReceivedAt?.toISOString() ?? null, remarks: s.voiceRemarks },
      submittedAt: s.tutorSubmittedAt?.toISOString() ?? null,
    };
  }

  /** Classes for the given dates, joined with whatever has happened to each. Classes already stored but no longer produced by a rule are kept. */
  private async classesFor(db: PrismaTxClient, where: Record<string, unknown>, sessionWhere: Record<string, unknown>, from: string, to: string, now: Date): Promise<ClassView[]> {
    const occ = await this.occurrences(db, where, from, to);
    const stored = await db.mentoringClassSession.findMany({ where: { ...sessionWhere, date: { gte: asDate(from), lte: asDate(to) } } });
    const byKey = new Map<string, SessionRow>();
    for (const s of stored) byKey.set(`${s.assignmentId}~${dayOf(s.originalDate)}~${s.originalStartMinute}`, s);
    const used = new Set<string>();
    const bases: Array<{ occurrence: Occurrence | null; session: SessionRow | null }> = occ.map((o) => {
      const s = byKey.get(o.key) ?? null;
      if (s) used.add(o.key);
      return { occurrence: o, session: s };
    });
    // A stored class of a student who is not eligible any more stays as history, but a class that was only scheduled is not operational.
    const eligibleNow = await this.eligibleActivationIds(db, [...new Set([...byKey.values()].map((s) => s.activationId))]);
    for (const [k, s] of byKey) if (!used.has(k) && (eligibleNow.has(s.activationId) || !OPEN_CLASS_STATUSES.has(s.status))) bases.push({ occurrence: null, session: s });
    const list = await this.build(db, bases, now);
    return list.sort((a, b) => a.date.localeCompare(b.date) || a.startMinute - b.startMinute || a.studentName.localeCompare(b.studentName));
  }

  private checkRange(from: string, to: string) {
    if (!isDateString(from) || !isDateString(to)) throw new BadRequestException('Choose real dates, written like 2026-11-09.');
    if (to < from) throw new BadRequestException('The end date cannot be before the start date.');
    let days = 0;
    for (let d = from; d <= to && days <= MAX_RANGE_DAYS; d = addDays(d, 1)) days++;
    if (days > MAX_RANGE_DAYS) throw new BadRequestException(`Choose no more than ${MAX_RANGE_DAYS} days at a time.`);
  }

  private applyFilters(list: ClassView[], f: ClassFilters): ClassView[] {
    return list.filter((c) => (!f.subjectId || c.subjectId === f.subjectId) && (!f.tutorProfileId || c.tutorProfileId === f.tutorProfileId) && (!f.status || c.status === f.status) && (!f.state || c.state === f.state));
  }

  // ─── The Mentor's daily dashboard ──────────────────────────────────────────────────────────────────────────────
  /** One student's classes for a date, from the tutor assignments. Filters run here, not on the page. */
  async daily(activationId: string, date: string, filters: ClassFilters, scope: MentoringScope, now: Date = new Date()) {
    this.checkRange(date, date);
    const activation = await this.db.mentoringActivation.findFirst({ where: { AND: [{ id: activationId }, this.access.visibilityWhere(scope)] }, include: { student: true } });
    if (!activation) throw new NotFoundException('Student not found');
    const all = await this.classesFor(this.db, { activationId }, { activationId }, date, date, now);
    const classes = this.applyFilters(all, filters);
    const counts: Record<string, number> = {};
    for (const c of all) counts[c.state] = (counts[c.state] ?? 0) + 1;
    return { date, student: { id: activation.studentId, name: `${activation.student.firstName} ${activation.student.lastName ?? ''}`.trim() }, classes, counts, canWork: activation.currentMentorUserId === scope.userId && scope.perms.has('mentoring.stage.work') };
  }

  /** Classes for a date range across the caller's students (or the given ones), from the tutor assignments. Used by the dashboard. */
  async range(scope: MentoringScope, from: string, to: string, activationIds: string[] | null, filters: ClassFilters = {}, now: Date = new Date()) {
    this.access.requireAnyScope(scope);
    this.checkRange(from, to);
    const visible = scope.all ? null : (await this.db.mentoringActivation.findMany({ where: this.access.visibilityWhere(scope) })).map((a) => a.id);
    const ids = activationIds === null ? visible : visible === null ? activationIds : activationIds.filter((i) => visible.includes(i));
    if (ids !== null && ids.length === 0) return [];
    const where = ids === null ? {} : { activationId: { in: ids } };
    return this.applyFilters(await this.classesFor(this.db, where, where, from, to, now), filters);
  }

  /** Stored classes across the caller's students, for the Mentor's review queue: by status, tutor, subject, student and dates. */
  async queue(scope: MentoringScope, filters: ClassFilters = {}, now: Date = new Date()) {
    this.access.requireAnyScope(scope);
    for (const d of [filters.from, filters.to]) if (d !== undefined && !isDateString(d)) throw new BadRequestException('Choose real dates, written like 2026-11-09.');
    const where: Record<string, unknown> = {};
    if (filters.activationId) {
      if (!(await this.db.mentoringActivation.findFirst({ where: { AND: [{ id: filters.activationId }, this.access.visibilityWhere(scope)] } }))) throw new NotFoundException('Student not found');
      where.activationId = filters.activationId;
    } else if (!scope.all) where.activationId = { in: (await this.db.mentoringActivation.findMany({ where: this.access.visibilityWhere(scope) })).map((a) => a.id) };
    if (filters.subjectId) where.subjectId = filters.subjectId;
    if (filters.tutorProfileId) where.tutorProfileId = filters.tutorProfileId;
    where.status = filters.status ? filters.status : { in: ['AWAITING_MENTOR_VERIFICATION', 'RETURNED_FOR_CORRECTION'] };
    if (filters.from || filters.to) where.date = { ...(filters.from ? { gte: asDate(filters.from) } : {}), ...(filters.to ? { lte: asDate(filters.to) } : {}) };
    const limit = Math.min(200, Math.max(1, Number(filters.limit ?? 100) || 100));
    const rows = (await this.db.mentoringClassSession.findMany({ where, orderBy: { date: 'asc' } })).slice(0, limit);
    const list = await this.build(this.db, rows.map((r) => ({ occurrence: null, session: r })), now);
    return filters.state ? list.filter((c) => c.state === filters.state) : list;
  }

  /** One class in full for the Mentor to review: the update, the checklist, the warnings and its history. */
  async detail(sessionId: string, scope: MentoringScope, now: Date = new Date()) {
    this.access.requireAnyScope(scope);
    const row = await this.db.mentoringClassSession.findUnique({ where: { id: sessionId } });
    if (!row || !(await this.db.mentoringActivation.findFirst({ where: { AND: [{ id: row.activationId }, this.access.visibilityWhere(scope)] } }))) throw new NotFoundException('Class not found');
    const [view] = await this.build(this.db, [{ occurrence: null, session: row }], now);
    const events = (await this.db.mentoringClassSessionEvent.findMany({ where: { sessionId } })).sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
    const adjustments = await this.db.mentoringClassCompensationAdjustment.findMany({ where: { sessionId } });
    const rate = await this.rateAt(this.db, row.tutorProfileId, zonedInstant(dayOf(row.date) as string, row.startMinute, (await this.sla.workingNow(this.db, now)).timeZone));
    return {
      ...view,
      warnings: view.status === 'AWAITING_MENTOR_VERIFICATION' ? verificationWarnings(row, rate !== null) : [],
      history: events.map((e) => ({ kind: e.kind, at: e.createdAt.toISOString(), actorUserId: e.actorUserId, reason: e.reason, from: e.fromStatus, to: e.toStatus })),
      adjustments: adjustments.map((a) => ({ at: a.createdAt.toISOString(), previousMinutes: a.previousMinutes, newMinutes: a.newMinutes, deltaMinutes: a.deltaMinutes, reason: a.reason, appliedToRecord: a.appliedToRecord })),
    };
  }

  // ─── Guards ────────────────────────────────────────────────────────────────────────────────────────────────────
  async mentorGuard(tx: PrismaTxClient, activationId: string, userId: string) {
    const activation = await loadLockedActivation(tx, activationId);
    MentoringAllocationService.assertAssignedMentor(activation, userId);
    this.requireEligible(activation);
    return activation;
  }

  /** Classes are operational only for an Active student with an approved timetable. History is never touched by this. */
  requireEligible(activation: { status: string; stages?: Array<{ stageNumber: number; status: string }> }) {
    const e = classEligibility(activation, activation.stages ?? []);
    if (!e.eligible) throw new ConflictException(ineligibleMessage(e.reason as EligibilityReason, 'classes'));
  }

  /** The activations whose classes are operational now. Everything else is not generated, listed or reminded. */
  async eligibleActivationIds(db: PrismaTxClient, ids: string[]): Promise<Set<string>> {
    if (ids.length === 0) return new Set();
    const [activations, stages] = await Promise.all([
      db.mentoringActivation.findMany({ where: { id: { in: ids } } }),
      db.mentoringStage.findMany({ where: { activationId: { in: ids }, stageNumber: TIMETABLE_STAGE } }),
    ]);
    return new Set(activations.filter((a) => classEligibility(a, stages.filter((s) => s.activationId === a.id)).eligible).map((a) => a.id));
  }

  private async rateAt(db: PrismaTxClient, tutorProfileId: string, at: Date): Promise<{ id: string; hourlyRate: number; currency: string } | null> {
    const rates = await db.tutorRate.findMany({ where: { tutorProfileId } });
    const match = rates.sort((a, b) => b.effectiveFrom.getTime() - a.effectiveFrom.getTime()).find((r) => r.effectiveFrom <= at && (!r.effectiveTo || r.effectiveTo > at));
    return match ? { id: match.id, hourlyRate: Number(match.hourlyRate), currency: match.currency } : null;
  }

  /** How many things have happened to this class. It keeps notification keys apart without depending on the clock. */
  async seq(tx: PrismaTxClient, sessionId: string) {
    return (await tx.mentoringClassSessionEvent.findMany({ where: { sessionId } })).length;
  }

  notify(tx: PrismaTxClient, recipientUserId: string, type: string, sessionId: string, message: string, dedupe: string, action: string) {
    return tx.notification.create({ data: { recipientUserId, type, entityType: ENTITY, entityId: sessionId, action, message, dedupeKey: dedupe } });
  }

  // ─── Reminders (the Mentor) ────────────────────────────────────────────────────────────────────────────────────
  private async classMessage(tx: PrismaTxClient, o: Occurrence, session: SessionRow) {
    const [subject, activation] = await Promise.all([tx.subject.findUnique({ where: { id: o.subjectId } }), tx.mentoringActivation.findUnique({ where: { id: o.activationId } })]);
    const student = activation ? await tx.student.findUnique({ where: { id: activation.studentId } }) : null;
    const { formatRange } = await import('../tutor/tutor-availability');
    return `Class reminder: ${subject?.name ?? 'Class'} with ${student ? `${student.firstName} ${student.lastName ?? ''}`.trim() : 'your student'} on ${dayOf(session.date)}, ${formatRange(session.startMinute, session.endMinute)}.`;
  }

  /** Prepares the tutor reminder for a class. Nothing is delivered yet. */
  async prepareReminder(key: string, userId: string) {
    return this.prisma.$transaction(async (tx: PrismaTxClient) => {
      const o = await this.occurrenceForKey(tx, key);
      await this.mentorGuard(tx, o.activationId, userId);
      const session = await this.ensureSession(tx, o);
      if (!CAN_REMIND.includes(session.status)) throw new ConflictException('A reminder is only for a class that has not been reported yet.');
      const reminder = await this.reminders.prepare(tx, { kind: slotKind(dayOf(session.date) as string, session.startMinute), entityType: ENTITY, entityId: session.id, activationId: o.activationId, recipientUserId: session.tutorUserId, message: await this.classMessage(tx, o, session) }, userId);
      await this.logEvent(tx, session.id, 'REMINDER_PREPARED', userId, { payload: { reminderId: reminder.id } });
      return { sessionId: session.id, reminderId: reminder.id, status: reminder.status };
    });
  }

  /**
   * The automatic reminder for one class: prepared by the system for 45 minutes before the class starts, for the tutor.
   * Safe to call again: the reminder is keyed by the class slot, so it is prepared once. A reminder that a Mentor prepared by hand
   * (with no time) is given its time, so it goes out automatically as well. A class created less than the lead time before it starts
   * is reminded at once, once. A class that has started or has been reported gets none.
   */
  async prepareAutomaticReminder(tx: PrismaTxClient, o: Occurrence, now: Date, actor: string): Promise<{ reminderId: string; scheduledFor: Date; late: boolean } | null> {
    const session = await this.ensureSession(tx, o);
    if (!CAN_REMIND.includes(session.status)) return null;
    const tz = (await this.sla.workingNow(tx, now)).timeZone;
    const start = zonedInstant(dayOf(session.date) as string, session.startMinute, tz);
    if (now.getTime() >= start.getTime()) return null;
    const lead = new Date(start.getTime() - CLASS_REMINDER_LEAD_MINUTES * 60_000);
    const late = lead.getTime() < now.getTime();
    const scheduledFor = late ? now : lead;
    let reminder = await this.reminders.prepare(tx, { kind: slotKind(dayOf(session.date) as string, session.startMinute), entityType: ENTITY, entityId: session.id, activationId: o.activationId, recipientUserId: session.tutorUserId, message: await this.classMessage(tx, o, session), scheduledFor }, actor);
    if (reminder.status === 'PREPARED' && !reminder.scheduledFor) reminder = await tx.mentoringReminder.update({ where: { id: reminder.id }, data: { scheduledFor } });
    return { reminderId: reminder.id, scheduledFor: reminder.scheduledFor ?? scheduledFor, late };
  }

  /** Every class in the dates, for the students who are eligible now. Used by the reminder job; nothing is stored. */
  eligibleOccurrences(db: PrismaTxClient, from: string, to: string): Promise<Occurrence[]> {
    return this.occurrences(db, {}, from, to);
  }

  /** Sends the tutor reminder as an in-app notification. It counts as sent only once that notification exists. */
  async sendReminder(key: string, userId: string, now: Date = new Date()) {
    return this.prisma.$transaction(async (tx: PrismaTxClient) => {
      const o = await this.occurrenceForKey(tx, key);
      await this.mentorGuard(tx, o.activationId, userId);
      const session = await this.ensureSession(tx, o);
      if (!CAN_REMIND.includes(session.status)) throw new ConflictException('A reminder is only for a class that has not been reported yet.');
      const prepared = await this.reminders.prepare(tx, { kind: slotKind(dayOf(session.date) as string, session.startMinute), entityType: ENTITY, entityId: session.id, activationId: o.activationId, recipientUserId: session.tutorUserId, message: await this.classMessage(tx, o, session) }, userId);
      const sent = await this.reminders.send(tx, prepared.id, userId, '/tutor-portal', now);
      await this.logEvent(tx, session.id, 'REMINDER_SENT', userId, { payload: { reminderId: sent.id, notificationId: sent.notificationId } });
      return { sessionId: session.id, reminderId: sent.id, status: sent.status, deliveryEvidence: sent.notificationId };
    });
  }

  // ─── The tutor ─────────────────────────────────────────────────────────────────────────────────────────────────
  async tutorProfileOf(db: PrismaTxClient, userId: string) {
    const employee = await db.employee.findUnique({ where: { userId } });
    const profile = employee ? await db.tutorProfile.findUnique({ where: { employeeId: employee.id } }) : null;
    if (!profile) throw new NotFoundException('You do not have a tutor profile.');
    return profile;
  }

  /** The signed-in tutor's own classes, with what has happened to each. */
  async tutorClasses(userId: string, from: string, to: string, now: Date = new Date()): Promise<ClassView[]> {
    this.checkRange(from, to);
    const profile = await this.tutorProfileOf(this.db, userId);
    const list = await this.classesFor(this.db, { tutorProfileId: profile.id }, { tutorUserId: userId }, from, to, now);
    return list.map((c) => ({ ...c, sla: null }));
  }

  /** The tutor submits the class update. It goes to the Mentor; the class is not complete until the Mentor verifies it. */
  async tutorSubmitUpdate(userId: string, key: string, body: unknown, now: Date = new Date()) {
    return this.prisma.$transaction(async (tx: PrismaTxClient) => {
      const o = await this.occurrenceForKey(tx, key);
      const profile = await this.tutorProfileOf(tx, userId);
      if (o.tutorProfileId !== profile.id) throw new ForbiddenException('This class is not yours.');
      const activation = await loadLockedActivation(tx, o.activationId);
      this.requireEligible(activation);
      const session = await this.ensureSession(tx, o);
      if (session.tutorUserId !== userId) throw new ForbiddenException('This class is not yours.');
      if (session.status === 'CANCELLED') throw new ConflictException('This class was cancelled, so it cannot be updated.');
      if (!TUTOR_CAN_UPDATE.includes(session.status)) throw new ConflictException('This class has already been verified, so it cannot be changed here.');
      const working = await this.sla.workingNow(tx, now);
      if ((dayOf(session.date) as string) > localMomentOf(now, working.timeZone).date) throw new ConflictException('This class has not happened yet.');
      const subject = await tx.subject.findUnique({ where: { id: session.subjectId } });
      const checked = checkTutorUpdate(body, { subjectName: subject?.name ?? 'the subject' });
      if (!checked.ok) throw new BadRequestException(checked.message);
      const v = checked.value;
      const previous = session.status;
      const returned = previous === 'RETURNED_FOR_CORRECTION';
      await tx.mentoringClassSession.update({
        where: { id: session.id },
        data: {
          conducted: v.conducted, actualStartMinute: v.actualStartMinute, actualEndMinute: v.actualEndMinute, actualMinutes: v.actualMinutes, subjectCovered: v.subjectCovered, topicsCovered: v.topicsCovered,
          attendance: v.attendance, participation: v.participation, classNotes: v.classNotes, notConductedReason: v.notConductedReason, activities: v.activities, otherActivity: v.otherActivity,
          evaluationRemarks: v.evaluationRemarks, coveredRemarks: v.coveredRemarks, voiceSentAt: v.voiceSent ? session.voiceSentAt ?? now : session.voiceSentAt, tutorSubmittedAt: now, tutorSubmittedByUserId: userId,
          status: 'AWAITING_MENTOR_VERIFICATION', returnedReason: null, returnedKind: null,
        },
      });
      // The Mentor now has two working hours: to review a new update, or to act on one the tutor has corrected.
      if (returned && (session.conducted !== v.conducted || session.actualStartMinute !== v.actualStartMinute || session.actualEndMinute !== v.actualEndMinute)) await this.invalidateException(tx, session, userId, 'The corrected update changed whether or when the class took place.');
      await this.sla.start(tx, { policyKey: returned ? 'RETURNED_UPDATE_ACTION' : 'CLASS_UPDATE_REVIEW', entityType: ENTITY, entityId: session.id, activationId: o.activationId, startedAt: now });
      await this.logEvent(tx, session.id, returned ? 'TUTOR_RESUBMITTED' : 'TUTOR_SUBMITTED', userId, { from: previous, to: 'AWAITING_MENTOR_VERIFICATION', payload: { conducted: v.conducted, actualMinutes: v.actualMinutes } });
      if (activation.currentMentorUserId) await this.notify(tx, activation.currentMentorUserId, 'MENTORING_CLASS_UPDATE', session.id, `A class update is waiting for your review: ${subject?.name ?? 'class'} on ${dayOf(session.date)}.`, `class-update:${session.id}:${await this.seq(tx, session.id)}`, `/mentoring/students/${o.activationId}`);
      await this.history.record(tx, { activationId: o.activationId, type: 'MENTORING_CLASS_UPDATE_SUBMITTED', actorUserId: userId, payload: { sessionId: session.id, conducted: v.conducted } });
      return { sessionId: session.id, status: 'AWAITING_MENTOR_VERIFICATION' as const };
    });
  }

  /**
   * An exception decided on an update that has since been returned or changed no longer applies. The class goes back to having no
   * exception, so a new request and a new decision by the Mentoring Head are needed. What was asked and decided stays in the class
   * events and the student history; only the live status is cleared.
   */
  async invalidateException(tx: PrismaTxClient, session: SessionRow, actorUserId: string, why: string) {
    if (session.exceptionStatus !== 'APPROVED' && session.exceptionStatus !== 'REQUESTED') return false;
    await tx.mentoringClassSession.update({ where: { id: session.id }, data: { exceptionStatus: null, exceptionRequestedAt: null, exceptionRequestedByUserId: null, exceptionReason: null, exceptionDecidedAt: null, exceptionDecidedByUserId: null, exceptionDecisionNote: null } });
    await this.logEvent(tx, session.id, 'EXCEPTION_INVALIDATED', actorUserId, { reason: why, payload: { was: session.exceptionStatus, requestedBy: session.exceptionRequestedByUserId, requestReason: session.exceptionReason, decidedBy: session.exceptionDecidedByUserId, decisionNote: session.exceptionDecisionNote } });
    await this.history.record(tx, { activationId: session.activationId, type: 'MENTORING_CLASS_EXCEPTION_INVALIDATED', actorUserId, reason: why, payload: { sessionId: session.id, was: session.exceptionStatus } });
    return true;
  }

  // ─── The Mentor reviews ────────────────────────────────────────────────────────────────────────────────────────
  async sessionForMentor(tx: PrismaTxClient, sessionId: string, userId: string) {
    const found = await tx.mentoringClassSession.findUnique({ where: { id: sessionId } });
    if (!found) throw new NotFoundException('Class not found');
    const activation = await this.mentorGuard(tx, found.activationId, userId);
    const session = (await tx.mentoringClassSession.findUnique({ where: { id: sessionId } })) as SessionRow;
    return { session, activation };
  }

  /** Remarks, the voice update arriving, and activities and remarks the tutor left out. Nothing here verifies the class. */
  async mentorNotes(sessionId: string, body: unknown, userId: string, now: Date = new Date()) {
    return this.prisma.$transaction(async (tx: PrismaTxClient) => {
      const { session } = await this.sessionForMentor(tx, sessionId, userId);
      const checked = checkMentorNotes(body);
      if (!checked.ok) throw new BadRequestException(checked.message);
      const n = checked.value;
      const closed = session.status === 'VERIFIED' || session.status === 'NOT_CONDUCTED' || session.status === 'CANCELLED';
      if (closed && (n.activities !== undefined || n.evaluationRemarks !== undefined || n.coveredRemarks !== undefined)) throw new ConflictException('This class is verified. Only the Mentor remarks and the voice update can be added now.');
      const data: Record<string, unknown> = {};
      if (n.mentorRemarks !== undefined) data.mentorRemarks = n.mentorRemarks || null;
      if (n.voiceRemarks !== undefined) data.voiceRemarks = n.voiceRemarks || null;
      if (n.voiceReceived !== undefined) Object.assign(data, n.voiceReceived ? { voiceReceivedAt: session.voiceReceivedAt ?? now, voiceReceivedByUserId: userId } : { voiceReceivedAt: null, voiceReceivedByUserId: null });
      if (n.activities !== undefined) Object.assign(data, { activities: n.activities, otherActivity: n.otherActivity ?? null });
      if (n.evaluationRemarks !== undefined) data.evaluationRemarks = n.evaluationRemarks || null;
      if (n.coveredRemarks !== undefined) data.coveredRemarks = n.coveredRemarks || null;
      await tx.mentoringClassSession.update({ where: { id: sessionId }, data });
      await this.logEvent(tx, sessionId, 'MENTOR_NOTES', userId, { payload: { changed: Object.keys(n) } });
      return { sessionId, changed: Object.keys(n) };
    });
  }

  /** Sends the update back for correction, or marks it incomplete. Both need a reason, and the class stays unverified. */
  async returnToTutor(sessionId: string, reason: unknown, kind: 'CORRECTION' | 'INCOMPLETE', userId: string, now: Date = new Date()) {
    return this.prisma.$transaction(async (tx: PrismaTxClient) => {
      const { session, activation } = await this.sessionForMentor(tx, sessionId, userId);
      return this.applyReturn(tx, session, activation, reason, kind, userId, now, false);
    });
  }

  /**
   * The Mentoring Head sends an update back for correction on any student's class they can see, with a reason. It needs the
   * correction permission (held by nobody until it is granted) and department-wide access. Everything else is as when the Mentor does it,
   * and the record says it was the Head.
   */
  async returnToTutorAsHead(sessionId: string, reason: unknown, kind: 'CORRECTION' | 'INCOMPLETE', scope: MentoringScope, now: Date = new Date()) {
    if (!scope.perms.has('mentoring.record.correct') || !scope.all) throw new ForbiddenException('Only the Mentoring Head can return a record for correction.');
    return this.prisma.$transaction(async (tx: PrismaTxClient) => {
      const found = await tx.mentoringClassSession.findUnique({ where: { id: sessionId } });
      if (!found) throw new NotFoundException('Class not found');
      const activation = await loadLockedActivation(tx, found.activationId);
      if (!(await tx.mentoringActivation.findFirst({ where: { AND: [{ id: found.activationId }, this.access.visibilityWhere(scope)] } }))) throw new NotFoundException('Class not found');
      this.requireEligible(activation);
      const session = (await tx.mentoringClassSession.findUnique({ where: { id: sessionId } })) as SessionRow;
      return this.applyReturn(tx, session, activation, reason, kind, scope.userId, now, true);
    });
  }

  private async applyReturn(tx: PrismaTxClient, session: SessionRow, activation: { id: string }, reason: unknown, kind: 'CORRECTION' | 'INCOMPLETE', actorUserId: string, now: Date, byHead: boolean) {
    const sessionId = session.id;
    const fromStatus: string = session.status;
    if (!MENTOR_CAN_REVIEW.includes(session.status)) throw new ConflictException('Only an update waiting for review can be returned.');
    const why = typeof reason === 'string' ? reason.trim() : '';
    if (!why) throw new BadRequestException(kind === 'INCOMPLETE' ? 'Say what is missing from the update.' : 'Say what the tutor needs to correct.');
    if (why.length > 1000) throw new BadRequestException('The reason must be 1000 characters or fewer.');
    await tx.mentoringClassSession.update({ where: { id: sessionId }, data: { status: 'RETURNED_FOR_CORRECTION', returnedReason: why, returnedKind: kind } });
    // The update is going to change, so a decision made on the old one no longer stands.
    await this.invalidateException(tx, session, actorUserId, 'The update was returned for correction.');
    // The reviewer has acted, so the review clock stops; the tutor's correction starts the next one.
    for (const key of ['CLASS_UPDATE_REVIEW', 'RETURNED_UPDATE_ACTION']) await this.sla.complete(tx, key, ENTITY, sessionId, now);
    await this.notify(tx, session.tutorUserId, 'MENTORING_CLASS_RETURNED', sessionId, `Your class update was returned${byHead ? ' by the Mentoring Head' : ''}: ${why}`, `class-returned:${sessionId}:${await this.seq(tx, sessionId)}`, '/tutor-portal');
    await this.logEvent(tx, sessionId, kind === 'INCOMPLETE' ? 'MARKED_INCOMPLETE' : 'RETURNED_FOR_CORRECTION', actorUserId, { reason: why, from: fromStatus, to: 'RETURNED_FOR_CORRECTION', ...(byHead ? { payload: { byHead: true } } : {}) });
    await this.history.record(tx, { activationId: activation.id, type: 'MENTORING_CLASS_RETURNED', actorUserId, reason: why, payload: { sessionId, kind, ...(byHead ? { byHead: true } : {}) } });
    return { sessionId, status: 'RETURNED_FOR_CORRECTION' as const };
  }

  /**
   * Verifies the class. Only now is it complete. The confirmed minutes become a tutor class record (verified, payroll
   * ready), which the existing payroll run can pick up later. Nothing is paid, and verifying twice makes nothing twice.
   */
  async verify(sessionId: string, input: { verifiedMinutes?: unknown; reason?: unknown }, userId: string, now: Date = new Date()) {
    return this.prisma.$transaction(async (tx: PrismaTxClient) => {
      // The class row is locked first, so two verifications of one class run one after the other and the second sees the first.
      await tx.$executeRaw`SELECT 1 FROM mentoring_class_sessions WHERE id = ${sessionId} FOR UPDATE`;
      const { session, activation } = await this.sessionForMentor(tx, sessionId, userId);
      if (session.status === 'VERIFIED' || session.status === 'NOT_CONDUCTED') return { sessionId, status: session.status, classRecordId: session.tutorClassRecordId, warnings: [] as string[], alreadyVerified: true };
      if (!MENTOR_CAN_REVIEW.includes(session.status) || !session.tutorSubmittedAt) throw new ConflictException('Only a submitted update can be verified.');
      const fromStatus: string = session.status;
      const working = await this.sla.workingNow(tx, now);

      if (session.conducted === false) {
        await tx.mentoringClassSession.update({ where: { id: sessionId }, data: { status: 'NOT_CONDUCTED', verifiedAt: now, verifiedByUserId: userId, verifiedMinutes: 0 } });
        for (const key of ['CLASS_UPDATE_REVIEW', 'RETURNED_UPDATE_ACTION']) await this.sla.complete(tx, key, ENTITY, sessionId, now);
        await this.logEvent(tx, sessionId, 'CONFIRMED_NOT_CONDUCTED', userId, { from: fromStatus, to: 'NOT_CONDUCTED', reason: session.notConductedReason });
        await this.history.record(tx, { activationId: activation.id, type: 'MENTORING_CLASS_NOT_CONDUCTED', actorUserId: userId, payload: { sessionId } });
        return { sessionId, status: 'NOT_CONDUCTED' as const, classRecordId: null, warnings: [] as string[], alreadyVerified: false };
      }

      // Strict verification: the voice, the sharing and three activities are conditions, unless the Mentoring Head approved an exception.
      const facts = await this.workspaceFacts(tx, session);
      const blockers = verificationBlockers({ conducted: session.conducted, tutorSubmitted: !!session.tutorSubmittedAt, ...facts, exceptionApproved: session.exceptionStatus === 'APPROVED' });
      if (blockers.length) throw new ConflictException(`This class cannot be verified yet. ${blockers.join(' ')}`);

      const actual = session.actualMinutes ?? 0;
      let minutes = actual;
      if (input.verifiedMinutes !== undefined && input.verifiedMinutes !== null) {
        const n = input.verifiedMinutes;
        if (typeof n !== 'number' || !Number.isInteger(n) || n < 0 || n > MAX_CLASS_MINUTES) throw new BadRequestException('The verified minutes must be a whole number of minutes, from 0 to 720.');
        if (n !== actual && !(typeof input.reason === 'string' && input.reason.trim())) throw new BadRequestException('Say why the verified time differs from the time the tutor reported.');
        minutes = n;
      }
      if (minutes <= 0) throw new BadRequestException('A conducted class needs more than 0 verified minutes. If the class did not take place, confirm it as not conducted instead.');
      const date = dayOf(session.date) as string;
      const scheduledStart = zonedInstant(date, session.startMinute, working.timeZone);
      const rate = await this.rateAt(tx, session.tutorProfileId, scheduledStart);

      let classRecordId = session.tutorClassRecordId;
      if (minutes > 0 && !classRecordId) {
        const existing = await tx.tutorClassRecord.findUnique({ where: { sessionId_tutorId: { sessionId: session.id, tutorId: session.tutorUserId } } });
        if (existing) classRecordId = existing.id; // verifying again never makes a second record
        else {
          const subject = await tx.subject.findUnique({ where: { id: session.subjectId } });
          const record = await tx.tutorClassRecord.create({
            data: {
              businessId: await this.ids.nextIdInTx(tx, 'TCR'), sessionId: session.id, tutorId: session.tutorUserId, status: 'VERIFIED', cancellation: 'NOT_CANCELLED',
              scheduledStart, scheduledEnd: zonedInstant(date, session.endMinute, working.timeZone),
              actualStart: session.actualStartMinute !== null ? zonedInstant(date, session.actualStartMinute, working.timeZone) : null, actualEnd: session.actualEndMinute !== null ? zonedInstant(date, session.actualEndMinute, working.timeZone) : null,
              workedMinutes: minutes, appliedRate: rate ? String(rate.hourlyRate) : null, currency: rate?.currency ?? null, rateSubject: subject?.name ?? null, submittedAt: session.tutorSubmittedAt,
              verifiedAt: now, verifiedByUserId: userId, isPayrollReady: true,
            },
          });
          classRecordId = record.id;
          await this.logEvent(tx, sessionId, 'COMPENSATION_RECORD_CREATED', userId, { payload: { classRecordId: record.id, minutes, hourlyRate: rate?.hourlyRate ?? null, estimatedAmount: payableAmount(minutes, rate?.hourlyRate ?? null) } });
        }
      }
      await tx.mentoringClassSession.update({ where: { id: sessionId }, data: { status: 'VERIFIED', verifiedAt: now, verifiedByUserId: userId, verifiedMinutes: minutes, tutorClassRecordId: classRecordId } });
      for (const a of await tx.mentoringClassAttachment.findMany({ where: { sessionId, supersededAt: null } })) if (!a.mentorVerifiedAt) await tx.mentoringClassAttachment.update({ where: { id: a.id }, data: { mentorVerifiedAt: now, mentorVerifiedByUserId: userId } });
      for (const key of ['CLASS_UPDATE_REVIEW', 'RETURNED_UPDATE_ACTION']) await this.sla.complete(tx, key, ENTITY, sessionId, now);
      await this.logEvent(tx, sessionId, 'MENTOR_VERIFIED', userId, { from: fromStatus, to: 'VERIFIED', reason: typeof input.reason === 'string' ? input.reason.trim() || null : null, payload: { scheduledMinutes: session.endMinute - session.startMinute, actualMinutes: actual, verifiedMinutes: minutes } });
      await this.history.record(tx, { activationId: activation.id, type: 'MENTORING_CLASS_VERIFIED', actorUserId: userId, payload: { sessionId, verifiedMinutes: minutes } });
      return { sessionId, status: 'VERIFIED' as const, classRecordId, warnings: verificationWarnings(session, rate !== null), alreadyVerified: false };
    });
  }

  /**
   * Corrects the pay of a class that was already verified, or cancels it (zero minutes). Payroll history is never rewritten:
   * if a payroll run has taken the class the record stays as it was and the change is an adjustment for HR; if not, the record
   * is corrected as well. Either way a row says who, why, and by how many minutes.
   */
  async adjustVerified(sessionId: string, input: { minutes?: unknown; reason?: unknown }, userId: string) {
    return this.prisma.$transaction(async (tx: PrismaTxClient) => {
      const { session } = await this.sessionForMentor(tx, sessionId, userId);
      if (session.status !== 'VERIFIED' || session.verifiedMinutes === null) throw new ConflictException('Only a verified class can be corrected.');
      const n = input.minutes;
      if (typeof n !== 'number' || !Number.isInteger(n) || n < 0 || n > MAX_CLASS_MINUTES) throw new BadRequestException('Enter the corrected minutes as a whole number, from 0 to 720. Zero cancels the pay for this class.');
      const why = typeof input.reason === 'string' ? input.reason.trim() : '';
      if (!why) throw new BadRequestException('Say why the verified time is being corrected.');
      if (n === session.verifiedMinutes) throw new ConflictException('That is already the verified time.');
      const record = session.tutorClassRecordId ? await tx.tutorClassRecord.findUnique({ where: { id: session.tutorClassRecordId } }) : null;
      const taken = record ? await tx.tutorPayableItem.findFirst({ where: { classRecordId: record.id, payableRun: { status: { in: ['DRAFT', 'FINALIZED'] } } } }) : null;
      let applied = false;
      if (record && !taken) {
        await tx.tutorClassRecord.update({ where: { id: record.id }, data: { workedMinutes: n, isCorrected: true, correctionReason: why, isPayrollReady: n > 0 } });
        applied = true;
      }
      await tx.mentoringClassCompensationAdjustment.create({ data: { sessionId, classRecordId: record?.id ?? null, previousMinutes: session.verifiedMinutes, newMinutes: n, deltaMinutes: n - session.verifiedMinutes, reason: why, appliedToRecord: applied, createdByUserId: userId } });
      await tx.mentoringClassSession.update({ where: { id: sessionId }, data: { verifiedMinutes: n } });
      await this.logEvent(tx, sessionId, 'COMPENSATION_ADJUSTED', userId, { reason: why, payload: { previousMinutes: session.verifiedMinutes, newMinutes: n, appliedToRecord: applied } });
      return { sessionId, previousMinutes: session.verifiedMinutes, newMinutes: n, appliedToRecord: applied };
    });
  }

  /** One stored class as the screens show it. */
  async viewFor(db: PrismaTxClient, session: SessionRow, now: Date): Promise<ClassView> {
    return (await this.build(db, [{ occurrence: null, session }], now))[0];
  }

  /** What the class workspace has recorded for this class: the voice and the activities, as separate facts. */
  async workspaceFacts(tx: PrismaTxClient, session: { id: string }) {
    const att = (await tx.mentoringClassAttachment.findMany({ where: { sessionId: session.id, supersededAt: null } }))[0] ?? null;
    const acts = await tx.mentoringClassActivity.findMany({ where: { sessionId: session.id, removedAt: null } });
    return { voiceUploaded: !!att, voiceShared: !!att?.sharedAt, activitiesCreated: acts.length, activitiesShared: acts.filter((a) => a.sharedAt).length };
  }

  // ─── Cancelling a class ─────────────────────────────────────────────────────────────────────────────────────────
  /**
   * Cancels one class, with a reason. The scheduled slot and its history stay on record, the class is never consumed, the tutor is
   * told in the app, a reminder not yet sent is withdrawn, and any response clock for it stops. A reported class cannot be cancelled.
   */
  async cancel(key: string, reasonInput: unknown, userId: string, now: Date = new Date()) {
    return this.prisma.$transaction(async (tx: PrismaTxClient) => {
      const o = await this.occurrenceForKey(tx, key);
      await this.mentorGuard(tx, o.activationId, userId);
      const session = await this.ensureSession(tx, o);
      if (session.status === 'CANCELLED') throw new ConflictException('This class is already cancelled.');
      if (!CAN_RESCHEDULE.includes(session.status)) throw new ConflictException('Only a class that has not been reported yet can be cancelled.');
      const why = checkReason(reasonInput, 'the class is being cancelled');
      if (!why.ok) throw new BadRequestException(why.message);
      const from: string = session.status;
      await tx.mentoringClassSession.update({ where: { id: session.id }, data: { status: 'CANCELLED', cancelledAt: now, cancelledByUserId: userId, cancelReason: why.value } });
      for (const r of await tx.mentoringReminder.findMany({ where: { entityType: ENTITY, entityId: session.id, status: 'PREPARED' } })) await this.reminders.cancel(tx, r.id);
      for (const policy of ['CLASS_UPDATE_REVIEW', 'RETURNED_UPDATE_ACTION']) await this.sla.cancel(tx, policy, ENTITY, session.id, now);
      await this.notify(tx, session.tutorUserId, 'MENTORING_CLASS_CANCELLED', session.id, `A class on ${dayOf(session.date)} was cancelled. Reason: ${why.value}`, `class-cancelled:${session.id}:${await this.seq(tx, session.id)}`, '/tutor-portal');
      await this.logEvent(tx, session.id, 'CANCELLED', userId, { reason: why.value, from, to: 'CANCELLED', payload: { date: dayOf(session.date), startMinute: session.startMinute, endMinute: session.endMinute } });
      await this.history.record(tx, { activationId: o.activationId, type: 'MENTORING_CLASS_CANCELLED', actorUserId: userId, reason: why.value, payload: { sessionId: session.id } });
      return { sessionId: session.id, status: 'CANCELLED' as const };
    });
  }

  // ─── Moving a class ────────────────────────────────────────────────────────────────────────────────────────────
  /**
   * Moves one class to another date or time. The original slot is kept (the rule's own date and time are the key and the
   * override), the tutor's calendar and the student's own classes are checked at the new time, the tutor is told in the app,
   * and the whole move is in the class history with who asked and why. Nothing is overwritten.
   */
  async reschedule(key: string, input: { newDate?: unknown; newStart?: unknown; newEnd?: unknown; reason?: unknown }, userId: string, now: Date = new Date()) {
    return this.prisma.$transaction(async (tx: PrismaTxClient) => {
      const o = await this.occurrenceForKey(tx, key);
      await this.mentorGuard(tx, o.activationId, userId);
      const session = await this.ensureSession(tx, o);
      if (!CAN_RESCHEDULE.includes(session.status)) throw new ConflictException('Only a class that has not been reported yet can be rescheduled.');
      const fromStatus: string = session.status;
      const date = input.newDate;
      const start = typeof input.newStart === 'string' ? clockMinutes(input.newStart) : null;
      const end = typeof input.newEnd === 'string' ? clockMinutes(input.newEnd) : null;
      if (typeof date !== 'string' || !isDateString(date)) throw new BadRequestException('Choose a real new date, written like 2026-11-09.');
      if (start === null || end === null) throw new BadRequestException('Enter the new start and end time, like 16:00 and 17:00.');
      if (end <= start) throw new BadRequestException('The class must end after it starts, on the same day.');
      const why = typeof input.reason === 'string' ? input.reason.trim() : '';
      if (!why) throw new BadRequestException('Say why the class is being rescheduled.');
      if (why.length > 1000) throw new BadRequestException('The reason must be 1000 characters or fewer.');
      const current = { date: dayOf(session.date) as string, start: session.startMinute, end: session.endMinute };
      if (date === current.date && start === current.start && end === current.end) throw new ConflictException('That is the time the class already has.');
      const working = await this.sla.workingNow(tx, now);
      if (date < localMomentOf(now, working.timeZone).date) throw new ConflictException('Choose today or a later date.');

      // The tutor: free at the new time, with this class itself left out. Leave, holidays, days off, breaks and other bookings all count.
      const refs = await this.tutors.refsFor([o.tutorProfileId]);
      const calendars: Map<string, TutorCalendarInput> = refs.length ? await loadCalendars(tx, refs, { from: date, to: date, withStudentNames: false, timeZone: working.timeZone, forSubject: { activationId: o.activationId, subjectId: o.subjectId, ignoreAssignmentId: o.assignmentId } }) : new Map();
      const calendar = calendars.get(o.tutorProfileId);
      if (!calendar) throw new ConflictException("The tutor's availability could not be checked, so the class was not moved.");
      const check = checkWindow(resolveDay(calendar, date), start, end);
      if (check.status !== 'AVAILABLE') throw new ConflictException(`The tutor is not free then. ${check.reason}`);
      // The student: no other class of theirs at that time.
      const others = (await this.occurrences(tx, { activationId: o.activationId }, date, date)).filter((x) => x.key !== o.key && x.startMinute < end && start < x.endMinute);
      const storedOthers = (await tx.mentoringClassSession.findMany({ where: { activationId: o.activationId, date: asDate(date) } })).filter((x) => x.id !== session.id && x.startMinute < end && start < x.endMinute && x.status !== 'NOT_CONDUCTED');
      if (others.length > 0 || storedOthers.length > 0) throw new ConflictException('This student already has another class at that time.');

      const where = { assignmentId_date_originalStartMinute: { assignmentId: o.assignmentId, date: asDate(o.originalDate), originalStartMinute: o.originalStartMinute } };
      const existing = await tx.mentoringTutorAssignmentOverride.findUnique({ where });
      const data = { kind: 'RESCHEDULED' as const, newDate: asDate(date), newStartMinute: start, newEndMinute: end, reason: why };
      if (existing) await tx.mentoringTutorAssignmentOverride.update({ where, data });
      else await tx.mentoringTutorAssignmentOverride.create({ data: { assignmentId: o.assignmentId, date: asDate(o.originalDate), originalStartMinute: o.originalStartMinute, createdByUserId: userId, ...data } });
      await tx.mentoringClassSession.update({ where: { id: session.id }, data: { date: asDate(date), startMinute: start, endMinute: end, status: 'RESCHEDULED' } });
      // A reminder not yet sent for the old time is withdrawn. One already sent stays on record; the new time gets its own.
      const stale = await tx.mentoringReminder.findMany({ where: { entityType: ENTITY, entityId: session.id, status: 'PREPARED' } });
      for (const r of stale) await this.reminders.cancel(tx, r.id);
      const subject = await tx.subject.findUnique({ where: { id: o.subjectId } });
      const note = await this.notify(tx, session.tutorUserId, 'MENTORING_CLASS_RESCHEDULED', session.id, `Your ${subject?.name ?? 'class'} class on ${current.date} was moved to ${date}. Reason: ${why}`, `class-moved:${session.id}:${await this.seq(tx, session.id)}`, '/tutor-portal');
      await this.logEvent(tx, session.id, 'RESCHEDULED', userId, {
        reason: why, from: fromStatus, to: 'RESCHEDULED',
        payload: { from: current, to: { date, start, end }, requestedByUserId: userId, approvedByUserId: null, notification: { status: 'SENT', notificationId: note.id } },
      });
      await this.history.record(tx, { activationId: o.activationId, type: 'MENTORING_CLASS_RESCHEDULED', actorUserId: userId, reason: why, payload: { sessionId: session.id, from: current, to: { date, start, end } } });
      return { sessionId: session.id, from: current, to: { date, startMinute: start, endMinute: end }, notified: true };
    });
  }

  // ─── The tutor's completed classes and earnings ────────────────────────────────────────────────────────────────
  /** The signed-in tutor's own verified classes, what is waiting for the Mentor, and what payroll has done with them. */
  async tutorEarnings(userId: string, from: string, to: string, now: Date = new Date()) {
    this.checkRange(from, to);
    const db = this.db;
    await this.tutorProfileOf(db, userId);
    const rows = (await db.mentoringClassSession.findMany({ where: { tutorUserId: userId, date: { gte: asDate(from), lte: asDate(to) } } })).sort((a, b) => a.date.getTime() - b.date.getTime() || a.startMinute - b.startMinute);
    const working = await this.sla.workingNow(db, now);
    const [subjects, adjustments] = await Promise.all([db.subject.findMany({ where: { id: { in: [...new Set(rows.map((r) => r.subjectId))] } } }), rows.length ? db.mentoringClassCompensationAdjustment.findMany({ where: { sessionId: { in: rows.map((r) => r.id) } } }) : []]);
    const recordIds = rows.map((r) => r.tutorClassRecordId).filter((i): i is string => !!i);
    const items = recordIds.length ? await db.tutorPayableItem.findMany({ where: { classRecordId: { in: recordIds } } }) : [];
    const runs = items.length ? await db.tutorPayableRun.findMany({ where: { id: { in: items.map((i) => i.payableRunId) } } }) : [];

    const verified: Array<Record<string, unknown>> = [];
    const pending: Array<Record<string, unknown>> = [];
    let verifiedMinutes = 0;
    let pendingMinutes = 0;
    let estimate = 0;
    let withoutRate = 0;
    for (const r of rows) {
      const name = subjects.find((s) => s.id === r.subjectId)?.name ?? 'Subject';
      const base = { sessionId: r.id, date: dayOf(r.date), subject: name, scheduledMinutes: r.endMinute - r.startMinute, actualMinutes: r.actualMinutes };
      if (r.status === 'VERIFIED' && (r.verifiedMinutes ?? 0) > 0) {
        const rate = await this.rateAt(db, r.tutorProfileId, zonedInstant(dayOf(r.date) as string, r.startMinute, working.timeZone));
        const amount = payableAmount(r.verifiedMinutes as number, rate?.hourlyRate ?? null);
        const item = items.find((i) => i.classRecordId === r.tutorClassRecordId);
        const run = runs.find((x) => x.id === item?.payableRunId);
        verifiedMinutes += r.verifiedMinutes as number;
        if (amount === null) withoutRate += 1;
        else estimate += amount;
        verified.push({
          ...base, verifiedMinutes: r.verifiedMinutes, estimatedAmount: amount, currency: rate?.currency ?? null,
          payroll: item ? { period: run ? `${run.periodStart} to ${run.periodEnd}` : null, runStatus: run?.status ?? null, paymentStatus: item.paymentStatus, amount: Number(item.amount), currency: item.currency, paidAt: item.paidAt?.toISOString() ?? null } : null,
          adjustments: adjustments.filter((a) => a.sessionId === r.id).map((a) => ({ at: a.createdAt.toISOString(), deltaMinutes: a.deltaMinutes, reason: a.reason, appliedToRecord: a.appliedToRecord })),
        });
      } else if (r.status === 'AWAITING_MENTOR_VERIFICATION' || r.status === 'RETURNED_FOR_CORRECTION') {
        const minutes = r.actualMinutes ?? r.endMinute - r.startMinute;
        pendingMinutes += minutes;
        pending.push({ ...base, status: r.status, pendingMinutes: minutes });
      }
    }
    return {
      from, to, verified, pending,
      totals: { verifiedMinutes, pendingMinutes, estimatedAmount: Math.round(estimate * 100) / 100, classesWithoutRate: withoutRate },
      note: 'The amount is an estimate from the hourly rate in force on each class date. The amount that is paid comes from the payroll run.',
    };
  }
}
