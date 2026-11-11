import { Controller, Get, Query, UseGuards } from '@nestjs/common';

import { CurrentUser, RequestUser } from '../../common/auth/decorators/current-user.decorator';
import { RbacGuard } from '../../common/rbac/rbac.guard';

import { MentoringAccessService } from './mentoring-access.service';
import { MentoringOverviewService } from './mentoring-overview.service';
import { OverviewQueryDto } from './mentoring.dto';

/**
 * The overview behind the Mentoring Head and Mentor dashboards. Read only, and scoped in the database query: the Head receives the
 * department, a Mentor receives only their own students, and nobody without Mentoring access receives anything.
 */
@UseGuards(RbacGuard)
@Controller('mentoring/overview')
export class MentoringOverviewController {
  constructor(
    private readonly overview: MentoringOverviewService,
    private readonly access: MentoringAccessService,
  ) {}

  @Get()
  async summary(@Query() q: OverviewQueryDto, @CurrentUser() user: RequestUser) {
    return this.overview.summary(await this.access.scopeFor(user.id), q);
  }

  @Get('mentors')
  async mentors(@Query() q: OverviewQueryDto, @CurrentUser() user: RequestUser) {
    return this.overview.mentors(await this.access.scopeFor(user.id), q);
  }

  @Get('students')
  async students(@Query() q: OverviewQueryDto, @CurrentUser() user: RequestUser) {
    return this.overview.students(await this.access.scopeFor(user.id), q);
  }

  @Get('activations')
  async activations(@Query() q: OverviewQueryDto, @CurrentUser() user: RequestUser) {
    return this.overview.activations(await this.access.scopeFor(user.id), q);
  }

  @Get('today')
  async today(@Query() q: OverviewQueryDto, @CurrentUser() user: RequestUser) {
    return this.overview.today(await this.access.scopeFor(user.id), q);
  }
}
