import { Module } from '@nestjs/common';

import { AuditModule } from '../../common/audit/audit.module';
import { IdGeneratorModule } from '../../common/id-generator/id-generator.module';
import { PrismaModule } from '../../common/prisma/prisma.module';
import { RbacModule } from '../../common/rbac/rbac.module';

import { OnboardingController } from './onboarding.controller';
import { OnboardingService } from './onboarding.service';
import { OnboardingStorageService } from './onboarding-storage.service';

@Module({
  imports: [PrismaModule, AuditModule, IdGeneratorModule, RbacModule],
  controllers: [OnboardingController],
  providers: [OnboardingService, OnboardingStorageService],
  exports: [OnboardingService, OnboardingStorageService],
})
export class OnboardingModule {}
