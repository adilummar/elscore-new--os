import { Module } from '@nestjs/common';
import { AnalyticsController } from './analytics.controller';
import { SalesReportsController } from './sales-reports.controller';
import { AnalyticsService } from './analytics.service';
import { PrismaModule } from '../../common/prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [AnalyticsController, SalesReportsController],
  providers: [AnalyticsService],
  exports: [AnalyticsService],
})
export class AnalyticsModule {}
