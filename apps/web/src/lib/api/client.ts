import { cookies } from 'next/headers';

const BASE_URL = process.env.API_URL || (process.env.NODE_ENV === 'development' ? 'http://localhost:3001/api/v1' : '');

if (!BASE_URL) {
  console.error('[CONFIG ERROR] API_URL is missing in production/staging environment.');
  throw new Error('API_URL environment variable is required in production');
}

export async function fetchApi<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const cookieStore = cookies();
  const token = cookieStore.get('accessToken')?.value;

  const headers = new Headers(options.headers);
  if (!headers.has('Content-Type') && !(options.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }
  
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const response = await fetch(`${BASE_URL}${endpoint}`, {
    ...options,
    headers,
  });

  if (!response.ok) {
    let errorMsg = `API error: ${response.status}`;
    try {
      const errorData = await response.json();
      errorMsg = errorData.message || errorMsg;
    } catch (e) {}
    
    if (response.status === 401) {
      // In Server Actions, throwing a specific error might be caught to trigger redirect
      throw new Error('UNAUTHORIZED');
    }
    throw new Error(errorMsg);
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