import { AvailabilityWindow, covers, describeAvailability, formatClock, mergedWindowsFor, validateAvailability } from '../tutor/tutor-availability';

import { SubjectSchedule } from './subject-schedule';
import {
  BusyBlock,
  MatchTarget,
  RequiredSession,
  TutorFacts,
  busyFromDatedBooking,
  busyFromStored,
  checkSession,
  describeMatch,
  evaluateTutor,
  rankMatches,
  requiredSessions,
  toStoredSessions,
} from './tutor-matching';

const w = (day: number, start: string, end: string): AvailabilityWindow => ({ day: day as AvailabilityWindow['day'], start, end });
const MON = 1, TUE = 2, WED = 3, THU = 4, SAT = 6, SUN = 0;

const timed = (day: string, start: string, end: string, extra: object = {}) => ({ day, durationMinutes: 60, start, end, ...extra });
const subject = (frequency: SubjectSchedule['frequency'], sessions: object[], over: Partial<SubjectSchedule> = {}): SubjectSchedule => ({
  subjectId: 'sub-en', subjectName: 'English', gradeId: 'g-8', gradeName: 'Grade 8', frequency, totalMinutes: 60 * sessions.length, distribution: 'EQUAL',
  sessions: sessions as SubjectSchedule['sessions'], ...over,
});
const target: MatchTarget = { subjectId: 'sub-en', subjectName: 'English', gradeId: 'g-8', gradeName: 'Grade 8' };

const tutor = (id: string, windows: AvailabilityWindow[], over: Partial<TutorFacts> = {}): TutorFacts => ({
  tutorProfileId: id, name: id, photoUrl: null, active: true, subjectIds: ['sub-en'], gradeIds: ['g-8'], windows, ...over,
});

/** English, weekly, Monday Tuesday Thursday Saturday, 3 PM to 4 PM. */
const english = () => subject('WEEKLY', [timed('Monday', '15:00', '16:00'), timed('Tuesday', '15:00', '16:00'), timed('Thursday', '15:00', '16:00'), timed('Saturday', '15:00', '16:00')]);
const required = (s: SubjectSchedule): RequiredSession[] => {
  const r = requiredSessions(s);
  if (!r.ok) throw new Error(r.message);
  return r.sessions;
};
const busyAt = (day: number, start: number, end: number, over: Partial<BusyBlock> = {}): BusyBlock => ({ dayNumber: day as BusyBlock['dayNumber'], start, end, source: 'ANOTHER_STUDENT', weeks: [1, 2, 3, 4], ...over });

describe('availability windows', () => {
  it('accepts several ranges on one day, which gives a break, and puts them in order', () => {
    const r = validateAvailability([w(MON, '16:00', '18:00'), w(MON, '09:00', '12:00'), w(SAT, '09:00', '13:00')]);
    expect(r.ok && r.value.map((x) => [x.day, x.start])).toEqual([[MON, '09:00'], [MON, '16:00'], [SAT, '09:00']]);
  });
  it('accepts no ranges: the tutor has no working hours set', () => {
    expect(validateAvailability([])).toEqual({ ok: true, value: [] });
  });
  it.each([
    ['an end before the start', [w(MON, '18:00', '14:00')], /end time must be after the start time/],
    ['an end equal to the start', [w(MON, '14:00', '14:00')], /end time must be after the start time/],
    ['a range under 15 minutes', [w(MON, '14:00', '14:10')], /at least 15 minutes/],
    ['overlapping ranges', [w(TUE, '14:00', '17:00'), w(TUE, '16:00', '18:00')], /Tuesday: 4:00 PM to 6:00 PM overlaps 2:00 PM to 5:00 PM/],
    ['a time that is not a time', [{ day: MON, start: '25:00', end: '26:00' }], /start time must be a time/],
    ['a day that does not exist', [{ day: 9, start: '10:00', end: '11:00' }], /Choose a day/],
    ['an extra key', [{ day: MON, start: '10:00', end: '11:00', note: 'x' }], /not in the expected format/],
  ])('refuses %s', (_label, value, message) => {
    const r = validateAvailability(value);
    expect(r.ok).toBe(false);
    expect(!r.ok && r.message).toMatch(message);
  });
  it('refuses a value that is not a list', () => {
    expect(validateAvailability('Mondays').ok).toBe(false);
  });
  it('touching ranges are allowed and count as one stretch of working time', () => {
    const windows = [w(MON, '14:00', '16:00'), w(MON, '16:00', '18:00')];
    expect(validateAvailability(windows).ok).toBe(true);
    expect(mergedWindowsFor(windows, MON as never)).toEqual([{ start: 840, end: 1080 }]);
    expect(covers(windows, MON as never, 15 * 60, 17 * 60)).toBe(true);
  });
  it('a break between ranges is not working time', () => {
    const windows = [w(MON, '09:00', '12:00'), w(MON, '14:00', '18:00')];
    expect(covers(windows, MON as never, 11 * 60, 15 * 60)).toBe(false);
    expect(covers(windows, MON as never, 14 * 60, 15 * 60)).toBe(true);
  });
  it('writes times and hours the way people read them', () => {
    expect([0, 9 * 60, 12 * 60, 15 * 60 + 30, 23 * 60 + 59].map(formatClock)).toEqual(['12:00 AM', '9:00 AM', '12:00 PM', '3:30 PM', '11:59 PM']);
    expect(describeAvailability([w(MON, '14:00', '18:00'), w(SAT, '09:00', '13:00')])).toBe('Monday 2:00 PM to 6:00 PM, Saturday 9:00 AM to 1:00 PM');
  });
});

