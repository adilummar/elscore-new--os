import { Module } from '@nestjs/common';
import { AuthModule } from '../../common/auth/auth.module';
import { IdGeneratorModule } from '../../common/id-generator/id-generator.module';
import { UserModule } from '../user/user.module';

import { TutorHrReviewController } from './tutor-hr-review.controller';
import { TutorHrReviewService } from './tutor-hr-review.service';
import { TutorHrSettingsController } from './tutor-hr-settings.controller';
import { TutorHrSettingsService } from './tutor-hr-settings.service';
import { TutorLeadController } from './tutor-lead.controller';
import { TutorLeadService } from './tutor-lead.service';
import { TutorTrainingController } from './tutor-training.controller';
import { TutorTrainingService } from './tutor-training.service';

@Module({
  imports: [AuthModule, IdGeneratorModule, UserModule],
  controllers: [
    TutorLeadController,
    TutorTrainingController,
    TutorHrReviewController,
    TutorHrSettingsController,
  ],
  providers: [
    TutorLeadService,
    TutorTrainingService,
    TutorHrReviewService,
    TutorHrSettingsService,
  ],
  exports: [
    TutorLeadService,
    TutorTrainingService,
    TutorHrReviewService,
    TutorHrSettingsService,
  ],
})
export class TutorHrModule {}
