-- Subject-level Google Meet link on the tutor assignment (one student, one subject).
-- Additive and nullable: existing rows are unchanged and no data is moved. A link saved on a single class stays on that class.
ALTER TABLE "mentoring_tutor_assignments" ADD COLUMN "meet_link" TEXT;
