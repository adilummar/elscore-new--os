/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-member-access */
import { readFileSync } from 'fs';
import { join } from 'path';

import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';

import { PERMISSIONS_KEY } from '../../common/rbac/require-permissions.decorator';

import { MentoringAccessService, MentoringScope } from './mentoring-access.service';
import { MentoringHistoryService } from './mentoring-history.service';
import { MentoringLearningPlanService } from './mentoring-learning-plan.service';
import { MentoringReviewController } from './mentoring-review.controller';
import { MentoringReviewService } from './mentoring-review.service';
import { MentoringSlaService } from './mentoring-sla.service';
import { FakeDb } from './testing/mentoring-fake-db';

const at = (date: string, time: string) => new Date(`${date}T${time}:00+05:30`);
const day = (iso: string) => new Date(`${iso}T00:00:00Z`);
const START = '2026-11-10', MEETING = '2026-12-10', NEXT_START = '2026-12-11';
const NOW = at(START, '12:00');
const HELD = at(MEETING, '17:30');

const scope = (userId: string, perms: string[], all = false): MentoringScope => ({ userId, perms: new Set(perms), all, assigned: perms.includes('mentoring.student.read-assigned') });
const MENTOR = scope('mentor-1', ['mentoring.student.read-assigned', 'mentoring.stage.work']);
const OTHER = scope('mentor-2', ['mentoring.student.read-assigned', 'mentoring.stage.work']);
const HEAD = scope('head-1', ['mentoring.student.read-all'], true);
const NOBODY = scope('nobody', []);

const timed = (d: string) => ({ day: d, durationMinutes: 60, start: '16:00', end: '17:00' });
const subject = (id: string, name: string, d: string) => ({ subjectId: id, subjectName: name, gradeId: 'g-10', gradeName: 'Grade 10', frequency: 'WEEKLY', totalMinutes: 60, distribution: 'EQUAL', sessions: [timed(d)], startDate: START });
const SCHEDULE = { version: 2, subjects: [subject('sub-ma', 'Mathematics', 'Tuesday'), subject('sub-en', 'English', 'Wednesday')] };
const plan = (name: string, over: object = {}) => ({ description: `${name} plan`, objectives: `${name} objective one\n- ${name} objective two`, topics: `${name} topics`, outcomes: `${name} outcomes`, startsOn: START, ...over });

function world() {
  const db = new FakeDb();
  db.seed('subject', { id: 'sub-ma', name: 'Mathematics', isActive: true });
  db.seed('subject', { id: 'sub-en', name: 'English', isActive: true });
  db.seed('lead', { id: 'lead-1' });
  db.seed('student', { id: 'stu-1', firstName: 'Synthetic', lastName: 'Student A' });
  db.seed('enrollmentHandover', { id: 'ho-1', status: 'COMPLETED' });
  db.seed('mentoringActivation', { id: 'act-1', leadId: 'lead-1', studentId: 'stu-1', handoverId: 'ho-1', status: 'ACTIVATED', currentStage: 5, currentMentorUserId: 'mentor-1' });
  db.seed('mentoringStage', { activationId: 'act-1', stageNumber: 5, key: 'INDIVIDUAL_LEARNING_PLAN', status: 'IN_PROGRESS' });
  db.seed('enrollmentHandoverField', { handoverId: 'ho-1', fieldKey: 'timetable.schedule', value: SCHEDULE, origin: 'MENTOR_COLLECTED', updatedByUserId: 'mentor-1' });
  db.seed('employee', { id: 'e-1', userId: 'mentor-1', firstName: 'Mira', lastName: 'Mentor' });
  db.seed('user', { id: 'u-meera', status: 'ACTIVE' });
  db.seed('employee', { id: 'e-meera', userId: 'u-meera', firstName: 'Meera', lastName: 'Thomas', employmentStatus: 'ACTIVE' });
  db.seed('tutorProfile', { id: 'tp-meera', employeeId: 'e-meera', tutorOperationalStatus: 'ACTIVE' });
  db.seed('mentoringTutorAssignment', { id: 'as-1', activationId: 'act-1', subjectId: 'sub-en', tutorProfileId: 'tp-meera', status: 'ACTIVE', currentKey: 'act-1:sub-en' });
  const history = new MentoringHistoryService({ recordInTx: jest.fn().mockResolvedValue(undefined) } as any);
  const access = new MentoringAccessService({ getPermissionsForUser: jest.fn() } as any);
  const plans = new MentoringLearningPlanService(db as any, access, history);
  const sla = new MentoringSlaService(db as any, access);
  const service = new MentoringReviewService(db as any, access, history, plans, sla);

  const savePlans = async () => {
    // The learning plan is written during activation (stage 5); the monthly review runs once the student is Active.
    const activation = db.rows('mentoringActivation')[0];
    activation.status = 'ACTIVATION_IN_PROGRESS';
    for (const [id, name] of [['sub-ma', 'Mathematics'], ['sub-en', 'English']]) await plans.saveSubject('act-1', id, plan(name), 'mentor-1');
    activation.status = 'ACTIVATED';
  };
  const schedule = async (date = MEETING, extra: object = {}) => (await service.schedule('act-1', { date, ...extra }, 'mentor-1', NOW)).meetingId;
  const ready = async () => { await savePlans(); return schedule(); };
  const view = (now = NOW, sc = MENTOR) => service.get('act-1', sc, now);
  const meetingRow = () => db.rows('mentoringReviewMeeting')[0];
  const events = (id: string) => db.rows('mentoringReviewEvent').filter((e) => e.meetingId === id).map((e) => e.kind);
  const exam = (subjectId: string, date: string, over: object = {}) => db.seed('mentoringExam', { activationId: 'act-1', subjectId, title: `${subjectId} test`, kind: 'EXAM', date: day(date), originalDate: day(date), startMinute: 600, endMinute: 660, responsibleType: 'TUTOR', chapters: ['Chapter 1'], conducted: true, createdByUserId: 'mentor-1', ...over });

  /** Everything the review needs, recorded, except completing it. */
  const fill = async (id: string) => {
    await service.recordConducted(id, { conducted: true }, 'mentor-1', HELD);
    await service.recordActual(id, { actualDate: MEETING, start: '16:35', end: '17:20', attendees: ['Mentor', 'Parent A'], participation: 'FULL' }, 'mentor-1', HELD);
    await service.reviewExams(id, '', 'mentor-1', HELD);
    await service.seedGoals(id, 'mentor-1');
    for (const s of (await view(HELD)).subjects) {
      for (const g of s.goals) await service.updateGoal(g.id, { goal: g.goal, actualProgress: 'Steady progress', result: 'PARTIALLY', evidence: 'Class work' }, 'mentor-1', HELD);
      await service.saveTutorNote(id, s.subjectId, `${s.subjectName} tutor says steady`, 'mentor-1');
    }
    await service.addArea(id, { subjectId: 'sub-ma', area: 'Fractions' }, 'mentor-1');
    await service.saveRemarks(id, { whatImproved: 'Confidence', expHomePractice: '20 minutes daily', mentorObservations: 'Engaged student' }, 'mentor-1');
    await service.savePostMeeting(id, { parentCommunicated: 'Happy with progress' }, 'mentor-1', HELD);
    await service.copyNextPlan(id, 'mentor-1');
    await service.approveNextPlan(id, 'mentor-1', HELD);
  };
  return { db, service, plans, savePlans, schedule, ready, view, meetingRow, events, exam, fill };
}

