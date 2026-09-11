import { Controller, Post, Body, Param, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';

import { CurrentUser } from '../../common/auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/auth/guards/jwt-auth.guard';
import { RbacGuard } from '../../common/rbac/rbac.guard';
import { RequirePermissions } from '../../common/rbac/require-permissions.decorator';

import { RecordPaymentDto, ReversePaymentDto, RequestRefundDto } from './dto/payment.dto';
import { PaymentService } from './payment.service';

@ApiTags('finance')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RbacGuard)
@Controller('finance')
export class PaymentController {
  constructor(private readonly paymentService: PaymentService) {}

  @Post('payments')
  @RequirePermissions('finance.payment.create')
  @ApiOperation({ summary: 'Record a new payment' })
  recordPayment(@Body() dto: RecordPaymentDto, @CurrentUser() user: any) {
    return this.paymentService.recordPayment(dto, user.id);
  }

  @Post('payments/:id/reverse')
  @RequirePermissions('finance.payment.reverse')
  @ApiOperation({ summary: 'Reverse a payment' })
  reversePayment(@Param('id') id: string, @Body() dto: ReversePaymentDto, @CurrentUser() user: any) {
    return this.paymentService.reversePayment(id, dto, user.id);
  }

  @Post('refunds/request')
  @RequirePermissions('finance.refund.request')
  @ApiOperation({ summary: 'Request a refund' })
  requestRefund(@Body() dto: RequestRefundDto, @CurrentUser() user: any) {
    return this.paymentService.requestRefund(dto, user.id);
  }
}
