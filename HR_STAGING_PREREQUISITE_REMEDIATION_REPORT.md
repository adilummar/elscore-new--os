# EL SCORE OS — HR Staging Prerequisite Remediation Report

**Date:** October 24, 2026  
**Repository:** `E:\elscore new os`  
**Branch:** `feat/demo-multisession-schema`  
**HEAD:** `f166ac7400025f87baf0d3a96cf25d5905cbaa1d`  
**Scope:** Local inspection and configuration-documentation updates only

Local documentation now matches the configuration the code actually reads. Passing local checks does not make this branch ready for staging.

> **Current authorization constraints, October 24, 2026.** These describe the local code. They do not approve staging or deployment.

### Seed permission restoration

The earlier seed inserted any missing role-permission link on every run. On a populated database that restored sensitive HR grants an administrator had removed, including `user.reset-password`, `onboarding.finalize`, `compensation.approve`, and `payroll.run.finalize`.

That restoration is no longer the default. Missing links are inserted when the user table is empty. On a populated database they stay unchanged unless the operator sets `SEED_RECONCILE_ROLE_PERMISSIONS=true`. That switch only inserts missing catalog links. It does not delete links, and it does not rewrite stored role or permission rows. This report does not approve running the seed.

### System actor

`system@elscore.internal` remains an audit identity. Credential validation fails for that identity even when the password hash would verify. Password reset, password change, and further role assignment are refused. A role already stored on an existing system row is not deleted by the seed or by these checks. Inspect that row before staging if an older seed granted it CEO.

> **Superseded on October 24, 2026.** Sections 3 through 6 are the original remediation record and are kept. The statements listed here were later corrected in code or in a follow-up reading of the same code. This note does not approve staging or deployment.

### Corrections that supersede section 3

| Original statement in this report | Current local fact |
| :--- | :--- |
| Login in `apps/web/src/lib/api/auth.ts` falls back to `http://localhost:3001/api/v1` in every `NODE_ENV`, including production. | `resolveServerApiUrl` uses that fallback only when `NODE_ENV` is `development`. Production returns a configuration error and does not call the API. |
| A missing sequence row is Prisma `P2025`, and `PrismaExceptionFilter` returns HTTP 404. | `IdGeneratorService` maps that known missing-row error to HTTP 500 `SEQUENCE_NOT_CONFIGURED`. Other errors are rethrown. |
| The working-tree seed does not insert `ONB`, `PR`, or `TPR`, and a rerun overwrites sequence prefix and padding. | Those keys are in `SEQUENCE_DEFINITIONS`. Create still starts `nextNumber` at 1. Update is empty, so an existing counter, prefix, and padding stay as stored. |
| `seedSystemUser` assigns the CEO role on create. The skip log says an admin already exists whenever any user exists. | A new system actor has no role and is not a login. An existing system row is left unchanged, including any role it already has. The admin path runs only when the user count is 0 and says that CEO and HR logins were not created when users already exist. |
| Redis, JWT, and health notes in section 3.5 and 3.6. | Those three notes already matched the code and are not superseded: the API can boot without Redis; JWT length is not enforced; health stays HTTP 200 and the JSON body reports dependency state. |

### Operator prerequisites still open

1. Target database migration-history inspection.
2. Seed approval. The seed was not executed.
3. CEO and HR account provisioning on any database that already has users.
4. Build-time `API_URL`.
5. Shared onboarding storage at one absolute path.
6. Redis for workers, with `APP_ENV=staging` when the prefix must be `elscore-staging`.
7. PostgreSQL session pinning for advisory locks.
8. Real PostgreSQL concurrency tests.
9. Staging smoke tests.

## 1. Files inspected

Working tree at the start of this task already contained unrelated modified and untracked HR work. Those files were read where relevant and were not edited.

Configuration and runtime:

