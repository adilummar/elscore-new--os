import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { EmploymentStatus, User, UserStatus } from '@prisma/client';
import * as argon2 from 'argon2';

import { AuditService } from '../../common/audit/audit.service';
import { AuthService } from '../../common/auth/auth.service';
import { UserStatusCacheService } from '../../common/auth/services/user-status-cache.service';
import { IdGeneratorService } from '../../common/id-generator/id-generator.service';
import { paginate, PaginateOptions } from '../../common/pagination/paginate.util';
import { PaginatedResponseDto } from '../../common/pagination/pagination.dto';
import { PrismaService, PrismaTxClient } from '../../common/prisma/prisma.service';
import { RbacService } from '../../common/rbac/rbac.service';

import { ChangePasswordDto } from './dto/change-password.dto';
import { CreateUserDto } from './dto/create-user.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { UpdateUserStatusDto } from './dto/update-user-status.dto';

@Injectable()
export class UserService {
  private readonly argon2Options: argon2.Options = {
    type: argon2.argon2id,
    memoryCost: 65536,
    timeCost: 3,
    parallelism: 4,
  };

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly rbacService: RbacService,
    private readonly userStatusCache: UserStatusCacheService,
    private readonly idGenerator: IdGeneratorService,
    private readonly authService: AuthService,
  ) {}

  async findAll(options: Pick<PaginateOptions, 'limit' | 'cursor'>): Promise<PaginatedResponseDto<User>> {
    return paginate(this.prisma.user, {
      ...options,
      orderBy: { id: 'asc' },
      select: {
        id: true,
        email: true,
        status: true,
        mustChangePassword: true,
        createdAt: true,
        updatedAt: true,
        lastLoginAt: true,
        employee: true,
        userRoles: { include: { role: true } },
      },
    });
  }

  async findOne(id: string): Promise<Partial<User>> {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        status: true,
        mustChangePassword: true,
        createdAt: true,
        updatedAt: true,
        lastLoginAt: true,
        employee: { include: { department: true } },
        userRoles: { include: { role: true } },
      },
    });

    if (!user) {
      throw new NotFoundException(`User with ID ${id} not found`);
    }
    return user;
  }

  async create(dto: CreateUserDto, actorUserId: string): Promise<Partial<User>> {
    // Argon2 hashing before transaction
    const passwordHash = await argon2.hash(dto.password, this.options());

    // Role existence and protection check
    const role = await this.prisma.role.findUnique({ where: { id: dto.roleId } });
    if (!role) throw new NotFoundException('Role not found');

    const actor = await this.prisma.user.findUnique({
      where: { id: actorUserId },
      include: { userRoles: { include: { role: true } } },
    });
    const actorIsCeo = actor?.userRoles.some((ur: { role: { code: string } }) => ur.role.code === 'CEO');

    if (role.isProtected && !actorIsCeo) {
      throw new BadRequestException('Only the CEO can assign protected roles');
    }

    // Zero roles exclusivity check (CO_FOUNDER has no roles yet, so it's fine)

    const result = await this.prisma.$transaction(async (tx: PrismaTxClient) => {
      // 1. Business ID generation
      const businessId = await this.idGenerator.nextIdInTx(tx, 'EMP');

      // 2. User creation
      const user = await tx.user.create({
        data: {
          email: dto.email,
          passwordHash,
          status: UserStatus.PENDING_SETUP,
          mustChangePassword: true,
        },
      });

      // 3. Employee creation
      const employee = await tx.employee.create({
        data: {
          businessId,
          userId: user.id,
          departmentId: dto.departmentId,
          firstName: dto.firstName,
          lastName: dto.lastName,
          employmentStatus: EmploymentStatus.ACTIVE,
        },
      });

      // 4. Initial UserRole creation
      await tx.userRole.create({
        data: {
          userId: user.id,
          roleId: dto.roleId,
          grantedByUserId: actorUserId,
        },
      });

      // 4.5. TutorProfile creation if role is TUTOR
      if (role.code === 'TUTOR') {
        // Find the recruitment id if it was passed (we'd need to add recruitmentId to DTO, but for now just create the profile without it or we can add it later)
        await tx.tutorProfile.create({
          data: {
            employeeId: employee.id,
            // tutorOperationalStatus defaults to INACTIVE
          },
        });
      }

      // 5. Audits
      await this.audit.recordInTx(tx, {
        entityType: 'User',
        entityId: user.id,
        action: 'USER_CREATED',
        actorUserId,
        metadata: { email: user.email, employeeBusinessId: businessId, initialRole: role.code },
      });

      await this.audit.recordInTx(tx, {
        entityType: 'Employee',
        entityId: employee.id,
        action: 'EMPLOYEE_CREATED',
        actorUserId,
        metadata: { businessId, departmentId: dto.departmentId, userId: user.id },
      });

      await this.audit.recordInTx(tx, {
        entityType: 'User',
        entityId: user.id,
        action: 'USER_ROLE_ASSIGNED',
        actorUserId,
        metadata: { roleId: role.id, roleCode: role.code, grantedByUserId: actorUserId },
      });

      return user;
    });

    // Invalidate caches
    await this.rbacService.invalidateCache(result.id);
    await this.userStatusCache.invalidate(result.id);

    return this.findOne(result.id);
  }

  async updateStatus(id: string, dto: UpdateUserStatusDto, actorUserId: string): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException('User not found');

    if (user.status === dto.status) return;

    if (dto.status === UserStatus.SUSPENDED) {
      await this.suspendUser(user, dto.reason || 'No reason provided', actorUserId);
    } else {
      await this.prisma.user.update({
        where: { id },
        data: { status: dto.status },
      });

      await this.audit.record({
        entityType: 'User',
        entityId: id,
        action: 'USER_STATUS_CHANGED',
        actorUserId,
        metadata: { oldStatus: user.status, newStatus: dto.status, reason: dto.reason },
      });

      await this.userStatusCache.invalidate(id);
    }
  }

  private async suspendUser(user: User, reason: string, actorUserId: string): Promise<void> {
    const userId = user.id;

    // Find active delegations made BY this user
    const outgoingDelegations = await this.prisma.userPermission.findMany({
      where: { delegatedByUserId: userId, revokedAt: null },
      include: { permission: true },
    });

    await this.prisma.$transaction(async (tx: PrismaTxClient) => {
      // 1. User status -> SUSPENDED
      await tx.user.update({
        where: { id: userId },
        data: { status: UserStatus.SUSPENDED },
      });

      // 2. Revoke all active refresh tokens
      await tx.refreshToken.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });

      // 3. Revoke active UserPermission grants delegated BY this user
      if (outgoingDelegations.length > 0) {
        await tx.userPermission.updateMany({
          where: { delegatedByUserId: userId, revokedAt: null },
          data: { revokedAt: new Date() },
        });
      }

      // 4. Audit events
      await this.audit.recordInTx(tx, {
        entityType: 'User',
        entityId: userId,
        action: 'USER_STATUS_CHANGED',
        actorUserId,
        reason,
        metadata: { oldStatus: user.status, newStatus: UserStatus.SUSPENDED, reason },
      });

      for (const grant of outgoingDelegations) {
        await this.audit.recordInTx(tx, {
          entityType: 'User',
          entityId: grant.userId,
          action: 'USER_DUTY_REVOKED',
          actorUserId,
          reason: 'Delegator suspended',
          metadata: { 
            permissionId: grant.permissionId, 
            permissionCode: grant.permission.code, 
            grantId: grant.id, 
            revokedByUserId: actorUserId, 
            reason: 'Delegator suspended' 
          },
        });
      }
    });

    // 5. Outside transaction: cache invalidations
    await this.userStatusCache.invalidate(userId);
    await this.rbacService.invalidateCache(userId);

    for (const grant of outgoingDelegations) {
      await this.rbacService.invalidateCache(grant.userId);
    }
  }

  async resetPassword(id: string, dto: ResetPasswordDto, actorUserId: string): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException('User not found');

    const passwordHash = await argon2.hash(dto.newPassword, this.options());

    await this.prisma.user.update({
      where: { id },
      data: { passwordHash, mustChangePassword: true, status: UserStatus.PENDING_SETUP },
    });

    // Revoke all existing tokens
    await this.authService.revokeAllUserTokens(id);

    await this.audit.record({
      entityType: 'User',
      entityId: id,
      action: 'USER_PASSWORD_RESET',
      actorUserId,
      metadata: {},
    });

    await this.userStatusCache.invalidate(id);
  }

  async changePassword(id: string, dto: ChangePasswordDto): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException('User not found');

    const isValid = await argon2.verify(user.passwordHash, dto.oldPassword, this.options());
    if (!isValid) throw new BadRequestException('Incorrect old password');

    const newHash = await argon2.hash(dto.newPassword, this.options());

    await this.prisma.user.update({
      where: { id },
      data: { passwordHash: newHash, mustChangePassword: false, status: UserStatus.ACTIVE },
    });

    await this.authService.revokeAllUserTokens(id);

    await this.audit.record({
      entityType: 'User',
      entityId: id,
      action: 'USER_PASSWORD_CHANGED',
      actorUserId: id,
      metadata: { clearedMustChangePassword: true },
    });

    await this.userStatusCache.invalidate(id);
  }

  private options() {
    return this.argon2Options;
  }
}
