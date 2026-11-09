import {
  EnrolledSubject, PENDING_REVIEW_EXPLANATION, PENDING_REVIEW_MESSAGE, SubjectPlanFields, changedFields, checkSubjectPlan, firstClassDate, meetingDateProblem, overallStatus, readinessProblems, subjectStatus, syncedEndDate,
} from './learning-plan';

const full = (over: Partial<SubjectPlanFields> = {}): SubjectPlanFields => ({ description: 'Improve problem solving.', objectives: 'Algebra', topics: 'Equations', outcomes: 'Solves Grade 10 problems', startsOn: '2026-11-10', endsOn: null, ...over });
const maths: EnrolledSubject = { subjectId: 'sub-ma', subjectName: 'Mathematics', gradeName: 'Grade 10', scheduleStart: '2026-11-10', firstClass: '2026-11-10' };
const english: EnrolledSubject = { subjectId: 'sub-en', subjectName: 'English', gradeName: 'Grade 10', scheduleStart: '2026-11-10', firstClass: '2026-11-11' };
const science: EnrolledSubject = { subjectId: 'sub-sc', subjectName: 'Science', gradeName: 'Grade 10', scheduleStart: '2026-11-10', firstClass: '2026-11-12' };
const MEETING = '2026-12-10';
const plans = (entries: Array<[string, SubjectPlanFields]>) => new Map(entries);

describe('checking one subject plan', () => {
  const ctx = { scheduleStart: '2026-11-10', meetingDate: null as string | null };

  it('needs a description and a real start date, and accepts the rest as optional text', () => {
    expect(checkSubjectPlan({ description: '  ', startsOn: '2026-11-10' }, ctx)).toEqual({ ok: false, message: 'Write the learning plan description for this subject.' });
    expect(checkSubjectPlan({ description: 'x' }, ctx)).toMatchObject({ ok: false, message: expect.stringContaining('real start date') });
    expect(checkSubjectPlan({ description: 'x', startsOn: '2026-02-30' }, ctx)).toMatchObject({ ok: false });
    expect(checkSubjectPlan({ description: 'x', startsOn: '10/11/2026' }, ctx)).toMatchObject({ ok: false });
    expect(checkSubjectPlan({ description: ' Improve ', startsOn: '2026-11-10' }, ctx)).toEqual({ ok: true, value: { description: 'Improve', objectives: '', topics: '', outcomes: '', startsOn: '2026-11-10', endsOn: null } });
    expect(checkSubjectPlan(null, ctx)).toMatchObject({ ok: false });
    expect(checkSubjectPlan({ description: 5, startsOn: '2026-11-10' }, ctx)).toMatchObject({ ok: false, message: expect.stringContaining('must be text') });
  });

  it('limits the length of every text field', () => {
    for (const field of ['description', 'objectives', 'topics', 'outcomes']) {
      expect(checkSubjectPlan({ description: 'x', startsOn: '2026-11-10', [field]: 'y'.repeat(2001) }, ctx)).toMatchObject({ ok: false, message: expect.stringContaining('2000') });
    }
  });

  it('cannot start before the classes start', () => {
    expect(checkSubjectPlan({ description: 'x', startsOn: '2026-11-09' }, ctx)).toMatchObject({ ok: false, message: expect.stringContaining('before the classes start on 2026-11-10') });
    expect(checkSubjectPlan({ description: 'x', startsOn: '2026-11-09' }, { scheduleStart: null, meetingDate: null })).toMatchObject({ ok: true });
  });

  it('refuses an end date while no meeting is scheduled, so no date is ever invented', () => {
    expect(checkSubjectPlan({ description: 'x', startsOn: '2026-11-10', endsOn: '2026-12-10' }, ctx)).toMatchObject({ ok: false, message: expect.stringContaining('no meeting is scheduled yet') });
  });

  it('with a meeting, the end date is the meeting date unless the Mentor chooses an earlier one', () => {
    const withMeeting = { scheduleStart: '2026-11-10', meetingDate: MEETING };
    expect(checkSubjectPlan({ description: 'x', startsOn: '2026-11-10' }, withMeeting)).toMatchObject({ ok: true, value: { endsOn: MEETING } });
    expect(checkSubjectPlan({ description: 'x', startsOn: '2026-11-10', endsOn: '2026-12-01' }, withMeeting)).toMatchObject({ ok: true, value: { endsOn: '2026-12-01' } });
    expect(checkSubjectPlan({ description: 'x', startsOn: '2026-11-10', endsOn: '2026-12-11' }, withMeeting)).toMatchObject({ ok: false, message: expect.stringContaining('later than the monthly review meeting') });
    expect(checkSubjectPlan({ description: 'x', startsOn: '2026-11-20', endsOn: '2026-11-19' }, withMeeting)).toMatchObject({ ok: false, message: 'The end date cannot be earlier than the start date.' });
    expect(checkSubjectPlan({ description: 'x', startsOn: '2026-12-11' }, withMeeting)).toMatchObject({ ok: false, message: expect.stringContaining('cannot start after the monthly review meeting') });
    expect(checkSubjectPlan({ description: 'x', startsOn: '2026-11-10', endsOn: 'soon' }, withMeeting)).toMatchObject({ ok: false });
    expect(checkSubjectPlan({ description: 'x', startsOn: MEETING }, withMeeting)).toMatchObject({ ok: true, value: { startsOn: MEETING, endsOn: MEETING } });
  });
});

