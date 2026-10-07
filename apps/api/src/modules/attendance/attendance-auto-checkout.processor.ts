import { WorkerHost } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { Job } from 'bullmq';

import { JOBS } from '../../common/queue/queue.constants';

import { MissedCheckoutService } from './missed-checkout.service';

@Injectable()
export class AttendanceAutoCheckoutProcessor extends WorkerHost {
  private readonly logger = new Logger(AttendanceAutoCheckoutProcessor.name);

  constructor(private readonly missedCheckout: MissedCheckoutService) {
    super();
  }

  async process(job: Job) {
    if (job.name !== JOBS.ATTENDANCE_AUTO_CHECKOUT) {
       return;
    }
    this.logger.log('Starting attendance auto-close job');
    const count = await this.missedCheckout.autoCloseStaleSessions(new Date());
    this.logger.log(`Attendance auto-close job completed: ${count} session(s) closed`);
  }
}
