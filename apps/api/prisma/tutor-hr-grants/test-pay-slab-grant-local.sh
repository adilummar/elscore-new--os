#!/usr/bin/env bash
# Local test of pay_slab_permission_grant.sql. Refuses any database except the throwaway
# 127.0.0.1:5433/elscore_slab_empty (migrated and seeded). It removes the two Pay Slab links to recreate the state
# of a populated database after the seed, then checks the script. It never touches another database.
#   PGPASSWORD=<local password> bash test-pay-slab-grant-local.sh
set -euo pipefail
HOST=127.0.0.1; PORT=5433; DB=elscore_slab_empty; USER_NAME=${PGUSER:-elscore}
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SQL="$HERE/pay_slab_permission_grant.sql"
q()  { psql -h $HOST -p $PORT -U "$USER_NAME" -d $DB -v ON_ERROR_STOP=1 -Atqc "$1"; }
run(){ psql -h $HOST -p $PORT -U "$USER_NAME" -d $DB -v ON_ERROR_STOP=1 -f "$1"; }
[ "$(q 'select current_database()')" = "$DB" ] || { echo "wrong database"; exit 2; }
fail(){ echo "FAIL: $*"; exit 1; }
ok(){ echo "ok   - $*"; }
links_hash(){ q "select md5(string_agg(r.code||':'||p.code, ',' order by r.code, p.code)) from role_permissions rp join roles r on r.id=rp.role_id join permissions p on p.id=rp.permission_id"; }
n_links(){ q "select count(*) from role_permissions"; }

TMP="$(mktemp)"; trap 'rm -f "$TMP" "$TMP.out" "$TMP.guard" "$TMP.err"' EXIT
sed 's/^-- COMMIT;$/COMMIT;/' "$SQL" > "$TMP"
[ "$(tail -n 1 "$TMP")" = "COMMIT;" ] || fail "could not enable COMMIT in the copy"
[ "$(tail -n 1 "$SQL")" = "-- COMMIT;" ] || fail "repository copy must keep COMMIT commented"

q "insert into role_permissions (role_id, permission_id) select r.id, p.id from roles r, permissions p where r.code in ('HR_MANAGER','HR_EXECUTIVE') and p.code in ('tutor_hr.pay_slab.read','tutor_hr.pay_slab.create') on conflict (role_id, permission_id) do nothing" >/dev/null  # restore the seeded Pay Slab links (a failed earlier run may have removed them)
q "insert into role_permissions (role_id, permission_id) select r.id, p.id from roles r, permissions p where r.code='HR_EXECUTIVE' and p.code='tutor_lead.read' on conflict (role_id, permission_id) do nothing" >/dev/null  # restore the seeded state: an earlier run removes this link on purpose
SEEDED_HASH=$(links_hash); SEEDED_N=$(n_links)
q "delete from role_permissions where permission_id in (select id from permissions where code in ('tutor_hr.pay_slab.read','tutor_hr.pay_slab.create'))" >/dev/null
# An unrelated grant an administrator removed on purpose: the script must not bring it back.
q "delete from role_permissions where role_id=(select id from roles where code='HR_EXECUTIVE') and permission_id=(select id from permissions where code='tutor_lead.read')" >/dev/null
BASE_HASH=$(links_hash); BASE_N=$(n_links)
[ "$BASE_N" = "$((SEEDED_N - 5))" ] || fail "reset removed $((SEEDED_N - BASE_N)) links, expected 5"

run "$SQL" > "$TMP.out"
[ "$(links_hash)" = "$BASE_HASH" ] || fail "preview changed data"; ok "preview rolls back"
grep -q "tutor_hr.pay_slab.create" "$TMP.out" || fail "preview does not list the links"

run "$TMP" >/dev/null
[ "$(n_links)" = "$((BASE_N + 4))" ] || fail "expected +4 links, got $(n_links) from $BASE_N"; ok "commit adds exactly 4 links"
[ "$(q "select string_agg(distinct r.code, ',' order by r.code) from role_permissions rp join roles r on r.id=rp.role_id join permissions p on p.id=rp.permission_id where p.code in ('tutor_hr.pay_slab.read','tutor_hr.pay_slab.create')")" = "HR_EXECUTIVE,HR_MANAGER" ] || fail "wrong holders"; ok "only HR_MANAGER and HR_EXECUTIVE hold the codes"
[ "$(q "select count(*) from role_permissions rp join roles r on r.id=rp.role_id join permissions p on p.id=rp.permission_id where r.code='HR_EXECUTIVE' and p.code='tutor_lead.read'")" = 0 ] || fail "re-added a removed link"; ok "an unrelated removed link stays removed"
[ "$(n_links)" = "$((SEEDED_N - 1))" ] || fail "final count"; ok "final set = freshly seeded minus the deliberate removal"

H1=$(links_hash)
run "$TMP" | grep -E "^INSERT" | grep -q "INSERT 0 0" || fail "second run inserted rows"
[ "$(links_hash)" = "$H1" ] || fail "second run changed data"; ok "second run is a no-op (INSERT 0 0)"

# Guard: a missing permission row stops the script and changes nothing.
HASH_G=$(links_hash)
{ echo "BEGIN; DELETE FROM role_permissions WHERE permission_id=(SELECT id FROM permissions WHERE code='tutor_hr.pay_slab.read');";
  echo "DELETE FROM permissions WHERE code='tutor_hr.pay_slab.read';"; echo "\\i $(cygpath -m "$TMP" 2>/dev/null || echo "$TMP")"; } > "$TMP.guard"
if run "$TMP.guard" >/dev/null 2>"$TMP.err"; then fail "guard did not stop the script"; fi
grep -q "Permission rows missing" "$TMP.err" || fail "guard message missing"
[ "$(links_hash)" = "$HASH_G" ] || fail "guard run changed data"; ok "missing permission row stops the script and rolls back"
echo "ALL CHECKS PASSED"
