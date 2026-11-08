import { mentoringApiAction } from './actions';
import { addSubjectToListAction } from './schedule-actions';
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

/** Adds a subject to the shared subject list. The API allows it only for people who manage reference data. */
export async function addSubjectToList(name: string): Promise<void> {
  const clean = name.trim();
  const code = clean.toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 50);
  if (!code) throw new Error('Enter a subject name');
  const result = await addSubjectToListAction(code, clean);
  if (!result.ok) throw new Error(friendlyMentoringError(result.message));
}
