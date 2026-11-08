/**
 * The synthetic tutor timetable fixture: what it contains, how it is checked, how it is written and how it is removed.
 *
 * This file only DESCRIBES and DOES things when it is called by load.ts or rollback.ts, which refuse to run unless the
 * database is exactly the staging one and a confirmation variable is set. Nothing here connects to a database by itself.
 *
 * Safety rules the code enforces:
 *   - Every row has a deterministic id (a hash of its kind and natural key), so a second run finds what the first wrote
 *     and writes nothing, and the rollback knows exactly which rows are the fixture's.
 *   - Every person, student and lead carries a marker (the e-mail ends in @example.test; ids start EMP-SYNTH- or SYNTH-).
 *   - Nothing that already exists is updated or overwritten. A row that collides with a real one stops the run.
 *   - Reference data (department, roles, grades, curriculum) is only looked up, never created or changed. The only
 *     reference rows it may create are subjects that are missing, with a SYNTH_ code so the rollback can find them.
 *   - Writing happens in one transaction: all of it or none of it.
 */
import { createHash } from 'crypto';

import { STAGES } from '../../../mentoring/mentoring.constants';
import { sessionLabel } from '../../../mentoring/subject-schedule';

import { ANCHOR, HOLIDAYS, TUTORS } from './preview';

// ─── Markers and the guard ───────────────────────────────────────────────────────────────────────────────────────
export const STAGING_DATABASE = 'elscore_os_staging';
export const CONFIRM_VARIABLE = 'ALLOW_TUTOR_TIMETABLE_FIXTURE';
export const EMAIL_DOMAIN = '@example.test';
export const EMPLOYEE_PREFIX = 'EMP-SYNTH-';
export const LEAD_PREFIX = 'SYNTH-LED-';
export const STUDENT_PREFIX = 'SYNTH-STU-';
export const SUBJECT_CODE_PREFIX = 'SYNTH_';
export const NOTE = 'SYNTHETIC TEST DATA';
const PASSWORD_HASH = '!synthetic-test-data-cannot-sign-in';
const MENTOR_EMAIL = `synthetic.mentor${EMAIL_DOMAIN}`;
const SCHEDULE_FIELD = 'timetable.schedule';