describe('scheduling the monthly review', () => {
  it('needs a learning plan first, because the review is linked to it', async () => {
    const w = world();
    await expect(w.schedule()).rejects.toThrow('Write the Individual Learning Plan first');
    expect(w.db.rows('mentoringReviewMeeting')).toHaveLength(0);
  });

  it('links the meeting to the plan, keeps the first date, and makes the date the end of every subject plan', async () => {
    const w = world();
    await w.savePlans();
    const id = await w.schedule(MEETING, { start: '16:30', end: '17:30' });
    expect(w.meetingRow()).toMatchObject({ id, planId: w.db.rows('mentoringLearningPlan')[0].id, scheduledStartMinute: 990, scheduledEndMinute: 1050, status: 'SCHEDULED' });
    expect(w.meetingRow().originalDate).toEqual(day(MEETING));
    expect(w.db.rows('mentoringLearningPlanSubject').map((r) => r.endsOn)).toEqual([day(MEETING), day(MEETING)]);
    expect(w.events(id)).toEqual(['SCHEDULED']);
  });

  it('shows the plan period, the date, the Mentor and the state on the dashboard', async () => {
    const w = world();
    await w.savePlans();
    const empty = await w.view();
    expect(empty).toMatchObject({ meeting: null, notice: 'No monthly review meeting is scheduled.', mentorName: 'Mira Mentor', canWork: true });
    expect(empty.exams.message).toContain('Schedule the review meeting');
    await w.schedule();
    const v = await w.view();
    expect(v.student.name).toBe('Synthetic Student A');
    expect(v.period).toMatchObject({ start: START, end: MEETING, planStatus: 'DRAFT' });
    expect(v.meeting).toMatchObject({ state: 'SCHEDULED', stateLabel: 'Scheduled', date: MEETING, originalDate: MEETING });
    expect(v.subjects.map((s) => s.subjectName).sort()).toEqual(['English', 'Mathematics']);
  });

  it('allows one live meeting, a real future date and valid times, and only the assigned Mentor', async () => {
    const w = world();
    await w.savePlans();
    await expect(w.service.schedule('act-1', { date: '2026-11-09' }, 'mentor-1', NOW)).rejects.toThrow('today or a later date');
    await expect(w.service.schedule('act-1', { date: 'soon' }, 'mentor-1', NOW)).rejects.toBeInstanceOf(BadRequestException);
    await expect(w.service.schedule('act-1', { date: MEETING, start: '17:00', end: '16:00' }, 'mentor-1', NOW)).rejects.toThrow('end after it starts');
    await expect(w.service.schedule('act-1', { date: MEETING }, 'mentor-2', NOW)).rejects.toBeInstanceOf(ForbiddenException);
    await w.schedule();
    await expect(w.schedule('2026-12-20')).rejects.toThrow('already scheduled');
    expect(w.db.rows('mentoringReviewMeeting')).toHaveLength(1);
  });
});

describe('exams in the learning period', () => {
  it('shows the exams between the plan start and end dates, by subject and date, and no others', async () => {
    const w = world();
    await w.ready();
    w.exam('sub-en', '2026-11-05'); // before the plan
    w.exam('sub-en', '2026-11-20', { title: 'English unit 1', marksObtained: '45', maxMarks: '60', percentage: '75', chapters: ['Tenses', 'Nouns'], portion: 'Chapters 1 and 2', weaknesses: 'Tenses', topicsToImprove: 'Past perfect', tutorSuggestions: 'Daily practice', mentorRemarks: 'Calm' });
    w.exam('sub-ma', '2026-11-12', { title: 'Maths unit 1' });
    w.exam('sub-en', MEETING, { title: 'English on the last day' });
    w.exam('sub-en', '2026-12-11'); // after the plan
    const v = await w.view();
    expect(v.exams.items.map((e) => [e.subjectName, e.date])).toEqual([['English', '2026-11-20'], ['English', MEETING], ['Mathematics', '2026-11-12']]);
    expect(v.exams.items[0]).toMatchObject({ marksObtained: 45, maxMarks: 60, percentage: 75, chapters: ['Tenses', 'Nouns'], portion: 'Chapters 1 and 2', weaknesses: 'Tenses', topicsToImprove: 'Past perfect', tutorSuggestions: 'Daily practice', mentorRemarks: 'Calm' });
    expect(v.exams.message).toBeNull();
  });

  it('says plainly when there are no exams, and never invents results for an exam without marks', async () => {
    const w = world();
    await w.ready();
    expect((await w.view()).exams).toMatchObject({ items: [], message: 'No exam records available for this learning period.' });
    w.exam('sub-en', '2026-11-20');
    const v = await w.view();
    expect(v.exams.items[0]).toMatchObject({ marksObtained: null, maxMarks: null, percentage: null });
    expect(v.exams.warnings).toEqual(['1 exam was sat and has no marks recorded yet.']);
    expect(v.subjects.find((s) => s.subjectName === 'English')?.examAverage).toBeNull();
  });

  it('works out each subject average only from exams that have marks, and shows tutor suggestions as tutor feedback', async () => {
    const w = world();
    await w.ready();
    w.exam('sub-en', '2026-11-20', { marksObtained: '80', maxMarks: '100', percentage: '80', tutorSuggestions: 'Read daily' });
    w.exam('sub-en', '2026-11-27', { marksObtained: '60', maxMarks: '100', percentage: '60' });
    w.exam('sub-en', '2026-12-04');
    const en = (await w.view()).subjects.find((s) => s.subjectName === 'English') as any;
    expect(en.examAverage).toBe(70);
    expect(en.tutorFeedback).toEqual([{ source: 'Exam, sub-en test', date: '2026-11-20', text: 'Read daily' }]);
  });

  it("shows the tutor's class evaluation remarks from the period", async () => {
    const w = world();
    await w.ready();
    w.db.seed('mentoringClassSession', { activationId: 'act-1', assignmentId: 'as-1', subjectId: 'sub-en', tutorProfileId: 'tp-meera', tutorUserId: 'u-meera', originalDate: day('2026-11-18'), originalStartMinute: 960, date: day('2026-11-18'), startMinute: 960, endMinute: 1020, status: 'VERIFIED', evaluationRemarks: 'Attentive, needs practice' });
    w.db.seed('mentoringClassSession', { activationId: 'act-1', assignmentId: 'as-1', subjectId: 'sub-en', tutorProfileId: 'tp-meera', tutorUserId: 'u-meera', originalDate: day('2026-11-04'), originalStartMinute: 960, date: day('2026-11-04'), startMinute: 960, endMinute: 1020, status: 'VERIFIED', evaluationRemarks: 'Before the period' });
    const en = (await w.view()).subjects.find((s) => s.subjectName === 'English') as any;
    expect(en.tutorFeedback).toEqual([{ source: 'Class update', date: '2026-11-18', text: 'Attentive, needs practice' }]);
  });

  it('is recorded as reviewed by the Mentor, also when there are no exams', async () => {
    const w = world();
    const id = await w.ready();
    await w.service.reviewExams(id, 'There were no exams this month', 'mentor-1', NOW);
    const v = await w.view();
    expect(v.meeting?.examsReviewed).toMatchObject({ note: 'There were no exams this month' });
    expect(v.checklist.find((c) => c.key === 'EXAMS_REVIEWED')?.done).toBe(true);
    expect(w.events(id)).toContain('EXAMS_REVIEWED');
  });
});

