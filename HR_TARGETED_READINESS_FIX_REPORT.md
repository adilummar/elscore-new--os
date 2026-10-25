# EL SCORE OS — Targeted HR Readiness Fix Report

**Date:** October 24, 2026  
**Repository:** `E:\elscore new os`  
**Branch:** `feat/demo-multisession-schema`  
**HEAD:** `f166ac7400025f87baf0d3a96cf25d5905cbaa1d` (unchanged)  
**Prior report:** `HR_STAGING_PREREQUISITE_REMEDIATION_REPORT.md` (not modified)

Local tests pass for the changes below. That does not make this branch ready for staging.

## 1. Confirmed findings and code references

### 1.1 Sequence keys

Every `IdGeneratorService.nextIdInTx` call under `apps/api/src` passes a string literal. The runtime keys are:

`APP`, `CAN`, `CYC`, `DMO`, `EMP`, `FUP`, `GOL`, `INV`, `LED`, `OFF`, `ONB`, `PIP`, `PMT`, `PR`, `QUO`, `RCT`, `REV`, `RQT`, `STA`, `STU`, `TCR`, `TL`, `TPR`, `VAC`.

The remediation report was correct that `ONB`, `PR`, and `TPR` were missing from the seed catalog.

| Key | Caller | Previous seed row | Prefix / padding after this change |
| :--- | :--- | :--- | :--- |
| `ONB` | `onboarding.service.ts` case creation | Missing | `ONB` / 4, so the first issued id is `ONB-0001` |
| `PR` | `employee-payroll.service.ts` run creation | Missing. `PAY` existed and is a different key | `PR` / 4, so the first issued id is `PR-0001` |
| `TPR` | `tutor-payable.service.ts` run creation | Missing. `TUT` existed and is a different key | `TPR` / 4, so the first issued id is `TPR-0001` |
| `EMP` | `onboarding.service.ts` finalization and `user.service.ts` | Present | `EMP` / 4, formatted `EMP-0001`. The first-run admin path uses the same padding |

`nextIdInTx` still formats `` `${prefix}-${padded}` `` (`id-generator.service.ts` lines 84–88). A missing row is Prisma `P2025`. That error is now caught in `nextIdInTx` (lines 68–81) and rethrown as HTTP 500 `SEQUENCE_NOT_CONFIGURED`, naming the sequence key and telling the operator to provision the row. The message does not include a host, password, or the raw Prisma text. Other database errors are rethrown unchanged. `AllExceptionsFilter` already forwards `HttpException` `code` and `message`.

`STA` and `TCR` are seeded with prefixes `STA-` and `TCR-`. Because the formatter adds another hyphen, the first issued ids are `STA--0000001` and `TCR--0000001`. Those prefixes were not renamed. The seed update writes `prefix` and `padding` on every run, so changing them would alter the series for future ids in any database that already has those rows.

`PAY` and `TUT` remain in the catalog. They are not the payroll or tutor-payable runtime keys. A duplicate `TL` entry was removed. Both copies had the same prefix and padding, so removing the second copy does not change the stored row.

Reruns still omit `nextNumber` from the update payload (`sequenceUpsertArgs` in `sequence-definitions.ts`). Create sets `nextNumber` to 1 only when the row is inserted.

### 1.2 Login `API_URL`

The live login page calls `login` in `apps/web/src/lib/api/auth.ts`. That function used `process.env.API_URL || 'http://localhost:3001/api/v1'` for every `NODE_ENV`, including production.

`resolveServerApiUrl` (`apps/web/src/lib/api/server-api-url.ts`) is now the shared resolver:

- A non-empty `API_URL` is used as given. Callers append a path such as `/auth/login`, so the value must already include the API prefix.
- `NODE_ENV=development` with no `API_URL` uses `http://localhost:3001/api/v1`.
- Every other environment, including production, throws `ApiUrlNotConfiguredError` with the message `API_URL is not configured.` The message does not contain a host or secret.

Live login (`auth.ts` lines 9–18) catches that error, logs `API_URL is missing` without a URL, and returns `Unable to sign in because the service is not configured.` It does not call `fetch`. The same resolver is used by `client.ts`, middleware refresh, the onboarding download proxy, the quotation PDF proxy, and the unused server actions in `apps/web/src/lib/auth/actions.ts`. That last file previously fell back to `http://localhost:3001` without `/api/v1`.

Authentication and authorization rules were not changed. Cookie flags, token checks, and role checks are the same.

### 1.3 Health check

`HealthController.check` (`apps/api/src/modules/health/health.controller.ts` lines 15–45) is public. With the default API prefix the route is `GET /api/v1/health`. The body is `{ status, api, database, redis }`. `status` is `ok` only when both dependencies are `up`. Database status comes from `SELECT 1`. Redis status is `up` only when the housekeeping queue client responds `PONG`.

