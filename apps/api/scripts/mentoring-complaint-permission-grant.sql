-- =============================================================================
-- EL SCORE OS — Mentoring complaint role-permission grant         *** NOT EXECUTED ***
--
-- PURPOSE
--   Gives the MENTOR and MENTORING_HEAD roles the one new permission 'mentoring.complaint.handle' (log, acknowledge, respond to,
--   assign, escalate, resolve and reopen parent complaints). It exists because the standard seed leaves role-permission links
--   unchanged on a populated database. The Mentoring Head holds it so a complaint can be escalated to them and they can act on it.
--
-- WHAT IT TOUCHES
--   INSERT into role_permissions   up to two rows: MENTOR and MENTORING_HEAD, each with mentoring.complaint.handle
--   INSERT into audit_events       one summary row per role that actually received the grant
--   It never UPDATEs or DELETEs anything, grants nothing to any other role (the CEO is deliberately not given it), and is
--   idempotent (ON CONFLICT DO NOTHING).
--
-- PRECONDITIONS (checked below; the script stops with an error otherwise)
--   * The permission 'mentoring.complaint.handle' exists in the permissions table (the approved seed inserts it, or an operator
--     inserts that one row first), and both roles exist.
--
-- HOW TO USE (operator, after owner approval)
--   1. Run the file as-is: it ends with ROLLBACK, so it is a DRY RUN that prints exactly what it WOULD insert.
--   2. If the preview is right, change the final ROLLBACK to COMMIT and run it once.
--   Existing sessions pick the permission up after the permission cache expires (about 5 minutes) or after sign-in.
-- =============================================================================

BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM roles WHERE code = 'MENTOR') OR NOT EXISTS (SELECT 1 FROM roles WHERE code = 'MENTORING_HEAD') THEN
    RAISE EXCEPTION 'The MENTOR or MENTORING_HEAD role is missing. Run the approved seed first.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM permissions WHERE code = 'mentoring.complaint.handle') THEN
    RAISE EXCEPTION 'The permission mentoring.complaint.handle is missing. Run the approved seed first.';
  END IF;
END $$;

CREATE TEMP TABLE _wanted (role_code text NOT NULL, permission_code text NOT NULL) ON COMMIT DROP;
INSERT INTO _wanted (role_code, permission_code) VALUES
  ('MENTORING_HEAD', 'mentoring.complaint.handle'),
  ('MENTOR', 'mentoring.complaint.handle');

-- Scope guard: this script grants only mentoring.complaint.handle, only to MENTOR and MENTORING_HEAD
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM _wanted WHERE permission_code <> 'mentoring.complaint.handle' OR role_code NOT IN ('MENTOR', 'MENTORING_HEAD')) THEN
    RAISE EXCEPTION 'This script may only grant mentoring.complaint.handle to MENTOR and MENTORING_HEAD';
  END IF;
END $$;

CREATE TEMP TABLE _baseline ON COMMIT DROP AS
SELECT count(*)::int AS other_links
FROM role_permissions rp JOIN permissions p ON p.id = rp.permission_id
WHERE p.code <> 'mentoring.complaint.handle';

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
       'MENTORING_COMPLAINT_PERMISSION_GRANTED',
       jsonb_build_object('permissions', jsonb_agg(p.code ORDER BY p.code)),
       jsonb_build_object('script', 'apps/api/scripts/mentoring-complaint-permission-grant.sql')
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
  IF (
    SELECT count(*) FROM role_permissions rp
    JOIN roles r ON r.id = rp.role_id
    JOIN permissions p ON p.id = rp.permission_id
    WHERE r.code IN ('MENTOR', 'MENTORING_HEAD') AND p.code = 'mentoring.complaint.handle'
  ) <> 2 THEN
    RAISE EXCEPTION 'The wanted grants are missing after the insert';
  END IF;
  IF EXISTS (
    SELECT 1 FROM role_permissions rp
    JOIN roles r ON r.id = rp.role_id
    JOIN permissions p ON p.id = rp.permission_id
    WHERE p.code = 'mentoring.complaint.handle' AND r.code NOT IN ('MENTOR', 'MENTORING_HEAD')
  ) THEN
    RAISE EXCEPTION 'Another role holds mentoring.complaint.handle; aborting';
  END IF;
  SELECT other_links INTO before_count FROM _baseline;
  SELECT count(*)::int INTO after_count
  FROM role_permissions rp JOIN permissions p ON p.id = rp.permission_id
  WHERE p.code <> 'mentoring.complaint.handle';
  IF before_count <> after_count THEN
    RAISE EXCEPTION 'Other role permissions changed (% -> %); aborting', before_count, after_count;
  END IF;
END $$;

-- DRY RUN by default. After reviewing the preview above, replace this line with COMMIT; and run once more.
ROLLBACK;
