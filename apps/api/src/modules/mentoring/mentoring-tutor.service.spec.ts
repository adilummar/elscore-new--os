/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-member-access */
import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';

import { PERMISSIONS_KEY } from '../../common/rbac/require-permissions.decorator';
import { TutorAvailabilityService } from '../tutor/tutor-availability.service';
import { TutorProfileController } from '../tutor/tutor-profile.controller';

import { MentoringAccessService } from './mentoring-access.service';
import { MentoringHistoryService } from './mentoring-history.service';
import { MentoringTutorService } from './mentoring-tutor.service';
import { MentoringWorkflowController } from './mentoring-workflow.controller';
import { MentoringWorkflowService } from './mentoring-workflow.service';
import { FakeDb } from './testing/mentoring-fake-db';

const PERMS: Record<string, string[]> = {
  'mentor-1': ['mentoring.student.read-assigned', 'mentoring.stage.work', 'mentoring.stage.verify'],
  'mentor-2': ['mentoring.student.read-assigned', 'mentoring.stage.work', 'mentoring.stage.verify'],
  'head-1': ['mentoring.student.read-all', 'mentoring.exception.authorize', 'tutor.profile.read'],
  'ceo-1': ['mentoring.student.read-all'],
  'hr-1': ['tutor.profile.manage', 'tutor.profile.read'],
};

const KEY = 'timetable.schedule';
const at = (hhmm: string) => new Date(`1970-01-01T${hhmm}:00Z`);
const slot = (tutorProfileId: string, day: number, start: string, end: string) => ({ tutorProfileId, dayOfWeek: day, startTime: at(start), endTime: at(end), isActive: true });
const MON = 1, TUE = 2, WED = 3, THU = 4, SAT = 6, SUN = 0;

const timed = (day: string, start: string, end: string, extra: object = {}) => ({ day, durationMinutes: 60, start, end, ...extra });
const english = (sessions?: object[]) => ({
  subjectId: 'sub-en', subjectName: 'English', gradeId: 'g-8', gradeName: 'Grade 8', frequency: 'WEEKLY', totalMinutes: 240, distribution: 'EQUAL',
  sessions: sessions ?? [timed('Monday', '15:00', '16:00'), timed('Tuesday', '15:00', '16:00'), timed('Thursday', '15:00', '16:00'), timed('Saturday', '15:00', '16:00')],
});
const maths = (sessions?: object[]) => ({
  subjectId: 'sub-ma', subjectName: 'Mathematics', gradeId: 'g-8', gradeName: 'Grade 8', frequency: 'WEEKLY', totalMinutes: 180, distribution: 'EQUAL',
  sessions: sessions ?? [{ ...timed('Monday', '16:30', '18:00'), durationMinutes: 90 }, { ...timed('Wednesday', '16:30', '18:00'), durationMinutes: 90 }],
});
const plan = (...subjects: object[]) => ({ version: 2, subjects });

function services(db: FakeDb) {
  const history = new MentoringHistoryService({ recordInTx: jest.fn().mockResolvedValue(undefined) } as any);
  const rbac = { getPermissionsForUser: jest.fn((id: string) => Promise.resolve(new Set(PERMS[id] ?? []))) };
  const access = new MentoringAccessService(rbac as any);
  const tutors = new MentoringTutorService(db as any, history);
  const workflow = new MentoringWorkflowService(db as any, access, history, tutors);
  const emitted: any[] = [];
  const availability = new TutorAvailabilityService(db as any, { recordInTx: jest.fn().mockResolvedValue(undefined) } as any, { emit: (name: string, payload: unknown) => emitted.push({ name, payload }) } as any);
  return { tutors, workflow, availability, emitted, scope: (id: string) => access.scopeFor(id) };
}

/** A tutor with subjects, levels and weekly hours. `hours` is [day, start, end] ranges. */
function addTutor(db: FakeDb, id: string, name: string, over: { subjects?: string[]; grades?: string[]; hours?: Array<[number, string, string]>; active?: boolean } = {}) {
  const [first, ...rest] = name.split(' ');
  db.seed('employee', { id: `e-${id}`, userId: `u-${id}`, firstName: first, lastName: rest.join(' '), employmentStatus: 'ACTIVE' });
  db.seed('tutorProfile', { id: `tp-${id}`, employeeId: `e-${id}`, tutorOperationalStatus: over.active === false ? 'INACTIVE' : 'ACTIVE', profilePhotoUrl: null });
  for (const s of over.subjects ?? ['sub-en']) db.seed('tutorSubject', { tutorProfileId: `tp-${id}`, subjectId: s, isActive: true });
  for (const g of over.grades ?? ['g-8']) db.seed('tutorGrade', { tutorProfileId: `tp-${id}`, gradeId: g, isActive: true });
  for (const [d, a, b] of over.hours ?? []) db.seed('tutorAvailabilitySlot', slot(`tp-${id}`, d, a, b));
}

/** A student whose Meeting with Parents is open, with a saved schedule. */
function addStudent(db: FakeDb, n: number, schedule: unknown, over: { status?: string; stage2?: string } = {}) {
  db.seed('lead', { id: `lead-${n}`, businessId: `LED-000${n}`, firstName: 'Parent', lastName: `${n}`, primaryPhone: '+971500000000', altPhone1: null, altPhone2: null, whatsappNumber: null });
  db.seed('student', { id: `stu-${n}`, businessId: `STU-000${n}`, firstName: 'Asha', lastName: `${n}`, grade: { name: 'Grade 8' }, curriculum: { name: 'CBSE' } });
  db.seed('enrollmentHandover', { id: `ho-${n}`, status: 'COMPLETED', transferredFields: [], missingFields: [], sourceSnapshot: {} });
  db.seed('mentoringActivation', { id: `act-${n}`, leadId: `lead-${n}`, studentId: `stu-${n}`, handoverId: `ho-${n}`, status: over.status ?? 'ACTIVATION_IN_PROGRESS', currentStage: 2, currentMentorUserId: 'mentor-1' });
  db.seed('mentoringStage', { activationId: `act-${n}`, stageNumber: 1, key: 'S1', status: 'COMPLETED' });
  db.seed('mentoringStage', { activationId: `act-${n}`, stageNumber: 2, key: 'S2', status: over.stage2 ?? 'IN_PROGRESS' });
  if (schedule !== undefined) db.seed('enrollmentHandoverField', { handoverId: `ho-${n}`, fieldKey: KEY, value: schedule, origin: 'MENTOR_COLLECTED', salesValue: null, createdByUserId: 'mentor-1', updatedByUserId: 'mentor-1' });
}

