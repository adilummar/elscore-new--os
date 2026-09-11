import { BullModule } from '@nestjs/bullmq';
import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { RoundRobinModule } from '../../modules/round-robin/round-robin.module';
import { RoundRobinResetProcessor } from '../../modules/round-robin/round-robin.processor';

import { HousekeepingScheduler } from './housekeeping.scheduler';
import { TokenCleanupProcessor } from './processors/token-cleanup.processor';
import { QUEUES } from './queue.constants';

/**
 * QueueModule — sets up BullMQ with Redis and registers all application queues.
 *
 * Design decisions:
 *  - All queues are registered here in one place.
 *  - Each queue has default job options (attempts, backoff, removeOn*).
 *  - Critical financial state changes are NOT done in queue jobs;
 *    they use PostgreSQL transactions. Queues are for notifications,
 *    scheduled checks, and non-critical async side effects.
 *  - All job processors must be idempotent (safe to retry on failure).
 *
 * R-5 HARDENING:
 *  - Added HOUSEKEEPING queue for scheduled maintenance jobs.
 *  - TokenCleanupProcessor runs daily at 02:00 UTC via HousekeepingScheduler.
 *  - HousekeepingScheduler uses BullMQ upsertJobScheduler — no duplicate schedules on restart.
 *
 * Bull Board queue monitoring UI:
 *  - TODO: Add @bull-board/nestjs when version compatibility stabilizes with current bullmq.
 *
 * To add a new queue:
 *   1. Add a constant to queue.constants.ts
 *   2. Add BullModule.registerQueue() here
 *   3. Create a processor class in the relevant module directory
 *   4. Register the processor with @Processor(QUEUES.YOUR_QUEUE)
 */
@Global()
@Module({
  imports: [
    // Redis connection (shared across all queues)
    RoundRobinModule,
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        connection: {
          host: config.get<string>('redis.host') ?? 'localhost',
          port: config.get<number>('redis.port') ?? 6379,
          password: config.get<string>('redis.password'),
          enableReadyCheck: false,
          maxRetriesPerRequest: null, // Required for BullMQ
        },
        defaultJobOptions: {
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 2000, // 2s initial, doubles each attempt
          },
          removeOnComplete: { count: 1000 }, // Keep last 1000 completed jobs
          removeOnFail: { count: 5000 },     // Keep last 5000 failed jobs for inspection
        },
      }),
    }),

    // Register all queues
    BullModule.registerQueue(
      { name: QUEUES.NOTIFICATIONS },
      { name: QUEUES.DEADLINE_MONITOR },
      { name: QUEUES.AUDIT_PROJECTION },
      { name: QUEUES.HOUSEKEEPING },
    ),
  ],
  providers: [
    // Housekeeping processors and scheduler (R-5)
    TokenCleanupProcessor,
    RoundRobinResetProcessor,
    HousekeepingScheduler,
  ],
  exports: [BullModule],
})
export class QueueModule {}