/** Refuses anything but the staging database, named exactly, with the confirmation variable set to the same name. */
export function checkTarget(url: string | undefined, confirmation: string | undefined): { host: string; database: string } {
  if (!url) throw new Error('DATABASE_URL is not set.');
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error('DATABASE_URL is not a valid connection string.');
  }
  const database = decodeURIComponent(parsed.pathname.replace(/^\//, ''));
  const host = parsed.hostname.replace(/^\[|\]$/g, '');
  if (database !== STAGING_DATABASE) throw new Error(`Refusing to run: the database is "${database}" on "${host}", not exactly "${STAGING_DATABASE}".`);
  if (confirmation !== STAGING_DATABASE) throw new Error(`Set ${CONFIRM_VARIABLE}=${STAGING_DATABASE} to confirm this is the staging database.`);
  return { host, database };
}

// ─── Ids and small helpers ───────────────────────────────────────────────────────────────────────────────────────
/** The same kind and key always give the same id (a version 5 style UUID), so a second run finds the first run's rows. */
export function fixtureId(kind: string, key: string): string {
  const h = createHash('sha1').update(`elscore-tutor-timetable-fixture/v1/${kind}/${key}`).digest('hex');
  const variant = ((parseInt(h.slice(16, 18), 16) & 0x3f) | 0x80).toString(16).padStart(2, '0');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-${variant}${h.slice(18, 20)}-${h.slice(20, 32)}`;
}

const day = (iso: string) => new Date(`${iso}T00:00:00Z`);
const at = (hhmm: string) => new Date(`1970-01-01T${hhmm}:00Z`);
const minutes = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '.').replace(/^\.|\.$/g, '');
const norm = (s: string) => s.trim().toLowerCase();
const WEEKDAY_BY_NUMBER = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const;

export type Row = { id: string } & Record<string, unknown>;
/** The Prisma client or a transaction, as far as this script uses it. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Db = any;

// ─── What the fixture needs from the database ────────────────────────────────────────────────────────────────────
export interface References {
  departmentId: string;
  roleIds: { TUTOR: string; MENTOR: string };
  /** Subject name (lower case) to id, for the subjects that already exist. */
  subjectIds: Map<string, string>;
  /** Grade number to the grade row. */
  grades: Map<number, { id: string; name: string }>;
  curriculumId: string | null;
}

/** Every subject name the fixture uses, in the order the tutors list them. */
export function subjectNames(): string[] {
  const names: string[] = [];
  for (const t of TUTORS) for (const s of t.subjects) if (!names.some((n) => norm(n) === norm(s))) names.push(s);
  return names;
}

/** Every grade number the fixture uses (the tutors' level ranges and the students' levels). */
export function gradeNumbers(): number[] {
  const wanted = new Set<number>();
  for (const t of TUTORS) {
    for (let g = t.levels[0]; g <= t.levels[1]; g++) wanted.add(g);
    for (const b of t.bookings) wanted.add(b.level);
  }
  return [...wanted].sort((a, b) => a - b);
}

/** Looks up the reference data. Nothing is created here; a missing piece stops the run with a plain message. */
export async function resolveReferences(db: Db): Promise<References> {
  const problems: string[] = [];
  const department = (await db.department.findFirst({ where: { code: 'ACADEMICS' } })) ?? (await db.department.findFirst({ orderBy: { createdAt: 'asc' } }));
  if (!department) problems.push('There is no department to attach the synthetic employees to.');

  const roles: Record<string, string> = {};
  for (const r of (await db.role.findMany({ where: { code: { in: ['TUTOR', 'MENTOR'] } } })) as Array<{ id: string; code: string }>) roles[r.code] = r.id;
  for (const code of ['TUTOR', 'MENTOR']) if (!roles[code]) problems.push(`The ${code} role does not exist. The fixture does not create roles.`);

  const subjectIds = new Map<string, string>();
  for (const s of (await db.subject.findMany({})) as Array<{ id: string; name: string; isActive?: boolean }>) {
    const key = norm(s.name);
    if (!subjectIds.has(key) || s.isActive !== false) subjectIds.set(key, s.id);
  }

  const grades = new Map<number, { id: string; name: string }>();
  const allGrades = (await db.grade.findMany({})) as Array<{ id: string; name: string; code: string }>;
  const missingGrades: number[] = [];
  for (const n of gradeNumbers()) {
    const g = allGrades.find((x) => norm(x.name) === `grade ${n}` || x.code === `GRADE_${n}`);
    if (g) grades.set(n, { id: g.id, name: g.name });
    else missingGrades.push(n);
  }
  if (missingGrades.length) problems.push(`These grades do not exist: ${missingGrades.map((n) => `Grade ${n}`).join(', ')}. The fixture does not create grades.`);

  const curriculum = (await db.curriculum.findFirst({ where: { code: 'CBSE' } })) ?? (await db.curriculum.findFirst({ orderBy: { createdAt: 'asc' } }));
  if (problems.length) throw new Error(problems.join('\n'));
  return { departmentId: department.id, roleIds: { TUTOR: roles.TUTOR, MENTOR: roles.MENTOR }, subjectIds, grades, curriculumId: curriculum?.id ?? null };
}

// ─── The fixture ─────────────────────────────────────────────────────────────────────────────────────────────────
export interface Fixture {
  actorUserId: string;
  mentorUserId: string;
  /** One entry per table, in the order they must be written. The rollback walks the same list backwards. */
  tables: Array<{ name: string; model: string; rows: Row[] }>;
  /** Ids the rollback and the checks need. */
  ids: {
    users: string[]; employees: string[]; profiles: string[]; leads: string[]; students: string[]; handovers: string[]; activations: string[];
    syntheticSubjects: string[]; exceptions: string[];
  };
  /** The students, in booking order, for reports and tests. */
  bookings: Array<{ label: string; tutorKey: string; studentId: string; assignmentId: string; activationId: string }>;
}

export function buildFixture(refs: References): Fixture {
  const rows = (): Row[] => [];
  const T = {
    subjects: rows(), users: rows(), employees: rows(), userRoles: [] as Array<Record<string, unknown>>, staff: rows(), profiles: rows(), tutorSubjects: rows(), tutorGrades: rows(), slots: rows(),
    leaves: rows(), exceptions: rows(), leads: rows(), students: rows(), handovers: rows(), activations: rows(), stages: rows(), fields: rows(), mentorAssignments: rows(),
    assignments: rows(), sessions: rows(), overrides: rows(), events: rows(),
  };

  const mentorUserId = fixtureId('user', MENTOR_EMAIL);
  const actorUserId = mentorUserId;

  // Subjects: reuse a real one by name, create only the missing ones, with a code the rollback recognises.
  const subjectId = new Map<string, string>();
  const syntheticSubjects: string[] = [];
  for (const name of subjectNames()) {
    const existing = refs.subjectIds.get(norm(name));
    if (existing) {
      subjectId.set(norm(name), existing);
      continue;
    }
    const id = fixtureId('subject', norm(name));
    subjectId.set(norm(name), id);
    syntheticSubjects.push(id);
    T.subjects.push({ id, code: `${SUBJECT_CODE_PREFIX}${name.toUpperCase().replace(/[^A-Z0-9]+/g, '_')}`, name, isActive: true });
  }

  // People: the eleven tutors in the order of the preview, then the synthetic Mentor.
  const people = [...TUTORS.map((t) => ({ key: t.key, first: t.name.split(' ')[0], last: t.name.split(' ').slice(1).join(' '), email: `${slug(t.name)}${EMAIL_DOMAIN}`, title: `${NOTE}: fictional tutor` })), { key: 'mentor', first: 'Synthetic', last: 'Mentor', email: MENTOR_EMAIL, title: `${NOTE}: fictional Mentor` }];
  const userOf = new Map<string, string>();
  const employeeOf = new Map<string, string>();
  const profileOf = new Map<string, string>();
  people.forEach((p, i) => {
    const userId = fixtureId('user', p.email);
    const employeeId = fixtureId('employee', p.email);
    userOf.set(p.key, userId);
    employeeOf.set(p.key, employeeId);
    T.users.push({ id: userId, email: p.email, passwordHash: PASSWORD_HASH, status: 'PENDING_SETUP' });
    T.employees.push({ id: employeeId, businessId: `${EMPLOYEE_PREFIX}${String(i + 1).padStart(3, '0')}`, userId, departmentId: refs.departmentId, employmentStatus: 'ACTIVE', firstName: p.first, lastName: p.last, jobTitle: p.title });
    T.userRoles.push({ userId, roleId: p.key === 'mentor' ? refs.roleIds.MENTOR : refs.roleIds.TUTOR, grantedByUserId: null });
  });
  T.staff.push({ id: fixtureId('staff', MENTOR_EMAIL), userId: mentorUserId, role: 'MENTOR', capacity: 60, isActive: true, acceptsAllocation: false, notes: `${NOTE}. Does not take new allocations.` });

  // Tutors: profile, subjects, level range, weekly hours (a gap between two ranges on a day is the break).
  for (const t of TUTORS) {
    const profileId = fixtureId('tutor-profile', t.key);
    profileOf.set(t.key, profileId);
    T.profiles.push({ id: profileId, employeeId: employeeOf.get(t.key), tutorOperationalStatus: 'ACTIVE', bio: `${NOTE}: a fictional tutor for timetable testing.` });
    for (const s of t.subjects) T.tutorSubjects.push({ id: fixtureId('tutor-subject', `${t.key}/${norm(s)}`), tutorProfileId: profileId, subjectId: subjectId.get(norm(s)), addedByUserId: actorUserId });
    for (let g = t.levels[0]; g <= t.levels[1]; g++) T.tutorGrades.push({ id: fixtureId('tutor-grade', `${t.key}/${g}`), tutorProfileId: profileId, gradeId: refs.grades.get(g)?.id, addedByUserId: actorUserId });
    for (const [d, from, to] of t.weekly) T.slots.push({ id: fixtureId('slot', `${t.key}/${d}/${from}-${to}`), tutorProfileId: profileId, dayOfWeek: d, startTime: at(from), endTime: at(to), isActive: true, createdByUserId: actorUserId });
  }

  // Leave is a request, approved. Consecutive days of one tutor are one request.
  for (const t of TUTORS) {
    const dates = t.exceptions.filter((e) => e.kind === 'LEAVE').map((e) => e.date).sort();
    const runs: string[][] = [];
    for (const d of dates) {
      const run = runs[runs.length - 1];
      if (run && day(d).getTime() - day(run[run.length - 1]).getTime() === 86_400_000) run.push(d);
      else runs.push([d]);
    }
    for (const run of runs) {
      T.leaves.push({ id: fixtureId('leave', `${t.key}/${run[0]}`), employeeId: employeeOf.get(t.key), leaveType: 'CASUAL', startDate: run[0], endDate: run[run.length - 1], reason: `${NOTE}: approved leave`, status: 'APPROVED', reviewedByUserId: actorUserId, reviewNote: NOTE });
    }
  }

  // Dates that change the weekly pattern: one tutor's, and the two organisation holidays.
  const KIND = { DAY_OFF: 'DAY_OFF', EXTRA: 'EXTRA_HOURS', BLOCKED: 'BLOCKED' } as const;
  for (const t of TUTORS) {
    for (const e of t.exceptions) {
      if (e.kind === 'LEAVE') continue;
      T.exceptions.push({
        id: fixtureId('exception', `${t.key}/${e.date}/${e.kind}`), tutorProfileId: profileOf.get(t.key), date: day(e.date), kind: KIND[e.kind],
        startMinute: e.start ? minutes(e.start) : null, endMinute: e.end ? minutes(e.end) : null, note: e.note, createdByUserId: actorUserId,
      });
    }
  }
  for (const h of HOLIDAYS) T.exceptions.push({ id: fixtureId('exception', `holiday/${h.date}`), tutorProfileId: null, date: day(h.date), kind: 'HOLIDAY', startMinute: null, endMinute: null, note: h.note, createdByUserId: actorUserId });

  // Students and their bookings: each booking is a real Mentoring student with a saved schedule and a tutor assignment.
  const bookings: Fixture['bookings'] = [];
  let n = 0;
  const assignmentOf = new Map<string, { id: string; startMinute: number }>();
  for (const t of TUTORS) {
    for (const b of t.bookings) {
      n += 1;
      const seq = String(n).padStart(3, '0');
      const label = b.student.replace(/^Student /, '');
      const leadId = fixtureId('lead', seq);
      const studentId = fixtureId('student', seq);
      const handoverId = fixtureId('handover', seq);
      const activationId = fixtureId('activation', seq);
      const assignmentId = fixtureId('assignment', seq);
      const grade = refs.grades.get(b.level) as { id: string; name: string };
      const sId = subjectId.get(norm(b.subject)) as string;
      const frequency = b.rule.kind;
      const week = b.rule.kind === 'BIWEEKLY' ? b.rule.week : null;
      const occurrences = b.rule.kind === 'MONTHLY' ? [b.rule.nth] : [];
      const startMinute = minutes(b.start);
      const endMinute = minutes(b.end);
      const duration = endMinute - startMinute;

      T.leads.push({ id: leadId, businessId: `${LEAD_PREFIX}${seq}`, firstName: 'Synthetic', lastName: `Parent ${label}`, primaryPhone: `+1555010${seq}`, source: 'OTHER', creationChannel: 'SALES_HEAD', status: 'ENROLLED', createdByUserId: actorUserId });
      T.students.push({ id: studentId, businessId: `${STUDENT_PREFIX}${seq}`, leadId, firstName: 'Synthetic', lastName: `Student ${label}`, currentGrade: grade.name, gradeId: grade.id, curriculumId: refs.curriculumId, enrollmentState: 'ENROLLED', notes: NOTE });
      T.handovers.push({ id: handoverId, leadId, studentId, status: 'COMPLETED', sourceSnapshot: { synthetic: true, note: NOTE }, transferredFields: [], missingFields: [], triggeredByUserId: actorUserId, completedAt: day('2026-11-02') });
      T.activations.push({ id: activationId, leadId, studentId, handoverId, status: 'ACTIVATION_IN_PROGRESS', currentStage: 2, currentMentorUserId: mentorUserId });
      for (const def of STAGES) {
        const done = def.number === 1;
        const open = def.number === 2;
        T.stages.push({
          id: fixtureId('stage', `${seq}/${def.number}`), activationId, stageNumber: def.number, key: def.key, status: done ? 'COMPLETED' : open ? 'IN_PROGRESS' : 'NOT_STARTED',
          startedAt: done ? day('2026-11-02') : open ? day('2026-11-04') : null, completedAt: done ? day('2026-11-03') : null, verifiedByUserId: done ? mentorUserId : null,
        });
      }

      const session = { day: WEEKDAY_BY_NUMBER[b.day], durationMinutes: duration, start: b.start, end: b.end, ...(week ? { week } : {}), ...(occurrences.length ? { occurrences } : {}) };
      T.fields.push({
        id: fixtureId('field', `${seq}/${SCHEDULE_FIELD}`), handoverId, fieldKey: SCHEDULE_FIELD, origin: 'MENTOR_COLLECTED', updatedByUserId: mentorUserId, createdByUserId: mentorUserId,
        value: { version: 2, subjects: [{ subjectId: sId, subjectName: b.subject, gradeId: grade.id, gradeName: grade.name, frequency, totalMinutes: duration, distribution: 'EQUAL', sessions: [session], startDate: ANCHOR }] },
      });
      T.mentorAssignments.push({ id: fixtureId('mentor-assignment', seq), activationId, mentorUserId, assignedByUserId: actorUserId, type: 'MANUAL', reason: NOTE, currentKey: activationId });

      const profileId = profileOf.get(t.key) as string;
      const stored = [{ dayNumber: b.day, frequency, week, occurrences, startMinute, endMinute }];
      T.assignments.push({
        id: assignmentId, activationId, subjectId: sId, tutorProfileId: profileId, status: 'ACTIVE', currentKey: `${activationId}:${sId}`, assignedByUserId: mentorUserId,
        scheduleSnapshot: { subjectName: b.subject, gradeName: grade.name, core: { frequency, gradeId: grade.id, sessions: stored, startDate: ANCHOR }, labels: [sessionLabel(session, frequency)] },
        startDate: day(ANCHOR), endDate: null,
      });
      T.sessions.push({ id: fixtureId('session', seq), assignmentId, tutorProfileId: profileId, dayOfWeek: b.day, frequency, week, occurrences, startMinute, endMinute });
      T.events.push({
        id: fixtureId('event', `${seq}/assigned`), activationId, type: 'MENTORING_TUTOR_ASSIGNED', actorUserId: mentorUserId,
        payload: { subjectId: sId, subjectName: b.subject, tutorProfileId: profileId, tutorName: t.name, previousTutorProfileId: null, previousTutorName: null, sessions: [sessionLabel(session, frequency)], synthetic: true },
      });
      assignmentOf.set(`${t.key}/${b.student}`, { id: assignmentId, startMinute });
      bookings.push({ label: b.student, tutorKey: t.key, studentId, assignmentId, activationId });
    }
  }

  // One cancelled and one moved class, each on the assignment it belongs to.
  for (const t of TUTORS) {
    for (const o of t.overrides) {
      const target = assignmentOf.get(`${t.key}/${o.student}`);
      if (!target) throw new Error(`The override for ${o.student} names a booking that does not exist.`);
      T.overrides.push({
        id: fixtureId('override', `${t.key}/${o.student}/${o.date}`), assignmentId: target.id, date: day(o.date), originalStartMinute: target.startMinute, kind: o.kind,
        newDate: o.toDate ? day(o.toDate) : null, newStartMinute: o.toStart ? minutes(o.toStart) : null, newEndMinute: o.toEnd ? minutes(o.toEnd) : null, reason: o.note, createdByUserId: actorUserId,
      });
    }
  }

  const tables: Fixture['tables'] = [
    { name: 'subjects', model: 'subject', rows: T.subjects },
    { name: 'users', model: 'user', rows: T.users },
    { name: 'employees', model: 'employee', rows: T.employees },
    { name: 'user_roles', model: 'userRole', rows: T.userRoles as Row[] },
    { name: 'mentoring_staff_profiles', model: 'mentoringStaffProfile', rows: T.staff },
    { name: 'tutor_profiles', model: 'tutorProfile', rows: T.profiles },
    { name: 'tutor_subjects', model: 'tutorSubject', rows: T.tutorSubjects },
    { name: 'tutor_grades', model: 'tutorGrade', rows: T.tutorGrades },
    { name: 'tutor_availability_slots', model: 'tutorAvailabilitySlot', rows: T.slots },
    { name: 'employee_leave_requests', model: 'employeeLeaveRequest', rows: T.leaves },
    { name: 'tutor_availability_exceptions', model: 'tutorAvailabilityException', rows: T.exceptions },
    { name: 'leads', model: 'lead', rows: T.leads },
    { name: 'students', model: 'student', rows: T.students },
    { name: 'enrollment_handovers', model: 'enrollmentHandover', rows: T.handovers },
    { name: 'mentoring_activations', model: 'mentoringActivation', rows: T.activations },
    { name: 'mentoring_stages', model: 'mentoringStage', rows: T.stages },
    { name: 'enrollment_handover_fields', model: 'enrollmentHandoverField', rows: T.fields },
    { name: 'mentor_assignments', model: 'mentorAssignment', rows: T.mentorAssignments },
    { name: 'mentoring_tutor_assignments', model: 'mentoringTutorAssignment', rows: T.assignments },
    { name: 'mentoring_tutor_assignment_sessions', model: 'mentoringTutorAssignmentSession', rows: T.sessions },
    { name: 'mentoring_tutor_assignment_overrides', model: 'mentoringTutorAssignmentOverride', rows: T.overrides },
    { name: 'mentoring_events', model: 'mentoringEvent', rows: T.events },
  ];
  const ids = (rowsOf: Row[]) => rowsOf.map((r) => r.id);
  return {
    actorUserId,
    mentorUserId,
    tables,
    ids: {
      users: ids(T.users), employees: ids(T.employees), profiles: ids(T.profiles), leads: ids(T.leads), students: ids(T.students), handovers: ids(T.handovers),
      activations: ids(T.activations), syntheticSubjects, exceptions: ids(T.exceptions),
    },
    bookings,
  };
}

/**
 * The row counts in the approved proposal (docs/operations/TUTOR_TIMETABLE_SCHEMA_PROPOSAL.md, section 4). Subjects depend
 * on what staging already has (the proposal expected two missing ones), and events were only estimated at about 100.
 */
export const APPROVED_COUNTS: Record<string, number> = {
  users: 12, employees: 12, user_roles: 12, mentoring_staff_profiles: 1, tutor_profiles: 11, tutor_subjects: 20, tutor_grades: 64, tutor_availability_slots: 89,
  employee_leave_requests: 2, tutor_availability_exceptions: 5, leads: 51, students: 51, enrollment_handovers: 51, mentoring_activations: 51, mentoring_stages: 357,
  enrollment_handover_fields: 51, mentor_assignments: 51, mentoring_tutor_assignments: 51, mentoring_tutor_assignment_sessions: 51, mentoring_tutor_assignment_overrides: 2,
};

/** Planned row counts by table, for the report and for comparing with the approved proposal. */
export const countsOf = (fixture: Fixture): Record<string, number> => Object.fromEntries(fixture.tables.map((t) => [t.name, t.rows.length]));

/** The reference data the rollback does not look up: only the ids matter there, and ids do not depend on it. */
export function idsOnly(): Fixture {
  const subjectIds = new Map<string, string>();
  const grades = new Map<number, { id: string; name: string }>();
  for (const n of gradeNumbers()) grades.set(n, { id: `grade-${n}`, name: `Grade ${n}` });
  // Every subject is treated as missing so that the ids of the ones the fixture may have created are known.
  return buildFixture({ departmentId: 'department', roleIds: { TUTOR: 'role-tutor', MENTOR: 'role-mentor' }, subjectIds, grades, curriculumId: null });
}

// ─── Checks before anything is written ───────────────────────────────────────────────────────────────────────────
/** Real rows that would collide with a fixture row. Each is described without any personal detail. */
export async function findConflicts(db: Db, fixture: Fixture): Promise<string[]> {
  const out: string[] = [];
  const by = async (label: string, model: string, field: string, rows: Row[], column = field) => {
    const wanted = rows.map((r) => r[field] as string);
    if (!wanted.length) return;
    const own = new Set(rows.map((r) => r.id));
    const clash = ((await db[model].findMany({ where: { [column]: { in: wanted } } })) as Array<Record<string, unknown>>).filter((r) => !own.has(r.id as string));
    for (const r of clash) out.push(`${label} "${String(r[column])}" already exists and is not part of the fixture.`);
  };
  const table = (name: string) => fixture.tables.find((t) => t.name === name)?.rows ?? [];
  await by('The e-mail', 'user', 'email', table('users'));
  await by('The employee id', 'employee', 'businessId', table('employees'));
  await by('The lead id', 'lead', 'businessId', table('leads'));
  await by('The student id', 'student', 'businessId', table('students'));
  await by('The subject code', 'subject', 'code', table('subjects'));
  return out;
}

export interface TableReport { table: string; planned: number; present: number; created: number }

/**
 * Writes the fixture, or with execute = false only reports what would be written. Rows whose id is already there are
 * left exactly as they are. Call it inside one transaction.
 */
export async function applyFixture(db: Db, fixture: Fixture, execute: boolean): Promise<TableReport[]> {
  const conflicts = await findConflicts(db, fixture);
  if (conflicts.length) throw new Error(`Nothing was written. ${conflicts.length} row(s) collide with existing records:\n- ${conflicts.join('\n- ')}`);
  const report: TableReport[] = [];
  for (const t of fixture.tables) {
    let fresh: Row[];
    if (t.model === 'userRole') {
      const have = new Set(((await db.userRole.findMany({ where: { userId: { in: fixture.ids.users } } })) as Array<{ userId: string; roleId: string }>).map((r) => `${r.userId}/${r.roleId}`));
      fresh = t.rows.filter((r) => !have.has(`${String(r.userId)}/${String(r.roleId)}`));
    } else {
      const have = new Set(((await db[t.model].findMany({ where: { id: { in: t.rows.map((r) => r.id) } } })) as Array<{ id: string }>).map((r) => r.id));
      fresh = t.rows.filter((r) => !have.has(r.id));
    }
    if (execute && fresh.length) await db[t.model].createMany({ data: fresh });
    report.push({ table: t.name, planned: t.rows.length, present: t.rows.length - fresh.length, created: execute ? fresh.length : 0 });
  }
  return report;
}

// ─── Removing it again ───────────────────────────────────────────────────────────────────────────────────────────
export interface RemovalOptions { execute: boolean; keepSubjects?: boolean }
export interface RemovalReport {
  /** Rows found per table before anything was removed (children added by testing are included). */
  before: Array<{ table: string; rows: number }>;
  /** Rows per table after. Equal to zero for everything that was meant to go. */
  after: Array<{ table: string; rows: number }>;
  /** Rows that carry a fixture marker but are not the fixture's: left untouched. */
  foreign: string[];
}

type Counter = { table: string; model: string; where: Record<string, unknown> };

/** Reads the ids the rollback needs, including rows testing created beneath the fixture's students. */
async function scope(db: Db, fixture: Fixture) {
  const ids = fixture.ids;
  const list = async (model: string, where: Record<string, unknown>) => ((await db[model].findMany({ where })) as Array<{ id: string }>).map((r) => r.id);
  const assignmentIds = await list('mentoringTutorAssignment', { activationId: { in: ids.activations } });
  const stageIds = await list('mentoringStage', { activationId: { in: ids.activations } });
  const taskIds = await list('mentoringTask', { activationId: { in: ids.activations } });
  return { ...ids, assignmentIds, stageIds, taskIds };
}

function counters(s: Awaited<ReturnType<typeof scope>>, keepSubjects: boolean): Counter[] {
  const inn = (v: string[]) => ({ in: v });
  const list: Counter[] = [
    { table: 'mentoring_events', model: 'mentoringEvent', where: { activationId: inn(s.activations) } },
    { table: 'mentoring_task_comments', model: 'mentoringTaskComment', where: { taskId: inn(s.taskIds) } },
    { table: 'mentoring_tasks', model: 'mentoringTask', where: { activationId: inn(s.activations) } },
    { table: 'stage_checklist_responses', model: 'stageChecklistResponse', where: { stageId: inn(s.stageIds) } },
    { table: 'workflow_exceptions', model: 'workflowException', where: { stageId: inn(s.stageIds) } },
    { table: 'workflow_holds', model: 'workflowHold', where: { activationId: inn(s.activations) } },
    { table: 'final_approvals', model: 'finalApproval', where: { activationId: inn(s.activations) } },
    { table: 'mentoring_tutor_assignment_overrides', model: 'mentoringTutorAssignmentOverride', where: { assignmentId: inn(s.assignmentIds) } },
    { table: 'mentoring_tutor_assignment_sessions', model: 'mentoringTutorAssignmentSession', where: { assignmentId: inn(s.assignmentIds) } },
    { table: 'mentoring_tutor_assignments', model: 'mentoringTutorAssignment', where: { activationId: inn(s.activations) } },
    { table: 'mentor_assignments', model: 'mentorAssignment', where: { activationId: inn(s.activations) } },
    { table: 'enrollment_handover_field_verifications', model: 'enrollmentHandoverFieldVerification', where: { handoverId: inn(s.handovers) } },
    { table: 'enrollment_handover_fields', model: 'enrollmentHandoverField', where: { handoverId: inn(s.handovers) } },
    { table: 'mentoring_stages', model: 'mentoringStage', where: { activationId: inn(s.activations) } },
    { table: 'mentoring_activations', model: 'mentoringActivation', where: { id: inn(s.activations) } },
    { table: 'enrollment_handovers', model: 'enrollmentHandover', where: { id: inn(s.handovers) } },
    { table: 'students', model: 'student', where: { id: inn(s.students) } },
    { table: 'leads', model: 'lead', where: { id: inn(s.leads) } },
    { table: 'tutor_availability_exceptions', model: 'tutorAvailabilityException', where: { OR: [{ id: inn(s.exceptions) }, { tutorProfileId: inn(s.profiles) }] } },
    { table: 'employee_leave_requests', model: 'employeeLeaveRequest', where: { employeeId: inn(s.employees) } },
    { table: 'tutor_availability_slots', model: 'tutorAvailabilitySlot', where: { tutorProfileId: inn(s.profiles) } },
    { table: 'tutor_grades', model: 'tutorGrade', where: { tutorProfileId: inn(s.profiles) } },
    { table: 'tutor_subjects', model: 'tutorSubject', where: { tutorProfileId: inn(s.profiles) } },
    { table: 'tutor_profiles', model: 'tutorProfile', where: { id: inn(s.profiles) } },
    { table: 'mentoring_staff_profiles', model: 'mentoringStaffProfile', where: { userId: inn(s.users) } },
    { table: 'user_roles', model: 'userRole', where: { userId: inn(s.users) } },
    { table: 'employees', model: 'employee', where: { id: inn(s.employees) } },
    { table: 'users', model: 'user', where: { id: inn(s.users) } },
  ];
  if (!keepSubjects) list.push({ table: 'subjects', model: 'subject', where: { id: inn(s.syntheticSubjects) } });
  return list;
}

/** Marker rows that are not the fixture's own, found by the markers alone. They are reported and never touched. */
async function findForeign(db: Db, fixture: Fixture): Promise<string[]> {
  const ids = fixture.ids;
  const out: string[] = [];
  const check = async (label: string, model: string, where: Record<string, unknown>, own: string[], show: string) => {
    for (const r of (await db[model].findMany({ where })) as Array<Record<string, unknown>>) if (!own.includes(r.id as string)) out.push(`${label} ${String(r[show])}`);
  };
  await check('user', 'user', { email: { endsWith: EMAIL_DOMAIN } }, ids.users, 'id');
  await check('employee', 'employee', { businessId: { startsWith: EMPLOYEE_PREFIX } }, ids.employees, 'businessId');
  await check('lead', 'lead', { businessId: { startsWith: LEAD_PREFIX } }, ids.leads, 'businessId');
  await check('student', 'student', { businessId: { startsWith: STUDENT_PREFIX } }, ids.students, 'businessId');
  await check('subject', 'subject', { code: { startsWith: SUBJECT_CODE_PREFIX } }, ids.syntheticSubjects, 'code');
  return out;
}

/** Bookings by real students that point at a synthetic tutor. Removing the tutor would leave them dangling, so it stops. */
async function findOutsideBookings(db: Db, fixture: Fixture): Promise<string[]> {
  const rows = (await db.mentoringTutorAssignment.findMany({ where: { tutorProfileId: { in: fixture.ids.profiles }, activationId: { notIn: fixture.ids.activations }, status: { in: ['ACTIVE', 'NEEDS_REVIEW'] } } })) as Array<{ id: string }>;
  return rows.map((r) => `assignment ${r.id}`);
}

const countAll = async (db: Db, list: Counter[]) => {
  const out: Array<{ table: string; rows: number }> = [];
  for (const c of list) out.push({ table: c.table, rows: (await db[c.model].count({ where: c.where })) as number });
  return out;
};

/**
 * Removes only what the fixture made, plus rows testing added beneath its students. With execute = false it only counts.
 * Call it inside one transaction so a failure part-way leaves everything as it was.
 */
export async function removeFixture(db: Db, options: RemovalOptions): Promise<RemovalReport> {
  const fixture = idsOnly();
  const outside = await findOutsideBookings(db, fixture);
  if (outside.length) {
    throw new Error(`Nothing was removed. ${outside.length} booking(s) by real students still use a synthetic tutor (${outside.join(', ')}). End those tutor assignments in the app first.`);
  }
  const s = await scope(db, fixture);
  const list = counters(s, options.keepSubjects === true);
  const before = await countAll(db, list);
  const foreign = await findForeign(db, fixture);
  if (options.execute) {
    for (const c of list) await db[c.model].deleteMany({ where: c.where });
  }
  const after = await countAll(db, list);
  return { before, after, foreign };
}
