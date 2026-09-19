import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Employee, EmploymentStatus, Prisma, UserStatus } from '@prisma/client';

export type EmployeeWithUser = Prisma.EmployeeGetPayload<{
  include: { department: true; user: { select: { email: true; status: true; id: true } } };
}>;

import { AuditService } from '../../common/audit/audit.service';
import { UserStatusCacheService } from '../../common/auth/services/user-status-cache.service';
import { paginate, PaginateOptions } from '../../common/pagination/paginate.util';
import { PaginatedResponseDto } from '../../common/pagination/pagination.dto';
import { PrismaService, PrismaTxClient } from '../../common/prisma/prisma.service';
import { RbacService } from '../../common/rbac/rbac.service';

import { UpdateEmployeeStatusDto } from './dto/update-employee-status.dto';
import { UpdateEmployeeDto } from './dto/update-employee.dto';

@Injectable()
export class EmployeeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly userStatusCache: UserStatusCacheService,
    private readonly rbacService: RbacService,
  ) {}

  async findAll(options: Pick<PaginateOptions, 'limit' | 'cursor'>): Promise<PaginatedResponseDto<any>> {
    return paginate(this.prisma.employee, {
      ...options,
      orderBy: { id: 'asc' },
      include: {
        user: {
          select: {
            status: true,
            userRoles: {
              include: {
                role: true
              }
            }
          }
        }
      }
    });
  }

  async findOne(id: string): Promise<EmployeeWithUser> {
    const employee = await this.prisma.employee.findUnique({
      where: { id },
      include: {
        department: true,
        user: {
          select: { email: true, status: true, id: true },
        },
      },
    });

    if (!employee) {
      throw new NotFoundException(`Employee with ID ${id} not found`);
    }

    return employee;
  }

  async updateProfile(id: string, dto: UpdateEmployeeDto, actorUserId: string): Promise<Employee> {
    const employee = await this.findOne(id);
    const changedFields: Record<string, unknown> = {};
    const data: Record<string, unknown> = {};

    if (dto.firstName !== undefined && dto.firstName !== employee.firstName) {
      data.firstName = dto.firstName;
      changedFields.firstName = { old: employee.firstName, new: dto.firstName };
    }
    if (dto.lastName !== undefined && dto.lastName !== employee.lastName) {
      data.lastName = dto.lastName;
      changedFields.lastName = { old: employee.lastName, new: dto.lastName };
    }
    if (dto.phone !== undefined && dto.phone !== employee.phone) {
      data.phone = dto.phone;
      changedFields.phone = { old: employee.phone, new: dto.phone };
    }

    let departmentChanged = false;
    if (dto.departmentId !== undefined && dto.departmentId !== employee.departmentId) {
      // Verify department exists
      const dept = await this.prisma.department.findUnique({ where: { id: dto.departmentId } });
      if (!dept) throw new NotFoundException('Department not found');

      data.departmentId = dto.departmentId;
      departmentChanged = true;
    }

    if (Object.keys(data).length === 0) {
      return employee; // No changes
    }

    const updated = await this.prisma.employee.update({
      where: { id },
      data,
    });

    // Record audits
    if (Object.keys(changedFields).length > 0) {
      await this.audit.record({
        entityType: 'Employee',
        entityId: employee.id,
        action: 'EMPLOYEE_PROFILE_UPDATED',
        actorUserId,
        metadata: { changedFields },
      });
    }

    if (departmentChanged) {
      await this.audit.record({
        entityType: 'Employee',
        entityId: employee.id,
        action: 'EMPLOYEE_DEPARTMENT_CHANGED',
        actorUserId,
        metadata: { oldDepartmentId: employee.departmentId, newDepartmentId: dto.departmentId },
      });
    }

    return updated;
  }

  async updateStatus(id: string, dto: UpdateEmployeeStatusDto, actorUserId: string): Promise<Employee> {
    const employee = await this.findOne(id);

    if (employee.employmentStatus === dto.status) {
      return employee;
    }

    if (dto.status === EmploymentStatus.TERMINATED) {
      if (!dto.reason) {
        throw new BadRequestException('Termination requires a mandatory reason.');
      }
      return this.terminateEmployee(employee, dto.reason, actorUserId);
    } 
    
    // Simple status change or Reactivation
    const isReactivation = employee.employmentStatus === EmploymentStatus.TERMINATED && dto.status === EmploymentStatus.ACTIVE;
    if (isReactivation && !dto.reason) {
      throw new BadRequestException('Reactivation requires a mandatory reason.');
    }

    const updated = await this.prisma.employee.update({
      where: { id },
      data: { employmentStatus: dto.status },
    });

    const action = isReactivation ? 'EMPLOYEE_REACTIVATED' : 'EMPLOYEE_STATUS_CHANGED';

    await this.audit.record({
      entityType: 'Employee',
      entityId: employee.id,
      action,
      actorUserId,
      reason: dto.reason,
      metadata: { oldStatus: employee.employmentStatus, newStatus: dto.status, reason: dto.reason },
    });

    return updated;
  }

  /**
   * Complex termination transaction.
   */
  private async terminateEmployee(employee: EmployeeWithUser, reason: string, actorUserId: string): Promise<Employee> {
    const userId = employee.userId;

    // Find active delegations made BY this user
    const outgoingDelegations = await this.prisma.userPermission.findMany({
      where: { delegatedByUserId: userId, revokedAt: null },
      include: { permission: true },
    });

    const result = await this.prisma.$transaction(async (tx: PrismaTxClient) => {
      // 1. Employee employment status -> TERMINATED
      const updatedEmp = await tx.employee.update({
        where: { id: employee.id },
        data: { employmentStatus: EmploymentStatus.TERMINATED },
      });

      // 2. User status -> INACTIVE
      await tx.user.update({
        where: { id: userId },
        data: { status: UserStatus.INACTIVE },
      });

      // 3. Revoke all active refresh tokens
      await tx.refreshToken.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });

      // 4. Revoke active UserPermission grants delegated BY this user
      if (outgoingDelegations.length > 0) {
        await tx.userPermission.updateMany({
          where: { delegatedByUserId: userId, revokedAt: null },
          data: { revokedAt: new Date() },
        });
      }

      // 5. Audit events
      await this.audit.recordInTx(tx, {
        entityType: 'Employee',
        entityId: employee.id,
        action: 'EMPLOYEE_TERMINATED',
        actorUserId,
        reason,
        metadata: { reason },
      });

      await this.audit.recordInTx(tx, {
        entityType: 'User',
        entityId: userId,
        action: 'USER_STATUS_CHANGED',
        actorUserId,
        reason: 'Employee termination',
        metadata: { oldStatus: employee.user.status, newStatus: UserStatus.INACTIVE, reason },
      });

      for (const grant of outgoingDelegations) {
        await this.audit.recordInTx(tx, {
          entityType: 'User',
          entityId: grant.userId, // recipient
          action: 'USER_DUTY_REVOKED',
          actorUserId: undefined, // System action triggered by termination
          reason: 'Delegator terminated',
          metadata: { 
            permissionId: grant.permissionId, 
            permissionCode: grant.permission.code, 
            grantId: grant.id, 
            revokedByUserId: actorUserId, 
            reason: 'Delegator terminated' 
          },
        });
      }

      return updatedEmp;
    });

    // 6. Outside transaction: cache invalidations
    await this.userStatusCache.invalidate(userId);
    await this.rbacService.invalidateCache(userId);

    // Invalidate recipients of revoked delegations
    for (const grant of outgoingDelegations) {
      await this.rbacService.invalidateCache(grant.userId);
    }

    return result;
  }
}