function world(schedule: unknown = plan(english())) {
  const db = new FakeDb();
  for (const [id, name] of [['sub-en', 'English'], ['sub-ma', 'Mathematics'], ['sub-ph', 'Physics']]) db.seed('subject', { id, name, isActive: true });
  for (const [id, name, o] of [['g-8', 'Grade 8', 8], ['g-9', 'Grade 9', 9], ['g-10', 'Grade 10', 10]] as const) db.seed('grade', { id, name, sortOrder: o, isActive: true });
  for (const id of Object.keys(PERMS)) db.seed('user', { id, status: 'ACTIVE' });
  addStudent(db, 1, schedule);
  return { db, ...services(db) };
}

const ALL_DAYS: Array<[number, string, string]> = [[MON, '14:00', '18:00'], [TUE, '14:00', '18:00'], [THU, '14:00', '18:00'], [SAT, '14:00', '18:00']];
const events = (db: FakeDb, type?: string) => db.rows('mentoringEvent').filter((e) => !type || e.type === type);
const names = (list: { tutors: Array<{ name: string }> }) => list.tutors.map((t) => t.name);

describe('Tutors for a subject', () => {
  it('lists only tutors who teach the subject, and nobody else', async () => {
    const w = world();
    addTutor(w.db, 'anjali', 'Anjali Nair', { hours: ALL_DAYS });
    addTutor(w.db, 'rahul', 'Rahul Menon', { subjects: ['sub-ma'], hours: ALL_DAYS });
    addTutor(w.db, 'arun', 'Arun Das', { subjects: ['sub-ph'], hours: ALL_DAYS });
    const list = await w.tutors.candidates('act-1', 'sub-en', 'mentor-1', false);
    expect(names(list)).toEqual(['Anjali Nair']);
    expect(list.ready).toBe(true);
  });

  it('shows a tutor who teaches the subject but not this level last, with the reason, and never as assignable', async () => {
    const w = world();
    addTutor(w.db, 'anjali', 'Anjali Nair', { hours: ALL_DAYS });
    addTutor(w.db, 'neha', 'Neha Rao', { grades: ['g-10'], hours: ALL_DAYS });
    const list = await w.tutors.candidates('act-1', 'sub-en', 'mentor-1', false);
    expect(names(list)).toEqual(['Anjali Nair', 'Neha Rao']);
    expect(list.tutors[1]).toMatchObject({ verdict: 'NOT_ELIGIBLE', canAssign: false, ineligible: "Grade 8 is not one of this tutor's levels." });
  });

  it('shows an inactive tutor as not eligible', async () => {
    const w = world();
    addTutor(w.db, 'old', 'Old Timer', { active: false, hours: ALL_DAYS });
    const list = await w.tutors.candidates('act-1', 'sub-en', 'mentor-1', false);
    expect(list.tutors[0]).toMatchObject({ verdict: 'NOT_ELIGIBLE', canAssign: false, ineligible: 'Not active for new assignments.' });
  });

  it('ranks fully available first, then partial, then none, and says why for every session', async () => {
    const w = world();
    addTutor(w.db, 'zara', 'Zara Khan', { hours: [[SUN, '09:00', '12:00']] });
    addTutor(w.db, 'anjali', 'Anjali Nair', { hours: [[MON, '14:00', '18:00'], [TUE, '14:00', '18:00'], [THU, '14:00', '18:00']] });
    addTutor(w.db, 'rahul', 'Rahul Menon', { hours: ALL_DAYS });
    addTutor(w.db, 'meera', 'Meera Iyer', { hours: [[MON, '14:00', '18:00']] });
    const list = await w.tutors.candidates('act-1', 'sub-en', 'mentor-1', false);
    expect(names(list)).toEqual(['Rahul Menon', 'Anjali Nair', 'Meera Iyer', 'Zara Khan']);
    expect(list.tutors.map((t) => t.verdict)).toEqual(['FULL', 'PARTIAL', 'PARTIAL', 'NONE']);
    expect(list.tutors[0].summary).toBe('Fully available, 4 of 4 sessions');
    expect(list.tutors[1].summary).toBe('Partial availability, 3 of 4 sessions available');
    const anjali = list.tutors[1];
    expect(anjali.sessions.map((s) => [s.label.split(',')[0], s.status])).toEqual([['Monday', 'AVAILABLE'], ['Tuesday', 'AVAILABLE'], ['Thursday', 'AVAILABLE'], ['Saturday', 'NOT_WORKING_DAY']]);
    expect(anjali.sessions[3]).toMatchObject({ statusLabel: 'Not working this day', reason: 'Does not work on Saturdays.' });
  });

  it('tells apart occupied, not working this day, and availability not configured', async () => {
    const w = world(plan(english([timed('Tuesday', '17:00', '18:00'), timed('Sunday', '15:00', '16:00'), timed('Thursday', '17:00', '18:00'), timed('Saturday', '15:00', '16:00')])));
    addTutor(w.db, 'rahul', 'Rahul Menon', { hours: [[TUE, '15:00', '19:00'], [THU, '15:00', '16:00'], [SAT, '14:00', '18:00']] });
    addStudent(w.db, 2, plan(english([timed('Tuesday', '17:00', '18:00')])));
    await w.tutors.candidates('act-2', 'sub-en', 'mentor-1', false); // another student, checked later
    await w.tutors.assign('act-2', 'sub-en', 'tp-rahul', 'mentor-1');
    const list = await w.tutors.candidates('act-1', 'sub-en', 'mentor-1', false);
    const s = list.tutors[0].sessions;
    expect(s.map((x) => x.status)).toEqual(['OCCUPIED', 'NOT_WORKING_DAY', 'NOT_CONFIGURED', 'AVAILABLE']);
    expect(s[0].reason).toBe('Already booked during this time.');
    expect(s[2].reason).toBe('Thursday availability does not include 5:00 PM to 6:00 PM. Working on Thursday: 3:00 PM to 4:00 PM.');
  });

  it('never exposes another student: no names, ids or businesses ids in what the Mentor receives', async () => {
    const w = world(plan(english([timed('Tuesday', '17:00', '18:00')])));
    addTutor(w.db, 'rahul', 'Rahul Menon', { hours: [[TUE, '15:00', '19:00']] });
    addStudent(w.db, 2, plan(english([timed('Tuesday', '17:00', '18:00')])));
    w.db.rows('mentoringActivation').find((a) => a.id === 'act-2')!.studentId = 'stu-private';
    await w.tutors.assign('act-2', 'sub-en', 'tp-rahul', 'mentor-1');
    const text = JSON.stringify(await w.tutors.candidates('act-1', 'sub-en', 'mentor-1', false));
    expect(text).not.toMatch(/act-2|stu-private|ho-2|lead-2/);
    expect(text).toContain('Already booked during this time.');
  });

  it('counts a dated booking such as a demo as occupied', async () => {
    process.env.SYSTEM_TIMEZONE = 'UTC';
    try {
      const w = world(plan(english([timed('Tuesday', '11:00', '12:00')])));
      addTutor(w.db, 'rahul', 'Rahul Menon', { hours: [[TUE, '09:00', '15:00']] });
      const d = new Date();
      d.setUTCDate(d.getUTCDate() + 1 + ((2 - d.getUTCDay() + 7) % 7 || 7) - 1);
      while (d.getUTCDay() !== 2 || d.getTime() < Date.now() + 3_600_000) d.setUTCDate(d.getUTCDate() + 1);
      const start = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 11, 0));
      w.db.seed('demoSessionTutorAssignment', { tutorId: 'u-rahul', status: 'ACTIVE', session: { status: 'ASSIGNED', scheduledStart: start, scheduledEnd: new Date(start.getTime() + 3_600_000) } });
      const list = await w.tutors.candidates('act-1', 'sub-en', 'mentor-1', false);
      expect(list.tutors[0].sessions[0]).toMatchObject({ status: 'OCCUPIED', reason: 'Already booked during this time.' });
    } finally {
      delete process.env.SYSTEM_TIMEZONE;
    }
  });

  it('asks for the schedule to be finished first: no saved subject, or classes without start times', async () => {
    const none = world(plan(maths()));
    addTutor(none.db, 'anjali', 'Anjali Nair', { hours: ALL_DAYS });
    expect(await none.tutors.candidates('act-1', 'sub-en', 'mentor-1', false)).toMatchObject({ ready: false, tutors: [], notReady: expect.stringContaining('Save the schedule with this subject first') });
    const untimed = world(plan(english([{ day: 'Monday', durationMinutes: 240 }])));
    const list = await untimed.tutors.candidates('act-1', 'sub-en', 'mentor-1', false);
    expect(list).toMatchObject({ ready: false, notReady: 'Set a start time for every class to check tutor availability. Missing for: Monday.' });
  });

  it('tells the page whether this person may update tutor availability', async () => {
    const w = world();
    expect((await w.tutors.candidates('act-1', 'sub-en', 'mentor-1', true)).canUpdateAvailability).toBe(true);
    expect((await w.tutors.candidates('act-1', 'sub-en', 'mentor-1', false)).canUpdateAvailability).toBe(false);
  });
});

