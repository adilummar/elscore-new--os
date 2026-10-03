import { Controller, Get, Post, Body, Patch, Param, UseGuards } from '@nestjs/common';

import { CurrentUser, RequestUser } from '../../common/auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/auth/guards/jwt-auth.guard';
import { RequirePermissions } from '../../common/rbac/require-permissions.decorator';

import {
  CreatePricingSlabDto,
  UpdatePricingSlabDto,
  CreateExceptionalRateDto,
  UpdateExceptionalRateDto,
  UpsertFinanceSettingDto,
} from './dto/pricing.dto';
import { PricingService } from './pricing.service';


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
  createSlab(@Body() dto: CreatePricingSlabDto, @CurrentUser() user: RequestUser) {
    return this.pricingService.createPricingSlab(dto, user.id);
  }

  @Patch('slabs/:id/status')
  @RequirePermissions('pricing.manage')
  updateSlabStatus(@Param('id') id: string, @Body() dto: UpdatePricingSlabDto, @CurrentUser() user: RequestUser) {
    return this.pricingService.updatePricingSlabStatus(id, dto, user.id);
  }

  @Get('exceptional-rates')
  @RequirePermissions('pricing.manage')
  getExceptionalRates() {
    return this.pricingService.getExceptionalRates();
  }

  @Post('exceptional-rates')
  @RequirePermissions('pricing.manage')
  createExceptionalRate(@Body() dto: CreateExceptionalRateDto, @CurrentUser() user: RequestUser) {
    return this.pricingService.createExceptionalRate(dto, user.id);
  }

  @Patch('exceptional-rates/:id/status')
  @RequirePermissions('pricing.manage')
  updateExceptionalRateStatus(
    @Param('id') id: string,
    @Body() dto: UpdateExceptionalRateDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.pricingService.updateExceptionalRateStatus(id, dto, user.id);
  }

  @Get('finance-settings')
  @RequirePermissions('pricing.manage')
  getFinanceSetting() {
    return this.pricingService.getFinanceSetting();
  }

  @Patch('finance-settings')
  @RequirePermissions('pricing.manage')
  upsertFinanceSetting(@Body() dto: UpsertFinanceSettingDto, @CurrentUser() user: RequestUser) {
    return this.pricingService.upsertFinanceSetting(dto, user.id);
  }
}
