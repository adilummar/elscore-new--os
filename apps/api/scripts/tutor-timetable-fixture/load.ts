/**
 * Loads the synthetic tutor timetable fixture. NOT RUN YET: it waits for the owner's approval of the fixture.
 *
 *   - It refuses unless DATABASE_URL names exactly "elscore_os_staging" AND ALLOW_TUTOR_TIMETABLE_FIXTURE is set to
 *     "elscore_os_staging". Production, ARCH OS and every other database fail the first check.
 *   - By default it is a DRY RUN: the database is opened in a READ ONLY transaction, so nothing can be written, and it
 *     prints what exists and what would be created. Pass --execute to write.
 *   - With --execute everything is written in ONE transaction: all of it or none of it.
 *   - It is idempotent. Every row has a fixed id, so a second run finds the first run's rows and creates nothing.
 *   - It never updates or deletes anything. A real record that collides with a fixture row stops the run.
 *
 *   Dry run:
 *     ALLOW_TUTOR_TIMETABLE_FIXTURE=elscore_os_staging npx ts-node --transpile-only --require tsconfig-paths/register scripts/tutor-timetable-fixture/load.ts
 *   Write (only after approval):
 *     ALLOW_TUTOR_TIMETABLE_FIXTURE=elscore_os_staging npx ts-node --transpile-only --require tsconfig-paths/register scripts/tutor-timetable-fixture/load.ts --execute
 *
 * Remove it again with rollback.ts, which removes only these rows.
 */
import { PrismaClient } from '@prisma/client';

import { APPROVED_COUNTS, CONFIRM_VARIABLE, TableReport, applyFixture, buildFixture, checkTarget, resolveReferences } from '../../src/modules/tutor/testing/timetable-fixture/fixture';

const pad = (s: string | number, n: number, right = false) => (right ? String(s).padStart(n) : String(s).padEnd(n));

function print(report: TableReport[], execute: boolean) {
  console.log(`\n${pad('Table', 40)}${pad('Planned', 9, true)}${pad('Already there', 15, true)}${pad(execute ? 'Created' : 'Would create', 14, true)}`);
  for (const r of report) {
    const toCreate = execute ? r.created : r.planned - r.present;
    console.log(`${pad(r.table, 40)}${pad(r.planned, 9, true)}${pad(r.present, 15, true)}${pad(toCreate, 14, true)}`);
  }
  const total = report.reduce((n, r) => n + (execute ? r.created : r.planned - r.present), 0);
  console.log(`${pad('Total', 40)}${pad(report.reduce((n, r) => n + r.planned, 0), 9, true)}${pad(report.reduce((n, r) => n + r.present, 0), 15, true)}${pad(total, 14, true)}`);
  const differs = report.filter((r) => r.table in APPROVED_COUNTS && APPROVED_COUNTS[r.table] !== r.planned);
  if (differs.length) console.log(`\nDiffers from the approved counts: ${differs.map((r) => `${r.table} planned ${r.planned}, approved ${APPROVED_COUNTS[r.table]}`).join('; ')}`);
}

async function main() {
  const execute = process.argv.includes('--execute');
  const target = checkTarget(process.env.DATABASE_URL, process.env[CONFIRM_VARIABLE]);
  console.log(`Target: database "${target.database}" on "${target.host}".`);
  console.log(execute ? 'EXECUTE: the fixture is written in one transaction.' : 'DRY RUN: the database is opened read-only. Nothing is written. Pass --execute to write.');

  const prisma = new PrismaClient();
  try {
    const out = await prisma.$transaction(
      async (tx) => {
        if (!execute) await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');
        const refs = await resolveReferences(tx);
        const fixture = buildFixture(refs);
        const report = await applyFixture(tx, fixture, execute);
        return { report, fixture };
      },
      { timeout: 300_000, maxWait: 30_000 },
    );
    print(out.report, execute);
    const newSubjects = out.fixture.tables.find((t) => t.name === 'subjects')?.rows ?? [];
    console.log(`\nSubjects that do not exist yet and would be created: ${newSubjects.length ? newSubjects.map((r) => String(r.name)).join(', ') : 'none'}.`);
    console.log('Two public holidays apply to every tutor, including tutors that were not created by this fixture. The rollback removes them.');
    console.log(execute ? '\nDone. These records are synthetic test data. Remove them with rollback.ts.' : '\nDry run finished. Nothing was written.');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