- `.env.example`
- `apps/api/.env.example`
- `apps/web/.env.example`
- `apps/web/next.config.mjs`
- `apps/web/src/lib/api/client.ts`
- `apps/web/src/lib/api/auth.ts`
- `apps/web/src/lib/auth/actions.ts`
- `apps/web/src/lib/auth/auth-cookie-options.ts`
- `apps/web/src/middleware.ts`
- `apps/web/src/app/api/onboarding/[caseId]/documents/[docId]/download/route.ts`
- `apps/web/src/app/api/quotations/[id]/pdf/route.ts`
- `apps/web/src/app/(auth)/login/page.tsx`
- `apps/api/src/main.ts`
- `apps/api/src/app.module.ts`
- `apps/api/src/common/config/configuration.ts`
- `apps/api/src/common/config/config.module.ts`
- `apps/api/src/common/config/env.validation.ts`
- `apps/api/src/common/queue/queue.module.ts`
- `apps/api/src/modules/health/health.controller.ts`
- `apps/api/src/modules/health/health.module.ts`
- `apps/api/src/common/filters/prisma-exception.filter.ts`
- `docker-compose.yml`
- `.github/workflows/ci.yml`
- root `package.json` and `apps/api/package.json`
- installed Next.js 14.2 define-env plugin: `apps/web/node_modules/next/dist/build/webpack/plugins/define-env-plugin.js`

Storage and identifiers:

- `apps/api/src/modules/onboarding/onboarding-storage.service.ts`
- `apps/api/src/modules/onboarding/onboarding.service.ts` (storage persistence and `ONB` / `EMP` id calls)
- `apps/api/src/common/id-generator/id-generator.service.ts`
- `apps/api/prisma/seed.ts` (working-tree copy, already modified before this task)
- `apps/api/prisma/seed-test-users.ts`
- `apps/api/prisma/schema.prisma` (`Sequence` model and datasource)
- call sites of `nextIdInTx` under `apps/api/src`

Reference report:

- `HR_STAGING_DEPLOYMENT_PREPARATION_REPORT.md`

`apps/api/.env` was not opened. `prisma validate` loaded it only to resolve `env("DATABASE_URL")` in the schema. No connection string or secret from that file is recorded here.

## 2. Files changed

These three tracked templates were clean at the start of this task. They are the only tracked files edited.

| File | Reason |
| :--- | :--- |
| `.env.example` | Root template documented `NEXT_PUBLIC_API_URL` and omitted `API_URL`. It now documents both URLs, the build-time inlining behavior, onboarding storage, PostgreSQL, Redis, JWT, CORS, timezone, and cookie rules that the code implements. |
| `apps/web/.env.example` | This file already defined both URL variables. Comments now state which side reads each one, that the values may differ by topology, that they must include the API prefix, that they must not contain secrets, and how Next inlines a non-empty `API_URL` at build time. Cookie comment now matches `authCookieOptions`. |
| `apps/api/.env.example` | `ONBOARDING_STORAGE_DIR` was undocumented. The API template now describes local-disk resolution, directory creation, permissions, and multi-replica path identity, plus the implemented PostgreSQL, Redis, JWT, CORS, and timezone rules. |

No application source, seed, or storage implementation was changed.

Diff stat for those templates: `.env.example` +37/−2, `apps/api/.env.example` +29/−2, `apps/web/.env.example` +19/−4.

New file created for this task:

- `HR_STAGING_PREREQUISITE_REMEDIATION_REPORT.md`

No migration SQL, migration directory, seed script, storage service, authentication code, or business-logic file was modified.

### Working-tree ownership

Before any edit, `git status` already showed modifications to tracked HR/application files (`schema.prisma`, `seed.ts`, `app.module.ts`, employee, leave, tutor, and several web settings files) and a large set of untracked HR migrations, modules, and earlier audit reports. This session did not create those changes and cannot assign them to an author. They were left untouched, including the already-modified `apps/api/prisma/seed.ts` and the untracked `OnboardingStorageService`.

## 3. Findings

