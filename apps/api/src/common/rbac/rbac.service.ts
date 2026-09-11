import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Inject, Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import type { Cache } from 'cache-manager';

import { PrismaService } from '../prisma/prisma.service';

const RBAC_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const RBAC_CACHE_KEY = (userId: string) => `rbac:perms:${userId}`;

/**
 * RbacService — resolves a user's effective permissions.
 *
 * Permissions are resolved from TWO sources (Phase 1 update):
 *   1. Role-based: user_roles → roles → role_permissions → permissions
 *   2. Direct grants: user_permissions (where revoked_at IS NULL)
 *
 * The effective permission set is the UNION of both sources.
 *
 * Results are cached in Redis (via CacheManager) for RBAC_CACHE_TTL_MS to avoid
 * a DB query on every request. Cache is invalidated explicitly when either source changes.
 *
 * ─── CACHE INVALIDATION SECURITY POLICY ─────────────────────────────────────
 *
 * Permission revocation is security-sensitive. If a user's elevated permissions
 * are not revoked promptly from cache, they may continue to access resources
 * they are no longer authorised to access — for up to RBAC_CACHE_TTL_MS (5 min).
 *
 * TWO TIERS OF INVALIDATION:
 *
 *   invalidateCache(userId) — user role assignment change OR direct grant change
 *     Security level: STANDARD
 *     On cache failure: logs a warning. Non-fatal for availability.
 *     Rationale: role assignment and duty delegation are rare operations;
 *     the 5-minute window is an accepted tradeoff. Logged prominently for observability.
 *
 *   invalidateCacheForRole(roleId) — role permission set change
 *     Security level: PRIVILEGED
 *     On cache failure: THROWS ServiceUnavailableException.
 *     Rationale: changing permissions on a role affects potentially many users
 *     simultaneously. Silent failure here could mean a revoked privileged permission
 *     (e.g. payment.verify, finance.read) remains in cache for every holder of
 *     that role. This is unacceptable. The caller must know the operation failed.
 *
 * OPERATIONAL NOTE:
 *   If invalidateCacheForRole fails in a critical path, the operator should:
 *     1. Fix the Redis connectivity issue.
 *     2. Retry the role-permission change.
 *   Alternatively, a Redis FLUSHDB on the cache keyspace will clear all caches,
 *   forcing all users back to DB lookups within seconds.
 *
 * Record-scope enforcement is NOT the responsibility of this service.
 * Field-level privacy enforcement is NOT the responsibility of this service.
 */
@Injectable()
export class RbacService {
  private readonly logger = new Logger(RbacService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(CACHE_MANAGER) private readonly cache: Cache,
  ) {}

  /**
   * Returns the full set of permission codes held by a user.
   *
   * Sources (Phase 1):
   *   1. Role-based permissions (user_roles → roles → role_permissions → permissions)
   *   2. Active direct grants (user_permissions where revoked_at IS NULL)
   *
   * The effective set is the UNION of both. Uses Redis cache; falls back to DB on miss.
   *
   * Call invalidateCache(userId) whenever a UserRole OR UserPermission record
   * is created or revoked for this user.
   */
  async getPermissionsForUser(userId: string): Promise<Set<string>> {
    const cacheKey = RBAC_CACHE_KEY(userId);

    // Try cache first
    const cached = await this.cache.get<string[]>(cacheKey).catch(() => null);
    if (cached) {
      return new Set(cached);
    }

    // Source 1: role-based permissions
    const userRoles = await this.prisma.userRole.findMany({
      where: { userId },
      include: {
        role: {
          include: {
            permissions: {
              include: { permission: true },
            },
          },
        },
      },
    });

    const permissions = new Set<string>();
    for (const ur of userRoles) {
      for (const rp of ur.role.permissions) {
        permissions.add(rp.permission.code);
      }
    }

    // Source 2: active direct grants (HR duty delegation)
    const directGrants = await this.prisma.userPermission.findMany({
      where: { userId, revokedAt: null },
      include: { permission: true },
    });
    for (const dg of directGrants) {
      permissions.add(dg.permission.code);
    }

    // Cache the merged result (non-fatal on failure — will retry on next request)
    await this.cache.set(cacheKey, Array.from(permissions), RBAC_CACHE_TTL_MS).catch((err: unknown) => {
      this.logger.warn(
        `[RBAC] Cache write failed for user ${userId}. Continuing without caching. Error: ${String(err)}`,
      );
    });

    return permissions;
  }

