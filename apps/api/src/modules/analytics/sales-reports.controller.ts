import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { AnalyticsService } from './analytics.service';
import { JwtAuthGuard } from '../../common/auth/guards/jwt-auth.guard';
import { RbacGuard } from '../../common/rbac/rbac.guard';
import { RequirePermissions } from '../../common/rbac/require-permissions.decorator';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

@ApiTags('Sales Reports')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RbacGuard)
@RequirePermissions('target.read.team')
@Controller('analytics/sales-reports')
export class SalesReportsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  @Get('team-performance')
  @ApiOperation({ summary: 'Get sales team performance and overdue follow-ups' })
  async getTeamPerformance(@Query('from') from?: string, @Query('to') to?: string) {
    const data = await this.analyticsService.getSales({ from, to });
    return { data, timestamp: new Date().toISOString() };
  }

  @Get('pipeline')
  @ApiOperation({ summary: 'Get lead pipeline status counts' })
  async getPipeline(@Query('from') from?: string, @Query('to') to?: string) {
    const data = await this.analyticsService.getPipeline({ from, to });
    return { data, timestamp: new Date().toISOString() };
  }

  @Get('demos')
  @ApiOperation({ summary: 'Get demo conversion analytics' })
  async getDemos(@Query('from') from?: string, @Query('to') to?: string) {
    const data = await this.analyticsService.getDemos({ from, to });
    return { data, timestamp: new Date().toISOString() };
  }
}
