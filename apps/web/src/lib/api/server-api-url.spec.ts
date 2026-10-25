import { ApiUrlNotConfiguredError, DEVELOPMENT_API_BASE_URL, resolveServerApiUrl } from './server-api-url';

describe('resolveServerApiUrl', () => {
  it('uses the /api/v1 development fallback when API_URL is missing', () => {
    expect(resolveServerApiUrl({ NODE_ENV: 'development' })).toBe(DEVELOPMENT_API_BASE_URL);
    expect(`${DEVELOPMENT_API_BASE_URL}/auth/login`).toBe('http://localhost:3001/api/v1/auth/login');
  });

  it('uses a configured URL in development', () => {
    expect(
      resolveServerApiUrl({
        NODE_ENV: 'development',
        API_URL: 'http://127.0.0.1:3001/api/v1',
      }),
    ).toBe('http://127.0.0.1:3001/api/v1');
  });

  it('uses a configured URL in production and keeps the prefix for appended paths', () => {
    const base = resolveServerApiUrl({
      NODE_ENV: 'production',
      API_URL: 'https://api.internal.example/api/v1',
    });
    expect(base).toBe('https://api.internal.example/api/v1');
    expect(`${base}/auth/login`).toBe('https://api.internal.example/api/v1/auth/login');
  });

  it('fails in production when API_URL is missing, empty, or whitespace', () => {
    for (const API_URL of [undefined, '', '   ']) {
      expect(() => resolveServerApiUrl({ NODE_ENV: 'production', API_URL })).toThrow(
        ApiUrlNotConfiguredError,
      );
      try {
        resolveServerApiUrl({ NODE_ENV: 'production', API_URL });
      } catch (error) {
        expect(error).toBeInstanceOf(ApiUrlNotConfiguredError);
        expect((error as Error).message).toBe('API_URL is not configured.');
        expect((error as Error).message).not.toMatch(/localhost|password|secret|postgres/i);
      }
    }
  });

  it('does not use the localhost fallback outside development', () => {
    expect(() => resolveServerApiUrl({ NODE_ENV: 'test' })).toThrow(ApiUrlNotConfiguredError);
  });
});
