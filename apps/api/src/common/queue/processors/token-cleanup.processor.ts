import { Processor } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import { Job } from 'bullmq';

import { PrismaService } from '../../prisma/prisma.service';
import { BaseJobProcessor } from '../base-job-processor';
import { QUEUES } from '../queue.constants';

export const JOBS = {
  CLEANUP_REFRESH_TOKENS: 'cleanup-refresh-tokens',
} as const;

export interface CleanupRefreshTokensJobData {
  /**
   * Idempotency key — prevents duplicate runs if the job is enqueued twice.
   * Use a date-string like 'cleanup-tokens-2026-08-27' for daily runs.
   */
  idempotencyKey: string;
  /**
   * Tokens revoked more than this many days ago will be removed.
   * Defaults to 30 days if not provided.
   */
  revokedOlderThanDays?: number;
}

/**
 * TokenCleanupProcessor — housekeeping job for the refresh_tokens table.
 *
 * R-5 HARDENING:
 *   Without cleanup, the refresh_tokens table grows unboundedly.
 *   At 2,000+ active users with multiple sessions, this becomes problematic
 *   within weeks. This processor runs daily via a scheduled BullMQ job.
 *
 * What it deletes:
 *   1. Tokens where expires_at < now() — fully expired, can never be used again.
 *   2. Tokens where revoked_at < now() - revokedOlderThanDays — explicitly revoked
 *      and old enough that no audit/support investigation would need them.
 *
 * What it keeps:
 *   - Active (non-revoked, non-expired) tokens — these are live sessions.
 *   - Recently revoked tokens (within revokedOlderThanDays) — may be needed
 *     for security incident investigation.
 *
 * Idempotency:
 *   The DELETE is idempotent — running it twice produces the same final state.
 *   The idempotencyKey in job data prevents duplicate concurrent executions.
 */
@Injectable()
@Processor(QUEUES.HOUSEKEEPING)
export class TokenCleanupProcessor extends BaseJobProcessor {
  constructor(private readonly prisma: PrismaService) {
    super(TokenCleanupProcessor.name);
  }

  protected async processJob(job: Job<CleanupRefreshTokensJobData>): Promise<void> {
    const { idempotencyKey, revokedOlderThanDays = 30 } = job.data;

    this.logger.log(`Running token cleanup [${idempotencyKey}]`);

    const now = new Date();

    // Cutoff for "old enough revoked" tokens
    const revokedCutoff = new Date(now);
    revokedCutoff.setDate(revokedCutoff.getDate() - revokedOlderThanDays);

    // Delete expired tokens (can never be used regardless of revocation status)
    const expiredResult = await this.prisma.refreshToken.deleteMany({
      where: {
        expiresAt: { lt: now },
      },
    });

    // Delete sufficiently old revoked tokens
    const revokedResult = await this.prisma.refreshToken.deleteMany({
      where: {
        revokedAt: { lt: revokedCutoff, not: null },
        // Protect tokens that haven't expired yet but are revoked recently
        // (they were already handled if expired; here we target non-expired-but-old-revoked)
        expiresAt: { gte: now },
      },
    });

    const totalDeleted = expiredResult.count + revokedResult.count;

    this.logger.log(
      `Token cleanup complete [${idempotencyKey}]: ` +
        `${expiredResult.count} expired, ${revokedResult.count} old-revoked removed. ` +
        `Total: ${totalDeleted}`,
    );
  }
}
