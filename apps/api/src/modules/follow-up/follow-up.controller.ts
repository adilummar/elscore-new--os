import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';

import { CurrentUser, RequestUser } from '../../common/auth/decorators/current-user.decorator';
import { RbacGuard } from '../../common/rbac/rbac.guard';
import { RbacService } from '../../common/rbac/rbac.service';
import { RequirePermissions } from '../../common/rbac/require-permissions.decorator';

import { CompleteFollowUpDto } from './dto/complete-follow-up.dto';
import { CreateFollowUpDto } from './dto/create-follow-up.dto';
import { FollowUpQueryDto } from './dto/follow-up-query.dto';
import { RescheduleFollowUpDto } from './dto/reschedule-follow-up.dto';
import { UpdateFollowUpDto } from './dto/update-follow-up.dto';
import { FollowUpService } from './follow-up.service';

/** Lead-scoped Follow-up endpoints: /leads/:leadId/follow-ups/... */
@UseGuards(RbacGuard)
@Controller('leads/:leadId/follow-ups')
export class FollowUpController {
  constructor(
    private readonly followUpService: FollowUpService,
    private readonly rbacService: RbacService,
  ) {}

  private async hasReadAll(userId: string): Promise<boolean> {
    const perms = await this.rbacService.getPermissionsForUser(userId);
    return perms.has('followup.read-all');
  }

  @Post()
  @RequirePermissions('followup.create')
  async create(
    @Param('leadId') leadId: string,
    @Body() dto: CreateFollowUpDto,
    @CurrentUser() user: RequestUser,
  ) {
    const readAll = await this.hasReadAll(user.id);
    return this.followUpService.create(leadId, dto, user.id, readAll);
  }

  @Get()
  @RequirePermissions('followup.read')
  async findAll(
    @Param('leadId') leadId: string,
    @Query() query: FollowUpQueryDto,
    @CurrentUser() user: RequestUser,
  ) {
    const readAll = await this.hasReadAll(user.id);
    return this.followUpService.findByLead(leadId, user.id, readAll, query);
  }

  @Get(':id')
  @RequirePermissions('followup.read')
  async findOne(
    @Param('leadId') leadId: string,
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
  ) {
    const readAll = await this.hasReadAll(user.id);
    return this.followUpService.findOne(leadId, id, user.id, readAll);
  }

  @Patch(':id')
  @RequirePermissions('followup.update')
  async update(
    @Param('leadId') leadId: string,
    @Param('id') id: string,
    @Body() dto: UpdateFollowUpDto,
    @CurrentUser() user: RequestUser,
  ) {
    const readAll = await this.hasReadAll(user.id);
    return this.followUpService.update(leadId, id, dto, user.id, readAll);
  }

  @Post(':id/complete')
  @RequirePermissions('followup.complete')
  async complete(
    @Param('leadId') leadId: string,
    @Param('id') id: string,
    @Body() dto: CompleteFollowUpDto,
    @CurrentUser() user: RequestUser,
  ) {
    const readAll = await this.hasReadAll(user.id);
    return this.followUpService.complete(leadId, id, dto, user.id, readAll);
  }

  @Post(':id/reschedule')
  @RequirePermissions('followup.reschedule')
  async reschedule(
    @Param('leadId') leadId: string,
    @Param('id') id: string,
    @Body() dto: RescheduleFollowUpDto,
    @CurrentUser() user: RequestUser,
  ) {
    const readAll = await this.hasReadAll(user.id);
    return this.followUpService.reschedule(leadId, id, dto, user.id, readAll);
  }
}

/** Aggregate views: GET /follow-ups?view=today|upcoming|overdue */
@UseGuards(RbacGuard)
@Controller('follow-ups')
export class FollowUpAggregateController {
  constructor(
    private readonly followUpService: FollowUpService,
    private readonly rbacService: RbacService,
  ) {}

  private async hasReadAll(userId: string): Promise<boolean> {
    const perms = await this.rbacService.getPermissionsForUser(userId);
    return perms.has('followup.read-all');
  }

  @Get()
  @RequirePermissions('followup.read')
  async findAll(@Query() query: FollowUpQueryDto, @CurrentUser() user: RequestUser) {
    const readAll = await this.hasReadAll(user.id);
    return this.followUpService.findAll(user.id, readAll, query);
  }
}
