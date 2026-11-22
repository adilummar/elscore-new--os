import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { CurrentUser, RequestUser } from '../../../common/auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../../common/auth/guards/jwt-auth.guard';
import { RbacGuard } from '../../../common/rbac/rbac.guard';
import { RequirePermissions } from '../../../common/rbac/require-permissions.decorator';
import { TutorHrSettingsService } from '../tutor-hr-settings.service';

import { HiringCandidateService } from './hiring-candidate.service';
import {
  AddEnquiryDto,
  AdvanceStageDto,
  ChangeDecisionDto,
  CheckDuplicateDto,
  CreateSourceDto,
  ListCandidatesQueryDto,
  LogCallDto,
  RegisterCandidateDto,
  SetCvReceivedDto,
  SetLeadStatusDto,
  UpdateCandidateDetailsDto,
  UpdateSourceDto,
} from './hiring.dto';

/**
 * Tutor Management — Hiring. Extends the existing HR Tutor module; legacy
 * /tutor-hr/leads routes are unchanged. Record-level scoping lives in the service.
 */
@ApiTags('Tutor Hiring')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RbacGuard)
@Controller('tutor-hr/hiring')
export class HiringCandidateController {
  constructor(
    private readonly service: HiringCandidateService,
    private readonly settings: TutorHrSettingsService,
  ) {}

  // ── Details Shared option lists ──
  // Read-only, active options for anyone who may read candidates (Tutor Head, HR Manager,
  // executives). Managing the lists still needs tutor_hr.settings.manage on the legacy routes.
  @Get('reference/mother-tongues')
  @RequirePermissions('tutor_lead.read')
  async motherTongues() {
    return (await this.settings.getMotherTongues()).filter((m) => m.isActive);
  }

  @Get('reference/communication-languages')
  @RequirePermissions('tutor_lead.read')
  async communicationLanguages() {
    return (await this.settings.getCommunicationLanguages()).filter((l) => l.isActive);
  }

  // ── Sources (declared before :id routes) ──
  @Get('sources')
  @RequirePermissions('tutor_lead.read')
  @ApiOperation({ summary: 'List active lead sources' })
  listSources() {
    return this.service.listSources();
  }

  @Get('sources/all')
  @RequirePermissions('tutor_hiring.settings')
  @ApiOperation({ summary: 'List all lead sources including inactive' })
  listAllSources() {
    return this.service.listSources(true);
  }

  @Post('sources')
  @RequirePermissions('tutor_hiring.settings')
  createSource(@Body() dto: CreateSourceDto, @CurrentUser() user: RequestUser) {
    return this.service.createSource(dto.name, user.id);
  }

  @Patch('sources/:id')
  @RequirePermissions('tutor_hiring.settings')
  updateSource(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateSourceDto, @CurrentUser() user: RequestUser) {
    return this.service.updateSource(id, dto, user.id);
  }

  // ── Candidates ──
  @Post('candidates/check-duplicate')
  @RequirePermissions('tutor_lead.read')
  @ApiOperation({ summary: 'Check whether a phone number already belongs to a candidate' })
  checkDuplicate(@Body() dto: CheckDuplicateDto) {
    return this.service.checkDuplicate(dto.phone, dto.countryCode);
  }

  @Post('candidates')
  @RequirePermissions('tutor_lead.create')
  @ApiOperation({ summary: 'Register a lead. 409 DUPLICATE_CANDIDATE if the phone already exists.' })
  register(@Body() dto: RegisterCandidateDto, @CurrentUser() user: RequestUser) {
    return this.service.register(dto, user.id);
  }

  @Get('candidates')
  @RequirePermissions('tutor_lead.read')
  list(@Query() query: ListCandidatesQueryDto, @CurrentUser() user: RequestUser) {
    return this.service.list(query, user.id);
  }

  @Get('candidates/:id')
  @RequirePermissions('tutor_lead.read')
  profile(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.getProfile(id);
  }

  @Post('candidates/:id/enquiries')
  @RequirePermissions('tutor_lead.create')
  @ApiOperation({ summary: 'Record a repeat enquiry; never overwrites earlier sources' })
  addEnquiry(@Param('id', ParseUUIDPipe) id: string, @Body() dto: AddEnquiryDto, @CurrentUser() user: RequestUser) {
    return this.service.addEnquiry(id, dto, user.id);
  }

  @Patch('candidates/:id/details')
  @RequirePermissions('tutor_lead.update')
  @ApiOperation({ summary: 'Edit Details Shared fields (does not advance the stage)' })
  updateDetails(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateCandidateDetailsDto, @CurrentUser() user: RequestUser) {
    return this.service.updateDetails(id, dto, user.id);
  }

  @Patch('candidates/:id/cv')
  @RequirePermissions('tutor_lead.update')
  setCv(@Param('id', ParseUUIDPipe) id: string, @Body() dto: SetCvReceivedDto, @CurrentUser() user: RequestUser) {
    return this.service.setCvReceived(id, dto, user.id);
  }

  @Post('candidates/:id/stage')
  @RequirePermissions('tutor_lead.stage.update')
  @ApiOperation({ summary: 'Explicitly complete the current stage and move to the next' })
  advance(@Param('id', ParseUUIDPipe) id: string, @Body() dto: AdvanceStageDto, @CurrentUser() user: RequestUser) {
    return this.service.advanceStage(id, dto, user.id);
  }

  @Post('candidates/:id/lead-status')
  @RequirePermissions('tutor_lead.stage.update')
  @ApiOperation({ summary: 'Set the Lead Status (Processing / Rejected / Not Interested); remarks required for the last two' })
  leadStatus(@Param('id', ParseUUIDPipe) id: string, @Body() dto: SetLeadStatusDto, @CurrentUser() user: RequestUser) {
    return this.service.setLeadStatus(id, dto, user.id);
  }

  @Post('candidates/:id/decision')
  @RequirePermissions('tutor_lead.stage.update')
  @ApiOperation({ summary: 'Record the post-demo decision (demo conductor, or the Head on override). Hired moves the candidate to Training.' })
  decide(@Param('id', ParseUUIDPipe) id: string, @Body() dto: ChangeDecisionDto, @CurrentUser() user: RequestUser) {
    return this.service.changeDecision(id, dto, user.id);
  }

  @Get('candidates/:id/calls')
  @RequirePermissions('tutor_lead.read')
  calls(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.listCalls(id);
  }

  @Post('candidates/:id/calls')
  @RequirePermissions('tutor_lead.update')
  logCall(@Param('id', ParseUUIDPipe) id: string, @Body() dto: LogCallDto, @CurrentUser() user: RequestUser) {
    return this.service.logCall(id, dto, user.id);
  }
}
