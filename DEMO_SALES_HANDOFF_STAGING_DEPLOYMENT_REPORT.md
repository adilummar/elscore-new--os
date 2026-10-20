# EL SCORE OS — Demo Sales Handoff & Parent Confirmation: Staging Deployment Report

**Target Environment:** Staging Server (`200.234.39.163` at `/var/www/elscore-os`)  
**Database:** `elscore_os_staging` on PostgreSQL (port 5432)  
**Git Branch:** `feat/demo-multisession-schema`  
**Deployed Commit SHA:** `f777118` (`f777118e69fa0f074d0ea80c1be78ee43896dfa2`)  
**Status:** **DEPLOYED & VERIFIED (PASS)**  
**Date:** October 20, 2026  

---

## Executive Summary

The complete **Demo Link-Shared Sales Handoff, Dynamic WhatsApp Template, Phone Validation Engine, and Role-Based Parent Confirmation** enhancements have been committed to `feat/demo-multisession-schema`, pushed to GitHub origin, and successfully deployed to the Hostinger KVM staging server.

Both NestJS API and Next.js Web applications were recompiled in `/var/www/elscore-os` and reloaded under PM2 (`elscore-api` process ID 2, `elscore-web` process ID 3). Standalone static assets were synchronized. Production services (`elscore-api-prod` process ID 0, `elscore-web-prod` process ID 1) remained strictly untouched with **2 days uptime** and **0 restarts**.

---

## 1. Git Branching & Remote Commit State

| Property | Value | Evidence / Verification |
| :--- | :--- | :--- |
| **Branch** | `feat/demo-multisession-schema` | Verified via `git branch --show-current` on remote staging server |
| **Commit SHA** | `f777118` | Matches GitHub remote `origin/feat/demo-multisession-schema` |
| **Commit Message** | `feat(demo): sales handoff role enforcement, dynamic WhatsApp template, phone validation, and parent confirmation workflow` | Verified via remote `git log -1 --oneline` |
| **Modified Files** | 8 files (7 tracked + report) | Verified fast-forward sync on staging |

---

## 2. Remote Build & Process Execution Details

1. **Git Synchronization:**
   - Fast-forward update pulled commit `f777118` cleanly on `/var/www/elscore-os`.
2. **Prisma Client Generation:**
   - Generated Prisma Client v5.22.0 in `/var/www/elscore-os` with exit code 0.
3. **Staging NestJS API Build:**
   - `pnpm --filter api run build` compiled TypeScript to `/var/www/elscore-os/apps/api/dist` with exit code 0.
4. **Staging Next.js Web App Build:**
   - `pnpm --filter web run build` compiled 41 static/dynamic pages with exit code 0.
   - Synchronized `.next/static` and `public` into `.next/standalone/apps/web/`.
5. **PM2 Process Reload:**
   - `pm2 restart elscore-api` (Process ID: 2, PID: 83162, Status: Online)
   - `pm2 restart elscore-web` (Process ID: 3, PID: 83183, Status: Online)

---

## 3. Production Isolation & Process Health Verification

```text
┌────┬─────────────────────┬─────────────┬─────────┬─────────┬──────────┬────────┬──────┬───────────┬──────────┬──────────┬──────────┬──────────┐
│ id │ name                │ namespace   │ version │ mode    │ pid      │ uptime │ ↺    │ status    │ cpu      │ mem      │ user     │ watching │
├────┼─────────────────────┼─────────────┼─────────┼─────────┼──────────┼────────┼──────┼───────────┼──────────┼──────────┼──────────┼──────────┤
│ 4  │ archos-prod         │ default     │ N/A     │ fork    │ 62503    │ 18h    │ 5    │ online    │ 0%       │ 76.1mb   │ root     │ disabled │
│ 7  │ archos-staging      │ default     │ N/A     │ fork    │ 79849    │ 103m   │ 4    │ online    │ 0%       │ 69.4mb   │ root     │ disabled │
│ 2  │ elscore-api         │ default     │ 0.0.1   │ fork    │ 83162    │ 1s     │ 11   │ online    │ 0%       │ 122.3mb  │ root     │ disabled │
│ 0  │ elscore-api-prod    │ default     │ 0.0.1   │ fork    │ 818      │ 2D     │ 0    │ online    │ 0%       │ 172.2mb  │ root     │ disabled │
│ 3  │ elscore-web         │ default     │ 0.0.1   │ fork    │ 83183    │ 0s     │ 12   │ online    │ 0%       │ 80.2mb   │ root     │ disabled │
│ 1  │ elscore-web-prod    │ default     │ 0.0.1   │ fork    │ 824      │ 2D     │ 0    │ online    │ 0%       │ 150.8mb  │ root     │ disabled │
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

## 5. Live Capabilities Ready for Testing on Staging

1. **Lead Owner vs. Demo Booker Priority:**
   - Sales ownership is strictly resolved by `lead.assignedToUserId`. Non-owning sales counsellors cannot view or submit WhatsApp shares or parent confirmations.
2. **Dynamic WhatsApp Template:**
   - Pre-fills parent name (fallback `Hello sir,`), bold student name, multi-session subject and tutor pairing, date & time in IST (`Asia/Kolkata`), Google Meet link, and coordinator sign-off.
3. **Phone Validation:**
   - Requires minimum 10 digits and prefixes Indian country code `91`. Disables WhatsApp launcher if invalid.
4. **Parent Confirmation Separation:**
   - Opening WhatsApp does not confirm the parent. Confirmation requires explicit submission in the Parent Confirmation modal.
5. **Cross-View Synchronization:**
   - Leads tab ([`DemosTab.tsx`](file:///e:/elscore%20new%20os/apps/web/src/app/(app)/leads/[id]/components/DemosTab.tsx)), Demo list ([`DemoList.tsx`](file:///e:/elscore%20new%20os/apps/web/src/app/(app)/demos/components/DemoList.tsx)), and Demo detail ([`DemoDetailClient.tsx`](file:///e:/elscore%20new%20os/apps/web/src/app/(app)/demos/[id]/components/DemoDetailClient.tsx)) now all display real-time parent confirmation status and confirmed-by actor details.
