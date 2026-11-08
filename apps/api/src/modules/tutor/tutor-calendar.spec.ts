import { AvailabilityWindow } from './tutor-availability';
import {
  ClassOverride,
  ClassRule,
  DatedClass,
  TutorCalendarInput,
  TutorException,
  addDays,
  checkWindow,
  classesOn,
  datesBetween,
  dayTotals,
  describeDate,
  isDateString,
  mondayOf,
  occurrenceDates,
  occursOn,
  resolveDay,
  timeline,
  weekdayOf,
} from './tutor-calendar';

const m = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));
const win = (day: number, start: string, end: string): AvailabilityWindow => ({ day: day as AvailabilityWindow['day'], start, end });
const MON = 1, TUE = 2, WED = 3, THU = 4, SAT = 6, SUN = 0;

/** Meera's weekly hours from the request: a break between two ranges on most days, Sunday off. */
const meeraWeekly: AvailabilityWindow[] = [
  win(MON, '14:00', '16:00'), win(MON, '16:30', '20:00'),
  win(TUE, '15:00', '17:00'), win(TUE, '17:30', '20:00'),
  win(WED, '14:00', '16:00'), win(WED, '16:30', '19:00'),
  win(THU, '15:00', '17:00'), win(THU, '17:30', '20:00'),
  win(6, '09:00', '11:00'), win(6, '11:30', '14:00'),
];

let id = 0;
const rule = (over: Partial<ClassRule> & Pick<ClassRule, 'dayNumber' | 'startMinute' | 'endMinute'>): ClassRule => ({
  id: `r${++id}`, frequency: 'WEEKLY', week: null, occurrences: [], startDate: '2026-11-09', endDate: null,
  label: { subject: 'Science', student: 'Synthetic Student A' }, source: 'ANOTHER_STUDENT', ...over,
});
const input = (over: Partial<TutorCalendarInput> = {}): TutorCalendarInput => ({ weekly: meeraWeekly, exceptions: [], rules: [], overrides: [], dated: [], ...over });
const ex = (date: string, kind: TutorException['kind'], over: Partial<TutorException> = {}): TutorException => ({ date, kind, startMinute: null, endMinute: null, note: kind, ...over });

describe('dates', () => {
  it('knows real dates, weekdays and Mondays', () => {
    expect(isDateString('2026-11-09')).toBe(true);
    expect(['2026-02-30', '2026-13-01', '09-11-2026', '', null, 5].map(isDateString)).toEqual([false, false, false, false, false, false]);
    expect(weekdayOf('2026-11-09')).toBe(MON);
    expect(weekdayOf('2026-11-15')).toBe(SUN);
    expect(mondayOf('2026-11-15')).toBe('2026-11-09');
    expect(mondayOf('2026-11-09')).toBe('2026-11-09');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(datesBetween('2026-11-09', '2026-11-11')).toEqual(['2026-11-09', '2026-11-10', '2026-11-11']);
    expect(describeDate('2026-11-10')).toBe('Tuesday, 10 November');
  });
});