### 3.1 `API_URL` and `NEXT_PUBLIC_API_URL`

The preparation report says the web example documents only `NEXT_PUBLIC_API_URL` and that a missing `API_URL` makes `client.ts` throw. The web template already contained both variables. The root template was the file that omitted `API_URL`.

Server-side `API_URL` is read by:

- `apps/web/src/lib/api/client.ts` — server components and server actions that call `fetchApi`. Outside `development`, an empty value throws `API_URL is not configured` on each call. The module logs at import and does not throw at import. In `development`, the fallback is `http://localhost:3001/api/v1`.
- `apps/web/src/middleware.ts` — refresh call to `${API_URL}/auth/refresh`. Outside `development`, a missing value clears the auth cookies and redirects to `/login`. It does not throw.
- `apps/web/src/app/api/onboarding/[caseId]/documents/[docId]/download/route.ts` and `apps/web/src/app/api/quotations/[id]/pdf/route.ts` — same development fallback. They do not emit the explicit configuration error. An empty production value makes `fetch` use a relative URL.
- `apps/web/src/lib/api/auth.ts` — live login path used by `apps/web/src/app/(auth)/login/page.tsx`. **Superseded:** missing `API_URL` no longer falls back to localhost outside development. Original text: Missing `API_URL` falls back to `http://localhost:3001/api/v1` in every `NODE_ENV`, including production. That behavior was not changed.

`apps/web/next.config.mjs` publishes `API_URL` through Next's `env` block. The installed Next 14.2 define-env plugin inlines `env` entries and `NEXT_PUBLIC_*` values when they are non-null at `next build`. A value baked in at build time stays in the bundle. A value absent at build time is not replaced, so Node server code can still read the process environment later. Middleware is compiled for the Edge runtime, so the web build that gets deployed should receive the internal `API_URL` rather than relying on a later process-only setting.

`NEXT_PUBLIC_API_URL` is the browser-facing base URL by Next convention. In this tree the login page does not read it. The only reader is `apps/web/src/lib/auth/actions.ts`, and nothing imports that module. Its fallback is `http://localhost:3001` without the `/api/v1` prefix. Callers that do use either variable append paths such as `/auth/login`, so the configured value has to include the API prefix.

The two URLs may differ when the browser and the Next.js server use different routes to the API. Neither value is a secret. No staging hostname was written into the templates.

### 3.2 Onboarding storage

`OnboardingStorageService` resolves the root as `ONBOARDING_STORAGE_DIR`, or `path.resolve(process.cwd(), 'storage', 'private', 'onboarding')` when that variable is unset.

The directory does not have to exist beforehand. The constructor calls `mkdirSync` with `recursive: true` and swallows a failure. `saveDocumentFile` creates `cases/<caseId>` with `fs.promises.mkdir` and does not swallow that failure, so a missing or unwritable path fails the upload. The service does not set a mode such as `0750`. The process owner needs permission to create and write the directory. Downloads check `fs.constants.R_OK` and return a not-found error when the file cannot be read.

The implementation uses Node `fs` and `path` only. There is no object-storage client. Setting the environment variable cannot switch this service to S3 or another remote store.

Uploads persist `filePath` as the absolute resolved path. Downloads open that stored path and also require it to stay under the current storage root. `fileKey` is stored and is not used to find the file. Multiple replicas therefore need one shared filesystem, mounted at the same absolute path used when the file was saved. A per-container disk, or the same files mounted at a different path, will not serve those documents. An ephemeral container disk loses the files on replacement.

The storage service itself was not changed. The API and root env templates now describe this behavior.

### 3.3 Database seed and `IdGeneratorService`

`pnpm db:seed` runs `prisma db seed`, which the API package points at `apps/api/prisma/seed.ts` only. `apps/api/prisma/seed-test-users.ts` is a separate script. It is not part of `pnpm db:seed`, and it does not create CEO or HR users.

