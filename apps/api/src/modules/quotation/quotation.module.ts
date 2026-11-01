import { Module } from '@nestjs/common';

import { AuditModule } from '../../common/audit/audit.module';
import { IdGeneratorModule } from '../../common/id-generator/id-generator.module';
import { MentoringModule } from '../mentoring/mentoring.module';
import { PricingModule } from '../pricing/pricing.module';

import { PdfService } from './pdf.service';
import { QuotationController } from './quotation.controller';
import { QuotationService } from './quotation.service';

@Module({
  imports: [AuditModule, IdGeneratorModule, PricingModule, MentoringModule],
  controllers: [QuotationController],
  providers: [QuotationService, PdfService],
})
export class QuotationModule {}