`@HttpCode(HttpStatus.OK)` forces HTTP 200 even when `status` is `error`. No health-controller unit test existed. The only consumer in this repo is `apps/api/test/rate-limit.e2e-spec.ts`, which calls `GET /health` on an app that does not set the global prefix and counts HTTP 200 as an allowed request.

The HTTP status was not changed.

**Proposed follow-up, not applied:** return 503 when `status` is `error`, and keep 200 when both dependencies are up. That would make process monitors see dependency failure. It would also change the rate-limit e2e if that test runs while the database or Redis is down, and it would change any external probe that currently treats HTTP 200 as healthy regardless of the JSON body. Do that only with an explicit decision to update those consumers.

### 1.4 Seed provisioning review

`pnpm db:seed` runs only `apps/api/prisma/seed.ts`. It was not executed. `apps/api/prisma/seed-test-users.ts` is a separate script and is not part of that command. It was not executed and was not modified.

**Departments created or updated:** `ADMIN`, `MARKETING`, `SALES`, `ACADEMICS`, `FINANCE`, `HR`.

**Roles created or updated:** `CEO`, `CO_FOUNDER`, `OPERATIONS_MANAGER`, `MARKETING_HEAD`, `PERFORMANCE_MARKETER`, `DESIGNER`, `SALES_HEAD`, `SALES_COUNSELLOR`, `ACADEMIC_HEAD`, `MENTOR`, `DEMO_HEAD`, `DEMO_ADMIN`, `DEMO_COORDINATOR`, `TUTOR`, `FINANCE_HEAD`, `FINANCE_MANAGER`, `FINANCE_EXECUTIVE`, `ACCOUNTANT`, `HR_MANAGER`, `HR_EXECUTIVE`, `HR_ASSISTANT`. Each is a system role. `CEO` and `CO_FOUNDER` are protected. The seed also upserts the permission catalog and role-permission links.

**Sequence rows:** the catalog in `sequence-definitions.ts`, including the new `ONB`, `PR`, and `TPR` rows.

**User accounts the seed creates:**

- A first-run admin only when `user.count()` is 0. The account receives the `CEO` role and an `EMP-####` employee in `ADMIN`. Email and password come from `SEED_ADMIN_EMAIL` and `SEED_ADMIN_PASSWORD`. When `NODE_ENV` is `production` and the password is still the built-in default, this path throws before creating the user.
- `system@elscore.internal` on every run that gets that far. The create path assigns the `CEO` role and employee `SYS-0000`. The stored password hash is the placeholder `none`, so this is not a normal login. If the user row already exists, the update is empty and a missing employee or role is not repaired.

**Not created by the seed:** HR user accounts (`HR_MANAGER`, `HR_EXECUTIVE`, `HR_ASSISTANT`), a dedicated CEO login distinct from the first-run admin and the system user, and the sales/finance users in `seed-test-users.ts`. Those accounts need separate provisioning. No users were created and no passwords were changed in this task.

**Risks of running the seed against an existing database:**

- Department names, role descriptions and flags, permission text, and reference-data names are overwritten by the upsert updates.
- Role-permission links are insert-only. Permissions removed from the catalog stay assigned.
- Sequence `prefix` and `padding` are rewritten to the catalog values. `nextNumber` is kept. A rerun does not rewind counters, and it does rewrite a prefix that an operator had changed by hand.
- `ONB`, `PR`, and `TPR` are inserted at `nextNumber` 1 only when those rows are absent.
- If any user already exists, the CEO admin is skipped. An existing database does not gain that account from a rerun.
- The system user is created if missing. CEO-targeted notifications will include that user because it holds the `CEO` role.
- The seed also writes subjects, grades, and curricula. It is repeatable for existence. It is not a full reconcile, and it is not limited to sequence and role rows.
- Two permission entries carry an `isProtected` flag. The `Permission` model has no such column, and `seedPermissions` does not write the flag. The TypeScript type now allows the field so `ts-node` can compile the seed. That does not persist the flag.

## 2. Files changed

Changed for this task:

