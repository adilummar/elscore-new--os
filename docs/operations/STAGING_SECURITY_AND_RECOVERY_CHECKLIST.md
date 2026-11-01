# EL SCORE OS — Staging security and recovery checklist

**Status: prepared for owner review. Nothing in this document has been executed.**
Every step below is performed by an authorised operator after the owner approves that step. Commands are
examples with placeholders; never paste a real password, key or connection string into chat, tickets or git.

## 0. Ground rules

- ARCH OS (`/opt/archos`, `/opt/archos-staging`, PM2 `archos-*`) is out of scope. Never touch it.
- Only EL SCORE **staging** is in scope: `/var/www/elscore-os`, PM2 `elscore-api` and `elscore-web`, database
  `elscore_os_staging`. Production (`/var/www/elscore`, PM2 `elscore-api-prod`, `elscore-web-prod`,
  `elscore_os_prod`) is only *read* where a step says so, and changes need their own approval and window.
- Restart by exact process name or id only. Never `pm2 restart all`, and do not run `pm2 restart ecosystem.config.js`
  until you have opened that file (read-only) and confirmed it lists only EL SCORE staging apps.
- Never print secrets: do not run `pm2 env`, `pm2 jlist`, `env`, or `cat` on `.env`/ecosystem files.
- Stop at the first unexpected result, record it, and ask the owner.

| Step | Section | Owner approval needed before running |
|---|---|---|
| Read-only inventory | 1 | Yes (server access) |
| Credential rotation | 2 | Yes |
| `.env` / storage permissions | 3 | Yes |
| Separate staging Redis | 4 | Yes |
| Staging backup incl. uploads | 5 | Yes |
| Scratch restore verification | 6 | Yes |
| Release rehearsal on the scratch copy | 7 | Yes |
| Mentoring-only permission grant | 8 | Yes (dry run first) |
| Rollback | 9 | Only if needed |

## 1. Read-only inventory (record the answers; nothing is changed)

```bash
# Who runs the staging processes, and what do the config files look like (metadata only)?
ps -o user=,pid=,cmd= -p "$(pm2 pid elscore-api)" "$(pm2 pid elscore-web)"
stat -c '%U:%G %a %n' /var/www/elscore-os/apps/api/.env /var/www/elscore-os/apps/web/.env* 2>/dev/null
find /var/www/elscore-os /var/www/elscore -xdev -maxdepth 4 \( -name '.env*' -o -name 'ecosystem*' -o -name '*.pem' \) -printf '%m %u:%g %p\n'
find /var/www/elscore-os -xdev -maxdepth 3 -perm -o+w -not -type l -printf '%m %p\n'
stat -c '%U:%G %a %n' /var/www/elscore-os/apps/api/storage/private/onboarding 2>/dev/null

# The environment label (APP_ENV) must be confirmed WITHOUT printing the environment: `pm2 env`, `pm2 show`,
# `pm2 describe` and `pm2 jlist` all print variables, so do not use them. Ask the owner to confirm APP_ENV=staging
# for process 2 from the secret store, or read only that one line of the ecosystem file:
#   grep -n 'APP_ENV' /path/to/ecosystem.config.js     # prints the APP_ENV line only

# Disk and database sizes
df -h /var /var/tmp /tmp
sudo -u postgres psql -Atc "SELECT datname, pg_size_pretty(pg_database_size(datname)) FROM pg_database ORDER BY 1"
sudo -u postgres psql -d elscore_os_staging -Atc "SELECT count(*) FILTER (WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL) AS applied, count(*) FILTER (WHERE finished_at IS NULL OR rolled_back_at IS NOT NULL) AS problem FROM _prisma_migrations"
sudo -u postgres psql -Atc "SELECT rolname, has_database_privilege(rolname,'elscore_os_prod','CONNECT') AS can_connect_prod FROM pg_roles WHERE rolname IN ('elscore_staging','elscore_prod')"

# Redis (read-only): eviction policy, who else uses it, which prefixes exist. Uses SCAN, never KEYS.
redis-cli CONFIG GET maxmemory-policy
redis-cli INFO keyspace
redis-cli --scan | cut -d: -f1-2 | sort | uniq -c | sort -rn | head -20     # key PREFIXES only, no values

# Does staging still have the UAT accounts? (read-only)
sudo -u postgres psql -d elscore_os_staging -Atc "SELECT email, status FROM users WHERE email LIKE 'uat\_%' OR email LIKE '%@elscore.test' ORDER BY email"
```

Record: process user, file modes, `APP_ENV` label, `maxmemory-policy`, other Redis prefixes (is ARCH OS using it?),
free disk, database sizes, applied-migration count (expected 34), whether the UAT accounts exist.

**Stop** if: applied != 34, any migration shows a problem row, or `elscore_staging` can connect to `elscore_os_prod`.

## 2. Credential rotation (order matters; owner decides who performs each step)

