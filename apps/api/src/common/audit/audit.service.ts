import { Injectable } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';

export interface AuditEventInput {
  entityType: string;
  entityId: string;
  action: string;
  actorUserId?: string;
  oldValue?: Record<string, unknown>;
  newValue?: Record<string, unknown>;
  reason?: string;
  correlationId?: string;
  metadata?: Record<string, unknown>;
}

/**
 * AuditService — records important business state changes to the audit_events table.
 *
 * Rules:
 *  - Write audit records AFTER the primary transaction succeeds.
 *  - Never let audit failure break the primary business operation.
 *    (Audit records should be fire-and-forget within a best-effort constraint.)
 *  - For critical operations, include both oldValue and newValue.
 *  - System-initiated actions (jobs, seeds) pass actorUserId = undefined.
 *  - This service does NOT enforce business rules; it only records.
 *
 * The audit log complements (but does not replace) domain-level history tables.
 */
@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Records an audit event.
   * Non-throwing — logs errors internally but does not propagate.
   */
  async record(input: AuditEventInput): Promise<void> {
    try {
      await this.prisma.auditEvent.create({
        data: {
          entityType: input.entityType,
          entityId: input.entityId,
          action: input.action,
          actorUserId: input.actorUserId ?? null,
          oldValue: input.oldValue ? (input.oldValue as object) : undefined,
          newValue: input.newValue ? (input.newValue as object) : undefined,
          reason: input.reason,
          correlationId: input.correlationId,
          metadata: input.metadata ? (input.metadata as object) : undefined,
        },
      });
    } catch (err) {
      // Audit failure must not break the primary operation.
      // In production, route this to an error monitoring service (e.g. Sentry).
      // eslint-disable-next-line no-console
      console.error('[AuditService] Failed to record audit event', { input, err });
    }
  }

  /**
   * Records an audit event inside an existing Prisma transaction.
   * Use this when you need audit records to be atomic with the business operation.
   */
  async recordInTx(
    tx: Parameters<Parameters<PrismaService['$transaction']>[0]>[0],
    input: AuditEventInput,
  ): Promise<void> {
    await tx.auditEvent.create({
      data: {
        entityType: input.entityType,
        entityId: input.entityId,
        action: input.action,
        actorUserId: input.actorUserId ?? null,
        oldValue: input.oldValue ? (input.oldValue as object) : undefined,
        newValue: input.newValue ? (input.newValue as object) : undefined,
        reason: input.reason,
        correlationId: input.correlationId,
        metadata: input.metadata ? (input.metadata as object) : undefined,
      },
    });
  }
}
