import { Inject, Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Job, Queue, Worker } from 'bullmq';

import { JOBS, QUEUES } from '../../../common/queue/queue.constants';
import { HiringEscalationService } from '../hiring/hiring-escalation.service';

/** Injection token for the BullMQ classes, so tests can replace them without Redis. */
export const TUTOR_HR_BULLMQ = Symbol('TUTOR_HR_BULLMQ');
export interface BullMqClasses {
  Queue: typeof Queue;
  Worker: typeof Worker;
}

/** Scheduler key of the overdue-evaluation scan. Stored in Redis; do not rename without cleaning up the old schedule. */
export const OVERDUE_SCAN_SCHEDULER_KEY = 'tutor-evaluation-overdue-scan';

/** Allowed characters for the queue name and key prefix (no ':' — it separates Redis key segments). */
const KEY_SEGMENT = /^[A-Za-z0-9._-]+$/;

export interface TutorHrQueueConfig {
  enabled: boolean;
  name: string;
  prefix: string;
  overdueScanCron: string;
}

/** Reads and validates config `tutorHr.queue` (see common/config/configuration.ts). */
export function resolveTutorHrQueueConfig(config: Pick<ConfigService, 'get'>): TutorHrQueueConfig {
  const c = {
    enabled: config.get<boolean>('tutorHr.queue.enabled') ?? true,
    name: config.get<string>('tutorHr.queue.name') ?? QUEUES.TUTOR_HR,
    prefix: config.get<string>('tutorHr.queue.prefix') ?? 'elscore-development',
    overdueScanCron: config.get<string>('tutorHr.queue.overdueScanCron') ?? '*/5 * * * *',
  };
  if (!KEY_SEGMENT.test(c.name)) throw new Error(`TUTOR_HR_QUEUE_NAME "${c.name}" is invalid: use letters, digits, '.', '_' or '-' only`);
  if (!KEY_SEGMENT.test(c.prefix)) throw new Error(`TUTOR_HR_QUEUE_PREFIX "${c.prefix}" is invalid: use letters, digits, '.', '_' or '-' only`);
  if (c.overdueScanCron.trim().split(/\s+/).length < 5) throw new Error(`TUTOR_HR_OVERDUE_SCAN_CRON "${c.overdueScanCron}" is not a cron pattern`);
  return c;
}

/**
 * Dedicated BullMQ queue, scheduler and worker for Tutor HR jobs.
 *
 * Kept separate from the shared housekeeping queue on purpose: that queue has several workers,
 * each of which receives any job on it, so a new job there could be taken by a worker that does not
 * handle it. Here exactly one worker type consumes the queue.
 *
 * The queue is created at runtime (not with BullModule.registerQueue / @Processor) so its name and
 * prefix come from configuration. Connection settings follow QueueModule (same Redis host/port/password).
 *
 * Redis keys: `<prefix>:<name>:*` — by default `elscore-<APP_ENV>:tutor-hr:*`.
 */
@Injectable()
export class TutorHrQueueService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(TutorHrQueueService.name);
  private queue?: Queue;
  private worker?: Worker;

  constructor(
    private readonly config: ConfigService,
    private readonly escalation: HiringEscalationService,
    @Inject(TUTOR_HR_BULLMQ) private readonly bullmq: BullMqClasses,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    const cfg = resolveTutorHrQueueConfig(this.config);
    if (!cfg.enabled) {
      this.logger.log('Tutor HR queue disabled (TUTOR_HR_QUEUE_ENABLED=false); no worker or schedule started');
      return;
    }
    const connection = {
      host: this.config.get<string>('redis.host') ?? 'localhost',
      port: this.config.get<number>('redis.port') ?? 6379,
      password: this.config.get<string>('redis.password'),
      enableReadyCheck: false,
      maxRetriesPerRequest: null,
      retryStrategy: () => 10_000,
    };
    try {
      this.queue = new this.bullmq.Queue(cfg.name, { connection, prefix: cfg.prefix });
      this.queue.on('error', (e: Error) => this.logger.warn(`Tutor HR queue error: ${e.message}`));
      this.worker = new this.bullmq.Worker(cfg.name, (job: Job) => this.process(job), { connection, prefix: cfg.prefix, concurrency: 1 });
      this.worker.on('error', (e: Error) => this.logger.warn(`Tutor HR worker error: ${e.message}`));

      await this.queue.upsertJobScheduler(
        OVERDUE_SCAN_SCHEDULER_KEY,
        { pattern: cfg.overdueScanCron },
        {
          name: JOBS.TUTOR_EVALUATION_OVERDUE_SCAN,
          data: { idempotencyKey: OVERDUE_SCAN_SCHEDULER_KEY },
          opts: { attempts: 3, backoff: { type: 'fixed', delay: 60_000 }, removeOnComplete: { count: 50 }, removeOnFail: { count: 200 } },
        },
      );
      this.logger.log(`Tutor HR queue "${cfg.prefix}:${cfg.name}" ready; overdue-evaluation scan scheduled (${cfg.overdueScanCron})`);
    } catch (err) {
      // Same stance as HousekeepingScheduler: a Redis problem must not stop the API from starting.
      this.logger.error(`Tutor HR queue could not be started: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  /** Handles one job. Exported for tests. Throws so BullMQ retries on failure. */
  async process(job: Job): Promise<unknown> {
    if (job.name !== JOBS.TUTOR_EVALUATION_OVERDUE_SCAN) {
      throw new Error(`Unknown job "${job.name}" on the Tutor HR queue`);
    }
    this.logger.log(`Processing job ${job.id} [${job.name}] attempt ${job.attemptsMade + 1}`);
    const result = await this.escalation.runScan();
    this.logger.log(`Tutor evaluation scan: ${JSON.stringify(result)}`);
    return result;
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker?.close().catch(() => undefined);
    await this.queue?.close().catch(() => undefined);
  }
}