describe('when a recurring class happens', () => {
  const weekly = rule({ dayNumber: MON, startMinute: m('15:00'), endMinute: m('16:00') });

  it('weekly: every week from the start date, and never before it', () => {
    expect(occurrenceDates(weekly, '2026-11-01', '2026-12-07')).toEqual(['2026-11-09', '2026-11-16', '2026-11-23', '2026-11-30', '2026-12-07']);
  });

  it('stops after its end date', () => {
    expect(occurrenceDates({ ...weekly, endDate: '2026-11-23' }, '2026-11-01', '2026-12-31')).toEqual(['2026-11-09', '2026-11-16', '2026-11-23']);
  });

  it('bi-weekly: Week 1 is the week the class starts in, then every other week', () => {
    const week1 = { ...weekly, frequency: 'BIWEEKLY' as const, week: 1 as const };
    const week2 = { ...weekly, frequency: 'BIWEEKLY' as const, week: 2 as const };
    expect(occurrenceDates(week1, '2026-11-01', '2026-12-31')).toEqual(['2026-11-09', '2026-11-23', '2026-12-07', '2026-12-21']);
    expect(occurrenceDates(week2, '2026-11-01', '2026-12-31')).toEqual(['2026-11-16', '2026-11-30', '2026-12-14', '2026-12-28']);
  });

  it('bi-weekly: the weeks follow the start date, not a fixed calendar', () => {
    const later = { ...weekly, frequency: 'BIWEEKLY' as const, week: 1 as const, startDate: '2026-11-16' };
    expect(occurrenceDates(later, '2026-11-01', '2026-12-31')).toEqual(['2026-11-16', '2026-11-30', '2026-12-14', '2026-12-28']);
  });

  it('bi-weekly without a start date reads the week pattern from the earlier fixed anchor, consistently', () => {
    const old = { ...weekly, frequency: 'BIWEEKLY' as const, week: 1 as const, startDate: null };
    const dates = occurrenceDates(old, '2026-11-01', '2026-12-31');
    expect(dates.length).toBeGreaterThanOrEqual(4); // two months hold four or five alternate Mondays
    expect(dates.every((d) => weekdayOf(d) === MON)).toBe(true);
    expect(dates.every((d, i) => i === 0 || (new Date(`${d}T00:00:00Z`).getTime() - new Date(`${dates[i - 1]}T00:00:00Z`).getTime()) / 86_400_000 === 14)).toBe(true);
  });

  it.each([
    ['FIRST', ['2026-11-02', '2026-12-07']],
    ['SECOND', ['2026-11-09', '2026-12-14']],
    ['THIRD', ['2026-11-16', '2026-12-21']],
    ['FOURTH', ['2026-11-23', '2026-12-28']],
    ['LAST', ['2026-11-30', '2026-12-28']],
  ])('monthly: the %s Monday of the month', (nth, expected) => {
    expect(occurrenceDates({ ...weekly, frequency: 'MONTHLY', occurrences: [nth], startDate: '2026-11-01' }, '2026-11-01', '2026-12-31')).toEqual(expected);
  });

  it('monthly: every Monday, and a mix of first and third', () => {
    expect(occurrenceDates({ ...weekly, frequency: 'MONTHLY', occurrences: ['EVERY'], startDate: '2026-11-01' }, '2026-11-01', '2026-11-30')).toHaveLength(5);
    expect(occurrenceDates({ ...weekly, frequency: 'MONTHLY', occurrences: ['FIRST', 'THIRD'], startDate: '2026-11-01' }, '2026-11-01', '2026-12-31')).toEqual(['2026-11-02', '2026-11-16', '2026-12-07', '2026-12-21']);
  });

  it('the third Saturday of every month', () => {
    const third = rule({ dayNumber: SAT, startMinute: m('10:00'), endMinute: m('11:00'), frequency: 'MONTHLY', occurrences: ['THIRD'], startDate: '2026-11-01' });
    expect(occurrenceDates(third, '2026-11-01', '2027-01-31')).toEqual(['2026-11-21', '2026-12-19', '2027-01-16']);
  });

  it('does not duplicate: each date appears once', () => {
    const dates = occurrenceDates({ ...weekly, frequency: 'MONTHLY', occurrences: ['EVERY', 'FIRST'], startDate: '2026-11-01' }, '2026-11-01', '2026-12-31');
    expect(new Set(dates).size).toBe(dates.length);
  });

  it('occursOn is the same question as occurrenceDates', () => {
    expect(occursOn(weekly, '2026-11-16')).toBe(true);
    expect(occursOn(weekly, '2026-11-17')).toBe(false);
  });
});

