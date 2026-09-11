import { WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';

/**
 * BaseJobProcessor — abstract base class for BullMQ job processors.
 *
 * Provides:
 *  - Structured logging for job lifecycle (start, success, failure)
 *  - Idempotency key enforcement
 *  - Error wrapping with job context
 *
 * All job processors in the application must extend this class.
 *
 * Usage:
 *   @Processor(QUEUES.NOTIFICATIONS)
 *   export class NotificationProcessor extends BaseJobProcessor {
 *     protected async process(job: Job): Promise<void> {
 *       // Handle the job
 *     }
 *   }
 *
 * Job data should always include:
 *   - idempotencyKey: string (unique per logical operation)
 *   - correlationId?: string (traces across services)
 */
export abstract class BaseJobProcessor extends WorkerHost {
  protected readonly logger: Logger;

  constructor(processorName: string) {
    super();
    this.logger = new Logger(processorName);
  }

  /**
   * Implement job processing logic in subclasses.
   * Must be idempotent — safe to call multiple times with the same job.
   */
  protected abstract processJob(job: Job): Promise<void>;

  /**
   * Called by BullMQ for each job. Wraps processJob with logging.
   */
  async process(job: Job): Promise<void> {
    this.logger.log(`Processing job ${job.id} [${job.name}]`, {
      jobId: job.id,
      jobName: job.name,
      attemptsMade: job.attemptsMade,
    });

    try {
      await this.processJob(job);
      this.logger.log(`Job ${job.id} completed successfully`);
    } catch (err) {
      this.logger.error(`Job ${job.id} failed`, {
        jobId: job.id,
        jobName: job.name,
        attemptsMade: job.attemptsMade,
        error: err instanceof Error ? err.message : String(err),
      });
      // Re-throw so BullMQ can retry
      throw err;
    }
  }
}
