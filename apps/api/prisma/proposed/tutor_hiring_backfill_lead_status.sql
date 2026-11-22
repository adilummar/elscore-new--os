-- PROPOSED, NOT APPLIED. Run only after tutor_hiring_phase_a.sql, and only after the counts from
-- tutor_hiring_backfill_dryrun.sql (query 1, column proposed_lead_status) have been reviewed and approved.
--
-- Phase A adds tutor_leads.lead_status with DEFAULT 'PROCESSING', so every existing lead starts as
-- Processing. This sets Rejected / Not Interested for leads whose legacy stage says so.
-- No status-history rows are written: there is no real actor for a backfill, and the remarks
-- column records where the value came from. Wrapped in a transaction; check the row count first.

BEGIN;

-- Expected to equal the REJECTED + NOT_INTERESTED counts from the dry run.
SELECT current_stage, COUNT(*) FROM tutor_leads
WHERE deleted_at IS NULL AND current_stage IN ('REJECTED', 'NOT_INTERESTED') AND lead_status = 'PROCESSING'
GROUP BY current_stage;

UPDATE tutor_leads
SET lead_status = current_stage::text::"TutorLeadStatus",
    lead_status_remarks = 'Backfilled from legacy stage ' || current_stage::text
WHERE deleted_at IS NULL
  AND current_stage IN ('REJECTED', 'NOT_INTERESTED')
  AND lead_status = 'PROCESSING';

-- COMMIT only if the UPDATE count matches the SELECT above; otherwise ROLLBACK.
-- COMMIT;
