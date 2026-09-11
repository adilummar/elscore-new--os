import { ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { Observable } from 'rxjs';

import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

/**
 * Global JWT authentication guard.
 *
 * - All routes are protected by default.
 * - Use @Public() to explicitly mark a route as unauthenticated.
 * - Validates the Bearer token using JwtStrategy.
 * - Sets req.user = { id, email } on success.
 *
 * Authorization (role/permission checks) is handled separately by RbacGuard.
 * Authentication and authorization are intentionally separated.
 */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private readonly reflector: Reflector) {
    super();
  }

  canActivate(context: ExecutionContext): boolean | Promise<boolean> | Observable<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    return super.canActivate(context);
  }
}