describe('rescheduling the meeting', () => {
  const move = (w: ReturnType<typeof world>, id: string, over: object = {}, user = 'mentor-1') => w.service.reschedule(id, { newDate: '2026-12-15', reason: 'Parent travelling', ...over }, user, NOW);

  it('keeps the original date, records the reason, and moves the end date of the plan to follow it', async () => {
    const w = world();
    const id = await w.ready();
    await expect(move(w, id)).resolves.toMatchObject({ from: { date: MEETING }, to: { date: '2026-12-15' }, planEndDatesMoved: true });
    const v = await w.view();
    expect(v.meeting).toMatchObject({ date: '2026-12-15', originalDate: MEETING, state: 'RESCHEDULED' });
    expect(v.period.end).toBe('2026-12-15');
    expect(w.db.rows('mentoringLearningPlanSubject').map((r) => r.endsOn)).toEqual([day('2026-12-15'), day('2026-12-15')]);
    expect(w.db.rows('mentoringLearningPlan')[0].endsOn).toEqual(day('2026-12-15'));
  });

  it('tells the tutors in the app, says the parent is told by the Mentor, and keeps the history', async () => {
    const w = world();
    const id = await w.ready();
    await move(w, id);
    expect(w.db.rows('notification').find((n) => n.type === 'MENTORING_REVIEW_RESCHEDULED')).toMatchObject({ recipientUserId: 'u-meera', entityType: 'MonthlyReview' });
    const event = w.db.rows('mentoringReviewEvent').find((e) => e.kind === 'RESCHEDULED')!;
    expect(event).toMatchObject({ actorUserId: 'mentor-1', reason: 'Parent travelling' });
    expect(event.payload).toMatchObject({ from: { date: MEETING }, to: { date: '2026-12-15' }, requestedByUserId: 'mentor-1', notified: { inApp: ['u-meera'] } });
    await move(w, id, { newDate: '2026-12-18', reason: 'Holiday' });
    expect((await w.service.detail(id, MENTOR, NOW)).history!.filter((h) => h.kind === 'RESCHEDULED').map((h) => h.reason)).toEqual(['Parent travelling', 'Holiday']);
    expect((await w.view()).meeting?.originalDate).toBe(MEETING);
  });

  it('can change only the time, without moving the plan end date', async () => {
    const w = world();
    const id = await w.ready();
    await expect(move(w, id, { newDate: MEETING, newStart: '10:00', newEnd: '11:00' })).resolves.toMatchObject({ planEndDatesMoved: false });
    expect(w.meetingRow()).toMatchObject({ scheduledStartMinute: 600, scheduledEndMinute: 660 });
  });

  it('needs a reason and a real future date, refuses the time it already has, and a date before a plan starts', async () => {
    const w = world();
    const id = await w.ready();
    await expect(move(w, id, { reason: ' ' })).rejects.toThrow('Say why');
    await expect(move(w, id, { newDate: 'soon' })).rejects.toBeInstanceOf(BadRequestException);
    await expect(move(w, id, { newDate: '2026-11-09' })).rejects.toThrow('today or a later date');
    await expect(move(w, id, { newDate: MEETING })).rejects.toThrow('already has');
    await expect(move(w, id, { newDate: '2026-11-09' })).rejects.toBeInstanceOf(ConflictException);
    expect(w.meetingRow().scheduledFor).toEqual(day(MEETING));
  });

  it('is not possible after the meeting was held, and only the assigned Mentor can do it', async () => {
    const w = world();
    const id = await w.ready();
    await expect(move(w, id, {}, 'mentor-2')).rejects.toBeInstanceOf(ForbiddenException);
    await w.service.recordConducted(id, { conducted: true }, 'mentor-1', HELD);
    await expect(move(w, id)).rejects.toThrow('has been held');
  });

  it('after a meeting that was not held, the Mentor can move it and the not held record is cleared, but kept in the history', async () => {
    const w = world();
    const id = await w.ready();
    await w.service.recordConducted(id, { conducted: false, reason: 'Parent did not come' }, 'mentor-1', HELD);
    expect((await w.view(HELD)).meeting?.state).toBe('NOT_CONDUCTED');
    await w.service.reschedule(id, { newDate: '2026-12-17', reason: 'Parent asked for another day' }, 'mentor-1', HELD);
    expect(w.meetingRow()).toMatchObject({ conducted: null });
    expect(w.events(id)).toEqual(expect.arrayContaining(['NOT_CONDUCTED', 'RESCHEDULED']));
  });

  it('can be cancelled with a reason, which takes the end date off the plan', async () => {
    const w = world();
    const id = await w.ready();
    await expect(w.service.cancel(id, ' ', 'mentor-1')).rejects.toThrow('Say why');
    await w.service.cancel(id, 'Family emergency', 'mentor-1');
    expect(w.meetingRow()).toMatchObject({ status: 'CANCELLED', currentKey: null });
    expect(w.db.rows('mentoringLearningPlanSubject').every((r) => r.endsOn === null)).toBe(true);
    expect((await w.view()).meeting).toBeNull();
    await expect(w.service.recordConducted(id, { conducted: true }, 'mentor-1', HELD)).rejects.toThrow('already completed or cancelled');
  });
});

