import { Body, Controller, Get, Param, Post, Put, Query, UseGuards } from '@nestjs/common';

import { CurrentUser, RequestUser } from '../../common/auth/decorators/current-user.decorator';
import { RbacGuard } from '../../common/rbac/rbac.guard';
import { RequirePermissions } from '../../common/rbac/require-permissions.decorator';

import { MentoringAccessService } from './mentoring-access.service';
import { MentoringActivityOptionService } from './mentoring-activity-option.service';

/**
 * The managed list of activities for "Activities given". Anyone who can see Mentoring students reads the active options. Adding, renaming and
 * switching options on or off needs the template management permission (the Mentoring Head).
 */
@UseGuards(RbacGuard)
@Controller('mentoring/activity-options')
export class MentoringActivityOptionController {
  constructor(private readonly options: MentoringActivityOptionService, private readonly access: MentoringAccessService) {}

  @Get()
  async list(@Query('includeInactive') includeInactive: string | undefined, @CurrentUser() user: RequestUser) {
    return this.options.list(await this.access.scopeFor(user.id), includeInactive === 'true');
  }

  @Post()
  @RequirePermissions('mentoring.template.manage')
  create(@Body() body: Record<string, unknown>, @CurrentUser() user: RequestUser) {
    return this.options.create(user.id, body);
  }

  @Put(':id')
  @RequirePermissions('mentoring.template.manage')
  update(@Param('id') id: string, @Body() body: Record<string, unknown>, @CurrentUser() user: RequestUser) {
    return this.options.update(user.id, id, body);
  }
}
