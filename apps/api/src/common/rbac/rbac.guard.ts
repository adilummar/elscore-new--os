import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import type { RequestUser } from '../auth/decorators/current-user.decorator';

import { RbacService } from './rbac.service';
import { PERMISSIONS_KEY } from './require-permissions.decorator';

/**
 * RbacGuard — enforces permission requirements declared with @RequirePermissions().
 *
 * This guard runs AFTER JwtAuthGuard (authentication must succeed first).
 *
 * How it works:
 *   1. Reads required permissions from route metadata (@RequirePermissions decorator)
 *   2. If no permissions required, allows access
 *   3. Resolves user's actual permissions via RbacService (with Redis cache)
 *   4. Checks that the user holds ALL required permissions
 *
 * What it does NOT check:
 *   - Record scope (e.g. "only your assigned leads") → service layer responsibility
 *   - Field-level access (e.g. parent phone) → service layer responsibility
 *
 * Apply this guard per-controller or per-route as needed:
 *   @UseGuards(RbacGuard)
 *   @RequirePermissions('lead.read')
 *
 * Or register globally in app.module.ts with APP_GUARD.
 */
@Injectable()
export class RbacGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly rbacService: RbacService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredPermissions = this.reflector.getAllAndOverride<string[]>(PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    // No permissions required → allow (rely on JwtAuthGuard for authentication)
    if (!requiredPermissions || requiredPermissions.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest<{ user: RequestUser }>();
    const user = request.user;

    if (!user?.id) {
      throw new ForbiddenException('User identity not found in request');
    }

    const hasAll = await this.rbacService.hasPermissions(user.id, requiredPermissions);

    if (!hasAll) {
      throw new ForbiddenException(
        `Access denied. Required permissions: ${requiredPermissions.join(', ')}`,
      );
    }

    return true;
  }
}