**Superseded.** A missing sequence row is now HTTP 500 `SEQUENCE_NOT_CONFIGURED` from `IdGeneratorService`, not the filter's HTTP 404. Original text: `IdGeneratorService.nextIdInTx` updates an existing `sequences` row by `entityType` and formats `${prefix}-${padded}`. A missing row is Prisma `P2025`. `PrismaExceptionFilter` turns that into HTTP 404 with the message `The requested record was not found`. The HTTP body does not include `P2025` or Prisma's `Record to update not found` text. The preparation report's client-facing wording is stronger than the filter.

Sequence rows the working-tree seed upserts, and that HR code calls:

| Runtime key | Seeded in working-tree `seed.ts` | Caller |
| :--- | :--- | :--- |
| `VAC`, `CAN`, `APP`, `OFF` | Yes | vacancy and candidate services |
| `CYC`, `GOL`, `REV`, `PIP` | Yes | performance service |
| `EMP` | Yes | onboarding finalization and user creation |
| `ONB` | **Superseded: yes, inserted only when missing** | onboarding case creation |
| `PR` | **Superseded: yes, inserted only when missing** | employee payroll run creation |
| `TPR` | **Superseded: yes, inserted only when missing** | tutor payable run creation |

**Superseded.** `ONB`, `PR`, and `TPR` are in the catalog. `PAY` is still not the payroll key, and `TUT` is still not the tutor-payable key. Original text: The preparation report's list (`VAC`, `CAN`, `APP`, `OFF`, `CYC`, `GOL`, `REV`, `PIP`) matches rows the uncommitted seed additions insert. It does not match every HR caller. `ONB`, `PR`, and `TPR` are required by current services and are absent from the seed. The seed does contain `PAY`, and payroll calls `PR`, so those keys are not interchangeable. `TUT`, `DEM`, `ADM`, `PAY`, `CLS`, `REN`, and `MTG` are seeded and have no `nextIdInTx` caller under `apps/api/src`.

**Superseded.** Sequence update is now empty. Existing `nextNumber`, prefix, and padding are left unchanged. `STA` and `TCR` still use hyphenated prefixes on a newly inserted row. Original text: `seedSequences` is repeatable for existence: create sets `nextNumber` to 1, and update changes `prefix` and `padding` only. A second run does not rewind counters. The same function is not a pure no-op, because it overwrites prefix and padding. The working-tree list also contains `TL` twice; the second upsert writes the same prefix and padding. `STA` and `TCR` are seeded with prefixes `STA-` and `TCR-`. Combined with `nextIdInTx`, those prefixes produce a doubled hyphen. Those attendance rows were already in the seed and were not part of this documentation change.

`pnpm db:seed` also upserts departments, the full role catalog, permissions, role-permission links, subjects, grades, and curricula. Role-permission seeding inserts missing links and does not delete links removed from the catalog. It is safe to repeat only in that additive sense.

CEO and HR provisioning:

- The `CEO` role is seeded. `HR_MANAGER`, `HR_EXECUTIVE`, and `HR_ASSISTANT` roles are seeded. No HR user account is created.
- **Superseded in part.** `seedAdminUser` still creates one CEO user and one employee only when the user count is 0. The skip message now says CEO and HR logins were not created. Original: Email and password come from `SEED_ADMIN_EMAIL` and `SEED_ADMIN_PASSWORD`. When `NODE_ENV` is `production` and the password variable is left at the built-in default, that first-run path throws. If any user already exists, the admin CEO user is skipped.
- **Superseded.** A new system actor has no CEO or HR role. An existing `system@elscore.internal` row is not updated. Original: `seedSystemUser` upserts `system@elscore.internal`, assigns the `CEO` role, and creates an employee with business id `SYS-0000` on the create path. Its password hash is the placeholder `none`. Update on later runs is empty, so a partial system row is not repaired. CEO notification queries that select every user with the `CEO` role will include this system user and, on a first run, the admin user.

The seed script was not executed during the original remediation. The later follow-up added the missing sequence keys in source and did not execute the seed either.

