import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Employee, EmploymentStatus, Prisma, UserStatus } from '@prisma/client';

export type EmployeeWithUser = Prisma.EmployeeGetPayload<{
  include: {
    department: true;
    user: { select: { email: true; status: true; id: true } };
    reportingManager: {
      select: {
        id: true;
        businessId: true;
        firstName: true;
        lastName: true;
        jobTitle: true;
      };
    };
    directReports: {
      select: {
        id: true;
        businessId: true;
        firstName: true;
        lastName: true;
        jobTitle: true;
      };
    };
  };
}>;

import { AuditService } from '../../common/audit/audit.service';
import { UserStatusCacheService } from '../../common/auth/services/user-status-cache.service';
import { paginate, PaginateOptions } from '../../common/pagination/paginate.util';
import { PaginatedResponseDto } from '../../common/pagination/pagination.dto';
import { PrismaService, PrismaTxClient } from '../../common/prisma/prisma.service';
import { RbacService } from '../../common/rbac/rbac.service';
import { isValidCalendarDate } from '../../common/utils/calendar-date.util';

import { TransitionEmployeeStatusDto } from './dto/transition-employee-status.dto';
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

  /**
   * Helper to determine if viewer holds HR Manager, HR Executive, CEO, or Admin roles.
   */
  private async isHrOrCeoUser(userId?: string): Promise<boolean> {
    if (!userId) return false;
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { userRoles: { include: { role: true } } },
    });
    return Boolean(
      user?.userRoles?.some((ur) =>
        ['CEO', 'HR_MANAGER', 'HR_EXECUTIVE', 'ADMIN'].includes(ur.role.code),
      ),
    );
  }

  /**
   * List all employees with pagination and role-aware privacy masking.
   */
  async findAll(
    options: Pick<PaginateOptions, 'limit' | 'cursor'>,
    viewerUserId?: string,
  ): Promise<PaginatedResponseDto<any>> {
    const isHrOrCeo = await this.isHrOrCeoUser(viewerUserId);

    const result = await paginate(this.prisma.employee, {
      ...options,
      orderBy: { businessId: 'asc' },
      include: {
        department: true,
        reportingManager: {
          select: {
            id: true,
            businessId: true,
            firstName: true,
            lastName: true,
            jobTitle: true,
          },
        },
        user: {
          select: {
            id: true,
            email: true,
            status: true,
            userRoles: {
              include: {
                role: true,
              },
            },
          },
        },
      },
    });

    // Field-level privacy masking for list view
    const sanitizedData = result.data.map((emp: any) => {
      const canSeePersonal = isHrOrCeo || emp.userId === viewerUserId;
      if (canSeePersonal) return emp;

      return {
        ...emp,
        personalEmail: null,
        dateOfBirth: null,
        gender: null,
        address: null,
        emergencyContactName: null,
        emergencyContactPhone: null,
        emergencyContactRelation: null,
      };
    });

    return {
      ...result,
      data: sanitizedData,
    };
  }

  /**
   * Get single employee detail with field-level privacy masking.
   */
  async findOne(id: string, viewerUserId?: string): Promise<any> {
    const employee = await this.prisma.employee.findUnique({
      where: { id },
      include: {
        department: true,
        reportingManager: {
          select: {
            id: true,
            businessId: true,
            firstName: true,
            lastName: true,
            jobTitle: true,
          },
        },
        directReports: {
          select: {
            id: true,
            businessId: true,
            firstName: true,
            lastName: true,
            jobTitle: true,
          },
        },
        user: {
          select: {
            id: true,
            email: true,
            status: true,
            userRoles: {
              include: { role: true },
            },
          },
        },
      },
    });

    if (!employee) {
      throw new NotFoundException(`Employee with ID ${id} not found`);
    }

    const isHrOrCeo = await this.isHrOrCeoUser(viewerUserId);
    const canSeePersonal = isHrOrCeo || employee.userId === viewerUserId;

    if (!canSeePersonal) {
      return {
        ...employee,
        personalEmail: null,
        dateOfBirth: null,
        gender: null,
        address: null,
        emergencyContactName: null,
        emergencyContactPhone: null,
        emergencyContactRelation: null,
      };
    }

    return employee;
  }

  /**
   * Routine profile update (name, phone, personal info, emergency contacts, job title, manager).
   * Audited as EMPLOYEE_PROFILE_UPDATED.
   */
  async updateProfile(id: string, dto: UpdateEmployeeDto, actorUserId: string): Promise<Employee> {
    const employee = await this.prisma.employee.findUnique({
      where: { id },
    });
    if (!employee) {
      throw new NotFoundException(`Employee with ID ${id} not found`);
    }

    const changedFields: Record<string, unknown> = {};
    const data: Record<string, unknown> = {};

    // Basic & Contact
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

    // Personal Details
    if (dto.personalEmail !== undefined && dto.personalEmail !== employee.personalEmail) {
      data.personalEmail = dto.personalEmail;
      changedFields.personalEmail = { old: employee.personalEmail, new: dto.personalEmail };
    }
    if (dto.dateOfBirth !== undefined && dto.dateOfBirth !== employee.dateOfBirth) {
      if (dto.dateOfBirth && !isValidCalendarDate(dto.dateOfBirth)) {
        throw new BadRequestException('dateOfBirth must be a valid real calendar date in YYYY-MM-DD format');
      }
      data.dateOfBirth = dto.dateOfBirth;
      changedFields.dateOfBirth = { old: employee.dateOfBirth, new: dto.dateOfBirth };
    }
    if (dto.gender !== undefined && dto.gender !== employee.gender) {
      data.gender = dto.gender;
      changedFields.gender = { old: employee.gender, new: dto.gender };
    }
    if (dto.address !== undefined && dto.address !== employee.address) {
      data.address = dto.address;
      changedFields.address = { old: employee.address, new: dto.address };
    }

    // Emergency Contact
    if (dto.emergencyContactName !== undefined && dto.emergencyContactName !== employee.emergencyContactName) {
      data.emergencyContactName = dto.emergencyContactName;
      changedFields.emergencyContactName = { old: employee.emergencyContactName, new: dto.emergencyContactName };
    }
    if (dto.emergencyContactPhone !== undefined && dto.emergencyContactPhone !== employee.emergencyContactPhone) {
      data.emergencyContactPhone = dto.emergencyContactPhone;
      changedFields.emergencyContactPhone = { old: employee.emergencyContactPhone, new: dto.emergencyContactPhone };
    }
    if (dto.emergencyContactRelation !== undefined && dto.emergencyContactRelation !== employee.emergencyContactRelation) {
      data.emergencyContactRelation = dto.emergencyContactRelation;
      changedFields.emergencyContactRelation = { old: employee.emergencyContactRelation, new: dto.emergencyContactRelation };
    }

    // Job & Hierarchy
    if (dto.jobTitle !== undefined && dto.jobTitle !== employee.jobTitle) {
      data.jobTitle = dto.jobTitle;
      changedFields.jobTitle = { old: employee.jobTitle, new: dto.jobTitle };
    }
    if (dto.employmentType !== undefined && dto.employmentType !== employee.employmentType) {
      data.employmentType = dto.employmentType;
      changedFields.employmentType = { old: employee.employmentType, new: dto.employmentType };
    }
    if (dto.noticePeriodDays !== undefined && dto.noticePeriodDays !== employee.noticePeriodDays) {
      data.noticePeriodDays = dto.noticePeriodDays;
      changedFields.noticePeriodDays = { old: employee.noticePeriodDays, new: dto.noticePeriodDays };
    }

    if (dto.departmentId !== undefined && dto.departmentId !== employee.departmentId) {
      const dept = await this.prisma.department.findUnique({ where: { id: dto.departmentId } });
      if (!dept) throw new NotFoundException('Department not found');
      data.departmentId = dto.departmentId;
      changedFields.departmentId = { old: employee.departmentId, new: dto.departmentId };
    }

    if (dto.reportingManagerId !== undefined && dto.reportingManagerId !== employee.reportingManagerId) {
      if (dto.reportingManagerId === employee.id) {
        throw new BadRequestException('An employee cannot be their own reporting manager');
      }
      if (dto.reportingManagerId) {
        const mgr = await this.prisma.employee.findUnique({ where: { id: dto.reportingManagerId } });
        if (!mgr) throw new NotFoundException('Reporting manager not found');
        if (mgr.employmentStatus === EmploymentStatus.TERMINATED) {
          throw new BadRequestException('A terminated employee cannot be assigned as reporting manager');
        }
      }
      data.reportingManagerId = dto.reportingManagerId;
      changedFields.reportingManagerId = { old: employee.reportingManagerId, new: dto.reportingManagerId };
    }

    if (Object.keys(data).length === 0) {
      return employee;
    }

    const updated = await this.prisma.employee.update({
      where: { id },
      data,
    });

    await this.audit.record({
      entityType: 'Employee',
      entityId: employee.id,
      action: 'EMPLOYEE_PROFILE_UPDATED',
      actorUserId,
      metadata: { changedFields },
    });

    return updated;
  }

  /**
   * Governed Employment Lifecycle Status Transition.
   * Requires employee.manage-status permission.
   * Transactionally updates employee status, records structured EmployeeStatusHistory,
   * governs user account access, and writes an AuditEvent.
   */
  async transitionStatus(
    id: string,
    dto: TransitionEmployeeStatusDto,
    actorUserId: string,
  ): Promise<Employee> {
    const employee = await this.prisma.employee.findUnique({
      where: { id },
      include: {
        user: true,
      },
    });

    if (!employee) {
      throw new NotFoundException(`Employee with ID ${id} not found`);
    }

    // Separation of duties: HR/Admins cannot transition their own employment status
    if (employee.userId === actorUserId) {
      throw new ForbiddenException(
        'Self-transition is not permitted: you cannot modify your own employment lifecycle status',
      );
    }

    // Reason validation
    if (!dto.reason || !dto.reason.trim()) {
      throw new BadRequestException('A non-empty reason is mandatory for any status transition');
    }

    // Date validations
    if (!isValidCalendarDate(dto.effectiveDate)) {
      throw new BadRequestException('effectiveDate must be a valid real calendar date in YYYY-MM-DD format');
    }
    if (dto.probationEndDate && !isValidCalendarDate(dto.probationEndDate)) {
      throw new BadRequestException('probationEndDate must be a valid real calendar date in YYYY-MM-DD format');
    }
    if (dto.confirmationDate && !isValidCalendarDate(dto.confirmationDate)) {
      throw new BadRequestException('confirmationDate must be a valid real calendar date in YYYY-MM-DD format');
    }
    if (dto.resignationDate && !isValidCalendarDate(dto.resignationDate)) {
      throw new BadRequestException('resignationDate must be a valid real calendar date in YYYY-MM-DD format');
    }
    if (dto.lastWorkingDate && !isValidCalendarDate(dto.lastWorkingDate)) {
      throw new BadRequestException('lastWorkingDate must be a valid real calendar date in YYYY-MM-DD format');
    }

    // Access restriction determination
    // Termination ALWAYS restricts access. Suspension/Notice restricts access ONLY if explicitly requested.
    const shouldRestrictAccess = dto.status === EmploymentStatus.TERMINATED || Boolean(dto.restrictAccess);

    // Active delegations to revoke if access is being restricted
    const outgoingDelegations = shouldRestrictAccess
      ? await this.prisma.userPermission.findMany({
          where: { delegatedByUserId: employee.userId, revokedAt: null },
          include: { permission: true },
        })
      : [];

    let shouldInvalidateCache = false;

    const result = await this.prisma.$transaction(async (tx: PrismaTxClient) => {
      // 1. Create structured EmployeeStatusHistory entry
      await tx.employeeStatusHistory.create({
        data: {
          employeeId: employee.id,
          previousStatus: employee.employmentStatus,
          newStatus: dto.status,
          effectiveDate: dto.effectiveDate,
          reason: dto.reason.trim(),
          notes: dto.notes?.trim() || null,
          accessRestricted: shouldRestrictAccess,
          authorizedByUserId: actorUserId,
        },
      });

      // 2. Prepare Employee record updates
      const employeeUpdateData: Prisma.EmployeeUpdateInput = {
        employmentStatus: dto.status,
      };

      if (dto.status === EmploymentStatus.ACTIVE && dto.confirmationDate) {
        employeeUpdateData.confirmationDate = dto.confirmationDate;
      }
      if (dto.probationEndDate) {
        employeeUpdateData.probationEndDate = dto.probationEndDate;
      }
      if (dto.resignationDate) {
        employeeUpdateData.resignationDate = dto.resignationDate;
      }
      if (dto.lastWorkingDate) {
        employeeUpdateData.lastWorkingDate = dto.lastWorkingDate;
      }
      if (dto.noticePeriodDays !== undefined) {
        employeeUpdateData.noticePeriodDays = dto.noticePeriodDays;
      }

      const updatedEmp = await tx.employee.update({
        where: { id: employee.id },
        data: employeeUpdateData,
      });

      // 3. User Account Access Governance
      if (dto.status === EmploymentStatus.TERMINATED) {
        // Termination offboarding
        await tx.user.update({
          where: { id: employee.userId },
          data: { status: UserStatus.INACTIVE },
        });

        await tx.refreshToken.updateMany({
          where: { userId: employee.userId, revokedAt: null },
          data: { revokedAt: new Date() },
        });

        if (outgoingDelegations.length > 0) {
          await tx.userPermission.updateMany({
            where: { delegatedByUserId: employee.userId, revokedAt: null },
            data: { revokedAt: new Date() },
          });
        }
        shouldInvalidateCache = true;
      } else if (shouldRestrictAccess) {
        // Suspension or notice period with explicitly authorized access restriction
        await tx.user.update({
          where: { id: employee.userId },
          data: { status: UserStatus.SUSPENDED },
        });

        await tx.refreshToken.updateMany({
          where: { userId: employee.userId, revokedAt: null },
          data: { revokedAt: new Date() },
        });

        if (outgoingDelegations.length > 0) {
          await tx.userPermission.updateMany({
            where: { delegatedByUserId: employee.userId, revokedAt: null },
            data: { revokedAt: new Date() },
          });
        }
        shouldInvalidateCache = true;
      } else if (dto.status === EmploymentStatus.ACTIVE && employee.user.status === UserStatus.SUSPENDED) {
        // Reactivating a previously suspended user
        await tx.user.update({
          where: { id: employee.userId },
          data: { status: UserStatus.ACTIVE },
        });
        shouldInvalidateCache = true;
      }

      // 4. Audit Logging
      let auditAction = 'EMPLOYEE_STATUS_TRANSITIONED';
      if (employee.employmentStatus === EmploymentStatus.PROBATION && dto.status === EmploymentStatus.ACTIVE) {
        auditAction = 'EMPLOYEE_PROBATION_CONFIRMED';
      } else if (dto.status === EmploymentStatus.NOTICE_PERIOD) {
        auditAction = 'EMPLOYEE_NOTICE_PERIOD_INITIATED';
      } else if (dto.status === EmploymentStatus.SUSPENDED) {
        auditAction = 'EMPLOYEE_SUSPENDED';
      } else if (dto.status === EmploymentStatus.TERMINATED) {
        auditAction = 'EMPLOYEE_TERMINATED';
      }

      await this.audit.recordInTx(tx, {
        entityType: 'Employee',
        entityId: employee.id,
        action: auditAction,
        actorUserId,
        reason: dto.reason,
        metadata: {
          previousStatus: employee.employmentStatus,
          newStatus: dto.status,
          effectiveDate: dto.effectiveDate,
          accessRestricted: shouldRestrictAccess,
          notes: dto.notes,
        },
      });

      return updatedEmp;
    });

    // 5. Outside transaction cache invalidation
    if (shouldInvalidateCache) {
      await this.userStatusCache.invalidate(employee.userId);
      await this.rbacService.invalidateCache(employee.userId);
      for (const grant of outgoingDelegations) {
        await this.rbacService.invalidateCache(grant.userId);
      }
    }

    return result;
  }

  /**
   * Get confidential employment status history for an employee.
   * Requires employee.history.read permission.
   */
  async getStatusHistory(employeeId: string): Promise<any[]> {
    const employee = await this.prisma.employee.findUnique({
      where: { id: employeeId },
    });
    if (!employee) {
      throw new NotFoundException(`Employee with ID ${employeeId} not found`);
    }

    return this.prisma.employeeStatusHistory.findMany({
      where: { employeeId },
      orderBy: { createdAt: 'desc' },
      include: {
        authorizedBy: {
          select: {
            id: true,
            email: true,
          },
        },
      },
    });
  }

  /**
   * Legacy status update endpoint preserved for backward compatibility.
   * Delegates to transitionStatus using today's calendar date as effectiveDate.
   */
  async updateStatus(id: string, dto: UpdateEmployeeStatusDto, actorUserId: string): Promise<Employee> {
    const today = new Date().toISOString().split('T')[0];
    return this.transitionStatus(
      id,
      {
        status: dto.status,
        effectiveDate: today,
        reason: dto.reason || `Status updated to ${dto.status} via API`,
        restrictAccess: dto.status === EmploymentStatus.TERMINATED,
      },
      actorUserId,
    );
  }
}
