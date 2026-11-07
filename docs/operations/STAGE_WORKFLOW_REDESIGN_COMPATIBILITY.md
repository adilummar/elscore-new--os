# Stage 1 and Stage 2 redesign: data compatibility and migration review

**Status: for owner review. Nothing here has been executed, pushed or deployed.**
No database connection was made. Every statement about stored data comes from the code and from tests that run the
real services over an in-memory database (`mentoring-stage-workflow-compatibility.spec.ts`, 18 tests, and
`mentoring-handover-edit.spec.ts`).

This document replaces `STAGE1_CHECKLIST_MIGRATION_COMPATIBILITY.md` and its backfill script. That review covered
the move from 8 Stage 1 rows to 26 item rows. The redesign makes that move unnecessary, so the script, its reference
implementation and its 44 tests were removed from this branch (they remain in the history at `45ce6f7` and `4b6d8e4`).

## 1. Summary

1. **One additive SQL migration**, `20261107100000_add_mentoring_field_verification`. It adds one nullable column and
   one table. It reads, rewrites and deletes nothing.
2. **No backfill is needed.** Stage 1 keeps the one checklist key that both earlier definitions already used
   (`missing_info_identified`), so a student's existing Stage 1 result carries over by itself.
3. **Old Stage 1 rows are kept, not ignored.** The 7 original requirements (definition version 1) and the 25 items of
   version 2 no longer count towards Stage 1. Their results, comments, evidence, values and exceptions are shown
   read-only on the Stage 2 page under "Earlier Stage 1 results".
4. **Stage 2 gains ten requirements.** Students already in Stage 2 keep the results of the six approved requirements
   they may have completed. The new ten start as pending. This is the one behaviour change that affects students in
   flight, and it needs an owner decision (section 6).
5. **The Sales snapshot is never written** by the new code or the migration.

## 2. Definitions before and after

| | Deployed (`a1716ad`, version 1) | Local earlier work (`45ce6f7`, version 2) | Redesign (version 3) |
|---|---|---|---|
| Stage 1 checklist | 8 requirement rows | 26 item rows in 7 groups | 1 item: `missing_info_identified` |
| Stage 2 checklist | 6 rows | 6 rows | 16 rows: 10 meeting verification items + the same 6 |
| Where information is collected | nowhere in the app | Stage 1 page | Stage 2 page |
| Field values table | none | `enrollment_handover_fields` | same table, plus `created_by_user_id` |
| Field verification | none | none | `enrollment_handover_field_verifications` |

The stage gate matches rows to the current definition by key. A missing row counts as unresolved. A row whose key is
not in the definition is ignored for gating. Both rules were already in place and are unchanged.

## 3. Compatibility matrix

Every row below is covered by a test.

| Student today | What happens with the new code | Data written |
|---|---|---|
| Stage 1 `COMPLETED` (8 or 26 rows) | Stays `COMPLETED`. Stage 1 shows its single review item as it was. The earlier results appear in the Stage 2 list | None |
| Stage 1 `PENDING_REVIEW`, all rows resolved | `missing_info_identified` is already resolved, so the stage can still be completed | None |
| Stage 1 `IN_PROGRESS`, review item pending | The Mentor confirms the review, then completes the stage. Ticks on the other items are kept and listed | One row only when the Mentor confirms |
| Stage 1 review item resolved as unavailable with a reason, or by a Head exception | Honoured, stage can be completed | None |
| Stage 1 never opened (no rows) | The single review row is created when the Mentor first updates it (definition version 3) | One row, at that time |
| Stage 1 paused or blocked from review | Resumes in review and can be completed | None |
| Exception authorised on an old requirement, no row | Listed with its reason and the Head's name | None |
| Counselor-collected value on an old item | Listed read-only with its value | None |
| Stage 2 `IN_PROGRESS`, some of the six results saved | The six keep their state, notes, evidence and reasons. Ten new requirements are pending | None until the Mentor works |
| Stage 2 `PENDING_REVIEW` under the six requirements | Stored status is not changed by reading. Completing it is refused until the ten new requirements are resolved, and the refusal lists them. The first checklist change moves it back to `IN_PROGRESS` | None |
| Stage 2 `COMPLETED`, Stage 3 or later in progress | Untouched. Later stages are not affected | None |
| Mentoring values saved under `45ce6f7` (`enrollment_handover_fields`) | Still shown. `created_by_user_id` is empty, so "collected by" falls back to the last writer | None |

