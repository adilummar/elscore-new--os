import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';

import { AuditService } from '../../common/audit/audit.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { RbacService } from '../../common/rbac/rbac.service';

@Injectable()
export class UserRoleService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly rbacService: RbacService,
  ) {}

  async assignRole(userId: string, roleId: string, actorUserId: string): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { userRoles: { include: { role: true } } },
    });
    if (!user) throw new NotFoundException('User not found');

    const role = await this.prisma.role.findUnique({ where: { id: roleId } });
    if (!role) throw new NotFoundException('Role not found');

    const actor = await this.prisma.user.findUnique({
      where: { id: actorUserId },
      include: { userRoles: { include: { role: true } } },
    });
    const actorIsCeo = actor?.userRoles.some((ur) => ur.role.code === 'CEO');

    // 1. CO_FOUNDER exclusivity logic
    const hasCoFounder = user.userRoles.some((ur) => ur.role.code === 'CO_FOUNDER');
    
    if (role.code === 'CO_FOUNDER' && user.userRoles.length > 0) {
      throw new ConflictException('CO_FOUNDER role cannot be assigned to a user who holds any other role');
    }
    
    if (hasCoFounder && role.code !== 'CO_FOUNDER') {
      throw new ConflictException('No other role can be assigned to a user who holds CO_FOUNDER');
    }

    // 2. Protected role check
    if (role.isProtected && !actorIsCeo) {
      throw new ForbiddenException('Only the CEO can assign protected roles');
    }

    // 3. Check if already assigned
    const exists = user.userRoles.some((ur) => ur.roleId === roleId);
    if (exists) return;

    // 4. Assign role
    await this.prisma.$transaction(async (tx) => {
      await tx.userRole.create({
        data: {
          userId,
          roleId,
          grantedByUserId: actorUserId,
        },
      });

      await this.audit.recordInTx(tx, {
        entityType: 'User',
        entityId: userId,
        action: 'USER_ROLE_ASSIGNED',
        actorUserId,
        metadata: { roleId, roleCode: role.code, grantedByUserId: actorUserId },
      });
    });

    await this.rbacService.invalidateCache(userId);
  }

  async revokeRole(userId: string, roleId: string, actorUserId: string): Promise<void> {
    const exists = await this.prisma.userRole.findUnique({
      where: { userId_roleId: { userId, roleId } },
      include: { role: true },
    });

    if (!exists) return; // already revoked / not assigned

    await this.prisma.userRole.delete({
      where: { userId_roleId: { userId, roleId } },
    });

    await this.audit.record({
      entityType: 'User',
      entityId: userId,
      action: 'USER_ROLE_REVOKED',
      actorUserId,
      metadata: { roleId, roleCode: exists.role.code },
    });

    await this.rbacService.invalidateCache(userId);
  }
}
