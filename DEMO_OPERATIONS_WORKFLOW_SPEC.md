# EL SCORE OS — Demo Operations Workflow Specification & Architecture Blueprint

**Module:** Demo Operations  
**Branch:** `feat/demo-multisession-schema`  
**Target Environment:** Local Verified / Staging (`200.234.39.163`)  
**Document Version:** 1.1.0 (Implementation Verified Baseline)  
**Status:** Pre-Deployment Audit & Gap Closure Complete — Verified Locally

---

## 1. Executive Summary & Objective

This document establishes the architecture specification, data model design, role-based access control (RBAC) matrix, state transition rules, and implementation roadmap to redesign the existing Demo module into an end-to-end, stage-driven **Demo Operations Workflow**.

### Core Business Objectives
1. **Clear Division of Responsibilities:**
   - **Sales Counsellors:** Identify and qualify `INTERESTED` leads, initiate bookings, monitor the "Ready for Sales" confirmation queue, execute parent outreach via WhatsApp click-to-open, and record meeting confirmations.
   - **Demo Coordinators:** Assigned via fair, atomic round-robin rotation; prepare student class briefing notes ("How to take the class"), assign verified tutors to all sessions, generate and validate meeting links, manage operational rescheduling, and record completion/feedback.
   - **Demo Head:** Complete company-wide operational visibility, coordinator workload rebalancing, stage ageing and bottleneck monitoring, tutor assignment turnaround analytics, and outcome reporting.
2. **Deterministic Stage Progression:**
   Replace the monolithic `SCHEDULED`/`ASSIGNED`/`COMPLETED` status with a nine-stage operational funnel (`VALID_DEMO`, `PREPARATION`, `TUTOR_ASSIGNED`, `LINK_SHARED`, `PARENT_CONFIRMATION`, `COMPLETED`, `NOT_SHOW`, `CANCELLED`, `RESCHEDULED`), while preserving underlying calendar scheduling, session conflict detection, and multi-session completion gates.
3. **Safety & Zero-Regression Invariants:**
   - Strict adherence to the `INTERESTED` lead eligibility prerequisite.
   - Non-destructive, additive schema migrations preserving existing multi-session architecture (`DemoBooking`, `DemoSession`, `DemoSessionTutorAssignment`, `DemoAttendance`, `DemoRoadmap`, `DemoAcademicPlan`).
   - Lead lifecycle protection: prevent regression of downstream `NEGOTIATION`, `ENROLLED`, or `PAID` statuses.
   - Zero hardcoded fallback assignments to the CEO.

---

## 2. Current Implementation Inventory

### 2.1 Database Entities & Models (`apps/api/prisma/schema.prisma`)

| Model | Table Name | Purpose | Current Key Fields & Enums |
| :--- | :--- | :--- | :--- |
| `DemoBooking` | `demo_bookings` | Parent multi-session booking | `id`, `businessId` (e.g. `DMO-0014`), `studentId`, `leadId`, `coordinatorId`, `bookedByUserId`, `status` (`DemoBookingStatus`), `scheduledDate`, `totalDurationMin`, `legacyDemoId`, `cancelledAt`, `cancelReason` |
| `DemoSession` | `demo_sessions` | Individual subject sessions within a booking | `id`, `bookingId`, `sessionOrder`, `requirementId`, `subjectId`, `curriculumId`, `gradeId`, `status` (`DemoSessionStatus`), `scheduledStart`, `scheduledEnd`, `durationMinutes` |
| `DemoSessionTutorAssignment` | `demo_session_tutor_assignments` | Session tutor assignment history | `id`, `sessionId`, `tutorId`, `assignmentSequence`, `status` (`TutorAssignmentStatus`: `ACTIVE`, `REPLACED`, `CANCELLED`), `assignedAt`, `assignedByUserId`, `replacedAt`, `replacementReason`, `replacedByUserId` |
| `DemoSessionException` | `demo_session_exceptions` | Exceptions to session execution | `id`, `sessionId`, `exceptionCategory` (`WAIVER`, `REPLACEMENT_SCHEDULED`, `PARENT_DECLINED_SUBJECT`), `resolutionStatus` (`PENDING`, `APPROVED`, `REJECTED`), `reason`, `requestedByUserId`, `reviewedByUserId` |
| `DemoAttendance` | `demo_attendances` | Scoped attendance records | `id`, `bookingId`, `sessionId`, `assignmentId`, `participantType` (`PARENT`, `COORDINATOR`, `TUTOR`), `userId`, `status` (`PRESENT`, `ABSENT`, `LATE`), `isCorrected`, `correctionReason` |
| `DemoFeedbackRecord` | `demo_feedback_records` | Multi-perspective post-demo feedback | `id`, `bookingId`, `rating`, `comments`, `studentPerformance`, `strengths`, `weaknesses`, `tutorRecommendations`, `tutorRating`, `academicAssessment`, `engagementLevel`, `learningBehaviour`, `coordinatorRemarks`, `parentFeedback` |
| `DemoRoadmap` | `demo_roadmaps` | Post-demo commercial recommendation | `id`, `bookingId`, `recommendationPlan`, `recommendedClassCount`, `recommendedFrequency`, `preferredDurationMin`, `preferredTiming`, `recommendedSubjects`, `remarks` |
| `DemoAcademicPlan` | `demo_academic_plans` | Post-demo pedagogical roadmap | `id`, `bookingId`, `learningGoal`, `targetChapters`, `studyApproach`, `milestones` |
| `DemoBookingRescheduleHistory` | `demo_booking_reschedule_history` | Audit trail of booking reschedules | `id`, `bookingId`, `previousDate`, `newDate`, `reason`, `rescheduledByUserId`, `rescheduledAt` |
| `RoundRobinCoordinatorState` | `round_robin_coordinator_state` | Coordinator rotation metadata | `userId`, `isEligible`, `dailyState` (`ACTIVE`, `INACTIVE_HALF_DAY`, `INACTIVE_FULL_DAY`), `currentLoad`, `lastReturnedAt`, `updatedAt` |
| `Demo` (Legacy) | `demos` | Backward-compatibility dual-write table | `id`, `businessId`, `studentId`, `requirementId`, `tutorId`, `status` (`DemoStatus`), `scheduledAt`, `durationMinutes`, `bookedByUserId` |

