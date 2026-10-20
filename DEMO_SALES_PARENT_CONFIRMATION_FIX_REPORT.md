# EL SCORE OS — Demo Link-Shared Handoff, Dynamic WhatsApp Template & Role-Based Parent Confirmation Report

**Module:** Demo Operations  
**Repository:** `elscore-new--os`  
**Active Branch:** `feat/demo-multisession-schema`  
**Execution Mode:** Local Implementation & Verification Only  
**Remote / Deployment Actions:** Strictly None (Zero commits, zero pushes, zero remote migrations, zero remote service restarts)  
**Verification Status:** **READY FOR STAGING REVIEW**

---

## 1. Root Cause Analysis

In previous iterations, the demo lifecycle was managed primarily from the Demo Coordinator's perspective, leading to the following operational discrepancies:
1. **Misassigned Action Availability:**
   At the `LINK_SHARED` stage, parent confirmation actions (`Confirm Parent`) were displayed indiscriminately in the Demo detail view without checking whether the user was the authoritative Sales Counsellor owning the lead.
2. **Missing Sales Outreach Interface:**
   Sales Counsellors had no structured modal or click-to-open WhatsApp handoff with dynamically mapped student, tutor, meeting link, and schedule details, leading to manual or error-prone messaging.
3. **Imprecise Ownership Resolution:**
   Backend and frontend checks relied on loose user context (`bookedByUserId` or current user session) rather than strictly enforcing persisted lead assignment (`lead.assignedToUserId`) as the single source of truth for the owning Sales Counsellor.
4. **Lack of Coordinator Confirmation Display:**
   Prior to confirmation, Coordinator views showed either generic statuses or blank labels instead of an explicit `Awaiting Sales Confirmation` indicator. Upon confirmation, audit details (confirming actor and timestamp) were not surfaced to the Coordinator.
5. **Lead Page Desynchronization:**
   The lead detail page (`/leads/[id]` $\rightarrow$ `DemosTab.tsx`) only displayed raw booking statuses (`SCHEDULED`/`COMPLETED`) without operational stages (`LINK_SHARED`, `PARENT_CONFIRMATION`), confirmation banners, or Sales outreach action buttons.

---

## 2. Files Changed

