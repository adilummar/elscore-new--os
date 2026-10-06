import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { RequirePermissions } from '../../common/rbac/require-permissions.decorator';
import { CurrentUser } from '../../common/auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/auth/guards/jwt-auth.guard';
import { RbacGuard } from '../../common/rbac/rbac.guard';
import { RequestUser } from '../../common/auth/decorators/current-user.decorator';

import { CreateTutorLeadTrainingDto, UpdateTutorLeadTrainingDto } from './dto/tutor-training.dto';
import { TutorTrainingService } from './tutor-training.service';

@ApiTags('Tutor HR')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RbacGuard)
@Controller('tutor-hr/leads/:leadId/training-sessions')
export class TutorTrainingController {
  constructor(private readonly tutorTrainingService: TutorTrainingService) {}

  @Get()
  @RequirePermissions('tutor_lead.read', 'tutor_lead.manage', 'tutor_lead.training.read')
  @ApiOperation({ summary: 'List all training sessions for a tutor lead' })
  findAll(@Param('leadId') leadId: string) {
    return this.tutorTrainingService.findAll(leadId);
  }

  @Post()
  @RequirePermissions('tutor_lead.training.manage', 'tutor_lead.manage')
  @ApiOperation({ summary: 'Add a new training session for a tutor lead' })
  create(
    @Param('leadId') leadId: string,
    @Body() dto: CreateTutorLeadTrainingDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.tutorTrainingService.create(leadId, dto, user.id);
  }

  @Patch(':sessionId')
  @RequirePermissions('tutor_lead.training.manage', 'tutor_lead.manage')
  @ApiOperation({ summary: 'Update a training session (attendance, task status, remarks)' })
  update(
    @Param('leadId') leadId: string,
    @Param('sessionId') sessionId: string,
    @Body() dto: UpdateTutorLeadTrainingDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.tutorTrainingService.update(sessionId, dto, user.id);
  }
}
