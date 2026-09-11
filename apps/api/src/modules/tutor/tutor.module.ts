import { Module } from '@nestjs/common';

import { AuthModule } from '../../common/auth/auth.module';

import { TutorFeedbackController } from './tutor-feedback.controller';
import { TutorFeedbackService } from './tutor-feedback.service';
import { TutorProfileController } from './tutor-profile.controller';
import { TutorProfileService } from './tutor-profile.service';
import { TutorRateController } from './tutor-rate.controller';
import { TutorRateService } from './tutor-rate.service';
import { TutorRecruitmentController } from './tutor-recruitment.controller';
import { TutorRecruitmentService } from './tutor-recruitment.service';

@Module({
  imports: [AuthModule],
  controllers: [
    TutorRecruitmentController,
    TutorProfileController,
    TutorRateController,
    TutorFeedbackController,
  ],
  providers: [
    TutorRecruitmentService,
    TutorProfileService,
    TutorRateService,
    TutorFeedbackService,
  ],
  exports: [
    TutorRecruitmentService,
    TutorProfileService,
    TutorRateService,
    TutorFeedbackService,
  ],
})
export class TutorModule {}
