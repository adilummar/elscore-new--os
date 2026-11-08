/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-member-access */
/**
 * The synthetic tutor timetable fixture, tested against an in-memory database. Nothing here touches a real database: the
 * loader and the rollback are given a stand-in, which is also how they are proved safe to run later.
 */
import { MentoringHistoryService } from '../mentoring/mentoring-history.service';
import { MentoringTutorService } from '../mentoring/mentoring-tutor.service';
import { FakeDb } from '../mentoring/testing/mentoring-fake-db';


import {
  APPROVED_COUNTS, CONFIRM_VARIABLE, EMAIL_DOMAIN, EMPLOYEE_PREFIX, LEAD_PREFIX, STAGING_DATABASE, STUDENT_PREFIX,
  applyFixture, buildFixture, checkTarget, countsOf, findConflicts, fixtureId, idsOnly, removeFixture, resolveReferences,
} from './testing/timetable-fixture/fixture';
import { TUTORS, WINDOW, byKey, resolveDay } from './testing/timetable-fixture/preview';
import { TutorCalendarService } from './tutor-calendar.service';

const STAGING_URL = `postgresql://user:secret-password@localhost:5432/${STAGING_DATABASE}?schema=public`;

/** Staging as the loader finds it: reference data, and the real records that must never change. */
function staging() {
  const db = new FakeDb();
  db.seed('department', { id: 'dept-real', code: 'ACADEMICS', name: 'Academics' });
  db.seed('role', { id: 'role-tutor', code: 'TUTOR' });
  db.seed('role', { id: 'role-mentor', code: 'MENTOR' });
  // Eight of the ten subjects exist; Hindi and Social Studies do not.
  for (const [code, name] of [['ENGLISH', 'English'], ['MATH', 'Mathematics'], ['PHYSICS', 'Physics'], ['SCIENCE', 'Science'], ['BIOLOGY', 'Biology'], ['CHEMISTRY', 'Chemistry'], ['CS', 'Computer Science'], ['HISTORY', 'History']]) {
    db.seed('subject', { id: `sub-${code}`, code, name, isActive: true });
  }
  for (let n = 1; n <= 12; n++) db.seed('grade', { id: `grade-${n}`, code: `GRADE_${n}`, name: `Grade ${n}`, sortOrder: n, isActive: true });
  db.seed('curriculum', { id: 'cur-cbse', code: 'CBSE', name: 'CBSE' });

  // Real records: a tutor, a student with a booking, a real user. None of them may be touched.
  db.seed('user', { id: 'u-real-tutor', email: 'real.tutor@elscore.example', status: 'ACTIVE' });
  db.seed('employee', { id: 'e-real-tutor', userId: 'u-real-tutor', businessId: 'EMP-0007', firstName: 'Real', lastName: 'Tutor', employmentStatus: 'ACTIVE' });
  db.seed('tutorProfile', { id: 'tp-real', employeeId: 'e-real-tutor', tutorOperationalStatus: 'ACTIVE' });
  db.seed('tutorAvailabilitySlot', { tutorProfileId: 'tp-real', dayOfWeek: 1, startTime: new Date('1970-01-01T09:00:00Z'), endTime: new Date('1970-01-01T12:00:00Z'), isActive: true });
  db.seed('lead', { id: 'lead-real', businessId: 'LED-0001' });
  db.seed('student', { id: 'stu-real', businessId: 'STU-0001', firstName: 'Real', lastName: 'Student' });
  db.seed('mentoringActivation', { id: 'act-real', studentId: 'stu-real', leadId: 'lead-real', handoverId: 'ho-real', status: 'ACTIVATION_IN_PROGRESS' });
  db.seed('mentoringTutorAssignment', { id: 'as-real', activationId: 'act-real', subjectId: 'sub-SCIENCE', tutorProfileId: 'tp-real', status: 'ACTIVE', currentKey: 'act-real:sub-SCIENCE' });
  db.seed('mentoringEvent', { activationId: 'act-real', type: 'MENTORING_TUTOR_ASSIGNED' });
  return db;
}