### 2.2 Existing Business Logic & Safeguards (`demo.service.ts` & `demo-multisession.service.ts`)

1. **Lead Status Guard:**
   `lead.status === LeadStatus.INTERESTED` is strictly verified prior to booking. Non-`INTERESTED` leads trigger `BadRequestException`.
2. **Lead Ownership Check:**
   Sales Counsellors can only book demos for leads assigned to them (`lead.assignedToUserId === user.id`), unless holding `demo.manage_team` or `demo.manage_all`.
3. **Session Time Validation & Sequence:**
   `scheduledStart < scheduledEnd`, duration matching, and intra-booking session non-overlap are enforced via `DemoMultiSessionService.validateMultiSessionStructure()`.
4. **External Overlap Check:**
   Student and Tutor calendar conflicts are checked across active bookings (`status IN [SCHEDULED, ASSIGNED, IN_PROGRESS]`).
5. **Authoritative Completion Gate:**
   Completion requires 100% satisfaction of:
   - Parent booking-level attendance recorded.
   - Coordinator booking-level attendance recorded.
   - All sessions `COMPLETED` with valid tutor attendance, or an approved exception of category `WAIVER` or `PARENT_DECLINED_SUBJECT`.
   - Safeguard: `REPLACEMENT_SCHEDULED` exception explicitly blocks completion until the replacement session executes.
   - Detailed `DemoFeedbackRecord`, `DemoRoadmap`, and `DemoAcademicPlan` present.
6. **Lead Progression on Completion:**
   Automatically updates lead status to `DEMO_COMPLETED`, strictly bypassing leads in `NEGOTIATION`, `ENROLLED`, or `PAID`.

---

## 3. Booking-Level vs. Session-Level Architecture Model

A core architectural flaw in naive workflow implementations is attempting to collapse operational progression, scheduling state, and session-level tutor assignments into a single status field. 

To maintain mathematical consistency and prevent state corruption in multi-session bookings, the workflow decouples **Temporal Scheduling State**, **Session Execution State**, and **Operational Workflow Stage**:

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                                     DEMO BOOKING                                       │
│                                                                                        │
│  [Temporal Scheduling State]   SCHEDULED | IN_PROGRESS | COMPLETED | NO_SHOW | CANCELLED│
│                                                                                        │
│  [Operational Stage]           VALID_DEMO ──> PREPARATION ──> TUTOR_ASSIGNED           │
│                                    │                                  │                │
│                                    ▼                                  ▼                │
│                                CANCELLED                       LINK_SHARED             │
│                                    ▲                                  │                │
│                                    │                                  ▼                │
│                                 NOT_SHOW <── COMPLETED <── PARENT_CONFIRMATION         │
│                                                                                        │
│  [Assigned Coordinator]        Round-robin assigned Demo Coordinator                   │
│  [Meeting Link & Platform]     Primary link: https://meet.google.com/xyz...            │
│  [Parent Confirmation]         Confirmed: YES/NO, Actor, Timestamp, Channel           │
└──────────────────────────────────────────────────┬─────────────────────────────────────┘
                                                   │ 1..*
                                                   ▼
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                                     DEMO SESSIONS                                      │
│                                                                                        │
│  Session 1 (Math):    SCHEDULED ──> ASSIGNED ──> COMPLETED (Tutor: Dr. Tariq)          │
│  Session 2 (Physics): SCHEDULED ──> ASSIGNED ──> COMPLETED (Tutor: Ms. Priya)         │
│                                                                                        │
│  [Session Status]     SCHEDULED | ASSIGNED | IN_PROGRESS | COMPLETED | NO_SHOW | ...   │
│  [Tutor Assignment]   Sequence history with active pointer: ACTIVE, REPLACED           │
│  [Exceptions/Waivers] WAIVER | REPLACEMENT_SCHEDULED | PARENT_DECLINED_SUBJECT         │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

