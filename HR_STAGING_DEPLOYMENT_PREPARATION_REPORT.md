# EL SCORE OS — HR Staging Deployment Preparation Review Report

**Date:** October 24, 2026  
**Auditor:** Independent Security & System Auditor  
**Repository:** `E:\elscore new os`  
**Branch:** `feat/demo-multisession-schema`  
**Baseline HEAD Commit:** `f166ac7400025f87baf0d3a96cf25d5905cbaa1d`  
**Audit Mode:** Read-Only Staging Deployment Preparation Review  
**Executive Verdict:** `READY AFTER SPECIFIED PREREQUISITES`  

> **Current authorization constraints, October 24, 2026.** These describe the local code. They do not approve staging or deployment.

### Seed permission restoration

A seed rerun used to insert every missing role-permission link, which restored sensitive HR grants an administrator had removed. That included `user.reset-password`, `user.create`, `onboarding.finalize`, `compensation.approve`, and `payroll.run.finalize` on `HR_MANAGER`.

Current behavior:

- An empty user table still receives missing catalog links. Existing links are not deleted.
- A populated user table leaves role-permission links unchanged.
- `SEED_RECONCILE_ROLE_PERMISSIONS=true` is the only deliberate reconciliation switch. It inserts missing catalog links and still does not delete or rewrite an existing link.
- Existing role and permission rows are not rewritten. Catalog names and flags apply when the row is first created.

### System actor

`system@elscore.internal` (id `SYSTEM`) is an audit identity. Login now returns failure even if a stored password hash verifies. Password reset, password change, and role assignment are refused, including when the stored row already has a role such as CEO. The seed does not delete that stored role and does not modify an existing system row. An operator still has to inspect the row on a database that was seeded by the older script.

> **Superseded on October 24, 2026.** The verdict and the findings below are the original audit record. They are not deleted. Later local fixes changed several of the facts this report stated. This banner does not approve staging or deployment.

### Corrections that supersede the original findings

| Original statement | Current local fact |
| :--- | :--- |
| Sequence keys are only `VAC`, `CAN`, `APP`, `OFF`, `CYC`, `GOL`, `REV`, `PIP`, and a missing row surfaces as Prisma `P2025`. | The seed catalog also inserts `ONB`, `PR`, and `TPR` when those rows are absent. A missing row used by `IdGeneratorService` is HTTP 500 `SEQUENCE_NOT_CONFIGURED`. The raw Prisma error is not the client body. |
| `pnpm db:seed` is an idempotent rewrite of sequence prefix and padding, and it creates the admin whenever described as already present. | A rerun does not change `nextNumber`, `prefix`, or `padding` on an existing sequence row. A missing row is inserted at `nextNumber` 1. The CEO admin is created only when the user table is empty. No HR login is created. The system actor is created only when `system@elscore.internal` is absent, and that create has no role. An existing system row is not updated and is not stripped of a role it already has. |
| Missing `API_URL` falls back to localhost for login, and the root example omits `API_URL`. | Production and other non-development runtimes do not fall back to localhost. A missing value is a configuration error. Templates document `API_URL`. A non-empty value present at `next build` is still inlined. |
| Redis must be up for API boot, and the queue prefix is always `elscore-staging`. | The API can boot while Redis is down. Workers still need Redis. The prefix is `elscore-${APP_ENV ?? NODE_ENV}` and is `elscore-staging` only when `APP_ENV=staging`. |
| JWT secrets are validated at 32 characters or more. | Startup requires non-empty `JWT_ACCESS_SECRET` and `JWT_REFRESH_SECRET`. There is no length check in code. |
| Health failure is implied by the HTTP status. | `GET /api/v1/health` returns HTTP 200 even when the JSON `status` is `error`. Read `database` and `redis` in the body. |

### Operator prerequisites still open

These are not closed by the local follow-up:

