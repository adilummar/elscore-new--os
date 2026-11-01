-- CreateEnum
CREATE TYPE "EnrollmentHandoverStatus" AS ENUM ('PENDING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "MentoringActivationStatus" AS ENUM ('AWAITING_ALLOCATION', 'ACTIVATION_IN_PROGRESS', 'ACTIVATION_ON_HOLD', 'ACTIVATION_BLOCKED', 'PENDING_FINAL_APPROVAL', 'ACTIVATED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "MentoringStageStatus" AS ENUM ('NOT_STARTED', 'IN_PROGRESS', 'ON_HOLD', 'BLOCKED', 'PENDING_REVIEW', 'COMPLETED', 'CANCELLED');

-- CreateTable
CREATE TABLE "enrollment_handovers" (
    "id" TEXT NOT NULL,
    "lead_id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "status" "EnrollmentHandoverStatus" NOT NULL DEFAULT 'PENDING',
    "source_snapshot" JSONB NOT NULL,
    "transferred_fields" JSONB NOT NULL,
    "missing_fields" JSONB NOT NULL,
    "last_error" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 1,
    "triggered_by_user_id" TEXT NOT NULL,
    "completed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "enrollment_handovers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mentoring_activations" (
    "id" TEXT NOT NULL,
    "lead_id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "handover_id" TEXT NOT NULL,
    "status" "MentoringActivationStatus" NOT NULL DEFAULT 'AWAITING_ALLOCATION',
    "current_stage" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "mentoring_activations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mentoring_stages" (
    "id" TEXT NOT NULL,
    "activation_id" TEXT NOT NULL,
    "stage_number" INTEGER NOT NULL,
    "key" TEXT NOT NULL,
    "status" "MentoringStageStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "started_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "mentoring_stages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "enrollment_handovers_student_id_key" ON "enrollment_handovers"("student_id");

-- CreateIndex
CREATE INDEX "enrollment_handovers_lead_id_idx" ON "enrollment_handovers"("lead_id");

-- CreateIndex
CREATE INDEX "enrollment_handovers_status_idx" ON "enrollment_handovers"("status");

-- CreateIndex
CREATE UNIQUE INDEX "mentoring_activations_student_id_key" ON "mentoring_activations"("student_id");

-- CreateIndex
CREATE UNIQUE INDEX "mentoring_activations_handover_id_key" ON "mentoring_activations"("handover_id");

-- CreateIndex
CREATE INDEX "mentoring_activations_lead_id_idx" ON "mentoring_activations"("lead_id");

-- CreateIndex
CREATE INDEX "mentoring_activations_status_idx" ON "mentoring_activations"("status");

-- CreateIndex
CREATE UNIQUE INDEX "mentoring_stages_activation_id_stage_number_key" ON "mentoring_stages"("activation_id", "stage_number");

-- AddForeignKey
ALTER TABLE "enrollment_handovers" ADD CONSTRAINT "enrollment_handovers_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enrollment_handovers" ADD CONSTRAINT "enrollment_handovers_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mentoring_activations" ADD CONSTRAINT "mentoring_activations_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mentoring_activations" ADD CONSTRAINT "mentoring_activations_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mentoring_activations" ADD CONSTRAINT "mentoring_activations_handover_id_fkey" FOREIGN KEY ("handover_id") REFERENCES "enrollment_handovers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mentoring_stages" ADD CONSTRAINT "mentoring_stages_activation_id_fkey" FOREIGN KEY ("activation_id") REFERENCES "mentoring_activations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

