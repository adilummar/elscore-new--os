import { Module } from '@nestjs/common';
import { QuotationService } from './quotation.service';
import { QuotationController } from './quotation.controller';
import { PdfService } from './pdf.service';
import { AuditModule } from '../../common/audit/audit.module';
import { IdGeneratorModule } from '../../common/id-generator/id-generator.module';
import { PricingModule } from '../pricing/pricing.module';

@Module({
  imports: [AuditModule, IdGeneratorModule, PricingModule],
  controllers: [QuotationController],
  providers: [QuotationService, PdfService],
})
export class QuotationModule {}
