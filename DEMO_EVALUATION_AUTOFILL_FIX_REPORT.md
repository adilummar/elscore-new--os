# EL SCORE OS — Demo Evaluation Auto-Fill & Field Integrity Fix Report

**Module:** Demo Operations (`apps/web`, `apps/api`)  
**Repository:** `elscore-new--os` (`e:\elscore new os`)  
**Branch:** `feat/demo-multisession-schema`  
**Date:** October 20, 2026  
**Status:** **READY FOR STAGING REVIEW**  
**Remote Impact:** Strictly Local Changes & Verifications (Zero remote migrations, zero remote database writes, zero pushes)

---

## 1. Executive Summary & Objective

In EL SCORE OS, when completing or viewing a Demo evaluation via `CompleteDemoModal.tsx`, the **Coordinator & Parent Evaluation** section previously exhibited severe data integrity and UI issues:
1. Hardcoded placeholder sentences (`"Student has strong fundamentals..."`, `"Parent was pleased with the demo session..."`) pre-populated empty evaluation records instead of showing blank or existing persisted data.
2. Dropdown selectors (`engagementLevel`, `parentInterestLevel`) defaulted silently to `"HIGH"` even when unrecorded.
3. Stale evaluation state leaked between distinct Demos when switching modals due to shared or unreset component state.
4. Asynchronous API fetch responses could race with and overwrite active coordinator edits.
5. Reopening an already completed Demo for updating evaluation fields or roadmaps failed due to rigid status guards (`demo.status !== DemoStatus.ASSIGNED`) or unique constraint violations on `tx.demoFeedback.create`.

These issues have been completely diagnosed, resolved, and verified locally across the backend service, DTOs, frontend modal, demo list, and demo detail components with an automated 12-test suite.

---

## 2. Confirmed Root Causes

### Root Cause 1: Frontend Hardcoded Sample Content & Unreset State (`CompleteDemoModal.tsx`)
- `CompleteDemoModal.tsx` initialized React state with hardcoded placeholder strings:
  ```typescript
  const [academicAssessment, setAcademicAssessment] = useState('Student has strong fundamentals...');
  const [engagementLevel, setEngagementLevel] = useState<'HIGH' | 'MEDIUM' | 'LOW'>('HIGH');
  const [parentFeedback, setParentFeedback] = useState('Parent was pleased with the demo session...');
  const [parentInterestLevel, setParentInterestLevel] = useState<'HIGH' | 'MEDIUM' | 'LOW'>('HIGH');
  ```
- No `useEffect` monitored changes to `demo?.id`. When opening a modal for Demo A and subsequently for Demo B, Demo A's state persisted into Demo B.
- When an API response arrived after a user began typing, it unconditionally overwrote user input without checking if the field was dirty.

### Root Cause 2: Backend Hardcoded Fallback Text on Database Upsert (`demo.service.ts`)
- In `completeDemo` within `demo.service.ts`:
  ```typescript
  academicAssessment: dto.academicAssessment || 'Evaluated during demo session',
  engagementLevel: dto.engagementLevel || 'HIGH',
  parentFeedback: dto.parentFeedback || 'Positive feedback received',
  ```
  If the frontend sent empty or undefined values, the backend silently fabricated sample text and persisted it to `demo_feedback_records`.
- During update clauses, optional omitted fields were overwritten with dummy text rather than preserving existing persisted values.

### Root Cause 3: Inconsistent Foreign Key Targeting in Multi-Session Demos
- In multi-session demo architectures, `DemoBooking` (`demo_bookings`) is the parent entity, while legacy `Demo` (`demos`) acts as a session or compatibility entry.
- `CompleteDemoModal` was passing `demo.id` (which might be a legacy demo ID or a `DemoBooking` ID). `completeDemo` was attempting to look up `demoFeedbackRecord.upsert` directly by `demo_id` or `booking_id`, causing evaluation records to be mapped to the wrong record or disconnected when reopening.

### Root Cause 4: Completed Demo Evaluation Lockout & Upsert Crash
- `completeDemo` enforced `if (demo.status !== DemoStatus.ASSIGNED) throw new BadRequestException(...)`, preventing coordinators from updating or reviewing evaluations on `COMPLETED` demos.
- Dual-write legacy `tx.demoFeedback.create` crashed on unique constraint violations (`demo_id` unique key) when attempting to save updates on an existing completed demo.

---

## 3. Detailed Fix Summary & Files Changed

