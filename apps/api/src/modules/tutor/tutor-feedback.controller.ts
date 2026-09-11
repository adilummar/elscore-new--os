import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { CurrentUser, RequestUser } from '../../common/auth/decorators/current-user.decorator';
import { RbacGuard } from '../../common/rbac/rbac.guard';
import { RequirePermissions } from '../../common/rbac/require-permissions.decorator';

import { CreateTutorFeedbackDto } from './dto/tutor-feedback.dto';
import { TutorFeedbackService } from './tutor-feedback.service';

@ApiTags('Tutor Feedback')
@ApiBearerAuth()
@UseGuards(RbacGuard)
@Controller('tutors/profile/:profileId/feedback')
export class TutorFeedbackController {
  constructor(private readonly tutorFeedbackService: TutorFeedbackService) {}

  @Get()
  @RequirePermissions('tutor.feedback.read')
  @ApiOperation({ summary: 'Read internal tutor feedback' })
  async getFeedback(@Param('profileId') profileId: string) {
    return this.tutorFeedbackService.getFeedback(profileId);
  }

  @Post()
  @RequirePermissions('tutor.feedback.create')
  @ApiOperation({ summary: 'Submit tutor feedback' })
  async addFeedback(
    @Param('profileId') profileId: string,
    @Body() dto: CreateTutorFeedbackDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.tutorFeedbackService.addFeedback(profileId, dto, user.id);
  }
}
