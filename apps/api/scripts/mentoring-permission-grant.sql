-- =============================================================================
-- EL SCORE OS — Mentoring-only role-permission grant            *** NOT EXECUTED ***
--
-- PURPOSE
--   On a database that already has users, the standard seed leaves role-permission links unchanged
--   (the global SEED_RECONCILE_ROLE_PERMISSIONS switch would also re-insert every other missing catalog
--   link, including sensitive HR grants an administrator removed). This script grants ONLY the
--   mentoring.* permissions to the roles that are meant to hold them, and nothing else.
--
-- WHAT IT TOUCHES
--   INSERT into role_permissions   rows where the permission code starts with 'mentoring.'
--   INSERT into audit_events       one summary row per role that actually received a new grant
--   It never UPDATEs or DELETEs anything, never touches HR / Sales / Finance permissions, never touches
--   user_permissions or user_roles, and is idempotent (ON CONFLICT DO NOTHING).
--
-- PRECONDITIONS (checked below; the script stops with an error otherwise)
--   * The Mentoring migrations are applied and the standard seed has been run on a populated database.
--     That seed only INSERTS missing roles and permissions, so MENTORING_HEAD, DEMO_COUNSELOR and all
--     mentoring.* permissions exist, but without any role links.
--   * Run it only against the database you intend, after a verified backup.
--
-- HOW TO USE (operator, after owner approval)
--   1. Review the WANTED list. It is generated from prisma/seed.ts; the unit test
--      src/modules/mentoring/mentoring-permission-grant.spec.ts fails if the two ever differ.
--      (CO_FOUNDER is the read-only Co-Founder role: delete its lines if it should not see Mentoring.)
--   2. Run the file as-is: it ends with ROLLBACK, so it is a DRY RUN that prints exactly what it WOULD insert.
--   3. If the preview is right, change the final ROLLBACK to COMMIT and run it once.
--   Existing sessions pick the new permissions up after the permission cache expires (about 5 minutes) or
--   after the affected users sign in again.
-- =============================================================================

BEGIN;

-- Preconditions -----------------------------------------------------------------------------------------------
DO $$
DECLARE
  missing_roles text;
  missing_permissions text;
BEGIN
  SELECT string_agg(r, ', ') INTO missing_roles
  FROM unnest(ARRAY['MENTORING_HEAD', 'MENTOR', 'DEMO_COUNSELOR', 'SALES_HEAD', 'CEO', 'CO_FOUNDER']) AS r
  WHERE NOT EXISTS (SELECT 1 FROM roles WHERE code = r);
  IF missing_roles IS NOT NULL THEN
    RAISE EXCEPTION 'Roles missing: %. Run the approved seed first (it only inserts missing roles and permissions).', missing_roles;
  END IF;

  SELECT string_agg(p, ', ') INTO missing_permissions
  FROM unnest(ARRAY['mentoring.activation.cancel', 'mentoring.allocation.configure', 'mentoring.allocation.manage', 'mentoring.allocation.read', 'mentoring.approval.final', 'mentoring.audit.read', 'mentoring.complaint.handle', 'mentoring.exception.authorize', 'mentoring.handover.retry', 'mentoring.staff.manage', 'mentoring.staff.read', 'mentoring.stage.verify', 'mentoring.stage.work', 'mentoring.student.read-all', 'mentoring.student.read-assigned', 'mentoring.task.create', 'mentoring.task.verify', 'mentoring.task.work', 'mentoring.workflow.pause']) AS p
  WHERE NOT EXISTS (SELECT 1 FROM permissions WHERE code = p);
  IF missing_permissions IS NOT NULL THEN
    RAISE EXCEPTION 'Permissions missing: %. Run the approved seed first.', missing_permissions;
  END IF;
END $$;

