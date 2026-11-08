import { DateCheck } from '../tutor/tutor-calendar';

import {
  AvailabilityOf, PlanAssignment, PlanOverride, PlanSession, PlanSubject, biweeklyAnchor, buildEvents, periodFor, rangeProblem, subjectWarnings, summarise, timetableStatus,
} from './student-timetable';

const m = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));
const MON = 1, TUE = 2, WED = 3, THU = 4, FRI = 5, SAT = 6, SUN = 0;

const session = (dayNumber: number, start: string | null, end: string | null, extra: Partial<PlanSession> = {}): PlanSession => ({
  dayNumber: dayNumber as PlanSession['dayNumber'], week: null, occurrences: [], start: start ? m(start) : null, end: end ? m(end) : null,
  durationMinutes: start && end ? m(end) - m(start) : 60, label: `day ${dayNumber}`, ...extra,
});
const subject = (over: Partial<PlanSubject> = {}): PlanSubject => ({ subjectId: 'sub-en', subjectName: 'English', gradeName: 'Grade 8', frequency: 'WEEKLY', startDate: '2026-11-09', sessions: [session(MON, '15:00', '16:00')], ...over });
const tutor = (subjectId: string, name: string, over: Partial<PlanAssignment> = {}): PlanAssignment => ({ id: `as-${subjectId}`, subjectId, status: 'ACTIVE', tutorProfileId: `tp-${name}`, tutorName: name, ...over });
const free: AvailabilityOf = (_a, _s, date) => ({ date, status: 'AVAILABLE', reason: 'Available.' });
const build = (subjects: PlanSubject[], assignments: PlanAssignment[], from: string, to: string, extra: { overrides?: PlanOverride[]; availabilityOf?: AvailabilityOf } = {}) =>
  buildEvents({ subjects, assignments, overrides: extra.overrides ?? [], from, to, availabilityOf: extra.availabilityOf ?? free });
const dates = (events: Array<{ date: string }>) => events.map((e) => e.date);

describe('a weekly timetable', () => {
  it('shows each configured class on its real date with the right tutor, times and length', () => {
    const events = build([subject({ sessions: [session(MON, '15:00', '16:00'), session(WED, '16:00', '17:30')] })], [tutor('sub-en', 'Anjali')], '2026-11-09', '2026-11-15');
    expect(events.map((e) => [e.date, e.startMinute, e.endMinute, e.durationMinutes, e.tutorName, e.subjectName, e.gradeName])).toEqual([
      ['2026-11-09', 900, 960, 60, 'Anjali', 'English', 'Grade 8'],
      ['2026-11-11', 960, 1050, 90, 'Anjali', 'English', 'Grade 8'],
    ]);
    expect(events.every((e) => e.frequency === 'WEEKLY' && e.week === null && e.classStatus === 'SCHEDULED')).toBe(true);
  });

  it('repeats every week, not only once, and not before the start date', () => {
    const events = build([subject({ startDate: '2026-11-16' })], [tutor('sub-en', 'Anjali')], '2026-11-09', '2026-12-06');
    expect(dates(events)).toEqual(['2026-11-16', '2026-11-23', '2026-11-30']);
  });

  it('leaves empty days empty', () => {
    const events = build([subject()], [tutor('sub-en', 'Anjali')], '2026-11-09', '2026-11-15');
    expect(new Set(dates(events))).toEqual(new Set(['2026-11-09']));
  });

  it('shows several subjects with different tutors, and several classes on one day, side by side', () => {
    const subjects = [
      subject({ sessions: [session(MON, '15:00', '16:00'), session(MON, '17:00', '18:00')] }),
      subject({ subjectId: 'sub-ma', subjectName: 'Mathematics', sessions: [session(MON, '16:00', '17:00'), session(FRI, '16:00', '17:00')] }),
    ];
    const events = build(subjects, [tutor('sub-en', 'Anjali'), tutor('sub-ma', 'Rahul')], '2026-11-09', '2026-11-15');
    expect(events.map((e) => `${e.date} ${e.startMinute / 60} ${e.subjectName} ${e.tutorName}`)).toEqual([
      '2026-11-09 15 English Anjali', '2026-11-09 16 Mathematics Rahul', '2026-11-09 17 English Anjali', '2026-11-13 16 Mathematics Rahul',
    ]);
    expect(events.every((e) => e.overlaps.length === 0)).toBe(true); // back to back is not an overlap
  });
});