1. Inspect `_prisma_migrations` on the target database before any migrate command.
2. Approve a seed run. The script was not executed here.
3. Provision CEO and HR accounts. The seed will not create them on a database that already has users.
4. Supply build-time `API_URL` for the web build, including the `/api/v1` prefix.
5. Mount shared onboarding storage at one absolute path for every API replica.
6. Provide Redis for workers and set `APP_ENV` when the queue prefix must be `elscore-staging`.
7. Pin PostgreSQL sessions for `pg_advisory_xact_lock`. A transaction-mode pooler breaks that lock.
8. Run real PostgreSQL concurrency tests. Unit tests mock the lock.
9. Run staging smoke tests against a deployed environment. They were not run.

---

## 1. Executive Summary & Verdict

An independent, strictly read-only staging deployment preparation review was conducted across the entire EL SCORE OS Human Resources implementation (Phases 0–7 + Tutor HR). 

The local codebase is internally cohesive, all 34 database migrations are lexicographically ordered without foreign-key or enum collisions, TypeScript typechecks pass cleanly with 0 errors across API and Web, and all HR unit test suites pass (264/264 tests). 

However, **a local build success must not be equated with staging environment readiness**. Moving from local development to a controlled staging deployment introduces infrastructural, environmental, data-state, and concurrency risks that require explicit operational prerequisites:

### Operational Prerequisites Requiring Resolution Before Deploying to Staging:
1. **Web Environment Variable Configuration (`API_URL`):** **Superseded.** Templates now document `API_URL`. Non-development runtimes do not fall back to localhost. Build-time inlining of a non-empty `API_URL` remains an operator prerequisite. Original text: Next.js Server Components and server-side document proxy routes require `API_URL` to be set in the web runtime. In `.env.example`, only `NEXT_PUBLIC_API_URL` is documented; without `API_URL`, server-side fetch calls in `apps/web/src/lib/api/client.ts` will throw runtime exceptions.
2. **Persistent Document Storage Volume (`ONBOARDING_STORAGE_DIR`):** The onboarding document upload/download service stores private binaries on the local filesystem (`storage/private/onboarding/cases/`). In a containerized or multi-instance staging environment, this directory will be lost on container restart or cause 404s across replicas unless bound to a persistent shared volume.
3. **Database Seed Requirement (`pnpm db:seed`):** **Superseded.** The catalog includes `ONB`, `PR`, and `TPR` as well as the keys named here. A missing row is HTTP 500 `SEQUENCE_NOT_CONFIGURED`, not a raw `P2025` body. Existing sequence counters, prefixes, and padding are not rewritten. Seed approval is still required before anyone runs it. Original text: `IdGeneratorService` relies on pre-existing database records in the `sequences` table (`VAC`, `CAN`, `APP`, `OFF`, `CYC`, `GOL`, `REV`, `PIP`). Without running the idempotent database seed script after migrations, creating vacancies, candidates, applications, offers, cycles, or goals will fail with Prisma P2025 (`Record to update not found`).
4. **Staging Database Migration-History Verification:** The staging database's `_prisma_migrations` table must be inspected by an authorized database administrator prior to deployment to verify whether any migrations were previously applied under pre-remediation directory names.
5. **Real Multi-Connection PostgreSQL Concurrency Validation:** All HR concurrency controls rely on `pg_advisory_xact_lock`, which are mocked in unit tests. Critical workflows (offer acceptance, payroll finalization, leave locks) must be exercised against a real PostgreSQL instance.

**Final Verdict:** `READY AFTER SPECIFIED PREREQUISITES`  
*(Deployment must NOT proceed until the environment configuration, volume mounts, seed sequence, and database history checks are verified).*

---

## 2. Evidence Reviewed & Local Commands Executed

### 2.1 Git Status & Integrity
- **Branch:** `feat/demo-multisession-schema` (local-only, no upstream tracking branch).
- **HEAD Commit:** `f166ac7400025f87baf0d3a96cf25d5905cbaa1d`.
- **Working Tree:** Untracked HR migrations and domain modules preserved; tracked migration `20261022_add_employee_leave_and_unlock` verified 100% identical to HEAD (`git diff HEAD` produced 0 bytes).

