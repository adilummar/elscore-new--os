# Stage 1 checklist migration: compatibility review

**Status: review for the owner. Nothing here has been executed, pushed or deployed.**
Reviewed commit: `45ce6f7` (local). Remote integration branch and deployed code: `a1716ad`.
No database or Redis connection was made for this review; every statement about stored data is derived from the
code and from tests that run the real services over an in-memory database.

Evidence labels: **[Code]** read from the repository, **[Test]** proven by a test in
`apps/api/src/modules/mentoring/mentoring-stage1-compatibility.spec.ts` (44 tests), **[Last known]** staging
data seen read-only on 2–3 November and not re-checked, **[Unknown]** needs a read-only query (section 9).

## 1. Summary

1. **The SQL migration is safe.** `20261103100000_add_mentoring_handover_field_values` creates one enum, one table,
   one index and one foreign key. It does not read, change or delete any existing data **[Code, Test]**.
2. **The risk is the code change, not the SQL.** Commit `45ce6f7` replaces the eight Stage 1 requirement rows
   (definition version 1) with 26 individual items (version 2). Seven of the old keys became *groups*; the new
   code only reads the 26 new item keys.
3. **Without a backfill, existing Stage 1 students look reset** even though nothing is deleted **[Test]**:
   - a completed Stage 1 stays `COMPLETED` but shows 1 of 26 items done;
   - a Stage 1 that was ready for review can no longer be verified (25 items outstanding);
   - touching any item moves a ready stage back to `IN_PROGRESS`;
   - a stage paused from review resumes as `PENDING_REVIEW` with 25 unresolved items;
   - comments, evidence and values entered on an old requirement, and counselor-collected information, stay in
     the database but are no longer shown;
   - an exception authorised on an old requirement no longer resolves anything;
   - a counselor cannot collect on a new item until a Mentor has opened the checklist (its row does not exist yet).
4. **A data-preserving backfill is needed** for any existing Stage 1 that has version-1 rows. It is prepared as a
   separate, insert-only, dry-run-by-default script: `apps/api/scripts/stage1-checklist-backfill.sql`.
   It carries every old result to the items of its group and is proven equivalent ("resolved before" equals
   "resolved after") in tests for eight state mixes **[Test]**.
5. **Rolling the code back is not free** once version-2 rows exist (section 7).
6. **The Sales snapshot is never written** by the new code, the migration or the backfill **[Code, Test]**.

## 2. How the old and new models differ

| | Deployed (`a1716ad`) | New (`45ce6f7`) |
|---|---|---|
| Stage 1 items | 8 requirement rows | 26 item rows under 7 requirement groups |
| Definition version | 1 | 2 (stored on every new row) |
| Keys | `student_parent_verified`, `tutor_subject_confirmed`, `weekly_timetable_verified`, `academic_requirements_recorded`, `previous_marks`, `examination_details`, `parent_expectations`, `missing_info_identified` | the 7 old keys are now **group ids**; `missing_info_identified` is kept as an item; 25 new item keys |
| Where the stage gate looks | every mandatory row that exists | the current definition (a missing row counts as unresolved; rows of an older definition are ignored) |
| Per-student rows | `stage_checklist_responses` (stage, key, state, value, note, reason, evidence, who, when) | same table and columns, no schema change |
| Exceptions | `workflow_exceptions` per (stage, key) | same table, per item key |
| Sales snapshot | `enrollment_handovers.source_snapshot / transferred_fields / missing_fields` | unchanged; Mentoring values go to the new table |

Only `missing_info_identified` exists under both definitions, so its old row is picked up automatically. No new
item key equals an old group key, so an old row can never be mistaken for a new item **[Test]**.

## 3. Compatibility matrix

Columns: what the student has **today**; after the **SQL migration alone**; after the **new code with no backfill**;
after the **new code with the backfill**.

