import { Module } from '@nestjs/common';

import { AuditModule } from '../../common/audit/audit.module';
import { PrismaModule } from '../../common/prisma/prisma.module';
import { RbacModule } from '../../common/rbac/rbac.module';

import { MentoringAccessService } from './mentoring-access.service';
import { MentoringAllocationController } from './mentoring-allocation.controller';
import { MentoringAllocationService } from './mentoring-allocation.service';
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
import { MentoringReminderService } from './mentoring-reminder.service';
import { MentoringReviewController } from './mentoring-review.controller';
import { MentoringReviewService } from './mentoring-review.service';
import { MentoringSlaService } from './mentoring-sla.service';
import { MentoringStaffService } from './mentoring-staff.service';
import { MentoringTaskController } from './mentoring-task.controller';
import { MentoringTaskService } from './mentoring-task.service';
import { MentoringTimetableService } from './mentoring-timetable.service';
import { MentoringTutorService } from './mentoring-tutor.service';
import { MentoringWorkflowController } from './mentoring-workflow.controller';
import { MentoringWorkflowService } from './mentoring-workflow.service';
import { TutorClassesController } from './tutor-classes.controller';

@Module({
  imports: [PrismaModule, AuditModule, RbacModule],
  controllers: [MentoringWorkflowController, MentoringAllocationController, MentoringTaskController, MentoringOperationsController, MentoringClassController, TutorClassesController, MentoringExamController, TutorExamsController, MentoringReviewController, MentoringComplaintController, MentoringDashboardController, MentoringOverviewController],
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
    MentoringClassService,
    MentoringExamService,
    MentoringReviewService,
    MentoringComplaintService,
    MentoringDashboardService,
    MentoringOverviewService,
    MentoringWorkflowService,
  ],
  exports: [MentoringHandoverService],
})
export class MentoringModule {}