describe('the sessions a tutor must cover', () => {
  it('come from the saved schedule, with the day, the time and a readable label', () => {
    const r = required(english());
    expect(r.map((s) => s.label)).toEqual(['Monday, 3:00 PM to 4:00 PM', 'Tuesday, 3:00 PM to 4:00 PM', 'Thursday, 3:00 PM to 4:00 PM', 'Saturday, 3:00 PM to 4:00 PM']);
  });
  it('need a start time on every class, and say which ones are missing', () => {
    const r = requiredSessions(subject('WEEKLY', [timed('Monday', '15:00', '16:00'), { day: 'Wednesday', durationMinutes: 60 }]));
    expect(r).toEqual({ ok: false, message: 'Set a start time for every class to check tutor availability. Missing for: Wednesday.' });
  });
  it('need at least one day', () => {
    expect(requiredSessions(subject('WEEKLY', [])).ok).toBe(false);
  });
  it('keep Week 1 and Week 2 apart for a bi-weekly subject', () => {
    const r = required(subject('BIWEEKLY', [timed('Tuesday', '17:00', '18:00', { week: 1 }), timed('Saturday', '10:00', '11:00', { week: 2 })]));
    expect(r.map((s) => [s.key, s.weeks])).toEqual([['1:Tuesday', [1, 3]], ['2:Saturday', [2, 4]]]);
    expect(r[0].label).toBe('Week 1 Tuesday, 5:00 PM to 6:00 PM');
  });
  it('carry the monthly pattern: first and third Monday, or every Tuesday', () => {
    const r = required(subject('MONTHLY', [timed('Monday', '15:00', '16:00', { occurrences: ['FIRST', 'THIRD'] }), timed('Tuesday', '15:00', '16:00', { occurrences: ['EVERY'] })]));
    expect(r.map((s) => s.weeks)).toEqual([[1, 3], [1, 2, 3, 4]]);
    expect(r[0].label).toBe('First and third Monday, 3:00 PM to 4:00 PM');
  });
});

