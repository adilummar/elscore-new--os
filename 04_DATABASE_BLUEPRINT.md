# EL SCORE OS --- Database Blueprint

## Important

This is a design blueprint. Exact columns, constraints and indexes must
be reviewed before production migrations.

## Identity / organization

### users

-   id UUID PK
-   employee_id FK nullable during onboarding
-   username/email as approved
-   password/auth provider reference
-   status
-   created_at
-   updated_at

### departments

-   id UUID PK
-   code
-   name
-   status

### roles

-   id UUID PK
-   code
-   name

### permissions

-   id UUID PK
-   code
-   resource
-   action

### role_permissions

-   role_id FK
-   permission_id FK

### user_roles

-   user_id FK
-   role_id FK

### employees

-   id UUID PK
-   business_id unique, EMP-####
-   department_id FK
-   primary_role_id FK where appropriate
-   employment_status
-   profile fields required by HR
-   created_at
-   updated_at

## Student / parent

### students

-   id UUID PK
-   business_id unique, STU-####
-   core student profile
-   status
-   created_at
-   updated_at

### parents

-   id UUID PK
-   core parent profile
-   restricted contact fields
-   created_at
-   updated_at

### student_parents

-   student_id FK
-   parent_id FK
-   relationship
-   is_primary
-   created_at

## Marketing / sales

### leads

-   id UUID PK
-   business_id unique, LED-####
-   student_id nullable FK
-   source
-   campaign_id nullable
-   stage
-   status
-   origin_type: marketing/direct/referral
-   owner_user_id
-   created_at
-   updated_at

### lead_assignments

-   id UUID PK
-   lead_id FK
-   assigned_to
-   assigned_by
-   assignment_type
-   assigned_at
-   ended_at

### lead_activities

-   id UUID PK
-   lead_id FK
-   actor_id
-   activity_type
-   notes
-   occurred_at

### follow_ups

-   id UUID PK
-   lead_id FK
-   assigned_to
-   due_at
-   status
-   completed_at
-   completion_notes

## Demo

### demos

-   id UUID PK
-   business_id unique, DEM-####
-   student_id FK
-   lead_id nullable FK
-   coordinator_id FK
-   tutor_id nullable FK
-   scheduled_at
-   status
-   created_by
-   created_at
-   updated_at

### demo_reports

-   id UUID PK
-   demo_id unique FK
-   tutor_feedback
-   coordinator_feedback
-   strengths
-   weaknesses
-   parent_concerns
-   academic_assessment
-   recommended_roadmap
-   recommended_class_count
-   recommended_frequency
-   preferred_duration
-   preferred_timing
-   remarks
-   completed_at

## Admission / handover

### admissions

-   id UUID PK
-   business_id unique, ADM-####
-   student_id FK
-   lead_id nullable FK
-   package reference
-   admission status
-   closed_by
-   closed_at
-   initial_payment_status

### academic_handovers

-   id UUID PK
-   admission_id FK
-   student_id FK
-   initiated_by
-   initiated_at
-   status
-   completed_at

Do not copy the complete student history into a second student record.

## Academic

### subjects

-   id UUID PK
-   code
-   name

### grades

-   id UUID PK
-   code
-   name

### curricula

-   id UUID PK
-   code
-   name

### tutors

-   id UUID PK
-   employee_id FK
-   business_id unique, TUT-####
-   operational_status
-   availability
-   academic/HR profile fields

### tutor_subjects

-   tutor_id FK
-   subject_id FK
-   grade_id FK nullable
-   curriculum_id FK nullable
-   syllabus reference
-   salary_rate reference

### mentor_assignments

-   id UUID PK
-   student_id FK
-   mentor_id FK
-   assigned_at
-   ended_at
-   assigned_by

### tutor_assignments

-   id UUID PK
-   student_id FK
-   tutor_id FK
-   subject_id FK
-   assigned_at
-   ended_at
-   assigned_by

### timetables

-   id UUID PK
-   student_id FK
-   subject_id FK
-   tutor_id FK
-   day/time pattern
-   duration_minutes
-   effective dates
-   status

### classes

-   id UUID PK
-   business_id unique, CLS-####
-   student_id FK
-   tutor_id FK
-   subject_id FK
-   timetable_occurrence reference
-   scheduled_start
-   scheduled_end
-   actual_start nullable
-   actual_end nullable
-   status
-   tutor_submitted_at nullable
-   mentor_verified_at nullable
-   tutor_salary_eligible
-   student_hour_eligible
-   created_at
-   updated_at

### tutor_class_updates

