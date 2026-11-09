/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-member-access */
import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';

import { PERMISSIONS_KEY } from '../../common/rbac/require-permissions.decorator';

import { MentoringAccessService, MentoringScope } from './mentoring-access.service';
import { MentoringHistoryService } from './mentoring-history.service';
import { MentoringLearningPlanService } from './mentoring-learning-plan.service';
import { MentoringWorkflowController } from './mentoring-workflow.controller';
import { FakeDb } from './testing/mentoring-fake-db';

const scope = (userId: string, perms: string[], all = false): MentoringScope => ({ userId, perms: new Set(perms), all, assigned: perms.includes('mentoring.student.read-assigned') });
const MENTOR = scope('mentor-1', ['mentoring.student.read-assigned', 'mentoring.stage.work']);
const OTHER = scope('mentor-2', ['mentoring.student.read-assigned', 'mentoring.stage.work']);
const HEAD = scope('head-1', ['mentoring.student.read-all'], true);
const NOBODY = scope('nobody', []);

const MEETING = '2026-12-10';
const timed = (d: string) => ({ day: d, durationMinutes: 60, start: '16:00', end: '17:00' });
const subject = (id: string, name: string, day: string) => ({ subjectId: id, subjectName: name, gradeId: 'g-10', gradeName: 'Grade 10', frequency: 'WEEKLY', totalMinutes: 60, distribution: 'EQUAL', sessions: [timed(day)], startDate: '2026-11-10' });
const SCHEDULE = { version: 2, subjects: [subject('sub-ma', 'Mathematics', 'Tuesday'), subject('sub-en', 'English', 'Wednesday'), subject('sub-sc', 'Science', 'Thursday')] };
const plan = (name: string, over: object = {}) => ({ description: `${name} plan`, objectives: `${name} objectives`, topics: `${name} topics`, outcomes: `${name} outcomes`, startsOn: '2026-11-10', ...over });

function world(stageStatus = 'IN_PROGRESS') {
  const db = new FakeDb();
  db.seed('lead', { id: 'lead-1' });
  db.seed('student', { id: 'stu-1', firstName: 'Synthetic', lastName: 'Student A' });
  db.seed('enrollmentHandover', { id: 'ho-1', status: 'COMPLETED' });
  db.seed('mentoringActivation', { id: 'act-1', leadId: 'lead-1', studentId: 'stu-1', handoverId: 'ho-1', status: 'ACTIVATION_IN_PROGRESS', currentStage: 5, currentMentorUserId: 'mentor-1' });
  db.seed('mentoringStage', { activationId: 'act-1', stageNumber: 5, key: 'INDIVIDUAL_LEARNING_PLAN', status: stageStatus });
  db.seed('enrollmentHandoverField', { handoverId: 'ho-1', fieldKey: 'timetable.schedule', value: SCHEDULE, origin: 'MENTOR_COLLECTED', updatedByUserId: 'mentor-1' });
  db.seed('employee', { id: 'e-1', userId: 'mentor-1', firstName: 'Mira', lastName: 'Mentor' });
  const history = new MentoringHistoryService({ recordInTx: jest.fn().mockResolvedValue(undefined) } as any);
  const access = new MentoringAccessService({ getPermissionsForUser: jest.fn() } as any);
  const service = new MentoringLearningPlanService(db as any, access, history);
  const saveAll = async (extra: (name: string) => object = () => ({})) => {
    for (const [id, name] of [['sub-ma', 'Mathematics'], ['sub-en', 'English'], ['sub-sc', 'Science']]) await service.saveSubject('act-1', id, plan(name, extra(name)), 'mentor-1');
  };
  const events = (type: string) => db.rows('mentoringEvent').filter((e) => e.type === type);
  return { db, service, saveAll, events };
}

