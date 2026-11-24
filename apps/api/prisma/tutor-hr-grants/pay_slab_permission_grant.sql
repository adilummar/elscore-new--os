-- MANUAL SCRIPT, NOT A MIGRATION (see README.md). Run after "prisma migrate deploy" and "prisma db seed".
--
-- WHY: on a database that already has users, the seed inserts the permission catalog but deliberately leaves
-- role-permission links unchanged. So nobody holds the two Pay Slab permission codes until this script runs.
--
-- WHAT IT INSERTS: exactly 4 links, matching ROLE_PERMISSIONS in apps/api/prisma/seed.ts:
--   HR_MANAGER   (HR Head)  -> tutor_hr.pay_slab.read, tutor_hr.pay_slab.create
--   HR_EXECUTIVE (HR Staff) -> tutor_hr.pay_slab.read, tutor_hr.pay_slab.create
-- No other role gets them (not the CEO, Co-Founder, Tutor Head or Tutor Coordinators).
-- It never deletes or updates anything, does not create roles or permission rows, and does not use
-- SEED_RECONCILE_ROLE_PERMISSIONS. Safe to run twice: the second run inserts 0 rows.
--
-- Run (preview; nothing is saved because COMMIT is commented out and psql rolls back when it exits):
--   psql -v ON_ERROR_STOP=1 -d elscore_os_staging -f pay_slab_permission_grant.sql
-- To commit (only after the owner approves the preview): copy to /var/tmp, replace only the final "-- COMMIT;"
-- with "COMMIT;", check with "tail -n 3", run the copy. Never edit the file in the repository.

\set ON_ERROR_STOP on
BEGIN;

SELECT current_database() AS target_database;   -- must be the staging database

CREATE TEMP TABLE wanted_links (role_code text, permission_code text, PRIMARY KEY (role_code, permission_code)) ON COMMIT DROP;
INSERT INTO wanted_links VALUES
  ('HR_MANAGER', 'tutor_hr.pay_slab.read'),
  ('HR_MANAGER', 'tutor_hr.pay_slab.create'),
  ('HR_EXECUTIVE', 'tutor_hr.pay_slab.read'),
  ('HR_EXECUTIVE', 'tutor_hr.pay_slab.create');

-- Guards: stop with a clear message instead of inserting something partial.
DO $guard$
DECLARE missing_perms text; missing_roles text;
BEGIN
  SELECT string_agg(DISTINCT w.permission_code, ', ') INTO missing_perms
  FROM wanted_links w LEFT JOIN permissions p ON p.code = w.permission_code WHERE p.id IS NULL;
  IF missing_perms IS NOT NULL THEN
    RAISE EXCEPTION 'Permission rows missing (run the seed first): %', missing_perms;
  END IF;

  SELECT string_agg(DISTINCT w.role_code, ', ') INTO missing_roles
  FROM wanted_links w LEFT JOIN roles r ON r.code = w.role_code WHERE r.id IS NULL;
  IF missing_roles IS NOT NULL THEN
    RAISE EXCEPTION 'Roles missing: %', missing_roles;
  END IF;
END
$guard$;

-- Preview: the links that would be added. These are the rows to review.
SELECT w.role_code, w.permission_code
FROM wanted_links w
WHERE NOT EXISTS (
  SELECT 1 FROM role_permissions rp
  JOIN roles r ON r.id = rp.role_id AND r.code = w.role_code
  JOIN permissions p ON p.id = rp.permission_id AND p.code = w.permission_code)
ORDER BY w.role_code, w.permission_code;

SELECT count(*) AS role_permissions_before FROM role_permissions \gset

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM wanted_links w
JOIN roles r ON r.code = w.role_code
JOIN permissions p ON p.code = w.permission_code
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- Result: links_added must equal the number of previewed rows (4 the first time, 0 the second time).
SELECT count(*) AS role_permissions_after, count(*) - :role_permissions_before AS links_added FROM role_permissions;

-- Nobody else may hold these codes (expect only HR_EXECUTIVE and HR_MANAGER).
SELECT r.code AS role_holding_pay_slab_permissions, count(*) AS codes
FROM role_permissions rp JOIN roles r ON r.id = rp.role_id JOIN permissions p ON p.id = rp.permission_id
WHERE p.code LIKE 'tutor_hr.pay_slab.%' GROUP BY r.code ORDER BY r.code;

-- COMMIT only if links_added matches the preview and only HR_EXECUTIVE and HR_MANAGER are listed; otherwise ROLLBACK.
-- COMMIT;
