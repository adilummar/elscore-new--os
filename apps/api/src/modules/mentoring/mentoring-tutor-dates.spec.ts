/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-member-access */
import { ConflictException } from '@nestjs/common';

import { MentoringAccessService } from './mentoring-access.service';
import { MentoringHistoryService } from './mentoring-history.service';
import { MentoringTutorService } from './mentoring-tutor.service';
import { MentoringWorkflowService } from './mentoring-workflow.service';
import { FakeDb } from './testing/mentoring-fake-db';

const PERMS: Record<string, string[]> = { 'mentor-1': ['mentoring.student.read-assigned', 'mentoring.stage.work', 'mentoring.stage.verify'], 'hr-1': ['tutor.profile.manage'] };
const KEY = 'timetable.schedule';
const at = (hhmm: string) => new Date(`1970-01-01T${hhmm}:00Z`);
const day = (iso: string) => new Date(`${iso}T00:00:00Z`);
const MON = 1, TUE = 2, WED = 3, THU = 4, SAT = 6;
const m = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));

function services(db: FakeDb) {
  const history = new MentoringHistoryService({ recordInTx: jest.fn().mockResolvedValue(undefined) } as any);
  const access = new MentoringAccessService({ getPermissionsForUser: jest.fn((id: string) => Promise.resolve(new Set(PERMS[id] ?? []))) } as any);
  const tutors = new MentoringTutorService(db as any, history);
  return { tutors, workflow: new MentoringWorkflowService(db as any, access, history, tutors) };
}

/** Meera Thomas's weekly hours from the request: a break between two ranges on most days, Sunday off. */
const MEERA_HOURS: Array<[number, string, string]> = [
  [MON, '14:00', '16:00'], [MON, '16:30', '20:00'], [TUE, '15:00', '17:00'], [TUE, '17:30', '20:00'],
  [WED, '14:00', '16:00'], [WED, '16:30', '19:00'], [THU, '15:00', '17:00'], [THU, '17:30', '20:00'], [SAT, '09:00', '11:00'], [SAT, '11:30', '14:00'],
];

function addTutor(db: FakeDb, id: string, name: string, hours: Array<[number, string, string]>, over: { subjects?: string[]; grades?: string[] } = {}) {
  const [first, ...rest] = name.split(' ');
  db.seed('employee', { id: `e-${id}`, userId: `u-${id}`, firstName: first, lastName: rest.join(' '), employmentStatus: 'ACTIVE' });
  db.seed('tutorProfile', { id: `tp-${id}`, employeeId: `e-${id}`, tutorOperationalStatus: 'ACTIVE', profilePhotoUrl: null });
  for (const s of over.subjects ?? ['sub-sc']) db.seed('tutorSubject', { tutorProfileId: `tp-${id}`, subjectId: s, isActive: true });
  for (const g of over.grades ?? ['g-8']) db.seed('tutorGrade', { tutorProfileId: `tp-${id}`, gradeId: g, isActive: true });
  for (const [d, a, b] of hours) db.seed('tutorAvailabilitySlot', { tutorProfileId: `tp-${id}`, dayOfWeek: d, startTime: at(a), endTime: at(b), isActive: true });
}

interface Booking { tutor: string; student: string; subject?: string; frequency?: 'WEEKLY' | 'BIWEEKLY' | 'MONTHLY'; week?: 1 | 2; occurrences?: string[]; day: number; start: string; end: string; startDate?: string | null }
let n = 0;
/** A booking by another student, stored the way a real assignment is: an assignment row, its session row and a start date. */
function book(db: FakeDb, b: Booking) {
  const a = db.seed('mentoringTutorAssignment', {
    id: `ba-${++n}`, activationId: `act-${b.student}`, subjectId: b.subject ?? 'sub-sc', tutorProfileId: `tp-${b.tutor}`, status: 'ACTIVE', currentKey: `act-${b.student}:${b.subject ?? 'sub-sc'}:${n}`,
    scheduleSnapshot: {}, startDate: b.startDate === null ? null : day(b.startDate ?? '2026-11-09'), endDate: null,
  });
  db.seed('mentoringTutorAssignmentSession', { assignmentId: a.id, tutorProfileId: `tp-${b.tutor}`, dayOfWeek: b.day, frequency: b.frequency ?? 'WEEKLY', week: b.week ?? null, occurrences: b.occurrences ?? [], startMinute: m(b.start), endMinute: m(b.end) });
  return a;
}

