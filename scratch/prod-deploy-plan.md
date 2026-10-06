# Production Deployment Plan
## Selective push: exclude Tutor HR module

## Changes from production (f18bf50) to latest main (f2139aa)

### ✅ SAFE TO DEPLOY to production:
1. `apps/api/src/modules/lead/lead.controller.ts`
   - CRITICAL bug fix: lead list was hardcoded to return all leads regardless of user
   - Sales counsellors now only see their own leads; sales head sees all

2. `apps/web/src/app/(auth)/login/page.tsx`
   - Added autoComplete attributes for browser password manager support (minor UX)

### ⚠️ NEEDS ADJUSTMENT before production:
3. `apps/web/src/components/layout/Sidebar.tsx`
   - Adds "Tutor HR" link to sidebar — OK to include since it's permission-gated
   - Only shows for users with `tutor_lead.read` or `tutor_lead.manage` — no existing prod user has these
   - ✅ Safe: effectively invisible in production (no permissions assigned)

4. `apps/web/src/app/(app)/dashboard/page.tsx`
   - Adds redirect to /tutor-hr/leads for HR managers
   - ✅ Safe: no prod user has tutor_lead permissions, so redirect never fires

### ❌ DO NOT DEPLOY to production:
5. `apps/api/src/modules/tutor-hr/` (entire folder — new module)
6. `apps/api/src/app.module.ts` (registers TutorHrModule)
7. `apps/api/prisma/schema.prisma` (adds tutor_lead tables)
8. `apps/api/prisma/seed.ts` (tutor HR seed data)
9. `apps/web/src/app/(app)/tutor-hr/` (entire frontend folder)
10. `apps/api/src/modules/tutor/tutor.module.ts` (removes old recruitment files)
11. `apps/api/test/tutor-hr.e2e-spec.ts`
