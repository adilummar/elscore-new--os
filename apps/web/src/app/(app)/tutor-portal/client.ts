import { friendlyMentoringError } from '../mentoring/labels';

import { tutorPortalApiAction } from './actions';

/**
 * Client-side wrapper over the tutor portal bridge. A refused request becomes an Error carrying the API's own wording, so
 * every screen can show it as it is.
 */
export async function tutorPortalApi(path: string, method: 'GET' | 'PUT' | 'POST' = 'GET', body?: unknown): Promise<any> {
  const result = await tutorPortalApiAction(path, method, body);
  if (!result.ok) throw new Error(friendlyMentoringError(result.message));
  return result.data;
}