describe('a bi-weekly timetable', () => {
  const plan = subject({ frequency: 'BIWEEKLY', sessions: [session(MON, '15:00', '16:00', { week: 1 }), session(WED, '16:00', '17:00', { week: 1 }), session(TUE, '16:00', '17:00', { week: 2 }), session(THU, '15:00', '16:00', { week: 2 })] });

  it('Week 1 holds only the Week 1 days and Week 2 only the Week 2 days, not a copy', () => {
    const events = build([plan], [tutor('sub-en', 'Anjali')], '2026-11-09', '2026-11-22');
    const week1 = events.filter((e) => e.date <= '2026-11-15');
    const week2 = events.filter((e) => e.date >= '2026-11-16');
    expect(week1.map((e) => [e.date, e.week])).toEqual([['2026-11-09', 1], ['2026-11-11', 1]]);
    expect(week2.map((e) => [e.date, e.week])).toEqual([['2026-11-17', 2], ['2026-11-19', 2]]);
  });

  it('the combined view is both weeks in date order, and the cycle then starts again', () => {
    const events = build([plan], [tutor('sub-en', 'Anjali')], '2026-11-09', '2026-12-06');
    expect(dates(events)).toEqual(['2026-11-09', '2026-11-11', '2026-11-17', '2026-11-19', '2026-11-23', '2026-11-25', '2026-12-01', '2026-12-03']);
    expect(events.map((e) => e.week)).toEqual([1, 1, 2, 2, 1, 1, 2, 2]);
  });

  it('counts Week 1 from the week of the start date, so a mid-week start keeps its meaning', () => {
    const events = build([{ ...plan, startDate: '2026-11-12' }], [tutor('sub-en', 'Anjali')], '2026-11-09', '2026-11-22');
    // Week 1 is the week of Thursday 12 November, so Monday 9 and Wednesday 11 are before the start and Thursday 12 has no Week 1 class.
    expect(dates(events)).toEqual(['2026-11-17', '2026-11-19']);
  });

  it('opens a two-week block aligned to the earliest start date', () => {
    const anchor = biweeklyAnchor([plan]);
    expect(anchor).toBe('2026-11-09');
    expect(periodFor('biweekly', '2026-11-12', anchor)).toEqual({ view: 'biweekly', from: '2026-11-09', to: '2026-11-22', month: null });
    expect(periodFor('biweekly', '2026-11-18', anchor)).toEqual({ view: 'biweekly', from: '2026-11-09', to: '2026-11-22', month: null });
    expect(periodFor('biweekly', '2026-11-23', anchor).from).toBe('2026-11-23');
    expect(periodFor('biweekly', '2026-11-02', anchor).from).toBe('2026-10-26'); // going back keeps the same two-week rhythm
  });
});

