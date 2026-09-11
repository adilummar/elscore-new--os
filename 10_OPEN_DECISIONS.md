# EL SCORE OS --- Open Decisions / Clarifications

These items are not fully specified in the client requirements. Do not
silently invent answers.

## Business decisions

1.  What happens after the third class if the initial payment is still
    not collected?

    -   Block further class execution?
    -   Require an authorized exception?
    -   Other?

2.  Are partial payments supported? Example: package ₹10,000, payment
    ₹3,000, outstanding ₹7,000.

3.  Can a Student have multiple active packages at once? Example:
    separate subject packages.

4.  What is the exact package structure when multiple subjects are
    included?

5.  Class cancellation rules:

    -   tutor cancellation
    -   student cancellation
    -   no-show
    -   rescheduling
    -   make-up classes
    -   partial attendance

6.  Exact payroll period:

    -   monthly
    -   weekly
    -   other

7.  Payroll approval/locking/correction rules.

8.  Salary rule versioning and effective dates.

9.  Exact employee attendance policy:

    -   grace period
    -   overtime
    -   half-day
    -   absence
    -   multiple breaks

10. Exact notification channels:

-   in-app
-   email
-   push
-   WhatsApp
-   other

11. Authentication requirements:

-   email/password
-   SSO
-   MFA
-   other

12. Marketing integrations for V1, if any.

13. File/attachment storage and allowed file types.

14. Currency model: The requirements mention INR and AED examples.
    Confirm whether V1 is single-currency or multi-currency.

15. Tax/GST/VAT requirements, if any.

16. Data retention policy.

17. Who can delete/archive which records?

18. Exact terminal Sales stages and lost reasons.

19. Exact admission statuses.

20. Exact class statuses and exception states.

## Technical decisions

1.  Final frontend stack.
2.  Final backend stack.
3.  ORM.
4.  Authentication provider.
5.  Deployment platform.
6.  Database hosting.
7.  Object storage.
8.  Queue/worker technology.
9.  Email provider.
10. Monitoring/observability platform.