| Component | Path | Changes Summary |
| :--- | :--- | :--- |
| **Backend Service** | `apps/api/src/modules/demo/demo.service.ts` | 1. Implemented `buildWhatsAppMessage` with parent fallback (`Hello sir,`), multi-session tutor/subject listing, IST timezone with uppercase `IST`, valid link, and coordinator signoff.<br>2. Implemented `validateAndFormatPhone` with minimum 10 digits and Indian `91` country code prefix.<br>3. Implemented `getWhatsAppPreview` endpoint returning formatted copy and `wa.me` URL.<br>4. Hardened `recordWhatsAppOutreach` & `confirmParentMeeting` to strictly authorize persisted lead owner (`lead.assignedToUserId`), allowing only Sales Head/CEO overrides and blocking non-owning counsellors and Coordinators.<br>5. Disambiguated `DEMO_HEAD` (`demo.manage_team`) from `SALES_HEAD` (`roles.has('SALES_HEAD')`).<br>6. Ensured legacy demo stage resolves to `LINK_SHARED` when `meetingLink` exists.<br>7. Added `parentConfirmedByUser` relation selection and mapping in `getDemos`. |
| **Backend Controller** | `apps/api/src/modules/demo/demo.controller.ts` | Added `@Get(':id/whatsapp-preview')` endpoint. |
| **Lead Service** | `apps/api/src/modules/lead/lead.service.ts` | Included `parentConfirmedByUser` relation in both `students.demoBookings` and `lead.demoBookings` queries in `findOne`. |
| **Web Actions** | `apps/web/src/app/(app)/demos/actions.ts` | Added `getWhatsAppPreview(id)` action wrapper. |
| **WhatsApp Preview Modal** | `apps/web/src/app/(app)/demos/components/WhatsAppPreviewModal.tsx` | Created dedicated modal with real-time template preview, copy-to-clipboard, phone validation error display, and external WhatsApp dispatch. |
| **Parent Confirmation Modal** | `apps/web/src/app/(app)/demos/components/ParentConfirmationModal.tsx` | Enhanced modal with demo summary recap, channel selection (`WHATSAPP_CHAT`, `PHONE_CALL`, `EMAIL`, `OTHER`), and notes. |
| **Demo Detail View** | `apps/web/src/app/(app)/demos/[id]/components/DemoDetailClient.tsx` | Restricted WhatsApp and Confirm Parent buttons to `canSalesOutreach`. Added `Awaiting Sales Confirmation` indicator for unconfirmed demos and surfaced `Parent Confirmed` audit details (actor and timestamp). |
| **Demo List / Dashboard** | `apps/web/src/app/(app)/demos/components/DemoList.tsx` | Restricted table actions to `canSalesOutreach`. Updated status badge to show `Awaiting Sales Confirmation` and `Parent Confirmed` with actor tooltip. |
| **Lead Page Demos Tab** | `apps/web/src/app/(app)/leads/[id]/components/DemosTab.tsx` | Added `OperationalStageBadge`, synchronized `Awaiting Sales Confirmation` / `Parent Confirmed` banner, and rendered scoped `WhatsApp` and `Confirm Parent` buttons for the owning Sales Counsellor. |
| **Automated Specs** | `apps/api/src/modules/demo/demo-operations-workflow.spec.ts` | Added tests verifying WhatsApp non-confirmation invariant, cross-counsellor rejection, Demo Head non-impersonation, and legacy Demo accessibility (all 38/38 passing). |
| **Workflow Blueprint** | `DEMO_OPERATIONS_WORKFLOW_SPEC.md` | Updated to v1.2.0 with confirmed business resolutions and implementation verification matrix. |

---

## 3. Role / Action Permission Matrix

| Role | Operational Stage | View WhatsApp Preview / wa.me Link | Send WhatsApp Outreach | Confirm Parent RSVP | View Confirmation State | Update Meeting Link | Complete Demo |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **Owning Sales Counsellor** (`lead.assignedToUserId === user.id`) | `LINK_SHARED` | **ALLOW** | **ALLOW** | **ALLOW** | **ALLOW** (`Awaiting` $\rightarrow$ `Confirmed`) | DENY | DENY (Coordinators only) |
| **Non-Owning Sales Counsellor** | `LINK_SHARED` | **DENY** (`403`) | **DENY** (`403`) | **DENY** (`403`) | **ALLOW** (Scoped View) | DENY | DENY |
| **Demo Coordinator** | `LINK_SHARED` | **DENY** (`403`) | **DENY** (`403`) | **DENY** (`403`) | **ALLOW** (`Awaiting Sales Confirmation`) | **ALLOW** | Gated until Confirmed |
| **Demo Head** | `LINK_SHARED` | **DENY** (`403`) | **DENY** (`403`) | **DENY** (`403`) | **ALLOW** (All Demos) | **ALLOW** | **ALLOW** (Supervisor) |
| **Sales Head** | `LINK_SHARED` | **ALLOW** | **ALLOW** | **ALLOW** | **ALLOW** (All Demos) | DENY | DENY |
| **CEO God View** | `LINK_SHARED` | **ALLOW** | **ALLOW** | **ALLOW** | **ALLOW** (Global) | **ALLOW** | **ALLOW** |

---

## 4. State Transitions & Cross-View Synchronization

