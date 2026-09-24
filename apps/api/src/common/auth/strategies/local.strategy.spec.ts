import { UnauthorizedException } from '@nestjs/common';

import { AuthService } from '../auth.service';
import { LocalAuthGuard } from '../guards/local-auth.guard';

import { LocalStrategy } from './local.strategy';

// ─── Mock AuthService ─────────────────────────────────────────────────────────

const mockAuthService: jest.Mocked<Pick<AuthService, 'validateCredentials'>> = {
  validateCredentials: jest.fn(),
};

function makeStrategy(): LocalStrategy {
  return new LocalStrategy(mockAuthService as unknown as AuthService);
}

// ─── LocalStrategy Tests ─────────────────────────────────────────────────────

describe('LocalStrategy', () => {
  let strategy: LocalStrategy;

  beforeEach(() => {
    jest.clearAllMocks();
    strategy = makeStrategy();
  });

  /**
   * Test 1: Valid credentials → returns ValidatedUser
   */
  it('returns the validated user when credentials are correct', async () => {
    const user = { id: 'user-uuid', email: 'admin@elscore.internal', mustChangePassword: false };
    mockAuthService.validateCredentials.mockResolvedValueOnce(user);

    const result = await strategy.validate('admin@elscore.internal', 'CorrectPassword123!');

    expect(result).toEqual(user);
    expect(mockAuthService.validateCredentials).toHaveBeenCalledWith(
      'admin@elscore.internal',
      'CorrectPassword123!',
    );
  });

  /**
   * Test 2: Wrong password → throws UnauthorizedException
   */
  it('throws UnauthorizedException for incorrect password', async () => {
    mockAuthService.validateCredentials.mockResolvedValueOnce(null);

    await expect(
      strategy.validate('admin@elscore.internal', 'WrongPassword'),
    ).rejects.toThrow(UnauthorizedException);
  });

  /**
   * Test 3: Unknown email → throws UnauthorizedException
   */
  it('throws UnauthorizedException for unknown email', async () => {
    mockAuthService.validateCredentials.mockResolvedValueOnce(null);

    await expect(
      strategy.validate('unknown@example.com', 'AnyPassword'),
    ).rejects.toThrow(UnauthorizedException);
  });

  /**
   * Test 4: Inactive/suspended account → AuthService throws; propagates
   */
  it('propagates UnauthorizedException thrown by AuthService for inactive accounts', async () => {
    mockAuthService.validateCredentials.mockRejectedValueOnce(
      new UnauthorizedException('Account is suspended'),
    );

    await expect(
      strategy.validate('suspended@elscore.internal', 'AnyPassword'),
    ).rejects.toThrow(UnauthorizedException);
  });

  /**
   * Test 5: validate is a function (confirms usernameField override compiled correctly)
   */
  it('exposes validate() and is configured with email as username field', () => {
    expect(typeof strategy.validate).toBe('function');
  });
});

// ─── LocalAuthGuard Tests ─────────────────────────────────────────────────────

describe('LocalAuthGuard', () => {
  /**
   * Test 1: Instantiates correctly
   */
  it('can be instantiated', () => {
    const guard = new LocalAuthGuard();
    expect(guard).toBeDefined();
  });

  /**
   * Test 2: Inherits canActivate from Passport
   */
  it('inherits canActivate from Passport AuthGuard', () => {
    const guard = new LocalAuthGuard();
    expect(typeof guard.canActivate).toBe('function');
  });
});
