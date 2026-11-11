import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';

import { PrismaService, PrismaTxClient } from '../../common/prisma/prisma.service';
import { addDays, isDateString } from '../tutor/tutor-calendar';

import { classCardsOf } from './class-workspace';
import { CATEGORIES, PRIORITIES, STATUSES as COMPLAINT_STATUSES } from './complaint';
import { MentoringAccessService, MentoringScope } from './mentoring-access.service';
import { MentoringClassService } from './mentoring-class.service';
import { MentoringComplaintService } from './mentoring-complaint.service';
import { MentoringExamService } from './mentoring-exam.service';
import { localMomentOf } from './mentoring-sla';
import { MentoringSlaService } from './mentoring-sla.service';
import { MEETING_STATE_LABELS, meetingState } from './review';

const dayOf = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : null);
const PAGE_MAX = 100;

export type Group = 'students' | 'classes' | 'exams' | 'meetings' | 'complaints' | 'sla';
export type CardKey =
  | 'students_total' | 'students_active'
  | 'classes_today' | 'classes_upcoming' | 'classes_awaiting_update' | 'classes_awaiting_verification' | 'classes_verified' | 'classes_not_conducted' | 'classes_rescheduled' | 'classes_voice_pending' | 'classes_conducted' | 'classes_awaiting_activities' | 'classes_cancelled' | 'followups_open' | 'followups_overdue'
  | 'exams_upcoming' | 'exams_awaiting_evaluation' | 'exams_marks_pending' | 'exams_reexam'
  | 'meetings_upcoming' | 'meetings_pending_completion' | 'meetings_overdue' | 'meetings_not_conducted' | 'plans_awaiting_date'
  | 'complaints_new' | 'complaints_open' | 'complaints_resolved' | 'complaints_approaching' | 'complaints_breached'
  | 'sla_approaching' | 'sla_breached';

export const CARDS: ReadonlyArray<{ key: CardKey; group: Group; label: string }> = [
  { key: 'students_total', group: 'students', label: 'Assigned students' },
  { key: 'students_active', group: 'students', label: 'Active students' },
  { key: 'classes_today', group: 'classes', label: "Today's scheduled classes" },
  { key: 'classes_upcoming', group: 'classes', label: 'Upcoming classes' },
  { key: 'classes_awaiting_update', group: 'classes', label: 'Waiting for the tutor update' },
  { key: 'classes_awaiting_verification', group: 'classes', label: 'Waiting for your verification' },
  { key: 'classes_verified', group: 'classes', label: 'Classes verified and consumed' },
  { key: 'classes_not_conducted', group: 'classes', label: 'Classes not conducted' },
  { key: 'classes_rescheduled', group: 'classes', label: 'Classes rescheduled' },
  { key: 'classes_voice_pending', group: 'classes', label: 'Waiting for the voice recording' },
  { key: 'classes_conducted', group: 'classes', label: 'Classes conducted' },
  { key: 'classes_awaiting_activities', group: 'classes', label: 'Waiting for post-class activities' },
  { key: 'classes_cancelled', group: 'classes', label: 'Classes cancelled' },
  { key: 'followups_open', group: 'classes', label: 'Class follow-ups open' },
  { key: 'followups_overdue', group: 'classes', label: 'Class follow-ups overdue' },
  { key: 'exams_upcoming', group: 'exams', label: 'Upcoming exams' },
  { key: 'exams_awaiting_evaluation', group: 'exams', label: 'Exams waiting for evaluation' },
  { key: 'exams_marks_pending', group: 'exams', label: 'Exams with marks pending' },
  { key: 'exams_reexam', group: 'exams', label: 'Re-exams needed' },
  { key: 'meetings_upcoming', group: 'meetings', label: 'Upcoming monthly meetings' },
  { key: 'meetings_pending_completion', group: 'meetings', label: 'Meetings held, review not complete' },
  { key: 'meetings_overdue', group: 'meetings', label: 'Meetings overdue' },
  { key: 'meetings_not_conducted', group: 'meetings', label: 'Meetings needing a new date' },
  { key: 'plans_awaiting_date', group: 'meetings', label: 'Learning plans waiting for a meeting date' },
  { key: 'complaints_new', group: 'complaints', label: 'New complaints' },
  { key: 'complaints_open', group: 'complaints', label: 'Complaints in progress' },
  { key: 'complaints_resolved', group: 'complaints', label: 'Resolved complaints' },
  { key: 'complaints_approaching', group: 'complaints', label: 'Complaint acknowledgement approaching SLA' },
  { key: 'complaints_breached', group: 'complaints', label: 'Complaint acknowledgement breached' },
  { key: 'sla_approaching', group: 'sla', label: 'Response time approaching SLA' },
  { key: 'sla_breached', group: 'sla', label: 'Response time breached' },
];

