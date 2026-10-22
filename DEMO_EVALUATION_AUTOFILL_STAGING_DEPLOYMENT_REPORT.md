# EL SCORE OS — Demo Evaluation Auto-Fill: Staging Deployment Report

**Target Environment:** Staging Server (`200.234.39.163` at `/var/www/elscore-os`)  
**Database:** `elscore_os_staging` on PostgreSQL (port 5432)  
**Git Branch:** `feat/demo-multisession-schema`  
**Deployed Commit SHA:** `0a20d54` (`0a20d541577faaa16d8e0fc6cfba9569faebcffb`)  
**Status:** **DEPLOYED & VERIFIED (PASS)**  
**Date:** October 20, 2026  

---

## Executive Summary

The **Demo Evaluation Auto-Fill, Placeholder Text Elimination, State Isolation, and Completed Demo Reopening Updates** have been committed to `feat/demo-multisession-schema`, pushed to GitHub origin, and successfully deployed to the Hostinger KVM staging server (`200.234.39.163`).

Both NestJS API and Next.js Web applications were recompiled in `/var/www/elscore-os` and reloaded under PM2 (`elscore-api` process ID 2, `elscore-web` process ID 3). Production services (`elscore-api-prod` process ID 0, `elscore-web-prod` process ID 1) remained strictly untouched with **2 days uptime** and **0 restarts**.

---

## 1. Git Branching & Remote Commit State

| Property | Value | Verification |
| :--- | :--- | :--- |
| **Branch** | `feat/demo-multisession-schema` | Verified via `git branch --show-current` on remote staging server |
| **Commit SHA** | `0a20d54` | Matches GitHub remote `origin/feat/demo-multisession-schema` |
| **Commit Message** | `fix(demo): eliminate placeholder autofill in evaluation modal, preserve persisted feedback, and support completed demo evaluation updates` | Verified via remote `git log -1 --oneline` |
| **Modified Files** | 8 files (7 tracked + report) | Fast-forward synchronized on `/var/www/elscore-os` |

---

## 2. Remote Build & Process Execution Details

1. **Git Synchronization:**
   - Fast-forward update pulled commit `0a20d54` cleanly on `/var/www/elscore-os`.
2. **Prisma Client Generation:**
   - Generated Prisma Client v5.22.0 in `/var/www/elscore-os` with exit code 0.
3. **Staging NestJS API Build:**
   - `pnpm --filter api run build` compiled TypeScript to `/var/www/elscore-os/apps/api/dist` with exit code 0.
4. **Staging Next.js Web App Build:**
   - `pnpm --filter web run build` compiled 41 static/dynamic pages with exit code 0.
   - Post-build script synchronized `.next/static` into `.next/standalone/apps/web/`.
5. **PM2 Process Reload:**
   - `pm2 restart elscore-api` (Process ID: 2, PID: 84918, Status: Online)
   - `pm2 restart elscore-web` (Process ID: 3, PID: 84939, Status: Online)

---

## 3. Production Isolation & Process Health Verification

```text
┌────┬─────────────────────┬─────────────┬─────────┬─────────┬──────────┬────────┬──────┬───────────┬──────────┬──────────┬──────────┬──────────┐
│ id │ name                │ namespace   │ version │ mode    │ pid      │ uptime │ ↺    │ status    │ cpu      │ mem      │ user     │ watching │
├────┼─────────────────────┼─────────────┼─────────┼─────────┼──────────┼────────┼──────┼───────────┼──────────┼──────────┼──────────┼──────────┤
│ 4  │ archos-prod         │ default     │ N/A     │ fork    │ 62503    │ 19h    │ 5    │ online    │ 0%       │ 76.1mb   │ root     │ disabled │
│ 7  │ archos-staging      │ default     │ N/A     │ fork    │ 79849    │ 2h     │ 4    │ online    │ 0%       │ 70.4mb   │ root     │ disabled │
│ 2  │ elscore-api         │ default     │ 0.0.1   │ fork    │ 84918    │ 0s     │ 12   │ online    │ 0%       │ 164.9mb  │ root     │ disabled │
│ 0  │ elscore-api-prod    │ default     │ 0.0.1   │ fork    │ 818      │ 2D     │ 0    │ online    │ 0%       │ 172.2mb  │ root     │ disabled │
│ 3  │ elscore-web         │ default     │ 0.0.1   │ fork    │ 84939    │ 0s     │ 13   │ online    │ 0%       │ 79.2mb   │ root     │ disabled │
│ 1  │ elscore-web-prod    │ default     │ 0.0.1   │ fork    │ 824      │ 2D     │ 0    │ online    │ 0%       │ 150.9mb  │ root     │ disabled │
└────┴─────────────────────┴─────────────┴─────────┴─────────┴──────────┴────────┴──────┴───────────┴──────────┴──────────┴──────────┴──────────┘
```

> [!NOTE]
> Production processes `elscore-api-prod` (ID 0) and `elscore-web-prod` (ID 1) maintained **2 days uptime** and **0 restarts**. Only staging processes (IDs 2 & 3) were reloaded.

---

## 4. HTTP Health Probes

| Endpoint / Target | Expected | Observed | Status |
| :--- | :---: | :---: | :---: |
| `http://127.0.0.1:3000/login` | 200 OK | HTTP 200 | **PASS** |
| `http://127.0.0.1:3001/api/v1/auth/me` | 401 Unauthorized (unauth probe) | HTTP 401 | **PASS** |

---

## 5. Deployed Functionality Available for Testing on Staging

1. **Elimination of Fabricated Placeholder Text:**
   - Opening **Complete Demo** on an unevaluated demo starts with empty text fields for Academic Assessment and Parent Feedback.
   - Dropdowns for Student Engagement Level and Parent Interest Level default to `"Select Engagement Level"` and `"Select Interest Level"`, requiring explicit coordinator selection.
2. **State Isolation Between Demos:**
   - Navigating between different Demos in the list or detail view cleanly resets form state.
   - Asynchronous API fetches only populate fields that have not been modified by the coordinator, preventing typing overwrite.
3. **Completed Demo Reopen & Evaluation Updates:**
   - Completed demos in [`DemoList.tsx`](file:///e:/elscore%20new%20os/apps/web/src/app/(app)/demos/components/DemoList.tsx) feature an **Evaluation** action button.
   - Detail view in [`DemoDetailClient.tsx`](file:///e:/elscore%20new%20os/apps/web/src/app/(app)/demos/[id]/components/DemoDetailClient.tsx) features an **Evaluation & Roadmap** button.
   - Existing evaluations load accurately and can be updated without 400 Bad Request status errors or unique constraint crashes.