describe('a monthly timetable', () => {
  it('produces the first Monday and the third Saturday of the month, and not weekly or bi-weekly copies', () => {
    const plan = subject({ frequency: 'MONTHLY', startDate: '2026-11-01', sessions: [session(MON, '15:00', '16:00', { occurrences: ['FIRST'] }), session(SAT, '10:00', '11:00', { occurrences: ['THIRD'] })] });
    const period = periodFor('monthly', '2026-11-10');
    expect(period).toEqual({ view: 'monthly', from: '2026-10-26', to: '2026-12-06', month: '2026-11' });
    const events = build([plan], [tutor('sub-en', 'Anjali')], period.from, period.to);
    expect(events.map((e) => [e.date, e.startMinute / 60, e.frequency])).toEqual([['2026-11-02', 15, 'MONTHLY'], ['2026-11-21', 10, 'MONTHLY']]);
  });

  it('supports every, last and several picks in one month', () => {
    const every = build([subject({ frequency: 'MONTHLY', startDate: '2026-11-01', sessions: [session(TUE, '15:00', '16:00', { occurrences: ['EVERY'] })] })], [tutor('sub-en', 'A')], '2026-11-01', '2026-11-30');
    expect(dates(every)).toEqual(['2026-11-03', '2026-11-10', '2026-11-17', '2026-11-24']);
    const last = build([subject({ frequency: 'MONTHLY', startDate: '2026-11-01', sessions: [session(FRI, '15:00', '16:00', { occurrences: ['LAST'] })] })], [tutor('sub-en', 'A')], '2026-11-01', '2026-12-31');
    expect(dates(last)).toEqual(['2026-11-27', '2026-12-25']);
    const two = build([subject({ frequency: 'MONTHLY', startDate: '2026-11-01', sessions: [session(MON, '15:00', '16:00', { occurrences: ['FIRST', 'THIRD'] })] })], [tutor('sub-en', 'A')], '2026-11-01', '2026-11-30');
    expect(dates(two)).toEqual(['2026-11-02', '2026-11-16']);
  });

  it('builds the grid from Monday to Sunday and handles the turn of the year', () => {
    expect(periodFor('monthly', '2026-12-31')).toEqual({ view: 'monthly', from: '2026-11-30', to: '2027-01-03', month: '2026-12' });
    expect(periodFor('monthly', '2027-02-14')).toEqual({ view: 'monthly', from: '2027-02-01', to: '2027-02-28', month: '2027-02' });
    expect(periodFor('monthly', '2024-02-29').to).toBe('2024-03-03'); // leap day
  });
});

describe('date boundaries', () => {
  it('a Sunday belongs to the week that began on the Monday before it, and a Monday starts a new one', () => {
    expect(periodFor('weekly', '2026-11-15')).toEqual({ view: 'weekly', from: '2026-11-09', to: '2026-11-15', month: null });
    expect(periodFor('weekly', '2026-11-16').from).toBe('2026-11-16');
    expect(periodFor('weekly', '2026-11-09').from).toBe('2026-11-09');
  });

  it('a Sunday class is on the last day of its week, and a late-evening class keeps its own date', () => {
    const events = build([subject({ sessions: [session(SUN, '23:00', '23:59'), session(MON, '00:00', '01:00')] })], [tutor('sub-en', 'A')], '2026-11-09', '2026-11-15');
    expect(events.map((e) => [e.date, e.startMinute])).toEqual([['2026-11-09', 0], ['2026-11-15', 1380]]);
  });

  it('refuses a range that is not real, backwards, an unknown view, or longer than six weeks', () => {
    expect(rangeProblem('weekly', '2026-11-09', '2026-11-15')).toBeNull();
    expect(rangeProblem('monthly', '2026-10-26', '2026-12-06')).toBeNull();
    expect(rangeProblem('weekly', '2026-02-30', '2026-03-01')).toMatch(/real dates/);
    expect(rangeProblem('weekly', '2026-11-15', '2026-11-09')).toMatch(/not be before/);
    expect(rangeProblem('yearly', '2026-11-09', '2026-11-15')).toMatch(/weekly, bi-weekly or monthly/);
    expect(rangeProblem('monthly', '2026-10-01', '2026-12-31')).toMatch(/at most 42/);
  });
});