describe('Assigning a tutor', () => {
  it('saves a fully available tutor with every session, who chose them and a history entry', async () => {
    const w = world();
    addTutor(w.db, 'rahul', 'Rahul Menon', { hours: ALL_DAYS });
    const view = await w.tutors.assign('act-1', 'sub-en', 'tp-rahul', 'mentor-1');
    expect(view).toMatchObject({ subjectName: 'English', status: 'ACTIVE', tutorName: 'Rahul Menon', initials: 'RM' });
    expect(view.sessions).toEqual(['Monday, 3:00 PM to 4:00 PM', 'Tuesday, 3:00 PM to 4:00 PM', 'Thursday, 3:00 PM to 4:00 PM', 'Saturday, 3:00 PM to 4:00 PM']);
    expect(w.db.rows('mentoringTutorAssignment')[0]).toMatchObject({ activationId: 'act-1', tutorProfileId: 'tp-rahul', currentKey: 'act-1:sub-en', assignedByUserId: 'mentor-1' });
    expect(w.db.rows('mentoringTutorAssignmentSession')).toHaveLength(4);
    expect(events(w.db, 'MENTORING_TUTOR_ASSIGNED')[0]).toMatchObject({ actorUserId: 'mentor-1', payload: { subjectId: 'sub-en', tutorProfileId: 'tp-rahul', tutorName: 'Rahul Menon' } });
  });

  it('refuses a partly available tutor, names the sessions that fail, and stores nothing', async () => {
    const w = world();
    addTutor(w.db, 'anjali', 'Anjali Nair', { hours: [[MON, '14:00', '18:00'], [TUE, '14:00', '18:00']] });
    await expect(w.tutors.assign('act-1', 'sub-en', 'tp-anjali', 'mentor-1')).rejects.toThrow(/not available for every session.*Thursday, 3:00 PM to 4:00 PM: Does not work on Thursdays\..*Saturday/);
    expect(w.db.rows('mentoringTutorAssignment')).toHaveLength(0);
    expect(w.db.rows('mentoringTutorAssignmentSession')).toHaveLength(0);
  });

  it.each([
    ['does not teach the subject', { subjects: ['sub-ma'] }, /Does not teach English/],
    ['does not teach the level', { grades: ['g-10'] }, /Grade 8 is not one of this tutor's levels/],
    ['is not active', { active: false }, /Not active for new assignments/],
  ])('refuses a tutor who %s, even when fully free', async (_label, over, message) => {
    const w = world();
    addTutor(w.db, 'x', 'Xavier Roy', { hours: ALL_DAYS, ...over });
    await expect(w.tutors.assign('act-1', 'sub-en', 'tp-x', 'mentor-1')).rejects.toThrow(message);
    expect(w.db.rows('mentoringTutorAssignment')).toHaveLength(0);
  });

  it('refuses an unknown tutor', async () => {
    const w = world();
    await expect(w.tutors.assign('act-1', 'sub-en', 'tp-nobody', 'mentor-1')).rejects.toThrow('Tutor not found');
  });

  it('refuses until the schedule is saved with this subject and every class has a start time', async () => {
    const w = world(plan(english([{ day: 'Monday', durationMinutes: 240 }])));
    addTutor(w.db, 'rahul', 'Rahul Menon', { hours: ALL_DAYS });
    await expect(w.tutors.assign('act-1', 'sub-en', 'tp-rahul', 'mentor-1')).rejects.toThrow(/Set a start time for every class/);
    await expect(w.tutors.assign('act-1', 'sub-ph', 'tp-rahul', 'mentor-1')).rejects.toThrow(/Save the schedule with this subject first/);
  });

  it('saving the same tutor again changes nothing and adds no history', async () => {
    const w = world();
    addTutor(w.db, 'rahul', 'Rahul Menon', { hours: ALL_DAYS });
    await w.tutors.assign('act-1', 'sub-en', 'tp-rahul', 'mentor-1');
    await w.tutors.assign('act-1', 'sub-en', 'tp-rahul', 'mentor-1');
    expect(w.db.rows('mentoringTutorAssignment')).toHaveLength(1);
    expect(events(w.db)).toHaveLength(1);
  });

  it('only the assigned Mentor, while the workflow runs and the meeting is open', async () => {
    const w = world();
    addTutor(w.db, 'rahul', 'Rahul Menon', { hours: ALL_DAYS });
    for (const user of ['mentor-2', 'head-1', 'ceo-1', 'hr-1']) {
      await expect(w.tutors.assign('act-1', 'sub-en', 'tp-rahul', user)).rejects.toBeInstanceOf(ForbiddenException);
      await expect(w.tutors.candidates('act-1', 'sub-en', user, false)).rejects.toBeInstanceOf(ForbiddenException);
      await expect(w.tutors.unassign('act-1', 'sub-en', null, user)).rejects.toBeInstanceOf(ForbiddenException);
    }
    expect(w.db.rows('mentoringTutorAssignment')).toHaveLength(0);
    const early = world(plan(english()));
    early.db.rows('mentoringStage').find((s) => s.stageNumber === 2)!.status = 'NOT_STARTED';
    addTutor(early.db, 'rahul', 'Rahul Menon', { hours: ALL_DAYS });
    await expect(early.tutors.assign('act-1', 'sub-en', 'tp-rahul', 'mentor-1')).rejects.toBeInstanceOf(ConflictException);
    const hold = world(plan(english()));
    hold.db.rows('mentoringActivation')[0].status = 'ACTIVATION_ON_HOLD';
    addTutor(hold.db, 'rahul', 'Rahul Menon', { hours: ALL_DAYS });
    await expect(hold.tutors.assign('act-1', 'sub-en', 'tp-rahul', 'mentor-1')).rejects.toBeInstanceOf(ConflictException);
  });

  it('the routes need the stage work permission, and the Head, CEO and HR hold none of the Mentor ones', () => {
    for (const handler of ['tutorCandidates', 'assignTutor', 'removeTutor']) {
      expect(Reflect.getMetadata(PERMISSIONS_KEY, (MentoringWorkflowController.prototype as any)[handler])).toEqual(['mentoring.stage.work']);
    }
    for (const user of ['head-1', 'ceo-1', 'hr-1']) expect(PERMS[user]).not.toContain('mentoring.stage.work');
  });
});

describe('Double-booking', () => {
  it('a tutor booked by another student at the same time cannot be assigned', async () => {
    const w = world();
    addTutor(w.db, 'rahul', 'Rahul Menon', { hours: ALL_DAYS });
    addStudent(w.db, 2, plan(english([timed('Tuesday', '15:30', '16:30')])));
    await w.tutors.assign('act-2', 'sub-en', 'tp-rahul', 'mentor-1');
    await expect(w.tutors.assign('act-1', 'sub-en', 'tp-rahul', 'mentor-1')).rejects.toThrow(/Tuesday, 3:00 PM to 4:00 PM: Already booked during this time\./);
    expect(w.db.rows('mentoringTutorAssignment').filter((a) => a.activationId === 'act-1')).toHaveLength(0);
  });

  it('a tutor can take a Week 1 student and a Week 2 student at the same time', async () => {
    const week = (n: 1 | 2) => plan({ ...english([timed('Tuesday', '15:00', '16:00', { week: n })]), frequency: 'BIWEEKLY', totalMinutes: 60 });
    const w = world(week(1));
    addTutor(w.db, 'rahul', 'Rahul Menon', { hours: ALL_DAYS });
    addStudent(w.db, 2, week(2));
    await w.tutors.assign('act-1', 'sub-en', 'tp-rahul', 'mentor-1');
    await expect(w.tutors.assign('act-2', 'sub-en', 'tp-rahul', 'mentor-1')).resolves.toMatchObject({ status: 'ACTIVE' });
    addStudent(w.db, 3, week(1));
    await expect(w.tutors.assign('act-3', 'sub-en', 'tp-rahul', 'mentor-1')).rejects.toBeInstanceOf(ConflictException);
  });

  it('monthly: first Monday clashes with every Monday, but not with the second Monday', async () => {
    const monthly = (o: string[]) => plan({ ...english([timed('Monday', '15:00', '16:00', { occurrences: o })]), frequency: 'MONTHLY', totalMinutes: 60 * o.length });
    const w = world(monthly(['FIRST']));
    addTutor(w.db, 'rahul', 'Rahul Menon', { hours: ALL_DAYS });
    await w.tutors.assign('act-1', 'sub-en', 'tp-rahul', 'mentor-1');
    addStudent(w.db, 2, monthly(['SECOND']));
    await expect(w.tutors.assign('act-2', 'sub-en', 'tp-rahul', 'mentor-1')).resolves.toMatchObject({ status: 'ACTIVE' });
    addStudent(w.db, 3, monthly(['EVERY']));
    await expect(w.tutors.assign('act-3', 'sub-en', 'tp-rahul', 'mentor-1')).rejects.toBeInstanceOf(ConflictException);
  });

  it('two Mentors assigning the same tutor to the same time at once: exactly one succeeds', async () => {
    const w = world();
    addTutor(w.db, 'rahul', 'Rahul Menon', { hours: ALL_DAYS });
    addStudent(w.db, 2, plan(english()));
    const results = await Promise.allSettled([w.tutors.assign('act-1', 'sub-en', 'tp-rahul', 'mentor-1'), w.tutors.assign('act-2', 'sub-en', 'tp-rahul', 'mentor-1')]);
    expect(results.map((r) => r.status).sort()).toEqual(['fulfilled', 'rejected']);
    const rejected = results.find((r) => r.status === 'rejected') as PromiseRejectedResult;
    expect(rejected.reason).toBeInstanceOf(ConflictException);
    expect(w.db.rows('mentoringTutorAssignment')).toHaveLength(1);
    expect(w.db.rows('mentoringTutorAssignmentSession')).toHaveLength(4);
  });

  it('many simultaneous attempts still book each time once', async () => {
    const w = world();
    addTutor(w.db, 'rahul', 'Rahul Menon', { hours: ALL_DAYS });
    for (const n of [2, 3, 4, 5]) addStudent(w.db, n, plan(english()));
    const results = await Promise.allSettled([1, 2, 3, 4, 5].map((n) => w.tutors.assign(`act-${n}`, 'sub-en', 'tp-rahul', 'mentor-1')));
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(w.db.rows('mentoringTutorAssignment').filter((a) => a.status !== 'ENDED')).toHaveLength(1);
  });

  it('one current tutor per student subject is enforced by the unique key as well', async () => {
    const w = world();
    addTutor(w.db, 'rahul', 'Rahul Menon', { hours: ALL_DAYS });
    await w.tutors.assign('act-1', 'sub-en', 'tp-rahul', 'mentor-1');
    await expect(() => Promise.resolve().then(() => (w.db as any).mentoringTutorAssignment.create({ data: { activationId: 'act-1', subjectId: 'sub-en', tutorProfileId: 'tp-x', currentKey: 'act-1:sub-en' } }))).rejects.toThrow(/Unique constraint/);
  });
});

describe('Several subjects and tutors', () => {
  it('each subject has its own tutor', async () => {
    const w = world(plan(english(), maths()));
    addTutor(w.db, 'anjali', 'Anjali Nair', { hours: ALL_DAYS });
    addTutor(w.db, 'rahul', 'Rahul Menon', { subjects: ['sub-ma'], hours: [[MON, '16:00', '19:00'], [WED, '16:00', '19:00']] });
    await w.tutors.assign('act-1', 'sub-en', 'tp-anjali', 'mentor-1');
    await w.tutors.assign('act-1', 'sub-ma', 'tp-rahul', 'mentor-1');
    const views = await w.tutors.assignmentsFor('act-1');
    expect(views.map((v) => [v.subjectName, v.tutorName])).toEqual([['English', 'Anjali Nair'], ['Mathematics', 'Rahul Menon']]);
  });

  it('the same tutor may teach two subjects when the times do not meet', async () => {
    const w = world(plan(english(), maths()));
    addTutor(w.db, 'neha', 'Neha Rao', { subjects: ['sub-en', 'sub-ma'], hours: [[MON, '14:00', '19:00'], [TUE, '14:00', '18:00'], [WED, '14:00', '19:00'], [THU, '14:00', '18:00'], [SAT, '14:00', '18:00']] });
    await w.tutors.assign('act-1', 'sub-en', 'tp-neha', 'mentor-1');
    await expect(w.tutors.assign('act-1', 'sub-ma', 'tp-neha', 'mentor-1')).resolves.toMatchObject({ status: 'ACTIVE' });
  });

  it('the same tutor is refused for a second subject at an overlapping time, with a safe reason', async () => {
    const w = world(plan(english(), maths([{ ...timed('Monday', '15:30', '17:00'), durationMinutes: 90 }, { ...timed('Wednesday', '15:30', '17:00'), durationMinutes: 90 }])));
    addTutor(w.db, 'neha', 'Neha Rao', { subjects: ['sub-en', 'sub-ma'], hours: [[MON, '14:00', '19:00'], [TUE, '14:00', '18:00'], [WED, '14:00', '19:00'], [THU, '14:00', '18:00'], [SAT, '14:00', '18:00']] });
    await w.tutors.assign('act-1', 'sub-en', 'tp-neha', 'mentor-1');
    await expect(w.tutors.assign('act-1', 'sub-ma', 'tp-neha', 'mentor-1')).rejects.toThrow(/Already assigned to another subject of this student at this time\./);
    const list = await w.tutors.candidates('act-1', 'sub-ma', 'mentor-1', false);
    expect(list.tutors[0].sessions[0]).toMatchObject({ status: 'OCCUPIED', reason: 'Already assigned to another subject of this student at this time.' });
  });
});

describe('Changing the tutor', () => {
  it('replaces the tutor, keeps the earlier assignment as history, frees the old tutor and records both names', async () => {
    const w = world();
    addTutor(w.db, 'anjali', 'Anjali Nair', { hours: ALL_DAYS });
    addTutor(w.db, 'rahul', 'Rahul Menon', { hours: ALL_DAYS });
    await w.tutors.assign('act-1', 'sub-en', 'tp-anjali', 'mentor-1');
    await w.tutors.assign('act-1', 'sub-en', 'tp-rahul', 'mentor-1');
    const rows = w.db.rows('mentoringTutorAssignment');
    expect(rows.map((r) => [r.tutorProfileId, r.status, r.currentKey])).toEqual([['tp-anjali', 'ENDED', null], ['tp-rahul', 'ACTIVE', 'act-1:sub-en']]);
    expect(rows[0]).toMatchObject({ endedByUserId: 'mentor-1', endReason: 'Replaced by another tutor' });
    expect(w.db.rows('mentoringTutorAssignmentSession').every((s) => s.tutorProfileId === 'tp-rahul')).toBe(true);
    expect(events(w.db, 'MENTORING_TUTOR_REASSIGNED')[0]).toMatchObject({ reason: 'Replaced Anjali Nair', payload: { tutorName: 'Rahul Menon', previousTutorName: 'Anjali Nair' } });
    // the old tutor is free again for another student
    addStudent(w.db, 2, plan(english()));
    await expect(w.tutors.assign('act-2', 'sub-en', 'tp-anjali', 'mentor-1')).resolves.toMatchObject({ status: 'ACTIVE' });
  });

  it('removing a tutor frees the time and is recorded with a reason', async () => {
    const w = world();
    addTutor(w.db, 'rahul', 'Rahul Menon', { hours: ALL_DAYS });
    await w.tutors.assign('act-1', 'sub-en', 'tp-rahul', 'mentor-1');
    await expect(w.tutors.unassign('act-1', 'sub-en', 'Parent chose another tutor', 'mentor-1')).resolves.toEqual({ removed: true });
    expect(w.db.rows('mentoringTutorAssignment')[0]).toMatchObject({ status: 'ENDED', endReason: 'Parent chose another tutor' });
    expect(w.db.rows('mentoringTutorAssignmentSession')).toHaveLength(0);
    expect(events(w.db, 'MENTORING_TUTOR_REMOVED')[0]).toMatchObject({ reason: 'Parent chose another tutor', actorUserId: 'mentor-1' });
    await expect(w.tutors.unassign('act-1', 'sub-en', null, 'mentor-1')).resolves.toEqual({ removed: false });
  });
});

describe('When the student schedule changes after a tutor was assigned', () => {
  const save = (w: ReturnType<typeof world>, schedule: unknown) => {
    const current = w.db.rows('enrollmentHandoverField').find((f) => f.fieldKey === KEY)?.value ?? null;
    return w.workflow.updateHandoverField('act-1', KEY, schedule, 'mentor-1', current);
  };
  const live = (w: ReturnType<typeof world>) => w.db.rows('mentoringTutorAssignment').find((a) => a.status !== 'ENDED')!;

  /** English with names from the master lists, the way the page saves it. */
  const saved = (sessions: object[], total = 60 * sessions.length) => plan({ ...english(sessions), totalMinutes: total });

  async function assigned() {
    const w = world(undefined);
    w.db.rows('enrollmentHandoverField').length = 0;
    addTutor(w.db, 'rahul', 'Rahul Menon', { hours: [[MON, '14:00', '18:00'], [TUE, '14:00', '18:00'], [THU, '14:00', '18:00'], [SAT, '14:00', '18:00']] });
    await save(w, saved([timed('Monday', '15:00', '16:00'), timed('Tuesday', '15:00', '16:00')]));
    await w.tutors.assign('act-1', 'sub-en', 'tp-rahul', 'mentor-1');
    return w;
  }

  it('a change the tutor still fits updates the booked sessions and keeps the assignment active', async () => {
    const w = await assigned();
    await save(w, saved([timed('Monday', '16:00', '17:00'), timed('Tuesday', '15:00', '16:00')]));
    expect(live(w)).toMatchObject({ status: 'ACTIVE', reviewDetail: null });
    expect(w.db.rows('mentoringTutorAssignmentSession').map((s) => s.startMinute).sort()).toEqual([900, 960]);
    expect(events(w.db, 'MENTORING_TUTOR_SCHEDULE_UPDATED')).toHaveLength(1);
  });

  it('a change the tutor no longer fits flags the assignment for review, names the sessions, and keeps the old booking', async () => {
    const w = await assigned();
    await save(w, saved([timed('Monday', '15:00', '16:00'), timed('Wednesday', '15:00', '16:00')]));
    const a = live(w);
    expect(a.status).toBe('NEEDS_REVIEW');
    expect(a.reviewDetail.sessions).toEqual([expect.objectContaining({ label: 'Wednesday, 3:00 PM to 4:00 PM', status: 'NOT_WORKING_DAY', reason: 'Does not work on Wednesdays.' })]);
    expect(events(w.db, 'MENTORING_TUTOR_NEEDS_REVIEW')[0].payload).toMatchObject({ trigger: 'SCHEDULE_CHANGED', tutorProfileId: 'tp-rahul' });
    // never silently dropped or rewritten: the tutor is still booked for the earlier classes
    expect(w.db.rows('mentoringTutorAssignmentSession').map((s) => s.dayOfWeek).sort()).toEqual([MON, TUE]);
    expect((await w.tutors.assignmentsFor('act-1'))[0]).toMatchObject({ status: 'NEEDS_REVIEW' });
  });

  it('a new time that clashes with another student flags the assignment, and the reason is not private', async () => {
    const w = await assigned();
    addTutor(w.db, 'other', 'Other Tutor', { hours: ALL_DAYS });
    addStudent(w.db, 2, plan(english([timed('Thursday', '15:00', '16:00')])));
    await w.tutors.assign('act-2', 'sub-en', 'tp-rahul', 'mentor-1');
    await save(w, saved([timed('Monday', '15:00', '16:00'), timed('Thursday', '15:00', '16:00')]));
    expect(live(w).status === 'NEEDS_REVIEW' || w.db.rows('mentoringTutorAssignment').some((a) => a.activationId === 'act-1' && a.status === 'NEEDS_REVIEW')).toBe(true);
    const detail = JSON.stringify(w.db.rows('mentoringTutorAssignment').find((a) => a.activationId === 'act-1')!.reviewDetail);
    expect(detail).toContain('Already booked during this time.');
    expect(detail).not.toMatch(/act-2|stu-2/);
  });

  it('a change of level the tutor does not teach flags the assignment', async () => {
    const w = await assigned();
    await save(w, plan({ ...english([timed('Monday', '15:00', '16:00'), timed('Tuesday', '15:00', '16:00')]), totalMinutes: 120, gradeId: 'g-9', gradeName: 'Grade 9' }));
    expect(live(w)).toMatchObject({ status: 'NEEDS_REVIEW', reviewDetail: expect.objectContaining({ reason: "Grade 9 is not one of this tutor's levels." }) });
  });

  it('removing a start time flags the assignment, and putting it back confirms it again', async () => {
    const w = await assigned();
    await save(w, saved([timed('Monday', '15:00', '16:00'), { day: 'Tuesday', durationMinutes: 60 }]));
    expect(live(w).status).toBe('NEEDS_REVIEW');
    await save(w, saved([timed('Monday', '15:00', '16:00'), timed('Tuesday', '15:00', '16:00')]));
    expect(live(w).status).toBe('ACTIVE');
    expect(events(w.db, 'MENTORING_TUTOR_CONFIRMED')).toHaveLength(1);
  });

  it('removing the subject from the schedule ends the assignment and keeps it in the history', async () => {
    const w = await assigned();
    await save(w, plan(maths()));
    expect(w.db.rows('mentoringTutorAssignment')[0]).toMatchObject({ status: 'ENDED', currentKey: null, endReason: 'The subject was removed from the schedule' });
    expect(w.db.rows('mentoringTutorAssignmentSession')).toHaveLength(0);
    expect(events(w.db, 'MENTORING_TUTOR_REMOVED')[0].reason).toBe('The subject was removed from the schedule');
  });

  it('an unrelated edit to the schedule leaves the assignment and its history alone', async () => {
    const w = await assigned();
    const before = events(w.db).length;
    await save(w, plan({ ...english([timed('Monday', '15:00', '16:00'), timed('Tuesday', '15:00', '16:00')]), totalMinutes: 120 }, maths()));
    expect(live(w).status).toBe('ACTIVE');
    // Only the original assignment is in the tutor history: the edit did not touch this subject.
    expect(events(w.db).filter((e) => e.type.startsWith('MENTORING_TUTOR')).map((e) => e.type)).toEqual(['MENTORING_TUTOR_ASSIGNED']);
    expect(before).toBeGreaterThan(0);
  });
});

describe('When a tutor\'s working hours change', () => {
  async function assigned() {
    const w = world(plan(english([timed('Tuesday', '17:00', '18:00')])));
    addTutor(w.db, 'rahul', 'Rahul Menon', { hours: [[TUE, '15:00', '19:00']] });
    await w.tutors.assign('act-1', 'sub-en', 'tp-rahul', 'mentor-1');
    return w;
  }
  const tuesdaySlots = (w: ReturnType<typeof world>) => w.db.rows('tutorAvailabilitySlot').filter((s) => s.dayOfWeek === TUE);

  it('hours that no longer cover a booked class flag the assignment for review, and nothing is cancelled', async () => {
    const w = await assigned();
    await w.availability.replace('tp-rahul', [{ day: TUE, start: '15:00', end: '16:30' }], 'hr-1');
    expect(w.emitted).toEqual([{ name: 'tutor.availability.changed', payload: { tutorProfileId: 'tp-rahul', actorUserId: 'hr-1' } }]);
    await expect(w.tutors.revalidateForTutor('tp-rahul', 'hr-1')).resolves.toBe(1);
    const a = w.db.rows('mentoringTutorAssignment')[0];
    expect(a.status).toBe('NEEDS_REVIEW');
    expect(a.reviewDetail.sessions[0]).toMatchObject({ status: 'NOT_CONFIGURED', reason: expect.stringContaining('does not include 5:00 PM to 6:00 PM') });
    expect(events(w.db, 'MENTORING_TUTOR_NEEDS_REVIEW')[0].payload).toMatchObject({ trigger: 'TUTOR_AVAILABILITY_CHANGED' });
    expect(w.db.rows('mentoringTutorAssignmentSession')).toHaveLength(1); // still booked until a person decides
  });

  it('restoring the hours confirms the assignment again', async () => {
    const w = await assigned();
    await w.availability.replace('tp-rahul', [{ day: TUE, start: '15:00', end: '16:30' }], 'hr-1');
    await w.tutors.revalidateForTutor('tp-rahul', 'hr-1');
    await w.availability.replace('tp-rahul', [{ day: TUE, start: '15:00', end: '19:00' }], 'hr-1');
    await w.tutors.revalidateForTutor('tp-rahul', 'hr-1');
    expect(w.db.rows('mentoringTutorAssignment')[0].status).toBe('ACTIVE');
    expect(events(w.db, 'MENTORING_TUTOR_CONFIRMED')).toHaveLength(1);
  });

  it('a tutor who becomes available after their profile is updated can then be chosen', async () => {
    const w = world(plan(english([timed('Tuesday', '17:00', '18:00')])));
    addTutor(w.db, 'rahul', 'Rahul Menon', { hours: [[TUE, '15:00', '16:00']] });
    let list = await w.tutors.candidates('act-1', 'sub-en', 'mentor-1', true);
    expect(list.tutors[0]).toMatchObject({ verdict: 'NONE', canAssign: false });
    expect(list.tutors[0].sessions[0].status).toBe('NOT_CONFIGURED');
    await expect(w.tutors.assign('act-1', 'sub-en', 'tp-rahul', 'mentor-1')).rejects.toBeInstanceOf(ConflictException);

    await w.availability.replace('tp-rahul', [{ day: TUE, start: '15:00', end: '19:00' }], 'hr-1');
    list = await w.tutors.candidates('act-1', 'sub-en', 'mentor-1', true);
    expect(list.tutors[0]).toMatchObject({ verdict: 'FULL', canAssign: true });
    await expect(w.tutors.assign('act-1', 'sub-en', 'tp-rahul', 'mentor-1')).resolves.toMatchObject({ status: 'ACTIVE' });
  });

  it('adding working hours never overrides a booking: the time stays occupied', async () => {
    const w = world(plan(english([timed('Tuesday', '17:00', '18:00')])));
    addTutor(w.db, 'rahul', 'Rahul Menon', { hours: [[TUE, '15:00', '19:00']] });
    addStudent(w.db, 2, plan(english([timed('Tuesday', '17:00', '18:00')])));
    await w.tutors.assign('act-2', 'sub-en', 'tp-rahul', 'mentor-1');
    await w.availability.replace('tp-rahul', [{ day: TUE, start: '08:00', end: '22:00' }, { day: MON, start: '08:00', end: '22:00' }], 'hr-1');
    const list = await w.tutors.candidates('act-1', 'sub-en', 'mentor-1', true);
    expect(list.tutors[0].sessions[0]).toMatchObject({ status: 'OCCUPIED' });
    await expect(w.tutors.assign('act-1', 'sub-en', 'tp-rahul', 'mentor-1')).rejects.toBeInstanceOf(ConflictException);
    expect(tuesdaySlots(w).filter((s) => s.isActive)).toHaveLength(1);
  });

  it('the listener re-checks the tutor, and a failure there is contained', async () => {
    const w = await assigned();
    await w.availability.replace('tp-rahul', [{ day: TUE, start: '15:00', end: '16:30' }], 'hr-1');
    await w.tutors.onAvailabilityChanged({ tutorProfileId: 'tp-rahul', actorUserId: 'hr-1' });
    expect(w.db.rows('mentoringTutorAssignment')[0].status).toBe('NEEDS_REVIEW');
    jest.spyOn(w.tutors, 'revalidateForTutor').mockRejectedValueOnce(new Error('boom'));
    await expect(w.tutors.onAvailabilityChanged({ tutorProfileId: 'tp-rahul', actorUserId: null })).resolves.toBeUndefined();
  });
});

describe('Tutor availability editing', () => {
  const setup = () => {
    const w = world();
    addTutor(w.db, 'rahul', 'Rahul Menon', { hours: [[MON, '14:00', '18:00'], [TUE, '15:00', '19:00']] });
    return w;
  };

  it('reads the saved hours, Monday first', async () => {
    const w = setup();
    expect(await w.availability.get('tp-rahul')).toEqual({ tutorProfileId: 'tp-rahul', name: 'Rahul Menon', windows: [{ day: MON, start: '14:00', end: '18:00' }, { day: TUE, start: '15:00', end: '19:00' }] });
  });

  it('replaces the hours: several ranges a day, a break, a day off; removed rows are kept as inactive history', async () => {
    const w = setup();
    const next = [{ day: MON, start: '09:00', end: '12:00' }, { day: MON, start: '14:00', end: '18:00' }, { day: SAT, start: '09:00', end: '13:00' }];
    const result = await w.availability.replace('tp-rahul', next, 'hr-1');
    expect(result.changed).toBe(true);
    expect(result.windows).toEqual(next);
    const rows = w.db.rows('tutorAvailabilitySlot');
    expect(rows.filter((r) => r.isActive)).toHaveLength(3);
    // Tuesday was removed and kept as an inactive row. The Monday range that did not change was left alone.
    expect(rows.filter((r) => !r.isActive)).toHaveLength(1);
    expect(rows.find((r) => !r.isActive)).toMatchObject({ dayOfWeek: TUE, deactivatedAt: expect.any(Date) });
    expect(rows.filter((r) => r.isActive && r.createdByUserId === 'hr-1')).toHaveLength(2);
  });

  it('saving the same hours again changes nothing and does not announce a change', async () => {
    const w = setup();
    const same = [{ day: MON, start: '14:00', end: '18:00' }, { day: TUE, start: '15:00', end: '19:00' }];
    const result = await w.availability.replace('tp-rahul', same, 'hr-1');
    expect(result.changed).toBe(false);
    expect(w.emitted).toEqual([]);
    expect(w.db.rows('tutorAvailabilitySlot')).toHaveLength(2);
  });

  it('no ranges at all is allowed: the tutor has no working hours', async () => {
    const w = setup();
    await expect(w.availability.replace('tp-rahul', [], 'hr-1')).resolves.toMatchObject({ windows: [], changed: true });
  });

  it.each([
    ['overlapping ranges', [{ day: TUE, start: '14:00', end: '17:00' }, { day: TUE, start: '16:00', end: '18:00' }], /overlaps/],
    ['an end before the start', [{ day: TUE, start: '18:00', end: '14:00' }], /end time must be after the start time/],
    ['a start that is not a time', [{ day: TUE, start: 'soon', end: '14:00' }], /start time must be a time/],
    ['a day that does not exist', [{ day: 8, start: '10:00', end: '11:00' }], /Choose a day/],
  ])('refuses %s and changes nothing', async (_label, windows, message) => {
    const w = setup();
    const before = JSON.stringify(w.db.rows('tutorAvailabilitySlot'));
    await expect(w.availability.replace('tp-rahul', windows, 'hr-1')).rejects.toBeInstanceOf(BadRequestException);
    await expect(w.availability.replace('tp-rahul', windows, 'hr-1')).rejects.toThrow(message);
    expect(JSON.stringify(w.db.rows('tutorAvailabilitySlot'))).toBe(before);
    expect(w.emitted).toEqual([]);
  });

  it('refuses an unknown tutor', async () => {
    const w = setup();
    await expect(w.availability.replace('tp-nobody', [], 'hr-1')).rejects.toThrow('Tutor profile not found');
  });

  it('is limited by the existing tutor profile permissions: HR manages any tutor, a tutor only their own, a Mentor neither', () => {
    const route = (name: string) => Reflect.getMetadata(PERMISSIONS_KEY, (TutorProfileController.prototype as any)[name]);
    expect(route('getAvailability')).toEqual(['tutor.profile.manage']);
    expect(route('replaceAvailability')).toEqual(['tutor.profile.manage']);
    expect(route('getMyAvailability')).toEqual(['tutor.self.update']);
    expect(route('replaceMyAvailability')).toEqual(['tutor.self.update']);
    for (const user of ['mentor-1', 'mentor-2', 'head-1', 'ceo-1']) expect(PERMS[user]).not.toContain('tutor.profile.manage');
  });

  it('a tutor reaches their own profile through their user, and nobody else', async () => {
    const w = setup();
    await expect(w.availability.profileIdForUser('u-rahul')).resolves.toBe('tp-rahul');
    await expect(w.availability.profileIdForUser('u-nobody')).rejects.toThrow('Employee not found');
  });
});

describe('What the workspace tells the page', () => {
  it('lists the student tutors and who may change tutor hours', async () => {
    const w = world();
    addTutor(w.db, 'rahul', 'Rahul Menon', { hours: ALL_DAYS });
    await w.tutors.assign('act-1', 'sub-en', 'tp-rahul', 'mentor-1');
    const view: any = await w.workflow.getWorkspace('act-1', await w.scope('mentor-1'));
    expect(view.tutorAssignments).toEqual([expect.objectContaining({ subjectId: 'sub-en', tutorName: 'Rahul Menon', status: 'ACTIVE' })]);
    expect(view.viewer.canManageTutorAvailability).toBe(false);
    PERMS['mentor-1'] = [...PERMS['mentor-1'], 'tutor.profile.manage'];
    try {
      expect(((await w.workflow.getWorkspace('act-1', await w.scope('mentor-1'))) as any).viewer.canManageTutorAvailability).toBe(true);
    } finally {
      PERMS['mentor-1'] = PERMS['mentor-1'].filter((p) => p !== 'tutor.profile.manage');
    }
  });

  it('the Head and the CEO can see the tutors but cannot change them', async () => {
    const w = world();
    addTutor(w.db, 'rahul', 'Rahul Menon', { hours: ALL_DAYS });
    await w.tutors.assign('act-1', 'sub-en', 'tp-rahul', 'mentor-1');
    for (const user of ['head-1', 'ceo-1']) {
      const view: any = await w.workflow.getWorkspace('act-1', await w.scope(user));
      expect(view.tutorAssignments).toHaveLength(1);
      expect(view.viewer.canEditHandover).toBe(false);
      await expect(w.tutors.assign('act-1', 'sub-en', 'tp-rahul', user)).rejects.toBeInstanceOf(ForbiddenException);
    }
  });

  it('assignments that ended are history, not shown as current', async () => {
    const w = world();
    addTutor(w.db, 'rahul', 'Rahul Menon', { hours: ALL_DAYS });
    await w.tutors.assign('act-1', 'sub-en', 'tp-rahul', 'mentor-1');
    await w.tutors.unassign('act-1', 'sub-en', null, 'mentor-1');
    expect(await w.tutors.assignmentsFor('act-1')).toEqual([]);
    expect(w.db.rows('mentoringTutorAssignment')).toHaveLength(1);
  });
});
