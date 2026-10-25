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

import { CreatePayrollRunDto } from './dto/create-payroll-run.dto';
import { RecordPaymentDto } from './dto/record-payment.dto';
import { EmployeePayrollService } from './employee-payroll.service';

@ApiTags('Employee Payroll')
@ApiBearerAuth()
@UseGuards(RbacGuard)
@Controller('payroll')
export class EmployeePayrollController {
  constructor(private readonly payrollService: EmployeePayrollService) {}

  @Post('runs')
  @RequirePermissions('payroll.run.manage')
  @ApiOperation({ summary: 'Generate a new draft employee payroll run' })
  async createDraftRun(
    @Body() dto: CreatePayrollRunDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.payrollService.createDraftRun(dto, user.id);
  }

  @Get('runs')
  @RequirePermissions('payroll.run.read')
  @ApiOperation({ summary: 'List employee payroll runs' })
  async getRuns(@Query('status') status?: PayrollRunStatus) {
    return this.payrollService.getRuns(status);
  }

  @Get('runs/:id')
  @RequirePermissions('payroll.run.read')
  @ApiOperation({ summary: 'Get employee payroll run details with line items' })
  async getRunById(@Param('id') id: string) {
    return this.payrollService.getRunById(id);
  }

  @Patch('runs/:id/finalize')
  @RequirePermissions('payroll.run.finalize')
  @ApiOperation({ summary: 'Finalize an employee payroll run (freeze amounts)' })
  async finalizeRun(
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.payrollService.finalizeRun(id, user.id);
  }

  @Patch('runs/:id/cancel')
  @RequirePermissions('payroll.run.manage')
  @ApiOperation({ summary: 'Cancel a draft employee payroll run' })
  async cancelDraftRun(
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.payrollService.cancelDraftRun(id, user.id);
  }

  @Patch('items/:id/payment')
  @RequirePermissions('payroll.payment.manage')
  @ApiOperation({ summary: 'Record payment confirmation for a finalized payroll item' })
  async recordPayment(
    @Param('id') itemId: string,
    @Body() dto: RecordPaymentDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.payrollService.recordItemPayment(itemId, dto, user.id);
  }
}
