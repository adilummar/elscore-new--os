import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';

import { AuditService } from '../../common/audit/audit.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { RbacService } from '../../common/rbac/rbac.service';

@Injectable()
export class UserPermissionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly rbacService: RbacService,
  ) {}

  async delegatePermission(userId: string, permissionId: string, actorUserId: string): Promise<void> {
    const permission = await this.prisma.permission.findUnique({ where: { id: permissionId } });
    if (!permission) throw new NotFoundException('Permission not found');

    const recipient = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { userRoles: { include: { role: true } } },
    });
    if (!recipient) throw new NotFoundException('User not found');

    // 1. isDelegatable must be true
    if (!permission.isDelegatable) {
      throw new BadRequestException('This permission cannot be directly delegated');
    }

    // 2. The delegator must personally hold the permission
    const actorHasPermission = await this.rbacService.hasPermissions(actorUserId, [permission.code]);
    if (!actorHasPermission) {
      throw new ForbiddenException('You cannot delegate a permission you do not hold');
    }

    // 3. Recipient must not already have an active grant
    const existing = await this.prisma.userPermission.findFirst({
      where: { userId, permissionId, revokedAt: null },
    });
    if (existing) {
      throw new ConflictException('User already has an active grant for this permission');
    }

    // 4. Recipient must hold HR_ASSISTANT or HR_EXECUTIVE role
    const recipientHasHrRole = recipient.userRoles.some(
      (ur) => ur.role.code === 'HR_ASSISTANT' || ur.role.code === 'HR_EXECUTIVE'
    );
    if (!recipientHasHrRole) {
      throw new BadRequestException('Recipient must hold HR_ASSISTANT or HR_EXECUTIVE role to receive delegations');
    }

    // 5. Caller authority is handled by RbacGuard on the route (role.manage or equivalent)

    await this.prisma.userPermission.create({
      data: {
        userId,
        permissionId,
        delegatedByUserId: actorUserId,
      },
    });

    await this.audit.record({
      entityType: 'User',
      entityId: userId,
      action: 'USER_DUTY_DELEGATED',
      actorUserId,
      metadata: { permissionId, permissionCode: permission.code, delegatedByUserId: actorUserId },
    });

    await this.rbacService.invalidateCache(userId);
  }

  async revokeDelegation(userId: string, grantId: string, actorUserId: string): Promise<void> {
    const grant = await this.prisma.userPermission.findUnique({
      where: { id: grantId },
      include: { permission: true },
    });

    if (!grant || grant.userId !== userId || grant.revokedAt !== null) {
      throw new NotFoundException('Active permission grant not found');
    }

    await this.prisma.userPermission.update({
      where: { id: grantId },
      data: { revokedAt: new Date() },
    });

    await this.audit.record({
      entityType: 'User',
      entityId: userId,
      action: 'USER_DUTY_REVOKED',
      actorUserId,
      metadata: { 
        permissionId: grant.permissionId, 
        permissionCode: grant.permission.code, 
        grantId, 
        revokedByUserId: actorUserId 
      },
    });

    await this.rbacService.invalidateCache(userId);
  }
}
