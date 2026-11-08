import { Body, Controller, Get, Param, ParseIntPipe, Patch, Post, Put, Query, UseGuards } from '@nestjs/common';

import { CurrentUser, RequestUser } from '../../common/auth/decorators/current-user.decorator';
import { RbacGuard } from '../../common/rbac/rbac.guard';
import { RequirePermissions } from '../../common/rbac/require-permissions.decorator';

import { MentoringAccessService } from './mentoring-access.service';
import { MentoringTimetableService } from './mentoring-timetable.service';
import { MentoringTutorService } from './mentoring-tutor.service';
import { MentoringWorkflowService } from './mentoring-workflow.service';
import {
  ApprovalDecisionDto,
  AssignTutorDto,
  BlockDto,
  CancelDto,
  ExceptionDto,
  PauseDto,
  RemoveTutorDto,
  ResumeDto,
  SetFieldVerificationDto,
  StudentListQueryDto,
  TimetableQueryDto,
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
    private readonly tutors: MentoringTutorService,
    private readonly timetables: MentoringTimetableService,
  ) {}

  @Get()
  async list(@Query() query: StudentListQueryDto, @CurrentUser() user: RequestUser) {
    return this.workflow.list(await this.access.scopeFor(user.id), query);
  }

  @Get(':activationId')
  async workspace(@Param('activationId') id: string, @CurrentUser() user: RequestUser) {
    return this.workflow.getWorkspace(id, await this.access.scopeFor(user.id));
  }

  /** The student's timetable for a range of dates, from the saved schedule and tutor assignments. Read only. */
  @Get(':activationId/timetable')
  async timetable(@Param('activationId') id: string, @Query() query: TimetableQueryDto, @CurrentUser() user: RequestUser) {
    return this.timetables.timetable(id, query, await this.access.scopeFor(user.id));
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

  /**
   * The tutors who teach one subject, ranked against the saved schedule, with the reason for every session that does not
   * fit. Assigned Mentor only. Nothing here is a decision: assigning checks everything again.
   */
  @Get(':activationId/schedule/subjects/:subjectId/tutors')
  @RequirePermissions('mentoring.stage.work')
  async tutorCandidates(@Param('activationId') id: string, @Param('subjectId') subjectId: string, @CurrentUser() user: RequestUser) {
    const scope = await this.access.scopeFor(user.id);
    return this.tutors.candidates(id, subjectId, user.id, scope.perms.has('tutor.profile.manage'));
  }

  /** Choose the tutor for a subject (assigned Mentor). Refused unless the tutor is free for every session. */
  @Put(':activationId/schedule/subjects/:subjectId/tutor')
  @RequirePermissions('mentoring.stage.work')
  assignTutor(@Param('activationId') id: string, @Param('subjectId') subjectId: string, @Body() dto: AssignTutorDto, @CurrentUser() user: RequestUser) {
    return this.tutors.assign(id, subjectId, dto.tutorProfileId, user.id);
  }

  /** Remove the tutor from a subject (assigned Mentor). The assignment stays in the history. */
  @Post(':activationId/schedule/subjects/:subjectId/tutor/remove')
  @RequirePermissions('mentoring.stage.work')
  removeTutor(@Param('activationId') id: string, @Param('subjectId') subjectId: string, @Body() dto: RemoveTutorDto, @CurrentUser() user: RequestUser) {
    return this.tutors.unassign(id, subjectId, dto.reason ?? null, user.id);
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
