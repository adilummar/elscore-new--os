"use server";

import { fetchApi } from '@/lib/api/client';

/**
 * Thin server-action bridge to the Mentoring API. The backend enforces every permission and scope
 * check; this only forwards the signed-in user's request and is limited to /mentoring paths.
 */
export async function mentoringApi(path: string, method: 'GET' | 'POST' | 'PUT' | 'PATCH' = 'GET', body?: unknown) {
  if (!path.startsWith('/mentoring') || path.includes('..')) {
    throw new Error('Invalid Mentoring API path');
  }
  return fetchApi<any>(path, {
    method,
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}
