import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Role } from '@prisma/client';

import { AuditService } from '../../common/audit/audit.service';
import { paginate, PaginateOptions } from '../../common/pagination/paginate.util';
import { PaginatedResponseDto } from '../../common/pagination/pagination.dto';
import { PrismaService } from '../../common/prisma/prisma.service';
import { RbacService } from '../../common/rbac/rbac.service';

import { CreateRoleDto } from './dto/create-role.dto';
import { RolePermissionAction } from './dto/update-role-permissions.dto';

@Injectable()
export class RoleService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly rbacService: RbacService,
  ) {}

  async findAll(options: Pick<PaginateOptions, 'limit' | 'cursor'>): Promise<PaginatedResponseDto<Role>> {
    return paginate(this.prisma.role, {
      ...options,
      orderBy: { id: 'asc' },
    });
  }

  async findOne(id: string): Promise<Role> {
    const role = await this.prisma.role.findUnique({
      where: { id },
      include: {
        permissions: {
          include: { permission: true },
        },
      },
    });

    if (!role) {
      throw new NotFoundException(`Role with ID ${id} not found`);
    }

    return role;
  }

  async createCustomRole(dto: CreateRoleDto, actorUserId: string): Promise<Role> {
    // Check if code exists
    const existing = await this.prisma.role.findUnique({ where: { code: dto.code } });
    if (existing) {
      throw new ConflictException(`Role with code ${dto.code} already exists`);
    }

    const role = await this.prisma.role.create({
      data: {
        code: dto.code,
        name: dto.name,
        description: dto.description,
        isSystem: false,
        isProtected: false,
        isCustom: true,
        createdByUserId: actorUserId,
      },
    });

    // Record audit
    await this.audit.record({
      entityType: 'Role',
      entityId: role.id,
      action: 'ROLE_CREATED',
      actorUserId,
      metadata: { code: role.code, name: role.name, isCustom: true },
    });

    return role;
  }

  async updateRolePermission(
    roleId: string,
    action: RolePermissionAction,
    permissionId: string,
    actorUserId: string,
  ): Promise<void> {
    const role = await this.prisma.role.findUnique({ where: { id: roleId } });
    if (!role) {
      throw new NotFoundException('Role not found');
    }

    const permission = await this.prisma.permission.findUnique({ where: { id: permissionId } });
    if (!permission) {
      throw new NotFoundException('Permission not found');
    }

    if (action === RolePermissionAction.ADD) {
      // Check if already exists
      const exists = await this.prisma.rolePermission.findUnique({
        where: { roleId_permissionId: { roleId, permissionId } },
      });
      if (exists) return; // Idempotent

      await this.prisma.rolePermission.create({
        data: { roleId, permissionId },
      });

      await this.audit.record({
        entityType: 'Role',
        entityId: roleId,
        action: 'ROLE_PERMISSION_ADDED',
        actorUserId,
        metadata: { permissionId, permissionCode: permission.code },
      });
    } else {
      // REMOVE
      const exists = await this.prisma.rolePermission.findUnique({
        where: { roleId_permissionId: { roleId, permissionId } },
      });
      if (!exists) return; // Idempotent

      await this.prisma.rolePermission.delete({
        where: { roleId_permissionId: { roleId, permissionId } },
      });

      await this.audit.record({
        entityType: 'Role',
        entityId: roleId,
        action: 'ROLE_PERMISSION_REMOVED',
        actorUserId,
        metadata: { permissionId, permissionCode: permission.code },
      });
    }

    // Invalidate cache for all users holding this role
    // This THROWS if any cache invalidation fails (PRIVILEGED security level)
    await this.rbacService.invalidateCacheForRole(roleId);
  }
}
