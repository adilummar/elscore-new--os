import { Body, Controller, Get, Param, Put, UseGuards } from '@nestjs/common';

import { CurrentUser, RequestUser } from '../../common/auth/decorators/current-user.decorator';
import { RbacGuard } from '../../common/rbac/rbac.guard';
import { RequirePermissions } from '../../common/rbac/require-permissions.decorator';

import { MentoringCapacityService } from './mentoring-capacity.service';
import { SetMentorLimitDto } from './mentoring.dto';

/**
 * Mentor monthly hour capacity.
 *  - The Mentoring Head (mentoring.staff.manage) is the only role that can change a limit; every change is audited.
 *  - Team figures and history need mentoring.staff.read (Mentoring Head, CEO read only).
 *  - A Mentor reads only their own capacity through /me, which always uses the signed-in user's id: there is no route that takes a Mentor id
 *    for a Mentor, and a Mentor holds neither staff permission, so they can neither see a colleague's numbers nor change their own limit.
 */
@UseGuards(RbacGuard)
@Controller('mentoring/capacity')
export class MentoringCapacityController {
  constructor(private readonly capacity: MentoringCapacityService) {}

  @Get('me')
  @RequirePermissions('mentoring.student.read-assigned')
  mine(@CurrentUser() user: RequestUser) {
    return this.capacity.mentorOverview(user.id);
  }

  @Get('team')
  @RequirePermissions('mentoring.staff.read')
  team() {
    return this.capacity.teamOverview();
  }

  @Get('mentors/:userId')
  @RequirePermissions('mentoring.staff.read')
  mentor(@Param('userId') userId: string) {
    return this.capacity.mentorOverview(userId);
  }

  @Get('mentors/:userId/history')
  @RequirePermissions('mentoring.staff.read')
  history(@Param('userId') userId: string) {
    return this.capacity.changeHistory(userId);
  }

  @Put('mentors/:userId/limit')
  @RequirePermissions('mentoring.staff.manage')
  setLimit(@Param('userId') userId: string, @Body() dto: SetMentorLimitDto, @CurrentUser() user: RequestUser) {
    return this.capacity.setLimit(userId, dto.monthlyHourLimit, dto.reason, user.id);
  }
}
