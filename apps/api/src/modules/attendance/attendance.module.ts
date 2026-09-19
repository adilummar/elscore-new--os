import { Module } from '@nestjs/common';

import { AttendanceController } from './attendance.controller';
import { AttendanceService } from './attendance.service';
import { EmployeeAttendanceService } from './employee-attendance.service';
import { EmployeeAttendanceController } from './employee-attendance.controller';
import { AttendanceAutoCheckoutProcessor } from './attendance-auto-checkout.processor';

@Module({
  controllers: [AttendanceController, EmployeeAttendanceController],
  providers: [AttendanceService, EmployeeAttendanceService, AttendanceAutoCheckoutProcessor],
  exports: [AttendanceService, EmployeeAttendanceService],
})
export class AttendanceModule {}