Treat everything ever committed under `scratch/`, `infrastructure/backup/backup-db.sh` and `check-db.js` as exposed.

1. **Server login.** Create SSH key access, then disable password login. Confirm the old password no longer works.
2. **Staging database role password** (`elscore_staging`). Update only the staging process configuration, then restart
   only PM2 `elscore-api` (id 2) and `elscore-web` (id 3) if the web app uses it.
3. **Production database role password** (`elscore_prod`), R2 access keys, JWT secrets for each environment
   (this signs everyone out), and any Redis password: production items in their own approved window.
4. **UAT accounts** on staging: delete them, or set a new password supplied through `SEED_UAT_PASSWORD`
   (the repository no longer contains one). They are usable only when `APP_ENV=staging`.
5. Confirm: old credentials fail, production and ARCH OS processes were not restarted (`pm2 status` uptimes unchanged).

Staging is reached over plain HTTP. Put HTTPS in front of it before real logins, and keep `COOKIE_SECURE=false`
only for as long as it is plain HTTP.

## 3. `.env` and storage permissions

Target modes (the API ignores `.env` at runtime when `NODE_ENV=production`; it is read by the Prisma CLI and scripts):

```bash
# SVC_USER is the account found in section 1 (root today according to older deployment reports).
sudo chown SVC_USER:SVC_USER /var/www/elscore-os/apps/api/.env /var/www/elscore-os/apps/web/.env*
sudo chmod 600 /var/www/elscore-os/apps/api/.env /var/www/elscore-os/apps/web/.env*
sudo chmod 750 /var/www/elscore-os/apps/api/storage/private/onboarding
stat -c '%U:%G %a %n' /var/www/elscore-os/apps/api/.env      # expect SVC_USER:SVC_USER 600
```

Permissions do not require a restart. Do the same for any ecosystem file found in section 1.
**Before every Prisma command**, read the `Datasource` line it prints and confirm it names `elscore_os_staging`:

```bash
cd /var/www/elscore-os/apps/api && pnpm exec prisma migrate status    # read-only; check the database name it prints
```

## 4. Separate Redis for staging (no code change needed)

Do not change, flush or restart the existing Redis on `6379`. Add a second instance for EL SCORE staging:

1. Config file (example `/etc/redis/redis-elscore-staging.conf`): `bind 127.0.0.1`, `port 6380`, `protected-mode yes`,
   `requirepass <generated secret>`, `maxmemory-policy noeviction` (BullMQ requires it), `appendonly yes`,
   `dir /var/lib/redis-elscore-staging`.
2. Its own systemd unit (for example `redis-elscore-staging.service`); leave `redis-server.service` untouched.
3. Point **only** the staging API process at it and set the environment label: `APP_ENV=staging`, `REDIS_HOST=127.0.0.1`,
   `REDIS_PORT=6380`, `REDIS_PASSWORD=<secret>` (supplied through the secret store / ecosystem file, never typed
   into a shared terminal history). Restart only `elscore-api` (id 2).
4. Verify: `REDISCLI_AUTH=<secret> redis-cli -p 6380 ping`; `GET http://<staging-api>/api/v1/health` shows
   `"redis":"up"`; keys named `elscore-staging:*` appear on 6380; the count of `elscore-production:*` keys on 6379
   is unchanged from section 1.
