#!/usr/bin/env bash
# Local test of tutor_hr_permission_grant.sql. Refuses to run against anything except the throwaway database
# 127.0.0.1:5433/elscore_grant_scratch. The database must already hold a freshly migrated and seeded schema
# (prisma migrate deploy, then prisma db seed). The test removes the release links to recreate the state a
# populated staging database is in after the seed, then checks the script. It NEVER touches another database.
#
#   createdb ... elscore_grant_scratch; DATABASE_URL=... prisma migrate deploy; DATABASE_URL=... prisma db seed
#   PGPASSWORD=<local password> bash test-grant-local.sh
set -euo pipefail
HOST=127.0.0.1; PORT=5433; DB=elscore_grant_scratch; USER_NAME=${PGUSER:-elscore}
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SQL="$HERE/tutor_hr_permission_grant.sql"
q()  { psql -h $HOST -p $PORT -U "$USER_NAME" -d $DB -v ON_ERROR_STOP=1 -Atqc "$1"; }
run(){ psql -h $HOST -p $PORT -U "$USER_NAME" -d $DB -v ON_ERROR_STOP=1 -f "$1"; }
[ "$(q 'select current_database()')" = "$DB" ] || { echo "wrong database"; exit 2; }
fail(){ echo "FAIL: $*"; exit 1; }
ok(){ echo "ok   - $*"; }
links_hash(){ q "select md5(string_agg(r.code||':'||p.code, ',' order by r.code, p.code)) from role_permissions rp join roles r on r.id=rp.role_id join permissions p on p.id=rp.permission_id"; }
n_links(){ q "select count(*) from role_permissions"; }

COMMIT_COPY="$(mktemp)"; trap 'rm -f "$COMMIT_COPY"' EXIT
sed 's/^-- COMMIT;$/COMMIT;/' "$SQL" > "$COMMIT_COPY"
[ "$(tail -n 1 "$COMMIT_COPY")" = "COMMIT;" ] || fail "could not enable COMMIT in the copy"
[ "$(tail -n 1 "$SQL")" = "-- COMMIT;" ] || fail "repository copy must keep COMMIT commented"

SEEDED_HASH=$(links_hash); SEEDED_N=$(n_links)
RELEASE="select p.id from permissions p where p.code in (select code from (values ('demo.reschedule'),('demo.cancel'),('tutor_hiring.read-all'),('tutor_hiring.reassign'),('tutor_hiring.report'),('tutor_coordination.read'),('tutor_coordination.observe'),('tutor_coordination.manage'),('tutor_hr.profile.read'),('tutor_hr.profile.manage'),('tutor_hr.notes.manage'),('tutor_hr.ready_for_assignment'),('tutor_hr.tutors.read'),('tutor_training.read'),('tutor_training.schedule'),('tutor_training.participants'),('tutor_training.record'),('tutor_training.override'),('tutor_hiring.override'),('tutor_hiring.settings')) v(code))"

# Recreate "after the seed on a populated database": catalog and roles exist, release links do not.
q "delete from role_permissions where permission_id in ($RELEASE) or role_id in (select id from roles where code in ('TUTOR_HEAD','TUTOR_COORDINATOR'))" >/dev/null
# One unrelated link an administrator removed on purpose: the script must not bring it back.
q "delete from role_permissions where role_id=(select id from roles where code='HR_MANAGER') and permission_id=(select id from permissions where code='tutor_lead.approve')" >/dev/null
BASE_HASH=$(links_hash); BASE_N=$(n_links)
[ "$BASE_N" -lt "$SEEDED_N" ] || fail "reset removed nothing"
echo "state: seeded=$SEEDED_N links, after reset=$BASE_N"

run "$SQL" > "$COMMIT_COPY.preview.txt"
[ "$(links_hash)" = "$BASE_HASH" ] || fail "preview changed data"; ok "preview rolls back (links unchanged)"
grep -q "links_added" "$COMMIT_COPY.preview.txt" && grep -qE "^ *80$|\| *80$" "$COMMIT_COPY.preview.txt" || fail "preview does not show 80"
rm -f "$COMMIT_COPY.preview.txt"

run "$COMMIT_COPY" >/dev/null
[ "$(n_links)" = "$((BASE_N + 80))" ] || fail "expected +80 links, got $(n_links) from $BASE_N"; ok "commit adds exactly 80 links"
[ "$(q "select count(*) from role_permissions rp join roles r on r.id=rp.role_id join permissions p on p.id=rp.permission_id where r.code='HR_MANAGER' and p.code='tutor_lead.approve'")" = 0 ] || fail "re-added a link an admin removed"; ok "intentionally removed HR_MANAGER link stays removed"
# Everything that existed before is still there; the final set equals the seeded set minus the deliberate removal.
[ "$(n_links)" = "$((SEEDED_N - 1))" ] || fail "final count $(n_links) != seeded-1 ($((SEEDED_N - 1)))"; ok "final link count = freshly seeded state minus the deliberate removal"

HASH1=$(links_hash)
OUT=$(run "$COMMIT_COPY" | grep -E "^INSERT" | tr '\n' ' ')
echo "$OUT" | grep -q "INSERT 0 0" || fail "second run inserted rows: $OUT"
[ "$(links_hash)" = "$HASH1" ] || fail "second run changed data"; ok "second run is a no-op (INSERT 0 0)"

# Roles missing entirely (the old-seed state): script creates them, then links.
q "delete from roles where code in ('TUTOR_HEAD','TUTOR_COORDINATOR')" >/dev/null
run "$COMMIT_COPY" >/dev/null
[ "$(q "select count(*) from roles where code in ('TUTOR_HEAD','TUTOR_COORDINATOR') and is_system and not is_protected and not is_custom")" = 2 ] || fail "roles not created correctly"
[ "$(n_links)" = "$((SEEDED_N - 1))" ] || fail "links after role re-creation: $(n_links)"; ok "missing TUTOR_HEAD / TUTOR_COORDINATOR are created, with their links"

# Guard: a missing permission row stops the script before anything is written.
HASH_G=$(links_hash); GUARD=$(mktemp); { echo "BEGIN; DELETE FROM permissions WHERE code='tutor_hiring.override';"; echo "\i $(cygpath -m "$COMMIT_COPY" 2>/dev/null || echo "$COMMIT_COPY")"; } > "$GUARD"
if run "$GUARD" >/dev/null 2>"$GUARD.err"; then fail "guard did not stop the script"; fi
grep -q "Permission rows missing" "$GUARD.err" || fail "guard message missing"; rm -f "$GUARD" "$GUARD.err"
[ "$(links_hash)" = "$HASH_G" ] && [ "$(q "select count(*) from permissions where code='tutor_hiring.override'")" = 1 ] || fail "guard run changed data"; ok "missing permission row stops the script and rolls back"

# Grant lands where intended.
[ "$(q "select count(*) from role_permissions rp join roles r on r.id=rp.role_id where r.code='TUTOR_COORDINATOR'")" = 6 ] || fail "coordinator links"
echo "ALL CHECKS PASSED"