/** What the brief asks for that the system does not record yet. Shown, never counted as zero. */
export const NOT_RECORDED = [
  { label: 'Pending post-class activities', reason: 'Post-class activities are not recorded as separate items yet.' },
  { label: 'Pending follow-ups', reason: 'Follow-ups are not recorded as separate items yet.' },
  { label: 'Classes pending documentation, by documentation status', reason: 'Documentation is tracked by the class state; there is no separate documentation status yet.' },
] as const;

export interface DashFilters {
  studentQuery?: string;
  activationId?: string;
  subjectId?: string;
  tutorProfileId?: string;
  tutorUserId?: string;
  period?: string;
  date?: string;
  from?: string;
  to?: string;
  classState?: string;
  examState?: string;
  meetingState?: string;
  complaintCategory?: string;
  complaintStatus?: string;
  priority?: string;
  slaState?: string;
}

export interface DashRow {
  id: string;
  kind: 'STUDENT' | 'CLASS' | 'TASK' | 'EXAM' | 'MEETING' | 'PLAN' | 'COMPLAINT' | 'SLA';
  activationId: string | null;
  studentName: string;
  studentId: string | null;
  title: string;
  subjectName: string | null;
  tutorName: string | null;
  date: string | null;
  status: string;
  priority: string | null;
  slaState: string | null;
  /** Where to open it: the student page and the panel that has it. */
  panel: 'checklist' | 'classes' | 'exams' | 'review' | 'complaints' | null;
}

interface Ctx {
  scope: MentoringScope;
  now: Date;
  today: string;
  ids: string[] | null;
  filters: DashFilters;
  activations: Array<{ id: string; studentId: string; status: string }>;
  names: Map<string, { name: string; businessId: string | null }>;
}

const monday = (iso: string) => {
  const d = new Date(`${iso}T00:00:00Z`);
  return addDays(iso, -((d.getUTCDay() + 6) % 7));
};

/**
 * The Mentor's one dashboard. Every number is read from the services that own the records (classes, exams, reviews, complaints and
 * response times), so the dashboard has no rules of its own, and each card opens the very records it counted. Scope and filters
 * run in the queries; the page never filters a list it was given.
 */
