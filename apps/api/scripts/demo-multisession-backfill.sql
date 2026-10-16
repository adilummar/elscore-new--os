-- =============================================================================
-- EL SCORE OS — Demo Module Multi-Session Backfill (Declarative SQL Reference)
-- STRICTLY DETERMINISTIC & RESUMABLE
--
-- EXECUTION NOTICE & PROHIBITION:
-- This SQL script is provided as a declarative PostgreSQL reference companion.
-- DIRECT EXECUTION OF THIS SCRIPT ON LIVE ENVIRONMENTS IS STRICTLY PROHIBITED
-- unless preceded by full preflight verification. The authoritative execution
-- path is the TypeScript CLI runner ('demo-multisession-backfill.ts').
--
-- Safety Guarantees:
-- 1. Does NOT mutate or drop legacy tables (demos, demo_feedback, demo_reschedule_history).
-- 2. Halts immediately with EXCEPTION if any data collision or conflict is detected.
-- 3. Excludes orphaned legacy records where referenced students/leads/requirements are missing.
-- 4. Does NOT fabricate coordinators, attendances, exceptions, or detailed rubric items.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- Step 1: Preflight Orphan Detection (Informational)
-- -----------------------------------------------------------------------------
-- Find any legacy demos missing valid student or lead references
SELECT d.id AS orphan_demo_id, d.business_id, 'MISSING_STUDENT_OR_LEAD' AS reason
FROM demos d
LEFT JOIN students s ON d.student_id = s.id
LEFT JOIN leads l ON s.lead_id = l.id
WHERE s.id IS NULL OR l.id IS NULL;

-- -----------------------------------------------------------------------------
-- Step 1b: Conflict Detection Gate (MANDATORY HALT ON CONFLICT)
-- -----------------------------------------------------------------------------
DO $$
DECLARE
    mismatch_count INTEGER;
    biz_collision_count INTEGER;
    pk_collision_count INTEGER;
BEGIN
    -- Check 1: Existing booking with same legacy_demo_id but mismatched data
    SELECT COUNT(*) INTO mismatch_count
    FROM demos d
    JOIN demo_bookings b ON b.legacy_demo_id = d.id
    WHERE b.student_id != d.student_id
       OR b.business_id != d.business_id
       OR b.scheduled_date != d.scheduled_at;

    IF mismatch_count > 0 THEN
        RAISE EXCEPTION 'Backfill aborted: % conflicting demo_booking record(s) detected with mismatched student_id, business_id, or scheduled_date!', mismatch_count;
    END IF;

    -- Check 2: business_id collision with a booking belonging to another legacy demo or non-legacy booking
    SELECT COUNT(*) INTO biz_collision_count
    FROM demos d
    JOIN demo_bookings b ON b.business_id = d.business_id
    WHERE b.legacy_demo_id IS DISTINCT FROM d.id;

    IF biz_collision_count > 0 THEN
        RAISE EXCEPTION 'Backfill aborted: % business_id collision(s) detected in demo_bookings!', biz_collision_count;
    END IF;

    -- Check 3: Primary key collision with a booking belonging to another legacy demo or non-legacy booking
    SELECT COUNT(*) INTO pk_collision_count
    FROM demos d
    JOIN demo_bookings b ON b.id = d.id
    WHERE b.legacy_demo_id IS DISTINCT FROM d.id;

    IF pk_collision_count > 0 THEN
        RAISE EXCEPTION 'Backfill aborted: % primary key id collision(s) detected in demo_bookings!', pk_collision_count;
    END IF;
END $$;

-- -----------------------------------------------------------------------------
-- Step 2: Backfill Demo Bookings
-- -----------------------------------------------------------------------------
-- Map legacy demo to parent demo_booking.
-- Booking ID is identical to legacy demo ID for 100% deterministic referencing.
INSERT INTO demo_bookings (
    id,
    business_id,
    student_id,
    lead_id,
    coordinator_id,
    booked_by_user_id,
    status,
    scheduled_date,
    total_duration_minutes,
    legacy_demo_id,
    cancelled_at,
    cancel_reason,
    created_at,
    updated_at
)
SELECT
    d.id AS id,
    d.business_id,
    d.student_id,
    s.lead_id,
    NULL AS coordinator_id, -- Honest: no coordinator was assigned in legacy system
    d.booked_by_user_id,
    d.status::text::"DemoBookingStatus",
    d.scheduled_at,
    d.duration_minutes,
    d.id AS legacy_demo_id,
    d.cancelled_at,
    d.cancel_reason,
    d.created_at,
    d.updated_at
FROM demos d
JOIN students s ON d.student_id = s.id
JOIN leads l ON s.lead_id = l.id
JOIN requirements r ON d.requirement_id = r.id
JOIN subjects sub ON d.subject_id = sub.id
JOIN curricula cur ON d.curriculum_id = cur.id
JOIN grades g ON d.grade_id = g.id
JOIN users u ON d.booked_by_user_id = u.id
ON CONFLICT (legacy_demo_id) DO NOTHING;

