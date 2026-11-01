# EL SCORE OS — Staging deployment readiness assessment and operator runbook (Mentoring integration)

**Status: DRAFT FOR OWNER REVIEW. Nothing in this document has been executed. The deployment is NOT declared ready.**
Target: exactly commit `3426f674fd2bc34cb29eedfcd2ea9e296cb46c78` (`3426f67`) on `integration/staging-mentoring`.
The deploy target is pinned by SHA (`3426f67`), not by branch tip. This runbook was committed afterwards on top of it, so the local branch tip is a docs-only descendant; the remote branch `integration/staging-mentoring` was pushed at exactly `3426f67` (verified with `git ls-remote`).

**Owner decision record (2026-11-02):** the owner answered "yes for all questions". That is a clear approval for the push (done) and for committing this runbook (done, local only). It does not settle the choice questions (rotation before or after deploy, HTTPS, UAT accounts, Redis timing, enrolled-student handling, backup timing) or supply the operator, accounts, role holders and window. Those stay OPEN until answered specifically. No server contact has taken place.

**Owner decision record, update (2026-11-02):** the owner chose "use recommendations". Recorded as decided:

| Topic | Decision |
|---|---|
| Credential rotation | Server login (C1) and staging database password (C2) are rotated **before** the deploy, as separate steps. Production items (C4) and history rewrite (C5) are not part of this release. |
| HTTPS | Plain HTTP is accepted for this release **with test data only**. HTTPS is required before real HR or student data is entered. |
| UAT accounts | Delete them (C3), before any tester signs in. |
| Redis separation | Decide after preflight shows the `APP_ENV` values and key prefixes. If staging and production share a prefix, separate first. |
| Backup script | Run from a reviewed copy outside the working tree, before any code change (section 5.2). |
| CO_FOUNDER | Stays in the grant (read-only, 4 permissions). |
| Deploy scripts | `deploy.sh` and `deploy-staging.sh` to be fixed or removed in a later reviewed change; never used for this release. |

Still OPEN (no recommendation was given, or information is missing): handling of existing enrolled students (count from 3.6 first), the operator's name, the test account per role, the real holders of the Mentoring roles, the maintenance window, and the rollback decision-maker.

## 0. How to read this document

### 0.1 Evidence labels

| Label | Meaning |
|---|---|
| **[R]** | Repository-verified in this checkpoint (local git or file inspection). |
| **[R-prev]** | Repository-verified in an earlier checkpoint of this engagement (tests, seed review). |
| **[O]** | Owner-reported. Not independently verified. |
| **[H]** | Historic: taken from tracked deployment reports dated October 2026. May be stale. |
| **[U]** | Unknown. Must be established by a read-only preflight step before it is relied on. |

No claim below about the server, its database, Redis or PM2 is verified. Only [R] and [R-prev] items come from this repository.

### 0.2 Reported staging facts [O]

- Staging branch `feat/demo-multisession-schema`, reported commit `236f5fb`.
- Staging directory `/var/www/elscore-os`, database `elscore_os_staging`.
- Production and ARCH OS must stay untouched.

### 0.3 Owner-approved requirements this release must satisfy [O]

CEO: company-wide read-only Mentoring. CO_FOUNDER: read-only Mentoring only. Mentoring Head: operational control and final Phase 1 activation approval. Mentor: assigned-student workflow and stage verification. Demo Counselor: assigned tasks only, no stage verification or approval. Sales Head keeps `mentoring.handover.retry`. Sales quotation monthly-hours changes after handover are blocked; corrections go through Mentoring. No global role-permission reconcile. Use the Mentoring-only grant, after validation and explicit approval.

### 0.4 Hard rules for whoever runs this

1. ARCH OS (`/opt/archos`, `/opt/archos-staging`, PM2 `archos-*`) is never read, changed or restarted.
2. Production (`/var/www/elscore`, PM2 `elscore-api-prod`, `elscore-web-prod`, database `elscore_os_prod`) is never changed by this runbook. Where a step reads production state, it is read-only.
3. Never print secrets. Do not run `pm2 env`, `pm2 show`, `pm2 describe`, `pm2 jlist`, `env`, `printenv`, or `cat` on `.env`, ecosystem or `/proc/*/environ` files.
4. Never run `pm2 restart all`, `pm2 restart ecosystem.config.js`, `pm2 reload all`, `pm2 delete`, `pm2 kill`, `pm2 resurrect`, `pm2 update` or `pm2 save`.
5. Never set `SEED_RECONCILE_ROLE_PERMISSIONS`. Never run `prisma migrate dev`, `migrate reset`, `db push` or `db seed --force`.
6. Stop at the first unexpected result. Record it. Ask the owner.

### 0.5 Two existing scripts in the repository must NOT be used for this deployment [R]

| File | Why it is dangerous here |
|---|---|
| `deploy-staging.sh` | Runs `git checkout main` and `git pull origin main`. That would replace the staging lineage with `main` and pull the main-only migrations (`20261006100000_add_missed_checkout_approval`, `20261006143000_exceptional_rate_exact_grade`). |
| `deploy.sh` | Runs `git pull origin main` and `pm2 restart ecosystem.config.js` (restarts everything the ecosystem file lists). Its header says "staging" but the contents are not verified to match the server. |

Both exist on `feat/demo-multisession-schema` and on the integration branch. They are not changed in this checkpoint. **Owner decision:** fix or remove them in a later reviewed change.

## 1. Exact commit and branch verification

### 1.1 Facts verified locally [R]

| Check | Result |
|---|---|
| `git rev-parse HEAD` | `3426f674fd2bc34cb29eedfcd2ea9e296cb46c78` |
| Branch | `integration/staging-mentoring`, working tree clean before this file was added |
| `git rev-parse feat/demo-multisession-schema` | `236f5fb239a4cd12cf6fca9d650e331cdf9de1c0` |
| Merge base of the two | `236f5fb…` (the staging branch tip is an ancestor of the integration tip) |
| Commits ahead of staging | 13 |
| Branch `main` merged in? | No: `main` is not an ancestor of `3426f67` (checked with `git merge-base --is-ancestor`). |

The 13 commits, oldest first: `4240601` (WP2 handover), `087dc75` (ENROLLED-only, auto-handover, Sales lock), `32e24e9` (WP3 allocation, tasks, workflow), `cc95a0d` (staging-lineage spec adaptation), `a1642b6` (quotation hours block), `ea3b749` (CEO retry removed), `9f578e0` (build excludes test helpers), `8d3a624`, `a1c7490`, `6bcec04`, `fabf0ca`, `dbb74b4`, `3426f67` (B3 security preparation, e2e guard, grant SQL, checklist).

### 1.2 What changed outside Mentoring [R]

Source files outside `apps/api/src/modules/mentoring` and `apps/web/.../mentoring` that differ from the staging branch (excluding the 135 removed `scratch/` files):

