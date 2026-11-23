-- Tutor HR migration 20261123120000_tutor_ready_for_assignment_phase_c (converted from the reviewed prisma/proposed/tutor_ready_for_assignment_phase_c.sql; statements unchanged).
-- Ready for Assignment: nullable tutor_profiles columns; ensures the TUT sequence row exists (insert-only, ON CONFLICT DO NOTHING).
-- Data backfills are NOT part of any migration: they live in prisma/tutor-hr-backfills/ and are run by hand.

-- Tutor Management Step 3: Ready for Assignment and Tutor ID.
-- Run after 20261123110000_tutor_training_phase_b. Additive only: three nullable columns on tutor_profiles.
-- Generated with `prisma migrate diff` from the Step 2 schema to the Step 3 schema.

-- AlterTable
ALTER TABLE "tutor_profiles" ADD COLUMN     "tutor_code" TEXT,
ADD COLUMN     "verified_at" TIMESTAMP(3),
ADD COLUMN     "verified_by_user_id" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "tutor_profiles_tutor_code_key" ON "tutor_profiles"("tutor_code");

-- CreateIndex
CREATE INDEX "tutor_profiles_verified_at_idx" ON "tutor_profiles"("verified_at");

-- AddForeignKey
ALTER TABLE "tutor_profiles" ADD CONSTRAINT "tutor_profiles_verified_by_user_id_fkey" FOREIGN KEY ("verified_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Tutor IDs use the existing TUT sequence (seeded as TUT, padding 4 -> TUT-0001).
-- Ensure it exists without resetting a counter that is already in use.
INSERT INTO "sequences" ("entity_type", "next_number", "prefix", "padding") VALUES ('TUT', 1, 'TUT', 4)
ON CONFLICT ("entity_type") DO NOTHING;

-- Check before go-live: TUT must not already have issued numbers elsewhere.
-- SELECT * FROM "sequences" WHERE "entity_type" = 'TUT';