describe('checking one session', () => {
  const session = required(subject('WEEKLY', [timed('Tuesday', '17:00', '18:00')]))[0];

  it('is available when the tutor works then and nothing is booked', () => {
    expect(checkSession(session, [w(TUE, '15:00', '19:00')], [])).toMatchObject({ status: 'AVAILABLE', reason: 'Available.' });
  });
  it('is occupied when the time is booked, and never names the other student', () => {
    const c = checkSession(session, [w(TUE, '15:00', '19:00')], [busyAt(TUE, 17 * 60, 18 * 60)]);
    expect(c).toMatchObject({ status: 'OCCUPIED', reason: 'Already booked during this time.' });
    expect(JSON.stringify(c)).not.toMatch(/Asha|STU-|student/);
  });
  it('is occupied by a partly overlapping booking, but not by one that ends as the class starts', () => {
    expect(checkSession(session, [w(TUE, '15:00', '19:00')], [busyAt(TUE, 17 * 60 + 30, 19 * 60)]).status).toBe('OCCUPIED');
    expect(checkSession(session, [w(TUE, '15:00', '19:00')], [busyAt(TUE, 16 * 60, 17 * 60)]).status).toBe('AVAILABLE');
  });
  it('is not working this day when the tutor has no hours that weekday', () => {
    const sunday = required(subject('WEEKLY', [timed('Sunday', '15:00', '16:00')]))[0];
    expect(checkSession(sunday, [w(MON, '14:00', '18:00')], [])).toMatchObject({ status: 'NOT_WORKING_DAY', reason: 'Does not work on Sundays.' });
  });
  it('is not configured when the tutor works the day but the time is outside the hours they set', () => {
    const c = checkSession(session, [w(TUE, '15:00', '16:30')], []);
    expect(c.status).toBe('NOT_CONFIGURED');
    expect(c.reason).toBe('Tuesday availability does not include 5:00 PM to 6:00 PM. Working on Tuesday: 3:00 PM to 4:30 PM.');
  });
  it('is not configured for every session when the tutor has set no hours at all', () => {
    expect(checkSession(session, [], [])).toMatchObject({ status: 'NOT_CONFIGURED', reason: 'No weekly availability has been set for this tutor.' });
  });
  it('a booking inside hours the tutor never set does not matter: the missing availability is reported first', () => {
    expect(checkSession(session, [w(MON, '09:00', '12:00'), w(TUE, '09:00', '12:00')], [busyAt(TUE, 17 * 60, 18 * 60)]).status).toBe('NOT_CONFIGURED');
  });
  it('is covered across two touching ranges', () => {
    expect(checkSession(session, [w(TUE, '15:00', '17:30'), w(TUE, '17:30', '19:00')], []).status).toBe('AVAILABLE');
  });
  it('is not covered across a break', () => {
    expect(checkSession(session, [w(TUE, '15:00', '17:30'), w(TUE, '17:45', '19:00')], []).status).toBe('NOT_CONFIGURED');
  });
  it('same student other subject is described without any private detail', () => {
    expect(checkSession(session, [w(TUE, '15:00', '19:00')], [busyAt(TUE, 17 * 60, 18 * 60, { source: 'THIS_STUDENT' })]).reason).toBe('Already assigned to another subject of this student at this time.');
  });
});

