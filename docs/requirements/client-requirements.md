# EL SCORE OS V1.0 --- Client Requirements Digest

This document is a structured digest of the uploaded 50-page client
requirements PDF. The original PDF remains the primary source if wording
needs verification.

## Purpose

El Score OS is the internal operating system of El Score Academy.

It coordinates: Lead → Sales → Demo → Admission → Academic → Classes →
Progress → Renewal → Finance → Staff/Payroll.

Core principle: Enter information once. Automatically update every place
where that information is required according to role permissions.

Every important record must maintain its complete history.

## Roles

Administration: - CEO - Operations Manager

Marketing: - Marketing Head - Performance Marketer - Designer

Sales: - Sales Head - Sales Counsellor

Academics: - Academic Head - Mentor - Demo Coordinator - Tutor

Finance: - Finance Head - Accountant

HR: - HR Manager - HR Executive - HR Assistant

## Access

Access is role-based, not simply department-based.

Each role receives appropriate: - dashboard - records - actions -
reports - filters

Users should not see unnecessary information.

## Required human-readable IDs

EMP-0001 LED-0001 STU-0001 TUT-0001 DEM-0001 ADM-0001 PAY-0001 CLS-0001
REN-0001 MTG-0001

UUIDs may be used internally.

## Parent privacy

Parent contact information is visible to: - Sales - Demo Coordinator -
Mentor

Not visible to: - Tutor - HR - Marketing after Sales ownership - other
employees unless specifically authorized

Tutors do not contact parents directly through the system.

## Sales

Marketing-originated leads enter through Marketing and become owned by
Sales after handover.

Sales Head: - all Sales leads - assignment/reassignment - Round Robin -
counsellor eligibility - workload/pipeline - targets - reports -
operational actions

Sales Counsellor: - assigned leads - contact/call/WhatsApp -
communication logs - qualification - follow-ups - demo booking -
relevant student/parent updates - close sale - initial payment
collection - Academic handover

Counsellor cannot: - reassign leads - manage Round Robin - manage other
counsellors' leads - manage departmental reports - override terminal
stages

Marketing-originated leads use Round Robin. Direct/referral leads can be
manually added by authorized Sales users and become owned by that
counsellor.

## Sales targets

Targets are configurable. Revenue achievement connects to Finance.
Referral admissions may be excluded from normal Counsellor target
according to company policy.

## Demo

Multiple Demo Coordinators are supported. Demo Coordinators use Round
Robin.

A Demo can be created from Sales, for an existing student/parent, and
again for the same student when another demo is requested.

Demo Report includes: - Demo ID - Student ID - Demo Tutor - Demo
Coordinator - status - tutor feedback - coordinator feedback -
strengths - weaknesses - parent concerns - academic assessment -
roadmap - recommended class count - frequency - duration - timing -
remarks

## Admission and payment

Sales closes admission. Sales creates the initial package. Sales
collects initial payment.

Payment does not have to be completed before classes begin.

If parent confirms classes should start: - Academic can receive
student - classes can begin - maximum 3 classes before required initial
payment - one class = one hour

System must show: - payment status - allowed unpaid classes - classes
conducted - remaining allowed unpaid classes

## Academic handover

Payment completion is not required for handover.

Handover includes relevant existing: - student information - parent
information required by Academic - curriculum - grade - subjects - Sales
requirements - Demo reports - tutor recommendation -
strengths/weaknesses - parent concerns - roadmap - package information -
initial payment status

No duplicate Student creation.

## Academic

Academic Head: - mentors - tutors - demo coordinators - student
assignment - Mentor Round Robin - Tutor assignment - Demo Coordinator
Round Robin - academic operations - reports - exceptions - approvals

Mentor: - student coordination - timetable - tutor assignment - subject
coordination - class monitoring - checklists - academic remarks -
progress - parent-facing academic reporting - renewal - paid-hour
monitoring

Mentor Round Robin supports multiple mentors and workload visibility.

## Timetable

Mentor creates timetable.

Supports: - monthly - weekly recurring where required - day - time -
subject - tutor - duration

Default duration 60 minutes. Supported range 30--120 minutes.

## Tutor

Tutor assignment considers academic requirements and demo
recommendation.

Tutor operational status: - Active: ongoing assigned student/class -
Inactive: no ongoing assigned student

This is separate from HR employment status.

Tutor sees only assigned teaching information.

## Classes

Workflow: Scheduled Class → Tutor conducts → Tutor checklist/post-class
update → Mentor verifies/updates → student hours deducted → Finance
receives verified information → tutor salary calculated from valid
record

If Tutor fails to submit within 12 hours: - student hours can still be
deducted if Mentor verifies - tutor receives no salary for that hour

Tutor and Mentor each complete required checklist when performing their
action.

## Student hours

Academic can see: - purchased hours - verified paid hours - used hours -
remaining hours

Hours are deducted from completed/verified class records.

Finance is the financial source of truth for paid hours.

## Academic progress

Records can include: - chapter - topic - strengths - weaknesses -
difficult areas - homework/worksheet - worksheet usage - games -
practice - post-class activities - student response - improvement -
attention areas - remarks

