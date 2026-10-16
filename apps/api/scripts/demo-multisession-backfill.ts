import { PrismaClient } from '@prisma/client';
import { DemoBackfillService } from '../src/modules/demo/backfill/demo-backfill.service';

async function main() {
  const args = process.argv.slice(2);
  const isExecute = args.includes('--execute');
  const dryRun = !isExecute || args.includes('--dry-run');

  const batchSizeArg = args.find((a) => a.startsWith('--batch-size='));
  const batchSize = batchSizeArg ? parseInt(batchSizeArg.split('=')[1], 10) : 50;

  console.log('=============================================================================');
  console.log('EL SCORE OS — DEMO MODULE MULTI-SESSION BACKFILL');
  console.log(`Mode: ${dryRun ? 'DRY-RUN (Read-Only Planning)' : 'EXECUTE (Live Transactional Write)'}`);
  console.log(`Batch Size: ${batchSize}`);
  console.log('=============================================================================\n');

  const prisma = new PrismaClient();
  try {
    const service = new DemoBackfillService(prisma as any);
    const report = await service.runBackfill({ dryRun, batchSize });

    console.log('-----------------------------------------------------------------------------');
    console.log(`Backfill Status: ${report.status}`);
    console.log(`Duration:        ${report.durationMs}ms`);
    console.log('-----------------------------------------------------------------------------');
    console.log(`Total Legacy Demos:           ${report.totalLegacyDemos}`);
    console.log(`Eligible for Migration:       ${report.eligibleDemos}`);
    console.log(`Already Backfilled (Skipped): ${report.alreadyBackfilled}`);
    console.log(`Newly Migrated Bookings:      ${report.newlyBackfilled}`);
    console.log(`Tutor Assignments Created:    ${report.tutorAssignmentsCreated}`);
    console.log(`Feedback Records Migrated:    ${report.feedbackRecordsMigrated}`);
    console.log(`Reschedule History Migrated:  ${report.rescheduleHistoriesMigrated}`);
    console.log('-----------------------------------------------------------------------------');

    if (report.orphans.length > 0) {
      console.warn(`\n[WARNING] ${report.orphans.length} Orphaned Legacy Demo(s) Detected (Excluded from migration):`);
      for (const orphan of report.orphans) {
        console.warn(`  - Demo ID: ${orphan.demoId} (${orphan.businessId}) -> Reason: ${orphan.reason} [Reference: ${orphan.missingReferenceId}]`);
      }
    }

    if (report.conflicts.length > 0) {
      console.error(`\n[ERROR] ${report.conflicts.length} Conflict(s) Detected Between Legacy Demo and Existing Booking:`);
      for (const conflict of report.conflicts) {
        console.error(`  - Demo ID: ${conflict.demoId} (${conflict.businessId}) vs Booking: ${conflict.existingBookingId}`);
        for (const m of conflict.mismatches) {
          console.error(`      Field [${m.field}]: legacy=${JSON.stringify(m.legacyValue)} != booking=${JSON.stringify(m.existingBookingValue)}`);
        }
      }
      console.error('\nBackfill execution was HALTED to prevent silent data corruption.');
      process.exit(1);
    }

    if (report.errors.length > 0) {
      console.error(`\n[ERROR] ${report.errors.length} Execution Error(s):`);
      for (const err of report.errors) {
        console.error(`  - ${err.demoId ? `[${err.demoId}] ` : ''}${err.error}`);
      }
      process.exit(1);
    }

    if (dryRun) {
      console.log('\n[INFO] Dry-run completed successfully. No changes were committed to the database.');
      console.log('To execute live migration, pass flag: --execute');
    } else {
      console.log('\n[SUCCESS] Backfill completed and reconciled successfully.');
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error('Fatal unhandled error during backfill execution:', err);
  process.exit(1);
});
