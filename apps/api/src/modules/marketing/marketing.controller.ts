import { Controller, Post, Body, UseGuards, Req } from '@nestjs/common';
import { MarketingService } from './marketing.service';
import { IngestMarketingEventDto } from './dto/ingest-marketing-event.dto';
import { IntegrationAuthGuard, IntegrationRequest } from '../../common/auth/guards/integration-auth.guard';

@Controller('marketing')
export class MarketingController {
  constructor(private readonly marketingService: MarketingService) {}

  @Post('ingest')
  @UseGuards(IntegrationAuthGuard)
  async ingestEvent(
    @Req() req: IntegrationRequest,
    @Body() dto: IngestMarketingEventDto,
  ) {
    const provider = req.integration!.provider;
    return this.marketingService.ingestEvent(provider, dto);
  }
}
