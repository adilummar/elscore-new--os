-- =============================================================================
-- EL SCORE OS — Stage 1 checklist carry-over backfill              *** NOT EXECUTED ***
--
-- WHY
--   Commit 45ce6f7 splits the eight Stage 1 requirement rows (definition version 1) into 26 individual items
--   (version 2). Seven of the old keys became requirement GROUPS; their results are no longer shown or counted.
--   Without this script an existing student's Stage 1 looks nearly empty, a stage that was ready for verification
--   is blocked, and counselor-collected information is hidden. This script carries every old result over to the
--   items of its group so nothing is lost.
--
-- WHAT IT DOES (INSERT only)
--   stage_checklist_responses   one row per new item of every Stage 1 that has version-1 rows. State, reason,
--                               who and when are copied from the old requirement row. The old note, evidence and
--                               entered value go to the FIRST item of the group, with a "carried over" marker.
--   workflow_exceptions         an exception on an old requirement is repeated for each of its items (same reason,
--                               same authorising Head, same time).
--   mentoring_events            one history entry per migrated stage.
--   It never UPDATEs or DELETEs anything. The old version-1 rows stay exactly as they are (and remain the source of
--   truth if the code is rolled back). Stage statuses, holds, the Sales snapshot and every other table are untouched.
--   Idempotent: ON CONFLICT DO NOTHING, so a second run inserts nothing.
--
-- SAFETY CHECKS (the script aborts and rolls back if any fails)
--   * version-1 rows, stage statuses and the Sales handover data are byte-for-byte unchanged
--   * every Stage 1 that was COMPLETED or waiting for review (or paused from that state) has no unresolved
--     mandatory item under the new definition, i.e. "resolved before" == "resolved after"
--   * every migrated stage ends with all 26 items present
--
-- HOW TO USE (operator, after owner approval, on a verified backup)
--   1. Apply the Mentoring migrations and deploy the new code first, or run this BEFORE the new code starts:
--      it only needs the tables from migration 20261101130000.
--   2. Run the file as-is on a scratch restore. It ends with ROLLBACK, so it is a DRY RUN that prints what it
--      would insert. This script has never been run against PostgreSQL: the scratch run is its first validation.
--   3. Review the preview, then change the final ROLLBACK to COMMIT and run once on staging.
-- =============================================================================

BEGIN;

-- Mapping: each old requirement key -> the new items of its group (is_first = receives note, evidence, value) -----
CREATE TEMP TABLE _map (legacy_key text NOT NULL, new_key text NOT NULL, is_first boolean NOT NULL) ON COMMIT DROP;
INSERT INTO _map (legacy_key, new_key, is_first) VALUES
  ('student_parent_verified', 'student_details_checked', true),
  ('student_parent_verified', 'parent_details_checked', false),
  ('student_parent_verified', 'contact_details_verified', false),
  ('student_parent_verified', 'parent_relationship_recorded', false),
  ('tutor_subject_confirmed', 'tutor_assignment_confirmed', true),
  ('tutor_subject_confirmed', 'subject_requirements_confirmed', false),
  ('tutor_subject_confirmed', 'curriculum_grade_confirmed', false),
  ('tutor_subject_confirmed', 'academic_expectations_reviewed', false),
  ('weekly_timetable_verified', 'preferred_days_collected', true),
  ('weekly_timetable_verified', 'preferred_time_slots_collected', false),
  ('weekly_timetable_verified', 'tutor_availability_checked', false),
  ('weekly_timetable_verified', 'timetable_confirmed', false),
  ('academic_requirements_recorded', 'learning_requirements_reviewed', true),
  ('academic_requirements_recorded', 'subject_academic_needs_recorded', false),
  ('academic_requirements_recorded', 'learning_concerns_documented', false),
  ('academic_requirements_recorded', 'curriculum_syllabus_reviewed', false),
  ('previous_marks', 'previous_marks_requested', true),
  ('previous_marks', 'previous_marks_collected', false),
  ('examination_details', 'exam_dates_collected', true),
  ('examination_details', 'exam_syllabus_collected', false),
  ('examination_details', 'exam_preparation_recorded', false),
  ('parent_expectations', 'parent_expectations_recorded', true),
  ('parent_expectations', 'parent_concerns_recorded', false),
  ('parent_expectations', 'student_engagement_recorded', false),
  ('parent_expectations', 'follow_up_identified', false);

-- Every item of the new Stage 1 definition (the 25 above plus the item that kept its old key) ----------------
CREATE TEMP TABLE _items (item_key text NOT NULL) ON COMMIT DROP;
INSERT INTO _items (item_key) SELECT new_key FROM _map UNION ALL SELECT 'missing_info_identified';

