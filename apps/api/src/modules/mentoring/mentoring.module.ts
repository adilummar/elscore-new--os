import { Module } from '@nestjs/common';

import { AuditModule } from '../../common/audit/audit.module';
import { PrismaModule } from '../../common/prisma/prisma.module';
import { RbacModule } from '../../common/rbac/rbac.module';

import { MentoringAccessService } from './mentoring-access.service';
import { MentoringAllocationController } from './mentoring-allocation.controller';
import { MentoringAllocationService } from './mentoring-allocation.service';
import { MentoringHandoverService } from './mentoring-handover.service';
import { MentoringHistoryService } from './mentoring-history.service';
import { MentoringStaffService } from './mentoring-staff.service';
import { MentoringTaskController } from './mentoring-task.controller';
import { MentoringTaskService } from './mentoring-task.service';
import { MentoringTutorService } from './mentoring-tutor.service';
import { MentoringWorkflowController } from './mentoring-workflow.controller';
import { MentoringWorkflowService } from './mentoring-workflow.service';

@Module({
  imports: [PrismaModule, AuditModule, RbacModule],
  controllers: [MentoringWorkflowController, MentoringAllocationController, MentoringTaskController],
  providers: [
    MentoringHandoverService,
    MentoringAccessService,
    MentoringHistoryService,
    MentoringAllocationService,
    MentoringStaffService,
    MentoringTaskService,
    MentoringTutorService,
    MentoringWorkflowService,
  ],
  exports: [MentoringHandoverService],
})
export class MentoringModule {}
