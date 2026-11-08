/**
 * DEVELOPMENT ONLY. Creates a handful of FICTIONAL tutors so tutor selection can be tried on a local database.
 *
 *   - It refuses to run unless DATABASE_URL points at this machine (localhost, 127.0.0.1 or ::1) and the database name
 *     does not look like staging or production.
 *   - It does nothing unless ALLOW_DEV_TUTOR_FIXTURES=yes is set AND --execute is passed. Without --execute it only
 *     prints what it would create.
 *   - Every record it creates is marked as test data: the e-mail ends in @dev-fixture.invalid (it cannot receive mail),
 *     the employee id starts with EMP-DEVTEST-, the job title says TEST DATA, and the password hash is not a real hash,
 *     so nobody can sign in as these users.
 *   - It never touches existing tutors, and running it twice changes nothing the second time.
 *
 * Never run it against staging or production. Run it only where seeding has been approved:
 *
 *   ALLOW_DEV_TUTOR_FIXTURES=yes DATABASE_URL=postgresql://...localhost... \
 *     npx ts-node --require tsconfig-paths/register scripts/dev-tutor-fixtures.ts --execute
 *
 * What the tutors are for (the five cases tutor selection must handle):
 *   Rahul   Mathematics   works every day a typical Mon/Wed/Fri 4 PM to 6 PM schedule needs: FULLY AVAILABLE.
 *   Anjali  English       works Monday to Thursday but not Saturday: PARTIAL. Book her for another student to see OCCUPIED.
 *   Arun    Physics       works Tuesday and Saturday only: fits a Week 1 Tuesday plus Week 2 Saturday schedule.
 *   Meera   Science       has set no working hours at all: AVAILABILITY NOT CONFIGURED until her profile is updated.
 *   Neha    English and Social Studies   works only Monday and Thursday mornings: NOT WORKING on most days.
 */
import { PrismaClient } from '@prisma/client';

type Hours = Array<[number, string, string]>; // [day 0 = Sunday ... 6, 'HH:MM', 'HH:MM']

const TUTORS: Array<{ key: string; first: string; last: string; subjects: string[]; hours: Hours }> = [
  { key: 'rahul', first: 'Rahul', last: 'Menon (test)', subjects: ['MATH'], hours: [[1, '14:00', '19:00'], [3, '14:00', '19:00'], [5, '14:00', '19:00']] },
  { key: 'anjali', first: 'Anjali', last: 'Nair (test)', subjects: ['ENGLISH'], hours: [[1, '14:00', '18:00'], [2, '14:00', '18:00'], [3, '14:00', '18:00'], [4, '14:00', '18:00']] },
  { key: 'arun', first: 'Arun', last: 'Das (test)', subjects: ['PHYSICS'], hours: [[2, '15:00', '19:00'], [6, '09:00', '13:00']] },
  { key: 'meera', first: 'Meera', last: 'Iyer (test)', subjects: ['SCIENCE'], hours: [] },
  { key: 'neha', first: 'Neha', last: 'Rao (test)', subjects: ['ENGLISH', 'SOCIAL_STUDIES'], hours: [[1, '09:00', '12:00'], [4, '09:00', '12:00']] },
];
const SUBJECT_NAMES: Record<string, string> = { MATH: 'Mathematics', ENGLISH: 'English', PHYSICS: 'Physics', SCIENCE: 'Science', SOCIAL_STUDIES: 'Social Studies' };
const GRADES: Array<[string, string, number]> = [['GRADE_8', 'Grade 8', 8], ['GRADE_9', 'Grade 9', 9], ['GRADE_10', 'Grade 10', 10]];

function assertLocal(url: string | undefined): void {
  if (!url) throw new Error('DATABASE_URL is not set.');
  const parsed = new URL(url);
  const host = parsed.hostname.replace(/^\[|\]$/g, '');
  if (!['localhost', '127.0.0.1', '::1'].includes(host)) throw new Error(`Refusing to run: the database host is "${host}", not this machine.`);
  const database = parsed.pathname.replace(/^\//, '');
  if (/(prod|staging|live)/i.test(database)) throw new Error(`Refusing to run: the database name "${database}" looks like staging or production.`);
  if (process.env.NODE_ENV === 'production') throw new Error('Refusing to run with NODE_ENV=production.');
  if (process.env.ALLOW_DEV_TUTOR_FIXTURES !== 'yes') throw new Error('Set ALLOW_DEV_TUTOR_FIXTURES=yes to confirm this is a local development database.');
}

const at = (hhmm: string) => new Date(`1970-01-01T${hhmm}:00Z`);

async function main() {
  const execute = process.argv.includes('--execute');
  assertLocal(process.env.DATABASE_URL);
  console.log(execute ? 'Creating fictional test tutors on the local database.' : 'Dry run: nothing will be written. Pass --execute to create the records.');
  for (const t of TUTORS) console.log(`  ${t.first} ${t.last}: ${t.subjects.map((s) => SUBJECT_NAMES[s]).join(', ')}; ${t.hours.length ? `${t.hours.length} working range(s)` : 'no working hours'}`);
  if (!execute) return;

  const prisma = new PrismaClient();
  try {
    const department = await prisma.department.findFirst({ orderBy: { createdAt: 'asc' } });
    if (!department) throw new Error('There is no department yet. Seed the base data first, then run this again.');
    const actor = await prisma.user.findFirst({ orderBy: { createdAt: 'asc' } });
    if (!actor) throw new Error('There is no user yet. Seed the base data first, then run this again.');

    const subjects = new Map<string, string>();
    for (const [code, name] of Object.entries(SUBJECT_NAMES)) {
      const row = await prisma.subject.upsert({ where: { code }, update: {}, create: { code, name } });
      subjects.set(code, row.id);
    }
    const grades: string[] = [];
    for (const [code, name, sortOrder] of GRADES) grades.push((await prisma.grade.upsert({ where: { code }, update: {}, create: { code, name, sortOrder } })).id);

    for (const [index, t] of TUTORS.entries()) {
      const email = `dev-tutor-${t.key}@dev-fixture.invalid`;
      if (await prisma.user.findUnique({ where: { email } })) {
        console.log(`  ${t.first}: already there, left as it is.`);
        continue;
      }
      await prisma.$transaction(async (tx) => {
        const user = await tx.user.create({ data: { email, passwordHash: '!dev-test-data-cannot-sign-in', status: 'PENDING_SETUP' } });
        const employee = await tx.employee.create({
          data: { businessId: `EMP-DEVTEST-${index + 1}`, userId: user.id, departmentId: department.id, employmentStatus: 'ACTIVE', firstName: t.first, lastName: t.last, jobTitle: 'TEST DATA: fictional tutor' },
        });
        const profile = await tx.tutorProfile.create({ data: { employeeId: employee.id, tutorOperationalStatus: 'ACTIVE', bio: 'TEST DATA: fictional tutor for development.' } });
        for (const s of t.subjects) await tx.tutorSubject.create({ data: { tutorProfileId: profile.id, subjectId: subjects.get(s) as string, addedByUserId: actor.id } });
        for (const g of grades) await tx.tutorGrade.create({ data: { tutorProfileId: profile.id, gradeId: g, addedByUserId: actor.id } });
        for (const [day, start, end] of t.hours) {
          await tx.tutorAvailabilitySlot.create({ data: { tutorProfileId: profile.id, dayOfWeek: day, startTime: at(start), endTime: at(end), createdByUserId: actor.id } });
        }
      });
      console.log(`  ${t.first}: created.`);
    }
    console.log('Done. These records are test data only.');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
