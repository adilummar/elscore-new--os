-- MANUAL SCRIPT, NOT A MIGRATION (see README.md). Run after "prisma migrate deploy" and "prisma db seed" (step D8).
--
-- WHY: on a database that already has users, the seed inserts the permission catalog and the roles but
-- deliberately leaves role-permission links unchanged. So no role holds the 20 permission codes added by the Tutor HR
-- release (and TUTOR_HEAD / TUTOR_COORDINATOR hold nothing). This script inserts exactly those links.
--
-- WHAT IT INSERTS: 80 links, taken from ROLE_PERMISSIONS in apps/api/prisma/seed.ts at the release commit:
--   * every link that involves one of the 20 permission codes new in this release (list below), and
--   * the complete seed mapping of the two new roles TUTOR_HEAD and TUTOR_COORDINATOR (they start with nothing).
-- It never deletes, updates or re-adds anything else, so a sensitive grant an administrator removed from an
-- existing role stays removed. It does not use SEED_RECONCILE_ROLE_PERMISSIONS.
--
-- SAFE TO RUN TWICE: only links that are missing are inserted; the second run reports 0 and changes nothing.
-- WRITES: INSERT INTO roles (only TUTOR_HEAD / TUTOR_COORDINATOR, only if missing) and INSERT INTO role_permissions.
-- Permission rows are NOT created here: if the seed has not run, the script stops with a list of what is missing.
--
-- Run (preview, nothing is saved because COMMIT is commented out and psql rolls back when it exits):
--   psql -v ON_ERROR_STOP=1 -d elscore_os_staging -f tutor_hr_permission_grant.sql
-- To commit (only after the owner approves the preview): copy to /var/tmp, replace only the final "-- COMMIT;"
-- with "COMMIT;", check with "tail -n 3", run the copy. Never edit the file in the repository.

\set ON_ERROR_STOP on
SET client_encoding = 'UTF8';
BEGIN;

SELECT current_database() AS target_database;   -- must be the staging database

CREATE TEMP TABLE wanted_roles (code text PRIMARY KEY, name text, description text,
  is_system boolean, is_protected boolean, is_custom boolean) ON COMMIT DROP;
INSERT INTO wanted_roles VALUES
  ('TUTOR_HEAD', 'Tutor Head', 'Tutor Management department head — oversees all candidates, manager workloads, demo evaluations and recruitment reports. HR Manager / HR Executive act as Tutor Managers.', true, false, false),
  ('TUTOR_COORDINATOR', 'Tutor Coordinator', 'Monitors the active tutors assigned to them, records class observations and conducts training Session 1. Sees only assigned tutors; no HR notes, bank details or exports.', true, false, false);

CREATE TEMP TABLE release_codes (code text PRIMARY KEY) ON COMMIT DROP;
INSERT INTO release_codes VALUES
  ('demo.reschedule'),
  ('demo.cancel'),
  ('tutor_hiring.read-all'),
  ('tutor_hiring.reassign'),
  ('tutor_hiring.report'),
  ('tutor_coordination.read'),
  ('tutor_coordination.observe'),
  ('tutor_coordination.manage'),
  ('tutor_hr.profile.read'),
  ('tutor_hr.profile.manage'),
  ('tutor_hr.notes.manage'),
  ('tutor_hr.ready_for_assignment'),
  ('tutor_hr.tutors.read'),
  ('tutor_training.read'),
  ('tutor_training.schedule'),
  ('tutor_training.participants'),
  ('tutor_training.record'),
  ('tutor_training.override'),
  ('tutor_hiring.override'),
  ('tutor_hiring.settings');

