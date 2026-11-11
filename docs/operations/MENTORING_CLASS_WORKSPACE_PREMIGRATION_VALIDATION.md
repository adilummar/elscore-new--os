# Class workspace: pre-migration validation and browser acceptance checklist

Status: validation only. The migration `20261116100000_add_mentoring_class_workspace` has not been applied anywhere. Nothing
was seeded, granted, committed, pushed, deployed or restarted. Staging was queried read only (server enforced). Production was
not queried or touched.

## 1. Facts from staging (read only, database `elscore_os_staging`)

| Item | Value |
| --- | --- |
| PostgreSQL | 16.15 (Ubuntu 16.15-0ubuntu0.24.04.1), server_version_num 160015, x86_64 |
| Database role | `elscore_staging`, not a superuser, owns `mentoring_class_sessions` and the `MentoringClassStatus` enum, can create in schema `public` |
| Session mode used for checks | `transaction_read_only = on` |
| Server code | `ff46474afee29ee2526098ab86d8e1a1604ae4f5`, clean working tree |
| Migrations recorded | 48 rows: 46 applied, 0 stuck, 2 marked rolled back |
| Newest applied | `20261115100000_add_mentoring_complaints` |
| The 2 rolled back rows | `20261001000000_add_quotations` and `20261024140000_add_performance_management`: each has one later successful row (resolved in the past, not pending) |
| `MentoringClassStatus` now | SCHEDULED, RESCHEDULED, AWAITING_MENTOR_VERIFICATION, RETURNED_FOR_CORRECTION, VERIFIED, NOT_CONDUCTED (no CANCELLED) |
| New columns already present | none of the 11 |
| New tables already present | none of the 4 |
| Name collisions (constraints, indexes) | none |
| Rows in `mentoring_class_sessions` / events | 1 / 1 |
| Locks and activity | 0 ungranted locks, 0 idle in transaction, 1 active session (the check itself) |
| Views using the enum | 0. The only column using it is `status` with default `'SCHEDULED'` |
| `MENTORING_STORAGE_DIR` on the API process | not set (the default folder under the API working directory is used) |
| Disk | 96 GB, 15 percent used |

## 2. Migration SQL against Prisma and against the real schema

- `prisma validate` passes.
- `prisma migrate diff` from the committed schema (HEAD) to the working schema, run offline, gives the same objects as the hand
  written migration: 1 enum value, 11 session columns, 4 tables (24, 15, 9 and 10 columns, identical), 5 indexes, 3 foreign
  keys, all identical. The migration adds only CHECK constraints (9 in total) and `IF NOT EXISTS` on the enum value.
- Destructive statements in the migration (DROP, TRUNCATE, DELETE, UPDATE, RENAME, ALTER COLUMN): 0.
- Introspecting staging and diffing against HEAD shows only 21 lines of old cosmetic drift (three long index names that
  Postgres truncates, and one default), none on a Stage D object. Diffing staging against the working schema adds exactly the
  Stage D objects and nothing else new.
- Existing CHECK constraints on `mentoring_class_sessions` (times, actual, attendance, participation, verified, minutes) were
  read. The verified check is `(status = 'VERIFIED') = (verified fields set) OR status = 'NOT_CONDUCTED'`; a cancelled class
  has status CANCELLED and no verified fields, so it satisfies it.
- The new CHECKs on the existing table are satisfied by the one existing row (all new columns are NULL).
- Foreign keys point at `mentoring_class_sessions.id`, type `text`, matching the new `session_id text` columns.
- Cascade: child rows (activities, attachments, shares) are deleted with a session. Sessions themselves cannot be deleted
  while their activation exists (RESTRICT), so a cascade would only follow a deliberate activation removal. Files in storage
  are not removed by a cascade.

## 3. Ordering and rollback

Order, when approved:

1. Apply the migration first (staging only). The old code keeps working against the new schema: new columns are nullable and
   ignored, the new tables are unused, and no row can be CANCELLED until the new code runs.
2. Deploy the new code second. New code against the old schema would fail every class query, because it selects the new
   columns. So never deploy the code first.
3. Restart only the staging processes (PM2 ids 2 and 3). The server also runs `elscore-api-prod`, `elscore-web-prod`,
   `archos-prod` and `archos-staging`; none of them is touched.
4. Seed or grant nothing in the same step. `mentoring.template.manage` stays ungranted.

Locking: `ADD COLUMN` with no default is metadata only. The CHECK constraints take a brief exclusive lock and scan one row on
staging. Creating four new tables takes no lock on existing data.

Failure during the migration: Prisma runs the file as one statement batch, so a failure leaves nothing applied, and the
history row would need `migrate resolve --rolled-back` (done twice before for other migrations).