describe('what happened at the meeting', () => {
  it('cannot be recorded as held before its date, and a meeting not held needs a reason', async () => {
    const w = world();
    const id = await w.ready();
    await expect(w.service.recordConducted(id, { conducted: true }, 'mentor-1', NOW)).rejects.toThrow('not happened yet');
    await expect(w.service.recordConducted(id, {}, 'mentor-1', HELD)).rejects.toThrow('Say whether');
    await expect(w.service.recordConducted(id, { conducted: false }, 'mentor-1', HELD)).rejects.toThrow('Say why the meeting was not held');
    expect(w.meetingRow().conducted).toBeNull();
  });

  it('records the actual date, times, attendees and parent participation, only after the meeting was held', async () => {
    const w = world();
    const id = await w.ready();
    const body = { actualDate: MEETING, start: '16:35', end: '17:20', attendees: ['Mentor', 'Parent A'], participation: 'PARTIAL', participationNote: 'Left early' };
    await expect(w.service.recordActual(id, body, 'mentor-1', HELD)).rejects.toThrow('held first');
    await w.service.recordConducted(id, { conducted: true }, 'mentor-1', HELD);
    await expect(w.service.recordActual(id, { ...body, attendees: [] }, 'mentor-1', HELD)).rejects.toThrow('who attended');
    await expect(w.service.recordActual(id, { ...body, actualDate: '2026-12-11' }, 'mentor-1', HELD)).rejects.toThrow('cannot be in the future');
    await w.service.recordActual(id, body, 'mentor-1', HELD);
    const v = await w.view(HELD);
    expect(v.meeting).toMatchObject({ actual: { date: MEETING, startMinute: 995, endMinute: 1040 }, attendees: ['Mentor', 'Parent A'], participation: 'PARTIAL', participationNote: 'Left early', state: 'REVIEW_IN_PROGRESS' });
    expect(v.meeting?.originalDate).toBe(MEETING); // the scheduled time is not overwritten by the actual one
  });
});

