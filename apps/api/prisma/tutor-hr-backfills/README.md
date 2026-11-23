# Tutor HR data backfills (manual, reviewed scripts)

These scripts are **not migrations**. `prisma migrate deploy` never runs them. Run them by hand with
`psql`, after the Tutor HR migrations, only with the owner's approval for each COMMIT.

| File | What it does | Writes? |
|---|---|---|
| `tutor_hiring_backfill_dryrun.sql` | Shows how each legacy `current_stage` maps to the new stage / lead status / decision, plus phone-normalisation checks. | No. SELECTs only. |
| `tutor_hiring_backfill_lead_status.sql` | Sets `lead_status` to Rejected / Not Interested for legacy leads whose `current_stage` says so. (Migration 20261123100000 gives every existing lead `PROCESSING`.) | Yes, `UPDATE tutor_leads`. No history rows. |
| `tutor_training_backfill_enrolments.sql` | Creates the missing `tutor_training_enrolments` row for candidates whose decision is already `HIRED`. | Yes, `INSERT`. |

## When to run them on staging

1. After `prisma migrate deploy` has applied `20261123100000_tutor_hiring_phase_a` … `20261123140000_tutor_coordination_phase_e`
   and `prisma migrate status` reports the schema up to date.
2. Before testers use the Hiring and Training screens, because until then legacy Rejected / Not Interested
   leads show as Processing.
3. Order: dry run → lead-status backfill → training-enrolment backfill.

## How to run them

```bash
# Confirm the target first. The name must be the staging database.
psql -v ON_ERROR_STOP=1 -d elscore_os_staging -Atc "select current_database()"

# 1. Read-only dry run. Record the output.
psql -v ON_ERROR_STOP=1 -d elscore_os_staging -f tutor_hiring_backfill_dryrun.sql

# 2. Preview. COMMIT is commented out, so the transaction rolls back when psql exits.
psql -v ON_ERROR_STOP=1 -d elscore_os_staging -f tutor_hiring_backfill_lead_status.sql
psql -v ON_ERROR_STOP=1 -d elscore_os_staging -f tutor_training_backfill_enrolments.sql
```

The first SELECT in each backfill is the expected count; the `UPDATE n` / `INSERT 0 n` line must equal it.

**To commit (only after the owner approves the preview counts):** copy the file to `/var/tmp`, replace only
the final `-- COMMIT;` with `COMMIT;`, check with `tail -n 3`, then run the copy. Never edit the file in the
repository. Both backfills are safe to repeat: their WHERE clauses skip rows that are already done.

## Undoing

There is no undo script. The lead-status backfill records `Backfilled from legacy stage …` in
`lead_status_remarks`, and enrolments it creates have the Hired decision's `changed_by_user_id`. Use the
pre-deployment database backup if a backfill must be reversed.
