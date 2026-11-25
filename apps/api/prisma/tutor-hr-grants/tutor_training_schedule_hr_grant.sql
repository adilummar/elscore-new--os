-- MANUAL SCRIPT, NOT A MIGRATION (see README.md). Run after "prisma migrate deploy" and "prisma db seed".
--
-- WHY: the Tutor Coordinator requirements say the HR Department manages rescheduling of repeat training sessions.
-- Creating and rescheduling a session needs tutor_training.schedule, which only TUTOR_HEAD held. The seed gives
-- the code to the two HR roles, but on a database that already has users the seed leaves role-permission links
-- unchanged, so this script is the only way the links reach staging.
--
-- WHAT IT INSERTS: exactly 2 links, matching ROLE_PERMISSIONS in apps/api/prisma/seed.ts:
--   HR_MANAGER   (HR Head)  -> tutor_training.schedule
--   HR_EXECUTIVE (HR Staff) -> tutor_training.schedule
-- TUTOR_HEAD already holds it. No other role gets it.
-- It never deletes or updates anything, does not create roles or permission rows, and does not use
-- SEED_RECONCILE_ROLE_PERMISSIONS. Safe to run twice: the second run inserts 0 rows.
--
-- Run (preview; nothing is saved because COMMIT is commented out and psql rolls back when it exits):
--   psql -v ON_ERROR_STOP=1 -d elscore_os_staging -f tutor_training_schedule_hr_grant.sql
-- To commit (only after the owner approves the preview): copy to /var/tmp, replace only the final "-- COMMIT;"
-- with "COMMIT;", check with "tail -n 3", run the copy. Never edit the file in the repository.

\set ON_ERROR_STOP on
BEGIN;

SELECT current_database() AS target_database;   -- must be the staging database

CREATE TEMP TABLE wanted_links (role_code text, permission_code text, PRIMARY KEY (role_code, permission_code)) ON COMMIT DROP;
INSERT INTO wanted_links VALUES
  ('HR_MANAGER', 'tutor_training.schedule'),
  ('HR_EXECUTIVE', 'tutor_training.schedule');

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

-- Result: links_added must equal the number of previewed rows (2 the first time, 0 the second time).
SELECT count(*) AS role_permissions_after, count(*) - :role_permissions_before AS links_added FROM role_permissions;

-- Who holds tutor_training.schedule afterwards (expect HR_EXECUTIVE, HR_MANAGER, TUTOR_HEAD, plus the CEO).
SELECT r.code AS role_holding_schedule
FROM role_permissions rp JOIN roles r ON r.id = rp.role_id JOIN permissions p ON p.id = rp.permission_id
WHERE p.code = 'tutor_training.schedule' ORDER BY r.code;

-- COMMIT only if links_added matches the preview and the holder list is as expected; otherwise ROLLBACK.
-- COMMIT;
