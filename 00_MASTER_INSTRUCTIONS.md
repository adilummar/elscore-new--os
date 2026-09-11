# EL SCORE OS --- Antigravity Master Build Instructions

## Purpose

You are the implementation agent for EL SCORE OS V1.0, an internal
operating system for El Score Academy.

The authoritative business requirements are in
`docs/requirements/client-requirements.md`.

Your job is to implement the system incrementally according to the
approved architecture documents in this repository.

## Non-negotiable engineering rules

1.  Do not invent business rules when the requirements are silent.
2.  Do not change data ownership boundaries without explicit approval.
3.  Do not duplicate master data merely because multiple departments
    need it.
4.  Do not put authorization only in the frontend. Enforce it in the
    backend/service layer.
5.  Preserve important history. Do not hard-delete important business
    records unless an explicitly approved rule permits it.
6.  Human-readable IDs are separate from internal UUID primary keys.
7.  Financial truth belongs to Finance.
8.  A Student remains one Student across admissions and renewals.
9.  Workday must consume existing departmental work instead of creating
    duplicate manual tasks.
10. Every important cross-module automation must be traceable.
11. Prefer a modular monolith for V1 unless an approved architecture
    decision says otherwise.
12. Every feature must include validation, authorization, tests, audit
    behavior, and error handling.
13. Do not make broad refactors while implementing a small feature.
14. Before changing an existing schema or workflow, inspect the current
    implementation and migration history.
15. Never silently change an existing business rule to make an
    implementation easier.

## Required implementation loop

For every feature:

1.  Read the relevant requirement and architecture documents.
2.  Identify entities, permissions, workflow transitions, events, and
    audit requirements.
3.  State any ambiguity as a TODO/decision item rather than guessing.
4.  Implement backend/domain logic first.
5.  Implement database migration/schema changes.
6.  Add automated tests.
7.  Implement API endpoints/contracts.
8.  Implement UI only after the domain behavior is correct.
9.  Verify role-based visibility and actions.
10. Update documentation if behavior or schema changed.

## Definition of Done

A feature is not complete until:

-   Business rules are implemented.
-   Authorization is enforced server-side.
-   Relevant records are linked rather than duplicated.
-   Important changes are auditable.
-   Validation exists.
-   Error cases are handled.
-   Automated tests exist.
-   UI respects role/data visibility.
-   Relevant notifications/tasks/events work.
-   Documentation is updated.
-   No unrelated behavior was broken.

## Recommended baseline stack

This is an architectural recommendation, not a client requirement:

-   Web: Next.js + TypeScript
-   API/domain backend: NestJS + TypeScript
-   Database: PostgreSQL
-   ORM: Prisma or TypeORM; choose one and use it consistently
-   Cache/queues: Redis only where justified
-   Object storage: S3-compatible storage for attachments
-   Monorepo: pnpm + Turborepo or equivalent
-   API style: REST with OpenAPI
-   Testing: unit + integration + end-to-end
-   Containerization: Docker
-   CI: GitHub Actions or equivalent

Do not start infrastructure services that are not required by the
current milestone.

## First implementation instruction

Before writing application code:

1.  Inspect all files under `docs/`.
2.  Produce an architecture consistency report.
3.  List unresolved decisions.
4.  Propose the repository structure.
5.  Propose the initial database migration plan.
6.  Wait for/record approval before implementing the first production
    module.
