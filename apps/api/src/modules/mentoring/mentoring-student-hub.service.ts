import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { PrismaService, PrismaTxClient } from '../../common/prisma/prisma.service';
import { addDays, isDateString } from '../tutor/tutor-calendar';

import { MentoringAccessService, MentoringScope } from './mentoring-access.service';
import { ClassView, MentoringClassService } from './mentoring-class.service';
import { MentoringLearningPlanService } from './mentoring-learning-plan.service';
import { localMomentOf } from './mentoring-sla';
import { MentoringSlaService } from './mentoring-sla.service';
import { MentoringTutorService } from './mentoring-tutor.service';
import {
  Balance, CONSUMPTION_FILTERS, ConsumptionFilter, DERIVED_SORTS, LIST_SORTS, ListSort, allocatedMinutes, balanceOf, classTone, compareNullable, consumptionBand, countClasses, monthWindow,
} from './student-hub';

const PAGE_MAX = 100;
/** The window the "next class", "next exam" and "next meeting" columns look into. */
const LOOKAHEAD_DAYS = 13;
const OPEN_COMPLAINT = ['NEW', 'ACKNOWLEDGED', 'ASSIGNED', 'IN_PROGRESS', 'WAITING_FOR_PARENT', 'WAITING_FOR_TUTOR', 'REOPENED'] as const;
const OPEN_TASK = ['OPEN', 'IN_PROGRESS', 'ON_HOLD', 'SUBMITTED', 'RETURNED'] as const;
const LIVE_ASSIGNMENT = ['ACTIVE', 'NEEDS_REVIEW'] as const;
const STATUS_LABELS: Record<string, string> = {
  AWAITING_ALLOCATION: 'Waiting for a Mentor', ACTIVATION_IN_PROGRESS: 'Onboarding', ACTIVATION_ON_HOLD: 'On hold', ACTIVATION_BLOCKED: 'Blocked', PENDING_FINAL_APPROVAL: 'Waiting for final approval', ACTIVATED: 'Active', CANCELLED: 'Cancelled',
};
const dayOf = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : null);
const fullName = (s: { firstName: string | null; lastName: string | null }) => `${s.firstName} ${s.lastName ?? ''}`.trim();

export interface HubListFilters {
  search?: string; grade?: string; subjectId?: string; status?: string; consumption?: string; pendingVerification?: string | boolean; upcomingExam?: string | boolean; mentorUserId?: string;
  sort?: string; dir?: string; page?: number | string; pageSize?: number | string; month?: string;
}

interface Agg {
  balance: Balance & { band: ConsumptionFilter };
  nextClass: { date: string; startMinute: number; subjectName: string } | null;
  nextExam: { date: string; startMinute: number; title: string } | null;
  nextMeeting: { date: string; startMinute: number | null } | null;
  pending: { verification: number; complaints: number; tasks: number; total: number };
}

const flag = (v: unknown) => v === true || v === 'true' || v === '1';

/**
 * The read model behind the Mentor Portal "Students" list and the Student Workspace. It adds no workflow and no table: classes, exams,
 * meetings, plans, tutors and complaints are read through the services and tables that already own them, and every verification still
 * goes through the existing class endpoints. Who may see a student is decided once, in the database query (MentoringAccessService).
 *
 * Allocated time is the monthly hours of the student's Sales requirements, because that is the only entitlement the system stores. It is
 * unavailable (null) when no requirement carries hours. Consumed is only what a Mentor verified. The figures are kept apart.
 */
