/** Local API base used only when NODE_ENV is development and API_URL is unset. */
export const DEVELOPMENT_API_BASE_URL = 'http://localhost:3001/api/v1';

export class ApiUrlNotConfiguredError extends Error {
  constructor() {
    super('API_URL is not configured.');
    this.name = 'ApiUrlNotConfiguredError';
  }
}

/**
 * Internal API base URL for server-side callers.
 * Callers append a path such as `/auth/login`, so the value includes the API prefix.
 * Development may use the local fallback. Every other environment requires API_URL
 * and does not substitute a localhost address.
 */
export function resolveServerApiUrl(
  env: { API_URL?: string; NODE_ENV?: string } = process.env,
): string {
  const configured = env.API_URL?.trim();
  if (configured) {
    return configured;
  }
  if (env.NODE_ENV === 'development') {
    return DEVELOPMENT_API_BASE_URL;
  }
  throw new ApiUrlNotConfiguredError();
}
