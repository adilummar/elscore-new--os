import { BadRequestException, Injectable } from '@nestjs/common';

import { PrismaService, PrismaTxClient } from '../../common/prisma/prisma.service';
import { addDays, isDateString } from '../tutor/tutor-calendar';

import { MentoringAccessService, MentoringScope } from './mentoring-access.service';
import { ClassView, MentoringClassService } from './mentoring-class.service';
import { MentoringDashboardService } from './mentoring-dashboard.service';
import { localMomentOf } from './mentoring-sla';
import { MentoringSlaService } from './mentoring-sla.service';
import { STAGES } from './mentoring.constants';

const PAGE_MAX = 100;
const ACTIVE = 'ACTIVATED';
/** Open activations: everything that is neither finished nor cancelled. Kept apart from the active students on purpose. */
const ONGOING = ['AWAITING_ALLOCATION', 'ACTIVATION_IN_PROGRESS', 'ACTIVATION_ON_HOLD', 'ACTIVATION_BLOCKED', 'PENDING_FINAL_APPROVAL'] as const;
export const ACTIVATION_LABELS: Record<string, string> = {
  AWAITING_ALLOCATION: 'Waiting for a Mentor', ACTIVATION_IN_PROGRESS: 'In progress', ACTIVATION_ON_HOLD: 'On hold', ACTIVATION_BLOCKED: 'Blocked', PENDING_FINAL_APPROVAL: 'Waiting for final approval', ACTIVATED: 'Active', CANCELLED: 'Cancelled',
};
const DAY = 86_400_000;

export interface OverviewFilters { period?: string; date?: string; search?: string; mentorUserId?: string; status?: string; subjectId?: string; sort?: string; dir?: string; page?: number | string; pageSize?: number | string }

const monday = (iso: string) => addDays(iso, -((new Date(`${iso}T00:00:00Z`).getUTCDay() + 6) % 7));
const hours = (minutes: number) => Math.round((minutes / 60) * 10) / 10;

/**
 * The overview behind the Mentoring Head and Mentor dashboards. It adds no rules: classes, hours and clocks come from the class,
 * dashboard and response-time services, so these figures are the same ones the work screens show. Scope is applied in the queries, so
 * a Mentor can only ever receive their own students, and the Head receives the department.
 *
 * Hours are kept in three separate columns: scheduled (from the approved schedule), reported (what the tutor said they taught) and
 * consumed (only what the Mentor verified). A class that has not been verified is never counted as consumed.
 */
