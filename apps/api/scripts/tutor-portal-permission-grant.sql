-- =============================================================================
-- EL SCORE OS — Tutor portal role-permission grant               *** NOT EXECUTED ***
--
-- PURPOSE
--   Gives the TUTOR role the one new permission 'tutor.portal.read' (open the tutor portal: a tutor's own classes and
--   records). It exists because the standard seed leaves role-permission links unchanged on a populated database.
--
-- WHAT IT TOUCHES
--   INSERT into role_permissions   one row: TUTOR + tutor.portal.read
--   INSERT into audit_events       one summary row, only if the grant was actually new
--   It never UPDATEs or DELETEs anything, grants nothing to any other role, and is idempotent (ON CONFLICT DO NOTHING).
--
-- PRECONDITIONS (checked below; the script stops with an error otherwise)
--   * The approved seed has been run, so the permission 'tutor.portal.read' exists (the seed only INSERTS missing
--     permissions and roles).
--
-- HOW TO USE (operator, after owner approval)
--   1. Run the file as-is: it ends with ROLLBACK, so it is a DRY RUN that prints exactly what it WOULD insert.
--   2. If the preview is right, change the final ROLLBACK to COMMIT and run it once.
--   Existing sessions pick the permission up after the permission cache expires (about 5 minutes) or after sign-in.
-- =============================================================================

BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM roles WHERE code = 'TUTOR') THEN
    RAISE EXCEPTION 'The TUTOR role is missing. Run the approved seed first.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM permissions WHERE code = 'tutor.portal.read') THEN
    RAISE EXCEPTION 'The permission tutor.portal.read is missing. Run the approved seed first.';
  END IF;
END $$;

CREATE TEMP TABLE _wanted (role_code text NOT NULL, permission_code text NOT NULL) ON COMMIT DROP;
INSERT INTO _wanted (role_code, permission_code) VALUES
  ('TUTOR', 'tutor.portal.read');

-- Scope guard: this script grants only tutor.portal.read, only to TUTOR
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM _wanted WHERE permission_code <> 'tutor.portal.read' OR role_code <> 'TUTOR') THEN
    RAISE EXCEPTION 'This script may only grant tutor.portal.read to TUTOR';
  END IF;
END $$;

CREATE TEMP TABLE _baseline ON COMMIT DROP AS
SELECT count(*)::int AS other_links
FROM role_permissions rp JOIN permissions p ON p.id = rp.permission_id
WHERE p.code <> 'tutor.portal.read';

-- Preview (read-only)
SELECT w.role_code, w.permission_code,
       CASE WHEN rp.role_id IS NULL THEN 'WILL INSERT' ELSE 'already granted' END AS status
FROM _wanted w
JOIN roles r ON r.code = w.role_code
JOIN permissions p ON p.code = w.permission_code
LEFT JOIN role_permissions rp ON rp.role_id = r.id AND rp.permission_id = p.id;

-- Grant + audit
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
       'TUTOR_PORTAL_PERMISSION_GRANTED',
       jsonb_build_object('permissions', jsonb_agg(p.code ORDER BY p.code)),
       jsonb_build_object('script', 'apps/api/scripts/tutor-portal-permission-grant.sql')
FROM inserted i
JOIN roles r ON r.id = i.role_id
JOIN permissions p ON p.id = i.permission_id
GROUP BY r.code;

-- Post-conditions: stop (and roll back) if anything is off
DO $$
DECLARE
  before_count int;
  after_count int;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM role_permissions rp
    JOIN roles r ON r.id = rp.role_id
    JOIN permissions p ON p.id = rp.permission_id
    WHERE r.code = 'TUTOR' AND p.code = 'tutor.portal.read'
  ) THEN
    RAISE EXCEPTION 'The wanted grant is missing after the insert';
  END IF;
  SELECT other_links INTO before_count FROM _baseline;
  SELECT count(*)::int INTO after_count
  FROM role_permissions rp JOIN permissions p ON p.id = rp.permission_id
  WHERE p.code <> 'tutor.portal.read';
  IF before_count <> after_count THEN
    RAISE EXCEPTION 'Other role permissions changed (% -> %); aborting', before_count, after_count;
  END IF;
END $$;

-- DRY RUN by default. After reviewing the preview above, replace this line with COMMIT; and run once more.
ROLLBACK;
