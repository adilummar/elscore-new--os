import { Module } from '@nestjs/common';

import { AuditModule } from '../../common/audit/audit.module';
import { PrismaModule } from '../../common/prisma/prisma.module';
import { RbacModule } from '../../common/rbac/rbac.module';

import { RoundRobinController } from './round-robin.controller';
import { RoundRobinService } from './round-robin.service';

@Module({
  imports: [
    PrismaModule, 
    AuditModule, 
    RbacModule,
  ],
  controllers: [RoundRobinController],
  providers: [
    RoundRobinService
  ],
  exports: [RoundRobinService],
})
export class RoundRobinModule {}