@Injectable()
export class MentoringStudentHubService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: MentoringAccessService,
    private readonly classes: MentoringClassService,
    private readonly tutors: MentoringTutorService,
    private readonly plans: MentoringLearningPlanService,
    private readonly sla: MentoringSlaService,
  ) {}

  private get db() {
    return this.prisma as unknown as PrismaTxClient;
  }

  private async today(now: Date) {
    return localMomentOf(now, (await this.sla.workingNow(this.db, now)).timeZone).date;
  }

  /** The student, only if the caller may see them. A student outside the scope is "not found", never "forbidden". */
  private async visible(activationId: string, scope: MentoringScope) {
    this.access.requireAnyScope(scope);
    const a = await this.db.mentoringActivation.findFirst({
      where: { AND: [{ id: activationId }, this.access.visibilityWhere(scope)] },
      include: { student: { include: { grade: true, curriculum: true } }, lead: { select: { firstName: true, lastName: true, primaryPhone: true, altPhone1: true, whatsappNumber: true } } },
    });
    if (!a) throw new NotFoundException('Student not found');
    return a;
  }

  /** Verification is the assigned Mentor's. The Head, the CEO, a Counselor and everyone else read only. */
  private canVerify(a: { currentMentorUserId: string | null; status: string }, scope: MentoringScope) {
    return a.currentMentorUserId === scope.userId && scope.perms.has('mentoring.stage.work') && a.status === 'ACTIVATED';
  }

  // ─── The list ──────────────────────────────────────────────────────────────────────────────────────────────────
  async list(scope: MentoringScope, f: HubListFilters = {}, now: Date = new Date()) {
    this.access.requireAnyScope(scope);
    const today = await this.today(now);
    const month = f.month !== undefined ? this.monthOf(f.month) : today.slice(0, 7);
    const period = monthWindow(`${month}-01`);
    const sort = (f.sort ?? 'name') as ListSort;
    if (!LIST_SORTS.includes(sort)) throw new BadRequestException('Choose a real sort.');
    const dir: 1 | -1 = f.dir === 'desc' ? -1 : 1;
    if (f.consumption && !CONSUMPTION_FILTERS.includes(f.consumption as ConsumptionFilter)) throw new BadRequestException('Choose a real class-consumption filter.');
    if (f.status && !(f.status in STATUS_LABELS)) throw new BadRequestException('Choose a real student status.');
    const size = Math.min(PAGE_MAX, Math.max(1, Number(f.pageSize) || 25));
    const page = Math.max(1, Math.floor(Number(f.page) || 1));

    const visibility = this.access.visibilityWhere(scope);
    const and: Prisma.MentoringActivationWhereInput[] = [visibility];
    and.push(f.status ? { status: f.status as never } : { status: { notIn: ['CANCELLED', 'AWAITING_ALLOCATION'] } });
    // The Mentor filter is for the department view only. A Mentor is already limited to their own students.
    if (f.mentorUserId && scope.all) and.push({ currentMentorUserId: f.mentorUserId });
    if (f.grade) and.push({ student: { OR: [{ gradeId: f.grade }, { currentGrade: f.grade }] } });
    if (f.subjectId) and.push({ tutorAssignments: { some: { subjectId: f.subjectId, status: { in: [...LIVE_ASSIGNMENT] } } } });
    const q = f.search?.trim();
    if (q) and.push({ student: { OR: [{ firstName: { contains: q, mode: 'insensitive' } }, { lastName: { contains: q, mode: 'insensitive' } }, { businessId: { contains: q, mode: 'insensitive' } }] } });
    if (flag(f.pendingVerification)) {
      const rows = await this.db.mentoringClassSession.groupBy({ by: ['activationId'], where: { status: 'AWAITING_MENTOR_VERIFICATION', activation: visibility } });
      and.push({ id: { in: rows.map((r) => r.activationId) } });
    }
    if (flag(f.upcomingExam)) {
      const rows = await this.db.mentoringExam.groupBy({ by: ['activationId'], where: { dateKey: { not: null }, conducted: null, date: { gte: this.asDate(today), lte: this.asDate(addDays(today, LOOKAHEAD_DAYS)) }, activation: visibility } });
      and.push({ id: { in: rows.map((r) => r.activationId) } });
    }
    const where: Prisma.MentoringActivationWhereInput = { AND: and };
    const baseOrder: Prisma.MentoringActivationOrderByWithRelationInput =
      sort === 'studentId' ? { student: { businessId: dir === 1 ? 'asc' : 'desc' } }
        : sort === 'grade' ? { student: { currentGrade: dir === 1 ? 'asc' : 'desc' } }
          : sort === 'activatedAt' ? { activatedAt: dir === 1 ? 'asc' : 'desc' }
            : sort === 'status' ? { status: dir === 1 ? 'asc' : 'desc' }
              : { student: { firstName: dir === 1 ? 'asc' : 'desc' } };

    const needAll = !!f.consumption || DERIVED_SORTS.includes(sort);
    let total: number;
    let pageIds: string[];
    let aggs: Map<string, Agg>;
    if (!needAll) {
      const [count, rows] = await Promise.all([
        this.db.mentoringActivation.count({ where }),
        this.db.mentoringActivation.findMany({ where, orderBy: [baseOrder, { id: 'asc' }], skip: (page - 1) * size, take: size, select: { id: true, studentId: true } }),
      ]);
      total = count;
      pageIds = rows.map((r) => r.id);
      aggs = await this.aggregate(scope, rows, today, period, now);
    } else {
      const all = await this.db.mentoringActivation.findMany({ where, orderBy: [{ student: { firstName: 'asc' } }, { id: 'asc' }], select: { id: true, studentId: true, student: { select: { firstName: true, lastName: true } } } });
      aggs = await this.aggregate(scope, all, today, period, now);
      let kept = all;
      if (f.consumption) kept = kept.filter((r) => aggs.get(r.id)!.balance.band === f.consumption);
      const key = (id: string): number | string | null => {
        const a = aggs.get(id)!;
        return sort === 'consumed' ? a.balance.consumedMinutes : sort === 'remaining' ? a.balance.remainingMinutes : a.nextClass ? `${a.nextClass.date}-${String(a.nextClass.startMinute).padStart(4, '0')}` : null;
      };
      kept = [...kept].sort((x, y) => compareNullable(key(x.id), key(y.id), dir) || fullName(x.student).localeCompare(fullName(y.student)));
      total = kept.length;
      pageIds = kept.slice((page - 1) * size, page * size).map((r) => r.id);
    }

    const rows = await this.rowsFor(pageIds, aggs, scope);
    return { period, today, total, page, pageSize: size, pages: Math.max(1, Math.ceil(total / size)), rows, options: await this.options(visibility, scope), allocationNote: ALLOCATION_NOTE };
  }

  private monthOf(v: string): string {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(v)) throw new BadRequestException('Choose a month written like 2026-11.');
    return v;
  }

  private asDate(d: string) {
    return new Date(`${d}T00:00:00Z`);
  }

  /** The columns of a page of students, worked out together: a fixed number of queries whatever the page size. */
  private async aggregate(scope: MentoringScope, rows: Array<{ id: string; studentId: string }>, today: string, period: { from: string; to: string }, now: Date): Promise<Map<string, Agg>> {
    const out = new Map<string, Agg>();
    if (rows.length === 0) return out;
    const ids = rows.map((r) => r.id);
    const studentIds = rows.map((r) => r.studentId);
    const horizon = addDays(today, LOOKAHEAD_DAYS);
    const [requirements, month, ahead, awaiting, complaints, tasks, exams, meetings] = await Promise.all([
      this.db.requirement.findMany({ where: { studentId: { in: studentIds } }, select: { studentId: true, monthlyHours: true } }),
      this.classes.range(scope, period.from, period.to, ids, {}, now),
      this.classes.range(scope, today, horizon, ids, {}, now),
      this.db.mentoringClassSession.groupBy({ by: ['activationId'], where: { activationId: { in: ids }, status: 'AWAITING_MENTOR_VERIFICATION' }, _count: { _all: true } }),
      this.db.mentoringComplaint.groupBy({ by: ['activationId'], where: { activationId: { in: ids }, status: { in: [...OPEN_COMPLAINT] as never } }, _count: { _all: true } }),
      this.db.mentoringTask.groupBy({ by: ['activationId'], where: { activationId: { in: ids }, status: { in: [...OPEN_TASK] as never } }, _count: { _all: true } }),
      this.db.mentoringExam.findMany({ where: { activationId: { in: ids }, dateKey: { not: null }, conducted: null, date: { gte: this.asDate(today) } }, orderBy: [{ date: 'asc' }, { startMinute: 'asc' }], select: { activationId: true, date: true, startMinute: true, title: true } }),
      this.db.mentoringReviewMeeting.findMany({ where: { activationId: { in: ids }, status: 'SCHEDULED', scheduledFor: { gte: this.asDate(today) } }, orderBy: [{ scheduledFor: 'asc' }], select: { activationId: true, scheduledFor: true, scheduledStartMinute: true } }),
    ]);
    const count = (list: Array<{ activationId: string; _count: { _all: number } }>, id: string) => list.find((x) => x.activationId === id)?._count._all ?? 0;
    for (const r of rows) {
      const mine = month.filter((c) => c.activationId === r.id);
      const live = mine.filter((c) => c.status !== 'CANCELLED');
      const consumed = mine.filter((c) => c.consumption === 'CONSUMED').reduce((s, c) => s + (c.verified?.minutes ?? 0), 0);
      const pendingMinutes = live.filter((c) => c.state === 'AWAITING_TUTOR_UPDATE' || c.state === 'AWAITING_MENTOR_VERIFICATION' || c.state === 'RETURNED_FOR_CORRECTION').reduce((s, c) => s + c.scheduledMinutes, 0);
      const balance = balanceOf({
        allocatedMinutes: allocatedMinutes(requirements.filter((q) => q.studentId === r.studentId)),
        consumedMinutes: consumed,
        scheduledMinutes: live.reduce((s, c) => s + c.scheduledMinutes, 0),
        pendingMinutes,
      });
      const next = ahead.filter((c) => c.activationId === r.id && (c.status === 'SCHEDULED' || c.status === 'RESCHEDULED') && `${c.date}-${String(c.endMinute).padStart(4, '0')}` >= `${today}-0000`)[0];
      const exam = exams.find((e) => e.activationId === r.id);
      const meeting = meetings.find((m) => m.activationId === r.id);
      const verification = count(awaiting, r.id);
      const open = { complaints: count(complaints, r.id), tasks: count(tasks, r.id) };
      out.set(r.id, {
        balance: { ...balance, band: consumptionBand(balance) },
        nextClass: next ? { date: next.date, startMinute: next.startMinute, subjectName: next.subjectName } : null,
        nextExam: exam ? { date: dayOf(exam.date) as string, startMinute: exam.startMinute, title: exam.title } : null,
        nextMeeting: meeting ? { date: dayOf(meeting.scheduledFor) as string, startMinute: meeting.scheduledStartMinute } : null,
        pending: { verification, ...open, total: verification + open.complaints + open.tasks },
      });
    }
    return out;
  }

  private async rowsFor(ids: string[], aggs: Map<string, Agg>, scope: MentoringScope) {
    if (ids.length === 0) return [];
    const acts = await this.db.mentoringActivation.findMany({ where: { id: { in: ids } }, include: { student: { include: { grade: true } } } });
    const mentorIds = [...new Set(acts.map((a) => a.currentMentorUserId).filter((u): u is string => !!u))];
    const employees = mentorIds.length ? await this.db.employee.findMany({ where: { userId: { in: mentorIds } }, select: { userId: true, firstName: true, lastName: true } }) : [];
    const mentorName = (id: string | null) => { const e = employees.find((x) => x.userId === id); return e ? `${e.firstName} ${e.lastName}`.trim() : null; };
    const byId = new Map(acts.map((a) => [a.id, a]));
    return ids.map((id) => byId.get(id)).filter((a): a is NonNullable<typeof a> => !!a).map((a) => {
      const g = aggs.get(a.id) as Agg;
      return {
        activationId: a.id, studentId: a.student.businessId, name: fullName(a.student), photoUrl: null as string | null,
        grade: a.student.currentGrade ?? null, level: a.student.grade?.name ?? null,
        mentor: { userId: a.currentMentorUserId, name: mentorName(a.currentMentorUserId) }, isMine: a.currentMentorUserId === scope.userId,
        activatedAt: a.activatedAt ? a.activatedAt.toISOString() : null, status: a.status, statusLabel: STATUS_LABELS[a.status] ?? a.status,
        balance: g.balance, nextClass: g.nextClass, nextExam: g.nextExam, nextMeeting: g.nextMeeting, pending: g.pending,
      };
    });
  }

  /** What the filter menus offer: only grades, subjects and Mentors that belong to students the caller may see. */
  private async options(visibility: Prisma.MentoringActivationWhereInput, scope: MentoringScope) {
    const acts = await this.db.mentoringActivation.findMany({ where: { AND: [visibility, { status: { notIn: ['CANCELLED', 'AWAITING_ALLOCATION'] } }] }, select: { id: true, studentId: true } });
    const [students, assignments] = await Promise.all([
      this.db.student.findMany({ where: { id: { in: acts.map((x) => x.studentId) } }, select: { currentGrade: true } }),
      this.db.mentoringTutorAssignment.findMany({ where: { activationId: { in: acts.map((x) => x.id) }, status: { in: [...LIVE_ASSIGNMENT] } }, select: { subjectId: true } }),
    ]);
    const subjectIds = [...new Set(assignments.map((x) => x.subjectId))];
    const subjects = subjectIds.length ? await this.db.subject.findMany({ where: { id: { in: subjectIds } }, select: { id: true, name: true }, orderBy: { name: 'asc' } }) : [];
    let mentors: Array<{ userId: string; name: string }> = [];
    if (scope.all) {
      const mentorRows = await this.db.mentoringActivation.findMany({ where: { AND: [visibility, { currentMentorUserId: { not: null } }] }, select: { currentMentorUserId: true } });
      const ids = [...new Set(mentorRows.map((m) => m.currentMentorUserId as string))];
      const emps = ids.length ? await this.db.employee.findMany({ where: { userId: { in: ids } }, select: { userId: true, firstName: true, lastName: true } }) : [];
      mentors = emps.map((e) => ({ userId: e.userId, name: `${e.firstName} ${e.lastName}`.trim() })).sort((x, y) => x.name.localeCompare(y.name));
    }
    return { grades: [...new Set(students.map((s) => s.currentGrade).filter((g): g is string => !!g))].sort(), subjects, mentors };
  }

  // ─── The workspace header and cards ────────────────────────────────────────────────────────────────────────────
  async workspace(activationId: string, scope: MentoringScope, now: Date = new Date()) {
    const a = await this.visible(activationId, scope);
    const today = await this.today(now);
    const period = monthWindow(today);
    const agg = (await this.aggregate(scope, [{ id: a.id, studentId: a.studentId }], today, period, now)).get(a.id) as Agg;
    const [assignments, mentor, stored, plan, group] = await Promise.all([
      this.tutors.assignmentsFor(a.id),
      a.currentMentorUserId ? this.db.employee.findFirst({ where: { userId: a.currentMentorUserId }, select: { firstName: true, lastName: true } }) : Promise.resolve(null),
      this.classes.stored([a.id], { limit: 500 }, now),
      this.plans.get(a.id, scope).catch(() => null),
      Promise.resolve(null),
    ]);
    const counts = countClasses(stored.map((c) => ({ key: c.key, status: c.status, state: c.state, scheduledMinutes: c.scheduledMinutes, verifiedMinutes: c.verified?.minutes ?? null })));
    const upcoming = (await this.classes.range(scope, today, addDays(today, LOOKAHEAD_DAYS), [a.id], {}, now)).filter((c) => c.status === 'SCHEDULED' || c.status === 'RESCHEDULED').length;
    const seeParent = this.access.canSeeParentContact(scope, a);
    const parent = seeParent ? { name: fullName(a.lead), phone: a.lead.primaryPhone ?? a.lead.altPhone1 ?? a.lead.whatsappNumber ?? null } : null;
    return {
      today, period,
      header: {
        activationId: a.id, name: fullName(a.student), studentId: a.student.businessId, photoUrl: null as string | null,
        grade: a.student.currentGrade ?? null, level: a.student.grade?.name ?? null, curriculum: a.student.curriculum?.name ?? null,
        status: a.status, statusLabel: STATUS_LABELS[a.status] ?? a.status, activatedAt: a.activatedAt ? a.activatedAt.toISOString() : null,
        mentor: { userId: a.currentMentorUserId, name: mentor ? `${mentor.firstName} ${mentor.lastName}`.trim() : null },
        group, parent, parentHidden: !seeParent,
      },
      viewer: { isMentor: a.currentMentorUserId === scope.userId, canVerify: this.canVerify(a, scope), seesAll: scope.all, readOnly: !this.canVerify(a, scope) },
      balance: agg.balance,
      cards: {
        upcomingClasses: upcoming, awaitingTutorUpdate: counts.awaitingTutor, awaitingMentorVerification: counts.awaitingMentor, returnedForCorrection: counts.returned,
        nextExam: agg.nextExam, nextMeeting: agg.nextMeeting, pending: agg.pending,
        learningPlan: plan ? { status: plan.planStatus ?? plan.status, start: plan.summary.overallStart, endsOn: plan.summary.endsOn } : null,
      },
      tutors: assignments.map((t) => ({ subjectId: t.subjectId, subjectName: t.subjectName, tutorProfileId: t.tutorProfileId, tutorName: t.tutorName, status: t.status, sessions: t.sessions, meetLink: t.meetLink })),
      allocationNote: ALLOCATION_NOTE,
    };
  }

  // ─── Classes: stored records only ──────────────────────────────────────────────────────────────────────────────
  /**
   * Every class record the system holds for the student. A record is stored when something happens to a scheduled class; the timetable's
   * future classes that nothing has touched yet are not records and are not listed here, so the list never reaches an allocation by
   * adding rows. Counts are worked out from the same records.
   */
  async studentClasses(activationId: string, scope: MentoringScope, f: { state?: string; subjectId?: string; from?: string; to?: string } = {}, now: Date = new Date()) {
    const a = await this.visible(activationId, scope);
    for (const d of [f.from, f.to]) if (d !== undefined && !isDateString(d)) throw new BadRequestException('Choose real dates, written like 2026-11-09.');
    const today = await this.today(now);
    const all = await this.classes.stored([a.id], { from: f.from, to: f.to, limit: 500 }, now);
    const list = all.filter((c) => (!f.state || c.state === f.state) && (!f.subjectId || c.subjectId === f.subjectId));
    const month = monthWindow(today);
    const inMonth = all.filter((c) => c.date >= month.from && c.date <= month.to);
    const agg = (await this.aggregate(scope, [{ id: a.id, studentId: a.studentId }], today, month, now)).get(a.id) as Agg;
    const forCounts = (rows: ClassView[]) => countClasses(rows.map((c) => ({ key: c.key, status: c.status, state: c.state, scheduledMinutes: c.scheduledMinutes, verifiedMinutes: c.verified?.minutes ?? null })));
    return {
      today, period: month, canVerify: this.canVerify(a, scope),
      balance: agg.balance,
      counts: { allTime: forCounts(all), period: forCounts(inMonth) },
      records: list.map((c) => ({
        key: c.key, sessionId: c.sessionId, date: c.date, startMinute: c.startMinute, endMinute: c.endMinute, scheduledMinutes: c.scheduledMinutes,
        subjectId: c.subjectId, subjectName: c.subjectName, tutorName: c.tutorName, status: c.status, state: c.state, stateLabel: c.stateLabel,
        tone: classTone({ status: c.status, state: c.state, consumption: c.consumption }), moved: c.moved || c.status === 'RESCHEDULED',
        consumption: c.consumption, verifiedMinutes: c.verified?.minutes ?? null, tutorSubmitted: !!c.update, voiceUploaded: c.voice.uploaded,
        returned: c.returned, cancelled: c.cancelled,
      })),
      truncated: all.length >= 500,
      note: 'Only stored class records are listed. A class on the timetable that nothing has happened to yet is not a record and is counted under scheduled, not here.',
    };
  }

  // ─── Communication: records that exist ─────────────────────────────────────────────────────────────────────────
  /** Messages prepared for the class group and reminders sent about this student's classes and exams. Nothing is generated. */
  async communication(activationId: string, scope: MentoringScope) {
    const a = await this.visible(activationId, scope);
    const sessions = await this.db.mentoringClassSession.findMany({ where: { activationId: a.id }, select: { id: true, date: true, subjectId: true } });
    const ids = sessions.map((s) => s.id);
    const [shares, reminders] = await Promise.all([
      ids.length ? this.db.mentoringMessageShare.findMany({ where: { sessionId: { in: ids } }, orderBy: { createdAt: 'desc' }, take: 100 }) : [],
      this.db.mentoringReminder.findMany({ where: { activationId: a.id }, orderBy: { preparedAt: 'desc' }, take: 100 }),
    ]);
    const dateOf = new Map(sessions.map((s) => [s.id, dayOf(s.date)]));
    return {
      messages: shares.map((m) => ({ id: m.id, kind: 'CLASS_MESSAGE', template: m.templateKey, text: m.text, classDate: dateOf.get(m.sessionId) ?? null, preparedAt: m.createdAt.toISOString(), copiedAt: m.copiedAt?.toISOString() ?? null, confirmedAt: m.confirmedAt?.toISOString() ?? null })),
      reminders: reminders.map((r) => ({ id: r.id, kind: r.kind, status: r.status, message: r.message, preparedAt: r.preparedAt.toISOString(), sentAt: r.sentAt?.toISOString() ?? null, acknowledgedAt: r.acknowledgedAt?.toISOString() ?? null })),
    };
  }
}

export const ALLOCATION_NOTE =
  'Allocated time is the monthly hours on the student\'s requirements. Consumed counts only classes the Mentor verified. Scheduled and pending time are shown beside them and never counted as consumed.';
