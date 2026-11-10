-- Additive only. Nothing is dropped, renamed, rewritten or backfilled by this migration.
-- NOT APPLIED: prepared for owner review (Mentoring operations, increment 5: parent complaints logged by the Mentor).
-- Backward compatible: two new tables, no existing table or column changes.

CREATE TABLE "mentoring_complaints" (
    "id" TEXT NOT NULL,
    "activation_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "priority" TEXT NOT NULL DEFAULT 'NORMAL',
    "channel" TEXT NOT NULL,
    "parent_name" TEXT NOT NULL,
    "received_at" TIMESTAMP(3) NOT NULL,
    "logged_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "logged_by_user_id" TEXT NOT NULL,
    "subject_id" TEXT,
    "tutor_user_id" TEXT,
    "supporting_note" TEXT,
    "status" TEXT NOT NULL DEFAULT 'NEW',
    "assigned_to_user_id" TEXT,
    "assigned_at" TIMESTAMP(3),
    "escalated_at" TIMESTAMP(3),
    "acknowledged_at" TIMESTAMP(3),
    "acknowledged_by_user_id" TEXT,
    "acknowledged_channel" TEXT,
    "acknowledged_note" TEXT,
    "first_response_at" TIMESTAMP(3),
    "resolved_at" TIMESTAMP(3),
    "resolved_by_user_id" TEXT,
    "resolution_date" DATE,
    "resolution_remarks" TEXT,
    "resolution_how" TEXT,
    "parent_communication" TEXT,
    "parent_communication_note" TEXT,
    "reopen_count" INTEGER NOT NULL DEFAULT 0,
    "last_reopened_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "mentoring_complaints_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "mentoring_complaints_category_check" CHECK ("category" IN ('TUTOR', 'TIMETABLE', 'PAYMENT', 'ACADEMIC_PROGRESS', 'OTHER')),
    CONSTRAINT "mentoring_complaints_priority_check" CHECK ("priority" IN ('LOW', 'NORMAL', 'HIGH', 'URGENT')),
    CONSTRAINT "mentoring_complaints_channel_check" CHECK ("channel" IN ('PHONE', 'WHATSAPP', 'EMAIL', 'IN_PERSON', 'OTHER')),
    CONSTRAINT "mentoring_complaints_status_check" CHECK ("status" IN ('NEW', 'ACKNOWLEDGED', 'ASSIGNED', 'IN_PROGRESS', 'WAITING_FOR_PARENT', 'WAITING_FOR_TUTOR', 'RESOLVED', 'REOPENED')),
    CONSTRAINT "mentoring_complaints_communication_check" CHECK ("parent_communication" IS NULL OR "parent_communication" IN ('INFORMED', 'NOT_YET_INFORMED', 'NOT_REACHABLE')),
    -- a complaint cannot be resolved without its explanation, the date, who resolved it and what the parent was told
    CONSTRAINT "mentoring_complaints_resolved_check" CHECK (
        "status" <> 'RESOLVED'
        OR ("resolved_at" IS NOT NULL
            AND "resolved_by_user_id" IS NOT NULL
            AND "resolution_date" IS NOT NULL
            AND length(btrim("resolution_remarks")) > 0
            AND length(btrim("resolution_how")) > 0
            AND "parent_communication" IS NOT NULL)
    )
);
CREATE INDEX "mentoring_complaints_activation_id_status_idx" ON "mentoring_complaints"("activation_id", "status");
CREATE INDEX "mentoring_complaints_assigned_to_user_id_status_idx" ON "mentoring_complaints"("assigned_to_user_id", "status");
CREATE INDEX "mentoring_complaints_status_received_at_idx" ON "mentoring_complaints"("status", "received_at");
ALTER TABLE "mentoring_complaints" ADD CONSTRAINT "mentoring_complaints_activation_id_fkey" FOREIGN KEY ("activation_id") REFERENCES "mentoring_activations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "mentoring_complaint_entries" (
    "id" TEXT NOT NULL,
    "complaint_id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "visibility" TEXT NOT NULL DEFAULT 'INTERNAL',
    "text" TEXT,
    "actor_user_id" TEXT,
    "payload" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mentoring_complaint_entries_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "mentoring_complaint_entries_visibility_check" CHECK ("visibility" IN ('INTERNAL', 'PARENT'))
);
CREATE INDEX "mentoring_complaint_entries_complaint_id_created_at_idx" ON "mentoring_complaint_entries"("complaint_id", "created_at");
ALTER TABLE "mentoring_complaint_entries" ADD CONSTRAINT "mentoring_complaint_entries_complaint_id_fkey" FOREIGN KEY ("complaint_id") REFERENCES "mentoring_complaints"("id") ON DELETE CASCADE ON UPDATE CASCADE;
