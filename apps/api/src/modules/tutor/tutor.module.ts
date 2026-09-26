import { Module } from '@nestjs/common';

import { AuthModule } from '../../common/auth/auth.module';

import { TutorFeedbackController } from './tutor-feedback.controller';
import { TutorFeedbackService } from './tutor-feedback.service';
import { TutorProfileController } from './tutor-profile.controller';
import { TutorProfileService } from './tutor-profile.service';
import { TutorRateController } from './tutor-rate.controller';
import { TutorRateService } from './tutor-rate.service';

@Module({
  imports: [AuthModule],
  controllers: [
    TutorProfileController,
    TutorRateController,
    TutorFeedbackController,
  ],
  providers: [
    TutorProfileService,
    TutorRateService,
    TutorFeedbackService,
  ],
  exports: [
    TutorProfileService,
    TutorRateService,
    TutorFeedbackService,
  ],
})
export class TutorModule {}