Rollback after success:

- The code can be reverted to `ff46474` while the new schema stays; that is safe only while no class has status CANCELLED,
  because the old client cannot read that enum value. Before reverting after a cancellation exists, the cancelled rows would
  need handling first, and that is a data change needing its own approval.
- The enum value cannot be removed in PostgreSQL. Dropping the 4 tables and 11 columns is possible but destroys any recordings
  records, activities and shares created since; the files in storage would remain.
- Practical rollback is therefore: revert the code, keep the schema. No data is lost and nothing breaks if no class was
  cancelled.

Before applying, take a database backup (not done here).

## 4. Blockers and conditions

No technical blocker was found in the migration. Conditions, in order:

1. Owner approval of the migration, as a separate step.
2. A database backup of staging immediately before.
3. Decide whether to set `MENTORING_STORAGE_DIR` to a folder that survives releases and is included in backups. Today the
   default folder is used and exists in the same pattern as the onboarding files. This is a configuration change and needs its
   own approval.
4. Browser acceptance (below) must be done after the code is deployed to staging. It could not be done yet (section 6).

## 5. Browser acceptance checklist (run on staging after approved deployment)

Accounts needed: one Mentoring Head, one Mentor with at least two assigned students, a second Mentor, one tutor with a class on
the day, a CEO or read only account. Use test students only. Run on a desktop (1440 px) and a phone (375 px).

**Mentor**
1. Daily classes (`/mentoring/classes`): today's classes of own students only; filters Student, Tutor, Subject, Status work and
   combine; empty and error messages read well; clearing filters restores the list.
2. Open a class. Before class: the 45 minute time is shown; the Meet link can be set (https only); the reminder copies; the
   "I shared it" button stays off until copied; the status never says delivered.
3. After class (tutor has submitted): the update message shows real data; the activity count reads "n of at least 3".
4. Mentor review: blockers list exactly what is missing; Verify is off until they are gone; after verification the class shows
   Consumed and the minutes.
5. Exception: with the voice or activities missing, the Request exception form is visible, needs a reason, and after sending
   shows "requested". The Mentor cannot approve it.
6. Cancel a future class with a reason: status Cancelled, not consumed, tutor notified, it stays on the list.
7. Student timetable: the cancelled class is struck through and says "Cancelled, not consumed"; a verified class says
   "Consumed".

**Tutor (phone)**
8. Tutor portal: Class workspace opens; add three activities (try Educational game and Project); each "I shared this
   activity" records name and time.
9. Upload an MP3 or M4A voice note under 15 MB: accepted. Try a video file, a 20 MB file, an empty file and a renamed
   non-audio file: each is refused with a clear message.
10. Play the recording: starts at once and seeking works (Safari on iPhone included). "I shared the recording" records it.
11. Another tutor cannot open this class (not found).

**Mentoring Head**
12. Daily classes shows every Mentor's classes; the Mentor filter works.
13. Open a class with a requested exception: Approve and Reject are visible; Reject needs a note; the requester's own request
    cannot be decided by the requester.
14. After approval the Mentor can verify without voice or activities, but not without the tutor update.
15. Return the update to the tutor: the approval is cleared and a new request is needed.

**Dashboard**
16. Each Daily classes card opens `/mentoring/classes` with `from`, `to`, `card` and filters in the address; the banner says
    what is shown; the number of rows equals the number on the card; "Show one day instead" returns to a single day.
    Check: Today, Upcoming, Waiting for the tutor update, Waiting for your verification, Verified, Not conducted,
    Rescheduled, Waiting for the voice recording, Conducted, Waiting for post-class activities, Cancelled.
17. Cards outside the class group (exams, meetings, complaints) still open their records as before.

**Security and audio**
18. Signed out: the recording address returns 401. Another Mentor, another tutor and a parent or unrelated user get "not
    found". Head, assigned Mentor, CEO and the owning tutor can play it.
19. Range requests return 206 with Content-Range and 416 past the end (browser network panel, or `curl -r`).

**Layout**
20. At 375 px: no sideways scrolling of the page, tabs usable, table scrolls inside its box, buttons reachable, text readable.

Record each result with the account, the device width and a screenshot.

## 6. Browser verification status

Not performed. The built-in browser reached the staging site (`http://200.234.39.163:3000/mentoring/classes`), which redirected
to the sign in page. No signed in staging session or test credentials are available to me, and passwords must not be entered by
me. Independently, staging still runs `ff46474`, which has none of the Stage D screens, so the new pages and the recording
routes cannot be exercised there until the migration and code are approved and deployed.
