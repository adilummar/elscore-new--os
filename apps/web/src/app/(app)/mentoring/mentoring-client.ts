import { mentoringApiAction } from './actions';
import { friendlyMentoringError } from './labels';

/**
 * Client-side wrapper over the Mentoring server action. A rejected request becomes an Error whose message is
 * the API's own wording (with permission codes rewritten in plain language), so every screen's
 * `catch (e) { setError(e.message) }` shows something a business user can act on.
 */
export async function mentoringApi(path: string, method: 'GET' | 'POST' | 'PUT' | 'PATCH' = 'GET', body?: unknown): Promise<any> {
  const result = await mentoringApiAction(path, method, body);
  if (!result.ok) throw new Error(friendlyMentoringError(result.message));
  return result.data;
}
