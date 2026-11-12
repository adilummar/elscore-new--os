import { MEETING_QUEUES, examSummaryText, goalsSummaryText, meetingsQuery, preparationLeft, preparationText, queueCount, whenText } from './meetings-view';

const tally = (over: object = {}) => ({ total: 0, yes: 0, partially: 0, no: 0, unevaluated: 0, percent: null, result: null, ...over }) as never;
const prep = (over: object = {}) => ({ examsReviewed: false, subjects: 2, subjectsWithGoals: 0, tutorObservations: 0, nextPlanSubjects: 0, nextPlanApproved: false, ...over });

describe('Meetings: queues', () => {
  it('counts each queue from the API counts', () => {
    const data = { counts: { NOT_SCHEDULED: 2, SCHEDULED: 3, COMPLETED: 5 }, overdue: 1, total: 10 };
    const by = Object.fromEntries(MEETING_QUEUES.map((q) => [q.key, queueCount(q, data)]));
    expect(by).toMatchObject({ all: 10, schedule: 2, upcoming: 3, overdue: 1, completed: 5, progress: 0 });
  });
});

describe('Meetings: what is left to prepare', () => {
  it('lists every missing step in words', () => {
    const left = preparationLeft({ state: 'SCHEDULED', preparation: prep(), goals: tally({ total: 2, unevaluated: 2 }) });
    expect(left).toEqual(['Review the exam results', 'Goals for 2 of 2 subjects', '2 goals not evaluated', 'Tutor observations for 2 of 2 subjects', 'Next plan for 2 of 2 subjects']);
  });
  it('asks for the approval once every subject has a next plan', () => {
    const p = prep({ examsReviewed: true, subjectsWithGoals: 2, tutorObservations: 2, nextPlanSubjects: 2 });
    expect(preparationLeft({ state: 'REVIEW_IN_PROGRESS', preparation: p, goals: tally() })).toEqual(['Approve the next plan']);
    expect(preparationLeft({ state: 'REVIEW_IN_PROGRESS', preparation: { ...p, nextPlanApproved: true }, goals: tally() })).toEqual([]);
  });
  it('has nothing to prepare for a student with no meeting yet, or a completed review', () => {
    expect(preparationLeft({ state: 'NOT_SCHEDULED', preparation: prep(), goals: tally() })).toEqual([]);
    expect(preparationText({ state: 'COMPLETED', preparation: prep(), goals: tally() })).toEqual({ tone: 'done', text: 'Review completed' });
    expect(preparationText({ state: 'NOT_SCHEDULED', preparation: prep(), goals: tally() }).tone).toBe('none');
    expect(preparationText({ state: 'SCHEDULED', preparation: prep(), goals: tally() }).text).toBe('4 to do');
  });
});

describe('Meetings: wording', () => {
  it('shows a missing date and a missing time as missing', () => {
    expect(whenText({ date: null, startMinute: null, endMinute: null })).toBe('No date yet');
    expect(whenText({ date: '2026-12-10', startMinute: null, endMinute: null })).toBe('2026-12-10, No time set');
  });
  it('says what the exams and goals are without inventing marks', () => {
    expect(examSummaryText({ total: 0, conducted: 0, marked: 0, averagePercentage: null })).toBe('No exams in this period');
    expect(examSummaryText({ total: 3, conducted: 2, marked: 1, averagePercentage: null })).toBe('2 of 3 sat, 1 marked, no marks yet');
    expect(examSummaryText({ total: 2, conducted: 2, marked: 2, averagePercentage: 72.5 })).toContain('average 72.5%');
    expect(goalsSummaryText(tally())).toBe('No goals set');
    expect(goalsSummaryText(tally({ total: 3, unevaluated: 3 }))).toBe('3 goals, none evaluated');
    expect(goalsSummaryText(tally({ total: 3, yes: 1, partially: 1, no: 1 }))).toBe('1 met, 1 partly, 1 not met of 3');
  });
  it('sends only the filters that are set', () => {
    expect(meetingsQuery({ state: '', student: '', from: '', to: '' })).toBe('?page=1&pageSize=100');
    expect(meetingsQuery({ state: 'OVERDUE', student: 'a b', from: '', to: '' })).toBe('?state=OVERDUE&student=a%20b&page=1&pageSize=100');
  });
});