  /**
   * Checks if a user holds ALL of the specified permissions.
   */
  async hasPermissions(userId: string, requiredPermissions: string[]): Promise<boolean> {
    // 1. Get all permissions the user currently holds (from cache or DB)
    const userPerms = await this.getPermissionsForUser(userId);

    // 2. Check if the user's set of permissions has every required permission
    return requiredPermissions.every((p) => userPerms.has(p));
  }

  /**
   * Invalidates the permission cache for a single user.
   *
   * SECURITY LEVEL: STANDARD
   *   A failure is logged as a warning but is non-fatal.
   *   The stale cache will expire within RBAC_CACHE_TTL_MS (5 minutes).
   *   This is an accepted tradeoff for availability on user-level changes.
   *
   * Call this when:
   *   - A role is assigned to or removed from this user.
   *   - The user's identity changes in a way that may affect permissions.
   */
  async invalidateCache(userId: string): Promise<void> {
    await this.cache.del(RBAC_CACHE_KEY(userId)).catch((err: unknown) => {
      // WARNING — this user may retain stale permissions for up to RBAC_CACHE_TTL_MS.
      // Log so that operations teams can detect and respond to Redis issues.
      this.logger.warn(
        `[RBAC] SECURITY WARNING: Failed to invalidate permission cache for user ${userId}. ` +
        `User may retain stale permissions for up to ${RBAC_CACHE_TTL_MS / 1000}s. ` +
        `Error: ${String(err)}`,
      );
    });
  }

  /**
   * R-2: Invalidates permission caches for ALL users assigned to the given role.
   *
   * SECURITY LEVEL: PRIVILEGED — THROWS ON CACHE FAILURE
   *
   *   Changing permissions on a role is a privileged administrative operation.
   *   Failure to invalidate cache means affected users retain the old (now-incorrect)
   *   permission set for up to RBAC_CACHE_TTL_MS. For permission revocations
   *   (e.g. removing payment.verify from a role), this is a security gap.
   *
   *   Therefore: if any cache deletion fails, this method throws
   *   ServiceUnavailableException so the caller knows the operation did not
   *   fully succeed and must be retried.
   *
   * Call this when:
   *   - A permission is added to a role.
   *   - A permission is removed from a role.
   *
   * Performance note: at 2,000+ active users this is at most a few hundred
   * Redis DEL commands — negligible. If a role is held by thousands of users,
   * consider flushing by key pattern instead.
   *
   * @throws ServiceUnavailableException if one or more cache deletions fail.
   */
  async invalidateCacheForRole(roleId: string): Promise<void> {
    const userRoles = await this.prisma.userRole.findMany({
      where: { roleId },
      select: { userId: true },
    });

    if (userRoles.length === 0) {
      return;
    }

    const results = await Promise.allSettled(
      userRoles.map((ur) => this.cache.del(RBAC_CACHE_KEY(ur.userId))),
    );

    const failures = results
      .map((r, i) => ({ result: r, userId: userRoles[i].userId }))
      .filter(({ result }) => result.status === 'rejected');

    if (failures.length > 0) {
      const failedUserIds = failures.map(({ userId }) => userId).join(', ');
      const firstError = (failures[0].result as PromiseRejectedResult).reason;

      // Log at ERROR level — this is a security-sensitive failure
      this.logger.error(
        `[RBAC] SECURITY ERROR: Failed to invalidate permission cache for role ${roleId}. ` +
        `${failures.length}/${userRoles.length} user cache(s) NOT invalidated. ` +
        `Affected users: [${failedUserIds}]. ` +
        `These users may retain stale role permissions until cache expires. ` +
        `Fix Redis connectivity and retry the role-permission change. ` +
        `Error: ${String(firstError)}`,
      );

      throw new ServiceUnavailableException(
        'Permission cache invalidation failed. The role-permission change was not fully applied. ' +
        'Please retry the operation.',
      );
    }

    this.logger.log(
      `[RBAC] Permission cache invalidated for role ${roleId} — ${userRoles.length} user(s) affected.`,
    );
  }
}