- Lead module: `lead.controller.ts`, `lead.service.ts`, `lead.module.ts` (ENROLLED → handover, retry endpoint `POST /leads/:id/mentoring-handover/retry`).
- Student module: `student.service.ts`, `student.module.ts` (Sales edit lock after handover, auto-handover for students added later).
- Quotation module: `quotation.service.ts`, `quotation.module.ts` (monthly-hours guard).
- `prisma/schema.prisma`, `prisma/seed.ts`, `prisma.service.ts` (e2e guard), `tsconfig.build.json`.
- Web: `LeadDetailClient.tsx`, `leads/actions.ts`, `Sidebar.tsx`, new `MentoringHandoverStatus.tsx`.
- Operator scripts and docs: `backup-db.sh`, `check-db.js`, `.gitignore`, `seed-test-users.ts`, `uat-runner.ts`.

**Not changed [R]:** `package.json` files, `pnpm-lock.yaml`, `next.config`, `nest-cli.json`. Dependencies should not change. **No new environment variables, no new BullMQ queues or processors, no new cron jobs** are used by the Mentoring module (grep of `apps/api/src/modules/mentoring` found none).

**Regression-relevant areas** (existing staging features that share code with the change): Lead → ENROLLED conversion, Student create/edit/delete, quotation generation, sidebar, the notifications table (new column). HR, payroll, recruitment, onboarding, leave, attendance, employee lifecycle, performance and demo modules have no changed source files [R]. Their tables and migrations are untouched.

### 1.3 Local verification commands (run on the operator's machine; read-only)

```bash
git rev-parse HEAD                                              # expect 3426f674fd2bc34cb29eedfcd2ea9e296cb46c78
git merge-base --is-ancestor 236f5fb 3426f67 && echo "staging tip is an ancestor"
git rev-list --count 236f5fb..3426f67                           # expect 13
git status --porcelain                                          # expect empty
git diff --name-status 236f5fb 3426f67 -- apps/api/prisma/migrations   # expect exactly 2 lines, both 'A'
```

### 1.4 Publishing the commit (REQUIRES OWNER APPROVAL)

The commit exists only in the local repository [R]. The server can only fetch it if it is pushed.

- Push **as a new branch name**, without force: `git push origin 3426f67:refs/heads/integration/staging-mentoring`. Do not push to `feat/demo-multisession-schema`. Do not force-push. Do not rewrite history.
- Afterwards: `git ls-remote origin refs/heads/integration/staging-mentoring` must print `3426f674fd2bc34cb29eedfcd2ea9e296cb46c78`.
- The push adds no new credential-bearing files. Existing history on `origin` still contains the old `scratch/` credentials (see section 4).
- **[U]** Does the repository's `origin` accept this branch (branch protection, naming rules)? Does the server have a read credential for it?

### 1.5 Server-side verification [U until run]

The server must report the same commit before any build. The exact commands are in section 7 (step D3).

## 2. Integration versus staging migration comparison

### 2.1 Counts [R]

| | Migration directories | Last migration |
|---|---|---|
| Staging branch `236f5fb` | 34 (plus `migration_lock.toml`) | `20261024140000_add_performance_management` |
| Integration `3426f67` | 36 | `20261101130000_add_mentoring_workflow_foundation` |

`git diff --name-status 236f5fb 3426f67 -- apps/api/prisma/migrations` shows exactly two added files and **no modified, renamed or deleted migration** [R]. Both new migrations sort after every existing one, so Prisma applies them in order and there is no out-of-order condition.

Main-only migrations `20261006100000_add_missed_checkout_approval` and `20261006143000_exceptional_rate_exact_grade` are **not** in this lineage and must not be applied [R-prev].

### 2.2 The two Mentoring migrations [R]

**`20261101120000_add_mentoring_handover_foundation`**

- Creates 3 enums: `EnrollmentHandoverStatus`, `MentoringActivationStatus`, `MentoringStageStatus`.
- Creates 3 tables: `enrollment_handovers`, `mentoring_activations`, `mentoring_stages`.
- Creates unique and normal indexes; adds foreign keys to the **existing** tables `leads` and `students` (`ON DELETE RESTRICT`).
- Depends on: existing `leads` and `students` tables only.

**`20261101130000_add_mentoring_workflow_foundation`**

- Creates 8 enums: `MentoringStaffRole`, `MentorAssignmentType`, `AllocationMode`, `MentoringTaskStatus`, `MentoringTaskPriority`, `ChecklistItemState`, `WorkflowHoldKind`, `FinalApprovalDecision`.
- **Alters existing tables:** `notifications` gets a nullable column `dedupe_key` plus a unique index; `mentoring_activations` and `mentoring_stages` (created by migration 1) get extra columns.
- Creates 10 tables: `mentoring_staff_profiles`, `mentoring_settings`, `mentor_assignments`, `stage_checklist_responses`, `workflow_exceptions`, `workflow_holds`, `mentoring_tasks`, `mentoring_task_comments`, `final_approvals`, `mentoring_events`.
- Depends on: migration 1 tables and the existing `notifications` table. It has no foreign key to `users`.

Together: **11 enums, 13 new tables, 1 new column on an existing table (`notifications.dedupe_key`).**

### 2.3 Risk assessment [R unless stated]

- No `DROP`, `UPDATE`, `DELETE`, `TRUNCATE` or `INSERT` statements were found in either migration. Schema changes to existing models are additive only (`Notification.dedupeKey`, relation fields on `Lead` and `Student`).
- All 16 foreign keys are `ON DELETE RESTRICT`. Consequence: once a student has a handover, deleting that student fails while the handover exists. This also applies to rolled-back code (see section 12).
- `ALTER TABLE notifications ADD COLUMN` (nullable, no default) is a metadata change. `CREATE UNIQUE INDEX` on `notifications` blocks writes to that table while it builds. **[U]** the size of `notifications` on staging; record its row count in preflight. A small table makes this negligible.
- **[U]** The staging database role must own `notifications`, `leads`, `students`, or hold the privileges needed to alter them and to create types and tables. The earlier 34 migrations ran with that role [H], which suggests it can, but ownership is checked in section 3.
- **[U to confirm in rehearsal]** PostgreSQL normally runs a multi-statement script sent as one simple query inside one implicit transaction, so a failure should leave nothing partial. Do not assume this: confirm it during the scratch rehearsal (section 6.4).
- Old code (staging `236f5fb`) can run against the new schema because the changes are additive and the new column is nullable [R-prev reasoning].

### 2.4 Read-only comparison to run on the server before migrating [U until run]

```bash
cd /var/www/elscore-os/apps/api
ls prisma/migrations | grep -v migration_lock | sort > /var/tmp/mig-on-disk.txt
# applied list, names only
sudo -u postgres psql -d elscore_os_staging -Atc "SELECT migration_name FROM _prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL ORDER BY migration_name" > /var/tmp/mig-applied.txt
wc -l /var/tmp/mig-applied.txt                       # expect 34
# Before checkout the disk has 34 entries; after checkout 36. Compare after checkout:
comm -13 /var/tmp/mig-applied.txt /var/tmp/mig-on-disk.txt   # expect exactly the two Mentoring names
comm -23 /var/tmp/mig-applied.txt /var/tmp/mig-on-disk.txt   # expect NOTHING (no applied migration missing from disk)
```

**Stop** if the applied count is not 34, if any row has `finished_at IS NULL` or `rolled_back_at IS NOT NULL`, or if the second `comm` prints anything.

