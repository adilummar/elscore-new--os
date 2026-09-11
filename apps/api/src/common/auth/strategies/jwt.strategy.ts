import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { UserStatus } from '@prisma/client';
import { ExtractJwt, Strategy } from 'passport-jwt';

import type { RequestUser } from '../decorators/current-user.decorator';
import { UserStatusCacheService } from '../services/user-status-cache.service';

interface JwtPayload {
  sub: string;   // user.id (UUID)
  email: string;
  iat?: number;
  exp?: number;
}

/**
 * JWT access token strategy.
 *
 * Validates the Bearer token on every protected request.
 * Extracts { id, email } and sets it as req.user.
 *
 * R-1 HARDENING:
 *   validate() is now async and checks UserStatus via UserStatusCacheService.
 *   A valid JWT is NOT sufficient if the account is not ACTIVE.
 *   Status is cached in Redis for 30 seconds (configurable).
 *   Cache failure falls back to a direct DB read — never silently allows.
 *
 * Permissions are NOT embedded in the JWT payload.
 * They are resolved at authorization time by RbacService (with Redis caching).
 * This avoids stale permission issues when roles change between token issue and expiry.
 *
 * Authentication and authorization remain intentionally separated:
 *   - JwtStrategy: identity + account status only.
 *   - RbacGuard: permission enforcement only.
 */
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    private readonly config: ConfigService,
    private readonly userStatusCache: UserStatusCacheService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.getOrThrow<string>('jwt.accessSecret'),
    });
  }

  async validate(payload: JwtPayload): Promise<RequestUser> {
    if (!payload.sub || !payload.email) {
      throw new UnauthorizedException('Invalid token payload');
    }

    // R-1: Verify account is still active on every request.
    // Max enforcement delay = Redis TTL (30 seconds).
    const cacheResult = await this.userStatusCache.getStatus(payload.sub);

    if (cacheResult === null) {
      // User no longer exists in the database
      throw new UnauthorizedException('User account not found');
    }

    const { status, mustChangePassword } = cacheResult;

    if (status !== UserStatus.ACTIVE && status !== UserStatus.PENDING_SETUP) {
      throw new UnauthorizedException(
        'Account is not active. Access denied.',
      );
    }

    return { 
      id: payload.sub, 
      email: payload.email,
      requiresPasswordChange: mustChangePassword
    };
  }
}
