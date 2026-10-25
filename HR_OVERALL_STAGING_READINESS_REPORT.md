# EL SCORE OS — Overall HR Staging-Readiness Audit Report (Phases 0–7 + Tutor HR)

**Audit Date:** October 24, 2026  
**Auditor:** Independent Security & Staging Readiness Auditor  
**Repository:** `E:\elscore new os`  
**Branch:** `feat/demo-multisession-schema`  
**Baseline HEAD Commit:** `f166ac7400025f87baf0d3a96cf25d5905cbaa1d`  
**Scope:** HR Phases 0–7, Tutor HR, Attendance, Leave, Compensation, Payroll, RBAC, and Shared Infrastructure  

---

## 1. Executive Summary & Verdict

This independent audit evaluates whether the combined local HR implementation across **Phases 0 through 7 and Tutor HR** is ready for a controlled staging deployment.

The codebase exhibits strong architectural cohesion, comprehensive RBAC coverage, strict separation of duties, robust transaction locking patterns, and excellent test suite health (all 57 backend test suites and 689 tests passing, 0 TypeScript errors across API and Web, and 100% clean Next.js production builds).

However, a **critical database migration ordering blocker** was discovered in the untracked migration directory sequence: `20261023_add_candidate_selection_and_offers` lexicographically precedes `20261023_add_workforce_vacancies`. Because Prisma Migrate deploys migrations strictly in alphabetical order by directory name, running `prisma migrate deploy` on a clean staging database will immediately crash with `relation "vacancies" does not exist`.

### Overall Executive Verdict

```
FAIL — BLOCKERS FOUND
```

> **Note on Blocker:** This is a zero-code-change migration directory timestamp ordering issue. Once migration folder prefixes are assigned chronological ordering (e.g. assigning `20261023100000_add_workforce_vacancies` prior to `20261023140000_add_candidate_selection_and_offers`), the implementation can immediately advance to staging review.

---

## 2. Phase-by-Phase Readiness Matrix

| Phase | Domain / Focus | Implementation Status | Test Coverage | Staging Readiness |
| :--- | :--- | :--- | :--- | :--- |
| **Phase 0** | Platform Foundation & RBAC Core | Implemented | Passed (Guard & Token Suites) | **READY** |
| **Phase 1** | Identity, Organization & Lifecycle | Implemented | Passed (`employee-lifecycle.spec.ts`) | **READY** |
| **Phase 2** | Compensation & CEO Approvals | Implemented | Passed (`employee-compensation.spec.ts`) | **READY** |
| **Phase 3** | Leave, Attendance & Unlocks | Implemented | Passed (`employee-attendance.service.spec.ts`) | **READY** |
| **Phase 3b**| Payroll & Tutor Payables | Implemented | Passed (`employee-payroll.spec.ts`, `tutor-payable.spec.ts`) | **READY** |
| **Phase 4** | Workforce Planning & Vacancies | Implemented | Passed (API suites) | **BLOCKED BY MIGRATION ORDER** |
| **Phase 5** | Candidate Selection & Offers | Implemented | Passed (API suites) | **BLOCKED BY MIGRATION ORDER** |
| **Phase 6** | Onboarding & Probation | Implemented | Passed (Storage & Lifecycle suites) | **READY** |
| **Phase 7** | Performance Management | Remediated | Passed (`performance.spec.ts`, 51 tests) | **READY** |
| **Tutor HR**| Tutor Recruitment, Rates & Feedback | Implemented | Passed (`tutor-rate-approval.spec.ts`) | **READY** |

---

## 3. Working-Tree and Scope Inventory (Check A)