### Decoupled State Invariants
1. **`operationalStage` (Booking Level):** Represents the business pipeline state of the operational file. It drives coordinator queues, Sales Counsellor confirmation tasks, and management KPIs.
2. **`status` (Booking & Session Level):** Preserves the physical scheduling lifecycle (`SCHEDULED`, `ASSIGNED`, `IN_PROGRESS`, `COMPLETED`, `NO_SHOW`, `CANCELLED`). Calendar views, calendar overlap checks, and historical queries continue reading `status` with 100% backward compatibility.
3. **Session Aggregation Rule:**
   - A booking cannot enter `TUTOR_ASSIGNED` until **100% of its active sessions** have an assigned active tutor.
   - A booking cannot enter `COMPLETED` until **100% of its active sessions** satisfy the authoritative completion gate.

---

## 4. Proposed Workflow & Transition Matrix

The table below defines the formal state machine, operational stages, required actors, prerequisite gates, and automated side effects:

| Stage | Business Meaning | Allowed Actors | Entry Gate / Validation | Trigger Action | Automated Side Effects |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **1. `VALID_DEMO`** | Demo booking created by Sales for an `INTERESTED` lead. | `SALES_COUNSELLOR`, `SALES_HEAD`, `DEMO_HEAD`, `CEO` | • Lead is `INTERESTED`<br>• Valid student & requirements<br>• Non-overlapping session schedule | `bookDemo()` endpoint | • Lead transitions to `DEMO_BOOKED`<br>• Round-robin coordinator assigned atomically<br>• Booking initialized to `operationalStage = VALID_DEMO`<br>• If coordinator pool empty, flags `unassigned_coordinator` |
| **2. `PREPARATION`** | Coordinator reviews student academic context and drafts class briefing. | `DEMO_COORDINATOR` (assigned), `DEMO_HEAD`, `DEMO_ADMIN`, `CEO` | • Booking is in `VALID_DEMO` or returned from `RESCHEDULED`<br>• Actor is assigned coordinator or supervisor | Coordinator clicks "Start Preparation" or submits instructions | • `operationalStage = PREPARATION`<br>• Preparation draft saved<br>• Audit event `DEMO_PREPARATION_STARTED` |
| **3. `TUTOR_ASSIGNED`** | Verified tutors assigned to all required subject sessions. | `DEMO_COORDINATOR` (assigned), `DEMO_HEAD`, `DEMO_ADMIN`, `CEO` | • Preparation instructions validated (non-empty, minimum length)<br>• Tutor eligible for subject/grade/curriculum<br>• Zero tutor schedule conflicts | `assignTutor()` on all active sessions | • When all active sessions have active tutors, booking transitions automatically to `TUTOR_ASSIGNED`<br>• Scheduling status updates to `ASSIGNED`<br>• Tutor notifications queued |
| **4. `LINK_SHARED`** | Meeting link recorded and verified by Coordinator. | `DEMO_COORDINATOR` (assigned), `DEMO_HEAD`, `DEMO_ADMIN`, `CEO` | • Booking is in `TUTOR_ASSIGNED`<br>• Link passes syntax & domain whitelist (Google Meet, Zoom, Teams)<br>• Meeting platform specified | `recordMeetingLink()` endpoint | • `operationalStage = LINK_SHARED`<br>• Link version and actor recorded<br>• Demo immediately appears in Sales-owned "Ready for Sales" queue<br>• Confirmation status initialized to `PENDING` |
| **5. `PARENT_CONFIRMATION`** | Sales Counsellor contacts parent and confirms meeting attendance. | `SALES_COUNSELLOR` (lead owner), `SALES_HEAD`, `DEMO_HEAD`, `CEO` | • Booking is in `LINK_SHARED`<br>• Actor is lead owner or Sales supervisor | Counsellor clicks "Confirm Meeting" after parent contact | • `operationalStage = PARENT_CONFIRMATION`<br>• Records confirmation actor, timestamp, and channel<br>• Demo cleared from "Ready for Sales" queue |
| **6. `COMPLETED`** | Authoritative completion workflow executed after class delivery. | `DEMO_COORDINATOR`, `TUTOR` (own session), `DEMO_HEAD`, `CEO` | • Authoritative completion gate passes (attendances, feedback, roadmap, academic plan, all sessions completed or waived) | `completeDemo()` endpoint | • `operationalStage = COMPLETED`<br>• Booking and session statuses set to `COMPLETED`<br>• Lead transitions to `DEMO_COMPLETED` (protected from regression) |
| **7. `NOT_SHOW`** | Student, parent, or tutor failed to attend the scheduled class. | `DEMO_COORDINATOR`, `TUTOR`, `DEMO_HEAD`, `CEO` | • Scheduled class start time has passed<br>• Mandatory reason & participant attribution provided | `markNoShow()` endpoint | • `operationalStage = NOT_SHOW`<br>• Scheduling status set to `NO_SHOW`<br>• Generates reschedule prompt for Sales/Coordinator |
| **8. `CANCELLED`** | Demo cancelled before or during execution. | Coordinator, Lead Owner (if scheduled), Sales Head, Demo Head, CEO | • Demo is not in a terminal state<br>• Mandatory cancellation reason provided | `cancelDemo()` endpoint | • `operationalStage = CANCELLED`<br>• Scheduling status set to `CANCELLED`<br>• Tutors and parents notified |
| **9. `RESCHEDULED`** | Date/time of demo modified due to parent/tutor/internal request. | Coordinator, Lead Owner, Sales Head, Demo Head, CEO | • Future date/time provided<br>• Mandatory reschedule reason<br>• Overlap checks verified | `rescheduleDemo()` endpoint | • Previous schedule archived in `demo_booking_reschedule_history`<br>• **Workflow Resume Logic:**<br>  - If tutor has conflict: reverts to `TUTOR_ASSIGNED`<br>  - If tutor available: reverts to `LINK_SHARED` (or `PREPARATION` if instructions need updating)<br>  - Parent confirmation reset to `PENDING` (must re-confirm new time) |

