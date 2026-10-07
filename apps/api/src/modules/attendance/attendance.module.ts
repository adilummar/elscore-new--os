import { Module } from '@nestjs/common';

import { AttendanceAutoCheckoutProcessor } from './attendance-auto-checkout.processor';
import { AttendanceController } from './attendance.controller';
import { AttendanceService } from './attendance.service';
import { EmployeeAttendanceController } from './employee-attendance.controller';
import { EmployeeAttendanceService } from './employee-attendance.service';
import { MissedCheckoutService } from './missed-checkout.service';

@Module({
  controllers: [AttendanceController, EmployeeAttendanceController],
  providers: [
    AttendanceService,
    EmployeeAttendanceService,
    MissedCheckoutService,
    AttendanceAutoCheckoutProcessor,
  ],
  exports: [
    AttendanceService,
    EmployeeAttendanceService,
    MissedCheckoutService,
    AttendanceAutoCheckoutProcessor,
  ],
})
export class AttendanceModule {}