describe('a separate learning plan for every subject', () => {
  it('lists every subject of the saved schedule, each with its own status, and starts as not started', async () => {
    const w = world();
    const v = await w.service.get('act-1', MENTOR);
    expect(v.student.name).toBe('Synthetic Student A');
    expect(v.status).toBe('NOT_STARTED');
    expect(v.subjects.map((s) => [s.subjectName, s.status, s.defaultStart])).toEqual([['Mathematics', 'NOT_STARTED', '2026-11-10'], ['English', 'NOT_STARTED', '2026-11-11'], ['Science', 'NOT_STARTED', '2026-11-12']]);
    expect(v.summary).toMatchObject({ enrolledSubjects: 3, completedSubjects: 0, overallStart: null, nextReviewMeeting: null, endsOn: null });
    expect(v.canEdit).toBe(true);
  });

  it('saving one subject creates only that subject plan, and does not complete the others', async () => {
    const w = world();
    await w.service.saveSubject('act-1', 'sub-ma', plan('Mathematics'), 'mentor-1');
    const v = await w.service.get('act-1', MENTOR);
    expect(v.subjects.map((s) => s.status)).toEqual(['PENDING_END_DATE', 'NOT_STARTED', 'NOT_STARTED']);
    expect(v.status).toBe('DRAFT');
    expect(w.db.rows('mentoringLearningPlanSubject')).toHaveLength(1);
    expect(w.db.rows('mentoringLearningPlan')).toHaveLength(1);
  });

  it('keeps a different description, objectives and start date for each subject', async () => {
    const w = world();
    await w.service.saveSubject('act-1', 'sub-ma', plan('Mathematics', { startsOn: '2026-11-10' }), 'mentor-1');
    await w.service.saveSubject('act-1', 'sub-en', plan('English', { startsOn: '2026-11-12' }), 'mentor-1');
    await w.service.saveSubject('act-1', 'sub-sc', plan('Science', { startsOn: '2026-11-16' }), 'mentor-1');
    const v = await w.service.get('act-1', MENTOR);
    expect(v.subjects.map((s) => [s.plan?.description, s.plan?.objectives, s.plan?.startsOn])).toEqual([
      ['Mathematics plan', 'Mathematics objectives', '2026-11-10'], ['English plan', 'English objectives', '2026-11-12'], ['Science plan', 'Science objectives', '2026-11-16'],
    ]);
    expect(v.summary.overallStart).toBe('2026-11-10');
    // Changing one leaves the others exactly as they were.
    await w.service.saveSubject('act-1', 'sub-en', plan('English', { description: 'Reading and writing' }), 'mentor-1');
    const after = await w.service.get('act-1', MENTOR);
    expect(after.subjects.map((s) => s.plan?.description)).toEqual(['Mathematics plan', 'Reading and writing', 'Science plan']);
  });

  it('saving the same subject again updates it, and one subject can never have two plans', async () => {
    const w = world();
    await w.service.saveSubject('act-1', 'sub-ma', plan('Mathematics'), 'mentor-1');
    await w.service.saveSubject('act-1', 'sub-ma', plan('Mathematics', { topics: 'Geometry' }), 'mentor-1');
    expect(w.db.rows('mentoringLearningPlanSubject')).toHaveLength(1);
    expect(w.db.rows('mentoringLearningPlan')).toHaveLength(1);
    expect(() => w.db.mentoringLearningPlanSubject.create({ data: { planId: w.db.rows('mentoringLearningPlan')[0].id, subjectId: 'sub-ma', description: 'x', createdByUserId: 'mentor-1' } })).toThrow(/Unique constraint/);
  });

  it('refuses a subject that is not in the saved schedule, and a plan with no description or start date', async () => {
    const w = world();
    await expect(w.service.saveSubject('act-1', 'sub-history', plan('History'), 'mentor-1')).rejects.toBeInstanceOf(BadRequestException);
    await expect(w.service.saveSubject('act-1', 'sub-ma', { ...plan('Mathematics'), description: '' }, 'mentor-1')).rejects.toThrow('description');
    await expect(w.service.saveSubject('act-1', 'sub-ma', { ...plan('Mathematics'), startsOn: undefined }, 'mentor-1')).rejects.toThrow('start date');
    await expect(w.service.saveSubject('act-1', 'sub-ma', plan('Mathematics', { startsOn: '2026-11-09' }), 'mentor-1')).rejects.toThrow('before the classes start');
    expect(w.db.rows('mentoringLearningPlan')).toHaveLength(0);
  });
});

