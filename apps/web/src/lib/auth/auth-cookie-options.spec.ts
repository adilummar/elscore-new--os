import { readFileSync } from 'fs';
import { join } from 'path';

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

  it('only the exact string "false" turns Secure off; any other value stays Secure', () => {
    for (const value of ['FALSE', 'False', '0', 'no', '', ' false', 'false ', 'off']) {
      process.env.COOKIE_SECURE = value;
      expect(authCookieOptions(900).secure).toBe(true);
    }
  });

  // Replaces a former check of an untracked-style deploy script that also carried server credentials.
  // The staging requirement ("plain-HTTP staging must opt in with COOKIE_SECURE=false") is now pinned by the
  // behaviour tests above plus the documented, secret-free templates that operators copy from.
  it('both tracked env templates document the exact-false plain-HTTP override', () => {
    const templates = [
      join(__dirname, '../../../.env.example'),
      join(__dirname, '../../../../../.env.example'),
    ];
    for (const file of templates) {
      const text = readFileSync(file, 'utf8');
      expect(text).toMatch(/^COOKIE_SECURE=true$/m);
      expect(text).toMatch(/Secure unless this is the exact\s+#?\s*string false/);
      expect(text).toMatch(/Use false only for plain HTTP/);
    }
  });
});
