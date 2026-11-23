import { UnauthorizedException } from '@nestjs/common';
import * as argon2 from 'argon2';

import { ACCOUNT_NOT_ACTIVE_MESSAGE, isTutorAccessBlocked } from './account-access';
import { AuthService } from './auth.service';
import { UserStatusCacheService } from './services/user-status-cache.service';
import { JwtStrategy } from './strategies/jwt.strategy';

jest.mock('argon2');
const mockArgon2 = jest.mocked(argon2);

const PASSWORD = 'Correct-Horse-9!';
const tutorUser = (tutorStatus: string | null) => ({
  id: 'u-tutor', email: 'tutor@x.test', passwordHash: 'hash', status: 'ACTIVE', mustChangePassword: false,
  employee: tutorStatus ? { tutorProfile: { tutorOperationalStatus: tutorStatus } } : null,
});

/** Expects the refusal with the user-facing message and machine code, nothing else. */
async function expectNotActive(p: Promise<unknown>) {
  const err = await p.then(() => null, (e) => e);
  expect(err).toBeInstanceOf(UnauthorizedException);
  expect(err.getResponse()).toEqual({ code: 'ACCOUNT_NOT_ACTIVE', message: ACCOUNT_NOT_ACTIVE_MESSAGE });
}

function authWith(user: any, opts: { stored?: any } = {}) {
  const prisma: any = {
    user: { findUnique: jest.fn().mockResolvedValue(user) },
    refreshToken: { findUnique: jest.fn().mockResolvedValue(opts.stored ?? null), update: jest.fn(), create: jest.fn() },
    $transaction: jest.fn().mockResolvedValue([]),
  };
  const jwt: any = { verify: jest.fn().mockReturnValue({ sub: user?.id, email: user?.email }), signAsync: jest.fn().mockResolvedValue('t') };
  const config: any = { get: jest.fn().mockReturnValue('7d'), getOrThrow: jest.fn().mockReturnValue('secret') };
  const audit: any = { record: jest.fn().mockResolvedValue(undefined) };
  return { svc: new AuthService(prisma, jwt, config, audit), audit, prisma };
}

describe('Tutor login lockout', () => {
  beforeEach(() => jest.clearAllMocks());

  it('blocks only Suspended and Discontinued', () => {
    expect(['SUSPENDED', 'DISCONTINUED'].map(isTutorAccessBlocked)).toEqual([true, true]);
    expect(['ACTIVE', 'INACTIVE', 'PAUSED', null].map(isTutorAccessBlocked)).toEqual([false, false, false, false]);
  });

  describe('new login', () => {
    it.each(['SUSPENDED', 'DISCONTINUED'])('refuses a %s tutor with the generic message and audits it without the password', async (s) => {
      mockArgon2.verify.mockResolvedValue(true);
      const { svc, audit } = authWith(tutorUser(s));
      await expectNotActive(svc.validateCredentials('tutor@x.test', PASSWORD));
      expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({
        entityType: 'User', entityId: 'u-tutor', action: 'LOGIN_REFUSED', metadata: { reason: 'TUTOR_ACCOUNT_NOT_ACTIVE', via: 'LOGIN' },
      }));
      const logged = JSON.stringify(audit.record.mock.calls);
      expect(logged).not.toContain(PASSWORD);
      expect(logged).not.toContain(s); // the status itself is not revealed in the refusal record either
    });

    it.each(['ACTIVE', 'INACTIVE', 'PAUSED'])('lets a %s tutor log in', async (s) => {
      mockArgon2.verify.mockResolvedValue(true);
      const { svc, audit } = authWith(tutorUser(s));
      await expect(svc.validateCredentials('tutor@x.test', PASSWORD)).resolves.toMatchObject({ id: 'u-tutor' });
      expect(audit.record).not.toHaveBeenCalled();
    });

    it('a wrong password for a suspended tutor is just a wrong password (nothing revealed, nothing audited)', async () => {
      mockArgon2.verify.mockResolvedValue(false);
      const { svc, audit } = authWith(tutorUser('SUSPENDED'));
      await expect(svc.validateCredentials('tutor@x.test', 'nope')).resolves.toBeNull();
      expect(audit.record).not.toHaveBeenCalled();
    });

    it('non-tutor accounts are unaffected', async () => {
      mockArgon2.verify.mockResolvedValue(true);
      await expect(authWith(tutorUser(null)).svc.validateCredentials('tutor@x.test', PASSWORD)).resolves.toMatchObject({ id: 'u-tutor' });
    });
  });

  describe('existing sessions', () => {
    const strategy = (status: any) => new JwtStrategy({ getOrThrow: () => 'secret' } as any, { getStatus: jest.fn().mockResolvedValue(status) } as any);
    const payload = { sub: 'u-tutor', email: 'tutor@x.test' };

    it('rejects an already-issued access token of a blocked tutor on the next request', async () => {
      await expectNotActive(strategy({ status: 'ACTIVE', mustChangePassword: false, tutorBlocked: true }).validate(payload));
    });

    it('accepts the same token again once the tutor is reactivated', async () => {
      await expect(strategy({ status: 'ACTIVE', mustChangePassword: false, tutorBlocked: false }).validate(payload)).resolves.toMatchObject({ id: 'u-tutor' });
    });

    it('refuses to refresh the session of a blocked tutor, and audits it', async () => {
      const stored = { id: 'rt1', userId: 'u-tutor', revokedAt: null, expiresAt: new Date(Date.now() + 86_400_000) };
      const { svc, audit, prisma } = authWith(tutorUser('DISCONTINUED'), { stored });
      await expectNotActive(svc.refresh('raw-refresh-token'));
      expect(prisma.$transaction).not.toHaveBeenCalled(); // no new tokens issued
      expect(audit.record.mock.calls[0][0]).toMatchObject({ action: 'LOGIN_REFUSED', metadata: { via: 'REFRESH' } });
      expect(JSON.stringify(audit.record.mock.calls)).not.toContain('raw-refresh-token');
    });
  });

  describe('status cache', () => {
    const cacheWith = (tutorStatus: string | null, cached: any = null) => {
      const cache: any = { get: jest.fn().mockResolvedValue(cached), set: jest.fn().mockResolvedValue(undefined), del: jest.fn() };
      const prisma: any = { user: { findUnique: jest.fn().mockResolvedValue(tutorUser(tutorStatus)) } };
      return { svc: new UserStatusCacheService(prisma, cache), prisma };
    };

    it('derives tutorBlocked from the tutor status', async () => {
      await expect(cacheWith('SUSPENDED').svc.getStatus('u-tutor')).resolves.toMatchObject({ tutorBlocked: true });
      await expect(cacheWith('PAUSED').svc.getStatus('u-tutor')).resolves.toMatchObject({ tutorBlocked: false });
    });

    it('re-reads cache entries written before the lockout existed', async () => {
      const { svc, prisma } = cacheWith('SUSPENDED', { status: 'ACTIVE', mustChangePassword: false });
      await expect(svc.getStatus('u-tutor')).resolves.toMatchObject({ tutorBlocked: true });
      expect(prisma.user.findUnique).toHaveBeenCalled();
    });
  });
});
