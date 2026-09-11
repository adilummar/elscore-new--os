import { ForbiddenException } from '@nestjs/common';

import { AuthorizationService } from './authorization.service';
import { gateField, includeIf } from './field-access.utils';
import { assertOwnershipOrBypass, isOwnerOrHasBypass } from './ownership.utils';
import { RbacService } from './rbac.service';

// ─── Mock RbacService ─────────────────────────────────────────────────────────

const mockRbacService: jest.Mocked<
  Pick<RbacService, 'hasPermissions' | 'getPermissionsForUser'>
> = {
  hasPermissions: jest.fn(),
  getPermissionsForUser: jest.fn(),
};

function makeService(): AuthorizationService {
  return new AuthorizationService(mockRbacService as any);
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('AuthorizationService', () => {
  let service: AuthorizationService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = makeService();
  });

  // ─── R-3 Test 1: Authorized record access ───────────────────────────────────

  it('permits access when actor owns the resource', async () => {
    const actorId = 'user-counsellor-1';
    const resourceOwnerId = 'user-counsellor-1'; // same → owner

    // No bypass needed — ownership passes directly
    mockRbacService.hasPermissions.mockResolvedValue(false); // bypass not held

    await expect(
      service.assertOwnership({ resourceOwnerId, actorId }),
    ).resolves.not.toThrow();
  });

  it('permits access when actor holds bypass permission (e.g. Sales Head)', async () => {
    const actorId = 'user-sales-head';
    const resourceOwnerId = 'user-counsellor-2'; // different user owns the lead

    mockRbacService.hasPermissions.mockResolvedValue(true); // bypass held

    await expect(
      service.assertOwnership({
        resourceOwnerId,
        actorId,
        bypassPermission: 'lead.read.all',
      }),
    ).resolves.not.toThrow();
  });

  // ─── R-3 Test 2: Unauthorized record access ──────────────────────────────────

  it('throws ForbiddenException when actor does not own resource and has no bypass', async () => {
    const actorId = 'user-counsellor-3';
    const resourceOwnerId = 'user-counsellor-4'; // different user

    mockRbacService.hasPermissions.mockResolvedValue(false); // no bypass

    await expect(
      service.assertOwnership({
        resourceOwnerId,
        actorId,
        bypassPermission: 'lead.read.all',
        errorMessage: 'You can only access your own leads',
      }),
    ).rejects.toThrow(ForbiddenException);
  });

  it('throws ForbiddenException when assertAnyPermission passes but no permissions held', async () => {
    mockRbacService.getPermissionsForUser.mockResolvedValue(new Set(['employee.read']));

    await expect(
      service.assertAnyPermission(
        'user-id',
        ['lead.read', 'lead.read.all'],
        'Need lead access',
      ),
    ).rejects.toThrow(ForbiddenException);
  });

  it('permits assertAnyPermission when at least one permission is held', async () => {
    mockRbacService.getPermissionsForUser.mockResolvedValue(new Set(['lead.read.all']));

    await expect(
      service.assertAnyPermission('user-id', ['lead.read', 'lead.read.all']),
    ).resolves.not.toThrow();
  });

  // ─── R-3 Test 3: Field-level authorization ───────────────────────────────────

  it('resolves parentContact=true for a role that holds student.contact.read', async () => {
    mockRbacService.getPermissionsForUser.mockResolvedValue(
      new Set(['student.read', 'student.contact.read']),
    );

    const access = await service.resolveFieldAccess('user-mentor', {
      parentContact: 'student.contact.read',
    });

    expect(access.parentContact).toBe(true);
  });

  it('resolves parentContact=false for Tutor (does not hold student.contact.read)', async () => {
    mockRbacService.getPermissionsForUser.mockResolvedValue(
      new Set(['student.read']), // Tutor has student.read but NOT student.contact.read
    );

    const access = await service.resolveFieldAccess('user-tutor', {
      parentContact: 'student.contact.read',
    });

    expect(access.parentContact).toBe(false);
  });

  it('resolves multiple field groups independently', async () => {
    mockRbacService.getPermissionsForUser.mockResolvedValue(
      new Set(['student.contact.read']), // has contact, not finance
    );

    const access = await service.resolveFieldAccess('user-mentor', {
      parentContact: 'student.contact.read',
      financialDetails: 'student.finance.read',
    });

    expect(access.parentContact).toBe(true);
    expect(access.financialDetails).toBe(false);
  });
});

// ─── ownership.utils tests ────────────────────────────────────────────────────

describe('ownership.utils', () => {
  it('assertOwnershipOrBypass: passes when actor owns the resource', () => {
    expect(() => assertOwnershipOrBypass('user-1', 'user-1', false)).not.toThrow();
  });

  it('assertOwnershipOrBypass: passes when bypass is granted', () => {
    expect(() => assertOwnershipOrBypass('user-1', 'user-other', true)).not.toThrow();
  });

  it('assertOwnershipOrBypass: throws when not owner and no bypass', () => {
    expect(() => assertOwnershipOrBypass('user-1', 'user-other', false)).toThrow(
      ForbiddenException,
    );
  });

  it('assertOwnershipOrBypass: throws when resourceOwnerId is null and no bypass', () => {
    expect(() => assertOwnershipOrBypass(null, 'user-other', false)).toThrow(ForbiddenException);
  });

  it('isOwnerOrHasBypass: returns true for owner', () => {
    expect(isOwnerOrHasBypass('user-1', 'user-1', false)).toBe(true);
  });

  it('isOwnerOrHasBypass: returns true for bypass', () => {
    expect(isOwnerOrHasBypass('user-1', 'user-other', true)).toBe(true);
  });

  it('isOwnerOrHasBypass: returns false for non-owner without bypass', () => {
    expect(isOwnerOrHasBypass('user-1', 'user-other', false)).toBe(false);
  });
});

// ─── field-access.utils tests ─────────────────────────────────────────────────

describe('field-access.utils', () => {
  describe('includeIf', () => {
    it('returns the fields object when allowed=true', () => {
      const result = includeIf(true, { parentPhone: '0501234567' });
      expect(result).toEqual({ parentPhone: '0501234567' });
    });

    it('returns empty object when allowed=false', () => {
      const result = includeIf(false, { parentPhone: '0501234567' });
      expect(result).toEqual({});
    });

    it('can be spread into a DTO correctly', () => {
      const base = { id: 'stu-1', name: 'Test' };
      const dto = { ...base, ...includeIf(false, { parentPhone: '050' }) };
      expect(dto).not.toHaveProperty('parentPhone');
    });

    it('includes the field when access is permitted', () => {
      const base = { id: 'stu-1', name: 'Test' };
      const dto = { ...base, ...includeIf(true, { parentPhone: '050' }) };
      expect(dto.parentPhone).toBe('050');
    });
  });

  describe('gateField', () => {
    it('returns the value when allowed=true', () => {
      expect(gateField(true, 'secret-phone')).toBe('secret-phone');
    });

    it('returns undefined when allowed=false', () => {
      expect(gateField(false, 'secret-phone')).toBeUndefined();
    });
  });
});