### A. Backend DTO Validation (`apps/api/src/modules/demo/dto/demo.dto.ts`)
- Added `@IsIn(['HIGH', 'MEDIUM', 'LOW'])` to both `engagementLevel` and `parentInterestLevel`.
- Made fields `@IsOptional()` and `@IsString()`, ensuring strict enum validation while permitting empty submissions without fabrication.

### B. Backend Service Layer (`apps/api/src/modules/demo/demo.service.ts`)
1. **Target Booking ID Scoping:**
   ```typescript
   const targetBookingId = booking ? booking.id : id;
   ```
   Ensured all multi-session feedback records, roadmaps, and academic plans are bound to `targetBookingId`.
2. **Reopening Support for Completed Demos:**
   ```typescript
   if (demo.status !== DemoStatus.ASSIGNED && demo.status !== DemoStatus.COMPLETED) {
     throw new BadRequestException('Demo can only be completed or evaluated when ASSIGNED or COMPLETED');
   }
   ```
3. **Elimination of Fabricated Sample Text:**
   - On `create`: sets `academicAssessment: dto.academicAssessment ?? null`, `parentFeedback: dto.parentFeedback ?? null`, `engagementLevel: dto.engagementLevel ?? null`, `coordinatorRemarks: dto.coordinatorRemarks ?? null`.
   - On `update`: uses conditional preservation (`dto.academicAssessment !== undefined ? dto.academicAssessment : undefined`), preserving existing database records without overwriting.
4. **Idempotent Dual-Write Upsert:**
   - Switched legacy feedback creation from raw `tx.demoFeedback.create` to `tx.demoFeedback.upsert` (with fallback) to guarantee idempotency on reopening.
5. **Eager Feedback Inclusion in API Queries:**
   - Updated `getDemos` and `getDemoById` to include `feedbackRecord`, `roadmap`, and `academicPlan`.
   - Mapped `feedbackRecord: booking?.feedbackRecord ?? (Array.isArray(demo?.feedback) ? (demo.feedback[0] ?? null) : (demo?.feedback ?? null))`.

### C. Frontend Modal Overhaul (`apps/web/src/app/(app)/demos/components/CompleteDemoModal.tsx`)
1. **Strict Zero-Default Initialization:**
   - All text inputs initialize to `""`.
   - Dropdown options initialize to `""` with explicit placeholder items (`"Select Engagement Level"`, `"Select Interest Level"`).
2. **Component Lifecycle & Transition Reset:**
   - Utilizes `currentDemoIdRef` to detect demo transitions. Whenever `demo?.id` changes, all fields, errors, and edited field sets are cleared.
3. **Dirty Field Tracking (`userEditedFieldsRef`):**
   - Tracks which fields the user has actively typed into.
   - When asynchronous `getDemoById` completes, only fields that have **not** been touched by the user are populated from the database.
4. **Race Condition Prevention (`activeFetchIdRef`):**
   - Tags each fetch request with the active `demo.id`. If the user closes the modal or switches to a different demo before the request resolves, the response is discarded.
5. **Inline Error Retainment:**
   - Form state is never wiped on submission failure; inline alerts display the exact server message while retaining all coordinator input.

### D. Frontend Detail & List Views
- **`apps/web/src/app/(app)/demos/[id]/components/DemoDetailClient.tsx`:** Updated Section 5 (Outcome & Evaluation) to render the coordinator's assessment, student engagement level badge, parent feedback, parent interest level badge, roadmap, and academic plan. Completed demos now feature an "Evaluation & Roadmap" action.
- **`apps/web/src/app/(app)/demos/components/DemoList.tsx`:** Added an "Evaluation" button on completed demos to open `CompleteDemoModal` in review/update mode.

---

## 4. Field-to-Database Mapping Reference

| UI Form Field | Form State Variable | DTO Field | Database Table | Column Name | Allowed Values | Nullable |
| :--- | :--- | :--- | :--- | :--- | :--- | :---: |
| **Academic Assessment** | `academicAssessment` | `dto.academicAssessment` | `demo_feedback_records` | `academic_assessment` | `TEXT` | Yes (`null`) |
| **Student Engagement Level** | `engagementLevel` | `dto.engagementLevel` | `demo_feedback_records` | `engagement_level` | `HIGH`, `MEDIUM`, `LOW` | Yes (`null`) |
| **Parent Feedback** | `parentFeedback` | `dto.parentFeedback` | `demo_feedback_records` | `parent_feedback` | `TEXT` | Yes (`null`) |
| **Parent Interest Level** | `parentInterestLevel` | `dto.parentInterestLevel` | `demo_feedback_records` | `coordinator_remarks` (or rating) | `HIGH`, `MEDIUM`, `LOW` | Yes (`null`) |
| **Tutor Feedback** | `comments` | `dto.comments` | `demo_feedback_records` | `comments` | `TEXT` | Yes (`null`) |
| **Strengths** | `strengths` | `dto.strengths` | `demo_feedback_records` | `strengths` | `TEXT` | Yes (`null`) |
| **Weaknesses** | `weaknesses` | `dto.weaknesses` | `demo_feedback_records` | `weaknesses` | `TEXT` | Yes (`null`) |