describe('the classes on a date', () => {
  const base = rule({ dayNumber: TUE, startMinute: m('17:30'), endMinute: m('18:30') });

  it('cancelling one occurrence leaves the rest', () => {
    const cancel: ClassOverride = { ruleId: base.id, date: '2026-11-17', originalStartMinute: base.startMinute, kind: 'CANCELLED', newDate: null, newStartMinute: null, newEndMinute: null, reason: 'away' };
    const i = { rules: [base], overrides: [cancel], dated: [] as DatedClass[] };
    expect(classesOn(i, '2026-11-17')).toEqual([]);
    expect(classesOn(i, '2026-11-24')).toHaveLength(1);
    expect(classesOn(i, '2026-11-10')).toHaveLength(1);
  });

  it('a moved occurrence leaves its date and appears on the new one, at the new time', () => {
    const move: ClassOverride = { ruleId: base.id, date: '2026-11-24', originalStartMinute: base.startMinute, kind: 'RESCHEDULED', newDate: '2026-11-26', newStartMinute: m('19:00'), newEndMinute: m('20:00'), reason: 'moved' };
    const i = { rules: [base], overrides: [move], dated: [] as DatedClass[] };
    expect(classesOn(i, '2026-11-24')).toEqual([]);
    const thursday = classesOn(i, '2026-11-26');
    expect(thursday).toHaveLength(1);
    expect(thursday[0]).toMatchObject({ startMinute: m('19:00'), endMinute: m('20:00'), moved: true, ruleId: base.id });
  });

  it('a one-off booking appears on its own date only', () => {
    const dated: DatedClass = { date: '2026-11-12', startMinute: m('15:00'), endMinute: m('16:00'), label: { subject: 'Demo', student: null }, source: 'BOOKED_CLASS' };
    expect(classesOn({ rules: [], overrides: [], dated: [dated] }, '2026-11-12')).toHaveLength(1);
    expect(classesOn({ rules: [], overrides: [], dated: [dated] }, '2026-11-13')).toHaveLength(0);
  });

  it('are in time order', () => {
    const a = rule({ dayNumber: MON, startMinute: m('18:30'), endMinute: m('19:30') });
    const b = rule({ dayNumber: MON, startMinute: m('14:00'), endMinute: m('15:00') });
    expect(classesOn({ rules: [a, b], overrides: [], dated: [] }, '2026-11-09').map((c) => c.startMinute)).toEqual([m('14:00'), m('18:30')]);
  });
});

