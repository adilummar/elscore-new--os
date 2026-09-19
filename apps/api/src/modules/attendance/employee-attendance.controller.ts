import { Controller, Post, Patch, Get, Body, Param, UseGuards, Query, BadRequestException } from '@nestjs/common';
import { EmployeeAttendanceService } from './employee-attendance.service';
import { RequirePermissions } from '../../common/rbac/require-permissions.decorator';
import { CurrentUser, RequestUser } from '../../common/auth/decorators/current-user.decorator';

@Controller('attendance')
export class EmployeeAttendanceController {
  constructor(private readonly attendanceService: EmployeeAttendanceService) {}

  @Post('action')
  @RequirePermissions('attendance.action.own')
  async handleAction(@CurrentUser() user: RequestUser, @Body('action') action: string) {
    try {
      if (action === 'CHECK_IN') return await this.attendanceService.checkIn(user.id);
      if (action === 'BREAK_START') return await this.attendanceService.startBreak(user.id);
      if (action === 'BREAK_END') return await this.attendanceService.endBreak(user.id);
      if (action === 'CHECK_OUT') return await this.attendanceService.checkOut(user.id);
      throw new BadRequestException('Invalid action');
    } catch (e: any) {
      if (e.status && e.status < 500) throw e;
      throw new BadRequestException(e.message + (e.stack ? '\n' + e.stack : ''));
    }
  }

  @Get('status')
  @RequirePermissions('attendance.read.own')
  async getStatus(@CurrentUser() user: RequestUser) {
    return this.attendanceService.getMyStatus(user.id);
  }

  @Get('history')
  @RequirePermissions('attendance.read.own')
  async getHistory(@CurrentUser() user: RequestUser) {
    return this.attendanceService.getMyHistory(user.id);
  }

  @Get('team')
  @RequirePermissions('attendance.read.team')
  async getTeamAttendance(@Query('date') date: string) {
    return this.attendanceService.getTeamAttendance(date);
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
