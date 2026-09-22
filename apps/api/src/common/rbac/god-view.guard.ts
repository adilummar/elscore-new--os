import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Request } from 'express';
import { RbacService } from './rbac.service';
import { RequestUser } from '../auth/decorators/current-user.decorator';
import { AuditContext } from '../audit/audit.context';
import { PrismaService } from '../prisma/prisma.service';

/**
 * GodViewGuard — Overrides the CurrentUser if X-God-View-Target is provided.
 *
 * Runs BEFORE RbacGuard so that all subsequent authorization checks and controller
 * executions believe the active user is the God View target.
 */
@Injectable()
export class GodViewGuard implements CanActivate {
  constructor(
    private readonly rbacService: RbacService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request & { user: RequestUser }>();
    const realUser = request.user;
    
    if (!realUser) {
      return true; // Unauthenticated requests are handled by JwtAuthGuard
    }

    const godViewTargetId = request.headers['x-god-view-target'] as string;

    if (!godViewTargetId) {
      return true;
    }

    // Check if the real user is authorized to enter God View
    const realPerms = await this.rbacService.getPermissionsForUser(realUser.id);
    const isCeo = realPerms.has('analytics.ceo.read');
    const canEnter = isCeo || realPerms.has('god-view.enter');

    if (!canEnter) {
      throw new ForbiddenException('You do not have permission to use God View');
    }

    // Verify the target user exists
    const targetUser = await this.prisma.user.findUnique({
      where: { id: godViewTargetId },
      select: { id: true, email: true, status: true },
    });

    if (!targetUser) {
      throw new ForbiddenException('God View target user not found');
    }

    // Update Audit Context so audit logs accurately reflect the real actor
    const store = AuditContext.getStore();
    if (store) {
      store.realActorId = realUser.id;
      store.isGodView = true;
    }

    // Swap the user identity for the remainder of the request execution!
    request.user = {
      id: targetUser.id,
      email: targetUser.email,
    };

    // If the real user is NOT the CEO, we should strictly prevent mutations.
    // ReadOnlyGuard handles the CO_FOUNDER exception, but let's add a flag for it if we want.
    // Actually, we can attach `isGodViewReadOnly` to the request object and have ReadOnlyGuard check it.
    if (!isCeo) {
      (request as any).isGodViewReadOnly = true;
    }

    return true;
  }
}
