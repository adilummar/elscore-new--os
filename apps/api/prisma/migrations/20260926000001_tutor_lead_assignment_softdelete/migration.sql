-- AddColumn: tutor_lead assignment, soft delete, and converted profile tracking
-- Migration: 20260926000001_tutor_lead_assignment_softdelete

ALTER TABLE "tutor_leads" ADD COLUMN IF NOT EXISTS "assigned_to_user_id" TEXT;
ALTER TABLE "tutor_leads" ADD COLUMN IF NOT EXISTS "converted_tutor_profile_id" TEXT;
ALTER TABLE "tutor_leads" ADD COLUMN IF NOT EXISTS "deleted_at" TIMESTAMP(3);

-- Add indexes for new columns
CREATE INDEX IF NOT EXISTS "tutor_leads_assigned_to_user_id_idx" ON "tutor_leads"("assigned_to_user_id");
CREATE INDEX IF NOT EXISTS "tutor_leads_deleted_at_idx" ON "tutor_leads"("deleted_at");

-- Add unique constraint for converted_tutor_profile_id
CREATE UNIQUE INDEX IF NOT EXISTS "tutor_leads_converted_tutor_profile_id_key" ON "tutor_leads"("converted_tutor_profile_id");

-- Add foreign key for assigned_to_user_id (nullable)
ALTER TABLE "tutor_leads" ADD CONSTRAINT "tutor_leads_assigned_to_user_id_fkey"
  FOREIGN KEY ("assigned_to_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE
  DEFERRABLE INITIALLY DEFERRED;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'tutor_leads_assigned_to_user_id_fkey'
  ) THEN
    ALTER TABLE "tutor_leads" ADD CONSTRAINT "tutor_leads_assigned_to_user_id_fkey"
      FOREIGN KEY ("assigned_to_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
