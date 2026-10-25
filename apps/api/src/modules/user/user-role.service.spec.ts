import { ForbiddenException } from '@nestjs/common';

import { AuditService } from '../../common/audit/audit.service';
import { SYSTEM_ACTOR_EMAIL, SYSTEM_ACTOR_ID } from '../../common/id-generator/seed-identity';
import { PrismaService } from '../../common/prisma/prisma.service';
import { RbacService } from '../../common/rbac/rbac.service';

import { UserRoleService } from './user-role.service';

describe('UserRoleService protected assignment', () => {
  const prisma: {
    user: { findUnique: jest.Mock };
    role: { findUnique: jest.Mock };
    userRole: { create: jest.Mock; delete: jest.Mock };
    $transaction: jest.Mock;
  } = {
    user: { findUnique: jest.fn() },
    role: { findUnique: jest.fn() },
    userRole: { create: jest.fn(), delete: jest.fn() },
    $transaction: jest.fn(async (cb) => cb(prisma)),
  };
  const service = new UserRoleService(
    prisma as unknown as PrismaService,
    { recordInTx: jest.fn(), record: jest.fn() } as unknown as AuditService,
    { invalidateCache: jest.fn() } as unknown as RbacService,
  );

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('does not assign or remove a role on the system actor, even for a CEO actor', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: SYSTEM_ACTOR_ID,
      email: SYSTEM_ACTOR_EMAIL,
      userRoles: [{ roleId: 'role-ceo', role: { code: 'CEO', isProtected: true } }],
    });

    await expect(
      service.assignRole(SYSTEM_ACTOR_ID, 'role-hr', 'ceo-user'),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(prisma.userRole.create).not.toHaveBeenCalled();
    expect(prisma.userRole.delete).not.toHaveBeenCalled();
    expect(prisma.role.findUnique).not.toHaveBeenCalled();
  });

  it('still rejects a non-CEO assigning a protected role to a normal user', async () => {
    prisma.user.findUnique
      .mockResolvedValueOnce({
        id: 'user-hr',
        email: 'hr@example.com',
        userRoles: [],
      })
      .mockResolvedValueOnce({
        id: 'actor-hr',
        email: 'manager@example.com',
        userRoles: [{ role: { code: 'HR_MANAGER', isProtected: false } }],
      });
    prisma.role.findUnique.mockResolvedValue({
      id: 'role-ceo',
      code: 'CEO',
      isProtected: true,
    });

    await expect(service.assignRole('user-hr', 'role-ceo', 'actor-hr')).rejects.toThrow(
      'Only the CEO can assign protected roles',
    );
    expect(prisma.userRole.create).not.toHaveBeenCalled();
  });

  it('rejects a system actor with stored CEO role from assigning a protected role', async () => {
    prisma.user.findUnique
      .mockResolvedValueOnce({
        id: 'user-normal',
        email: 'normal@example.com',
        userRoles: [],
      })
      .mockResolvedValueOnce({
        id: SYSTEM_ACTOR_ID,
        email: SYSTEM_ACTOR_EMAIL,
        userRoles: [{ role: { code: 'CEO', isProtected: true } }],
      });
    prisma.role.findUnique.mockResolvedValue({
      id: 'role-ceo',
      code: 'CEO',
      isProtected: true,
    });

    await expect(
      service.assignRole('user-normal', 'role-ceo', SYSTEM_ACTOR_ID),
    ).rejects.toThrow('Only the CEO can assign protected roles');
    expect(prisma.userRole.create).not.toHaveBeenCalled();
  });

  it('allows a legitimate CEO to assign a protected role to a normal user', async () => {
    prisma.user.findUnique
      .mockResolvedValueOnce({
        id: 'user-normal',
        email: 'normal@example.com',
        userRoles: [],
      })
      .mockResolvedValueOnce({
        id: 'ceo-user',
        email: 'ceo@elscore.com',
        userRoles: [{ role: { code: 'CEO', isProtected: true } }],
      });
    prisma.role.findUnique.mockResolvedValue({
      id: 'role-ceo',
      code: 'CEO',
      isProtected: true,
    });

    await service.assignRole('user-normal', 'role-ceo', 'ceo-user');
    expect(prisma.userRole.create).toHaveBeenCalledWith({
      data: {
        userId: 'user-normal',
        roleId: 'role-ceo',
        grantedByUserId: 'ceo-user',
      },
    });
  });
});
