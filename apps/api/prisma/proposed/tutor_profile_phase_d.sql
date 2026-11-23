-- PROPOSED, NOT APPLIED. Tutor Management Step 4: tutor profile, statuses, HR internal notes.
-- Run after tutor_ready_for_assignment_phase_c.sql. Additive only: three new status values,
-- three enums and five new tables. No existing row or column is changed.
-- Generated with `prisma migrate diff` from the Step 3 schema to the Step 4 schema.
-- Note: ALTER TYPE ... ADD VALUE cannot be undone without recreating the type.

-- CreateEnum
CREATE TYPE "TutorGender" AS ENUM ('MALE', 'FEMALE', 'OTHER', 'PREFER_NOT_TO_SAY');

-- CreateEnum
CREATE TYPE "TutorMaritalStatus" AS ENUM ('SINGLE', 'MARRIED', 'DIVORCED', 'WIDOWED', 'PREFER_NOT_TO_SAY');

-- CreateEnum
CREATE TYPE "TutorEmergencyContactKind" AS ENUM ('PRIMARY', 'SECONDARY');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "TutorOperationalStatus" ADD VALUE 'PAUSED';
ALTER TYPE "TutorOperationalStatus" ADD VALUE 'SUSPENDED';
ALTER TYPE "TutorOperationalStatus" ADD VALUE 'DISCONTINUED';

-- CreateTable
CREATE TABLE "tutor_status_history" (
    "id" TEXT NOT NULL,
    "tutor_profile_id" TEXT NOT NULL,
    "previous_status" "TutorOperationalStatus",
    "new_status" "TutorOperationalStatus" NOT NULL,
    "reason" TEXT NOT NULL,
    "changed_by_user_id" TEXT NOT NULL,
    "changed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tutor_status_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tutor_personal_details" (
    "tutor_profile_id" TEXT NOT NULL,
    "gender" "TutorGender",
    "marital_status" "TutorMaritalStatus",
    "perm_house" TEXT,
    "perm_village" TEXT,
    "perm_district" TEXT,
    "perm_pin" TEXT,
    "perm_state" TEXT,
    "perm_country" TEXT DEFAULT 'India',
    "current_same_as_permanent" BOOLEAN NOT NULL DEFAULT false,
    "cur_house" TEXT,
    "cur_village" TEXT,
    "cur_district" TEXT,
    "cur_pin" TEXT,
    "cur_state" TEXT,
    "cur_country" TEXT DEFAULT 'India',
    "bank_account_holder" TEXT,
    "bank_name" TEXT,
    "bank_branch" TEXT,
    "bank_account_number" TEXT,
    "bank_ifsc" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tutor_personal_details_pkey" PRIMARY KEY ("tutor_profile_id")
);

-- CreateTable
CREATE TABLE "tutor_emergency_contacts" (
    "id" TEXT NOT NULL,
    "tutor_profile_id" TEXT NOT NULL,
    "kind" "TutorEmergencyContactKind" NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "relationship" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tutor_emergency_contacts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tutor_qualifications" (
    "id" TEXT NOT NULL,
    "tutor_profile_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "institution" TEXT NOT NULL,
    "year_of_completion" INTEGER,
    "certificate_ref" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "removed_at" TIMESTAMP(3),
    "created_by_user_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tutor_qualifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tutor_hr_notes" (
    "id" TEXT NOT NULL,
    "tutor_profile_id" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "created_by_user_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "edited_at" TIMESTAMP(3),

    CONSTRAINT "tutor_hr_notes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tutor_hr_note_revisions" (
    "id" TEXT NOT NULL,
    "note_id" TEXT NOT NULL,
    "previous_body" TEXT NOT NULL,
    "edited_by_user_id" TEXT NOT NULL,
    "edited_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tutor_hr_note_revisions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "tutor_status_history_tutor_profile_id_changed_at_idx" ON "tutor_status_history"("tutor_profile_id", "changed_at");

-- CreateIndex
CREATE UNIQUE INDEX "tutor_emergency_contacts_tutor_profile_id_kind_key" ON "tutor_emergency_contacts"("tutor_profile_id", "kind");

-- CreateIndex
CREATE INDEX "tutor_qualifications_tutor_profile_id_is_active_idx" ON "tutor_qualifications"("tutor_profile_id", "is_active");

-- CreateIndex
CREATE INDEX "tutor_hr_notes_tutor_profile_id_created_at_idx" ON "tutor_hr_notes"("tutor_profile_id", "created_at");

-- CreateIndex
CREATE INDEX "tutor_hr_note_revisions_note_id_idx" ON "tutor_hr_note_revisions"("note_id");

-- CreateIndex
CREATE INDEX "tutor_profiles_tutor_operational_status_idx" ON "tutor_profiles"("tutor_operational_status");

-- AddForeignKey
ALTER TABLE "tutor_status_history" ADD CONSTRAINT "tutor_status_history_tutor_profile_id_fkey" FOREIGN KEY ("tutor_profile_id") REFERENCES "tutor_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tutor_status_history" ADD CONSTRAINT "tutor_status_history_changed_by_user_id_fkey" FOREIGN KEY ("changed_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tutor_personal_details" ADD CONSTRAINT "tutor_personal_details_tutor_profile_id_fkey" FOREIGN KEY ("tutor_profile_id") REFERENCES "tutor_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tutor_emergency_contacts" ADD CONSTRAINT "tutor_emergency_contacts_tutor_profile_id_fkey" FOREIGN KEY ("tutor_profile_id") REFERENCES "tutor_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tutor_qualifications" ADD CONSTRAINT "tutor_qualifications_tutor_profile_id_fkey" FOREIGN KEY ("tutor_profile_id") REFERENCES "tutor_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tutor_qualifications" ADD CONSTRAINT "tutor_qualifications_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tutor_hr_notes" ADD CONSTRAINT "tutor_hr_notes_tutor_profile_id_fkey" FOREIGN KEY ("tutor_profile_id") REFERENCES "tutor_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tutor_hr_notes" ADD CONSTRAINT "tutor_hr_notes_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tutor_hr_note_revisions" ADD CONSTRAINT "tutor_hr_note_revisions_note_id_fkey" FOREIGN KEY ("note_id") REFERENCES "tutor_hr_notes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tutor_hr_note_revisions" ADD CONSTRAINT "tutor_hr_note_revisions_edited_by_user_id_fkey" FOREIGN KEY ("edited_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Mother tongue default for Hiring (confirmed): add Malayalam if no entry exists in any letter case.
INSERT INTO "mother_tongues" ("id", "name", "is_active", "created_at", "updated_at")
SELECT gen_random_uuid()::text, 'Malayalam', true, now(), now()
WHERE NOT EXISTS (SELECT 1 FROM "mother_tongues" WHERE lower("name") = 'malayalam');
