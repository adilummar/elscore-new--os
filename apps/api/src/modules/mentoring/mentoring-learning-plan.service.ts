import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';

import { PrismaService, PrismaTxClient } from '../../common/prisma/prisma.service';

import {
  EnrolledSubject, OverallStatus, PENDING_REVIEW_EXPLANATION, PENDING_REVIEW_MESSAGE, PlanSnapshot, SubjectPlanFields, SubjectStatus,
  changedFields, checkSubjectPlan, enrolledFrom, meetingDateProblem, overallStatus, readinessProblems, sameFields, subjectStatus, syncedEndDate,
} from './learning-plan';
import { MentoringAccessService, MentoringScope } from './mentoring-access.service';
import { MentoringAllocationService } from './mentoring-allocation.service';
import { assertWorkable, loadLockedActivation } from './mentoring-guards';
import { MentoringHistoryService } from './mentoring-history.service';
import { planFromSchedule } from './student-timetable';
import { isScheduleValue } from './subject-schedule';

const SCHEDULE_FIELD = 'timetable.schedule';
const PLAN_STAGE = 5;
const OPEN_STAGE: ReadonlySet<string> = new Set(['IN_PROGRESS', 'PENDING_REVIEW']);
const MEETING_KIND = 'MONTHLY_REVIEW';

const asDate = (d: string | null) => (d ? new Date(`${d}T00:00:00Z`) : null);
const dayOf = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : null);

export interface LearningPlanSubjectView {
  subjectId: string;
  subjectName: string;
  gradeName: string;
  scheduleStart: string | null;
  /** The planned first class, offered as the start date until the Mentor chooses one. */
  defaultStart: string | null;
  status: SubjectStatus;
  plan: SubjectPlanFields | null;
  createdBy: string | null;
  createdAt: string | null;
  updatedBy: string | null;
  updatedAt: string | null;
}

export interface LearningPlanHistoryItem {
  version: number;
  kind: string;
  reason: string | null;
  changedBy: string | null;
  at: string;
}

export interface LearningPlanView {
  student: { id: string; name: string };
  status: OverallStatus;
  planStatus: 'DRAFT' | 'READY_FOR_REVIEW' | 'APPROVED' | null;
  summary: { enrolledSubjects: number; completedSubjects: number; overallStart: string | null; nextReviewMeeting: string | null; endsOn: string | null };
  meeting: { id: string; date: string } | null;
  pendingMessage: string | null;
  pendingExplanation: string | null;
  problems: string[];
  subjects: LearningPlanSubjectView[];
  history: LearningPlanHistoryItem[];
  approval: { by: string | null; at: string | null };
  stageStatus: string | null;
  canEdit: boolean;
}

export interface SaveSubjectPlanInput {
  description?: unknown;
  objectives?: unknown;
  topics?: unknown;
  outcomes?: unknown;
  startsOn?: unknown;
  endsOn?: unknown;
  /** Why an approved plan is being changed. Required then. */
  reason?: unknown;
}

/**
 * The Individual Learning Plan of a student: a separate plan for every subject in the saved schedule, inside one learning
 * period that ends on the date of the monthly review meeting. The meeting is scheduled by a later phase through
 * scheduleMonthlyReview, which moves every subject's end date with it. All checks are made here, on the server.
 */