describe('matching a tutor against the whole schedule', () => {
  it('full availability: works every selected day and time, nothing booked', () => {
    const m = evaluateTutor(required(english()), tutor('rahul', [w(MON, '14:00', '18:00'), w(TUE, '14:00', '18:00'), w(THU, '14:00', '18:00'), w(SAT, '14:00', '18:00')]), [], target);
    expect(m).toMatchObject({ verdict: 'FULL', availableCount: 4, total: 4, canAssign: true, ineligible: null });
    expect(describeMatch(m)).toBe('Fully available, 4 of 4 sessions');
  });

  it('partial availability, with an exact reason for each session that does not fit', () => {
    const anjali = tutor('anjali', [w(MON, '14:00', '18:00'), w(TUE, '14:00', '18:00'), w(THU, '14:00', '18:00')]);
    const busy = [busyAt(TUE, 15 * 60, 16 * 60)];
    const m = evaluateTutor(required(english()), anjali, busy, target);
    expect(m.verdict).toBe('PARTIAL');
    expect(m.sessions.map((s) => [s.label.split(',')[0], s.status])).toEqual([['Monday', 'AVAILABLE'], ['Tuesday', 'OCCUPIED'], ['Thursday', 'AVAILABLE'], ['Saturday', 'NOT_WORKING_DAY']]);
    expect(m.canAssign).toBe(false);
    expect(describeMatch(m)).toBe('Partial availability, 2 of 4 sessions available');
  });

  it('no availability at all for the schedule', () => {
    const m = evaluateTutor(required(english()), tutor('meera', [w(SUN, '09:00', '12:00')]), [], target);
    expect(m).toMatchObject({ verdict: 'NONE', availableCount: 0, canAssign: false });
    expect(describeMatch(m)).toBe('Not available for any of the 4 sessions');
  });

  it('a tutor with no hours set is not available, and says so for every session', () => {
    const m = evaluateTutor(required(english()), tutor('new', []), [], target);
    expect(m.verdict).toBe('NONE');
    expect(m.sessions.every((s) => s.status === 'NOT_CONFIGURED')).toBe(true);
  });

  it('is not eligible when the tutor does not teach the subject', () => {
    const m = evaluateTutor(required(english()), tutor('x', [w(MON, '14:00', '18:00')], { subjectIds: ['sub-ma'] }), [], target);
    expect(m).toMatchObject({ verdict: 'NOT_ELIGIBLE', ineligible: 'Does not teach English.', canAssign: false });
  });

  it('is not eligible when the tutor does not teach the required level, even if fully free', () => {
    const everyDay = [MON, TUE, THU, SAT].map((d) => w(d, '14:00', '18:00'));
    const m = evaluateTutor(required(english()), tutor('x', everyDay, { gradeIds: ['g-10'] }), [], target);
    expect(m).toMatchObject({ verdict: 'NOT_ELIGIBLE', ineligible: "Grade 8 is not one of this tutor's levels.", availableCount: 4, canAssign: false });
  });

  it('is not eligible when the tutor is not active', () => {
    const everyDay = [MON, TUE, THU, SAT].map((d) => w(d, '14:00', '18:00'));
    expect(evaluateTutor(required(english()), tutor('x', everyDay, { active: false }), [], target)).toMatchObject({ verdict: 'NOT_ELIGIBLE', ineligible: 'Not active for new assignments.' });
  });

  it('ranks fully available first, then partial by how many sessions fit, then none, then ineligible', () => {
    const every = [MON, TUE, THU, SAT].map((d) => w(d, '14:00', '18:00'));
    const items = [
      { name: 'Zed', match: evaluateTutor(required(english()), tutor('z', [w(SUN, '09:00', '10:00')]), [], target) },
      { name: 'Bina', match: evaluateTutor(required(english()), tutor('b', [w(MON, '14:00', '18:00')]), [], target) },
      { name: 'Cara', match: evaluateTutor(required(english()), tutor('c', every, { gradeIds: [] }), [], target) },
      { name: 'Anjali', match: evaluateTutor(required(english()), tutor('a', [w(MON, '14:00', '18:00'), w(TUE, '14:00', '18:00'), w(THU, '14:00', '18:00')]), [], target) },
      { name: 'Rahul', match: evaluateTutor(required(english()), tutor('r', every), [], target) },
    ];
    expect(rankMatches(items).map((i) => i.name)).toEqual(['Rahul', 'Anjali', 'Bina', 'Zed', 'Cara']);
  });

  it('adding working hours never overrides a booking: the slot becomes available only when it is free', () => {
    const sessions = required(subject('WEEKLY', [timed('Tuesday', '17:00', '18:00')]));
    const before = evaluateTutor(sessions, tutor('t', [w(TUE, '14:00', '16:00')]), [busyAt(TUE, 17 * 60, 18 * 60)], target);
    expect(before.sessions[0].status).toBe('NOT_CONFIGURED');
    const afterFree = evaluateTutor(sessions, tutor('t', [w(TUE, '14:00', '19:00')]), [], target);
    expect(afterFree).toMatchObject({ verdict: 'FULL', canAssign: true });
    const afterBooked = evaluateTutor(sessions, tutor('t', [w(TUE, '14:00', '19:00')]), [busyAt(TUE, 17 * 60, 18 * 60)], target);
    expect(afterBooked.sessions[0]).toMatchObject({ status: 'OCCUPIED' });
    expect(afterBooked.canAssign).toBe(false);
  });
});