---

## 5. Existing-to-Proposed Status Mapping & Backfill Strategy

To ensure zero downtime, non-destructive migration, and deterministic historical analytics, the table below maps existing database states to the proposed dual-state model:

| Existing `DemoBookingStatus` | Existing Data Attributes | Proposed `operationalStage` | Proposed `status` (Scheduling) | Rationale & Backfill Logic |
| :--- | :--- | :--- | :--- | :--- |
| `COMPLETED` | Any | `COMPLETED` | `COMPLETED` | Authoritatively closed and delivered demo. |
| `NO_SHOW` | Any | `NOT_SHOW` | `NO_SHOW` | Terminal no-show outcome. |
| `CANCELLED` | Any | `CANCELLED` | `CANCELLED` | Terminal cancellation outcome. |
| `ASSIGNED` | Meeting link populated & parent confirmed | `PARENT_CONFIRMATION` | `ASSIGNED` | All operational prep complete, meeting confirmed. |
| `ASSIGNED` | Meeting link populated, parent unconfirmed | `LINK_SHARED` | `ASSIGNED` | Link recorded, waiting for Sales parent confirmation. |
| `ASSIGNED` | No meeting link, tutor assigned | `TUTOR_ASSIGNED` | `ASSIGNED` | Tutors assigned, waiting for coordinator to issue meeting link. |
| `SCHEDULED` | Coordinator assigned, preparation notes present | `PREPARATION` | `SCHEDULED` | Coordinator working on class instructions. |
| `SCHEDULED` | Fresh booking, no tutor assigned | `VALID_DEMO` | `SCHEDULED` | Initial booking created by Sales. |

---

## 6. Role-Based Access Control (RBAC) Matrix

The table defines permissions across all participating system roles. Backend endpoints must enforce these rules strictly via `RbacGuard` and actor context checks:

