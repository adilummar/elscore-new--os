import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { AnalyticsService } from './analytics.service';
import { JwtAuthGuard } from '../../common/auth/guards/jwt-auth.guard';
import { RbacGuard } from '../../common/rbac/rbac.guard';
import { RequirePermissions } from '../../common/rbac/require-permissions.decorator';

@UseGuards(JwtAuthGuard, RbacGuard)
@RequirePermissions('analytics.ceo.read')
@Controller('analytics/ceo')
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  @Get('overview')
  async getOverview(@Query('from') from?: string, @Query('to') to?: string) {
    const data = await this.analyticsService.getOverview({ from, to });
    return { data, timestamp: new Date().toISOString() };
  }

  @Get('marketing')
  async getMarketing(@Query('from') from?: string, @Query('to') to?: string) {
    const data = await this.analyticsService.getMarketing({ from, to });
    return { data, timestamp: new Date().toISOString() };
  }

  @Get('sales')
  async getSales(@Query('from') from?: string, @Query('to') to?: string) {
    const data = await this.analyticsService.getSales({ from, to });
    return { data, timestamp: new Date().toISOString() };
  }

  @Get('pipeline')
  async getPipeline(@Query('from') from?: string, @Query('to') to?: string) {
    const data = await this.analyticsService.getPipeline({ from, to });
    return { data, timestamp: new Date().toISOString() };
  }

  @Get('demos')
  async getDemos(@Query('from') from?: string, @Query('to') to?: string) {
    const data = await this.analyticsService.getDemos({ from, to });
    return { data, timestamp: new Date().toISOString() };
  }

  @Get('finance')
  async getFinance(@Query('from') from?: string, @Query('to') to?: string) {
    const data = await this.analyticsService.getFinance({ from, to });
    return { data, timestamp: new Date().toISOString() };
  }

  @Get('hr')
  async getHr() {
    const data = await this.analyticsService.getHr();
    return { data, timestamp: new Date().toISOString() };
  }

  @Get('attention')
  async getAttention() {
    const data = await this.analyticsService.getAttention();
    return { data, timestamp: new Date().toISOString() };
  }
}
