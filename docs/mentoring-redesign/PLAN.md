# Mentoring dashboard redesign: inventory, plan and gaps

Status: planning only. No application code has been changed for the redesign yet.
Base: `claude/stage-workflow-redesign` merged into this branch (merge commit face171).

## 0. Process notes (read first)

- **UI/UX Pro Max generator was not run.** The installed skill contains only `SKILL.md`. Its `references/`, `scripts/search.py` and design data are missing, and Python is not installed. Design decisions below come from the web app's existing conventions (Tailwind 4, `components/ui/*`, `lucide-react`, slate/`brand-*` tokens). No `design-system/` folder exists and none was created. The skill's pre-delivery checklist cannot be claimed as run.
- **Stack (inspected):** Next.js 14 App Router, React 18, Tailwind 4, `lucide-react`, `clsx`. No state library, no data-fetching library. API is NestJS + Prisma. Pages call the API through server actions (`mentoringApiAction`) wrapped by `mentoringApi()`.

## 1. Existing route and component inventory (`apps/web/src/app/(app)/mentoring`)

| Route | Component | What it is |
|---|---|---|
| `/mentoring` | `page.tsx` | A plain list of 7 link cards. No default workspace. |
| `/mentoring/dashboard` | `DashboardClient` | 31 count cards in 6 groups (students, classes, exams, meetings, complaints, SLA), a 12-field filter bar, and drill-down record tables. This is the cluttered screen. |
| `/mentoring/classes` | `ClassListClient` | One-day class table with filters (student, Mentor, tutor, subject, status), pagination, Open button that shows `ClassWorkspaceDrawer`. Closest to the target Classes workspace. |
| `/mentoring/students`, `/students/[id]` | `StudentListClient`, `StudentWorkspaceClient` | Per-student workspace: Phase 1 stages 1-7 plus panels `checklist`, `classes`, `exams`, `review`, `complaints`. |
| `/mentoring/tasks` | `TaskBoardClient` | Task board. |
| `/mentoring/allocation`, `/staff`, `/approvals` | `AllocationClient`, `StaffClient`, page | Head/authorised only. |
| `/tutor-portal` | `TutorClasses`, `TutorExams` | Tutor side. Out of scope. |

Reusable pieces: `ClassWorkspaceDrawer` (tabs: before class, after class, review; voice, activities, follow-ups, versions), `class-view.ts` (`ClassItem`, state labels/tones), `workspace-view.ts` (`WorkspaceData`, `ListData`, filters, drafts), `dashboard-view.ts` (cards, `classCardHref`), `ExamsPanel` (372 lines), `MonthlyReviewPanel` (450), `LearningPlanPanel` (239), `ComplaintsPanel` (329), `DailyClassesPanel` (331), `timetable-view.ts` (date helpers), `labels.ts`, and UI kit (`Badge`, `Button`, `Input`, `Select`, `Tabs`, `EmptyState`, `ErrorState`, `Skeleton`, `Modal`, `Toast`).

Sidebar has one "Mentoring" item visible with `mentoring.student.read-all`, `read-assigned` or `task.work`.

## 2. Backend reuse map (all already exist; none will be duplicated)

| Need | Existing endpoint | Notes |
|---|---|---|
| Classes list for a day/range, all filters, pagination | `GET /mentoring/class-workspace/list` | Returns scheduled time, state, reminder, tutor confirmation, mentor verification, update, checklist, consumption. Scoped by `MentoringAccessService.scopeFor`. |
| Class detail + all mutations | `GET/POST/PUT /mentoring/class-workspace/:key/...` | Reminder share, voice, activities, follow-ups, meet link, cancel, exception. |
| Verify / return / not conducted | `POST /mentoring/classes/:sessionId/verify`, `/return`, `/notes`, `/adjust` | Explicit verification only. `head-return` needs `mentoring.record.correct`. |
| Verification queue | `GET /mentoring/operations/classes` | `classes.queue()`. |
| Exams per student | `GET/POST /mentoring/students/:activationId/exams`, `/exams/:id/*` | create, update, reschedule, remind, informed, conducted, items, marks, remarks, re-exam. |
| Meetings per student | `GET /mentoring/students/:activationId/review`, `/reviews/:meetingId/*` | schedule, reschedule, cancel, conducted, goals, areas, tutor notes, remarks, next plan, complete. |
| Counts and drill-down rows (all exam and meeting states, cross-student) | `GET /mentoring/dashboard`, `/dashboard/:card` | Cards `exams_*`, `meetings_*`, `plans_awaiting_date`. Rows carry `activationId` and `panel`. |
| Complaints, tasks, allocation, staff | existing controllers | Unchanged. |

## 3. Functional gaps and the smallest safe change