## 4. The migration

`apps/api/prisma/migrations/20261107100000_add_mentoring_field_verification/migration.sql`

- `ALTER TABLE enrollment_handover_fields ADD COLUMN created_by_user_id TEXT` (nullable, no default, no table rewrite).
- `CREATE TABLE enrollment_handover_field_verifications` with a unique index on `(handover_id, field_key)` and a
  foreign key to `enrollment_handovers`.

A test reads the file and fails if it contains `DROP`, `TRUNCATE`, `RENAME`, `DELETE FROM`, `UPDATE` or `ALTER COLUMN`,
or touches any other table.

**Ordering.** It must run after `20261103100000_add_mentoring_handover_field_values` because it alters that table.
If that earlier migration was never applied anywhere, apply both in order. The new code reads and writes the new
column and table, so deploy the migration before the code. Deploying code first fails on the first Stage 2 save or
page load.

**Rollback.** The old code ignores the new column and table, so rolling the code back is safe. The new table can stay.
Dropping it loses the record of what the Mentor confirmed with parents.

## 5. How the data model keeps the facts apart

| Fact | Where | Rule |
|---|---|---|
| What Sales sent | `enrollment_handovers.source_snapshot`, `transferred_fields`, `missing_fields` | Never written after handover |
| What Mentoring collected or corrected | `enrollment_handover_fields` (`value`, `origin`, `sales_value`, `created_by_user_id`, `updated_by_user_id`) | One row per field. The first Sales value is kept in `sales_value` |
| What the Mentor confirmed with the parent | `enrollment_handover_field_verifications` (`verified_value`, `verified_by_user_id`, `verified_at`, `note`) | Separate row. Saving a value never creates one |
| Whether a requirement is done | `stage_checklist_responses` (`state`, `note`, `reason`, `evidence_ref`, `updated_by_user_id`, `updated_at`) and `workflow_exceptions` | Per stage and item |
| Every change | `mentoring_events` and the audit log | Append only. New types: `HANDOVER_FIELD_VERIFIED`, `HANDOVER_FIELD_UNVERIFIED` |

A confirmation stores the value it confirmed. The page shows a field as verified only while the current value is
still that value. After an edit it shows "Changed since it was verified" and counts the field as not verified. The
earlier confirmation row is kept for the record.

Collecting and verifying are separate API calls, separate tables and separate counts. A checklist requirement that
depends on information cannot be completed while that information is missing, but having the information never
completes the requirement.

## 6. Decisions for the owner

1. **Stage 2 students already waiting for review.** Under the new rules they need the ten new requirements before they
   can be completed. The alternative is a one-off, insert-only script that records the ten as resolved for those
   students. It was not written, because it would mark requirements confirmed that nobody confirmed with a parent.
   Recommended: leave them, and count how many students are affected with the read-only query below before deploying.
2. **Nothing can be saved before Stage 2 starts.** The API refuses field saves and verification until the Meeting with
   Parents stage is open (in progress, in review or completed). A Mentor who spots a wrong phone number in Stage 1 has
   to complete the review first. This enforces the workflow split on the server. It is a one-line change if the owner
   prefers to allow corrections earlier.
3. **Subject requirements.** Sales subjects and hours stay locked after handover, because hours feed the quotation.
   The Mentor records subject detail in a new field, "Subject Requirement Details". Editing the Sales subject list
   itself needs a separate decision about the quotation.

## 7. Read-only queries to run before deployment

These only read. Run them on a restored copy first.

```sql
-- Stage 1 students by status and by checklist shape
SELECT s.status, r.definition_version, count(DISTINCT s.id)
FROM mentoring_stages s LEFT JOIN stage_checklist_responses r ON r.stage_id = s.id
WHERE s.stage_number = 1 GROUP BY 1, 2 ORDER BY 1, 2;

-- Stage 2 students already waiting for review (decision 1)
SELECT count(*) FROM mentoring_stages WHERE stage_number = 2 AND status = 'PENDING_REVIEW';

-- Stage 1 results that will move to the "Earlier Stage 1 results" list
SELECT count(*) FROM stage_checklist_responses r JOIN mentoring_stages s ON s.id = r.stage_id
WHERE s.stage_number = 1 AND r.item_key <> 'missing_info_identified'
  AND (r.state <> 'PENDING_COLLECTION' OR r.note IS NOT NULL OR r.evidence_ref IS NOT NULL OR r.value IS NOT NULL);
```
