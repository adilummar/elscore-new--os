import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { Queue } from 'bullmq';

import { JOBS, QUEUES } from './queue.constants';

/**
 * HousekeepingScheduler — registers recurring maintenance jobs at startup.
 *
 * R-5 HARDENING:
 *   Uses BullMQ's built-in repeat/cron support to schedule jobs without an
 *   external cron daemon or OS-level scheduler.
 *
 * Jobs registered:
 *   - Token cleanup: daily at 02:00 UTC
 *     Deletes expired and old-revoked refresh tokens from the refresh_tokens table.
 *
 * Design:
 *   - Jobs are added with a unique repeat key so duplicate schedules are not
 *     created on each application restart.
 *   - Uses OnApplicationBootstrap (not OnModuleInit) to ensure the queue
 *     connection is ready before scheduling.
 *   - All scheduled jobs must be idempotent; the scheduler assumes at-least-once delivery.
 *
 * To add a new scheduled job:
 *   1. Create a processor in processors/ that extends BaseJobProcessor.
 *   2. Add the job name to the relevant JOBS constant.
 *   3. Add a upsert call in scheduleJobs() below.
 */
@Injectable()
export class HousekeepingScheduler implements OnApplicationBootstrap {
  private readonly logger = new Logger(HousekeepingScheduler.name);

  constructor(
    @InjectQueue(QUEUES.HOUSEKEEPING) private readonly housekeepingQueue: Queue,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    await this.scheduleJobs();
  }

  private async scheduleJobs(): Promise<void> {
    try {
      // Daily token cleanup at 02:00 UTC
      await this.housekeepingQueue.upsertJobScheduler(
        'daily-token-cleanup',           // scheduler key — unique per schedule
        { pattern: '0 2 * * *' },        // cron: 02:00 UTC every day
        {
          name: JOBS.TOKEN_CLEANUP,
          data: {
            idempotencyKey: 'daily-token-cleanup',
            revokedOlderThanDays: 30,
          },
          opts: {
            attempts: 3,
            backoff: { type: 'fixed', delay: 60_000 }, // 1-minute retry for maintenance jobs
          },
        },
      );

      // Round robin reset at 18:30 UTC (00:00 IST)
      await this.housekeepingQueue.upsertJobScheduler(
        'round-robin-daily-reset',
        { pattern: '30 18 * * *' },
        {
          name: JOBS.ROUND_ROBIN_DAILY_RESET,
          data: {
            idempotencyKey: 'round-robin-daily-reset',
          },
          opts: {
            attempts: 3,
            backoff: { type: 'fixed', delay: 60_000 },
          },
        },
      );

      // Attendance auto-checkout at 18:35 UTC (00:05 IST)
      await this.housekeepingQueue.upsertJobScheduler(
        'attendance-auto-checkout',
        { pattern: '35 18 * * *' },
        {
          name: JOBS.ATTENDANCE_AUTO_CHECKOUT,
          data: {
            idempotencyKey: 'attendance-auto-checkout',
          },
          opts: {
            attempts: 3,
            backoff: { type: 'fixed', delay: 60_000 },
          },
        },
      );

      this.logger.log('Housekeeping schedules registered: [daily-token-cleanup @ 02:00 UTC, round-robin-daily-reset @ 18:30 UTC, attendance-auto-checkout @ 18:35 UTC]');
    } catch (err) {
      // Scheduling failure should not crash the application.
      // Log prominently; the job will be re-scheduled on next startup.
      this.logger.error('Failed to register housekeeping schedules', err);
    }
  }
}