### 3.4 PostgreSQL

The Prisma datasource is `postgresql` with `url = env("DATABASE_URL")`. Startup requires `DATABASE_URL` to be a non-empty string. The schema does not declare a minimum server version, and application code does not check one. The preparation report's PostgreSQL 14 requirement is not enforced or stated by the schema.

`docker-compose.yml` and `.github/workflows/ci.yml` pin `postgres:16-alpine`. Migration `20260926000001_tutor_lead_assignment_softdelete` calls `gen_random_uuid()`. HR transactions call `pg_advisory_xact_lock(hashtext(...))`. Those locks are held for the transaction, so the database session for that transaction has to stay pinned. The application does not configure a pooler. A transaction-mode pooler in front of PostgreSQL would break that locking. No pool mode was verified against a server.

### 3.5 Redis and BullMQ

`QueueModule` always configures BullMQ. Connection values are `REDIS_HOST` (default `localhost`), `REDIS_PORT` (default `6379`), and `REDIS_PASSWORD` when set. An empty password string is passed through. Startup validation does not require Redis to be reachable.

The ioredis client uses `maxRetriesPerRequest: null`, retries on a 10 second interval, and discards connection errors. `main.ts` also ignores an `uncaughtException` whose message contains `ECONNREFUSED` and whose stack mentions `ioredis`. The API can boot while Redis is down. Background workers will not function until Redis is reachable.

The key prefix is `elscore-${APP_ENV ?? NODE_ENV}`. It becomes `elscore-staging` only when `APP_ENV` is `staging`. `NODE_ENV` is validated as `development`, `test`, or `production`, so `NODE_ENV=staging` fails startup. The preparation report's statement that the prefix resolves to `elscore-staging` is true only for that `APP_ENV` setting.

Registered queue names in this module are notifications, deadline monitor, audit projection, and housekeeping.

### 3.6 Authentication, CORS, cookies, timezone, and health

JWT:

- `JWT_ACCESS_SECRET` and `JWT_REFRESH_SECRET` must be non-empty strings or startup throws.
- No minimum length or entropy check exists. The 32-character guidance in the preparation report is an operational recommendation, not a validator.
- Access lifetime defaults to `15m` and refresh lifetime to `7d`.
- When `NODE_ENV` is `production`, `ConfigModule` sets `ignoreEnvFile`, so a `.env` file is not loaded. The process environment has to carry the variables.

CORS:

- `CORS_ORIGINS` is split on commas, default `http://localhost:3000`. Spaces are not trimmed.
- `main.ts` enables credentials and allows methods `GET`, `POST`, `PUT`, `PATCH`, `DELETE`, and `OPTIONS`, and headers `Content-Type`, `Authorization`, and `X-God-View-Target`.
- The value is not checked by `validateEnv`.

Cookies and HTTPS:

- The live login, refresh, and God View cookies use `authCookieOptions`: `httpOnly`, `sameSite: 'lax'`, `path: '/'`.
- `secure` is true unless `COOKIE_SECURE` is the exact string `false`. The code does not inspect the request scheme or a certificate.
- `apps/web/src/lib/auth/actions.ts` uses a different rule, `NODE_ENV === 'production'`, and is not imported by the login page.

Timezone:

- `SYSTEM_TIMEZONE` defaults to `Asia/Kolkata` in `configuration.ts`. The value is not validated as an IANA name.

Health:

- `HealthModule` is imported. The route is public `GET /<API_PREFIX>/health`. With the default prefix that is `GET /api/v1/health`.
- The handler runs `SELECT 1` and pings the housekeeping queue client for `PONG`.
- The JSON body is `{ status, api, database, redis }` with `status` `ok` only when database and Redis are both `up`.
- `@HttpCode(HttpStatus.OK)` always returns HTTP 200, including when `status` is `error`. A monitor that only checks the status code will treat a down database or Redis as healthy.