-- -----------------------------------------------------------------------------
-- Step 3: Backfill Child Demo Sessions
-- -----------------------------------------------------------------------------
-- Session ID is derived deterministically from the legacy demo ID.
INSERT INTO demo_sessions (
    id,
    booking_id,
    session_order,
    requirement_id,
    subject_id,
    curriculum_id,
    grade_id,
    status,
    scheduled_start,
    scheduled_end,
    duration_minutes,
    created_at,
    updated_at
)
SELECT
    -- Deterministic UUID string derived from demo id and session order 1
    substr(md5(d.id || ':session:1'), 1, 8) || '-' ||
    substr(md5(d.id || ':session:1'), 9, 4) || '-' ||
    substr(md5(d.id || ':session:1'), 13, 4) || '-' ||
    substr(md5(d.id || ':session:1'), 17, 4) || '-' ||
    substr(md5(d.id || ':session:1'), 21, 12) AS id,
    d.id AS booking_id,
    1 AS session_order,
    d.requirement_id,
    d.subject_id,
    d.curriculum_id,
    d.grade_id,
    d.status::text::"DemoSessionStatus",
    d.scheduled_at AS scheduled_start,
    d.scheduled_at + (d.duration_minutes || ' minutes')::interval AS scheduled_end,
    d.duration_minutes,
    d.created_at,
    d.updated_at
FROM demos d
JOIN demo_bookings b ON b.legacy_demo_id = d.id
ON CONFLICT (id) DO NOTHING;

-- -----------------------------------------------------------------------------
-- Step 4: Backfill Tutor Assignments (Only when tutor was assigned)
-- -----------------------------------------------------------------------------
INSERT INTO demo_session_tutor_assignments (
    id,
    session_id,
    tutor_id,
    assignment_sequence,
    status,
    assigned_at,
    assigned_by_user_id
)
SELECT
    substr(md5(d.id || ':assignment:1'), 1, 8) || '-' ||
    substr(md5(d.id || ':assignment:1'), 9, 4) || '-' ||
    substr(md5(d.id || ':assignment:1'), 13, 4) || '-' ||
    substr(md5(d.id || ':assignment:1'), 17, 4) || '-' ||
    substr(md5(d.id || ':assignment:1'), 21, 12) AS id,
    s.id AS session_id,
    d.tutor_id,
    1 AS assignment_sequence,
    'ACTIVE'::"TutorAssignmentStatus" AS status,
    d.created_at AS assigned_at,
    d.booked_by_user_id AS assigned_by_user_id
FROM demos d
JOIN demo_bookings b ON b.legacy_demo_id = d.id
JOIN demo_sessions s ON s.booking_id = b.id
JOIN users tu ON d.tutor_id = tu.id
WHERE d.tutor_id IS NOT NULL
ON CONFLICT (id) DO NOTHING;

-- -----------------------------------------------------------------------------
-- Step 5: Backfill Feedback Records (Only where legacy feedback existed)
-- -----------------------------------------------------------------------------
-- Null values for detailed rubrics; preserves honest historical feedback.
INSERT INTO demo_feedback_records (
    id,
    booking_id,
    rating,
    comments,
    student_performance,
    strengths,
    weaknesses,
    tutor_recommendations,
    tutor_rating,
    academic_assessment,
    engagement_level,
    learning_behaviour,
    coordinator_remarks,
    parent_feedback,
    parent_concerns,
    parent_interest_level,
    submitted_by_user_id,
    submitted_at
)
SELECT
    substr(md5(d.id || ':feedback'), 1, 8) || '-' ||
    substr(md5(d.id || ':feedback'), 9, 4) || '-' ||
    substr(md5(d.id || ':feedback'), 13, 4) || '-' ||
    substr(md5(d.id || ':feedback'), 17, 4) || '-' ||
    substr(md5(d.id || ':feedback'), 21, 12) AS id,
    b.id AS booking_id,
    df.rating,
    df.comments,
    NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL,
    df.submitted_by_user_id,
    df.submitted_at
FROM demo_feedback df
JOIN demos d ON df.demo_id = d.id
JOIN demo_bookings b ON b.legacy_demo_id = d.id
ON CONFLICT (booking_id) DO NOTHING;

-- -----------------------------------------------------------------------------
-- Step 6: Backfill Reschedule History
-- -----------------------------------------------------------------------------
INSERT INTO demo_booking_reschedule_history (
    id,
    booking_id,
    previous_date,
    new_date,
    reason,
    rescheduled_by_user_id,
    rescheduled_at
)
SELECT
    substr(md5(rh.id || ':reschedule'), 1, 8) || '-' ||
    substr(md5(rh.id || ':reschedule'), 9, 4) || '-' ||
    substr(md5(rh.id || ':reschedule'), 13, 4) || '-' ||
    substr(md5(rh.id || ':reschedule'), 17, 4) || '-' ||
    substr(md5(rh.id || ':reschedule'), 21, 12) AS id,
    b.id AS booking_id,
    rh.previous_scheduled_at,
    rh.new_scheduled_at,
    rh.reason,
    rh.rescheduled_by_user_id,
    rh.rescheduled_at
FROM demo_reschedule_history rh
JOIN demos d ON rh.demo_id = d.id
JOIN demo_bookings b ON b.legacy_demo_id = d.id
ON CONFLICT (id) DO NOTHING;

-- -----------------------------------------------------------------------------
-- Step 7: Postflight Reconciliation Check
-- -----------------------------------------------------------------------------
SELECT
    (SELECT count(*) FROM demos) AS total_legacy_demos,
    (SELECT count(*) FROM demo_bookings WHERE legacy_demo_id IS NOT NULL) AS backfilled_bookings,
    (SELECT count(*) FROM demo_sessions) AS total_sessions,
    (SELECT count(*) FROM demo_session_tutor_assignments) AS total_tutor_assignments,
    (SELECT count(*) FROM demo_feedback_records) AS total_feedbacks,
    (SELECT count(*) FROM demo_booking_reschedule_history) AS total_reschedules;

COMMIT;
