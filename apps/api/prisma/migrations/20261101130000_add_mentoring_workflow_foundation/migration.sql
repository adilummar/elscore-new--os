-- CreateEnum
CREATE TYPE "MentoringStaffRole" AS ENUM ('MENTOR', 'DEMO_COUNSELOR');

-- CreateEnum
CREATE TYPE "MentorAssignmentType" AS ENUM ('AUTO', 'MANUAL', 'TEMPORARY');

-- CreateEnum
CREATE TYPE "AllocationMode" AS ENUM ('AUTO', 'MANUAL');

-- CreateEnum
CREATE TYPE "MentoringTaskStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'ON_HOLD', 'SUBMITTED', 'RETURNED', 'VERIFIED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "MentoringTaskPriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'URGENT');

-- CreateEnum
CREATE TYPE "ChecklistItemState" AS ENUM ('PENDING_COLLECTION', 'COLLECTED', 'VERIFIED', 'UNAVAILABLE', 'NOT_APPLICABLE');

-- CreateEnum
CREATE TYPE "WorkflowHoldKind" AS ENUM ('HOLD', 'BLOCK');

-- CreateEnum
CREATE TYPE "FinalApprovalDecision" AS ENUM ('PENDING', 'APPROVED', 'RETURNED');

-- AlterTable
ALTER TABLE "notifications" ADD COLUMN     "dedupe_key" TEXT;

-- AlterTable
ALTER TABLE "mentoring_activations" ADD COLUMN     "activated_at" TIMESTAMP(3),
ADD COLUMN     "cancel_reason" TEXT,
ADD COLUMN     "cancelled_at" TIMESTAMP(3),
ADD COLUMN     "current_mentor_user_id" TEXT,
ADD COLUMN     "submitted_for_approval_at" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "mentoring_stages" ADD COLUMN     "pending_review_at" TIMESTAMP(3),
ADD COLUMN     "verified_by_user_id" TEXT;

