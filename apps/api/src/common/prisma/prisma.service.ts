import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';


/**
 * PrismaTxClient — type for Prisma interactive transaction callback argument.
 * Import and use this to type `tx` in $transaction callbacks to satisfy strict TypeScript.
 *
 * @example
 * await this.prisma.$transaction(async (tx: PrismaTxClient) => { ... });
 */
export type PrismaTxClient = Omit<
  PrismaClient,
  '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'
>;

/**
 * PrismaService wraps PrismaClient with NestJS lifecycle hooks.
 *
 * Usage:
 *   - Inject PrismaService wherever database access is needed.
 *   - Never instantiate PrismaClient directly in application code.
 *   - Use prisma.$transaction() for atomic multi-record operations.
 *   - Enable query logging in development via the constructor argument.
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor() {
    super({
      log:
        process.env.NODE_ENV === 'development'
          ? ['query', 'info', 'warn', 'error']
          : ['warn', 'error'],
    });
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }

  /**
   * Cleans the database for use in integration tests.
   * ONLY callable when NODE_ENV=test.
   * Tables are truncated in reverse dependency order to satisfy FK constraints.
   */
  async cleanDatabase(): Promise<void> {
    if (process.env.NODE_ENV !== 'test') {
      throw new Error('cleanDatabase() is only permitted in test environments');
    }

    // Use raw SQL to truncate in one statement with CASCADE
    await this.$executeRaw`
      TRUNCATE TABLE
        follow_up_reschedule_history,
        follow_ups,
        sales_notes,
        lead_assignment_history,
        lead_status_history,
        requirements,
        students,
        leads,
        refresh_tokens,
        user_roles,
        role_permissions,
        audit_events,
        notifications,
        employees,
        users,
        permissions,
        roles,
        departments,
        sequences
      RESTART IDENTITY CASCADE
    `;
  }
}
