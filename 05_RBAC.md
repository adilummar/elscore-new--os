# EL SCORE OS --- RBAC & Data Access Blueprint

## Authorization model

Use layered authorization:

1.  Authentication
2.  Role
3.  Permission/action
4.  Record scope
5.  Field-level data policy

Do not depend only on department membership.

## Core role scopes

### CEO

Organization-wide visibility according to permissions.

### Operations Manager

Organization-wide operational monitoring, meetings, tasks, bottlenecks
and exceptions, without taking ownership of departmental authoritative
data.

### Sales Head

All Sales leads, assignments, reassignment, Round Robin, counsellor
performance, targets, reports and operational Sales actions.

### Sales Counsellor

Only assigned leads and relevant student/demo/admission/payment actions.

Cannot: - reassign leads - manage Round Robin - manage other
counsellors' leads - manage departmental reports - override terminal
stages

### Academic Head

Academic-wide operations including mentors, tutors, demo coordinators,
assignments, Round Robin, academic reports and exceptions.

### Mentor

Assigned students and academic coordination, timetable, tutor assignment
where permitted, class verification, progress, parent-facing academic
reporting, renewals.

### Tutor

Execution-only access: - assigned students - today's classes -
timetable - subject - academic information required for teaching -
checklist/instructions - relevant remarks

Tutor must not see: - parent phone number - finance information -
irrelevant Sales information - other students - other tutors - HR
information - department-wide data

### Finance Head

Full Finance domain according to permissions.

### Accountant

Finance actions assigned by policy.

### HR Manager

Full HR access.

### HR Executive

Tutor recruitment/profile/account creation and hiring responsibilities.

### HR Assistant

Only HR work assigned by authorized HR personnel.

### Marketing

Lead generation/source and assigned marketing work. Marketing may see
relevant Sales stage information for performance tracking but must not
modify Sales-owned pipeline data after ownership transfer.

## Field-level privacy

Parent contact data must have an explicit policy.

Do not expose restricted fields merely because a user can read the
Student or Parent entity.

## Record scope examples

``` text
Sales Counsellor → Lead.owner_user_id = current_user
Mentor → active mentor assignment for current_user
Tutor → active tutor assignment for current_user
Department Head → employee.department_id = current_user.department
CEO → organization-wide according to explicit permission
```

## Permission naming

Recommended convention:

``` text
resource.action
lead.read
lead.update
lead.assign
lead.reassign
demo.read
demo.create
demo.update
demo.complete
student.read
student.update
class.read
class.update
class.verify
payment.read
payment.create
payment.verify
employee.read
employee.update
task.create
task.assign
meeting.create
meeting.manage
report.view
audit.view
```

Add record-scope checks separately.

## Security requirements

-   Never trust client-provided ownership IDs.
-   Re-check authorization on every protected API mutation.
-   Filter query results server-side.
-   Do not send restricted fields and hide them only with CSS/frontend
    logic.
-   Audit privileged actions.
-   Protect bulk endpoints as carefully as single-record endpoints.
