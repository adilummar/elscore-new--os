# EL SCORE OS --- Project Context

## Source of truth

The client requirements document is the business source of truth for V1.

The system must coordinate:

Marketing → Lead → Sales → Demo → Admission → Academic → Classes →
Progress → Renewal → Finance → Staff/Payroll.

Core principle:

> Enter information once. Automatically update every place where that
> information is required, according to role permissions.

Every important record must maintain complete history.

## Organization

Departments:

1.  Administration
2.  Marketing
3.  Sales
4.  Academics
5.  Finance
6.  HR

Roles:

-   CEO
-   Operations Manager
-   Marketing Head
-   Performance Marketer
-   Designer
-   Sales Head
-   Sales Counsellor
-   Academic Head
-   Mentor
-   Demo Coordinator
-   Tutor
-   Finance Head
-   Accountant
-   HR Manager
-   HR Executive
-   HR Assistant

## Scale target

V1 must support at least:

-   2,000 active students
-   Multiple mentors
-   Multiple tutors
-   Multiple demo coordinators
-   Multiple sales counsellors
-   Large class, payment, academic, payroll, meeting/task histories

## Important identity rules

Use internal UUIDs for database relationships and human-readable
business IDs for users.

Required formats:

-   Employee: EMP-0001
-   Lead: LED-0001
-   Student: STU-0001
-   Tutor: TUT-0001
-   Demo: DEM-0001
-   Admission: ADM-0001
-   Payment: PAY-0001
-   Class: CLS-0001
-   Renewal: REN-0001
-   Meeting: MTG-0001

## Ownership principle

Each department owns its authoritative information. Other departments
receive controlled visibility without taking ownership.

Examples:

-   Sales owns sales relationship/pipeline.
-   Demo Coordinator/Academics owns Demo.
-   Finance owns financial verification and financial truth.
-   Mentor/Academics owns academic coordination.
-   Tutor owns teaching records.
-   Academics owns the student academic record.
-   HR owns employee records.
-   HR Executive owns tutor recruitment.
-   Operations owns operational coordination.
-   Authorized organizers/Operations own meetings.

## Key privacy rule

Parent phone/contact information is visible to:

-   Sales
-   Demo Coordinator
-   Mentor

It is not visible to:

-   Tutor
-   HR
-   Marketing after Sales ownership
-   Other employees unless specifically authorized

Authorization must be enforced server-side.

## Core lifecycle

Marketing Lead → Sales Assignment → Sales Qualification → Demo Booking →
Demo Coordination → Demo Completed → Sales Follow-up → Admission Closed
→ Initial Payment → Academic Handover → Mentor Assignment → Tutor
Assignment → Timetable → Classes → Continuous Academic Progress → Hours
Consumption → Renewal → Continued Classes

Important exception:

Classes may begin after admission confirmation and before initial
payment, but no more than 3 classes may be conducted before the required
initial payment is collected.
