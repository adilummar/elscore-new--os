import { Module } from '@nestjs/common';

import { AuditModule } from '../../common/audit/audit.module';
import { IdGeneratorModule } from '../../common/id-generator/id-generator.module';
import { PrismaModule } from '../../common/prisma/prisma.module';
import { RbacModule } from '../../common/rbac/rbac.module';

import { StudentController } from './student.controller';
import { StudentService } from './student.service';

@Module({
  imports: [PrismaModule, AuditModule, IdGeneratorModule, RbacModule],
  controllers: [StudentController],
  providers: [StudentService],
  exports: [StudentService],
})
export class StudentModule {}
