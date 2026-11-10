import {
  CompletionFacts, GoalResult, MEETING_STATE_LABELS, MeetingState, POST_MEETING_FIELDS, ReviewFacts, checkActual, checkArea, checkFields, checkGoal, checkMove, checkNextPlan, checkSchedule, checklistProblems, completionChecklist,
  examAverage, goalsFromPlan, inPeriod, meetingState, nextPeriodStart, tally,
} from './review';

describe('scheduling and moving the meeting', () => {
  it('needs a real date, and a time only as a start with an end after it', () => {
    expect(checkSchedule({ date: '2026-12-10' })).toEqual({ ok: true, value: { date: '2026-12-10', startMinute: null, endMinute: null } });
    expect(checkSchedule({ date: '2026-12-10', start: '16:30', end: '17:30' })).toEqual({ ok: true, value: { date: '2026-12-10', startMinute: 990, endMinute: 1050 } });
    expect(checkSchedule({ date: 'soon' })).toMatchObject({ ok: false, message: expect.stringContaining('real meeting date') });
    expect(checkSchedule({ date: '2026-02-30' })).toMatchObject({ ok: false });
    expect(checkSchedule({ date: '2026-12-10', start: '16:30' })).toMatchObject({ ok: false, message: expect.stringContaining('both') });
    expect(checkSchedule({ date: '2026-12-10', start: '17:30', end: '16:30' })).toMatchObject({ ok: false, message: expect.stringContaining('end after it starts') });
    expect(checkSchedule({ date: '2026-12-10', start: 'late', end: '17:00' })).toMatchObject({ ok: false, message: expect.stringContaining('like 16:30') });
    expect(checkSchedule(null)).toMatchObject({ ok: false });
  });

  it('a move needs a new date and a reason', () => {
    expect(checkMove({ newDate: '2026-12-12', newStart: '10:00', newEnd: '11:00', reason: 'Parent travelling' })).toEqual({ ok: true, value: { date: '2026-12-12', startMinute: 600, endMinute: 660, reason: 'Parent travelling' } });
    expect(checkMove({ newDate: '2026-12-12', reason: '  ' })).toMatchObject({ ok: false, message: 'Say why the meeting is being rescheduled.' });
    expect(checkMove({ newDate: 'x', reason: 'r' })).toMatchObject({ ok: false, message: expect.stringContaining('new meeting date') });
    expect(checkMove({ newDate: '2026-12-12', reason: 'x'.repeat(1001) })).toMatchObject({ ok: false });
  });
});

describe('what really happened at the meeting', () => {
  const good = { actualDate: '2026-12-10', start: '16:35', end: '17:20', attendees: ['Mentor', 'Parent A'], participation: 'FULL', participationNote: '' };

  it('records the actual date, times, attendees and parent participation', () => {
    expect(checkActual(good, '2026-12-10')).toEqual({ ok: true, value: { actualDate: '2026-12-10', startMinute: 995, endMinute: 1040, attendees: ['Mentor', 'Parent A'], participation: 'FULL', participationNote: null } });
  });

  it('refuses a future date, missing or backwards times, no attendees and no parent answer', () => {
    expect(checkActual({ ...good, actualDate: '2026-12-11' }, '2026-12-10')).toMatchObject({ ok: false, message: 'The meeting date cannot be in the future.' });
    expect(checkActual({ ...good, start: undefined }, '2026-12-10')).toMatchObject({ ok: false, message: expect.stringContaining('start and end times') });
    expect(checkActual({ ...good, end: '16:00' }, '2026-12-10')).toMatchObject({ ok: false, message: expect.stringContaining('end after it starts') });
    expect(checkActual({ ...good, attendees: [' '] }, '2026-12-10')).toMatchObject({ ok: false, message: 'Write who attended the meeting.' });
    expect(checkActual({ ...good, participation: 'MAYBE' }, '2026-12-10')).toMatchObject({ ok: false, message: expect.stringContaining('parent took part') });
    expect(checkActual({ ...good, actualDate: 'x' }, '2026-12-10')).toMatchObject({ ok: false });
  });
});

