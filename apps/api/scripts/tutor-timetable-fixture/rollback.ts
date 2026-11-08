/**
 * Removes the synthetic tutor timetable fixture and nothing else. NOT RUN YET.
 *
 *   - Same guard as load.ts: DATABASE_URL must name exactly "elscore_os_staging" and ALLOW_TUTOR_TIMETABLE_FIXTURE must be
 *     set to "elscore_os_staging".
 *   - DRY RUN by default: the database is opened in a READ ONLY transaction and the script prints how many rows it would
 *     remove from each table. Pass --execute to remove them.
 *   - It removes rows by the fixed ids the loader gave them, never by a name or a pattern alone, plus rows that testing
 *     added beneath the synthetic students (events, tasks, extra assignments). A row that merely looks synthetic (an
 *     @example.test e-mail, an EMP-SYNTH- or SYNTH- id) but is not the fixture's is listed and left alone.
 *   - It stops without removing anything if a real student's booking still points at a synthetic tutor.
 *   - Everything is removed in ONE transaction, so a failure leaves the database as it was.
 *   - --keep-subjects leaves the subjects the loader had to create (Hindi, Social Studies and similar) in place.
 *   - Audit records are an append-only log and are never removed.
 *
 *   Dry run:
 *     ALLOW_TUTOR_TIMETABLE_FIXTURE=elscore_os_staging npx ts-node --transpile-only --require tsconfig-paths/register scripts/tutor-timetable-fixture/rollback.ts
 *   Remove (only after approval):
 *     ALLOW_TUTOR_TIMETABLE_FIXTURE=elscore_os_staging npx ts-node --transpile-only --require tsconfig-paths/register scripts/tutor-timetable-fixture/rollback.ts --execute
 */
import { PrismaClient } from '@prisma/client';

import { CONFIRM_VARIABLE, checkTarget, removeFixture } from '../../src/modules/tutor/testing/timetable-fixture/fixture';

const pad = (s: string | number, n: number, right = false) => (right ? String(s).padStart(n) : String(s).padEnd(n));

async function main() {
  const execute = process.argv.includes('--execute');
  const keepSubjects = process.argv.includes('--keep-subjects');
  const target = checkTarget(process.env.DATABASE_URL, process.env[CONFIRM_VARIABLE]);
  console.log(`Target: database "${target.database}" on "${target.host}".`);
  console.log(execute ? 'EXECUTE: the fixture rows are removed in one transaction.' : 'DRY RUN: the database is opened read-only. Nothing is removed. Pass --execute to remove.');

  const prisma = new PrismaClient();
  try {
    const report = await prisma.$transaction(
      async (tx) => {
        if (!execute) await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');
        return removeFixture(tx, { execute, keepSubjects });
      },
      { timeout: 300_000, maxWait: 30_000 },
    );
    console.log(`\n${pad('Table', 42)}${pad('Before', 9, true)}${pad('After', 9, true)}`);
    report.before.forEach((b, i) => console.log(`${pad(b.table, 42)}${pad(b.rows, 9, true)}${pad(report.after[i].rows, 9, true)}`));
    console.log(`${pad('Total', 42)}${pad(report.before.reduce((n, r) => n + r.rows, 0), 9, true)}${pad(report.after.reduce((n, r) => n + r.rows, 0), 9, true)}`);
    if (report.foreign.length) console.log(`\nLooks synthetic but is not the fixture's, left untouched (${report.foreign.length}): ${report.foreign.join(', ')}`);
    console.log(execute ? '\nDone. Only fixture rows were removed.' : '\nDry run finished. Nothing was removed.');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
