import { Body, Controller, Get, Param, Put, Query, UseGuards } from '@nestjs/common';

import { CurrentUser, RequestUser } from '../../common/auth/decorators/current-user.decorator';
import { RbacGuard } from '../../common/rbac/rbac.guard';
import { RequirePermissions } from '../../common/rbac/require-permissions.decorator';

import { MentoringClassService } from './mentoring-class.service';

/**
 * The tutor's own classes, class updates and earnings. No route takes a tutor id: every answer starts from the signed-in
 * user, so a tutor cannot reach another tutor's classes, students or pay.
 */
@UseGuards(RbacGuard)
@Controller('tutor-portal')
export class TutorClassesController {
  constructor(private readonly classes: MentoringClassService) {}

  @Get('classes')
  @RequirePermissions('tutor.portal.read')
  myClasses(@Query('from') from: string, @Query('to') to: string, @CurrentUser() user: RequestUser) {
    return this.classes.tutorClasses(user.id, from, to);
  }

  /** Submit or correct the update for one class. The class stays unverified until the Mentor verifies it. */
  @Put('classes/:key/update')
  @RequirePermissions('tutor.portal.read')
  submitUpdate(@Param('key') key: string, @Body() body: Record<string, unknown>, @CurrentUser() user: RequestUser) {
    return this.classes.tutorSubmitUpdate(user.id, key, body);
  }

  @Get('earnings')
  @RequirePermissions('tutor.portal.read')
  earnings(@Query('from') from: string, @Query('to') to: string, @CurrentUser() user: RequestUser) {
    return this.classes.tutorEarnings(user.id, from, to);
  }
}