const timed = (d: string, start: string, end: string, extra: object = {}) => ({ day: d, durationMinutes: 60, start, end, ...extra });
const science = (sessions: object[], over: object = {}) => ({
  subjectId: 'sub-sc', subjectName: 'Science', gradeId: 'g-8', gradeName: 'Grade 8', frequency: 'WEEKLY', totalMinutes: 60 * sessions.length, distribution: 'EQUAL', sessions, startDate: '2026-11-09', ...over,
});
const plan = (...subjects: object[]) => ({ version: 2, subjects });

function world(schedule: unknown, studentId = '1') {
  const db = new FakeDb();
  for (const [id, name] of [['sub-sc', 'Science'], ['sub-bi', 'Biology']]) db.seed('subject', { id, name, isActive: true });
  for (const [id, name, o] of [['g-8', 'Grade 8', 8], ['g-9', 'Grade 9', 9], ['g-11', 'Grade 11', 11]] as const) db.seed('grade', { id, name, sortOrder: o, isActive: true });
  for (const id of Object.keys(PERMS)) db.seed('user', { id, status: 'ACTIVE' });
  db.seed('lead', { id: `lead-${studentId}`, businessId: 'LED-1', firstName: 'P', lastName: 'One', primaryPhone: '+971500000000', altPhone1: null, altPhone2: null, whatsappNumber: null });
  db.seed('student', { id: `stu-${studentId}`, businessId: 'STU-1', firstName: 'A', lastName: 'B', grade: { name: 'Grade 8' }, curriculum: { name: 'CBSE' } });
  db.seed('enrollmentHandover', { id: `ho-${studentId}`, status: 'COMPLETED', transferredFields: [], missingFields: [], sourceSnapshot: {} });
  db.seed('mentoringActivation', { id: `act-${studentId}`, leadId: `lead-${studentId}`, studentId: `stu-${studentId}`, handoverId: `ho-${studentId}`, status: 'ACTIVATION_IN_PROGRESS', currentStage: 2, currentMentorUserId: 'mentor-1' });
  db.seed('mentoringStage', { activationId: `act-${studentId}`, stageNumber: 1, key: 'S1', status: 'COMPLETED' });
  db.seed('mentoringStage', { activationId: `act-${studentId}`, stageNumber: 2, key: 'S2', status: 'IN_PROGRESS' });
  db.seed('enrollmentHandoverField', { handoverId: `ho-${studentId}`, fieldKey: KEY, value: schedule, origin: 'MENTOR_COLLECTED', salesValue: null, createdByUserId: 'mentor-1', updatedByUserId: 'mentor-1' });
  return { db, ...services(db) };
}

/** The request: Science on Monday, Tuesday and Wednesday at 5:30 PM to 6:30 PM, from 9 November. */
const request = () => plan(science([timed('Monday', '17:30', '18:30'), timed('Tuesday', '17:30', '18:30'), timed('Wednesday', '17:30', '18:30')]));

/** Meera's bookings from the request, as another student's real assignments. */
function meeraBookings(db: FakeDb) {
  const b = (student: string, day: number, start: string, end: string, extra: Partial<Booking> = {}) => book(db, { tutor: 'meera', student, day, start, end, ...extra });
  b('A', MON, '14:00', '15:00'); b('B', MON, '15:00', '16:00'); b('C', MON, '16:30', '17:30', { subject: 'sub-bi' }); b('D', MON, '18:30', '19:30');
  b('E', TUE, '15:00', '16:00', { subject: 'sub-bi' }); b('F', TUE, '17:30', '18:30');
  b('G', WED, '15:00', '16:00'); b('H', WED, '17:30', '18:30', { subject: 'sub-bi' });
  b('K', MON, '17:30', '18:30', { frequency: 'MONTHLY', occurrences: ['FIRST'] }); // 7 December is the first Monday in the window
}

const statusesOf = (list: any, label: string) => list.tutors[0].sessions.find((s: any) => s.label.startsWith(label)).dates.map((d: any) => [d.date.slice(5), d.status]);

