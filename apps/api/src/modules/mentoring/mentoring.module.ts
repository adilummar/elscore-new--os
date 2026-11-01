import { Module } from '@nestjs/common';

import { AuditModule } from '../../common/audit/audit.module';
import { PrismaModule } from '../../common/prisma/prisma.module';

import { MentoringHandoverService } from './mentoring-handover.service';

@Module({
  imports: [PrismaModule, AuditModule],
  providers: [MentoringHandoverService],
  exports: [MentoringHandoverService],
})
export class MentoringModule {}