## 3. Read-only infrastructure preflight (every command needs owner approval for server access)

Record every answer in the deployment log. Nothing here changes state.

### 3.1 Process identities (staging and production) [U]

```bash
pm2 ls                                     # table only; record id, name, pid, uptime, restart count, status, user
pm2 id elscore-api                         # expect [ 2 ]  [H]
pm2 id elscore-web                         # expect [ 3 ]  [H]
pm2 id elscore-api-prod                    # expect [ 0 ]  [H]  (read-only identification)
pm2 id elscore-web-prod                    # expect [ 1 ]  [H]
for n in elscore-api elscore-web elscore-api-prod elscore-web-prod; do
  pid=$(pm2 pid "$n"); echo "$n pid=$pid cwd=$(readlink /proc/$pid/cwd)"
done
ps -o user=,pid=,etime=,cmd= -p "$(pm2 pid elscore-api)" "$(pm2 pid elscore-web)"
```

Confirmations: staging cwd begins with `/var/www/elscore-os/` (**with the trailing slash**, because `/var/www/elscore` is a prefix of `/var/www/elscore-os`); production cwd begins with `/var/www/elscore/`. Process ids may have changed since the October reports [H], so use the ids printed today.

### 3.2 `APP_ENV` and related labels — values only [U]

Prefer this: the owner confirms `APP_ENV` for staging and production from the secret store. If a server check is needed, use one command that can only print named, non-secret variables (the pattern is anchored, so `REDIS_PASSWORD` cannot match):

```bash
for n in elscore-api elscore-api-prod; do
  pid=$(pm2 pid "$n"); echo "== $n"
  tr '\0' '\n' < /proc/$pid/environ | grep -aE '^(APP_ENV|NODE_ENV|REDIS_HOST|REDIS_PORT)='
done
```

Never run `cat /proc/*/environ` or remove the `grep`. **Why it matters [R-prev]:** the BullMQ prefix is `elscore-${APP_ENV ?? NODE_ENV}`. If staging has no `APP_ENV` and runs with `NODE_ENV=production` on the same Redis as production, both would use the prefix `elscore-production`. The cache prefix is fixed (`elscore:cache:`) and shared by anything on the same Redis database. Expected: staging `APP_ENV=staging`, production `APP_ENV=production` or at least a different prefix. UAT accounts are only usable when `APP_ENV=staging`.

### 3.3 `.env` ownership and permissions without reading contents [U]

```bash
stat -c '%U:%G %a %s %n' /var/www/elscore-os/apps/api/.env /var/www/elscore-os/apps/web/.env* 2>/dev/null
find /var/www/elscore-os -xdev -maxdepth 4 \( -name '.env*' -o -name 'ecosystem*' \) -printf '%m %u:%g %p\n'
stat -c '%U:%G %a %n' /var/www/elscore-os/apps/api/storage/private/onboarding 2>/dev/null
```

Expected targets (applied only after approval, see the checklist section 3): `.env` files `600`, onboarding storage `750`. Historic reports show all processes ran as `root` [H]; record the real answer.

### 3.4 Redis: host, port, database, prefix, eviction policy — no passwords [U]

The application has no `REDIS_DB` setting, so it always uses database 0 [R-prev]. Use the password from the environment variable `REDISCLI_AUTH`, never on the command line, and never run `CONFIG GET requirepass` or `CONFIG GET *`.

```bash
ss -ltnp | grep -E 'redis|:6379|:6380'                   # which Redis listeners exist, on which addresses
export REDISCLI_AUTH='<read from secret store; do not echo>'
redis-cli -p <PORT> CONFIG GET maxmemory-policy           # BullMQ needs: noeviction
redis-cli -p <PORT> INFO server | grep -E '^(redis_version|tcp_port)'
redis-cli -p <PORT> INFO keyspace                         # db0 key count
redis-cli -p <PORT> --scan | cut -d: -f1-2 | sort | uniq -c | sort -rn | head -30   # key PREFIXES only
unset REDISCLI_AUTH
```

Record: host, port, `maxmemory-policy`, the set of prefixes (expected `elscore-staging:*`, `elscore:cache:*`, possibly `elscore-production:*`), and whether any non-EL-SCORE prefixes (ARCH OS) appear.

### 3.5 Confirmation that ARCH OS is isolated [U]

ARCH OS files are not opened. Isolation is shown from the outside:

1. Its PM2 rows (`archos-prod`, `archos-staging` [H]) are recorded now and again after every step: pid, uptime and restart count must be unchanged.
2. If ARCH OS keys exist on a Redis instance used by EL SCORE, that is a **finding**, not something to fix in this release. Report it to the owner.
3. The staging database role cannot connect to the production database: `SELECT rolname, has_database_privilege(rolname,'elscore_os_prod','CONNECT') FROM pg_roles WHERE rolname IN ('elscore_staging','elscore_prod')` — expect `false` for the staging role [U].
4. Deployment commands only ever reference `/var/www/elscore-os`, ids resolved in 3.1, and database `elscore_os_staging`.

### 3.6 Database and disk preflight [U]

```bash
git -C /var/www/elscore-os status --porcelain                # expect empty (no local changes on the server)
git -C /var/www/elscore-os rev-parse HEAD                    # expect 236f5fb239a4cd12cf6fca9d650e331cdf9de1c0 [O]
git -C /var/www/elscore-os branch --show-current             # expect feat/demo-multisession-schema [O]
df -h /var /var/tmp /tmp                                     # enough for ~2x dump + uploads + build
node --version; pnpm --version
sudo -u postgres psql -Atc "SHOW server_version"
sudo -u postgres psql -d elscore_os_staging -Atc "SELECT tablename, tableowner FROM pg_tables WHERE tablename IN ('notifications','leads','students')"
sudo -u postgres psql -d elscore_os_staging -Atc "SELECT (SELECT count(*) FROM notifications),(SELECT count(*) FROM leads),(SELECT count(*) FROM students),(SELECT count(*) FROM users)"
sudo -u postgres psql -d elscore_os_staging -Atc "SELECT count(*) FROM students s JOIN leads l ON l.id = s.lead_id WHERE l.status = 'ENROLLED'"   # existing enrolled students (see 9.4); column names to be confirmed
sudo -u postgres psql -d elscore_os_staging -Atc "SELECT email FROM users WHERE email LIKE 'uat\_%' OR email LIKE '%@elscore.test'"
```

(The enrolled-students query is illustrative: confirm column names against the schema before running it.)

## 4. Credential rotation prerequisites and HTTPS requirement

### 4.1 State [R-prev]

Server login, database passwords, R2 keys, JWT secrets and a shared UAT password were committed under `scratch/`, `backup-db.sh` and `check-db.js`. They remain in git history on every branch and `origin/*` ref. **Rotation has not happened.** Removing files from the integration branch does not make the old values safe.

### 4.2 Recommended gates before the deployment (owner decides; each is a separate approval)