describe('plans that are not ready', () => {
  it('shows a warning, not a made-up class, when a class has no start time', () => {
    const plan = subject({ sessions: [session(MON, '15:00', '16:00'), session(WED, null, null)] });
    const events = build([plan], [tutor('sub-en', 'Anjali')], '2026-11-09', '2026-11-15');
    expect(events).toEqual([]);
    const warnings = subjectWarnings([plan], [tutor('sub-en', 'Anjali')]);
    expect(warnings).toEqual([expect.objectContaining({ kind: 'INCOMPLETE', message: expect.stringContaining('Every class needs a start time') })]);
  });

  it('a subject with no days is incomplete too', () => {
    expect(subjectWarnings([subject({ sessions: [] })], [tutor('sub-en', 'A')]).map((w) => w.kind)).toEqual(['INCOMPLETE']);
  });

  it('shows the classes of a subject with no tutor, marked as having none, and warns', () => {
    const plan = subject();
    const events = build([plan], [], '2026-11-09', '2026-11-15');
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ tutorName: null, tutorProfileId: null, assignmentState: 'NO_TUTOR', availability: null });
    expect(subjectWarnings([plan], []).map((w) => w.kind)).toEqual(['NO_TUTOR']);
  });

  it('warns when the tutor needs review and keeps the classes', () => {
    const a = tutor('sub-en', 'Anjali', { status: 'NEEDS_REVIEW' });
    const events = build([subject()], [a], '2026-11-09', '2026-11-15');
    expect(events).toHaveLength(1);
    expect(events[0].assignmentState).toBe('NEEDS_REVIEW');
    expect(events[0].problems.join(' ')).toContain('needs review');
    expect(subjectWarnings([subject()], [a]).map((w) => w.kind)).toEqual(['TUTOR_NEEDS_REVIEW']);
  });
});

describe('overlapping classes', () => {
  const overlapping = [subject({ sessions: [session(MON, '15:00', '16:00')] }), subject({ subjectId: 'sub-ma', subjectName: 'Mathematics', sessions: [session(MON, '15:30', '16:30')] })];
  const as = [tutor('sub-en', 'Anjali'), tutor('sub-ma', 'Rahul')];

  it('keeps both, points each at the other, and counts one conflict', () => {
    const events = build(overlapping, as, '2026-11-09', '2026-11-15');
    expect(events).toHaveLength(2);
    expect(events[0].overlaps).toEqual([events[1].id]);
    expect(events[1].overlaps).toEqual([events[0].id]);
    expect(events.every((e) => e.problems.includes('Overlaps another class of this student.'))).toBe(true);
    const summary = summarise(overlapping, as, events, subjectWarnings(overlapping, as));
    expect(summary.unresolvedConflicts).toBe(1);
    expect(timetableStatus({ summary, approvalItem: 'VERIFIED', stageStatus: 'IN_PROGRESS' })).toBe('CONFLICT_DETECTED');
  });

  it('three classes that all overlap are three conflicts, none hidden', () => {
    const three = [...overlapping, subject({ subjectId: 'sub-sc', subjectName: 'Science', sessions: [session(MON, '15:15', '16:15')] })];
    const a3 = [...as, tutor('sub-sc', 'Meera')];
    const events = build(three, a3, '2026-11-09', '2026-11-15');
    expect(summarise(three, a3, events, []).unresolvedConflicts).toBe(3);
  });
});

describe('a tutor whose availability changes', () => {
  it('keeps the class, shows why it no longer fits, and raises a conflict', () => {
    const onLeave: AvailabilityOf = (_a, _s, date): DateCheck => (date === '2026-11-16' ? { date, status: 'LEAVE', reason: 'On leave on Monday, 16 November.' } : { date, status: 'AVAILABLE', reason: 'Available.' });
    const plan = [subject()];
    const as = [tutor('sub-en', 'Anjali')];
    const events = build(plan, as, '2026-11-09', '2026-11-22', { availabilityOf: onLeave });
    expect(events).toHaveLength(2);
    const bad = events.find((e) => e.date === '2026-11-16')!;
    expect(bad.availability).toEqual({ status: 'LEAVE', reason: 'On leave on Monday, 16 November.' });
    expect(bad.problems).toContain('On leave on Monday, 16 November.');
    expect(bad.tutorName).toBe('Anjali'); // never swapped for another tutor
    expect(events.find((e) => e.date === '2026-11-09')!.problems).toEqual([]);
    const summary = summarise(plan, as, events, []);
    expect(summary.tutorIssues).toBe(1);
    expect(timetableStatus({ summary, approvalItem: null, stageStatus: 'IN_PROGRESS' })).toBe('CONFLICT_DETECTED');
  });
});

