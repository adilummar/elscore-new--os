import { Body, Controller, Get, Param, Post, Put, UseGuards, Query } from '@nestjs/common';

import { CurrentUser, RequestUser } from '../../common/auth/decorators/current-user.decorator';
import { RbacGuard } from '../../common/rbac/rbac.guard';
import { RequirePermissions } from '../../common/rbac/require-permissions.decorator';

import { MentoringAccessService } from './mentoring-access.service';
import { ReviewWorkspaceQueryDto } from './mentoring.dto';
import { MentoringReviewService } from './mentoring-review.service';

type Body_ = Record<string, unknown>;

/**
 * The monthly parent review, for the assigned Mentor. Reading is scoped in the database query to the students the caller may
 * see. Every change needs the Mentor work permission AND is checked again in the service against the student's assigned Mentor.
 * There is no route for a tutor or a parent: tutor observations are recorded by the Mentor.
 */
@UseGuards(RbacGuard)
@Controller('mentoring')
export class MentoringReviewController {
  constructor(
    private readonly reviews: MentoringReviewService,
    private readonly access: MentoringAccessService,
  ) {}

  /** The Meetings workspace: every monthly review across the caller's students. Read-only, scoped in the query. */
  @Get('reviews')
  async workspace(@Query() query: ReviewWorkspaceQueryDto, @CurrentUser() user: RequestUser) {
    return this.reviews.workspace(await this.access.scopeFor(user.id), query);
  }

  @Get('students/:activationId/review')
  async current(@Param('activationId') activationId: string, @CurrentUser() user: RequestUser) {
    return this.reviews.get(activationId, await this.access.scopeFor(user.id));
  }

  @Post('students/:activationId/review/schedule')
  @RequirePermissions('mentoring.stage.work')
  schedule(@Param('activationId') activationId: string, @Body() body: Body_, @CurrentUser() user: RequestUser) {
    return this.reviews.schedule(activationId, body, user.id);
  }

  @Get('reviews/:meetingId')
  async detail(@Param('meetingId') meetingId: string, @CurrentUser() user: RequestUser) {
    return this.reviews.detail(meetingId, await this.access.scopeFor(user.id));
  }

  @Post('reviews/:meetingId/reschedule')
  @RequirePermissions('mentoring.stage.work')
  reschedule(@Param('meetingId') meetingId: string, @Body() body: Body_, @CurrentUser() user: RequestUser) {
    return this.reviews.reschedule(meetingId, body, user.id);
  }

  @Post('reviews/:meetingId/cancel')
  @RequirePermissions('mentoring.stage.work')
  cancel(@Param('meetingId') meetingId: string, @Body() body: Body_, @CurrentUser() user: RequestUser) {
    return this.reviews.cancel(meetingId, body.reason, user.id);
  }

  @Post('reviews/:meetingId/conducted')
  @RequirePermissions('mentoring.stage.work')
  conducted(@Param('meetingId') meetingId: string, @Body() body: Body_, @CurrentUser() user: RequestUser) {
    return this.reviews.recordConducted(meetingId, body, user.id);
  }

  @Put('reviews/:meetingId/actual')
  @RequirePermissions('mentoring.stage.work')
  actual(@Param('meetingId') meetingId: string, @Body() body: Body_, @CurrentUser() user: RequestUser) {
    return this.reviews.recordActual(meetingId, body, user.id);
  }

  @Post('reviews/:meetingId/exams-reviewed')
  @RequirePermissions('mentoring.stage.work')
  examsReviewed(@Param('meetingId') meetingId: string, @Body() body: Body_, @CurrentUser() user: RequestUser) {
    return this.reviews.reviewExams(meetingId, body.note, user.id);
  }

  @Post('reviews/:meetingId/goals/from-plan')
  @RequirePermissions('mentoring.stage.work')
  seedGoals(@Param('meetingId') meetingId: string, @CurrentUser() user: RequestUser) {
    return this.reviews.seedGoals(meetingId, user.id);
  }

  @Post('reviews/:meetingId/subjects/:subjectId/goals')
  @RequirePermissions('mentoring.stage.work')
  addGoal(@Param('meetingId') meetingId: string, @Param('subjectId') subjectId: string, @Body() body: Body_, @CurrentUser() user: RequestUser) {
    return this.reviews.addGoal(meetingId, subjectId, body, user.id);
  }

  @Put('review-goals/:goalId')
  @RequirePermissions('mentoring.stage.work')
  updateGoal(@Param('goalId') goalId: string, @Body() body: Body_, @CurrentUser() user: RequestUser) {
    return this.reviews.updateGoal(goalId, body, user.id);
  }

  @Post('review-goals/:goalId/remove')
  @RequirePermissions('mentoring.stage.work')
  deleteGoal(@Param('goalId') goalId: string, @CurrentUser() user: RequestUser) {
    return this.reviews.deleteGoal(goalId, user.id);
  }

  @Post('reviews/:meetingId/areas')
  @RequirePermissions('mentoring.stage.work')
  addArea(@Param('meetingId') meetingId: string, @Body() body: Body_, @CurrentUser() user: RequestUser) {
    return this.reviews.addArea(meetingId, body, user.id);
  }

  @Post('review-areas/:areaId/remove')
  @RequirePermissions('mentoring.stage.work')
  deleteArea(@Param('areaId') areaId: string, @CurrentUser() user: RequestUser) {
    return this.reviews.deleteArea(areaId, user.id);
  }

  @Put('reviews/:meetingId/subjects/:subjectId/tutor-note')
  @RequirePermissions('mentoring.stage.work')
  tutorNote(@Param('meetingId') meetingId: string, @Param('subjectId') subjectId: string, @Body() body: Body_, @CurrentUser() user: RequestUser) {
    return this.reviews.saveTutorNote(meetingId, subjectId, body.note, user.id);
  }

  @Put('reviews/:meetingId/remarks')
  @RequirePermissions('mentoring.stage.work')
  remarks(@Param('meetingId') meetingId: string, @Body() body: Body_, @CurrentUser() user: RequestUser) {
    return this.reviews.saveRemarks(meetingId, body, user.id);
  }

  @Put('reviews/:meetingId/post-meeting')
  @RequirePermissions('mentoring.stage.work')
  postMeeting(@Param('meetingId') meetingId: string, @Body() body: Body_, @CurrentUser() user: RequestUser) {
    return this.reviews.savePostMeeting(meetingId, body, user.id);
  }

  @Post('reviews/:meetingId/next-plan/from-current')
  @RequirePermissions('mentoring.stage.work')
  copyNextPlan(@Param('meetingId') meetingId: string, @CurrentUser() user: RequestUser) {
    return this.reviews.copyNextPlan(meetingId, user.id);
  }

  @Put('reviews/:meetingId/subjects/:subjectId/next-plan')
  @RequirePermissions('mentoring.stage.work')
  nextPlan(@Param('meetingId') meetingId: string, @Param('subjectId') subjectId: string, @Body() body: Body_, @CurrentUser() user: RequestUser) {
    return this.reviews.saveNextPlan(meetingId, subjectId, body, user.id);
  }

  @Post('reviews/:meetingId/next-plan/approve')
  @RequirePermissions('mentoring.stage.work')
  approveNextPlan(@Param('meetingId') meetingId: string, @CurrentUser() user: RequestUser) {
    return this.reviews.approveNextPlan(meetingId, user.id);
  }

  @Post('reviews/:meetingId/complete')
  @RequirePermissions('mentoring.stage.work')
  complete(@Param('meetingId') meetingId: string, @CurrentUser() user: RequestUser) {
    return this.reviews.complete(meetingId, user.id);
  }
}