| # | Gate | Recommended before staging deploy? |
|---|---|---|
| C1 | Server login: key-based access working, old password disabled and proven rejected. | **Yes.** The deployment otherwise relies on an exposed credential. |
| C2 | Staging database role password rotated, `.env` and process configuration updated, only staging processes restarted. | **Yes.** Do it as its own step, with its own health check, and do not combine it with the code deploy so a failure is attributable. |
| C3 | UAT accounts on staging: delete, or reset the password through `SEED_UAT_PASSWORD`. | Yes, before any tester logs in. |
| C4 | Production database password, R2 keys, JWT secrets, Redis password. | No. Separate approved production window. Not part of this release. |
| C5 | History rewrite decision. | No. Decide after rotation. Needs a coordinated force-push of all branches. Not part of this release. |

If the owner chooses to deploy before C1 or C2, that is an accepted risk and must be recorded as such.

### 4.3 HTTPS requirement [O: staging is reached over plain HTTP; U: domain and certificate state]

- While staging is plain HTTP, `COOKIE_SECURE=false` is required for sessions to work. Credentials and HR data (payroll, onboarding documents) cross the network unencrypted.
- **Recommendation:** put HTTPS in front of staging before any user other than a named tester signs in, and before real HR or student data is entered. After HTTPS, remove `COOKIE_SECURE=false` (restart staging processes only).
- **Owner decision:** either (a) require HTTPS before this deployment, or (b) accept plain HTTP for this release with the test-data-only rule from section 11.1, recorded in the deployment log.
- **[U]** domain, reverse proxy (name and config location), certificate source. Nothing about the proxy is inspected or changed by this runbook.

## 5. Staging database and onboarding-upload backup procedure

Source of truth for the script: `infrastructure/backup/backup-db.sh` [R-prev]; details in `STAGING_SECURITY_AND_RECOVERY_CHECKLIST.md` section 5. The script has been syntax-checked (`bash -n`) but **never executed**. Its first run is therefore part of the rehearsal, not a surprise on deployment day.

### 5.1 Prerequisites [U]

- RSA key pair generated offline with `generate-keys.sh`; the **private key never reaches the server**.
- `0600` password file for the dump role, referenced by `PGPASSFILE`.
- A staging-only R2 bucket or prefix, lifecycle rule (the script does not prune), and R2 credentials supplied through the environment of the operator's shell (never typed into shared history).
- Free space on `/var/tmp` of about twice the dump plus the uploads archive.

### 5.2 Procedure (requires owner approval)

```bash
cd /var/www/elscore-os/infrastructure/backup      # the reviewed script; after checkout of 3426f67 it is the new version
export BACKUP_ENV=staging PGDATABASE=elscore_os_staging PGUSER=elscore_staging PGPASSFILE=/root/.pgpass-elscore-staging
export S3_BUCKET=s3://<staging-bucket> S3_ENDPOINT=https://<account>.r2.cloudflarestorage.com
export PUBLIC_KEY_PATH=/var/www/backup/backup_public.pem
export UPLOADS_DIR=/var/www/elscore-os/apps/api/storage/private/onboarding
./backup-db.sh --check        # prints target only
./backup-db.sh                # dump -> pg_restore --list check -> uploads tar -> encrypt -> sha256 manifest -> upload
```

Because the new script only exists after checkout, either take the backup from a reviewed copy of the script placed outside the working tree, or take the backup after the git checkout (step D3) but before the build. **Owner decision:** which. The backup must be complete and verified (section 6) before the build and migration.

Also record, as part of the backup evidence:

- Dump size, duration, object names, sha256 values.
- The row counts from 3.6 and the output of `find "$UPLOADS_DIR" -type f | wc -l`.
- A copy of the current build artifacts (step D4), because the web build deletes `.next`.

**Gate B1:** no build, migration, seed or grant begins until the backup exists, its checksum matches, and the scratch restore (section 6) has passed.

## 6. Scratch restore and recovery validation

Never restore into `elscore_os_staging` or `elscore_os_prod`. Prefer a separate machine with a disposable PostgreSQL 16. The restored copy contains personal HR and student data: restrict access, and securely delete it afterwards.

### 6.1 Restore

Follow the checklist section 6 (sha256 check, decrypt with the offline key, `createdb elscore_restore_check`, `pg_restore --no-owner --exit-on-error`). Spell out the scratch database name in every command.

### 6.2 Validation queries (run against the restore; compare with the live numbers captured at backup time)

```sql
SELECT current_database();                                                     -- elscore_restore_check
SELECT count(*) FROM _prisma_migrations WHERE finished_at IS NOT NULL;         -- 34
SELECT count(*) FROM users;   SELECT count(*) FROM employees;                  -- equal to live at backup time
SELECT count(*) FROM leads;   SELECT count(*) FROM students;
SELECT count(*) FROM role_permissions;                                         -- record: baseline for section 10
```

Add one count per HR-critical table (payroll, leave, attendance, recruitment, onboarding, performance). The list of table names comes from `schema.prisma`; do not guess. The uploads archive file count must equal the live count.

### 6.3 Recovery-time record

Record dump size, restore duration, free disk before and after. This is the real recovery-time estimate used in section 12.

### 6.4 Release rehearsal on the restore (mandatory gate B2)

Against `elscore_restore_check` only, with `DATABASE_URL` pointing at it and the `Datasource` line printed by Prisma confirmed:

1. `prisma migrate status` — expect the two Mentoring migrations pending.
2. `prisma migrate deploy` — expect success; record duration; then run section 9.3 checks. This also settles whether a failure leaves nothing partial.
3. The approved seed without `SEED_RECONCILE_ROLE_PERMISSIONS`; expect the log line "Users already exist. Role-permission links were left unchanged…". Diff row counts of `roles`, `permissions`, `role_permissions`, `departments`, `sequences`, `subjects`, `grades`, `curricula` before and after (see 7 step D11 for what to expect).
4. Grant script **dry run** (section 10, G1). **This is the script's first real PostgreSQL execution** [R-prev]. Column names and constraints used by the script match `schema.prisma` [R]: `roles.code`, `permissions.code`, `role_permissions(role_id, permission_id)` composite key, and `audit_events(id, entity_type, entity_id, action, new_value, metadata)`. Syntax and behavior remain unvalidated until this step.
5. Optional but recommended: boot the new API and web build against the restore on the separate machine with its own disposable Redis and `APP_ENV` set to a value that is neither `staging` nor `production`, and run section 11 against it.
6. Run the whole procedure from sections 7–10 as a dry rehearsal on that machine if time allows.

**Gate B2:** every rehearsal step passes. Any failure goes back to the owner; nothing is attempted on staging.

## 7. Exact staging deployment procedure (code)

Conventions: `STAGING=/var/www/elscore-os`; database `elscore_os_staging`; commit `3426f674fd2bc34cb29eedfcd2ea9e296cb46c78`. Do **not** use `deploy.sh` or `deploy-staging.sh` (section 0.5).

### 7.1 Entry gates (all must be recorded as satisfied)

| Gate | Condition |
|---|---|
| G-A | Owner written approval for this deployment window, including the push of `integration/staging-mentoring`. |
| G-B | Sections 3.1–3.6 preflight complete, no stop condition triggered. |
| G-C | C1, C2, C3 satisfied or explicitly accepted as risk (section 4). HTTPS decision recorded (4.3). |
| G-D | Backup complete and verified (B1) and rehearsal passed (B2). |
| G-E | Staging test accounts for every role in section 11 exist (supplied through the owner, passwords never in chat). |
| G-F | A rollback decision-maker is available during the whole window. |
| G-G | The commit has been pushed and `git ls-remote` shows the exact sha (1.4). |

