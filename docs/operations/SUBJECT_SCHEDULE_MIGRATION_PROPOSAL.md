# Subject-wise preferred schedule: migration proposal

Status: proposal only. Nothing in this document has been run, and no migration file has been added to `apps/api/prisma/migrations`.

## What ships without a migration

The subject-wise schedule is stored in the existing field `timetable.schedule`, in the existing table `enrollment_handover_fields`, whose `value` column is JSON. The value is now a versioned object:

```json
{
  "version": 2,
  "subjects": [
    {
      "subjectId": "…", "subjectName": "English",
      "gradeId": "…",   "gradeName": "Grade 8",
      "frequency": "WEEKLY",
      "totalMinutes": 240,
      "distribution": "EQUAL",
      "sessions": [
        { "day": "Monday", "durationMinutes": 60, "start": "16:00", "end": "17:00" }
      ]
    }
  ]
}
```

- `subjectId` and `gradeId` point at the existing `subjects` and `grades` master tables. The grade master is the "required band or level"; the application has no separate band system, so none was added.
- Bi-weekly sessions carry `week` (1 or 2). Monthly sessions carry `occurrences` (`EVERY`, `FIRST`, `SECOND`, `THIRD`, `FOURTH`, `LAST`).
- `totalMinutes` is the total for one period of the frequency: a week, a two-week cycle or a month. Hours are kept in whole minutes.
- Verification, the "changed since verified" rule, the stale-save check and the history all keep working because they already operate on the field value as JSON.

Why this is enough today: the Stage 4 and Stage 5 timetable engine does not exist yet. Nothing queries a schedule across students, so a document per student is sufficient and avoids a schema that the engine may need to shape differently.

## Existing timetable data

Values saved before this change are a plain list of `{ day, start, end }` rows.

- They are not rewritten. The page shows them as an earlier timetable, and their verification stays valid until they are replaced.
- Saving a subject schedule replaces the stored value. The old rows stay in the history entry (`HANDOVER_FIELD_UPDATED`, field `previous`), and a verification of the old rows is shown as "Changed since verified".
- A page that still sends the old row format is refused with a message to reload.

## Proposed migration 1: configurable default class length (additive)

The department default class length is 1 hour. Today it is a constant (`DEFAULT_SESSION_MINUTES` in `subject-schedule.ts`) that the API sends to the page. It is a suggestion and never a limit: any length from 15 minutes to 8 hours, in 5 minute steps, is accepted. To let the department change the default without a release, add a column to the existing settings row:

```sql
-- Proposed, not applied. Additive and safe to run on a populated table.
ALTER TABLE "mentoring_settings"
  ADD COLUMN "default_session_minutes" INTEGER NOT NULL DEFAULT 60;
```

Prisma model change:

```prisma
model MentoringSetting {
  // existing fields unchanged
  defaultSessionMinutes Int @default(60) @map("default_session_minutes")
}
```

Impact:

- Existing rows take the value 60, which is today's behaviour. No data changes meaning.
- Code change after the column exists: read the value in `MentoringWorkflowService` where `DEFAULT_SESSION_MINUTES` is used for the workspace payload, and add the field to the existing settings update route (which sits behind `mentoring.allocation.configure`). Validate it as a multiple of 5 between 15 and 480.
- Rollback: drop the column. Nothing else depends on it.

## Proposed migration 2: normalized tables (only when the timetable engine needs them)

Do this when Stage 4 or Stage 5 must query schedules across students (tutor availability, clash checks between students, capacity). Until then it adds risk without benefit.

```sql
-- Proposed, not applied.
CREATE TABLE "student_subject_schedules" (
  "id"            TEXT PRIMARY KEY,
  "handover_id"   TEXT NOT NULL REFERENCES "enrollment_handovers"("id") ON DELETE CASCADE,
  "subject_id"    TEXT NOT NULL REFERENCES "subjects"("id") ON DELETE RESTRICT,
  "grade_id"      TEXT NOT NULL REFERENCES "grades"("id") ON DELETE RESTRICT,
  "frequency"     TEXT NOT NULL CHECK ("frequency" IN ('WEEKLY','BIWEEKLY','MONTHLY')),
  "total_minutes" INTEGER NOT NULL CHECK ("total_minutes" > 0),
  "distribution"  TEXT NOT NULL CHECK ("distribution" IN ('EQUAL','CUSTOM')),
  "created_at"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"    TIMESTAMP(3) NOT NULL,
  UNIQUE ("handover_id", "subject_id")
);

CREATE TABLE "student_subject_schedule_sessions" (
  "id"               TEXT PRIMARY KEY,
  "schedule_id"      TEXT NOT NULL REFERENCES "student_subject_schedules"("id") ON DELETE CASCADE,
  "day"              TEXT NOT NULL,
  "week"             SMALLINT CHECK ("week" IN (1,2)),
  "occurrences"      TEXT[],
  "duration_minutes" INTEGER NOT NULL CHECK ("duration_minutes" > 0),
  "start_time"       TEXT,
  "end_time"         TEXT
);
```

Impact: the JSON value stays the source for verification and history; the tables would be a projection written in the same transaction as the field save, so there is one writer and nothing to reconcile. Existing data is backfilled from the JSON by a one-off script that is run and reviewed separately.

## Not part of this change

No migration, seed or permission grant was run. No staging or production record was touched. The API, the page and the tests in this change work without either migration above.
