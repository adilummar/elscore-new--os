import { Body, Controller, Get, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { CurrentUser, RequestUser } from '../../../common/auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../../common/auth/guards/jwt-auth.guard';
import { RbacGuard } from '../../../common/rbac/rbac.guard';
import { RequirePermissions } from '../../../common/rbac/require-permissions.decorator';

import { PAY_SLAB_CREATE, PAY_SLAB_READ } from './pay-slab.constants';
import { CreatePaySlabDto } from './pay-slab.dto';
import { PaySlabService } from './pay-slab.service';

/**
 * Pay Slabs (Payroll PDF, section 2). Create and read only: there is no PATCH, PUT or DELETE,
 * because a created slab and its rates can never be edited or deleted.
 */
@ApiTags('Tutor HR Pay Slabs')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RbacGuard)
@Controller('tutor-hr/pay-slabs')
export class PaySlabController {
  constructor(private readonly service: PaySlabService) {}

  @Get()
  @RequirePermissions(PAY_SLAB_READ)
  list() {
    return this.service.list();
  }

  @Get(':id')
  @RequirePermissions(PAY_SLAB_READ)
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.get(id);
  }

  @Post()
  @RequirePermissions(PAY_SLAB_CREATE)
  @ApiOperation({
    summary: 'Create a slab with its 13 grade rates. It can never be edited or deleted afterwards.',
  })
  create(@Body() dto: CreatePaySlabDto, @CurrentUser() user: RequestUser) {
    return this.service.create(dto, user.id);
  }
}