/** Everything in the database as text, empty tables left out, to prove a set of rows did not change. */
const snapshot = (db: FakeDb) => JSON.stringify(Object.fromEntries(Object.entries(db.tables).filter(([, rows]) => rows.length)));
const total = (db: FakeDb) => Object.values(db.tables).reduce((n, rows) => n + rows.length, 0);

async function loaded(db = staging()) {
  const fixture = buildFixture(await resolveReferences(db));
  await applyFixture(db, fixture, true);
  return { db, fixture };
}

describe('the target guard', () => {
  it('accepts exactly the staging database with the matching confirmation', () => {
    expect(checkTarget(STAGING_URL, STAGING_DATABASE)).toEqual({ host: 'localhost', database: STAGING_DATABASE });
  });

  it.each([
    ['production', 'postgresql://u:p@db:5432/elscore_os', 'elscore_os'],
    ['a name that only starts like staging', `postgresql://u:p@db:5432/${STAGING_DATABASE}_copy`, STAGING_DATABASE],
    ['a name that only ends like staging', `postgresql://u:p@db:5432/old_${STAGING_DATABASE}`, STAGING_DATABASE],
    ['ARCH OS', 'postgresql://u:p@db:5432/arch_os', 'arch_os'],
    ['a different case', `postgresql://u:p@db:5432/${STAGING_DATABASE.toUpperCase()}`, STAGING_DATABASE],
    ['no database at all', 'postgresql://u:p@db:5432', STAGING_DATABASE],
  ])('refuses %s even with a confirmation', (_label, url, confirmation) => {
    expect(() => checkTarget(url, confirmation)).toThrow('Refusing to run');
  });

  it('refuses the right database without the confirmation, or with the wrong one', () => {
    expect(() => checkTarget(STAGING_URL, undefined)).toThrow(CONFIRM_VARIABLE);
    expect(() => checkTarget(STAGING_URL, 'yes')).toThrow(CONFIRM_VARIABLE);
    expect(() => checkTarget(STAGING_URL, 'elscore_os')).toThrow(CONFIRM_VARIABLE);
  });

  it('refuses a missing or unreadable connection string, and never repeats a password', () => {
    expect(() => checkTarget(undefined, STAGING_DATABASE)).toThrow('DATABASE_URL is not set');
    expect(() => checkTarget('not a url', STAGING_DATABASE)).toThrow('not a valid connection string');
    let message = '';
    try {
      checkTarget('postgresql://user:secret-password@db:5432/elscore_os', STAGING_DATABASE);
    } catch (e) {
      message = (e as Error).message;
    }
    expect(message).not.toContain('secret-password');
  });
});