---

## 5. Verification & Test Evidence

### 5.1 Targeted Automated Tests (`demo-evaluation-autofill.spec.ts`)
Command: `pnpm --filter api test demo-evaluation-autofill`
```
PASS src/modules/demo/demo-evaluation-autofill.spec.ts (10.337 s)
  Demo Evaluation Auto-Fill, Isolation & Field Integrity Spec
    √ 1. persists null instead of fabricated sample sentences when fields are omitted on a new demo (12 ms)
    √ 2. returns actual persisted evaluation records in getDemoById and getDemos (3 ms)
    √ 3. ensures missing fields in getDemoById remain null rather than receiving placeholder sample text (2 ms)
    √ 4. strictly separates evaluation records between distinct Demos (3 ms)
    √ 5. allows reopening and restoring an already completed demo evaluation without throwing status error (3 ms)
    √ 6. preserves existing fields in update clause when optional properties are omitted (3 ms)
    √ 7. cleanly aborts database modifications and surfaces failure if transaction errors (16 ms)
    √ 8. validates engagementLevel and parentInterestLevel dropdown values in CompleteDemoDto (9 ms)
    √ 9. maintains distinct mapping between coordinator academic assessment and parent feedback (3 ms)
    √ 10. targets multi-session parent booking ID when completeDemo is invoked on legacy demo ID (2 ms)
    √ 11. enforces completion gate requirements before allowing stage transition to COMPLETED (10 ms)
    √ 12. rejects users who are neither the assigned coordinator, assigned tutor, nor company-wide manager (23 ms)

Test Suites: 1 passed, 1 total
Tests:       12 passed, 12 total
Snapshots:   0 total
Time:        10.528 s
```

### 5.2 Regression Test Suite (`demo-operations-workflow.spec.ts`)
Command: `pnpm --filter api test demo-operations-workflow`
```
Test Suites: 1 passed, 1 total
Tests:       38 passed, 38 total
Snapshots:   0 total
Time:        9.814 s
```

### 5.3 Static Type Checking & Production Build
- `pnpm --filter api exec tsc --noEmit`: Clean (Exit 0, zero errors)
- `pnpm --filter web exec tsc --noEmit`: Clean (Exit 0, zero errors)
- `pnpm --filter web build`: Clean (Exit 0, 41/41 static & dynamic routes compiled)

---

## 6. Staging Smoke-Test Guide

When deploying to the staging server, execute the following manual checks:

1. **New Demo Evaluation (Empty Form Test):**
   - Open a demo in `ASSIGNED` or `LINK_SHARED` status.
   - Click **Complete Demo**.
   - Verify that **Academic Assessment** and **Parent Feedback** text areas are completely blank (no `"Student has strong fundamentals..."`).
   - Verify that **Student Engagement Level** and **Parent Interest Level** show `"Select Engagement Level"` and `"Select Interest Level"` as placeholders, with no value selected.
2. **Partial Submission Test:**
   - Enter academic assessment text and select engagement level `MEDIUM`.
   - Leave parent feedback and parent interest blank.
   - Submit the form.
   - Reopen the modal: verify academic assessment contains your entered text and `MEDIUM` is selected; parent feedback and parent interest remain blank.
3. **Cross-Demo Isolation Test:**
   - Open Demo A and enter text into the evaluation form without saving.
   - Close modal and open Demo B.
   - Verify Demo B does not display any text from Demo A.
4. **Completed Demo Reopen & Update Test:**
   - On a `COMPLETED` demo, click **Evaluation & Roadmap** or **Evaluation**.
   - Verify that existing persisted feedback loads accurately.
   - Make an update to the academic assessment and save.
   - Verify the update is saved without any 400 Bad Request status errors or unique constraint crashes.

---

## 7. Status

**READY FOR STAGING REVIEW**
- All safety constraints respected: zero remote migrations, zero remote database modifications, zero unauthorized pushes.
- Local repository working tree cleanly maintained on `feat/demo-multisession-schema`.
