# Class workspace: permission proposal (NOT APPLIED)

Status: proposal only. Nothing in this file has been run, seeded or granted, and the staging and production databases are
untouched. The seed source now defines the permission and excludes it from the CEO (see below), but the seed has not been run
and no role holds the permission. Every step below that changes data needs separate written approval from the owner.

## What Stage D needs

Stage D adds one permission that no role holds yet, and reuses every other permission that already exists.

| Permission | New | Used for | Held today by |
| --- | --- | --- | --- |
| `mentoring.template.manage` | yes | Editing the wording of the class reminder, class update and post-class activities messages (`PUT /mentoring/class-workspace/templates/:templateKey`) | nobody |
| `mentoring.exception.authorize` | no | Approving or rejecting a Mentor's request to verify a class without the voice recording or activities (`POST .../:key/exception/decide`) | Mentoring Head (existing grant) |
| `mentoring.stage.work` | no | Every Mentor change on a class (Meet link, reminder, cancel, request an exception, verify, record what the student did) | Mentor, Mentoring Head (existing grant) |
| `tutor.portal.read` | no | Every tutor route in the class workspace (voice upload, activities, shares) | Tutor (existing grant) |

Until `mentoring.template.manage` is granted, the three built-in templates in `class-workspace.ts` are used as they are, and
the template editor stays closed to everyone. Nothing else in Stage D depends on it.

## Proposed holder

`MENTORING_HEAD` only. Reasons: the templates are shared by every Mentor, so one accountable owner should change them; the
Head already decides exceptions; the CEO is not given operational permissions in Mentoring.

## Seed source change (made in the working tree, not run)

Found in review: `CEO` receives every catalog permission that is not listed in `MENTORING_OPERATIONAL_CODES`, so adding the
permission to the catalog alone would have given it to the CEO on the next seed. The working tree now does both things, and
nothing else:

1. The permission is defined in the `PERMISSIONS` list of `apps/api/prisma/seed.ts`, next to `mentoring.complaint.handle`:

```ts
{
  code: 'mentoring.template.manage',
  resource: 'mentoring.template',
  action: 'manage',
  description: 'Edit the wording of Mentoring class message templates',
},
```

2. `'mentoring.template.manage'` is added to `MENTORING_OPERATIONAL_CODES`, the set the CEO is filtered by, so the CEO cannot
   inherit it.

No role list names it, so running the seed would create the permission row and grant it to nobody. The later grant to
`MENTORING_HEAD` is the separate step below. The drift specs now expect 15 operational codes (they expected 14) and still
check that every excluded code exists in the catalog and is absent from the CEO.

## Dry run SQL (read only, ends in ROLLBACK)

Run this on staging first, after the permission row exists. It shows what would be inserted and changes nothing.

```sql
BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM roles WHERE code = 'MENTORING_HEAD') THEN
    RAISE EXCEPTION 'The MENTORING_HEAD role is missing.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM permissions WHERE code = 'mentoring.template.manage') THEN
    RAISE EXCEPTION 'The permission mentoring.template.manage is missing. Run the approved seed first.';
  END IF;
END $$;

-- Preview: exactly one row, and it must say WILL INSERT the first time.
SELECT r.code AS role_code, p.code AS permission_code,
       CASE WHEN rp.role_id IS NULL THEN 'WILL INSERT' ELSE 'already granted' END AS status
FROM roles r
JOIN permissions p ON p.code = 'mentoring.template.manage'
LEFT JOIN role_permissions rp ON rp.role_id = r.id AND rp.permission_id = p.id
WHERE r.code = 'MENTORING_HEAD';

-- Nobody else may already hold it (expected: zero rows).
SELECT r.code AS unexpected_holder
FROM role_permissions rp
JOIN roles r ON r.id = rp.role_id
JOIN permissions p ON p.id = rp.permission_id
WHERE p.code = 'mentoring.template.manage' AND r.code <> 'MENTORING_HEAD';

ROLLBACK;
```

A real grant would follow the pattern of `apps/api/scripts/mentoring-complaint-permission-grant.sql`: a scope guard that allows
only this permission and only this role, `ON CONFLICT DO NOTHING`, one audit row, and a final `ROLLBACK` that the operator
changes to `COMMIT` only after reading the preview. That script would be written only after approval.

## What is verified without any grant

- The service refuses `saveTemplate` for a Mentor, for the Head and for any role without the permission
  (`mentoring-class-workspace.service.spec.ts`, "can be edited by someone with the template permission only").
- The route carries `@RequirePermissions('mentoring.template.manage')` (same spec, "the routes").
- The templates read route returns a `canEdit` flag from the same permission. The web has no template editor screen yet, so
  nothing offers editing to anyone; a screen can be added once the grant is approved.

## Not proposed

- No role receives `mentoring.exception.authorize` or `mentoring.stage.work` that it does not already have.
- No change to Tutor, HR, Sales or CEO roles.
- No migration step is involved in permissions: they are rows in `permissions` and `role_permissions`, not part of the Stage D
  schema migration.