### 2.2 Local Verification Commands Run
| Command Executed | Directory | Exit Code | Outcome |
| :--- | :--- | :--- | :--- |
| `git status --short` | `E:\elscore new os` | 0 | PASS — Tracked files and untracked modules intact |
| `pnpm --filter api exec prisma validate` | `E:\elscore new os` | 0 | PASS — Prisma schema is valid |
| `pnpm --filter api exec tsc --noEmit` | `E:\elscore new os` | 0 | PASS — 0 compilation errors in API |
| `pnpm --filter web exec tsc --noEmit` | `E:\elscore new os` | 0 | PASS — 0 compilation errors in Web |
| `node scratch/verify_migrations.js` | `E:\elscore new os` | 0 | PASS — 117 tables, 76 enums, 0 FK errors, 0 enum errors |
| `pnpm --filter api exec jest -i ...` | `E:\elscore new os` | 0 | PASS — 11/11 HR test suites passed (264/264 tests) |

*Safety Note: No remote connections, database migrations, seed scripts, or file edits were executed.*

---

## 3. Repository & Migration Readiness

### 3.1 Lexicographical Sequence & Blocker Resolution
The 34 Prisma migrations sort in exact chronological and dependency-compliant order. The historical dependency blocker identified in `HR_OVERALL_STAGING_READINESS_REPORT.md` has been verified as completely resolved:
- **Migration #30:** `apps/api/prisma/migrations/20261023100000_add_workforce_vacancies/` creates the `vacancies` table.
- **Migration #31:** `apps/api/prisma/migrations/20261023120000_add_candidate_selection_and_offers/` adds foreign keys `job_applications_vacancy_id_fkey` and `job_offers_vacancy_id_fkey` referencing `vacancies(id)`.
- **Result:** Predecessor table exists prior to foreign key creation. Clean deployments will not fail with `relation "vacancies" does not exist`.

### 3.2 Dependency Matrix
1. **Enum Definition Precedence:** `EmploymentType` is defined in `20261022100000_add_employee_lifecycle_and_history` (Line 7) before being referenced as a column type in `20261023100000_add_workforce_vacancies` (Line 17) and `20261023120000_add_candidate_selection_and_offers` (Line 107).
2. **Compensation -> Payroll:** `employee_compensations` is created in `20261022120000_add_compensation_and_ceo_approvals` (Line 5) before `employee_payroll_items` references it in `20261023140000_add_hr_payroll_and_tutor_payables` (Line 123).
3. **Offers -> Onboarding:** `job_applications` and `job_offers` are created in `20261023120000_add_candidate_selection_and_offers` (Lines 43, 100) before `onboarding_cases` references them in `20261024100000_add_employee_onboarding_and_probation` (Lines 129, 132).
4. **Historical Base:** `20261022_add_employee_leave_and_unlock` is completely untouched. Zero orphaned or duplicate migration directories exist on disk.

---

## 4. Staging Environment Prerequisite Matrix

The following matrix evaluates every staging environment prerequisite based on verified codebase inspection. No credentials, tokens, or connection strings are printed.