describe('tutors checked on exact dates', () => {
  it('checks every real date of a class, not just the first: Monday is free until the first Monday of December', async () => {
    const w = world(request());
    addTutor(w.db, 'meera', 'Meera Thomas', MEERA_HOURS);
    meeraBookings(w.db);
    const list = await w.tutors.candidates('act-1', 'sub-sc', 'mentor-1', false);
    const monday = statusesOf(list, 'Monday');
    expect(monday).toEqual([['11-09', 'AVAILABLE'], ['11-16', 'AVAILABLE'], ['11-23', 'AVAILABLE'], ['11-30', 'AVAILABLE'], ['12-07', 'OCCUPIED'], ['12-14', 'AVAILABLE'], ['12-21', 'AVAILABLE'], ['12-28', 'AVAILABLE']]);
    const session = list.tutors[0].sessions[0];
    expect(session.status).toBe('OCCUPIED');
    expect(session.reason).toBe('1 of 8 dates are not available. Already booked during this time.');
  });

  it('the request in the brief: Tuesday and Wednesday are taken on every date, Monday only on one', async () => {
    const w = world(request());
    addTutor(w.db, 'meera', 'Meera Thomas', MEERA_HOURS);
    meeraBookings(w.db);
    const t = (await w.tutors.candidates('act-1', 'sub-sc', 'mentor-1', false)).tutors[0];
    expect(t.sessions.map((s: any) => [s.label.split(',')[0], s.dates.filter((d: any) => d.status === 'AVAILABLE').length])).toEqual([['Monday', 7], ['Tuesday', 0], ['Wednesday', 0]]);
    expect(t).toMatchObject({ verdict: 'NONE', canAssign: false, availableCount: 0, total: 3, dateTotals: { available: 7, total: 24 } });
  });

  it('a tutor is recommended only when every date of every class is free', async () => {
    // Thursday 5:30 PM has no booking on any of the eight dates. Monday 5:30 PM is blocked on the first Monday of each month.
    const free = world(plan(science([timed('Thursday', '17:30', '18:30')])));
    addTutor(free.db, 'meera', 'Meera Thomas', MEERA_HOURS);
    meeraBookings(free.db);
    expect((await free.tutors.candidates('act-1', 'sub-sc', 'mentor-1', false)).tutors[0]).toMatchObject({ verdict: 'FULL', canAssign: true, dateTotals: { available: 8, total: 8 } });
    const blocked = world(plan(science([timed('Monday', '17:30', '18:30')], { startDate: '2026-12-08' })));
    addTutor(blocked.db, 'meera', 'Meera Thomas', MEERA_HOURS);
    meeraBookings(blocked.db);
    // Starting on 8 December the next first Monday is 4 January, still inside the eight weeks, so it is still not free.
    const list = await blocked.tutors.candidates('act-1', 'sub-sc', 'mentor-1', false);
    expect(list.tutors[0]).toMatchObject({ verdict: 'NONE', canAssign: false });
    expect((list.tutors[0].sessions[0].dates ?? []).filter((d) => d.status !== 'AVAILABLE').map((d) => d.date)).toEqual(['2027-01-04', '2027-02-01']);
  });

  it('refuses to assign over a later date, naming the date', async () => {
    const w = world(plan(science([timed('Monday', '17:30', '18:30')])));
    addTutor(w.db, 'meera', 'Meera Thomas', MEERA_HOURS);
    meeraBookings(w.db);
    await expect(w.tutors.assign('act-1', 'sub-sc', 'tp-meera', 'mentor-1')).rejects.toThrow(/1 of 8 dates are not available\. Already booked during this time\./);
    expect(w.db.rows('mentoringTutorAssignment').filter((a) => a.activationId === 'act-1')).toHaveLength(0);
  });

  it('keeps Week 1 and Week 2 real: a bi-weekly class that starts a week later fits where the other does not', async () => {
    const biweekly = (startDate: string) => plan(science([timed('Tuesday', '17:30', '18:30', { week: 1 })], { frequency: 'BIWEEKLY', startDate, totalMinutes: 60 }));
    const w = world(biweekly('2026-11-09'));
    addTutor(w.db, 'meera', 'Meera Thomas', MEERA_HOURS);
    book(w.db, { tutor: 'meera', student: 'X', day: TUE, start: '17:30', end: '18:30', frequency: 'BIWEEKLY', week: 1, startDate: '2026-11-09' });
    expect((await w.tutors.candidates('act-1', 'sub-sc', 'mentor-1', false)).tutors[0].verdict).toBe('NONE'); // same weeks as the other student
    const shifted = world(biweekly('2026-11-16')); // its Week 1 is the other student's Week 2
    addTutor(shifted.db, 'meera', 'Meera Thomas', MEERA_HOURS);
    book(shifted.db, { tutor: 'meera', student: 'X', day: TUE, start: '17:30', end: '18:30', frequency: 'BIWEEKLY', week: 1, startDate: '2026-11-09' });
    expect((await shifted.tutors.candidates('act-1', 'sub-sc', 'mentor-1', false)).tutors[0]).toMatchObject({ verdict: 'FULL', canAssign: true });
  });

  it('a booking saved before start dates existed still blocks, by its week pattern', async () => {
    const w = world(plan(science([timed('Monday', '17:30', '18:30')])));
    addTutor(w.db, 'meera', 'Meera Thomas', MEERA_HOURS);
    book(w.db, { tutor: 'meera', student: 'OLD', day: MON, start: '17:30', end: '18:30', startDate: null });
    expect((await w.tutors.candidates('act-1', 'sub-sc', 'mentor-1', false)).tutors[0].verdict).toBe('NONE');
  });
});