describe('recurring schedules are checked in full, not by the first class', () => {
  const free = (day: number) => w(day, '08:00', '20:00');

  it('weekly: a booking in any week blocks, because the class repeats every week', () => {
    const s = required(subject('WEEKLY', [timed('Monday', '15:00', '16:00')]));
    const biweeklyOtherStudent = busyAt(MON, 15 * 60, 16 * 60, { weeks: [2, 4] });
    expect(evaluateTutor(s, tutor('t', [free(MON)]), [biweeklyOtherStudent], target).sessions[0].status).toBe('OCCUPIED');
  });

  it('bi-weekly: Week 1 and Week 2 are checked separately', () => {
    const s = required(subject('BIWEEKLY', [timed('Tuesday', '17:00', '18:00', { week: 1 }), timed('Tuesday', '17:00', '18:00', { week: 2 })]));
    const busyWeek2 = busyAt(TUE, 17 * 60, 18 * 60, { weeks: [2, 4] });
    const m = evaluateTutor(s, tutor('t', [free(TUE)]), [busyWeek2], target);
    expect(m.sessions.map((x) => [x.key, x.status])).toEqual([['1:Tuesday', 'AVAILABLE'], ['2:Tuesday', 'OCCUPIED']]);
    expect(m.verdict).toBe('PARTIAL');
  });

  it('bi-weekly: a tutor can take a Week 1 student and a Week 2 student at the same time', () => {
    const week1Student = busyFromStored({ dayNumber: TUE, frequency: 'BIWEEKLY', week: 1, occurrences: [], startMinute: 17 * 60, endMinute: 18 * 60 }, 'ANOTHER_STUDENT');
    const s = required(subject('BIWEEKLY', [timed('Tuesday', '17:00', '18:00', { week: 2 })]));
    expect(evaluateTutor(s, tutor('t', [free(TUE)]), [week1Student], target).canAssign).toBe(true);
  });

  it('monthly: first and third Monday clash with a booked first Monday, but not with a booked second Monday', () => {
    const s = required(subject('MONTHLY', [timed('Monday', '15:00', '16:00', { occurrences: ['FIRST', 'THIRD'] })]));
    const first = busyFromStored({ dayNumber: MON, frequency: 'MONTHLY', week: null, occurrences: ['FIRST'], startMinute: 900, endMinute: 960 }, 'ANOTHER_STUDENT');
    const second = busyFromStored({ dayNumber: MON, frequency: 'MONTHLY', week: null, occurrences: ['SECOND'], startMinute: 900, endMinute: 960 }, 'ANOTHER_STUDENT');
    expect(evaluateTutor(s, tutor('t', [free(MON)]), [first], target).sessions[0].status).toBe('OCCUPIED');
    expect(evaluateTutor(s, tutor('t', [free(MON)]), [second], target).sessions[0].status).toBe('AVAILABLE');
  });

  it('monthly: every Tuesday clashes with a booking in any week of the month', () => {
    const s = required(subject('MONTHLY', [timed('Tuesday', '15:00', '16:00', { occurrences: ['EVERY'] })]));
    const fourth = busyFromStored({ dayNumber: TUE, frequency: 'MONTHLY', week: null, occurrences: ['FOURTH'], startMinute: 900, endMinute: 960 }, 'ANOTHER_STUDENT');
    expect(evaluateTutor(s, tutor('t', [free(TUE)]), [fourth], target).sessions[0].status).toBe('OCCUPIED');
  });

  it('a stored assignment reads back as the same busy time it was saved as', () => {
    const s = required(subject('BIWEEKLY', [timed('Tuesday', '17:00', '18:00', { week: 1 })]));
    const stored = toStoredSessions(s);
    expect(stored).toEqual([{ dayNumber: 2, frequency: 'BIWEEKLY', week: 1, occurrences: [], startMinute: 1020, endMinute: 1080 }]);
    expect(busyFromStored(stored[0], 'ANOTHER_STUDENT')).toMatchObject({ dayNumber: 2, start: 1020, end: 1080, weeks: [1, 3] });
  });
});