describe('what the fixture contains', () => {
  const build = async () => buildFixture(await resolveReferences(staging()));

  it('matches the counts in the approved proposal, table by table', async () => {
    const counts = countsOf(await build());
    for (const [table, expected] of Object.entries(APPROVED_COUNTS)) expect({ table, rows: counts[table] }).toEqual({ table, rows: expected });
    // Two subjects were missing on this stand-in staging (Hindi and Social Studies); the events are one per booking.
    expect(counts.subjects).toBe(2);
    expect(counts.mentoring_events).toBe(51);
  });

  it('is entirely marked as synthetic, so nothing in it can be taken for a real record', async () => {
    const f = await build();
    const rows = (name: string) => f.tables.find((t) => t.name === name)!.rows;
    for (const u of rows('users')) {
      expect(String(u.email)).toMatch(new RegExp(`${EMAIL_DOMAIN.replace('.', '\\.')}$`));
      expect(u.status).toBe('PENDING_SETUP');
      expect(String(u.passwordHash)).toMatch(/^!/); // not a hash of any password: nobody can sign in
    }
    for (const e of rows('employees')) {
      expect(String(e.businessId).startsWith(EMPLOYEE_PREFIX)).toBe(true);
      expect(String(e.jobTitle)).toContain('SYNTHETIC');
    }
    for (const l of rows('leads')) expect(String(l.businessId).startsWith(LEAD_PREFIX)).toBe(true);
    for (const s of rows('students')) {
      expect(String(s.businessId).startsWith(STUDENT_PREFIX)).toBe(true);
      expect(s.firstName).toBe('Synthetic');
    }
    for (const p of rows('tutor_profiles')) expect(String(p.bio)).toContain('SYNTHETIC');
    for (const s of rows('subjects')) expect(String(s.code).startsWith('SYNTH_')).toBe(true);
    expect(rows('users').map((u) => u.email)).toEqual(expect.arrayContaining(['anjali.menon@example.test', 'meera.thomas@example.test', 'sandeep.pillai@example.test', 'synthetic.mentor@example.test']));
  });

  it('gives every row an id that is the same each time and different from every other row', async () => {
    const a = await build();
    const b = await build();
    const idsA = a.tables.flatMap((t) => t.rows.map((r) => r.id).filter(Boolean));
    expect(idsA).toEqual(b.tables.flatMap((t) => t.rows.map((r) => r.id).filter(Boolean)));
    expect(new Set(idsA).size).toBe(idsA.length);
    expect(fixtureId('user', 'a@example.test')).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    // The rollback learns the same ids without looking anything up.
    expect(idsOnly().ids.users).toEqual(a.ids.users);
    expect(idsOnly().ids.activations).toEqual(a.ids.activations);
  });

  it('keeps every foreign key pointing at a row the fixture or the reference data provides', async () => {
    const f = await build();
    const have = (name: string) => new Set(f.tables.find((t) => t.name === name)!.rows.map((r) => r.id));
    const users = have('users'), employees = have('employees'), profiles = have('tutor_profiles'), leads = have('leads'), students = have('students');
    const handovers = have('enrollment_handovers'), activations = have('mentoring_activations'), assignments = have('mentoring_tutor_assignments'), subjects = new Set([...have('subjects'), ...[...'ENGLISH MATH PHYSICS SCIENCE BIOLOGY CHEMISTRY CS HISTORY'.split(' ')].map((c) => `sub-${c}`)]);
    const rows = (name: string) => f.tables.find((t) => t.name === name)!.rows;
    for (const e of rows('employees')) expect(users.has(e.userId as string)).toBe(true);
    for (const p of rows('tutor_profiles')) expect(employees.has(p.employeeId as string)).toBe(true);
    for (const r of [...rows('tutor_subjects'), ...rows('tutor_grades'), ...rows('tutor_availability_slots')]) expect(profiles.has(r.tutorProfileId as string)).toBe(true);
    for (const r of rows('tutor_subjects')) expect(subjects.has(r.subjectId as string)).toBe(true);
    for (const r of rows('tutor_grades')) expect(String(r.gradeId)).toMatch(/^grade-\d+$/);
    for (const r of rows('employee_leave_requests')) expect(employees.has(r.employeeId as string)).toBe(true);
    for (const r of rows('students')) expect(leads.has(r.leadId as string)).toBe(true);
    for (const r of rows('enrollment_handovers')) { expect(leads.has(r.leadId as string)).toBe(true); expect(students.has(r.studentId as string)).toBe(true); }
    for (const r of rows('mentoring_activations')) { expect(handovers.has(r.handoverId as string)).toBe(true); expect(students.has(r.studentId as string)).toBe(true); expect(users.has(r.currentMentorUserId as string)).toBe(true); }
    for (const r of [...rows('mentoring_stages'), ...rows('mentor_assignments'), ...rows('mentoring_tutor_assignments'), ...rows('mentoring_events')]) expect(activations.has(r.activationId as string)).toBe(true);
    for (const r of rows('mentoring_tutor_assignments')) { expect(profiles.has(r.tutorProfileId as string)).toBe(true); expect(subjects.has(r.subjectId as string)).toBe(true); }
    for (const r of [...rows('mentoring_tutor_assignment_sessions'), ...rows('mentoring_tutor_assignment_overrides')]) expect(assignments.has(r.assignmentId as string)).toBe(true);
    for (const r of rows('enrollment_handover_fields')) expect(handovers.has(r.handoverId as string)).toBe(true);
    for (const r of rows('tutor_availability_exceptions')) if (r.tutorProfileId) expect(profiles.has(r.tutorProfileId as string)).toBe(true);
  });

  it('puts every student at the Meeting with Parents stage with the Mentor who owns them, and nobody in the real allocation queue', async () => {
    const f = await build();
    const rows = (name: string) => f.tables.find((t) => t.name === name)!.rows;
    expect(rows('mentoring_activations').every((a) => a.status === 'ACTIVATION_IN_PROGRESS' && a.currentStage === 2 && a.currentMentorUserId === f.mentorUserId)).toBe(true);
    for (const a of rows('mentoring_activations')) {
      const stages = rows('mentoring_stages').filter((s) => s.activationId === a.id).sort((x, y) => (x.stageNumber as number) - (y.stageNumber as number));
      expect(stages.map((s) => s.status)).toEqual(['COMPLETED', 'IN_PROGRESS', 'NOT_STARTED', 'NOT_STARTED', 'NOT_STARTED', 'NOT_STARTED', 'NOT_STARTED']);
    }
    expect(rows('mentoring_staff_profiles')[0]).toMatchObject({ role: 'MENTOR', acceptsAllocation: false });
  });

  it('saves each student a real subject schedule and a booking that agrees with it', async () => {
    const f = await build();
    const rows = (name: string) => f.tables.find((t) => t.name === name)!.rows;
    expect(rows('enrollment_handover_fields')).toHaveLength(51);
    const meeraStudentH = f.bookings.find((b) => b.tutorKey === 'meera' && b.label === 'Student H')!;
    const assignment = rows('mentoring_tutor_assignments').find((a) => a.id === meeraStudentH.assignmentId)!;
    const session = rows('mentoring_tutor_assignment_sessions').find((s) => s.assignmentId === assignment.id)!;
    expect(session).toMatchObject({ dayOfWeek: 3, frequency: 'WEEKLY', week: null, occurrences: [], startMinute: 17 * 60 + 30, endMinute: 18 * 60 + 30 });
    expect(assignment.startDate).toEqual(new Date('2026-11-09T00:00:00Z'));
    const field = rows('enrollment_handover_fields').find((x) => x.handoverId === rows('mentoring_activations').find((a) => a.id === meeraStudentH.activationId)!.handoverId)!;
    expect((field.value as any).subjects[0]).toMatchObject({ subjectName: 'Biology', frequency: 'WEEKLY', totalMinutes: 60, startDate: '2026-11-09', sessions: [{ day: 'Wednesday', start: '17:30', end: '18:30' }] });
  });

  it('records the one cancelled and the one moved class on the assignments they belong to', async () => {
    const f = await build();
    const overrides = f.tables.find((t) => t.name === 'mentoring_tutor_assignment_overrides')!.rows;
    expect(overrides).toHaveLength(2);
    const cancelled = overrides.find((o) => o.kind === 'CANCELLED')!;
    expect(cancelled).toMatchObject({ date: new Date('2026-11-17T00:00:00Z'), originalStartMinute: 900, newDate: null });
    expect(cancelled.assignmentId).toBe(f.bookings.find((b) => b.tutorKey === 'meera' && b.label === 'Student E')!.assignmentId);
    const moved = overrides.find((o) => o.kind === 'RESCHEDULED')!;
    expect(moved).toMatchObject({ date: new Date('2026-11-24T00:00:00Z'), newDate: new Date('2026-11-26T00:00:00Z'), newStartMinute: 1140, newEndMinute: 1200 });
    expect(moved.assignmentId).toBe(f.bookings.find((b) => b.tutorKey === 'rahul' && b.label === 'Student 7')!.assignmentId);
  });

  it('turns leave into two approved requests that cover three days, one per tutor run of days', async () => {
    const f = await build();
    const leave = f.tables.find((t) => t.name === 'employee_leave_requests')!.rows;
    expect(leave.map((l) => [l.startDate, l.endDate, l.status]).sort()).toEqual([['2026-11-12', '2026-11-12', 'APPROVED'], ['2026-11-18', '2026-11-19', 'APPROVED']]);
  });

  it('needs reference data that exists and says plainly what is missing', async () => {
    const bare = new FakeDb();
    await expect(resolveReferences(bare)).rejects.toThrow(/no department[\s\S]*TUTOR role[\s\S]*MENTOR role[\s\S]*Grade 4/);
    const noGrade = staging();
    noGrade.tables.grade = noGrade.tables.grade.filter((g) => g.code !== 'GRADE_11');
    await expect(resolveReferences(noGrade)).rejects.toThrow('Grade 11');
  });

  it('reuses a subject that already exists by name, whatever its capitalisation, instead of creating a second', async () => {
    const db = staging();
    db.seed('subject', { id: 'sub-hindi', code: 'HINDI', name: ' hindi ', isActive: true });
    const f = buildFixture(await resolveReferences(db));
    expect(f.tables.find((t) => t.name === 'subjects')!.rows.map((r) => r.name)).toEqual(['Social Studies']);
    expect(f.tables.find((t) => t.name === 'tutor_subjects')!.rows.some((r) => r.subjectId === 'sub-hindi')).toBe(true);
  });
});

