import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CompensationRequestStatus } from '@prisma/client';

import { CurrentUser, RequestUser } from '../../common/auth/decorators/current-user.decorator';
import { RbacGuard } from '../../common/rbac/rbac.guard';
import { RequirePermissions } from '../../common/rbac/require-permissions.decorator';

import { RequestTutorRateChangeDto, ReviewTutorRateChangeDto, SetTutorRateDto } from './dto/tutor-rate.dto';
import { TutorRateService } from './tutor-rate.service';

@ApiTags('Tutor Rates')
@ApiBearerAuth()
@UseGuards(RbacGuard)
@Controller('tutors')
export class TutorRateController {
  constructor(private readonly tutorRateService: TutorRateService) {}

  @Get('profile/:profileId/rates/active')
  @RequirePermissions('tutor.rate.read')
  @ApiOperation({ summary: 'Get active hourly rate for tutor' })
  async getActiveRate(@Param('profileId') profileId: string) {
    return this.tutorRateService.getActiveRate(profileId);
  }

  @Get('profile/:profileId/rates')
  @RequirePermissions('tutor.rate.read')
  @ApiOperation({ summary: 'Get rate history for tutor' })
  async getRateHistory(@Param('profileId') profileId: string) {
    return this.tutorRateService.getRateHistory(profileId);
  }

  @Post('profile/:profileId/rates')
  @RequirePermissions('tutor.rate.manage')
  @ApiOperation({ summary: 'Set or request a new active hourly rate for tutor' })
  async setHourlyRate(
    @Param('profileId') profileId: string,
    @Body() dto: SetTutorRateDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.tutorRateService.setHourlyRate(
      profileId,
      dto.hourlyRate,
      user.id,
      dto.effectiveDate,
      dto.reason,
    );
  }

  @Post('profile/:profileId/rates/request')
  @RequirePermissions('tutor.rate.manage')
  @ApiOperation({ summary: 'Submit a tutor rate change request for CEO approval' })
  async requestRateChange(
    @Param('profileId') profileId: string,
    @Body() dto: RequestTutorRateChangeDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.tutorRateService.requestRateChange(profileId, dto, user.id);
  }

  @Get('rates/requests')
  @RequirePermissions('tutor.rate.read')
  @ApiOperation({ summary: 'List tutor rate change requests' })
  async getRateRequests(
    @Query('tutorProfileId') tutorProfileId?: string,
    @Query('status') status?: CompensationRequestStatus,
  ) {
    return this.tutorRateService.getRateChangeRequests({ tutorProfileId, status });
  }

  @Patch('rates/requests/:id/review')
  @RequirePermissions('tutor.rate.approve')
  @ApiOperation({ summary: 'Approve or reject a tutor rate change request (CEO only)' })
  async reviewRateChange(
    @Param('id') requestId: string,
    @Body() dto: ReviewTutorRateChangeDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.tutorRateService.reviewRateChange(requestId, dto, user.id);
  }
}