| Prerequisite Item | Target Component | Status | Codebase Evidence & Operational Requirement |
| :--- | :--- | :--- | :--- |
| **Node.js Runtime** | API & Web | **PASS** | `package.json` specifies `"node": ">=20.0.0"`. Verified on Node v20+. |
| **Package Manager** | Monorepo root | **PASS** | `package.json` specifies `"packageManager": "pnpm@9.9.0"`. |
| **PostgreSQL Database** | API & Prisma | **UNVERIFIED** | Requires PostgreSQL 14+ supporting `gen_random_uuid()` and `pg_advisory_xact_lock`. Must be provisioned with connection pooler (e.g. PgBouncer in session mode or direct connection for advisory locks). |
| **Redis Instance** | API (BullMQ) | **UNVERIFIED** | **Superseded prefix and boot claim.** The API can boot with Redis down. Workers need Redis. Prefix is `elscore-${APP_ENV ?? NODE_ENV}`, and `elscore-staging` only when `APP_ENV=staging`. Original: Configured in `queue.module.ts`. Requires `REDIS_HOST`, `REDIS_PORT`, `REDIS_PASSWORD`. Queue prefix resolves to `elscore-staging`. Redis must be running for background worker initializations. |
| **JWT Secrets** | API Auth | **UNVERIFIED** | **Superseded length claim.** Code requires non-empty secrets and does not enforce 32 characters. Original: `JWT_ACCESS_SECRET` and `JWT_REFRESH_SECRET` must be set with high entropy (>=32 chars). |
| **CORS Origins** | API | **UNVERIFIED** | `CORS_ORIGINS` must include the staging web URL (e.g., `https://staging.elscore.com`). |
| **Web API URL (Server)** | Web (SSR/Proxy) | **FAIL** *(Config Gap)* | **Superseded documentation gap.** Templates document `API_URL`. Staging must still provide it at build time. Original: `apps/web/src/lib/api/client.ts` requires `process.env.API_URL` to communicate with API. `.env.example` documents only `NEXT_PUBLIC_API_URL`. **Must define `API_URL` in staging web environment**. |
| **Web API URL (Client)** | Web (Browser) | **UNVERIFIED** | `NEXT_PUBLIC_API_URL` must point to the public staging API base (e.g. `https://staging-api.elscore.com/api/v1`). |
| **Cookie Security** | Web Auth | **PASS** | `COOKIE_SECURE=true` is supported in `auth-cookie-options.ts`. Requires HTTPS staging domain. |
| **Document Storage Root**| API Onboarding | **FAIL** *(Topology Risk)*| `OnboardingStorageService` defaults to `storage/private/onboarding` relative to process cwd. Must set `ONBOARDING_STORAGE_DIR` to a mounted persistent volume. |
| **Database Sequences** | API ID Gen | **FAIL** *(Seed Required)* | **Superseded key list.** Missing rows are `SEQUENCE_NOT_CONFIGURED` (HTTP 500). The catalog also covers `ONB`, `PR`, and `TPR`. Seed still has to be approved and run by an operator; it was not run in the follow-up. Original: `IdGeneratorService.nextIdInTx` updates existing `sequences` table rows. Sequence records (`VAC`, `CAN`, `APP`, `OFF`, `CYC`, `GOL`, `REV`, `PIP`) only exist after running `pnpm db:seed`. |
| **CEO User & RBAC Roles** | API System | **FAIL** *(Seed Required)* | Compensation and tutor-rate notifications query users with role `CEO`. Role permissions and system roles (`CEO`, `HR_MANAGER`, etc.) require running `pnpm db:seed`. |
| **Business Timezone** | API Date Logic | **PASS** | `SYSTEM_TIMEZONE` defaults safely to `'Asia/Kolkata'` in `configuration.ts`. |

---

## 5. Database Migration-History Risk & Decision Tree

### 5.1 Clean Staging Database vs. Existing Staging Database
- **Clean Staging Database (New DB Instance):**
  - Running `pnpm db:migrate:deploy` executes migrations 1 through 34 sequentially in ASCII order.
  - Because `20261023100000_add_workforce_vacancies` runs before `20261023120000_add_candidate_selection_and_offers`, all prerequisite tables exist when foreign keys are attached.
  - Deployment will complete cleanly without manual intervention.
- **Existing Staging Database (Previously Migrated):**
  - If the database was previously touched by developer testing using old folder names (e.g., `20261023_add_candidate_selection_and_offers`), the table `_prisma_migrations` will hold entries with the old migration names and checksums.
  - Prisma Migrate will halt immediately with:
    `Error: The migration ... was not found in the database but was recorded in the migrations table.`
  - **Blindly deleting rows from `_prisma_migrations` or deleting schema tables is strictly prohibited** as it risks data corruption and schema drift.

### 5.2 Read-Only Verification Procedure for Database Operator
Before running any migration command on staging, an authorized database operator must execute this read-only SQL query:
```sql
SELECT migration_name, finished_at, rolled_back_at, checksum 
FROM _prisma_migrations 
ORDER BY migration_name ASC;
```

### 5.3 Migration History Decision Tree

