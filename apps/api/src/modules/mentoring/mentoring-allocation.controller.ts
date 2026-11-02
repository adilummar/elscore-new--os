import { Body, Controller, Get, Param, Post, Put, Query, UseGuards } from '@nestjs/common';
import { MentoringStaffRole } from '@prisma/client';

import { CurrentUser, RequestUser } from '../../common/auth/decorators/current-user.decorator';
import { RbacGuard } from '../../common/rbac/rbac.guard';
import { RequirePermissions } from '../../common/rbac/require-permissions.decorator';

import { MentoringAllocationService } from './mentoring-allocation.service';
import { MentoringStaffService } from './mentoring-staff.service';
import {
  AssignMentorDto,
  ReassignMentorDto,
  ReturnToQueueDto,
  TransferMentorDto,
  UpdateSettingsDto,
  UpsertStaffDto,
} from './mentoring.dto';

@UseGuards(RbacGuard)
@Controller('mentoring')
export class MentoringAllocationController {
  constructor(
    private readonly allocation: MentoringAllocationService,
    private readonly staff: MentoringStaffService,
  ) {}

  @Get('allocation/queue')
  @RequirePermissions('mentoring.allocation.read')
  queue() {
    return this.allocation.queue();
  }

  @Get('allocation/workload')
  @RequirePermissions('mentoring.staff.read')
  workload() {
    return this.allocation.workload();
  }

  @Get('allocation/settings')
  @RequirePermissions('mentoring.allocation.read')
  settings() {
    return this.allocation.getSettings();
  }

  @Put('allocation/settings')
  @RequirePermissions('mentoring.allocation.configure')
  updateSettings(@Body() dto: UpdateSettingsDto, @CurrentUser() user: RequestUser) {
    return this.allocation.updateSettings(dto, user.id);
  }

  @Post('allocation/run-auto')
  @RequirePermissions('mentoring.allocation.manage')
  runAuto(@CurrentUser() user: RequestUser) {
    return this.allocation.runAutoForQueue(user.id);
  }

  @Post('allocation/:activationId/assign')
  @RequirePermissions('mentoring.allocation.manage')
  assign(@Param('activationId') id: string, @Body() dto: AssignMentorDto, @CurrentUser() user: RequestUser) {
    return this.allocation.allocate(id, dto, user.id);
  }

  @Post('allocation/:activationId/reassign')
  @RequirePermissions('mentoring.allocation.manage')
  reassign(@Param('activationId') id: string, @Body() dto: ReassignMentorDto, @CurrentUser() user: RequestUser) {
    return this.allocation.reassign(id, dto, user.id);
  }

  @Post('allocation/:activationId/transfer')
  @RequirePermissions('mentoring.allocation.manage')
  transfer(@Param('activationId') id: string, @Body() dto: TransferMentorDto, @CurrentUser() user: RequestUser) {
    return this.allocation.temporaryTransfer(id, dto, user.id);
  }

  @Post('allocation/:activationId/end-transfer')
  @RequirePermissions('mentoring.allocation.manage')
  endTransfer(@Param('activationId') id: string, @CurrentUser() user: RequestUser) {
    return this.allocation.endTransfer(id, user.id);
  }

  @Post('allocation/:activationId/return-to-queue')
  @RequirePermissions('mentoring.allocation.manage')
  returnToQueue(@Param('activationId') id: string, @Body() dto: ReturnToQueueDto, @CurrentUser() user: RequestUser) {
    return this.allocation.returnToQueue(id, dto.reason, user.id);
  }

  @Get('staff')
  @RequirePermissions('mentoring.staff.read')
  listStaff(@Query('role') role?: MentoringStaffRole) {
    return this.staff.list(role);
  }

  @Get('counselors')
  @RequirePermissions('mentoring.task.create')
  listCounselors() {
    return this.staff.listCounselors();
  }

  /** Creates the staff profile for Mentoring-department Mentors who do not have one yet (Head only). */
  @Post('staff/sync')
  @RequirePermissions('mentoring.staff.manage')
  syncStaff(@CurrentUser() user: RequestUser) {
    return this.staff.syncMentorsFromRoles(user.id);
  }

  @Put('staff/:userId')
  @RequirePermissions('mentoring.staff.manage')
  upsertStaff(@Param('userId') userId: string, @Body() dto: UpsertStaffDto, @CurrentUser() user: RequestUser) {
    return this.staff.upsert(userId, dto, user.id);
  }
}