-- Desired grants ----------------------------------------------------------------------------------------------
CREATE TEMP TABLE _wanted (role_code text NOT NULL, permission_code text NOT NULL) ON COMMIT DROP;
INSERT INTO _wanted (role_code, permission_code) VALUES
  ('MENTORING_HEAD', 'mentoring.activation.cancel'),
  ('MENTORING_HEAD', 'mentoring.allocation.configure'),
  ('MENTORING_HEAD', 'mentoring.allocation.manage'),
  ('MENTORING_HEAD', 'mentoring.allocation.read'),
  ('MENTORING_HEAD', 'mentoring.approval.final'),
  ('MENTORING_HEAD', 'mentoring.audit.read'),
  ('MENTORING_HEAD', 'mentoring.complaint.handle'),
  ('MENTORING_HEAD', 'mentoring.exception.authorize'),
  ('MENTORING_HEAD', 'mentoring.staff.manage'),
  ('MENTORING_HEAD', 'mentoring.staff.read'),
  ('MENTORING_HEAD', 'mentoring.student.read-all'),
  ('MENTORING_HEAD', 'mentoring.task.create'),
  ('MENTORING_HEAD', 'mentoring.task.verify'),
  ('MENTORING_HEAD', 'mentoring.workflow.pause'),
  ('MENTOR', 'mentoring.stage.verify'),
  ('MENTOR', 'mentoring.complaint.handle'),
  ('MENTOR', 'mentoring.stage.work'),
  ('MENTOR', 'mentoring.student.read-assigned'),
  ('MENTOR', 'mentoring.task.create'),
  ('MENTOR', 'mentoring.task.verify'),
  ('MENTOR', 'mentoring.workflow.pause'),
  ('DEMO_COUNSELOR', 'mentoring.student.read-assigned'),
  ('DEMO_COUNSELOR', 'mentoring.task.work'),
  ('SALES_HEAD', 'mentoring.handover.retry'),
  ('CEO', 'mentoring.allocation.read'),
  ('CEO', 'mentoring.audit.read'),
  ('CEO', 'mentoring.staff.read'),
  ('CEO', 'mentoring.student.read-all'),
  ('CEO', 'mentoring.student.read-assigned'),
  ('CO_FOUNDER', 'mentoring.allocation.read'),
  ('CO_FOUNDER', 'mentoring.audit.read'),
  ('CO_FOUNDER', 'mentoring.staff.read'),
  ('CO_FOUNDER', 'mentoring.student.read-all');

-- Scope guard: nothing outside the Mentoring catalog may ever be granted by this script
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM _wanted WHERE permission_code NOT LIKE 'mentoring.%') THEN
    RAISE EXCEPTION 'This script may only grant mentoring.* permissions';
  END IF;
  IF EXISTS (SELECT 1 FROM _wanted WHERE role_code = 'CEO' AND permission_code IN ('mentoring.activation.cancel', 'mentoring.allocation.configure', 'mentoring.allocation.manage', 'mentoring.approval.final', 'mentoring.complaint.handle', 'mentoring.exception.authorize', 'mentoring.handover.retry', 'mentoring.staff.manage', 'mentoring.stage.verify', 'mentoring.stage.work', 'mentoring.task.create', 'mentoring.task.verify', 'mentoring.task.work', 'mentoring.workflow.pause')) THEN
    RAISE EXCEPTION 'The CEO must not receive operational Mentoring permissions';
  END IF;
  IF EXISTS (SELECT 1 FROM _wanted WHERE permission_code = 'mentoring.handover.retry' AND role_code <> 'SALES_HEAD') THEN
    RAISE EXCEPTION 'mentoring.handover.retry is reserved for the Sales Head';
  END IF;
END $$;

-- Baseline for the post-condition: number of NON-mentoring links before anything is written
CREATE TEMP TABLE _baseline ON COMMIT DROP AS
SELECT count(*)::int AS non_mentoring_links
FROM role_permissions rp JOIN permissions p ON p.id = rp.permission_id
WHERE p.code NOT LIKE 'mentoring.%';

