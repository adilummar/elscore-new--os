import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';

import { CurrentUser, RequestUser } from '../../common/auth/decorators/current-user.decorator';
import { RbacGuard } from '../../common/rbac/rbac.guard';
import { RequirePermissions } from '../../common/rbac/require-permissions.decorator';
import {
  CancelOnboardingDto,
  CreateOnboardingCaseDto,
  CreateProbationReviewDto,
  CreateTaskDto,
  FinalizeOnboardingDto,
  QueryOnboardingCasesDto,
  UpdateOnboardingCaseDto,
  UpdateTaskDto,
  UploadDocumentDto,
  VerifyDocumentDto,
} from './dto';
import { OnboardingService } from './onboarding.service';

@ApiTags('HR Onboarding & Probation')
@ApiBearerAuth()
@UseGuards(RbacGuard)
@Controller('onboarding')
export class OnboardingController {
  constructor(private readonly onboardingService: OnboardingService) {}

  // ── Queue & Case Management ───────────────────────────────────────────────

  @Get('ready')
  @RequirePermissions('onboarding.read')
  @ApiOperation({ summary: 'List accepted candidate applications ready for onboarding' })
  async getReadyQueue() {
    return this.onboardingService.listAcceptedApplicationsReadyForOnboarding();
  }

  @Post('cases')
  @RequirePermissions('onboarding.manage')
  @ApiOperation({ summary: 'Open an onboarding case for an accepted application' })
  async createCase(
    @Body() dto: CreateOnboardingCaseDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.onboardingService.createCase(dto, user.id);
  }

  @Get('cases')
  @RequirePermissions('onboarding.read')
  @ApiOperation({ summary: 'List onboarding cases with pagination and filters' })
  async listCases(@Query() query: QueryOnboardingCasesDto) {
    return this.onboardingService.listCases(query);
  }

  @Get('cases/:id')
  @RequirePermissions('onboarding.read')
  @ApiOperation({ summary: 'Get full details of an onboarding case' })
  async getCase(@Param('id') id: string) {
    return this.onboardingService.findCaseById(id);
  }

  @Patch('cases/:id')
  @RequirePermissions('onboarding.manage')
  @ApiOperation({ summary: 'Update onboarding case details (target joining date, notes, etc.)' })
  async updateCase(
    @Param('id') id: string,
    @Body() dto: UpdateOnboardingCaseDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.onboardingService.updateCase(id, dto, user.id);
  }

  // ── Document Tracking & Verification ──────────────────────────────────────

  @Post('cases/:id/documents')
  @RequirePermissions('onboarding.manage')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 10 * 1024 * 1024 },
    }),
  )
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Upload an onboarding document for verification' })
  async uploadDocument(
    @Param('id') id: string,
    @Body() dto: UploadDocumentDto,
    @UploadedFile() file: any,
    @CurrentUser() user: RequestUser,
  ) {
    return this.onboardingService.uploadDocument(id, dto, file, user.id);
  }

  @Get('cases/:id/documents/:docId/download')
  @RequirePermissions('onboarding.read')
  @ApiOperation({ summary: 'Download an onboarding document from private storage' })
  async downloadDocument(
    @Param('id') caseId: string,
    @Param('docId') docId: string,
    @Res() res: Response,
    @CurrentUser() user: RequestUser,
  ) {
    const { stream, document } = await this.onboardingService.getDocumentDownload(
      caseId,
      docId,
      user.id,
    );
    res.set({
      'Content-Type': document.mimeType,
      'Content-Disposition': `attachment; filename="${encodeURIComponent(document.fileName)}"`,
      'Content-Length': document.fileSize.toString(),
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'private, no-cache, no-store, must-revalidate',
    });
    stream.pipe(res);
  }

  @Patch('cases/:id/documents/:docId/verify')
  @RequirePermissions('onboarding.verify')
  @ApiOperation({ summary: 'Verify or reject an onboarding document' })
  async verifyDocument(
    @Param('id') id: string,
    @Param('docId') docId: string,
    @Body() dto: VerifyDocumentDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.onboardingService.verifyDocument(id, docId, dto, user.id);
  }

  // ── Onboarding Task Checklist ─────────────────────────────────────────────

  @Post('cases/:id/tasks')
  @RequirePermissions('onboarding.manage')
  @ApiOperation({ summary: 'Add a task to the onboarding checklist' })
  async createTask(
    @Param('id') id: string,
    @Body() dto: CreateTaskDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.onboardingService.createTask(id, dto, user.id);
  }

  @Patch('cases/:id/tasks/:taskId')
  @RequirePermissions('onboarding.manage')
  @ApiOperation({ summary: 'Update status, assignee, or notes for an onboarding task' })
  async updateTask(
    @Param('id') id: string,
    @Param('taskId') taskId: string,
    @Body() dto: UpdateTaskDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.onboardingService.updateTask(id, taskId, dto, user.id);
  }

  // ── Exceptions: Cancellation, Withdrawal, No-Show ─────────────────────────

  @Post('cases/:id/cancel')
  @RequirePermissions('onboarding.manage')
  @ApiOperation({ summary: 'Cancel onboarding case due to withdrawal, no-show, or rejection' })
  async cancelCase(
    @Param('id') id: string,
    @Body() dto: CancelOnboardingDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.onboardingService.cancelOnboarding(id, dto, user.id);
  }

  // ── Finalization & Employee Record Creation ───────────────────────────────

  @Post('cases/:id/finalize')
  @RequirePermissions('onboarding.finalize')
  @ApiOperation({ summary: 'Finalize onboarding and create Employee, User, and initial Compensation request' })
  async finalizeCase(
    @Param('id') id: string,
    @Body() dto: FinalizeOnboardingDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.onboardingService.finalizeOnboarding(id, dto, user.id);
  }

  // ── Probation Review & Evaluation Operations ──────────────────────────────

  @Post('employees/:employeeId/probation/reviews')
  @RequirePermissions('probation.manage')
  @ApiOperation({ summary: 'Record a periodic or final probation review for an employee' })
  async recordProbationReview(
    @Param('employeeId') employeeId: string,
    @Body() dto: CreateProbationReviewDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.onboardingService.recordProbationReview(employeeId, dto, user.id);
  }

  @Get('employees/:employeeId/probation/reviews')
  @RequirePermissions('probation.read')
  @ApiOperation({ summary: 'Get all probation reviews for an employee' })
  async getProbationReviews(@Param('employeeId') employeeId: string) {
    return this.onboardingService.getProbationReviews(employeeId);
  }
}
