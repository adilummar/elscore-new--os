-- =============================================================================
-- Phase 1: Additive Demo Module Schema Migration (Multi-Session Architecture)
-- Target: Staging / Production
-- STRICTLY ADDITIVE: Legacy tables 'demos', 'demo_feedback', 'demo_reschedule_history'
-- are 100% PRESERVED to maintain zero-downtime backward compatibility.
-- =============================================================================

-- 1. Create Enums
CREATE TYPE "DemoBookingStatus" AS ENUM ('SCHEDULED', 'ASSIGNED', 'IN_PROGRESS', 'COMPLETED', 'NO_SHOW', 'CANCELLED');
CREATE TYPE "DemoSessionStatus" AS ENUM ('SCHEDULED', 'ASSIGNED', 'IN_PROGRESS', 'COMPLETED', 'NO_SHOW', 'CANCELLED');
CREATE TYPE "DemoParticipantType" AS ENUM ('PARENT', 'COORDINATOR', 'TUTOR');
CREATE TYPE "DemoAttendanceStatus" AS ENUM ('PRESENT', 'ABSENT', 'LATE');
CREATE TYPE "TutorAssignmentStatus" AS ENUM ('ACTIVE', 'REPLACED', 'CANCELLED');
CREATE TYPE "DemoSessionExceptionCategory" AS ENUM ('WAIVER', 'REPLACEMENT_SCHEDULED', 'PARENT_DECLINED_SUBJECT');
CREATE TYPE "DemoExceptionStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- 2. Create RoundRobinCoordinatorState Table
CREATE TABLE "round_robin_coordinator_state" (
    "user_id" TEXT NOT NULL,
    "is_eligible" BOOLEAN NOT NULL DEFAULT true,
    "daily_state" "RoundRobinDailyState" NOT NULL DEFAULT 'ACTIVE',
    "current_load" INTEGER NOT NULL DEFAULT 0,
    "last_returned_at" TIMESTAMP(3),
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "round_robin_coordinator_state_pkey" PRIMARY KEY ("user_id")
);

-- 3. Create DemoBookings Table
CREATE TABLE "demo_bookings" (
    "id" TEXT NOT NULL,
    "business_id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "lead_id" TEXT NOT NULL,
    "coordinator_id" TEXT,
    "booked_by_user_id" TEXT NOT NULL,
    "status" "DemoBookingStatus" NOT NULL DEFAULT 'SCHEDULED',
    "scheduled_date" TIMESTAMP(3) NOT NULL,
    "total_duration_minutes" INTEGER NOT NULL,
    "legacy_demo_id" TEXT,
    "cancelled_at" TIMESTAMP(3),
    "cancel_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "demo_bookings_pkey" PRIMARY KEY ("id")
);

-- 4. Create DemoSessions Table
CREATE TABLE "demo_sessions" (
    "id" TEXT NOT NULL,
    "booking_id" TEXT NOT NULL,
    "session_order" INTEGER NOT NULL DEFAULT 1,
    "requirement_id" TEXT NOT NULL,
    "subject_id" TEXT NOT NULL,
    "curriculum_id" TEXT NOT NULL,
    "grade_id" TEXT NOT NULL,
    "status" "DemoSessionStatus" NOT NULL DEFAULT 'SCHEDULED',
    "scheduled_start" TIMESTAMP(3) NOT NULL,
    "scheduled_end" TIMESTAMP(3) NOT NULL,
    "duration_minutes" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "demo_sessions_pkey" PRIMARY KEY ("id")
);

-- 5. Create DemoSessionTutorAssignments Table
CREATE TABLE "demo_session_tutor_assignments" (
    "id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "tutor_id" TEXT NOT NULL,
    "assignment_sequence" INTEGER NOT NULL DEFAULT 1,
    "status" "TutorAssignmentStatus" NOT NULL DEFAULT 'ACTIVE',
    "assigned_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "assigned_by_user_id" TEXT NOT NULL,
    "replaced_at" TIMESTAMP(3),
    "replacement_reason" TEXT,
    "replaced_by_user_id" TEXT,

    CONSTRAINT "demo_session_tutor_assignments_pkey" PRIMARY KEY ("id")
);

-- 6. Create DemoSessionExceptions Table
CREATE TABLE "demo_session_exceptions" (
    "id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "exception_category" "DemoSessionExceptionCategory" NOT NULL,
    "resolution_status" "DemoExceptionStatus" NOT NULL DEFAULT 'PENDING',
    "reason" TEXT NOT NULL,
    "requested_by_user_id" TEXT NOT NULL,
    "requested_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewed_by_user_id" TEXT,
    "reviewed_at" TIMESTAMP(3),
    "review_notes" TEXT,
    "replacement_session_id" TEXT,

    CONSTRAINT "demo_session_exceptions_pkey" PRIMARY KEY ("id")
);

