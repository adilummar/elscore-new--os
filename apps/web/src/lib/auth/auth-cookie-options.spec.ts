import fs from 'fs';
import path from 'path';

import { authCookieOptions } from './auth-cookie-options';

describe('authCookieOptions', () => {
  const original = process.env.COOKIE_SECURE;

  afterEach(() => {
    if (original === undefined) {
      delete process.env.COOKIE_SECURE;
    } else {
      process.env.COOKIE_SECURE = original;
    }
  });

  it('keeps HttpOnly, SameSite=Lax, and Path=/ for every setting', () => {
    for (const value of [undefined, 'false', 'true']) {
      if (value === undefined) delete process.env.COOKIE_SECURE;
      else process.env.COOKIE_SECURE = value;

      const options = authCookieOptions(900);
      expect(options.httpOnly).toBe(true);
      expect(options.sameSite).toBe('lax');
      expect(options.path).toBe('/');
      expect(options.maxAge).toBe(900);
    }
  });

  it('uses non-Secure cookies only for the explicit HTTP staging override', () => {
    process.env.COOKIE_SECURE = 'false';
    expect(authCookieOptions(900).secure).toBe(false);
  });

  it('keeps cookies Secure when COOKIE_SECURE=true', () => {
    process.env.COOKIE_SECURE = 'true';
    expect(authCookieOptions(900).secure).toBe(true);
  });

  it('defaults to Secure cookies when COOKIE_SECURE is unset', () => {
    delete process.env.COOKIE_SECURE;
    expect(authCookieOptions(900).secure).toBe(true);
  });
});

describe('staging deployment cookie configuration', () => {
  const deploySource = fs.readFileSync(
    path.resolve(__dirname, '../../../../../scratch/deploy-staging.js'),
    'utf8',
  );

  it('sets COOKIE_SECURE=false for the staging web environment and PM2 process', () => {
    expect(deploySource).toContain('COOKIE_SECURE=false');
    expect(deploySource).toContain("COOKIE_SECURE: 'false'");
  });
});