describe('the monthly review meeting date and the end date', () => {
  it('shows "Monthly review meeting date pending" and explains it, until a meeting is scheduled', async () => {
    const w = world();
    await w.saveAll();
    const v = await w.service.get('act-1', MENTOR);
    expect(v.pendingMessage).toBe('Monthly review meeting date pending');
    expect(v.pendingExplanation).toBe('The learning plan end date will be confirmed when the next monthly review meeting is scheduled.');
    expect(v.summary).toMatchObject({ nextReviewMeeting: null, endsOn: null });
    expect(v.subjects.every((s) => s.plan?.endsOn === null)).toBe(true);
  });

  it('saves a draft with a pending end date, calls the plan "pending review date", and refuses an invented end date', async () => {
    const w = world();
    await w.saveAll();
    expect((await w.service.get('act-1', MENTOR)).status).toBe('PENDING_REVIEW_DATE');
    await expect(w.service.saveSubject('act-1', 'sub-ma', plan('Mathematics', { endsOn: '2026-12-10' }), 'mentor-1')).rejects.toThrow('no meeting is scheduled yet');
    await expect(w.service.markReady('act-1', 'mentor-1')).rejects.toThrow('Monthly review meeting date pending');
  });

  it('when the meeting is scheduled later, every subject plan gets the same end date, and the overall end date follows', async () => {
    const w = world();
    await w.saveAll();
    const before = w.db.rows('mentoringLearningPlanRevision').length;
    await expect(w.service.scheduleMonthlyReview('act-1', MEETING, 'next-phase-user')).resolves.toMatchObject({ date: MEETING, plansUpdated: 1 });
    const v = await w.service.get('act-1', MENTOR);
    expect(v.subjects.map((s) => s.plan?.endsOn)).toEqual([MEETING, MEETING, MEETING]);
    expect(v.summary).toMatchObject({ nextReviewMeeting: MEETING, endsOn: MEETING, completedSubjects: 3 });
    expect(v.pendingMessage).toBeNull();
    expect(v.status).toBe('DRAFT'); // complete, waiting to be marked ready
    expect(w.db.rows('mentoringLearningPlan')[0]).toMatchObject({ endsOn: new Date(`${MEETING}T00:00:00Z`) });
    // Recorded: a new version of the plan and an audit event, with who and why.
    expect(w.db.rows('mentoringLearningPlanRevision')).toHaveLength(before + 1);
    expect(w.db.rows('mentoringLearningPlanRevision').pop()).toMatchObject({ kind: 'REVIEW_DATE_SYNCED', changedByUserId: 'next-phase-user', reason: `The monthly review meeting was scheduled for ${MEETING}.` });
    expect(w.events('MENTORING_REVIEW_MEETING_SCHEDULED')).toHaveLength(1);
    expect(w.events('MENTORING_LEARNING_PLAN_DATES_SYNCED')).toHaveLength(1);
  });

  it('a plan saved after the meeting exists ends on the meeting date by default, or earlier if chosen, never later', async () => {
    const w = world();
    await w.service.scheduleMonthlyReview('act-1', MEETING, 'next-phase-user');
    await w.service.saveSubject('act-1', 'sub-ma', plan('Mathematics'), 'mentor-1');
    await w.service.saveSubject('act-1', 'sub-en', plan('English', { endsOn: '2026-12-01' }), 'mentor-1');
    const v = await w.service.get('act-1', MENTOR);
    expect(v.subjects.map((s) => s.plan?.endsOn ?? null)).toEqual([MEETING, '2026-12-01', null]);
    await expect(w.service.saveSubject('act-1', 'sub-sc', plan('Science', { endsOn: '2026-12-11' }), 'mentor-1')).rejects.toThrow('later than the monthly review meeting');
    await expect(w.service.saveSubject('act-1', 'sub-sc', plan('Science', { startsOn: '2026-11-20', endsOn: '2026-11-19' }), 'mentor-1')).rejects.toThrow('cannot be earlier than the start date');
  });

  it('scheduling the same date again changes nothing; a bad date or one before a plan starts is refused', async () => {
    const w = world();
    await w.saveAll();
    await w.service.scheduleMonthlyReview('act-1', MEETING, 'u');
    const revisions = w.db.rows('mentoringLearningPlanRevision').length;
    await expect(w.service.scheduleMonthlyReview('act-1', MEETING, 'u')).resolves.toMatchObject({ plansUpdated: 0 });
    expect(w.db.rows('mentoringLearningPlanRevision')).toHaveLength(revisions);
    expect(w.db.rows('mentoringReviewMeeting')).toHaveLength(1);
    await expect(w.service.scheduleMonthlyReview('act-1', 'soon', 'u')).rejects.toBeInstanceOf(BadRequestException);
    await expect(w.service.scheduleMonthlyReview('act-1', '2026-11-09', 'u')).rejects.toThrow('cannot be before 2026-11-10');
  });

  it('when the meeting moves, every end date moves with it and the old date stays in the history', async () => {
    const w = world();
    await w.saveAll();
    await w.service.scheduleMonthlyReview('act-1', MEETING, 'u');
    await w.service.scheduleMonthlyReview('act-1', '2026-12-17', 'u');
    const v = await w.service.get('act-1', MENTOR);
    expect(v.subjects.map((s) => s.plan?.endsOn)).toEqual(['2026-12-17', '2026-12-17', '2026-12-17']);
    expect(w.db.rows('mentoringReviewMeeting')).toHaveLength(1);
    expect(w.events('MENTORING_REVIEW_MEETING_RESCHEDULED')[0].payload).toMatchObject({ previousDate: MEETING, date: '2026-12-17' });
    expect(v.history[0]).toMatchObject({ kind: 'REVIEW_DATE_SYNCED', reason: `The monthly review meeting moved from ${MEETING} to 2026-12-17.` });
    const snapshots = w.db.rows('mentoringLearningPlanRevision').filter((r) => r.kind === 'REVIEW_DATE_SYNCED').map((r) => r.snapshot.endsOn);
    expect(snapshots).toEqual([MEETING, '2026-12-17']); // the earlier date is still on record
  });

  it('cancelling the meeting takes the end dates away again and puts the plan back to pending', async () => {
    const w = world();
    await w.saveAll();
    await w.service.scheduleMonthlyReview('act-1', MEETING, 'u');
    await expect(w.service.cancelMonthlyReview('act-1', 'Parent unavailable', 'u')).resolves.toEqual({ cancelled: true });
    const v = await w.service.get('act-1', MENTOR);
    expect(v.subjects.map((s) => s.plan?.endsOn)).toEqual([null, null, null]);
    expect(v.status).toBe('PENDING_REVIEW_DATE');
    expect(v.pendingMessage).toBe('Monthly review meeting date pending');
    await expect(w.service.cancelMonthlyReview('act-1', 'again', 'u')).resolves.toEqual({ cancelled: false });
  });
});