describe('goals', () => {
  it('needs the planned goal, and lets the evaluation be filled in later', () => {
    expect(checkGoal({ goal: 'Read a page aloud' })).toMatchObject({ ok: true, value: { goal: 'Read a page aloud', result: null, actualProgress: null } });
    expect(checkGoal({ goal: ' ' })).toMatchObject({ ok: false, message: 'Write the planned goal.' });
    expect(checkGoal({ goal: 'g', result: 'MAYBE' })).toMatchObject({ ok: false, message: expect.stringContaining('yes, partially or no') });
    expect(checkGoal({ goal: 'g', evidence: 5 })).toMatchObject({ ok: false });
    expect(checkGoal({ goal: 'g', actualProgress: 'x'.repeat(2001) })).toMatchObject({ ok: false });
  });

  it('takes the goals from the plan as they were written, without adding any', () => {
    expect(goalsFromPlan('- Read a page aloud\n2) Write five sentences\n\n* Spell ten words', 'A plan')).toEqual(['Read a page aloud', 'Write five sentences', 'Spell ten words']);
    expect(goalsFromPlan('', 'Improve reading')).toEqual(['Improve reading']);
    expect(goalsFromPlan('  ', '  ')).toEqual([]);
  });

  it('works out a subject result from its separate goals, never from one box', () => {
    const t = (...r: Array<GoalResult | null>) => tally(r);
    expect(t('YES', 'YES')).toMatchObject({ result: 'YES', percent: 100, unevaluated: 0 });
    expect(t('NO', 'NO')).toMatchObject({ result: 'NO', percent: 0 });
    expect(t('YES', 'PARTIALLY', 'NO')).toMatchObject({ result: 'PARTIALLY', percent: 50, yes: 1, partially: 1, no: 1 });
    expect(t('YES', null)).toMatchObject({ result: null, percent: 100, unevaluated: 1 }); // not decided until every goal is
    expect(t(null, null)).toMatchObject({ result: null, percent: null, unevaluated: 2 });
    expect(t()).toMatchObject({ total: 0, result: null, percent: null });
  });
});

describe('the remarks', () => {
  it('keeps each field apart, lets one be sent alone, and clears one that is emptied', () => {
    expect(checkFields({ whatImproved: 'Reading fluency' }, ['whatImproved', 'mentorObservations'])).toEqual({ ok: true, value: { whatImproved: 'Reading fluency' } });
    expect(checkFields({ whatImproved: '' }, ['whatImproved'])).toEqual({ ok: true, value: { whatImproved: '' } });
    expect(checkFields({ mentorObservations: 'x' }, ['whatImproved'])).toMatchObject({ ok: false, message: expect.stringContaining('not a field of this section') });
    expect(checkFields({ whatImproved: 4 }, ['whatImproved'])).toMatchObject({ ok: false, message: 'The what improved must be text.' });
    expect(checkFields({}, ['whatImproved'])).toMatchObject({ ok: false, message: 'Send at least one remark.' });
    expect(checkFields({ agreedActions: 'x'.repeat(2001) }, POST_MEETING_FIELDS)).toMatchObject({ ok: false, message: expect.stringContaining('2000') });
  });

  it('an improvement area needs its words, and belongs to a subject or to the student as a whole', () => {
    expect(checkArea({ subjectId: 'sub-en', area: 'Past tense' })).toEqual({ ok: true, value: { subjectId: 'sub-en', area: 'Past tense' } });
    expect(checkArea({ area: 'Homework routine' })).toEqual({ ok: true, value: { subjectId: null, area: 'Homework routine' } });
    expect(checkArea({ area: ' ' })).toMatchObject({ ok: false });
    expect(checkArea({ area: 'x'.repeat(501) })).toMatchObject({ ok: false });
  });
});