describe('what changes a date', () => {
  const setup = (sessions: object[] = [timed('Monday', '15:00', '16:00')], tutorHours = MEERA_HOURS) => {
    const w = world(plan(science(sessions)));
    addTutor(w.db, 'meera', 'Meera Thomas', tutorHours);
    return w;
  };
  const firstSession = async (w: ReturnType<typeof setup>): Promise<any> => (await w.tutors.candidates('act-1', 'sub-sc', 'mentor-1', false)).tutors[0].sessions[0];
  const dateStatus = (s: any, md: string) => s.dates.find((d: any) => d.date.slice(5) === md);

  it('approved leave closes the date, with the reason; a pending request does not', async () => {
    const w = setup();
    w.db.seed('employeeLeaveRequest', { employeeId: 'e-meera', status: 'APPROVED', startDate: '2026-11-16', endDate: '2026-11-17' });
    w.db.seed('employeeLeaveRequest', { employeeId: 'e-meera', status: 'PENDING', startDate: '2026-11-23', endDate: '2026-11-23' });
    const s = await firstSession(w);
    expect(dateStatus(s, '11-16')).toEqual({ date: '2026-11-16', status: 'LEAVE', reason: 'On leave on Monday, 16 November.' });
    expect(dateStatus(s, '11-23').status).toBe('AVAILABLE');
    expect(s.status).toBe('LEAVE');
  });

  it('a public holiday closes the date for every tutor, and a special day off only for that tutor', async () => {
    const w = setup();
    addTutor(w.db, 'other', 'Other Tutor', MEERA_HOURS);
    w.db.seed('tutorAvailabilityException', { tutorProfileId: null, date: day('2026-11-23'), kind: 'HOLIDAY', startMinute: null, endMinute: null, note: 'Synthetic public holiday (test)', isActive: true });
    w.db.seed('tutorAvailabilityException', { tutorProfileId: 'tp-meera', date: day('2026-11-30'), kind: 'DAY_OFF', startMinute: null, endMinute: null, note: 'Special day off', isActive: true });
    const list: any = await w.tutors.candidates('act-1', 'sub-sc', 'mentor-1', false);
    const meera = list.tutors.find((t: any) => t.name === 'Meera Thomas').sessions[0];
    const other = list.tutors.find((t: any) => t.name === 'Other Tutor').sessions[0];
    expect(dateStatus(meera, '11-23').status).toBe('HOLIDAY');
    expect(dateStatus(other, '11-23').status).toBe('HOLIDAY');
    expect(dateStatus(meera, '11-30').status).toBe('DAY_OFF');
    expect(dateStatus(other, '11-30').status).toBe('AVAILABLE');
  });

  it('an inactive exception is ignored', async () => {
    const w = setup();
    w.db.seed('tutorAvailabilityException', { tutorProfileId: 'tp-meera', date: day('2026-11-30'), kind: 'DAY_OFF', startMinute: null, endMinute: null, note: 'Withdrawn', isActive: false });
    expect(dateStatus(await firstSession(w), '11-30').status).toBe('AVAILABLE');
  });

  it('extra hours open a date, and blocked time closes part of one', async () => {
    const w = setup([timed('Monday', '20:00', '21:00')]);
    w.db.seed('tutorAvailabilityException', { tutorProfileId: 'tp-meera', date: day('2026-11-16'), kind: 'EXTRA_HOURS', startMinute: m('20:00'), endMinute: m('22:00'), note: 'Extra', isActive: true });
    const open = dateStatus(await firstSession(w), '11-16');
    expect(open.status).toBe('AVAILABLE');
    const blocked = setup([timed('Monday', '15:00', '16:00')]);
    blocked.db.seed('tutorAvailabilityException', { tutorProfileId: 'tp-meera', date: day('2026-11-16'), kind: 'BLOCKED', startMinute: m('15:00'), endMinute: m('16:00'), note: 'Meeting', isActive: true });
    expect(dateStatus(await firstSession(blocked), '11-16').status).toBe('BLOCKED');
  });

  it('a break, a time outside the hours, and a day the tutor does not work are each named', async () => {
    const w = setup([timed('Monday', '16:00', '16:30')]);
    expect(dateStatus(await firstSession(w), '11-16')).toMatchObject({ status: 'BREAK', reason: 'Break time on Monday, 16 November.' });
    const late = setup([timed('Monday', '20:30', '21:30')]);
    expect(dateStatus(await firstSession(late), '11-16').status).toBe('OUTSIDE_HOURS');
    const sunday = setup([timed('Sunday', '15:00', '16:00')]);
    expect(dateStatus(await firstSession(sunday), '11-15')).toMatchObject({ status: 'NOT_WORKING_DAY', reason: 'Does not work on Sundays.' });
  });

  it('a tutor with no hours at all is not configured on every date', async () => {
    const w = world(plan(science([timed('Monday', '15:00', '16:00')])));
    addTutor(w.db, 'isha', 'Isha Varma', []);
    const s: any = (await w.tutors.candidates('act-1', 'sub-sc', 'mentor-1', false)).tutors[0].sessions[0];
    expect(s.status).toBe('NOT_CONFIGURED');
    expect(s.dates.every((d: any) => d.status === 'NOT_CONFIGURED')).toBe(true);
  });

  it('a cancelled occurrence frees that date only, and a moved one blocks its new date', async () => {
    const w = setup([timed('Monday', '17:30', '18:30'), timed('Thursday', '19:00', '20:00')]);
    const a = book(w.db, { tutor: 'meera', student: 'Z', day: MON, start: '17:30', end: '18:30' });
    w.db.seed('mentoringTutorAssignmentOverride', { assignmentId: a.id, date: day('2026-11-16'), originalStartMinute: m('17:30'), kind: 'CANCELLED', newDate: null, newStartMinute: null, newEndMinute: null, reason: 'away' });
    w.db.seed('mentoringTutorAssignmentOverride', { assignmentId: a.id, date: day('2026-11-23'), originalStartMinute: m('17:30'), kind: 'RESCHEDULED', newDate: day('2026-11-26'), newStartMinute: m('19:00'), newEndMinute: m('20:00'), reason: 'moved' });
    const list = await w.tutors.candidates('act-1', 'sub-sc', 'mentor-1', false);
    const monday = list.tutors[0].sessions[0];
    expect(dateStatus(monday, '11-16').status).toBe('AVAILABLE'); // cancelled
    expect(dateStatus(monday, '11-23').status).toBe('AVAILABLE'); // moved away
    expect(dateStatus(monday, '11-09').status).toBe('OCCUPIED');
    const thursday = list.tutors[0].sessions[1];
    expect(dateStatus(thursday, '11-26').status).toBe('OCCUPIED'); // the moved class now sits here
    expect(dateStatus(thursday, '11-19').status).toBe('AVAILABLE');
  });

  it('a demo on an exact date blocks only that date', async () => {
    process.env.SYSTEM_TIMEZONE = 'UTC';
    try {
      const w = setup([timed('Monday', '17:30', '18:30')]);
      w.db.seed('demoSessionTutorAssignment', { tutorId: 'u-meera', status: 'ACTIVE', session: { status: 'ASSIGNED', scheduledStart: new Date('2026-11-23T17:30:00Z'), scheduledEnd: new Date('2026-11-23T18:30:00Z') } });
      const s = await firstSession(w);
      expect(s.dates.filter((d: any) => d.status !== 'AVAILABLE').map((d: any) => d.date)).toEqual(['2026-11-23']);
    } finally {
      delete process.env.SYSTEM_TIMEZONE;
    }
  });

  it('never exposes another student, however the class is stored', async () => {
    const w = setup([timed('Monday', '17:30', '18:30')]);
    book(w.db, { tutor: 'meera', student: 'SECRET-STUDENT', day: MON, start: '17:30', end: '18:30' });
    const text = JSON.stringify(await w.tutors.candidates('act-1', 'sub-sc', 'mentor-1', false));
    expect(text).not.toMatch(/SECRET|act-SECRET/);
    expect(text).toContain('Already booked during this time.');
  });
});

