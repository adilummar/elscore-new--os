-- Scoped Role-Permission Grant: mentoring.template.manage -> MENTORING_HEAD ONLY
BEGIN;

-- Preconditions
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM roles WHERE code = 'MENTORING_HEAD') THEN
    RAISE EXCEPTION 'The MENTORING_HEAD role is missing.';
  END IF;
END $$;

-- 1. Ensure permission row exists in permissions table
INSERT INTO permissions (id, code, resource, action, description, is_delegatable)
VALUES (
  gen_random_uuid()::text,
  'mentoring.template.manage',
  'mentoring.template',
  'manage',
  'Edit the wording of Mentoring class message templates and manage activity options',
  false
)
ON CONFLICT (code) DO NOTHING;

-- 2. Grant to MENTORING_HEAD only
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.code = 'MENTORING_HEAD' AND p.code = 'mentoring.template.manage'
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- 3. Scope verification guard: Verify NO OTHER ROLE holds mentoring.template.manage
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM role_permissions rp
    JOIN roles r ON r.id = rp.role_id
    JOIN permissions p ON p.id = rp.permission_id
    WHERE p.code = 'mentoring.template.manage' AND r.code <> 'MENTORING_HEAD'
  ) THEN
    RAISE EXCEPTION 'Unintended role holds mentoring.template.manage; aborting transaction.';
  END IF;
  
  -- Verify MENTORING_HEAD holds it
  IF NOT EXISTS (
    SELECT 1 FROM role_permissions rp
    JOIN roles r ON r.id = rp.role_id
    JOIN permissions p ON p.id = rp.permission_id
    WHERE p.code = 'mentoring.template.manage' AND r.code = 'MENTORING_HEAD'
  ) THEN
    RAISE EXCEPTION 'Grant to MENTORING_HEAD failed; aborting transaction.';
  END IF;
END $$;

-- Audit event
INSERT INTO audit_events (id, entity_type, entity_id, action, new_value, metadata)
SELECT gen_random_uuid()::text,
       'RolePermission',
       'MENTORING_HEAD',
       'MENTORING_TEMPLATE_PERMISSION_GRANTED',
       jsonb_build_object('permission', 'mentoring.template.manage'),
       jsonb_build_object('granted_at', now());

COMMIT;
