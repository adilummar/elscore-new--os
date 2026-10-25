import { Module } from '@nestjs/common';

import { AuditModule } from '../../common/audit/audit.module';
import { PrismaModule } from '../../common/prisma/prisma.module';
import { RbacModule } from '../../common/rbac/rbac.module';

import { EmployeeCompensationController } from './employee-compensation.controller';
import { EmployeeCompensationService } from './employee-compensation.service';

@Module({
  imports: [PrismaModule, AuditModule, RbacModule],
  controllers: [EmployeeCompensationController],
  providers: [EmployeeCompensationService],
  exports: [EmployeeCompensationService],
})
export class CompensationModule {}