describe('loading it', () => {
  it('a dry run reports the plan and writes nothing', async () => {
    const db = staging();
    const before = snapshot(db);
    const fixture = buildFixture(await resolveReferences(db));
    const report = await applyFixture(db, fixture, false);
    expect(snapshot(db)).toBe(before);
    expect(report.reduce((n, r) => n + r.planned, 0)).toBeGreaterThan(1000);
    expect(report.every((r) => r.created === 0 && r.present === 0)).toBe(true);
  });

  it('writes every row once, and a second run finds them all and writes nothing', async () => {
    const { db, fixture } = await loaded();
    const rows = total(db);
    const again = await applyFixture(db, fixture, true);
    expect(total(db)).toBe(rows);
    expect(again.every((r) => r.created === 0 && r.present === r.planned)).toBe(true);
    for (const t of fixture.tables.filter((x) => x.model !== 'userRole')) expect(db.rows(t.model).filter((r) => t.rows.some((x) => x.id === r.id)).length).toBe(t.rows.length);
  });

  it('adds only to the database: every real record is exactly as it was', async () => {
    const db = staging();
    const real = db.rows('user').concat(db.rows('employee'), db.rows('tutorProfile'), db.rows('mentoringTutorAssignment'), db.rows('student')).map((r) => JSON.stringify(r));
    await loaded(db);
    const now = db.rows('user').concat(db.rows('employee'), db.rows('tutorProfile'), db.rows('mentoringTutorAssignment'), db.rows('student')).map((r) => JSON.stringify(r));
    expect(now.slice(0, 1)).toEqual(real.slice(0, 1));
    for (const r of real) expect(now).toContain(r);
    expect(db.rows('user').find((u) => u.id === 'u-real-tutor')).toMatchObject({ email: 'real.tutor@elscore.example', status: 'ACTIVE' });
  });

  it('stops before writing anything if a real record already uses a fixture e-mail or id', async () => {
    const db = staging();
    db.seed('user', { id: 'someone-else', email: 'meera.thomas@example.test', status: 'ACTIVE' });
    const before = snapshot(db);
    const fixture = buildFixture(await resolveReferences(db));
    await expect(findConflicts(db, fixture)).resolves.toEqual(['The e-mail "meera.thomas@example.test" already exists and is not part of the fixture.']);
    await expect(applyFixture(db, fixture, true)).rejects.toThrow(/Nothing was written\. 1 row/);
    expect(snapshot(db)).toBe(before);
  });

  it('also stops on a colliding student id or subject code', async () => {
    const db = staging();
    db.seed('student', { id: 'real-2', businessId: 'SYNTH-STU-007', firstName: 'Real' });
    db.seed('subject', { id: 'real-hindi', code: 'SYNTH_HINDI', name: 'Something', isActive: true });
    const fixture = buildFixture(await resolveReferences(db));
    const found = await findConflicts(db, fixture);
    expect(found.some((m) => m.includes('SYNTH-STU-007'))).toBe(true);
  });
});