describe('a day in the calendar', () => {
  it('shows working time, the break between two ranges, and what is left free around the classes', () => {
    const monday = [
      rule({ dayNumber: MON, startMinute: m('14:00'), endMinute: m('15:00') }),
      rule({ dayNumber: MON, startMinute: m('15:00'), endMinute: m('16:00') }),
      rule({ dayNumber: MON, startMinute: m('16:30'), endMinute: m('17:30'), label: { subject: 'Biology', student: 'Synthetic Student C' } }),
      rule({ dayNumber: MON, startMinute: m('18:30'), endMinute: m('19:30') }),
    ];
    const day = resolveDay(input({ rules: monday }), '2026-11-09');
    expect(day.working).toEqual([{ start: m('14:00'), end: m('16:00') }, { start: m('16:30'), end: m('20:00') }]);
    expect(day.breaks).toEqual([{ start: m('16:00'), end: m('16:30') }]);
    expect(day.free).toEqual([{ start: m('17:30'), end: m('18:30') }, { start: m('19:30'), end: m('20:00') }]);
    expect(dayTotals(day)).toEqual({ freeMinutes: 90, bookedMinutes: 240, breakMinutes: 30 });
  });

  it('turns the day into stretches: class, break, free, as the screen draws them', () => {
    const monday = [rule({ dayNumber: MON, startMinute: m('14:00'), endMinute: m('15:00') }), rule({ dayNumber: MON, startMinute: m('16:30'), endMinute: m('17:30'), label: { subject: 'Biology', student: null } })];
    const segments = timeline(resolveDay(input({ rules: monday }), '2026-11-09'));
    const brief = segments.map((s) => `${s.state}:${s.start / 60}-${s.end / 60}`);
    expect(brief).toEqual(['NOT_WORKING:8-14', 'CLASS:14-15', 'FREE:15-16', 'BREAK:16-16.5', 'CLASS:16.5-17.5', 'FREE:17.5-20', 'NOT_WORKING:20-22']);
    expect(segments.find((s) => s.state === 'CLASS' && s.start === m('16:30'))?.label).toEqual({ subject: 'Biology', student: null });
  });

  it('never calls a booked time free', () => {
    const monday = [rule({ dayNumber: MON, startMinute: m('17:00'), endMinute: m('18:00') })];
    const day = resolveDay(input({ rules: monday }), '2026-11-09');
    expect(day.free.some((f) => f.start < m('18:00') && m('17:00') < f.end)).toBe(false);
  });

  it('a day off for the week: Sunday has no working time', () => {
    const day = resolveDay(input(), '2026-11-15');
    expect(day.working).toEqual([]);
    expect(timeline(day)).toEqual([{ start: m('08:00'), end: m('22:00'), state: 'NOT_WORKING' }]);
  });

  it('extra hours add working time to a normal day and open a normally non-working day', () => {
    const satExtra = resolveDay(input({ exceptions: [ex('2026-11-14', 'EXTRA_HOURS', { startMinute: m('14:00'), endMinute: m('18:00') })] }), '2026-11-14');
    expect(satExtra.working).toEqual([{ start: m('09:00'), end: m('11:00') }, { start: m('11:30'), end: m('18:00') }]);
    const sunday = resolveDay(input({ exceptions: [ex('2026-11-15', 'EXTRA_HOURS', { startMinute: m('10:00'), endMinute: m('12:00') })] }), '2026-11-15');
    expect(sunday.working).toEqual([{ start: m('10:00'), end: m('12:00') }]);
  });

  it('blocked time is taken out of working time and is not free', () => {
    const day = resolveDay(input({ exceptions: [ex('2026-11-10', 'BLOCKED', { startMinute: m('18:00'), endMinute: m('19:00') })] }), '2026-11-10');
    expect(day.blocked).toEqual([{ start: m('18:00'), end: m('19:00') }]);
    expect(day.free).toEqual([{ start: m('15:00'), end: m('17:00') }, { start: m('17:30'), end: m('18:00') }, { start: m('19:00'), end: m('20:00') }]);
  });

  it('leave closes the day; a holiday and a day off close it too; leave wins over a holiday', () => {
    const base = input();
    expect(resolveDay({ ...base, exceptions: [ex('2026-11-12', 'LEAVE')] }, '2026-11-12').closed?.kind).toBe('LEAVE');
    expect(resolveDay({ ...base, exceptions: [ex('2026-11-25', 'HOLIDAY')] }, '2026-11-25').closed?.kind).toBe('HOLIDAY');
    expect(resolveDay({ ...base, exceptions: [ex('2026-11-20', 'DAY_OFF')] }, '2026-11-20').closed?.kind).toBe('DAY_OFF');
    expect(resolveDay({ ...base, exceptions: [ex('2026-11-12', 'HOLIDAY'), ex('2026-11-12', 'LEAVE')] }, '2026-11-12').closed?.kind).toBe('LEAVE');
    expect(timeline(resolveDay({ ...base, exceptions: [ex('2026-11-25', 'HOLIDAY', { note: 'Synthetic public holiday' })] }, '2026-11-25'))).toEqual([{ start: m('08:00'), end: m('22:00'), state: 'HOLIDAY', note: 'Synthetic public holiday' }]);
  });

  it('closed days keep their classes as "affected" for a person to decide, and never delete them', () => {
    const wed = rule({ dayNumber: THU, startMinute: m('15:00'), endMinute: m('16:00') });
    const day = resolveDay(input({ rules: [wed], exceptions: [ex('2026-11-12', 'LEAVE')] }), '2026-11-12');
    expect(day.classes).toEqual([]);
    expect(day.affected).toHaveLength(1);
    expect(day.free).toEqual([]);
  });

  it('a tutor with no weekly hours at all is not configured', () => {
    const day = resolveDay(input({ weekly: [] }), '2026-11-10');
    expect(day.configured).toBe(false);
    expect(timeline(day)).toEqual([{ start: m('08:00'), end: m('22:00'), state: 'NOT_CONFIGURED' }]);
  });
});

