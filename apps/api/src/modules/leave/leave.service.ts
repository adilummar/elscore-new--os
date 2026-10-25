import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../../common/audit/audit.service';
import { CreateLeaveRequestDto } from './dto/create-leave-request.dto';
import { ReviewLeaveRequestDto } from './dto/review-leave-request.dto';
import { QueryLeaveRequestsDto } from './dto/query-leave-requests.dto';
import { isValidCalendarDate } from '../../common/utils/calendar-date.util';
import { isBlockedFromLeave } from '../../common/utils/employment-status.util';
import { Prisma } from '@prisma/client';

@Injectable()
export class LeaveService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Submit a new leave request for the authenticated employee.
   */
  async createLeaveRequest(userId: string, dto: CreateLeaveRequestDto) {
    const employee = await this.prisma.employee.findUnique({
      where: { userId },
    });
    if (!employee) {
      throw new NotFoundException('Employee record not found for the current user');
    }

    if (isBlockedFromLeave(employee.employmentStatus)) {
      throw new ForbiddenException(`Employees with status ${employee.employmentStatus} cannot submit leave requests`);
    }

    if (!isValidCalendarDate(dto.startDate)) {
      throw new BadRequestException('startDate must be a valid real calendar date in YYYY-MM-DD format');
    }

    if (!isValidCalendarDate(dto.endDate)) {
      throw new BadRequestException('endDate must be a valid real calendar date in YYYY-MM-DD format');
    }

    if (dto.startDate > dto.endDate) {
      throw new BadRequestException('startDate cannot be after endDate');
    }

    return this.prisma.$transaction(async (tx) => {
      // Concurrency lock: serialize all leave submissions & reviews per employee
      // pg_advisory_xact_lock automatically releases at transaction end (commit or rollback)
      if (typeof (tx as any).$executeRaw === 'function') {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'leave_emp_' + employee.id}))`;
      }

      // Overlap check INSIDE transaction with lock eliminates race conditions between concurrent submissions
      const overlapping = await tx.employeeLeaveRequest.findFirst({
        where: {
          employeeId: employee.id,
          status: { in: ['PENDING', 'APPROVED'] },
          startDate: { lte: dto.endDate },
          endDate: { gte: dto.startDate },
        },
      });

      if (overlapping) {
        throw new BadRequestException(
          `An overlapping leave request (${overlapping.status}) already exists from ${overlapping.startDate} to ${overlapping.endDate}`,
        );
      }

      const created = await tx.employeeLeaveRequest.create({
        data: {
          employeeId: employee.id,
          leaveType: dto.leaveType,
          startDate: dto.startDate,
          endDate: dto.endDate,
          reason: dto.reason.trim(),
          status: 'PENDING',
        },
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
      });

      await this.audit.recordInTx(tx, {
        actorUserId: userId,
        action: 'LEAVE_REQUEST_CREATED',
        entityType: 'EmployeeLeaveRequest',
        entityId: created.id,
        newValue: created,
        reason: dto.reason,
        metadata: {
          employeeId: employee.id,
          targetUserId: employee.userId,
          leaveType: dto.leaveType,
          startDate: dto.startDate,
          endDate: dto.endDate,
        },
      });

      return created;
    });
  }

  /**
   * Review (Approve or Reject) a pending leave request.
   */
  async reviewLeaveRequest(reviewerUserId: string, requestId: string, dto: ReviewLeaveRequestDto) {
    return this.prisma.$transaction(async (tx) => {
      const request = await tx.employeeLeaveRequest.findUnique({
        where: { id: requestId },
        include: { employee: true },
      });

      if (!request) {
        throw new NotFoundException('Leave request not found');
      }

      // Concurrency lock: serialize approvals and submissions for this employee
      if (typeof (tx as any).$executeRaw === 'function') {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'leave_emp_' + request.employeeId}))`;
      }

      // Self-review prevention (separation of duties)
      if (request.employee.userId === reviewerUserId) {
        throw new ForbiddenException(
          'Self-review is not permitted: you cannot approve or reject your own leave request',
        );
      }

      if (request.status !== 'PENDING') {
        throw new BadRequestException(
          `Cannot review leave request that is already ${request.status}`,
        );
      }

      if (dto.action === 'APPROVE') {
        // Concurrency guard: check if another request overlapping these dates was approved concurrently
        const conflictingApproved = await tx.employeeLeaveRequest.findFirst({
          where: {
            id: { not: requestId },
            employeeId: request.employeeId,
            status: 'APPROVED',
            startDate: { lte: request.endDate },
            endDate: { gte: request.startDate },
          },
        });

        if (conflictingApproved) {
          throw new BadRequestException(
            `A conflicting approved leave request already exists for this employee (${conflictingApproved.startDate} to ${conflictingApproved.endDate})`,
          );
        }
      }

      const nextStatus = dto.action === 'APPROVE' ? 'APPROVED' : 'REJECTED';
      const updated = await tx.employeeLeaveRequest.update({
        where: { id: requestId },
        data: {
          status: nextStatus,
          reviewedByUserId: reviewerUserId,
          reviewedAt: new Date(),
          reviewNote: dto.reviewNote?.trim() || null,
        },
        include: {
          employee: {
            select: {
              id: true,
              businessId: true,
              firstName: true,
              lastName: true,
            },
          },
          reviewedByUser: {
            select: {
              id: true,
              email: true,
            },
          },
        },
      });

      await this.audit.recordInTx(tx, {
        actorUserId: reviewerUserId,
        action: dto.action === 'APPROVE' ? 'LEAVE_REQUEST_APPROVED' : 'LEAVE_REQUEST_REJECTED',
        entityType: 'EmployeeLeaveRequest',
        entityId: requestId,
        oldValue: { status: request.status, reviewNote: request.reviewNote },
        newValue: { status: updated.status, reviewNote: updated.reviewNote },
        reason: dto.reviewNote,
        metadata: {
          employeeId: request.employeeId,
          targetUserId: request.employee.userId,
          startDate: request.startDate,
          endDate: request.endDate,
        },
      });

      return updated;
    });
  }

  /**
   * Cancel an employee's own pending leave request.
   */
  async cancelLeaveRequest(userId: string, requestId: string) {
    const employee = await this.prisma.employee.findUnique({
      where: { userId },
    });
    if (!employee) {
      throw new NotFoundException('Employee record not found for the current user');
    }

    return this.prisma.$transaction(async (tx) => {
      // Concurrency lock: serialize cancellation with submissions/reviews for this employee
      if (typeof (tx as any).$executeRaw === 'function') {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'leave_emp_' + employee.id}))`;
      }

      const request = await tx.employeeLeaveRequest.findUnique({
        where: { id: requestId },
      });

      if (!request) {
        throw new NotFoundException('Leave request not found');
      }

      if (request.employeeId !== employee.id) {
        throw new ForbiddenException('You can only cancel your own leave requests');
      }

      if (request.status !== 'PENDING') {
        throw new BadRequestException('Only pending leave requests can be cancelled');
      }

      const updated = await tx.employeeLeaveRequest.update({
        where: { id: requestId },
        data: { status: 'CANCELLED' },
      });

      await this.audit.recordInTx(tx, {
        actorUserId: userId,
        action: 'LEAVE_REQUEST_CANCELLED',
        entityType: 'EmployeeLeaveRequest',
        entityId: requestId,
        oldValue: { status: request.status },
        newValue: { status: 'CANCELLED' },
        metadata: {
          employeeId: employee.id,
          targetUserId: employee.userId,
          startDate: request.startDate,
          endDate: request.endDate,
        },
      });

      return updated;
    });
  }

  /**
   * Helper to verify if user has global HR / CEO / Admin viewing rights
   */
  private async isHrOrCeoUser(userId?: string): Promise<boolean> {
    if (!userId) return false;
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { userRoles: { include: { role: true } } },
    });
    return Boolean(
      user?.userRoles?.some((ur: any) =>
        ['CEO', 'HR_MANAGER', 'HR_EXECUTIVE', 'ADMIN'].includes(ur.role?.code),
      ),
    );
  }

  /**
   * Get all leave requests belonging to the authenticated employee.
   */
  async getMyLeaveRequests(userId: string) {
    const employee = await this.prisma.employee.findUnique({
      where: { userId },
    });
    if (!employee) return [];

    return this.prisma.employeeLeaveRequest.findMany({
      where: { employeeId: employee.id },
      orderBy: { createdAt: 'desc' },
      include: {
        reviewedByUser: {
          select: {
            id: true,
            email: true,
          },
        },
      },
    });
  }

  /**
   * Get all leave requests with optional filters for HR / managers.
   * If viewer is not HR/CEO/Admin and not the request owner, sensitive reason and reviewNote are masked.
   */
  async getAllLeaveRequests(query: QueryLeaveRequestsDto, viewerUserId?: string) {
    const where: Prisma.EmployeeLeaveRequestWhereInput = {};

    if (query.status) {
      where.status = query.status;
    }

    if (query.employeeId) {
      where.employeeId = query.employeeId;
    }

    if (query.startDate && query.endDate) {
      where.startDate = { lte: query.endDate };
      where.endDate = { gte: query.startDate };
    } else if (query.startDate) {
      where.endDate = { gte: query.startDate };
    } else if (query.endDate) {
      where.startDate = { lte: query.endDate };
    }

    const [isHrOrCeo, requests] = await Promise.all([
      this.isHrOrCeoUser(viewerUserId),
      this.prisma.employeeLeaveRequest.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        include: {
          employee: {
            select: {
              id: true,
              businessId: true,
              firstName: true,
              lastName: true,
              userId: true,
              department: {
                select: {
                  id: true,
                  name: true,
                  code: true,
                },
              },
            },
          },
          reviewedByUser: {
            select: {
              id: true,
              email: true,
            },
          },
        },
      }),
    ]);

    return requests.map((req) => {
      const canSeeDetails = isHrOrCeo || req.employee?.userId === viewerUserId;
      return {
        ...req,
        reason: canSeeDetails ? req.reason : null,
        reviewNote: canSeeDetails ? req.reviewNote : null,
      };
    });
  }

  /**
   * Get a single leave request by ID.
   * Mask reason and reviewNote for unauthorized viewers.
   */
  async getLeaveRequestById(requestId: string, viewerUserId?: string) {
    const [isHrOrCeo, request] = await Promise.all([
      this.isHrOrCeoUser(viewerUserId),
      this.prisma.employeeLeaveRequest.findUnique({
        where: { id: requestId },
        include: {
          employee: {
            include: { department: true },
          },
          reviewedByUser: {
            select: {
              id: true,
              email: true,
            },
          },
        },
      }),
    ]);

    if (!request) {
      throw new NotFoundException('Leave request not found');
    }

    const canSeeDetails = isHrOrCeo || request.employee?.userId === viewerUserId;

    return {
      ...request,
      reason: canSeeDetails ? request.reason : null,
      reviewNote: canSeeDetails ? request.reviewNote : null,
    };
  }
}