| File | Change |
| :--- | :--- |
| `apps/api/src/common/id-generator/sequence-definitions.ts` | New catalog and upsert plan. Adds `ONB`, `PR`, and `TPR`. Keeps existing counters off the update payload. |
| `apps/api/prisma/seed.ts` | Uses that catalog. Drops the duplicate `TL` definition. Guards `main()` with `require.main === module` so importing the file does not seed. Allows the unused `isProtected` permission flag so the script typechecks. This file was already modified before this task; those earlier edits remain. |
| `apps/api/src/common/id-generator/id-generator.service.ts` | Missing sequence rows fail with `SEQUENCE_NOT_CONFIGURED`. |
| `apps/api/src/common/id-generator/id-generator.service.spec.ts` | Missing-row, unrelated-error, and hyphenated-prefix tests. |
| `apps/api/src/common/id-generator/sequence-definitions.spec.ts` | Catalog, counter, and runtime-key tests. |
| `apps/api/src/modules/health/health.controller.spec.ts` | Body and HTTP 200 contract tests. Controller code was not changed. |
| `apps/web/src/lib/api/server-api-url.ts` | Shared server API base resolver. |
| `apps/web/src/lib/api/server-api-url.spec.ts` | Development, configured production, and missing production cases. |
| `apps/web/src/lib/api/auth.ts` | Live login no longer falls back to localhost outside development. |
| `apps/web/src/lib/api/auth.spec.ts` | Login tests for the three URL cases. |
| `apps/web/src/lib/api/client.ts` | Resolves `API_URL` per call through the shared helper. |
| `apps/web/src/middleware.ts` | Refresh uses the shared helper and still redirects to login when it is missing outside development. |
| `apps/web/src/app/api/onboarding/[caseId]/documents/[docId]/download/route.ts` | Missing `API_URL` returns a fixed 500 instead of a relative fetch. This route file was already untracked. |
| `apps/web/src/app/api/quotations/[id]/pdf/route.ts` | Same missing-URL behavior for the PDF proxy. |
| `apps/web/src/lib/auth/actions.ts` | Unused server actions use the same resolver and the `/api/v1` development prefix. |
| `apps/web/jest.config.cjs` | Maps `@/` and resolves `ts-jest` so the web specs can run. |

`HR_STAGING_PREREQUISITE_REMEDIATION_REPORT.md` was not overwritten. Migration SQL and migration directory names were not changed. Pre-existing HR modules and untracked files were left in place.

## 3. Tests added and results

Added:

- Runtime sequence keys are present once in the seed catalog, and no `nextIdInTx` call uses a non-literal key.
- `PR`, `TPR`, `ONB`, and `EMP` keep the intended prefix and padding, and the formatter emits `PR-0001`, `TPR-0001`, `ONB-0001`, and `EMP-0001` for the first number.
- Repeating `sequenceUpsertArgs` never puts `nextNumber` on the update.
- A missing sequence row throws `SEQUENCE_NOT_CONFIGURED` and does not echo the raw Prisma message. Other errors propagate.
- Health JSON reports each combination of database and Redis up/down. The method metadata stays HTTP 200.
- `resolveServerApiUrl` and live `login`: development fallback includes `/api/v1`; production with `API_URL` posts to that base plus `/auth/login`; production without `API_URL` does not call `fetch` and does not return a localhost address.

Results:

| Command | Result |
| :--- | :--- |
| API Jest: id-generator, sequence catalog, health, employee payroll, tutor payable | 5 suites, 52 tests, all passed |
| Web Jest: `server-api-url.spec.ts`, `auth.spec.ts`, and the existing cookie spec | 3 suites, 13 tests, all passed |
| `pnpm exec tsc --noEmit` in `apps/api` | Exit 0 |
| `pnpm exec tsc --noEmit` in `apps/web` | Exit 0 |
| `tsc --noEmit` on `apps/api/prisma/seed.ts` only, without executing it | Exit 0 after the permission-type allowance |
| `pnpm exec prisma validate` in `apps/api` | Exit 0. Schema valid. The command loaded the local API `.env` to resolve `env("DATABASE_URL")`. It did not migrate, seed, or print a connection string. |

The employee-payroll and tutor-payable suites already assert that those services call `nextIdInTx` with `PR` and `TPR`. They passed again.

## 4. Remaining environment, DBA, and QA prerequisites

- Set `API_URL` on the web build and the running web process. A non-empty value present at `next build` is still inlined by Next.js.
- Mount persistent shared storage and set `ONBOARDING_STORAGE_DIR` before onboarding uploads. This task did not change storage.
- Have a DBA read `_prisma_migrations` before any migrate. No migration was run.
- Run `pnpm db:seed` only after reviewing the overwrite risks in section 1.4. The new sequence rows are not in any database until that seed, or an equivalent insert, is applied by an operator. This session did not apply them.
- Provision HR logins, and a real CEO login if the first-run admin path will be skipped because users already exist.
- Exercise advisory-lock workflows against a real PostgreSQL instance. Version and pool mode are still unverified here.
- Provide Redis. API boot still succeeds when Redis is down.
- Decide separately whether health should return 503 when the JSON `status` is `error`.
- Leave the `STA` / `TCR` hyphenated prefixes unless an operator confirms those series are unused and accepts a prefix rewrite on the next seed.
- Staging smoke tests still require a deployed environment. They were not run.

## 5. Confirmation

No database migration, seed, or other database write was run. No staging, production, SSH, or other remote operation was performed. No commit, push, reset, stash, checkout, or working-tree cleanup was performed. HEAD remains `f166ac7400025f87baf0d3a96cf25d5905cbaa1d`.

Local test success is not staging readiness.
