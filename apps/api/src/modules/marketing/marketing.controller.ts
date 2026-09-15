import { Controller, Post, Get, Query, Body, UseGuards, Req } from '@nestjs/common';

import { CurrentUser, RequestUser } from '../../common/auth/decorators/current-user.decorator';
import { Public } from '../../common/auth/decorators/public.decorator';
import { IntegrationAuthGuard, IntegrationRequest } from '../../common/auth/guards/integration-auth.guard';
import { RbacGuard } from '../../common/rbac/rbac.guard';
import { RbacService } from '../../common/rbac/rbac.service';
import { RequirePermissions } from '../../common/rbac/require-permissions.decorator';

import { IngestMarketingEventDto } from './dto/ingest-marketing-event.dto';
import { MarketingService } from './marketing.service';

@Controller('marketing')
export class MarketingController {
  constructor(
    private readonly marketingService: MarketingService,
    private readonly rbacService: RbacService,
  ) {}

  private async hasReadAll(userId: string): Promise<boolean> {
    const perms = await this.rbacService.getPermissionsForUser(userId);
    return perms.has('lead.read-all');
  }

  @Public()
  @Post('ingest')
  @UseGuards(IntegrationAuthGuard)
  async ingestEvent(
    @Req() req: IntegrationRequest,
    @Body() dto: IngestMarketingEventDto,
  ) {
    const provider = req.integration!.provider;
    try {
      return await this.marketingService.ingestEvent(provider, dto);
    } catch (err: any) {
      console.error('MarketingController ingestEvent Error:', err);
      throw err;
    }
  }

  @Get('summary')
  @UseGuards(RbacGuard)
  @RequirePermissions('lead.read')
  async getSummary(@CurrentUser() user: RequestUser) {
    const readAll = await this.hasReadAll(user.id);
    return this.marketingService.getSummary(user.id, readAll);
  }

  @Get('activity')
  @UseGuards(RbacGuard)
  @RequirePermissions('lead.read')
  async getActivity(
    @Query('cursor') cursor: string,
    @Query('limit') limit: string,
    @CurrentUser() user: RequestUser,
  ) {
    const readAll = await this.hasReadAll(user.id);
    return this.marketingService.getActivity(user.id, readAll, cursor, limit ? parseInt(limit, 10) : 20);
  }
}
