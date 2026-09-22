import { Controller, Get, UseGuards } from '@nestjs/common';
import { CurrentUser, RequestUser } from '../../common/auth/decorators/current-user.decorator';
import { RbacGuard } from '../../common/rbac/rbac.guard';
import { RbacService } from '../../common/rbac/rbac.service';
import { DashboardService } from './dashboard.service';

@UseGuards(RbacGuard)
@Controller('dashboard')
export class DashboardController {
  constructor(
    private readonly dashboardService: DashboardService,
    private readonly rbacService: RbacService,
  ) {}

  private async hasReadAll(userId: string): Promise<boolean> {
    const perms = await this.rbacService.getPermissionsForUser(userId);
    return perms.has('lead.read-all');
  }

  @Get('kpi')
  async getKpi(@CurrentUser() user: RequestUser) {
    const readAll = await this.hasReadAll(user.id);
    return this.dashboardService.getKpi(user.id, readAll);
  }

  @Get('pipeline')
  async getPipeline(@CurrentUser() user: RequestUser) {
    const readAll = await this.hasReadAll(user.id);
    return this.dashboardService.getPipeline(user.id, readAll);
  }

  @Get('sources')
  async getSources(@CurrentUser() user: RequestUser) {
    const readAll = await this.hasReadAll(user.id);
    return this.dashboardService.getSources(user.id, readAll);
  }

  @Get('team')
  async getTeam(@CurrentUser() user: RequestUser) {
    const readAll = await this.hasReadAll(user.id);
    return this.dashboardService.getTeam(user.id, readAll);
  }
}
