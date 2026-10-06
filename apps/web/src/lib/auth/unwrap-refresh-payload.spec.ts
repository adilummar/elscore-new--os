import { unwrapRefreshPayload } from './unwrap-refresh-payload';

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