| Functional Capability | Required Permission Code | Sales Counsellor | Demo Coordinator | Demo Head | Demo Admin | Sales Head | CEO / Admin | Academic Head / Ops Mgr |
| :--- | :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **Book Demo** | `demo.book` | ✅ (Own leads) | ❌ | ✅ | ✅ | ✅ (Team leads) | ✅ | ❌ |
| **View Demos (Scope)** | `demo.read` / `demo.read_all` | Own Leads | Assigned Demos | Company-Wide | Company-Wide | Team Leads | Company-Wide | Company-Wide |
| **View Ready for Sales Queue** | `demo.sales_queue.read` | ✅ (Own leads) | ❌ | ✅ | ✅ | ✅ (Team leads) | ✅ | ❌ |
| **Start/Save Preparation** | `demo.prepare` | ❌ | ✅ (Assigned) | ✅ | ✅ | ❌ | ✅ | ❌ |
| **Assign / Reassign Tutor** | `demo.assign_tutor` | ❌ | ✅ (Assigned) | ✅ | ✅ | ❌ | ✅ | ❌ |
| **Record / Update Meeting Link**| `demo.share_link` | ❌ | ✅ (Assigned) | ✅ | ✅ | ❌ | ✅ | ❌ |
| **Open WhatsApp Outreach** | `demo.whatsapp.open` | ✅ (Own leads) | ❌ | ✅ | ✅ | ✅ (Team leads) | ✅ | ❌ |
| **Confirm Meeting with Parent** | `demo.confirm_parent` | ✅ (Own leads) | ❌ | ✅ | ✅ | ✅ (Team leads) | ✅ | ❌ |
| **Reassign Coordinator** | `demo.reassign_coordinator`| ❌ | ❌ | ✅ | ✅ | ❌ | ✅ | ❌ |
| **Reschedule Demo** | `demo.reschedule` | ✅ (If SCHEDULED) | ✅ (Assigned) | ✅ | ✅ | ✅ | ✅ | ❌ |
| **Cancel Demo** | `demo.cancel` | ✅ (If SCHEDULED) | ✅ (Assigned) | ✅ | ✅ | ✅ | ✅ | ❌ |
| **Mark No-Show** | `demo.mark_exceptions` | ❌ | ✅ (Assigned) | ✅ | ✅ | ❌ | ✅ | ❌ |
| **Approve Session Exception** | `demo.approve_exception` | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ |
| **Complete Demo** | `demo.complete` | ❌ | ✅ (Assigned) | ✅ | ✅ | ❌ | ✅ | ❌ |
| **Company-Wide Reports** | `demo.reports.company` | ❌ | ❌ | ✅ | ❌ | ❌ | ✅ | ❌ |
| **Operational Reports** | `demo.reports.operational`| ❌ | ❌ | ✅ | ✅ | ✅ (Sales metrics)| ✅ | ❌ |

---

## 7. Round-Robin Coordinator Assignment Engine

### 7.1 Architecture & Concurrency Control
1. **Atomic Rotation Mechanism:**
   Coordinator rotation state is managed atomically within the booking database transaction.
2. **Eligibility Predicate:**
   A Demo Coordinator is eligible for automated assignment if and only if:
   - `user.status === 'ACTIVE'`
   - `roundRobinCoordinatorState.isEligible === true`
   - `roundRobinCoordinatorState.dailyState === 'ACTIVE'`
   - Coordinator does not have an active full-day leave recorded in attendance.
3. **Selection Algorithm (Least-Loaded with Secondary Rotation):**
   ```sql
   SELECT "user_id", "current_load", "last_returned_at"
   FROM "round_robin_coordinator_state"
   JOIN "users" ON "users"."id" = "round_robin_coordinator_state"."user_id"
   WHERE "round_robin_coordinator_state"."is_eligible" = true
     AND "round_robin_coordinator_state"."daily_state" = 'ACTIVE'
     AND "users"."status" = 'ACTIVE'
   ORDER BY "current_load" ASC, "last_returned_at" ASC
   LIMIT 1
   FOR UPDATE;
   ```
4. **Load Accounting & State Update:**
   Upon selection:
   - `coordinatorId` is assigned to the `DemoBooking`.
   - `currentLoad` is incremented by 1.
   - `lastReturnedAt` is updated to `CURRENT_TIMESTAMP`.
   - An audit record `COORDINATOR_ROUND_ROBIN_ASSIGNED` is recorded.
5. **Handling Empty Coordinator Pools (Safe Fallback):**
   - If no coordinator is currently active and eligible:
     - The booking is created with `coordinatorId = NULL`.
     - The booking is flagged as `unassigned_coordinator = true`.
     - The demo is placed in the **"Unassigned Demos"** priority queue.
     - An internal high-priority alert is dispatched to `DEMO_HEAD` and `DEMO_ADMIN`.
     - **CRITICAL SAFEGUARD:** The system **never silently assigns work to the CEO** as a fallback.

---

## 8. Data Model & Schema Impact (Additive Migration)

The proposed schema changes are purely additive. No existing columns are renamed or dropped.

