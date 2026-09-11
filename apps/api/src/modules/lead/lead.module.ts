import { Module } from '@nestjs/common';

import { AuditModule } from '../../common/audit/audit.module';
import { IdGeneratorModule } from '../../common/id-generator/id-generator.module';
import { PrismaModule } from '../../common/prisma/prisma.module';
import { RbacModule } from '../../common/rbac/rbac.module';
import { RoundRobinModule } from '../round-robin/round-robin.module';

import { LeadController } from './lead.controller';
import { LeadService } from './lead.service';

@Module({
  imports: [PrismaModule, AuditModule, IdGeneratorModule, RbacModule, RoundRobinModule],
  controllers: [LeadController],
  providers: [LeadService],
  exports: [LeadService],
})
export class LeadModule {}
