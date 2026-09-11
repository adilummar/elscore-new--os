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

      const result = await authService.validateCredentials('unknown@test.com', 'any');

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
});