describe('the next plan', () => {
  it('has the same fields as the Individual Learning Plan, and says whether the goals are new, continued or revised', () => {
    expect(checkNextPlan({ kind: 'CONTINUED', description: 'Keep reading practice', objectives: 'Read daily', topics: '', outcomes: 'Fluent reading' })).toEqual({ ok: true, value: { kind: 'CONTINUED', description: 'Keep reading practice', objectives: 'Read daily', topics: '', outcomes: 'Fluent reading' } });
    expect(checkNextPlan({ kind: 'OTHER', description: 'd' })).toMatchObject({ ok: false, message: expect.stringContaining('new, continued or revised') });
    expect(checkNextPlan({ kind: 'NEW', description: ' ' })).toMatchObject({ ok: false, message: expect.stringContaining('description') });
    expect(checkNextPlan({ kind: 'NEW', description: 'd', topics: 4 })).toMatchObject({ ok: false });
  });

  it('starts the next period the day after the last one ended', () => {
    expect(nextPeriodStart('2026-12-10')).toBe('2026-12-11');
    expect(nextPeriodStart('2026-12-31')).toBe('2027-01-01');
  });
});

describe('the state of a meeting', () => {
  const state = (over: Partial<ReviewFacts>): MeetingState => meetingState({ status: 'SCHEDULED', date: '2026-12-10', originalDate: '2026-12-10', conducted: null, ...over });

  it('follows what is recorded', () => {
    expect(state({ status: null, date: null, originalDate: null })).toBe('NOT_SCHEDULED');
    expect(state({})).toBe('SCHEDULED');
    expect(state({ date: '2026-12-12' })).toBe('RESCHEDULED');
    expect(state({ conducted: true })).toBe('REVIEW_IN_PROGRESS');
    expect(state({ conducted: false })).toBe('NOT_CONDUCTED');
    expect(state({ status: 'COMPLETED', conducted: true })).toBe('COMPLETED');
    expect(state({ status: 'CANCELLED' })).toBe('CANCELLED');
  });

  it('has a plain label for every state, without dashes', () => {
    expect(Object.keys(MEETING_STATE_LABELS)).toHaveLength(7);
    expect(Object.values(MEETING_STATE_LABELS).join(' ')).not.toMatch(/[–—]/);
  });
});

