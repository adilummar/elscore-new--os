import { UnauthorizedException } from '@nestjs/common';
import { UserStatus } from '@prisma/client';

import { UserStatusCacheService } from '../services/user-status-cache.service';

import { JwtStrategy } from './jwt.strategy';

// ─── Minimal mocks ────────────────────────────────────────────────────────────

const mockConfigService = {
  getOrThrow: jest.fn().mockReturnValue('test-access-secret'),
};

const mockUserStatusCacheService: jest.Mocked<
  Pick<UserStatusCacheService, 'getStatus' | 'invalidate'>
> = {
  getStatus: jest.fn(),
  invalidate: jest.fn(),
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeStrategy(): JwtStrategy {
  return new JwtStrategy(
    mockConfigService as any,
    mockUserStatusCacheService as any,
  );
}

const VALID_PAYLOAD = { sub: 'user-uuid-123', email: 'test@example.com' };

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('JwtStrategy', () => {
  let strategy: JwtStrategy;

  beforeEach(() => {
    jest.clearAllMocks();
    strategy = makeStrategy();
  });

  /**
   * R-1 Test 1: ACTIVE user → allowed
   * A valid JWT for an ACTIVE account must succeed and return RequestUser.
   */
  it('allows an ACTIVE user through', async () => {
    mockUserStatusCacheService.getStatus.mockResolvedValueOnce({ status: UserStatus.ACTIVE, mustChangePassword: false });

    const result = await strategy.validate(VALID_PAYLOAD);

    expect(result).toEqual({ id: VALID_PAYLOAD.sub, email: VALID_PAYLOAD.email, requiresPasswordChange: false });
    expect(mockUserStatusCacheService.getStatus).toHaveBeenCalledWith(VALID_PAYLOAD.sub);
  });

  /**
   * R-1 Test 2: INACTIVE user → 401
   * A valid JWT for a deactivated account must be rejected immediately.
   */
  it('rejects an INACTIVE user with 401', async () => {
    mockUserStatusCacheService.getStatus.mockResolvedValueOnce({ status: UserStatus.INACTIVE, mustChangePassword: false });

    await expect(strategy.validate(VALID_PAYLOAD)).rejects.toThrow(UnauthorizedException);
  });

  /**
   * R-1 Test 3: SUSPENDED user → 401
   * A valid JWT for a suspended account must be rejected immediately.
   */
  it('rejects a SUSPENDED user with 401', async () => {
    mockUserStatusCacheService.getStatus.mockResolvedValueOnce({ status: UserStatus.SUSPENDED, mustChangePassword: false });

    await expect(strategy.validate(VALID_PAYLOAD)).rejects.toThrow(UnauthorizedException);
  });

  /**
   * R-1 Test 4: Valid JWT + status changed in DB → rejected
   * Even if the JWT signature is valid, if the account is no longer ACTIVE
   * the request must be blocked. Simulates: admin deactivates user, user's
   * existing 15-minute token is still in play.
   */
  it('rejects a user whose DB status changed to SUSPENDED after token issue', async () => {
    // Initially ACTIVE
    mockUserStatusCacheService.getStatus.mockResolvedValueOnce({ status: UserStatus.ACTIVE, mustChangePassword: false });
    const firstCall = await strategy.validate(VALID_PAYLOAD);
    expect(firstCall).toEqual({ id: VALID_PAYLOAD.sub, email: VALID_PAYLOAD.email, requiresPasswordChange: false });

    // Status changes server-side (cache invalidated, next check hits DB → SUSPENDED)
    mockUserStatusCacheService.getStatus.mockResolvedValueOnce({ status: UserStatus.SUSPENDED, mustChangePassword: false });
    await expect(strategy.validate(VALID_PAYLOAD)).rejects.toThrow(UnauthorizedException);
  });

  /**
   * R-1 Test 5: User deleted from DB (status null) → 401
   */
  it('rejects a token for a user that no longer exists in the DB', async () => {
    mockUserStatusCacheService.getStatus.mockResolvedValueOnce(null);

    await expect(strategy.validate(VALID_PAYLOAD)).rejects.toThrow(UnauthorizedException);
  });

  /**
   * R-1 Test 6: Invalid JWT payload (missing sub) → 401
   */
  it('rejects a payload with missing sub', async () => {
    await expect(
      strategy.validate({ sub: '', email: 'test@example.com' }),
    ).rejects.toThrow(UnauthorizedException);

    // Status service must NOT be called for malformed payloads
    expect(mockUserStatusCacheService.getStatus).not.toHaveBeenCalled();
  });

  /**
   * R-1 Test 7: PENDING_SETUP user → 401
   * Accounts not yet activated must also be blocked.
   */
  it('allows a PENDING_SETUP user through', async () => {
    mockUserStatusCacheService.getStatus.mockResolvedValueOnce({ status: UserStatus.PENDING_SETUP, mustChangePassword: true });

    const result = await strategy.validate(VALID_PAYLOAD);

    expect(result).toEqual({ id: VALID_PAYLOAD.sub, email: VALID_PAYLOAD.email, requiresPasswordChange: true });
    expect(mockUserStatusCacheService.getStatus).toHaveBeenCalledWith(VALID_PAYLOAD.sub);
  });
});
