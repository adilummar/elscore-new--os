import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards, ForbiddenException } from '@nestjs/common';
import { RoundRobinDailyState } from '@prisma/client';
import { IsBoolean, IsEnum, IsOptional } from 'class-validator';

import { CurrentUser, RequestUser } from '../../common/auth/decorators/current-user.decorator';
import { RbacGuard } from '../../common/rbac/rbac.guard';
import { RequirePermissions } from '../../common/rbac/require-permissions.decorator';
import { RbacService } from '../../common/rbac/rbac.service';

import { RoundRobinService } from './round-robin.service';

export class UpdateStateDto {
  @IsBoolean()
  isPaused!: boolean;
}

export class UpdateCounsellorDto {
  @IsBoolean()
  @IsOptional()
  isEligible?: boolean;

  @IsEnum(RoundRobinDailyState)
  @IsOptional()
  dailyState?: RoundRobinDailyState;
}

@UseGuards(RbacGuard)
@Controller('round-robin')
export class RoundRobinController {
  constructor(
    private readonly roundRobinService: RoundRobinService,
    private readonly rbacService: RbacService
  ) {}

  @Get('state')
  @RequirePermissions('roundrobin.read')
  async getState() {
    return this.roundRobinService.getConfig();
  }

  @Patch('state')
  @RequirePermissions('roundrobin.manage')
  async updateState(@Body() dto: UpdateStateDto, @CurrentUser() user: RequestUser) {
    return this.roundRobinService.setPaused(dto.isPaused, user.id);
  }

  @Get('history')
  async getHistory(
    @Query() query: import('./dto/lead-distribution-history-query.dto').LeadDistributionHistoryQueryDto,
    @CurrentUser() user: RequestUser,
  ) {
    const userPerms = await this.rbacService.getPermissionsForUser(user.id);
    const hasReadAll = userPerms.has('roundrobin.history.read.all');
    const hasReadTeam = userPerms.has('roundrobin.history.read.team');
    const hasReadOwn = userPerms.has('roundrobin.history.read.own');

    if (!hasReadAll && !hasReadTeam && !hasReadOwn) {
      throw new ForbiddenException('You do not have permission to view round robin history');
    }

    return this.roundRobinService.getDistributionHistory(query, user.id, hasReadAll, hasReadTeam);
  }

  @Patch('counsellors/:userId')
  @RequirePermissions('roundrobin.manage')
  async updateCounsellor(
    @Param('userId') targetUserId: string,
    @Body() dto: UpdateCounsellorDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.roundRobinService.updateCounsellor(targetUserId, dto, user.id);
  }

  @Get('me/availability')
  async getMyAvailability(@CurrentUser() user: RequestUser) {
    // Read-only endpoint for counsellors. Doesn't require special permission.
    // Assuming they are logged in via RbacGuard.
    return this.roundRobinService.getCounsellor(user.id);
  }
}
