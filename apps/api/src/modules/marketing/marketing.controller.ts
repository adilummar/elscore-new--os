import { Controller, Post, Body, UseGuards, Req } from '@nestjs/common';
import { MarketingService } from './marketing.service';
import { IngestMarketingEventDto } from './dto/ingest-marketing-event.dto';
import { IntegrationAuthGuard, IntegrationRequest } from '../../common/auth/guards/integration-auth.guard';
import { Public } from '../../common/auth/decorators/public.decorator';

@Controller('marketing')
export class MarketingController {
  constructor(private readonly marketingService: MarketingService) {}

  @Public()
  @Post('ingest')
  @UseGuards(IntegrationAuthGuard)
  async ingestEvent(
    @Req() req: IntegrationRequest,
    @Body() dto: IngestMarketingEventDto,
  ) {
    const provider = req.integration!.provider;
    try {
      return await this.marketingService.ingestEvent(provider, dto);
    } catch (err: any) {
      console.error('MarketingController ingestEvent Error:', err);
      throw err;
    }
  }
}
