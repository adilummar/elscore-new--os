export type RefreshTokenPayload = {
  accessToken?: string;
  refreshToken?: string;
};

/**
 * NestJS wraps successful responses as `{ data, timestamp }`.
 * Read tokens from the inner payload when the envelope is present.
 */
export function unwrapRefreshPayload(json: unknown): RefreshTokenPayload {
  if (json !== null && typeof json === 'object' && 'data' in json && 'timestamp' in json) {
    const envelope = json as { data?: unknown };
    if (envelope.data !== null && typeof envelope.data === 'object') {
      return envelope.data as RefreshTokenPayload;
    }
    return {};
  }

  if (json !== null && typeof json === 'object') {
    return json as RefreshTokenPayload;
  }

  return {};
}
