import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { RequirePermissions } from '../../common/rbac/require-permissions.decorator';
import { CurrentUser } from '../../common/auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/auth/guards/jwt-auth.guard';
import { RbacGuard } from '../../common/rbac/rbac.guard';
import { PaginateOptions } from '../../common/pagination/paginate.util';
import { RequestUser } from '../../common/auth/decorators/current-user.decorator';

import {
  ChangeTutorLeadStageDto,
  CreateTutorLeadDto,
  RecordTutorLeadCallDto,
  RecordTutorLeadDemoDto,
  UpdateTutorLeadAvailabilityDto,
  UpdateTutorLeadDto,
} from './dto/tutor-lead.dto';
import { TutorLeadService } from './tutor-lead.service';

@ApiTags('Tutor HR')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RbacGuard)
@Controller('tutor-hr/leads')
export class TutorLeadController {
  constructor(private readonly tutorLeadService: TutorLeadService) {}

  // ── List ──────────────────────────────────────────────────────────────────

  @Get()
  @RequirePermissions('tutor_lead.read', 'tutor_lead.manage')
  @ApiOperation({ summary: 'List tutor leads with optional search and stage filter' })
  findAll(@Query() query: any) {
    const options: Pick<PaginateOptions, 'limit' | 'cursor'> = {
      limit: query.limit ? parseInt(query.limit, 10) : 50,
      cursor: query.cursor,
    };
    return this.tutorLeadService.findAll(options, { search: query.search, stage: query.stage });
  }

  // ── Detail ────────────────────────────────────────────────────────────────

  @Get(':id')
  @RequirePermissions('tutor_lead.read', 'tutor_lead.manage')
  @ApiOperation({ summary: 'Get full tutor lead details (includes all relations)' })
  findOne(@Param('id') id: string) {
    return this.tutorLeadService.findOne(id);
  }

  // ── Sub-resource GETs ─────────────────────────────────────────────────────

  @Get(':id/stage-history')
  @RequirePermissions('tutor_lead.read', 'tutor_lead.manage')
  @ApiOperation({ summary: 'Get stage change history for a tutor lead' })
  getStageHistory(@Param('id') id: string) {
    return this.tutorLeadService.getStageHistory(id);
  }

  @Get(':id/calls')
  @RequirePermissions('tutor_lead.read', 'tutor_lead.manage')
  @ApiOperation({ summary: 'Get all call records for a tutor lead' })
  getCalls(@Param('id') id: string) {
    return this.tutorLeadService.getCalls(id);
  }

  @Get(':id/demos')
  @RequirePermissions('tutor_lead.read', 'tutor_lead.manage')
  @ApiOperation({ summary: 'Get all demo records for a tutor lead' })
  getDemos(@Param('id') id: string) {
    return this.tutorLeadService.getDemos(id);
  }

  @Get(':id/training-sessions')
  @RequirePermissions('tutor_lead.read', 'tutor_lead.manage', 'tutor_lead.training.read')
  @ApiOperation({ summary: 'Get all training sessions for a tutor lead' })
  getTrainingSessions(@Param('id') id: string) {
    return this.tutorLeadService.getTrainingSessions(id);
  }

  // ── Create ────────────────────────────────────────────────────────────────

  @Post()
  @RequirePermissions('tutor_lead.manage')
  @ApiOperation({ summary: 'Create a new tutor lead' })
  create(@Body() dto: CreateTutorLeadDto, @CurrentUser() user: RequestUser) {
    return this.tutorLeadService.create(dto, user.id);
  }

  // ── Update ────────────────────────────────────────────────────────────────

  @Patch(':id')
  @RequirePermissions('tutor_lead.manage')
  @ApiOperation({ summary: 'Update tutor lead profile fields' })
  update(@Param('id') id: string, @Body() dto: UpdateTutorLeadDto, @CurrentUser() user: RequestUser) {
    return this.tutorLeadService.update(id, dto, user.id);
  }

  @Patch(':id/stage')
  @RequirePermissions('tutor_lead.manage')
  @ApiOperation({ summary: 'Change the stage of a tutor lead (records history, sets trainingStartedAt if applicable)' })
  changeStage(@Param('id') id: string, @Body() dto: ChangeTutorLeadStageDto, @CurrentUser() user: RequestUser) {
    return this.tutorLeadService.changeStage(id, dto, user.id);
  }

  @Patch(':id/availability')
  @RequirePermissions('tutor_lead.manage')
  @ApiOperation({ summary: 'Replace tutor lead availability slots' })
  updateAvailability(@Param('id') id: string, @Body() dto: UpdateTutorLeadAvailabilityDto, @CurrentUser() user: RequestUser) {
    return this.tutorLeadService.updateAvailability(id, dto, user.id);
  }

  // ── Sub-resource POSTs ────────────────────────────────────────────────────

  @Post(':id/calls')
  @RequirePermissions('tutor_lead.manage')
  @ApiOperation({ summary: 'Record a call with the candidate (caller = authenticated HR user)' })
  recordCall(@Param('id') id: string, @Body() dto: RecordTutorLeadCallDto, @CurrentUser() user: RequestUser) {
    return this.tutorLeadService.recordCall(id, dto, user.id);
  }

  @Post(':id/demos')
  @RequirePermissions('tutor_lead.manage')
  @ApiOperation({ summary: 'Record a demo assessment (live or recorded)' })
  recordDemo(@Param('id') id: string, @Body() dto: RecordTutorLeadDemoDto, @CurrentUser() user: RequestUser) {
    return this.tutorLeadService.recordDemo(id, dto, user.id);
  }
}
