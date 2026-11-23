import { Body, Controller, Get, Param, ParseIntPipe, ParseUUIDPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { CurrentUser, RequestUser } from '../../../common/auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../../common/auth/guards/jwt-auth.guard';
import { RbacGuard } from '../../../common/rbac/rbac.guard';
import { RequirePermissions } from '../../../common/rbac/require-permissions.decorator';

import {
  AddParticipantsDto,
  CorrectAttemptDto,
  CreateTrainingSessionDto,
  ListSessionsQueryDto,
  ListTraineesQueryDto,
  RecordAttemptDto,
  RescheduleTrainingSessionDto,
} from './training.dto';
import { TRAINING_OVERRIDE_PERMISSION, TrainingService } from './training.service';

/**
 * Tutor Management — Training (two compulsory onboarding sessions).
 * Head of Tutor Management schedules; HR Staff add participants; the conductor records
 * attendance; only the Head corrects a recorded attempt. The legacy
 * /tutor-hr/leads/:leadId/training-sessions routes are unchanged.
 */
@ApiTags('Tutor Training')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RbacGuard)
@Controller('tutor-hr/training')
export class TrainingController {
  constructor(private readonly service: TrainingService) {}

  @Get('conductors')
  @RequirePermissions('tutor_training.schedule')
  @ApiOperation({ summary: 'Who may conduct a session: Session 1 coordinators / Tutor Head, Session 2 HR' })
  conductors(@Query('sessionNumber', ParseIntPipe) sessionNumber: number) {
    return this.service.conductors(sessionNumber);
  }

  @Get('sessions')
  @RequirePermissions('tutor_training.read')
  sessions(@Query() q: ListSessionsQueryDto) {
    return this.service.listSessions(q);
  }

  @Post('sessions')
  @RequirePermissions('tutor_training.schedule')
  @ApiOperation({ summary: 'Schedule a Session 1 or Session 2 (Head of Tutor Management)' })
  create(@Body() dto: CreateTrainingSessionDto, @CurrentUser() user: RequestUser) {
    return this.service.createSession(dto, user.id);
  }

  @Patch('sessions/:id')
  @RequirePermissions('tutor_training.schedule')
  @ApiOperation({ summary: 'Reschedule a session; the earlier time is kept in history' })
  reschedule(@Param('id', ParseUUIDPipe) id: string, @Body() dto: RescheduleTrainingSessionDto, @CurrentUser() user: RequestUser) {
    return this.service.rescheduleSession(id, dto, user.id);
  }

  @Post('sessions/:id/participants')
  @RequirePermissions('tutor_training.participants')
  @ApiOperation({ summary: 'Add Hired trainees to a session (HR Staff)' })
  addParticipants(@Param('id', ParseUUIDPipe) id: string, @Body() dto: AddParticipantsDto, @CurrentUser() user: RequestUser) {
    return this.service.addParticipants(id, dto, user.id);
  }

  @Post('attempts/:id/attendance')
  @RequirePermissions('tutor_training.record')
  @ApiOperation({ summary: 'Record attendance and task completion (session conductor; locked afterwards)' })
  record(@Param('id', ParseUUIDPipe) id: string, @Body() dto: RecordAttemptDto, @CurrentUser() user: RequestUser) {
    return this.service.recordAttempt(id, dto, user.id);
  }

  @Post('attempts/:id/correction')
  @RequirePermissions(TRAINING_OVERRIDE_PERMISSION)
  @ApiOperation({ summary: 'Correct a recorded attempt (Head only); the previous values are kept' })
  correct(@Param('id', ParseUUIDPipe) id: string, @Body() dto: CorrectAttemptDto, @CurrentUser() user: RequestUser) {
    return this.service.correctAttempt(id, dto, user.id);
  }

  @Get('trainees')
  @RequirePermissions('tutor_training.read')
  trainees(@Query() q: ListTraineesQueryDto) {
    return this.service.listTrainees(q);
  }

  @Get('trainees/:leadId')
  @RequirePermissions('tutor_training.read')
  trainee(@Param('leadId', ParseUUIDPipe) leadId: string) {
    return this.service.traineeHistory(leadId);
  }
}
