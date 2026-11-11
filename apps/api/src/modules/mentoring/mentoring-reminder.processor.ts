import { InjectQueue, Processor } from '@nestjs/bullmq';
import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { Job, Queue } from 'bullmq';

import { BaseJobProcessor } from '../../common/queue/base-job-processor';
import { JOBS, QUEUES } from '../../common/queue/queue.constants';

import { MentoringReminderJobsService } from './mentoring-reminder-jobs.service';

/** The reminders run unless this is set to false, so they can be switched off in one place without a release. */
export const automaticRemindersEnabled = (env: NodeJS.ProcessEnv = process.env) => (env.MENTORING_AUTOMATIC_REMINDERS ?? 'true').toLowerCase() !== 'false';

/** Runs one pass of the Mentoring reminders. Idempotent: a repeated or overlapping run changes nothing it already did. */
@Processor(QUEUES.MENTORING)
@Injectable()
export class MentoringReminderProcessor extends BaseJobProcessor {
  constructor(private readonly jobs: MentoringReminderJobsService) {
    super(MentoringReminderProcessor.name);
  }

  protected async processJob(job: Job): Promise<void> {
    if (job.name !== JOBS.MENTORING_REMINDERS) return;
    if (!automaticRemindersEnabled()) return;
    await this.jobs.run();
  }
}

/** Registers the every-minute job at startup. The scheduler key is fixed, so a restart never creates a second schedule. */
@Injectable()
export class MentoringReminderScheduler implements OnApplicationBootstrap {
  private readonly logger = new Logger(MentoringReminderScheduler.name);

  constructor(@InjectQueue(QUEUES.MENTORING) private readonly queue: Queue) {}

  async onApplicationBootstrap(): Promise<void> {
    if (!automaticRemindersEnabled()) {
      this.logger.log('Automatic Mentoring reminders are switched off (MENTORING_AUTOMATIC_REMINDERS=false).');
      return;
    }
    try {
      await this.queue.upsertJobScheduler(
        'mentoring-reminders-every-minute',
        { pattern: '* * * * *' },
        { name: JOBS.MENTORING_REMINDERS, data: { idempotencyKey: 'mentoring-reminders' }, opts: { attempts: 1, removeOnComplete: { count: 20 }, removeOnFail: { count: 100 } } },
      );
      this.logger.log('Mentoring reminders scheduled every minute.');
    } catch (err) {
      this.logger.error(`Could not schedule the Mentoring reminders: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
}
