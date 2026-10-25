import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import * as argon2 from 'argon2';

import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';

import { AuthService } from './auth.service';

// Mock the argon2 module so tests don't require a real hash
jest.mock('argon2');
const mockArgon2 = jest.mocked(argon2);

/**
 * AuthService Unit Tests
 *
 * Tests credential validation with mocked Prisma, AuditService, and argon2.
 * No actual database, Redis, or Argon2 computation required.
 */
describe('AuthService', () => {
  let authService: AuthService;
  let prismaService: jest.Mocked<Partial<PrismaService>>;

  const mockUser = {
    id: 'user-uuid',
    email: 'test@elscore.internal',
    passwordHash: 'hashed-password',
    status: 'ACTIVE' as const,
    lastLoginAt: null,
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    prismaService = {
      user: { findUnique: jest.fn() } as any,
      $transaction: jest.fn(),
      refreshToken: { create: jest.fn() } as any,
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: prismaService },
        {
          provide: JwtService,
          useValue: { signAsync: jest.fn().mockResolvedValue('mock-token') },
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn().mockReturnValue('secret'),
            getOrThrow: jest.fn().mockReturnValue('secret'),
          },
        },
        { provide: AuditService, useValue: { record: jest.fn() } },
      ],
    }).compile();

    authService = module.get<AuthService>(AuthService);
  });

  describe('validateCredentials', () => {
    it('returns null for unknown email (timing-safe path — dummy hash runs)', async () => {
      (prismaService.user!.findUnique as jest.Mock).mockResolvedValue(null);
      // argon2.verify runs on the dummy hash — mock it to return false
      mockArgon2.verify.mockResolvedValue(false);

      const result = await authService.validateCredentials('unknown@example.com', 'any');

      expect(result).toBeNull();
      // Verify argon2.verify was still called (timing-safe: runs even when user not found)
      expect(mockArgon2.verify).toHaveBeenCalled();
    });

    it('returns null for incorrect password', async () => {
      (prismaService.user!.findUnique as jest.Mock).mockResolvedValue(mockUser);
      mockArgon2.verify.mockResolvedValue(false); // wrong password

      const result = await authService.validateCredentials(mockUser.email, 'WrongPassword');
      expect(result).toBeNull();
    });

    it('returns user for correct password', async () => {
      (prismaService.user!.findUnique as jest.Mock).mockResolvedValue(mockUser);
      mockArgon2.verify.mockResolvedValue(true);

      const result = await authService.validateCredentials(mockUser.email, 'CorrectPassword');
      expect(result).toEqual({ id: mockUser.id, email: mockUser.email });
    });

    it('does not authenticate the system actor even when the password hash verifies', async () => {
      (prismaService.user!.findUnique as jest.Mock).mockResolvedValue({
        id: 'SYSTEM',
        email: 'system@elscore.internal',
        passwordHash: 'hashed-password',
        status: 'ACTIVE',
        mustChangePassword: false,
        userRoles: [{ role: { code: 'CEO', isProtected: true } }],
      });
      mockArgon2.verify.mockResolvedValue(true);

      const result = await authService.validateCredentials('system@elscore.internal', 'CorrectPassword');

      expect(result).toBeNull();
      expect(mockArgon2.verify).toHaveBeenCalled();
      expect(prismaService.user!.update).toBeUndefined();
    });

    it('throws UnauthorizedException for inactive account', async () => {
      (prismaService.user!.findUnique as jest.Mock).mockResolvedValue({
        ...mockUser,
        status: 'INACTIVE',
      });
      // argon2 would not be reached — status checked first on verify success
      // but with any verify result, status check should still fire
      mockArgon2.verify.mockResolvedValue(true);

      await expect(
        authService.validateCredentials(mockUser.email, 'any'),
      ).rejects.toThrow();
    });
  });

  describe('refresh', () => {
    let jwtService: jest.Mocked<JwtService>;

    beforeEach(() => {
      jwtService = (authService as any).jwtService;
      jwtService.verify = jest.fn();
      jwtService.signAsync = jest.fn().mockResolvedValue('new-token');
      (prismaService as any).refreshToken = {
        findUnique: jest.fn(),
        update: jest.fn(),
        create: jest.fn(),
      };
      (prismaService as any).$transaction = jest.fn().mockImplementation((promises) => Promise.all(promises));
    });

    it('rejects a refresh token for SYSTEM actor in JWT payload', async () => {
      jwtService.verify.mockReturnValue({ sub: 'SYSTEM', email: 'system@elscore.internal' });

      await expect(authService.refresh('raw-system-refresh-token')).rejects.toThrow(
        'System actor sessions are not permitted',
      );
    });

    it('rejects a refresh token where user record resolves to system actor', async () => {
      jwtService.verify.mockReturnValue({ sub: 'some-id', email: 'other@example.com' });
      (prismaService as any).refreshToken.findUnique.mockResolvedValue({
        id: 'tok-1',
        userId: 'some-id',
        revokedAt: null,
        expiresAt: new Date(Date.now() + 100000),
      });
      (prismaService.user!.findUnique as jest.Mock).mockResolvedValue({
        id: 'SYSTEM',
        email: 'system@elscore.internal',
        status: 'ACTIVE',
      });

      await expect(authService.refresh('raw-refresh-token')).rejects.toThrow(
        'System actor sessions are not permitted',
      );
    });

    it('successfully refreshes a session for a legitimate CEO or HR user', async () => {
      jwtService.verify.mockReturnValue({ sub: 'ceo-user-1', email: 'ceo@elscore.com' });
      (prismaService as any).refreshToken.findUnique.mockResolvedValue({
        id: 'tok-1',
        userId: 'ceo-user-1',
        revokedAt: null,
        expiresAt: new Date(Date.now() + 100000),
      });
      (prismaService.user!.findUnique as jest.Mock).mockResolvedValue({
        id: 'ceo-user-1',
        email: 'ceo@elscore.com',
        status: 'ACTIVE',
      });

      const tokens = await authService.refresh('valid-ceo-refresh-token');
      expect(tokens).toEqual({
        accessToken: 'new-token',
        refreshToken: 'new-token',
      });
      expect((prismaService as any).$transaction).toHaveBeenCalled();
    });
  });
});