```prisma
// ─── NEW ENUM ────────────────────────────────────────────────────────────────
enum DemoOperationalStage {
  VALID_DEMO
  PREPARATION
  TUTOR_ASSIGNED
  LINK_SHARED
  PARENT_CONFIRMATION
  COMPLETED
  NOT_SHOW
  CANCELLED
  RESCHEDULED
}

enum ParentConfirmationChannel {
  WHATSAPP_CHAT
  PHONE_CALL
  EMAIL
  OTHER
}

// ─── ADDITIONS TO DemoBooking ────────────────────────────────────────────────
model DemoBooking {
  // Existing fields preserved...
  
  // ── Operational Workflow Additions ──
  operationalStage        DemoOperationalStage      @default(VALID_DEMO) @map("operational_stage")
  
  // Preparation Tracking
  preparationNotes        String?                   @db.Text @map("preparation_notes")
  preparationCompletedAt  DateTime?                 @map("preparation_completed_at")
  preparedByUserId        String?                   @map("prepared_by_user_id")
  preparedByUser          User?                     @relation("PreparedDemos", fields: [preparedByUserId], references: [id])

  // Meeting Link Tracking
  meetingLink             String?                   @map("meeting_link")
  meetingPlatform         String?                   @map("meeting_platform") // Google Meet, Zoom, MS Teams
  meetingPasscode         String?                   @map("meeting_passcode")
  linkSharedAt            DateTime?                 @map("link_shared_at")
  linkSharedByUserId      String?                   @map("link_shared_by_user_id")
  linkSharedByUser        User?                     @relation("LinkSharedDemos", fields: [linkSharedByUserId], references: [id])
  
  // Parent Confirmation Tracking
  parentConfirmedAt       DateTime?                 @map("parent_confirmed_at")
  parentConfirmedByUserId String?                   @map("parent_confirmed_by_user_id")
  parentConfirmedByUser   User?                     @relation("ParentConfirmedDemos", fields: [parentConfirmedByUserId], references: [id])
  confirmationChannel     ParentConfirmationChannel? @map("confirmation_channel")
  confirmationNotes       String?                   @db.Text @map("confirmation_notes")
  
  // WhatsApp Outreach Tracking (Click-to-Open)
  whatsappOpenedAt        DateTime?                 @map("whatsapp_opened_at")
  whatsappOpenedByUserId  String?                   @map("whatsapp_opened_by_user_id")
  whatsappOpenedByUser    User?                     @relation("WhatsappOutreachDemos", fields: [whatsappOpenedByUserId], references: [id])

  // Relations & Audit
  meetingLinkHistory      DemoMeetingLinkHistory[]

  @@index([operationalStage])
  @@index([coordinatorId, operationalStage])
  @@index([bookedByUserId, operationalStage])
}

// ─── NEW AUDIT TABLE: DemoMeetingLinkHistory ─────────────────────────────────
model DemoMeetingLinkHistory {
  id                String       @id @default(uuid())
  bookingId         String       @map("booking_id")
  meetingLink       String       @map("meeting_link")
  meetingPlatform   String?      @map("meeting_platform")
  versionNumber     Int          @default(1) @map("version_number")
  reason            String?      @db.Text
  sharedByUserId    String       @map("shared_by_user_id")
  createdAt         DateTime     @default(now()) @map("created_at")

  booking           DemoBooking  @relation(fields: [bookingId], references: [id], onDelete: Cascade)
  sharedByUser      User         @relation(fields: [sharedByUserId], references: [id])

  @@index([bookingId])
  @@map("demo_meeting_link_history")
}
```

---

## 9. API Endpoint Inventory

The following REST endpoints extend `DemoController` (`apps/api/src/modules/demo/demo.controller.ts`):

```
POST   /api/v1/demos                            -> Create demo booking (Sales) [Stage: VALID_DEMO]
GET    /api/v1/demos/operations/workspace       -> Operations Hub (Filtered by 9 stages, queues, & actors)
GET    /api/v1/demos/operations/ready-for-sales -> "Ready for Sales" queue for Sales Counsellors
PATCH  /api/v1/demos/:id/preparation            -> Save/Submit "How to take class" preparation
PATCH  /api/v1/demos/:id/assign                 -> Assign tutor to sessions (Coordinator) [Auto-advances to TUTOR_ASSIGNED]
PATCH  /api/v1/demos/:id/meeting-link           -> Record & validate meeting link [Auto-advances to LINK_SHARED]
POST   /api/v1/demos/:id/whatsapp-outreach      -> Record WhatsApp click-to-open event
PATCH  /api/v1/demos/:id/confirm-meeting        -> Confirm parent meeting (Sales) [Advances to PARENT_CONFIRMATION]
PATCH  /api/v1/demos/:id/reassign-coordinator   -> Manual coordinator reassignment (Demo Head / Admin)
PATCH  /api/v1/demos/:id/reschedule             -> Reschedule booking and recalculate resume stage
PATCH  /api/v1/demos/:id/cancel                 -> Cancel demo with reason
PATCH  /api/v1/demos/:id/no-show                -> Mark no-show outcome
PATCH  /api/v1/demos/:id/complete               -> Execute completion gate, attendances, roadmap, feedback
GET    /api/v1/demos/reports/operations         -> Demo Head reporting & analytics
```

---

## 10. UI Screen Inventory & User Experience

