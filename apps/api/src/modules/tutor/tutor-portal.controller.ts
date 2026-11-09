import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { CurrentUser, RequestUser } from '../../common/auth/decorators/current-user.decorator';
import { RbacGuard } from '../../common/rbac/rbac.guard';
import { RequirePermissions } from '../../common/rbac/require-permissions.decorator';

import { TutorPortalService } from './tutor-portal.service';

@ApiTags('Tutor Portal')
@ApiBearerAuth()
@UseGuards(RbacGuard)
@Controller('tutor-portal')
export class TutorPortalController {
  constructor(private readonly portal: TutorPortalService) {}

  @Get('me')
  @RequirePermissions('tutor.portal.read')
  @ApiOperation({ summary: 'The signed-in tutor' })
  me(@CurrentUser() user: RequestUser) {
    return this.portal.mine(user.id);
  }

  @Get('calendar')
  @RequirePermissions('tutor.portal.read')
  @ApiOperation({ summary: "The signed-in tutor's own classes for a range of dates" })
  calendar(@Query('from') from: string, @Query('to') to: string, @CurrentUser() user: RequestUser) {
    return this.portal.calendar(user.id, from, to);
  }
}
