-- Additive only. Nothing is dropped, renamed, rewritten or backfilled by this migration.
-- NOT APPLIED: prepared for owner review (Mentoring operations, increment 1: response-time targets and reminders).
-- Backward compatible: no existing table or column changes, so the current application keeps working before and after.

-- 1. Response-time policies. Rows are optional: the application falls back to two working hours when a key has no row.
CREATE TABLE "mentoring_sla_policies" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "target_minutes" INTEGER NOT NULL DEFAULT 120,
    "mode" TEXT NOT NULL DEFAULT 'WORKING_HOURS',
    "measure" TEXT NOT NULL DEFAULT 'COMPLETION',
    "approaching_percent" INTEGER NOT NULL DEFAULT 75,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "updated_by_user_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "mentoring_sla_policies_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "mentoring_sla_policies_target_check" CHECK ("target_minutes" > 0),
    CONSTRAINT "mentoring_sla_policies_mode_check" CHECK ("mode" IN ('WORKING_HOURS', 'CALENDAR')),
    CONSTRAINT "mentoring_sla_policies_measure_check" CHECK ("measure" IN ('FIRST_RESPONSE', 'COMPLETION')),
    CONSTRAINT "mentoring_sla_policies_percent_check" CHECK ("approaching_percent" BETWEEN 1 AND 99)
);
CREATE UNIQUE INDEX "mentoring_sla_policies_key_key" ON "mentoring_sla_policies"("key");

-- 2. Items with a response target.
CREATE TYPE "MentoringSlaItemStatus" AS ENUM ('OPEN', 'COMPLETED', 'CANCELLED');

CREATE TABLE "mentoring_sla_items" (
    "id" TEXT NOT NULL,
    "policy_key" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT NOT NULL,
    "activation_id" TEXT,
    "responsible_user_id" TEXT,
    "current_key" TEXT,
    "status" "MentoringSlaItemStatus" NOT NULL DEFAULT 'OPEN',
    "started_at" TIMESTAMP(3) NOT NULL,
    "due_at" TIMESTAMP(3) NOT NULL,
    "target_minutes" INTEGER NOT NULL,
    "first_response_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "mentoring_sla_items_pkey" PRIMARY KEY ("id"),
    -- an open item has a key, anything else does not; a completed item has a completion time
    CONSTRAINT "mentoring_sla_items_key_check" CHECK (("status" = 'OPEN') = ("current_key" IS NOT NULL)),
    CONSTRAINT "mentoring_sla_items_completed_check" CHECK (("status" = 'COMPLETED') = ("completed_at" IS NOT NULL) OR "status" = 'CANCELLED'),
    CONSTRAINT "mentoring_sla_items_due_check" CHECK ("due_at" >= "started_at")
);
CREATE UNIQUE INDEX "mentoring_sla_items_current_key_key" ON "mentoring_sla_items"("current_key");
CREATE INDEX "mentoring_sla_items_activation_id_status_idx" ON "mentoring_sla_items"("activation_id", "status");
CREATE INDEX "mentoring_sla_items_policy_key_status_due_at_idx" ON "mentoring_sla_items"("policy_key", "status", "due_at");
CREATE INDEX "mentoring_sla_items_responsible_user_id_status_idx" ON "mentoring_sla_items"("responsible_user_id", "status");

-- 3. Reminders. SENT or ACKNOWLEDGED needs the notification that proves delivery.
CREATE TYPE "MentoringReminderStatus" AS ENUM ('PREPARED', 'SENT', 'ACKNOWLEDGED', 'CANCELLED');

CREATE TABLE "mentoring_reminders" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT NOT NULL,
    "activation_id" TEXT,
    "recipient_user_id" TEXT NOT NULL,
    "status" "MentoringReminderStatus" NOT NULL DEFAULT 'PREPARED',
    "current_key" TEXT,
    "scheduled_for" TIMESTAMP(3),
    "message" TEXT NOT NULL,
    "prepared_by_user_id" TEXT NOT NULL,
    "prepared_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sent_at" TIMESTAMP(3),
    "sent_by_user_id" TEXT,
    "notification_id" TEXT,
    "acknowledged_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "mentoring_reminders_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "mentoring_reminders_evidence_check" CHECK (
        ("status" IN ('SENT', 'ACKNOWLEDGED')) = ("notification_id" IS NOT NULL AND "sent_at" IS NOT NULL)
        OR "status" = 'CANCELLED'
    ),
    CONSTRAINT "mentoring_reminders_ack_check" CHECK (("status" = 'ACKNOWLEDGED') = ("acknowledged_at" IS NOT NULL) OR "status" = 'CANCELLED'),
    CONSTRAINT "mentoring_reminders_key_check" CHECK (("status" <> 'CANCELLED') = ("current_key" IS NOT NULL))
);
CREATE UNIQUE INDEX "mentoring_reminders_current_key_key" ON "mentoring_reminders"("current_key");
CREATE INDEX "mentoring_reminders_recipient_user_id_status_idx" ON "mentoring_reminders"("recipient_user_id", "status");
CREATE INDEX "mentoring_reminders_entity_type_entity_id_idx" ON "mentoring_reminders"("entity_type", "entity_id");
CREATE INDEX "mentoring_reminders_activation_id_idx" ON "mentoring_reminders"("activation_id");
