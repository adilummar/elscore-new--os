import { Controller, Post, Body, Param, Get, UseGuards } from '@nestjs/common';

import { CurrentUser } from '../../common/auth/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/rbac/require-permissions.decorator';

import { AttendanceService } from './attendance.service';
import { SubmitTutorClassRecordDto, CorrectAttendanceDto } from './dto/attendance.dto';

@Controller('attendance')
export class AttendanceController {
  constructor(private readonly attendanceService: AttendanceService) {}

  @Post('tutor-class-record')
  @RequirePermissions('attendance.tutor.mark')
  async submitClassRecord(
    @CurrentUser() user: any,
    @Body() dto: SubmitTutorClassRecordDto
  ) {
    return this.attendanceService.submitClassRecord(user.id, dto);
  }

  @Post('tutor-class-record/:id/verify')
  @RequirePermissions('attendance.tutor.verify')
  async verifyClassRecord(
    @CurrentUser() user: any,
    @Param('id') id: string
  ) {
    return this.attendanceService.verifyClassRecord(user.id, id);
  }

  @Post('tutor-class-record/:id/correct')
  @RequirePermissions('attendance.tutor.correct')
  async correctTutorRecord(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body() dto: CorrectAttendanceDto
  ) {
    return this.attendanceService.correctTutorRecord(user.id, id, dto);
  }

  @Post('student-attendance/:id/correct')
  @RequirePermissions('attendance.student.correct')
  async correctStudentAttendance(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body() dto: CorrectAttendanceDto
  ) {
    return this.attendanceService.correctStudentAttendance(user.id, id, dto);
  }

  @Get('tutor-class-record/:id')
  @RequirePermissions('attendance.tutor.read')
  async getClassRecord(@Param('id') id: string) {
    return this.attendanceService.getClassRecord(id);
  }
}