-- 7. Create DemoAttendances Table
CREATE TABLE "demo_attendances" (
    "id" TEXT NOT NULL,
    "booking_id" TEXT NOT NULL,
    "session_id" TEXT,
    "assignment_id" TEXT,
    "participant_type" "DemoParticipantType" NOT NULL,
    "user_id" TEXT,
    "status" "DemoAttendanceStatus" NOT NULL DEFAULT 'PRESENT',
    "is_corrected" BOOLEAN NOT NULL DEFAULT false,
    "correction_reason" TEXT,
    "corrected_by_user_id" TEXT,
    "corrected_at" TIMESTAMP(3),
    "marked_by_user_id" TEXT NOT NULL,
    "marked_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "remarks" TEXT,

    CONSTRAINT "demo_attendances_pkey" PRIMARY KEY ("id")
);

-- 8. Create DemoFeedbackRecords Table
CREATE TABLE "demo_feedback_records" (
    "id" TEXT NOT NULL,
    "booking_id" TEXT NOT NULL,
    "rating" INTEGER,
    "comments" TEXT,
    "student_performance" TEXT,
    "strengths" TEXT,
    "weaknesses" TEXT,
    "tutor_recommendations" TEXT,
    "tutor_rating" INTEGER,
    "academic_assessment" TEXT,
    "engagement_level" TEXT,
    "learning_behaviour" TEXT,
    "coordinator_remarks" TEXT,
    "parent_feedback" TEXT,
    "parent_concerns" TEXT,
    "parent_interest_level" TEXT,
    "submitted_by_user_id" TEXT NOT NULL,
    "submitted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "demo_feedback_records_pkey" PRIMARY KEY ("id")
);

-- 9. Create DemoRoadmaps Table
CREATE TABLE "demo_roadmaps" (
    "id" TEXT NOT NULL,
    "booking_id" TEXT NOT NULL,
    "recommendation_plan" TEXT NOT NULL,
    "recommended_class_count" INTEGER NOT NULL,
    "recommended_frequency" TEXT NOT NULL,
    "preferred_duration_minutes" INTEGER NOT NULL,
    "preferred_timing" TEXT NOT NULL,
    "recommended_subjects" JSONB,
    "remarks" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "demo_roadmaps_pkey" PRIMARY KEY ("id")
);

-- 10. Create DemoAcademicPlans Table
CREATE TABLE "demo_academic_plans" (
    "id" TEXT NOT NULL,
    "booking_id" TEXT NOT NULL,
    "learning_goal" TEXT NOT NULL,
    "target_chapters" TEXT NOT NULL,
    "study_approach" TEXT NOT NULL,
    "milestones" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "demo_academic_plans_pkey" PRIMARY KEY ("id")
);

-- 11. Create DemoBookingRescheduleHistory Table
CREATE TABLE "demo_booking_reschedule_history" (
    "id" TEXT NOT NULL,
    "booking_id" TEXT NOT NULL,
    "previous_date" TIMESTAMP(3) NOT NULL,
    "new_date" TIMESTAMP(3) NOT NULL,
    "reason" TEXT NOT NULL,
    "rescheduled_by_user_id" TEXT NOT NULL,
    "rescheduled_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "demo_booking_reschedule_history_pkey" PRIMARY KEY ("id")
);

-- 12. Create Indexes and Constraints
CREATE UNIQUE INDEX "demo_bookings_business_id_key" ON "demo_bookings"("business_id");
CREATE UNIQUE INDEX "demo_bookings_legacy_demo_id_key" ON "demo_bookings"("legacy_demo_id");
CREATE INDEX "demo_bookings_student_id_idx" ON "demo_bookings"("student_id");
CREATE INDEX "demo_bookings_lead_id_idx" ON "demo_bookings"("lead_id");
CREATE INDEX "demo_bookings_coordinator_id_idx" ON "demo_bookings"("coordinator_id");
CREATE INDEX "demo_bookings_status_idx" ON "demo_bookings"("status");
CREATE INDEX "demo_bookings_scheduled_date_idx" ON "demo_bookings"("scheduled_date");

CREATE INDEX "demo_sessions_booking_id_idx" ON "demo_sessions"("booking_id");
CREATE INDEX "demo_sessions_status_idx" ON "demo_sessions"("status");
CREATE INDEX "demo_sessions_scheduled_start_idx" ON "demo_sessions"("scheduled_start");

CREATE INDEX "demo_session_tutor_assignments_session_id_idx" ON "demo_session_tutor_assignments"("session_id");
CREATE INDEX "demo_session_tutor_assignments_tutor_id_idx" ON "demo_session_tutor_assignments"("tutor_id");
CREATE INDEX "demo_session_tutor_assignments_status_idx" ON "demo_session_tutor_assignments"("status");

-- Partial Unique Index: Exactly one ACTIVE tutor assignment per session
CREATE UNIQUE INDEX "unique_active_session_tutor" ON "demo_session_tutor_assignments"("session_id") WHERE "status" = 'ACTIVE';

CREATE INDEX "demo_session_exceptions_session_id_idx" ON "demo_session_exceptions"("session_id");
CREATE INDEX "demo_session_exceptions_resolution_status_idx" ON "demo_session_exceptions"("resolution_status");

