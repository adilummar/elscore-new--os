-- CreateEnum
CREATE TYPE "HandoverFieldOrigin" AS ENUM ('MENTORING_UPDATED', 'MENTOR_COLLECTED');

-- CreateTable
CREATE TABLE "enrollment_handover_fields" (
    "id" TEXT NOT NULL,
    "handover_id" TEXT NOT NULL,
    "field_key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "origin" "HandoverFieldOrigin" NOT NULL,
    "sales_value" JSONB,
    "updated_by_user_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "enrollment_handover_fields_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "enrollment_handover_fields_handover_id_field_key_key" ON "enrollment_handover_fields"("handover_id", "field_key");

-- AddForeignKey
ALTER TABLE "enrollment_handover_fields" ADD CONSTRAINT "enrollment_handover_fields_handover_id_fkey" FOREIGN KEY ("handover_id") REFERENCES "enrollment_handovers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