```
[Start Migration Readiness Check]
            │
            ▼
[Operator executes SELECT on _prisma_migrations]
            │
            ├──────────────────────────────────────────────────────┐
            ▼                                                      ▼
[Database is Empty or has NO HR migrations (<= 20261022_...)]  [Database has entries with OLD names: 20261023_add_... / 20261024_add_...]
            │                                                      │
            ▼                                                      ▼
[Status: GREEN]                                               [Status: RED / DEPLOYMENT HALT]
Run standard deploy:                                          Do NOT run prisma migrate deploy!
1. pnpm db:migrate:deploy                                     1. Consult Senior DBA / Lead Engineer.
2. pnpm db:seed                                               2. If staging DB contains disposable test data:
                                                                 Reset database to clean baseline.
                                                              3. If staging DB contains persistent staging state:
                                                                 Use `prisma migrate resolve` under DBA supervision:
                                                                 Resolve old migrations as rolled back / new migrations as applied
                                                                 ONLY after verifying schema table matching.
```

### 5.4 Hard Stop Conditions
Deployment must stop immediately and escalate to the Lead Database Administrator if:
1. `_prisma_migrations` shows a failed or partially applied migration (`rolled_back_at IS NOT NULL` or `finished_at IS NULL`).
2. Migration names recorded in `_prisma_migrations` conflict with local timestamps.
3. Database engine is below PostgreSQL 14.
4. Connection pooling uses Transaction Pooling mode that breaks PostgreSQL session advisory locks (`pg_advisory_xact_lock` requires standard session or direct connection).

---

## 6. PostgreSQL Concurrency & Multi-Connection Verification Plan

Because unit tests execute against mocked Prisma clients where `$executeRaw` advisory locks are mocked, the seven core transactional workflows must be validated under true concurrent multi-connection conditions against a disposable PostgreSQL database prior to production release:

### 6.1 Workflows Requiring Multi-Connection Concurrency Testing
1. **Candidate Offer Acceptance Race:** Two simultaneous acceptance requests for the final available opening of a vacancy.
   - *Expected Behavior:* Advisory lock serializes execution; first succeeds, second fails with capacity exceeded or invalid state; vacancy `filled_positions` strictly equals limit.
2. **Payroll Duplicate Finalization:** Concurrent requests to finalize the same payroll run (`/payroll/runs/:id/finalize`).
   - *Expected Behavior:* Advisory lock and `@@unique([year, month, cycle])` block the second request; exactly one finalized ledger and 0 duplicate payroll items.
3. **Leave Request & Daily Attendance Collision:** Concurrent submission of an approved full-day leave request while an attendance check-in occurs for the same employee/date.
   - *Expected Behavior:* `pg_advisory_xact_lock(hashtext('leave_emp_' || id))` serializes requests; leave approval prevents check-in or flags required unlock.
4. **Compensation Request Approval Double-Spend:** Two concurrent CEO approval clicks on a pending compensation change request.
   - *Expected Behavior:* Only one approval transaction transitions the record to `APPROVED`; second request detects non-pending status and rejects with 409 Conflict.
5. **Onboarding Document Finalization Gate:** Concurrent completion of final checklist item and case finalization call.
   - *Expected Behavior:* Atomic transaction checks mandatory document presence inside lock; no case transitions to `COMPLETED` without all mandatory documents.
6. **Performance Review State Transition:** Concurrent submission by employee and return by manager.
   - *Expected Behavior:* Status state machine strictly enforced under transaction; no contradictory review states.
7. **Tutor Rate Exceptional Approval:** Concurrent approvals of conflicting effective-date tutor rates.
   - *Expected Behavior:* Advisory lock on tutor profile serializes rate adjustments; active rates remain non-overlapping.

### 6.2 Disposable Concurrency Test Harness Strategy
- Use a dedicated, disposable PostgreSQL 15 Docker container (`testcontainers` or ephemeral local instance).
- Launch automated test scripts executing 10–50 parallel worker connections (via `Promise.all` or `k6`/`artillery`) attacking identical record IDs.
- Assert that zero unhandled 500 errors, zero duplicate sequence numbers, and zero constraint violations occur.

---

## 7. Onboarding Document Storage Deployment Constraints