@Injectable()
export class MentoringLearningPlanService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: MentoringAccessService,
    private readonly history: MentoringHistoryService,
  ) {}

  // ─── Reading ───────────────────────────────────────────────────────────────────────────────────────────────────
  async get(activationId: string, scope: MentoringScope): Promise<LearningPlanView> {
    const db = this.prisma as unknown as PrismaTxClient;
    const activation = await db.mentoringActivation.findFirst({
      where: { AND: [{ id: activationId }, this.access.visibilityWhere(scope)] },
      include: { student: true, stages: true },
    });
    if (!activation) throw new NotFoundException('Student not found');
    const state = await this.load(db, activation);
    const names = await this.userNames(db, [...state.subjectRows.flatMap((r) => [r.createdByUserId, r.updatedByUserId]), ...state.revisions.map((r) => r.changedByUserId), state.plan?.approvedByUserId]);
    const stage = activation.stages.find((s) => s.stageNumber === PLAN_STAGE);
    const plans = new Map(state.rows);
    const status = overallStatus({ enrolled: state.enrolled, plans, planStatus: state.plan && state.plan.status !== 'SUPERSEDED' ? state.plan.status : null, meetingDate: state.meetingDate });
    const subjects: LearningPlanSubjectView[] = state.enrolled.map((s) => {
      const row = state.subjectRows.find((r) => r.subjectId === s.subjectId);
      return {
        subjectId: s.subjectId, subjectName: s.subjectName, gradeName: s.gradeName, scheduleStart: s.scheduleStart, defaultStart: s.firstClass,
        status: subjectStatus(plans.get(s.subjectId), state.meetingDate), plan: plans.get(s.subjectId) ?? null,
        createdBy: row ? names.get(row.createdByUserId) ?? 'A user' : null, createdAt: row ? row.createdAt.toISOString() : null,
        updatedBy: row?.updatedByUserId ? names.get(row.updatedByUserId) ?? 'A user' : null, updatedAt: row ? row.updatedAt.toISOString() : null,
      };
    });
    const starts = subjects.map((s) => s.plan?.startsOn).filter((d): d is string => !!d).sort();
    return {
      student: { id: activation.studentId, name: `${activation.student.firstName} ${activation.student.lastName ?? ''}`.trim() },
      status,
      planStatus: state.plan && state.plan.status !== 'SUPERSEDED' ? (state.plan.status) : null,
      summary: {
        enrolledSubjects: state.enrolled.length,
        completedSubjects: subjects.filter((s) => s.status === 'COMPLETE').length,
        overallStart: starts[0] ?? null,
        nextReviewMeeting: state.meetingDate,
        endsOn: state.meetingDate,
      },
      meeting: state.meeting ? { id: state.meeting.id, date: state.meetingDate as string } : null,
      pendingMessage: state.meetingDate ? null : PENDING_REVIEW_MESSAGE,
      pendingExplanation: state.meetingDate ? null : PENDING_REVIEW_EXPLANATION,
      problems: readinessProblems(state.enrolled, plans, state.meetingDate),
      subjects,
      history: state.revisions.map((r) => ({ version: r.version, kind: r.kind, reason: r.reason, changedBy: r.changedByUserId ? names.get(r.changedByUserId) ?? 'A user' : null, at: r.createdAt.toISOString() })),
      approval: { by: state.plan?.approvedByUserId ? names.get(state.plan.approvedByUserId) ?? 'A user' : null, at: state.plan?.approvedAt ? state.plan.approvedAt.toISOString() : null },
      stageStatus: stage?.status ?? null,
      canEdit: activation.currentMentorUserId === scope.userId && scope.perms.has('mentoring.stage.work') && activation.status === 'ACTIVATION_IN_PROGRESS' && !!stage && OPEN_STAGE.has(stage.status),
    };
  }

  private async userNames(db: PrismaTxClient, ids: Array<string | null | undefined>): Promise<Map<string, string>> {
    const wanted = [...new Set(ids.filter((i): i is string => !!i))];
    const out = new Map<string, string>();
    if (wanted.length === 0) return out;
    for (const e of await db.employee.findMany({ where: { userId: { in: wanted } } })) out.set(e.userId, `${e.firstName} ${e.lastName}`.trim());
    return out;
  }

  /** Everything the rules need, read inside the caller's transaction or on its own. */
  private async load(db: PrismaTxClient, activation: { id: string; handoverId: string | null }) {
    const field = activation.handoverId ? await db.enrollmentHandoverField.findUnique({ where: { handoverId_fieldKey: { handoverId: activation.handoverId, fieldKey: SCHEDULE_FIELD } } }) : null;
    const enrolled: EnrolledSubject[] = enrolledFrom(planFromSchedule(isScheduleValue(field?.value) ? field.value : null));
    const plan = await db.mentoringLearningPlan.findFirst({ where: { activationId: activation.id, status: { in: ['DRAFT', 'READY_FOR_REVIEW', 'APPROVED'] } } });
    const subjectRows = plan ? await db.mentoringLearningPlanSubject.findMany({ where: { planId: plan.id } }) : [];
    const revisions = plan ? (await db.mentoringLearningPlanRevision.findMany({ where: { planId: plan.id } })).sort((a, b) => b.version - a.version) : [];
    const meeting = await db.mentoringReviewMeeting.findFirst({ where: { activationId: activation.id, kind: MEETING_KIND, status: 'SCHEDULED' } });
    const rows = new Map<string, SubjectPlanFields>();
    for (const r of subjectRows) {
      if (enrolled.some((s) => s.subjectId === r.subjectId)) rows.set(r.subjectId, { description: r.description, objectives: r.objectives, topics: r.topics, outcomes: r.outcomes, startsOn: dayOf(r.startsOn), endsOn: dayOf(r.endsOn) });
    }
    return { enrolled, plan, subjectRows, revisions, meeting, meetingDate: meeting ? dayOf(meeting.scheduledFor) : null, rows };
  }

  // ─── Writing: the assigned Mentor, while the stage is open ─────────────────────────────────────────────────────
  private assertOpen(activation: { stages: Array<{ stageNumber: number; status: string }> }) {
    const stage = activation.stages.find((s) => s.stageNumber === PLAN_STAGE);
    if (!stage || !OPEN_STAGE.has(stage.status)) throw new ConflictException('Start the Individual Learning Plan stage first.');
  }

  private snapshot(plan: { status: string; reviewMeetingId: string | null; endsOn: Date | null }, rows: Array<{ subjectId: string } & Pick<SubjectPlanFields, never> & { description: string; objectives: string; topics: string; outcomes: string; startsOn: Date | null; endsOn: Date | null }>): PlanSnapshot {
    return {
      status: plan.status, endsOn: dayOf(plan.endsOn), reviewMeetingId: plan.reviewMeetingId,
      subjects: rows.map((r) => ({ subjectId: r.subjectId, description: r.description, objectives: r.objectives, topics: r.topics, outcomes: r.outcomes, startsOn: dayOf(r.startsOn), endsOn: dayOf(r.endsOn) })),
    };
  }

  private async revise(tx: PrismaTxClient, planId: string, kind: string, reason: string | null, userId: string | null) {
    const plan = await tx.mentoringLearningPlan.findUnique({ where: { id: planId } });
    const rows = await tx.mentoringLearningPlanSubject.findMany({ where: { planId } });
    const version = (await tx.mentoringLearningPlanRevision.findMany({ where: { planId } })).length + 1;
    await tx.mentoringLearningPlanRevision.create({ data: { planId, version, kind, snapshot: this.snapshot(plan as never, rows as never) as never, reason, changedByUserId: userId } });
    return version;
  }

  /** Saves the plan of one subject. An approved plan can only be changed with a reason, and then needs approving again. */
  async saveSubject(activationId: string, subjectId: string, input: SaveSubjectPlanInput, userId: string): Promise<LearningPlanSubjectView> {
    await this.prisma.$transaction(async (tx: PrismaTxClient) => {
      const activation = await loadLockedActivation(tx, activationId);
      MentoringAllocationService.assertAssignedMentor(activation, userId);
      assertWorkable(activation);
      this.assertOpen(activation);
      const state = await this.load(tx, activation);
      const subject = state.enrolled.find((s) => s.subjectId === subjectId);
      if (!subject) throw new BadRequestException('This subject is not in the student\'s saved schedule, so it has no learning plan.');

      const checked = checkSubjectPlan({ ...input }, { scheduleStart: subject.scheduleStart, meetingDate: state.meetingDate });
      if (!checked.ok) throw new BadRequestException(checked.message);
      const reason = typeof input.reason === 'string' ? input.reason.trim() : '';
      if (state.plan?.status === 'APPROVED' && !reason) throw new BadRequestException('This plan is approved. Say why it is being changed.');
      const before = state.rows.get(subjectId) ?? null;
      if (before && sameFields(before, checked.value)) return;

      const plan = state.plan ?? (await tx.mentoringLearningPlan.create({ data: { activationId, status: 'DRAFT', currentKey: activationId, createdByUserId: userId, reviewMeetingId: state.meeting?.id ?? null, endsOn: asDate(state.meetingDate) } }));
      const data = { description: checked.value.description, objectives: checked.value.objectives, topics: checked.value.topics, outcomes: checked.value.outcomes, startsOn: asDate(checked.value.startsOn), endsOn: asDate(checked.value.endsOn), updatedByUserId: userId };
      const existing = state.subjectRows.find((r) => r.subjectId === subjectId);
      if (existing) await tx.mentoringLearningPlanSubject.update({ where: { id: existing.id }, data });
      else await tx.mentoringLearningPlanSubject.create({ data: { ...data, planId: plan.id, subjectId, createdByUserId: userId } });
      const reopened = plan.status === 'APPROVED' || plan.status === 'READY_FOR_REVIEW';
      await tx.mentoringLearningPlan.update({ where: { id: plan.id }, data: { status: 'DRAFT', approvedByUserId: null, approvedAt: null, updatedByUserId: userId } });
      const changed = changedFields(before, checked.value);
      const version = await this.revise(tx, plan.id, reopened && plan.status === 'APPROVED' ? 'REOPENED' : 'SAVED', reason || `${subject.subjectName}: ${changed.join(', ')}`, userId);
      await this.history.record(tx, { activationId, type: 'MENTORING_LEARNING_PLAN_SAVED', actorUserId: userId, reason: reason || null, payload: { subjectId, subjectName: subject.subjectName, changed, version, reopened: plan.status === 'APPROVED' } });
    });
    const view = await this.get(activationId, { userId, perms: new Set(['mentoring.stage.work']), all: true, assigned: true });
    return view.subjects.find((s) => s.subjectId === subjectId) as LearningPlanSubjectView;
  }

  /** Marks the plan ready for review. Every subject needs its own complete plan, and the review meeting must be scheduled. */
  async markReady(activationId: string, userId: string): Promise<{ status: 'READY_FOR_REVIEW' }> {
    return this.prisma.$transaction(async (tx: PrismaTxClient) => {
      const activation = await loadLockedActivation(tx, activationId);
      MentoringAllocationService.assertAssignedMentor(activation, userId);
      assertWorkable(activation);
      this.assertOpen(activation);
      const state = await this.load(tx, activation);
      if (!state.plan) throw new ConflictException('Write the learning plan for the subjects first.');
      const problems = readinessProblems(state.enrolled, state.rows, state.meetingDate);
      if (problems.length) throw new ConflictException(`The plan is not ready for review. ${problems.join(' ')}`);
      if (state.plan.status !== 'DRAFT') throw new ConflictException('The plan is already ready for review or approved.');
      await tx.mentoringLearningPlan.update({ where: { id: state.plan.id }, data: { status: 'READY_FOR_REVIEW', updatedByUserId: userId } });
      await this.revise(tx, state.plan.id, 'MARKED_READY', null, userId);
      await this.history.record(tx, { activationId, type: 'MENTORING_LEARNING_PLAN_READY', actorUserId: userId });
      return { status: 'READY_FOR_REVIEW' as const };
    });
  }

  /** Approves the plan as it stands. Any later change reopens it and keeps this version in the history. */
  async approve(activationId: string, userId: string): Promise<{ status: 'APPROVED' }> {
    return this.prisma.$transaction(async (tx: PrismaTxClient) => {
      const activation = await loadLockedActivation(tx, activationId);
      MentoringAllocationService.assertAssignedMentor(activation, userId);
      assertWorkable(activation);
      this.assertOpen(activation);
      const state = await this.load(tx, activation);
      if (!state.plan || state.plan.status !== 'READY_FOR_REVIEW') throw new ConflictException('Mark the plan ready for review before approving it.');
      const problems = readinessProblems(state.enrolled, state.rows, state.meetingDate);
      if (problems.length) throw new ConflictException(`The plan changed and is not complete. ${problems.join(' ')}`);
      await tx.mentoringLearningPlan.update({ where: { id: state.plan.id }, data: { status: 'APPROVED', approvedByUserId: userId, approvedAt: new Date(), updatedByUserId: userId } });
      const version = await this.revise(tx, state.plan.id, 'APPROVED', null, userId);
      await this.history.record(tx, { activationId, type: 'MENTORING_LEARNING_PLAN_APPROVED', actorUserId: userId, payload: { version, endsOn: state.meetingDate } });
      return { status: 'APPROVED' as const };
    });
  }

  // ─── The monthly review meeting: called by the phase that schedules it, never from this stage ──────────────────
  /**
   * Records the monthly review meeting date and moves every subject plan's end date to it, in one transaction. A meeting
   * that is already scheduled is moved, not duplicated. An approved plan whose date moves goes back to ready for review.
   */
  async scheduleMonthlyReview(activationId: string, date: unknown, userId: string): Promise<{ meetingId: string; date: string; plansUpdated: number }> {
    return this.prisma.$transaction(async (tx: PrismaTxClient) => {
      const activation = await loadLockedActivation(tx, activationId);
      const state = await this.load(tx, activation);
      const problem = meetingDateProblem(date, [...state.rows.values()].map((r) => r.startsOn).filter((d): d is string => !!d));
      if (problem) throw new BadRequestException(problem);
      const next = date as string;
      const previous = state.meetingDate;
      if (state.meeting && previous === next) return { meetingId: state.meeting.id, date: next, plansUpdated: 0 };

      const meeting = state.meeting
        ? await tx.mentoringReviewMeeting.update({ where: { id: state.meeting.id }, data: { scheduledFor: new Date(next + "T00:00:00Z") } })
        : await tx.mentoringReviewMeeting.create({ data: { activationId, kind: MEETING_KIND, scheduledFor: new Date(next + "T00:00:00Z"), status: 'SCHEDULED', currentKey: `${activationId}:${MEETING_KIND}`, createdByUserId: userId } });
      await this.history.record(tx, { activationId, type: previous ? 'MENTORING_REVIEW_MEETING_RESCHEDULED' : 'MENTORING_REVIEW_MEETING_SCHEDULED', actorUserId: userId, payload: { meetingId: meeting.id, previousDate: previous, date: next } });

      let plansUpdated = 0;
      if (state.plan) {
        await this.followMeeting(tx, activationId, state, meeting.id, previous, next, userId, previous ? `The monthly review meeting moved from ${previous} to ${next}.` : `The monthly review meeting was scheduled for ${next}.`);
        plansUpdated = 1;
      }
      return { meetingId: meeting.id, date: next, plansUpdated };
    });
  }

  /** Cancels the scheduled meeting. The plan loses its end date and waits for the next meeting. */
  async cancelMonthlyReview(activationId: string, reason: string, userId: string): Promise<{ cancelled: boolean }> {
    return this.prisma.$transaction(async (tx: PrismaTxClient) => {
      const activation = await loadLockedActivation(tx, activationId);
      const state = await this.load(tx, activation);
      if (!state.meeting) return { cancelled: false };
      await tx.mentoringReviewMeeting.update({ where: { id: state.meeting.id }, data: { status: 'CANCELLED', currentKey: null } });
      await this.history.record(tx, { activationId, type: 'MENTORING_REVIEW_MEETING_CANCELLED', actorUserId: userId, reason, payload: { meetingId: state.meeting.id, date: state.meetingDate } });
      if (state.plan) await this.followMeeting(tx, activationId, state, null, state.meetingDate, null, userId, `The monthly review meeting on ${state.meetingDate} was cancelled. ${reason}`.trim());
      return { cancelled: true };
    });
  }

  private async followMeeting(tx: PrismaTxClient, activationId: string, state: Awaited<ReturnType<MentoringLearningPlanService['load']>>, meetingId: string | null, previous: string | null, next: string | null, userId: string, why: string) {
    const plan = state.plan as NonNullable<typeof state.plan>;
    for (const row of state.subjectRows) {
      const ends = syncedEndDate(dayOf(row.endsOn), previous, next);
      if (ends !== dayOf(row.endsOn)) await tx.mentoringLearningPlanSubject.update({ where: { id: row.id }, data: { endsOn: asDate(ends), updatedByUserId: userId } });
    }
    // An approved plan whose date moved, or lost its date, has to be looked at again. It is never silently kept.
    let nextStatus: 'DRAFT' | 'READY_FOR_REVIEW' | 'APPROVED' = plan.status as 'DRAFT' | 'READY_FOR_REVIEW' | 'APPROVED';
    if (plan.status === 'APPROVED') nextStatus = next ? 'READY_FOR_REVIEW' : 'DRAFT';
    else if (plan.status === 'READY_FOR_REVIEW' && !next) nextStatus = 'DRAFT';
    await tx.mentoringLearningPlan.update({ where: { id: plan.id }, data: { reviewMeetingId: meetingId, endsOn: asDate(next), status: nextStatus, ...(plan.status === 'APPROVED' ? { approvedByUserId: null, approvedAt: null } : {}), updatedByUserId: userId } });
    const version = await this.revise(tx, plan.id, 'REVIEW_DATE_SYNCED', why, userId);
    await this.history.record(tx, { activationId, type: 'MENTORING_LEARNING_PLAN_DATES_SYNCED', actorUserId: userId, reason: why, payload: { previousEndDate: previous, endDate: next, version, wasApproved: plan.status === 'APPROVED' } });
  }
}
