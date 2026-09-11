# EL SCORE OS --- Domain Model Blueprint

## Core entities

### Identity & organization

-   User
-   Role
-   Permission
-   Department
-   Employee
-   EmployeeRole
-   WorkSchedule
-   LeavePolicy
-   LeaveRequest

### Student lifecycle

-   Student
-   Parent
-   StudentParent
-   Lead
-   LeadAssignment
-   LeadActivity
-   FollowUp
-   Demo
-   DemoReport
-   Admission
-   AcademicHandover

### Academic

-   MentorProfile
-   TutorProfile
-   Subject
-   Grade
-   Curriculum
-   Syllabus
-   StudentSubject
-   MentorAssignment
-   TutorAssignment
-   Timetable
-   TimetableOccurrence
-   Class
-   TutorClassUpdate
-   MentorClassVerification
-   AcademicProgress
-   ModelExam
-   ExamResult

### Packages / finance

-   Package
-   PackageItem
-   StudentPackage
-   Payment
-   PaymentAllocation
-   HourLedger / HourTransaction
-   Renewal
-   Expense
-   SalaryRule
-   PayrollPeriod
-   PayrollEntry
-   TutorPayrollEligibility

### Workday / productivity

-   Workday
-   WorkdayBreak
-   Task
-   TaskSource
-   Meeting
-   MeetingParticipant
-   MeetingTask
-   CalendarItem
-   Notification

### Platform

-   AuditEvent
-   Attachment
-   Sequence
-   SavedReport / ReportDefinition if required

## Key relationship rules

### Student

One Student can have:

-   multiple parents
-   multiple lead records where business history requires it
-   multiple demos
-   one or more admissions according to approved business policy
-   multiple package purchases
-   multiple payments
-   multiple mentor assignments over time
-   multiple tutor assignments over time
-   multiple subjects
-   many classes
-   many academic progress records
-   multiple renewals
-   complete history

Renewal must never create a new Student.

### Demo

A Student may have multiple Demo records.

Each Demo has:

-   one Demo Coordinator at a time
-   a Demo Tutor where applicable
-   one Demo Report

### Assignment history

Mentor and Tutor assignments should be modeled as historical assignment
records, not just overwritten foreign keys.

### Classes

A Class references:

-   Student
-   Subject
-   Tutor
-   timetable/occurrence where applicable
-   tutor update
-   mentor verification
-   hour transaction when eligible
-   payroll eligibility when eligible

### Parent privacy

Parent contact fields require field-level authorization.

## Aggregate candidates

Recommended aggregate boundaries for V1:

-   Student aggregate
-   Lead aggregate
-   Demo aggregate
-   Admission aggregate
-   Class aggregate
-   Payment aggregate
-   StudentPackage aggregate
-   Renewal aggregate
-   Employee/Workday aggregate
-   Meeting aggregate
-   Task aggregate

Do not treat every database table as a separate domain aggregate.

## History

Use explicit transactional history where business meaning matters:

-   assignments
-   statuses
-   payments
-   classes
-   academic progress
-   renewals
-   workdays
-   payroll
-   meetings/tasks

An audit log complements, but does not replace, domain history.