The current implementation (`OnboardingStorageService`) writes uploaded binary documents to the local filesystem using:
```ts
this.storageRoot = process.env.ONBOARDING_STORAGE_DIR || path.resolve(process.cwd(), 'storage', 'private', 'onboarding');
```

### 7.1 Operational Topology Implications
1. **Single-Instance Staging VM / Bare-Metal:**
   - **Safe**, provided the process has write permissions to `storage/private/onboarding/cases/` and local disk storage is included in VM snapshot backups.
2. **Containerized Staging (Docker / Kubernetes) with Ephemeral Disks:**
   - **CRITICAL RISK:** If the container restarts or redeploys, all uploaded onboarding verification documents (IDs, contracts, tax certificates) are permanently deleted.
   - **Requirement:** A persistent volume (Docker volume or Kubernetes `PersistentVolumeClaim`) MUST be mounted to `/storage` and referenced via `ONBOARDING_STORAGE_DIR=/storage/private/onboarding`.
3. **Multi-Replica API Deployments (Load-Balanced Across 2+ Nodes):**
   - **CRITICAL DEFECT:** If an applicant uploads a document to Replica A, a subsequent verification or download request hitting Replica B will return 404 Not Found.
   - **Requirement:** Multi-replica staging requires a Shared Network Filesystem (NFS / EFS) mounted on all replicas, OR the application must be refactored with an S3-compatible object storage provider (e.g. AWS S3, MinIO, Cloudflare R2).

### 7.2 Access Control & Download Proxy
- Documents are never served directly via public static webroot.
- Web proxy route (`apps/web/src/app/api/onboarding/[caseId]/documents/[docId]/download/route.ts`) forwards authenticated requests with `Authorization: Bearer <token>` and `X-God-View-Target`.
- Downloads enforce `Cache-Control: private, no-cache, no-store, must-revalidate` and `X-Content-Type-Options: nosniff`.

---

## 8. Cross-Phase HR Staging Smoke-Test Plan

The following ordered smoke-test plan exercises all 10 core HR capabilities using synthetic test data only. No real employee records, production emails, or actual payments may be used.

### Smoke-Test 1: Vacancy & Candidate Lifecycle
- **Preconditions:** Seed data applied (`VAC`, `CAN`, `APP`, `OFF` sequences exist). User logged in as `HR_MANAGER`.
- **Actions:**
  1. Create Vacancy `VAC-TEST-01` (Department: ACADEMICS, Role: TUTOR, Openings: 1).
  2. Create Candidate `CAN-TEST-01` and submit Application `APP-TEST-01`.
  3. Advance stage: Screening &rarr; Interview &rarr; Offer.
  4. Issue Offer `OFF-TEST-01` with base compensation.
  5. Mark offer as `ACCEPTED`.
- **Expected Results:** `onboarding_cases` record automatically generated; Vacancy status advances; audit log records `OFFER_ACCEPTED`.
- **Audit Verification:** Inspect `audit_events` for entity `JobOffer` and action `OFFER_ACCEPTED`.

### Smoke-Test 2: Onboarding & Mandatory Document Verification
- **Preconditions:** Onboarding case generated from Smoke-Test 1 in `PENDING` status.
- **Actions:**
  1. Attempt finalization without documents &rarr; **Must fail with 400 Bad Request**.
  2. Upload valid PDF document (ID proof) with binary file upload endpoint.
  3. Attempt upload of disguised executable or oversized file &rarr; **Must fail with 400 (magic-byte validation)**.
  4. Verify document checklist task as `HR_MANAGER`.
  5. Finalize onboarding case.
- **Expected Results:** Case status transitions to `COMPLETED`; new `Employee` record created in `PROBATION` status; `User` account provisioned.
- **Audit Verification:** `audit_events` contains `ONBOARDING_COMPLETED`.

### Smoke-Test 3: Leave Approval & Attendance Workday Lock
- **Preconditions:** Active employee `EMP-TEST-01`.
- **Actions:**
  1. Submit full-day Leave Request for date `D` as employee.
  2. Approve leave request as Manager / HR.
  3. Attempt attendance check-in for date `D` &rarr; **Must be blocked with attendance lock error**.
  4. Authorized HR Manager executes `/attendance/unlock` with justification note.
  5. Check-in again for date `D` &rarr; **Succeeds**.