describe('subject-wise goals', () => {
  it('takes the goals written in each subject plan, one to a line, adds none of its own, and does it once', async () => {
    const w = world();
    const id = await w.ready();
    await expect(w.service.seedGoals(id, 'mentor-1')).resolves.toMatchObject({ added: 4 });
    await expect(w.service.seedGoals(id, 'mentor-1')).resolves.toMatchObject({ added: 0 });
    const ma = (await w.view()).subjects.find((s) => s.subjectName === 'Mathematics') as any;
    expect(ma.goals.map((g: any) => [g.source, g.goal, g.result])).toEqual([['PLAN', 'Mathematics objective one', null], ['PLAN', 'Mathematics objective two', null]]);
  });

  it('lets the Mentor add a goal of their own to a subject of the plan, and refuses a subject that is not in it', async () => {
    const w = world();
    const id = await w.ready();
    await w.service.addGoal(id, 'sub-en', { goal: 'Write a short essay', expectedOutcome: 'Five paragraphs' }, 'mentor-1');
    expect((await w.view()).subjects.find((s) => s.subjectName === 'English')?.goals[0]).toMatchObject({ source: 'MENTOR', goal: 'Write a short essay', expectedOutcome: 'Five paragraphs', result: null });
    await expect(w.service.addGoal(id, 'sub-sc', { goal: 'x' }, 'mentor-1')).rejects.toThrow('not in the current learning plan');
    await expect(w.service.addGoal(id, 'sub-en', { goal: ' ' }, 'mentor-1')).rejects.toThrow('Write the planned goal');
  });

  it('evaluates every goal separately, with who and when, and works out the subject result from them', async () => {
    const w = world();
    const id = await w.ready();
    await w.service.seedGoals(id, 'mentor-1');
    const ma = (await w.view()).subjects.find((s) => s.subjectName === 'Mathematics') as any;
    await w.service.updateGoal(ma.goals[0].id, { goal: ma.goals[0].goal, actualProgress: 'Solved all', result: 'YES', evidence: 'Test paper', improvementAreas: 'Speed', remainingGaps: 'None' }, 'mentor-1', NOW);
    let after = (await w.view()).subjects.find((s) => s.subjectName === 'Mathematics') as any;
    expect(after.goals[0]).toMatchObject({ result: 'YES', actualProgress: 'Solved all', evidence: 'Test paper', improvementAreas: 'Speed', remainingGaps: 'None', evaluatedAt: NOW.toISOString() });
    expect(after.goals[1].result).toBeNull();
    expect(after.tally).toMatchObject({ result: null, unevaluated: 1, percent: 100 }); // the other goal is still open
    await w.service.updateGoal(ma.goals[1].id, { goal: ma.goals[1].goal, actualProgress: 'Not started', result: 'NO' }, 'mentor-1', NOW);
    after = (await w.view()).subjects.find((s) => s.subjectName === 'Mathematics') as any;
    expect(after.tally).toMatchObject({ result: 'PARTIALLY', percent: 50, yes: 1, no: 1, unevaluated: 0 });
    expect(w.db.rows('mentoringReviewGoal').find((g) => g.id === ma.goals[0].id)).toMatchObject({ evaluatedByUserId: 'mentor-1' });
  });

  it('works out the overall result from all the goals of all the subjects, and has no single goals completed mark', async () => {
    const w = world();
    const id = await w.ready();
    await w.service.seedGoals(id, 'mentor-1');
    const v = await w.view();
    const all = v.subjects.flatMap((s) => s.goals);
    await w.service.updateGoal(all[0].id, { goal: all[0].goal, actualProgress: 'x', result: 'YES' }, 'mentor-1', NOW);
    await w.service.updateGoal(all[2].id, { goal: all[2].goal, actualProgress: 'x', result: 'NO' }, 'mentor-1', NOW);
    expect((await w.view()).overall).toMatchObject({ total: 4, yes: 1, no: 1, unevaluated: 2, percent: 50, result: null });
    const schema = readFileSync(join(__dirname, '../../../prisma/schema.prisma'), 'utf8');
    const model = schema.slice(schema.indexOf('model MentoringReviewMeeting'), schema.indexOf('model MentoringReviewGoal'));
    expect(model).not.toMatch(/goalsCompleted|goalCompleted|goalsAchieved/i);
  });

  it('can take a goal away, with the history of it', async () => {
    const w = world();
    const id = await w.ready();
    await w.service.seedGoals(id, 'mentor-1');
    const goal = (await w.view()).subjects[0].goals[0];
    await w.service.deleteGoal(goal.id, 'mentor-1');
    expect(w.db.rows('mentoringReviewGoal')).toHaveLength(3);
    expect(w.events(id)).toContain('GOAL_REMOVED');
    await expect(w.service.deleteGoal(goal.id, 'mentor-1')).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('improvement areas, observations and remarks', () => {
  it('allows many improvement areas for a subject, and some for the student as a whole', async () => {
    const w = world();
    const id = await w.ready();
    await w.service.addArea(id, { subjectId: 'sub-ma', area: 'Fractions' }, 'mentor-1');
    await w.service.addArea(id, { subjectId: 'sub-ma', area: 'Word problems' }, 'mentor-1');
    await w.service.addArea(id, { area: 'Homework routine' }, 'mentor-1');
    const v = await w.view();
    expect(v.subjects.find((s) => s.subjectName === 'Mathematics')?.improvementAreas.map((a) => a.area)).toEqual(['Fractions', 'Word problems']);
    expect(v.generalAreas.map((a) => a.area)).toEqual(['Homework routine']);
    await expect(w.service.addArea(id, { area: ' ' }, 'mentor-1')).rejects.toBeInstanceOf(BadRequestException);
    await expect(w.service.addArea(id, { subjectId: 'sub-sc', area: 'x' }, 'mentor-1')).rejects.toThrow('not in the current learning plan');
    await w.service.deleteArea(v.generalAreas[0].id, 'mentor-1');
    expect((await w.view()).generalAreas).toEqual([]);
  });

  it('records a tutor observation for each subject, saying the Mentor recorded it, and replaces it when it is written again', async () => {
    const w = world();
    const id = await w.ready();
    await w.service.saveTutorNote(id, 'sub-en', 'Reads fluently', 'mentor-1');
    await w.service.saveTutorNote(id, 'sub-en', 'Reads very fluently', 'mentor-1');
    expect(w.db.rows('mentoringReviewTutorNote')).toHaveLength(1);
    expect(w.db.rows('mentoringReviewTutorNote')[0]).toMatchObject({ note: 'Reads very fluently', tutorUserId: 'u-meera', recordedByUserId: 'mentor-1' });
    expect((await w.view()).subjects.find((s) => s.subjectName === 'English')?.tutorObservation?.note).toBe('Reads very fluently');
    await expect(w.service.saveTutorNote(id, 'sub-en', ' ', 'mentor-1')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('keeps the remarks in separate fields, changes one without touching the others, and clears one that is emptied', async () => {
    const w = world();
    const id = await w.ready();
    await w.service.saveRemarks(id, { whatImproved: 'Confidence', expHomePractice: '20 minutes daily', expParentInvolvement: 'Check homework', expStudyRoutine: 'After dinner', expAttendanceSupport: 'Be on time', expOther: 'None', mentorObservations: 'Engaged' }, 'mentor-1');
    await w.service.saveRemarks(id, { whatImproved: 'Confidence and reading' }, 'mentor-1');
    await w.service.saveRemarks(id, { expOther: '' }, 'mentor-1');
    expect((await w.view()).remarks).toMatchObject({ whatImproved: 'Confidence and reading', expHomePractice: '20 minutes daily', expParentInvolvement: 'Check homework', expStudyRoutine: 'After dinner', expAttendanceSupport: 'Be on time', expOther: null, mentorObservations: 'Engaged' });
    await expect(w.service.saveRemarks(id, { parentCommunicated: 'x' }, 'mentor-1')).rejects.toThrow('not a field of this section');
    await expect(w.service.saveRemarks(id, {}, 'mentor-1')).rejects.toThrow('at least one remark');
  });

  it('records what the parent said after the meeting, apart from the Mentor and tutor observations, and only after it was held', async () => {
    const w = world();
    const id = await w.ready();
    await expect(w.service.savePostMeeting(id, { parentCommunicated: 'x' }, 'mentor-1', HELD)).rejects.toThrow('held first');
    await w.service.recordConducted(id, { conducted: true }, 'mentor-1', HELD);
    await w.service.saveRemarks(id, { mentorObservations: 'Mentor view' }, 'mentor-1');
    await w.service.savePostMeeting(id, { parentCommunicated: 'Happy', parentConcerns: 'Reading speed', parentFeedback: 'Clear reports', agreedActions: 'Daily reading', additionalSupport: 'Extra class', parentCommitments: 'Supervise homework', followUp: 'Call in two weeks' }, 'mentor-1', HELD);
    const v = await w.view(HELD);
    expect(v.postMeeting).toMatchObject({ parentCommunicated: 'Happy', parentConcerns: 'Reading speed', parentFeedback: 'Clear reports', agreedActions: 'Daily reading', additionalSupport: 'Extra class', parentCommitments: 'Supervise homework', followUp: 'Call in two weeks', recordedAt: HELD.toISOString() });
    expect(v.remarks.mentorObservations).toBe('Mentor view');
    await expect(w.service.savePostMeeting(id, { mentorObservations: 'x' }, 'mentor-1', HELD)).rejects.toThrow('not a field of this section');
  });
});

describe('the next learning plan', () => {
  it('starts from the current plan as continued goals, subject by subject, and leaves the current plan untouched', async () => {
    const w = world();
    const id = await w.ready();
    const before = JSON.stringify(w.db.rows('mentoringLearningPlanSubject'));
    await expect(w.service.copyNextPlan(id, 'mentor-1')).resolves.toMatchObject({ added: 2 });
    await expect(w.service.copyNextPlan(id, 'mentor-1')).resolves.toMatchObject({ added: 0 });
    expect((await w.view()).subjects.map((s) => [s.subjectName, s.nextPlan?.kind])).toEqual(expect.arrayContaining([['Mathematics', 'CONTINUED'], ['English', 'CONTINUED']]));
    expect(JSON.stringify(w.db.rows('mentoringLearningPlanSubject'))).toBe(before);
    expect(w.db.rows('mentoringLearningPlan')).toHaveLength(1);
  });

  it('lets the Mentor revise a subject, with the same fields as the learning plan, and refuses a subject that is not in the saved schedule', async () => {
    const w = world();
    const id = await w.ready();
    await w.service.saveNextPlan(id, 'sub-ma', { kind: 'REVISED', description: 'Focus on fractions', objectives: 'Add fractions', topics: 'Fractions', outcomes: 'Fluent fractions' }, 'mentor-1');
    expect((await w.view()).subjects.find((s) => s.subjectName === 'Mathematics')?.nextPlan).toEqual({ kind: 'REVISED', description: 'Focus on fractions', objectives: 'Add fractions', topics: 'Fractions', outcomes: 'Fluent fractions' });
    await expect(w.service.saveNextPlan(id, 'sub-sc', { kind: 'NEW', description: 'Science' }, 'mentor-1')).rejects.toThrow('A new subject cannot be added from a review');
    await expect(w.service.saveNextPlan(id, 'sub-ma', { kind: 'OTHER', description: 'x' }, 'mentor-1')).rejects.toThrow('new, continued or revised');
    await expect(w.service.saveNextPlan(id, 'sub-ma', { kind: 'NEW', description: ' ' }, 'mentor-1')).rejects.toThrow('description');
  });

  it('is approved only when every subject has its next plan, and any later change takes the approval away', async () => {
    const w = world();
    const id = await w.ready();
    await w.service.saveNextPlan(id, 'sub-ma', { kind: 'NEW', description: 'Maths next' }, 'mentor-1');
    await expect(w.service.approveNextPlan(id, 'mentor-1', NOW)).rejects.toThrow('Write the next plan for English first');
    await w.service.saveNextPlan(id, 'sub-en', { kind: 'CONTINUED', description: 'English next' }, 'mentor-1');
    await w.service.approveNextPlan(id, 'mentor-1', NOW);
    expect((await w.view()).meeting?.nextPlanApproved).toMatchObject({ at: NOW.toISOString() });
    await expect(w.service.saveNextPlan(id, 'sub-en', { kind: 'REVISED', description: 'English changed' }, 'mentor-1')).resolves.toMatchObject({ approvalWithdrawn: true });
    expect((await w.view()).meeting?.nextPlanApproved).toBeNull();
  });
});

describe('completing the review', () => {
  it('is refused with every missing item named, while anything is unrecorded, and changes nothing', async () => {
    const w = world();
    const id = await w.ready();
    const v = await w.view();
    expect(v.canComplete).toBe(false);
    expect(v.checklist).toHaveLength(9);
    expect(v.checklist.every((c) => !c.done)).toBe(true);
    await expect(w.service.complete(id, 'mentor-1', HELD)).rejects.toThrow('Meeting conducted: Not recorded yet. Actual meeting time recorded');
    expect(w.meetingRow()).toMatchObject({ status: 'SCHEDULED', completedAt: null });
    expect(w.db.rows('mentoringLearningPlan')).toHaveLength(1);
  });

  it('needs each of the nine items, one at a time', async () => {
    const w = world();
    const id = await w.ready();
    await w.fill(id);
    expect((await w.view(HELD)).problems).toEqual([]);
    const missing = async () => (await w.view(HELD)).checklist.filter((c) => !c.done).map((c) => c.key);
    // goals: reopen one result
    const goal = (await w.view(HELD)).subjects[0].goals[0];
    await w.service.updateGoal(goal.id, { goal: goal.goal, actualProgress: 'x' }, 'mentor-1', HELD);
    expect(await missing()).toEqual(['GOALS_EVALUATED']);
    await w.service.updateGoal(goal.id, { goal: goal.goal, actualProgress: 'x', result: 'YES' }, 'mentor-1', HELD);
    // next plan: a change withdraws the approval
    await w.service.saveNextPlan(id, 'sub-ma', { kind: 'REVISED', description: 'changed' }, 'mentor-1');
    expect(await missing()).toEqual(['NEXT_PLAN_APPROVED']);
    await w.service.approveNextPlan(id, 'mentor-1', HELD);
    // parent communication and observations
    await w.service.savePostMeeting(id, { parentCommunicated: '' }, 'mentor-1', HELD);
    expect(await missing()).toEqual(['PARENT_RECORDED']);
    await w.service.savePostMeeting(id, { parentCommunicated: 'Happy' }, 'mentor-1', HELD);
    await w.service.saveRemarks(id, { mentorObservations: '' }, 'mentor-1');
    expect(await missing()).toEqual(['OBSERVATIONS']);
    await w.service.saveRemarks(id, { mentorObservations: 'Engaged' }, 'mentor-1');
    expect(await missing()).toEqual([]);
  });

  it('accepts a recorded reason in place of improvement areas', async () => {
    const w = world();
    const id = await w.ready();
    await w.fill(id);
    const area = (await w.view(HELD)).subjects.find((s) => s.subjectName === 'Mathematics')!.improvementAreas[0];
    await w.service.deleteArea(area.id, 'mentor-1');
    expect((await w.view(HELD)).problems.join(' ')).toContain('Improvement areas recorded');
    await w.service.saveRemarks(id, { noImprovementReason: 'All goals met' }, 'mentor-1');
    expect((await w.view(HELD)).problems).toEqual([]);
  });

  it('ends the reviewed plan, keeps it as it was, and starts the next plan the day after the period', async () => {
    const w = world();
    const id = await w.ready();
    const oldPlanId = w.db.rows('mentoringLearningPlan')[0].id;
    await w.fill(id);
    expect((await w.view(HELD)).canComplete).toBe(true);
    const done = await w.service.complete(id, 'mentor-1', HELD);
    expect(done).toMatchObject({ periodStart: START, periodEnd: MEETING, nextPeriodStart: NEXT_START });

    expect(w.meetingRow()).toMatchObject({ status: 'COMPLETED', currentKey: null, completedAt: HELD, completedByUserId: 'mentor-1', nextPlanId: done.nextPlanId });
    expect(w.meetingRow().periodStart).toEqual(day(START));
    expect(w.meetingRow().periodEnd).toEqual(day(MEETING));

    const plans = w.db.rows('mentoringLearningPlan');
    expect(plans).toHaveLength(2);
    const old = plans.find((p) => p.id === oldPlanId)!;
    expect(old).toMatchObject({ status: 'SUPERSEDED', currentKey: null });
    const old_rows = w.db.rows('mentoringLearningPlanSubject').filter((r) => r.planId === oldPlanId);
    expect(old_rows).toHaveLength(2);
    expect(old_rows.every((r) => r.endsOn?.getTime() === day(MEETING).getTime() && r.description.endsWith('plan'))).toBe(true); // exactly as it was

    const next = plans.find((p) => p.id === done.nextPlanId)!;
    expect(next).toMatchObject({ status: 'APPROVED', currentKey: 'act-1', approvedByUserId: 'mentor-1', endsOn: null });
    const next_rows = w.db.rows('mentoringLearningPlanSubject').filter((r) => r.planId === next.id);
    expect(next_rows).toHaveLength(2);
    expect(next_rows.every((r) => r.startsOn?.getTime() === day(NEXT_START).getTime() && r.endsOn === null)).toBe(true);
    expect(w.db.rows('mentoringLearningPlanRevision').map((r) => [r.planId === oldPlanId ? 'old' : 'new', r.kind]).filter(([, k]) => ['COMPLETED_BY_REVIEW', 'RENEWED'].includes(k as string))).toEqual([['old', 'COMPLETED_BY_REVIEW'], ['new', 'RENEWED']]);
    expect(w.events(id)).toContain('COMPLETED');
  });

  it('leaves the student waiting for the next review date, and the next review covers only the next period', async () => {
    const w = world();
    const id = await w.ready();
    await w.fill(id);
    await w.service.complete(id, 'mentor-1', HELD);
    const plan = await w.plans.get('act-1', MENTOR);
    expect(plan.status).toBe('PENDING_REVIEW_DATE');
    expect(plan.pendingMessage).toBe('Monthly review meeting date pending');
    expect(plan.summary.overallStart).toBe(NEXT_START);
    expect((await w.view(HELD)).meeting).toBeNull();
    // the next meeting is scheduled against the new plan, and its period starts after the last one
    w.exam('sub-en', '2026-12-05', { title: 'Old period exam' });
    w.exam('sub-en', '2026-12-20', { title: 'New period exam' });
    const next = (await w.service.schedule('act-1', { date: '2027-01-10' }, 'mentor-1', HELD)).meetingId;
    expect(w.db.rows('mentoringReviewMeeting').find((m) => m.id === next)).toMatchObject({ status: 'SCHEDULED' });
    const v = await w.view(HELD);
    expect(v.period).toMatchObject({ start: NEXT_START, end: '2027-01-10' });
    expect(v.exams.items.map((e) => e.title)).toEqual(['New period exam']);
    expect(v.previous).toHaveLength(1);
  });

  it('keeps the completed review as it was, readable with its history, and no longer editable, and cannot be completed twice', async () => {
    const w = world();
    const id = await w.ready();
    await w.fill(id);
    await w.service.complete(id, 'mentor-1', HELD);
    await expect(w.service.complete(id, 'mentor-1', HELD)).rejects.toThrow('already completed or cancelled');
    await expect(w.service.saveRemarks(id, { whatImproved: 'changed later' }, 'mentor-1')).rejects.toThrow('already completed or cancelled');
    await expect(w.service.reschedule(id, { newDate: '2026-12-20', reason: 'x' }, 'mentor-1', HELD)).rejects.toThrow('already completed or cancelled');
    const past = await w.service.detail(id, MENTOR, HELD);
    expect(past.meeting).toMatchObject({ state: 'COMPLETED', stateLabel: 'Completed' });
    expect(past.period).toMatchObject({ start: START, end: MEETING });
    expect(past.subjects.flatMap((s) => s.goals).every((g) => g.result === 'PARTIALLY')).toBe(true);
    expect(past.remarks.whatImproved).toBe('Confidence');
    expect(past.history!.map((h) => h.kind)).toContain('COMPLETED');
    expect(past.canComplete).toBe(false);
    expect(past.canWork).toBe(false);
  });
});

describe('who can see and change a review', () => {
  it('shows a Mentor only their own students, the Head everyone without the right to change, and nobody without access anything', async () => {
    const w = world();
    const id = await w.ready();
    await expect(w.view(NOW, OTHER)).rejects.toBeInstanceOf(NotFoundException);
    await expect(w.service.detail(id, OTHER, NOW)).rejects.toBeInstanceOf(NotFoundException);
    await expect(w.view(NOW, NOBODY)).rejects.toBeInstanceOf(ForbiddenException);
    const head = await w.view(NOW, HEAD);
    expect(head.canWork).toBe(false);
    expect(head.meeting?.id).toBe(id);
    await expect(w.service.detail('nope', MENTOR, NOW)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('refuses every change from a Mentor who is not assigned, and leaves the review as it was', async () => {
    const w = world();
    const id = await w.ready();
    const other = 'mentor-2';
    await expect(w.service.recordConducted(id, { conducted: true }, other, HELD)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(w.service.recordActual(id, {}, other, HELD)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(w.service.reviewExams(id, '', other, HELD)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(w.service.seedGoals(id, other)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(w.service.addGoal(id, 'sub-en', { goal: 'x' }, other)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(w.service.addArea(id, { area: 'x' }, other)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(w.service.saveTutorNote(id, 'sub-en', 'x', other)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(w.service.saveRemarks(id, { whatImproved: 'x' }, other)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(w.service.copyNextPlan(id, other)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(w.service.approveNextPlan(id, other)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(w.service.complete(id, other, HELD)).rejects.toBeInstanceOf(ForbiddenException);
    expect(w.meetingRow()).toMatchObject({ conducted: null, whatImproved: null });
    expect(w.events(id)).toEqual(['SCHEDULED']);
  });

  it('does not allow changes while the workflow is not running', async () => {
    const w = world();
    const id = await w.ready();
    w.db.rows('mentoringActivation')[0].status = 'ACTIVATION_ON_HOLD';
    await expect(w.service.saveRemarks(id, { whatImproved: 'x' }, 'mentor-1')).rejects.toBeInstanceOf(ConflictException);
    expect((await w.view()).canWork).toBe(false);
  });
});

describe('the routes', () => {
  const writes = ['schedule', 'reschedule', 'cancel', 'conducted', 'actual', 'examsReviewed', 'seedGoals', 'addGoal', 'updateGoal', 'deleteGoal', 'addArea', 'deleteArea', 'tutorNote', 'remarks', 'postMeeting', 'copyNextPlan', 'nextPlan', 'approveNextPlan', 'complete'];

  it('every change needs the Mentor work permission, and reading is scoped in the query', () => {
    const proto = MentoringReviewController.prototype as any;
    for (const name of writes) expect(Reflect.getMetadata(PERMISSIONS_KEY, proto[name])).toEqual(['mentoring.stage.work']);
    for (const name of ['current', 'detail']) expect(Reflect.getMetadata(PERMISSIONS_KEY, proto[name])).toBeUndefined();
  });

  it('has no route for a tutor or a parent, and nothing that pays or changes a class', () => {
    const controller = readFileSync(join(__dirname, 'mentoring-review.controller.ts'), 'utf8');
    expect(controller).not.toMatch(/tutor-portal|tutor\.portal/);
    const service = readFileSync(join(__dirname, 'mentoring-review.service.ts'), 'utf8');
    expect(service).not.toMatch(/tutorPayable|tutorClassRecord|paymentStatus|mentoringClassSession\.(create|update)/);
  });
});

describe('monthly meetings need an Active student (step 1 eligibility)', () => {
  it('does not schedule a meeting for a student who is not Active, and says why', async () => {
    for (const [status, why] of [['ACTIVATION_IN_PROGRESS', 'has not been activated yet'], ['PENDING_FINAL_APPROVAL', 'has not been activated yet'], ['ACTIVATION_ON_HOLD', 'is paused'], ['CANCELLED', 'was cancelled']] as Array<[string, string]>) {
      const w = world();
      await w.savePlans();
      w.db.rows('mentoringActivation')[0].status = status;
      await expect(w.service.schedule('act-1', { date: MEETING }, 'mentor-1', NOW)).rejects.toThrow(why);
      expect(w.db.rows('mentoringReviewMeeting')).toHaveLength(0);
    }
  });

  it('shows an Active student as workable and a paused one as read only, with the records kept', async () => {
    const w = world();
    const id = await w.ready();
    expect((await w.view()).canWork).toBe(true);
    w.db.rows('mentoringActivation')[0].status = 'ACTIVATION_ON_HOLD';
    expect((await w.view()).canWork).toBe(false);
    expect(w.db.rows('mentoringReviewMeeting').map((m) => m.id)).toEqual([id]);
  });
});

// ─── Meetings workspace: every review across the caller's students ──────────────────────────────────────────────
describe('the Meetings workspace list', () => {
  it('lists nothing for a student with no running plan, and a needs-scheduling row once a plan runs', async () => {
    const w = world();
    expect((await w.service.workspace(MENTOR, {}, NOW)).rows).toHaveLength(0);
    await w.savePlans();
    const list = await w.service.workspace(MENTOR, {}, NOW);
    expect(list.rows).toHaveLength(1);
    expect(list.rows[0]).toMatchObject({ state: 'NOT_SCHEDULED', meetingId: null, date: null, studentName: 'Synthetic Student A', mentorName: 'Mira Mentor', canWork: true });
    expect(list.counts).toEqual({ NOT_SCHEDULED: 1 });
  });

  it('shows a scheduled meeting with its date, its period and its preparation', async () => {
    const w = world();
    const id = await w.ready();
    const row = (await w.service.workspace(MENTOR, {}, NOW)).rows[0] as any;
    expect(row).toMatchObject({ meetingId: id, state: 'SCHEDULED', date: MEETING, overdue: false });
    expect(row.period.start).toBe(START);
    expect(row.preparation).toMatchObject({ examsReviewed: false, subjects: 2, subjectsWithGoals: 0, tutorObservations: 0, nextPlanApproved: false });
    expect(row.parentFeedbackRecorded).toBe(false);
  });

  it('does not add a needs-scheduling row next to a live meeting, and marks a missed date overdue', async () => {
    const w = world();
    await w.ready();
    const later = at('2026-12-15', '10:00');
    const list = await w.service.workspace(MENTOR, {}, later);
    expect(list.rows).toHaveLength(1);
    expect((list.rows[0] as any).overdue).toBe(true);
    expect(list.overdue).toBe(1);
    expect((await w.service.workspace(MENTOR, { state: 'OVERDUE' }, later)).rows).toHaveLength(1);
    expect((await w.service.workspace(MENTOR, { state: 'OVERDUE' }, NOW)).rows).toHaveLength(0);
  });

  it('summarises only the exams of the period, with marks and their average, and invents nothing', async () => {
    const w = world();
    await w.ready();
    w.exam('sub-ma', '2026-11-20', { conducted: true, marksObtained: 8, maxMarks: 10, percentage: 80 });
    w.exam('sub-en', '2026-11-25', { conducted: true });
    w.exam('sub-ma', '2026-09-01', { conducted: true, marksObtained: 1, maxMarks: 10, percentage: 10 });
    const row = (await w.service.workspace(MENTOR, {}, NOW)).rows[0] as any;
    expect(row.exams).toEqual({ total: 2, conducted: 2, marked: 1, averagePercentage: 80 });
  });

  it('shows the assigned Mentor and the Head their students, and nobody else', async () => {
    const w = world();
    await w.ready();
    expect((await w.service.workspace(OTHER, {}, NOW)).rows).toHaveLength(0);
    expect((await w.service.workspace(HEAD, {}, NOW)).rows).toHaveLength(1);
    await expect(w.service.workspace(NOBODY, {}, NOW)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('shows the parent name only to the assigned Mentor and the Head', async () => {
    const w = world();
    await w.ready();
    w.db.seed('enrollmentHandoverField', { handoverId: 'ho-1', fieldKey: 'parent.name', value: 'Parent A', origin: 'MENTOR_COLLECTED', updatedByUserId: 'mentor-1' });
    expect(((await w.service.workspace(MENTOR, {}, NOW)).rows[0] as any).parentName).toBe('Parent A');
    expect(((await w.service.workspace(HEAD, {}, NOW)).rows[0] as any).parentName).toBe('Parent A');
    const counselor = scope('counselor-1', ['mentoring.student.read-assigned']);
    w.db.seed('mentoringTask', { id: 'task-1', activationId: 'act-1', assigneeUserId: 'counselor-1', status: 'OPEN' });
    const seen = (await w.service.workspace(counselor, {}, NOW)).rows as any[];
    expect(seen.every((r) => r.parentName === null)).toBe(true);
  });

  it('refuses dates that are not real, filters by student name and by state', async () => {
    const w = world();
    await w.ready();
    await expect(w.service.workspace(MENTOR, { to: 'later' }, NOW)).rejects.toBeInstanceOf(BadRequestException);
    expect((await w.service.workspace(MENTOR, { student: 'zzz' }, NOW)).rows).toHaveLength(0);
    expect((await w.service.workspace(MENTOR, { student: 'student a' }, NOW)).rows).toHaveLength(1);
    expect((await w.service.workspace(MENTOR, { state: 'COMPLETED' }, NOW)).rows).toHaveLength(0);
    expect((await w.service.workspace(MENTOR, { from: '2027-01-01' }, NOW)).rows).toHaveLength(0);
  });

  it('only reads: no meeting, plan or event changes', async () => {
    const w = world();
    await w.ready();
    const before = JSON.stringify([w.db.rows('mentoringReviewMeeting'), w.db.rows('mentoringReviewEvent'), w.db.rows('mentoringLearningPlan')]);
    await w.service.workspace(MENTOR, {}, NOW);
    expect(JSON.stringify([w.db.rows('mentoringReviewMeeting'), w.db.rows('mentoringReviewEvent'), w.db.rows('mentoringLearningPlan')])).toBe(before);
  });

  it('is a read route with no write permission', () => {
    expect(Reflect.getMetadata(PERMISSIONS_KEY, MentoringReviewController.prototype.workspace)).toBeUndefined();
    expect(readFileSync(join(__dirname, 'mentoring-review.controller.ts'), 'utf8')).toContain("@Get('reviews')");
  });
});
