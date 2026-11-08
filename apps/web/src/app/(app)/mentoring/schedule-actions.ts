"use server";

import { fetchApi } from '@/lib/api/client';
import { ActionResult, toActionResult } from '@/lib/api/action-result';

/**
 * Adds a subject to the shared subject list from the schedule editor. Only this one reference-data call is exposed, and
 * the API still requires the reference data permission, so a Mentor without it gets the API's own refusal. It returns a
 * result instead of throwing, for the same reason as the Mentoring action: Next.js hides the message of a thrown error.
 */
export async function addSubjectToListAction(code: string, name: string): Promise<ActionResult<unknown>> {
  return toActionResult(() => fetchApi<unknown>('/reference/subjects', { method: 'POST', body: JSON.stringify({ code, name }) }));
}
