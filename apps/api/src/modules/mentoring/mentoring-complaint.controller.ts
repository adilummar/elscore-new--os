import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';

import { CurrentUser, RequestUser } from '../../common/auth/decorators/current-user.decorator';
import { RbacGuard } from '../../common/rbac/rbac.guard';
import { RequirePermissions } from '../../common/rbac/require-permissions.decorator';

import { MentoringAccessService } from './mentoring-access.service';
import { MentoringComplaintService } from './mentoring-complaint.service';
import { ComplaintQueryDto } from './mentoring.dto';

type Body_ = Record<string, unknown>;

/**
 * Parent complaints. Parents have no login, so every route is for staff: the Mentor logs and handles a complaint for the parent.
 * Reading is scoped in the database query to the students the caller may see (and complaints assigned to them). Every change needs
 * the complaint permission AND is checked again in the service: only the student's Mentor, the person it is assigned to, or the
 * Mentoring Head can act on it.
 */
@UseGuards(RbacGuard)
@Controller('mentoring')
export class MentoringComplaintController {
  constructor(
    private readonly complaints: MentoringComplaintService,
    private readonly access: MentoringAccessService,
  ) {}

  @Get('complaints')
  async list(@Query() query: ComplaintQueryDto, @CurrentUser() user: RequestUser) {
    return this.complaints.list(await this.access.scopeFor(user.id), query);
  }

  /** Staff a complaint can be assigned or escalated to. */
  @Get('complaints/handlers')
  async handlers(@CurrentUser() user: RequestUser) {
    return this.complaints.handlers(await this.access.scopeFor(user.id));
  }

  @Get('complaints/:complaintId')
  async detail(@Param('complaintId') complaintId: string, @CurrentUser() user: RequestUser) {
    return this.complaints.detail(complaintId, await this.access.scopeFor(user.id));
  }

  @Post('students/:activationId/complaints')
  @RequirePermissions('mentoring.complaint.handle')
  create(@Param('activationId') activationId: string, @Body() body: Body_, @CurrentUser() user: RequestUser) {
    return this.complaints.create(activationId, body, user.id);
  }

  @Post('complaints/:complaintId/acknowledge')
  @RequirePermissions('mentoring.complaint.handle')
  acknowledge(@Param('complaintId') complaintId: string, @Body() body: Body_, @CurrentUser() user: RequestUser) {
    return this.complaints.acknowledge(complaintId, body, user.id);
  }

  @Post('complaints/:complaintId/remark')
  @RequirePermissions('mentoring.complaint.handle')
  remark(@Param('complaintId') complaintId: string, @Body() body: Body_, @CurrentUser() user: RequestUser) {
    return this.complaints.addRemark(complaintId, body, user.id);
  }

  @Post('complaints/:complaintId/action')
  @RequirePermissions('mentoring.complaint.handle')
  action(@Param('complaintId') complaintId: string, @Body() body: Body_, @CurrentUser() user: RequestUser) {
    return this.complaints.addAction(complaintId, body, user.id);
  }

  @Post('complaints/:complaintId/respond')
  @RequirePermissions('mentoring.complaint.handle')
  respond(@Param('complaintId') complaintId: string, @Body() body: Body_, @CurrentUser() user: RequestUser) {
    return this.complaints.respondToParent(complaintId, body, user.id);
  }

  @Post('complaints/:complaintId/parent-message')
  @RequirePermissions('mentoring.complaint.handle')
  parentMessage(@Param('complaintId') complaintId: string, @Body() body: Body_, @CurrentUser() user: RequestUser) {
    return this.complaints.recordParentMessage(complaintId, body, user.id);
  }

  @Post('complaints/:complaintId/assign')
  @RequirePermissions('mentoring.complaint.handle')
  assign(@Param('complaintId') complaintId: string, @Body() body: Body_, @CurrentUser() user: RequestUser) {
    return this.complaints.assign(complaintId, body, user.id);
  }

  @Post('complaints/:complaintId/status')
  @RequirePermissions('mentoring.complaint.handle')
  status(@Param('complaintId') complaintId: string, @Body() body: Body_, @CurrentUser() user: RequestUser) {
    return this.complaints.setStatus(complaintId, body, user.id);
  }

  @Post('complaints/:complaintId/resolve')
  @RequirePermissions('mentoring.complaint.handle')
  resolve(@Param('complaintId') complaintId: string, @Body() body: Body_, @CurrentUser() user: RequestUser) {
    return this.complaints.resolve(complaintId, body, user.id);
  }

  @Post('complaints/:complaintId/reopen')
  @RequirePermissions('mentoring.complaint.handle')
  reopen(@Param('complaintId') complaintId: string, @Body() body: Body_, @CurrentUser() user: RequestUser) {
    return this.complaints.reopen(complaintId, body, user.id);
  }
}
