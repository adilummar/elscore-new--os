# Tutor HR permission grant (manual, reviewed script)

`tutor_hr_permission_grant.sql` is **not a migration**. `prisma migrate deploy` and `prisma db seed` never run it.

## Why it exists

On a database that already has users, `prisma db seed` inserts the permission catalog and the roles but leaves
role-permission links unchanged (and `SEED_RECONCILE_ROLE_PERMISSIONS` must never be used on staging, because it
would also re-add sensitive grants an administrator removed). After the seed, no role would hold the 20 permission
codes added by the Tutor HR release, and the new roles TUTOR_HEAD and TUTOR_COORDINATOR would hold nothing.

## What it does

- Inserts **80 links** copied from `ROLE_PERMISSIONS` in `apps/api/prisma/seed.ts`:
  every link involving one of the 20 new codes (CEO 20, CO_FOUNDER 5, HR_MANAGER 12, HR_EXECUTIVE 7,
  DEMO_HEAD 2, DEMO_ADMIN 2, DEMO_COORDINATOR 1), plus the complete seed mapping of TUTOR_HEAD (25) and
  TUTOR_COORDINATOR (6).
- Creates TUTOR_HEAD and TUTOR_COORDINATOR if missing (seed definitions). It does not create permission rows:
  if the seed has not run it stops and lists what is missing.
- Never deletes or updates anything. A link an administrator removed from an existing role stays removed.
- Safe to run twice: the second run inserts 0 rows.
- Previews the roles and links it would add, then rolls back unless the final `-- COMMIT;` is enabled.

## Running it

Same procedure as the backfills (`../tutor-hr-backfills/README.md`):

```bash
psql -v ON_ERROR_STOP=1 -d elscore_os_staging -Atc "select current_database()"
psql -v ON_ERROR_STOP=1 -d elscore_os_staging -f tutor_hr_permission_grant.sql      # preview, rolls back
```

Check that the second result set lists only the expected links, that `links_to_add` totals match, and that the
`INSERT` for `role_permissions` reports the same number. To commit (only after the owner approves the preview):
copy the file to `/var/tmp`, replace only the final `-- COMMIT;` with `COMMIT;`, confirm with `tail -n 3`, run the copy.

## Tests

- `apps/api/src/common/rbac/tutor-hr-permission-grant.spec.ts` (Jest): fails if the SQL drifts from `seed.ts`
  (links not in the seed, release-code links missing, new roles incomplete, any DELETE/UPDATE/ALTER, COMMIT enabled).
- `test-grant-local.sh`: runs the script against a throwaway local database. It refuses any database other than
  `127.0.0.1:5433/elscore_grant_scratch`. It removes the release links to recreate the post-seed state, then checks
  preview rollback, exactly +80 links, an unrelated removed link staying removed, the final state equalling a freshly
  seeded database, a no-op second run, role creation when the roles are missing, and the missing-permission guard.
  It needs a freshly migrated and seeded scratch database each time it is run.

Undo: there is no undo script. Restore the pre-deployment backup. The links are insert-only and are removed by
deleting exactly the rows the preview listed, if the owner prefers that to a restore.
