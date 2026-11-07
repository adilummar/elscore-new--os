import { Body, Controller, Get, Param, ParseIntPipe, Patch, Post, Put, Query, UseGuards } from '@nestjs/common';

import { CurrentUser, RequestUser } from '../../common/auth/decorators/current-user.decorator';
import { RbacGuard } from '../../common/rbac/rbac.guard';
import { RequirePermissions } from '../../common/rbac/require-permissions.decorator';

import { MentoringAccessService } from './mentoring-access.service';
import { MentoringWorkflowService } from './mentoring-workflow.service';
import {
  ApprovalDecisionDto,
  BlockDto,
  CancelDto,
  ExceptionDto,
  PauseDto,
  ResumeDto,
  SetFieldVerificationDto,
  StudentListQueryDto,
  UpdateChecklistItemDto,
  UpdateHandoverFieldDto,
} from './mentoring.dto';

/**
 * Student workflow. Read endpoints are scoped in the database query (department-wide for the Head/CEO,
 * own students for a Mentor, students with an assigned task for a Counselor). Mutations are gated by
 * route permission AND by assignment checks in the service.
 */
@UseGuards(RbacGuard)
@Controller('mentoring/students')
export class MentoringWorkflowController {
  constructor(
    private readonly workflow: MentoringWorkflowService,
    private readonly access: MentoringAccessService,
  ) {}

  @Get()
  async list(@Query() query: StudentListQueryDto, @CurrentUser() user: RequestUser) {
    return this.workflow.list(await this.access.scopeFor(user.id), query);
  }

  @Get(':activationId')
  async workspace(@Param('activationId') id: string, @CurrentUser() user: RequestUser) {
    return this.workflow.getWorkspace(id, await this.access.scopeFor(user.id));
  }

  @Get(':activationId/events')
  async events(@Param('activationId') id: string, @CurrentUser() user: RequestUser) {
    return this.workflow.events(id, await this.access.scopeFor(user.id));
  }

  /** Fill in or correct one admission-handover field (assigned Mentor). The Sales data is never overwritten. */
  @Put(':activationId/handover/fields/:fieldKey')
  @RequirePermissions('mentoring.stage.work')
  updateHandoverField(
    @Param('activationId') id: string,
    @Param('fieldKey') fieldKey: string,
    @Body() dto: UpdateHandoverFieldDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.workflow.updateHandoverField(id, fieldKey, dto.value, user.id, dto.basedOn);
  }

  /** Confirm a field with the parent, or withdraw the confirmation (assigned Mentor). Separate from collecting the value. */
  @Put(':activationId/handover/fields/:fieldKey/verification')
  @RequirePermissions('mentoring.stage.work')
  setHandoverFieldVerification(
    @Param('activationId') id: string,
    @Param('fieldKey') fieldKey: string,
    @Body() dto: SetFieldVerificationDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.workflow.setHandoverFieldVerification(id, fieldKey, dto, user.id);
  }

  @Post(':activationId/stages/:stage/start')
  @RequirePermissions('mentoring.stage.work')
  startStage(@Param('activationId') id: string, @Param('stage', ParseIntPipe) stage: number, @CurrentUser() user: RequestUser) {
    return this.workflow.startStage(id, stage, user.id);
  }

  @Patch(':activationId/stages/:stage/items/:itemKey')
  @RequirePermissions('mentoring.stage.work')
  updateItem(
    @Param('activationId') id: string,
    @Param('stage', ParseIntPipe) stage: number,
    @Param('itemKey') itemKey: string,
    @Body() dto: UpdateChecklistItemDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.workflow.updateChecklistItem(id, stage, itemKey, dto, user.id);
  }

  @Post(':activationId/stages/:stage/verify')
  @RequirePermissions('mentoring.stage.verify')
  verifyStage(@Param('activationId') id: string, @Param('stage', ParseIntPipe) stage: number, @CurrentUser() user: RequestUser) {
    return this.workflow.verifyStage(id, stage, user.id);
  }

  @Post(':activationId/stages/:stage/exceptions/:itemKey')
  @RequirePermissions('mentoring.exception.authorize')
  authorizeException(
    @Param('activationId') id: string,
    @Param('stage', ParseIntPipe) stage: number,
    @Param('itemKey') itemKey: string,
    @Body() dto: ExceptionDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.workflow.authorizeException(id, stage, itemKey, dto.reason, user.id);
  }

  @Post(':activationId/pause')
  @RequirePermissions('mentoring.workflow.pause')
  async pause(@Param('activationId') id: string, @Body() dto: PauseDto, @CurrentUser() user: RequestUser) {
    return this.workflow.pause(id, dto, await this.access.scopeFor(user.id));
  }

  @Post(':activationId/block')
  @RequirePermissions('mentoring.workflow.pause')
  async block(@Param('activationId') id: string, @Body() dto: BlockDto, @CurrentUser() user: RequestUser) {
    return this.workflow.block(id, dto, await this.access.scopeFor(user.id));
  }

  @Post(':activationId/resume')
  @RequirePermissions('mentoring.workflow.pause')
  async resume(@Param('activationId') id: string, @Body() dto: ResumeDto, @CurrentUser() user: RequestUser) {
    return this.workflow.resume(id, dto.resolution, await this.access.scopeFor(user.id));
  }

  @Post(':activationId/approval')
  @RequirePermissions('mentoring.approval.final')
  decideApproval(@Param('activationId') id: string, @Body() dto: ApprovalDecisionDto, @CurrentUser() user: RequestUser) {
    return this.workflow.decideApproval(id, dto, user.id);
  }

  @Post(':activationId/cancel')
  @RequirePermissions('mentoring.activation.cancel')
  cancel(@Param('activationId') id: string, @Body() dto: CancelDto, @CurrentUser() user: RequestUser) {
    return this.workflow.cancel(id, dto.reason, user.id);
  }
}
