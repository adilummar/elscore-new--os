/**
 * Keep this implementation identical to
 * apps/web/src/lib/auth/unwrap-refresh-payload.ts
 * (the Next.js middleware helper). Duplicated here so API typecheck
 * does not import files outside apps/api/src.
 */
function unwrapRefreshPayload(json: unknown): { accessToken?: string; refreshToken?: string } {
  if (json !== null && typeof json === 'object' && 'data' in json && 'timestamp' in json) {
    const envelope = json as { data?: unknown };
    if (envelope.data !== null && typeof envelope.data === 'object') {
      return envelope.data as { accessToken?: string; refreshToken?: string };
    }
    return {};
  }

  if (json !== null && typeof json === 'object') {
    return json as { accessToken?: string; refreshToken?: string };
  }

  return {};
}

describe('unwrapRefreshPayload', () => {
  it('reads accessToken from the Nest { data, timestamp } envelope', () => {
    const payload = unwrapRefreshPayload({
      data: { accessToken: 'new-access', refreshToken: 'new-refresh' },
      timestamp: '2026-10-02T00:00:00.000Z',
    });

    expect(payload.accessToken).toBe('new-access');
    expect(payload.refreshToken).toBe('new-refresh');
  });

  it('falls back to a flat body when the envelope is absent', () => {
    const payload = unwrapRefreshPayload({
      accessToken: 'flat-access',
      refreshToken: 'flat-refresh',
    });

    expect(payload.accessToken).toBe('flat-access');
    expect(payload.refreshToken).toBe('flat-refresh');
  });

  it('does not treat a missing nested data object as tokens', () => {
    expect(unwrapRefreshPayload({ data: null, timestamp: 'now' })).toEqual({});
    expect(unwrapRefreshPayload(null)).toEqual({});
  });
});
