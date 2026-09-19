import { Module } from '@nestjs/common';
import { SalesTargetController } from './sales-target.controller';
import { SalesTargetService } from './sales-target.service';
import { RbacModule } from '../../common/rbac/rbac.module';
import { AuditModule } from '../../common/audit/audit.module';

@Module({
  imports: [RbacModule, AuditModule],
  controllers: [SalesTargetController],
  providers: [SalesTargetService],
  exports: [SalesTargetService],
})
export class SalesTargetModule {}
