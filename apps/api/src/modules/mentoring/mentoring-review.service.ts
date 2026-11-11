import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';

import { PrismaService, PrismaTxClient } from '../../common/prisma/prisma.service';

import { EligibilityReason, ineligibleMessage, studentEligibility } from './class-eligibility';
import { MentoringAccessService, MentoringScope } from './mentoring-access.service';
import { MentoringAllocationService } from './mentoring-allocation.service';
import { loadLockedActivation } from './mentoring-guards';
import { MentoringHistoryService } from './mentoring-history.service';
import { MentoringLearningPlanService } from './mentoring-learning-plan.service';
import { localMomentOf } from './mentoring-sla';
import { MentoringSlaService } from './mentoring-sla.service';
import {
  ChecklistRow, GoalResult, MEETING_REMARK_FIELDS, MEETING_STATE_LABELS, MeetingState, NO_EXAMS_MESSAGE, POST_MEETING_FIELDS, Tally, checkActual, checkArea, checkFields, checkGoal, checkMove, checkNextPlan, checkSchedule, checklistProblems,
  completionChecklist, examAverage, goalsFromPlan, meetingState, nextPeriodStart, tally,
} from './review';

const ENTITY = 'MonthlyReview';
const asDate = (d: string) => new Date(`${d}T00:00:00Z`);
const dayOf = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : null);
const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));
const filled = (v: string | null | undefined) => !!v && v.trim().length > 0;

type MeetingRow = NonNullable<Awaited<ReturnType<PrismaTxClient['mentoringReviewMeeting']['findUnique']>>>;
type Activation = { id: string; handoverId: string | null; status: string; currentMentorUserId: string | null; studentId: string };

export interface ReviewSubjectView {
  subjectId: string;
  subjectName: string;
  planStart: string | null;
  planEnd: string | null;
  plan: { description: string; objectives: string; topics: string; outcomes: string };
  goals: Array<{ id: string; source: string; goal: string; expectedOutcome: string | null; actualProgress: string | null; result: GoalResult | null; evidence: string | null; improvementAreas: string | null; remainingGaps: string | null; evaluatedAt: string | null }>;
  tally: Tally;
  improvementAreas: Array<{ id: string; area: string }>;
  tutorObservation: { note: string; recordedAt: string } | null;
  tutorFeedback: Array<{ source: string; date: string; text: string }>;
  examAverage: number | null;
  nextPlan: { kind: string; description: string; objectives: string; topics: string; outcomes: string } | null;
}

export interface ReviewExamView {
  id: string;
  subjectId: string;
  subjectName: string;
  date: string;
  kind: string;
  title: string;
  conducted: boolean | null;
  marksObtained: number | null;
  maxMarks: number | null;
  percentage: number | null;
  chapters: string[];
  portion: string | null;
  weaknesses: string | null;
  topicsToImprove: string | null;
  tutorSuggestions: string | null;
  mentorRemarks: string | null;
}

export interface ReviewView {
  student: { id: string; name: string };
  mentorName: string | null;
  canWork: boolean;
  period: { planId: string | null; planStatus: string | null; start: string | null; end: string | null };
  meeting: null | {
    id: string; state: MeetingState; stateLabel: string; date: string; originalDate: string; startMinute: number | null; endMinute: number | null; status: string;
    conducted: boolean | null; notConductedReason: string | null; actual: { date: string; startMinute: number; endMinute: number } | null; attendees: string[]; participation: string | null; participationNote: string | null;
    examsReviewed: { at: string; note: string | null } | null; completedAt: string | null; nextPlanApproved: { at: string } | null;
  };
  exams: { items: ReviewExamView[]; message: string | null; warnings: string[] };
  subjects: ReviewSubjectView[];
  overall: Tally;
  remarks: Record<(typeof MEETING_REMARK_FIELDS)[number], string | null>;
  postMeeting: Record<(typeof POST_MEETING_FIELDS)[number], string | null> & { recordedAt: string | null };
  generalAreas: Array<{ id: string; area: string }>;
  checklist: ChecklistRow[];
  problems: string[];
  canComplete: boolean;
  previous: Array<{ meetingId: string; periodStart: string | null; periodEnd: string | null; date: string; completedAt: string | null }>;
  history?: Array<{ kind: string; at: string; actorUserId: string | null; reason: string | null; payload: unknown }>;
  notice: string | null;
}

/**
 * The monthly parent review. One live meeting per student, linked to the Individual Learning Plan it reviews. The review
 * collects the exam record of the period, the result of every goal, the remarks, what the parent said and the next plan, and
 * completes only when every item is recorded. Completing it ends the plan it reviewed and starts the next one.
 */
@Injectable()
export class MentoringReviewService {
  /** Reviews and meetings are operational only for an Active student. A paused or cancelled student keeps every earlier record. */
  private requireActive(activation: { status: string }, what: 'meetings' | 'the review' = 'the review') {
    const e = studentEligibility(activation);
    if (!e.eligible) throw new ConflictException(ineligibleMessage(e.reason as EligibilityReason, what));
  }

  constructor(
    private readonly prisma: PrismaService,
    private readonly access: MentoringAccessService,
    private readonly history: MentoringHistoryService,
    private readonly plans: MentoringLearningPlanService,
    private readonly sla: MentoringSlaService,
  ) {}

  private get db() {
    return this.prisma as unknown as PrismaTxClient;
  }

  private async today(db: PrismaTxClient, now: Date) {
    const w = await this.sla.workingNow(db, now);
    return localMomentOf(now, w.timeZone).date;
  }

