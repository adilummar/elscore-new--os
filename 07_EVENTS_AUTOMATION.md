# EL SCORE OS --- Events & Automation

## Principle

Automations should update existing records and projections rather than
duplicate business data.

## Candidate domain events

### Sales

-   LeadCreated
-   LeadAssigned
-   LeadReassigned
-   FollowUpCreated
-   FollowUpCompleted
-   DemoBooked
-   AdmissionClosed

### Demo

-   DemoAssigned
-   DemoCompleted
-   DemoReportCompleted

### Academic

-   AcademicHandoverInitiated
-   AcademicHandoverCompleted
-   MentorAssigned
-   TutorAssigned
-   TimetablePublished
-   ClassScheduled
-   ClassCompleted
-   ClassUpdateSubmitted
-   ClassVerificationCompleted
-   AcademicProgressUpdated
-   RenewalRequested

### Finance

-   PaymentRecorded
-   PaymentVerified
-   PaymentRejected
-   HourTransactionCreated
-   RenewalPaymentVerified
-   PayrollEligibilityCalculated

### Workday

-   WorkdayStarted
-   BreakStarted
-   BreakEnded
-   WorkdayEnded
-   LeaveApproved
-   TaskAssigned
-   TaskCompleted
-   MeetingCreated
-   MeetingTaskAssigned

## Required automation examples

### Sales → Demo

Demo booked: - Demo Coordinator receives work item - relevant calendar
item appears - relevant notification generated

### Demo → Sales

Demo completed: - Sales sees Demo Completed - Demo Report becomes
visible according to permission - follow-up can become due

### Sales → Academic

Academic handover: - existing Student becomes visible to Academic -
relevant Sales/Demo information becomes available - Mentor assignment
work is generated

### Sales → Finance

Initial payment: - payment enters Finance - Finance verifies - verified
record becomes financial truth

### Academic → Finance

Verified class: - verified class becomes available to Finance - hours
transaction is recorded according to approved rule - payroll eligibility
is calculated

### Academic → Tutor

Tutor assignment: - tutor sees assigned student/class information

### Class → Student

Verified/completed class: - class history updated - applicable hours
consumed

### Class → Payroll

Eligible completed class: - contributes to tutor salary calculation

### Renewal → Finance

Renewal/payment: - appears in Finance - new hours become available only
according to financial verification rules

### Meeting → Tasks

Meeting task assigned: - appears in My Tasks - appears in Workday -
relevant Calendar representation exists - employee is notified

## Idempotency

Every event handler must be safe against duplicate delivery.

Use: - event IDs - unique constraints - idempotency keys -
processed-event tracking where required

## Failure handling

For asynchronous events:

-   persist the event/outbox record transactionally
-   retry transient failures
-   record failed events
-   avoid silent data loss
-   provide operational visibility for failed processing

## Workday projection rule

System-generated work should reference the source record.

Example:

``` text
Class CLS-0042
  ↓
Workday item references CLS-0042
```

Do not create an independent duplicate class task that can drift from
the source.
