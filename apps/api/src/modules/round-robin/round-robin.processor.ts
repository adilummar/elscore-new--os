import { Processor } from '@nestjs/bullmq';
import { Injectable, Logger, Inject, forwardRef } from '@nestjs/common';
import { Job } from 'bullmq';

import { BaseJobProcessor } from '../../common/queue/base-job-processor';
import { JOBS, QUEUES } from '../../common/queue/queue.constants';

import { RoundRobinService } from './round-robin.service';

@Injectable()
@Processor(QUEUES.HOUSEKEEPING)
export class RoundRobinResetProcessor extends BaseJobProcessor {
  protected readonly logger = new Logger(RoundRobinResetProcessor.name);

  constructor(@Inject(forwardRef(() => RoundRobinService)) private readonly roundRobinService: RoundRobinService) {
    super(RoundRobinResetProcessor.name);
  }

  protected async processJob(job: Job): Promise<void> {
    if (job.name === JOBS.ROUND_ROBIN_DAILY_RESET) {
      this.logger.log(`Starting daily round-robin reset (Job ${job.id})`);
      await this.roundRobinService.performDailyReset();
      this.logger.log(`Completed daily round-robin reset (Job ${job.id})`);
    } else {
      this.logger.warn(`Unknown job name in housekeeping queue for round-robin: ${job.name}`);
    }
  }
}
