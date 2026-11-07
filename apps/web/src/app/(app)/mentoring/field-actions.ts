/**
 * What happens when a Mentor saves a field or ticks "I have verified this information". Kept apart from the page so the
 * rules can be tested without a browser: validation comes first, the API call carries the value the Mentor was looking
 * at, and every failure leaves the draft in place so the Mentor can fix it or try again.
 */
import { EditorValue, validateEditorValue } from './handover-editing';
import { EditableFieldMeta } from './handover-presentation';

export type SaveOutcome =
  /** `value` is the cleaned value that was stored, which is the new baseline for the card. */
  | { kind: 'saved'; value: unknown }
  | { kind: 'invalid'; message: string }
  /** Someone else changed the value after the Mentor opened it. Nothing was written. */
  | { kind: 'stale'; message: string }
  | { kind: 'failed'; message: string };

export type VerifyOutcome = { kind: 'done' } | { kind: 'blocked'; message: string } | { kind: 'stale'; message: string } | { kind: 'failed'; message: string };

const STALE = /changed by someone else/i;
export const isStaleMessage = (message: string | null | undefined): boolean => STALE.test(message ?? '');

const errorMessage = (e: unknown, fallback: string): string => (e instanceof Error && e.message ? e.message : fallback);

/**
 * Validates the draft, then saves it. `send` receives the cleaned value and `basedOn`, the stored value the draft
 * started from, so the API can refuse the save if it has changed since.
 */
export async function saveField(
  meta: EditableFieldMeta,
  draft: EditorValue,
  basedOn: unknown,
  send: (value: unknown, basedOn: unknown) => Promise<void>,
): Promise<SaveOutcome> {
  const checked = validateEditorValue(meta, draft);
  if (!checked.ok) return { kind: 'invalid', message: checked.message };
  try {
    await send(checked.value, basedOn ?? null);
    return { kind: 'saved', value: checked.value };
  } catch (e) {
    const message = errorMessage(e, 'The information could not be saved. Please try again.');
    return isStaleMessage(message) ? { kind: 'stale', message } : { kind: 'failed', message };
  }
}

/** Why the checkbox is unavailable, or null when the Mentor may use it. A value must exist and be saved first. */
export function verifyBlockedReason(collection: 'FROM_SALES' | 'UPDATED' | 'COLLECTED' | 'PENDING', hasUnsavedChange: boolean): string | null {
  if (collection === 'PENDING') return 'Enter and save a value first';
  if (hasUnsavedChange) return 'Save your change first';
  return null;
}

/**
 * Confirms (checked) or withdraws (unchecked) the verification of the stored value. A value that has unsaved edits is
 * never confirmed: the checkbox is blocked until the change is saved.
 */
export async function setVerification(
  checked: boolean,
  state: { collection: 'FROM_SALES' | 'UPDATED' | 'COLLECTED' | 'PENDING'; hasUnsavedChange: boolean; storedValue: unknown },
  send: (verified: boolean, basedOn: unknown) => Promise<void>,
): Promise<VerifyOutcome> {
  const blocked = verifyBlockedReason(state.collection, state.hasUnsavedChange);
  if (blocked) return { kind: 'blocked', message: blocked };
  try {
    await send(checked, state.storedValue ?? null);
    return { kind: 'done' };
  } catch (e) {
    const message = errorMessage(e, 'The verification could not be saved. Please try again.');
    return isStaleMessage(message) ? { kind: 'stale', message } : { kind: 'failed', message };
  }
}
