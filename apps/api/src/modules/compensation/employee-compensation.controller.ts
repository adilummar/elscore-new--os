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
import { CompensationRequestStatus } from '@prisma/client';

import { CurrentUser, RequestUser } from '../../common/auth/decorators/current-user.decorator';
import { RbacGuard } from '../../common/rbac/rbac.guard';
import { RequirePermissions } from '../../common/rbac/require-permissions.decorator';

import { CreateCompensationRequestDto } from './dto/create-compensation-request.dto';
import { ReviewCompensationRequestDto } from './dto/review-compensation-request.dto';
import { EmployeeCompensationService } from './employee-compensation.service';

@ApiTags('Employee Compensation')
@ApiBearerAuth()
@UseGuards(RbacGuard)
@Controller()
export class EmployeeCompensationController {
  constructor(private readonly compensationService: EmployeeCompensationService) {}

  @Get('employees/:id/compensation/active')
  @RequirePermissions('compensation.read')
  @ApiOperation({ summary: 'Get active compensation details for an employee' })
  async getActiveCompensation(@Param('id') employeeId: string) {
    return this.compensationService.getActiveCompensation(employeeId);
  }

  @Get('employees/:id/compensation/history')
  @RequirePermissions('compensation.read')
  @ApiOperation({ summary: 'Get compensation and salary history for an employee' })
  async getCompensationHistory(@Param('id') employeeId: string) {
    return this.compensationService.getCompensationHistory(employeeId);
  }

  @Post('employees/:id/compensation/request')
  @RequirePermissions('compensation.manage')
  @ApiOperation({ summary: 'Submit a compensation change request for CEO approval' })
  async requestChange(
    @Param('id') employeeId: string,
    @Body() dto: CreateCompensationRequestDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.compensationService.requestChange(employeeId, dto, user.id);
  }

  @Get('compensation/requests')
  @RequirePermissions('compensation.read')
  @ApiOperation({ summary: 'List compensation change requests' })
  async getChangeRequests(
    @Query('employeeId') employeeId?: string,
    @Query('status') status?: CompensationRequestStatus,
  ) {
    return this.compensationService.getChangeRequests({ employeeId, status });
  }

  @Patch('compensation/requests/:id/review')
  @RequirePermissions('compensation.approve')
  @ApiOperation({ summary: 'Approve or reject a compensation change request (CEO only)' })
  async reviewChange(
    @Param('id') requestId: string,
    @Body() dto: ReviewCompensationRequestDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.compensationService.reviewChange(requestId, dto, user.id);
  }

  @Post('compensation/sweep-activations')
  @RequirePermissions('compensation.manage')
  @ApiOperation({ summary: 'Sweep and activate due approved compensation changes' })
  async sweepActivations() {
    const activatedCount = await this.compensationService.activatePendingApprovedCompensations();
    return { activatedCount, message: `Activated ${activatedCount} due compensation records.` };
  }
}
