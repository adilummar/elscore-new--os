# EL SCORE OS --- AI Agent Rules

## Before coding

-   Search the repository before creating a new
    entity/service/component.
-   Reuse existing abstractions when appropriate.
-   Check database migrations before changing schema.
-   Check authorization rules before exposing a field.
-   Check workflow state transitions before adding a status.
-   Check audit requirements before implementing mutations.
-   Check event idempotency before adding event handlers.

## Never

-   Hard-code role checks throughout controllers.
-   Trust IDs or ownership values from the browser.
-   Duplicate Student records for renewals.
-   Duplicate financial truth in Academic.
-   Expose Parent phone to Tutor.
-   Create Workday duplicates for existing departmental work.
-   Calculate payroll from unverified class records.
-   Use mutable aggregate totals as the only source of financial truth.
-   Delete important records silently.
-   Add arbitrary statuses to solve a local coding problem.
-   Introduce a new dependency without documenting why.

## Always

-   Validate input.
-   Authorize the action.
-   Enforce domain invariants.
-   Record important history.
-   Make asynchronous handlers idempotent.
-   Add tests for happy path and critical failure cases.
-   Use transactions for multi-record atomic business operations.
-   Keep APIs explicit and documented.
-   Return only fields the caller is allowed to see.
-   Preserve backward compatibility where possible.

## AI change discipline

For each pull request/change:

-   summarize files changed
-   summarize business behavior changed
-   list database changes
-   list permission changes
-   list events/automations changed
-   list tests added/updated
-   identify unresolved assumptions