5. Do **not** delete old staging keys from 6379 without separate approval; never run `FLUSHDB`/`FLUSHALL`.
   (The cache library's `reset()` would run `FLUSHDB`; the application never calls it.)

## 5. Staging backup, including onboarding uploads

Use `infrastructure/backup/backup-db.sh` (no credentials in the file; it refuses to run if `BACKUP_ENV` and the
database name disagree, or if the host is not local).

Prerequisites: a key pair made offline with `generate-keys.sh` (the **private** key never reaches the server);
a `0600` password file for the dump role (`PGPASSFILE`); a bucket or prefix reserved for staging; enough space in
`/var/tmp` for roughly twice the dump plus the uploads; an R2 lifecycle rule on the `staging/` prefix
(for example keep 30 days) because the script does not prune.

```bash
cd /var/www/elscore-os/infrastructure/backup        # or wherever the reviewed script is placed
export BACKUP_ENV=staging PGDATABASE=elscore_os_staging PGUSER=elscore_staging PGPASSFILE=/root/.pgpass-elscore-staging
export S3_BUCKET=s3://<staging-bucket> S3_ENDPOINT=https://<account>.r2.cloudflarestorage.com
export PUBLIC_KEY_PATH=/var/www/backup/backup_public.pem
export UPLOADS_DIR=/var/www/elscore-os/apps/api/storage/private/onboarding
./backup-db.sh --check      # prints the target; reads nothing
./backup-db.sh              # dump -> verify -> archive uploads -> encrypt -> manifest -> upload
```

The documents uploaded through onboarding live **only on disk**; a database dump alone would lose them.
Keep the object names it prints (`elscore_staging_<timestamp>.*`).

## 6. Scratch restore verification (never into staging or production)

Preferred: restore on a **separate machine** (for example a disposable local PostgreSQL 16), so the shared cluster
that also holds production is not loaded.

```bash
# 1) Download the files and the sha256 manifest, then check integrity
sha256sum -c elscore_staging_<ts>.sha256
# 2) Decrypt with the OFFLINE private key (decrypt-backup.sh <key.enc> <file.enc>)
./decrypt-backup.sh elscore_staging_<ts>.key.enc elscore_staging_<ts>.dump.enc
./decrypt-backup.sh elscore_staging_<ts>.key.enc elscore_staging_<ts>.uploads.tar.gz.enc
# 3) Restore into a NEW scratch database
createdb elscore_restore_check
pg_restore --dbname=elscore_restore_check --no-owner --exit-on-error elscore_staging_<ts>.dump
# 4) Check
psql -d elscore_restore_check -Atc "select current_database(), (select count(*) from _prisma_migrations)"   # expect 34
psql -d elscore_restore_check -Atc "select count(*) from users"        # compare with staging at backup time
tar -tzf elscore_staging_<ts>.uploads.tar.gz | wc -l                   # compare with: find <UPLOADS_DIR> -type f | wc -l
```

Fallback on the server: `sudo -u postgres createdb elscore_restore_check`, run off-peak, then
`sudo -u postgres dropdb elscore_restore_check`. Always spell out the scratch database name in every command.
Record the dump size, restore duration and free disk afterwards: this is the recovery-time estimate.

## 7. Release rehearsal on the scratch copy

Against `elscore_restore_check` only, with `DATABASE_URL` pointing at it and confirmed by the `Datasource` line:
`prisma migrate status` -> `prisma migrate deploy` (applies the two Mentoring migrations) -> the approved seed
**without** `SEED_RECONCILE_ROLE_PERMISSIONS` -> section 8 dry run. Fix anything found before touching staging.

## 8. Mentoring-only permission grant

On a populated database the seed inserts the new roles and permissions but **no role links**. Do not set
`SEED_RECONCILE_ROLE_PERMISSIONS=true`: it would also re-insert every other missing link, including sensitive HR
grants an administrator removed. Use `apps/api/scripts/mentoring-permission-grant.sql` instead:

1. Review the `_wanted` list (it is generated from `prisma/seed.ts`; a unit test fails on any drift).
2. Run it as-is on the scratch copy: it is a **dry run** (ends in `ROLLBACK`) and prints what it would insert.
   `psql -v ON_ERROR_STOP=1 -d elscore_restore_check -f apps/api/scripts/mentoring-permission-grant.sql`
3. The script has never been run against PostgreSQL; this rehearsal is its first real validation.
4. On staging, only after approval: take a fresh backup, run the dry run, read the preview, change the last line
   from `ROLLBACK;` to `COMMIT;` and run it once. Expected result: MENTORING_HEAD 13, MENTOR 6, DEMO_COUNSELOR 2,
   SALES_HEAD 1, CEO 5, CO_FOUNDER 4 Mentoring permissions, and **no** change to non-Mentoring links.

## 9. Rollback

- **Application:** note the deployed commit and keep a copy of the current `.next` and `dist` before deploying (the
  deploy script deletes `.next`). Redeploy the recorded commit; restart only ids 2 and 3. The Mentoring migrations
  are additive, so old code runs against the new tables.
- **Data:** restore the verified dump into a new database, stop only ids 2 and 3, rename databases
  (no connections allowed during `ALTER DATABASE ... RENAME`), start ids 2 and 3. Restore the uploads archive to
  `UPLOADS_DIR`.
- **Permissions:** the grant adds rows only; undo by restoring the backup, not by hand-deleting links.
- **Stop conditions:** a failed or partial migration, a non-zero exit from `migrate deploy`, health `database` or
  `redis` not `up`, or any non-Mentoring permission count change.

## Appendix: proposed secret scanning in CI (NOT applied)

Smallest suitable option: the open-source gitleaks binary, pinned by version and checksum, scanning only new commits
so the known historic findings do not fail every build:

```yaml
  secret-scan:
    name: Secret scan (new commits)
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with: { fetch-depth: 0 }
      - name: Install gitleaks (pinned)
        run: |
          curl -sSL -o gl.tgz https://github.com/gitleaks/gitleaks/releases/download/v8.18.4/gitleaks_8.18.4_linux_x64.tar.gz
          echo "<sha256 of that release asset>  gl.tgz" | sha256sum -c -
          tar -xzf gl.tgz gitleaks
      - name: Scan the commits in this push or pull request
        run: ./gitleaks detect --no-banner --redact --log-opts "${{ github.event.pull_request.base.sha || github.event.before }}..${{ github.sha }}"
```

Why not the packaged GitHub Action: it needs a licence key for organisation repositories. Adding the job changes
CI behaviour (it can fail builds and downloads a binary), so it is documented here and left for owner approval.
