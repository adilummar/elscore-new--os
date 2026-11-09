"use server";

import { fetchApi } from '@/lib/api/client';
import { ActionResult, toActionResult } from '@/lib/api/action-result';

/**
 * Thin server-action bridge to the tutor portal API. It only forwards the signed-in user's own request, and only to the
 * tutor portal routes that read classes and earnings or submit a class update. The API enforces the permission and starts
 * every answer from who is signed in, so nothing here can name another tutor.
 */
const ALLOWED = [/^\/tutor-portal\/classes\?from=\d{4}-\d{2}-\d{2}&to=\d{4}-\d{2}-\d{2}$/, /^\/tutor-portal\/earnings\?from=\d{4}-\d{2}-\d{2}&to=\d{4}-\d{2}-\d{2}$/, /^\/tutor-portal\/classes\/[A-Za-z0-9-]{8,64}~\d{4}-\d{2}-\d{2}~\d{1,4}\/update$/];

export async function tutorPortalApiAction(path: string, method: 'GET' | 'PUT' = 'GET', body?: unknown): Promise<ActionResult<any>> {
  if (!ALLOWED.some((r) => r.test(path))) return { ok: false, message: 'Invalid tutor portal path' };
  if ((method === 'PUT') !== /\/update$/.test(path)) return { ok: false, message: 'Invalid tutor portal request' };
  return toActionResult(() => fetchApi<any>(path, { method, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) }));
}
