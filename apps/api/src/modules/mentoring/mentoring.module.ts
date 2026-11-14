import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';

import { AuditModule } from '../../common/audit/audit.module';
import { PrismaModule } from '../../common/prisma/prisma.module';
import { QUEUES } from '../../common/queue/queue.constants';
import { RbacModule } from '../../common/rbac/rbac.module';

import { MentoringAccessService } from './mentoring-access.service';
import { MentoringAllocationController } from './mentoring-allocation.controller';
import { MentoringAllocationService } from './mentoring-allocation.service';
import { MentoringActivityOptionController } from './mentoring-activity-option.controller';
import { MentoringActivityOptionService } from './mentoring-activity-option.service';
import { MentoringClassStageService } from './mentoring-class-stage.service';
import { MentoringClassWorkspaceController, TutorClassWorkspaceController } from './mentoring-class-workspace.controller';
import { MentoringClassWorkspaceService } from './mentoring-class-workspace.service';
import { MentoringClassController } from './mentoring-class.controller';
import { MentoringClassService } from './mentoring-class.service';
import { MentoringComplaintController } from './mentoring-complaint.controller';
import { MentoringComplaintService } from './mentoring-complaint.service';
import { MentoringDashboardController } from './mentoring-dashboard.controller';
import { MentoringDashboardService } from './mentoring-dashboard.service';
import { MentoringExamController, TutorExamsController } from './mentoring-exam.controller';
import { MentoringExamService } from './mentoring-exam.service';
import { MentoringHandoverService } from './mentoring-handover.service';
import { MentoringHistoryService } from './mentoring-history.service';
import { MentoringLearningPlanService } from './mentoring-learning-plan.service';
import { MentoringOperationsController } from './mentoring-operations.controller';
import { MentoringOverviewController } from './mentoring-overview.controller';
import { MentoringOverviewService } from './mentoring-overview.service';
import { MentoringReminderJobsService } from './mentoring-reminder-jobs.service';
import { MentoringReminderProcessor, MentoringReminderScheduler } from './mentoring-reminder.processor';
import { MentoringReminderService } from './mentoring-reminder.service';
import { MentoringReviewController } from './mentoring-review.controller';
import { MentoringReviewService } from './mentoring-review.service';
import { MentoringSlaService } from './mentoring-sla.service';
import { MentoringStaffService } from './mentoring-staff.service';
import { MentoringStorageService } from './mentoring-storage.service';
import { MentoringTaskController } from './mentoring-task.controller';
import { MentoringTaskService } from './mentoring-task.service';
import { MentoringTimetableService } from './mentoring-timetable.service';
import { MentoringTutorService } from './mentoring-tutor.service';
import { MentoringWorkflowController } from './mentoring-workflow.controller';
import { MentoringWorkflowService } from './mentoring-workflow.service';
import { TutorClassesController } from './tutor-classes.controller';

@Module({
  imports: [PrismaModule, AuditModule, RbacModule, BullModule.registerQueue({ name: QUEUES.MENTORING })],
  controllers: [MentoringActivityOptionController, MentoringWorkflowController, MentoringAllocationController, MentoringTaskController, MentoringOperationsController, MentoringClassController, TutorClassesController, MentoringExamController, TutorExamsController, MentoringReviewController, MentoringComplaintController, MentoringDashboardController, MentoringOverviewController, MentoringClassWorkspaceController, TutorClassWorkspaceController],
  providers: [
    MentoringHandoverService,
    MentoringAccessService,
    MentoringHistoryService,
    MentoringAllocationService,
    MentoringStaffService,
    MentoringTaskService,
    MentoringTutorService,
    MentoringTimetableService,
    MentoringLearningPlanService,
    MentoringSlaService,
    MentoringReminderService,
    MentoringReminderJobsService,
    MentoringReminderProcessor,
    MentoringReminderScheduler,
    MentoringClassService,
    MentoringExamService,
    MentoringReviewService,
    MentoringComplaintService,
    MentoringDashboardService,
    MentoringOverviewService,
    MentoringStorageService,
    MentoringClassWorkspaceService,
    MentoringClassStageService,
    MentoringActivityOptionService,
    MentoringWorkflowService,
  ],
  exports: [MentoringHandoverService],
})
export class MentoringModule {}
