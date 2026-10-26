import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import {
  ApplicationStage,
  ApplicationStatus,
  CompensationRequestStatus,
  DocumentVerificationStatus,
  EmploymentStatus,
  OnboardingCase,
  OnboardingCaseStatus,
  OnboardingDocument,
  OnboardingDocumentType,
  OnboardingTask,
  OnboardingTaskCategory,
  OnboardingTaskStatus,
  Prisma,
  ProbationReviewOutcome,
  UserStatus,
} from '@prisma/client';
import * as argon2 from 'argon2';
import * as crypto from 'crypto';
import * as fs from 'fs';

import { AuditService } from '../../common/audit/audit.service';
import { IdGeneratorService } from '../../common/id-generator/id-generator.service';
import { isSystemActorIdentity, EXCLUDE_SYSTEM_ACTOR_WHERE } from '../../common/id-generator/seed-identity';
import { PrismaService, PrismaTxClient } from '../../common/prisma/prisma.service';
import { isValidCalendarDate } from '../../common/utils/calendar-date.util';
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
import {
  OnboardingStorageService,
  UploadedBinaryFile,
} from './onboarding-storage.service';

const TERMINAL_ONBOARDING_STATUSES: readonly OnboardingCaseStatus[] = [
  OnboardingCaseStatus.COMPLETED,
  OnboardingCaseStatus.WITHDRAWN,
  OnboardingCaseStatus.NO_SHOW,
  OnboardingCaseStatus.REJECTED,
];

const CANCELLATION_ONBOARDING_STATUSES: readonly OnboardingCaseStatus[] = [
  OnboardingCaseStatus.WITHDRAWN,
  OnboardingCaseStatus.NO_SHOW,
  OnboardingCaseStatus.REJECTED,
];

