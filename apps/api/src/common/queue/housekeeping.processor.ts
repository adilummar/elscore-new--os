import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { Job } from 'bullmq';

import { AttendanceAutoCheckoutProcessor } from '../../modules/attendance/attendance-auto-checkout.processor';
import { RoundRobinResetProcessor } from '../../modules/round-robin/round-robin.processor';

import { TokenCleanupProcessor } from './processors/token-cleanup.processor';
import { JOBS, QUEUES } from './queue.constants';

@Injectable()
@Processor(QUEUES.HOUSEKEEPING)
export class HousekeepingProcessor extends WorkerHost {
  private readonly logger = new Logger(HousekeepingProcessor.name);

  constructor(
    private readonly tokenCleanup: TokenCleanupProcessor,
    private readonly roundRobin: RoundRobinResetProcessor,
    private readonly attendanceAutoCheckout: AttendanceAutoCheckoutProcessor,
  ) {
    super();
  }

  async process(job: Job): Promise<void> {
    if (job.name === JOBS.TOKEN_CLEANUP) {
      return this.tokenCleanup.process(job);
    }
    if (
      job.name === JOBS.ROUND_ROBIN_DAILY_RESET
      || job.name === JOBS.ROUND_ROBIN_HISTORY_CLEANUP
    ) {
      return this.roundRobin.process(job);
    }
    if (job.name === JOBS.ATTENDANCE_AUTO_CHECKOUT) {
      return this.attendanceAutoCheckout.process(job);
    }
    this.logger.warn(`Unknown housekeeping job: ${job.name}`);
  }
}