## 4. Commands executed and results

| Command | Result |
| :--- | :--- |
| `git status --short`, `git rev-parse HEAD`, `git branch --show-current`, `git log -1 --oneline` | Exit 0. Branch `feat/demo-multisession-schema`. HEAD `f166ac7400025f87baf0d3a96cf25d5905cbaa1d`. Pre-existing dirty and untracked files recorded in section 2. |
| `git diff -U0 -- apps/api/prisma/seed.ts` filtered to sequence and role lines | Inspection only, at the time of this report. **Superseded:** that diff did not yet include `ONB`, `PR`, or `TPR`. The follow-up catalog does. |
| `pnpm --filter api exec tsc --noEmit` | Exit 0. No TypeScript errors printed. |
| `pnpm --filter web exec tsc --noEmit` | Exit 0. No TypeScript errors printed. |
| `pnpm --filter api exec prisma validate` | Exit 0. Output: environment variables loaded from `.env`; schema loaded from `prisma\schema.prisma`; schema is valid. This validates the schema file. It does not migrate, seed, or query. |

No database migration, seed, SSH, deploy, commit, push, reset, stash, checkout, or cleanup command was run.

## 5. Remaining infrastructure, DBA, and QA work

These items cannot be closed from this workspace:

1. Provide the web build and the running web process with an internal `API_URL`, and decide the browser-facing `NEXT_PUBLIC_API_URL` if that public route is different. Confirm the build that is deployed was produced with the intended internal URL, because a non-empty build-time value is inlined.
2. Mount a persistent filesystem for the API and set `ONBOARDING_STORAGE_DIR` to that absolute path. Give the API user create and write access. For more than one API replica, mount the same path on every replica. This code will not use object storage through configuration.
3. Have a DBA inspect `_prisma_migrations` on the target database before any migrate command. This session did not connect to a database and did not check migration history.
4. **Superseded as a missing-key defect.** `ONB`, `PR`, and `TPR` are in the seed catalog and are inserted only when absent. An operator must still approve and run the seed. Original: Decide how `ONB`, `PR`, and `TPR` sequence rows will be created before onboarding-case, payroll-run, and tutor-payable creation. `pnpm db:seed` as it exists does not create them. Do not treat the eight keys named in the preparation report as the full HR set.
5. **Still open.** Decide CEO and HR user provisioning separately. The seed creates role rows and a first-run CEO admin only when the user table is empty. It does not create an HR login. A new system actor has no role. An existing system row is not changed.
6. Review the rest of `pnpm db:seed` before running it: departments, permissions, reference data, the system user, and the first-run admin password variables. This session did not run it.
7. Provide PostgreSQL and confirm session pinning for `pg_advisory_xact_lock`. Run the multi-connection HR races against a disposable database. Unit tests do not prove that.
8. Provide Redis and set `APP_ENV` if the queue prefix must be `elscore-staging`. Confirm workers actually process jobs. Boot success does not prove Redis is up.
9. Inject non-empty JWT secrets through the process environment for production-mode boots. Choose CORS origins without surrounding spaces. Choose `COOKIE_SECURE` for the real scheme: exact `false` for plain HTTP, otherwise cookies are `Secure`.
10. Point uptime checks at the health JSON fields `database` and `redis`. HTTP 200 is returned when those dependencies are down.
11. QA smoke tests from the preparation report still require a deployed staging environment, synthetic users, and stored documents. They were not run.

## 6. Restrictions observed

No staging or production connection was opened. No migration, seed, or other database write was run. No SSH, Git push, commit, reset, stash, checkout, or cleanup command was run. Pre-existing modified and untracked files were preserved. Migration SQL and migration directories were not changed. Authentication, authorization, business logic, and storage behavior were not changed. **Superseded leftover:** the production login fallback and the missing `ONB`, `PR`, and `TPR` rows were later changed. Original closing sentence said they were left in place.

Local typecheck and schema validation do not establish staging readiness.