describe('completion, approval and history', () => {
  it('is not complete until every subject has its own plan, and names the missing one', async () => {
    const w = world();
    await w.service.scheduleMonthlyReview('act-1', MEETING, 'u');
    await w.service.saveSubject('act-1', 'sub-ma', plan('Mathematics'), 'mentor-1');
    await w.service.saveSubject('act-1', 'sub-en', plan('English'), 'mentor-1');
    const v = await w.service.get('act-1', MENTOR);
    expect(v.subjects.map((s) => s.status)).toEqual(['COMPLETE', 'COMPLETE', 'NOT_STARTED']);
    expect(v.summary.completedSubjects).toBe(2);
    expect(v.problems).toEqual(['Science: no learning plan yet.']);
    await expect(w.service.markReady('act-1', 'mentor-1')).rejects.toThrow('Science: no learning plan yet.');
    await expect(w.service.approve('act-1', 'mentor-1')).rejects.toBeInstanceOf(ConflictException);
  });

  it('goes draft, ready for review, approved, with the approver recorded', async () => {
    const w = world();
    await w.saveAll();
    await w.service.scheduleMonthlyReview('act-1', MEETING, 'u');
    await w.service.markReady('act-1', 'mentor-1');
    expect((await w.service.get('act-1', MENTOR)).status).toBe('READY_FOR_REVIEW');
    await w.service.approve('act-1', 'mentor-1');
    const v = await w.service.get('act-1', MENTOR);
    expect(v.status).toBe('APPROVED');
    expect(v.approval).toMatchObject({ by: 'Mira Mentor' });
    expect(v.history.map((h) => h.kind)).toEqual(['APPROVED', 'MARKED_READY', 'REVIEW_DATE_SYNCED', 'SAVED', 'SAVED', 'SAVED']);
    expect(w.events('MENTORING_LEARNING_PLAN_APPROVED')).toHaveLength(1);
    await expect(w.service.approve('act-1', 'mentor-1')).rejects.toThrow('Mark the plan ready');
  });

  it('never overwrites an approved plan silently: a reason is needed, the plan reopens, and the approved version stays', async () => {
    const w = world();
    await w.saveAll();
    await w.service.scheduleMonthlyReview('act-1', MEETING, 'u');
    await w.service.markReady('act-1', 'mentor-1');
    await w.service.approve('act-1', 'mentor-1');
    const approvedVersion = w.db.rows('mentoringLearningPlanRevision').find((r) => r.kind === 'APPROVED')!;
    const approvedText = JSON.stringify(approvedVersion.snapshot);

    await expect(w.service.saveSubject('act-1', 'sub-ma', plan('Mathematics', { description: 'Changed' }), 'mentor-1')).rejects.toThrow('Say why');
    expect(w.db.rows('mentoringLearningPlanSubject').find((r) => r.subjectId === 'sub-ma')!.description).toBe('Mathematics plan');

    await w.service.saveSubject('act-1', 'sub-ma', { ...plan('Mathematics', { description: 'Changed' }), reason: 'Parent asked for more algebra' }, 'mentor-1');
    const v = await w.service.get('act-1', MENTOR);
    expect(v.status).toBe('DRAFT');
    expect(v.approval).toEqual({ by: null, at: null });
    expect(v.history[0]).toMatchObject({ kind: 'REOPENED', reason: 'Parent asked for more algebra', changedBy: 'Mira Mentor' });
    expect(JSON.stringify(w.db.rows('mentoringLearningPlanRevision').find((r) => r.id === approvedVersion.id)!.snapshot)).toBe(approvedText);
    expect(JSON.parse(approvedText).subjects.find((s: any) => s.subjectId === 'sub-ma').description).toBe('Mathematics plan');
    expect(w.events('MENTORING_LEARNING_PLAN_SAVED').pop()!.payload).toMatchObject({ reopened: true, changed: ['description'] });
  });

  it('when the meeting moves after approval, the end dates move, the plan must be approved again, and nothing is lost', async () => {
    const w = world();
    await w.saveAll();
    await w.service.scheduleMonthlyReview('act-1', MEETING, 'u');
    await w.service.markReady('act-1', 'mentor-1');
    await w.service.approve('act-1', 'mentor-1');
    await w.service.scheduleMonthlyReview('act-1', '2026-12-17', 'u');
    const v = await w.service.get('act-1', MENTOR);
    expect(v.status).toBe('READY_FOR_REVIEW');
    expect(v.approval.by).toBeNull();
    expect(v.subjects.map((s) => s.plan?.endsOn)).toEqual(['2026-12-17', '2026-12-17', '2026-12-17']);
    expect(w.db.rows('mentoringLearningPlanRevision').find((r) => r.kind === 'APPROVED')!.snapshot.endsOn).toBe(MEETING);
    expect(w.events('MENTORING_LEARNING_PLAN_DATES_SYNCED').pop()!.payload).toMatchObject({ wasApproved: true, previousEndDate: MEETING, endDate: '2026-12-17' });
  });

  it('records who created and last updated each subject plan, and when', async () => {
    const w = world();
    await w.service.saveSubject('act-1', 'sub-ma', plan('Mathematics'), 'mentor-1');
    await w.service.saveSubject('act-1', 'sub-ma', plan('Mathematics', { topics: 'Geometry' }), 'mentor-1');
    const s = (await w.service.get('act-1', MENTOR)).subjects[0];
    expect(s).toMatchObject({ createdBy: 'Mira Mentor', updatedBy: 'Mira Mentor' });
    expect(Date.parse(s.createdAt as string)).not.toBeNaN();
    expect(Date.parse(s.updatedAt as string)).not.toBeNaN();
  });
});

