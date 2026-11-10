import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';

import { CurrentUser, RequestUser } from '../../common/auth/decorators/current-user.decorator';
import { RbacGuard } from '../../common/rbac/rbac.guard';

import { MentoringAccessService } from './mentoring-access.service';
import { MentoringDashboardService } from './mentoring-dashboard.service';
import { DashboardQueryDto } from './mentoring.dto';

/**
 * The Mentor dashboard. Read only: every route is scoped in the database query to the students the caller may see, so a Mentor
 * sees their own students, the Mentoring Head and the CEO see everyone, and nobody without access sees anything. There is nothing
 * to change from here; each card opens the student page where the work is done.
 */
@UseGuards(RbacGuard)
@Controller('mentoring/dashboard')
export class MentoringDashboardController {
  constructor(
    private readonly dashboard: MentoringDashboardService,
    private readonly access: MentoringAccessService,
  ) {}

  @Get()
  async summary(@Query() query: DashboardQueryDto, @CurrentUser() user: RequestUser) {
    return this.dashboard.summary(await this.access.scopeFor(user.id), query);
  }

  @Get(':card')
  async records(@Param('card') card: string, @Query() query: DashboardQueryDto, @CurrentUser() user: RequestUser) {
    return this.dashboard.records(await this.access.scopeFor(user.id), card, query, query.page, query.pageSize);
  }
}