-- Stages in scope: a Stage 1 that has version-1 rows (never-opened stages get their rows from the application) ---
CREATE TEMP TABLE _scope ON COMMIT DROP AS
SELECT DISTINCT s.id AS stage_id, s.activation_id
FROM mentoring_stages s
JOIN stage_checklist_responses r ON r.stage_id = s.id AND r.definition_version = 1
WHERE s.stage_number = 1;

-- Baseline fingerprints for the post-conditions ---------------------------------------------------------------
CREATE TEMP TABLE _before ON COMMIT DROP AS
SELECT
  (SELECT count(*) FROM stage_checklist_responses WHERE definition_version = 1)::int AS v1_rows,
  (SELECT md5(coalesce(string_agg(concat_ws('|', id, state::text, value::text, note, reason, evidence_ref, updated_by_user_id, updated_at::text), ';' ORDER BY id), ''))
     FROM stage_checklist_responses WHERE definition_version = 1) AS v1_hash,
  (SELECT md5(coalesce(string_agg(concat_ws('|', id, status::text, completed_at::text, verified_by_user_id), ';' ORDER BY id), ''))
     FROM mentoring_stages) AS stage_hash,
  (SELECT md5(coalesce(string_agg(concat_ws('|', id, source_snapshot::text, transferred_fields::text, missing_fields::text), ';' ORDER BY id), ''))
     FROM enrollment_handovers) AS handover_hash,
  (SELECT count(*) FROM workflow_exceptions)::int AS exceptions_before;

-- Preview (read-only): what each stage in scope has today --------------------------------------------------------
SELECT s.activation_id,
       st.status AS stage_status,
       count(*) FILTER (WHERE r.definition_version = 1) AS v1_rows,
       count(*) FILTER (WHERE r.definition_version = 1 AND r.state = 'VERIFIED') AS v1_verified,
       count(*) FILTER (WHERE r.definition_version = 1 AND r.state = 'COLLECTED') AS v1_collected,
       count(*) FILTER (WHERE r.definition_version = 1 AND r.state IN ('UNAVAILABLE', 'NOT_APPLICABLE')) AS v1_unavailable_or_na,
       count(*) FILTER (WHERE r.definition_version = 1 AND (r.note IS NOT NULL OR r.evidence_ref IS NOT NULL OR r.value IS NOT NULL)) AS v1_with_note_evidence_or_value,
       (SELECT count(*) FROM workflow_exceptions e WHERE e.stage_id = s.stage_id) AS exceptions
FROM _scope s
JOIN mentoring_stages st ON st.id = s.stage_id
JOIN stage_checklist_responses r ON r.stage_id = s.stage_id
GROUP BY s.activation_id, st.status, s.stage_id
ORDER BY s.activation_id;

-- 1. Carry each old requirement's result over to the items of its group ---------------------------------------
WITH inserted AS (
  INSERT INTO stage_checklist_responses
    (id, stage_id, item_key, definition_version, mandatory, state, value, note, reason, evidence_ref, updated_by_user_id, created_at, updated_at)
  SELECT gen_random_uuid()::text, r.stage_id, m.new_key, 2, true, r.state,
         CASE WHEN m.is_first THEN r.value END,
         CASE
           WHEN m.is_first THEN NULLIF(concat_ws(' ', CASE WHEN r.state <> 'PENDING_COLLECTION' THEN 'Carried over from the earlier checklist.' END, r.note), '')
           WHEN r.state <> 'PENDING_COLLECTION' THEN 'Carried over from the earlier checklist.'
         END,
         r.reason,
         CASE WHEN m.is_first THEN r.evidence_ref END,
         r.updated_by_user_id, r.created_at, r.updated_at
  FROM stage_checklist_responses r
  JOIN _map m ON m.legacy_key = r.item_key
  JOIN _scope s ON s.stage_id = r.stage_id
  WHERE r.definition_version = 1
  ON CONFLICT (stage_id, item_key) DO NOTHING
  RETURNING 1
)
SELECT count(*) AS carried_over_item_rows FROM inserted;

-- 2. Any item still without a row (for example an old row that never existed) starts as pending ---------------
WITH inserted AS (
  INSERT INTO stage_checklist_responses (id, stage_id, item_key, definition_version, mandatory, state, updated_at)
  SELECT gen_random_uuid()::text, s.stage_id, i.item_key, 2, true, 'PENDING_COLLECTION', now()
  FROM _scope s CROSS JOIN _items i
  ON CONFLICT (stage_id, item_key) DO NOTHING
  RETURNING 1
)
SELECT count(*) AS new_pending_item_rows FROM inserted;

-- 3. Repeat an exception on an old requirement for each of its items (same reason, Head and time) ---------------
WITH inserted AS (
  INSERT INTO workflow_exceptions (id, stage_id, item_key, reason, authorized_by_user_id, created_at)
  SELECT gen_random_uuid()::text, e.stage_id, m.new_key, e.reason, e.authorized_by_user_id, e.created_at
  FROM workflow_exceptions e
  JOIN _map m ON m.legacy_key = e.item_key
  JOIN _scope s ON s.stage_id = e.stage_id
  ON CONFLICT (stage_id, item_key) DO NOTHING
  RETURNING 1
)
SELECT count(*) AS carried_over_exceptions FROM inserted;