describe('what the loaded fixture does in the product', () => {
  const brief = (view: any, date: string) =>
    view.days.find((d: any) => d.date === date).segments.filter((s: any) => s.state !== 'NOT_WORKING').map((s: any) => `${s.start / 60}-${s.end / 60} ${s.state}${s.label ? ` ${s.label.subject} ${s.label.student ?? 'Booked'}` : ''}`);
  const calendarOf = (db: FakeDb) => new TutorCalendarService(db as any, { getPermissionsForUser: () => Promise.resolve(new Set(['tutor.profile.read', 'tutor.profile.manage'])) } as any);
  const meera = fixtureId('tutor-profile', 'meera');

  it("Meera Thomas's 9, 10 and 11 November are the three tables in the request, built from the fixture rows", async () => {
    const { db } = await loaded();
    const view = await calendarOf(db).calendar(meera, '2026-11-09', '2026-11-11', 'hr');
    expect(brief(view, '2026-11-09')).toEqual(['14-15 CLASS Science Synthetic Student A', '15-16 CLASS Science Synthetic Student B', '16-16.5 BREAK', '16.5-17.5 CLASS Biology Synthetic Student C', '17.5-18.5 FREE', '18.5-19.5 CLASS Science Synthetic Student D', '19.5-20 FREE']);
    expect(brief(view, '2026-11-10')).toEqual(['15-16 CLASS Biology Synthetic Student E', '16-17 FREE', '17-17.5 BREAK', '17.5-18.5 CLASS Science Synthetic Student F', '18.5-20 FREE']);
    expect(brief(view, '2026-11-11')).toEqual(['14-15 FREE', '15-16 CLASS Science Synthetic Student G', '16-16.5 BREAK', '16.5-17.5 FREE', '17.5-18.5 CLASS Biology Synthetic Student H', '18.5-19 FREE']);
  });

  it('shows the leave, the extra hours, the cancelled class and the public holiday on their dates', async () => {
    const { db } = await loaded();
    const service = calendarOf(db);
    const leave = await service.calendar(meera, '2026-11-12', '2026-11-12', 'hr');
    expect(leave.days[0].closed).toEqual({ kind: 'LEAVE', note: 'Approved leave' });
    expect(leave.days[0].affected.map((a: any) => a.subject)).toEqual(['Science']); // Student I, bi-weekly Thursday, is not deleted
    const saturday = await service.calendar(meera, '2026-11-14', '2026-11-14', 'hr');
    expect(brief(saturday, '2026-11-14')[0]).toBe('9-11 FREE'); // her normal Saturday plus 2 PM to 6 PM added
    expect(saturday.days[0].segments.some((s: any) => s.state === 'FREE' && s.start <= 14 * 60 && s.end >= 18 * 60)).toBe(true); // adjacent free time merges
    const cancelled = await service.calendar(meera, '2026-11-17', '2026-11-17', 'hr');
    expect(brief(cancelled, '2026-11-17').filter((s: string) => s.includes('CLASS'))).toEqual(['17.5-18.5 CLASS Science Synthetic Student F']); // Student E's class was cancelled, F's stays
    const holiday = await service.calendar(meera, '2026-11-25', '2026-11-25', 'hr');
    expect(holiday.days[0].closed?.kind).toBe('HOLIDAY');
  });

  it('shows the moved class on its new date and not on the old one, and the blocked time and day off', async () => {
    const { db } = await loaded();
    const service = calendarOf(db);
    const rahul = fixtureId('tutor-profile', 'rahul');
    expect(brief(await service.calendar(rahul, '2026-11-24', '2026-11-24', 'hr'), '2026-11-24').some((s: string) => s.includes('Mathematics'))).toBe(false);
    expect(brief(await service.calendar(rahul, '2026-11-26', '2026-11-26', 'hr'), '2026-11-26').some((s: string) => s.includes('19-20 CLASS Mathematics Synthetic Student 7'))).toBe(true);
    expect(brief(await service.calendar(rahul, '2026-11-17', '2026-11-17', 'hr'), '2026-11-17').some((s: string) => s === '15-17 BLOCKED')).toBe(true);
    const anjali = await service.calendar(fixtureId('tutor-profile', 'anjali'), '2026-11-20', '2026-11-20', 'hr');
    expect(anjali.days[0].closed?.kind).toBe('DAY_OFF');
  });

  it("a tutor with no hours shows 'availability not configured', not an empty day", async () => {
    const { db } = await loaded();
    const view = await calendarOf(db).calendar(fixtureId('tutor-profile', 'isha'), '2026-11-09', '2026-11-09', 'hr');
    expect(view.days[0].configured).toBe(false);
    expect(view.days[0].segments.map((s: any) => s.state)).toEqual(['NOT_CONFIGURED']);
  });

  it('is accepted by the real assignment engine: re-checking every tutor flags exactly the classes on a closed date, and nothing else', async () => {
    const { db, fixture } = await loaded();
    const history = new MentoringHistoryService({ recordInTx: jest.fn().mockResolvedValue(undefined) } as any);
    const tutors = new MentoringTutorService(db as any, history);
    for (const t of TUTORS) await tutors.revalidateForTutor(fixtureId('tutor-profile', t.key), 'system');

    // The independent answer: which bookings have a class on a leave day, a holiday or a day off in the eight weeks?
    const expected = new Set<string>();
    for (const t of TUTORS) {
      for (let d = WINDOW.start; d <= WINDOW.end; d = new Date(new Date(`${d}T00:00:00Z`).getTime() + 86_400_000).toISOString().slice(0, 10)) {
        for (const c of resolveDay(byKey(t.key), d).affected) expected.add(`${t.key}/${c.student}`);
      }
    }
    const flagged = fixture.bookings.filter((b) => db.rows('mentoringTutorAssignment').find((a) => a.id === b.assignmentId)!.status === 'NEEDS_REVIEW').map((b) => `${b.tutorKey}/${b.label}`);
    expect(expected.size).toBeGreaterThan(5);
    expect(flagged.sort()).toEqual([...expected].sort());
    // Nothing was deleted by the check.
    expect(db.rows('mentoringTutorAssignment').filter((a) => fixture.ids.activations.includes(a.activationId))).toHaveLength(51);
    expect(db.rows('mentoringTutorAssignmentSession').filter((s) => fixture.bookings.some((b) => b.assignmentId === s.assignmentId))).toHaveLength(51);
  });
});