### 4.1 Lifecycle Progression
```
[INTERESTED Lead] ──(Sales Books Demo)──> [VALID_DEMO]
                                               │
                                       (Coordinator Adds Prep Notes)
                                               │
                                               ▼
                                         [PREPARATION]
                                               │
                                       (Coordinator Assigns Tutors)
                                               │
                                               ▼
                                        [TUTOR_ASSIGNED]
                                               │
                                       (Coordinator Records Link)
                                               │
                                               ▼
                                         [LINK_SHARED]
                                               │
                 ┌─────────────────────────────┴─────────────────────────────┐
                 │                                                           │
        [Owning Sales View]                                         [Coordinator View]
   - "Ready for Sales" Queue                                   - Assigned Demos Dashboard
   - Actions: [WhatsApp] & [Confirm Parent]                    - Action: [Update Link]
   - Status: "Awaiting Sales Confirmation"                     - Status: "Awaiting Sales Confirmation"
                 │                                                           │
                 ▼                                                           ▼
         (Sales records Parent Confirmation)                          (Refreshes synchronously)
                 │                                                           │
                 └─────────────────────────────┬─────────────────────────────┘
                                               │
                                               ▼
                                     [PARENT_CONFIRMATION]
                                 - Status: "Parent Confirmed"
                                 - Confirmed by: <Sales Counsellor Name>
                                 - Channel: WhatsApp Chat / Call
                                 - Timestamp: Recorded
                                               │
                                     (Tutor conducts demo)
                                     (Attendance, Feedback, Roadmap, Academic Plan)
                                               │
                                               ▼
                                          [COMPLETED]
```

### 4.2 Reschedule Invalidation Invariant
When a demo at `LINK_SHARED` or `PARENT_CONFIRMATION` is rescheduled:
1. `parentConfirmedAt` is reset to `null`.
2. `parentConfirmedByUserId`, `confirmationNotes`, and `confirmationChannel` are cleared.
3. `linkSharedAt` and `linkSharedByUserId` are cleared.
4. `operationalStage` transitions to `RESCHEDULED` with `isRescheduled = true`.
5. The demo requires a new meeting link (`recordMeetingLink`) to re-enter `LINK_SHARED`, presenting fresh confirmation requirements to Sales.

---

## 5. Dynamic WhatsApp Message Template Mapping

### 5.1 Format Specification
```text
Hello [Parent Name | sir],

Greetings from Elscore Academy!

A demo class has been scheduled for *[student's name]*

📚 Subject: [subject]
👩‍🏫 Tutor: [tutor name]
📅 Date: [date in Asia/Kolkata]
⏰ Time: [time in Asia/Kolkata IST]

🔗 Meet Link: [meeting link]

See you there!

Regards,
[coordinator name], Coordinator
Elscore Academy
```

### 5.2 Dynamic Mapping Rules
1. **Parent Greeting:**
   - With parent name: `Hello Mrs. Sharma,`
   - Null / empty: `Hello sir,` (never blank placeholder or trailing space).
2. **Student Name:**
   - Bold formatted: `*[Student Name]*`
3. **Multi-Session Formatting:**
   - **Different Tutors:** Lists each subject and tutor pairing: `📚 Subject: Mathematics, Physics \n 👩‍🏫 Tutor: Dr. Tariq (Mathematics), Ms. Priya (Physics)`
   - **Same Tutor:** Deduplicates tutor name across subjects: `📚 Subject: Mathematics, Physics \n 👩‍🏫 Tutor: Dr. Tariq`
4. **Timezone & Locale:**
   - Formatted in `Asia/Kolkata` with uppercase `IST` suffix (e.g. `11:00 AM IST`).
5. **Meeting Link:**
   - Exact valid URL recorded by Coordinator.
6. **Coordinator Signoff:**
   - First and last name of the assigned coordinator (fallback: `Academic Operations`).
7. **Phone Validation:**
   - Minimum 10 digits required. Valid 10-digit Indian numbers formatted with country prefix `91` (e.g. `919876543210`).
   - If invalid or missing, `isValidPhone = false` and useful validation error displayed; `waNumber = null`.

