# Antigravity --- First Prompt

You are the principal implementation engineer for EL SCORE OS.

The repository contains a client requirements document and architecture
specifications under `docs/`.

Your first task is NOT to build the application.

First:

1.  Read every file under `docs/`.
2.  Treat `docs/requirements/client-requirements.md` as the business
    source of truth.
3.  Treat the architecture documents as the technical working
    specification.
4.  Produce:
    -   architecture consistency findings
    -   contradictions/ambiguities
    -   unresolved decisions from `10_OPEN_DECISIONS.md`
    -   proposed repository structure
    -   proposed database migration sequence
    -   proposed implementation sequence
5.  Do not invent missing business rules.
6.  Do not write production business code yet.
7.  Do not generate hundreds of placeholder files.
8.  Do not introduce microservices unless explicitly approved.
9.  Explain any deviation from the documents before making it.

After the review, prepare the repository foundation only:

-   project configuration
-   source folders
-   testing setup
-   lint/format setup
-   environment template
-   database/migration setup
-   logging/error-handling foundation
-   documentation index

Do not implement Sales, Academic, Finance, HR, Workday or other business
modules until the foundation is reviewed.

When implementing later features, work in small vertical slices and
include tests, authorization, audit, validation and documentation.

The system must preserve the client's core principles:

-   enter information once
-   authoritative ownership by domain
-   role-based access
-   field-level privacy where required
-   complete important history
-   automation across modules
-   no duplicate Student records for renewals
-   Finance as financial source of truth
-   Workday consuming existing departmental work