- **Expected Results:** Attendance history preserved without corruption; unlock event logged with supervisor identity.
- **Audit Verification:** `audit_events` contains `ATTENDANCE_OVERRIDE_UNLOCKED` with non-empty reason.

### Smoke-Test 4: Employee Compensation & CEO Approval
- **Preconditions:** Employee `EMP-TEST-01` in `ACTIVE` status.
- **Actions:**
  1. HR Manager submits Compensation Change Request with future effective date.
  2. Check in-app notifications for CEO user &rarr; `COMPENSATION_CHANGE_REQUESTED` received.
  3. Login as CEO and approve request.
- **Expected Results:** Compensation request transitions to `APPROVED`; new compensation slab activates on effective date; masked bank details remain masked (`•••• 1234`).
- **Audit Verification:** `audit_events` records `COMPENSATION_REQUEST_APPROVED`.

### Smoke-Test 5: Tutor Rate Request & Currency Preservation
- **Preconditions:** Tutor profile exists with base currency `AED`.
- **Actions:**
  1. Academics Head submits Exceptional Tutor Rate Request.
  2. Verify currency field &rarr; strictly preserves `AED` (or configured company currency).
  3. Login as CEO and approve rate.
- **Expected Results:** `tutor_rates` table stores approved rate with matching currency; previous rate marked inactive or superseded.
- **Audit Verification:** `audit_events` contains `TUTOR_RATE_APPROVED`.

### Smoke-Test 6: Payroll Run Finalization & Freeze
- **Preconditions:** Active employees with valid compensation records.
- **Actions:**
  1. Finance Head initiates Monthly Payroll Draft for current cycle.
  2. Review payroll line items (gross pay, deductions, net pay).
  3. Finalize payroll run.
  4. Attempt subsequent update or recalculation of finalized run &rarr; **Must fail with 400/409 Frozen Record**.
- **Expected Results:** Run status `FINALIZED`; line items immutable; financial masking enforced on all employee bank outputs.
- **Audit Verification:** `audit_events` contains `PAYROLL_RUN_FINALIZED`.

### Smoke-Test 7: Performance Cycles, Goals & PIP
- **Preconditions:** Active employee and assigned manager.
- **Actions:**
  1. HR Manager creates Performance Cycle `CYC-TEST-01`.
  2. Employee sets measurable Goals `GOL-TEST-01`. Manager approves goals.
  3. Self-assessment submitted by employee; manager submits rating and review.
  4. Trigger PIP workflow for unsatisfactory rating.
- **Expected Results:** PIP created with target review date; confidential feedback isolated from non-managerial colleagues.
- **Audit Verification:** `audit_events` contains `PERFORMANCE_REVIEW_FINALIZED` and `PIP_INITIATED`.

### Smoke-Test 8: Confidentiality, Privacy & Financial Masking
- **Preconditions:** Target employee with bank account `123456789012` and PAN `ABCDE1234F`.
- **Actions:**
  1. Query employee details as regular peer employee &rarr; **Forbidden (403)**.
  2. Query employee details as Reporting Manager &rarr; Bank account masked as `•••• 9012`, PAN masked as `••••••1234F`.
  3. Attempt IDOR access to unassigned goal or review via direct ID &rarr; **Returns 404/403**.
- **Expected Results:** Strict zero data leakage across organizational hierarchies.

### Smoke-Test 9: Employee Suspension, Termination & Token Revocation
- **Preconditions:** Active employee with valid JWT access and refresh token.
- **Actions:**
  1. HR Manager transitions employee status to `SUSPENDED`.
  2. Attempt API request with existing refresh token &rarr; **Must fail with 401 Unauthorized (token revoked)**.
  3. Attempt attendance check-in or leave request &rarr; **Blocked (`isBlockedFromLeave` / `isEligibleForWork` returns false)**.
- **Expected Results:** User status set to `SUSPENDED`; all active refresh tokens revoked in database.

