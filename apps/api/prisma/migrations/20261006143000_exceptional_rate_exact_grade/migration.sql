-- Existing subject-only exceptional rates have no authoritative grade.
-- Do not invent one. Staging must review any reported rows before applying.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "exceptional_subject_rates") THEN
    RAISE EXCEPTION 'Existing exceptional subject rates have no grade and cannot be migrated automatically';
  END IF;
END $$;

DROP INDEX "exceptional_subject_rates_subject_id_key";
DROP INDEX "exceptional_subject_rates_subject_id_is_active_idx";

ALTER TABLE "exceptional_subject_rates"
  ADD COLUMN "grade_id" TEXT NOT NULL;

ALTER TABLE "exceptional_subject_rates"
  ADD CONSTRAINT "exceptional_subject_rates_grade_id_fkey"
  FOREIGN KEY ("grade_id") REFERENCES "grades"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- At most one active rate for a subject and exact grade.
-- Inactive rows are retained so a rate can be replaced without deleting history.
CREATE UNIQUE INDEX "exceptional_subject_rates_active_subject_grade_key"
  ON "exceptional_subject_rates"("subject_id", "grade_id")
  WHERE "is_active" = true;

CREATE INDEX "exceptional_subject_rates_subject_id_grade_id_is_active_idx"
  ON "exceptional_subject_rates"("subject_id", "grade_id", "is_active");