-- 4. One history entry per migrated stage (append-only) ---------------------------------------------------------
INSERT INTO mentoring_events (id, activation_id, stage_id, type, actor_user_id, reason, payload)
SELECT gen_random_uuid()::text, s.activation_id, s.stage_id, 'CHECKLIST_DEFINITION_MIGRATED', NULL,
       'Stage 1 checklist items were split into individual items; the earlier results were carried over.',
       jsonb_build_object('from', 1, 'to', 2, 'script', 'apps/api/scripts/stage1-checklist-backfill.sql')
FROM _scope s
WHERE NOT EXISTS (SELECT 1 FROM mentoring_events e WHERE e.stage_id = s.stage_id AND e.type = 'CHECKLIST_DEFINITION_MIGRATED');

-- Post-conditions: stop (and roll back) if anything is off ---------------------------------------------------------
DO $$
DECLARE
  b _before%ROWTYPE;
  v1_hash_after text;
  stage_hash_after text;
  handover_hash_after text;
BEGIN
  SELECT * INTO b FROM _before;

  SELECT md5(coalesce(string_agg(concat_ws('|', id, state::text, value::text, note, reason, evidence_ref, updated_by_user_id, updated_at::text), ';' ORDER BY id), ''))
    INTO v1_hash_after FROM stage_checklist_responses WHERE definition_version = 1;
  IF v1_hash_after <> b.v1_hash THEN RAISE EXCEPTION 'Version-1 checklist rows changed; aborting'; END IF;

  SELECT md5(coalesce(string_agg(concat_ws('|', id, status::text, completed_at::text, verified_by_user_id), ';' ORDER BY id), ''))
    INTO stage_hash_after FROM mentoring_stages;
  IF stage_hash_after <> b.stage_hash THEN RAISE EXCEPTION 'A stage status changed; aborting'; END IF;

  SELECT md5(coalesce(string_agg(concat_ws('|', id, source_snapshot::text, transferred_fields::text, missing_fields::text), ';' ORDER BY id), ''))
    INTO handover_hash_after FROM enrollment_handovers;
  IF handover_hash_after <> b.handover_hash THEN RAISE EXCEPTION 'The Sales handover data changed; aborting'; END IF;

  -- Every migrated stage now has all 26 items.
  IF EXISTS (
    SELECT 1 FROM _scope s CROSS JOIN _items i
    WHERE NOT EXISTS (SELECT 1 FROM stage_checklist_responses r WHERE r.stage_id = s.stage_id AND r.item_key = i.item_key)
  ) THEN RAISE EXCEPTION 'A migrated stage is missing checklist items; aborting'; END IF;

  -- A stage that was completed, ready for review, or paused from review must still have nothing outstanding.
  IF EXISTS (
    SELECT 1
    FROM _scope s
    JOIN mentoring_stages st ON st.id = s.stage_id
    CROSS JOIN _items i
    JOIN stage_checklist_responses r ON r.stage_id = s.stage_id AND r.item_key = i.item_key
    WHERE (
            st.status IN ('COMPLETED', 'PENDING_REVIEW')
            OR EXISTS (SELECT 1 FROM workflow_holds h WHERE h.stage_id = st.id AND h.resolved_at IS NULL AND h.previous_stage_status IN ('COMPLETED', 'PENDING_REVIEW'))
          )
      AND NOT (
            r.state = 'VERIFIED'
            OR (r.state IN ('UNAVAILABLE', 'NOT_APPLICABLE') AND btrim(coalesce(r.reason, '')) <> '')
            OR EXISTS (SELECT 1 FROM workflow_exceptions e WHERE e.stage_id = r.stage_id AND e.item_key = r.item_key)
          )
  ) THEN RAISE EXCEPTION 'A stage that was ready or complete would have unresolved items; aborting'; END IF;
END $$;

-- Result summary (read-only) -----------------------------------------------------------------------------------------
SELECT st.status AS stage_status,
       count(DISTINCT s.stage_id) AS stages,
       count(*) FILTER (WHERE r.state = 'VERIFIED') AS items_completed,
       count(*) FILTER (WHERE r.state <> 'VERIFIED') AS items_not_completed
FROM _scope s
JOIN mentoring_stages st ON st.id = s.stage_id
JOIN stage_checklist_responses r ON r.stage_id = s.stage_id AND r.item_key IN (SELECT item_key FROM _items)
GROUP BY st.status
ORDER BY st.status;

-- DRY RUN by default. After reviewing the preview, replace this line with COMMIT; and run once more.
ROLLBACK;
