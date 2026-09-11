-- CreateEnum
CREATE TYPE "RoundRobinDailyState" AS ENUM ('ACTIVE', 'INACTIVE_FROM_NOW', 'INACTIVE_FULL_DAY');

-- CreateEnum
CREATE TYPE "LeadAssignmentType" AS ENUM ('AUTOMATIC_ROUND_ROBIN', 'MANUAL_SALES_HEAD', 'COUNSELLOR_SELF_CREATED', 'REFERRAL', 'REASSIGNMENT', 'REOPENED');

-- AlterTable
ALTER TABLE "lead_assignment_history" ADD COLUMN     "assignment_type" "LeadAssignmentType" NOT NULL DEFAULT 'MANUAL_SALES_HEAD';

-- CreateTable
CREATE TABLE "round_robin_state" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "is_paused" BOOLEAN NOT NULL DEFAULT false,
    "last_assigned_user_id" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "round_robin_state_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "round_robin_counsellor_state" (
    "user_id" TEXT NOT NULL,
    "is_eligible" BOOLEAN NOT NULL DEFAULT true,
    "daily_state" "RoundRobinDailyState" NOT NULL DEFAULT 'ACTIVE',
    "last_returned_at" TIMESTAMP(3),
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "round_robin_counsellor_state_pkey" PRIMARY KEY ("user_id")
);

-- AddForeignKey
ALTER TABLE "round_robin_state" ADD CONSTRAINT "round_robin_state_last_assigned_user_id_fkey" FOREIGN KEY ("last_assigned_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "round_robin_counsellor_state" ADD CONSTRAINT "round_robin_counsellor_state_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