| Scenario | Today (`a1716ad`) | SQL migration alone | New code, no backfill | New code + backfill |
|---|---|---|---|---|
| **Completed Stage 1** (stage `COMPLETED`, 8 rows verified) | 8 of 8 done | No change | Stage stays `COMPLETED` (status column untouched) but the checklist shows **1 of 26** done; the other 25 read Pending | Stays `COMPLETED`; **26 of 26** done, same people, same times; old rows untouched |
| **Partially completed** (some verified, one collected, one unavailable with reason, some pending) | Mixed | No change | Only `missing_info_identified` keeps its state; everything else reads Pending; reasoned "unavailable" items no longer count | Each old result is copied to every item of its group (verified stays verified, collected stays collected, unavailable keeps its reason); pending stays pending |
| **Pending** (opened, nothing done) | 8 pending rows | No change | 26 pending items; counselors **cannot collect** (rows missing) until a Mentor touches the checklist | 26 pending items with rows present; counselors can collect immediately |
| **Awaiting allocation / never opened** (no rows) | Stage `NOT_STARTED` | No change | Rows are created when the stage opens | Backfill skips it (no version-1 rows); rows are created when the stage opens |
| **Ready for review** (`PENDING_REVIEW`, all resolved) | Can be verified | No change | **Cannot be verified** (25 outstanding); any item update flips it to `IN_PROGRESS` | Still verifiable straight away |
| **Paused** (`ON_HOLD`, from review) | Resumes to `PENDING_REVIEW` | No change | Resumes to `PENDING_REVIEW` but with 25 unresolved items: status and items disagree | Hold untouched; resumes to `PENDING_REVIEW` and verifies |
| **Blocked** (`BLOCKED`, from review) | As paused | No change | As paused | As paused, fixed |
| **Paused / blocked from `IN_PROGRESS`** | Resumes to `IN_PROGRESS` | No change | Resumes to `IN_PROGRESS`; carried progress missing | Resumes to `IN_PROGRESS` with carried progress |
| **With comments and evidence** | Shown on the requirement | No change | **Hidden** (still stored, not shown) | Note, evidence link and entered value go to the first item of the group, marked "Carried over from the earlier checklist." |
| **With counselor-collected info** (`COLLECTED`) | Awaiting Mentor verification | No change | Hidden, so the Mentor cannot verify it | Carried as `COLLECTED` to each item, attributed to the counselor |
| **With an authorised exception** | Resolves the requirement | No change | Kept but resolves nothing | Repeated for each item of the group: same reason, same Head, same time |
| **Returned for correction** (Head returned a completed stage 1) | Re-opens with its old rows | No change | Re-opens looking reset | Re-opens with carried results |
| **New student after deployment** | n/a | n/a | 26 version-2 rows created when the stage opens | Same; the backfill has nothing to do for them (it never overwrites) |

## 4. Answers to the ten questions

1. **Old vs new model.** Section 2.
2. **Records that could be affected.** Every `mentoring_stages` row with `stage_number = 1` that has at least one
   `stage_checklist_responses` row of `definition_version = 1`, plus their `workflow_exceptions` and open
   `workflow_holds`. Production has none (the Mentoring migrations were never applied there) **[Last known]**.
   Staging had one student past allocation when last read **[Last known]**; the exact set needs the read-only
   query in section 9 **[Unknown]**.
3. **What is preserved.** Nothing is ever deleted or updated by the new code or the backfill: no code path deletes a
   checklist row, exception or event **[Code]**. Old rows (state, value, note, reason, evidence, who, when), old
   exceptions and the history (`mentoring_events`, `audit_events`) all remain. The risk is *visibility*, not loss.
4. **Zero progress?** Yes without the backfill (matrix, row 1). No with it.
5. **Backfill needed?** Yes, for any existing Stage 1 with version-1 rows. The only alternative is to accept a
   restart of those students' Stage 1 checklists (acceptable only for pure test data, and only as an explicit
   owner decision).
6. **Completed Stage 1 stays completed?** The status column is never changed by any path in the new code or script,
   so yes in both cases. Without the backfill it would *look* incomplete.
7. **Pending, blocked, paused, in-review.** Matrix rows 3–8. Statuses are preserved; without the backfill an
   in-review stage can no longer be verified and a hold resumes into an inconsistent state.
8. **Additive and reversible?** The migration is additive. Reversal of the SQL: drop the new table and enum
   (data in it would be lost; take a backup first). Reversal of the code has a catch (section 7).