CREATE TEMP TABLE wanted_links (role_code text, permission_code text, PRIMARY KEY (role_code, permission_code)) ON COMMIT DROP;
INSERT INTO wanted_links VALUES
  ('CEO', 'demo.reschedule'),
  ('CEO', 'demo.cancel'),
  ('CEO', 'tutor_hiring.read-all'),
  ('CEO', 'tutor_hiring.reassign'),
  ('CEO', 'tutor_hiring.report'),
  ('CEO', 'tutor_coordination.read'),
  ('CEO', 'tutor_coordination.observe'),
  ('CEO', 'tutor_coordination.manage'),
  ('CEO', 'tutor_hr.profile.read'),
  ('CEO', 'tutor_hr.profile.manage'),
  ('CEO', 'tutor_hr.notes.manage'),
  ('CEO', 'tutor_hr.ready_for_assignment'),
  ('CEO', 'tutor_hr.tutors.read'),
  ('CEO', 'tutor_training.read'),
  ('CEO', 'tutor_training.schedule'),
  ('CEO', 'tutor_training.participants'),
  ('CEO', 'tutor_training.record'),
  ('CEO', 'tutor_training.override'),
  ('CEO', 'tutor_hiring.override'),
  ('CEO', 'tutor_hiring.settings'),
  ('CO_FOUNDER', 'tutor_hiring.read-all'),
  ('CO_FOUNDER', 'tutor_coordination.read'),
  ('CO_FOUNDER', 'tutor_hr.profile.read'),
  ('CO_FOUNDER', 'tutor_hr.tutors.read'),
  ('CO_FOUNDER', 'tutor_training.read'),
  ('HR_MANAGER', 'tutor_training.read'),
  ('HR_MANAGER', 'tutor_training.participants'),
  ('HR_MANAGER', 'tutor_training.record'),
  ('HR_MANAGER', 'tutor_hr.ready_for_assignment'),
  ('HR_MANAGER', 'tutor_hr.tutors.read'),
  ('HR_MANAGER', 'tutor_hr.profile.read'),
  ('HR_MANAGER', 'tutor_hr.profile.manage'),
  ('HR_MANAGER', 'tutor_hr.notes.manage'),
  ('HR_MANAGER', 'tutor_hiring.read-all'),
  ('HR_MANAGER', 'tutor_hiring.reassign'),
  ('HR_MANAGER', 'tutor_hiring.report'),
  ('HR_MANAGER', 'tutor_hiring.settings'),
  ('HR_EXECUTIVE', 'tutor_training.read'),
  ('HR_EXECUTIVE', 'tutor_training.participants'),
  ('HR_EXECUTIVE', 'tutor_training.record'),
  ('HR_EXECUTIVE', 'tutor_hr.tutors.read'),
  ('HR_EXECUTIVE', 'tutor_hr.profile.read'),
  ('HR_EXECUTIVE', 'tutor_hr.profile.manage'),
  ('HR_EXECUTIVE', 'tutor_hr.notes.manage'),
  ('DEMO_HEAD', 'demo.reschedule'),
  ('DEMO_HEAD', 'demo.cancel'),
  ('DEMO_ADMIN', 'demo.reschedule'),
  ('DEMO_ADMIN', 'demo.cancel'),
  ('DEMO_COORDINATOR', 'demo.reschedule'),
  ('TUTOR_HEAD', 'tutor_lead.read'),
  ('TUTOR_HEAD', 'tutor_lead.manage'),
  ('TUTOR_HEAD', 'tutor_lead.create'),
  ('TUTOR_HEAD', 'tutor_lead.update'),
  ('TUTOR_HEAD', 'tutor_lead.stage.update'),
  ('TUTOR_HEAD', 'tutor_lead.training.read'),
  ('TUTOR_HEAD', 'tutor_hiring.read-all'),
  ('TUTOR_HEAD', 'tutor_hiring.reassign'),
  ('TUTOR_HEAD', 'tutor_hiring.report'),
  ('TUTOR_HEAD', 'tutor_hiring.settings'),
  ('TUTOR_HEAD', 'tutor_hiring.override'),
  ('TUTOR_HEAD', 'tutor_training.read'),
  ('TUTOR_HEAD', 'tutor_training.schedule'),
  ('TUTOR_HEAD', 'tutor_training.record'),
  ('TUTOR_HEAD', 'tutor_training.override'),
  ('TUTOR_HEAD', 'tutor_hr.ready_for_assignment'),
  ('TUTOR_HEAD', 'tutor_hr.tutors.read'),
  ('TUTOR_HEAD', 'tutor_hr.profile.read'),
  ('TUTOR_HEAD', 'tutor_coordination.read'),
  ('TUTOR_HEAD', 'tutor_coordination.observe'),
  ('TUTOR_HEAD', 'tutor_coordination.manage'),
  ('TUTOR_HEAD', 'employee.read'),
  ('TUTOR_HEAD', 'department.read'),
  ('TUTOR_HEAD', 'attendance.action.own'),
  ('TUTOR_HEAD', 'attendance.read.own'),
  ('TUTOR_COORDINATOR', 'tutor_coordination.read'),
  ('TUTOR_COORDINATOR', 'tutor_coordination.observe'),
  ('TUTOR_COORDINATOR', 'tutor_training.read'),
  ('TUTOR_COORDINATOR', 'tutor_training.record'),
  ('TUTOR_COORDINATOR', 'attendance.action.own'),
  ('TUTOR_COORDINATOR', 'attendance.read.own');