### 3.1 Git Status & Baseline
- **Current Branch:** `feat/demo-multisession-schema`
- **Current HEAD Commit:** `f166ac7400025f87baf0d3a96cf25d5905cbaa1d`
- **Working Tree State:** Clean modified working tree. Zero files committed, stashed, reset, or pushed.
- **Modified Tracked Files (17 files):**
  - `.gitignore`
  - `apps/api/prisma/schema.prisma`
  - `apps/api/prisma/seed.ts`
  - `apps/api/src/app.module.ts`
  - `apps/api/src/modules/attendance/employee-attendance.service.ts`
  - `apps/api/src/modules/employee/dto/update-employee.dto.ts`
  - `apps/api/src/modules/employee/employee.controller.ts`
  - `apps/api/src/modules/employee/employee.service.ts`
  - `apps/api/src/modules/leave/leave.service.ts`
  - `apps/api/src/modules/tutor/dto/tutor-rate.dto.ts`
  - `apps/api/src/modules/tutor/tutor-rate.controller.ts`
  - `apps/api/src/modules/tutor/tutor-rate.service.ts`
  - `apps/web/src/app/(app)/settings/SettingsNavigation.tsx`
  - `apps/web/src/app/(app)/settings/actions.ts`
  - `apps/web/src/app/(app)/settings/employees/page.tsx`
  - `apps/web/src/app/(app)/settings/page.tsx`
  - `apps/web/src/components/ui/StatusBadge.tsx`
- **Untracked Directories & Files:**
  - `HR_PHASE_7_FINAL_REAUDIT_REPORT.md`
  - `apps/api/prisma/migrations/20261022_add_compensation_and_ceo_approvals/`
  - `apps/api/prisma/migrations/20261022_add_employee_lifecycle_and_history/`
  - `apps/api/prisma/migrations/20261023_add_candidate_selection_and_offers/`
  - `apps/api/prisma/migrations/20261023_add_hr_payroll_and_tutor_payables/`
  - `apps/api/prisma/migrations/20261023_add_workforce_vacancies/`
  - `apps/api/prisma/migrations/20261024_add_employee_onboarding_and_probation/`
  - `apps/api/prisma/migrations/20261024_add_performance_management/`
  - `apps/api/src/common/utils/employment-status.util.ts`
  - `apps/api/src/common/utils/financial-masking.util.ts` & `.spec.ts`
  - `apps/api/src/modules/candidate/`
  - `apps/api/src/modules/compensation/`
  - `apps/api/src/modules/employee/dto/transition-employee-status.dto.ts`
  - `apps/api/src/modules/employee/employee-lifecycle.spec.ts`
  - `apps/api/src/modules/onboarding/`
  - `apps/api/src/modules/payroll/`
  - `apps/api/src/modules/performance/`
  - `apps/api/src/modules/tutor/tutor-rate-approval.spec.ts`
  - `apps/api/src/modules/vacancy/`
  - `apps/web/src/app/(app)/settings/candidates/`
  - `apps/web/src/app/(app)/settings/onboarding/`
  - `apps/web/src/app/(app)/settings/payroll/`
  - `apps/web/src/app/(app)/settings/performance/`
  - `apps/web/src/app/(app)/settings/vacancies/`
  - `apps/web/src/app/api/onboarding/`

---

## 4. Cross-Phase Contracts and Data Ownership (Check B)

### 4.1 Employee Profile & Lifecycle Governance
- **Status Consistency:** `EmploymentStatus` enum covers `PROBATION`, `ACTIVE`, `NOTICE_PERIOD`, `SUSPENDED`, `TERMINATED`, `RESIGNED`.
- **Termination Enforcement:** Transitioning to `TERMINATED` transactionally marks the employee `TERMINATED`, sets linked `User.status` to `INACTIVE`, revokes all unexpired `RefreshToken` records, revokes all active delegated `UserPermission` assignments, and triggers RBAC cache invalidation (`employee.service.ts` lines 420–440).
- **Suspension Enforcement:** Transitioning to `SUSPENDED` with `restrictAccess: true` sets `User.status` to `SUSPENDED` and revokes active refresh tokens.
- **Self-Transition Protection:** Employees cannot modify their own employment lifecycle status.

