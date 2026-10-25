import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { UserStatus } from '@prisma/client';
import * as argon2 from 'argon2';

import { AuditService } from '../../common/audit/audit.service';
import { AuthService } from '../../common/auth/auth.service';
import { UserStatusCacheService } from '../../common/auth/services/user-status-cache.service';
import { IdGeneratorService } from '../../common/id-generator/id-generator.service';
import { SYSTEM_ACTOR_EMAIL, SYSTEM_ACTOR_ID } from '../../common/id-generator/seed-identity';
import { PrismaService } from '../../common/prisma/prisma.service';
import { RbacService } from '../../common/rbac/rbac.service';

import { UserService } from './user.service';

jest.mock('argon2');

describe('UserService system actor credentials', () => {
  const prisma: any = {
    $transaction: jest.fn(async (cb: (tx: any) => Promise<any>) => cb(prisma)),
    user: {
      findUnique: jest.fn(),
      update: jest.fn(),
      create: jest.fn(),
    },
    role: {
      findUnique: jest.fn(),
    },
    employee: {
      create: jest.fn(),
    },
    userRole: {
      create: jest.fn(),
    },
    tutorProfile: {
      create: jest.fn(),
    },
  };
  const service = new UserService(
    prisma as unknown as PrismaService,
    { record: jest.fn(), recordInTx: jest.fn() } as unknown as AuditService,
    { invalidateCache: jest.fn() } as unknown as RbacService,
    { invalidate: jest.fn() } as unknown as UserStatusCacheService,
    { nextIdInTx: jest.fn().mockResolvedValue('EMP-0001') } as unknown as IdGeneratorService,
    { revokeAllUserTokens: jest.fn() } as unknown as AuthService,
  );

  const systemUser = {
    id: SYSTEM_ACTOR_ID,
    email: SYSTEM_ACTOR_EMAIL,
    passwordHash: 'none',
    status: UserStatus.ACTIVE,
    userRoles: [{ role: { code: 'CEO', isProtected: true } }],
  };

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.user.findUnique.mockResolvedValue(systemUser);
  });

  it('does not reset the system actor password or remove its stored role', async () => {
    await expect(
      service.resetPassword(SYSTEM_ACTOR_ID, { newPassword: 'another-password' }, 'hr-manager'),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(argon2.hash).not.toHaveBeenCalled();
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('does not change the system actor password when a stored role already exists', async () => {
    await expect(
      service.changePassword(SYSTEM_ACTOR_ID, {
        oldPassword: 'none',
        newPassword: 'another-password',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(argon2.verify).not.toHaveBeenCalled();
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('does not allow updating status of the system actor', async () => {
    await expect(
      service.updateStatus(SYSTEM_ACTOR_ID, { status: UserStatus.SUSPENDED, reason: 'test' }, 'hr-manager'),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(prisma.user.update).not.toHaveBeenCalled();
  });
});

describe('UserService.create protected role assignment', () => {
  const prisma: any = {
    $transaction: jest.fn(async (cb: (tx: any) => Promise<any>) => cb(prisma)),
    user: {
      findUnique: jest.fn(),
      create: jest.fn(),
    },
    role: {
      findUnique: jest.fn(),
    },
    employee: {
      create: jest.fn(),
    },
    userRole: {
      create: jest.fn(),
    },
    tutorProfile: {
      create: jest.fn(),
    },
  };
  const service = new UserService(
    prisma as unknown as PrismaService,
    { record: jest.fn(), recordInTx: jest.fn() } as unknown as AuditService,
    { invalidateCache: jest.fn() } as unknown as RbacService,
    { invalidate: jest.fn() } as unknown as UserStatusCacheService,
    { nextIdInTx: jest.fn().mockResolvedValue('EMP-0001') } as unknown as IdGeneratorService,
    { revokeAllUserTokens: jest.fn() } as unknown as AuthService,
  );

  const createUserDto = {
    email: 'newuser@example.com',
    password: 'Password123!',
    firstName: 'Jane',
    lastName: 'Doe',
    departmentId: 'dept-1',
    roleId: 'role-ceo',
  };

  const protectedCeoRole = {
    id: 'role-ceo',
    code: 'CEO',
    isProtected: true,
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('rejects a system actor with stored CEO role from assigning a protected role', async () => {
    (argon2.hash as jest.Mock).mockResolvedValue('hashed_pwd');
    prisma.role.findUnique.mockResolvedValue(protectedCeoRole);
    prisma.user.findUnique.mockResolvedValue({
      id: SYSTEM_ACTOR_ID,
      email: SYSTEM_ACTOR_EMAIL,
      userRoles: [{ role: { code: 'CEO', isProtected: true } }],
    });

    await expect(service.create(createUserDto, SYSTEM_ACTOR_ID)).rejects.toThrow(
      new BadRequestException('Only the CEO can assign protected roles'),
    );

    expect(prisma.user.create).not.toHaveBeenCalled();
    expect(prisma.userRole.create).not.toHaveBeenCalled();
  });

  it('rejects a non-CEO actor from assigning a protected role', async () => {
    (argon2.hash as jest.Mock).mockResolvedValue('hashed_pwd');
    prisma.role.findUnique.mockResolvedValue(protectedCeoRole);
    prisma.user.findUnique.mockResolvedValue({
      id: 'actor-hr',
      email: 'hr@example.com',
      userRoles: [{ role: { code: 'HR_MANAGER', isProtected: false } }],
    });

    await expect(service.create(createUserDto, 'actor-hr')).rejects.toThrow(
      new BadRequestException('Only the CEO can assign protected roles'),
    );

    expect(prisma.user.create).not.toHaveBeenCalled();
    expect(prisma.userRole.create).not.toHaveBeenCalled();
  });

  it('allows a legitimate CEO to create a user and assign a protected role', async () => {
    (argon2.hash as jest.Mock).mockResolvedValue('hashed_pwd');
    prisma.role.findUnique.mockResolvedValue(protectedCeoRole);
    prisma.user.findUnique
      .mockResolvedValueOnce({
        id: 'actor-ceo',
        email: 'ceo@elscore.com',
        userRoles: [{ role: { code: 'CEO', isProtected: true } }],
      })
      .mockResolvedValueOnce({
        id: 'user-new-1',
        email: createUserDto.email,
        status: UserStatus.PENDING_SETUP,
      });

    prisma.user.create.mockResolvedValue({
      id: 'user-new-1',
      email: createUserDto.email,
      status: UserStatus.PENDING_SETUP,
    });
    prisma.employee.create.mockResolvedValue({
      id: 'emp-new-1',
      businessId: 'EMP-0001',
    });
    prisma.userRole.create.mockResolvedValue({
      id: 'ur-1',
      userId: 'user-new-1',
      roleId: 'role-ceo',
    });

    const result = await service.create(createUserDto, 'actor-ceo');

    expect(prisma.user.create).toHaveBeenCalled();
    expect(prisma.userRole.create).toHaveBeenCalledWith({
      data: {
        userId: 'user-new-1',
        roleId: 'role-ceo',
        grantedByUserId: 'actor-ceo',
      },
    });
    expect(result).toBeDefined();
  });
});
