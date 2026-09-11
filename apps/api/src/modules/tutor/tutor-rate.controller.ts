import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { CurrentUser, RequestUser } from '../../common/auth/decorators/current-user.decorator';
import { RbacGuard } from '../../common/rbac/rbac.guard';
import { RequirePermissions } from '../../common/rbac/require-permissions.decorator';

import { SetTutorRateDto } from './dto/tutor-rate.dto';
import { TutorRateService } from './tutor-rate.service';

@ApiTags('Tutor Rates')
@ApiBearerAuth()
@UseGuards(RbacGuard)
@Controller('tutors/profile/:profileId/rates')
export class TutorRateController {
  constructor(private readonly tutorRateService: TutorRateService) {}

  @Get('active')
  @RequirePermissions('tutor.rate.read')
  @ApiOperation({ summary: 'Get active hourly rate for tutor' })
  async getActiveRate(@Param('profileId') profileId: string) {
    return this.tutorRateService.getActiveRate(profileId);
  }

  @Get()
  @RequirePermissions('tutor.rate.read')
  @ApiOperation({ summary: 'Get rate history for tutor' })
  async getRateHistory(@Param('profileId') profileId: string) {
    return this.tutorRateService.getRateHistory(profileId);
  }

  @Post()
  @RequirePermissions('tutor.rate.manage')
  @ApiOperation({ summary: 'Set a new active hourly rate for tutor' })
  async setHourlyRate(
    @Param('profileId') profileId: string,
    @Body() dto: SetTutorRateDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.tutorRateService.setHourlyRate(profileId, dto.hourlyRate, user.id);
  }
}
