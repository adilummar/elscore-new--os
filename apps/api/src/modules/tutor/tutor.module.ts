import { Module } from '@nestjs/common';

import { AuthModule } from '../../common/auth/auth.module';

import { TutorAvailabilityService } from './tutor-availability.service';
import { TutorCalendarService } from './tutor-calendar.service';
import { TutorExceptionService } from './tutor-exception.service';
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
    TutorAvailabilityService,
    TutorCalendarService,
    TutorExceptionService,
    TutorRateService,
    TutorFeedbackService,
  ],
  exports: [
    TutorProfileService,
    TutorAvailabilityService,
    TutorRateService,
    TutorFeedbackService,
  ],
})
export class TutorModule {}