1. **No cross-student exam list.** `MentoringExamService.queue(scope, activationIds, filters)` exists but no controller route exposes it; only the dashboard calls it. *Smallest change:* one read-only `GET /mentoring/exams` that calls `queue()` through `MentoringAccessService.scopeFor`, with filters `from,to,subjectId,state,student`. No schema change.
2. **No "due after 3 verified hours" counter.** I searched the API, schema and docs: exams are scheduled by hand and no code sums verified, consumed class minutes per student and subject since the last conducted exam. The brief calls this an existing rule; it is not implemented. *Smallest change:* a read-only computed view (no table, no migration): for each student and subject, sum `verified.minutes` of VERIFIED, consumed sessions after the date of the last exam recorded as conducted; due at 180 minutes. Scheduled, cancelled or rescheduled exams are ignored, so they cannot reset the counter. **Needs your confirmation of the rule's exact edge cases** (see section 7).
3. **No cross-student meeting list.** Meetings are only reachable per student or through dashboard drill-down. *Smallest change:* one read-only `GET /mentoring/reviews` using the same scoping, returning meeting row, state, student, parent, preparation status, exam summary, plan status.
4. **Parent name** is not on class or exam rows. Needs confirming whether the meeting view already includes it.
5. **Class "actual time" history.** Actual start/end/duration are in the update and `versions`; confirm the change is recorded in `MentoringClassSessionEvent` when actual differs (I have not read that service yet).
6. **Demo Counselor and Parent experiences** have no Mentoring screens in this app; the Parent portal is not present. Not in scope unless you say so.

## 4. Proposed navigation

Primary workspace tabs, in this order, on one shell (`/mentoring/layout.tsx`): **Classes** (default, `/mentoring` redirects to `/mentoring/classes`), **Exams** (`/mentoring/exams`), **Meetings** (`/mentoring/meetings`).

Secondary, visually quieter, in a "More" row or menu: My Students (`/students`), Phase 1 Onboarding (existing stage workspace, reached from a student), Complaints, Pending Actions (existing `/tasks`), Allocation and Staff (permission-gated), Department overview (the current dashboard, demoted, Head/CEO/CO_FOUNDER).

Breadcrumbs: `Mentoring / Classes / <Student, Subject>`. The class workspace opens at `/mentoring/classes/[key]` (deep link, browser Back works) instead of an inline drawer; the drawer's content is reused as-is.

Visibility is computed from `user.permissions` as today; the API remains the authority.

## 5. Design direction (not generator output)

Clean slate/`brand` palette already in use, one accent for actions, semantic colour only for status (with icon and text, never colour alone). 14-16px body, no text under 12px. Tables on desktop, stacked rows on mobile. Status chips via the existing `Badge`. Lucide icons only. Visible focus rings, `aria-label`ed icon buttons, `<caption>` on tables, 44px touch targets. Loading uses `Skeleton`, empty uses `EmptyState`, errors use `ErrorState`. No decorative charts or gradients.

## 6. Screen-by-screen plan and steps

- **Step 1: shell and navigation.** `layout.tsx` with tabs and breadcrumbs, redirect from `/mentoring`, sidebar link unchanged. Frontend only.
- **Step 2: Classes.** Rework `ClassListClient`: today default, prev/next/date picker, week list, student search that does not reset other filters, "needs action" and "overdue" quick filters from existing states, verification queue view, columns per the brief, row opens `/mentoring/classes/[key]` with Overview, Before, After, Timing, Verification sections reusing drawer parts.
- **Step 3: Exams.** `/mentoring/exams` list on gap-1 endpoint, due panel on gap-2 endpoint, create/schedule/reschedule reusing `ExamsPanel` forms.
- **Step 4: Meetings.** `/mentoring/meetings` on gap-3 endpoint; detail page reusing `MonthlyReviewPanel` and `LearningPlanPanel`.
- **Step 5: supporting nav, role views, responsive pass.** Head/CEO read-only behaviour follows existing permissions.

Steps 1, 2 need no backend change. Steps 3 and 4 need the new read-only endpoints.

## 7. Test plan

Existing suites stay green (web mentoring Jest, API mentoring Jest). Add: unit tests for any new view helpers; API specs for the new read-only endpoints covering scope (Mentor sees only assigned students, Head all, CEO read-only, Tutor denied) and the 3-hour counter (scheduled/unverified/cancelled/rescheduled exams do not reset; per-student and per-subject). Browser checks at 375, 768 and 1280 widths with screenshots, for the states: many classes, empty, error, each role. Browser verification will be claimed only if performed (needs a running API and seeded data; seeding needs your authorisation).

Questions for you: confirm the 3-hour rule edge cases (does a re-exam reset it? does a not-conducted exam?), and approve the two new read-only endpoints.

## 8. Implementation status (all uncommitted)

- Step 1 shell and navigation, Step 2 Classes and class detail, Step 3 Exams (new read-only `GET /mentoring/exams` and `GET /mentoring/exams/due`), Step 4 Meetings (new read-only `GET /mentoring/reviews`), Step 5 supporting navigation (Phase 1 onboarding link, department wording, read-only notice, current-item rules): built.
- 3-hour rule as implemented (assumptions to confirm): only a conducted exam of kind EXAM restarts the count; a re-exam, a not-conducted exam, and a scheduled, rescheduled or cancelled exam do not; a class counts when its date is after the last conducted exam's date.
- Verified: typecheck (API and web), API Mentoring Jest (1281 passing), web Mentoring Jest (762 of 763; the failing `tutor-portal.spec.ts` matches `\n}\n` and fails on this checkout's CRLF line endings), `next build` compiles the app (it stops only at `/marketing`, which needs `API_URL`).
- Not verified: any screen in a browser (needs a running API, login and seed data), responsive layouts at 375/768/1280, and the UI/UX Pro Max checklist (skill files missing).
- Not changed: Tutor portal, Sales, ARCH OS, migrations, permissions, seeds.
