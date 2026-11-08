# Tutor selection for subject schedules: migration proposal

Status: prepared for review. The migration file exists in the repository but has not been applied anywhere. No seed was run and no permission was changed.

- Migration: `apps/api/prisma/migrations/20261108100000_add_mentoring_tutor_assignments/migration.sql`
- Schema: `MentoringTutorAssignment`, `MentoringTutorAssignmentSession` and one enum in `apps/api/prisma/schema.prisma`

## What already existed and is reused

| Need | Reused |
|---|---|
| Tutors, with an active or inactive status | `tutor_profiles`, `employees` |
| Subjects a tutor teaches | `tutor_subjects` (active rows only) |
| Levels a tutor teaches | `tutor_grades`. The grade master is the "required level" of a subject card. |
| Working hours | `tutor_availability_slots`: one row per time range on one day, soft-removed by `is_active` |
| One-off bookings | `demo_session_tutor_assignments` with `demo_sessions`, and `tutor_class_records` |
| History and audit | `mentoring_events` and the audit log |
| Who may edit a tutor | `tutor.profile.manage` (HR) and `tutor.self.update` (the tutor). No new permission was added. |

What did not exist:

1. **Any way to change availability.** The slots table was only filled once, when a recruited tutor was approved. There was no route and no screen. This change adds routes to the existing tutor profile controller and one editor.
2. **A recurring student-to-tutor assignment.** The learning plan and the timetable engine (Stage 4 and 5) are not built, so nothing records "Rahul teaches this student's Mathematics every Monday and Wednesday". Without it, one tutor could be given two students at the same time and nothing would notice.

## Why new tables are necessary

The schedule itself stays where it is (the JSON `timetable.schedule` field). The assignment must be queryable across students: "what is this tutor already booked for?". A JSON value per student cannot be locked, indexed or checked against another student's, so the booking needs its own rows.

```sql
-- Additive only. Nothing is dropped, renamed, rewritten or backfilled.
CREATE TYPE "MentoringTutorAssignmentStatus" AS ENUM ('ACTIVE', 'NEEDS_REVIEW', 'ENDED');

CREATE TABLE "mentoring_tutor_assignments" (
    "id" TEXT NOT NULL,
    "activation_id" TEXT NOT NULL,
    "subject_id" TEXT NOT NULL,
    "tutor_profile_id" TEXT NOT NULL,
    "status" "MentoringTutorAssignmentStatus" NOT NULL DEFAULT 'ACTIVE',
    "current_key" TEXT,
    "review_detail" JSONB,
    "schedule_snapshot" JSONB NOT NULL,
    "assigned_by_user_id" TEXT NOT NULL,
    "assigned_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ended_by_user_id" TEXT,
    "ended_at" TIMESTAMP(3),
    "end_reason" TEXT,
    CONSTRAINT "mentoring_tutor_assignments_pkey" PRIMARY KEY ("id")
);
-- plus mentoring_tutor_assignment_sessions: one row per recurring class
-- (tutor_profile_id, day_of_week 0-6, frequency, week, occurrences, start_minute, end_minute)
```

The full SQL, with indexes, check constraints and foreign keys, is in the migration file.

- `current_key` is `<activation_id>:<subject_id>` while an assignment is current and `NULL` once it has ended. Its unique index allows exactly one current tutor per student subject, and earlier tutors stay as `ENDED` rows. This is the same pattern `mentor_assignments` uses.
- Subject, tutor and user ids are plain columns, as in `mentor_assignments`. Only the student's workflow row and the session-to-assignment link are foreign keys, so a later change to the tutor or subject tables never blocks the history.
- Session rows are deleted when an assignment ends. The history keeps the schedule in `schedule_snapshot` and in `mentoring_events`.

## Compatibility and data impact

- No existing table or column changes, and no existing row is touched. The new tables start empty.
- Existing students are unaffected until a Mentor chooses a tutor. A student with no assignment behaves exactly as before.
- The workspace response gains `tutorAssignments` and `viewer.canManageTutorAvailability`. Older pages ignore them.
- Rolling back means dropping the two tables and the enum. Nothing else depends on them.
- The code in this change needs the tables. Deploy it only after this migration has been approved and applied, or the workspace and tutor routes will fail on the missing tables.

## How double-booking is prevented

Choosing a tutor runs in one transaction that locks the student's workflow row and then the tutor's profile row (`SELECT ... FOR UPDATE`), reads the tutor's hours and every booking, and checks every session again before it writes. Two Mentors choosing the same tutor for the same time are serialised by the tutor row: the second sees the first's booking and is refused. The lock order is always student then tutor, so the two cannot deadlock. A test runs two and then five simultaneous choices against a fake that locks rows, and fails if the lock is removed.

## Rules the checker applies

- A class needs a start time before a tutor can be matched.
- Per session: **available**, **occupied**, **not working this day**, or **availability not configured**. A tutor can be chosen only when every session is available, and they must be active, teach the subject, and teach the card's level.
- Bi-weekly Week 1 and Week 2 are separate. Monthly patterns (first, third, every) are compared by week of the month. A weekly class meets a monthly one when they share a week.
- Dated bookings (demo sessions and scheduled classes in the next 28 days) block a weekly or bi-weekly class on that weekday and time, and a monthly class only in its own week.
- Adding working hours never overrides a booking. A booked time stays occupied.
- The reason shown for an occupied time is "Already booked during this time." and never names the other student.

## Assumptions to confirm

1. Schedules have no start date yet, so across students Week 1 and Week 2 are taken to be the same calendar weeks. When the timetable engine adds start dates, the check should use them.
2. A month is four weeks, as in the subject schedule.
3. Dated bookings are looked at over 28 days because a recurring class has no end or start date to compare against.

## Not built, and a proposal

- **Effective dates for availability** and **schedule exceptions** (leave, holidays, one-off changes). The slots table has neither. A proposal for later: `tutor_availability_exceptions (tutor_profile_id, date_from, date_to, kind, note)`, read by the same checker. Approved leave from the leave module could feed it.
- **Qualification detail beyond subject and level** (curriculum is not used, because a subject card carries only subject and level).
- **A tutor profile page** in the web app. None exists, so the selection panel shows each tutor's subjects, levels and working hours instead of a "View profile" button.

## Test data

`apps/api/scripts/dev-tutor-fixtures.ts` creates five fictional tutors for local development only. It refuses to run unless the database is on this machine and not named like staging or production, needs `ALLOW_DEV_TUTOR_FIXTURES=yes` and `--execute`, and marks every record as test data. It has not been run against any database.
