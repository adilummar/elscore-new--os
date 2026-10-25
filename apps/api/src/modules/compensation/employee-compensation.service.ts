import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CompensationRequestStatus, EmployeeCompensation, EmployeeCompensationChangeRequest, Prisma } from '@prisma/client';
import { format } from 'date-fns';
import { toZonedTime } from 'date-fns-tz';

import { AuditService } from '../../common/audit/audit.service';
import { isSystemActorIdentity, EXCLUDE_SYSTEM_ACTOR_WHERE } from '../../common/id-generator/seed-identity';
import { PrismaService, PrismaTxClient } from '../../common/prisma/prisma.service';
import { isValidCalendarDate } from '../../common/utils/calendar-date.util';

import { CreateCompensationRequestDto } from './dto/create-compensation-request.dto';
import { ReviewCompensationRequestDto } from './dto/review-compensation-request.dto';

@Injectable()
export class EmployeeCompensationService {
  private readonly timezone: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly configService: ConfigService,
  ) {
    this.timezone = this.configService.get<string>('crm.businessTimezone') || 'Asia/Kolkata';
  }

  /**
   * Returns current calendar date in business timezone (YYYY-MM-DD).
   */
  getTodayCalendarDate(): string {
    const zoned = toZonedTime(new Date(), this.timezone);
    return format(zoned, 'yyyy-MM-dd');
  }

  /**
   * Helper to verify if the user possesses the CEO role and has active status.
   * System actor is excluded even if a CEO role is stored on its row.
   */
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

  /**
   * Notify all active CEO users about pending compensation requests.
   * Excludes the system actor from receiving CEO notifications.
   */
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
          type: 'COMPENSATION_CHANGE_REQUESTED',
          entityType: 'EmployeeCompensationChangeRequest',
          entityId: requestId,
          action: '/settings/employees',
          message,
        },
      });
    }
  }

  /**
   * Notify specific user regarding status of their request.
   */
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
        entityType: 'EmployeeCompensationChangeRequest',
        entityId: requestId,
        action: '/settings/employees',
        message,
      },
    });
  }

  /**
   * JIT activation helper for approved compensation change requests that have reached effective date.
   * Serialized with transactional advisory lock per employee.
   */
  async applyApprovedChangesForEmployee(employeeId: string, txClient?: PrismaTxClient): Promise<void> {
    const client = txClient || this.prisma;
    const today = this.getTodayCalendarDate();

    // Query approved requests that have not been applied yet and are due
    const dueRequests = await client.employeeCompensationChangeRequest.findMany({
      where: {
        employeeId,
        status: CompensationRequestStatus.APPROVED,
        isApplied: false,
        effectiveDate: { lte: today },
      },
      orderBy: { effectiveDate: 'asc' },
    });

    if (dueRequests.length === 0) return;

    for (const req of dueRequests) {
      if (txClient) {
        await this.applySingleApprovedRequest(txClient, req);
      } else {
        await this.prisma.$transaction(async (tx) => {
          // Advisory lock to serialize concurrent activation per employee
          await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('emp-comp-' || ${employeeId}))`;
          await this.applySingleApprovedRequest(tx, req);
        });
      }
    }
  }

  /**
   * Applies a single approved compensation change request inside a transaction.
   * Atomically claims the request on `isApplied: false` to ensure idempotence under concurrency.
   */
  private async applySingleApprovedRequest(
    tx: PrismaTxClient,
    req: EmployeeCompensationChangeRequest,
  ): Promise<boolean> {
    // Atomic conditional claim: only proceed if isApplied is false
    const claim = await tx.employeeCompensationChangeRequest.updateMany({
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

    // 1. Soft-close existing active compensation
    await tx.employeeCompensation.updateMany({
      where: { employeeId: req.employeeId, isActive: true },
      data: {
        isActive: false,
        effectiveTo: req.effectiveDate,
      },
    });

    // 2. Create new active compensation record
    await tx.employeeCompensation.create({
      data: {
        employeeId: req.employeeId,
        baseSalary: req.requestedBaseSalary,
        currency: req.currency || 'INR',
        paymentFrequency: req.paymentFrequency || 'MONTHLY',
        bankName: req.bankName,
        bankAccountNumber: req.bankAccountNumber,
        bankIfsc: req.bankIfsc,
        panNumber: req.panNumber,
        effectiveFrom: req.effectiveDate,
        isActive: true,
        notes: req.reason,
        approvedByUserId: req.reviewedByUserId,
      },
    });

    await this.audit.recordInTx(tx, {
      entityType: 'EmployeeCompensation',
      entityId: req.employeeId,
      action: 'EMPLOYEE_COMPENSATION_ACTIVATED',
      actorUserId: req.reviewedByUserId || 'system',
      metadata: {
        requestId: req.id,
        effectiveDate: req.effectiveDate,
        baseSalary: req.requestedBaseSalary,
      },
    });

    return true;
  }

  /**
   * Get active compensation record for employee with JIT effective-date activation.
   */
  async getActiveCompensation(employeeId: string): Promise<EmployeeCompensation | null> {
    const employee = await this.prisma.employee.findUnique({ where: { id: employeeId } });
    if (!employee) throw new NotFoundException(`Employee ${employeeId} not found`);

    // Ensure any approved change that reached effective date is applied JIT
    await this.applyApprovedChangesForEmployee(employeeId);

    return this.prisma.employeeCompensation.findFirst({
      where: { employeeId, isActive: true },
    });
  }

  /**
   * Get historical compensation records for employee (ordered descending by effectiveFrom).
   */
  async getCompensationHistory(employeeId: string): Promise<EmployeeCompensation[]> {
    const employee = await this.prisma.employee.findUnique({ where: { id: employeeId } });
    if (!employee) throw new NotFoundException(`Employee ${employeeId} not found`);

    return this.prisma.employeeCompensation.findMany({
      where: { employeeId },
      orderBy: { effectiveFrom: 'desc' },
      include: {
        approvedBy: {
          select: { id: true, email: true },
        },
      },
    });
  }

  /**
   * Get all compensation change requests for an employee or all pending requests.
   */
  async getChangeRequests(filter?: {
    employeeId?: string;
    status?: CompensationRequestStatus;
  }): Promise<EmployeeCompensationChangeRequest[]> {
    return this.prisma.employeeCompensationChangeRequest.findMany({
      where: {
        ...(filter?.employeeId ? { employeeId: filter.employeeId } : {}),
        ...(filter?.status ? { status: filter.status } : {}),
      },
      orderBy: { createdAt: 'desc' },
      include: {
        employee: {
          select: {
            id: true,
            businessId: true,
            firstName: true,
            lastName: true,
            jobTitle: true,
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
   * Submit an employee compensation change request.
   * Requires employee.compensation.manage permission.
   * Protected against duplicate concurrent requests via PostgreSQL transactional advisory lock.
   */
  async requestChange(
    employeeId: string,
    dto: CreateCompensationRequestDto,
    actorUserId: string,
  ): Promise<EmployeeCompensationChangeRequest> {
    const employee = await this.prisma.employee.findUnique({ where: { id: employeeId } });
    if (!employee) throw new NotFoundException(`Employee ${employeeId} not found`);

    if (!isValidCalendarDate(dto.effectiveDate)) {
      throw new BadRequestException('effectiveDate must be a valid real calendar date in YYYY-MM-DD format');
    }

    if (!dto.reason || !dto.reason.trim()) {
      throw new BadRequestException('A non-empty reason is mandatory for requesting compensation changes');
    }

    return this.prisma.$transaction(async (tx: PrismaTxClient) => {
      // 1. Transactional advisory lock per employee to prevent concurrent submissions
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('emp-comp-' || ${employeeId}))`;

      // 2. Concurrency check: Reject if already has a PENDING request
      const pendingRequest = await tx.employeeCompensationChangeRequest.findFirst({
        where: { employeeId, status: CompensationRequestStatus.PENDING },
      });

      if (pendingRequest) {
        throw new ConflictException(
          'A pending compensation change request already exists for this employee. Await review before submitting a new one.',
        );
      }

      // 3. Current active compensation (if any)
      const current = await tx.employeeCompensation.findFirst({
        where: { employeeId, isActive: true },
      });

      // 4. Create pending request
      const newRequest = await tx.employeeCompensationChangeRequest.create({
        data: {
          employeeId,
          currentBaseSalary: current ? current.baseSalary : null,
          requestedBaseSalary: dto.requestedBaseSalary,
          currency: 'INR',
          paymentFrequency: dto.paymentFrequency || 'MONTHLY',
          bankName: dto.bankName !== undefined ? dto.bankName : current?.bankName,
          bankAccountNumber: dto.bankAccountNumber !== undefined ? dto.bankAccountNumber : current?.bankAccountNumber,
          bankIfsc: dto.bankIfsc !== undefined ? dto.bankIfsc : current?.bankIfsc,
          panNumber: dto.panNumber !== undefined ? dto.panNumber : current?.panNumber,
          effectiveDate: dto.effectiveDate,
          reason: dto.reason.trim(),
          status: CompensationRequestStatus.PENDING,
          requestedByUserId: actorUserId,
        },
      });

      // 5. Notify CEO users
      await this.notifyCeoUsers(
        tx,
        `Compensation change requested for Employee ${employee.businessId} (${employee.firstName} ${employee.lastName}): Requested Base ₹${dto.requestedBaseSalary} INR effective ${dto.effectiveDate}. Pending CEO review.`,
        newRequest.id,
      );

      // 6. Audit Trail
      await this.audit.recordInTx(tx, {
        entityType: 'EmployeeCompensation',
        entityId: newRequest.id,
        action: 'EMPLOYEE_COMPENSATION_CHANGE_REQUESTED',
        actorUserId,
        reason: dto.reason,
        metadata: {
          employeeId,
          businessId: employee.businessId,
          currentBaseSalary: current ? current.baseSalary : null,
          requestedBaseSalary: dto.requestedBaseSalary,
          effectiveDate: dto.effectiveDate,
        },
      });

      return newRequest;
    });
  }

  /**
   * Review an employee compensation change request (CEO approval / rejection).
   * Strict CEO verification, self-approval prevention, and effective-date activation.
   */
  async reviewChange(
    requestId: string,
    dto: ReviewCompensationRequestDto,
    actorUserId: string,
  ): Promise<EmployeeCompensationChangeRequest> {
    const isCeo = await this.isCeoUser(actorUserId);
    if (!isCeo) {
      throw new ForbiddenException('Only the CEO can approve or reject compensation change requests');
    }

    const request = await this.prisma.employeeCompensationChangeRequest.findUnique({
      where: { id: requestId },
      include: { employee: true },
    });

    if (!request) throw new NotFoundException(`Compensation change request ${requestId} not found`);

    if (request.status !== CompensationRequestStatus.PENDING) {
      throw new BadRequestException(`Request is already ${request.status} and cannot be reviewed again`);
    }

    // Separation of duties: Self-approval prevention
    if (request.requestedByUserId === actorUserId || request.employee.userId === actorUserId) {
      throw new ForbiddenException(
        'Self-approval is not permitted: you cannot approve your own compensation change request',
      );
    }

    return this.prisma.$transaction(async (tx: PrismaTxClient) => {
      // Advisory lock
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('emp-comp-' || ${request.employeeId}))`;

      // Re-verify status under lock
      const lockedReq = await tx.employeeCompensationChangeRequest.findUnique({
        where: { id: requestId },
      });
      if (lockedReq?.status !== CompensationRequestStatus.PENDING) {
        throw new BadRequestException('Request has already been reviewed');
      }

      const today = this.getTodayCalendarDate();

      if (dto.status === 'REJECTED') {
        if (!dto.reviewNote || !dto.reviewNote.trim()) {
          throw new BadRequestException('A review note is mandatory when rejecting a compensation change request');
        }

        const rejected = await tx.employeeCompensationChangeRequest.update({
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
          'COMPENSATION_CHANGE_REJECTED',
          `Compensation change request for Employee ${request.employee.businessId} was rejected by CEO: ${dto.reviewNote.trim()}`,
          requestId,
        );

        await this.audit.recordInTx(tx, {
          entityType: 'EmployeeCompensation',
          entityId: requestId,
          action: 'EMPLOYEE_COMPENSATION_CHANGE_REJECTED',
          actorUserId,
          reason: dto.reviewNote,
          metadata: {
            employeeId: request.employeeId,
            requestedBaseSalary: request.requestedBaseSalary,
          },
        });

        return rejected;
      }

      // APPROVED flow
      const approved = await tx.employeeCompensationChangeRequest.update({
        where: { id: requestId },
        data: {
          status: CompensationRequestStatus.APPROVED,
          reviewNote: dto.reviewNote?.trim() || null,
          reviewedByUserId: actorUserId,
          reviewedAt: new Date(),
        },
      });

      // Effective-date check
      const isDue = request.effectiveDate <= today;

      if (isDue) {
        // Activate immediately
        await this.applySingleApprovedRequest(tx, approved);

        await this.notifyUser(
          tx,
          request.requestedByUserId,
          'COMPENSATION_CHANGE_ACTIVATED',
          `Compensation change request for Employee ${request.employee.businessId} was approved by CEO and is now active (Base ₹${request.requestedBaseSalary} INR).`,
          requestId,
        );
      } else {
        // Future-dated: remains unapplied until scheduled activation or JIT read
        await this.notifyUser(
          tx,
          request.requestedByUserId,
          'COMPENSATION_CHANGE_APPROVED',
          `Compensation change request for Employee ${request.employee.businessId} was approved by CEO (Effective: ${request.effectiveDate}). Will activate on effective date.`,
          requestId,
        );
      }

      await this.audit.recordInTx(tx, {
        entityType: 'EmployeeCompensation',
        entityId: requestId,
        action: 'EMPLOYEE_COMPENSATION_CHANGE_APPROVED',
        actorUserId,
        reason: dto.reviewNote || request.reason,
        metadata: {
          employeeId: request.employeeId,
          requestedBaseSalary: request.requestedBaseSalary,
          effectiveDate: request.effectiveDate,
          activatedImmediately: isDue,
        },
      });

      return approved;
    });
  }

  /**
   * Batch activation sweep for all approved compensation changes that are due.
   */
  async activatePendingApprovedCompensations(): Promise<number> {
    const today = this.getTodayCalendarDate();

    const dueRequests = await this.prisma.employeeCompensationChangeRequest.findMany({
      where: {
        status: CompensationRequestStatus.APPROVED,
        isApplied: false,
        effectiveDate: { lte: today },
      },
      select: { id: true, employeeId: true },
    });

    let count = 0;
    for (const item of dueRequests) {
      await this.applyApprovedChangesForEmployee(item.employeeId);
      count++;
    }

    return count;
  }
}