describe('taking it out again', () => {
  it('a dry run counts what would go and removes nothing', async () => {
    const { db } = await loaded();
    const before = snapshot(db);
    const report = await removeFixture(db, { execute: false });
    expect(snapshot(db)).toBe(before);
    expect(report.before.find((r) => r.table === 'users')!.rows).toBe(12);
    expect(report.before.find((r) => r.table === 'mentoring_tutor_assignments')!.rows).toBe(51);
    expect(report.before.reduce((n, r) => n + r.rows, 0)).toBeGreaterThan(1000);
    expect(report.after).toEqual(report.before);
  });

  it('removes every fixture row, leaves every real row exactly as it was, and reports zero left', async () => {
    const db = staging();
    const before = snapshot(db);
    await loaded(db);
    const report = await removeFixture(db, { execute: true });
    expect(report.after.every((r) => r.rows === 0)).toBe(true);
    expect(report.before.reduce((n, r) => n + r.rows, 0)).toBeGreaterThan(1000);
    expect(snapshot(db)).toBe(before);
  });

  it('also removes what testing added beneath the synthetic students, but nothing beneath a real one', async () => {
    const db = staging();
    const before = snapshot(db);
    const { fixture } = await loaded(db);
    const activation = fixture.ids.activations[0];
    db.seed('mentoringEvent', { activationId: activation, type: 'MENTORING_STAGE_STARTED' });
    db.seed('mentoringTask', { id: 'task-1', activationId: activation });
    db.seed('mentoringTaskComment', { taskId: 'task-1' });
    db.seed('mentoringTutorAssignment', { id: 'extra', activationId: activation, subjectId: 'sub-MATH', tutorProfileId: fixtureId('tutor-profile', 'rahul'), status: 'ENDED', currentKey: null });
    db.seed('mentoringTutorAssignmentSession', { assignmentId: 'extra', tutorProfileId: fixtureId('tutor-profile', 'rahul'), dayOfWeek: 1, frequency: 'WEEKLY', occurrences: [], startMinute: 600, endMinute: 660 });
    await removeFixture(db, { execute: true });
    expect(snapshot(db)).toBe(before);
  });

  it('removes in one transaction-sized pass and a second run finds nothing', async () => {
    const { db } = await loaded();
    await removeFixture(db, { execute: true });
    const again = await removeFixture(db, { execute: true });
    expect(again.before.every((r) => r.rows === 0)).toBe(true);
  });

  it('stops, removing nothing, while a real student still has a booking with a synthetic tutor', async () => {
    const { db } = await loaded();
    db.seed('mentoringTutorAssignment', { id: 'as-real-2', activationId: 'act-real', subjectId: 'sub-SCIENCE', tutorProfileId: fixtureId('tutor-profile', 'meera'), status: 'ACTIVE', currentKey: 'x' });
    const before = snapshot(db);
    await expect(removeFixture(db, { execute: true })).rejects.toThrow(/Nothing was removed\. 1 booking\(s\) by real students[\s\S]*as-real-2/);
    expect(snapshot(db)).toBe(before);
    // An ended booking does not block it.
    db.rows('mentoringTutorAssignment').find((a) => a.id === 'as-real-2')!.status = 'ENDED';
    await expect(removeFixture(db, { execute: false })).resolves.toBeDefined();
  });

  it('lists, and never touches, a record that only looks synthetic', async () => {
    const { db } = await loaded();
    db.seed('user', { id: 'lookalike', email: 'someone.else@example.test', status: 'ACTIVE' });
    db.seed('student', { id: 'lookalike-student', businessId: 'SYNTH-STU-900', firstName: 'Lookalike' });
    const report = await removeFixture(db, { execute: true });
    expect(report.foreign).toEqual(['user lookalike', 'student SYNTH-STU-900']);
    expect(db.rows('user').some((u) => u.id === 'lookalike')).toBe(true);
    expect(db.rows('student').some((s) => s.id === 'lookalike-student')).toBe(true);
  });

  it('can leave the subjects it created in place', async () => {
    const { db } = await loaded();
    expect(db.rows('subject').filter((s) => String(s.code).startsWith('SYNTH_'))).toHaveLength(2);
    await removeFixture(db, { execute: true, keepSubjects: true });
    expect(db.rows('subject').filter((s) => String(s.code).startsWith('SYNTH_'))).toHaveLength(2);
    expect(db.rows('subject')).toHaveLength(10);
    await removeFixture(db, { execute: true });
    expect(db.rows('subject')).toHaveLength(8);
  });

  it('never removes a real subject that merely shares a name with one the fixture would create', async () => {
    const db = staging();
    db.seed('subject', { id: 'real-hindi', code: 'HINDI', name: 'Hindi', isActive: true });
    await loaded(db);
    await removeFixture(db, { execute: true });
    expect(db.rows('subject').some((s) => s.id === 'real-hindi')).toBe(true);
  });
});
