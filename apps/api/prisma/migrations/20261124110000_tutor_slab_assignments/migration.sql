-- Pay Slab step 3 (migration B). Tutor-to-slab assignments.
--
-- One row = "this tutor is on this slab from month X to month Y". Rows are history: they are never deleted and
-- never edited, except for the three narrow moves listed in section 4. Months are stored as the FIRST DAY of the
-- month (a DATE) and are read in the business timezone Asia/Kolkata. to_month is the LAST month the slab applies
-- (inclusive); NULL means "Present".
--
-- Nothing here changes migration A or any existing table. Permissions are NOT created here: the catalog comes
-- from the seed and the role links from the reviewed grant script, exactly as for the first two Pay Slab codes.

-- 1. Needed for the "no overlap" rule below (equality on text + overlap on date ranges in one constraint).
--    btree_gist is a trusted extension on PostgreSQL 13+, so the database owner may create it.
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- 2. The business month. Always Asia/Kolkata, never the server or browser timezone. now() is the transaction
--    start time, so every statement of one transaction sees the same month.
CREATE FUNCTION "tutor_slab_current_month"() RETURNS date LANGUAGE sql STABLE AS $fn$
  SELECT date_trunc('month', now() AT TIME ZONE 'Asia/Kolkata')::date
$fn$;

-- 3. The table.
CREATE TABLE "tutor_slab_assignments" (
    "id"                   TEXT         NOT NULL,
    "tutor_profile_id"     TEXT         NOT NULL,
    "slab_id"              TEXT         NOT NULL,
    "from_month"           DATE         NOT NULL,
    "to_month"             DATE,
    -- DEMO_EVALUATION = the first slab, taken from the demo evaluation at Ready for Assignment.
    -- HR_INITIAL      = the first slab, given by HR to a tutor who had none.
    -- HR_CHANGE       = a later change by HR Head / HR Staff.
    "source"               TEXT         NOT NULL,
    "evaluation_id"        TEXT,
    "changed_by_user_id"   TEXT         NOT NULL,
    "reason"               TEXT         NOT NULL,
    "created_at"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    -- A cancelled change keeps its row. These three are set together, once, and never cleared.
    "cancelled_at"         TIMESTAMP(3),
    "cancelled_by_user_id" TEXT,
    "cancel_reason"        TEXT,

    CONSTRAINT "tutor_slab_assignments_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "tutor_slab_assignments_from_is_month_start" CHECK ("from_month" = date_trunc('month', "from_month")::date),
    CONSTRAINT "tutor_slab_assignments_to_is_month_start"   CHECK ("to_month" IS NULL OR "to_month" = date_trunc('month', "to_month")::date),
    CONSTRAINT "tutor_slab_assignments_to_not_before_from"  CHECK ("to_month" IS NULL OR "to_month" >= "from_month"),
    CONSTRAINT "tutor_slab_assignments_source_check"        CHECK ("source" IN ('DEMO_EVALUATION','HR_INITIAL','HR_CHANGE')),
    CONSTRAINT "tutor_slab_assignments_evaluation_check"    CHECK (("source" = 'DEMO_EVALUATION') = ("evaluation_id" IS NOT NULL)),
    CONSTRAINT "tutor_slab_assignments_reason_not_blank"    CHECK (btrim("reason") <> ''),
    CONSTRAINT "tutor_slab_assignments_cancel_all_or_none"  CHECK (
        ("cancelled_at" IS NULL AND "cancelled_by_user_id" IS NULL AND "cancel_reason" IS NULL)
     OR ("cancelled_at" IS NOT NULL AND "cancelled_by_user_id" IS NOT NULL AND btrim("cancel_reason") <> '')),
    -- Only a later HR change can be cancelled; the first slab never starts in the future, so this also holds.
    CONSTRAINT "tutor_slab_assignments_cancel_only_change"  CHECK ("cancelled_at" IS NULL OR "source" = 'HR_CHANGE'),

    -- Never two rows for one tutor that cover the same month (cancelled rows are ignored). The range is
    -- [from_month, the month after to_month); an open row runs to infinity.
    CONSTRAINT "tutor_slab_assignments_no_overlap" EXCLUDE USING gist (
        "tutor_profile_id" WITH =,
        daterange("from_month", COALESCE(("to_month" + interval '1 month')::date, 'infinity'::date), '[)') WITH &&
    ) WHERE ("cancelled_at" IS NULL)
);