9. **New APIs on old and new records.** The item and verify routes create missing rows on demand and read from the
   current definition, so they handle both; but they do not understand version-1 group rows, which is why the
   backfill is needed. The new handover-field routes only touch the new table and work for every student.
10. **Sales snapshots.** Unchanged. The only writer of `enrollment_handovers` is the original handover creation;
    the new field route writes `enrollment_handover_fields`; the backfill's post-condition aborts if the snapshot
    columns change **[Code, Test]**.

## 5. Proposed preservation strategy

1. Take a fresh verified backup (existing procedure).
2. Apply the additive migration (`prisma migrate deploy`).
3. Run `apps/api/scripts/stage1-checklist-backfill.sql` **as a dry run** on a scratch restore, read the preview, then
   run it for real (change the last line to `COMMIT;`) in the deployment window.
4. Start the new API and web build.

**Order matters.** If the backfill runs while the *old* API is live, the old gate (section 7) counts the new
pending rows and may flip a stage's status on the next item update. If the new API runs without the backfill,
Mentors see reset checklists. Recommended: stop the API process for the minutes it takes (`pm2 stop` by the verified
id), run migration and backfill, then start the new build. Both alternatives leave a short window of wrong
behavior; this one removes it. (An approval item.)

### What the backfill does (insert-only)

- **Rows:** for each Stage 1 with version-1 rows, one version-2 row per new item. State, reason, who and when are
  copied from the old requirement of its group. Note, evidence link and entered value go to the first item of the
  group with "Carried over from the earlier checklist." in front; the other items get that marker only when
  the old state was not pending. Any item still without a row starts pending.
- **Exceptions:** an exception on an old requirement is repeated for each of its items (same reason, same
  authorising Head, same timestamp).
- **History:** one `CHECKLIST_DEFINITION_MIGRATED` entry per migrated stage.
- **Never:** updates, deletes, stage status changes, hold changes, Sales data changes. A second run inserts nothing
  and never overwrites a row the new code already wrote **[Test]**.
- **Self-checks (abort and roll back):** version-1 rows, stage statuses and Sales data are byte-for-byte unchanged;
  every migrated stage has all 26 items; a stage that was completed, ready for review or paused from review has no
  unresolved mandatory item afterwards.

### Honest limits

- The script has **never run on PostgreSQL**. It is written against the real column names and checked by tests
  against a reference implementation, but its first real run must be a dry run on a scratch restore. A local
  scratch PostgreSQL exists on the development machine; using it needs your approval, because this review was
  told not to connect to any database.
- Carrying a group's result to every item is an approximation: the Mentor verified the *requirement*, not each
  item. The marker text says so, and nothing is shown as newly verified by anyone else (the original verifier and
  time are kept).

## 6. Risks

| # | Risk | Likelihood | Mitigation |
|---|---|---|---|
| R1 | Deploy the code without the backfill: reset-looking checklists, blocked verification, hidden evidence | Certain for any existing Stage 1 | Backfill in the same window (section 5) |
| R2 | Backfill runs while the old API is live | Low, short window | Stop the API for the window |
| R3 | Script error on real PostgreSQL | Unknown (never run) | Dry run on a scratch restore first; every check aborts the transaction |
| R4 | Group result copied to items the Mentor did not individually check | By design | Marker text; owner decision whether acceptable (the alternative is a reset) |
| R5 | Code rollback after version-2 rows exist blocks verification in the old code | Certain if rolled back | Section 7 |
| R6 | A Mentor edits during the window | Low | Maintenance message; the script runs in one transaction |

## 7. Rollback

- **Migration.** `DROP TABLE enrollment_handover_fields; DROP TYPE "HandoverFieldOrigin";` after a backup. Old code
  never reads that table.
- **Backfill.** It inserted rows only. To undo it, delete the version-2 rows and repeated exceptions it created, or
  restore the backup (preferred; nothing else changed).