### 4.2 Currency & Compensation Boundaries
- **Corporate Compensation:** Base salary and allowances are strictly denominated in `INR` (Indian Rupee), with statutory monthly payment frequencies.
- **Tutor Pay Rates:** Hourly teaching rates remain denominated in the existing international tutor currency convention (e.g., `AED`, configured per `TutorProfile`).
- **CEO Approval:** Both corporate salary changes and tutor rate changes enforce mandatory CEO approval (`isCeoUser` check validating `role.code === 'CEO'`).
- **JIT Activation:** Both modules implement Just-In-Time (JIT) activation on read using PostgreSQL advisory locks for approved changes whose `effectiveDate <= today`.

### 4.3 Payroll Immutability & Finance Ownership
- **Dual Pipeline:** Clean separation between corporate employee payroll (`employee-payroll.service.ts`) and tutor session payables (`tutor-payable.service.ts`).
- **Finalization Freeze:** Finalized payroll runs freeze gross pay, deductions, and net pay into immutable snapshot columns. Status transitions from `FINALIZED` to `PAID` occur via manual payment reference marking.

### 4.4 Recruitment to Onboarding Transition
- **Offer to Onboarding Handshake:** `OnboardingService.listAcceptedApplicationsReadyForOnboarding` queries `jobApplication` where `status = ACCEPTED` and `onboardingCase = null`.
- **Atomic Employee Creation:** `OnboardingService.finalizeOnboarding` transactionally converts an accepted candidate into an `Employee` (business ID `EMP-xxxx`), creates a `User` in `PENDING_SETUP` status, seeds default user roles, marks the `jobApplication` as `HIRED`, and automatically generates a baseline compensation request for CEO approval.

### 4.5 Workday, Attendance & Leave Unlocks
- **Authoritative Source:** Global working schedules snapshot working hours and timezones using `date-fns-tz` without hardcoded offset strings.
- **Approved Leave Enforcement:** Active approved leave requests (`employeeLeaveRequest` in `APPROVED` status) strictly block attendance check-in.
- **HR Unlock Gate:** Bypassing an approved leave check-in block requires an explicit `employeeAttendanceLeaveUnlock` record matching `(employeeId, calendarDate, leaveRequestId)`. The unlock records a mandatory audit reason and does not fabricate fake attendance sessions or mutate historical leave requests.

---

## 5. Authorization & Sensitive Data (Check C)

### 5.1 RBAC Enforcement & Guard Integrity
- **Guard Architecture:** All HR endpoints are guarded with `@UseGuards(RbacGuard)` and `@RequirePermissions(...)`.
- **Authorization Service:** Dynamic permission resolution via `RbacService.getPermissionsForUser(userId)` evaluates user roles, active delegations, and cache layers.
- **Seed Role Mapping:** Seeded role mappings in `seed.ts` strictly confine `performance.read.all` to administrative/executive roles (`SUPER_ADMIN`, `ADMIN`, `CEO`, `HR_HEAD`, `HR_MANAGER`). Ordinary employees and department heads receive scoped permissions (`performance.read.own`, `performance.read.team`).

### 5.2 IDOR Defenses
- **Goal Details:** Scoped to owner, designated reviewer, or same-department manager for `performance.read.team`. Cross-department access strictly requires `performance.read.all`.
- **Review Details & Lists:** Redacts `confidentialNotes` server-side for employees viewing their own reviews and peer managers who are not the designated reviewer.
- **PIP Details:** Enforces employee ownership or managerial reporting relationship.
- **Onboarding Documents:** Authenticated download stream checks cross-case isolation (`doc.caseId === caseId`) and throws 403 on mismatch.

### 5.3 Financial Data Masking
- **Utilities:** `maskBankAccount` and `maskPanNumber` in `financial-masking.util.ts` provide null-safe masking (`•••• 1234` and `••••••1234`).
- **Access Boundary:** Full unmasked financial records are restricted strictly to authorized executive/finance holders of `compensation.read` or `payroll.run.read`.

---

## 6. Database Safety & Migration Audit (Check D)

