import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';

import { QUEUES } from '../../common/queue/queue.constants';

import { DemoController } from './demo.controller';
import { DemoService } from './demo.service';

@Module({
  imports: [
    BullModule.registerQueue({
      name: QUEUES.NOTIFICATIONS,
    }),
  ],
  controllers: [DemoController],
  providers: [DemoService],
  exports: [DemoService],
})
export class DemoModule {}
