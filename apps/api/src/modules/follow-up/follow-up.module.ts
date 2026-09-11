import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';

import { AuditModule } from '../../common/audit/audit.module';
import { IdGeneratorModule } from '../../common/id-generator/id-generator.module';
import { PrismaModule } from '../../common/prisma/prisma.module';
import { QUEUES } from '../../common/queue/queue.constants';
import { RbacModule } from '../../common/rbac/rbac.module';

import { FollowUpAggregateController, FollowUpController } from './follow-up.controller';
import { FollowUpService } from './follow-up.service';
import { EmployeeCheckoutListener } from './listeners/employee-checkout.listener';
import { FollowUpOverdueProcessor } from './processors/follow-up-overdue.processor';
import { FollowUpReminderProcessor } from './processors/follow-up-reminder.processor';

@Module({
  imports: [
    PrismaModule,
    AuditModule,
    IdGeneratorModule,
    RbacModule,
    // Register queues for injection in service and processors
    BullModule.registerQueue(
      { name: QUEUES.DEADLINE_MONITOR },
      { name: QUEUES.NOTIFICATIONS },
    ),
  ],
  controllers: [FollowUpController, FollowUpAggregateController],
  providers: [
    FollowUpService,
    FollowUpReminderProcessor,
    FollowUpOverdueProcessor,
    EmployeeCheckoutListener,
  ],
  exports: [FollowUpService],
})
export class FollowUpModule {}