  private async logEvent(tx: PrismaTxClient, meetingId: string, kind: string, actorUserId: string | null, reason: string | null = null, payload?: Record<string, unknown>) {
    await tx.mentoringReviewEvent.create({ data: { meetingId, kind, actorUserId, reason, payload: (payload ?? undefined) as never } });
  }

  /** The meeting, with the student's workflow locked and the caller checked to be the assigned Mentor. */
  private async guard(tx: PrismaTxClient, meetingId: string, userId: string, opts: { live?: boolean } = {}) {
    const found = (await tx.mentoringReviewMeeting.findUnique({ where: { id: meetingId } }));
    if (!found) throw new NotFoundException('Review not found');
    const activation = (await loadLockedActivation(tx, found.activationId)) as unknown as Activation;
    MentoringAllocationService.assertAssignedMentor(activation, userId);
    this.requireActive(activation, 'the review');
    const meeting = (await tx.mentoringReviewMeeting.findUnique({ where: { id: meetingId } })) as MeetingRow;
    if (opts.live !== false && meeting.status !== 'SCHEDULED') throw new ConflictException('This review is already completed or cancelled.');
    return { meeting, activation };
  }

  // ─── Reading ───────────────────────────────────────────────────────────────────────────────────────────────────
  /** The student's current review: the live meeting if there is one, with everything recorded so far. */
  async get(activationId: string, scope: MentoringScope, now: Date = new Date()): Promise<ReviewView> {
    this.access.requireAnyScope(scope);
    const activation = (await this.db.mentoringActivation.findFirst({ where: { AND: [{ id: activationId }, this.access.visibilityWhere(scope)] } })) as unknown as Activation | null;
    if (!activation) throw new NotFoundException('Student not found');
    const meeting = (await this.db.mentoringReviewMeeting.findFirst({ where: { activationId, kind: 'MONTHLY_REVIEW', status: 'SCHEDULED' } }));
    return this.build(this.db, activation, meeting, scope, now, false);
  }

  /** One review, completed or not, with its history. */
  async detail(meetingId: string, scope: MentoringScope, now: Date = new Date()): Promise<ReviewView> {
    this.access.requireAnyScope(scope);
    const meeting = (await this.db.mentoringReviewMeeting.findUnique({ where: { id: meetingId } }));
    const activation = meeting ? ((await this.db.mentoringActivation.findFirst({ where: { AND: [{ id: meeting.activationId }, this.access.visibilityWhere(scope)] } })) as unknown as Activation | null) : null;
    if (!meeting || !activation) throw new NotFoundException('Review not found');
    return this.build(this.db, activation, meeting, scope, now, true);
  }

