import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';

export interface RequestUser {
  id: string;
  email: string;
  mustChangePassword?: boolean;
}

/**
 * Parameter decorator that extracts the authenticated user from the request.
 *
 * Usage:
 *   @Get('me')
 *   getMe(@CurrentUser() user: RequestUser) { ... }
 *
 * The user object is populated by JwtStrategy.validate() after successful
 * JWT verification. Do not trust client-provided user data.
 */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): RequestUser => {
    const request = ctx.switchToHttp().getRequest<Request & { user: RequestUser }>();
    return request.user;
  },
);
