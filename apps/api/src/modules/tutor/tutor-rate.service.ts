import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CompensationRequestStatus, Prisma, TutorRate, TutorRateChangeRequest } from '@prisma/client';
import { format } from 'date-fns';
import { fromZonedTime, toZonedTime } from 'date-fns-tz';

import { AuditService } from '../../common/audit/audit.service';
import { isSystemActorIdentity, EXCLUDE_SYSTEM_ACTOR_WHERE } from '../../common/id-generator/seed-identity';
import { PrismaService, PrismaTxClient } from '../../common/prisma/prisma.service';
import { isValidCalendarDate } from '../../common/utils/calendar-date.util';

import { RequestTutorRateChangeDto, ReviewTutorRateChangeDto } from './dto/tutor-rate.dto';

@Injectable()
export class TutorRateService {
  private readonly timezone: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly configService: ConfigService,
  ) {
    this.timezone = this.configService.get<string>('crm.businessTimezone') || 'Asia/Kolkata';
  }

  getTodayCalendarDate(): string {
    const zoned = toZonedTime(new Date(), this.timezone);
    return format(zoned, 'yyyy-MM-dd');
  }

  private async isCeoUser(userId: string): Promise<boolean> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { userRoles: { include: { role: true } } },
    });
    return Boolean(
      user &&
      user.status === 'ACTIVE' &&
      !isSystemActorIdentity(user) &&
      user.userRoles?.some((ur) => ur.role.code === 'CEO'),
    );
  }

  private async notifyCeoUsers(
    tx: PrismaTxClient,
    message: string,
    requestId: string,
  ): Promise<void> {
    const ceos = await tx.user.findMany({
      where: {
        status: 'ACTIVE',
        ...EXCLUDE_SYSTEM_ACTOR_WHERE,
        userRoles: { some: { role: { code: 'CEO' } } },
      },
      select: { id: true },
    });

    for (const ceo of ceos) {
      await tx.notification.create({
        data: {
          recipientUserId: ceo.id,
          type: 'TUTOR_RATE_CHANGE_REQUESTED',
          entityType: 'TutorRateChangeRequest',
          entityId: requestId,
          action: '/tutor-hr',
          message,
        },
      });
    }
  }

  private async notifyUser(
    tx: PrismaTxClient,
    recipientUserId: string,
    type: string,
    message: string,
    requestId: string,
  ): Promise<void> {
    await tx.notification.create({
      data: {
        recipientUserId,
        type,
        entityType: 'TutorRateChangeRequest',
        entityId: requestId,
        action: '/tutor-hr',
        message,
      },
    });
  }

  /**
   * JIT activation helper for approved tutor rate changes that are due.
   * Serialized with transactional advisory lock per tutor profile.
   */
  async applyApprovedRateChangesForTutor(tutorProfileId: string, txClient?: PrismaTxClient): Promise<void> {
    const client = txClient || this.prisma;
    const today = this.getTodayCalendarDate();

    const dueRequests = await client.tutorRateChangeRequest.findMany({
      where: {
        tutorProfileId,
        status: CompensationRequestStatus.APPROVED,
        isApplied: false,
        effectiveDate: { lte: today },
      },
      orderBy: { effectiveDate: 'asc' },
    });

    if (dueRequests.length === 0) return;

    for (const req of dueRequests) {
      if (txClient) {
        await this.applySingleApprovedRateRequest(txClient, req);
      } else {
        await this.prisma.$transaction(async (tx) => {
          // Advisory lock to serialize concurrent activation per tutor profile
          await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('tutor-rate-' || ${tutorProfileId}))`;
          await this.applySingleApprovedRateRequest(tx, req);
        });
      }
    }
  }

  private async applySingleApprovedRateRequest(
    tx: PrismaTxClient,
    req: TutorRateChangeRequest,
  ): Promise<boolean> {
    // Atomic conditional claim: only proceed if isApplied is false
    const claim = await tx.tutorRateChangeRequest.updateMany({
      where: {
        id: req.id,
        status: CompensationRequestStatus.APPROVED,
        isApplied: false,
      },
      data: {
        isApplied: true,
        appliedAt: new Date(),
      },
    });

    if (claim.count === 0) {
      // Already claimed and applied by concurrent execution; safe no-op
      return false;
    }

    const effectiveDateTimestamp = fromZonedTime(
      `${req.effectiveDate}T00:00:00.000`,
      this.timezone,
    );

    // 1. Soft-close existing active rate at exact effective boundary
    await tx.tutorRate.updateMany({
      where: { tutorProfileId: req.tutorProfileId, isActive: true },
      data: {
        isActive: false,
        effectiveTo: effectiveDateTimestamp,
      },
    });

    // 2. Create new active TutorRate with exact effectiveFrom boundary
    await tx.tutorRate.create({
      data: {
        tutorProfileId: req.tutorProfileId,
        hourlyRate: req.requestedHourlyRate,
        currency: req.currency || 'AED',
        effectiveFrom: effectiveDateTimestamp,
        isActive: true,
        notes: req.reason,
        createdByUserId: req.reviewedByUserId || req.requestedByUserId,
      },
    });

    await this.audit.recordInTx(tx, {
      entityType: 'TutorProfile',
      entityId: req.tutorProfileId,
      action: 'TUTOR_RATE_ACTIVATED',
      actorUserId: req.reviewedByUserId || 'system',
      metadata: {
        requestId: req.id,
        effectiveDate: req.effectiveDate,
        hourlyRate: req.requestedHourlyRate,
      },
    });

    return true;
  }

  /**
   * Get active rate for tutor with JIT effective-date activation.
   */
  async getActiveRate(tutorProfileId: string): Promise<TutorRate | null> {
    const profile = await this.prisma.tutorProfile.findUnique({ where: { id: tutorProfileId } });
    if (!profile) throw new NotFoundException('Tutor profile not found');

    // Ensure any approved change that reached effective date is applied JIT
    await this.applyApprovedRateChangesForTutor(tutorProfileId);

    return this.prisma.tutorRate.findFirst({
      where: { tutorProfileId, isActive: true },
    });
  }

  /**
   * Get complete historical rate changes for tutor.
   */
  async getRateHistory(tutorProfileId: string): Promise<TutorRate[]> {
    const profile = await this.prisma.tutorProfile.findUnique({ where: { id: tutorProfileId } });
    if (!profile) throw new NotFoundException('Tutor profile not found');

    return this.prisma.tutorRate.findMany({
      where: { tutorProfileId },
      orderBy: { effectiveFrom: 'desc' },
      include: {
        createdBy: {
          select: { id: true, email: true },
        },
      },
    });
  }

  /**
   * List tutor rate change requests.
   */
  async getRateChangeRequests(filter?: {
    tutorProfileId?: string;
    status?: CompensationRequestStatus;
  }): Promise<TutorRateChangeRequest[]> {
    return this.prisma.tutorRateChangeRequest.findMany({
      where: {
        ...(filter?.tutorProfileId ? { tutorProfileId: filter.tutorProfileId } : {}),
        ...(filter?.status ? { status: filter.status } : {}),
      },
      orderBy: { createdAt: 'desc' },
      include: {
        tutorProfile: {
          include: {
            employee: {
              select: {
                id: true,
                businessId: true,
                firstName: true,
                lastName: true,
              },
            },
          },
        },
        requestedBy: {
          select: { id: true, email: true },
        },
        reviewedBy: {
          select: { id: true, email: true },
        },
      },
    });
  }

  /**
   * Submit a tutor rate change request for CEO review.
   * Requires tutor.rate.manage permission.
   * Concurrency protected via advisory lock.
   */
  async requestRateChange(
    tutorProfileId: string,
    dto: RequestTutorRateChangeDto,
    actorUserId: string,
  ): Promise<TutorRateChangeRequest> {
    const profile = await this.prisma.tutorProfile.findUnique({
      where: { id: tutorProfileId },
      include: { employee: true },
    });
    if (!profile) throw new NotFoundException('Tutor profile not found');

    if (!isValidCalendarDate(dto.effectiveDate)) {
      throw new BadRequestException('effectiveDate must be a valid real calendar date in YYYY-MM-DD format');
    }

    if (!dto.reason || !dto.reason.trim()) {
      throw new BadRequestException('A non-empty reason is mandatory for requesting a tutor rate change');
    }

    return this.prisma.$transaction(async (tx: PrismaTxClient) => {
      // 1. Transactional advisory lock per tutor profile
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('tutor-rate-' || ${tutorProfileId}))`;

      // 2. Reject duplicate PENDING requests
      const pendingRequest = await tx.tutorRateChangeRequest.findFirst({
        where: { tutorProfileId, status: CompensationRequestStatus.PENDING },
      });

      if (pendingRequest) {
        throw new ConflictException(
          'A pending rate change request already exists for this tutor. Await review before submitting a new request.',
        );
      }

      // 3. Current active rate
      const current = await tx.tutorRate.findFirst({
        where: { tutorProfileId, isActive: true },
      });

      // 4. Create request
      const newRequest = await tx.tutorRateChangeRequest.create({
        data: {
          tutorProfileId,
          currentHourlyRate: current ? current.hourlyRate : null,
          requestedHourlyRate: dto.requestedHourlyRate,
          currency: 'AED',
          effectiveDate: dto.effectiveDate,
          reason: dto.reason.trim(),
          status: CompensationRequestStatus.PENDING,
          requestedByUserId: actorUserId,
        },
      });

      // 5. Notify CEO
      await this.notifyCeoUsers(
        tx,
        `Tutor rate change requested for Tutor ${profile.employee.businessId} (${profile.employee.firstName} ${profile.employee.lastName}): Requested ${dto.requestedHourlyRate} AED/hr effective ${dto.effectiveDate}. Pending CEO review.`,
        newRequest.id,
      );

      // 6. Audit Trail
      await this.audit.recordInTx(tx, {
        entityType: 'TutorProfile',
        entityId: tutorProfileId,
        action: 'TUTOR_RATE_CHANGE_REQUESTED',
        actorUserId,
        reason: dto.reason,
        metadata: {
          tutorProfileId,
          employeeId: profile.employeeId,
          currentHourlyRate: current ? current.hourlyRate : null,
          requestedHourlyRate: dto.requestedHourlyRate,
          effectiveDate: dto.effectiveDate,
        },
      });

      return newRequest;
    });
  }

  /**
   * Review a tutor rate change request (CEO approval / rejection).
   * Strict CEO verification, self-approval prevention, and effective-date activation.
   */
  async reviewRateChange(
    requestId: string,
    dto: ReviewTutorRateChangeDto,
    actorUserId: string,
  ): Promise<TutorRateChangeRequest> {
    const isCeo = await this.isCeoUser(actorUserId);
    if (!isCeo) {
      throw new ForbiddenException('Only the CEO can approve or reject tutor rate change requests');
    }

    const request = await this.prisma.tutorRateChangeRequest.findUnique({
      where: { id: requestId },
      include: {
        tutorProfile: { include: { employee: true } },
      },
    });

    if (!request) throw new NotFoundException(`Tutor rate change request ${requestId} not found`);

    if (request.status !== CompensationRequestStatus.PENDING) {
      throw new BadRequestException(`Request is already ${request.status} and cannot be reviewed again`);
    }

    // Separation of duties: Self-approval check (a tutor cannot approve their own rate)
    if (request.tutorProfile.employee.userId === actorUserId) {
      throw new ForbiddenException(
        'Self-approval is not permitted: you cannot approve your own tutor rate change request',
      );
    }

    return this.prisma.$transaction(async (tx: PrismaTxClient) => {
      // Advisory lock
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('tutor-rate-' || ${request.tutorProfileId}))`;

      const lockedReq = await tx.tutorRateChangeRequest.findUnique({ where: { id: requestId } });
      if (lockedReq?.status !== CompensationRequestStatus.PENDING) {
        throw new BadRequestException('Request has already been reviewed');
      }

      const today = this.getTodayCalendarDate();

      if (dto.status === 'REJECTED') {
        if (!dto.reviewNote || !dto.reviewNote.trim()) {
          throw new BadRequestException('A review note is mandatory when rejecting a tutor rate change request');
        }

        const rejected = await tx.tutorRateChangeRequest.update({
          where: { id: requestId },
          data: {
            status: CompensationRequestStatus.REJECTED,
            reviewNote: dto.reviewNote.trim(),
            reviewedByUserId: actorUserId,
            reviewedAt: new Date(),
          },
        });

        await this.notifyUser(
          tx,
          request.requestedByUserId,
          'TUTOR_RATE_CHANGE_REJECTED',
          `Tutor rate change request for Tutor ${request.tutorProfile.employee.businessId} was rejected by CEO: ${dto.reviewNote.trim()}`,
          requestId,
        );

        await this.audit.recordInTx(tx, {
          entityType: 'TutorProfile',
          entityId: request.tutorProfileId,
          action: 'TUTOR_RATE_CHANGE_REJECTED',
          actorUserId,
          reason: dto.reviewNote,
          metadata: {
            tutorProfileId: request.tutorProfileId,
            requestedHourlyRate: request.requestedHourlyRate,
          },
        });

        return rejected;
      }

      // APPROVED flow
      const approved = await tx.tutorRateChangeRequest.update({
        where: { id: requestId },
        data: {
          status: CompensationRequestStatus.APPROVED,
          reviewNote: dto.reviewNote?.trim() || null,
          reviewedByUserId: actorUserId,
          reviewedAt: new Date(),
        },
      });

      const isDue = request.effectiveDate <= today;

      if (isDue) {
        // Activate immediately
        await this.applySingleApprovedRateRequest(tx, approved);

        await this.notifyUser(
          tx,
          request.requestedByUserId,
          'TUTOR_RATE_CHANGE_ACTIVATED',
          `Tutor rate change request for Tutor ${request.tutorProfile.employee.businessId} was approved by CEO and is now active (${request.requestedHourlyRate} AED/hr).`,
          requestId,
        );
      } else {
        await this.notifyUser(
          tx,
          request.requestedByUserId,
          'TUTOR_RATE_CHANGE_APPROVED',
          `Tutor rate change request for Tutor ${request.tutorProfile.employee.businessId} was approved by CEO (Effective: ${request.effectiveDate}). Will activate on effective date.`,
          requestId,
        );
      }

      await this.audit.recordInTx(tx, {
        entityType: 'TutorProfile',
        entityId: request.tutorProfileId,
        action: 'TUTOR_RATE_CHANGE_APPROVED',
        actorUserId,
        reason: dto.reviewNote || request.reason,
        metadata: {
          tutorProfileId: request.tutorProfileId,
          requestedHourlyRate: request.requestedHourlyRate,
          effectiveDate: request.effectiveDate,
          activatedImmediately: isDue,
        },
      });

      return approved;
    });
  }

  /**
   * Sets hourly rate with CEO governance.
   * If caller is CEO with immediate effective date and not self-rate, executes approved change.
   * If caller is HR Manager, creates a pending change request awaiting CEO approval.
   * This completely prevents unauthorized direct mutation of active rates.
   */
  async setHourlyRate(
    tutorProfileId: string,
    hourlyRate: number,
    actorUserId: string,
    effectiveDate?: string,
    reason?: string,
  ): Promise<any> {
    const today = this.getTodayCalendarDate();
    const effDate = effectiveDate || today;

    if (!isValidCalendarDate(effDate)) {
      throw new BadRequestException('effectiveDate must be a valid real calendar date in YYYY-MM-DD format');
    }

    const profile = await this.prisma.tutorProfile.findUnique({
      where: { id: tutorProfileId },
      include: { employee: true },
    });
    if (!profile) throw new NotFoundException('Tutor profile not found');

    // Strict self-approval prevention: A user cannot set or change their own tutor rate
    if (profile.employee.userId === actorUserId) {
      throw new ForbiddenException(
        'Self-approval is not permitted: you cannot set or approve your own tutor rate',
      );
    }

    const isCeo = await this.isCeoUser(actorUserId);

    if (!isCeo) {
      // Non-CEO caller (e.g. HR Manager) cannot directly assign active rate; routes to change request
      return this.requestRateChange(
        tutorProfileId,
        {
          requestedHourlyRate: hourlyRate,
          effectiveDate: effDate,
          reason: reason || 'Hourly rate change request',
        },
        actorUserId,
      );
    }

    // CEO direct rate assignment:
    // Create change request and execute approval in formal workflow
    const request = await this.requestRateChange(
      tutorProfileId,
      {
        requestedHourlyRate: hourlyRate,
        effectiveDate: effDate,
        reason: reason || 'Directly assigned by CEO',
      },
      actorUserId,
    );

    await this.reviewRateChange(
      request.id,
      {
        status: 'APPROVED',
        reviewNote: reason || 'Directly assigned and approved by CEO',
      },
      actorUserId,
    );

    return this.getActiveRate(tutorProfileId);
  }
}