@Injectable()
export class MentoringOverviewService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: MentoringAccessService,
    private readonly classes: MentoringClassService,
    private readonly dashboard: MentoringDashboardService,
    private readonly sla: MentoringSlaService,
  ) {}

  private get db() {
    return this.prisma as unknown as PrismaTxClient;
  }

  private async base(scope: MentoringScope, f: OverviewFilters, now: Date) {
    this.access.requireAnyScope(scope);
    for (const d of [f.date]) if (d !== undefined && !isDateString(d)) throw new BadRequestException('Choose a real date, written like 2026-11-09.');
    if (f.period !== undefined && !['week', 'month'].includes(f.period)) throw new BadRequestException('Choose week or month.');
    const today = localMomentOf(now, (await this.sla.workingNow(this.db, now)).timeZone).date;
    const anchor = f.date ?? today;
    const window = f.period === 'week'
      ? { from: monday(anchor), to: addDays(monday(anchor), 6) }
      : { from: `${anchor.slice(0, 8)}01`, to: addDays(new Date(Date.UTC(Number(anchor.slice(0, 4)), Number(anchor.slice(5, 7)), 1)).toISOString().slice(0, 10), -1) };
    const activations = await this.db.mentoringActivation.findMany({ where: this.access.visibilityWhere(scope) });
    const mentorIds = [...new Set(activations.map((a) => a.currentMentorUserId).filter((u): u is string => !!u))];
    const employees = mentorIds.length ? await this.db.employee.findMany({ where: { userId: { in: mentorIds } } }) : [];
    const mentorName = (id: string | null) => {
      const e = employees.find((x) => x.userId === id);
      return e ? `${e.firstName} ${e.lastName}`.trim() : null;
    };
    const students = activations.length ? await this.db.student.findMany({ where: { id: { in: activations.map((a) => a.studentId) } } }) : [];
    const student = (a: { studentId: string }) => {
      const s = students.find((x) => x.id === a.studentId);
      return { name: s ? `${s.firstName} ${s.lastName ?? ''}`.trim() : 'Student', businessId: (s as { businessId?: string | null } | undefined)?.businessId ?? null };
    };
    return { scope, now, today, window, period: f.period ?? 'month', activations, mentorName, student };
  }

  /** The classes of every student in scope for the window, once. Everything on the page is added up from this. */
  private async classRows(b: Awaited<ReturnType<MentoringOverviewService['base']>>, ids: string[] | null = null) {
    const open = b.activations.filter((a) => a.status !== 'CANCELLED' && a.status !== 'AWAITING_ALLOCATION').map((a) => a.id);
    const use = ids === null ? (b.scope.all ? null : open) : ids.filter((i) => open.includes(i));
    if (use !== null && use.length === 0) return [] as ClassView[];
    return this.classes.range(b.scope, b.window.from, b.window.to, use, {}, b.now);
  }

  private totals(rows: ClassView[]) {
    let scheduled = 0, reported = 0, consumed = 0, remaining = 0, pendingClasses = 0;
    for (const c of rows) {
      if (c.status === 'CANCELLED') continue; // a cancelled class is neither scheduled nor consumed
      scheduled += c.scheduledMinutes;
      if (c.update?.actualMinutes) reported += c.update.actualMinutes;
      if (c.state === 'VERIFIED') consumed += c.verified?.minutes ?? 0;
      else if (c.state !== 'NOT_CONDUCTED') { remaining += c.scheduledMinutes; pendingClasses += 1; }
    }
    return { scheduledMinutes: scheduled, reportedMinutes: reported, consumedMinutes: consumed, remainingMinutes: remaining, pendingClasses };
  }

  private async pendingVerification(b: Awaited<ReturnType<MentoringOverviewService['base']>>) {
    const queue = await this.classes.queue(b.scope, { state: 'AWAITING_MENTOR_VERIFICATION' }, b.now);
    const ids = new Set(b.activations.map((a) => a.id));
    return queue.filter((q) => ids.has(q.activationId));
  }

  // ─── The summary ───────────────────────────────────────────────────────────────────────────────────────────────
  async summary(scope: MentoringScope, f: OverviewFilters = {}, now: Date = new Date()) {
    const b = await this.base(scope, f, now);
    const rows = await this.classRows(b);
    const t = this.totals(rows);
    const waiting = await this.pendingVerification(b);
    const cards = (await this.dashboard.summary(scope, {}, now)).cards;
    const n = (k: string) => cards.find((c) => c.key === k)?.count ?? 0;
    const attention = [
      { key: 'classes_awaiting_verification', label: 'Classes waiting for verification', count: waiting.length },
      { key: 'classes_awaiting_update', label: 'Tutor updates missing', count: n('classes_awaiting_update') },
      { key: 'exams_awaiting_evaluation', label: 'Exams waiting for evaluation', count: n('exams_awaiting_evaluation') + n('exams_marks_pending') },
      { key: 'meetings_overdue', label: 'Monthly meetings overdue', count: n('meetings_overdue') + n('meetings_not_conducted') },
      { key: 'plans_awaiting_date', label: 'Learning plans without a meeting date', count: n('plans_awaiting_date') },
      { key: 'complaints_new', label: 'New complaints', count: n('complaints_new') },
      { key: 'complaints_breached', label: 'Complaints past the acknowledgement target', count: n('complaints_breached') },
      { key: 'sla_breached', label: 'Response times breached', count: n('sla_breached') },
    ];
    const by = (s: string) => b.activations.filter((a) => a.status === s).length;
    return {
      role: scope.all ? ('HEAD' as const) : ('MENTOR' as const),
      today: b.today,
      window: b.window,
      period: b.period,
      summary: {
        activeStudents: by(ACTIVE),
        ongoingActivations: b.activations.filter((a) => (ONGOING as readonly string[]).includes(a.status)).length,
        ...t,
        pendingVerification: waiting.length,
        attentionTotal: attention.reduce((s, x) => s + x.count, 0),
      },
      activationByStatus: ONGOING.map((s) => ({ status: s, label: ACTIVATION_LABELS[s], count: by(s) })),
      attention: attention.filter((x) => x.count > 0),
      note: 'Scheduled hours come from the approved schedule. Reported hours are what the tutor said they taught. Consumed hours count only classes the Mentor verified.',
    };
  }

  // ─── Mentor by Mentor ──────────────────────────────────────────────────────────────────────────────────────────
  /** One row per Mentor, with their students, hours and pending work. A Mentor receives only their own row. */
  async mentors(scope: MentoringScope, f: OverviewFilters = {}, now: Date = new Date()) {
    const b = await this.base(scope, f, now);
    const rows = await this.classRows(b);
    const waiting = await this.pendingVerification(b);
    const open = await this.db.mentoringComplaint.findMany({ where: { status: { in: ['NEW', 'ACKNOWLEDGED', 'ASSIGNED', 'IN_PROGRESS', 'WAITING_FOR_PARENT', 'WAITING_FOR_TUTOR', 'REOPENED'] } } });
    const mentorOf = new Map(b.activations.map((a) => [a.id, a.currentMentorUserId]));
    const mentorIds = [...new Set(b.activations.map((a) => a.currentMentorUserId).filter((u): u is string => !!u))];
    let list = mentorIds.map((id) => {
      const mine = b.activations.filter((a) => a.currentMentorUserId === id);
      const mineIds = new Set(mine.map((a) => a.id));
      const t = this.totals(rows.filter((c) => mineIds.has(c.activationId)));
      const pendingVerification = waiting.filter((w) => mineIds.has(w.activationId)).length;
      const missingUpdates = rows.filter((c) => mineIds.has(c.activationId) && c.state === 'AWAITING_TUTOR_UPDATE').length;
      const complaints = open.filter((c) => mineIds.has(c.activationId)).length;
      return {
        mentorUserId: id, name: b.mentorName(id) ?? 'A Mentor', assignedStudents: mine.length, activeStudents: mine.filter((a) => a.status === ACTIVE).length,
        ongoingActivations: mine.filter((a) => (ONGOING as readonly string[]).includes(a.status)).length, scheduledHours: hours(t.scheduledMinutes), consumedHours: hours(t.consumedMinutes), remainingHours: hours(t.remainingMinutes),
        pendingVerification, pendingTasks: pendingVerification + missingUpdates + complaints,
      };
    });
    void mentorOf;
    const q = f.search?.trim().toLowerCase();
    if (q) list = list.filter((m) => m.name.toLowerCase().includes(q));
    const keys = ['name', 'assignedStudents', 'activeStudents', 'ongoingActivations', 'scheduledHours', 'consumedHours', 'remainingHours', 'pendingVerification', 'pendingTasks'] as const;
    const sort = (keys as readonly string[]).includes(f.sort ?? '') ? (f.sort as (typeof keys)[number]) : 'name';
    const dir = f.dir === 'desc' ? -1 : 1;
    list.sort((a, b2) => (sort === 'name' ? a.name.localeCompare(b2.name) : (a[sort]) - (b2[sort])) * dir || a.name.localeCompare(b2.name));
    return { window: b.window, ...this.page(list, f) };
  }

  // ─── Students and their hours ──────────────────────────────────────────────────────────────────────────────────
  /** One row per student: who has them, their activation, their subjects and the three kinds of hours, kept apart. */
  async students(scope: MentoringScope, f: OverviewFilters = {}, now: Date = new Date()) {
    const b = await this.base(scope, f, now);
    let acts = b.activations.filter((a) => a.status !== 'CANCELLED');
    if (f.mentorUserId) acts = acts.filter((a) => a.currentMentorUserId === f.mentorUserId);
    if (f.status) {
      if (!Object.keys(ACTIVATION_LABELS).includes(f.status)) throw new BadRequestException('Choose a real activation status.');
      acts = acts.filter((a) => a.status === f.status);
    }
    const q = f.search?.trim().toLowerCase();
    if (q) acts = acts.filter((a) => `${b.student(a).name} ${b.student(a).businessId ?? ''}`.toLowerCase().includes(q));
    const rows = await this.classRows(b, acts.map((a) => a.id));
    let list = acts.map((a) => {
      const mine = rows.filter((c) => c.activationId === a.id);
      const t = this.totals(mine);
      const s = b.student(a);
      const subjects = [...new Map(mine.map((c) => [c.subjectId, c.subjectName])).entries()].map(([id, name]) => ({ id, name }));
      return { activationId: a.id, studentName: s.name, studentId: s.businessId, mentorUserId: a.currentMentorUserId, mentorName: b.mentorName(a.currentMentorUserId), status: a.status, statusLabel: ACTIVATION_LABELS[a.status] ?? a.status, subjects, scheduledHours: hours(t.scheduledMinutes), reportedHours: hours(t.reportedMinutes), consumedHours: hours(t.consumedMinutes), remainingHours: hours(t.remainingMinutes), pendingClasses: t.pendingClasses };
    });
    if (f.subjectId) list = list.filter((s) => s.subjects.some((x) => x.id === f.subjectId));
    const keys = ['studentName', 'scheduledHours', 'consumedHours', 'remainingHours', 'pendingClasses'] as const;
    const sort = (keys as readonly string[]).includes(f.sort ?? '') ? (f.sort as (typeof keys)[number]) : 'studentName';
    const dir = f.dir === 'desc' ? -1 : 1;
    list.sort((x, y) => (sort === 'studentName' ? x.studentName.localeCompare(y.studentName) : (x[sort]) - (y[sort])) * dir || x.studentName.localeCompare(y.studentName));
    return { window: b.window, ...this.page(list, f) };
  }

  // ─── Activations still in progress ─────────────────────────────────────────────────────────────────────────────
  /** Students who are not yet active: where they are, who has them, how long they have waited and what has to happen next. */
  async activations(scope: MentoringScope, f: OverviewFilters = {}, now: Date = new Date()) {
    const b = await this.base(scope, f, now);
    let acts = b.activations.filter((a) => (ONGOING as readonly string[]).includes(a.status));
    if (f.mentorUserId) acts = acts.filter((a) => a.currentMentorUserId === f.mentorUserId);
    if (f.status) {
      if (!(ONGOING as readonly string[]).includes(f.status)) throw new BadRequestException('Choose a status of an activation that is still open.');
      acts = acts.filter((a) => a.status === f.status);
    }
    const q = f.search?.trim().toLowerCase();
    if (q) acts = acts.filter((a) => `${b.student(a).name} ${b.student(a).businessId ?? ''}`.toLowerCase().includes(q));
    const stages = acts.length ? await this.db.mentoringStage.findMany({ where: { activationId: { in: acts.map((a) => a.id) } } }) : [];
    const list = acts.map((a) => {
      const stage = STAGES.find((s) => s.number === a.currentStage);
      const st = stages.find((s) => s.activationId === a.id && s.stageNumber === a.currentStage);
      const responsible = a.status === 'PENDING_FINAL_APPROVAL' || a.status === 'AWAITING_ALLOCATION' ? 'Mentoring Head' : b.mentorName(a.currentMentorUserId) ?? 'No Mentor yet';
      const next = a.status === 'AWAITING_ALLOCATION' ? 'Assign a Mentor'
        : a.status === 'PENDING_FINAL_APPROVAL' ? 'Give final approval'
          : a.status === 'ACTIVATION_ON_HOLD' ? 'Resume the workflow'
            : a.status === 'ACTIVATION_BLOCKED' ? 'Clear what is blocking the workflow'
              : st?.status === 'PENDING_REVIEW' ? `Verify stage ${a.currentStage}, ${stage?.name ?? ''}`.trim() : `Complete stage ${a.currentStage}, ${stage?.name ?? ''}`.trim();
      const s = b.student(a);
      return {
        activationId: a.id, studentName: s.name, studentId: s.businessId, status: a.status, statusLabel: ACTIVATION_LABELS[a.status], stageNumber: a.currentStage, stageName: stage?.name ?? null,
        stageStatus: st?.status ?? null, blocked: a.status === 'ACTIVATION_BLOCKED' || a.status === 'ACTIVATION_ON_HOLD' || st?.status === 'BLOCKED', mentorName: b.mentorName(a.currentMentorUserId), responsible, nextAction: next,
        daysPending: Math.max(0, Math.floor((now.getTime() - a.createdAt.getTime()) / DAY)),
      };
    });
    list.sort((x, y) => y.daysPending - x.daysPending || x.studentName.localeCompare(y.studentName));
    return this.page(list, f);
  }

  // ─── Today ─────────────────────────────────────────────────────────────────────────────────────────────────────
  /** Today's classes in time order, each with what stage it is at and whether it counts as consumed. */
  async today(scope: MentoringScope, f: OverviewFilters = {}, now: Date = new Date()) {
    const b = await this.base(scope, f, now);
    let ids: string[] | null = null;
    if (f.mentorUserId) ids = b.activations.filter((a) => a.currentMentorUserId === f.mentorUserId).map((a) => a.id);
    const date = f.date ?? b.today;
    const rows = ids !== null && ids.length === 0 ? [] : await this.classes.range(scope, date, date, ids, {}, now);
    const byAct = new Map(b.activations.map((a) => [a.id, a]));
    const q = f.search?.trim().toLowerCase();
    const list = rows
      .filter((c) => !q || `${c.studentName} ${c.subjectName} ${c.tutorName}`.toLowerCase().includes(q))
      .map((c) => {
        const a = byAct.get(c.activationId);
        return {
          key: c.key, activationId: c.activationId, date: c.date, startMinute: c.startMinute, endMinute: c.endMinute, scheduledMinutes: c.scheduledMinutes, studentName: c.studentName, studentId: a ? b.student(a).businessId : null,
          subjectName: c.subjectName, tutorName: c.tutorName, mentorName: a ? b.mentorName(a.currentMentorUserId) : null, status: c.status, state: c.state, stateLabel: c.stateLabel,
          consumption: c.state === 'VERIFIED' ? ('CONSUMED' as const) : ('NOT_CONSUMED' as const), warning: c.sla?.state === 'BREACHED' ? 'Response time breached' : c.sla?.state === 'APPROACHING' ? 'Response time approaching' : c.state === 'RETURNED_FOR_CORRECTION' ? 'Returned for correction' : null,
        };
      });
    const counts: Record<string, number> = {};
    for (const c of list) counts[c.state] = (counts[c.state] ?? 0) + 1;
    return { date, today: b.today, counts, consumed: list.filter((c) => c.consumption === 'CONSUMED').length, ...this.page(list, f, 100) };
  }

  private page<T>(list: T[], f: OverviewFilters, defaultSize = 25) {
    const size = Math.min(PAGE_MAX, Math.max(1, Number(f.pageSize) || defaultSize));
    const p = Math.max(1, Math.floor(Number(f.page) || 1));
    return { total: list.length, page: p, pageSize: size, pages: Math.max(1, Math.ceil(list.length / size)), rows: list.slice((p - 1) * size, p * size) };
  }
}