### Smoke-Test 10: Notification Verification & Synthetic Cleanup
- **Preconditions:** Notifications recorded during tests 1–9.
- **Actions:**
  1. Verify in-app notifications query `/notifications` returns recorded events.
  2. Distinguish database records from external email/SMS (external transports mock/disabled).
  3. Execute safe teardown: soft-delete or flag synthetic test records (`*-TEST-*`).
- **Expected Results:** Clean teardown without residual test artifacts polluting operational queues.

---

## 9. Rollback & Stop Conditions

### 9.1 Database Rollback Limitations
- **Forward-Only DDL:** Prisma migrations do not maintain automatic down-migrations. If `prisma migrate deploy` fails midway or causes data corruption, rolling back requires:
  1. Restoring the staging database from a snapshot taken immediately prior to deployment.
  2. Applying targeted SQL rollback scripts prepared by the DBA.
- **Mandatory Pre-Deployment Backup:** A full binary PostgreSQL backup (`pg_dump -Fc`) of the staging database MUST be completed and verified before running `prisma migrate deploy`.

### 9.2 Application Rollback
- Reverting the application deployment (container or PM2 process) to the prior stable release tag is safe because all schema changes in Phases 0–7 are additive (new tables and non-breaking column additions).

### 9.3 Deployment Abort / Stop Conditions
Deployment must be immediately aborted if:
1. `_prisma_migrations` contains conflicting checksums or historical migration directory names.
2. `prisma migrate deploy` returns any non-zero exit code.
3. `pnpm db:seed` fails to populate sequence numbers.
4. Smoke-test 2 (magic-byte document upload) or Smoke-test 3 (attendance lock) fails.
5. In-band API server health check (`/api/v1/health`) does not respond within 30 seconds of boot.

---

## 10. Remaining Blockers, Ownership & Recommended Next Actions

| Blocker / Action Item | Recommended Owner | Exact Next Action |
| :--- | :--- | :--- |
| **1. Web Server `API_URL` Config** | DevOps / Platform Lead | **Superseded example-file action.** `.env.example` now documents `API_URL`. Still set the internal URL, including `/api/v1`, for the web build. Original action: Set `API_URL=http://<internal-api-host>:3001/api/v1` in the staging environment for `apps/web`. Update `.env.example` to document `API_URL`. |
| **2. Persistent Storage Volume** | DevOps / Infrastructure | Mount a persistent disk volume to the staging API container and export `ONBOARDING_STORAGE_DIR=/storage/private/onboarding`. Ensure directory permissions `0750`. |
| **3. Staging DB History Inspection** | Database Administrator | Execute read-only query against `_prisma_migrations` on staging DB. Confirm no conflicting entries exist before applying migrations. |
| **4. Pre-Deployment Staging Backup** | Database Administrator | Take full `pg_dump` snapshot of the staging database immediately prior to running deployment commands. |
| **5. Post-Migration Idempotent Seed** | Release Engineer | **Superseded key list and idempotency claim.** Approve the seed first. It inserts missing sequence rows, including `ONB`, `PR`, and `TPR`, and does not rewrite existing counters. It does not create HR logins or a CEO login when users already exist. Original action: Execute `pnpm db:migrate:deploy` followed immediately by `pnpm db:seed` to populate ID sequences (`VAC`, `CAN`, `OFF`, etc.) and system roles. |
| **6. Multi-Connection Concurrency Run**| QA / Senior Engineer | Run automated concurrent integration script against disposable PostgreSQL instance to validate `pg_advisory_xact_lock` under load. |
| **7. Execute Smoke-Test Checklist** | QA / HR Product Lead | Execute the 10 cross-phase smoke tests using synthetic accounts and document evidence. |

---

## 11. Safety Confirmation Statement

The auditor explicitly certifies:
- **No database was connected to or modified.**
- **No migrations (`deploy` or `dev`) were executed.**
- **No seed scripts were executed.**
- **No remote commands or deployments were performed.**
- **No Git state was modified (0 commits, 0 pushes, 0 stashes, 0 branch switches).**
- **0 lines of application source code or migrations were altered.**
- **No secrets, tokens, or credentials have been exposed in this report.**
