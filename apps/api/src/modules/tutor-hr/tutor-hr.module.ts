import { Module } from '@nestjs/common';
import { Queue, Worker } from 'bullmq';
import { AuthModule } from '../../common/auth/auth.module';
import { IdGeneratorModule } from '../../common/id-generator/id-generator.module';

import { HiringCandidateController } from './hiring/hiring-candidate.controller';
import { HiringDemoController } from './hiring/hiring-demo.controller';
import { HiringCandidateService } from './hiring/hiring-candidate.service';
import { HiringDemoService } from './hiring/hiring-demo.service';
import { HiringEscalationService } from './hiring/hiring-escalation.service';
import { HiringEvaluationService } from './hiring/hiring-evaluation.service';
import { HiringReportService } from './hiring/hiring-report.service';
import { HiringScheduleService } from './hiring/hiring-schedule.service';
import { TutorHrReviewController } from './tutor-hr-review.controller';
import { TutorHrReviewService } from './tutor-hr-review.service';
import { TutorHrSettingsController } from './tutor-hr-settings.controller';
import { TutorHrSettingsService } from './tutor-hr-settings.service';
import { TutorLeadController } from './tutor-lead.controller';
import { TutorLeadService } from './tutor-lead.service';
import { CoordinationController } from './coordination/coordination.controller';
import { CoordinationService } from './coordination/coordination.service';
import { TrainingController } from './training/training.controller';
import { TrainingService } from './training/training.service';
import { TutorProfileService } from './tutors/tutor-profile.service';
import { TutorTransferService } from './tutors/tutor-transfer.service';
import { TutorsController } from './tutors/tutors.controller';
import { TutorTrainingController } from './tutor-training.controller';
import { TutorTrainingService } from './tutor-training.service';
import { TUTOR_HR_BULLMQ, TutorHrQueueService } from './queue/tutor-hr-queue.service';

@Module({
  imports: [AuthModule, IdGeneratorModule],
  controllers: [
    HiringCandidateController,
    HiringDemoController,
    TrainingController,
    CoordinationController,
    TutorsController,
    TutorLeadController,
    TutorTrainingController,
    TutorHrReviewController,
    TutorHrSettingsController,
  ],
  providers: [
    HiringCandidateService,
    HiringDemoService,
    HiringEvaluationService,
    HiringEscalationService,
    HiringReportService,
    HiringScheduleService,
    TrainingService,
    CoordinationService,
    TutorTransferService,
    TutorProfileService,
    TutorLeadService,
    TutorTrainingService,
    TutorHrReviewService,
    TutorHrSettingsService,
    // Dedicated queue for the overdue demo-evaluation scan (not the shared housekeeping queue).
    { provide: TUTOR_HR_BULLMQ, useValue: { Queue, Worker } },
    TutorHrQueueService,
  ],
  exports: [
    HiringEscalationService,
    TutorLeadService,
    TutorTrainingService,
    TutorHrReviewService,
    TutorHrSettingsService,
  ],
})
export class TutorHrModule {}
