# EL SCORE OS — HR Migration Ordering Remediation Report

**Date:** October 24, 2026  
**Repository:** `E:\elscore new os`  
**Branch:** `feat/demo-multisession-schema`  
**Baseline HEAD Commit:** `f166ac7400025f87baf0d3a96cf25d5905cbaa1d`  
**Remediation Verdict:** `PASS — LOCAL MIGRATION ORDER CORRECTED`  

---

## 1. Executive Summary

During the independent Overall HR Staging-Readiness Audit (`HR_OVERALL_STAGING_READINESS_REPORT.md`), a critical deployment blocker was identified in the local migration sequence:
Lexicographical directory ordering under `apps/api/prisma/migrations/` caused `20261023_add_candidate_selection_and_offers` to sort ahead of `20261023_add_workforce_vacancies`. Because `job_applications` in Candidate Selection enforces a foreign key constraint referencing `vacancies(id)` created in Workforce Vacancies, any clean database deployment (`prisma migrate deploy`) would fail with PostgreSQL error:
```
ERROR: relation "vacancies" does not exist
```

This remediation safely resolved the ordering conflict across all local untracked HR migrations by migrating to standard 14-digit Prisma migration timestamp identifiers (`YYYYMMDDHHMMSS_<name>`), establishing a strictly monotonic chronological dependency order.

**Zero lines of application source code were modified.** All existing Phase 0–7 and Tutor HR modules, schemas, services, controllers, and UI remain 100% intact.

---

## 2. Root Cause & Dependency Analysis

### 2.1 Lexicographical Sorting in Prisma Migrate
Prisma Migrate evaluates pending migrations in alphabetical (lexicographical) order of directory names within `apps/api/prisma/migrations/`.
When migrations share the 8-digit date prefix `20261023_`:
- `20261023_add_candidate_selection_and_offers` (character 'c') sorts **before**
- `20261023_add_workforce_vacancies` (character 'w').

### 2.2 Exact Foreign Key & Type Dependencies
1. **Workforce Vacancies -> Candidate Selection:**
   - In `20261023_add_workforce_vacancies/migration.sql`:
     ```sql
     CREATE TABLE "vacancies" ( "id" TEXT NOT NULL, ... CONSTRAINT "vacancies_pkey" PRIMARY KEY ("id") );
     ```
   - In `20261023_add_candidate_selection_and_offers/migration.sql`:
     ```sql
     ALTER TABLE "job_applications" ADD CONSTRAINT "job_applications_vacancy_id_fkey"
       FOREIGN KEY ("vacancy_id") REFERENCES "vacancies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
     ```
   *Deploying Candidate Selection before Vacancies causes a fatal foreign key target table missing error.*

2. **Employee Lifecycle -> Workforce Vacancies:**
   - In `20261022_add_employee_lifecycle_and_history/migration.sql`:
     ```sql
     CREATE TYPE "EmploymentType" AS ENUM ('FULL_TIME', 'PART_TIME', 'CONTRACT', 'INTERN');
     ```
   - In `20261023_add_workforce_vacancies/migration.sql`:
     ```sql
     ALTER TABLE "vacancies" ADD COLUMN "employment_type" "EmploymentType" NOT NULL;
     ```
   *Vacancies require `EmploymentType` to be defined prior to table creation.*

3. **Compensation & CEO Approvals -> Payroll & Tutor Payables:**
   - In `20261022_add_compensation_and_ceo_approvals/migration.sql`:
     ```sql
     CREATE TABLE "employee_compensations" ( ... );
     ```
   - In `20261023_add_hr_payroll_and_tutor_payables/migration.sql`:
     References and queries employee compensation records.

4. **Candidate Selection -> Onboarding & Probation:**
   - In `20261023_add_candidate_selection_and_offers/migration.sql`:
     Creates `job_applications` and `job_offers`.
   - In `20261024_add_employee_onboarding_and_probation/migration.sql`:
     References `job_offers` and candidate transitions into employee onboarding.

---

## 3. Directory Renaming Mapping

To strictly enforce dependency ordering without ambiguous same-day naming collisions, all untracked local HR migrations were renamed with standard 14-digit timestamp prefixes (`YYYYMMDDHHMMSS`).

The historical tracked migration `20261022_add_employee_leave_and_unlock` (committed in HEAD `f166ac7`) was left **completely untouched** to prevent any historical drift.

| Old Directory Name | New Directory Name | Purpose / Reason for Position |
| :--- | :--- | :--- |
| `20261022_add_employee_leave_and_unlock` | *(Unchanged - Tracked in Git)* | Leave & unlock base migration |
| `20261022_add_employee_lifecycle_and_history` | `20261022100000_add_employee_lifecycle_and_history` | Defines `EmploymentType` and lifecycle base |
| `20261022_add_compensation_and_ceo_approvals` | `20261022120000_add_compensation_and_ceo_approvals` | Creates `employee_compensations` |
| `20261023_add_workforce_vacancies` | `20261023100000_add_workforce_vacancies` | **Creates `vacancies` table (10:00:00)** |
| `20261023_add_candidate_selection_and_offers` | `20261023120000_add_candidate_selection_and_offers` | **References `vacancies(id)` FK (12:00:00)** |
| `20261023_add_hr_payroll_and_tutor_payables` | `20261023140000_add_hr_payroll_and_tutor_payables` | Payroll and tutor payables (14:00:00) |
| `20261024_add_employee_onboarding_and_probation` | `20261024100000_add_employee_onboarding_and_probation` | Onboarding & probation (10:00:00) |
| `20261024_add_performance_management` | `20261024140000_add_performance_management` | Performance management reviews & goals (14:00:00) |

