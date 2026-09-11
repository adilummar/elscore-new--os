import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { RbacGuard } from './rbac.guard';
import { RbacService } from './rbac.service';

describe('RbacGuard', () => {
  let guard: RbacGuard;
  let reflector: jest.Mocked<Reflector>;
  let rbacService: jest.Mocked<RbacService>;

  beforeEach(() => {
    reflector = {
      getAllAndOverride: jest.fn(),
    } as any;

    rbacService = {
      hasPermissions: jest.fn(),
    } as any;

    guard = new RbacGuard(reflector, rbacService);
  });

  const createMockContext = (user: any) =>
    ({
      getHandler: jest.fn(),
      getClass: jest.fn(),
      switchToHttp: () => ({
        getRequest: () => ({
          user,
        }),
      }),
    }) as unknown as ExecutionContext;

  it('allows access if no permissions are required', async () => {
    reflector.getAllAndOverride.mockReturnValue(undefined);
    const context = createMockContext({ id: 'user-1' });

    const result = await guard.canActivate(context);

    expect(result).toBe(true);
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(rbacService.hasPermissions).not.toHaveBeenCalled();
  });

  it('throws ForbiddenException if user identity is missing', async () => {
    reflector.getAllAndOverride.mockReturnValue(['some.permission']);
    const context = createMockContext(undefined);

    await expect(guard.canActivate(context)).rejects.toThrow(ForbiddenException);
  });

  describe('Multiple permissions (e.g. user.create and employee.create)', () => {
    const requiredPerms = ['user.create', 'employee.create'];

    it('allows access if actor has BOTH permissions', async () => {
      reflector.getAllAndOverride.mockReturnValue(requiredPerms);
      const context = createMockContext({ id: 'user-1' });
      
      // Simulate hasPermissions returning true ONLY if all required are present
      rbacService.hasPermissions.mockImplementation((userId, reqs) => {
        // actor has both
        const actorPerms = new Set(['user.create', 'employee.create']);
        return Promise.resolve(reqs.every(r => actorPerms.has(r)));
      });

      const result = await guard.canActivate(context);
      expect(result).toBe(true);
    });

    it('denies access if actor has ONLY user.create', async () => {
      reflector.getAllAndOverride.mockReturnValue(requiredPerms);
      const context = createMockContext({ id: 'user-1' });
      
      rbacService.hasPermissions.mockImplementation((userId, reqs) => {
        const actorPerms = new Set(['user.create']);
        return Promise.resolve(reqs.every(r => actorPerms.has(r)));
      });

      await expect(guard.canActivate(context)).rejects.toThrow(ForbiddenException);
    });

    it('denies access if actor has ONLY employee.create', async () => {
      reflector.getAllAndOverride.mockReturnValue(requiredPerms);
      const context = createMockContext({ id: 'user-1' });
      
      rbacService.hasPermissions.mockImplementation((userId, reqs) => {
        const actorPerms = new Set(['employee.create']);
        return Promise.resolve(reqs.every(r => actorPerms.has(r)));
      });

      await expect(guard.canActivate(context)).rejects.toThrow(ForbiddenException);
    });

    it('denies access if actor has NEITHER', async () => {
      reflector.getAllAndOverride.mockReturnValue(requiredPerms);
      const context = createMockContext({ id: 'user-1' });
      
      rbacService.hasPermissions.mockImplementation((userId, reqs) => {
        const actorPerms = new Set(['some.other.permission']);
        return Promise.resolve(reqs.every(r => actorPerms.has(r)));
      });

      await expect(guard.canActivate(context)).rejects.toThrow(ForbiddenException);
    });
  });
});