CREATE INDEX "demo_attendances_booking_id_idx" ON "demo_attendances"("booking_id");
CREATE INDEX "demo_attendances_session_id_idx" ON "demo_attendances"("session_id");
CREATE INDEX "demo_attendances_assignment_id_idx" ON "demo_attendances"("assignment_id");

-- Partial Unique Index: Booking-level attendance (one per participant type)
CREATE UNIQUE INDEX "unique_booking_level_attendance" ON "demo_attendances"("booking_id", "participant_type") WHERE "session_id" IS NULL;

-- Partial Unique Index: Session-level tutor attendance (one authoritative per assignment)
CREATE UNIQUE INDEX "unique_tutor_assignment_attendance" ON "demo_attendances"("assignment_id") WHERE "participant_type" = 'TUTOR' AND "assignment_id" IS NOT NULL;

CREATE UNIQUE INDEX "demo_feedback_records_booking_id_key" ON "demo_feedback_records"("booking_id");
CREATE UNIQUE INDEX "demo_roadmaps_booking_id_key" ON "demo_roadmaps"("booking_id");
CREATE UNIQUE INDEX "demo_academic_plans_booking_id_key" ON "demo_academic_plans"("booking_id");

-- 13. Add Foreign Keys
ALTER TABLE "round_robin_coordinator_state" ADD CONSTRAINT "round_robin_coordinator_state_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "demo_bookings" ADD CONSTRAINT "demo_bookings_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "demo_bookings" ADD CONSTRAINT "demo_bookings_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "demo_bookings" ADD CONSTRAINT "demo_bookings_coordinator_id_fkey" FOREIGN KEY ("coordinator_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "demo_bookings" ADD CONSTRAINT "demo_bookings_booked_by_user_id_fkey" FOREIGN KEY ("booked_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "demo_sessions" ADD CONSTRAINT "demo_sessions_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "demo_bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "demo_sessions" ADD CONSTRAINT "demo_sessions_requirement_id_fkey" FOREIGN KEY ("requirement_id") REFERENCES "requirements"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "demo_sessions" ADD CONSTRAINT "demo_sessions_subject_id_fkey" FOREIGN KEY ("subject_id") REFERENCES "subjects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "demo_sessions" ADD CONSTRAINT "demo_sessions_curriculum_id_fkey" FOREIGN KEY ("curriculum_id") REFERENCES "curricula"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "demo_sessions" ADD CONSTRAINT "demo_sessions_grade_id_fkey" FOREIGN KEY ("grade_id") REFERENCES "grades"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "demo_session_tutor_assignments" ADD CONSTRAINT "demo_session_tutor_assignments_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "demo_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "demo_session_tutor_assignments" ADD CONSTRAINT "demo_session_tutor_assignments_tutor_id_fkey" FOREIGN KEY ("tutor_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "demo_session_tutor_assignments" ADD CONSTRAINT "demo_session_tutor_assignments_assigned_by_user_id_fkey" FOREIGN KEY ("assigned_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "demo_session_tutor_assignments" ADD CONSTRAINT "demo_session_tutor_assignments_replaced_by_user_id_fkey" FOREIGN KEY ("replaced_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "demo_session_exceptions" ADD CONSTRAINT "demo_session_exceptions_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "demo_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "demo_session_exceptions" ADD CONSTRAINT "demo_session_exceptions_requested_by_user_id_fkey" FOREIGN KEY ("requested_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "demo_session_exceptions" ADD CONSTRAINT "demo_session_exceptions_reviewed_by_user_id_fkey" FOREIGN KEY ("reviewed_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "demo_session_exceptions" ADD CONSTRAINT "demo_session_exceptions_replacement_session_id_fkey" FOREIGN KEY ("replacement_session_id") REFERENCES "demo_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "demo_attendances" ADD CONSTRAINT "demo_attendances_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "demo_bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "demo_attendances" ADD CONSTRAINT "demo_attendances_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "demo_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "demo_attendances" ADD CONSTRAINT "demo_attendances_assignment_id_fkey" FOREIGN KEY ("assignment_id") REFERENCES "demo_session_tutor_assignments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "demo_attendances" ADD CONSTRAINT "demo_attendances_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "demo_attendances" ADD CONSTRAINT "demo_attendances_marked_by_user_id_fkey" FOREIGN KEY ("marked_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "demo_attendances" ADD CONSTRAINT "demo_attendances_corrected_by_user_id_fkey" FOREIGN KEY ("corrected_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "demo_feedback_records" ADD CONSTRAINT "demo_feedback_records_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "demo_bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "demo_feedback_records" ADD CONSTRAINT "demo_feedback_records_submitted_by_user_id_fkey" FOREIGN KEY ("submitted_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "demo_roadmaps" ADD CONSTRAINT "demo_roadmaps_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "demo_bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "demo_academic_plans" ADD CONSTRAINT "demo_academic_plans_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "demo_bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "demo_booking_reschedule_history" ADD CONSTRAINT "demo_booking_reschedule_history_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "demo_bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "demo_booking_reschedule_history" ADD CONSTRAINT "demo_booking_reschedule_history_rescheduled_by_user_id_fkey" FOREIGN KEY ("rescheduled_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
