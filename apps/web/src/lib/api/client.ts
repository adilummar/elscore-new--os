import { cookies } from 'next/headers';
import { unstable_noStore as noStore } from 'next/cache';

const BASE_URL = process.env.API_URL || (process.env.NODE_ENV === 'development' ? 'http://localhost:3001/api/v1' : '');

if (!BASE_URL) {
  // Log but do NOT throw at module level — a module-level throw crashes every Server Component
  // that imports this file, even indirectly (e.g. during Next.js soft navigation).
  console.error('[CONFIG ERROR] API_URL is missing. All API calls will fail.');
}

export async function fetchApi<T>(endpoint: string, options: RequestInit & { skipGodView?: boolean } = {}): Promise<T> {
  if (!BASE_URL) {
    throw new Error('API_URL is not configured. Check the server environment.');
  }

  // Opt out of Next.js fetch cache — ensures fresh data on every call.
  // Wrapped in try/catch because noStore() can throw in certain static pre-render contexts.
  try { noStore(); } catch (_) {}

  const cookieStore = cookies();
  const token = cookieStore.get('accessToken')?.value;
  const godViewUserId = cookieStore.get('godViewUserId')?.value;

  const headers = new Headers(options.headers);
  if (!headers.has('Content-Type') && !(options.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }
  
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  // Propagate God View target to the backend for audit logging
  if (godViewUserId && !options.skipGodView) {
    headers.set('X-God-View-Target', godViewUserId);
  }

  const response = await fetch(`${BASE_URL}${endpoint}`, {
    cache: 'no-store',
    ...options,
    headers,
  });

  if (!response.ok) {
    let errorMsg = `API error: ${response.status}`;
    let errorCode: string | undefined;
    let blockers: string[] | undefined;
    let details: Record<string, unknown> | undefined;
    try {
      const errorData = await response.json();
      errorMsg = errorData.message || errorMsg;
      if (typeof errorData.code === 'string') errorCode = errorData.code;
      if (Array.isArray(errorData.blockers)) blockers = errorData.blockers.filter((item: unknown) => typeof item === 'string');
      if (typeof errorData.details === 'object' && errorData.details !== null && !Array.isArray(errorData.details)) {
        details = errorData.details;
      }
      console.error('[API ERROR]', response.status, endpoint, errorData);
    } catch (e) {
      console.error('[API ERROR]', response.status, endpoint, 'No JSON');
    }
    
    if (response.status === 401) {
      // In Server Actions, throwing a specific error might be caught to trigger redirect
      throw new Error('UNAUTHORIZED');
    }
    const error = new Error(Array.isArray(errorMsg) ? errorMsg.join(', ') : errorMsg);
    if (errorCode) (error as Error & { code?: string }).code = errorCode;
    if (blockers) (error as Error & { blockers?: string[] }).blockers = blockers;
    if (details) (error as Error & { details?: Record<string, unknown> }).details = details;
    throw error;
  }

  // Handle empty responses (like 204 No Content)
  const text = await response.text();
  if (!text) return {} as T;

  const parsed = JSON.parse(text);
  // Unwrap the global NestJS TransformInterceptor envelope: { data: T, timestamp: string }
  // All successful API responses are wrapped in this shape.
  if (parsed !== null && typeof parsed === 'object' && 'data' in parsed && 'timestamp' in parsed) {
    return parsed.data as T;
  }
  return parsed as T;
}