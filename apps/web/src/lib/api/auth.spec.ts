jest.mock('next/headers', () => ({
  cookies: jest.fn(() => ({
    get: jest.fn(),
    set: jest.fn(),
    delete: jest.fn(),
  })),
}));

jest.mock('next/cache', () => ({
  unstable_noStore: jest.fn(),
}));

import { login } from './auth';

describe('login API_URL handling', () => {
  const originalUrl = process.env.API_URL;
  const originalNodeEnv = process.env.NODE_ENV;

  afterEach(() => {
    if (originalUrl === undefined) delete process.env.API_URL;
    else process.env.API_URL = originalUrl;
    process.env.NODE_ENV = originalNodeEnv;
    jest.restoreAllMocks();
  });

  it('does not call the API when production has no API_URL', async () => {
    delete process.env.API_URL;
    process.env.NODE_ENV = 'production';
    const fetchMock = jest.spyOn(global, 'fetch');
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);

    const result = await login({ email: 'person@example.com', password: 'not-a-real-secret' });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.error).toBe('Unable to sign in because the service is not configured.');
    expect(result.error).not.toMatch(/localhost|API_URL|not-a-real-secret/i);
    expect(errorSpy.mock.calls.map((call) => call.join(' ')).join('\n')).not.toMatch(/localhost|not-a-real-secret/i);
  });

  it('posts to the configured production URL, including the API prefix', async () => {
    process.env.NODE_ENV = 'production';
    process.env.API_URL = 'https://api.internal.example/api/v1';
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({ message: 'Invalid credentials' }),
    } as Response);

    const result = await login({ email: 'person@example.com', password: 'not-a-real-secret' });

    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.internal.example/api/v1/auth/login',
      expect.objectContaining({ method: 'POST' }),
    );
    expect(result.error).toBe('Invalid credentials');
  });

  it('uses the development fallback with the /api/v1 prefix', async () => {
    delete process.env.API_URL;
    process.env.NODE_ENV = 'development';
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({}),
    } as Response);

    await login({ email: 'person@example.com', password: 'not-a-real-secret' });

    expect(fetchMock.mock.calls[0][0]).toBe('http://localhost:3001/api/v1/auth/login');
  });
});
