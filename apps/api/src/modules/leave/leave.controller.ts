import {
  Controller,
  Post,
  Get,
  Patch,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { LeaveService } from './leave.service';
import { CreateLeaveRequestDto } from './dto/create-leave-request.dto';
import { ReviewLeaveRequestDto } from './dto/review-leave-request.dto';
import { QueryLeaveRequestsDto } from './dto/query-leave-requests.dto';
import { RequirePermissions } from '../../common/rbac/require-permissions.decorator';
import { CurrentUser, RequestUser } from '../../common/auth/decorators/current-user.decorator';

@Controller('leaves')
export class LeaveController {
  constructor(private readonly leaveService: LeaveService) {}

  /**
   * POST /leaves
   * Submit a new leave request.
   */
  @Post()
  @RequirePermissions('leave.request.own')
  async createLeaveRequest(
    @CurrentUser() user: RequestUser,
    @Body() dto: CreateLeaveRequestDto,
  ) {
    return this.leaveService.createLeaveRequest(user.id, dto);
  }

  /**
   * GET /leaves/my
   * View all leave requests belonging to the current authenticated employee.
   */
  @Get('my')
  @RequirePermissions('leave.request.own')
  async getMyLeaveRequests(@CurrentUser() user: RequestUser) {
    return this.leaveService.getMyLeaveRequests(user.id);
  }

  /**
   * PATCH /leaves/:id/cancel
   * Cancel an employee's own pending leave request.
   */
  @Patch(':id/cancel')
  @RequirePermissions('leave.request.own')
  async cancelLeaveRequest(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
  ) {
    return this.leaveService.cancelLeaveRequest(user.id, id);
  }

  /**
   * GET /leaves
   * View and filter all employee leave requests (HR / Managers).
   */
  @Get()
  @RequirePermissions('leave.read.all')
  async getAllLeaveRequests(
    @CurrentUser() user: RequestUser,
    @Query() query: QueryLeaveRequestsDto,
  ) {
    return this.leaveService.getAllLeaveRequests(query, user.id);
  }

  /**
   * GET /leaves/:id
   * Get specific leave request detail by ID.
   */
  @Get(':id')
  @RequirePermissions('leave.read.all')
  async getLeaveRequestById(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
  ) {
    return this.leaveService.getLeaveRequestById(id, user.id);
  }

  /**
   * PATCH /leaves/:id/review
   * Approve or reject a pending leave request (HR / Managers).
   */
  @Patch(':id/review')
  @RequirePermissions('leave.manage')
  async reviewLeaveRequest(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Body() dto: ReviewLeaveRequestDto,
  ) {
    return this.leaveService.reviewLeaveRequest(user.id, id, dto);
  }
}
