import { Controller, Post, Patch, Get, Body, Param, Query, BadRequestException } from '@nestjs/common';

import { CurrentUser, RequestUser } from '../../common/auth/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/rbac/require-permissions.decorator';

import { RejectMissedCheckoutDto } from './dto/missed-checkout.dto';
import { EmployeeAttendanceService } from './employee-attendance.service';
import { MissedCheckoutService } from './missed-checkout.service';

@Controller('attendance')
export class EmployeeAttendanceController {
  constructor(
    private readonly attendanceService: EmployeeAttendanceService,
    private readonly missedCheckoutService: MissedCheckoutService,
  ) {}

  @Post('action')
  @RequirePermissions('attendance.action.own')
  async handleAction(@CurrentUser() user: RequestUser, @Body('action') action: string, @Body('note') note?: string) {
    if (action === 'CHECK_IN') return this.attendanceService.checkIn(user.id, undefined, note);
    if (action === 'BREAK_START') return this.attendanceService.startBreak(user.id);
    if (action === 'BREAK_END') return this.attendanceService.endBreak(user.id);
    if (action === 'CHECK_OUT') return this.attendanceService.checkOut(user.id);
    throw new BadRequestException('Invalid action');
  }

  @Get('status')
  @RequirePermissions('attendance.read.own')
  async getStatus(@CurrentUser() user: RequestUser) {
    return this.attendanceService.getMyStatus(user.id);
  }

  @Get('daily-summary')
  @RequirePermissions('attendance.read.own')
  async getDailySummary(@CurrentUser() user: RequestUser) {
    return this.attendanceService.getDailyTaskSummary(user.id);
  }

  @Get('history')
  @RequirePermissions('attendance.read.own')
  async getHistory(@CurrentUser() user: RequestUser) {
    return this.attendanceService.getMyHistory(user.id);
  }

  @Get('missed-checkouts/current')
  @RequirePermissions('attendance.read.own')
  async getOwnMissedCheckout(@CurrentUser() user: RequestUser) {
    return this.missedCheckoutService.getOwnCurrent(user.id);
  }

  @Post('missed-checkouts/:id/request')
  @RequirePermissions('attendance.action.own')
  async requestMissedCheckoutApproval(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
  ) {
    return this.missedCheckoutService.requestApproval(user.id, id);
  }

  @Get('missed-checkouts')
  @RequirePermissions('attendance.missed-checkout.approve')
  async listMissedCheckouts(@CurrentUser() user: RequestUser) {
    return this.missedCheckoutService.listForManagement(user.id);
  }

  @Post('missed-checkouts/:id/approve')
  @RequirePermissions('attendance.missed-checkout.approve')
  async approveMissedCheckout(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.missedCheckoutService.approve(user.id, id);
  }

  @Post('missed-checkouts/:id/reject')
  @RequirePermissions('attendance.missed-checkout.approve')
  async rejectMissedCheckout(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Body() dto: RejectMissedCheckoutDto,
  ) {
    return this.missedCheckoutService.reject(user.id, id, dto.reason);
  }

  @Post('missed-checkouts/:id/resolve')
  @RequirePermissions('attendance.missed-checkout.approve')
  async resolveMissedCheckout(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.missedCheckoutService.resolve(user.id, id);
  }

  @Get('team')
  @RequirePermissions('attendance.read.team')
  async getTeamAttendance(@Query('date') date: string) {
    return this.attendanceService.getTeamAttendance(date);
  }

  /**
   * GET /attendance/staffs
   * CEO / managers: all employees.
   * Department heads: scoped to their own department via ?departmentId=
   */
  @Get('staffs')
  @RequirePermissions('attendance.read.team')
  async getAllStaffs(@CurrentUser() user: RequestUser, @Query('departmentId') departmentId?: string) {
    return this.attendanceService.getAllStaffsWithAttendance(user.id, departmentId);
  }

  /**
   * GET /attendance/staffs/:employeeId
   * Full staff detail — today's session + last 14 days history.
   */
  @Get('staffs/:employeeId')
  @RequirePermissions('attendance.read.team')
  async getStaffDetail(@Param('employeeId') employeeId: string) {
    return this.attendanceService.getStaffDetail(employeeId);
  }

  @Patch('event/:eventId/correct')
  @RequirePermissions('attendance.correct')
  async correctEvent(
    @CurrentUser() user: RequestUser,
    @Param('eventId') eventId: string,
    @Body() dto: { sessionId: string; newTimestamp: string; reason: string }
  ) {
    return this.attendanceService.correctAttendance(
      user.id,
      dto.sessionId,
      eventId,
      new Date(dto.newTimestamp),
      dto.reason
    );
  }
}