describe('single dated bookings (a demo or a scheduled class)', () => {
  // 2026-11-10 is a Tuesday. In Asia/Kolkata (UTC+5:30) 11:30 UTC is 17:00.
  const demo = busyFromDatedBooking(new Date('2026-11-10T11:30:00Z'), new Date('2026-11-10T12:30:00Z'), 'Asia/Kolkata');

  it('is read in the operating time zone, with the weekday and the week of the month', () => {
    expect(demo).toMatchObject({ dayNumber: TUE, start: 17 * 60, end: 18 * 60, dated: true, weeks: [2] });
  });
  it('blocks a weekly class on that weekday and time, because the class would meet it', () => {
    const s = required(subject('WEEKLY', [timed('Tuesday', '17:00', '18:00')]));
    expect(evaluateTutor(s, tutor('t', [w(TUE, '08:00', '20:00')]), [demo as BusyBlock], target).sessions[0]).toMatchObject({ status: 'OCCUPIED', reason: 'Already booked during this time.' });
  });
  it('blocks a monthly class only when it falls in one of that class\'s weeks', () => {
    const second = required(subject('MONTHLY', [timed('Tuesday', '17:00', '18:00', { occurrences: ['SECOND'] })]));
    const first = required(subject('MONTHLY', [timed('Tuesday', '17:00', '18:00', { occurrences: ['FIRST'] })]));
    expect(evaluateTutor(second, tutor('t', [w(TUE, '08:00', '20:00')]), [demo as BusyBlock], target).sessions[0].status).toBe('OCCUPIED');
    expect(evaluateTutor(first, tutor('t', [w(TUE, '08:00', '20:00')]), [demo as BusyBlock], target).sessions[0].status).toBe('AVAILABLE');
  });
  it('ignores a booking at another time of day', () => {
    const s = required(subject('WEEKLY', [timed('Tuesday', '10:00', '11:00')]));
    expect(evaluateTutor(s, tutor('t', [w(TUE, '08:00', '20:00')]), [demo as BusyBlock], target).sessions[0].status).toBe('AVAILABLE');
  });
  it('refuses an unusable booking instead of guessing', () => {
    expect(busyFromDatedBooking(new Date('invalid'), new Date(), 'Asia/Kolkata')).toBeNull();
    expect(busyFromDatedBooking(new Date('2026-11-10T12:00:00Z'), new Date('2026-11-10T11:00:00Z'), 'Asia/Kolkata')).toBeNull();
  });
});

describe('several subjects and tutors', () => {
  const t = tutor('rahul', [w(MON, '14:00', '19:00'), w(WED, '14:00', '19:00')], { subjectIds: ['sub-en', 'sub-ma'] });

  it('the same tutor can teach two subjects when the times do not meet', () => {
    const maths = required(subject('WEEKLY', [timed('Monday', '16:00', '17:30'), timed('Wednesday', '16:00', '17:30')], { subjectId: 'sub-ma', subjectName: 'Mathematics' }));
    const englishBusy = busyFromStored({ dayNumber: MON, frequency: 'WEEKLY', week: null, occurrences: [], startMinute: 15 * 60, endMinute: 16 * 60 }, 'THIS_STUDENT');
    const m = evaluateTutor(maths, t, [englishBusy], { ...target, subjectId: 'sub-ma', subjectName: 'Mathematics' });
    expect(m.verdict).toBe('FULL');
  });
  it('the same tutor is refused for a second subject at an overlapping time, with a reason that is safe to show', () => {
    const maths = required(subject('WEEKLY', [timed('Monday', '15:30', '16:30')], { subjectId: 'sub-ma', subjectName: 'Mathematics' }));
    const englishBusy = busyFromStored({ dayNumber: MON, frequency: 'WEEKLY', week: null, occurrences: [], startMinute: 15 * 60, endMinute: 16 * 60 }, 'THIS_STUDENT');
    const m = evaluateTutor(maths, t, [englishBusy], { ...target, subjectId: 'sub-ma', subjectName: 'Mathematics' });
    expect(m.sessions[0]).toMatchObject({ status: 'OCCUPIED', reason: 'Already assigned to another subject of this student at this time.' });
    expect(m.canAssign).toBe(false);
  });
  it('different subjects are matched against different tutors independently', () => {
    const anjali = tutor('anjali', [MON, TUE, THU, SAT].map((d) => w(d, '14:00', '18:00')));
    const arun = tutor('arun', [w(TUE, '14:00', '18:00')], { subjectIds: ['sub-ph'], gradeIds: ['g-8'] });
    const physics = required(subject('BIWEEKLY', [timed('Tuesday', '15:00', '16:00', { week: 1 })], { subjectId: 'sub-ph', subjectName: 'Physics' }));
    expect(evaluateTutor(required(english()), anjali, [], target).verdict).toBe('FULL');
    expect(evaluateTutor(physics, arun, [], { ...target, subjectId: 'sub-ph', subjectName: 'Physics' }).verdict).toBe('FULL');
  });
});
