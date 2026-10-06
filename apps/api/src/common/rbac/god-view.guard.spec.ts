import { ExecutionContext, ForbiddenException } from '@nestjs/common';

import { AuditContext } from '../audit/audit.context';
import { PrismaService } from '../prisma/prisma.service';

import { GodViewGuard } from './god-view.guard';
import { RbacService } from './rbac.service';

function contextFor(request: Record<string, unknown>): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => request }),
  } as ExecutionContext;
}

describe('GodViewGuard mutation access', () => {
  const target = { id: 'head-1', email: 'head@example.com', status: 'ACTIVE' };

  function guardFor(permissions: string[], isCeo = false) {
    const rbacService = {
      getPermissionsForUser: jest.fn().mockResolvedValue(new Set(permissions)),
    } as unknown as RbacService;
    const prisma = {
      user: { findUnique: jest.fn().mockResolvedValue(target) },
      userRole: { findFirst: jest.fn().mockResolvedValue(isCeo ? { userId: 'ceo-1' } : null) },
    } as unknown as PrismaService;
    return new GodViewGuard(rbacService, prisma);
  }

  it('marks a non-CEO God View session read-only', async () => {
    const request: Record<string, unknown> = {
      user: { id: 'manager-1', email: 'manager@example.com' },
      headers: { 'x-god-view-target': 'head-1' },
      method: 'DELETE',
    };

    await AuditContext.run({}, async () => {
      await guardFor(['god-view.enter']).canActivate(contextFor(request));
      expect(AuditContext.getStore()).toEqual({ realActorId: 'manager-1', isGodView: true });
    });

    expect(request.isGodViewReadOnly).toBe(true);
    expect((request.user as { id: string }).id).toBe('head-1');
  });

  it('lets a CEO God View session remain mutable and records the real actor', async () => {
    const request: Record<string, unknown> = {
      user: { id: 'ceo-1', email: 'ceo@example.com' },
      headers: { 'x-god-view-target': 'head-1' },
      method: 'DELETE',
    };

    await AuditContext.run({}, async () => {
      await guardFor(['analytics.ceo.read'], true).canActivate(contextFor(request));
      expect(AuditContext.getStore()).toEqual({ realActorId: 'ceo-1', isGodView: true });
    });

    expect(request.isGodViewReadOnly).toBeUndefined();
    expect((request.user as { id: string }).id).toBe('head-1');
  });

  it('does not let a Sales Counsellor use a target id to bypass lead ownership', async () => {
    const request = {
      user: { id: 'counsellor-a', email: 'a@example.com' },
      headers: { 'x-god-view-target': 'counsellor-b' },
      method: 'GET',
    };

    await expect(
      guardFor(['lead.read', 'lead.update']).canActivate(contextFor(request)),
    ).rejects.toThrow(ForbiddenException);
    expect(request.user.id).toBe('counsellor-a');
  });

  it('rejects God View from a user who cannot enter it', async () => {
    const request = {
      user: { id: 'counsellor-1', email: 'counsellor@example.com' },
      headers: { 'x-god-view-target': 'head-1' },
      method: 'DELETE',
    };

    await expect(guardFor(['student.read']).canActivate(contextFor(request))).rejects.toThrow(ForbiddenException);
  });

  it('keeps a Co-Founder-style analytics viewer read-only in God View', async () => {
    const request: Record<string, unknown> = {
      user: { id: 'cofounder-1', email: 'cofounder@example.com' },
      headers: { 'x-god-view-target': 'head-1' },
      method: 'POST',
    };

    await guardFor(['analytics.ceo.read']).canActivate(contextFor(request));

    expect(request.isGodViewReadOnly).toBe(true);
  });
});