-- Preview (read-only): what will be inserted and what already exists --------------------------------------------
SELECT w.role_code, w.permission_code,
       CASE WHEN rp.role_id IS NULL THEN 'WILL INSERT' ELSE 'already granted' END AS status
FROM _wanted w
JOIN roles r ON r.code = w.role_code
JOIN permissions p ON p.code = w.permission_code
LEFT JOIN role_permissions rp ON rp.role_id = r.id AND rp.permission_id = p.id
ORDER BY w.role_code, w.permission_code;

-- Grant + audit -----------------------------------------------------------------------------------------------
WITH inserted AS (
  INSERT INTO role_permissions (role_id, permission_id)
  SELECT r.id, p.id
  FROM _wanted w
  JOIN roles r ON r.code = w.role_code
  JOIN permissions p ON p.code = w.permission_code
  ON CONFLICT (role_id, permission_id) DO NOTHING
  RETURNING role_id, permission_id
)
INSERT INTO audit_events (id, entity_type, entity_id, action, new_value, metadata)
SELECT gen_random_uuid()::text,
       'RolePermission',
       r.code,
       'MENTORING_PERMISSIONS_GRANTED',
       jsonb_build_object('permissions', jsonb_agg(p.code ORDER BY p.code)),
       jsonb_build_object('script', 'apps/api/scripts/mentoring-permission-grant.sql')
FROM inserted i
JOIN roles r ON r.id = i.role_id
JOIN permissions p ON p.id = i.permission_id
GROUP BY r.code;

-- Post-conditions: stop (and roll back) if anything is off ---------------------------------------------------------
DO $$
DECLARE
  before_count int;
  after_count int;
BEGIN
  IF EXISTS (
    SELECT 1 FROM _wanted w
    JOIN roles r ON r.code = w.role_code
    JOIN permissions p ON p.code = w.permission_code
    WHERE NOT EXISTS (SELECT 1 FROM role_permissions rp WHERE rp.role_id = r.id AND rp.permission_id = p.id)
  ) THEN
    RAISE EXCEPTION 'A wanted grant is missing after the insert';
  END IF;

  IF EXISTS (
    SELECT 1 FROM role_permissions rp
    JOIN roles r ON r.id = rp.role_id
    JOIN permissions p ON p.id = rp.permission_id
    WHERE r.code = 'CEO' AND p.code IN ('mentoring.activation.cancel', 'mentoring.allocation.configure', 'mentoring.allocation.manage', 'mentoring.approval.final', 'mentoring.complaint.handle', 'mentoring.exception.authorize', 'mentoring.handover.retry', 'mentoring.staff.manage', 'mentoring.stage.verify', 'mentoring.stage.work', 'mentoring.task.create', 'mentoring.task.verify', 'mentoring.task.work', 'mentoring.workflow.pause')
  ) THEN
    RAISE EXCEPTION 'The CEO holds an operational Mentoring permission';
  END IF;

  SELECT non_mentoring_links INTO before_count FROM _baseline;
  SELECT count(*)::int INTO after_count
  FROM role_permissions rp JOIN permissions p ON p.id = rp.permission_id
  WHERE p.code NOT LIKE 'mentoring.%';
  IF before_count <> after_count THEN
    RAISE EXCEPTION 'Non-Mentoring role permissions changed (% -> %); aborting', before_count, after_count;
  END IF;
END $$;

-- Result summary (read-only) -------------------------------------------------------------------------------------
SELECT r.code AS role_code, count(*) AS mentoring_permissions
FROM role_permissions rp
JOIN roles r ON r.id = rp.role_id
JOIN permissions p ON p.id = rp.permission_id
WHERE p.code LIKE 'mentoring.%'
GROUP BY r.code
ORDER BY r.code;

-- DRY RUN by default. After reviewing the preview above, replace this line with COMMIT; and run once more.
ROLLBACK;
