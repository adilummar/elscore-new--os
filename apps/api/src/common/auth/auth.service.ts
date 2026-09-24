import * as crypto from 'crypto';

import {
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { UserStatus } from '@prisma/client';
import * as argon2 from 'argon2';

import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';

export interface ValidatedUser {
  id: string;
  email: string;
  mustChangePassword: boolean;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

/**
 * AuthService — handles login, token issuance, refresh, and logout.
 *
 * Design principles:
 *  - Access tokens are stateless JWTs (15 min expiry).
 *  - Refresh tokens are stored server-side as SHA-256 hashes (7 day expiry).
 *  - On logout, the specific refresh token is revoked.
 *  - On password change, ALL refresh tokens for the user are revoked.
 *  - Authentication is fully separated from authorization (RBAC).
 *  - This service is designed so external IdP can be added later by replacing
 *    validateCredentials() and adjusting token issuance — RBAC and domain
 *    authorization remain unchanged.
 */
@Injectable()
export class AuthService {
  private readonly argon2Options: argon2.Options = {
    type: argon2.argon2id,
    memoryCost: 65536,  // 64 MB
    timeCost: 3,
    parallelism: 4,
  };

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Validates email + password credentials.
   * Returns the user identity on success, or null on failure.
   * Used by LocalStrategy.
   *
   * Timing-safe: always runs argon2.verify even on unknown email to prevent
   * username enumeration via timing differences.
   */
  async validateCredentials(email: string, password: string): Promise<ValidatedUser | null> {
    const isUatAccount = email.startsWith('uat_') || email.endsWith('@elscore.test') || email.endsWith('@test.com');
    if (isUatAccount && process.env.APP_ENV !== 'staging') {
      throw new UnauthorizedException('UAT accounts are only available in the staging environment.');
    }

    const user = await this.prisma.user.findUnique({ where: { email } });

    // Always verify to prevent timing-based username enumeration
    const dummyHash =
      '$argon2id$v=19$m=65536,t=3,p=4$smznMLgcKerVajiGV89MsA$J2DPNjivEImduv8925TsGRscrHl5OS93kIAidw52eHc';
    const hash = user?.passwordHash ?? dummyHash;
    let isValid = false;
    try {
      isValid = await argon2.verify(hash, password, this.argon2Options);
    } catch (e) {
      // If hash is malformed (e.g. from E2E test seeding), verify throws. 
      // Treat as invalid.
      isValid = false;
    }

    if (!user || !isValid) {
      return null;
    }

    if (user.status !== UserStatus.ACTIVE && user.status !== UserStatus.PENDING_SETUP) {
      throw new UnauthorizedException('Account is not active. Contact your administrator.');
    }

    return { id: user.id, email: user.email, mustChangePassword: user.mustChangePassword };
  }

  /**
   * Issues an access + refresh token pair for a validated user.
   * Records the refresh token hash in the database.
   * Updates lastLoginAt.
   */
  async login(
    user: ValidatedUser,
    meta: { userAgent?: string; ipAddress?: string } = {},
  ): Promise<TokenPair> {
    const tokens = await this.issueTokenPair(user.id, user.email);

    // Store refresh token hash and update last login in one transaction
    const tokenHash = this.hashToken(tokens.refreshToken);
    const expiresAt = this.refreshTokenExpiryDate();

    await this.prisma.$transaction([
      this.prisma.refreshToken.create({
        data: {
          userId: user.id,
          tokenHash,
          expiresAt,
          userAgent: meta.userAgent,
          ipAddress: meta.ipAddress,
        },
      }),
      this.prisma.user.update({
        where: { id: user.id },
        data: { lastLoginAt: new Date() },
      }),
    ]);

    await this.audit.record({
      entityType: 'User',
      entityId: user.id,
      action: 'LOGIN',
      actorUserId: user.id,
    });

    return tokens;
  }

  /**
   * Validates a refresh token and issues a new token pair (rotation).
   * The old refresh token is revoked atomically.
   */
  async refresh(rawRefreshToken: string): Promise<TokenPair> {
    // Verify JWT signature and expiry first
    let payload: { sub: string; email: string };
    try {
      payload = this.jwtService.verify<{ sub: string; email: string }>(rawRefreshToken, {
        secret: this.config.getOrThrow<string>('jwt.refreshSecret'),
      });
    } catch {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    const tokenHash = this.hashToken(rawRefreshToken);

    // Find the stored token record
    const stored = await this.prisma.refreshToken.findUnique({ where: { tokenHash } });

    if (!stored || stored.revokedAt || stored.expiresAt < new Date()) {
      throw new UnauthorizedException('Refresh token is invalid or has been revoked');
    }

    if (stored.userId !== payload.sub) {
      // Token tampering attempt — revoke all tokens for this user
      await this.revokeAllUserTokens(payload.sub);
      throw new UnauthorizedException('Token mismatch detected. All sessions revoked.');
    }

    // Verify user is still active or pending setup
    const user = await this.prisma.user.findUnique({ where: { id: stored.userId } });
    if (!user || (user.status !== UserStatus.ACTIVE && user.status !== UserStatus.PENDING_SETUP)) {
      throw new UnauthorizedException('User account is not active');
    }

    // Issue new token pair and revoke old one atomically
    const newTokens = await this.issueTokenPair(user.id, user.email);
    const newHash = this.hashToken(newTokens.refreshToken);
    const newExpiry = this.refreshTokenExpiryDate();

    await this.prisma.$transaction([
      this.prisma.refreshToken.update({
        where: { id: stored.id },
        data: { revokedAt: new Date() },
      }),
      this.prisma.refreshToken.create({
        data: {
          userId: user.id,
          tokenHash: newHash,
          expiresAt: newExpiry,
          userAgent: stored.userAgent,
          ipAddress: stored.ipAddress,
        },
      }),
    ]);

    return newTokens;
  }

  /**
   * Revokes a specific refresh token (logout from current session).
   */
  async logout(rawRefreshToken: string, actorUserId: string): Promise<void> {
    const tokenHash = this.hashToken(rawRefreshToken);
    const stored = await this.prisma.refreshToken.findUnique({ where: { tokenHash } });

    if (!stored || stored.revokedAt) {
      // Silently succeed — token already gone
      return;
    }

    if (stored.userId !== actorUserId) {
      throw new UnauthorizedException('Cannot revoke another user\'s token');
    }

    await this.prisma.refreshToken.update({
      where: { id: stored.id },
      data: { revokedAt: new Date() },
    });

    await this.audit.record({
      entityType: 'User',
      entityId: actorUserId,
      action: 'LOGOUT',
      actorUserId,
    });
  }

  /**
   * Revokes ALL active refresh tokens for a user.
   * Called on password change or security breach detection.
   */
  async revokeAllUserTokens(userId: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  // ─── Private helpers ───────────────────────────────────────────────────────

  private async issueTokenPair(userId: string, email: string): Promise<TokenPair> {
    const payload = { sub: userId, email, jti: crypto.randomUUID() };

    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(payload, {
        secret: this.config.getOrThrow<string>('jwt.accessSecret'),
        expiresIn: this.config.get<string>('jwt.accessExpiresIn') ?? '15m',
      }),
      this.jwtService.signAsync(payload, {
        secret: this.config.getOrThrow<string>('jwt.refreshSecret'),
        expiresIn: this.config.get<string>('jwt.refreshExpiresIn') ?? '7d',
      }),
    ]);

    return { accessToken, refreshToken };
  }

  private hashToken(rawToken: string): string {
    return crypto.createHash('sha256').update(rawToken).digest('hex');
  }

  private refreshTokenExpiryDate(): Date {
    const expiresIn = this.config.get<string>('jwt.refreshExpiresIn') ?? '7d';
    const days = parseInt(expiresIn.replace('d', ''), 10);
    const expiry = new Date();
    expiry.setDate(expiry.getDate() + days);
    return expiry;
  }
}
