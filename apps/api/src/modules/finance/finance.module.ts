import { Module } from '@nestjs/common';

import { AuditModule } from '../../common/audit/audit.module';
import { IdGeneratorModule } from '../../common/id-generator/id-generator.module';
import { PrismaModule } from '../../common/prisma/prisma.module';

import { InvoiceController } from './invoice.controller';
import { InvoiceService } from './invoice.service';
import { PaymentController } from './payment.controller';
import { PaymentService } from './payment.service';

@Module({
  imports: [PrismaModule, IdGeneratorModule, AuditModule],
  controllers: [InvoiceController, PaymentController],
  providers: [InvoiceService, PaymentService],
  exports: [InvoiceService, PaymentService],
})
export class FinanceModule {}
