import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { CurrentUser, RequestUser } from '../../common/auth/decorators/current-user.decorator';
import { RbacGuard } from '../../common/rbac/rbac.guard';
import { RequirePermissions } from '../../common/rbac/require-permissions.decorator';

import { CandidateService } from './candidate.service';
import { CreateApplicationDto } from './dto/create-application.dto';
import { CreateCandidateDto } from './dto/create-candidate.dto';
import { CreateOfferDto } from './dto/create-offer.dto';
import { QueryApplicationsDto } from './dto/query-applications.dto';
import { QueryCandidatesDto } from './dto/query-candidates.dto';
import { QueryOffersDto } from './dto/query-offers.dto';
import { RecordInterviewFeedbackDto } from './dto/record-interview-feedback.dto';
import { RecordOfferResponseDto } from './dto/record-offer-response.dto';
import { ReviewOfferDto } from './dto/review-offer.dto';
import { ScheduleInterviewDto } from './dto/schedule-interview.dto';
import { TransitionStageDto } from './dto/transition-stage.dto';
import { UpdateOfferDto } from './dto/update-offer.dto';
import { WithdrawOfferDto } from './dto/withdraw-offer.dto';

@ApiTags('Recruitment Candidates & Offers')
@ApiBearerAuth()
@UseGuards(RbacGuard)
@Controller()
export class CandidateController {
  constructor(private readonly candidateService: CandidateService) {}

  // ── Candidate Profiles ─────────────────────────────────────────────────────

  @Post('candidates')
  @RequirePermissions('candidate.manage')
  @ApiOperation({ summary: 'Create a candidate profile' })
  async createCandidate(
    @Body() dto: CreateCandidateDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.candidateService.createCandidate(dto, user.id);
  }

  @Get('candidates')
  @RequirePermissions('candidate.read')
  @ApiOperation({ summary: 'List candidates with pagination and filters' })
  async getCandidates(@Query() query: QueryCandidatesDto) {
    return this.candidateService.getCandidates(query);
  }

  @Get('candidates/:id')
  @RequirePermissions('candidate.read')
  @ApiOperation({ summary: 'Get candidate profile by ID' })
  async getCandidate(@Param('id') id: string) {
    return this.candidateService.getCandidate(id);
  }

  // ── Vacancy Applications ───────────────────────────────────────────────────

  @Post('vacancies/:vacancyId/applications')
  @RequirePermissions('candidate.manage')
  @ApiOperation({ summary: 'Submit an application for an approved workforce vacancy' })
  async createApplication(
    @Param('vacancyId') vacancyId: string,
    @Body() dto: CreateApplicationDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.candidateService.createApplication(vacancyId, dto, user.id);
  }

  @Get('applications')
  @RequirePermissions('candidate.read')
  @ApiOperation({ summary: 'List vacancy applications with filters and pagination' })
  async getApplications(@Query() query: QueryApplicationsDto) {
    return this.candidateService.getApplications(query);
  }

  @Get('applications/:id')
  @RequirePermissions('candidate.read')
  @ApiOperation({ summary: 'Get application details by ID (Confidential scores redacted if unauthorized)' })
  async getApplication(
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.candidateService.getApplication(id, user.id);
  }

  @Patch('applications/:id/stage')
  @RequirePermissions('candidate.manage')
  @ApiOperation({ summary: 'Transition application stage and status' })
  async transitionStage(
    @Param('id') id: string,
    @Body() dto: TransitionStageDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.candidateService.transitionStage(id, dto, user.id);
  }

  // ── Interviews ─────────────────────────────────────────────────────────────

  @Post('applications/:id/interviews')
  @RequirePermissions('candidate.interview.manage')
  @ApiOperation({ summary: 'Schedule an interview for an active application' })
  async scheduleInterview(
    @Param('id') id: string,
    @Body() dto: ScheduleInterviewDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.candidateService.scheduleInterview(id, dto, user.id);
  }

  @Patch('interviews/:id/feedback')
  @RequirePermissions('candidate.interview.manage')
  @ApiOperation({ summary: 'Record evaluation scores, recommendation, and interview feedback' })
  async recordInterviewFeedback(
    @Param('id') id: string,
    @Body() dto: RecordInterviewFeedbackDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.candidateService.recordInterviewFeedback(id, dto, user.id);
  }

  // ── Job Offers ─────────────────────────────────────────────────────────────

  @Post('applications/:applicationId/offers')
  @RequirePermissions('offer.manage')
  @ApiOperation({ summary: 'Prepare a draft job offer for candidate' })
  async createOffer(
    @Param('applicationId') applicationId: string,
    @Body() dto: CreateOfferDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.candidateService.createOffer(applicationId, dto, user.id);
  }

  @Get('offers')
  @RequirePermissions('offer.read')
  @ApiOperation({ summary: 'List job offers with filters' })
  async getOffers(@Query() query: QueryOffersDto) {
    return this.candidateService.getOffers(query);
  }

  @Get('offers/:id')
  @RequirePermissions('offer.read')
  @ApiOperation({ summary: 'Get job offer details and audit versions' })
  async getOffer(
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.candidateService.getOffer(id, user.id);
  }

  @Patch('offers/:id')
  @RequirePermissions('offer.manage')
  @ApiOperation({ summary: 'Update draft job offer terms' })
  async updateOffer(
    @Param('id') id: string,
    @Body() dto: UpdateOfferDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.candidateService.updateOffer(id, dto, user.id);
  }

  @Post('offers/:id/revise')
  @RequirePermissions('offer.manage')
  @ApiOperation({ summary: 'Revise approved/sent offer (creates new version snapshot)' })
  async reviseOffer(
    @Param('id') id: string,
    @Body() dto: UpdateOfferDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.candidateService.reviseOffer(id, dto, user.id);
  }

  @Post('offers/:id/submit')
  @RequirePermissions('offer.manage')
  @ApiOperation({ summary: 'Submit draft offer for management approval' })
  async submitOffer(
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.candidateService.submitOfferForApproval(id, user.id);
  }

  @Post('offers/:id/review')
  @RequirePermissions('offer.approve')
  @ApiOperation({ summary: 'Approve or reject job offer (Anti-self-approval enforced)' })
  async reviewOffer(
    @Param('id') id: string,
    @Body() dto: ReviewOfferDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.candidateService.reviewOffer(id, dto, user.id);
  }

  @Post('offers/:id/send')
  @RequirePermissions('offer.status.manage')
  @ApiOperation({ summary: 'Record approved offer as sent to candidate' })
  async sendOffer(
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.candidateService.sendOffer(id, user.id);
  }

  @Post('offers/:id/response')
  @RequirePermissions('offer.status.manage')
  @ApiOperation({ summary: 'Record candidate offer response (ACCEPT / DECLINE)' })
  async recordOfferResponse(
    @Param('id') id: string,
    @Body() dto: RecordOfferResponseDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.candidateService.recordOfferResponse(id, dto, user.id);
  }

  @Post('offers/:id/withdraw')
  @RequirePermissions('offer.status.manage')
  @ApiOperation({ summary: 'Withdraw job offer' })
  async withdrawOffer(
    @Param('id') id: string,
    @Body() dto: WithdrawOfferDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.candidateService.withdrawOffer(id, dto, user.id);
  }

  @Post('offers/:id/expire')
  @RequirePermissions('offer.status.manage')
  @ApiOperation({ summary: 'Mark sent offer as expired' })
  async expireOffer(
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.candidateService.expireOffer(id, user.id);
  }
}