Support chapter-wise tracking, model exams, exam performance and
continuous progress.

Parent reports should be generated from actual stored history.

## Renewal

Renewal is a transaction against the same Student Profile.

Flow: Remaining hours decrease → renewal required → Mentor requests
renewal → Mentor manages renewal → payment recorded → Finance updated →
new hours added to same Student

After handover, renewal belongs to Academic/Mentor.

## Finance

Finance is the financial source of truth.

Finance manages: - tuition income - initial collections - renewals -
other income - expenses - salaries - tutor payroll - staff payroll -
payments - revenue reports - verification - packages - outstanding
amounts - reports

Tutor salary: valid completed class × applicable tutor hourly rate

Rates can vary by grade, subject, tutor and student-specific
arrangement. Student-specific rate overrides normal rate where
applicable.

## HR

HR Manager: - employee records - HR profiles - salary information -
remarks - employment status - staff records - tutor hiring oversight -
HR approvals

HR Executive: - tutor recruitment - recruitment stages - subjects -
curriculum/syllabus - grades - hourly rates - salary rates - tutor
profile - tutor account/login credentials

HR Assistant: - limited assigned HR work

Tutor profile includes HR/academic/operational fields and
class/salary-related history.

## Employee Workday & Accountability

Shared system for all employees connecting: - schedules - working days -
working hours - leave - login/logout - work mode - responsibilities -
assigned tasks - actual completed work

Work schedule includes: - working days - weekly off - start/end - break
duration - work mode - leave policy - role - department

Start Work records employee/date/start/scheduled start/work
mode/department/role.

Today's work should be generated from existing departmental records.

System tasks include: - follow-up - demo - class update - class
verification - renewal - recruitment - meeting - other system
responsibilities

Assigned tasks contain: - task - description - assigned by - responsible
employee - assigned date - due date - priority - status - completion
info - remarks

Task states: - Not Started - In Progress - Completed - Blocked

Workday states: - Scheduled - Not Started - Working - On Break -
Completed - Leave - Absent

Breaks record start/end/duration/allowance/excess.

End Work summary includes: - scheduled time - actual time - break time -
tasks completed/pending - critical pending - department-specific
completion/pending

Pending work can require a reason: - continue tomorrow - waiting for
another person - blocked - not required - other

Late arrival and early departure are derived by comparing schedule with
actual work.

Heads/leads monitor their team. CEO has organization-wide visibility.
Operations Manager has organization-wide operational monitoring.

Actual departmental work is the primary productivity measure, not only
login duration.

Workday history must be retained.

Workday connects with: - My Tasks - Calendar - Meetings - Sales - Demo -
Academic - HR - Marketing - Finance - Operations

## Marketing

Marketing records lead generation information. Performance Marketer
handles campaigns/lead generation. Designer handles assigned design
work. Marketing can see relevant Sales-stage outcomes but not modify
Sales-owned pipeline data after ownership.

## Operations

Operations Manager coordinates exceptions such as: - unassigned leads -
overdue follow-ups - demo actions - paid students awaiting assignment -
students without mentor/tutor - missing class updates - pending
verification - renewal issues - other operational exceptions

Operations coordinates departments without taking ownership of their
authoritative data.

## Meetings

Shared meeting capability.

Meeting fields: - ID - title - type - department - organizer - date -
start/end - location/link - participants - purpose - agenda -
discussion - decisions - tasks - responsible person - due date - task
status - attachments - history

Types: - Department Meeting - Team Meeting - One-to-One - Management
Meeting - Review Meeting - Other

Meeting creates tasks for responsible employees.

## My Tasks

Shared tasks may originate from: - meetings - department heads -
operations - HR - Sales - Academic - Marketing - authorized managers

Employees see their own tasks. Managers see tasks according to
authority.

## Calendar

Simple internal calendar combining relevant: - meetings - follow-ups -
demos - classes - tasks

## Reports

One Reports system with relevant filters.

Required report families: - Sales - Academic - Demo - Finance - HR -
Marketing - Operations

## Audit/history

Important records retain history including: - creation - assignment -
reassignment - status change - demo - payment - admission - handover -
mentor/tutor assignment - class completion - verification - renewal -
profile changes - meeting decisions/tasks

Inactive records remain available through history/archive.

## Global search

Authorized search by: - Student ID - Tutor ID - Lead ID - Demo ID -
Admission ID - Payment ID - Employee ID - permitted parent information

## Notifications

Action-based: - overdue follow-up - demo follow-up - mentor assignment -
tutor assignment - missing class update - pending verification -
renewal - meeting invitation - meeting task - overdue task

Notifications should navigate to the relevant action.

## Final ownership flow

MARKETING → LEAD → SALES → DEMO REQUEST → ACADEMICS / DEMO COORDINATOR →
DEMO REPORT → SALES → SALE + INITIAL PAYMENT COLLECTION → ACADEMICS →
MENTOR → TUTOR + TIMETABLE → CLASSES → ACADEMIC PROGRESS → FINANCE →
HOURS / PAYMENT / SALARY → MENTOR → RENEWAL → FINANCE
