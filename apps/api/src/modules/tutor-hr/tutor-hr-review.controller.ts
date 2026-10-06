import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { RequirePermissions } from '../../common/rbac/require-permissions.decorator';
import { CurrentUser } from '../../common/auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/auth/guards/jwt-auth.guard';
import { RbacGuard } from '../../common/rbac/rbac.guard';
import { RequestUser } from '../../common/auth/decorators/current-user.decorator';
import { ApproveTutorLeadDto, TutorHrReviewService } from './tutor-hr-review.service';

@ApiTags('Tutor HR')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RbacGuard)
@Controller('tutor-hr/reviews')
export class TutorHrReviewController {
  constructor(private readonly reviewService: TutorHrReviewService) {}

  @Get()
  @RequirePermissions('tutor_lead.manage')
  @ApiOperation({ summary: 'Get all tutor leads ready for assignment (pending review)' })
  findPending() {
    return this.reviewService.findPending();
  }

  /** Legacy alias — keep for backward compat */
  @Get('pending')
  @RequirePermissions('tutor_lead.manage')
  @ApiOperation({ summary: 'Alias for GET /tutor-hr/reviews' })
  findPendingAlias() {
    return this.reviewService.findPending();
  }

  @Post(':leadId/approve')
  @RequirePermissions('tutor_lead.manage')
  @ApiOperation({ summary: 'Approve a tutor lead and create their Tutor Profile (no login account created)' })
  approve(
    @Param('leadId') leadId: string,
    @Body() dto: ApproveTutorLeadDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.reviewService.approve(leadId, dto, user.id);
  }
}