describe('assigning on exact dates', () => {
  it('stores the start date with the assignment and reads the same after a reload', async () => {
    const w = world(plan(science([timed('Monday', '19:00', '20:00')])));
    addTutor(w.db, 'meera', 'Meera Thomas', MEERA_HOURS);
    await w.tutors.assign('act-1', 'sub-sc', 'tp-meera', 'mentor-1');
    expect(w.db.rows('mentoringTutorAssignment').find((a) => a.activationId === 'act-1')!.startDate).toEqual(day('2026-11-09'));
    const fresh = services(w.db);
    expect((await fresh.tutors.assignmentsFor('act-1'))[0]).toMatchObject({ status: 'ACTIVE', tutorName: 'Meera Thomas' });
  });

  it('a second student cannot take a date the first already holds, in the same transaction window', async () => {
    const w = world(plan(science([timed('Monday', '19:00', '20:00')])));
    addTutor(w.db, 'meera', 'Meera Thomas', MEERA_HOURS);
    // a second student, same class, same dates
    const second = world(plan(science([timed('Monday', '19:00', '20:00')])), '2');
    for (const t of ['lead', 'student', 'enrollmentHandover', 'mentoringActivation', 'mentoringStage', 'enrollmentHandoverField']) for (const row of second.db.rows(t)) w.db.rows(t).push(row);
    const results = await Promise.allSettled([w.tutors.assign('act-1', 'sub-sc', 'tp-meera', 'mentor-1'), w.tutors.assign('act-2', 'sub-sc', 'tp-meera', 'mentor-1')]);
    expect(results.map((r) => r.status).sort()).toEqual(['fulfilled', 'rejected']);
    expect((results.find((r) => r.status === 'rejected') as PromiseRejectedResult).reason).toBeInstanceOf(ConflictException);
    expect(w.db.rows('mentoringTutorAssignment').filter((a) => a.status === 'ACTIVE')).toHaveLength(1);
  });

  it('a class of the same student for another subject at the same time is refused, with a safe reason', async () => {
    const both = plan(science([timed('Monday', '19:00', '20:00')]), { ...science([timed('Monday', '19:30', '20:00')], { subjectId: 'sub-bi', subjectName: 'Biology', totalMinutes: 30 }), sessions: [{ day: 'Monday', durationMinutes: 30, start: '19:30', end: '20:00' }] });
    const w = world(both);
    addTutor(w.db, 'meera', 'Meera Thomas', MEERA_HOURS, { subjects: ['sub-sc', 'sub-bi'] });
    await w.tutors.assign('act-1', 'sub-sc', 'tp-meera', 'mentor-1');
    await expect(w.tutors.assign('act-1', 'sub-bi', 'tp-meera', 'mentor-1')).rejects.toThrow(/Already assigned to another subject of this student at this time\./);
  });
});

