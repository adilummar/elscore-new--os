import { ServiceUnavailableException } from '@nestjs/common';

import { RbacService } from './rbac.service';

// ─── Minimal mocks ────────────────────────────────────────────────────────────

const mockPrisma = {
  userRole: {
    findMany: jest.fn(),
  },
  userPermission: {
    findMany: jest.fn(),
  },
};

const mockCache = {
  get: jest.fn(),
  set: jest.fn(),
  del: jest.fn(),
};

function makeService(): RbacService {
  return new RbacService(mockPrisma as any, mockCache as any);
}

// Stub user roles returned by the DB
const makeUserRoleStub = (userId: string, permissionCodes: string[]) => ({
  userId,
  roleId: 'role-uuid',
  role: {
    permissions: permissionCodes.map((code) => ({
      permission: { code },
    })),
  },
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('RbacService', () => {
  let service: RbacService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = makeService();
    // Default: cache miss
    mockCache.get.mockResolvedValue(null);
    mockCache.set.mockResolvedValue(undefined);
    mockCache.del.mockResolvedValue(undefined);
    mockPrisma.userPermission.findMany.mockResolvedValue([]);
  });

  // ─── User-level invalidation ───────────────────────────────────────────────

  /**
   * User-level Test 1: Successful invalidation
   */
  it('invalidateCache: deletes the correct cache key for the user', async () => {
    await service.invalidateCache('user-a');
    expect(mockCache.del).toHaveBeenCalledWith('rbac:perms:user-a');
  });

  /**
   * User-level Test 2: Cache failure is non-fatal (STANDARD security level)
   * User-level invalidation stays non-fatal to preserve availability.
   * Logged as warning — tested via the service not throwing.
   */
  it('invalidateCache: is non-fatal when cache deletion fails (STANDARD security level)', async () => {
    mockCache.del.mockRejectedValueOnce(new Error('Redis unavailable'));

    // Must NOT throw — this is a STANDARD security level operation
    await expect(service.invalidateCache('user-a')).resolves.not.toThrow();
  });

  // ─── Role-level invalidation ───────────────────────────────────────────────

  /**
   * Role-level Test 1: All users for the role are invalidated
   */
  it('invalidateCacheForRole: invalidates all users holding the role', async () => {
    const roleId = 'role-sales-counsellor';
    mockPrisma.userRole.findMany.mockResolvedValueOnce([
      { userId: 'user-1' },
      { userId: 'user-2' },
      { userId: 'user-3' },
    ]);

    await service.invalidateCacheForRole(roleId);

    expect(mockPrisma.userRole.findMany).toHaveBeenCalledWith({
      where: { roleId },
      select: { userId: true },
    });
    expect(mockCache.del).toHaveBeenCalledWith('rbac:perms:user-1');
    expect(mockCache.del).toHaveBeenCalledWith('rbac:perms:user-2');
    expect(mockCache.del).toHaveBeenCalledWith('rbac:perms:user-3');
    expect(mockCache.del).toHaveBeenCalledTimes(3);
  });

  /**
   * Role-level Test 2: PRIVILEGED — partial cache failure throws ServiceUnavailableException
   *
   * Security contract: changing role permissions affects many users simultaneously.
   * Silent failure on ANY cache deletion is unacceptable for privileged operations
   * (e.g. revoking payment.verify from a role).
   * The caller must know the operation did not fully succeed.
   */
  it('invalidateCacheForRole: THROWS ServiceUnavailableException when any cache deletion fails', async () => {
    mockPrisma.userRole.findMany.mockResolvedValueOnce([
      { userId: 'user-1' },
      { userId: 'user-2' },
    ]);

    // user-1 succeeds, user-2 fails
    mockCache.del
      .mockResolvedValueOnce(undefined)                        // user-1 OK
      .mockRejectedValueOnce(new Error('Redis connection lost')); // user-2 FAIL

    await expect(service.invalidateCacheForRole('role-id')).rejects.toThrow(
      ServiceUnavailableException,
    );
  });

  /**
   * Role-level Test 3: PRIVILEGED — all cache deletions fail → throws
   */
  it('invalidateCacheForRole: throws when ALL cache deletions fail', async () => {
    mockPrisma.userRole.findMany.mockResolvedValueOnce([
      { userId: 'user-1' },
      { userId: 'user-2' },
    ]);

    mockCache.del.mockRejectedValue(new Error('Redis down'));

    await expect(service.invalidateCacheForRole('role-id')).rejects.toThrow(
      ServiceUnavailableException,
    );
  });

  /**
   * Role-level Test 4: Unrelated users are not affected
   */
  it('invalidateCacheForRole: does not touch users of other roles', async () => {
    const affectedRoleId = 'role-sales';
    mockPrisma.userRole.findMany.mockResolvedValueOnce([{ userId: 'user-sales-1' }]);

    await service.invalidateCacheForRole(affectedRoleId);

    const delCalls = mockCache.del.mock.calls.map(([key]: [string]) => key);
    expect(delCalls).not.toContain('rbac:perms:user-finance');
  });

  /**
   * Role-level Test 5: Role with no users assigned — no cache ops, no error
   */
  it('invalidateCacheForRole: no-op and no error when role has no assigned users', async () => {
    mockPrisma.userRole.findMany.mockResolvedValueOnce([]);

    await expect(service.invalidateCacheForRole('empty-role')).resolves.not.toThrow();
    expect(mockCache.del).not.toHaveBeenCalled();
  });

  /**
   * Role-level Test 6: Error message mentions the role and failure count
   * The error message should be informative enough for an operator to act on.
   */
  it('invalidateCacheForRole: thrown error message contains actionable context', async () => {
    mockPrisma.userRole.findMany.mockResolvedValueOnce([{ userId: 'user-1' }]);
    mockCache.del.mockRejectedValueOnce(new Error('Timeout'));

    let caughtError: ServiceUnavailableException | undefined;
    try {
      await service.invalidateCacheForRole('role-finance');
    } catch (err) {
      caughtError = err as ServiceUnavailableException;
    }

    expect(caughtError).toBeInstanceOf(ServiceUnavailableException);
    expect(caughtError?.message).toContain('Permission cache invalidation failed');
  });

  // ─── Permission resolution ─────────────────────────────────────────────────

  it('getPermissionsForUser: returns permissions from cache on cache hit', async () => {
    mockCache.get.mockResolvedValueOnce(['lead.read', 'lead.create']);

    const perms = await service.getPermissionsForUser('user-a');

    expect(perms).toEqual(new Set(['lead.read', 'lead.create']));
    expect(mockPrisma.userRole.findMany).not.toHaveBeenCalled();
  });

  it('getPermissionsForUser: queries DB and caches on cache miss', async () => {
    mockCache.get.mockResolvedValueOnce(null);
    mockPrisma.userRole.findMany.mockResolvedValueOnce([
      makeUserRoleStub('user-a', ['lead.read', 'lead.create']),
    ]);

    const perms = await service.getPermissionsForUser('user-a');

    expect(perms).toEqual(new Set(['lead.read', 'lead.create']));
    expect(mockCache.set).toHaveBeenCalled();
  });

  it('getPermissionsForUser: returns empty set for user with no roles', async () => {
    mockPrisma.userRole.findMany.mockResolvedValueOnce([]);
    const perms = await service.getPermissionsForUser('user-no-roles');
    expect(perms.size).toBe(0);
  });

  it('getPermissionsForUser: deduplicates permissions held across multiple roles', async () => {
    mockPrisma.userRole.findMany.mockResolvedValueOnce([
      makeUserRoleStub('user-a', ['lead.read', 'employee.read']),
      makeUserRoleStub('user-a', ['lead.read', 'lead.create']),
    ]);

    const perms = await service.getPermissionsForUser('user-a');
    expect(perms).toEqual(new Set(['lead.read', 'employee.read', 'lead.create']));
  });

  it('getPermissionsForUser: cache write failure is non-fatal — permissions still returned', async () => {
    mockCache.get.mockResolvedValueOnce(null);
    mockCache.set.mockRejectedValueOnce(new Error('Cache write failed'));
    mockPrisma.userRole.findMany.mockResolvedValueOnce([
      makeUserRoleStub('user-a', ['lead.read']),
    ]);

    // Must still return permissions even if caching fails
    const perms = await service.getPermissionsForUser('user-a');
    expect(perms).toEqual(new Set(['lead.read']));
  });
});
