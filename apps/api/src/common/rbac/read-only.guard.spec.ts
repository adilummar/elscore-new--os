import { ExecutionContext, ForbiddenException } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';

import { ReadOnlyGuard } from './read-only.guard';

function contextFor(request: Record<string, unknown>): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => request }),
  } as ExecutionContext;
}

describe('ReadOnlyGuard student deletion', () => {
  it('denies a Co-Founder delete', async () => {
    const prisma = {
      userRole: {
        findMany: jest.fn().mockResolvedValue([{ role: { code: 'CO_FOUNDER' } }]),
      },
    } as unknown as PrismaService;
    const guard = new ReadOnlyGuard(prisma);

    await expect(
      guard.canActivate(contextFor({ method: 'DELETE', user: { id: 'cofounder-1' } })),
    ).rejects.toThrow(ForbiddenException);
  });

  it('denies a non-CEO God View mutation', async () => {
    const prisma = {
      userRole: { findMany: jest.fn().mockResolvedValue([]) },
    } as unknown as PrismaService;
    const guard = new ReadOnlyGuard(prisma);

    await expect(
      guard.canActivate(contextFor({
        method: 'DELETE',
        user: { id: 'head-1' },
        isGodViewReadOnly: true,
      })),
    ).rejects.toThrow(ForbiddenException);
  });

  it('allows a CEO God View mutation to reach the permission check', async () => {
    const prisma = {
      userRole: { findMany: jest.fn().mockResolvedValue([{ role: { code: 'SALES_HEAD' } }]) },
    } as unknown as PrismaService;
    const guard = new ReadOnlyGuard(prisma);

    await expect(
      guard.canActivate(contextFor({
        method: 'DELETE',
        user: { id: 'head-1' },
        isGodViewReadOnly: false,
      })),
    ).resolves.toBe(true);
  });
});