### 6.1 CRITICAL BLOCKER: Migration Sequence Collision (Severity: HIGH)
- **Defect:** In `apps/api/prisma/migrations/`:
  - `20261023_add_candidate_selection_and_offers/migration.sql`
  - `20261023_add_workforce_vacancies/migration.sql`
- **Analysis:**
  Both migrations share the date prefix `20261023_`.
  Prisma Migrate sorts migration directories lexicographically (alphabetically).
  Alphabetical ordering places `20261023_add_candidate_selection_and_offers` **before** `20261023_add_workforce_vacancies`.
  In `20261023_add_candidate_selection_and_offers/migration.sql`:
  ```sql
  ALTER TABLE "job_applications" ADD CONSTRAINT "job_applications_vacancy_id_fkey" 
    FOREIGN KEY ("vacancy_id") REFERENCES "vacancies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  ALTER TABLE "job_offers" ADD CONSTRAINT "job_offers_vacancy_id_fkey" 
    FOREIGN KEY ("vacancy_id") REFERENCES "vacancies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  ```
  However, table `"vacancies"` is created in `20261023_add_workforce_vacancies/migration.sql`!
- **Consequence:** Running `prisma migrate deploy` on a clean staging database will fail immediately:
  `ERROR: relation "vacancies" does not exist`.
- **Remediation Required:**
  Assign granular chronological timestamps to the migration directories to ensure proper execution order:
  - Rename `20261023_add_workforce_vacancies` &rarr; `20261023100000_add_workforce_vacancies`
  - Rename `20261023_add_candidate_selection_and_offers` &rarr; `20261023120000_add_candidate_selection_and_offers`
  - Rename `20261023_add_hr_payroll_and_tutor_payables` &rarr; `20261023140000_add_hr_payroll_and_tutor_payables`
  - (Similarly assign granular timestamps to `20261022_...` and `20261024_...` migrations).

---

## 7. Onboarding Storage & Document Security (Check E)