-- CreateTable
CREATE TABLE "mentoring_staff_profiles" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "role" "MentoringStaffRole" NOT NULL,
    "capacity" INTEGER,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "accepts_allocation" BOOLEAN NOT NULL DEFAULT true,
    "team" TEXT,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "mentoring_staff_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mentoring_settings" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "allocation_mode" "AllocationMode" NOT NULL DEFAULT 'AUTO',
    "default_capacity" INTEGER NOT NULL DEFAULT 40,
    "sibling_affinity" BOOLEAN NOT NULL DEFAULT true,
    "updated_by_user_id" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "mentoring_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mentor_assignments" (
    "id" TEXT NOT NULL,
    "activation_id" TEXT NOT NULL,
    "mentor_user_id" TEXT NOT NULL,
    "assigned_by_user_id" TEXT,
    "type" "MentorAssignmentType" NOT NULL,
    "reason" TEXT NOT NULL,
    "decision" JSONB,
    "current_key" TEXT,
    "return_to_user_id" TEXT,
    "expected_return_at" TIMESTAMP(3),
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ended_at" TIMESTAMP(3),

    CONSTRAINT "mentor_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stage_checklist_responses" (
    "id" TEXT NOT NULL,
    "stage_id" TEXT NOT NULL,
    "item_key" TEXT NOT NULL,
    "definition_version" INTEGER NOT NULL DEFAULT 1,
    "mandatory" BOOLEAN NOT NULL,
    "state" "ChecklistItemState" NOT NULL DEFAULT 'PENDING_COLLECTION',
    "value" JSONB,
    "note" TEXT,
    "reason" TEXT,
    "evidence_ref" TEXT,
    "updated_by_user_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "stage_checklist_responses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workflow_exceptions" (
    "id" TEXT NOT NULL,
    "stage_id" TEXT NOT NULL,
    "item_key" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "authorized_by_user_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "workflow_exceptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workflow_holds" (
    "id" TEXT NOT NULL,
    "activation_id" TEXT NOT NULL,
    "stage_id" TEXT,
    "kind" "WorkflowHoldKind" NOT NULL,
    "reason" TEXT NOT NULL,
    "pending_action" TEXT,
    "responsible_user_id" TEXT,
    "follow_up_at" TIMESTAMP(3),
    "dependency" TEXT,
    "previous_activation_status" "MentoringActivationStatus" NOT NULL,
    "previous_stage_status" "MentoringStageStatus",
    "created_by_user_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved_at" TIMESTAMP(3),
    "resolved_by_user_id" TEXT,
    "resolution" TEXT,

    CONSTRAINT "workflow_holds_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mentoring_tasks" (
    "id" TEXT NOT NULL,
    "activation_id" TEXT NOT NULL,
    "stage_id" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "priority" "MentoringTaskPriority" NOT NULL DEFAULT 'MEDIUM',
    "status" "MentoringTaskStatus" NOT NULL DEFAULT 'OPEN',
    "status_before_hold" "MentoringTaskStatus",
    "hold_reason" TEXT,
    "due_at" TIMESTAMP(3),
    "assignee_user_id" TEXT NOT NULL,
    "assigned_by_user_id" TEXT NOT NULL,
    "evidence" JSONB,
    "submitted_at" TIMESTAMP(3),
    "verified_by_user_id" TEXT,
    "verified_at" TIMESTAMP(3),
    "return_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "mentoring_tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mentoring_task_comments" (
    "id" TEXT NOT NULL,
    "task_id" TEXT NOT NULL,
    "author_user_id" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mentoring_task_comments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "final_approvals" (
    "id" TEXT NOT NULL,
    "activation_id" TEXT NOT NULL,
    "submitted_by_user_id" TEXT NOT NULL,
    "submitted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decision" "FinalApprovalDecision" NOT NULL DEFAULT 'PENDING',
    "decided_by_user_id" TEXT,
    "decided_at" TIMESTAMP(3),
    "comment" TEXT,
    "return_to_stage" INTEGER,

    CONSTRAINT "final_approvals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mentoring_events" (
    "id" TEXT NOT NULL,
    "activation_id" TEXT NOT NULL,
    "stage_id" TEXT,
    "task_id" TEXT,
    "type" TEXT NOT NULL,
    "actor_user_id" TEXT,
    "from_status" TEXT,
    "to_status" TEXT,
    "reason" TEXT,
    "payload" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mentoring_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "mentoring_staff_profiles_user_id_key" ON "mentoring_staff_profiles"("user_id");

-- CreateIndex
CREATE INDEX "mentoring_staff_profiles_role_is_active_idx" ON "mentoring_staff_profiles"("role", "is_active");

-- CreateIndex
CREATE UNIQUE INDEX "mentor_assignments_current_key_key" ON "mentor_assignments"("current_key");

-- CreateIndex
CREATE INDEX "mentor_assignments_activation_id_started_at_idx" ON "mentor_assignments"("activation_id", "started_at");

-- CreateIndex
CREATE INDEX "mentor_assignments_mentor_user_id_idx" ON "mentor_assignments"("mentor_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "stage_checklist_responses_stage_id_item_key_key" ON "stage_checklist_responses"("stage_id", "item_key");

-- CreateIndex
CREATE UNIQUE INDEX "workflow_exceptions_stage_id_item_key_key" ON "workflow_exceptions"("stage_id", "item_key");

-- CreateIndex
CREATE INDEX "workflow_holds_activation_id_resolved_at_idx" ON "workflow_holds"("activation_id", "resolved_at");

-- CreateIndex
CREATE INDEX "mentoring_tasks_assignee_user_id_status_idx" ON "mentoring_tasks"("assignee_user_id", "status");

-- CreateIndex
CREATE INDEX "mentoring_tasks_activation_id_idx" ON "mentoring_tasks"("activation_id");

-- CreateIndex
CREATE INDEX "mentoring_task_comments_task_id_created_at_idx" ON "mentoring_task_comments"("task_id", "created_at");

-- CreateIndex
CREATE INDEX "final_approvals_activation_id_submitted_at_idx" ON "final_approvals"("activation_id", "submitted_at");

-- CreateIndex
CREATE INDEX "mentoring_events_activation_id_created_at_idx" ON "mentoring_events"("activation_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "notifications_dedupe_key_key" ON "notifications"("dedupe_key");

-- CreateIndex
CREATE INDEX "mentoring_activations_current_mentor_user_id_status_idx" ON "mentoring_activations"("current_mentor_user_id", "status");

-- AddForeignKey
ALTER TABLE "mentor_assignments" ADD CONSTRAINT "mentor_assignments_activation_id_fkey" FOREIGN KEY ("activation_id") REFERENCES "mentoring_activations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stage_checklist_responses" ADD CONSTRAINT "stage_checklist_responses_stage_id_fkey" FOREIGN KEY ("stage_id") REFERENCES "mentoring_stages"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workflow_exceptions" ADD CONSTRAINT "workflow_exceptions_stage_id_fkey" FOREIGN KEY ("stage_id") REFERENCES "mentoring_stages"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workflow_holds" ADD CONSTRAINT "workflow_holds_activation_id_fkey" FOREIGN KEY ("activation_id") REFERENCES "mentoring_activations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workflow_holds" ADD CONSTRAINT "workflow_holds_stage_id_fkey" FOREIGN KEY ("stage_id") REFERENCES "mentoring_stages"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mentoring_tasks" ADD CONSTRAINT "mentoring_tasks_activation_id_fkey" FOREIGN KEY ("activation_id") REFERENCES "mentoring_activations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mentoring_tasks" ADD CONSTRAINT "mentoring_tasks_stage_id_fkey" FOREIGN KEY ("stage_id") REFERENCES "mentoring_stages"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mentoring_task_comments" ADD CONSTRAINT "mentoring_task_comments_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "mentoring_tasks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "final_approvals" ADD CONSTRAINT "final_approvals_activation_id_fkey" FOREIGN KEY ("activation_id") REFERENCES "mentoring_activations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mentoring_events" ADD CONSTRAINT "mentoring_events_activation_id_fkey" FOREIGN KEY ("activation_id") REFERENCES "mentoring_activations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

