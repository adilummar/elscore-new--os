import { Body, Controller, Param, Patch, Post, UseGuards } from '@nestjs/common';
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
@Controller('tutor-hr')
export class TutorTrainingController {
  constructor(private readonly tutorTrainingService: TutorTrainingService) {}

  @Post('leads/:leadId/training')
  @RequirePermissions('tutor_lead.training.manage', 'tutor_lead.manage')
  @ApiOperation({ summary: 'Create a training session for a tutor lead' })
  create(
    @Param('leadId') leadId: string,
    @Body() dto: CreateTutorLeadTrainingDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.tutorTrainingService.create(leadId, dto, user.id);
  }

  @Patch('training/:id')
  @RequirePermissions('tutor_lead.training.manage', 'tutor_lead.manage')
  @ApiOperation({ summary: 'Update a training session' })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateTutorLeadTrainingDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.tutorTrainingService.update(id, dto, user.id);
  }
}
