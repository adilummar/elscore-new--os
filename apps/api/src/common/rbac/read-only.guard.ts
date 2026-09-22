import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import type { Request } from 'express';

import { RequestUser } from '../auth/decorators/current-user.decorator';
import { PrismaService } from '../prisma/prisma.service';

/**
 * ReadOnlyGuard — Enforces Co-Founder read-only exclusivity.
 *
 * Applies to mutation endpoints (POST, PUT, PATCH, DELETE).
 * Queries the database directly to check if the user holds the CO_FOUNDER role.
 * If so, the request is rejected with 403 Forbidden.
 *
 * It is safer to check the database directly here (or use a dedicated role cache)
 * rather than relying on the permission cache, because CO_FOUNDER exclusivity
 * is an absolute business rule that must not be bypassed by an overly permissive
 * permission grant.
 */
@Injectable()
export class ReadOnlyGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request & { user?: RequestUser }>();
    const user = request.user;

    if (!user) {
      return true; // Let authentication guards handle unauthenticated users
    }

    // Only apply to mutation methods
    const method = request.method.toUpperCase();
    if (['GET', 'HEAD', 'OPTIONS'].includes(method)) {
      return true;
    }

    // Check if user holds CO_FOUNDER role
    const userRoles = await this.prisma.userRole.findMany({
      where: { userId: user.id },
      include: { role: { select: { code: true } } },
    });

    const isCoFounder = userRoles.some((ur) => ur.role.code === 'CO_FOUNDER');
    const isGodViewReadOnly = (request as any).isGodViewReadOnly === true;

    if (isCoFounder || isGodViewReadOnly) {
      throw new ForbiddenException('You have read-only access. Mutation operations are forbidden.');
    }

    return true;
  }
}