@Injectable()
export class OnboardingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly idGenerator: IdGeneratorService,
    private readonly storageService: OnboardingStorageService,
  ) {}

  // ── Helpers ───────────────────────────────────────────────────────────────

  /**
   * Acquire transactional advisory locks in alphabetical order to avoid deadlocks.
   */
  private async acquireSortedLocks(tx: PrismaTxClient, ...lockKeys: string[]): Promise<void> {
    const sorted = [...new Set(lockKeys)].sort();
    for (const key of sorted) {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${key}))`;
    }
  }

  /**
   * Calculate future calendar date (YYYY-MM-DD) by adding given months.
   */
  private addMonthsToDate(dateStr: string, months: number): string {
    const [year, month, day] = dateStr.split('-').map((n) => parseInt(n, 10));
    const targetDate = new Date(Date.UTC(year, month - 1 + months, day));
    // If the day overflowed the month (e.g. Feb 30), adjust to last day of that month
    const targetYear = targetDate.getUTCFullYear();
    const targetMonth = targetDate.getUTCMonth();
    const lastDayOfMonth = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate();
    const finalDay = Math.min(day, lastDayOfMonth);
    const finalMonthStr = String(targetMonth + 1).padStart(2, '0');
    const finalDayStr = String(finalDay).padStart(2, '0');
    return `${targetYear}-${finalMonthStr}-${finalDayStr}`;
  }

  /**
   * Notify CEO users about new compensation requests.
   * Excludes the system actor from receiving CEO notifications.
   */
  private async notifyCeos(tx: PrismaTxClient, message: string, requestId: string): Promise<void> {
    const ceos = await tx.user.findMany({
      where: {
        status: UserStatus.ACTIVE,
        ...EXCLUDE_SYSTEM_ACTOR_WHERE,
        userRoles: { some: { role: { code: 'CEO' } } },
      },
      select: { id: true },
    });

    for (const ceo of ceos) {
      await tx.notification.create({
        data: {
          recipientUserId: ceo.id,
          type: 'COMPENSATION_CHANGE_REQUESTED',
          entityType: 'EmployeeCompensationChangeRequest',
          entityId: requestId,
          action: '/settings/employees',
          message,
        },
      });
    }
  }

  // ── Onboarding Queue & Case Management ─────────────────────────────────────

  /**
   * List applications with accepted offers that are ready for onboarding (no onboarding case yet).
   */
  async listAcceptedApplicationsReadyForOnboarding() {
    return this.prisma.jobApplication.findMany({
      where: {
        status: ApplicationStatus.ACCEPTED,
        onboardingCase: null,
      },
      include: {
        candidate: {
          select: {
            id: true,
            businessId: true,
            fullName: true,
            email: true,
            phone: true,
          },
        },
        vacancy: {
          select: {
            id: true,
            businessId: true,
            title: true,
            department: { select: { id: true, name: true, code: true } },
          },
        },
        offers: {
          where: { status: 'ACCEPTED' },
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
      orderBy: { updatedAt: 'desc' },
    });
  }

  /**
   * Open an onboarding case for an accepted application & offer.
   */
  async createCase(dto: CreateOnboardingCaseDto, actorUserId: string): Promise<OnboardingCase> {
    if (!isValidCalendarDate(dto.targetJoiningDate)) {
      throw new BadRequestException('targetJoiningDate must be a valid real calendar date in YYYY-MM-DD format');
    }

    return this.prisma.$transaction(async (tx) => {
      // 1. Acquire application lock
      await this.acquireSortedLocks(tx, `application-${dto.applicationId}`);

      // 2. Verify application exists and status is ACCEPTED
      const application = await tx.jobApplication.findUnique({
        where: { id: dto.applicationId },
        include: {
          candidate: true,
          vacancy: true,
          offers: {
            where: { status: 'ACCEPTED' },
            orderBy: { createdAt: 'desc' },
            take: 1,
          },
          onboardingCase: true,
        },
      });

      if (!application) {
        throw new NotFoundException(`JobApplication ${dto.applicationId} not found`);
      }

      if (application.status !== ApplicationStatus.ACCEPTED) {
        throw new BadRequestException(
          `Cannot open onboarding case: Application status is '${application.status}'. Only ACCEPTED applications can be onboarded.`,
        );
      }

      const acceptedOffer = application.offers[0];
      if (!acceptedOffer) {
        throw new BadRequestException(
          'Cannot open onboarding case: No ACCEPTED job offer found for this application.',
        );
      }

      if (application.onboardingCase) {
        throw new ConflictException(
          `An onboarding case already exists for this application (${application.onboardingCase.businessId}).`,
        );
      }

      // Check if offer is already linked to another case
      const existingOfferCase = await tx.onboardingCase.findUnique({
        where: { offerId: acceptedOffer.id },
      });
      if (existingOfferCase) {
        throw new ConflictException(
          `An onboarding case already exists for this offer (${existingOfferCase.businessId}).`,
        );
      }

      // 3. Generate ONB business ID
      const businessId = await this.idGenerator.nextIdInTx(tx, 'ONB');

      // 4. Create OnboardingCase
      const onboardingCase = await tx.onboardingCase.create({
        data: {
          businessId,
          applicationId: application.id,
          offerId: acceptedOffer.id,
          status: OnboardingCaseStatus.IN_PROGRESS,
          targetJoiningDate: dto.targetJoiningDate,
          probationDurationMonths: dto.probationDurationMonths || 3,
          notes: dto.notes?.trim() || null,
          createdById: actorUserId,
        },
      });

      // 5. Seed default standard onboarding tasks
      const defaultTasks = [
        { title: 'Submit ID Proof and Address Proof', category: OnboardingTaskCategory.DOCUMENTATION },
        { title: 'Submit Educational & Experience Certificates', category: OnboardingTaskCategory.DOCUMENTATION },
        { title: 'Sign and Return Corporate Offer Letter', category: OnboardingTaskCategory.DOCUMENTATION },
        { title: 'Setup Official Email and System Accounts', category: OnboardingTaskCategory.IT_SETUP },
        { title: 'Allocate Workstation and IT Assets', category: OnboardingTaskCategory.WORKSPACE },
        { title: 'Conduct HR Induction and Policy Overview', category: OnboardingTaskCategory.ORIENTATION },
        { title: 'Department Technical Onboarding & Training', category: OnboardingTaskCategory.TRAINING },
        { title: 'Collect Bank Details & Tax Declarations', category: OnboardingTaskCategory.HR_FORMALITIES },
      ];

      for (const task of defaultTasks) {
        await tx.onboardingTask.create({
          data: {
            caseId: onboardingCase.id,
            title: task.title,
            category: task.category,
            status: OnboardingTaskStatus.PENDING,
          },
        });
      }

      // 6. Audit log
      await this.auditService.recordInTx(tx, {
        entityType: 'OnboardingCase',
        entityId: onboardingCase.id,
        action: 'ONBOARDING_CASE_CREATED',
        actorUserId,
        newValue: {
          businessId: onboardingCase.businessId,
          applicationId: onboardingCase.applicationId,
          offerId: onboardingCase.offerId,
          targetJoiningDate: onboardingCase.targetJoiningDate,
          probationDurationMonths: onboardingCase.probationDurationMonths,
        },
        reason: 'Onboarding case initiated for accepted offer',
      });

      return onboardingCase;
    });
  }

  /**
   * Find onboarding case by ID with full details.
   */
  async findCaseById(id: string) {
    const onboardingCase = await this.prisma.onboardingCase.findUnique({
      where: { id },
      include: {
        application: {
          include: {
            candidate: true,
            vacancy: {
              include: {
                department: true,
                role: true,
              },
            },
          },
        },
        offer: true,
        employee: {
          include: {
            department: true,
            user: {
              select: {
                id: true,
                email: true,
                status: true,
              },
            },
          },
        },
        documents: {
          orderBy: { createdAt: 'desc' },
          include: {
            uploadedBy: { select: { id: true, email: true } },
            verifiedBy: { select: { id: true, email: true } },
          },
        },
        tasks: {
          orderBy: { createdAt: 'asc' },
          include: {
            assignedTo: { select: { id: true, email: true } },
            completedBy: { select: { id: true, email: true } },
          },
        },
        createdBy: { select: { id: true, email: true } },
        finalizedBy: { select: { id: true, email: true } },
      },
    });

    if (!onboardingCase) {
      throw new NotFoundException(`Onboarding case ${id} not found`);
    }

    return onboardingCase;
  }

  /**
   * List onboarding cases with filtering and pagination.
   */
  async listCases(query: QueryOnboardingCasesDto) {
    const { status, search, page = 1, limit = 20 } = query;
    const skip = (page - 1) * limit;

    const where: Prisma.OnboardingCaseWhereInput = {};

    if (status) {
      where.status = status;
    }

    if (search && search.trim()) {
      const term = search.trim();
      where.OR = [
        { businessId: { contains: term, mode: 'insensitive' } },
        { application: { candidate: { fullName: { contains: term, mode: 'insensitive' } } } },
        { application: { candidate: { email: { contains: term, mode: 'insensitive' } } } },
        { application: { vacancy: { title: { contains: term, mode: 'insensitive' } } } },
      ];
    }

    const [cases, total] = await Promise.all([
      this.prisma.onboardingCase.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          application: {
            select: {
              id: true,
              businessId: true,
              candidate: {
                select: {
                  id: true,
                  businessId: true,
                  fullName: true,
                  email: true,
                  phone: true,
                },
              },
              vacancy: {
                select: {
                  id: true,
                  businessId: true,
                  title: true,
                  department: { select: { id: true, name: true, code: true } },
                },
              },
            },
          },
          offer: {
            select: {
              id: true,
              businessId: true,
              offeredSalary: true,
              currency: true,
              salaryPeriod: true,
              proposedStartDate: true,
            },
          },
          employee: {
            select: {
              id: true,
              businessId: true,
              employmentStatus: true,
            },
          },
          documents: {
            select: { id: true, status: true },
          },
          tasks: {
            select: { id: true, status: true },
          },
        },
      }),
      this.prisma.onboardingCase.count({ where }),
    ]);

    return {
      cases,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * Update onboarding case details.
   */
  async updateCase(id: string, dto: UpdateOnboardingCaseDto, actorUserId: string): Promise<OnboardingCase> {
    if (dto.targetJoiningDate && !isValidCalendarDate(dto.targetJoiningDate)) {
      throw new BadRequestException('targetJoiningDate must be a valid real calendar date in YYYY-MM-DD format');
    }
    if (dto.confirmedJoiningDate && !isValidCalendarDate(dto.confirmedJoiningDate)) {
      throw new BadRequestException('confirmedJoiningDate must be a valid real calendar date in YYYY-MM-DD format');
    }

    return this.prisma.$transaction(async (tx) => {
      await this.acquireSortedLocks(tx, `onboarding-${id}`);

      const onboardingCase = await tx.onboardingCase.findUnique({ where: { id } });
      if (!onboardingCase) {
        throw new NotFoundException(`Onboarding case ${id} not found`);
      }

      if ((TERMINAL_ONBOARDING_STATUSES as readonly string[]).includes(onboardingCase.status)) {
        throw new BadRequestException(
          `Cannot update onboarding case in '${onboardingCase.status}' status.`,
        );
      }

      const updated = await tx.onboardingCase.update({
        where: { id },
        data: {
          targetJoiningDate: dto.targetJoiningDate ?? onboardingCase.targetJoiningDate,
          confirmedJoiningDate: dto.confirmedJoiningDate ?? onboardingCase.confirmedJoiningDate,
          probationDurationMonths: dto.probationDurationMonths ?? onboardingCase.probationDurationMonths,
          notes: dto.notes !== undefined ? dto.notes?.trim() || null : onboardingCase.notes,
        },
      });

      await this.auditService.recordInTx(tx, {
        entityType: 'OnboardingCase',
        entityId: updated.id,
        action: 'ONBOARDING_CASE_UPDATED',
        actorUserId,
        oldValue: {
          targetJoiningDate: onboardingCase.targetJoiningDate,
          confirmedJoiningDate: onboardingCase.confirmedJoiningDate,
          probationDurationMonths: onboardingCase.probationDurationMonths,
        },
        newValue: {
          targetJoiningDate: updated.targetJoiningDate,
          confirmedJoiningDate: updated.confirmedJoiningDate,
          probationDurationMonths: updated.probationDurationMonths,
        },
        reason: 'Onboarding case details updated',
      });

      return updated;
    });
  }

  // ── Document Operations ───────────────────────────────────────────────────

  /**
   * Upload and track an onboarding document.
   */
  async uploadDocument(
    caseId: string,
    dto: UploadDocumentDto,
    file: UploadedBinaryFile | any,
    actorUserId: string,
  ): Promise<OnboardingDocument> {
    return this.prisma.$transaction(async (tx) => {
      await this.acquireSortedLocks(tx, `onboarding-${caseId}`);

      const onboardingCase = await tx.onboardingCase.findUnique({ where: { id: caseId } });
      if (!onboardingCase) {
        throw new NotFoundException(`Onboarding case ${caseId} not found`);
      }

      if ((TERMINAL_ONBOARDING_STATUSES as readonly string[]).includes(onboardingCase.status)) {
        throw new BadRequestException(
          `Cannot upload documents for case in '${onboardingCase.status}' status.`,
        );
      }

      if (!file || !file.buffer) {
        throw new BadRequestException({
          code: 'FILE_REQUIRED',
          message: 'A valid binary document file must be uploaded.',
        });
      }

      const stored = await this.storageService.saveDocumentFile(caseId, file);

      const doc = await tx.onboardingDocument.create({
        data: {
          caseId,
          documentType: dto.documentType,
          title: dto.title.trim(),
          filePath: stored.filePath,
          fileKey: stored.fileKey,
          fileName: stored.fileName,
          fileSize: stored.fileSize,
          mimeType: stored.mimeType,
          status: DocumentVerificationStatus.PENDING,
          uploadedById: actorUserId,
        },
      });

      await this.auditService.recordInTx(tx, {
        entityType: 'OnboardingDocument',
        entityId: doc.id,
        action: 'ONBOARDING_DOCUMENT_UPLOADED',
        actorUserId,
        newValue: {
          caseId,
          documentType: doc.documentType,
          title: doc.title,
          fileName: doc.fileName,
          fileKey: doc.fileKey,
          fileSize: doc.fileSize,
        },
        reason: 'Onboarding document uploaded for verification',
      });

      return doc;
    });
  }

  /**
   * Retrieves an authenticated document download stream from private storage.
   */
  async getDocumentDownload(
    caseId: string,
    documentId: string,
    _actorUserId: string,
  ): Promise<{ stream: fs.ReadStream; document: OnboardingDocument }> {
    const doc = await this.prisma.onboardingDocument.findUnique({
      where: { id: documentId },
    });

    if (!doc) {
      throw new NotFoundException(`Document ${documentId} not found`);
    }

    if (doc.caseId !== caseId) {
      throw new ForbiddenException({
        code: 'CROSS_CASE_DOCUMENT_ACCESS_FORBIDDEN',
        message: 'The requested document does not belong to the specified onboarding case.',
      });
    }

    const stream = await this.storageService.getDocumentReadStream(
      doc.filePath,
      doc.fileKey,
    );

    return { stream, document: doc };
  }

  /**
   * Verify or reject an onboarding document.
   */
  async verifyDocument(
    caseId: string,
    documentId: string,
    dto: VerifyDocumentDto,
    actorUserId: string,
  ): Promise<OnboardingDocument> {
    return this.prisma.$transaction(async (tx) => {
      await this.acquireSortedLocks(tx, `onboarding-${caseId}`);

      const doc = await tx.onboardingDocument.findFirst({
        where: { id: documentId, caseId },
      });

      if (!doc) {
        throw new NotFoundException(`Document ${documentId} not found for case ${caseId}`);
      }

      const updatedDoc = await tx.onboardingDocument.update({
        where: { id: documentId },
        data: {
          status: dto.status,
          verifiedById: actorUserId,
          verifiedAt: new Date(),
          verificationNotes: dto.verificationNotes?.trim() || null,
        },
      });

      await this.auditService.recordInTx(tx, {
        entityType: 'OnboardingDocument',
        entityId: updatedDoc.id,
        action: 'ONBOARDING_DOCUMENT_VERIFIED',
        actorUserId,
        oldValue: { status: doc.status },
        newValue: {
          status: updatedDoc.status,
          verificationNotes: updatedDoc.verificationNotes,
        },
        reason: `Document verification outcome: ${updatedDoc.status}`,
      });

      return updatedDoc;
    });
  }

  // ── Task Operations ───────────────────────────────────────────────────────

  /**
   * Create an onboarding checklist task.
   */
  async createTask(caseId: string, dto: CreateTaskDto, actorUserId: string): Promise<OnboardingTask> {
    if (dto.dueDate && !isValidCalendarDate(dto.dueDate)) {
      throw new BadRequestException('dueDate must be a valid real calendar date in YYYY-MM-DD format');
    }

    return this.prisma.$transaction(async (tx) => {
      await this.acquireSortedLocks(tx, `onboarding-${caseId}`);

      const onboardingCase = await tx.onboardingCase.findUnique({ where: { id: caseId } });
      if (!onboardingCase) {
        throw new NotFoundException(`Onboarding case ${caseId} not found`);
      }

      if ((TERMINAL_ONBOARDING_STATUSES as readonly string[]).includes(onboardingCase.status)) {
        throw new BadRequestException(`Cannot add tasks to case in '${onboardingCase.status}' status.`);
      }

      const task = await tx.onboardingTask.create({
        data: {
          caseId,
          title: dto.title.trim(),
          category: dto.category,
          assignedToUserId: dto.assignedToUserId || null,
          dueDate: dto.dueDate || null,
          status: OnboardingTaskStatus.PENDING,
          notes: dto.notes?.trim() || null,
        },
      });

      await this.auditService.recordInTx(tx, {
        entityType: 'OnboardingTask',
        entityId: task.id,
        action: 'ONBOARDING_TASK_CREATED',
        actorUserId,
        newValue: {
          caseId,
          title: task.title,
          category: task.category,
          assignedToUserId: task.assignedToUserId,
          dueDate: task.dueDate,
        },
        reason: 'Onboarding checklist task created',
      });

      return task;
    });
  }

  /**
   * Update status or details of an onboarding task.
   */
  async updateTask(
    caseId: string,
    taskId: string,
    dto: UpdateTaskDto,
    actorUserId: string,
  ): Promise<OnboardingTask> {
    if (dto.dueDate && !isValidCalendarDate(dto.dueDate)) {
      throw new BadRequestException('dueDate must be a valid real calendar date in YYYY-MM-DD format');
    }

    return this.prisma.$transaction(async (tx) => {
      await this.acquireSortedLocks(tx, `onboarding-${caseId}`);

      const task = await tx.onboardingTask.findFirst({
        where: { id: taskId, caseId },
      });

      if (!task) {
        throw new NotFoundException(`Task ${taskId} not found for case ${caseId}`);
      }

      const isCompleting =
        dto.status === OnboardingTaskStatus.COMPLETED && task.status !== OnboardingTaskStatus.COMPLETED;

      const updatedTask = await tx.onboardingTask.update({
        where: { id: taskId },
        data: {
          title: dto.title !== undefined ? dto.title.trim() : task.title,
          category: dto.category !== undefined ? dto.category : task.category,
          assignedToUserId:
            dto.assignedToUserId !== undefined ? dto.assignedToUserId : task.assignedToUserId,
          dueDate: dto.dueDate !== undefined ? dto.dueDate : task.dueDate,
          status: dto.status !== undefined ? dto.status : task.status,
          completedAt: isCompleting ? new Date() : dto.status === OnboardingTaskStatus.PENDING ? null : task.completedAt,
          completedById: isCompleting ? actorUserId : dto.status === OnboardingTaskStatus.PENDING ? null : task.completedById,
          notes: dto.notes !== undefined ? dto.notes?.trim() || null : task.notes,
        },
      });

      await this.auditService.recordInTx(tx, {
        entityType: 'OnboardingTask',
        entityId: updatedTask.id,
        action: 'ONBOARDING_TASK_UPDATED',
        actorUserId,
        oldValue: { status: task.status },
        newValue: { status: updatedTask.status, title: updatedTask.title },
        reason: 'Onboarding task progress updated',
      });

      return updatedTask;
    });
  }

  // ── Exceptions: Cancellation, Withdrawal, No-Show ─────────────────────────

  /**
   * Handle candidate withdrawal, no-show, or rejection without creating employee accounts.
   */
  async cancelOnboarding(
    caseId: string,
    dto: CancelOnboardingDto,
    actorUserId: string,
  ): Promise<OnboardingCase> {
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.onboardingCase.findUnique({ where: { id: caseId } });
      if (!existing) {
        throw new NotFoundException(`Onboarding case ${caseId} not found`);
      }

      // Sorted advisory locks
      await this.acquireSortedLocks(tx, `application-${existing.applicationId}`, `onboarding-${caseId}`);

      if (existing.status === OnboardingCaseStatus.COMPLETED || existing.employeeId) {
        throw new BadRequestException(
          'Cannot cancel an onboarding case that has already been finalized as an employee.',
        );
      }

      if ((CANCELLATION_ONBOARDING_STATUSES as readonly string[]).includes(existing.status)) {
        throw new BadRequestException(`Onboarding case is already in '${existing.status}' status.`);
      }

      // Update OnboardingCase
      const updatedCase = await tx.onboardingCase.update({
        where: { id: caseId },
        data: {
          status: dto.status,
          cancellationReason: dto.reason.trim(),
        },
      });

      // Update Application status
      const appStatus =
        dto.status === OnboardingCaseStatus.WITHDRAWN
          ? ApplicationStatus.WITHDRAWN
          : ApplicationStatus.REJECTED;

      const application = await tx.jobApplication.findUnique({
        where: { id: existing.applicationId },
      });

      if (application) {
        await tx.jobApplication.update({
          where: { id: application.id },
          data: {
            status: appStatus,
            withdrawnReason: dto.reason.trim(),
          },
        });

        await tx.applicationStageHistory.create({
          data: {
            applicationId: application.id,
            fromStage: application.stage,
            toStage: application.stage,
            fromStatus: application.status,
            toStatus: appStatus,
            notes: `Onboarding cancelled (${dto.status}): ${dto.reason.trim()}`,
            changedById: actorUserId,
          },
        });
      }

      await this.auditService.recordInTx(tx, {
        entityType: 'OnboardingCase',
        entityId: updatedCase.id,
        action: 'ONBOARDING_CANCELLED',
        actorUserId,
        oldValue: { status: existing.status },
        newValue: { status: updatedCase.status, reason: dto.reason.trim() },
        reason: `Onboarding cancelled as ${dto.status}`,
      });

      return updatedCase;
    });
  }

  // ── Finalization & Employee Record Creation ───────────────────────────────

  /**
   * Finalize onboarding: Idempotently create Employee, User (PENDING_SETUP), UserRole,
   * transition Application to HIRED, create initial Compensation request via Phase 2,
   * and link everything atomically.
   */
  async finalizeOnboarding(
    caseId: string,
    dto: FinalizeOnboardingDto,
    actorUserId: string,
  ): Promise<OnboardingCase> {
    if (!isValidCalendarDate(dto.confirmedJoiningDate)) {
      throw new BadRequestException('confirmedJoiningDate must be a valid real calendar date in YYYY-MM-DD format');
    }
    const sanitizedDob = dto.dateOfBirth?.trim();
    if (sanitizedDob && !isValidCalendarDate(sanitizedDob)) {
      throw new BadRequestException('dateOfBirth must be a valid real calendar date in YYYY-MM-DD format');
    }

    return this.prisma.$transaction(async (tx) => {
      // 1. Fetch case first to obtain applicationId for sorted locking
      const initialCase = await tx.onboardingCase.findUnique({ where: { id: caseId } });
      if (!initialCase) {
        throw new NotFoundException(`Onboarding case ${caseId} not found`);
      }

      // 2. Deadlock-free sorted advisory locks
      await this.acquireSortedLocks(
        tx,
        `application-${initialCase.applicationId}`,
        `onboarding-${caseId}`,
      );

      // 3. Re-read case under lock for IDEMPOTENCY check
      const currentCase = await tx.onboardingCase.findUnique({
        where: { id: caseId },
        include: {
          application: {
            include: {
              candidate: true,
              vacancy: true,
            },
          },
          offer: true,
          documents: true,
          tasks: true,
        },
      });

      if (!currentCase) {
        throw new NotFoundException(`Onboarding case ${caseId} not found`);
      }

      if (currentCase.employeeId !== null || currentCase.status === OnboardingCaseStatus.COMPLETED) {
        throw new ConflictException(
          'This onboarding case has already been finalized and the employee record is created.',
        );
      }

      if ((CANCELLATION_ONBOARDING_STATUSES as readonly string[]).includes(currentCase.status)) {
        throw new BadRequestException(
          `Cannot finalize onboarding case in '${currentCase.status}' status.`,
        );
      }

      // FLOW-ONB-001: Enforce server-side readiness gates before finalization
      const blockers: string[] = [];

      // A. Mandatory Tasks Gate: All checklist tasks must be COMPLETED or WAIVED
      const incompleteTasks = (currentCase.tasks || []).filter(
        (t) =>
          t.status !== OnboardingTaskStatus.COMPLETED &&
          t.status !== OnboardingTaskStatus.WAIVED,
      );
      if (incompleteTasks.length > 0) {
        for (const task of incompleteTasks) {
          blockers.push(
            `Incomplete onboarding task: "${task.title}" (${task.category}) is still ${task.status}.`,
          );
        }
      }

      // B. Mandatory Documents Gate: Verified proof of identity (National ID or Passport)
      const hasVerifiedIdentity = (currentCase.documents || []).some(
        (doc) =>
          (doc.documentType === OnboardingDocumentType.NATIONAL_ID ||
            doc.documentType === OnboardingDocumentType.PASSPORT) &&
          doc.status === DocumentVerificationStatus.VERIFIED,
      );
      if (!hasVerifiedIdentity) {
        blockers.push(
          'Missing verified Identity Proof: At least one National ID or Passport must be uploaded and verified.',
        );
      }

      // C. Mandatory Documents Gate: Verified Signed Corporate Offer Letter
      const hasVerifiedSignedOffer = (currentCase.documents || []).some(
        (doc) =>
          doc.documentType === OnboardingDocumentType.SIGNED_OFFER_LETTER &&
          doc.status === DocumentVerificationStatus.VERIFIED,
      );
      if (!hasVerifiedSignedOffer) {
        blockers.push(
          'Missing verified Signed Offer Letter: Signed corporate offer letter must be uploaded and verified.',
        );
      }

      // D. Document Resolution Gate: No pending or rejected documents allowed
      const pendingDocs = (currentCase.documents || []).filter(
        (doc) => doc.status === DocumentVerificationStatus.PENDING,
      );
      if (pendingDocs.length > 0) {
        for (const doc of pendingDocs) {
          blockers.push(
            `Document "${doc.title}" (${doc.documentType}) is pending verification.`,
          );
        }
      }

      const rejectedDocs = (currentCase.documents || []).filter(
        (doc) => doc.status === DocumentVerificationStatus.REJECTED,
      );
      if (rejectedDocs.length > 0) {
        for (const doc of rejectedDocs) {
          blockers.push(
            `Document "${doc.title}" (${doc.documentType}) is rejected and must be resolved.`,
          );
        }
      }

      if (blockers.length > 0) {
        throw new UnprocessableEntityException({
          code: 'ONBOARDING_GATES_FAILED',
          message: `Cannot finalize onboarding case: ${blockers.length} readiness condition(s) not satisfied.`,
          blockers,
        });
      }

      const { candidate, vacancy } = currentCase.application;
      const offer = currentCase.offer;

      // 4. Determine department and role
      const departmentId = dto.departmentId || vacancy.departmentId;
      const roleId = dto.roleId || vacancy.roleId;

      if (!roleId) {
        throw new BadRequestException({
          code: 'ONBOARDING_ROLE_REQUIRED',
          message:
            'A role is required to finalize onboarding. Set the vacancy role or pass roleId. No default role is assigned.',
        });
      }

      const role = await tx.role.findUnique({ where: { id: roleId } });
      if (!role) {
        throw new NotFoundException('Role not found');
      }

      // 5. User Account Creation (or linking if existing inactive user)
      let userId: string;
      const existingUser = await tx.user.findUnique({
        where: { email: candidate.email.toLowerCase().trim() },
        include: { employee: true, userRoles: true },
      });

      if (existingUser) {
        if (existingUser.employee) {
          throw new ConflictException(
            `A user with email ${candidate.email} already exists and is linked to employee ${existingUser.employee.businessId}.`,
          );
        }
        userId = existingUser.id;
      } else {
        if (role.isProtected) {
          const actor = await tx.user.findUnique({
            where: { id: actorUserId },
            include: { userRoles: { include: { role: true } } },
          });
          const actorIsCeo =
            Boolean(
              actor &&
              !isSystemActorIdentity(actor) &&
              actor.userRoles.some((assignment) => assignment.role.code === 'CEO'),
            );
          if (!actorIsCeo) {
            throw new ForbiddenException('Only the CEO can assign protected roles');
          }
        }

        // Generate high-entropy random password and Argon2 hash
        const tempPassword = crypto.randomBytes(16).toString('hex');
        const passwordHash = await argon2.hash(tempPassword, {
          type: argon2.argon2id,
          memoryCost: 65536,
          timeCost: 3,
          parallelism: 4,
        });

        const newUser = await tx.user.create({
          data: {
            email: candidate.email.toLowerCase().trim(),
            passwordHash,
            status: UserStatus.PENDING_SETUP,
            mustChangePassword: true,
            userRoles: {
              create: {
                roleId,
                grantedByUserId: actorUserId,
              },
            },
          },
        });
        userId = newUser.id;
      }

      // 6. Calculate Probation End Date
      const probationEndDate = this.addMonthsToDate(
        dto.confirmedJoiningDate,
        currentCase.probationDurationMonths,
      );

      // 7. Generate EMP-#### business ID
      const empBusinessId = await this.idGenerator.nextIdInTx(tx, 'EMP');

      // Split name safely
      const nameParts = candidate.fullName.trim().split(/\s+/);
      const firstName = nameParts[0] || candidate.fullName;
      const lastName = nameParts.slice(1).join(' ') || '.';

      // 8. Create Employee record
      const employee = await tx.employee.create({
        data: {
          businessId: empBusinessId,
          userId,
          departmentId,
          employmentStatus: EmploymentStatus.PROBATION,
          employmentType: offer.employmentType,
          firstName,
          lastName,
          phone: dto.phone?.trim() || candidate.phone || null,
          joinedAt: new Date(`${dto.confirmedJoiningDate}T00:00:00.000Z`),
          jobTitle: dto.jobTitle?.trim() || offer.roleTitle,
          personalEmail: dto.personalEmail?.trim().toLowerCase() || candidate.email.toLowerCase(),
          dateOfBirth: sanitizedDob || null,
          gender: dto.gender?.trim() || null,
          address: dto.address?.trim() || null,
          emergencyContactName: dto.emergencyContactName?.trim() || null,
          emergencyContactPhone: dto.emergencyContactPhone?.trim() || null,
          emergencyContactRelation: dto.emergencyContactRelation?.trim() || null,
          probationEndDate,
        },
      });

      // 9. Record EmployeeStatusHistory
      await tx.employeeStatusHistory.create({
        data: {
          employeeId: employee.id,
          previousStatus: EmploymentStatus.ACTIVE,
          newStatus: EmploymentStatus.PROBATION,
          effectiveDate: dto.confirmedJoiningDate,
          reason: 'Initial onboarding completed — employment started on probation',
          authorizedByUserId: actorUserId,
        },
      });

      // 10. Transition JobApplication stage to HIRED
      await tx.jobApplication.update({
        where: { id: currentCase.applicationId },
        data: {
          stage: ApplicationStage.HIRED,
        },
      });

      await tx.applicationStageHistory.create({
        data: {
          applicationId: currentCase.applicationId,
          fromStage: currentCase.application.stage,
          toStage: ApplicationStage.HIRED,
          fromStatus: currentCase.application.status,
          toStatus: currentCase.application.status,
          notes: `Onboarding finalized. Employee record created: ${employee.businessId}`,
          changedById: actorUserId,
        },
      });

      // 11. Create Phase 2 Compensation Request
      // Normalize salary to monthly if offer was ANNUAL
      const baseSalaryNum = Number(offer.offeredSalary);
      const monthlySalary =
        offer.salaryPeriod === 'ANNUAL' ? baseSalaryNum / 12 : baseSalaryNum;
      const roundedMonthlySalary = new Prisma.Decimal(monthlySalary.toFixed(2));

      const compRequest = await tx.employeeCompensationChangeRequest.create({
        data: {
          employeeId: employee.id,
          currentBaseSalary: null,
          requestedBaseSalary: roundedMonthlySalary,
          currency: offer.currency || 'INR',
          paymentFrequency: 'MONTHLY',
          effectiveDate: dto.confirmedJoiningDate,
          reason: `Initial compensation from accepted Job Offer ${offer.businessId}`,
          status: CompensationRequestStatus.PENDING,
          requestedByUserId: actorUserId,
        },
      });

      await this.notifyCeos(
        tx,
        `New hire ${employee.firstName} ${employee.lastName} (${employee.businessId}) pending compensation approval from offer ${offer.businessId}`,
        compRequest.id,
      );

      // 12. Finalize OnboardingCase
      const finalizedCase = await tx.onboardingCase.update({
        where: { id: caseId },
        data: {
          employeeId: employee.id,
          status: OnboardingCaseStatus.COMPLETED,
          confirmedJoiningDate: dto.confirmedJoiningDate,
          finalizedById: actorUserId,
          finalizedAt: new Date(),
          notes: dto.notes !== undefined ? dto.notes?.trim() || null : currentCase.notes,
        },
        include: {
          employee: true,
          application: { include: { candidate: true } },
          offer: true,
        },
      });

      // 13. Audit log
      await this.auditService.recordInTx(tx, {
        entityType: 'OnboardingCase',
        entityId: finalizedCase.id,
        action: 'ONBOARDING_FINALIZED',
        actorUserId,
        newValue: {
          businessId: finalizedCase.businessId,
          employeeId: employee.id,
          employeeBusinessId: employee.businessId,
          userId,
          confirmedJoiningDate: dto.confirmedJoiningDate,
          probationEndDate,
          compensationRequestId: compRequest.id,
        },
        reason: 'Onboarding finalized and employee created',
      });

      return finalizedCase;
    });
  }

  // ── Probation Review & Evaluation Operations ──────────────────────────────

  /**
   * Record periodic or final probation review for an employee.
   */
  async recordProbationReview(
    employeeId: string,
    dto: CreateProbationReviewDto,
    actorUserId: string,
  ) {
    if (!isValidCalendarDate(dto.reviewDate)) {
      throw new BadRequestException('reviewDate must be a valid real calendar date in YYYY-MM-DD format');
    }

    if (dto.outcome === ProbationReviewOutcome.EXTENDED) {
      if (!dto.extendedEndDate || !isValidCalendarDate(dto.extendedEndDate)) {
        throw new BadRequestException(
          'extendedEndDate is mandatory and must be a valid real calendar date (YYYY-MM-DD) when outcome is EXTENDED',
        );
      }
      if (dto.extendedEndDate <= dto.reviewDate) {
        throw new BadRequestException(
          'extendedEndDate must be strictly after the reviewDate',
        );
      }
    }

    return this.prisma.$transaction(async (tx) => {
      // 1. Transactional lock for probation operations
      await this.acquireSortedLocks(tx, `probation-${employeeId}`);

      // 2. Fetch employee
      const employee = await tx.employee.findUnique({
        where: { id: employeeId },
        include: { user: true },
      });

      if (!employee) {
        throw new NotFoundException(`Employee ${employeeId} not found`);
      }

      // SEC-ONB-002: Enforce segregation of duties - employees cannot review or confirm themselves
      if (employee.userId && employee.userId === actorUserId) {
        throw new ForbiddenException({
          code: 'SELF_PROBATION_REVIEW_FORBIDDEN',
          message:
            'Employees are strictly prohibited from conducting or submitting their own probation reviews',
        });
      }

      const actorEmployee = await tx.employee.findFirst({
        where: { userId: actorUserId },
      });
      if (actorEmployee && actorEmployee.id === employeeId) {
        throw new ForbiddenException({
          code: 'SELF_PROBATION_REVIEW_FORBIDDEN',
          message:
            'Employees are strictly prohibited from conducting or submitting their own probation reviews',
        });
      }

      // DATA-ONB-001: Probation reviews can strictly only be performed on employees in PROBATION status
      if (employee.employmentStatus !== EmploymentStatus.PROBATION) {
        throw new ConflictException({
          code: 'EMPLOYEE_NOT_ON_PROBATION',
          message: `Cannot record probation review for employee with status '${employee.employmentStatus}'. Only employees currently in PROBATION status can undergo probation reviews.`,
        });
      }

      // 3. Create probation review entry
      const review = await tx.employeeProbationReview.create({
        data: {
          employeeId,
          reviewDate: dto.reviewDate,
          outcome: dto.outcome,
          extendedEndDate:
            dto.outcome === ProbationReviewOutcome.EXTENDED ? dto.extendedEndDate : null,
          notes: dto.notes.trim(),
          reviewedById: actorUserId,
        },
      });

      // 4. Transition employee status and update attributes according to outcome
      let updatedEmployee;

      if (dto.outcome === ProbationReviewOutcome.CONFIRMED) {
        updatedEmployee = await tx.employee.update({
          where: { id: employeeId },
          data: {
            employmentStatus: EmploymentStatus.ACTIVE,
            confirmationDate: dto.reviewDate,
          },
        });

        await tx.employeeStatusHistory.create({
          data: {
            employeeId,
            previousStatus: employee.employmentStatus,
            newStatus: EmploymentStatus.ACTIVE,
            effectiveDate: dto.reviewDate,
            reason: `Probation confirmed: ${dto.notes.trim()}`,
            authorizedByUserId: actorUserId,
          },
        });
      } else if (dto.outcome === ProbationReviewOutcome.EXTENDED) {
        updatedEmployee = await tx.employee.update({
          where: { id: employeeId },
          data: {
            probationEndDate: dto.extendedEndDate!,
          },
        });

        await tx.employeeStatusHistory.create({
          data: {
            employeeId,
            previousStatus: employee.employmentStatus,
            newStatus: employee.employmentStatus,
            effectiveDate: dto.reviewDate,
            reason: `Probation extended until ${dto.extendedEndDate}: ${dto.notes.trim()}`,
            authorizedByUserId: actorUserId,
          },
        });
      } else if (dto.outcome === ProbationReviewOutcome.TERMINATED) {
        updatedEmployee = await tx.employee.update({
          where: { id: employeeId },
          data: {
            employmentStatus: EmploymentStatus.TERMINATED,
            lastWorkingDate: dto.reviewDate,
          },
        });

        // Suspend user access
        await tx.user.update({
          where: { id: employee.userId },
          data: { status: UserStatus.SUSPENDED },
        });

        await tx.employeeStatusHistory.create({
          data: {
            employeeId,
            previousStatus: employee.employmentStatus,
            newStatus: EmploymentStatus.TERMINATED,
            effectiveDate: dto.reviewDate,
            reason: `Probation unsuccessful — employment terminated: ${dto.notes.trim()}`,
            accessRestricted: true,
            authorizedByUserId: actorUserId,
          },
        });
      }

      // 5. Audit log
      await this.auditService.recordInTx(tx, {
        entityType: 'EmployeeProbationReview',
        entityId: review.id,
        action: 'PROBATION_REVIEW_RECORDED',
        actorUserId,
        newValue: {
          employeeId,
          employeeBusinessId: employee.businessId,
          outcome: dto.outcome,
          reviewDate: dto.reviewDate,
          extendedEndDate: dto.extendedEndDate,
        },
        reason: `Probation review recorded with outcome: ${dto.outcome}`,
      });

      return {
        review,
        employee: updatedEmployee,
      };
    });
  }

  /**
   * List all probation reviews for an employee.
   */
  async getProbationReviews(employeeId: string) {
    const employee = await this.prisma.employee.findUnique({
      where: { id: employeeId },
      select: {
        id: true,
        businessId: true,
        firstName: true,
        lastName: true,
        employmentStatus: true,
        joinedAt: true,
        probationEndDate: true,
        confirmationDate: true,
      },
    });

    if (!employee) {
      throw new NotFoundException(`Employee ${employeeId} not found`);
    }

    const reviews = await this.prisma.employeeProbationReview.findMany({
      where: { employeeId },
      orderBy: { reviewDate: 'desc' },
      include: {
        reviewedBy: {
          select: { id: true, email: true },
        },
      },
    });

    return {
      employee,
      reviews,
    };
  }
}
