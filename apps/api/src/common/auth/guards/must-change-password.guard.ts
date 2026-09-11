import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { RequestUser } from '../decorators/current-user.decorator';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { SKIP_MUST_CHANGE_PASSWORD_KEY } from '../decorators/skip-must-change-password.decorator';

/**
 * MustChangePasswordGuard — enforces the mustChangePassword state.
 *
 * Runs after JwtAuthGuard. If the user has requiresPasswordChange = true in their
 * token payload (set by JwtStrategy via cache lookup), this guard blocks access
 * to all protected routes except those explicitly marked with @SkipMustChangePassword().
 */
@Injectable()
export class MustChangePasswordGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    const skipMustChangePassword = this.reflector.getAllAndOverride<boolean>(
      SKIP_MUST_CHANGE_PASSWORD_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (skipMustChangePassword) {
      return true;
    }

    const request = context.switchToHttp().getRequest<{ user: RequestUser }>();
    const user = request.user;

    // JwtAuthGuard should have populated user, but we check just in case.
    if (!user) {
      return true;
    }

    if (user.requiresPasswordChange) {
      throw new ForbiddenException('Password change required before accessing this resource');
    }

    return true;
  }
}