-   id UUID PK
-   class_id unique FK
-   tutor_id FK
-   submitted_at
-   checklist data
-   academic update data

### mentor_class_verifications

-   id UUID PK
-   class_id unique FK
-   mentor_id FK
-   verified_at
-   checklist data
-   remarks
-   decision

### academic_progress

-   id UUID PK
-   student_id FK
-   class_id nullable FK
-   subject_id FK
-   chapter
-   topic
-   strengths
-   weaknesses
-   difficult_areas
-   homework
-   worksheet_usage
-   games_used
-   practice_requirements
-   student_response
-   improvement
-   attention_areas
-   remarks
-   recorded_at
-   recorded_by

## Packages / hours

### packages

-   id UUID PK
-   name
-   grade_id
-   curriculum_id
-   subject/rules
-   default hours
-   default rate
-   status

### student_packages

-   id UUID PK
-   student_id FK
-   package_id FK
-   purchased_hours
-   hourly_rate
-   offer/rate override
-   start_date
-   end_date
-   status

### hour_transactions

-   id UUID PK
-   student_package_id FK
-   class_id nullable FK
-   transaction_type
-   hours
-   source
-   occurred_at
-   verified_financially where applicable

Use a ledger/transaction approach rather than relying only on a mutable
`remaining_hours` field.

## Finance

### payments

-   id UUID PK
-   business_id unique, PAY-####
-   student_id FK nullable
-   admission_id nullable FK
-   renewal_id nullable FK
-   amount
-   currency
-   payment_method
-   recorded_by
-   verification_status
-   verified_by
-   verified_at
-   received_at

### payment_allocations

-   id UUID PK
-   payment_id FK
-   target_type
-   target_id
-   amount

### renewals

-   id UUID PK
-   business_id unique, REN-####
-   student_id FK
-   prior_package_id FK
-   new_package_id FK
-   requested_by
-   status
-   payment status
-   created_at
-   completed_at

### expenses

-   id UUID PK
-   category
-   amount
-   incurred_at
-   status
-   recorded_by

## HR / workday

### work_schedules

-   id UUID PK
-   employee_id FK
-   working_days
-   weekly_off_days
-   start_time
-   end_time
-   break_allowance
-   work_mode_policy
-   effective_from
-   effective_to

### leave_requests

-   id UUID PK
-   employee_id FK
-   leave_type
-   start_date
-   end_date
-   status
-   approving_authority
-   approved_at
-   reason

### workdays

-   id UUID PK
-   employee_id FK
-   work_date
-   scheduled_start
-   scheduled_end
-   actual_start
-   actual_end
-   work_mode
-   status
-   late_minutes
-   early_departure_minutes
-   pending_reason
-   summary

### workday_breaks

-   id UUID PK
-   workday_id FK
-   started_at
-   ended_at
-   duration_minutes

## Tasks / meetings

### tasks

-   id UUID PK
-   source_type
-   source_id nullable
-   task
-   description
-   assigned_by
-   responsible_employee
-   assigned_at
-   due_at
-   priority
-   status
-   completion_info
-   completed_at

### meetings

-   id UUID PK
-   business_id unique, MTG-####
-   title
-   meeting_type
-   department_id nullable
-   organizer_id
-   date
-   start_time
-   end_time
-   location_or_link
-   purpose
-   agenda
-   discussion
-   decisions
-   created_at

### meeting_participants

-   meeting_id FK
-   employee_id FK
-   response/status

### meeting_tasks

-   meeting_id FK
-   task_id FK

## Platform

### notifications

-   id UUID PK
-   recipient_user_id
-   type
-   entity_type
-   entity_id
-   action
-   message
-   read_at
-   created_at

### audit_events

-   id UUID PK
-   entity_type
-   entity_id
-   action
-   actor_user_id
-   timestamp
-   old_value JSONB nullable
-   new_value JSONB nullable
-   reason nullable
-   correlation_id nullable

### sequences

-   entity_type PK
-   next_number
-   prefix
-   padding

## Database rules

-   Business IDs must be unique.
-   Use foreign keys wherever relationships are authoritative.
-   Add indexes based on actual access patterns.
-   Index business IDs.
-   Index ownership fields such as assigned_to.
-   Index status + date combinations used by dashboards.
-   Index student_id on all student-history tables.
-   Index class dates and tutor/student IDs.
-   Index payment verification status and received dates.
-   Use database transactions for payment verification, class
    verification/hour consumption, and other atomic financial
    operations.
-   Use optimistic locking/versioning where concurrent edits are
    plausible.
-   Avoid storing derived totals as the sole source of truth.