describe('is this time free on this date', () => {
  const classes = [rule({ dayNumber: TUE, startMinute: m('17:30'), endMinute: m('18:30') })];
  const at = (date: string, from: string, to: string, over: Partial<TutorCalendarInput> = {}) => checkWindow(resolveDay(input({ rules: classes, ...over }), date), m(from), m(to));

  it('available: working, not booked, not blocked', () => {
    expect(at('2026-11-09', '17:30', '18:30')).toEqual({ date: '2026-11-09', status: 'AVAILABLE', reason: 'Available.' });
  });
  it('occupied: another booking has it, and the reason names no one', () => {
    const r = at('2026-11-10', '17:30', '18:30');
    expect(r).toMatchObject({ status: 'OCCUPIED', reason: 'Already booked during this time.' });
    expect(JSON.stringify(r)).not.toMatch(/Student|Synthetic/);
  });
  it('occupied by a partly overlapping class', () => {
    expect(at('2026-11-10', '18:00', '19:00').status).toBe('OCCUPIED');
    expect(at('2026-11-10', '18:30', '19:30').status).toBe('AVAILABLE');
  });
  it('another subject of the same student is described as that, safely', () => {
    const own = [rule({ dayNumber: TUE, startMinute: m('17:30'), endMinute: m('18:30'), source: 'THIS_STUDENT' })];
    expect(checkWindow(resolveDay(input({ rules: own }), '2026-11-10'), m('17:30'), m('18:30')).reason).toBe('Already assigned to another subject of this student at this time.');
  });
  it('break: inside the gap between two working ranges', () => {
    expect(at('2026-11-09', '16:00', '16:30')).toMatchObject({ status: 'BREAK', reason: 'Break time on Monday, 9 November.' });
    expect(at('2026-11-09', '15:30', '16:30').status).toBe('BREAK'); // straddles the start of the break
  });
  it('outside working hours: the day is worked but not at that time', () => {
    expect(at('2026-11-09', '20:00', '21:00')).toMatchObject({ status: 'OUTSIDE_HOURS' });
    expect(at('2026-11-09', '20:00', '21:00').reason).toContain('Working 2:00 PM to 4:00 PM and 4:30 PM to 8:00 PM.');
    expect(at('2026-11-09', '09:00', '10:00').status).toBe('OUTSIDE_HOURS');
  });
  it('not working this day: no hours at all that weekday', () => {
    expect(at('2026-11-15', '15:00', '16:00')).toMatchObject({ status: 'NOT_WORKING_DAY', reason: 'Does not work on Sundays.' });
  });
  it('leave, holiday and a special day off each have their own result', () => {
    expect(at('2026-11-12', '15:00', '16:00', { exceptions: [ex('2026-11-12', 'LEAVE')] })).toMatchObject({ status: 'LEAVE', reason: 'On leave on Thursday, 12 November.' });
    expect(at('2026-11-25', '15:00', '16:00', { exceptions: [ex('2026-11-25', 'HOLIDAY')] })).toMatchObject({ status: 'HOLIDAY' });
    expect(at('2026-11-20', '15:00', '16:00', { exceptions: [ex('2026-11-20', 'DAY_OFF')] })).toMatchObject({ status: 'DAY_OFF' });
  });
  it('blocked: working time taken away for part of the date', () => {
    expect(at('2026-11-10', '19:00', '20:00', { exceptions: [ex('2026-11-10', 'BLOCKED', { startMinute: m('19:00'), endMinute: m('20:00') })] }).status).toBe('BLOCKED');
  });
  it('not configured: a tutor who has set no hours, whatever the date', () => {
    expect(at('2026-11-10', '15:00', '16:00', { weekly: [] })).toMatchObject({ status: 'NOT_CONFIGURED', reason: 'No weekly availability has been set for this tutor.' });
  });
  it('extra hours make a normally closed time available, and a booking in them still blocks', () => {
    const extra = [ex('2026-11-15', 'EXTRA_HOURS', { startMinute: m('10:00'), endMinute: m('12:00') })];
    expect(at('2026-11-15', '10:00', '11:00', { exceptions: extra }).status).toBe('AVAILABLE');
    const booked = [rule({ dayNumber: SUN, startMinute: m('10:00'), endMinute: m('11:00'), startDate: '2026-11-15' })];
    expect(checkWindow(resolveDay(input({ rules: booked, exceptions: extra }), '2026-11-15'), m('10:00'), m('11:00')).status).toBe('OCCUPIED');
  });
  it('a recurring class is not assumed free because its first occurrence is: later dates are checked on their own', () => {
    const biweekly = [rule({ dayNumber: TUE, startMinute: m('16:30'), endMinute: m('17:30'), frequency: 'BIWEEKLY', week: 1 })];
    const results = ['2026-11-10', '2026-11-17', '2026-11-24'].map((d) => checkWindow(resolveDay(input({ rules: biweekly, weekly: [win(TUE, '15:00', '20:00')] }), d), m('16:30'), m('17:30')).status);
    expect(results).toEqual(['OCCUPIED', 'AVAILABLE', 'OCCUPIED']);
  });
});
