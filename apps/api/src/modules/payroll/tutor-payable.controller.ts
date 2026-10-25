import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PayrollRunStatus } from '@prisma/client';

import { CurrentUser, RequestUser } from '../../common/auth/decorators/current-user.decorator';
import { RbacGuard } from '../../common/rbac/rbac.guard';
import { RequirePermissions } from '../../common/rbac/require-permissions.decorator';

import { CreateTutorPayableRunDto } from './dto/create-tutor-payable-run.dto';
import { RecordPaymentDto } from './dto/record-payment.dto';
import { TutorPayableService } from './tutor-payable.service';

@ApiTags('Tutor Payables')
@ApiBearerAuth()
@UseGuards(RbacGuard)
@Controller('tutor-payables')
export class TutorPayableController {
  constructor(private readonly payableService: TutorPayableService) {}

  @Post('runs')
  @RequirePermissions('tutor.payable.manage')
  @ApiOperation({ summary: 'Generate a new draft tutor payable run' })
  async createDraftRun(
    @Body() dto: CreateTutorPayableRunDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.payableService.createDraftRun(dto, user.id);
  }

  @Get('runs')
  @RequirePermissions('tutor.payable.read')
  @ApiOperation({ summary: 'List tutor payable runs' })
  async getRuns(@Query('status') status?: PayrollRunStatus) {
    return this.payableService.getRuns(status);
  }

  @Get('runs/:id')
  @RequirePermissions('tutor.payable.read')
  @ApiOperation({ summary: 'Get tutor payable run details with class line items' })
  async getRunById(@Param('id') id: string) {
    return this.payableService.getRunById(id);
  }

  @Patch('runs/:id/finalize')
  @RequirePermissions('tutor.payable.finalize')
  @ApiOperation({ summary: 'Finalize a tutor payable run (freeze amounts and locks classes)' })
  async finalizeRun(
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.payableService.finalizeRun(id, user.id);
  }

  @Patch('runs/:id/cancel')
  @RequirePermissions('tutor.payable.manage')
  @ApiOperation({ summary: 'Cancel a draft tutor payable run' })
  async cancelDraftRun(
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.payableService.cancelDraftRun(id, user.id);
  }

  @Patch('items/:id/payment')
  @RequirePermissions('payroll.payment.manage')
  @ApiOperation({ summary: 'Record payment confirmation for a finalized tutor payable item' })
  async recordPayment(
    @Param('id') itemId: string,
    @Body() dto: RecordPaymentDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.payableService.recordItemPayment(itemId, dto, user.id);
  }
}
