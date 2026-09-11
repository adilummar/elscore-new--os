import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Inject, Injectable } from '@nestjs/common';
import { UserStatus } from '@prisma/client';
import type { Cache } from 'cache-manager';

import { PrismaService } from '../../prisma/prisma.service';

const USER_STATUS_TTL_MS = 30 * 1000; // 30 seconds — short enough to enforce prompt suspension
const USER_STATUS_KEY = (userId: string) => `user:status:${userId}`;

/**
 * UserStatusCacheService — provides fast account-status lookups for JwtStrategy.
 *
 * Why this service exists (R-1):
 *   JwtStrategy validates every incoming request. Without a status check, a
 *   suspended or terminated user remains fully authenticated until their 15-minute
 *   access token expires.
 *
 * Design:
 *   - Redis-backed cache with a 30-second TTL.
 *   - 30 seconds is the maximum delay between an account being suspended and
 *     the system enforcing that suspension on active requests.
 *   - Cache failure is non-fatal: falls back to a direct DB lookup.
 *   - Invalidated explicitly when user status changes.
 *
 * Usage:
 *   Inject into JwtStrategy to perform an async status check on each token validation.
 */
@Injectable()
export class UserStatusCacheService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(CACHE_MANAGER) private readonly cache: Cache,
  ) {}

  /**
   * Returns the current UserStatus and mustChangePassword flag for the given user ID.
   * Uses Redis cache (30-second TTL) → falls back to DB on miss/error.
   * Returns null if the user does not exist.
   */
  async getStatus(userId: string): Promise<{ status: UserStatus; mustChangePassword: boolean } | null> {
    const cacheKey = USER_STATUS_KEY(userId);

    const cached = await this.cache.get<{ status: UserStatus; mustChangePassword: boolean }>(cacheKey).catch(() => null);
    if (cached) {
      return cached;
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { status: true, mustChangePassword: true },
    });

    if (!user) {
      return null;
    }

    const valueToCache = { status: user.status, mustChangePassword: user.mustChangePassword };

    await this.cache.set(cacheKey, valueToCache, USER_STATUS_TTL_MS).catch(() => {
      // Cache write failure is non-fatal
    });

    return valueToCache;
  }

  /**
   * Explicitly invalidates the status cache for a user.
   * Must be called when a user's status changes (suspend, activate, deactivate).
   */
  async invalidate(userId: string): Promise<void> {
    await this.cache.del(USER_STATUS_KEY(userId)).catch(() => {
      // Non-fatal
    });
  }
}