@Injectable()
export class MentoringDashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: MentoringAccessService,
    private readonly classes: MentoringClassService,
    private readonly exams: MentoringExamService,
    private readonly complaints: MentoringComplaintService,
    private readonly sla: MentoringSlaService,
  ) {}

  private get db() {
    return this.prisma as unknown as PrismaTxClient;
  }

  private async context(scope: MentoringScope, f: DashFilters, now: Date): Promise<Ctx> {
    this.access.requireAnyScope(scope);
    const db = this.db;
    for (const d of [f.date, f.from, f.to]) if (d !== undefined && !isDateString(d)) throw new BadRequestException('Choose real dates, written like 2026-11-09.');
    if (f.period !== undefined && !['day', 'week', 'month'].includes(f.period)) throw new BadRequestException('Choose day, week or month.');
    if (f.priority !== undefined && !(PRIORITIES as readonly string[]).includes(f.priority)) throw new BadRequestException('Choose low, normal, high or urgent.');
    if (f.complaintCategory !== undefined && !(CATEGORIES as readonly string[]).includes(f.complaintCategory)) throw new BadRequestException('Choose a real complaint category.');
    if (f.complaintStatus !== undefined && !(COMPLAINT_STATUSES as readonly string[]).includes(f.complaintStatus)) throw new BadRequestException('Choose a real complaint status.');
    const tz = (await this.sla.workingNow(db, now)).timeZone;
    const today = localMomentOf(now, tz).date;

    let activations = (await db.mentoringActivation.findMany({ where: this.access.visibilityWhere(scope) })) as Ctx['activations'];
    if (f.activationId) {
      activations = activations.filter((a) => a.id === f.activationId);
      if (activations.length === 0) throw new NotFoundException('Student not found');
    }
    const students = activations.length ? await db.student.findMany({ where: { id: { in: activations.map((a) => a.studentId) } } }) : [];
    const q = f.studentQuery?.trim().toLowerCase();
    const matches = (s: (typeof students)[number]) => !q || `${s.firstName} ${s.lastName ?? ''}`.toLowerCase().includes(q) || String((s as { businessId?: string | null }).businessId ?? '').toLowerCase().includes(q);
    const keep = new Set(students.filter(matches).map((s) => s.id));
    activations = activations.filter((a) => keep.has(a.studentId));
    const names = new Map<string, { name: string; businessId: string | null }>();
    for (const a of activations) {
      const s = students.find((x) => x.id === a.studentId);
      names.set(a.id, { name: s ? `${s.firstName} ${s.lastName ?? ''}`.trim() : 'Student', businessId: (s as { businessId?: string | null } | undefined)?.businessId ?? null });
    }
    return { scope, now, today, ids: activations.map((a) => a.id), filters: f, activations, names };
  }

  /** The date window of a filter: an explicit range, or a day, week or month around a date, or null for the card's own default. */
  private window(c: Ctx): { from: string; to: string } | null {
    const f = c.filters;
    if (f.from || f.to) return { from: f.from ?? f.to!, to: f.to ?? f.from! };
    if (!f.period) return null;
    const d = f.date ?? c.today;
    if (f.period === 'day') return { from: d, to: d };
    if (f.period === 'week') return { from: monday(d), to: addDays(monday(d), 6) };
    const first = `${d.slice(0, 8)}01`;
    const next = new Date(Date.UTC(Number(d.slice(0, 4)), Number(d.slice(5, 7)), 1));
    return { from: first, to: addDays(next.toISOString().slice(0, 10), -1) };
  }

  private row(c: Ctx, r: Partial<DashRow> & Pick<DashRow, 'id' | 'kind' | 'title' | 'status'>): DashRow {
    const n = r.activationId ? c.names.get(r.activationId) : undefined;
    return { activationId: null, studentName: n?.name ?? 'Student', studentId: n?.businessId ?? null, subjectName: null, tutorName: null, date: null, priority: null, slaState: null, panel: null, ...r };
  }

  // ─── Gathering ─────────────────────────────────────────────────────────────────────────────────────────────────
  private async gather(c: Ctx): Promise<Record<CardKey, DashRow[]>> {
    const out = Object.fromEntries(CARDS.map((x) => [x.key, [] as DashRow[]])) as Record<CardKey, DashRow[]>;
    const f = c.filters;
    const w = this.window(c);
    const active = new Set(['ACTIVATION_IN_PROGRESS', 'ACTIVATED']);
    for (const a of c.activations) {
      const r = this.row(c, { id: a.id, kind: 'STUDENT', activationId: a.id, title: c.names.get(a.id)?.name ?? 'Student', status: active.has(a.status) ? 'Active' : a.status.toLowerCase().replace(/^activation_/, '').replace(/_/g, ' '), panel: 'checklist' });
      out.students_total.push(r);
      if (active.has(a.status)) out.students_active.push(r);
    }
    const ids = c.ids as string[];
    if (ids.length === 0) return out;

    // Classes
    const from = w?.from ?? c.today;
    const to = w?.to ?? addDays(c.today, 7);
    const classes = await this.classes.range(c.scope, from, to, ids, { subjectId: f.subjectId, tutorProfileId: f.tutorProfileId, state: f.classState }, c.now);
    for (const k of classes) {
      const r = this.row(c, { id: k.key, kind: 'CLASS', activationId: k.activationId, title: `${k.subjectName}, ${k.studentName}`, subjectName: k.subjectName, tutorName: k.tutorName, date: k.date, status: k.stateLabel, slaState: k.sla?.state ?? null, panel: 'classes' });
      for (const card of classCardsOf(k, c.today)) out[card].push(r);
    }
    // Follow-up tasks raised from a class that are still open, and the ones past their due time.
    const followUps = await (this.prisma as unknown as PrismaTxClient).mentoringTask.findMany({ where: { sourceType: 'CLASS', activationId: { in: ids }, status: { notIn: ['VERIFIED', 'CANCELLED'] } } });
    for (const t of followUps) {
      const r = this.row(c, { id: t.id, kind: 'TASK', activationId: t.activationId, title: t.title, date: t.dueAt ? t.dueAt.toISOString().slice(0, 10) : null, status: t.status === 'SUBMITTED' ? 'Handed in, waiting for you' : t.status === 'RETURNED' ? 'Sent back' : 'Open', panel: 'classes' });
      out.followups_open.push(r);
      if (t.dueAt && t.dueAt.getTime() < c.now.getTime()) out.followups_overdue.push(r);
    }
    // Classes still waiting on the Mentor or the tutor whatever their date: the queue is not limited to the window.
    const queue = await this.classes.queue(c.scope, { subjectId: f.subjectId, tutorProfileId: f.tutorProfileId, state: f.classState }, c.now);
    for (const k of queue.filter((q) => ids.includes(q.activationId) && q.state === 'AWAITING_MENTOR_VERIFICATION')) {
      if (!out.classes_awaiting_verification.some((x) => x.id === k.key)) out.classes_awaiting_verification.push(this.row(c, { id: k.key, kind: 'CLASS', activationId: k.activationId, title: `${k.subjectName}, ${k.studentName}`, subjectName: k.subjectName, tutorName: k.tutorName, date: k.date, status: k.stateLabel, slaState: k.sla?.state ?? null, panel: 'classes' }));
    }

    // Exams
    const examWindow = { from: w?.from ?? addDays(c.today, -60), to: w?.to ?? addDays(c.today, 30) };
    const exams = await this.exams.queue(c.scope, ids, { ...examWindow, subjectId: f.subjectId, tutorUserId: f.tutorUserId }, c.now);
    for (const e of exams.filter((x) => !f.examState || x.state === f.examState)) {
      const r = this.row(c, { id: e.id, kind: 'EXAM', activationId: e.activationId, title: `${e.title}, ${e.subjectName}`, subjectName: e.subjectName, tutorName: e.tutorName, date: e.date, status: e.stateLabel, panel: 'exams' });
      if (e.conducted === null && e.date >= c.today) out.exams_upcoming.push(r);
      if (e.state === 'AWAITING_EVALUATION') out.exams_awaiting_evaluation.push(r);
      if (e.state === 'MARKS_PENDING') out.exams_marks_pending.push(r);
      if (e.state === 'RE_EXAM_REQUIRED') out.exams_reexam.push(r);
    }

    // Monthly meetings and plans
    const meetings = await this.db.mentoringReviewMeeting.findMany({ where: { activationId: { in: ids }, kind: 'MONTHLY_REVIEW', status: 'SCHEDULED' }, orderBy: { scheduledFor: 'asc' } });
    for (const m of meetings) {
      const date = dayOf(m.scheduledFor) as string;
      if (w && (date < w.from || date > w.to)) continue;
      const st = meetingState({ status: 'SCHEDULED', date, originalDate: dayOf(m.originalDate) ?? date, conducted: m.conducted });
      if (f.meetingState && st !== f.meetingState) continue;
      const r = this.row(c, { id: m.id, kind: 'MEETING', activationId: m.activationId, title: 'Monthly parent meeting', date, status: MEETING_STATE_LABELS[st], panel: 'review' });
      if ((st === 'SCHEDULED' || st === 'RESCHEDULED') && date >= c.today) out.meetings_upcoming.push(r);
      if ((st === 'SCHEDULED' || st === 'RESCHEDULED') && date < c.today) out.meetings_overdue.push(r);
      if (st === 'REVIEW_IN_PROGRESS') out.meetings_pending_completion.push(r);
      if (st === 'NOT_CONDUCTED') out.meetings_not_conducted.push(r);
    }
    const plans = await this.db.mentoringLearningPlan.findMany({ where: { activationId: { in: ids }, status: { in: ['DRAFT', 'READY_FOR_REVIEW', 'APPROVED'] } } });
    for (const p of plans.filter((x) => x.endsOn === null && !meetings.some((m) => m.activationId === x.activationId))) {
      out.plans_awaiting_date.push(this.row(c, { id: p.id, kind: 'PLAN', activationId: p.activationId, title: 'Learning plan, no meeting date', status: 'Monthly review meeting date pending', panel: 'review' }));
    }

    // Complaints and response times, from their own services
    const cl = await this.complaints.list(c.scope, { activationId: undefined, category: f.complaintCategory, priority: f.priority, status: f.complaintStatus, from: f.from ?? w?.from, to: f.to ?? w?.to }, c.now);
    for (const x of cl.rows.filter((r) => ids.includes(r.activationId))) {
      const r = this.row(c, { id: x.id, kind: 'COMPLAINT', activationId: x.activationId, title: x.title, date: x.receivedAt.slice(0, 10), status: `${x.stageLabel}, ${x.statusLabel}`, priority: x.priority, slaState: x.ack.state, panel: 'complaints' });
      if (x.status === 'NEW') out.complaints_new.push(r);
      if (x.stage === 'STARTED' || x.stage === 'ONGOING') out.complaints_open.push(r);
      if (x.stage === 'RESOLVED') out.complaints_resolved.push(r);
      if (x.ack.state === 'APPROACHING') out.complaints_approaching.push(r);
      if (x.ack.state === 'BREACHED') out.complaints_breached.push(r);
    }
    const sl = await this.sla.list(c.scope, { status: 'OPEN', responsibleUserId: undefined }, c.now);
    for (const x of sl.rows.filter((r) => r.activationId && ids.includes(r.activationId) && (!f.slaState || r.state === f.slaState))) {
      const r = this.row(c, { id: x.id, kind: 'SLA', activationId: x.activationId, title: x.policyLabel, date: x.dueAt.slice(0, 10), status: x.stateLabel, slaState: x.state, panel: x.entityType === 'Complaint' ? 'complaints' : 'classes' });
      if (x.state === 'APPROACHING') out.sla_approaching.push(r);
      if (x.state === 'BREACHED') out.sla_breached.push(r);
    }
    if (f.priority) for (const k of ['complaints_new', 'complaints_open', 'complaints_resolved', 'complaints_approaching', 'complaints_breached'] as const) out[k] = out[k].filter((r) => r.priority === f.priority);
    return out;
  }

  // ─── Reading ───────────────────────────────────────────────────────────────────────────────────────────────────
  /** Every card with its count, for the students and filters given. The counts are the lengths of the lists the cards open. */
  async summary(scope: MentoringScope, f: DashFilters = {}, now: Date = new Date()) {
    const c = await this.context(scope, f, now);
    const all = await this.gather(c);
    const window = this.window(c);
    return {
      asOf: now.toISOString(),
      today: c.today,
      window,
      cards: CARDS.map((x) => ({ key: x.key, group: x.group, label: x.label, count: all[x.key].length })),
      notRecorded: NOT_RECORDED,
    };
  }

  /** The records behind one card, one page at a time, sorted by date. */
  async records(scope: MentoringScope, key: string, f: DashFilters = {}, page: number | string = 1, pageSize: number | string = 25, now: Date = new Date()) {
    const card = CARDS.find((x) => x.key === key);
    if (!card) throw new NotFoundException('That card does not exist.');
    const size = Math.min(PAGE_MAX, Math.max(1, Number(pageSize) || 25));
    const p = Math.max(1, Math.floor(Number(page) || 1));
    const c = await this.context(scope, f, now);
    const rows = (await this.gather(c))[card.key].sort((a, b) => (a.date ?? '').localeCompare(b.date ?? '') || a.studentName.localeCompare(b.studentName));
    return { key: card.key, label: card.label, total: rows.length, page: p, pageSize: size, pages: Math.max(1, Math.ceil(rows.length / size)), rows: rows.slice((p - 1) * size, p * size) };
  }
}