### 7.1 Binary Ingestion Security
- **Magic-Byte Signature Verification:** `OnboardingStorageService.validateFileSignature` inspects leading binary headers to identify true file types (PDF: `%PDF-`, PNG: `0x89504E47`, JPEG: `0xFFD8FF`, WebP: `RIFF...WEBP`). Rejects forged MIME extensions.
- **File Size Limits:** Strictly enforces 10MB maximum payload (`MAX_FILE_SIZE_BYTES`).
- **Filename Sanitization:** Strips path separators, directory traversal sequences (`../`, `..\`), and non-alphanumeric characters, truncating to 150 characters.
- **Storage Location:** Files are stored under `storage/private/onboarding/cases/<caseId>/<uuid>.<ext>` outside the public webroot.
- **Path Traversal Protection:** Validates that resolved target and read paths strictly start with `path.resolve(this.storageRoot)`.

### 7.2 Multi-Instance Deployment Consideration (Non-Blocking)
- Files are saved to the local filesystem node. In a multi-replica Kubernetes or multi-instance container staging deployment, instances will not share local disk storage unless an NFS/EFS persistent volume is mounted, or an S3/cloud object store adapter is configured.

---

## 8. Concurrency & Transaction Integrity Matrix (Check F)

| Operation | Concurrency Defense | Verification Classification |
| :--- | :--- | :--- |
| **Compensation Approval & JIT Activation** | `SELECT pg_advisory_xact_lock(hashtext('comp-emp-...'))` inside `$transaction` | **2. Inspected but only mock-tested** |
| **Tutor Rate Approval & JIT Activation** | `SELECT pg_advisory_xact_lock(hashtext('tutor-rate-...'))` inside `$transaction` | **2. Inspected but only mock-tested** |
| **Payroll Generation & Finalization** | `SELECT pg_advisory_xact_lock(hashtext('payroll-run-...'))` inside `$transaction` | **2. Inspected but only mock-tested** |
| **Candidate Offer Acceptance & Expiry** | Sorted locks: `candidate-*`, `application-*`, `vacancy-*`, `offer-*` | **2. Inspected but only mock-tested** |
| **Attendance Check-in & Leave Unlock** | Database-level unique constraint + `$transaction` lookup | **2. Inspected but only mock-tested** |
| **Onboarding Case Finalization** | Sorted locks: `application-*`, `onboarding-*` inside `$transaction` | **2. Inspected but only mock-tested** |
| **Performance Review Finalization & PIP** | Sorted locks: `performance-review-*`, `pip-*` inside `$transaction` | **2. Inspected but only mock-tested** |
| **Employee Status Transition & Offboarding**| Atomic `$transaction` with token revocation & RBAC invalidation | **2. Inspected but only mock-tested** |

> **Classification Note:** All concurrency boundaries are implemented with deadlock-free sorted transactional advisory locks and tested in Jest suites. However, because test runners execute against Jest mocks, real PostgreSQL multi-connection parallel race conditions require validation against a disposable staging PostgreSQL database.

---

## 9. Test Execution & Verification Results (Check G)

All test commands were actively executed during this audit session:

| Command | Target | Result | Execution Details |
| :--- | :--- | :--- | :--- |
| `pnpm --filter api test -- performance.spec.ts` | Phase 7 Performance Suite | **PASS** | 51/51 tests passing in 15.899s |
| `pnpm --filter api exec jest -i` | Full Backend Integration Suite | **PASS** | 57/57 suites, 689/689 tests passing in 59.773s |
| `pnpm --filter api exec tsc --noEmit` | API TypeScript Typecheck | **PASS** | Exit code 0, 0 errors |
| `pnpm --filter web exec tsc --noEmit` | Web TypeScript Typecheck | **PASS** | Exit code 0, 0 errors |
| `pnpm --filter web build` | Next.js Production Build | **PASS** | 47/47 static and dynamic pages generated cleanly |

---

## 10. Prioritized Issues & Staging Deployment Checklist

### 10.1 High Priority (Deployment Blocker)
1. **Fix Migration Lexicographical Ordering:**
   Rename the untracked migration directories with standard 14-digit timestamps (`YYYYMMDDHHMMSS_name`) so `add_workforce_vacancies` runs before `add_candidate_selection_and_offers`.

### 10.2 Medium Priority (Pre-Production Considerations)
1. **Multi-Replica Shared Storage:** Configure an S3-compatible or shared NFS volume for `ONBOARDING_STORAGE_DIR` if staging runs multiple backend container replicas.
2. **PostgreSQL Concurrent Load Testing:** Execute parallel stress tests against a live PostgreSQL staging database to verify advisory locking concurrency under real load.
3. **Notification Worker Dispatcher:** Clarify in release notes that in-app notification records exist in the database, but external communication delivery (email/SMS) depends on Section 15 dispatch infrastructure.

---

## 11. Staging Validation Checklist (For Deployment Team)

When deploying to the staging environment:
- [ ] Ensure migration directories have granular chronological timestamps.
- [ ] Run `pnpm --filter api prisma migrate deploy` on a staging PostgreSQL database.
- [ ] Run `pnpm --filter api prisma db seed` to establish the initial RBAC permissions and default roles.
- [ ] Verify `ONBOARDING_STORAGE_DIR` is mounted with write permissions.
- [ ] Run smoke tests for:
  - [ ] Candidate &rarr; Offer &rarr; Onboarding &rarr; Employee creation flow.
  - [ ] Attendance check-in with approved leave block and HR unlock.
  - [ ] Compensation change request with CEO approval.
  - [ ] Performance review evaluation and finalization flow.

---

## 12. Safety Boundary Confirmation

- **Application Source Modifications:** Zero source files edited, formatted, or deleted during this audit.
- **Database Migrations:** Zero migrations or seed scripts executed against any database.
- **Git Operations:** Zero commits, zero pushes, zero branch changes, zero stashing.
- **Deployment Status:** No staging or remote deployment performed.