  private async build(db: PrismaTxClient, activation: Activation, meeting: MeetingRow | null, scope: MentoringScope | null, now: Date, withHistory: boolean): Promise<ReviewView> {
    const student = await db.student.findUnique({ where: { id: activation.studentId } });
    const mentor = activation.currentMentorUserId ? await db.employee.findUnique({ where: { userId: activation.currentMentorUserId } }) : null;
    const state = await this.plans.period(db, activation);
    const completed = meeting?.status === 'COMPLETED';
    const planId = completed ? meeting?.planId ?? null : state.plan?.id ?? null;
    const planRow = planId ? await db.mentoringLearningPlan.findUnique({ where: { id: planId } }) : null;
    const rows = planId ? await db.mentoringLearningPlanSubject.findMany({ where: { planId } }) : [];
    const subjectRows = completed ? rows : rows.filter((r) => state.enrolled.some((s) => s.subjectId === r.subjectId));
    const subjectNames = new Map((await db.subject.findMany({ where: { id: { in: subjectRows.map((r) => r.subjectId) } } })).map((s) => [s.id, s.name]));
    const starts = subjectRows.map((r) => dayOf(r.startsOn)).filter((d): d is string => !!d).sort();
    const periodStart = completed ? dayOf(meeting?.periodStart) : starts[0] ?? null;
    const meetingDate = meeting ? dayOf(meeting.scheduledFor) : null;
    const periodEnd = completed ? dayOf(meeting?.periodEnd) : meetingDate;

    const [goals, areas, notes, nextPlans, events] = meeting
      ? await Promise.all([
        db.mentoringReviewGoal.findMany({ where: { meetingId: meeting.id } }), db.mentoringReviewImprovementArea.findMany({ where: { meetingId: meeting.id } }),
        db.mentoringReviewTutorNote.findMany({ where: { meetingId: meeting.id } }), db.mentoringReviewNextPlan.findMany({ where: { meetingId: meeting.id } }),
        withHistory ? db.mentoringReviewEvent.findMany({ where: { meetingId: meeting.id } }) : [],
      ])
      : [[], [], [], [], []];

    // The exams of this learning period, and nothing outside it. Nothing is invented for an exam without marks.
    const examRows = periodStart && periodEnd ? await db.mentoringExam.findMany({ where: { activationId: activation.id, date: { gte: asDate(periodStart), lte: asDate(periodEnd) } }, orderBy: { date: 'asc' } }) : [];
    const exams: ReviewExamView[] = examRows
      .map((e) => ({
        id: e.id, subjectId: e.subjectId, subjectName: subjectNames.get(e.subjectId) ?? 'Subject', date: dayOf(e.date) as string, kind: e.kind, title: e.title, conducted: e.conducted,
        marksObtained: num(e.marksObtained), maxMarks: num(e.maxMarks), percentage: num(e.percentage), chapters: e.chapters, portion: e.portion,
        weaknesses: e.weaknesses, topicsToImprove: e.topicsToImprove, tutorSuggestions: e.tutorSuggestions, mentorRemarks: e.mentorRemarks,
      }))
      .sort((a, b) => a.subjectName.localeCompare(b.subjectName) || a.date.localeCompare(b.date));
    const sessions = periodStart && periodEnd && subjectRows.length
      ? await db.mentoringClassSession.findMany({ where: { activationId: activation.id, subjectId: { in: subjectRows.map((r) => r.subjectId) }, date: { gte: asDate(periodStart), lte: asDate(periodEnd) }, status: { in: ['VERIFIED', 'AWAITING_MENTOR_VERIFICATION'] } }, orderBy: { date: 'asc' } })
      : [];

    const subjects: ReviewSubjectView[] = subjectRows.map((r) => {
      const mine = goals.filter((g) => g.subjectId === r.subjectId).sort((a, b) => a.position - b.position);
      const note = notes.find((n) => n.subjectId === r.subjectId);
      const next = nextPlans.find((n) => n.subjectId === r.subjectId);
      const examsOf = exams.filter((e) => e.subjectId === r.subjectId);
      const feedback = [
        ...examsOf.filter((e) => filled(e.tutorSuggestions)).map((e) => ({ source: `Exam, ${e.title}`, date: e.date, text: e.tutorSuggestions as string })),
        ...sessions.filter((s) => s.subjectId === r.subjectId && filled(s.evaluationRemarks)).map((s) => ({ source: 'Class update', date: dayOf(s.date) as string, text: s.evaluationRemarks as string })),
      ].sort((a, b) => a.date.localeCompare(b.date)).slice(-10);
      return {
        subjectId: r.subjectId, subjectName: subjectNames.get(r.subjectId) ?? 'Subject', planStart: dayOf(r.startsOn), planEnd: dayOf(r.endsOn),
        plan: { description: r.description, objectives: r.objectives, topics: r.topics, outcomes: r.outcomes },
        goals: mine.map((g) => ({ id: g.id, source: g.source, goal: g.goal, expectedOutcome: g.expectedOutcome, actualProgress: g.actualProgress, result: g.result as GoalResult | null, evidence: g.evidence, improvementAreas: g.improvementAreas, remainingGaps: g.remainingGaps, evaluatedAt: g.evaluatedAt?.toISOString() ?? null })),
        tally: tally(mine.map((g) => g.result as GoalResult | null)),
        improvementAreas: areas.filter((a) => a.subjectId === r.subjectId).map((a) => ({ id: a.id, area: a.area })),
        tutorObservation: note ? { note: note.note, recordedAt: note.updatedAt.toISOString() } : null,
        tutorFeedback: feedback,
        examAverage: examAverage(examsOf.map((e) => ({ id: e.id, subjectId: e.subjectId, date: e.date, kind: e.kind, conducted: e.conducted, marks: e.percentage === null ? null : { obtained: e.marksObtained as number, max: e.maxMarks as number, percentage: e.percentage } }))),
        nextPlan: next ? { kind: next.kind, description: next.description, objectives: next.objectives, topics: next.topics, outcomes: next.outcomes } : null,
      };
    });

    const facts = meeting
      ? {
        conducted: meeting.conducted, actualRecorded: meeting.actualDate !== null && meeting.actualStartMinute !== null && meeting.actualEndMinute !== null && meeting.attendees.length > 0 && meeting.parentParticipation !== null,
        examsReviewed: meeting.examsReviewedAt !== null, hasPlan: !!planRow && subjectRows.length > 0,
        subjects: subjects.map((s) => ({ subjectId: s.subjectId, name: s.subjectName, goals: s.goals.map((g) => ({ result: g.result, actualProgress: g.actualProgress })), tutorObserved: s.tutorObservation !== null, nextPlanned: s.nextPlan !== null })),
        improvementAreas: areas.length, noImprovementReason: filled(meeting.noImprovementReason),
        expectationsRecorded: [meeting.expHomePractice, meeting.expParentInvolvement, meeting.expStudyRoutine, meeting.expAttendanceSupport, meeting.expOther].some(filled),
        parentCommunicationRecorded: filled(meeting.parentCommunicated), mentorObserved: filled(meeting.mentorObservations), nextPlanApproved: meeting.nextPlanApprovedAt !== null,
      }
      : null;
    const checklist = facts ? completionChecklist(facts) : [];
    const problems = checklistProblems(checklist);
    const mstate = meetingState({ status: meeting ? (meeting.status) : null, date: meetingDate, originalDate: dayOf(meeting?.originalDate) ?? meetingDate, conducted: meeting?.conducted ?? null });
    const previous = (await db.mentoringReviewMeeting.findMany({ where: { activationId: activation.id, status: 'COMPLETED' }, orderBy: { scheduledFor: 'desc' } })).filter((m) => m.id !== meeting?.id);
    const marksMissing = exams.filter((e) => e.conducted === true && e.marksObtained === null).length;
    const get = <K extends string>(keys: readonly K[]) => Object.fromEntries(keys.map((k) => [k, (meeting as unknown as Record<string, string | null>)?.[k] ?? null])) as Record<K, string | null>;
    const operational = studentEligibility(activation).eligible;
    return {
      student: { id: activation.studentId, name: student ? `${student.firstName} ${student.lastName ?? ''}`.trim() : 'Student' },
      mentorName: mentor ? `${mentor.firstName} ${mentor.lastName}`.trim() : null,
      canWork: !!scope && activation.currentMentorUserId === scope.userId && scope.perms.has('mentoring.stage.work') && operational && (!meeting || meeting.status === 'SCHEDULED'),
      period: { planId, planStatus: planRow?.status ?? null, start: periodStart, end: periodEnd },
      meeting: meeting ? {
        id: meeting.id, state: mstate, stateLabel: MEETING_STATE_LABELS[mstate], date: meetingDate as string, originalDate: (dayOf(meeting.originalDate) ?? meetingDate) as string, startMinute: meeting.scheduledStartMinute, endMinute: meeting.scheduledEndMinute, status: meeting.status,
        conducted: meeting.conducted, notConductedReason: meeting.notConductedReason,
        actual: meeting.actualDate && meeting.actualStartMinute !== null && meeting.actualEndMinute !== null ? { date: dayOf(meeting.actualDate) as string, startMinute: meeting.actualStartMinute, endMinute: meeting.actualEndMinute } : null,
        attendees: meeting.attendees, participation: meeting.parentParticipation, participationNote: meeting.parentParticipationNote,
        examsReviewed: meeting.examsReviewedAt ? { at: meeting.examsReviewedAt.toISOString(), note: meeting.examsReviewNote } : null,
        completedAt: meeting.completedAt?.toISOString() ?? null, nextPlanApproved: meeting.nextPlanApprovedAt ? { at: meeting.nextPlanApprovedAt.toISOString() } : null,
      } : null,
      exams: {
        items: exams, message: exams.length === 0 ? (periodStart && periodEnd ? NO_EXAMS_MESSAGE : 'Schedule the review meeting to set the end of the learning period. The exams of the period appear then.') : null,
        warnings: marksMissing ? [`${marksMissing} ${marksMissing === 1 ? 'exam was' : 'exams were'} sat and ${marksMissing === 1 ? 'has' : 'have'} no marks recorded yet.`] : [],
      },
      subjects, overall: tally(subjects.flatMap((s) => s.goals.map((g) => g.result))),
      remarks: get(MEETING_REMARK_FIELDS),
      postMeeting: { ...get(POST_MEETING_FIELDS), recordedAt: meeting?.postMeetingRecordedAt?.toISOString() ?? null },
      generalAreas: areas.filter((a) => a.subjectId === null).map((a) => ({ id: a.id, area: a.area })),
      checklist, problems, canComplete: !!meeting && meeting.status === 'SCHEDULED' && problems.length === 0,
      previous: previous.map((m) => ({ meetingId: m.id, periodStart: dayOf(m.periodStart), periodEnd: dayOf(m.periodEnd), date: dayOf(m.actualDate) ?? (dayOf(m.scheduledFor) as string), completedAt: m.completedAt?.toISOString() ?? null })),
      ...(withHistory ? { history: events.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime()).map((v) => ({ kind: v.kind, at: v.createdAt.toISOString(), actorUserId: v.actorUserId, reason: v.reason, payload: v.payload })) } : {}),
      notice: !meeting ? 'No monthly review meeting is scheduled.' : null,
    };
  }

  // ─── The meeting ───────────────────────────────────────────────────────────────────────────────────────────────
  /** Schedules the monthly review meeting for the student's current learning plan. Its date becomes the end date of that plan. */
  async schedule(activationId: string, body: unknown, userId: string, now: Date = new Date()) {
    return this.prisma.$transaction(async (tx: PrismaTxClient) => {
      const activation = (await loadLockedActivation(tx, activationId)) as unknown as Activation;
      MentoringAllocationService.assertAssignedMentor(activation, userId);
      this.requireActive(activation, 'meetings');
      const checked = checkSchedule(body);
      if (!checked.ok) throw new BadRequestException(checked.message);
      const v = checked.value;
      const state = await this.plans.period(tx, activation);
      if (state.meeting) throw new ConflictException('A monthly review meeting is already scheduled. Reschedule it instead.');
      const planned = state.subjectRows.filter((r) => state.enrolled.some((s) => s.subjectId === r.subjectId));
      if (!state.plan || planned.length === 0) throw new ConflictException('Write the Individual Learning Plan first. The review is linked to it.');
      if (v.date < (await this.today(tx, now))) throw new ConflictException('Choose today or a later date for the meeting.');
      const made = await this.plans.scheduleInTx(tx, activationId, v.date, userId);
      await tx.mentoringReviewMeeting.update({ where: { id: made.meetingId }, data: { planId: state.plan.id, originalDate: asDate(v.date), scheduledStartMinute: v.startMinute, scheduledEndMinute: v.endMinute } });
      await this.logEvent(tx, made.meetingId, 'SCHEDULED', userId, null, { date: v.date, startMinute: v.startMinute, endMinute: v.endMinute, planId: state.plan.id });
      return { meetingId: made.meetingId, date: v.date };
    });
  }

  private async tutorsOf(tx: PrismaTxClient, activationId: string) {
    const out = new Set<string>();
    for (const a of await tx.mentoringTutorAssignment.findMany({ where: { activationId, status: { in: ['ACTIVE', 'NEEDS_REVIEW'] } } })) {
      const profile = await tx.tutorProfile.findUnique({ where: { id: a.tutorProfileId } });
      const e = profile ? await tx.employee.findUnique({ where: { id: profile.employeeId } }) : null;
      if (e) out.add(e.userId);
    }
    return [...out];
  }

  /** Moves the meeting. The first date is kept, the plan end dates follow the new date, the tutors are told in the app, and the history keeps it. */
  async reschedule(meetingId: string, body: unknown, userId: string, now: Date = new Date()) {
    return this.prisma.$transaction(async (tx: PrismaTxClient) => {
      const { meeting, activation } = await this.guard(tx, meetingId, userId);
      if (meeting.conducted === true) throw new ConflictException('The meeting has been held, so it cannot be rescheduled.');
      const checked = checkMove(body);
      if (!checked.ok) throw new BadRequestException(checked.message);
      const m = checked.value;
      const before = { date: dayOf(meeting.scheduledFor) as string, startMinute: meeting.scheduledStartMinute, endMinute: meeting.scheduledEndMinute };
      if (m.date === before.date && m.startMinute === before.startMinute && m.endMinute === before.endMinute) throw new ConflictException('That is the time the meeting already has.');
      if (m.date < (await this.today(tx, now))) throw new ConflictException('Choose today or a later date.');
      let plansUpdated = 0;
      if (m.date !== before.date) plansUpdated = (await this.plans.scheduleInTx(tx, activation.id, m.date, userId)).plansUpdated;
      await tx.mentoringReviewMeeting.update({ where: { id: meetingId }, data: { scheduledStartMinute: m.startMinute, scheduledEndMinute: m.endMinute, originalDate: meeting.originalDate ?? asDate(before.date), conducted: null, conductedAt: null, conductedByUserId: null } });
      const told: string[] = [];
      for (const tutor of await this.tutorsOf(tx, activation.id)) {
        await tx.notification.create({ data: { recipientUserId: tutor, type: 'MENTORING_REVIEW_RESCHEDULED', entityType: ENTITY, entityId: meetingId, action: '/tutor-portal', message: `The monthly review meeting was moved from ${before.date} to ${m.date}. Reason: ${m.reason}`, dedupeKey: `review:${meetingId}:${(await tx.mentoringReviewEvent.findMany({ where: { meetingId } })).length}:${tutor}` } });
        told.push(tutor);
      }
      await this.logEvent(tx, meetingId, 'RESCHEDULED', userId, m.reason, { from: before, to: { date: m.date, startMinute: m.startMinute, endMinute: m.endMinute }, requestedByUserId: userId, notified: { inApp: told, parent: 'The Mentor tells the parent. Not delivered by the app.' }, planEndDatesMoved: plansUpdated > 0 });
      await this.history.record(tx, { activationId: activation.id, type: 'MENTORING_REVIEW_RESCHEDULED_BY_MENTOR', actorUserId: userId, reason: m.reason, payload: { meetingId, from: before.date, to: m.date } });
      return { meetingId, from: before, to: { date: m.date, startMinute: m.startMinute, endMinute: m.endMinute }, notified: told.length, planEndDatesMoved: plansUpdated > 0 };
    });
  }

  /** Cancels the meeting. The plan loses its end date until a new meeting is scheduled. */
  async cancel(meetingId: string, reason: unknown, userId: string) {
    return this.prisma.$transaction(async (tx: PrismaTxClient) => {
      const { meeting, activation } = await this.guard(tx, meetingId, userId);
      const why = typeof reason === 'string' ? reason.trim() : '';
      if (!why) throw new BadRequestException('Say why the meeting is being cancelled.');
      if (why.length > 1000) throw new BadRequestException('The reason must be 1000 characters or fewer.');
      if (meeting.conducted === true) throw new ConflictException('The meeting has been held, so it cannot be cancelled. Complete the review instead.');
      await this.plans.cancelInTx(tx, activation.id, why, userId);
      await this.logEvent(tx, meetingId, 'CANCELLED', userId, why);
      return { meetingId, cancelled: true };
    });
  }

  /** Records that the meeting was held, or that it was not (with a reason). Not before its date. */
  async recordConducted(meetingId: string, body: { conducted?: unknown; reason?: unknown }, userId: string, now: Date = new Date()) {
    return this.prisma.$transaction(async (tx: PrismaTxClient) => {
      const { meeting } = await this.guard(tx, meetingId, userId);
      if (typeof body.conducted !== 'boolean') throw new BadRequestException('Say whether the meeting was held.');
      if ((dayOf(meeting.scheduledFor) as string) > (await this.today(tx, now))) throw new ConflictException('The meeting has not happened yet.');
      const reason = typeof body.reason === 'string' ? body.reason.trim() : '';
      if (!body.conducted && !reason) throw new BadRequestException('Say why the meeting was not held.');
      if (reason.length > 1000) throw new BadRequestException('The reason must be 1000 characters or fewer.');
      await tx.mentoringReviewMeeting.update({ where: { id: meetingId }, data: { conducted: body.conducted, conductedAt: now, conductedByUserId: userId, notConductedReason: body.conducted ? null : reason } });
      await this.logEvent(tx, meetingId, body.conducted ? 'CONDUCTED' : 'NOT_CONDUCTED', userId, reason || null, { before: meeting.conducted });
      return { meetingId, conducted: body.conducted };
    });
  }

  /** The actual meeting details: the real date and times, who attended, and whether the parent took part. */
  async recordActual(meetingId: string, body: unknown, userId: string, now: Date = new Date()) {
    return this.prisma.$transaction(async (tx: PrismaTxClient) => {
      const { meeting } = await this.guard(tx, meetingId, userId);
      if (meeting.conducted !== true) throw new ConflictException('Record that the meeting was held first.');
      const checked = checkActual(body, await this.today(tx, now));
      if (!checked.ok) throw new BadRequestException(checked.message);
      const a = checked.value;
      await tx.mentoringReviewMeeting.update({ where: { id: meetingId }, data: { actualDate: asDate(a.actualDate), actualStartMinute: a.startMinute, actualEndMinute: a.endMinute, attendees: a.attendees, parentParticipation: a.participation, parentParticipationNote: a.participationNote } });
      await this.logEvent(tx, meetingId, 'ACTUAL_RECORDED', userId, null, { date: a.actualDate, startMinute: a.startMinute, endMinute: a.endMinute, attendees: a.attendees, participation: a.participation });
      return { meetingId };
    });
  }

  /** The Mentor says the exam record of the period was reviewed, or that there were no exams. Nothing is concluded for them. */
  async reviewExams(meetingId: string, note: unknown, userId: string, now: Date = new Date()) {
    return this.prisma.$transaction(async (tx: PrismaTxClient) => {
      const { meeting, activation } = await this.guard(tx, meetingId, userId);
      const text = typeof note === 'string' ? note.trim() : '';
      if (text.length > 1000) throw new BadRequestException('The note must be 1000 characters or fewer.');
      const view = await this.build(tx, activation, meeting, null, now, false);
      await tx.mentoringReviewMeeting.update({ where: { id: meetingId }, data: { examsReviewedAt: now, examsReviewedByUserId: userId, examsReviewNote: text || null } });
      await this.logEvent(tx, meetingId, 'EXAMS_REVIEWED', userId, text || null, { examCount: view.exams.items.length, noExams: view.exams.items.length === 0 });
      return { meetingId, examCount: view.exams.items.length };
    });
  }

  // ─── Goals ─────────────────────────────────────────────────────────────────────────────────────────────────────
  private async subjectOfPlan(tx: PrismaTxClient, activation: Activation, subjectId: string) {
    const state = await this.plans.period(tx, activation);
    const row = state.subjectRows.find((r) => r.subjectId === subjectId && state.enrolled.some((s) => s.subjectId === subjectId));
    if (!row) throw new BadRequestException('This subject is not in the current learning plan.');
    return row;
  }

  /** Takes the goals written in each subject plan as the goals to evaluate. A subject that already has goals is left as it is. */
  async seedGoals(meetingId: string, userId: string) {
    return this.prisma.$transaction(async (tx: PrismaTxClient) => {
      const { meeting, activation } = await this.guard(tx, meetingId, userId);
      const state = await this.plans.period(tx, activation);
      let added = 0;
      for (const row of state.subjectRows.filter((r) => state.enrolled.some((s) => s.subjectId === r.subjectId))) {
        if ((await tx.mentoringReviewGoal.findMany({ where: { meetingId, subjectId: row.subjectId } })).length > 0) continue;
        const goals = goalsFromPlan(row.objectives, row.description);
        for (const [i, goal] of goals.entries()) {
          await tx.mentoringReviewGoal.create({ data: { meetingId, subjectId: row.subjectId, source: 'PLAN', position: i, goal, expectedOutcome: row.outcomes.trim() && goals.length === 1 ? row.outcomes.trim() : null } });
          added += 1;
        }
      }
      await this.logEvent(tx, meetingId, 'GOALS_TAKEN_FROM_PLAN', userId, null, { added });
      void meeting;
      return { meetingId, added };
    });
  }

  async addGoal(meetingId: string, subjectId: string, body: unknown, userId: string, now: Date = new Date()) {
    return this.prisma.$transaction(async (tx: PrismaTxClient) => {
      const { activation } = await this.guard(tx, meetingId, userId);
      await this.subjectOfPlan(tx, activation, subjectId);
      const checked = checkGoal(body);
      if (!checked.ok) throw new BadRequestException(checked.message);
      const g = checked.value;
      const position = (await tx.mentoringReviewGoal.findMany({ where: { meetingId, subjectId } })).length;
      const made = await tx.mentoringReviewGoal.create({ data: { meetingId, subjectId, source: 'MENTOR', position, goal: g.goal, expectedOutcome: g.expectedOutcome, actualProgress: g.actualProgress, result: g.result, evidence: g.evidence, improvementAreas: g.improvementAreas, remainingGaps: g.remainingGaps, evaluatedAt: g.result ? now : null, evaluatedByUserId: g.result ? userId : null } });
      await this.logEvent(tx, meetingId, 'GOAL_ADDED', userId, null, { goalId: made.id, subjectId });
      return { goalId: made.id };
    });
  }

  private async goalOf(tx: PrismaTxClient, goalId: string, userId: string) {
    const goal = await tx.mentoringReviewGoal.findUnique({ where: { id: goalId } });
    if (!goal) throw new NotFoundException('Goal not found');
    const guarded = await this.guard(tx, goal.meetingId, userId);
    return { goal, ...guarded };
  }

  /** Evaluates one goal: its expected outcome, the actual progress, the result, the evidence, improvement areas and gaps. */
  async updateGoal(goalId: string, body: unknown, userId: string, now: Date = new Date()) {
    return this.prisma.$transaction(async (tx: PrismaTxClient) => {
      const { goal, meeting } = await this.goalOf(tx, goalId, userId);
      const checked = checkGoal(body);
      if (!checked.ok) throw new BadRequestException(checked.message);
      const g = checked.value;
      await tx.mentoringReviewGoal.update({ where: { id: goalId }, data: { goal: g.goal, expectedOutcome: g.expectedOutcome, actualProgress: g.actualProgress, result: g.result, evidence: g.evidence, improvementAreas: g.improvementAreas, remainingGaps: g.remainingGaps, evaluatedAt: g.result ? now : null, evaluatedByUserId: g.result ? userId : null } });
      await this.logEvent(tx, meeting.id, 'GOAL_EVALUATED', userId, null, { goalId, subjectId: goal.subjectId, from: goal.result, to: g.result });
      return { goalId, result: g.result };
    });
  }

  async deleteGoal(goalId: string, userId: string) {
    return this.prisma.$transaction(async (tx: PrismaTxClient) => {
      const { goal, meeting } = await this.goalOf(tx, goalId, userId);
      await tx.mentoringReviewGoal.delete({ where: { id: goalId } });
      await this.logEvent(tx, meeting.id, 'GOAL_REMOVED', userId, null, { goal: goal.goal, subjectId: goal.subjectId, result: goal.result });
      return { goalId };
    });
  }

  // ─── Improvement areas, tutor observations and remarks ────────────────────────────────────────────────────────
  async addArea(meetingId: string, body: unknown, userId: string) {
    return this.prisma.$transaction(async (tx: PrismaTxClient) => {
      const { activation } = await this.guard(tx, meetingId, userId);
      const checked = checkArea(body);
      if (!checked.ok) throw new BadRequestException(checked.message);
      if (checked.value.subjectId) await this.subjectOfPlan(tx, activation, checked.value.subjectId);
      const made = await tx.mentoringReviewImprovementArea.create({ data: { meetingId, subjectId: checked.value.subjectId, area: checked.value.area, createdByUserId: userId } });
      await this.logEvent(tx, meetingId, 'AREA_ADDED', userId, null, { areaId: made.id, subjectId: checked.value.subjectId });
      return { areaId: made.id };
    });
  }

  async deleteArea(areaId: string, userId: string) {
    return this.prisma.$transaction(async (tx: PrismaTxClient) => {
      const area = await tx.mentoringReviewImprovementArea.findUnique({ where: { id: areaId } });
      if (!area) throw new NotFoundException('Improvement area not found');
      await this.guard(tx, area.meetingId, userId);
      await tx.mentoringReviewImprovementArea.delete({ where: { id: areaId } });
      await this.logEvent(tx, area.meetingId, 'AREA_REMOVED', userId, null, { area: area.area, subjectId: area.subjectId });
      return { areaId };
    });
  }

  /** What the subject tutor told the Mentor about the student for this review. The Mentor records it, so it says who recorded it. */
  async saveTutorNote(meetingId: string, subjectId: string, note: unknown, userId: string) {
    return this.prisma.$transaction(async (tx: PrismaTxClient) => {
      const { activation } = await this.guard(tx, meetingId, userId);
      await this.subjectOfPlan(tx, activation, subjectId);
      const text = typeof note === 'string' ? note.trim() : '';
      if (!text) throw new BadRequestException("Write what the tutor said about this subject.");
      if (text.length > 2000) throw new BadRequestException('The tutor observation must be 2000 characters or fewer.');
      const assignment = await tx.mentoringTutorAssignment.findFirst({ where: { activationId: activation.id, subjectId, status: { in: ['ACTIVE', 'NEEDS_REVIEW'] } } });
      const profile = assignment ? await tx.tutorProfile.findUnique({ where: { id: assignment.tutorProfileId } }) : null;
      const employee = profile ? await tx.employee.findUnique({ where: { id: profile.employeeId } }) : null;
      const existing = await tx.mentoringReviewTutorNote.findFirst({ where: { meetingId, subjectId } });
      const data = { note: text, tutorUserId: employee?.userId ?? null, recordedByUserId: userId };
      if (existing) await tx.mentoringReviewTutorNote.update({ where: { id: existing.id }, data });
      else await tx.mentoringReviewTutorNote.create({ data: { meetingId, subjectId, ...data } });
      await this.logEvent(tx, meetingId, 'TUTOR_OBSERVATION_RECORDED', userId, null, { subjectId });
      return { meetingId, subjectId };
    });
  }

  private async saveFields(meetingId: string, body: unknown, allowed: readonly string[], userId: string, kind: string, extra: (now: Date) => Record<string, unknown> = () => ({}), now: Date = new Date()) {
    return this.prisma.$transaction(async (tx: PrismaTxClient) => {
      await this.guard(tx, meetingId, userId);
      const checked = checkFields(body, allowed);
      if (!checked.ok) throw new BadRequestException(checked.message);
      await tx.mentoringReviewMeeting.update({ where: { id: meetingId }, data: { ...Object.fromEntries(Object.entries(checked.value).map(([k, v]) => [k, v || null])), ...extra(now) } });
      await this.logEvent(tx, meetingId, kind, userId, null, { changed: Object.keys(checked.value) });
      return { meetingId, changed: Object.keys(checked.value) };
    });
  }

  /** What improved, the expectations from the parent, the Mentor observations and the reason there are no improvement areas. */
  saveRemarks(meetingId: string, body: unknown, userId: string) {
    return this.saveFields(meetingId, body, MEETING_REMARK_FIELDS, userId, 'REMARKS_RECORDED');
  }

  /** What the parent said after the meeting, kept apart from the Mentor and tutor observations. Only after the meeting was held. */
  async savePostMeeting(meetingId: string, body: unknown, userId: string, now: Date = new Date()) {
    const found = await this.db.mentoringReviewMeeting.findUnique({ where: { id: meetingId } });
    if (found && found.conducted !== true) throw new ConflictException('Record that the meeting was held first.');
    return this.saveFields(meetingId, body, POST_MEETING_FIELDS, userId, 'POST_MEETING_RECORDED', (n) => ({ postMeetingRecordedAt: n, postMeetingRecordedByUserId: userId }), now);
  }

  // ─── The next plan ─────────────────────────────────────────────────────────────────────────────────────────────
  /** Starts the next plan of each subject from the current plan, as continued goals, for the Mentor to change. A subject already written is left alone. */
  async copyNextPlan(meetingId: string, userId: string) {
    return this.prisma.$transaction(async (tx: PrismaTxClient) => {
      const { meeting, activation } = await this.guard(tx, meetingId, userId);
      const state = await this.plans.period(tx, activation);
      let added = 0;
      for (const r of state.subjectRows.filter((x) => state.enrolled.some((s) => s.subjectId === x.subjectId))) {
        if (await tx.mentoringReviewNextPlan.findFirst({ where: { meetingId, subjectId: r.subjectId } })) continue;
        await tx.mentoringReviewNextPlan.create({ data: { meetingId, subjectId: r.subjectId, kind: 'CONTINUED', description: r.description, objectives: r.objectives, topics: r.topics, outcomes: r.outcomes, updatedByUserId: userId } });
        added += 1;
      }
      if (added) await tx.mentoringReviewMeeting.update({ where: { id: meetingId }, data: { nextPlanApprovedAt: null, nextPlanApprovedByUserId: null } });
      await this.logEvent(tx, meetingId, 'NEXT_PLAN_STARTED_FROM_CURRENT', userId, null, { added });
      void meeting;
      return { meetingId, added };
    });
  }

  /** Writes the next plan of one subject. Any change takes the approval of the next plan away. Only subjects of the saved schedule: a new subject needs the schedule changed first. */
  async saveNextPlan(meetingId: string, subjectId: string, body: unknown, userId: string) {
    return this.prisma.$transaction(async (tx: PrismaTxClient) => {
      const { meeting, activation } = await this.guard(tx, meetingId, userId);
      const state = await this.plans.period(tx, activation);
      if (!state.enrolled.some((s) => s.subjectId === subjectId)) throw new BadRequestException("This subject is not in the student's saved schedule. Add it to the schedule first. A new subject cannot be added from a review.");
      const checked = checkNextPlan(body);
      if (!checked.ok) throw new BadRequestException(checked.message);
      const v = checked.value;
      const existing = await tx.mentoringReviewNextPlan.findFirst({ where: { meetingId, subjectId } });
      const data = { kind: v.kind, description: v.description, objectives: v.objectives, topics: v.topics, outcomes: v.outcomes, updatedByUserId: userId };
      if (existing) await tx.mentoringReviewNextPlan.update({ where: { id: existing.id }, data });
      else await tx.mentoringReviewNextPlan.create({ data: { meetingId, subjectId, ...data } });
      const wasApproved = meeting.nextPlanApprovedAt !== null;
      if (wasApproved) await tx.mentoringReviewMeeting.update({ where: { id: meetingId }, data: { nextPlanApprovedAt: null, nextPlanApprovedByUserId: null } });
      await this.logEvent(tx, meetingId, 'NEXT_PLAN_SAVED', userId, null, { subjectId, kind: v.kind, approvalWithdrawn: wasApproved });
      return { meetingId, subjectId, approvalWithdrawn: wasApproved };
    });
  }

  /** Approves the next plan as it stands. Every subject needs its next plan first. */
  async approveNextPlan(meetingId: string, userId: string, now: Date = new Date()) {
    return this.prisma.$transaction(async (tx: PrismaTxClient) => {
      const { meeting, activation } = await this.guard(tx, meetingId, userId);
      const state = await this.plans.period(tx, activation);
      const subjects = state.subjectRows.filter((r) => state.enrolled.some((s) => s.subjectId === r.subjectId));
      const names = new Map((await tx.subject.findMany({ where: { id: { in: subjects.map((s) => s.subjectId) } } })).map((s) => [s.id, s.name]));
      const rows = await tx.mentoringReviewNextPlan.findMany({ where: { meetingId } });
      const missing = subjects.filter((s) => !rows.some((r) => r.subjectId === s.subjectId)).map((s) => names.get(s.subjectId) ?? 'a subject');
      if (subjects.length === 0 || missing.length) throw new ConflictException(`Write the next plan for ${missing.join(', ') || 'every subject'} first.`);
      await tx.mentoringReviewMeeting.update({ where: { id: meetingId }, data: { nextPlanApprovedAt: now, nextPlanApprovedByUserId: userId } });
      await this.logEvent(tx, meetingId, 'NEXT_PLAN_APPROVED', userId);
      void meeting;
      return { meetingId };
    });
  }

  // ─── Completing the review ─────────────────────────────────────────────────────────────────────────────────────
  /**
   * Completes the review. Every item of the checklist must be recorded. Then, in one step, the reviewed plan ends (kept as it was),
   * the next plan becomes the live plan, starting the day after the reviewed period, and the review is closed.
   */
  async complete(meetingId: string, userId: string, now: Date = new Date()) {
    return this.prisma.$transaction(async (tx: PrismaTxClient) => {
      const { meeting, activation } = await this.guard(tx, meetingId, userId);
      const view = await this.build(tx, activation, meeting, null, now, false);
      if (view.problems.length) throw new ConflictException(`The review cannot be completed yet. ${view.problems.join(' ')}`);
      const end = dayOf(meeting.scheduledFor) as string;
      const rows = await tx.mentoringReviewNextPlan.findMany({ where: { meetingId } });
      const renewed = await this.plans.renewInTx(tx, activation, {
        rows: view.subjects.map((s) => {
          const n = rows.find((r) => r.subjectId === s.subjectId) as NonNullable<(typeof rows)[number]>;
          return { subjectId: s.subjectId, description: n.description, objectives: n.objectives, topics: n.topics, outcomes: n.outcomes };
        }),
        startsOn: nextPeriodStart(end), userId, now,
      });
      await tx.mentoringReviewMeeting.update({ where: { id: meetingId }, data: { status: 'COMPLETED', currentKey: null, completedAt: now, completedByUserId: userId, periodStart: view.period.start ? asDate(view.period.start) : null, periodEnd: asDate(end), nextPlanId: renewed.planId } });
      await this.logEvent(tx, meetingId, 'COMPLETED', userId, null, { periodStart: view.period.start, periodEnd: end, previousPlanId: renewed.previousPlanId, nextPlanId: renewed.planId, nextPeriodStart: nextPeriodStart(end), overallPercent: view.overall.percent });
      await this.history.record(tx, { activationId: activation.id, type: 'MENTORING_REVIEW_COMPLETED', actorUserId: userId, payload: { meetingId, periodStart: view.period.start, periodEnd: end, nextPlanId: renewed.planId } });
      return { meetingId, periodStart: view.period.start, periodEnd: end, nextPlanId: renewed.planId, nextPeriodStart: nextPeriodStart(end) };
    });
  }
}