### 7.2 Steps

**D1. Open the window.** Tell testers staging is in maintenance. Record `pm2 ls` (all rows, including production and ARCH OS) and the time.

**D2. Backup.** Section 5 and gate B1, if not already done in this window. A backup older than the freeze of staging data is not sufficient: take it inside the window.

**D3. Fetch and check out the exact commit as a new local branch.** The server's `feat/demo-multisession-schema` stays where it is, which keeps the rollback target intact.

```bash
cd /var/www/elscore-os
git status --porcelain                                  # must be empty; otherwise STOP
git rev-parse HEAD                                      # record (expect 236f5fb… [O])
git fetch origin integration/staging-mentoring
test "$(git rev-parse FETCH_HEAD)" = "3426f674fd2bc34cb29eedfcd2ea9e296cb46c78" && echo SHA_OK   # must print SHA_OK
git merge-base --is-ancestor HEAD FETCH_HEAD && echo ANCESTOR_OK                              # must print ANCESTOR_OK
git checkout -b integration/staging-mentoring FETCH_HEAD
git rev-parse HEAD                                      # must equal 3426f674fd2bc34cb29eedfcd2ea9e296cb46c78
```

Notes: the checkout deletes the 135 **tracked** `scratch/` files from the working tree. Untracked or modified files stay or abort the checkout. If anything on the server depends on a file in `scratch/`, that dependency is itself a finding; the old credentials inside must not be reused. Do **not** run `git pull`, `git merge`, `git reset --hard`, `git clean`, or `git checkout main`.

**D4. Snapshot current build artifacts** (the web build removes `.next`; the API build rewrites `dist`):

```bash
cd /var/www/elscore-os
ts=$(date +%Y%m%d-%H%M%S)
tar -czf /var/tmp/elscore-staging-artifacts-$ts.tgz apps/api/dist apps/web/.next
ls -l /var/tmp/elscore-staging-artifacts-$ts.tgz        # record name and size
```

Do not include `.env` or `storage/` in this archive.

**D5. Dependencies.**

```bash
pnpm install --frozen-lockfile        # expected to change nothing: lockfile and package.json are identical [R]
```

If pnpm wants to change the lockfile or install anything, STOP.

**D6. Generate the Prisma client and build** (existing PM2 processes keep running old code in memory; the on-disk output is replaced, so keep this window short and go straight to D9–D10 when the build passes):

```bash
cd /var/www/elscore-os
pnpm run db:generate
pnpm --filter api run build           # Nest build; must exit 0
pnpm --filter web run build           # Next build; must exit 0
cp -r apps/web/.next/static apps/web/.next/standalone/apps/web/.next/ 2>/dev/null || true
cp -r apps/web/public apps/web/.next/standalone/apps/web/ 2>/dev/null || true
test -f apps/api/dist/main.js && test -f apps/web/.next/standalone/apps/web/server.js && echo BUILD_OK
test -e apps/api/dist/modules/mentoring/testing && echo "BAD: test helper in build" || echo "no test helpers in dist"
```

Web environment variables that are baked in at build time (`NEXT_PUBLIC_*`) come from the server's existing setup [U]; nothing new is introduced by this release [R]. If the build fails, do not migrate. Restore artifacts from D4 and stop.

**D7. Migrate.** Section 9.

**D8. Seed (insert-only).** After migration. See D11 below for the exact procedure and checks.

**D9. Restart staging processes only.** Section 8.

**D10. Smoke check.** Section 13.1 immediately after restart.

**D11. Seed procedure.** The Mentoring roles (`MENTORING_HEAD`, `DEMO_COUNSELOR`) and the 18 `mentoring.*` permissions exist only in `prisma/seed.ts`, not in a migration [R-prev]. They must be created before the grant (section 10).

```bash
cd /var/www/elscore-os/apps/api
env -u SEED_RECONCILE_ROLE_PERMISSIONS pnpm exec prisma db seed
```

Expected seed behavior on a populated database [R-prev, R]:
- Departments, roles, permissions: upserted by code with `preservedCatalogUpdate()`; existing rows are not overwritten.
- **"Users already exist. Role-permission links were left unchanged…"** must be in the output. If the output says "Inserting missing catalog links", STOP: the reconcile switch is on or the user table is empty.
- No CEO or HR login is created when users exist; the system actor is created only if missing.
- Sequences and reference data (subjects, grades, curricula) are upserted by name. If an administrator had deleted a reference name, the seed would re-add it. Compare counts before and after; the rehearsal (6.4) should already have shown this.
- **[U]** `prisma db seed` runs `ts-node`, a development dependency. If the server installs without development dependencies, the seed fails before doing anything; the rehearsal on the restore finds this. A failed start is harmless.
- Before running, print the `Datasource` target as in section 9.2; the seed uses the same `DATABASE_URL`.

### 7.3 Stop and rollback triggers during deployment

Non-zero exit of any command; SHA mismatch; build failure; `migrate status` anything other than the expected two pending migrations; seed output other than expected; health not `ok` after restart; any change in production or ARCH OS PM2 rows. Go to section 12.

## 8. Staging-only PM2 restart procedure

The PM2 daemon is shared by staging, production and ARCH OS processes [H]. Every restart is by **numeric id resolved today**, never by `all`, a namespace, a regex, or an ecosystem file.

```bash
# 1. Identify (read-only)
pm2 ls
API_ID=$(pm2 id elscore-api | tr -dc '0-9');  WEB_ID=$(pm2 id elscore-web | tr -dc '0-9')
echo "api=$API_ID web=$WEB_ID"                         # expect 2 and 3 [H]; use the real values
for id in $API_ID $WEB_ID; do
  pid=$(pm2 pid $id); cwd=$(readlink /proc/$pid/cwd); echo "id=$id pid=$pid cwd=$cwd"
done
# Each cwd MUST start with /var/www/elscore-os/ . If either does not, STOP.

# 2. Restart the API, check, then the web app
pm2 restart "$API_ID"
sleep 5; curl -fsS http://127.0.0.1:3001/api/v1/health      # port and prefix [H]; expect status ok, database up, redis up
pm2 restart "$WEB_ID"
sleep 5; curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:3000/login   # expect 200

# 3. Verify nothing else moved
pm2 ls
```

Forbidden here: `pm2 restart all`, `pm2 restart ecosystem.config.js`, `pm2 reload`, `--update-env`, `pm2 save`, `pm2 delete`, `pm2 start`, `pm2 resurrect`, `pm2 kill`. `pm2 restart <id>` keeps the existing environment, so no secret is re-read or printed. `pm2 save` is not needed: the process list does not change.

After step 3 compare with D1: `elscore-api-prod`, `elscore-web-prod` and both `archos-*` rows must have **the same pid, a larger uptime, and the same restart count (↺)**. Any difference means a wrong restart: report immediately, do not "fix" it yourself.