describe('who may read and change it', () => {
  it('the assigned Mentor and the Head can read; another Mentor and someone with no access cannot', async () => {
    const w = world();
    await expect(w.service.get('act-1', MENTOR)).resolves.toBeDefined();
    await expect(w.service.get('act-1', HEAD)).resolves.toBeDefined();
    await expect(w.service.get('act-1', OTHER)).rejects.toBeInstanceOf(NotFoundException);
    await expect(w.service.get('act-1', NOBODY)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('only the assigned Mentor can edit; the Head and another Mentor are refused, and nothing is written', async () => {
    const w = world();
    expect((await w.service.get('act-1', HEAD)).canEdit).toBe(false);
    expect((await w.service.get('act-1', MENTOR)).canEdit).toBe(true);
    await expect(w.service.saveSubject('act-1', 'sub-ma', plan('Mathematics'), 'mentor-2')).rejects.toBeInstanceOf(ForbiddenException);
    await expect(w.service.saveSubject('act-1', 'sub-ma', plan('Mathematics'), 'head-1')).rejects.toBeInstanceOf(ForbiddenException);
    await expect(w.service.markReady('act-1', 'mentor-2')).rejects.toBeInstanceOf(ForbiddenException);
    await expect(w.service.approve('act-1', 'mentor-2')).rejects.toBeInstanceOf(ForbiddenException);
    expect(w.db.rows('mentoringLearningPlan')).toHaveLength(0);
  });

  it('cannot be edited before the stage is started, or while the workflow is on hold', async () => {
    const notStarted = world('NOT_STARTED');
    await expect(notStarted.service.saveSubject('act-1', 'sub-ma', plan('Mathematics'), 'mentor-1')).rejects.toThrow('Start the Individual Learning Plan stage first');
    expect((await notStarted.service.get('act-1', MENTOR)).canEdit).toBe(false);
    const held = world();
    held.db.rows('mentoringActivation')[0].status = 'ACTIVATION_ON_HOLD';
    await expect(held.service.saveSubject('act-1', 'sub-ma', plan('Mathematics'), 'mentor-1')).rejects.toBeInstanceOf(ConflictException);
  });

  it('every write route needs the work permission, and the read route is scoped in the query', () => {
    const proto = MentoringWorkflowController.prototype as any;
    for (const name of ['saveSubjectPlan', 'markLearningPlanReady', 'approveLearningPlan']) expect(Reflect.getMetadata(PERMISSIONS_KEY, proto[name])).toEqual(['mentoring.stage.work']);
    expect(Reflect.getMetadata(PERMISSIONS_KEY, proto.learningPlan)).toBeUndefined();
    expect(proto.scheduleMonthlyReview).toBeUndefined(); // the meeting is scheduled by the next phase, not from this stage
  });

  it('does not touch the stage checklist: saving and approving tick nothing', async () => {
    const w = world();
    await w.saveAll();
    await w.service.scheduleMonthlyReview('act-1', MEETING, 'u');
    await w.service.markReady('act-1', 'mentor-1');
    await w.service.approve('act-1', 'mentor-1');
    expect(w.db.rows('stageChecklistResponse')).toHaveLength(0);
    expect(w.db.rows('mentoringStage')[0].status).toBe('IN_PROGRESS');
  });
});