describe('the default start date', () => {
  const subject = (over: object) => ({ startDate: '2026-11-10', frequency: 'WEEKLY' as const, sessions: [{ dayNumber: 3 as const, week: null, occurrences: [], start: 900, end: 960, durationMinutes: 60, label: 'Wednesday' }], ...over });

  it('is the first date a class really happens, found from the saved schedule rule', () => {
    expect(firstClassDate(subject({}))).toBe('2026-11-11'); // Tuesday 10 start, Wednesday class
    expect(firstClassDate(subject({ startDate: '2026-11-11' }))).toBe('2026-11-11');
  });

  it('follows bi-weekly and monthly rules, and is empty when the schedule has no start date', () => {
    expect(firstClassDate(subject({ frequency: 'BIWEEKLY', sessions: [{ dayNumber: 3, week: 2, occurrences: [], start: 900, end: 960, durationMinutes: 60, label: 'Week 2 Wednesday' }] }))).toBe('2026-11-18');
    expect(firstClassDate(subject({ frequency: 'MONTHLY', startDate: '2026-11-01', sessions: [{ dayNumber: 1, week: null, occurrences: ['THIRD'], start: 900, end: 960, durationMinutes: 60, label: 'Third Monday' }] }))).toBe('2026-11-16');
    expect(firstClassDate(subject({ startDate: null }))).toBeNull();
  });
});