-- Guards: stop with a clear message instead of inserting something partial.
DO $guard$
DECLARE missing_perms text; missing_roles text; n_links int; n_codes int;
BEGIN
  SELECT count(*) INTO n_links FROM wanted_links;
  SELECT count(*) INTO n_codes FROM release_codes;
  IF n_links <> 80 OR n_codes <> 20 THEN
    RAISE EXCEPTION 'Script tables are not the expected size (links %, codes %). Do not edit the repository copy.', n_links, n_codes;
  END IF;

  SELECT string_agg(DISTINCT w.permission_code, ', ') INTO missing_perms
  FROM wanted_links w LEFT JOIN permissions p ON p.code = w.permission_code WHERE p.id IS NULL;
  IF missing_perms IS NOT NULL THEN
    RAISE EXCEPTION 'Permission rows missing (run the seed, step D8, first): %', missing_perms;
  END IF;

  SELECT string_agg(DISTINCT w.role_code, ', ') INTO missing_roles
  FROM wanted_links w
  WHERE NOT EXISTS (SELECT 1 FROM roles r WHERE r.code = w.role_code)
    AND NOT EXISTS (SELECT 1 FROM wanted_roles wr WHERE wr.code = w.role_code);
  IF missing_roles IS NOT NULL THEN
    RAISE EXCEPTION 'Roles missing that this script does not create: %', missing_roles;
  END IF;
END
$guard$;

-- Preview 1: roles that would be created.
SELECT wr.code AS role_to_create FROM wanted_roles wr
WHERE NOT EXISTS (SELECT 1 FROM roles r WHERE r.code = wr.code);

-- Preview 2: the links that would be added, by role. These are the rows to review.
SELECT w.role_code, w.permission_code
FROM wanted_links w
WHERE NOT EXISTS (
  SELECT 1 FROM role_permissions rp
  JOIN roles r ON r.id = rp.role_id AND r.code = w.role_code
  JOIN permissions p ON p.id = rp.permission_id AND p.code = w.permission_code)
ORDER BY w.role_code, w.permission_code;

SELECT w.role_code, count(*) AS links_to_add
FROM wanted_links w
WHERE NOT EXISTS (
  SELECT 1 FROM role_permissions rp
  JOIN roles r ON r.id = rp.role_id AND r.code = w.role_code
  JOIN permissions p ON p.id = rp.permission_id AND p.code = w.permission_code)
GROUP BY w.role_code ORDER BY w.role_code;

SELECT count(*) AS role_permissions_before FROM role_permissions \gset

INSERT INTO roles (id, code, name, description, is_system, is_protected, is_custom, updated_at)
SELECT gen_random_uuid()::text, wr.code, wr.name, wr.description, wr.is_system, wr.is_protected, wr.is_custom, now()
FROM wanted_roles wr
WHERE NOT EXISTS (SELECT 1 FROM roles r WHERE r.code = wr.code)
ON CONFLICT (code) DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM wanted_links w
JOIN roles r ON r.code = w.role_code
JOIN permissions p ON p.code = w.permission_code
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- Result: "INSERT 0 n" above must equal the "links_to_add" total. A second run must say INSERT 0 0.
SELECT count(*) AS role_permissions_after, count(*) - :role_permissions_before AS links_added FROM role_permissions;

-- After a real COMMIT every wanted link must exist (expect 0 missing).
SELECT count(*) AS wanted_links_still_missing
FROM wanted_links w
WHERE NOT EXISTS (
  SELECT 1 FROM role_permissions rp
  JOIN roles r ON r.id = rp.role_id AND r.code = w.role_code
  JOIN permissions p ON p.id = rp.permission_id AND p.code = w.permission_code);

-- COMMIT only if links_added equals the previewed total and nothing was missing; otherwise ROLLBACK.
-- COMMIT;