describe('the completion checklist', () => {
  const full = (): CompletionFacts => ({
    conducted: true, actualRecorded: true, examsReviewed: true, hasPlan: true,
    subjects: [{ subjectId: 'en', name: 'English', goals: [{ result: 'YES', actualProgress: 'Reads well' }], tutorObserved: true, nextPlanned: true }, { subjectId: 'ma', name: 'Mathematics', goals: [{ result: 'PARTIALLY', actualProgress: 'Fractions weak' }, { result: 'NO', actualProgress: 'No progress' }], tutorObserved: true, nextPlanned: true }],
    improvementAreas: 2, noImprovementReason: false, expectationsRecorded: true, parentCommunicationRecorded: true, mentorObserved: true, nextPlanApproved: true,
  });
  const missing = (f: CompletionFacts) => completionChecklist(f).filter((r) => !r.done).map((r) => r.key);

  it('has the nine items, all done when everything is recorded', () => {
    const rows = completionChecklist(full());
    expect(rows.map((r) => r.key)).toEqual(['CONDUCTED', 'ACTUAL_TIME', 'EXAMS_REVIEWED', 'GOALS_EVALUATED', 'IMPROVEMENT_AREAS', 'PARENT_RECORDED', 'OBSERVATIONS', 'NEXT_PLAN', 'NEXT_PLAN_APPROVED']);
    expect(missing(full())).toEqual([]);
    expect(checklistProblems(rows)).toEqual([]);
  });

  it('is not complete until the meeting is recorded as conducted, with its real time', () => {
    expect(missing({ ...full(), conducted: null })).toEqual(['CONDUCTED']);
    expect(completionChecklist({ ...full(), conducted: false })[0].detail).toContain('Reschedule');
    expect(missing({ ...full(), actualRecorded: false })).toEqual(['ACTUAL_TIME']);
  });

  it('needs exam performance reviewed, even when there were no exams', () => {
    expect(missing({ ...full(), examsReviewed: false })).toEqual(['EXAMS_REVIEWED']);
  });

  it('needs every goal of every subject evaluated, with its progress, and a plan to evaluate', () => {
    const f = full();
    f.subjects[1].goals[1] = { result: null, actualProgress: 'x' };
    expect(missing(f)).toEqual(['GOALS_EVALUATED']);
    expect(completionChecklist(f)[3].detail).toBe('Evaluate every goal of Mathematics');
    const g = full();
    g.subjects[0].goals[0] = { result: 'YES', actualProgress: null };
    expect(missing(g)).toEqual(['GOALS_EVALUATED']);
    const h = full();
    h.subjects[0].goals = [];
    expect(completionChecklist(h)[3].detail).toBe('No goal for English');
    expect(missing({ ...full(), hasPlan: false })).toEqual(['GOALS_EVALUATED']);
  });

  it('needs improvement areas, or the reason there are none', () => {
    expect(missing({ ...full(), improvementAreas: 0 })).toEqual(['IMPROVEMENT_AREAS']);
    expect(missing({ ...full(), improvementAreas: 0, noImprovementReason: true })).toEqual([]);
  });

  it('needs the parent expectations and, separately, what the parent communicated', () => {
    expect(missing({ ...full(), expectationsRecorded: false })).toEqual(['PARENT_RECORDED']);
    expect(completionChecklist({ ...full(), expectationsRecorded: false })[5].detail).toContain('expect from the parent');
    expect(completionChecklist({ ...full(), parentCommunicationRecorded: false })[5].detail).toContain('parent communicated');
  });

  it('needs the Mentor observations and a tutor observation for every subject', () => {
    expect(missing({ ...full(), mentorObserved: false })).toEqual(['OBSERVATIONS']);
    const f = full();
    f.subjects[1].tutorObserved = false;
    expect(completionChecklist(f)[6].detail).toBe('Record the tutor observations for Mathematics');
  });

  it('needs the next plan for every subject, and its approval', () => {
    const f = full();
    f.subjects[0].nextPlanned = false;
    expect(missing(f)).toEqual(['NEXT_PLAN']);
    expect(completionChecklist(f)[7].detail).toBe('Write the next plan for English');
    expect(missing({ ...full(), nextPlanApproved: false })).toEqual(['NEXT_PLAN_APPROVED']);
  });

  it('reports every missing item at once, in words', () => {
    const none: CompletionFacts = { conducted: null, actualRecorded: false, examsReviewed: false, hasPlan: false, subjects: [], improvementAreas: 0, noImprovementReason: false, expectationsRecorded: false, parentCommunicationRecorded: false, mentorObserved: false, nextPlanApproved: false };
    expect(checklistProblems(completionChecklist(none))).toHaveLength(9);
  });
});

describe('exams in the learning period', () => {
  const e = (date: string, pct: number | null) => ({ id: date, subjectId: 'en', date, kind: 'EXAM', conducted: true, marks: pct === null ? null : { obtained: pct, max: 100, percentage: pct } });

  it('counts both ends of the period and nothing outside it', () => {
    expect(inPeriod('2026-11-10', '2026-11-10', '2026-12-10')).toBe(true);
    expect(inPeriod('2026-12-10', '2026-11-10', '2026-12-10')).toBe(true);
    expect(inPeriod('2026-11-09', '2026-11-10', '2026-12-10')).toBe(false);
    expect(inPeriod('2026-12-11', '2026-11-10', '2026-12-10')).toBe(false);
    expect(inPeriod('2026-11-20', null, '2026-12-10')).toBe(false);
  });

  it('averages only the exams that have marks, and invents nothing for the others', () => {
    expect(examAverage([e('2026-11-12', 80), e('2026-11-19', 60)])).toBe(70);
    expect(examAverage([e('2026-11-12', 80), e('2026-11-19', null)])).toBe(80);
    expect(examAverage([e('2026-11-19', null)])).toBeNull();
    expect(examAverage([])).toBeNull();
  });
});