---

## 6. Verification Results & Test Evidence

### 6.1 Automated Jest Suites
1. **`demo-operations-workflow.spec.ts`**:
   - **Result:** **38 passed, 0 failed** (PASS in 7.589 s).
   - Proved:
     - Owning Sales Counsellor sees and executes WhatsApp preview and confirmation at `LINK_SHARED`.
     - Coordinator blocked on backend from WhatsApp preview, outreach, and confirmation (`403 Forbidden`).
     - Cross-counsellor rejected by backend on preview, outreach, and confirmation (`403 Forbidden`).
     - Opening WhatsApp generates audit log but strictly does NOT set `parentConfirmedAt` or advance stage.
     - Explicit confirmation records channel, notes, actor ID, and timestamp.
     - Rescheduling resets parent confirmation and link sharing.
     - Multi-session WhatsApp message correctly formats distinct tutors and subjects.
     - Legacy Demo records without DemoBooking remain fully accessible and confirmable.
     - Demo Head cannot impersonate Sales owner.
2. **All 9 Demo Test Suites (`apps/api`)**:
   - **Result:** **166 passed, 166 total** (PASS across all 9 test suites).

### 6.2 TypeScript Compilation Checks
- **API:** `pnpm --filter api exec tsc --noEmit` $\rightarrow$ **Clean (Exit code 0, 0 diagnostics)**.
- **Web:** `pnpm --filter web exec tsc --noEmit` $\rightarrow$ **Clean (Exit code 0, 0 diagnostics)**.

### 6.3 Next.js Production Build
- **Web Build:** `pnpm --filter web build` $\rightarrow$ **Clean (Exit code 0, static generation 41/41 routes passed)**.

---

## 7. Remaining Blockers & Staging Smoke Tests

### 7.1 Blockers
- **Zero code, schema, permission, or build blockers.**

### 7.2 Staging Verification Checklist (Upon Authorized Deployment)
1. **Coordinator Flow:**
   - Log in as Demo Coordinator $\rightarrow$ Open Demo at `VALID_DEMO`.
   - Save preparation notes $\rightarrow$ Stage moves to `PREPARATION`.
   - Assign tutor $\rightarrow$ Stage moves to `TUTOR_ASSIGNED`.
   - Add Google Meet link $\rightarrow$ Stage moves to `LINK_SHARED`.
   - Verify: Button for "Confirm Parent" is **NOT** visible. State says **Awaiting Sales Confirmation**.
2. **Sales Flow:**
   - Log in as the assigned Sales Counsellor $\rightarrow$ Open "Ready for Sales" queue or Lead page (`/leads/[id]` $\rightarrow$ Demos tab).
   - Verify: Both **Share on WhatsApp** and **Confirm Parent** buttons are visible.
   - Click **Share on WhatsApp** $\rightarrow$ Verify preview modal renders with real parent name, student name, meet link, and coordinator signoff. Verify phone validation.
   - Click **Confirm Parent** $\rightarrow$ Select `WhatsApp Chat`, enter confirmation notes, and submit.
   - Verify: Demo stage advances to `PARENT_CONFIRMATION`.
3. **Cross-Role View Verification:**
   - Switch back to Coordinator window $\rightarrow$ Refresh.
   - Verify: Indicator updates from `Awaiting Sales Confirmation` to `Parent Confirmed` with Sales actor name and timestamp.
4. **Reschedule Invalidation:**
   - Click Reschedule on confirmed demo $\rightarrow$ Verify status resets to unconfirmed and stage updates to `RESCHEDULED`.

---

## 8. Conclusion

**Verdict:** **READY FOR STAGING REVIEW**  
All workflow requirements, role ownership checks, dynamic WhatsApp message formatting, phone number validation, parent confirmation recording, and UI synchronization between Lead page, Demo detail page, and Coordinator dashboard are locally implemented, thoroughly tested, and verified.