```
┌──────────────────────────────────────────────────────────────────────────────────────────────────┐
│  EL SCORE OS — DEMO OPERATIONS WORKSPACE                                                         │
│                                                                                                  │
│  [Stages Ribbon]                                                                                 │
│  (1) Valid Demo (4)  ──>  (2) Prep (3)  ──>  (3) Tutor Assigned (2)  ──>  (4) Link Shared (5)   │
│                                                                                │                 │
│  (6) Completed (18)  <──  (5) Parent Confirmed (12) <──────────────────────────┘                 │
│  [Other: Not Show (1) | Cancelled (2) | Rescheduled (1)]                                         │
├──────────────────────────────────────────────────────────────────────────────────────────────────┤
│  [Queue Selector]                                                                                │
│  [ All Operations ]   [ ★ Ready for Sales (5) ]   [ Unassigned (1) ]   [ Overdue Prep (2) ]       │
├──────────────────────────────────────────────────────────────────────────────────────────────────┤
│  Filters: [ Coordinator: All ▾ ]  [ Counsellor: Rahul ▾ ]  [ Subject: Math ▾ ]  [ Date: Today ▾ ]│
│                                                                                                  │
│  TABLE:                                                                                          │
│  Student / Booking    Stage                Coordinator     Tutor / Sessions    Sales / Actions   │
│  ──────────────────   ──────────────────   ───────────     ────────────────    ───────────────   │
│  Tariq Al-Mansoor     LINK_SHARED          Sarah Jenkins   Dr. Tariq (Math)    Rahul Sharma      │
│  DMO-0014             (Age: 2.1h)                          Ms. Priya (Physics) [💬 WA] [Confirm] │
│                                                                                                  │
│  Amina Al-Sayed       PREPARATION          Sarah Jenkins   Unassigned          Sneha Roy         │
│  DMO-0015             (Age: 0.5h)                          (Awaiting Tutor)    [Open Prep Sheet] │
└──────────────────────────────────────────────────────────────────────────────────────────────────┘
```

### Key UI Features
1. **Interactive Stage Filter Ribbon:**
   Nine stage pills showing real-time counts, ageing warnings, and click-to-filter capability (matching the new Leads pipeline UI standard).
2. **"Ready for Sales" Dedicated Queue:**
   Sales Counsellors have a one-click tab showing all their leads in `LINK_SHARED`.
   - **WhatsApp Action:** Opens `https://wa.me/<parentPhone>?text=<encodedTemplate>` in a new tab; asynchronously records `DEMO_WHATSAPP_OPENED`.
   - **Confirm Meeting Button:** Opens a modal to record confirmation channel (`Phone Call`, `WhatsApp Chat`) and notes; immediately transitions demo to `PARENT_CONFIRMATION`.
3. **Coordinator "Class Preparation" Drawer/Modal:**
   Allows the coordinator to record teacher briefing, student strengths/challenges, target learning points, and platform instructions before assigning a tutor.
4. **Meeting Link Modal:**
   Validates URL pattern (Google Meet, Zoom, MS Teams), stores platform and passcode, and triggers audit history.

---

## 11. Operational Reporting Definitions & Formulas

All reports are strictly scoped by user role (Demo Head / CEO = Company-wide; Sales Head = Sales Team; Coordinator = Assigned Demos):

1. **Stage Distribution & Funnel Conversion:**
   $$\text{Conversion Rate} = \frac{\text{Demos Entering COMPLETED in Period}}{\text{Demos Entering VALID\_DEMO in Period}} \times 100$$
2. **Stage Ageing (Turnaround Time):**
   $$\bar{T}_{\text{stage}} = \frac{1}{N} \sum_{i=1}^{N} (t_{\text{stage\_exit}} - t_{\text{stage\_entry}})$$
   - Identifies stalled bottlenecks (e.g. demos stuck in `PREPARATION` $> 4\text{ hours}$ or `TUTOR_ASSIGNED` awaiting link $> 2\text{ hours}$).
3. **Time to Tutor Assignment:**
   $$T_{\text{assign}} = t_{\text{first\_tutor\_assigned}} - t_{\text{booking\_created}}$$
4. **Parent Confirmation Rate:**
   $$\text{Confirmation Rate} = \frac{\text{Demos Entering PARENT\_CONFIRMATION}}{\text{Demos Entering LINK\_SHARED}} \times 100$$
5. **Show vs. No-Show Rate:**
   $$\text{Show Rate} = \frac{\text{COMPLETED Demos}}{\text{COMPLETED Demos} + \text{NOT\_SHOW Demos}} \times 100$$
6. **Coordinator Workload Balance:**
   Ratio of active demos per coordinator to detect load imbalances.

---

## 12. Migration, Backfill & Rollback Strategy

### 12.1 Non-Destructive Additive Migration
1. Deploy schema migration adding nullable `operationalStage` and operational metadata fields.
2. The default value for newly created records is `VALID_DEMO`.

### 12.2 Deterministic Backfill Logic
A stand-alone backfill script (`scratch/backfill-demo-operational-stages.js`) will run preflight verification on all existing records:
- If `status === 'COMPLETED'` $\rightarrow$ `operationalStage = 'COMPLETED'`
- If `status === 'NO_SHOW'` $\rightarrow$ `operationalStage = 'NOT_SHOW'`
- If `status === 'CANCELLED'` $\rightarrow$ `operationalStage = 'CANCELLED'`
- If `status === 'ASSIGNED'` and `meetingLink IS NOT NULL` $\rightarrow$ `operationalStage = 'LINK_SHARED'`
- If `status === 'ASSIGNED'` $\rightarrow$ `operationalStage = 'TUTOR_ASSIGNED'`
- If `status === 'SCHEDULED'` $\rightarrow$ `operationalStage = 'VALID_DEMO'`