describe('the status of each subject and of the whole plan', () => {
  const all = [maths, english, science];

  it('a subject is not started, a draft, pending its end date, or complete, on its own', () => {
    expect(subjectStatus(undefined, MEETING)).toBe('NOT_STARTED');
    expect(subjectStatus(full({ description: '' }), MEETING)).toBe('DRAFT');
    expect(subjectStatus(full({ startsOn: null }), MEETING)).toBe('DRAFT');
    expect(subjectStatus(full(), null)).toBe('PENDING_END_DATE');
    expect(subjectStatus(full({ endsOn: null }), MEETING)).toBe('PENDING_END_DATE');
    expect(subjectStatus(full({ endsOn: MEETING }), MEETING)).toBe('COMPLETE');
  });

  it('is not started until a subject has a plan', () => {
    expect(overallStatus({ enrolled: all, plans: plans([]), planStatus: null, meetingDate: null })).toBe('NOT_STARTED');
    expect(overallStatus({ enrolled: [], plans: plans([]), planStatus: null, meetingDate: null })).toBe('NOT_STARTED');
  });

  it('another subject plan never completes a subject: one done and two missing is a draft', () => {
    expect(overallStatus({ enrolled: all, plans: plans([['sub-ma', full({ endsOn: MEETING })]]), planStatus: 'DRAFT', meetingDate: MEETING })).toBe('DRAFT');
  });

  it('every subject complete but no meeting is pending the review date, and with a meeting it follows the saved plan status', () => {
    const every = (endsOn: string | null) => plans(all.map((s) => [s.subjectId, full({ endsOn })] as [string, SubjectPlanFields]));
    expect(overallStatus({ enrolled: all, plans: every(null), planStatus: 'DRAFT', meetingDate: null })).toBe('PENDING_REVIEW_DATE');
    expect(overallStatus({ enrolled: all, plans: every(MEETING), planStatus: 'DRAFT', meetingDate: MEETING })).toBe('DRAFT');
    expect(overallStatus({ enrolled: all, plans: every(MEETING), planStatus: 'READY_FOR_REVIEW', meetingDate: MEETING })).toBe('READY_FOR_REVIEW');
    expect(overallStatus({ enrolled: all, plans: every(MEETING), planStatus: 'APPROVED', meetingDate: MEETING })).toBe('APPROVED');
  });

  it('a subject added to the schedule after approval takes the plan out of Approved', () => {
    const two = plans([maths, english].map((s) => [s.subjectId, full({ endsOn: MEETING })] as [string, SubjectPlanFields]));
    expect(overallStatus({ enrolled: [maths, english], plans: two, planStatus: 'APPROVED', meetingDate: MEETING })).toBe('APPROVED');
    expect(overallStatus({ enrolled: all, plans: two, planStatus: 'APPROVED', meetingDate: MEETING })).toBe('DRAFT');
  });

  it('says in words what stops the plan being ready, including the pending meeting', () => {
    const problems = readinessProblems(all, plans([['sub-ma', full()], ['sub-en', full({ description: '' })]]), null);
    expect(problems).toEqual(['English: the description and start date are required.', 'Science: no learning plan yet.', `${PENDING_REVIEW_MESSAGE}. ${PENDING_REVIEW_EXPLANATION}`]);
    expect(readinessProblems(all, plans(all.map((s) => [s.subjectId, full({ endsOn: MEETING })] as [string, SubjectPlanFields])), MEETING)).toEqual([]);
  });
});

describe('following the monthly review meeting date', () => {
  it('moves every end date that was the meeting date, fills empty ones, and drops them all when the meeting is cancelled', () => {
    expect(syncedEndDate(null, null, MEETING)).toBe(MEETING);
    expect(syncedEndDate('2026-12-10', '2026-12-10', '2026-12-17')).toBe('2026-12-17');
    expect(syncedEndDate('2026-12-10', '2026-12-10', null)).toBeNull();
  });

  it('keeps an earlier end date the Mentor chose, unless the meeting moved before it', () => {
    expect(syncedEndDate('2026-12-01', '2026-12-10', '2026-12-17')).toBe('2026-12-01');
    expect(syncedEndDate('2026-12-08', '2026-12-10', '2026-12-05')).toBe('2026-12-05');
  });

  it('accepts a real meeting date that is not before any plan has started, and nothing else', () => {
    expect(meetingDateProblem('2026-12-10', ['2026-11-10', '2026-11-12'])).toBeNull();
    expect(meetingDateProblem('2026-11-11', ['2026-11-10', '2026-11-12'])).toMatch(/cannot be before 2026-11-12/);
    expect(meetingDateProblem('next month', [])).toMatch(/real meeting date/);
    expect(meetingDateProblem(undefined, [])).toMatch(/real meeting date/);
  });

  it('lists exactly which fields changed, for the history', () => {
    expect(changedFields(null, full())).toEqual(['created']);
    expect(changedFields(full(), full({ objectives: 'Geometry', startsOn: '2026-11-11' }))).toEqual(['objectives', 'startsOn']);
    expect(changedFields(full(), full())).toEqual([]);
  });
});
