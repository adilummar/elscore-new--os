-- PROPOSED, NOT APPLIED. Tutor Management Step 5: Tutor Coordinator (assignments, observations).
-- Run after tutor_profile_phase_d.sql. Additive only: two nullable tutor_profiles columns and three
-- new tables. The TUTOR_COORDINATOR role and its permissions come from prisma/seed.ts (re-run the seed).
-- Generated with `prisma migrate diff` from the Step 4 schema to the Step 5 schema.

-- AlterTable
ALTER TABLE "tutor_profiles" ADD COLUMN     "coordinator_assigned_at" TIMESTAMP(3),
ADD COLUMN     "coordinator_user_id" TEXT;

-- CreateTable
CREATE TABLE "tutor_coordinator_assignments" (
    "id" TEXT NOT NULL,
    "tutor_profile_id" TEXT NOT NULL,
    "from_user_id" TEXT,
    "to_user_id" TEXT,
    "reason" TEXT,
    "changed_by_user_id" TEXT NOT NULL,
    "changed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tutor_coordinator_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tutor_observations" (
    "id" TEXT NOT NULL,
    "tutor_profile_id" TEXT NOT NULL,
    "author_user_id" TEXT NOT NULL,
    "observed_at" TIMESTAMP(3) NOT NULL,
    "positive_feedback" TEXT,
    "negative_feedback" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "edited_at" TIMESTAMP(3),
    "hidden_at" TIMESTAMP(3),
    "hidden_by_user_id" TEXT,
    "hidden_reason" TEXT,

    CONSTRAINT "tutor_observations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tutor_observation_revisions" (
    "id" TEXT NOT NULL,
    "observation_id" TEXT NOT NULL,
    "previous_observed_at" TIMESTAMP(3) NOT NULL,
    "previous_positive_feedback" TEXT,
    "previous_negative_feedback" TEXT,
    "new_observed_at" TIMESTAMP(3) NOT NULL,
    "new_positive_feedback" TEXT,
    "new_negative_feedback" TEXT,
    "edited_by_user_id" TEXT NOT NULL,
    "edited_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tutor_observation_revisions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "tutor_coordinator_assignments_tutor_profile_id_changed_at_idx" ON "tutor_coordinator_assignments"("tutor_profile_id", "changed_at");

-- CreateIndex
CREATE INDEX "tutor_observations_tutor_profile_id_observed_at_idx" ON "tutor_observations"("tutor_profile_id", "observed_at");

-- CreateIndex
CREATE INDEX "tutor_observation_revisions_observation_id_idx" ON "tutor_observation_revisions"("observation_id");

-- CreateIndex
CREATE INDEX "tutor_profiles_coordinator_user_id_idx" ON "tutor_profiles"("coordinator_user_id");

-- AddForeignKey
ALTER TABLE "tutor_profiles" ADD CONSTRAINT "tutor_profiles_coordinator_user_id_fkey" FOREIGN KEY ("coordinator_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tutor_coordinator_assignments" ADD CONSTRAINT "tutor_coordinator_assignments_tutor_profile_id_fkey" FOREIGN KEY ("tutor_profile_id") REFERENCES "tutor_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tutor_coordinator_assignments" ADD CONSTRAINT "tutor_coordinator_assignments_from_user_id_fkey" FOREIGN KEY ("from_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tutor_coordinator_assignments" ADD CONSTRAINT "tutor_coordinator_assignments_to_user_id_fkey" FOREIGN KEY ("to_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tutor_coordinator_assignments" ADD CONSTRAINT "tutor_coordinator_assignments_changed_by_user_id_fkey" FOREIGN KEY ("changed_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tutor_observations" ADD CONSTRAINT "tutor_observations_tutor_profile_id_fkey" FOREIGN KEY ("tutor_profile_id") REFERENCES "tutor_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tutor_observations" ADD CONSTRAINT "tutor_observations_author_user_id_fkey" FOREIGN KEY ("author_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tutor_observations" ADD CONSTRAINT "tutor_observations_hidden_by_user_id_fkey" FOREIGN KEY ("hidden_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tutor_observation_revisions" ADD CONSTRAINT "tutor_observation_revisions_observation_id_fkey" FOREIGN KEY ("observation_id") REFERENCES "tutor_observations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tutor_observation_revisions" ADD CONSTRAINT "tutor_observation_revisions_edited_by_user_id_fkey" FOREIGN KEY ("edited_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

