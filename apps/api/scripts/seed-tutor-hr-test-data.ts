/**
 * Tutor HR test data — LOCAL TEST DATABASE ONLY.
 *
 * Creates test staff accounts and a full Tutor HR sample flow (hiring → training →
 * Ready for Assignment → tutor profile → coordination) through the application's own
 * services, so business rules, history tables and audit rows are exercised.
 *
 * Safe to re-run: every step checks the current state and only does what is missing.
 * Refuses to run unless DATABASE_URL points at exactly 127.0.0.1:5433/elscore_tutor_test (the literal
 * loopback address; `localhost` is refused because on this machine it can reach the native Postgres)
 * and the server is the Docker (Linux) Postgres. The Tutor HR queue worker is disabled for the run.
 *
 * Passwords are never printed. They are kept in CREDENTIALS_FILE (outside the repo) and
 * reused on later runs; an account whose password is missing from that file gets a new one.
 *
 * Run from apps/api (bash):
 *   DATABASE_URL='postgresql://elscore:secret@127.0.0.1:5433/elscore_tutor_test?schema=public' \
 *     node_modules/.bin/ts-node --require tsconfig-paths/register scripts/seed-tutor-hr-test-data.ts
 */
import { randomInt } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

import { INestApplicationContext, Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { UserStatus } from '@prisma/client';
import * as argon2 from 'argon2';

import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/common/prisma/prisma.service';
import { HiringCandidateService } from '../src/modules/tutor-hr/hiring/hiring-candidate.service';
import { HiringDemoService } from '../src/modules/tutor-hr/hiring/hiring-demo.service';
import { HiringEvaluationService } from '../src/modules/tutor-hr/hiring/hiring-evaluation.service';
import { HiringScheduleService } from '../src/modules/tutor-hr/hiring/hiring-schedule.service';
import { TrainingService } from '../src/modules/tutor-hr/training/training.service';
import { TutorProfileService } from '../src/modules/tutor-hr/tutors/tutor-profile.service';
import { TutorTransferService } from '../src/modules/tutor-hr/tutors/tutor-transfer.service';
import { CoordinationService } from '../src/modules/tutor-hr/coordination/coordination.service';
import { TutorHrSettingsService } from '../src/modules/tutor-hr/tutor-hr-settings.service';
import { UserService } from '../src/modules/user/user.service';

const EXPECTED = { host: '127.0.0.1', port: '5433', db: 'elscore_tutor_test' };
const CREDENTIALS_FILE = process.env.TUTOR_HR_TEST_CREDENTIALS_FILE ?? 'E:\\elscore-test-credentials\\tutor-hr-test-accounts.txt';
const TEST_MARK = 'TEST ACCOUNT';
const SOURCE_NAME = 'Test Source (fictional)';
const SLAB_NAME = 'Test Slab A (fictional)';
const ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL ?? 'admin@elscore.internal';

// ── Safety guard ────────────────────────────────────────────────────────────

function assertTestDatabaseUrl(): void {
  const raw = process.env.DATABASE_URL;
  if (!raw) throw new Error('DATABASE_URL is not set. Pass the test database URL explicitly; .env is never used by this script.');
  const u = new URL(raw);
  const db = u.pathname.replace(/^\//, '');
  if (u.hostname !== EXPECTED.host || u.port !== EXPECTED.port || db !== EXPECTED.db) {
    throw new Error(`Refusing to run: DATABASE_URL must point at ${EXPECTED.host}:${EXPECTED.port}/${EXPECTED.db} (got ${u.hostname}:${u.port}/${db}).`);
  }
}

async function assertDockerServer(prisma: PrismaService): Promise<void> {
  const [r] = await prisma.$queryRawUnsafe<Array<{ v: string; db: string }>>('select version() as v, current_database() as db');
  if (r.db !== EXPECTED.db || !/linux/i.test(r.v)) {
    throw new Error(`Refusing to run: connected to "${r.db}" on "${r.v}", expected ${EXPECTED.db} on the Docker (Linux) Postgres.`);
  }
  console.log(`Connected to ${r.db} — ${r.v.split(',')[0]}`);
}

// ── Credentials file (never printed) ────────────────────────────────────────

type Cred = { email: string; password: string; role: string; name: string; note: string };

function readCreds(): Map<string, Cred> {
  const m = new Map<string, Cred>();
  if (!fs.existsSync(CREDENTIALS_FILE)) return m;
  for (const line of fs.readFileSync(CREDENTIALS_FILE, 'utf8').split(/\r?\n/)) {
    if (!line.trim() || line.startsWith('#')) continue;
    const [email, password, role, name, note] = line.split('\t');
    if (email && password) m.set(email.toLowerCase(), { email, password, role: role ?? '', name: name ?? '', note: note ?? '' });
  }
  return m;
}

function writeCreds(m: Map<string, Cred>): void {
  fs.mkdirSync(path.dirname(CREDENTIALS_FILE), { recursive: true });
  const header = [
    '# Tutor HR TEST accounts — local test database elscore_tutor_test (Docker, 127.0.0.1:5433) only.',
    '# Fictional people. Do not commit, share, or reuse these passwords anywhere.',
    '# Columns (tab-separated): email, password, role, name, note',
  ];
  const rows = [...m.values()].map((c) => [c.email, c.password, c.role, c.name, c.note].join('\t'));
  fs.writeFileSync(CREDENTIALS_FILE, [...header, ...rows, ''].join('\n'), { encoding: 'utf8', mode: 0o600 });
}

function strongPassword(len = 24): string {
  const sets = ['ABCDEFGHJKLMNPQRSTUVWXYZ', 'abcdefghijkmnopqrstuvwxyz', '23456789', '!@#$%^&*-_=+?'];
  const all = sets.join('');
  const chars = sets.map((s) => s[randomInt(s.length)]);
  while (chars.length < len) chars.push(all[randomInt(all.length)]);
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join('');
}

const ARGON2: argon2.Options = { type: argon2.argon2id, memoryCost: 65536, timeCost: 3, parallelism: 4 };

// ── Fixture definitions ─────────────────────────────────────────────────────

const STAFF = [
  { key: 'tutorHead', email: 'tutor.head@example.test', first: 'Test', last: 'TutorHead', role: 'TUTOR_HEAD', dept: 'ACADEMICS', label: 'Tutor HR Head' },
  { key: 'hrHead', email: 'hr.head@example.test', first: 'Test', last: 'HRHead', role: 'HR_MANAGER', dept: 'HR', label: 'HR Head' },
  { key: 'hrStaff', email: 'hr.staff@example.test', first: 'Test', last: 'HRStaff', role: 'HR_EXECUTIVE', dept: 'HR', label: 'HR Staff' },
  { key: 'coord1', email: 'coordinator.one@example.test', first: 'Test', last: 'CoordinatorOne', role: 'TUTOR_COORDINATOR', dept: 'ACADEMICS', label: 'Tutor Coordinator 1' },
  { key: 'coord2', email: 'coordinator.two@example.test', first: 'Test', last: 'CoordinatorTwo', role: 'TUTOR_COORDINATOR', dept: 'ACADEMICS', label: 'Tutor Coordinator 2' },
] as const;
type StaffKey = (typeof STAFF)[number]['key'];

type Target =
  | 'LEAD' | 'LEAD_CALLED' | 'DETAILS_SHARED' | 'CV' | 'DEMO_BOOKED' | 'ACCEPTED' | 'REJECTED' | 'NOT_INTERESTED'
  | 'S1_PASSED' | 'S1_REPEAT' | 'S2_PASSED' | 'TUTOR';

interface CandidateSpec {
  code: string; // NATO name, also used in the email
  phone: string; // national number, +91
  target: Target;
  tutor?: { status: 'ACTIVE' | 'SUSPENDED'; coordinator: 'coord1' | 'coord2'; details: boolean; note?: string };
}

const CANDIDATES: CandidateSpec[] = [
  { code: 'Alpha', phone: '9000000001', target: 'LEAD' },
  { code: 'Bravo', phone: '9000000002', target: 'LEAD_CALLED' },
  { code: 'Charlie', phone: '9000000003', target: 'DETAILS_SHARED' },
  { code: 'Delta', phone: '9000000004', target: 'CV' },
  { code: 'Echo', phone: '9000000005', target: 'DEMO_BOOKED' },
  { code: 'Foxtrot', phone: '9000000006', target: 'ACCEPTED' },
  { code: 'Golf', phone: '9000000007', target: 'REJECTED' },
  { code: 'Hotel', phone: '9000000008', target: 'NOT_INTERESTED' },
  { code: 'India', phone: '9000000009', target: 'S1_PASSED' },
  { code: 'Juliett', phone: '9000000010', target: 'S1_REPEAT' },
  { code: 'Kilo', phone: '9000000011', target: 'S2_PASSED' },
  {
    code: 'Lima', phone: '9000000012', target: 'TUTOR',
    tutor: { status: 'ACTIVE', coordinator: 'coord1', details: true, note: 'Test note: strong in Grade 10 Mathematics; prefers evening slots. (fictional)' },
  },
  {
    code: 'Mike', phone: '9000000013', target: 'TUTOR',
    tutor: { status: 'SUSPENDED', coordinator: 'coord2', details: true, note: 'Test note: suspended pending review of two missed classes. (fictional)' },
  },
  { code: 'November', phone: '9000000014', target: 'TUTOR', tutor: { status: 'ACTIVE', coordinator: 'coord1', details: false } },
  { code: 'Oscar', phone: '9000000015', target: 'TUTOR', tutor: { status: 'ACTIVE', coordinator: 'coord2', details: false } },
];

const STAGE_ORDER = ['LEAD', 'DETAILS_SHARED', 'CV', 'LIVE_DEMO_INTERVIEW'] as const;
const needsStage = (t: Target): (typeof STAGE_ORDER)[number] => {
  if (t === 'LEAD' || t === 'LEAD_CALLED') return 'LEAD';
  if (t === 'DETAILS_SHARED' || t === 'NOT_INTERESTED') return 'DETAILS_SHARED';
  if (t === 'CV') return 'CV';
  return 'LIVE_DEMO_INTERVIEW';
};
const isTrainingTarget = (t: Target) => t === 'S1_PASSED' || t === 'S1_REPEAT' || t === 'S2_PASSED' || t === 'TUTOR';
const minutesAgo = (m: number) => new Date(Date.now() - m * 60_000).toISOString();

// ── Main ────────────────────────────────────────────────────────────────────

async function main() {
  assertTestDatabaseUrl();
  // No background worker or Redis schedule for a one-off data run (read by config at DI time).
  process.env.TUTOR_HR_QUEUE_ENABLED = 'false';
  const app: INestApplicationContext = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] });
  const created: string[] = [];
  const skipped: string[] = [];
  try {
    const prisma = app.get(PrismaService);
    await assertDockerServer(prisma);

    const users = app.get(UserService);
    const candidates = app.get(HiringCandidateService);
    const demos = app.get(HiringDemoService);
    const evaluations = app.get(HiringEvaluationService);
    const schedules = app.get(HiringScheduleService);
    const training = app.get(TrainingService);
    const transfer = app.get(TutorTransferService);
    const profiles = app.get(TutorProfileService);
    const coordination = app.get(CoordinationService);
    const settings = app.get(TutorHrSettingsService);
    const creds = readCreds();

    // ── 1. CEO admin (from the base seed) ──────────────────────────────────
    const admin = await prisma.user.findUnique({ where: { email: ADMIN_EMAIL }, include: { userRoles: { include: { role: true } } } });
    if (!admin || !admin.userRoles.some((r) => r.role.code === 'CEO')) {
      throw new Error(`CEO admin ${ADMIN_EMAIL} not found. Run the base seed (prisma db seed) against the test database first.`);
    }
    if (!creds.has(ADMIN_EMAIL.toLowerCase())) {
      // The base seed's default admin password is weak; replace it on the test database only. [direct Prisma write]
      const password = strongPassword();
      await prisma.user.update({ where: { id: admin.id }, data: { passwordHash: await argon2.hash(password, ARGON2), mustChangePassword: false } });
      creds.set(ADMIN_EMAIL.toLowerCase(), { email: ADMIN_EMAIL, password, role: 'CEO', name: 'System Admin', note: 'Seed CEO admin; use for God View' });
      writeCreds(creds);
      created.push(`CEO admin password replaced with a strong random one (${ADMIN_EMAIL})`);
    } else skipped.push(`CEO admin ${ADMIN_EMAIL} (password already in credentials file)`);

    // ── 2. Staff test accounts (UserService.create) ────────────────────────
    const staffId = {} as Record<StaffKey, string>;
    for (const s of STAFF) {
      const role = await prisma.role.findUniqueOrThrow({ where: { code: s.role } });
      const dept = await prisma.department.findUniqueOrThrow({ where: { code: s.dept } });
      let u = await prisma.user.findUnique({ where: { email: s.email } });
      let cred = creds.get(s.email);
      if (!u) {
        const password = strongPassword();
        const res = await users.create({ email: s.email, password, firstName: s.first, lastName: s.last, roleId: role.id, departmentId: dept.id } as never, admin.id);
        u = await prisma.user.findUniqueOrThrow({ where: { id: res.id! } });
        cred = { email: s.email, password, role: s.role, name: `${s.first} ${s.last}`, note: `${s.label} test account` };
        creds.set(s.email, cred);
        writeCreds(creds);
        created.push(`User ${s.email} (${s.role}) with employee record`);
      } else if (!cred) {
        const password = strongPassword(); // file lost: issue a new password [direct Prisma write]
        await prisma.user.update({ where: { id: u.id }, data: { passwordHash: await argon2.hash(password, ARGON2) } });
        creds.set(s.email, { email: s.email, password, role: s.role, name: `${s.first} ${s.last}`, note: `${s.label} test account (password reissued)` });
        writeCreds(creds);
        created.push(`Password reissued for ${s.email} (was missing from credentials file)`);
      } else skipped.push(`User ${s.email}`);
      if (u.status !== UserStatus.ACTIVE) {
        await users.updateStatus(u.id, { status: UserStatus.ACTIVE, reason: 'Test account activated by test-data script' } as never, admin.id);
      }
      // Usable passwords without a forced first-login change, and visibly marked as test. [direct Prisma writes]
      if (u.mustChangePassword) await prisma.user.update({ where: { id: u.id }, data: { mustChangePassword: false } });
      // NULL-safe: a plain NOT would skip rows whose job title is still NULL.
      await prisma.employee.updateMany({ where: { userId: u.id, OR: [{ jobTitle: null }, { jobTitle: { not: TEST_MARK } }] }, data: { jobTitle: TEST_MARK } });
      staffId[s.key] = u.id;
    }
    const head = staffId.tutorHead;
    const hrStaff = staffId.hrStaff;
    const hrHead = staffId.hrHead;

    // ── 3. Master data needed by the flow ──────────────────────────────────
    let source = (await candidates.listSources(true)).find((x) => x.name === SOURCE_NAME);
    if (!source) {
      source = await candidates.createSource(SOURCE_NAME, head);
      created.push(`Lead source "${SOURCE_NAME}"`);
    }
    let slab = (await settings.getSalarySlabs()).find((x) => x.name === SLAB_NAME);
    if (!slab) {
      slab = await settings.createSalarySlab({ name: SLAB_NAME, hourlyRate: 40, currency: 'AED', isActive: true });
      created.push(`Pay slab "${SLAB_NAME}" (40 AED/h)`);
    }
    if (!(await schedules.getEffective())) {
      await schedules.set({ startTime: '09:00', endTime: '18:00', workingDays: [1, 2, 3, 4, 5, 6], timezone: 'Asia/Kolkata', effectiveFrom: minutesAgo(24 * 60) } as never, head);
      created.push('Hiring working schedule (Mon–Sat 09:00–18:00 IST) for the evaluation SLA');
    }
    const [subject] = await prisma.subject.findMany({ orderBy: { name: 'asc' }, take: 1 });
    const [grade] = await prisma.grade.findMany({ orderBy: { sortOrder: 'asc' }, skip: 9, take: 1 });
    const [curriculum] = await prisma.curriculum.findMany({ orderBy: { name: 'asc' }, take: 1 });

    // ── 4. Candidates through hiring ───────────────────────────────────────
    const leadIds = new Map<string, string>();
    for (const c of CANDIDATES) {
      const name = `Test ${c.code}`;
      const email = `${c.code.toLowerCase()}.candidate@example.test`;
      let lead = await prisma.tutorLead.findFirst({ where: { phoneNormalized: { endsWith: c.phone }, deletedAt: null } });
      if (!lead) {
        const r = await candidates.register({ phone: c.phone, countryCode: '+91', sourceId: source.id, leadDate: minutesAgo(3 * 24 * 60), name, notes: 'Fictional test candidate' } as never, hrStaff);
        lead = await prisma.tutorLead.findUniqueOrThrow({ where: { id: r.id } });
        created.push(`Candidate ${r.candidateId} ${name} (${c.target})`);
      }
      leadIds.set(c.code, lead.id);
      const id = lead.id;
      const reload = () => prisma.tutorLead.findUniqueOrThrow({ where: { id } });

      if (c.target === 'LEAD_CALLED' && !(await prisma.tutorLeadCall.count({ where: { tutorLeadId: id } }))) {
        await candidates.logCall(id, { status: 'BUSY_CALL_LATER', calledAt: minutesAgo(90), remarks: 'Asked to call back tomorrow (test)', followUpAt: new Date(Date.now() + 22 * 3600_000).toISOString() } as never, hrStaff);
        created.push(`  ${name}: call logged with follow-up`);
      }

      // Details first, so later stages and Ready for Assignment have what they need.
      if (stageIdx(lead.hiringStage) < 1 && needsStage(c.target) !== 'LEAD') {
        await candidates.updateDetails(id, {
          email, onlineTeachingExperience: 2, offlineTeachingExperience: 1, expectedHourlyRate: 35,
          subjectIds: [subject.id], gradeIds: [grade.id], curriculumIds: [curriculum.id],
          availability: [{ dayOfWeek: 1, startTime: '17:00', endTime: '20:00' }, { dayOfWeek: 3, startTime: '17:00', endTime: '20:00' }],
          remarks: 'Fictional candidate for testing',
        } as never, hrStaff);
        await candidates.advanceStage(id, { to: 'DETAILS_SHARED', remarks: 'Details shared (test)' } as never, hrStaff);
        lead = await reload();
      }
      if (stageIdx(lead.hiringStage) === 1 && stageIdx(needsStage(c.target)) >= 2) {
        if (!lead.detailsRespondedAt) await candidates.updateDetails(id, { detailsRespondedAt: minutesAgo(120) } as never, hrStaff);
        await candidates.advanceStage(id, { to: 'CV', remarks: 'Candidate responded (test)' } as never, hrStaff);
        lead = await reload();
      }
      if (stageIdx(lead.hiringStage) === 2) {
        if (!lead.cvReceivedAt) await candidates.setCvReceived(id, { cvReceivedAt: minutesAgo(60) } as never, hrStaff);
        if (stageIdx(needsStage(c.target)) >= 3) {
          await candidates.advanceStage(id, { to: 'LIVE_DEMO_INTERVIEW', remarks: 'CV received (test)' } as never, hrStaff);
        }
        lead = await reload();
      }

      if (c.target === 'NOT_INTERESTED' && lead.leadStatus === 'PROCESSING') {
        await candidates.setLeadStatus(id, { status: 'NOT_INTERESTED', remarks: 'Took a full-time job elsewhere (test)' } as never, hrStaff);
        created.push(`  ${name}: lead status Not Interested`);
      }

      if (c.target === 'DEMO_BOOKED' && !(await prisma.tutorDemoBooking.count({ where: { tutorLeadId: id } }))) {
        const tomorrow = new Date(Date.now() + 26 * 3600_000).toISOString();
        await demos.book(id, { scheduledAt: tomorrow, assignedToUserId: hrHead } as never, hrStaff);
        created.push(`  ${name}: demo booked for tomorrow, conductor HR Head`);
      }

      const needsAttendedDemo = c.target === 'ACCEPTED' || c.target === 'REJECTED' || isTrainingTarget(c.target);
      if (needsAttendedDemo) {
        let booking = await prisma.tutorDemoBooking.findFirst({ where: { tutorLeadId: id }, orderBy: { bookedAt: 'desc' }, include: { evaluation: true } });
        if (!booking) {
          // Booked just now so attendance can be recorded immediately (the service rejects past bookings).
          const r = await demos.book(id, { scheduledAt: minutesAgo(2), assignedToUserId: hrHead } as never, hrStaff);
          booking = await prisma.tutorDemoBooking.findUniqueOrThrow({ where: { id: r.booking.id }, include: { evaluation: true } });
        }
        if (booking.status === 'BOOKED') {
          await demos.recordAttendance(booking.id, { status: 'ATTENDED', completedAt: new Date().toISOString() } as never, hrHead);
          booking = await prisma.tutorDemoBooking.findUniqueOrThrow({ where: { id: booking.id }, include: { evaluation: true } });
        }
        if (c.target !== 'REJECTED' && !booking.evaluation) {
          await evaluations.submit(booking.id, {
            teachingMethods: 'Clear explanations with worked examples (test)', technicalSkills: 'Comfortable with whiteboard and screen sharing (test)',
            englishRating: 4, salarySlabId: slab.id, remarks: 'Fictional evaluation',
          } as never, hrHead);
        }
        lead = await reload();
        if (c.target === 'REJECTED' && !lead.decision) {
          await candidates.changeDecision(id, { decision: 'REJECTED', remarks: 'Subject knowledge below requirement in demo (test)' } as never, hrHead);
          created.push(`  ${name}: demo attended, decision Rejected`);
        }
        if (c.target !== 'REJECTED' && !lead.decision) {
          await candidates.changeDecision(id, { decision: 'ACCEPTED', remarks: 'Good demo (test)' } as never, hrHead);
          lead = await reload();
          created.push(`  ${name}: demo attended, evaluated, Accepted`);
        }
        if (isTrainingTarget(c.target) && lead.decision === 'ACCEPTED') {
          await candidates.changeDecision(id, { decision: 'HIRED', remarks: 'Offer accepted (test)' } as never, hrHead);
          created.push(`  ${name}: Hired → Training (enrolment created by the service)`);
        }
      }
    }

    // ── 5. Training ────────────────────────────────────────────────────────
    const coordinatorForS1 = staffId.coord1;
    const trainees = CANDIDATES.filter((c) => isTrainingTarget(c.target));
    const enrolmentOf = (leadId: string) => prisma.tutorTrainingEnrolment.findUniqueOrThrow({ where: { tutorLeadId: leadId }, include: { attempts: true } });

    await runSession(1, coordinatorForS1, trainees.filter(() => true), async (c, e) => {
      if (e.session1PassedAt) return null;
      if (e.attempts.some((a) => a.sessionNumber === 1 && a.attendance !== null)) return null; // e.g. the repeat case, already recorded
      return c.target === 'S1_REPEAT'
        ? { attendance: 'ATTENDED_NOT_COMPLETED', taskCompleted: false, remarks: 'Attended but did not finish the lesson-plan task (test)' }
        : { attendance: 'ATTENDED', taskCompleted: true, remarks: 'Task completed (test)' };
    });
    await runSession(2, hrStaff, trainees.filter((c) => c.target === 'S2_PASSED' || c.target === 'TUTOR'), async (_c, e) => {
      if (e.session2PassedAt || !e.session1PassedAt) return null;
      return { attendance: 'ATTENDED', taskCompleted: true, remarks: 'Task completed (test)' };
    });

    async function runSession(
      n: 1 | 2, conductor: string, list: CandidateSpec[],
      result: (c: CandidateSpec, e: Awaited<ReturnType<typeof enrolmentOf>>) => Promise<{ attendance: string; taskCompleted: boolean; remarks: string } | null>,
    ) {
      const todo: Array<{ c: CandidateSpec; leadId: string; r: { attendance: string; taskCompleted: boolean; remarks: string }; attemptId?: string }> = [];
      for (const c of list) {
        const leadId = leadIds.get(c.code)!;
        const e = await enrolmentOf(leadId);
        const r = await result(c, e);
        if (!r) continue;
        const pending = e.attempts.find((a) => a.sessionNumber === n && a.attendance === null);
        todo.push({ c, leadId, r, attemptId: pending?.id });
      }
      if (!todo.length) { skipped.push(`Training Session ${n} (nothing left to record)`); return; }
      const toAdd = todo.filter((t) => !t.attemptId);
      if (toAdd.length) {
        const s = await training.createSession({ sessionNumber: n, scheduledAt: new Date().toISOString(), conductorUserId: conductor } as never, head);
        await training.addParticipants(s.id, { tutorLeadIds: toAdd.map((t) => t.leadId) } as never, hrStaff);
        for (const t of toAdd) {
          const a = await prisma.tutorTrainingAttempt.findFirstOrThrow({ where: { sessionId: s.id, enrolment: { tutorLeadId: t.leadId } } });
          t.attemptId = a.id;
        }
        created.push(`Training Session ${n} conducted by ${n === 1 ? 'Coordinator One' : 'HR Staff'}, ${toAdd.length} trainee(s)`);
      }
      for (const t of todo) {
        const attempt = await prisma.tutorTrainingAttempt.findUniqueOrThrow({ where: { id: t.attemptId! }, include: { session: true } });
        await training.recordAttempt(t.attemptId!, t.r as never, attempt.session.conductorUserId);
        created.push(`  Test ${t.c.code}: Session ${n} ${t.r.attendance}${t.r.taskCompleted ? ' + task completed' : ''}`);
      }
    }

    // ── 6. Ready for Assignment → tutors, profiles, statuses, notes ───────
    const tutorProfileIds = new Map<string, string>();
    for (const c of CANDIDATES.filter((x) => x.target === 'TUTOR')) {
      const leadId = leadIds.get(c.code)!;
      let lead = await prisma.tutorLead.findUniqueOrThrow({ where: { id: leadId } });
      if (!lead.convertedTutorProfileId) {
        const r = await transfer.readyForAssignment(leadId, hrHead);
        creds.set(r.loginEmail, { email: r.loginEmail, password: r.temporaryPassword, role: 'TUTOR', name: `Test ${c.code}`, note: `Tutor ${r.tutorId}; temporary password, must change on first login` });
        writeCreds(creds);
        created.push(`Tutor ${r.tutorId} Test ${c.code} (Ready for Assignment; login ${r.loginEmail})`);
        lead = await prisma.tutorLead.findUniqueOrThrow({ where: { id: leadId } });
      }
      const pid = lead.convertedTutorProfileId!;
      tutorProfileIds.set(c.code, pid);
      const t = c.tutor!;

      if (t.details && !(await prisma.tutorPersonalDetails.findUnique({ where: { tutorProfileId: pid } }))) {
        const n = c.phone.slice(-2);
        await profiles.updateProfile(pid, {
          gender: 'PREFER_NOT_TO_SAY', maritalStatus: 'PREFER_NOT_TO_SAY',
          permanentAddress: { house: `Test House ${n}`, village: 'Testville', district: 'Sample District', pin: '600001', state: 'Test State', country: 'India' },
          currentSameAsPermanent: true,
          bank: { accountHolder: `Test ${c.code}`, bank: 'Example Test Bank', branch: 'Test Branch', accountNumber: `00000000${n}`, ifsc: 'TEST0000001' },
          primaryContact: { name: `Test ${c.code} Guardian`, phone: `90000001${n}`, countryCode: '+91', relationship: 'Parent' },
        } as never, hrHead);
        await profiles.addQualification(pid, { name: 'B.Sc. Mathematics (test)', institution: 'Example Test University', yearOfCompletion: 2019 } as never, hrHead);
        created.push(`  Test ${c.code}: personal details, emergency contact, bank details, qualification`);
      }
      if (t.note && !(await prisma.tutorHrNote.count({ where: { tutorProfileId: pid } }))) {
        await profiles.addNote(pid, { body: t.note } as never, hrHead);
        created.push(`  Test ${c.code}: HR internal note`);
      }
      let p = await prisma.tutorProfile.findUniqueOrThrow({ where: { id: pid } });
      if (p.tutorOperationalStatus === 'INACTIVE') {
        await profiles.changeStatus(pid, { status: 'ACTIVE', reason: 'Conducted first class (test)' } as never, hrHead);
        p = await prisma.tutorProfile.findUniqueOrThrow({ where: { id: pid } });
      }
      if (t.status === 'SUSPENDED' && p.tutorOperationalStatus === 'ACTIVE') {
        await profiles.changeStatus(pid, { status: 'SUSPENDED', reason: 'Missed two scheduled classes without notice (test)' } as never, hrHead);
      }
      p = await prisma.tutorProfile.findUniqueOrThrow({ where: { id: pid } });
      if (p.tutorOperationalStatus !== t.status) throw new Error(`Test ${c.code}: expected status ${t.status}, found ${p.tutorOperationalStatus}`);
    }

    // ── 7. Coordination: 2 tutors per coordinator, observations ───────────
    for (const ck of ['coord1', 'coord2'] as const) {
      const mine = CANDIDATES.filter((c) => c.tutor?.coordinator === ck).map((c) => tutorProfileIds.get(c.code)!);
      const unassigned = await prisma.tutorProfile.findMany({ where: { id: { in: mine }, OR: [{ coordinatorUserId: null }, { coordinatorUserId: { not: staffId[ck] } }] }, select: { id: true } });
      if (unassigned.length) {
        await coordination.assign({ tutorProfileIds: unassigned.map((x) => x.id), coordinatorUserId: staffId[ck], reason: 'Initial test assignment' } as never, head);
        created.push(`Assigned ${unassigned.length} tutor(s) to ${ck === 'coord1' ? 'Coordinator One' : 'Coordinator Two'}`);
      }
    }
    const observations: Array<{ code: string; by: 'coord1' | 'coord2'; daysAgo: number; pos?: string; neg?: string }> = [
      { code: 'Lima', by: 'coord1', daysAgo: 2, pos: 'Engaging start; checked understanding often (test)', neg: 'Ran 5 minutes over time (test)' },
      { code: 'November', by: 'coord1', daysAgo: 1, pos: 'Well-prepared worksheet (test)' },
      { code: 'Mike', by: 'coord2', daysAgo: 6, neg: 'Joined late and camera was off (test)' },
      { code: 'Oscar', by: 'coord2', daysAgo: 3, pos: 'Patient with a struggling student (test)', neg: 'Audio echo during the class (test)' },
    ];
    for (const o of observations) {
      const pid = tutorProfileIds.get(o.code)!;
      const exists = await prisma.tutorObservation.count({ where: { tutorProfileId: pid, authorUserId: staffId[o.by] } });
      if (exists) continue;
      await coordination.createObservation(pid, { observedAt: minutesAgo(o.daysAgo * 24 * 60), positiveFeedback: o.pos, negativeFeedback: o.neg } as never, staffId[o.by]);
      created.push(`Observation of Test ${o.code} by ${o.by === 'coord1' ? 'Coordinator One' : 'Coordinator Two'}`);
    }

    // ── Summary ────────────────────────────────────────────────────────────
    console.log('\nCreated or changed this run:');
    for (const l of created) console.log(`  + ${l}`);
    if (!created.length) console.log('  (nothing — everything already existed)');
    console.log(`\nAlready present, skipped: ${skipped.length} item(s)`);
    console.log(`Credentials file: ${CREDENTIALS_FILE} (passwords are not printed)`);
  } finally {
    await app.close();
  }
}

function stageIdx(s: string | null): number {
  return STAGE_ORDER.indexOf((s ?? 'LEAD') as never) >= 0 ? STAGE_ORDER.indexOf((s ?? 'LEAD') as never) : (s === 'TRAINING' ? 4 : 0);
}

main().then(
  () => process.exit(0),
  (e) => {
    Logger.error(e instanceof Error ? e.message : String(e), 'TutorHrTestData');
    if (e?.response) console.error(JSON.stringify(e.response));
    process.exit(1);
  },
);
