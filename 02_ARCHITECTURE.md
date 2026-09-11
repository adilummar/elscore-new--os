# EL SCORE OS --- System Architecture

## Architectural style

Recommended V1 architecture:

**Modular monolith + asynchronous domain events + relational database**

This is a recommendation, not an explicit client requirement.

The system should have strong logical domain boundaries without
prematurely introducing many independently deployed microservices.

## Logical layers

``` text
Web UI
  ↓
API / Application Layer
  ↓
Domain Modules
  ↓
Persistence / Repositories
  ↓
PostgreSQL

Cross-cutting:
Identity & RBAC
Audit
Notifications
Tasks
Calendar
Search
Reporting
Event processing
File attachments
```

## Domain modules

1.  Identity & Access
2.  Organization
3.  Marketing
4.  Sales
5.  Student/Parent
6.  Demo
7.  Admission
8.  Academic
9.  Scheduling
10. Classes
11. Academic Progress
12. Packages & Hours
13. Renewal
14. Finance
15. HR
16. Workday
17. Tasks
18. Meetings
19. Calendar
20. Notifications
21. Reporting
22. Audit/History
23. Global Search

## Important architectural distinction

The UI is role-oriented, but the domain model is shared.

Do not create separate copies such as:

-   SalesStudent
-   AcademicStudent
-   FinanceStudent

Use one Student record with controlled views.

## Data ownership

A fact should have one authoritative owner.

Example:

``` text
Finance owns payment verification.
Sales consumes payment status.
Academic consumes payment status.
```

Do not allow multiple modules to independently mutate authoritative
financial state.

## Cross-domain integration

Prefer domain events for important asynchronous propagation.

Examples:

-   LeadAssigned
-   DemoBooked
-   DemoCompleted
-   AdmissionClosed
-   PaymentRecorded
-   PaymentVerified
-   AcademicHandoverCompleted
-   MentorAssigned
-   TutorAssigned
-   ClassCompleted
-   ClassVerified
-   RenewalRequested
-   RenewalPaymentVerified
-   MeetingTaskAssigned
-   TaskCompleted

Use transactional consistency for operations that must be atomic. Use
asynchronous processing for notifications, projections, non-critical
workday updates, and similar side effects.

## Audit

Important business changes must produce auditable history.

Audit records should include at least:

-   actor
-   timestamp
-   entity type
-   entity ID
-   action
-   old value where applicable
-   new value where applicable
-   reason where applicable
-   metadata/correlation ID where useful

## Search

Global search should resolve authorized records by business IDs and
permitted parent information.

Search must respect authorization. A user must not discover a record
through search that they cannot otherwise access.

## Reporting

Use one reporting capability with role-aware report definitions and
relevant filters.

Do not create a separate reporting architecture for every department.
