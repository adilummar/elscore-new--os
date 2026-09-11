-- AddPartialUniqueIndex
-- Enforces: at most one SCHEDULED or OVERDUE follow-up per lead at any time.
-- Prisma cannot generate partial unique indexes; maintained manually.
CREATE UNIQUE INDEX "follow_ups_lead_active_idx"
  ON "follow_ups"("lead_id")
  WHERE status IN ('SCHEDULED', 'OVERDUE');
