# Class workspace: classes already waiting for verification (read-only finding and proposal)

Status: a finding and a proposal. No record was changed. The one staging query below is read only. Nothing here changes how
any existing class behaves until the owner approves a path.

## The question

Stage D makes verification strict: the voice recording, the confirmation that it was shared, and three shared activities are
required unless the Mentoring Head approves an exception. A class reported under the old flow has none of those in the new
tables, so it could not be verified. How many such classes exist, and what is missing from each?

## Read-only staging result

Run once against the staging database `elscore_os_staging` only (the script refuses any other database name). The session was
set read only on the server (`default_transaction_read_only=on`), so the database itself would have refused any write. Only
counts were read, no names.

| What was checked | Result |
| --- | --- |
| Stage D tables present on staging (`mentoring_class_activities`, `mentoring_class_attachments`, `mentoring_message_shares`) | none, as expected: the migration is not applied |
| Stored classes in `mentoring_class_sessions` | 1 in total: 1 `SCHEDULED` (2026-11-10) |
| Classes `AWAITING_MENTOR_VERIFICATION` | 0 |
| Classes `RETURNED_FOR_CORRECTION` | 0 |
| Conducted classes that strict verification would block | 0 |
| Not conducted reports (unaffected by the new rule) | 0 |
| Classes waiting for a Mentor, by Mentor | none |

So on staging the strict rule affects no existing class. The only stored class has not happened yet and will go through the
new workspace from the start.

Production was not queried and was not touched. If production has classes in these states, the same read only counts should be
taken before any release there.

## What would be missing if a legacy class did exist

Any conducted class reported before Stage D has, in the new tables, no voice recording row (so uploaded, shared and verified are
all missing), and no activity rows (so created 0 of 3 and shared 0 of 3). The old tick boxes and the old "voice update
arrived" flag still exist on the class row but are deliberately not counted, because they are a tutor's list of kinds of
activity and a Mentor's note, not a recording and not three shared activities.

## Proposal for a legacy class (if one is found, on staging or later on production)

Nothing automatic. Each class takes one of three routes, chosen by the Mentor, and each is already supported by the code:

1. **Tutor supplies it late.** The tutor uploads the recording, adds three activities and records sharing in the class
   workspace. This is allowed for any class that is not yet verified and whose date has passed. Best when the material exists.
2. **Send it back.** The Mentor returns the update for correction or marks it incomplete with a reason; the tutor completes it
   and resubmits. Best when the update itself needs changing.
3. **Exception.** The Mentor asks the Mentoring Head for an exception with a reason ("reported before the voice and activity
   rules began"). If approved, only the voice, sharing and activity conditions are lifted. The class still needs to be recorded
   as conducted and to have a submitted tutor update. The request, the decision, who and when are all on the class history. An
   exception is cleared again if the update is returned or the corrected update changes whether or when the class happened.

What this proposal deliberately does not do: no bulk approval, no backfilled recordings or activities, no script that edits
class rows, and no change to the strict rule for new classes.

## Interface behaviour added in this change (display only)

The class review screen now lists what is missing in red, points to the class workspace, and keeps the Verify button off while
the server would refuse. The older "voice update arrived" buttons are left in place and unchanged; they no longer affect
verification. Whether to remove them is a separate decision for after review.

## Tests that stand in for staging records

The behaviour above is tested on an in memory database, with no staging data: a legacy class with the old flags set and nothing
in the new tables is refused with the exact list of what is missing and is left unchanged by the refusal; the three routes each
reach a verified class; and an exception never lifts the tutor update requirement
(`mentoring-class-workspace.service.spec.ts`, "legacy classes").
