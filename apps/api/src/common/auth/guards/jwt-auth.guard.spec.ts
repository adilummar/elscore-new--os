import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

import { JwtAuthGuard } from './jwt-auth.guard';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeReflector(isPublic: boolean): Reflector {
  return {
    getAllAndOverride: jest.fn().mockReturnValue(isPublic),
  } as unknown as Reflector;
}

function makeContext(): ExecutionContext {
  return {
    getHandler: jest.fn().mockReturnValue({}),
    getClass: jest.fn().mockReturnValue({}),
    switchToHttp: jest.fn().mockReturnValue({
      getRequest: jest.fn().mockReturnValue({
        headers: { authorization: 'Bearer test-token' },
      }),
    }),
  } as unknown as ExecutionContext;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('JwtAuthGuard', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  /**
   * Test 1: @Public() routes bypass the guard entirely
   */
  it('allows @Public() routes through without token validation', () => {
    const reflector = makeReflector(true);
    const guard = new JwtAuthGuard(reflector);
    const context = makeContext();

    const result = guard.canActivate(context);

    expect(result).toBe(true);
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(reflector.getAllAndOverride).toHaveBeenCalledWith(IS_PUBLIC_KEY, [
      expect.anything(),
      expect.anything(),
    ]);
  });

  /**
   * Test 2: Non-public routes delegate to Passport JWT strategy
   */
  it('delegates to Passport JWT for non-public routes', () => {
    const reflector = makeReflector(false);
    const guard = new JwtAuthGuard(reflector);
    const context = makeContext();

    const superCanActivate = jest
      .spyOn(Object.getPrototypeOf(JwtAuthGuard.prototype) as { canActivate: () => boolean }, 'canActivate')
      .mockReturnValue(true);

    void guard.canActivate(context);

    expect(superCanActivate).toHaveBeenCalledWith(context);
  });

  /**
   * Test 3: @Public() metadata is read from both handler and class
   */
  it('reads IS_PUBLIC_KEY from both handler and class metadata', () => {
    const reflector = makeReflector(false);
    const guard = new JwtAuthGuard(reflector);
    const handler = jest.fn();
    const clazz = jest.fn();
    const context = {
      getHandler: jest.fn().mockReturnValue(handler),
      getClass: jest.fn().mockReturnValue(clazz),
    } as unknown as ExecutionContext;

    jest
      .spyOn(Object.getPrototypeOf(JwtAuthGuard.prototype) as { canActivate: () => boolean }, 'canActivate')
      .mockReturnValue(false);

    void guard.canActivate(context);

    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(reflector.getAllAndOverride).toHaveBeenCalledWith(IS_PUBLIC_KEY, [handler, clazz]);
  });

  /**
   * Test 4: Expired/invalid token — super.canActivate() rejects
   */
  it('propagates UnauthorizedException from passport when token is invalid', async () => {
    const reflector = makeReflector(false);
    const guard = new JwtAuthGuard(reflector);
    const context = makeContext();

    jest
      .spyOn(Object.getPrototypeOf(JwtAuthGuard.prototype) as { canActivate: () => Promise<boolean> }, 'canActivate')
      .mockRejectedValue(new UnauthorizedException('Invalid token'));

    await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException);
  });
});
