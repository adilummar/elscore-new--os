import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  ApplicationStage,
  ApplicationStatus,
  Candidate,
  CandidateInterview,
  InterviewStatus,
  JobApplication,
  JobOffer,
  OfferStatus,
  Prisma,
  VacancyStatus,
} from '@prisma/client';

import { AuditService } from '../../common/audit/audit.service';
import { IdGeneratorService } from '../../common/id-generator/id-generator.service';
import { PrismaService, PrismaTxClient } from '../../common/prisma/prisma.service';
import { AuthorizationService } from '../../common/rbac/authorization.service';

import { CreateApplicationDto } from './dto/create-application.dto';
import { CreateCandidateDto } from './dto/create-candidate.dto';
import { CreateOfferDto, SUPPORTED_OFFER_CURRENCIES } from './dto/create-offer.dto';
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

/**
 * Validates that a string is a real Gregorian calendar date in YYYY-MM-DD format.
 */
function validateCalendarDate(dateStr: string, fieldName: string): void {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr);
  if (!match) {
    throw new BadRequestException(`${fieldName} must match YYYY-MM-DD format`);
  }
  const year = parseInt(match[1], 10);
  const month = parseInt(match[2], 10);
  const day = parseInt(match[3], 10);

  if (month < 1 || month > 12 || day < 1 || day > 31) {
    throw new BadRequestException(`${fieldName} is not a valid calendar date`);
  }

  const d = new Date(Date.UTC(year, month - 1, day));
  if (
    d.getUTCFullYear() !== year ||
    d.getUTCMonth() !== month - 1 ||
    d.getUTCDate() !== day
  ) {
    throw new BadRequestException(`${fieldName} is not a valid calendar date`);
  }
}