If `curl` to the local ports is unavailable or the ports differ [U], use the ports recorded in preflight. The local health request is a request to the staging process on the server itself and is part of the deployment window, not an external request.

## 9. Mentoring migration procedure, pre/post checks

### 9.1 Preconditions
Gates B1 and B2 passed; D3 and D6 completed; PM2 not yet restarted; low-traffic window.

### 9.2 Pre-checks (read-only)

```bash
cd /var/www/elscore-os/apps/api
pnpm exec prisma migrate status
```

Read the `Datasource` line: it must name `elscore_os_staging`. Expected result: **36 migrations found locally, 34 already applied, 2 not yet applied**, listing exactly `20261101120000_add_mentoring_handover_foundation` and `20261101130000_add_mentoring_workflow_foundation`. Anything else (a failed migration, "migrations not found locally", drift) is a STOP.

Database-side checks:

```sql
SELECT count(*) FROM pg_tables WHERE schemaname='public' AND tablename IN ('enrollment_handovers','mentoring_activations','mentoring_stages','mentoring_tasks');   -- expect 0
SELECT count(*) FROM information_schema.columns WHERE table_name='notifications' AND column_name='dedupe_key';                                                      -- expect 0
SELECT count(*) FROM pg_stat_activity WHERE datname='elscore_os_staging' AND state <> 'idle';                                                                       -- record: ideally 1 (yourself)
```

Capture the row counts from 3.6 again, in the same window, for the later comparison.

### 9.3 Apply

```bash
pnpm exec prisma migrate deploy        # the only allowed migration command; exit code must be 0
```

Never `migrate dev`, `migrate reset`, `db push`, `migrate resolve` (without owner approval). If it fails: do not rerun. Run `prisma migrate status`, query `_prisma_migrations` for the failed row (`SELECT migration_name, started_at, finished_at, rolled_back_at FROM _prisma_migrations ORDER BY started_at DESC LIMIT 3` — the `logs` column is not selected because it may contain statements), report, and go to section 12.

### 9.4 Post-checks

```bash
pnpm exec prisma migrate status        # expect: "Database schema is up to date!" with 36 migrations
```

```sql
SELECT count(*) FROM _prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL;      -- 36
SELECT migration_name FROM _prisma_migrations ORDER BY started_at DESC LIMIT 2;                         -- the two Mentoring names
SELECT count(*) FROM pg_tables WHERE schemaname='public' AND tablename IN
 ('enrollment_handovers','mentoring_activations','mentoring_stages','mentoring_staff_profiles','mentoring_settings',
  'mentor_assignments','stage_checklist_responses','workflow_exceptions','workflow_holds','mentoring_tasks',
  'mentoring_task_comments','final_approvals','mentoring_events');                                       -- 13
SELECT count(*) FROM information_schema.columns WHERE table_name='notifications' AND column_name='dedupe_key';   -- 1
SELECT (SELECT count(*) FROM enrollment_handovers),(SELECT count(*) FROM mentoring_activations),(SELECT count(*) FROM mentoring_tasks);  -- 0,0,0
-- Compare with 9.2: notifications, leads, students, users counts must be identical.
```

**Existing enrolled students (owner decision):** the code has no automatic backfill [R]. Students already linked to an ENROLLED lead before the deployment get **no** handover automatically. They appear in Mentoring only after a Sales Head uses the per-lead retry (`POST /leads/:id/mentoring-handover/retry`, permission `mentoring.handover.retry`, idempotent) or if a bulk backfill is written and approved separately. The count from 3.6 tells the owner how many such students exist. Do not build or run a backfill as part of this release.

## 10. Mentoring-only permission grant: validation and execution

Script: `apps/api/scripts/mentoring-permission-grant.sql`. **Status: NOT EXECUTED anywhere, and not yet validated against PostgreSQL.** It is generated from `prisma/seed.ts`; a unit test fails on any drift [R-prev].

### 10.1 What it does [R]

Inserts only into `role_permissions` (permission code `mentoring.%`), plus one summary row per role in `audit_events`. It never updates or deletes. Idempotent (`ON CONFLICT (role_id, permission_id) DO NOTHING`). Precondition checks stop it if the roles or permissions are missing. Scope guards stop it if a non-Mentoring code, a CEO operational code, or a non-Sales-Head `mentoring.handover.retry` appears. A baseline and post-condition abort it if any non-Mentoring role-permission count changes. It ends with `ROLLBACK;`.

Resulting grants (owner-approved requirements, section 0.3):

| Role | Count | Notes |
|---|---|---|
| MENTORING_HEAD | 13 | Operational control and final approval; no `handover.retry` |
| MENTOR | 6 | Assigned-student workflow and verification |
| DEMO_COUNSELOR | 2 | Assigned tasks only |
| SALES_HEAD | 1 | `mentoring.handover.retry` only |
| CEO | 5 | Read-only: `student.read-all`, `student.read-assigned`, `staff.read`, `allocation.read`, `audit.read` |
| CO_FOUNDER | 4 | Read-only, as the owner confirmed |

The 13 operational codes (including `mentoring.handover.retry`) are withheld from the CEO.

### 10.2 Dry run (writes nothing) vs approved execution (writes)

| | Dry run | Approved execution |
|---|---|---|
| File | Unmodified script, last line `ROLLBACK;` | Copy with the last line changed to `COMMIT;` |
| Writes | None (transaction rolled back; temp tables dropped) | `role_permissions` and `audit_events` rows |
| Approval | Needed to connect to the database | Separate, explicit owner approval naming the database |
| Where first | Scratch restore (G1), then staging (G2) | Staging only (G3) |

**Never edit the repository file to `COMMIT`.** Make a copy in `/var/tmp`, change only the last line, keep the original unchanged.

### 10.3 Steps

**G0. Gate.** Migration verified (9.4), seed run with the expected output (D11), rehearsal G1 passed, fresh backup taken inside this window, owner approval for G2 and, separately, for G3.

**G1. Dry run on the scratch restore** (first real validation):

```bash
psql -v ON_ERROR_STOP=1 -d elscore_restore_check -f apps/api/scripts/mentoring-permission-grant.sql
```

Check: no error; the preview shows `WILL INSERT` for every wanted row; summary counts as in 10.1 (the summary reflects the rolled-back state inside the transaction); a second run of the dry run still reports the same preview (nothing was written). Then run the COMMIT variant on the scratch copy only, and verify idempotency by running it a second time: the preview should say `already granted` for all rows and insert nothing.

**G2. Dry run on staging** (after migration, seed, restart):

```bash
psql -v ON_ERROR_STOP=1 -d elscore_os_staging -f apps/api/scripts/mentoring-permission-grant.sql
```

Confirm the target database name first (`SELECT current_database()`). Compare the preview with 10.1. Any "already granted" row for a role that should have had nothing, any error, or any additional role is a STOP.

**G3. Approved execution on staging** (only after explicit owner approval of the preview):

