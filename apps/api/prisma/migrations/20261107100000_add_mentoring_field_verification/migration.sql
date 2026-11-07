-- Additive only. Nothing is dropped, renamed, rewritten or backfilled by this migration.
-- NOT APPLIED: prepared for owner review.

-- Who first wrote a Mentoring value. Existing rows stay NULL; readers fall back to updated_by_user_id.
ALTER TABLE "enrollment_handover_fields" ADD COLUMN "created_by_user_id" TEXT;

-- Meeting verification of one handover field, kept apart from the value itself.
CREATE TABLE "enrollment_handover_field_verifications" (
    "id" TEXT NOT NULL,
    "handover_id" TEXT NOT NULL,
    "field_key" TEXT NOT NULL,
    "verified_value" JSONB NOT NULL,
    "note" TEXT,
    "verified_by_user_id" TEXT NOT NULL,
    "verified_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "enrollment_handover_field_verifications_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "enrollment_handover_field_verifications_handover_id_field_key_key"
    ON "enrollment_handover_field_verifications"("handover_id", "field_key");

ALTER TABLE "enrollment_handover_field_verifications"
    ADD CONSTRAINT "enrollment_handover_field_verifications_handover_id_fkey"
    FOREIGN KEY ("handover_id") REFERENCES "enrollment_handovers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