- **Code.** The deployed code's gate counts **every** mandatory row of a stage, not only the ones in its own
  definition **[Test]**. After a rollback, any unresolved version-2 row would block verification and could not be
  resolved from the old page. If the code must be rolled back after version-2 rows exist, first mark them
  non-mandatory (proposed, needs its own approval and a dry run; **not prepared as an executed script**):

  ```sql
  -- Proposed rollback preparation. NOT EXECUTED.
  UPDATE stage_checklist_responses SET mandatory = false
  WHERE definition_version = 2
    AND item_key NOT IN ('student_parent_verified','tutor_subject_confirmed','weekly_timetable_verified',
                         'academic_requirements_recorded','previous_marks','examination_details',
                         'parent_expectations','missing_info_identified');
  ```

  Work recorded on the new items is kept but is not visible to the old code. The old requirement rows are exactly as
  they were, so the old page shows the state at deployment time.

## 8. Required regression tests (all added; 44 in the compatibility spec)

- definition change: eight old keys, seven groups, no key collisions, other stages unchanged;
- without the backfill: each failure in section 1 point 3, and "nothing is deleted";
- with the backfill: completed, partial, pending, never opened, paused and blocked (from review and from in
  progress), ready for review, comments and evidence, counselor-collected, exceptions, pending-with-note;
- Sales snapshot, stage statuses, old rows and old exceptions untouched; idempotent; never overwrites;
- equivalence "resolved before == resolved after" for eight state mixes;
- new students: 26 version-2 rows on opening, backfill has nothing to do;
- script: mapping equals the definitions (no drift), insert-only, no stage/hold/handover writes, every row insert is
  `ON CONFLICT DO NOTHING`, post-conditions present, dry run by default, marked not executed;
- migration SQL touches no checklist data;
- rollback: old gate with version-2 rows, and the effect of the proposed preparation.

Mutation checks: dropping the reason, exceptions, evidence, author or state from the backfill each make tests fail.

## 9. Read-only queries for the operator (NOT EXECUTED)

```sql
-- Stage 1 records that would be affected
SELECT a.id AS activation, a.status AS activation_status, s.status AS stage_status,
       count(*) FILTER (WHERE r.definition_version = 1) AS v1_rows,
       count(*) FILTER (WHERE r.definition_version = 1 AND r.state = 'VERIFIED') AS verified,
       count(*) FILTER (WHERE r.definition_version = 1 AND r.state = 'COLLECTED') AS collected,
       count(*) FILTER (WHERE r.definition_version = 1 AND (r.note IS NOT NULL OR r.evidence_ref IS NOT NULL OR r.value IS NOT NULL)) AS with_note_or_evidence,
       (SELECT count(*) FROM workflow_exceptions e WHERE e.stage_id = s.id) AS exceptions,
       EXISTS (SELECT 1 FROM workflow_holds h WHERE h.stage_id = s.id AND h.resolved_at IS NULL) AS open_hold
FROM mentoring_activations a
JOIN mentoring_stages s ON s.activation_id = a.id AND s.stage_number = 1
LEFT JOIN stage_checklist_responses r ON r.stage_id = s.id
GROUP BY a.id, a.status, s.id, s.status;
```

## 10. Decisions and approvals needed

1. **DECIDED (owner, 2026-11-03): carry-over approved.** A requirement's result is carried to each of its items;
   affected students do not restart Stage 1. This approves the approach only. It does not approve running
   anything, and items 2 to 4 below are still open.
2. Approve stopping the API process for the migration window.
3. Approve a dry run of the script on a scratch PostgreSQL (the development machine's local server or a scratch
   restore of staging), since the script has never run on a real PostgreSQL.
4. Approve pushing `45ce6f7`, the migration, and the deployment, each as before.

## 11. What this review added (all uncommitted; `45ce6f7` is unchanged)

- `docs/operations/STAGE1_CHECKLIST_MIGRATION_COMPATIBILITY.md` (this file)
- `apps/api/scripts/stage1-checklist-backfill.sql` (not executed)
- `apps/api/src/modules/mentoring/testing/stage1-checklist-backfill.reference.ts` (test-only reference logic)
- `apps/api/src/modules/mentoring/mentoring-stage1-compatibility.spec.ts` (44 tests)
- `apps/web/src/app/(app)/mentoring/labels.ts` and its spec: a plain-language label for the migration's history entry