-- Only one open ("Present") assignment per tutor. A pending change counts as the open one: the row it replaces
-- has already been closed at the current month.
CREATE UNIQUE INDEX "tutor_slab_assignments_one_open_per_tutor"
    ON "tutor_slab_assignments"("tutor_profile_id") WHERE "to_month" IS NULL AND "cancelled_at" IS NULL;

CREATE INDEX "tutor_slab_assignments_tutor_profile_id_from_month_idx" ON "tutor_slab_assignments"("tutor_profile_id","from_month");
CREATE INDEX "tutor_slab_assignments_slab_id_idx"    ON "tutor_slab_assignments"("slab_id");

ALTER TABLE "tutor_slab_assignments" ADD CONSTRAINT "tutor_slab_assignments_tutor_profile_id_fkey"
  FOREIGN KEY ("tutor_profile_id") REFERENCES "tutor_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "tutor_slab_assignments" ADD CONSTRAINT "tutor_slab_assignments_slab_id_fkey"
  FOREIGN KEY ("slab_id") REFERENCES "tutor_salary_slabs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "tutor_slab_assignments" ADD CONSTRAINT "tutor_slab_assignments_evaluation_id_fkey"
  FOREIGN KEY ("evaluation_id") REFERENCES "tutor_demo_evaluations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "tutor_slab_assignments" ADD CONSTRAINT "tutor_slab_assignments_changed_by_user_id_fkey"
  FOREIGN KEY ("changed_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "tutor_slab_assignments" ADD CONSTRAINT "tutor_slab_assignments_cancelled_by_user_id_fkey"
  FOREIGN KEY ("cancelled_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- 4. Insert rules. A row is always inserted open (to_month NULL) and never already cancelled.
--    * First slab (the tutor has no live row): must start in the current month, source DEMO_EVALUATION or HR_INITIAL.
--    * Any later slab (source HR_CHANGE): must start NEXT month, must differ from the slab the tutor is on, and
--      cannot be added while another change is already waiting (cancel that one first).
--    * The slab must have all 13 grade rates.
CREATE FUNCTION "tutor_slab_assignment_insert_check"() RETURNS trigger LANGUAGE plpgsql AS $fn$
DECLARE
  this_month date := "tutor_slab_current_month"();
  last_live record;
BEGIN
  IF NEW."to_month" IS NOT NULL OR NEW."cancelled_at" IS NOT NULL THEN
    RAISE EXCEPTION 'A slab assignment is always added open and not cancelled' USING ERRCODE = 'check_violation';
  END IF;

  IF (SELECT count(*) FROM "tutor_salary_slab_rates" r WHERE r."slab_id" = NEW."slab_id") <> 13 THEN
    RAISE EXCEPTION 'The slab does not have a rate for every grade KG to Grade 12' USING ERRCODE = 'check_violation';
  END IF;

  SELECT a."slab_id", a."from_month" INTO last_live
  FROM "tutor_slab_assignments" a
  WHERE a."tutor_profile_id" = NEW."tutor_profile_id" AND a."cancelled_at" IS NULL
  ORDER BY a."from_month" DESC LIMIT 1;

  IF NOT FOUND THEN
    IF NEW."source" = 'HR_CHANGE' THEN
      RAISE EXCEPTION 'This tutor has no slab yet: use the first-assignment path, not a change' USING ERRCODE = 'check_violation';
    END IF;
    IF NEW."from_month" <> this_month THEN
      RAISE EXCEPTION 'A first slab starts in the current month (%), not %', this_month, NEW."from_month" USING ERRCODE = 'check_violation';
    END IF;
  ELSE
    IF NEW."source" <> 'HR_CHANGE' THEN
      RAISE EXCEPTION 'This tutor already has a slab: a new one is a change that starts next month' USING ERRCODE = 'check_violation';
    END IF;
    IF NEW."from_month" <> (this_month + interval '1 month')::date THEN
      RAISE EXCEPTION 'A slab change takes effect from next month (%), not %', (this_month + interval '1 month')::date, NEW."from_month"
        USING ERRCODE = 'check_violation';
    END IF;
    IF last_live."from_month" > this_month THEN
      RAISE EXCEPTION 'A slab change is already waiting for next month: cancel it first' USING ERRCODE = 'check_violation';
    END IF;
    IF last_live."slab_id" = NEW."slab_id" THEN
      RAISE EXCEPTION 'The tutor is already on this slab' USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END
$fn$;

CREATE TRIGGER "tutor_slab_assignments_insert_check"
  BEFORE INSERT ON "tutor_slab_assignments"
  FOR EACH ROW EXECUTE FUNCTION "tutor_slab_assignment_insert_check"();

-- 5. No overwriting of history. The ONLY changes a row may ever receive:
--    close    : to_month NULL -> the current month (done just before the next-month row is added).
--    cancel   : cancelled_at/by/reason set once, only on a still-open HR_CHANGE row whose month has not started.
--    re-open  : to_month back to NULL, only when the row after it has been cancelled (the cancel gives back the
--               old slab). The cancelled row stays and shows what happened.
--    Everything else (slab, months, reason, who, source) is frozen. DELETE and TRUNCATE are refused.
CREATE FUNCTION "tutor_slab_assignment_update_check"() RETURNS trigger LANGUAGE plpgsql AS $fn$
DECLARE
  this_month date := "tutor_slab_current_month"();
BEGIN
  IF NEW."id" <> OLD."id" OR NEW."tutor_profile_id" <> OLD."tutor_profile_id" OR NEW."slab_id" <> OLD."slab_id"
     OR NEW."from_month" <> OLD."from_month" OR NEW."source" <> OLD."source"
     OR NEW."evaluation_id" IS DISTINCT FROM OLD."evaluation_id" OR NEW."changed_by_user_id" <> OLD."changed_by_user_id"
     OR NEW."reason" <> OLD."reason" OR NEW."created_at" <> OLD."created_at" THEN
    RAISE EXCEPTION 'Slab assignment history cannot be edited' USING ERRCODE = 'restrict_violation';
  END IF;

  IF NEW."cancelled_at" IS NOT DISTINCT FROM OLD."cancelled_at"
     AND NEW."cancelled_by_user_id" IS NOT DISTINCT FROM OLD."cancelled_by_user_id"
     AND NEW."cancel_reason" IS NOT DISTINCT FROM OLD."cancel_reason" THEN
    -- No cancel columns touched: this must be a close or a re-open.
    IF OLD."cancelled_at" IS NOT NULL THEN
      RAISE EXCEPTION 'A cancelled slab assignment cannot be changed' USING ERRCODE = 'restrict_violation';
    ELSIF OLD."to_month" IS NULL AND NEW."to_month" = this_month THEN
      RETURN NEW;                                                   -- close
    ELSIF OLD."to_month" IS NOT NULL AND NEW."to_month" IS NULL THEN  -- re-open
      IF NOT EXISTS (SELECT 1 FROM "tutor_slab_assignments" s
                     WHERE s."tutor_profile_id" = OLD."tutor_profile_id" AND s."cancelled_at" IS NOT NULL
                       AND s."from_month" = (OLD."to_month" + interval '1 month')::date) THEN
        RAISE EXCEPTION 'A slab assignment can be re-opened only after the change that replaced it is cancelled' USING ERRCODE = 'restrict_violation';
      END IF;
      RETURN NEW;
    ELSIF NEW."to_month" IS NOT DISTINCT FROM OLD."to_month" THEN
      RETURN NEW;                                                   -- nothing changed
    END IF;
    RAISE EXCEPTION 'Slab assignment history cannot be edited' USING ERRCODE = 'restrict_violation';
  END IF;

  -- Cancel columns changed: this must be exactly a cancel and nothing else.
  IF OLD."cancelled_at" IS NOT NULL OR NEW."to_month" IS DISTINCT FROM OLD."to_month" OR OLD."to_month" IS NOT NULL THEN
    RAISE EXCEPTION 'A slab assignment can be cancelled once, while it is still waiting to start' USING ERRCODE = 'restrict_violation';
  END IF;
  IF OLD."from_month" <= this_month THEN
    RAISE EXCEPTION 'This slab change has already started (from %) and can no longer be cancelled', OLD."from_month" USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN NEW;
END
$fn$;

CREATE TRIGGER "tutor_slab_assignments_update_check"
  BEFORE UPDATE ON "tutor_slab_assignments"
  FOR EACH ROW EXECUTE FUNCTION "tutor_slab_assignment_update_check"();

CREATE FUNCTION "tutor_slab_assignment_block_delete"() RETURNS trigger LANGUAGE plpgsql AS $fn$
BEGIN
  RAISE EXCEPTION 'Slab assignment history cannot be deleted (% on %)', TG_OP, TG_TABLE_NAME USING ERRCODE = 'restrict_violation';
END
$fn$;

CREATE TRIGGER "tutor_slab_assignments_no_delete"
  BEFORE DELETE ON "tutor_slab_assignments" FOR EACH ROW EXECUTE FUNCTION "tutor_slab_assignment_block_delete"();
CREATE TRIGGER "tutor_slab_assignments_no_truncate"
  BEFORE TRUNCATE ON "tutor_slab_assignments" FOR EACH STATEMENT EXECUTE FUNCTION "tutor_slab_assignment_block_delete"();

-- 6. No gaps. Checked when the transaction commits, so close + insert (or cancel + re-open) can happen in
--    any order inside one transaction, but a tutor can never be left without a slab month in the middle:
--    * a closed live row needs a live row starting the next month;
--    * a live row that is not the tutor's first needs a live row ending the month before it;
--    * a cancelled row must not leave the row before it closed.
CREATE FUNCTION "tutor_slab_assignment_continuity_check"() RETURNS trigger LANGUAGE plpgsql AS $fn$
BEGIN
  IF NEW."cancelled_at" IS NULL THEN
    IF NEW."to_month" IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM "tutor_slab_assignments" a WHERE a."tutor_profile_id" = NEW."tutor_profile_id"
          AND a."cancelled_at" IS NULL AND a."from_month" = (NEW."to_month" + interval '1 month')::date) THEN
      RAISE EXCEPTION 'The slab assignment ends in % but no slab starts after it (the tutor would have a gap)', NEW."to_month"
        USING ERRCODE = 'check_violation';
    END IF;
    IF EXISTS (SELECT 1 FROM "tutor_slab_assignments" a WHERE a."tutor_profile_id" = NEW."tutor_profile_id"
                 AND a."cancelled_at" IS NULL AND a."from_month" < NEW."from_month")
       AND NOT EXISTS (SELECT 1 FROM "tutor_slab_assignments" a WHERE a."tutor_profile_id" = NEW."tutor_profile_id"
                 AND a."cancelled_at" IS NULL AND a."to_month" = (NEW."from_month" - interval '1 month')::date) THEN
      RAISE EXCEPTION 'The slab assignment starting % does not follow on from the previous one (the tutor would have a gap)', NEW."from_month"
        USING ERRCODE = 'check_violation';
    END IF;
  ELSE
    IF EXISTS (SELECT 1 FROM "tutor_slab_assignments" a WHERE a."tutor_profile_id" = NEW."tutor_profile_id"
                 AND a."cancelled_at" IS NULL AND a."to_month" = (NEW."from_month" - interval '1 month')::date) THEN
      RAISE EXCEPTION 'The cancelled change must give the old slab back: re-open the assignment before it'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NULL;
END
$fn$;

CREATE CONSTRAINT TRIGGER "tutor_slab_assignments_continuity"
  AFTER INSERT OR UPDATE ON "tutor_slab_assignments"
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION "tutor_slab_assignment_continuity_check"();

-- NOT done here, on purpose:
--   * No backfill: nobody has a slab until the first Ready for Assignment after release, or HR assigns one.
--     Tutors created before Pay Slab simply have "no slab" (the Salary tab says so).
--   * No link from payroll yet: earnings are deferred, so nothing reads this table for money.
