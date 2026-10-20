-- ==============================================================================
-- Migration: 20261020_demo_operations_workflow
-- Description: Additive, idempotent schema updates for Stage-Driven Demo Operations
-- ==============================================================================

-- 1. Create Enums with idempotent duplicate_object guard
DO $$ BEGIN
    CREATE TYPE "DemoOperationalStage" AS ENUM (
        'VALID_DEMO',
        'PREPARATION',
        'TUTOR_ASSIGNED',
        'LINK_SHARED',
        'PARENT_CONFIRMATION',
        'COMPLETED',
        'NOT_SHOW',
        'CANCELLED',
        'RESCHEDULED'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE "ParentConfirmationChannel" AS ENUM (
        'WHATSAPP_CHAT',
        'PHONE_CALL',
        'EMAIL',
        'OTHER'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- 2. Add columns to demo_bookings if not exists
ALTER TABLE "demo_bookings" 
  ADD COLUMN IF NOT EXISTS "operational_stage" "DemoOperationalStage" NOT NULL DEFAULT 'VALID_DEMO',
  ADD COLUMN IF NOT EXISTS "is_rescheduled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "preparation_notes" TEXT,
  ADD COLUMN IF NOT EXISTS "preparation_completed_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "prepared_by_user_id" TEXT,
  ADD COLUMN IF NOT EXISTS "meeting_link" TEXT,
  ADD COLUMN IF NOT EXISTS "meeting_platform" TEXT,
  ADD COLUMN IF NOT EXISTS "meeting_passcode" TEXT,
  ADD COLUMN IF NOT EXISTS "link_shared_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "link_shared_by_user_id" TEXT,
  ADD COLUMN IF NOT EXISTS "parent_confirmed_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "parent_confirmed_by_user_id" TEXT,
  ADD COLUMN IF NOT EXISTS "confirmation_channel" "ParentConfirmationChannel",
  ADD COLUMN IF NOT EXISTS "confirmation_notes" TEXT,
  ADD COLUMN IF NOT EXISTS "whatsapp_opened_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "whatsapp_opened_by_user_id" TEXT;

-- 3. Add columns to demo_sessions if not exists
ALTER TABLE "demo_sessions"
  ADD COLUMN IF NOT EXISTS "is_rescheduled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "meeting_link" TEXT,
  ADD COLUMN IF NOT EXISTS "meeting_platform" TEXT,
  ADD COLUMN IF NOT EXISTS "link_shared_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "link_shared_by_user_id" TEXT;

-- 4. Create Table demo_meeting_link_history if not exists
CREATE TABLE IF NOT EXISTS "demo_meeting_link_history" (
    "id" TEXT NOT NULL,
    "booking_id" TEXT NOT NULL,
    "session_id" TEXT,
    "meeting_link" TEXT NOT NULL,
    "meeting_platform" TEXT,
    "version_number" INTEGER NOT NULL DEFAULT 1,
    "reason" TEXT,
    "shared_by_user_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "demo_meeting_link_history_pkey" PRIMARY KEY ("id")
);

-- 5. Create Table demo_operational_stage_history if not exists
CREATE TABLE IF NOT EXISTS "demo_operational_stage_history" (
    "id" TEXT NOT NULL,
    "booking_id" TEXT NOT NULL,
    "session_id" TEXT,
    "previous_stage" "DemoOperationalStage",
    "new_stage" "DemoOperationalStage" NOT NULL,
    "changed_by_user_id" TEXT NOT NULL,
    "reason" TEXT,
    "changed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "demo_operational_stage_history_pkey" PRIMARY KEY ("id")
);

-- 6. Create Indexes if not exists
CREATE INDEX IF NOT EXISTS "demo_bookings_operational_stage_idx" ON "demo_bookings"("operational_stage");
CREATE INDEX IF NOT EXISTS "demo_bookings_coordinator_id_operational_stage_idx" ON "demo_bookings"("coordinator_id", "operational_stage");
CREATE INDEX IF NOT EXISTS "demo_bookings_booked_by_user_id_operational_stage_idx" ON "demo_bookings"("booked_by_user_id", "operational_stage");

CREATE INDEX IF NOT EXISTS "demo_meeting_link_history_booking_id_idx" ON "demo_meeting_link_history"("booking_id");
CREATE INDEX IF NOT EXISTS "demo_meeting_link_history_session_id_idx" ON "demo_meeting_link_history"("session_id");

CREATE INDEX IF NOT EXISTS "demo_operational_stage_history_booking_id_idx" ON "demo_operational_stage_history"("booking_id");
CREATE INDEX IF NOT EXISTS "demo_operational_stage_history_session_id_idx" ON "demo_operational_stage_history"("session_id");
CREATE INDEX IF NOT EXISTS "demo_operational_stage_history_new_stage_idx" ON "demo_operational_stage_history"("new_stage");

-- 7. Add Foreign Keys with idempotent guard blocks
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'demo_bookings_prepared_by_user_id_fkey') THEN
        ALTER TABLE "demo_bookings" ADD CONSTRAINT "demo_bookings_prepared_by_user_id_fkey" FOREIGN KEY ("prepared_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'demo_bookings_link_shared_by_user_id_fkey') THEN
        ALTER TABLE "demo_bookings" ADD CONSTRAINT "demo_bookings_link_shared_by_user_id_fkey" FOREIGN KEY ("link_shared_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'demo_bookings_parent_confirmed_by_user_id_fkey') THEN
        ALTER TABLE "demo_bookings" ADD CONSTRAINT "demo_bookings_parent_confirmed_by_user_id_fkey" FOREIGN KEY ("parent_confirmed_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'demo_bookings_whatsapp_opened_by_user_id_fkey') THEN
        ALTER TABLE "demo_bookings" ADD CONSTRAINT "demo_bookings_whatsapp_opened_by_user_id_fkey" FOREIGN KEY ("whatsapp_opened_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'demo_sessions_link_shared_by_user_id_fkey') THEN
        ALTER TABLE "demo_sessions" ADD CONSTRAINT "demo_sessions_link_shared_by_user_id_fkey" FOREIGN KEY ("link_shared_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'demo_meeting_link_history_booking_id_fkey') THEN
        ALTER TABLE "demo_meeting_link_history" ADD CONSTRAINT "demo_meeting_link_history_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "demo_bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'demo_meeting_link_history_session_id_fkey') THEN
        ALTER TABLE "demo_meeting_link_history" ADD CONSTRAINT "demo_meeting_link_history_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "demo_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'demo_meeting_link_history_shared_by_user_id_fkey') THEN
        ALTER TABLE "demo_meeting_link_history" ADD CONSTRAINT "demo_meeting_link_history_shared_by_user_id_fkey" FOREIGN KEY ("shared_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'demo_operational_stage_history_booking_id_fkey') THEN
        ALTER TABLE "demo_operational_stage_history" ADD CONSTRAINT "demo_operational_stage_history_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "demo_bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'demo_operational_stage_history_session_id_fkey') THEN
        ALTER TABLE "demo_operational_stage_history" ADD CONSTRAINT "demo_operational_stage_history_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "demo_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'demo_operational_stage_history_changed_by_user_id_fkey') THEN
        ALTER TABLE "demo_operational_stage_history" ADD CONSTRAINT "demo_operational_stage_history_changed_by_user_id_fkey" FOREIGN KEY ("changed_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
    END IF;
END $$;

-- 8. Deterministic Backfill for Existing Demo Records
-- Ensure completed, cancelled, no-show, and rescheduled legacy bookings are not left with default VALID_DEMO
UPDATE "demo_bookings"
SET "operational_stage" = 'COMPLETED'
WHERE "status" = 'COMPLETED' AND "operational_stage" = 'VALID_DEMO';

UPDATE "demo_bookings"
SET "operational_stage" = 'CANCELLED'
WHERE "status" = 'CANCELLED' AND "operational_stage" = 'VALID_DEMO';

UPDATE "demo_bookings"
SET "operational_stage" = 'NOT_SHOW'
WHERE "status" = 'NO_SHOW' AND "operational_stage" = 'VALID_DEMO';

-- Backfill rescheduled flag and stage from reschedule history if present
UPDATE "demo_bookings"
SET "is_rescheduled" = true,
    "operational_stage" = 'RESCHEDULED'
WHERE EXISTS (
    SELECT 1 FROM "demo_booking_reschedule_history" h
    WHERE h."booking_id" = "demo_bookings"."id"
) AND "operational_stage" = 'VALID_DEMO' AND "status" NOT IN ('COMPLETED', 'CANCELLED', 'NO_SHOW');
