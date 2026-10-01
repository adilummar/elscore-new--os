import { Controller, Get, Post, Body, Patch, Param, UseGuards } from '@nestjs/common';
import { PricingService } from './pricing.service';
import { JwtAuthGuard } from '../../common/auth/guards/jwt-auth.guard';
import { RequirePermissions } from '../../common/rbac/require-permissions.decorator';
import { CreatePricingSlabDto, UpdatePricingSlabDto, CreateExceptionalRateDto, UpdateExceptionalRateDto } from './dto/pricing.dto';
import { CurrentUser } from '../../common/auth/decorators/current-user.decorator';

@Controller('pricing')
@UseGuards(JwtAuthGuard)
export class PricingController {
  constructor(private readonly pricingService: PricingService) {}

  @Get('slabs')
  @RequirePermissions('pricing.manage')
  getSlabs() {
    return this.pricingService.getPricingSlabs();
  }

  @Post('slabs')
  @RequirePermissions('pricing.manage')
  createSlab(@Body() dto: CreatePricingSlabDto, @CurrentUser('id') userId: string) {
    return this.pricingService.createPricingSlab(dto, userId);
  }

  @Patch('slabs/:id/status')
  @RequirePermissions('pricing.manage')
  updateSlabStatus(@Param('id') id: string, @Body() dto: UpdatePricingSlabDto, @CurrentUser('id') userId: string) {
    return this.pricingService.updatePricingSlabStatus(id, dto, userId);
  }

  @Get('exceptional-rates')
  @RequirePermissions('pricing.manage')
  getExceptionalRates() {
    return this.pricingService.getExceptionalRates();
  }

  @Post('exceptional-rates')
  @RequirePermissions('pricing.manage')
  createExceptionalRate(@Body() dto: CreateExceptionalRateDto, @CurrentUser('id') userId: string) {
    return this.pricingService.createExceptionalRate(dto, userId);
  }

  @Patch('exceptional-rates/:id/status')
  @RequirePermissions('pricing.manage')
  updateExceptionalRateStatus(@Param('id') id: string, @Body() dto: UpdateExceptionalRateDto, @CurrentUser('id') userId: string) {
    return this.pricingService.updateExceptionalRateStatus(id, dto, userId);
  }
}
