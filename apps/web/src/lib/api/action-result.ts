/**
 * Server Actions must not throw API errors to the browser: in a production build Next.js replaces the message
 * of anything thrown out of a Server Action with a generic "Server Components render" text, so a plain
 * validation message ("firstName should not be empty") never reaches the user. Actions return a result instead.
 */
export type ActionResult<T> = { ok: true; data: T } | { ok: false; message: string };

export const GENERIC_ACTION_ERROR = 'Something went wrong. Please try again, or contact an administrator if it keeps happening.';

type ApiError = Error & { status?: number };

/**
 * Runs an action and turns an API rejection into a result.
 * - 401 is rethrown so the existing sign-in redirect handling still works.
 * - 4xx messages come from the API's own validation and are safe to show.
 * - Anything else (5xx, network, configuration) gets a generic message; details stay in the server logs.
 */
export async function toActionResult<T>(run: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    return { ok: true, data: await run() };
  } catch (error) {
    const apiError = error as ApiError;
    if (apiError instanceof Error && apiError.message === 'UNAUTHORIZED') throw apiError;
    if (apiError instanceof Error && typeof apiError.status === 'number' && apiError.status >= 400 && apiError.status < 500 && apiError.message) {
      return { ok: false, message: apiError.message };
    }
    return { ok: false, message: GENERIC_ACTION_ERROR };
  }
}