```bash
cp apps/api/scripts/mentoring-permission-grant.sql /var/tmp/mentoring-permission-grant.COMMIT.sql
# edit the copy: replace ONLY the final line 'ROLLBACK;' with 'COMMIT;'
tail -n 3 /var/tmp/mentoring-permission-grant.COMMIT.sql          # confirm
psql -v ON_ERROR_STOP=1 -d elscore_os_staging -f /var/tmp/mentoring-permission-grant.COMMIT.sql
```

**Post-checks:**

```sql
SELECT r.code, count(*) FROM role_permissions rp JOIN roles r ON r.id=rp.role_id JOIN permissions p ON p.id=rp.permission_id
 WHERE p.code LIKE 'mentoring.%' GROUP BY r.code ORDER BY r.code;     -- CEO 5, CO_FOUNDER 4, DEMO_COUNSELOR 2, MENTOR 6, MENTORING_HEAD 13, SALES_HEAD 1
SELECT count(*) FROM role_permissions rp JOIN permissions p ON p.id=rp.permission_id WHERE p.code NOT LIKE 'mentoring.%';   -- equals the number recorded before G2
SELECT count(*) FROM audit_events WHERE action='MENTORING_PERMISSIONS_GRANTED';                                              -- 6
```

Existing sessions pick up the permissions after the permission cache expires (about 5 minutes) or after a fresh sign-in [R-prev]. Users are not changed by this script: staff members must also hold the right **role** (assigned through the application's admin screens or a separate approved change). **[U]** which real users hold MENTORING_HEAD, MENTOR and DEMO_COUNSELOR on staging; none are created by this release.

## 11. Role-by-role browser verification checklist

### 11.1 Rules for testing on staging

- Use accounts supplied by the owner. Passwords are never typed into chat or logged.
- Use only clearly labelled test data (for example leads named `ZZ-TEST …`). A test conversion to ENROLLED creates a real student and handover row on staging; record each test record so the owner can decide on cleanup. Do not delete handovers or students from the database.
- Do not test while plain HTTP carries real personal data unless the owner accepted that risk (4.3).
- Record: tester, role, time, pass/fail, screenshot name.

### 11.2 Checklist

Legend: P = must pass, N = negative test (must be refused or hidden).

**A. All roles — regression of existing staging features (P)**
1. Sign in; dashboard loads; no console errors on first load.
2. Sidebar shows only the modules each role had before, plus the Mentoring entry exactly as listed below.
3. HR: employee list, leave request, attendance view, payroll view (HR roles only).
4. Recruitment, onboarding (including opening an existing onboarding document), employee lifecycle, performance pages open.
5. Demo module: open a demo, WhatsApp share and parent confirmation screens render.
6. Sales: lead list and lead detail load; student list loads.

**B. Sales Counselor / Sales Head (P and N)**
1. P: Convert a test lead to ENROLLED. The lead detail shows the Mentoring handover status (completed, not failed).
2. P: Student created for the lead appears in Sales student list.
3. N: Edit the handed-over student's protected fields — refused with a clear message.
4. N: Quotation for a handed-over student: change monthly hours — refused (403) with the message that corrections go through Mentoring; quotation with unchanged hours still works.
5. P (Sales Head only): the retry button/endpoint for a lead with a missing or failed handover succeeds and is idempotent when used twice.
6. N (Sales Counselor): no retry action.
7. N: Mentoring sidebar entry and `/mentoring` pages are not available to a plain Sales Counselor.

**C. Mentoring Head (P)**
1. `/mentoring` dashboard shows the new student under "awaiting allocation" (or auto-allocated if capacity rules apply).
2. Allocation: auto-allocate; manual allocate; reassign; return to queue. The capacity default is 40 and siblings stay together.
3. Staff page: set a mentor's capacity or availability; activate/deactivate a staff profile.
4. Task board: create a Demo Counselor task; see status changes.
5. Workflow: pause a student's activation, sign out, sign in again, resume — stage statuses restore exactly (WP3 acceptance test).
6. Final approval screen: approve a submitted activation. The four-eyes rule refuses approval by the person who prepared it. No retry button.

**D. Mentor (P and N)**
1. P: sees only assigned students; opens the seven-stage workflow; verifies a collected checklist item; submits a stage for review.
2. N: cannot see another mentor's student (direct URL returns not found/forbidden).
3. N: cannot allocate, reassign, approve the final activation or edit staff.

**E. Demo Counselor (P and N)**
1. P: sees only assigned tasks; marks a task collected/submitted with a comment.
2. N: cannot verify a stage or checklist item, cannot approve, cannot allocate, no access to staff or approvals pages.

**F. CEO (P and N)**
1. P: company-wide read access to the Mentoring dashboard, student list, student workspace, staff and allocation views, and audit history.
2. N: no allocate/reassign/transfer, no task creation or update, no verify, no pause/resume, no approve, no staff edit, no handover retry button. Attempts via direct URL return forbidden.
3. Note for the owner: the CEO can still act through God View as another user; actions are audited with the real actor [R-prev]. This is existing behavior.

**G. CO_FOUNDER (P and N)**
1. P: read-only Mentoring pages (four permissions).
2. N: every write action in F.2 refused or hidden.

**H. Other roles (N)**
1. A role with no Mentoring grant (for example an HR role) sees no Mentoring sidebar entry and receives forbidden from `/mentoring` and the Mentoring API.

**I. Cross-cutting (P)**
1. In-app notification appears once per event (deduplicated), not repeatedly.
2. Mentoring history shows ordered events with the correct actor.
3. Sign out and sign in as another role in the same browser profile: no data from the previous session is visible.

Acceptance of section 11 requires every P to pass and every N to be refused. Record any deviation as a defect and stop further rollout.

## 12. Rollback procedure

Decision owner: the owner or a delegate named before the window. Order of preference: (1) fix forward only if trivial and agreed, (2) application rollback, (3) data restore.

### 12.1 Application rollback (code only; database untouched)

Use when the API or web fails to start, health is red, or a regression appears, and the migration either has not run or has run (additive schema is compatible with old code).

```bash
cd /var/www/elscore-os
git status --porcelain                                  # must be empty (build output is ignored); otherwise STOP
git checkout feat/demo-multisession-schema              # server branch still at 236f5fb [O]; verify:
git rev-parse HEAD                                      # expect 236f5fb239a4cd12cf6fca9d650e331cdf9de1c0
# Restore the artifacts saved in D4, or rebuild the old commit:
tar -xzf /var/tmp/elscore-staging-artifacts-<ts>.tgz -C /var/www/elscore-os
# Restart ONLY the two staging ids using the procedure in section 8
```

Notes:
- Checkout recreates the tracked `scratch/` files in the working tree. They contain the exposed credentials; delete them if rolling back is permanent and the owner agrees.
- Old code ignores the new tables and the nullable `notifications.dedupe_key`. After rollback, any student that already has a handover **cannot be deleted** by the old code because foreign keys are `ON DELETE RESTRICT`; Sales edit locks and the quotation guard are no longer enforced by the old code. Record all test records created during the window.
- The Mentoring roles and permission links remain in the database. They are inert for old code, but the Mentoring-granted rows are still visible in role administration. Do not delete them by hand; if removal is required, it is done by restore (12.2) or by an explicit, separately approved script.
- Redis is not touched. Restarting the two staging processes does not flush it.

### 12.2 Database restore (data rollback)

Use only for a failed or partial migration that left inconsistent state, or a harmful grant. It loses everything entered on staging after the backup.

1. Owner approval and a decision on the loss window.
2. Stop only the two staging ids (`pm2 stop <API_ID> <WEB_ID>` by verified ids).
3. Restore the verified dump into a **new** database name (for example `elscore_os_staging_restore`), never over the live one; restore the uploads archive to `UPLOADS_DIR`.
4. Verify counts as in 6.2.
5. Rename: no connections allowed, `ALTER DATABASE elscore_os_staging RENAME TO elscore_os_staging_failed_<ts>; ALTER DATABASE elscore_os_staging_restore RENAME TO elscore_os_staging;` Run as the postgres superuser; confirm no other application is connected first.
6. Roll back the code (12.1) if the old schema is needed, then `pm2 start` is **not** used: use `pm2 restart <id>` on the stopped processes by id.
7. Keep the failed database for investigation; do not drop it without approval.

### 12.3 Rollback of the permission grant

The grant is insert-only and the post-condition aborts on any non-Mentoring change. If the grant is wrong, restore from backup (12.2) or have the owner approve a separate, reviewed `DELETE` script that targets exactly the inserted pairs. Never improvise deletes against `role_permissions`.

### 12.4 Stop conditions that trigger a rollback decision

Non-zero `migrate deploy`; `migrate status` not up to date; health `database` or `redis` not `up`; web `/login` not 200; any change to production or ARCH OS PM2 rows; non-Mentoring role-permission count change; a failed negative test in section 11 that exposes data or an action to the wrong role.

## 13. Post-deployment monitoring and acceptance criteria

### 13.1 Immediate checks (first 15 minutes)

- `GET /api/v1/health` (local port) returns `ok`, `database: up`, `redis: up` [H for port].
- Web `/login` returns 200; the browser loads without console errors.
- `pm2 ls`: staging ids online, restart count (↺) not climbing; production and ARCH OS rows unchanged (pid, ↺).
- Staging log tail (`pm2 logs <id> --lines 100 --nostream`) shows no stack traces, no Prisma errors, and no secrets; if it does print a secret, report it and redact before sharing.
- A dry sign-in from each role in section 11.

### 13.2 First 24–72 hours

| Signal | Source | Threshold |
|---|---|---|
| API 5xx rate and restart count | PM2 and logs | Zero unexplained restarts; no repeated 5xx on `/mentoring` or `/leads` |
| Prisma errors (P2002 unique, P2003 foreign key) | API log | None. P2003 on student delete is expected only for handed-over students |
| Handover failures | `enrollment_handovers` where `status = 'FAILED'` | Zero, or each one retried successfully by the Sales Head |
| Permission failures | Audit log / 403 counts | No 403 for roles that should have access; no 200 for roles that should not |
| Notifications | `notifications.dedupe_key` | No duplicate notification per event |
| Redis | `INFO memory`, key prefixes, `maxmemory-policy` | `noeviction` retained; no `evicted_keys`; queue keys under the expected prefix |
| Disk | `df` | Backups and artifacts did not fill the volume |
| DB locks and slow queries | `pg_stat_activity` | No long-running locks |
| Untouched systems | `pm2 ls` | Production and ARCH OS pids and restart counts unchanged |

### 13.3 Acceptance criteria (all required; the owner signs off)

1. Deployed commit on the server equals `3426f674fd2bc34cb29eedfcd2ea9e296cb46c78` and the working tree is clean.
2. `prisma migrate status` reports up to date with 36 migrations; only the two Mentoring migrations were added.
3. No difference in row counts of pre-existing tables compared with just before migration, apart from changes made by testers.
4. The grant produced exactly 13 / 6 / 2 / 1 / 5 / 4 Mentoring permissions for MENTORING_HEAD / MENTOR / DEMO_COUNSELOR / SALES_HEAD / CEO / CO_FOUNDER and no change in non-Mentoring role links.
5. Every P and N in section 11 passed for every role.
6. Health is green for 72 hours with no unexplained restarts.
7. Production and ARCH OS PM2 rows, databases and Redis prefixes unchanged throughout.
8. A restore of the pre-deployment backup was verified before the window (section 6).
9. The deployment log lists any accepted risk (credential rotation, HTTPS, Redis separation).

### 13.4 Not covered by this acceptance

Production deployment (separate approval), credential rotation of production, history rewrite, HTTPS rollout, backfill of existing enrolled students, and the real-database end-to-end run (`apps/api/test`), which has never been executed.

## 14. Register of unknowns

| # | Unknown | Resolved by |
|---|---|---|
| U1 | Real staging commit, working tree state, branch | 3.6 |
| U2 | PM2 ids, process users, cwd of staging, production and ARCH OS | 3.1 |
| U3 | `APP_ENV` and `NODE_ENV` of staging and production | 3.2 or owner statement |
| U4 | `.env`, ecosystem and storage ownership and modes | 3.3 |
| U5 | Redis: instance(s), eviction policy, who shares it, ARCH OS usage | 3.4–3.5 |
| U6 | Database role privileges and table ownership | 3.6 |
| U7 | Number and state of existing ENROLLED students and `notifications` size | 3.6 |
| U8 | Whether UAT accounts exist on staging | 3.6 |
| U9 | Whether `ts-node` is available to run the seed on the server | Rehearsal 6.4 |
| U10 | Whether the backup script works end to end; R2 bucket, key, space | Section 5, rehearsal |
| U11 | Whether the grant SQL runs on PostgreSQL 16 | Rehearsal G1 |
| U12 | Atomicity of a failed migration | Rehearsal 6.4 |
| U13 | HTTPS availability and the reverse-proxy configuration | Owner |
| U14 | Whether the remote accepts the new branch and the server can fetch it | 1.4 |
| U15 | Real staging user accounts for each role | Owner |
| U16 | Application ports and health path on the server | 3.1 and [H] |
| U17 | Maintenance-window length and traffic pattern | Owner |

## 15. Register of actions that require explicit owner approval

1. Pushing `integration/staging-mentoring` to `origin` (new branch, no force).
2. Any SSH or server connection, including the read-only preflight.
3. Credential rotation (C1–C5), UAT account decision, and the decision to deploy before or after rotation.
4. HTTPS decision (4.3).
5. Creating `.env`/storage permission changes and the separate staging Redis (checklist sections 3–4), if wanted before or with this release.
6. Running the backup, the restore, and the rehearsal.
7. The deployment window itself (D1–D11), including `git checkout`, builds, `pnpm install`, `prisma migrate deploy`, the seed and the PM2 restarts of the two staging ids.
8. Grant: G2 dry run on staging, and separately G3 execution.
9. Whether `CO_FOUNDER` remains in the grant (the owner has confirmed read-only inclusion [O]).
10. Handling of existing enrolled students (retry individually, backfill, or leave).
11. Fixing or removing `deploy.sh` and `deploy-staging.sh`.
12. Any rollback, and any history rewrite.

**This document does not claim readiness.** The deployment is ready only when the unknowns in section 14 are resolved with evidence, the gates in 7.1 are satisfied, and the owner approves each action in section 15.