describe('a schedule that changes after the timetable was made', () => {
  it('the next read follows the saved change: new day, new time, new tutor', () => {
    const before = build([subject({ sessions: [session(MON, '15:00', '16:00')] })], [tutor('sub-en', 'Anjali')], '2026-11-09', '2026-11-15');
    const after = build([subject({ sessions: [session(WED, '17:00', '18:00')] })], [tutor('sub-en', 'Rahul')], '2026-11-09', '2026-11-15');
    expect(before.map((e) => [e.date, e.startMinute, e.tutorName])).toEqual([['2026-11-09', 900, 'Anjali']]);
    expect(after.map((e) => [e.date, e.startMinute, e.tutorName])).toEqual([['2026-11-11', 1020, 'Rahul']]);
  });
});

describe('cancelled and moved classes', () => {
  const override = (over: Partial<PlanOverride>): PlanOverride => ({ assignmentId: 'as-sub-en', date: '2026-11-16', originalStartMinute: 900, kind: 'CANCELLED', newDate: null, newStartMinute: null, newEndMinute: null, reason: 'Student away', ...over });

  it('shows a cancelled class as cancelled and leaves it out of the totals', () => {
    const plan = [subject()];
    const as = [tutor('sub-en', 'Anjali')];
    const events = build(plan, as, '2026-11-09', '2026-11-22', { overrides: [override({})] });
    expect(events.map((e) => [e.date, e.classStatus])).toEqual([['2026-11-09', 'SCHEDULED'], ['2026-11-16', 'CANCELLED']]);
    expect(events[1].notes).toEqual(['Cancelled: Student away']);
    expect(summarise(plan, as, events, []).scheduledSessions).toBe(1);
  });

  it('shows a moved class on its new date, and the old date as moved away', () => {
    const events = build([subject()], [tutor('sub-en', 'Anjali')], '2026-11-09', '2026-11-22', { overrides: [override({ kind: 'RESCHEDULED', newDate: '2026-11-18', newStartMinute: 1020, newEndMinute: 1080 })] });
    expect(events.map((e) => [e.date, e.startMinute, e.classStatus])).toEqual([['2026-11-09', 900, 'SCHEDULED'], ['2026-11-16', 900, 'RESCHEDULED'], ['2026-11-18', 1020, 'MOVED_HERE']]);
  });
});

describe('totals and status', () => {
  const plan = [subject({ sessions: [session(MON, '15:00', '16:00'), session(WED, '15:00', '16:30')] }), subject({ subjectId: 'sub-ma', subjectName: 'Mathematics', sessions: [session(FRI, '16:00', '17:00')] })];
  const as = [tutor('sub-en', 'Anjali'), tutor('sub-ma', 'Anjali', { id: 'as-ma' })];

  it('counts subjects, classes, hours and distinct tutors for the period', () => {
    const events = build(plan, as, '2026-11-09', '2026-11-15');
    const s = summarise(plan, as, events, []);
    expect(s).toMatchObject({ totalSubjects: 2, scheduledSessions: 3, teachingMinutes: 60 + 90 + 60, assignedTutors: 1, incompleteSubjects: 0, unresolvedConflicts: 0, tutorIssues: 0 });
  });

  it('follows the saved approval: draft, ready, pending, approved, and a new problem beats an old approval', () => {
    const events = build(plan, as, '2026-11-09', '2026-11-15');
    const clean = summarise(plan, as, events, []);
    expect(timetableStatus({ summary: clean, approvalItem: 'PENDING_COLLECTION', stageStatus: 'IN_PROGRESS' })).toBe('READY_FOR_REVIEW');
    expect(timetableStatus({ summary: clean, approvalItem: 'COLLECTED', stageStatus: 'PENDING_REVIEW' })).toBe('PENDING_MENTOR_APPROVAL');
    expect(timetableStatus({ summary: clean, approvalItem: 'VERIFIED', stageStatus: 'COMPLETED' })).toBe('APPROVED');
    const noTutor = summarise(plan, [as[0]], build(plan, [as[0]], '2026-11-09', '2026-11-15'), subjectWarnings(plan, [as[0]]));
    expect(timetableStatus({ summary: noTutor, approvalItem: 'VERIFIED', stageStatus: 'COMPLETED' })).toBe('DRAFT');
    expect(timetableStatus({ summary: summarise([], [], [], []), approvalItem: null, stageStatus: null })).toBe('DRAFT');
  });
});
