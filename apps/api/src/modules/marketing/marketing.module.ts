import { Module } from '@nestjs/common';

import { RbacModule } from '../../common/rbac/rbac.module';
import { LeadModule } from '../lead/lead.module';

import { MarketingController } from './marketing.controller';
import { MarketingService } from './marketing.service';

@Module({
  imports: [LeadModule, RbacModule],
  controllers: [MarketingController],
  providers: [MarketingService],
  exports: [MarketingService],
})
export class MarketingModule {}