### 12.3 Rollback Plan
Because all new columns are nullable or have defaults, any code rollback immediately functions against the database without running reverse schema migrations.

---

## 13. Automated Test Matrix (Verification Plan)

| Test Category | Test File | Scenarios Verified |
| :--- | :--- | :--- |
| **Stage Transitions** | `demo-operations-workflow.spec.ts` | 1. Booking initializes to `VALID_DEMO`<br>2. Transition into `PREPARATION` requires valid inputs<br>3. `TUTOR_ASSIGNED` requires all sessions assigned<br>4. Meeting link validation and versioning<br>5. WhatsApp outreach action and parent confirmation<br>6. Authoritative completion gate enforcement<br>7. Reschedule state reset and resume logic |
| **Round-Robin** | `demo-coordinator-round-robin.spec.ts` | 1. Even distribution across active coordinators<br>2. Concurrency lock under parallel bookings<br>3. Inactive/leave coordinator skipping<br>4. Graceful handling of empty coordinator pool (unassigned queue)<br>5. Explicit reassignment and load rebalancing |
| **RBAC Security** | `demo-operations-rbac.spec.ts` | 1. Sales Counsellor blocked from editing preparation or assigning tutors<br>2. Coordinator blocked from accessing another coordinator's records<br>3. Demo Head company-wide visibility<br>4. Non-regression of downstream lead statuses (`NEGOTIATION`, `ENROLLED`, `PAID`) |

---

## 14. Open Business Questions & Material Ambiguities (Action Required)

Before proceeding with code changes, the following business policy questions require stakeholder alignment:

1. **WhatsApp Messaging Template:**
   *What is the exact approved copy for the WhatsApp confirmation message?*  
   *Current Plan:* We will configure a flexible template string with placeholders (`{ParentName}`, `{StudentName}`, `{Subject}`, `{DateTime}`, `{MeetingLink}`) so it can be updated in settings without code deployment.
2. **Multi-Session Meeting Links:**
   *If a student has two sessions booked on different dates or with different tutors, can each session have a separate meeting link, or does one link always cover the entire booking?*  
   *Current Plan:* Primary link at the booking level with optional session-level link overrides.
3. **Reschedule Resume Stage Policy:**
   *When a demo is rescheduled, if the previously assigned tutor remains available with no schedule conflict, should the workflow resume at `LINK_SHARED` (keeping the tutor) or restart at `PREPARATION`?*  
   *Current Plan:* Keep the tutor if no conflict occurs, require new/confirmed meeting link, and reset parent confirmation to unconfirmed.
4. **No-Show Follow-Up Lifecycle:**
   *When a demo is marked `NOT_SHOW`, does it stay permanently in `NOT_SHOW`, or should the Sales Counsellor be able to click "Reschedule No-Show" directly to give the student a second chance?*
5. **Coordinator Reassignment Authority:**
   *Can a Sales Head reassign a Demo Coordinator, or is coordinator assignment strictly managed by Demo Head and Demo Admin?*  
   *Current Plan:* Restrict coordinator reassignment to Demo Head, Demo Admin, and CEO to prevent inter-departmental conflicts.

---

## 15. Phased Implementation Plan

| Phase | Description | Deliverables |
| :--- | :--- | :--- |
| **Phase 1: Architecture & Planning** *(Current)* | Deep inspection, inventory, specification, and safety bounds. | `DEMO_OPERATIONS_WORKFLOW_SPEC.md` |
| **Phase 2: Additive Schema & Migration** | Add `DemoOperationalStage`, operational fields, meeting link history, and backfill script. | Prisma schema migration, backfill script, schema tests. |
| **Phase 3: Service Layer & State Transitions** | Implement preparation, link recording, WhatsApp outreach, parent confirmation, and coordinator round-robin in `demo.service.ts`. | Backend methods, DTOs, unit & integration tests. |
| **Phase 4: Sales-Owned Confirmation Queue** | Implement "Ready for Sales" queue and WhatsApp click-to-open workflow. | API route, sales queue client, test cases. |
| **Phase 5: Operations UI & Stage Ribbon** | Build the enhanced Demo Operations workspace with 9-stage ribbon and detail modals. | Web components, drawer modals, stage filters. |
| **Phase 6: Reporting & Demo Head Dashboard** | Stage turnaround metrics, ageing indicators, and outcome KPIs. | Analytics service endpoints, CEO/Demo Head view. |
| **Phase 7: Verification & Staging Deployment** | Comprehensive test execution, build, migration dry-run, and deployment to `200.234.39.163`. | Deployment report & live acceptance. |