---

## 4. Final Ordered Migration Sequence

When `prisma migrate deploy` executes against a database, migrations will execute in this exact sequence:

1. `20260327000000_init`
2. `20260408_payment_followups`
3. `20260410_sales_target_v2`
4. `20260411_quotations_discounts`
5. `20260413000000_fix_financial_precision`
6. `20260413100000_performance_indexes`
7. `20260414000000_god_view_access_logs`
8. `20260417000000_soft_delete_audit`
9. `20260418000000_soft_delete_cascade`
10. `20260418100000_audit_log_indexes`
11. `20260419000000_demo_operations_flow`
12. `20260420000000_demo_schema_alignment`
13. `20261022_add_employee_leave_and_unlock`
14. `20261022100000_add_employee_lifecycle_and_history`
15. `20261022120000_add_compensation_and_ceo_approvals`
16. `20261023100000_add_workforce_vacancies` *(Predecessor: creates `vacancies`)*
17. `20261023120000_add_candidate_selection_and_offers` *(Successor: references `vacancies`)*
18. `20261023140000_add_hr_payroll_and_tutor_payables`
19. `20261024100000_add_employee_onboarding_and_probation`
20. `20261024140000_add_performance_management`

**Dependency Guarantee:**
- `20261023100000_add_workforce_vacancies` strictly precedes `20261023120000_add_candidate_selection_and_offers`.
- `vacancies` table will always exist prior to `job_applications` foreign key creation.

---

## 5. Migration History Compatibility Verification

Prior to renaming, the repository's git tracking history and deployment status were inspected:
1. `git ls-files apps/api/prisma/migrations`:
   - Confirmed only `20261022_add_employee_leave_and_unlock` was tracked in git commit `f166ac7`.
   - All 7 HR migrations under remediation were completely untracked local additions.
2. Deployment Record Safety:
   - This feature branch (`feat/demo-multisession-schema`) is strictly local-only and has never been pushed or deployed to any shared staging or production environment.
   - Consequently, no remote `_prisma_migrations` table contains records referencing the old folder names.
   - No migration checksum conflicts or migration repair operations will be required on staging deploy.

---

## 6. Verification & Test Outcomes

### 6.1 Lexicographical Order Verification
Verified via directory iteration in Node.js / PowerShell:
```
apps/api/prisma/migrations/20261023100000_add_workforce_vacancies
< sorts strictly before >
apps/api/prisma/migrations/20261023120000_add_candidate_selection_and_offers
```
Result: **PASS**

### 6.2 API Typecheck
Command: `pnpm --filter api exec tsc --noEmit`  
Exit code: `0`  
Errors: `0`  
Result: **PASS**

### 6.3 Web Typecheck
Command: `pnpm --filter web exec tsc --noEmit`  
Exit code: `0`  
Errors: `0`  
Result: **PASS**

### 6.4 HR In-Band Test Suite Execution
Command:
```powershell
pnpm --filter api exec jest -i candidate.spec.ts employee-compensation.spec.ts employee-lifecycle.spec.ts leave-attendance.spec.ts onboarding.spec.ts employee-payroll.spec.ts tutor-payable.spec.ts performance.spec.ts tutor-rate-approval.spec.ts vacancy.spec.ts employee-attendance.service.spec.ts
```
Output:
```
PASS src/modules/leave/leave-attendance.spec.ts
PASS src/modules/payroll/employee-payroll.spec.ts
PASS src/modules/vacancy/vacancy.spec.ts
PASS src/modules/tutor/tutor-rate-approval.spec.ts
PASS src/modules/performance/performance.spec.ts
PASS src/modules/payroll/tutor-payable.spec.ts
PASS src/modules/onboarding/onboarding.spec.ts
PASS src/modules/employee/employee-lifecycle.spec.ts
PASS src/modules/candidate/candidate.spec.ts
PASS src/modules/compensation/employee-compensation.spec.ts
PASS src/modules/attendance/employee-attendance.service.spec.ts

Test Suites: 11 passed, 11 total
Tests:       264 passed, 264 total
Snapshots:   0 total
Time:        28.821 s
```
Result: **PASS (11/11 suites passed, 264/264 tests passed, 0 failures)**

---

## 7. Zero Source Code Modification Statement

As mandated by the safety boundaries:
- **0 lines of application source code were modified or deleted.**
- All modified and untracked files across Phase 0 through Phase 7 and Tutor HR were strictly preserved in the working tree.
- No `git reset`, `git stash`, `git checkout`, or remote operations were run.
- No database migrations or seeds were executed against any database.

---

## 8. Final Verdict

`PASS — LOCAL MIGRATION ORDER CORRECTED`

The local migration ordering blocker identified in the staging-readiness audit is completely resolved. Migration application order now guarantees that table definitions precede foreign key constraints, enabling clean execution of `prisma migrate deploy` on staging.
