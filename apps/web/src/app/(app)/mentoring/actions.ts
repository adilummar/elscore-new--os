"use server";

import { fetchApi } from '@/lib/api/client';
import { ActionResult, toActionResult } from '@/lib/api/action-result';

/**
 * Thin server-action bridge to the Mentoring API. The backend enforces every permission and scope
 * check; this only forwards the signed-in user's request and is limited to /mentoring paths.
 *
 * It returns a result instead of throwing: in a production build Next.js replaces the message of anything
 * thrown out of a Server Action with a generic "Server Components render" text, which is how a plain
 * "Mandatory checklist items are not resolved" reached the screen as an unexplained error.
 * Screens call `mentoringApi` from `../mentoring-client`, which turns a failed result back into an Error
 * carrying the real message.
 */
export async function mentoringApiAction(
  path: string,
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' = 'GET',
  body?: unknown,
): Promise<ActionResult<any>> {
  if (!path.startsWith('/mentoring') || path.includes('..')) {
    return { ok: false, message: 'Invalid Mentoring API path' };
  }
  return toActionResult(() =>
    fetchApi<any>(path, {
      method,
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    }),
  );
}
