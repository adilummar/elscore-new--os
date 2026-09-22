import { Injectable } from '@nestjs/common';

import { PrismaService, PrismaTxClient } from '../prisma/prisma.service';
import { AuditContext } from './audit.context';

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

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  private extractActor(input: AuditEventInput) {
    const store = AuditContext.getStore();
    const realActorId = store?.realActorId;
    
    // If God View is active, the true actor is the realActorId (CEO).
    // The target user ID is stored in metadata automatically.
    const actorUserId = realActorId ?? input.actorUserId ?? null;
    
    let metadata = input.metadata ? (input.metadata as any) : undefined;
    if (store?.isGodView && input.actorUserId) {
      metadata = {
        ...metadata,
        godViewTargetId: input.actorUserId,
      };
    }
    
    return { actorUserId, metadata };
  }

  async record(input: AuditEventInput): Promise<void> {
    try {
      const { actorUserId, metadata } = this.extractActor(input);
      
      await this.prisma.auditEvent.create({
        data: {
          entityType: input.entityType,
          entityId: input.entityId,
          action: input.action,
          actorUserId,
          oldValue: input.oldValue ? (input.oldValue as object) : undefined,
          newValue: input.newValue ? (input.newValue as object) : undefined,
          reason: input.reason,
          correlationId: input.correlationId,
          metadata,
        },
      });
    } catch (err) {
      console.error('[AuditService] Failed to record audit event', { input, err });
    }
  }

  async recordInTx(
    tx: PrismaTxClient,
    input: AuditEventInput,
  ): Promise<void> {
    const { actorUserId, metadata } = this.extractActor(input);
    
    await tx.auditEvent.create({
      data: {
        entityType: input.entityType,
        entityId: input.entityId,
        action: input.action,
        actorUserId,
        oldValue: input.oldValue ? (input.oldValue as object) : undefined,
        newValue: input.newValue ? (input.newValue as object) : undefined,
        reason: input.reason,
        correlationId: input.correlationId,
        metadata,
      },
    });
  }

  /**
   * Retrieves paginated audit logs with optional filtering.
   */
  async findAll(options: {
    limit: number;
    cursor?: string;
    actorUserId?: string;
    action?: string;
    entityType?: string;
    entityId?: string;
    startDate?: string;
    endDate?: string;
  }) {
    const { limit, cursor, actorUserId, action, entityType, entityId, startDate, endDate } = options;
    const where: any = {};

    if (actorUserId) where.actorUserId = actorUserId;
    if (action) where.action = action;
    if (entityType) where.entityType = entityType;
    if (entityId) where.entityId = entityId;

    if (startDate || endDate) {
      where.timestamp = {};
      if (startDate) where.timestamp.gte = new Date(startDate);
      if (endDate) where.timestamp.lte = new Date(endDate);
    }

    const { paginate } = await import('../pagination/paginate.util');

    return paginate(this.prisma.auditEvent, {
      limit,
      cursor,
      where,
      orderBy: { timestamp: 'desc', id: 'desc' }, // Custom ordering for audit logs
      include: { actor: { select: { email: true } } },
    });
  }
}