@Injectable()
export class CandidateService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly idGenerator: IdGeneratorService,
    private readonly authService: AuthorizationService,
  ) {}

  private async acquireCandidateLock(tx: PrismaTxClient, candidateId: string): Promise<void> {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('candidate-' || ${candidateId}))`;
  }

  private async acquireApplicationLock(tx: PrismaTxClient, applicationId: string): Promise<void> {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('application-' || ${applicationId}))`;
  }

  private async acquireOfferLock(tx: PrismaTxClient, offerId: string): Promise<void> {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('offer-' || ${offerId}))`;
  }

  /**
   * Validates that offered salary conforms to the approved vacancy maximum budget (Policy B).
   * Rejects offers exceeding budgetMax unless an explicit CEO override path is present.
   */
  private validateOfferSalaryCap(
    vacancy: { businessId: string; budgetMax: Prisma.Decimal | null; currency: string } | null | undefined,
    offeredSalary: number | Prisma.Decimal,
    offerCurrency: string,
  ): void {
    if (!vacancy || vacancy.budgetMax === null || vacancy.budgetMax === undefined) {
      return; // No budget cap configured on requisition
    }

    if (vacancy.currency && offerCurrency && vacancy.currency.toUpperCase() !== offerCurrency.toUpperCase()) {
      throw new BadRequestException(
        `Cannot validate offer salary cap: offer currency ('${offerCurrency}') does not match vacancy currency ('${vacancy.currency}') for vacancy ${vacancy.businessId}.`,
      );
    }

    const salaryDecimal =
      offeredSalary instanceof Prisma.Decimal
        ? offeredSalary
        : new Prisma.Decimal(offeredSalary);

    if (salaryDecimal.gt(vacancy.budgetMax)) {
      throw new BadRequestException(
        `Offered salary (${salaryDecimal.toString()} ${offerCurrency}) exceeds the approved vacancy maximum budget (${vacancy.budgetMax.toString()} ${vacancy.currency}) for vacancy ${vacancy.businessId}. Offers exceeding approved compensation limits require vacancy budget escalation.`,
      );
    }
  }

  // ── Candidate Profile Operations ───────────────────────────────────────────

  async createCandidate(dto: CreateCandidateDto, actorUserId: string): Promise<Candidate> {
    return this.prisma.$transaction(async (tx) => {
      const businessId = await this.idGenerator.nextIdInTx(tx, 'CAN');

      const candidate = await tx.candidate.create({
        data: {
          businessId,
          fullName: dto.fullName.trim(),
          email: dto.email.trim().toLowerCase(),
          phone: dto.phone?.trim() || null,
          source: dto.source || 'DIRECT_APPLICATION',
          referralDetails: dto.referralDetails?.trim() || null,
          notes: dto.notes?.trim() || null,
          createdById: actorUserId,
        },
      });

      await this.auditService.recordInTx(tx, {
        entityType: 'Candidate',
        entityId: candidate.id,
        action: 'CANDIDATE_CREATED',
        actorUserId,
        newValue: {
          businessId: candidate.businessId,
          fullName: candidate.fullName,
          email: candidate.email,
          source: candidate.source,
        },
        reason: 'Recruitment candidate profile created',
      });

      return candidate;
    });
  }

  async getCandidates(query: QueryCandidatesDto) {
    const page = Math.max(1, query.page || 1);
    const limit = Math.max(1, Math.min(100, query.limit || 20));
    const skip = (page - 1) * limit;

    const where: Prisma.CandidateWhereInput = {};
    if (query.source) {
      where.source = query.source;
    }
    if (query.search && query.search.trim().length > 0) {
      const term = query.search.trim();
      where.OR = [
        { fullName: { contains: term, mode: 'insensitive' } },
        { email: { contains: term, mode: 'insensitive' } },
        { businessId: { contains: term, mode: 'insensitive' } },
        { phone: { contains: term, mode: 'insensitive' } },
      ];
    }

    const [items, total] = await Promise.all([
      this.prisma.candidate.findMany({
        where,
        skip,
        take: limit,
        orderBy: [{ createdAt: 'desc' }],
        include: {
          applications: {
            include: {
              vacancy: {
                select: { id: true, businessId: true, title: true, status: true },
              },
            },
          },
        },
      }),
      this.prisma.candidate.count({ where }),
    ]);

    return {
      items,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async getCandidate(id: string): Promise<Candidate> {
    const candidate = await this.prisma.candidate.findUnique({
      where: { id },
      include: {
        applications: {
          include: {
            vacancy: {
              select: { id: true, businessId: true, title: true, status: true },
            },
            offers: {
              select: { id: true, businessId: true, status: true, version: true },
            },
          },
        },
      },
    });

    if (!candidate) {
      throw new NotFoundException(`Candidate with ID '${id}' not found`);
    }

    return candidate;
  }

  // ── Job Application Operations ─────────────────────────────────────────────

  async createApplication(
    vacancyId: string,
    dto: CreateApplicationDto,
    actorUserId: string,
  ): Promise<JobApplication> {
    return this.prisma.$transaction(async (tx) => {
      await this.acquireCandidateLock(tx, dto.candidateId);

      // 1. Verify Vacancy exists and is in an eligible recruitment state
      const vacancy = await tx.vacancy.findUnique({
        where: { id: vacancyId },
      });
      if (!vacancy) {
        throw new NotFoundException(`Vacancy with ID '${vacancyId}' not found`);
      }
      if (vacancy.status !== VacancyStatus.APPROVED && vacancy.status !== VacancyStatus.OPEN) {
        throw new BadRequestException(
          `Applications can only be created for APPROVED or OPEN vacancies (current: ${vacancy.status})`,
        );
      }

      // 2. Verify Candidate exists
      const candidate = await tx.candidate.findUnique({
        where: { id: dto.candidateId },
      });
      if (!candidate) {
        throw new NotFoundException(`Candidate with ID '${dto.candidateId}' not found`);
      }

      // 3. Duplicate Application Protection
      const existingApp = await tx.jobApplication.findUnique({
        where: {
          vacancyId_candidateId: {
            vacancyId,
            candidateId: dto.candidateId,
          },
        },
      });
      if (existingApp) {
        throw new BadRequestException(
          `Candidate '${candidate.fullName}' (${candidate.businessId}) has already applied for vacancy '${vacancy.title}' (${vacancy.businessId}).`,
        );
      }

      const businessId = await this.idGenerator.nextIdInTx(tx, 'APP');

      const application = await tx.jobApplication.create({
        data: {
          businessId,
          candidateId: dto.candidateId,
          vacancyId,
          stage: ApplicationStage.SCREENING,
          status: ApplicationStatus.APPLIED,
          coverLetter: dto.coverLetter?.trim() || null,
          resumeUrl: dto.resumeUrl?.trim() || null,
          createdById: actorUserId,
        },
        include: {
          candidate: true,
          vacancy: true,
        },
      });

      // Initial Stage History
      await tx.applicationStageHistory.create({
        data: {
          applicationId: application.id,
          fromStage: null,
          toStage: ApplicationStage.SCREENING,
          fromStatus: null,
          toStatus: ApplicationStatus.APPLIED,
          notes: 'Application submitted',
          changedById: actorUserId,
        },
      });

      await this.auditService.recordInTx(tx, {
        entityType: 'JobApplication',
        entityId: application.id,
        action: 'APPLICATION_CREATED',
        actorUserId,
        newValue: {
          businessId: application.businessId,
          candidateId: application.candidateId,
          vacancyId: application.vacancyId,
          stage: application.stage,
          status: application.status,
        },
        reason: 'Candidate application created for workforce vacancy',
      });

      return application;
    });
  }

  async getApplications(query: QueryApplicationsDto) {
    const page = Math.max(1, query.page || 1);
    const limit = Math.max(1, Math.min(100, query.limit || 20));
    const skip = (page - 1) * limit;

    const where: Prisma.JobApplicationWhereInput = {};
    if (query.vacancyId) where.vacancyId = query.vacancyId;
    if (query.candidateId) where.candidateId = query.candidateId;
    if (query.stage) where.stage = query.stage;
    if (query.status) where.status = query.status;

    if (query.search && query.search.trim().length > 0) {
      const term = query.search.trim();
      where.OR = [
        { businessId: { contains: term, mode: 'insensitive' } },
        { candidate: { fullName: { contains: term, mode: 'insensitive' } } },
        { candidate: { email: { contains: term, mode: 'insensitive' } } },
        { vacancy: { title: { contains: term, mode: 'insensitive' } } },
      ];
    }

    const [items, total] = await Promise.all([
      this.prisma.jobApplication.findMany({
        where,
        skip,
        take: limit,
        orderBy: [{ createdAt: 'desc' }],
        include: {
          candidate: true,
          vacancy: {
            select: { id: true, businessId: true, title: true, status: true, departmentId: true },
          },
          offers: {
            select: { id: true, businessId: true, status: true, version: true },
          },
        },
      }),
      this.prisma.jobApplication.count({ where }),
    ]);

    return {
      items,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async getApplication(id: string, actorUserId: string) {
    const app = await this.prisma.jobApplication.findUnique({
      where: { id },
      include: {
        candidate: true,
        vacancy: {
          include: { department: true, role: true },
        },
        interviews: {
          orderBy: { scheduledAt: 'desc' },
          include: {
            interviewer: {
              select: { id: true, email: true, employee: { select: { firstName: true, lastName: true } } },
            },
          },
        },
        stageHistory: {
          orderBy: { createdAt: 'desc' },
          include: {
            changedBy: {
              select: { id: true, email: true, employee: { select: { firstName: true, lastName: true } } },
            },
          },
        },
        offers: {
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!app) {
      throw new NotFoundException(`Application with ID '${id}' not found`);
    }

    // Confidentiality Check: Interview feedback ratings & comments
    const canReadFeedback = await this.authService.hasPermission(actorUserId, 'candidate.interview.feedback-read');

    let sanitizedInterviews = app.interviews;
    if (!canReadFeedback) {
      sanitizedInterviews = app.interviews.map((item) => ({
        ...item,
        rating: null,
        recommendation: null,
        feedback: null,
      }));
    }

    // Confidentiality Check: Offer salary & compensation
    const canReadOffers = await this.authService.hasPermission(actorUserId, 'offer.read');
    let sanitizedOffers = app.offers;
    if (!canReadOffers) {
      sanitizedOffers = app.offers.map((offer) => ({
        ...offer,
        offeredSalary: new Prisma.Decimal(0),
        currency: '***',
        notes: null,
      }));
    }

    return {
      ...app,
      interviews: sanitizedInterviews,
      offers: sanitizedOffers,
    };
  }

  // ── Selection Stages & Interviews ──────────────────────────────────────────

  async scheduleInterview(
    applicationId: string,
    dto: ScheduleInterviewDto,
    actorUserId: string,
  ): Promise<CandidateInterview> {
    return this.prisma.$transaction(async (tx) => {
      await this.acquireApplicationLock(tx, applicationId);

      const application = await tx.jobApplication.findUnique({
        where: { id: applicationId },
      });
      if (!application) {
        throw new NotFoundException(`Application with ID '${applicationId}' not found`);
      }

      if (
        application.status === ApplicationStatus.REJECTED ||
        application.status === ApplicationStatus.WITHDRAWN
      ) {
        throw new BadRequestException(
          `Cannot schedule interview for application in terminal status '${application.status}'`,
        );
      }

      const scheduledDate = new Date(dto.scheduledAt);
      if (isNaN(scheduledDate.getTime())) {
        throw new BadRequestException('scheduledAt must be a valid date-time');
      }

      const interview = await tx.candidateInterview.create({
        data: {
          applicationId,
          interviewType: dto.interviewType,
          interviewMode: dto.interviewMode,
          scheduledAt: scheduledDate,
          interviewerUserId: dto.interviewerUserId || null,
          interviewerName: dto.interviewerName?.trim() || null,
          location: dto.location?.trim() || null,
          status: InterviewStatus.SCHEDULED,
          createdById: actorUserId,
        },
      });

      // If application was APPLIED or SCREENING, advance status to INTERVIEWING
      if (
        application.status === ApplicationStatus.APPLIED ||
        application.status === ApplicationStatus.SCREENING
      ) {
        const updatedApp = await tx.jobApplication.update({
          where: { id: applicationId },
          data: {
            status: ApplicationStatus.INTERVIEWING,
            stage: ApplicationStage.INTERVIEW_ROUND_1,
          },
        });

        await tx.applicationStageHistory.create({
          data: {
            applicationId,
            fromStage: application.stage,
            toStage: updatedApp.stage,
            fromStatus: application.status,
            toStatus: updatedApp.status,
            notes: `Interview scheduled (${dto.interviewType} - ${dto.interviewMode})`,
            changedById: actorUserId,
          },
        });
      }

      await this.auditService.recordInTx(tx, {
        entityType: 'CandidateInterview',
        entityId: interview.id,
        action: 'INTERVIEW_SCHEDULED',
        actorUserId,
        newValue: {
          applicationId,
          interviewType: interview.interviewType,
          scheduledAt: interview.scheduledAt,
          interviewerUserId: interview.interviewerUserId,
        },
        reason: 'Candidate interview scheduled',
      });

      return interview;
    });
  }

  async recordInterviewFeedback(
    interviewId: string,
    dto: RecordInterviewFeedbackDto,
    actorUserId: string,
  ): Promise<CandidateInterview> {
    return this.prisma.$transaction(async (tx) => {
      const interview = await tx.candidateInterview.findUnique({
        where: { id: interviewId },
        include: { application: true },
      });
      if (!interview) {
        throw new NotFoundException(`Interview with ID '${interviewId}' not found`);
      }

      const updated = await tx.candidateInterview.update({
        where: { id: interviewId },
        data: {
          rating: dto.rating !== undefined ? dto.rating : interview.rating,
          recommendation: dto.recommendation,
          feedback: dto.feedback.trim(),
          status: InterviewStatus.COMPLETED,
          feedbackSubmittedAt: new Date(),
        },
      });

      await this.auditService.recordInTx(tx, {
        entityType: 'CandidateInterview',
        entityId: interview.id,
        action: 'INTERVIEW_FEEDBACK_RECORDED',
        actorUserId,
        newValue: {
          recommendation: updated.recommendation,
          rating: updated.rating,
          status: updated.status,
        },
        reason: 'Interview feedback and recommendation recorded',
      });

      return updated;
    });
  }

  async transitionStage(
    applicationId: string,
    dto: TransitionStageDto,
    actorUserId: string,
  ): Promise<JobApplication> {
    return this.prisma.$transaction(async (tx) => {
      await this.acquireApplicationLock(tx, applicationId);

      const existing = await tx.jobApplication.findUnique({
        where: { id: applicationId },
      });
      if (!existing) {
        throw new NotFoundException(`Application with ID '${applicationId}' not found`);
      }

      // Mandatory rejection rationale
      if (dto.status === ApplicationStatus.REJECTED) {
        const trimmed = dto.rejectionReason?.trim();
        if (!trimmed || trimmed.length === 0) {
          throw new BadRequestException('A non-empty rejectionReason is required when rejecting an application.');
        }
      }

      // Mandatory withdrawal rationale
      if (dto.status === ApplicationStatus.WITHDRAWN) {
        const trimmed = dto.withdrawnReason?.trim();
        if (!trimmed || trimmed.length === 0) {
          throw new BadRequestException('A non-empty withdrawnReason is required when withdrawing an application.');
        }
      }

      const updated = await tx.jobApplication.update({
        where: { id: applicationId },
        data: {
          stage: dto.stage,
          status: dto.status,
          rejectionReason: dto.rejectionReason?.trim() || null,
          withdrawnReason: dto.withdrawnReason?.trim() || null,
        },
        include: {
          candidate: true,
          vacancy: true,
        },
      });

      await tx.applicationStageHistory.create({
        data: {
          applicationId,
          fromStage: existing.stage,
          toStage: updated.stage,
          fromStatus: existing.status,
          toStatus: updated.status,
          notes: dto.notes?.trim() || (dto.rejectionReason || dto.withdrawnReason) || 'Stage updated',
          changedById: actorUserId,
        },
      });

      await this.auditService.recordInTx(tx, {
        entityType: 'JobApplication',
        entityId: applicationId,
        action: 'APPLICATION_STAGE_CHANGED',
        actorUserId,
        oldValue: { stage: existing.stage, status: existing.status },
        newValue: { stage: updated.stage, status: updated.status },
        reason: dto.notes || dto.rejectionReason || dto.withdrawnReason || 'Application stage transition',
      });

      return updated;
    });
  }

  // ── Job Offer Operations ───────────────────────────────────────────────────

  async createOffer(
    applicationId: string,
    dto: CreateOfferDto,
    actorUserId: string,
  ): Promise<JobOffer> {
    return this.prisma.$transaction(async (tx) => {
      await this.acquireApplicationLock(tx, applicationId);

      const application = await tx.jobApplication.findUnique({
        where: { id: applicationId },
        include: { vacancy: true },
      });
      if (!application) {
        throw new NotFoundException(`Application with ID '${applicationId}' not found`);
      }

      // 1. If application is in ACCEPTED status (Phase 6 handoff state), block creating another offer
      if (application.status === ApplicationStatus.ACCEPTED) {
        throw new BadRequestException(
          `Cannot create a new offer for application ${application.businessId}: candidate has already accepted an offer (Phase 6 handoff state).`,
        );
      }

      if (
        application.status === ApplicationStatus.REJECTED ||
        application.status === ApplicationStatus.WITHDRAWN
      ) {
        throw new BadRequestException(
          `Cannot create an offer for an application in '${application.status}' status.`,
        );
      }

      // 2. Prevent concurrent / parallel active offers on the same application
      const existingActiveOffer = await tx.jobOffer.findFirst({
        where: {
          applicationId,
          status: {
            in: [
              OfferStatus.DRAFT,
              OfferStatus.PENDING_APPROVAL,
              OfferStatus.APPROVED,
              OfferStatus.SENT,
              OfferStatus.ACCEPTED,
            ],
          },
        },
      });
      if (existingActiveOffer) {
        throw new BadRequestException(
          `An active job offer (${existingActiveOffer.businessId}) in status '${existingActiveOffer.status}' already exists for this application. Please use the controlled revision workflow or withdraw the existing offer first.`,
        );
      }

      // Validate currency
      const currency = dto.currency || 'INR';
      if (!SUPPORTED_OFFER_CURRENCIES.includes(currency as any)) {
        throw new BadRequestException(
          `Unsupported currency: '${currency}'. Supported currencies: ${SUPPORTED_OFFER_CURRENCIES.join(', ')}`,
        );
      }

      // Validate dates
      validateCalendarDate(dto.proposedStartDate, 'proposedStartDate');
      validateCalendarDate(dto.offerExpiryDate, 'offerExpiryDate');
      if (dto.offerExpiryDate > dto.proposedStartDate) {
        throw new BadRequestException('offerExpiryDate cannot be after proposedStartDate.');
      }

      // Validate salary
      if (dto.offeredSalary < 0) {
        throw new BadRequestException('offeredSalary cannot be negative.');
      }

      // Policy B: Enforce approved vacancy salary cap
      this.validateOfferSalaryCap(application.vacancy, dto.offeredSalary, currency);

      const businessId = await this.idGenerator.nextIdInTx(tx, 'OFF');

      const offer = await tx.jobOffer.create({
        data: {
          businessId,
          applicationId,
          vacancyId: application.vacancyId,
          version: 1,
          roleTitle: dto.roleTitle.trim(),
          employmentType: dto.employmentType || 'FULL_TIME',
          workMode: dto.workMode || 'ON_SITE',
          location: dto.location?.trim() || null,
          offeredSalary: new Prisma.Decimal(dto.offeredSalary),
          currency,
          salaryPeriod: dto.salaryPeriod || 'ANNUAL',
          proposedStartDate: dto.proposedStartDate,
          offerExpiryDate: dto.offerExpiryDate,
          notes: dto.notes?.trim() || null,
          status: OfferStatus.DRAFT,
          requestedById: actorUserId,
          lastModifiedById: actorUserId,
        },
        include: {
          application: { include: { candidate: true } },
          vacancy: true,
          requestedBy: {
            select: { id: true, email: true, employee: { select: { firstName: true, lastName: true } } },
          },
          lastModifiedBy: {
            select: { id: true, email: true, employee: { select: { firstName: true, lastName: true } } },
          },
        },
      });

      // Record first version snapshot
      await tx.jobOfferHistory.create({
        data: {
          offerId: offer.id,
          version: 1,
          status: OfferStatus.DRAFT,
          offeredSalary: offer.offeredSalary,
          currency: offer.currency,
          proposedStartDate: offer.proposedStartDate,
          offerExpiryDate: offer.offerExpiryDate,
          actorUserId,
          action: 'CREATED',
          notes: 'Initial draft offer created',
        },
      });

      // Update application stage to OFFER_STAGE and status to OFFERED
      await tx.jobApplication.update({
        where: { id: applicationId },
        data: {
          stage: ApplicationStage.OFFER_STAGE,
          status: ApplicationStatus.OFFERED,
        },
      });

      await tx.applicationStageHistory.create({
        data: {
          applicationId,
          fromStage: application.stage,
          toStage: ApplicationStage.OFFER_STAGE,
          fromStatus: application.status,
          toStatus: ApplicationStatus.OFFERED,
          notes: `Job offer ${offer.businessId} prepared in draft`,
          changedById: actorUserId,
        },
      });

      await this.auditService.recordInTx(tx, {
        entityType: 'JobOffer',
        entityId: offer.id,
        action: 'OFFER_CREATED',
        actorUserId,
        newValue: {
          businessId: offer.businessId,
          applicationId: offer.applicationId,
          offeredSalary: offer.offeredSalary,
          currency: offer.currency,
          proposedStartDate: offer.proposedStartDate,
          offerExpiryDate: offer.offerExpiryDate,
          status: offer.status,
        },
        reason: 'Corporate job offer created in draft',
      });

      return offer;
    });
  }

  async updateOffer(id: string, dto: UpdateOfferDto, actorUserId: string): Promise<JobOffer> {
    return this.prisma.$transaction(async (tx) => {
      const offerMeta = await tx.jobOffer.findUnique({
        where: { id },
        select: { id: true, applicationId: true },
      });
      if (!offerMeta) {
        throw new NotFoundException(`Job offer with ID '${id}' not found`);
      }
      await this.acquireApplicationLock(tx, offerMeta.applicationId);
      await this.acquireOfferLock(tx, id);

      const existing = await tx.jobOffer.findUnique({
        where: { id },
        include: { vacancy: true },
      });
      if (!existing) {
        throw new NotFoundException(`Job offer with ID '${id}' not found`);
      }

      if (existing.status !== OfferStatus.DRAFT) {
        throw new BadRequestException(
          `Direct edits are only permitted in DRAFT status (current: ${existing.status}). For approved or sent offers, please use the revision workflow.`,
        );
      }

      const finalSalary = dto.offeredSalary !== undefined ? dto.offeredSalary : Number(existing.offeredSalary);
      const finalCurrency = dto.currency || existing.currency;
      const finalStartDate = dto.proposedStartDate || existing.proposedStartDate;
      const finalExpiryDate = dto.offerExpiryDate || existing.offerExpiryDate;

      if (finalSalary < 0) {
        throw new BadRequestException('offeredSalary cannot be negative');
      }

      // Policy B: Enforce approved vacancy salary cap on direct edits
      this.validateOfferSalaryCap(existing.vacancy, finalSalary, finalCurrency);
      if (!SUPPORTED_OFFER_CURRENCIES.includes(finalCurrency as any)) {
        throw new BadRequestException(
          `Unsupported currency: '${finalCurrency}'. Supported currencies: ${SUPPORTED_OFFER_CURRENCIES.join(', ')}`,
        );
      }
      if (dto.proposedStartDate) validateCalendarDate(dto.proposedStartDate, 'proposedStartDate');
      if (dto.offerExpiryDate) validateCalendarDate(dto.offerExpiryDate, 'offerExpiryDate');
      if (finalExpiryDate > finalStartDate) {
        throw new BadRequestException('offerExpiryDate cannot be after proposedStartDate.');
      }

      const updated = await tx.jobOffer.update({
        where: { id },
        data: {
          lastModifiedById: actorUserId,
          roleTitle: dto.roleTitle !== undefined ? dto.roleTitle.trim() : undefined,
          employmentType: dto.employmentType,
          workMode: dto.workMode,
          location: dto.location !== undefined ? dto.location?.trim() || null : undefined,
          offeredSalary: dto.offeredSalary !== undefined ? new Prisma.Decimal(dto.offeredSalary) : undefined,
          currency: dto.currency,
          salaryPeriod: dto.salaryPeriod,
          proposedStartDate: dto.proposedStartDate,
          offerExpiryDate: dto.offerExpiryDate,
          notes: dto.notes !== undefined ? dto.notes?.trim() || null : undefined,
        },
        include: {
          application: { include: { candidate: true } },
          vacancy: true,
          requestedBy: {
            select: { id: true, email: true, employee: { select: { firstName: true, lastName: true } } },
          },
          lastModifiedBy: {
            select: { id: true, email: true, employee: { select: { firstName: true, lastName: true } } },
          },
          approvedBy: {
            select: { id: true, email: true, employee: { select: { firstName: true, lastName: true } } },
          },
        },
      });

      await tx.jobOfferHistory.create({
        data: {
          offerId: updated.id,
          version: updated.version,
          status: updated.status,
          offeredSalary: updated.offeredSalary,
          currency: updated.currency,
          proposedStartDate: updated.proposedStartDate,
          offerExpiryDate: updated.offerExpiryDate,
          actorUserId,
          action: 'UPDATED',
          notes: 'Draft offer fields updated',
        },
      });

      await this.auditService.recordInTx(tx, {
        entityType: 'JobOffer',
        entityId: updated.id,
        action: 'OFFER_UPDATED',
        actorUserId,
        oldValue: {
          offeredSalary: existing.offeredSalary,
          currency: existing.currency,
          proposedStartDate: existing.proposedStartDate,
          offerExpiryDate: existing.offerExpiryDate,
        },
        newValue: {
          offeredSalary: updated.offeredSalary,
          currency: updated.currency,
          proposedStartDate: updated.proposedStartDate,
          offerExpiryDate: updated.offerExpiryDate,
        },
        reason: 'Job offer draft fields updated',
      });

      return updated;
    });
  }

  /**
   * Controlled revision workflow for approved or sent offers.
   * Increments the offer version, preserves audit history snapshot, and resets status to DRAFT.
   */
  async reviseOffer(id: string, dto: UpdateOfferDto, actorUserId: string): Promise<JobOffer> {
    return this.prisma.$transaction(async (tx) => {
      const offerMeta = await tx.jobOffer.findUnique({
        where: { id },
        select: { id: true, applicationId: true },
      });
      if (!offerMeta) {
        throw new NotFoundException(`Job offer with ID '${id}' not found`);
      }
      await this.acquireApplicationLock(tx, offerMeta.applicationId);
      await this.acquireOfferLock(tx, id);

      const existing = await tx.jobOffer.findUnique({
        where: { id },
        include: { vacancy: true },
      });
      if (!existing) {
        throw new NotFoundException(`Job offer with ID '${id}' not found`);
      }

      if (
        existing.status === OfferStatus.ACCEPTED ||
        existing.status === OfferStatus.WITHDRAWN
      ) {
        throw new BadRequestException(
          `Cannot revise an offer in terminal status '${existing.status}'.`,
        );
      }

      const newVersion = existing.version + 1;
      const finalSalary = dto.offeredSalary !== undefined ? dto.offeredSalary : Number(existing.offeredSalary);
      const finalCurrency = dto.currency || existing.currency;
      const finalStartDate = dto.proposedStartDate || existing.proposedStartDate;
      const finalExpiryDate = dto.offerExpiryDate || existing.offerExpiryDate;

      if (finalSalary < 0) throw new BadRequestException('offeredSalary cannot be negative');

      // Policy B: Enforce approved vacancy salary cap on revisions
      this.validateOfferSalaryCap(existing.vacancy, finalSalary, finalCurrency);
      if (!SUPPORTED_OFFER_CURRENCIES.includes(finalCurrency as any)) {
        throw new BadRequestException(`Unsupported currency: '${finalCurrency}'`);
      }
      if (dto.proposedStartDate) validateCalendarDate(dto.proposedStartDate, 'proposedStartDate');
      if (dto.offerExpiryDate) validateCalendarDate(dto.offerExpiryDate, 'offerExpiryDate');
      if (finalExpiryDate > finalStartDate) {
        throw new BadRequestException('offerExpiryDate cannot be after proposedStartDate.');
      }

      const revised = await tx.jobOffer.update({
        where: { id },
        data: {
          version: newVersion,
          status: OfferStatus.DRAFT,
          lastModifiedById: actorUserId,
          roleTitle: dto.roleTitle !== undefined ? dto.roleTitle.trim() : undefined,
          employmentType: dto.employmentType,
          workMode: dto.workMode,
          location: dto.location !== undefined ? dto.location?.trim() || null : undefined,
          offeredSalary: dto.offeredSalary !== undefined ? new Prisma.Decimal(dto.offeredSalary) : undefined,
          currency: dto.currency,
          salaryPeriod: dto.salaryPeriod,
          proposedStartDate: dto.proposedStartDate,
          offerExpiryDate: dto.offerExpiryDate,
          notes: dto.notes !== undefined ? dto.notes?.trim() || null : undefined,
          approvedById: null,
          approvedAt: null,
          approvalNotes: null,
          sentAt: null,
          respondedAt: null,
          declineReason: null,
          responseNotes: null,
        },
        include: {
          application: { include: { candidate: true } },
          vacancy: true,
          requestedBy: {
            select: { id: true, email: true, employee: { select: { firstName: true, lastName: true } } },
          },
          lastModifiedBy: {
            select: { id: true, email: true, employee: { select: { firstName: true, lastName: true } } },
          },
        },
      });

      // If offer was previously DECLINED, revive parent application back to OFFERED status
      if (existing.status === OfferStatus.DECLINED) {
        const app = await tx.jobApplication.findUnique({
          where: { id: existing.applicationId },
        });
        if (app && app.status !== ApplicationStatus.ACCEPTED) {
          await tx.jobApplication.update({
            where: { id: existing.applicationId },
            data: {
              status: ApplicationStatus.OFFERED,
              stage: ApplicationStage.OFFER_STAGE,
            },
          });

          await tx.applicationStageHistory.create({
            data: {
              applicationId: existing.applicationId,
              fromStage: app.stage,
              toStage: ApplicationStage.OFFER_STAGE,
              fromStatus: app.status,
              toStatus: ApplicationStatus.OFFERED,
              notes: `Offer renegotiation: revision v${newVersion} created after candidate decline. Re-approval required.`,
              changedById: actorUserId,
            },
          });
        }
      }

      await tx.jobOfferHistory.create({
        data: {
          offerId: revised.id,
          version: newVersion,
          status: OfferStatus.DRAFT,
          offeredSalary: revised.offeredSalary,
          currency: revised.currency,
          proposedStartDate: revised.proposedStartDate,
          offerExpiryDate: revised.offerExpiryDate,
          actorUserId,
          action: 'REVISED',
          notes: `Offer revised to version ${newVersion}${existing.status === OfferStatus.DECLINED ? ' (Renegotiated after decline)' : ''}. Reset to DRAFT for re-approval.`,
        },
      });

      await this.auditService.recordInTx(tx, {
        entityType: 'JobOffer',
        entityId: revised.id,
        action: 'OFFER_REVISED',
        actorUserId,
        oldValue: { version: existing.version, status: existing.status },
        newValue: { version: revised.version, status: revised.status },
        reason: `Offer revised to version ${newVersion}`,
      });

      return revised;
    });
  }

  async submitOfferForApproval(id: string, actorUserId: string): Promise<JobOffer> {
    return this.prisma.$transaction(async (tx) => {
      const offerMeta = await tx.jobOffer.findUnique({
        where: { id },
        select: { id: true, applicationId: true },
      });
      if (!offerMeta) {
        throw new NotFoundException(`Job offer with ID '${id}' not found`);
      }
      await this.acquireApplicationLock(tx, offerMeta.applicationId);
      await this.acquireOfferLock(tx, id);

      const existing = await tx.jobOffer.findUnique({
        where: { id },
      });
      if (!existing) {
        throw new NotFoundException(`Job offer with ID '${id}' not found`);
      }

      if (existing.status !== OfferStatus.DRAFT) {
        throw new BadRequestException(
          `Only offers in DRAFT status can be submitted for approval (current: ${existing.status}).`,
        );
      }

      const updated = await tx.jobOffer.update({
        where: { id },
        data: {
          status: OfferStatus.PENDING_APPROVAL,
        },
        include: {
          application: { include: { candidate: true } },
          vacancy: true,
          requestedBy: {
            select: { id: true, email: true, employee: { select: { firstName: true, lastName: true } } },
          },
          lastModifiedBy: {
            select: { id: true, email: true, employee: { select: { firstName: true, lastName: true } } },
          },
        },
      });

      await tx.jobOfferHistory.create({
        data: {
          offerId: updated.id,
          version: updated.version,
          status: updated.status,
          offeredSalary: updated.offeredSalary,
          currency: updated.currency,
          proposedStartDate: updated.proposedStartDate,
          offerExpiryDate: updated.offerExpiryDate,
          actorUserId,
          action: 'SUBMITTED',
          notes: 'Submitted for management offer approval',
        },
      });

      await this.auditService.recordInTx(tx, {
        entityType: 'JobOffer',
        entityId: id,
        action: 'OFFER_SUBMITTED',
        actorUserId,
        oldValue: { status: existing.status },
        newValue: { status: updated.status },
        reason: 'Job offer submitted for management approval',
      });

      return updated;
    });
  }

  async reviewOffer(id: string, dto: ReviewOfferDto, actorUserId: string): Promise<JobOffer> {
    return this.prisma.$transaction(async (tx) => {
      const offerMeta = await tx.jobOffer.findUnique({
        where: { id },
        select: { id: true, applicationId: true },
      });
      if (!offerMeta) {
        throw new NotFoundException(`Job offer with ID '${id}' not found`);
      }
      await this.acquireApplicationLock(tx, offerMeta.applicationId);
      await this.acquireOfferLock(tx, id);

      const existing = await tx.jobOffer.findUnique({
        where: { id },
        include: { vacancy: true },
      });
      if (!existing) {
        throw new NotFoundException(`Job offer with ID '${id}' not found`);
      }

      if (existing.status !== OfferStatus.PENDING_APPROVAL) {
        throw new BadRequestException(
          `Only offers in PENDING_APPROVAL status can be reviewed (current: ${existing.status}).`,
        );
      }

      // STRICT ANTI-SELF-APPROVAL: Requester OR Reviser CANNOT review their own offer
      if (
        existing.requestedById === actorUserId ||
        (existing.lastModifiedById && existing.lastModifiedById === actorUserId)
      ) {
        throw new ForbiddenException(
          'Self-approval is not permitted: you cannot approve or review a job offer you requested or modified.',
        );
      }

      // Mandatory rejection rationale
      if (dto.action === 'REJECT') {
        const trimmed = dto.approvalNotes?.trim();
        if (!trimmed || trimmed.length === 0) {
          throw new BadRequestException(
            'A non-empty approvalNotes rationale is required when rejecting a job offer.',
          );
        }
      }

      // Revalidate offer salary cap and currency upon approval (defense-in-depth if vacancy budget changed)
      if (dto.action === 'APPROVE') {
        this.validateOfferSalaryCap(
          existing.vacancy,
          existing.offeredSalary,
          existing.currency,
        );
      }

      const targetStatus = dto.action === 'APPROVE' ? OfferStatus.APPROVED : OfferStatus.DRAFT;

      const updated = await tx.jobOffer.update({
        where: { id },
        data: {
          status: targetStatus,
          approvedById: dto.action === 'APPROVE' ? actorUserId : null,
          approvedAt: dto.action === 'APPROVE' ? new Date() : null,
          approvalNotes: dto.approvalNotes?.trim() || null,
        },
        include: {
          application: { include: { candidate: true } },
          vacancy: true,
          requestedBy: {
            select: { id: true, email: true, employee: { select: { firstName: true, lastName: true } } },
          },
          lastModifiedBy: {
            select: { id: true, email: true, employee: { select: { firstName: true, lastName: true } } },
          },
          approvedBy: {
            select: { id: true, email: true, employee: { select: { firstName: true, lastName: true } } },
          },
        },
      });

      await tx.jobOfferHistory.create({
        data: {
          offerId: updated.id,
          version: updated.version,
          status: updated.status,
          offeredSalary: updated.offeredSalary,
          currency: updated.currency,
          proposedStartDate: updated.proposedStartDate,
          offerExpiryDate: updated.offerExpiryDate,
          actorUserId,
          action: dto.action === 'APPROVE' ? 'APPROVED' : 'REJECTED',
          notes: dto.approvalNotes || `Offer ${dto.action.toLowerCase()}d by management`,
        },
      });

      await this.auditService.recordInTx(tx, {
        entityType: 'JobOffer',
        entityId: id,
        action: dto.action === 'APPROVE' ? 'OFFER_APPROVED' : 'OFFER_REJECTED',
        actorUserId,
        oldValue: { status: existing.status },
        newValue: { status: updated.status, approvalNotes: updated.approvalNotes },
        reason: dto.approvalNotes || `Job offer ${dto.action.toLowerCase()}d`,
      });

      return updated;
    });
  }

  async sendOffer(id: string, actorUserId: string): Promise<JobOffer> {
    return this.prisma.$transaction(async (tx) => {
      const offerMeta = await tx.jobOffer.findUnique({
        where: { id },
        select: { id: true, applicationId: true },
      });
      if (!offerMeta) {
        throw new NotFoundException(`Job offer with ID '${id}' not found`);
      }
      await this.acquireApplicationLock(tx, offerMeta.applicationId);
      await this.acquireOfferLock(tx, id);

      const existing = await tx.jobOffer.findUnique({
        where: { id },
      });
      if (!existing) {
        throw new NotFoundException(`Job offer with ID '${id}' not found`);
      }

      if (existing.status !== OfferStatus.APPROVED) {
        throw new BadRequestException(
          `Only APPROVED offers can be recorded as sent to the candidate (current: ${existing.status}).`,
        );
      }

      const updated = await tx.jobOffer.update({
        where: { id },
        data: {
          status: OfferStatus.SENT,
          sentAt: new Date(),
        },
        include: {
          application: { include: { candidate: true } },
          vacancy: true,
          requestedBy: {
            select: { id: true, email: true, employee: { select: { firstName: true, lastName: true } } },
          },
          approvedBy: {
            select: { id: true, email: true, employee: { select: { firstName: true, lastName: true } } },
          },
        },
      });

      await tx.jobOfferHistory.create({
        data: {
          offerId: updated.id,
          version: updated.version,
          status: updated.status,
          offeredSalary: updated.offeredSalary,
          currency: updated.currency,
          proposedStartDate: updated.proposedStartDate,
          offerExpiryDate: updated.offerExpiryDate,
          actorUserId,
          action: 'SENT',
          notes: 'Offer formally extended and recorded as sent to candidate',
        },
      });

      await this.auditService.recordInTx(tx, {
        entityType: 'JobOffer',
        entityId: id,
        action: 'OFFER_SENT',
        actorUserId,
        oldValue: { status: existing.status },
        newValue: { status: updated.status, sentAt: updated.sentAt },
        reason: 'Offer formally dispatched to candidate',
      });

      return updated;
    });
  }

  async recordOfferResponse(
    id: string,
    dto: RecordOfferResponseDto,
    actorUserId: string,
  ): Promise<JobOffer> {
    return this.prisma.$transaction(async (tx) => {
      const offerMeta = await tx.jobOffer.findUnique({
        where: { id },
        select: { id: true, applicationId: true },
      });
      if (!offerMeta) {
        throw new NotFoundException(`Job offer with ID '${id}' not found`);
      }
      await this.acquireApplicationLock(tx, offerMeta.applicationId);
      await this.acquireOfferLock(tx, id);

      const existing = await tx.jobOffer.findUnique({
        where: { id },
        include: { application: true },
      });
      if (!existing) {
        throw new NotFoundException(`Job offer with ID '${id}' not found`);
      }

      if (existing.status !== OfferStatus.SENT) {
        throw new BadRequestException(
          `Can only record candidate response for offers in SENT status (current: ${existing.status}).`,
        );
      }

      // Check Expiry Date for Acceptance
      const todayStr = new Date().toISOString().split('T')[0];
      if (dto.decision === 'ACCEPT' && todayStr > existing.offerExpiryDate) {
        throw new BadRequestException(
          `Offer ${existing.businessId} expired on ${existing.offerExpiryDate} and cannot be accepted. Please revise and reissue the offer.`,
        );
      }

      if (dto.decision === 'DECLINE') {
        const trimmed = dto.declineReason?.trim();
        if (!trimmed || trimmed.length === 0) {
          throw new BadRequestException('A non-empty declineReason is required when candidate declines an offer.');
        }

        const updated = await tx.jobOffer.update({
          where: { id },
          data: {
            status: OfferStatus.DECLINED,
            respondedAt: new Date(),
            declineReason: trimmed,
            responseNotes: dto.responseNotes?.trim() || null,
          },
          include: {
            application: { include: { candidate: true } },
            vacancy: true,
          },
        });

        // Update application status
        await tx.jobApplication.update({
          where: { id: existing.applicationId },
          data: { status: ApplicationStatus.REJECTED },
        });

        await tx.applicationStageHistory.create({
          data: {
            applicationId: existing.applicationId,
            fromStage: existing.application.stage,
            toStage: existing.application.stage,
            fromStatus: existing.application.status,
            toStatus: ApplicationStatus.REJECTED,
            notes: `Candidate declined offer: ${trimmed}`,
            changedById: actorUserId,
          },
        });

        await tx.jobOfferHistory.create({
          data: {
            offerId: updated.id,
            version: updated.version,
            status: updated.status,
            offeredSalary: updated.offeredSalary,
            currency: updated.currency,
            proposedStartDate: updated.proposedStartDate,
            offerExpiryDate: updated.offerExpiryDate,
            actorUserId,
            action: 'DECLINED',
            notes: `Candidate declined offer: ${trimmed}`,
          },
        });

        await this.auditService.recordInTx(tx, {
          entityType: 'JobOffer',
          entityId: id,
          action: 'OFFER_DECLINED',
          actorUserId,
          oldValue: { status: existing.status },
          newValue: { status: updated.status, declineReason: updated.declineReason },
          reason: trimmed,
        });

        return updated;
      }

      // Decision === 'ACCEPT'
      // STRICT HANDOFF INVARIANT:
      // Does NOT create User, Employee, Attendance, or Payroll records.
      // Phase 6 onboarding owns actual employee account creation & activation.
      const updated = await tx.jobOffer.update({
        where: { id },
        data: {
          status: OfferStatus.ACCEPTED,
          respondedAt: new Date(),
          responseNotes: dto.responseNotes?.trim() || 'Offer accepted by candidate',
        },
        include: {
          application: { include: { candidate: true } },
          vacancy: true,
        },
      });

      await tx.jobApplication.update({
        where: { id: existing.applicationId },
        data: {
          status: ApplicationStatus.ACCEPTED,
          stage: ApplicationStage.OFFER_STAGE,
        },
      });

      await tx.applicationStageHistory.create({
        data: {
          applicationId: existing.applicationId,
          fromStage: existing.application.stage,
          toStage: ApplicationStage.OFFER_STAGE,
          fromStatus: existing.application.status,
          toStatus: ApplicationStatus.ACCEPTED,
          notes: 'Candidate accepted offer. Ready for Phase 6 onboarding handoff.',
          changedById: actorUserId,
        },
      });

      await tx.jobOfferHistory.create({
        data: {
          offerId: updated.id,
          version: updated.version,
          status: updated.status,
          offeredSalary: updated.offeredSalary,
          currency: updated.currency,
          proposedStartDate: updated.proposedStartDate,
          offerExpiryDate: updated.offerExpiryDate,
          actorUserId,
          action: 'ACCEPTED',
          notes: 'Offer accepted by candidate. Handoff to Phase 6 onboarding.',
        },
      });

      await this.auditService.recordInTx(tx, {
        entityType: 'JobOffer',
        entityId: id,
        action: 'OFFER_ACCEPTED',
        actorUserId,
        oldValue: { status: existing.status },
        newValue: { status: updated.status, respondedAt: updated.respondedAt },
        reason: 'Candidate accepted job offer',
      });

      return updated;
    });
  }

  async withdrawOffer(id: string, dto: WithdrawOfferDto, actorUserId: string): Promise<JobOffer> {
    return this.prisma.$transaction(async (tx) => {
      const offerMeta = await tx.jobOffer.findUnique({
        where: { id },
        select: { id: true, applicationId: true },
      });
      if (!offerMeta) {
        throw new NotFoundException(`Job offer with ID '${id}' not found`);
      }
      await this.acquireApplicationLock(tx, offerMeta.applicationId);
      await this.acquireOfferLock(tx, id);

      const existing = await tx.jobOffer.findUnique({
        where: { id },
        include: { application: true },
      });
      if (!existing) {
        throw new NotFoundException(`Job offer with ID '${id}' not found`);
      }

      if (
        existing.status === OfferStatus.ACCEPTED ||
        existing.status === OfferStatus.DECLINED ||
        existing.status === OfferStatus.WITHDRAWN
      ) {
        throw new BadRequestException(
          `Cannot withdraw offer in terminal status '${existing.status}'.`,
        );
      }

      const updated = await tx.jobOffer.update({
        where: { id },
        data: {
          status: OfferStatus.WITHDRAWN,
          withdrawalReason: dto.withdrawalReason.trim(),
        },
        include: {
          application: { include: { candidate: true } },
          vacancy: true,
        },
      });

      await tx.jobApplication.update({
        where: { id: existing.applicationId },
        data: { status: ApplicationStatus.WITHDRAWN },
      });

      await tx.applicationStageHistory.create({
        data: {
          applicationId: existing.applicationId,
          fromStage: existing.application.stage,
          toStage: existing.application.stage,
          fromStatus: existing.application.status,
          toStatus: ApplicationStatus.WITHDRAWN,
          notes: `Offer withdrawn: ${dto.withdrawalReason.trim()}`,
          changedById: actorUserId,
        },
      });

      await tx.jobOfferHistory.create({
        data: {
          offerId: updated.id,
          version: updated.version,
          status: updated.status,
          offeredSalary: updated.offeredSalary,
          currency: updated.currency,
          proposedStartDate: updated.proposedStartDate,
          offerExpiryDate: updated.offerExpiryDate,
          actorUserId,
          action: 'WITHDRAWN',
          notes: dto.withdrawalReason.trim(),
        },
      });

      await this.auditService.recordInTx(tx, {
        entityType: 'JobOffer',
        entityId: id,
        action: 'OFFER_WITHDRAWN',
        actorUserId,
        oldValue: { status: existing.status },
        newValue: { status: updated.status, withdrawalReason: updated.withdrawalReason },
        reason: dto.withdrawalReason.trim(),
      });

      return updated;
    });
  }

  async expireOffer(id: string, actorUserId: string): Promise<JobOffer> {
    return this.prisma.$transaction(async (tx) => {
      const offerMeta = await tx.jobOffer.findUnique({
        where: { id },
        select: { id: true, applicationId: true },
      });
      if (!offerMeta) {
        throw new NotFoundException(`Job offer with ID '${id}' not found`);
      }
      await this.acquireApplicationLock(tx, offerMeta.applicationId);
      await this.acquireOfferLock(tx, id);

      const existing = await tx.jobOffer.findUnique({
        where: { id },
        include: { application: true },
      });
      if (!existing) {
        throw new NotFoundException(`Job offer with ID '${id}' not found`);
      }

      if (existing.status !== OfferStatus.SENT) {
        throw new BadRequestException(
          `Only offers in SENT status can transition to EXPIRED (current: ${existing.status}).`,
        );
      }

      const todayStr = new Date().toISOString().split('T')[0];
      if (todayStr <= existing.offerExpiryDate) {
        throw new BadRequestException(
          `Offer ${existing.businessId} has not yet reached its expiry date (${existing.offerExpiryDate}).`,
        );
      }

      const updated = await tx.jobOffer.update({
        where: { id },
        data: { status: OfferStatus.EXPIRED },
        include: {
          application: { include: { candidate: true } },
          vacancy: true,
        },
      });

      // Check if any other active offer exists on the application
      const otherActiveOffer = await tx.jobOffer.findFirst({
        where: {
          applicationId: existing.applicationId,
          id: { not: id },
          status: {
            in: [
              OfferStatus.DRAFT,
              OfferStatus.PENDING_APPROVAL,
              OfferStatus.APPROVED,
              OfferStatus.SENT,
              OfferStatus.ACCEPTED,
            ],
          },
        },
      });

      if (!otherActiveOffer && existing.application.status === ApplicationStatus.OFFERED) {
        await tx.jobApplication.update({
          where: { id: existing.applicationId },
          data: {
            status: ApplicationStatus.INTERVIEWING,
            stage: ApplicationStage.INTERVIEW_ROUND_1,
          },
        });

        await tx.applicationStageHistory.create({
          data: {
            applicationId: existing.applicationId,
            fromStage: existing.application.stage,
            toStage: ApplicationStage.INTERVIEW_ROUND_1,
            fromStatus: existing.application.status,
            toStatus: ApplicationStatus.INTERVIEWING,
            notes: `Offer ${existing.businessId} expired on ${existing.offerExpiryDate}. Application returned to active evaluation.`,
            changedById: actorUserId,
          },
        });
      }

      await tx.jobOfferHistory.create({
        data: {
          offerId: updated.id,
          version: updated.version,
          status: updated.status,
          offeredSalary: updated.offeredSalary,
          currency: updated.currency,
          proposedStartDate: updated.proposedStartDate,
          offerExpiryDate: updated.offerExpiryDate,
          actorUserId,
          action: 'EXPIRED',
          notes: `Offer expired after deadline ${existing.offerExpiryDate}`,
        },
      });

      await this.auditService.recordInTx(tx, {
        entityType: 'JobOffer',
        entityId: id,
        action: 'OFFER_EXPIRED',
        actorUserId,
        oldValue: { status: existing.status },
        newValue: { status: updated.status },
        reason: 'Offer validity expired',
      });

      return updated;
    });
  }

  async getOffers(query: QueryOffersDto) {
    const page = Math.max(1, query.page || 1);
    const limit = Math.max(1, Math.min(100, query.limit || 20));
    const skip = (page - 1) * limit;

    const where: Prisma.JobOfferWhereInput = {};
    if (query.vacancyId) where.vacancyId = query.vacancyId;
    if (query.applicationId) where.applicationId = query.applicationId;
    if (query.status) where.status = query.status;

    const [items, total] = await Promise.all([
      this.prisma.jobOffer.findMany({
        where,
        skip,
        take: limit,
        orderBy: [{ createdAt: 'desc' }],
        include: {
          application: { include: { candidate: true } },
          vacancy: {
            select: { id: true, businessId: true, title: true, status: true, budgetMin: true, budgetMax: true },
          },
          requestedBy: {
            select: { id: true, email: true, employee: { select: { firstName: true, lastName: true } } },
          },
          approvedBy: {
            select: { id: true, email: true, employee: { select: { firstName: true, lastName: true } } },
          },
          lastModifiedBy: {
            select: { id: true, email: true, employee: { select: { firstName: true, lastName: true } } },
          },
        },
      }),
      this.prisma.jobOffer.count({ where }),
    ]);

    return {
      items,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async getOffer(id: string, _actorUserId?: string): Promise<JobOffer> {
    const offer = await this.prisma.jobOffer.findUnique({
      where: { id },
      include: {
        application: {
          include: {
            candidate: true,
          },
        },
        vacancy: {
          include: { department: true, role: true },
        },
        requestedBy: {
          select: { id: true, email: true, employee: { select: { firstName: true, lastName: true } } },
        },
        approvedBy: {
          select: { id: true, email: true, employee: { select: { firstName: true, lastName: true } } },
        },
        lastModifiedBy: {
          select: { id: true, email: true, employee: { select: { firstName: true, lastName: true } } },
        },
        versions: {
          orderBy: { version: 'desc' },
          include: {
            actor: {
              select: { id: true, email: true, employee: { select: { firstName: true, lastName: true } } },
            },
          },
        },
      },
    });

    if (!offer) {
      throw new NotFoundException(`Job offer with ID '${id}' not found`);
    }

    return offer;
  }
}
