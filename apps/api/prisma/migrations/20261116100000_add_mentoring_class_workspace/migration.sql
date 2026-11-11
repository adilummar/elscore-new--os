-- Additive only. Nothing is dropped, renamed, rewritten or backfilled by this migration.
-- NOT APPLIED: prepared for owner review (Mentoring Stage D: class workspace, post-class activities, voice recordings,
-- message templates and sharing records, class Meet link, cancellation and verification exceptions).
-- Backward compatible: one new enum value, new nullable columns, four new tables. Existing classes are unchanged.

-- A cancelled class. The new value is not used anywhere in this migration, so it is safe inside the transaction.
ALTER TYPE "MentoringClassStatus" ADD VALUE IF NOT EXISTS 'CANCELLED';

ALTER TABLE "mentoring_class_sessions"
    ADD COLUMN "meet_link" TEXT,
    ADD COLUMN "cancelled_at" TIMESTAMP(3),
    ADD COLUMN "cancelled_by_user_id" TEXT,
    ADD COLUMN "cancel_reason" TEXT,
    ADD COLUMN "exception_status" TEXT,
    ADD COLUMN "exception_requested_at" TIMESTAMP(3),
    ADD COLUMN "exception_requested_by_user_id" TEXT,
    ADD COLUMN "exception_reason" TEXT,
    ADD COLUMN "exception_decided_at" TIMESTAMP(3),
    ADD COLUMN "exception_decided_by_user_id" TEXT,
    ADD COLUMN "exception_decision_note" TEXT;

ALTER TABLE "mentoring_class_sessions"
    -- a cancellation has a time and a reason together, or neither
    ADD CONSTRAINT "mentoring_class_sessions_cancel_check" CHECK (("cancelled_at" IS NULL) = ("cancel_reason" IS NULL)),
    ADD CONSTRAINT "mentoring_class_sessions_exception_status_check" CHECK ("exception_status" IS NULL OR "exception_status" IN ('REQUESTED', 'APPROVED', 'REJECTED')),
    -- an exception is requested with a reason; it is decided by someone, at a time, who is not the person who asked
    ADD CONSTRAINT "mentoring_class_sessions_exception_request_check" CHECK ("exception_status" IS NULL OR ("exception_requested_at" IS NOT NULL AND "exception_requested_by_user_id" IS NOT NULL AND length(btrim("exception_reason")) > 0)),
    ADD CONSTRAINT "mentoring_class_sessions_exception_decision_check" CHECK (
        "exception_status" IS DISTINCT FROM 'APPROVED' AND "exception_status" IS DISTINCT FROM 'REJECTED'
        OR ("exception_decided_at" IS NOT NULL AND "exception_decided_by_user_id" IS NOT NULL AND "exception_decided_by_user_id" <> "exception_requested_by_user_id")
    );

CREATE TABLE "mentoring_class_activities" (
    "id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "title" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "type_description" TEXT,
    "topic" TEXT,
    "instructions" TEXT NOT NULL,
    "due_date" DATE,
    "created_by_user_id" TEXT NOT NULL,
    "shared_at" TIMESTAMP(3),
    "shared_by_user_id" TEXT,
    "student_response" TEXT,
    "responded_at" TIMESTAMP(3),
    "responded_by_user_id" TEXT,
    "completion" TEXT NOT NULL DEFAULT 'PENDING',
    "completion_updated_at" TIMESTAMP(3),
    "completion_updated_by_user_id" TEXT,
    "tutor_remarks" TEXT,
    "mentor_remarks" TEXT,
    "removed_at" TIMESTAMP(3),
    "removed_by_user_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "mentoring_class_activities_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "mentoring_class_activities_type_check" CHECK ("type" IN ('EDUCATIONAL_GAME', 'WORKSHEET', 'PRACTICE_QUESTIONS', 'READING', 'WRITING', 'REVISION', 'QUIZ', 'PROBLEM_SOLVING', 'GROUP_DISCUSSION', 'PRACTICAL', 'HOMEWORK', 'PROJECT', 'OTHER')),
    CONSTRAINT "mentoring_class_activities_completion_check" CHECK ("completion" IN ('PENDING', 'IN_PROGRESS', 'COMPLETED', 'NOT_COMPLETED')),
    -- sharing is a person at a time
    CONSTRAINT "mentoring_class_activities_shared_check" CHECK (("shared_at" IS NULL) = ("shared_by_user_id" IS NULL))
);
CREATE INDEX "mentoring_class_activities_session_id_removed_at_idx" ON "mentoring_class_activities"("session_id", "removed_at");
ALTER TABLE "mentoring_class_activities" ADD CONSTRAINT "mentoring_class_activities_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "mentoring_class_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "mentoring_class_attachments" (
    "id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'VOICE',
    "file_key" TEXT NOT NULL,
    "file_name" TEXT NOT NULL,
    "file_size" INTEGER NOT NULL,
    "mime_type" TEXT NOT NULL,
    "uploaded_by_user_id" TEXT NOT NULL,
    "shared_at" TIMESTAMP(3),
    "shared_by_user_id" TEXT,
    "mentor_verified_at" TIMESTAMP(3),
    "mentor_verified_by_user_id" TEXT,
    "mentor_remarks" TEXT,
    "superseded_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mentoring_class_attachments_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "mentoring_class_attachments_kind_check" CHECK ("kind" IN ('VOICE')),
    CONSTRAINT "mentoring_class_attachments_mime_check" CHECK ("mime_type" IN ('audio/mpeg', 'audio/mp4', 'audio/ogg', 'audio/webm', 'audio/wav', 'audio/aac', 'audio/amr')),
    CONSTRAINT "mentoring_class_attachments_size_check" CHECK ("file_size" > 0 AND "file_size" <= 15728640),
    CONSTRAINT "mentoring_class_attachments_shared_check" CHECK (("shared_at" IS NULL) = ("shared_by_user_id" IS NULL)),
    CONSTRAINT "mentoring_class_attachments_verified_check" CHECK (("mentor_verified_at" IS NULL) = ("mentor_verified_by_user_id" IS NULL))
);
CREATE UNIQUE INDEX "mentoring_class_attachments_file_key_key" ON "mentoring_class_attachments"("file_key");
CREATE INDEX "mentoring_class_attachments_session_id_superseded_at_idx" ON "mentoring_class_attachments"("session_id", "superseded_at");
ALTER TABLE "mentoring_class_attachments" ADD CONSTRAINT "mentoring_class_attachments_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "mentoring_class_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "mentoring_message_templates" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "placeholders" TEXT[],
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "updated_by_user_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "mentoring_message_templates_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "mentoring_message_templates_key_key" ON "mentoring_message_templates"("key");

CREATE TABLE "mentoring_message_shares" (
    "id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "template_key" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "prepared_by_user_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "copied_at" TIMESTAMP(3),
    "copied_by_user_id" TEXT,
    "confirmed_at" TIMESTAMP(3),
    "confirmed_by_user_id" TEXT,

    CONSTRAINT "mentoring_message_shares_pkey" PRIMARY KEY ("id"),
    -- confirmed sharing is a person at a time
    CONSTRAINT "mentoring_message_shares_confirmed_check" CHECK (("confirmed_at" IS NULL) = ("confirmed_by_user_id" IS NULL))
);
CREATE INDEX "mentoring_message_shares_session_id_template_key_idx" ON "mentoring_message_shares"("session_id", "template_key");
ALTER TABLE "mentoring_message_shares" ADD CONSTRAINT "mentoring_message_shares_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "mentoring_class_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
