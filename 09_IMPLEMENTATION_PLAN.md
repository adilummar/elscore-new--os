# EL SCORE OS --- Implementation Plan

## Phase 0 --- Repository foundation

Deliver:

-   repository/monorepo
-   TypeScript configuration if selected
-   environment configuration
-   linting/formatting
-   CI
-   Docker/dev environment
-   database connection
-   migration framework
-   test framework
-   logging
-   error handling
-   API conventions
-   basic authentication boundary

Do not build business modules yet.

## Phase 1 --- Identity & authorization

Deliver:

-   users
-   employees
-   departments
-   roles
-   permissions
-   user-role assignment
-   authorization middleware/guards
-   field-level privacy policy framework
-   audit foundation

Acceptance: A test user can only access records/actions permitted by
role and scope.

## Phase 2 --- Student + Parent foundation

Deliver:

-   Student
-   Parent
-   StudentParent
-   business ID generation
-   global search foundation
-   history

Acceptance: One Student can be referenced across modules without
duplication.

## Phase 3 --- Marketing + Sales

Deliver:

-   leads
-   lead source/campaign
-   assignment
-   Round Robin
-   activities
-   follow-ups
-   Sales dashboard
-   targets
-   direct/referral lead rules

Acceptance: A Marketing lead can become owned by Sales without
duplicating the lead.

## Phase 4 --- Demo

Deliver:

-   demos
-   Demo Coordinator Round Robin
-   Demo workflow
-   Demo Report
-   Sales visibility

Acceptance: A student can have multiple Demo IDs.

## Phase 5 --- Admission + Academic Handover

Deliver:

-   admission
-   package
-   initial payment record
-   handover
-   academic queue

Acceptance: Handover can happen before payment verification.

## Phase 6 --- Academic

Deliver:

-   mentors
-   tutors
-   subjects
-   grades
-   curricula
-   Mentor Round Robin
-   tutor assignment
-   timetable

## Phase 7 --- Classes + Progress

Deliver:

-   class scheduling
-   tutor update
-   checklists
-   mentor verification
-   12-hour tutor rule
-   student hour consumption
-   academic progress

Acceptance: Verified class correctly affects hours and payroll
eligibility.

## Phase 8 --- Finance

Deliver:

-   payments
-   verification
-   packages
-   hour ledger
-   renewals
-   expenses
-   payroll
-   finance dashboards/reports

Acceptance: Financial truth is not independently editable by Academic.

## Phase 9 --- Workday + Tasks + Meetings + Calendar

Deliver:

-   schedules
-   workday
-   breaks
-   leave
-   system-generated work items
-   assigned tasks
-   meetings
-   meeting tasks
-   calendar
-   manager monitoring

## Phase 10 --- Notifications + reporting

Deliver:

-   actionable notifications
-   unified reports
-   filters
-   role-aware report access
-   exports where approved

## Phase 11 --- Hardening

Deliver:

-   security review
-   authorization tests
-   concurrency tests
-   performance testing
-   audit verification
-   backup/restore testing
-   monitoring
-   production deployment
-   disaster recovery runbook

## Development rule

Build vertical slices and validate them end-to-end before expanding.

Do not generate the entire application in one AI prompt.
