import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';

import { QUEUES } from '../../common/queue/queue.constants';

import { DemoBackfillService } from './backfill/demo-backfill.service';
import { DemoController } from './demo.controller';
import { DemoMultiSessionService } from './demo-multisession.service';
import { DemoService } from './demo.service';

@Module({
  imports: [
    BullModule.registerQueue({
      name: QUEUES.NOTIFICATIONS,
    }),
  ],
  controllers: [DemoController],
  providers: [DemoService, DemoMultiSessionService, DemoBackfillService],
  exports: [DemoService, DemoMultiSessionService, DemoBackfillService],
})
export class DemoModule {}

