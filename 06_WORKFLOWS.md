# EL SCORE OS --- Workflow & State Machine Blueprint

## Lead

Recommended states must be reviewed against the client's final business
vocabulary.

Conceptual flow:

NEW → ASSIGNED → CONTACTED → QUALIFIED → DEMO_BOOKED → DEMO_COMPLETED →
FOLLOW_UP / NURTURING → ADMITTED or LOST

Do not add terminal states without business approval.

## Sales Round Robin

Marketing-originated leads:

Lead → eligible counsellor pool → configured Round Robin → owner
assigned

Sales Head controls:

-   eligibility
-   active/inactive
-   order
-   pause/resume
-   manual assignment
-   reassignment
-   queue reset

Direct/referral leads may be manually assigned according to authorized
Sales rules.

## Demo

Sales books Demo → Demo Coordinator assignment → coordination → demo
takes place → complete Demo Report → Sales sees completion → Sales
follow-up

A Student may have multiple Demo records.

## Admission

Sales closes admission → initial package created → initial payment
collected/recorded → academic handover initiated

Payment completion is NOT a prerequisite for handover.

## Unpaid class rule

After admission confirmation:

-   Academic may receive the student.
-   Classes may begin before initial payment.
-   Maximum 3 classes may be conducted before required initial payment
    is collected.
-   One class = one hour.

The enforcement must be server-side.

If the client later approves an exception/override mechanism, implement
it as an explicit authorized action and audit it.

## Academic handover

Sales closes and initiates handover → Academic receives relevant
existing information → Mentor assignment → Tutor assignment → timetable
→ classes

Do not recreate the Student.

## Mentor Round Robin

Academic Head controls:

-   mentor availability
-   active/inactive
-   assignment order
-   pause/resume
-   manual assignment/reassignment

## Tutor assignment

Mentor/Academic can assign tutor based on:

-   subject
-   grade
-   curriculum
-   availability
-   demo recommendation where appropriate
-   approved academic requirements

## Tutor operational status

Operational assignment status is separate from HR employment status.

Example:

Employment = ACTIVE Operational assignment = INACTIVE

means employed but without an ongoing assigned student/class.

## Class

Scheduled → Tutor conducts → Tutor checklist/update → Mentor verifies →
Student hours consumed → Finance receives verified information → Tutor
payroll eligibility calculated

Tutor update deadline: within 12 hours.

If Tutor misses the deadline but Mentor verifies: - student hours may
still be deducted - tutor salary for that hour = 0

## Renewal

Remaining hours approach completion → Mentor requests renewal → renewal
transaction → payment recorded/verified → new hours added → continued
classes

Renewal remains against the same Student.

## Workday

Scheduled → Not Started → Working → On Break → Working → Completed

Alternative statuses include Leave and Absent.

System should derive expected work from schedule and approved leave.

## Leave

Request → approval/rejection

Approved leave: - marks employee Leave - suppresses normal work
expectations - employee is not marked Absent - relevant managers
notified

## Meeting

Created → participants selected → invitation → conducted → discussion →
decisions → tasks assigned → tasks tracked to completion

One meeting may create multiple tasks.

## Task

Not Started → In Progress → Completed

or:

In Progress → Blocked

## Status design rule

Do not use one giant global status field for Student.

Keep independent lifecycle states for: - Sales - Admission - Academic -
Package - Payment - Renewal - Workday - Class