describe('when a date changes after a tutor is assigned', () => {
  async function assigned() {
    const w = world(plan(science([timed('Monday', '19:00', '20:00')])));
    addTutor(w.db, 'meera', 'Meera Thomas', MEERA_HOURS);
    await w.tutors.assign('act-1', 'sub-sc', 'tp-meera', 'mentor-1');
    return w;
  }
  const status = (w: ReturnType<typeof world>) => w.db.rows('mentoringTutorAssignment').find((a) => a.activationId === 'act-1')!;

  it('new leave flags the assignment with the exact date, and nothing is deleted', async () => {
    const w = await assigned();
    w.db.seed('employeeLeaveRequest', { employeeId: 'e-meera', status: 'APPROVED', startDate: '2026-11-30', endDate: '2026-11-30' });
    await expect(w.tutors.revalidateForTutor('tp-meera', 'hr-1')).resolves.toBe(1);
    const a = status(w);
    expect(a.status).toBe('NEEDS_REVIEW');
    expect(a.reviewDetail.sessions[0].dates).toEqual([{ date: '2026-11-30', status: 'LEAVE', reason: 'On leave on Monday, 30 November.' }]);
    expect(w.db.rows('mentoringTutorAssignmentSession').length).toBe(1);
    expect(w.db.rows('mentoringEvent').find((e) => e.type === 'MENTORING_TUTOR_NEEDS_REVIEW')!.payload.trigger).toBe('TUTOR_AVAILABILITY_CHANGED');
  });

  it('a new public holiday flags it too, and the leave being withdrawn confirms it again', async () => {
    const w = await assigned();
    const holiday = w.db.seed('tutorAvailabilityException', { tutorProfileId: null, date: day('2026-12-07'), kind: 'HOLIDAY', startMinute: null, endMinute: null, note: 'Holiday', isActive: true });
    await w.tutors.revalidateForTutor('tp-meera', 'hr-1');
    expect(status(w).status).toBe('NEEDS_REVIEW');
    holiday.isActive = false;
    await w.tutors.revalidateForTutor('tp-meera', 'hr-1');
    expect(status(w).status).toBe('ACTIVE');
    expect(w.db.rows('mentoringEvent').filter((e) => e.type === 'MENTORING_TUTOR_CONFIRMED')).toHaveLength(1);
  });

  it('a holiday announced for everyone re-checks every tutor with a class, and one failing tutor does not stop the rest', async () => {
    const w = await assigned();
    // A second tutor whose booking points at a student that is missing, so checking it fails.
    addTutor(w.db, 'broken', 'Broken Fixture', [[MON, '09:00', '12:00']]);
    book(w.db, { tutor: 'broken', student: 'ghost', day: MON, start: '10:00', end: '11:00' });
    w.db.seed('tutorAvailabilityException', { tutorProfileId: null, date: day('2026-11-30'), kind: 'HOLIDAY', startMinute: null, endMinute: null, note: 'Holiday', isActive: true });
    const log = jest.spyOn((w.tutors as any).logger, 'error').mockImplementation(() => undefined);
    await w.tutors.onAvailabilityChanged({ tutorProfileId: null, actorUserId: 'hr-1' });
    expect(status(w).status).toBe('NEEDS_REVIEW');
    expect(status(w).reviewDetail.sessions[0].dates).toEqual([{ date: '2026-11-30', status: 'HOLIDAY', reason: expect.stringContaining('holiday') }]);
    expect(log).toHaveBeenCalledTimes(1);
  });

  it('an event for one tutor leaves the other tutors alone', async () => {
    const w = await assigned();
    addTutor(w.db, 'other', 'Other Tutor', MEERA_HOURS);
    const check = jest.spyOn(w.tutors, 'revalidateForTutor');
    await w.tutors.onAvailabilityChanged({ tutorProfileId: 'tp-other', actorUserId: 'hr-1' });
    expect(check.mock.calls.map((c) => c[0])).toEqual(['tp-other']);
  });

  it('moving the start date to a week with a clash flags the assignment, keeping the earlier booking', async () => {
    const w = await assigned();
    book(w.db, { tutor: 'meera', student: 'Q', day: MON, start: '19:00', end: '20:00', startDate: '2026-12-14', frequency: 'MONTHLY', occurrences: ['SECOND'] });
    // Moving the start later does not change the first eight weeks enough to clash; moving it to include 14 December does.
    const current = w.db.rows('enrollmentHandoverField').find((f) => f.handoverId === 'ho-1')!.value;
    await w.workflow.updateHandoverField('act-1', KEY, plan(science([timed('Monday', '19:00', '20:00')], { startDate: '2026-12-07' })), 'mentor-1', current);
    expect(status(w).status).toBe('NEEDS_REVIEW');
    expect(status(w).reviewDetail.sessions[0].dates.map((d: any) => d.date)).toEqual(['2026-12-14', '2027-01-11']); // a second Monday recurs every month
    expect(w.db.rows('mentoringTutorAssignmentSession').find((s) => s.assignmentId === status(w).id)).toBeTruthy();
  });

  it('a saved schedule change that still fits updates the stored start date', async () => {
    const w = await assigned();
    const current = w.db.rows('enrollmentHandoverField').find((f) => f.handoverId === 'ho-1')!.value;
    await w.workflow.updateHandoverField('act-1', KEY, plan(science([timed('Monday', '19:00', '20:00')], { startDate: '2026-11-16' })), 'mentor-1', current);
    expect(status(w)).toMatchObject({ status: 'ACTIVE', startDate: day('2026-11-16') });
  });
});
