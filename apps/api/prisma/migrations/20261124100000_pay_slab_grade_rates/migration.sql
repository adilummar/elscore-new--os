-- Pay Slab step 2. Per-grade slab rates, immutable slabs, INR default currency.
--
-- Turns a Tutor Salary Slab from "one hourly rate" into "one rate per grade, KG to Grade 12", makes slabs
-- immutable at database level, and sets the default currency to INR. Old columns and tables are NOT dropped.

-- 1. Guard. If any slab exists, the 13 grades must exist, otherwise the backfill below would copy the single
--    rate to fewer than 13 grades. A hard stop is better than a half-filled slab.
DO $guard$
DECLARE n_grades int;
BEGIN
  SELECT count(*) INTO n_grades FROM "grades"
  WHERE "code" IN ('KG','GRADE_1','GRADE_2','GRADE_3','GRADE_4','GRADE_5','GRADE_6','GRADE_7','GRADE_8',
                   'GRADE_9','GRADE_10','GRADE_11','GRADE_12');
  IF n_grades <> 13 AND EXISTS (SELECT 1 FROM "tutor_salary_slabs") THEN
    RAISE EXCEPTION 'Pay Slab migration: expected the 13 grades KG..GRADE_12, found %. Run the seed first.', n_grades;
  END IF;
END
$guard$;

-- 2. Per-grade rates. One row per slab and grade. No update, no delete (trigger below).
CREATE TABLE "tutor_salary_slab_rates" (
    "slab_id"    TEXT          NOT NULL,
    "grade_id"   TEXT          NOT NULL,
    "rate"       DECIMAL(10,2) NOT NULL,
    "created_at" TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tutor_salary_slab_rates_pkey" PRIMARY KEY ("slab_id","grade_id"),
    CONSTRAINT "tutor_salary_slab_rates_rate_positive" CHECK ("rate" > 0)
);

CREATE INDEX "tutor_salary_slab_rates_grade_id_idx" ON "tutor_salary_slab_rates"("grade_id");

ALTER TABLE "tutor_salary_slab_rates"
  ADD CONSTRAINT "tutor_salary_slab_rates_slab_id_fkey"
  FOREIGN KEY ("slab_id") REFERENCES "tutor_salary_slabs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "tutor_salary_slab_rates"
  ADD CONSTRAINT "tutor_salary_slab_rates_grade_id_fkey"
  FOREIGN KEY ("grade_id") REFERENCES "grades"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- 3. Backfill: each existing slab's single rate is copied to all 13 grades (owner decision Q7).
--    Inserts only. On an empty slab table this does nothing. A slab with a zero rate fails the CHECK above and
--    stops the whole migration, which is intended: someone must decide what that slab means.
INSERT INTO "tutor_salary_slab_rates" ("slab_id","grade_id","rate")
SELECT s."id", g."id", s."hourly_rate"
FROM "tutor_salary_slabs" s
CROSS JOIN "grades" g
WHERE g."code" IN ('KG','GRADE_1','GRADE_2','GRADE_3','GRADE_4','GRADE_5','GRADE_6','GRADE_7','GRADE_8',
                   'GRADE_9','GRADE_10','GRADE_11','GRADE_12');

-- 4. Currency: INR by default; the dropdown offers INR and AED. NOT VALID enforces the list for new rows only,
--    so an old slab with another value cannot make the migration fail. (Count query 9.4b lists any such slab.)
ALTER TABLE "tutor_salary_slabs" ALTER COLUMN "currency" SET DEFAULT 'INR';
ALTER TABLE "tutor_salary_slabs"
  ADD CONSTRAINT "tutor_salary_slabs_currency_check" CHECK ("currency" IN ('INR','AED')) NOT VALID;

-- 5. Immutability. Created AFTER the backfill so the backfill is not blocked.
CREATE FUNCTION "tutor_salary_slab_block_change"() RETURNS trigger LANGUAGE plpgsql AS $fn$
BEGIN
  RAISE EXCEPTION 'Salary slabs and their rates cannot be edited or deleted (% on %)', TG_OP, TG_TABLE_NAME
    USING ERRCODE = 'restrict_violation';
END
$fn$;

CREATE TRIGGER "tutor_salary_slabs_immutable"
  BEFORE UPDATE OR DELETE ON "tutor_salary_slabs"
  FOR EACH ROW EXECUTE FUNCTION "tutor_salary_slab_block_change"();
CREATE TRIGGER "tutor_salary_slab_rates_immutable"
  BEFORE UPDATE OR DELETE ON "tutor_salary_slab_rates"
  FOR EACH ROW EXECUTE FUNCTION "tutor_salary_slab_block_change"();
CREATE TRIGGER "tutor_salary_slabs_no_truncate"
  BEFORE TRUNCATE ON "tutor_salary_slabs"
  FOR EACH STATEMENT EXECUTE FUNCTION "tutor_salary_slab_block_change"();
CREATE TRIGGER "tutor_salary_slab_rates_no_truncate"
  BEFORE TRUNCATE ON "tutor_salary_slab_rates"
  FOR EACH STATEMENT EXECUTE FUNCTION "tutor_salary_slab_block_change"();

-- 6. A rate row may only be for one of the 13 grades KG..GRADE_12 (never O_LEVEL, A_LEVEL, IB_*).
CREATE FUNCTION "tutor_salary_slab_rate_grade_check"() RETURNS trigger LANGUAGE plpgsql AS $fn$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "grades" g WHERE g."id" = NEW."grade_id" AND g."code" IN
      ('KG','GRADE_1','GRADE_2','GRADE_3','GRADE_4','GRADE_5','GRADE_6','GRADE_7','GRADE_8',
       'GRADE_9','GRADE_10','GRADE_11','GRADE_12')) THEN
    RAISE EXCEPTION 'Salary slab rates are only allowed for the grades KG to Grade 12'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END
$fn$;

CREATE TRIGGER "tutor_salary_slab_rates_grade_check"
  BEFORE INSERT ON "tutor_salary_slab_rates"
  FOR EACH ROW EXECUTE FUNCTION "tutor_salary_slab_rate_grade_check"();

-- 7. Completeness. A NEW slab must have exactly 13 rates when its transaction commits (the API inserts the slab
--    and its 13 rates in one transaction). Together with the primary key, the grade check above and the
--    immutability triggers, a slab can never gain, lose or change a rate after it is created.
--    Not applied to slabs that existed before this migration (they are backfilled in step 3).
CREATE FUNCTION "tutor_salary_slab_complete_check"() RETURNS trigger LANGUAGE plpgsql AS $fn$
BEGIN
  IF (SELECT count(*) FROM "tutor_salary_slab_rates" r WHERE r."slab_id" = NEW."id") <> 13 THEN
    RAISE EXCEPTION 'A salary slab needs exactly one rate for each grade KG to Grade 12 (slab %)', NEW."name"
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NULL;
END
$fn$;

CREATE CONSTRAINT TRIGGER "tutor_salary_slabs_complete"
  AFTER INSERT ON "tutor_salary_slabs"
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION "tutor_salary_slab_complete_check"();

-- NOT done here, on purpose:
--   * "hourly_rate" and "is_active" stay on tutor_salary_slabs, unused by new code (hourly_rate is the legacy single
--     rate; is_active cannot be changed any more because slabs are immutable).
--   * "tutor_salary_slab_subjects" and "tutor_salary_slab_grades" are kept so an application rollback to the
--     current release still works. They are dropped by a later migration once the release is stable.
