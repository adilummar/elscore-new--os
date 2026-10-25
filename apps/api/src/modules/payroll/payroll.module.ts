import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { AuditModule } from '../../common/audit/audit.module';
import { IdGeneratorModule } from '../../common/id-generator/id-generator.module';
import { PrismaModule } from '../../common/prisma/prisma.module';
import { RbacModule } from '../../common/rbac/rbac.module';

import { EmployeePayrollController } from './employee-payroll.controller';
import { EmployeePayrollService } from './employee-payroll.service';
import { TutorPayableController } from './tutor-payable.controller';
import { TutorPayableService } from './tutor-payable.service';

@Module({
  imports: [
    PrismaModule,
    AuditModule,
    RbacModule,
    IdGeneratorModule,
    ConfigModule,
  ],
  controllers: [EmployeePayrollController, TutorPayableController],
  providers: [EmployeePayrollService, TutorPayableService],
  exports: [EmployeePayrollService, TutorPayableService],
})
export class PayrollModule {}
