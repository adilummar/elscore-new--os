-- CreateEnum
CREATE TYPE "DepartmentStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'SUSPENDED', 'PENDING_SETUP');

-- CreateEnum
CREATE TYPE "EmploymentStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'TERMINATED', 'ON_LEAVE');

-- CreateEnum
CREATE TYPE "TutorRecruitmentStageCode" AS ENUM ('LEAD', 'DETAILS_SHARED', 'CV_SHARED', 'CALLED', 'INTERVIEW', 'RECRUITED');

-- CreateEnum
CREATE TYPE "TutorRejectionReason" AS ENUM ('REJECTED', 'NOT_INTERESTED', 'NO_RESPONSE');

-- CreateEnum
CREATE TYPE "TutorOperationalStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "TutorFeedbackType" AS ENUM ('MENTOR_DAILY', 'MENTOR_WEEKLY', 'DEMO_POST');

-- CreateTable
CREATE TABLE "sequences" (
    "entity_type" TEXT NOT NULL,
    "next_number" INTEGER NOT NULL DEFAULT 1,
    "prefix" TEXT NOT NULL,
    "padding" INTEGER NOT NULL DEFAULT 4,

    CONSTRAINT "sequences_pkey" PRIMARY KEY ("entity_type")
);

-- CreateTable
CREATE TABLE "audit_events" (
    "id" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "actor_user_id" TEXT,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "old_value" JSONB,
    "new_value" JSONB,
    "reason" TEXT,
    "correlation_id" TEXT,
    "metadata" JSONB,

    CONSTRAINT "audit_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" TEXT NOT NULL,
    "recipient_user_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "entity_type" TEXT,
    "entity_id" TEXT,
    "action" TEXT,
    "message" TEXT NOT NULL,
    "read_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "departments" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" "DepartmentStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "departments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "roles" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "is_system" BOOLEAN NOT NULL DEFAULT false,
    "is_protected" BOOLEAN NOT NULL DEFAULT false,
    "is_custom" BOOLEAN NOT NULL DEFAULT false,
    "created_by_user_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "permissions" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "resource" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "description" TEXT,
    "is_delegatable" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "role_permissions" (
    "role_id" TEXT NOT NULL,
    "permission_id" TEXT NOT NULL,

    CONSTRAINT "role_permissions_pkey" PRIMARY KEY ("role_id","permission_id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "username" TEXT,
    "password_hash" TEXT NOT NULL,
    "status" "UserStatus" NOT NULL DEFAULT 'PENDING_SETUP',
    "must_change_password" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "last_login_at" TIMESTAMP(3),

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_roles" (
    "user_id" TEXT NOT NULL,
    "role_id" TEXT NOT NULL,
    "granted_by_user_id" TEXT,
    "granted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_roles_pkey" PRIMARY KEY ("user_id","role_id")
);

-- CreateTable
CREATE TABLE "refresh_tokens" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "revoked_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "user_agent" TEXT,
    "ip_address" TEXT,

    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employees" (
    "id" TEXT NOT NULL,
    "business_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "department_id" TEXT NOT NULL,
    "employment_status" "EmploymentStatus" NOT NULL DEFAULT 'ACTIVE',
    "first_name" TEXT NOT NULL,
    "last_name" TEXT NOT NULL,
    "phone" TEXT,
    "joined_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "employees_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_permissions" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "permission_id" TEXT NOT NULL,
    "delegated_by_user_id" TEXT NOT NULL,
    "granted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revoked_at" TIMESTAMP(3),

    CONSTRAINT "user_permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subjects" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "subjects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "grades" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "grades_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "curricula" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "curricula_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tutor_recruitment" (
    "id" TEXT NOT NULL,
    "business_id" TEXT NOT NULL,
    "first_name" TEXT NOT NULL,
    "last_name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "email" TEXT,
    "years_of_experience" INTEGER,
    "expected_hourly_rate" DECIMAL(10,2),
    "subjects_text" TEXT,
    "grades_text" TEXT,
    "curriculum_text" TEXT,
    "availability_text" TEXT,
    "remarks" TEXT,
    "current_stage" "TutorRecruitmentStageCode" NOT NULL DEFAULT 'LEAD',
    "is_rejected" BOOLEAN NOT NULL DEFAULT false,
    "rejection_reason" "TutorRejectionReason",
    "rejected_at" TIMESTAMP(3),
    "employee_id" TEXT,
    "hired_at" TIMESTAMP(3),
    "created_by_user_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tutor_recruitment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tutor_recruitment_stages" (
    "id" TEXT NOT NULL,
    "recruitment_id" TEXT NOT NULL,
    "stage" "TutorRecruitmentStageCode" NOT NULL,
    "entered_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "entered_by_user_id" TEXT NOT NULL,
    "notes" TEXT,

    CONSTRAINT "tutor_recruitment_stages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tutor_interviews" (
    "id" TEXT NOT NULL,
    "recruitment_id" TEXT NOT NULL,
    "conducted_by_user_id" TEXT,
    "scheduled_at" TIMESTAMP(3),
    "conducted_at" TIMESTAMP(3),
    "was_conducted" BOOLEAN NOT NULL DEFAULT false,
    "offered_hourly_rate" DECIMAL(10,2),
    "candidate_accepted" BOOLEAN,
    "interview_notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tutor_interviews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tutor_profiles" (
    "id" TEXT NOT NULL,
    "employee_id" TEXT NOT NULL,
    "source_recruitment_id" TEXT,
    "teaching_experience_years" INTEGER,
    "bio" TEXT,
    "profile_photo_url" TEXT,
    "tutor_operational_status" "TutorOperationalStatus" NOT NULL DEFAULT 'INACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tutor_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tutor_subjects" (
    "id" TEXT NOT NULL,
    "tutor_profile_id" TEXT NOT NULL,
    "subject_id" TEXT NOT NULL,
    "added_by_user_id" TEXT NOT NULL,
    "added_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "removed_at" TIMESTAMP(3),

    CONSTRAINT "tutor_subjects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tutor_grades" (
    "id" TEXT NOT NULL,
    "tutor_profile_id" TEXT NOT NULL,
    "grade_id" TEXT NOT NULL,
    "added_by_user_id" TEXT NOT NULL,
    "added_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "removed_at" TIMESTAMP(3),

    CONSTRAINT "tutor_grades_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tutor_curricula" (
    "id" TEXT NOT NULL,
    "tutor_profile_id" TEXT NOT NULL,
    "curriculum_id" TEXT NOT NULL,
    "added_by_user_id" TEXT NOT NULL,
    "added_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "removed_at" TIMESTAMP(3),

    CONSTRAINT "tutor_curricula_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tutor_availability_slots" (
    "id" TEXT NOT NULL,
    "tutor_profile_id" TEXT NOT NULL,
    "day_of_week" INTEGER NOT NULL,
    "start_time" TIME NOT NULL,
    "end_time" TIME NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_by_user_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deactivated_at" TIMESTAMP(3),

    CONSTRAINT "tutor_availability_slots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tutor_rates" (
    "id" TEXT NOT NULL,
    "tutor_profile_id" TEXT NOT NULL,
    "hourly_rate" DECIMAL(10,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'AED',
    "effective_from" TIMESTAMP(3) NOT NULL,
    "effective_to" TIMESTAMP(3),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "created_by_user_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tutor_rates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tutor_feedback" (
    "id" TEXT NOT NULL,
    "tutor_profile_id" TEXT NOT NULL,
    "feedback_type" "TutorFeedbackType" NOT NULL,
    "given_by_user_id" TEXT NOT NULL,
    "rating" INTEGER,
    "remarks" TEXT,
    "feedback_period_date" DATE NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tutor_feedback_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "audit_events_entity_type_entity_id_idx" ON "audit_events"("entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "audit_events_actor_user_id_idx" ON "audit_events"("actor_user_id");

-- CreateIndex
CREATE INDEX "audit_events_timestamp_idx" ON "audit_events"("timestamp");

-- CreateIndex
CREATE INDEX "notifications_recipient_user_id_read_at_idx" ON "notifications"("recipient_user_id", "read_at");

-- CreateIndex
CREATE INDEX "notifications_created_at_idx" ON "notifications"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "departments_code_key" ON "departments"("code");

-- CreateIndex
CREATE UNIQUE INDEX "roles_code_key" ON "roles"("code");

-- CreateIndex
CREATE INDEX "roles_is_system_idx" ON "roles"("is_system");

-- CreateIndex
CREATE INDEX "roles_is_custom_idx" ON "roles"("is_custom");

-- CreateIndex
CREATE UNIQUE INDEX "permissions_code_key" ON "permissions"("code");

-- CreateIndex
CREATE UNIQUE INDEX "permissions_resource_action_key" ON "permissions"("resource", "action");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");

-- CreateIndex
CREATE UNIQUE INDEX "refresh_tokens_token_hash_key" ON "refresh_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "refresh_tokens_user_id_idx" ON "refresh_tokens"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "employees_business_id_key" ON "employees"("business_id");

-- CreateIndex
CREATE UNIQUE INDEX "employees_user_id_key" ON "employees"("user_id");

-- CreateIndex
CREATE INDEX "employees_department_id_idx" ON "employees"("department_id");

-- CreateIndex
CREATE INDEX "employees_employment_status_idx" ON "employees"("employment_status");

-- CreateIndex
CREATE INDEX "user_permissions_user_id_revoked_at_idx" ON "user_permissions"("user_id", "revoked_at");

-- CreateIndex
CREATE INDEX "user_permissions_delegated_by_user_id_idx" ON "user_permissions"("delegated_by_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "subjects_code_key" ON "subjects"("code");

-- CreateIndex
CREATE UNIQUE INDEX "grades_code_key" ON "grades"("code");

-- CreateIndex
CREATE UNIQUE INDEX "curricula_code_key" ON "curricula"("code");

-- CreateIndex
CREATE UNIQUE INDEX "tutor_recruitment_business_id_key" ON "tutor_recruitment"("business_id");

-- CreateIndex
CREATE UNIQUE INDEX "tutor_recruitment_employee_id_key" ON "tutor_recruitment"("employee_id");

-- CreateIndex
CREATE INDEX "tutor_recruitment_current_stage_idx" ON "tutor_recruitment"("current_stage");

-- CreateIndex
CREATE INDEX "tutor_recruitment_is_rejected_idx" ON "tutor_recruitment"("is_rejected");

-- CreateIndex
CREATE INDEX "tutor_recruitment_created_by_user_id_idx" ON "tutor_recruitment"("created_by_user_id");

-- CreateIndex
CREATE INDEX "tutor_recruitment_stages_recruitment_id_idx" ON "tutor_recruitment_stages"("recruitment_id");

-- CreateIndex
CREATE INDEX "tutor_interviews_recruitment_id_idx" ON "tutor_interviews"("recruitment_id");

-- CreateIndex
CREATE UNIQUE INDEX "tutor_profiles_employee_id_key" ON "tutor_profiles"("employee_id");

-- CreateIndex
CREATE UNIQUE INDEX "tutor_profiles_source_recruitment_id_key" ON "tutor_profiles"("source_recruitment_id");

-- CreateIndex
CREATE INDEX "tutor_subjects_tutor_profile_id_is_active_idx" ON "tutor_subjects"("tutor_profile_id", "is_active");

-- CreateIndex
CREATE UNIQUE INDEX "tutor_subjects_tutor_profile_id_subject_id_key" ON "tutor_subjects"("tutor_profile_id", "subject_id");

-- CreateIndex
CREATE INDEX "tutor_grades_tutor_profile_id_is_active_idx" ON "tutor_grades"("tutor_profile_id", "is_active");

-- CreateIndex
CREATE UNIQUE INDEX "tutor_grades_tutor_profile_id_grade_id_key" ON "tutor_grades"("tutor_profile_id", "grade_id");

-- CreateIndex
CREATE INDEX "tutor_curricula_tutor_profile_id_is_active_idx" ON "tutor_curricula"("tutor_profile_id", "is_active");

-- CreateIndex
CREATE UNIQUE INDEX "tutor_curricula_tutor_profile_id_curriculum_id_key" ON "tutor_curricula"("tutor_profile_id", "curriculum_id");

-- CreateIndex
CREATE INDEX "tutor_availability_slots_tutor_profile_id_day_of_week_is_ac_idx" ON "tutor_availability_slots"("tutor_profile_id", "day_of_week", "is_active");

-- CreateIndex
CREATE INDEX "tutor_availability_slots_day_of_week_is_active_idx" ON "tutor_availability_slots"("day_of_week", "is_active");

-- CreateIndex
CREATE INDEX "tutor_rates_tutor_profile_id_is_active_idx" ON "tutor_rates"("tutor_profile_id", "is_active");

-- CreateIndex
CREATE INDEX "tutor_rates_tutor_profile_id_effective_from_idx" ON "tutor_rates"("tutor_profile_id", "effective_from");

-- CreateIndex
CREATE INDEX "tutor_feedback_tutor_profile_id_feedback_type_feedback_peri_idx" ON "tutor_feedback"("tutor_profile_id", "feedback_type", "feedback_period_date");

-- CreateIndex
CREATE INDEX "tutor_feedback_given_by_user_id_idx" ON "tutor_feedback"("given_by_user_id");

-- AddForeignKey
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_recipient_user_id_fkey" FOREIGN KEY ("recipient_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "roles" ADD CONSTRAINT "roles_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_permission_id_fkey" FOREIGN KEY ("permission_id") REFERENCES "permissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_granted_by_user_id_fkey" FOREIGN KEY ("granted_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employees" ADD CONSTRAINT "employees_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employees" ADD CONSTRAINT "employees_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "departments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_permissions" ADD CONSTRAINT "user_permissions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_permissions" ADD CONSTRAINT "user_permissions_permission_id_fkey" FOREIGN KEY ("permission_id") REFERENCES "permissions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_permissions" ADD CONSTRAINT "user_permissions_delegated_by_user_id_fkey" FOREIGN KEY ("delegated_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tutor_recruitment" ADD CONSTRAINT "tutor_recruitment_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tutor_recruitment" ADD CONSTRAINT "tutor_recruitment_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tutor_recruitment_stages" ADD CONSTRAINT "tutor_recruitment_stages_recruitment_id_fkey" FOREIGN KEY ("recruitment_id") REFERENCES "tutor_recruitment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tutor_recruitment_stages" ADD CONSTRAINT "tutor_recruitment_stages_entered_by_user_id_fkey" FOREIGN KEY ("entered_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tutor_interviews" ADD CONSTRAINT "tutor_interviews_recruitment_id_fkey" FOREIGN KEY ("recruitment_id") REFERENCES "tutor_recruitment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tutor_interviews" ADD CONSTRAINT "tutor_interviews_conducted_by_user_id_fkey" FOREIGN KEY ("conducted_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tutor_profiles" ADD CONSTRAINT "tutor_profiles_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tutor_profiles" ADD CONSTRAINT "tutor_profiles_source_recruitment_id_fkey" FOREIGN KEY ("source_recruitment_id") REFERENCES "tutor_recruitment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tutor_subjects" ADD CONSTRAINT "tutor_subjects_tutor_profile_id_fkey" FOREIGN KEY ("tutor_profile_id") REFERENCES "tutor_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tutor_subjects" ADD CONSTRAINT "tutor_subjects_subject_id_fkey" FOREIGN KEY ("subject_id") REFERENCES "subjects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tutor_subjects" ADD CONSTRAINT "tutor_subjects_added_by_user_id_fkey" FOREIGN KEY ("added_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tutor_grades" ADD CONSTRAINT "tutor_grades_tutor_profile_id_fkey" FOREIGN KEY ("tutor_profile_id") REFERENCES "tutor_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tutor_grades" ADD CONSTRAINT "tutor_grades_grade_id_fkey" FOREIGN KEY ("grade_id") REFERENCES "grades"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tutor_grades" ADD CONSTRAINT "tutor_grades_added_by_user_id_fkey" FOREIGN KEY ("added_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tutor_curricula" ADD CONSTRAINT "tutor_curricula_tutor_profile_id_fkey" FOREIGN KEY ("tutor_profile_id") REFERENCES "tutor_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tutor_curricula" ADD CONSTRAINT "tutor_curricula_curriculum_id_fkey" FOREIGN KEY ("curriculum_id") REFERENCES "curricula"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tutor_curricula" ADD CONSTRAINT "tutor_curricula_added_by_user_id_fkey" FOREIGN KEY ("added_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tutor_availability_slots" ADD CONSTRAINT "tutor_availability_slots_tutor_profile_id_fkey" FOREIGN KEY ("tutor_profile_id") REFERENCES "tutor_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tutor_availability_slots" ADD CONSTRAINT "tutor_availability_slots_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tutor_rates" ADD CONSTRAINT "tutor_rates_tutor_profile_id_fkey" FOREIGN KEY ("tutor_profile_id") REFERENCES "tutor_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tutor_rates" ADD CONSTRAINT "tutor_rates_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tutor_feedback" ADD CONSTRAINT "tutor_feedback_tutor_profile_id_fkey" FOREIGN KEY ("tutor_profile_id") REFERENCES "tutor_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tutor_feedback" ADD CONSTRAINT "tutor_feedback_given_by_user_id_fkey" FOREIGN KEY ("given_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

