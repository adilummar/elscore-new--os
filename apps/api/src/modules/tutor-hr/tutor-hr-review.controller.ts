import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { RequirePermissions } from '../../common/rbac/require-permissions.decorator';
import { CurrentUser } from '../../common/auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/auth/guards/jwt-auth.guard';
import { RbacGuard } from '../../common/rbac/rbac.guard';
import { RequestUser } from '../../common/auth/decorators/current-user.decorator';
import { ApproveTutorLeadDto } from './dto/tutor-hr-review.dto';
import { TutorHrReviewService } from './tutor-hr-review.service';

@ApiTags('Tutor HR')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RbacGuard)
@Controller('tutor-hr/reviews')
export class TutorHrReviewController {
  constructor(private readonly reviewService: TutorHrReviewService) {}

  @Get('pending')
  @RequirePermissions('tutor_lead.manage')
  @ApiOperation({ summary: 'Get all tutor leads ready for assignment' })
  findPending() {
    return this.reviewService.findPending();
  }

  @Post(':leadId/approve')
  @RequirePermissions('tutor_lead.manage')
  @ApiOperation({ summary: 'Approve a tutor lead and convert them to a Tutor Profile' })
  approve(
    @Param('leadId') leadId: string,
    @Body() dto: ApproveTutorLeadDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.reviewService.approve(leadId, dto, user.id);
  }
}
