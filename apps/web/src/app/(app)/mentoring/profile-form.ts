/**
 * The rules of the profile edit form, kept as plain functions so they can be tested. They mirror the API's field rules to give instant, field-level
 * messages; the API checks every value again and is the authority.
 */
export type FieldType = 'TEXT' | 'TEXTAREA' | 'PHONE' | 'DATE' | 'SELECT' | 'ROWS' | 'SCHEDULE';
export interface ProfileField {
  key: string;
  label: string;
  group: 'STUDENT' | 'PARENT' | 'ACADEMIC';
  type: FieldType;
  options: string[] | null;
  maxLength: number | null;
  minDate: string | null;
  maxDate: string | null;
  required: boolean;
  value: unknown;
  salesValue: unknown;
  source: string;
}
export type Draft = Record<string, string>;

export const GROUP_TITLES: Record<ProfileField['group'], string> = { STUDENT: 'Student Details', PARENT: 'Parent / Guardian Details', ACADEMIC: 'Academic Profile' };
export const GROUP_ORDER: ProfileField['group'][] = ['STUDENT', 'PARENT', 'ACADEMIC'];

/** How a stored value is written in the form and on the page. A missing value is "n/a". */
export const displayOf = (v: unknown): string => (typeof v === 'string' && v.trim() ? v : typeof v === 'number' ? String(v) : 'n/a');
const textOf = (v: unknown): string => (typeof v === 'string' ? v : typeof v === 'number' ? String(v) : '');

export const draftOf = (fields: readonly ProfileField[]): Draft => Object.fromEntries(fields.map((f) => [f.key, textOf(f.value)]));

/** The message for one field's current text, or null when it is acceptable. An untouched empty optional field is fine. */
export function problemWith(f: ProfileField, text: string, today = new Date().toISOString().slice(0, 10)): string | null {
  const v = text.trim();
  const had = textOf(f.value).trim() !== '';
  if (!v) return f.required || had ? `${f.label} cannot be empty. Keep the current value or enter a new one.` : null;
  if (f.type === 'TEXT' || f.type === 'TEXTAREA') {
    if (f.maxLength && v.length > f.maxLength) return `${f.label} must be ${f.maxLength} characters or fewer.`;
    // eslint-disable-next-line no-control-regex
    if (/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(v) || (f.type === 'TEXT' && /[\r\n]/.test(v))) return `${f.label} contains characters that are not allowed.`;
    return null;
  }
  if (f.type === 'PHONE') {
    const compact = v.replace(/[\s\-().]/g, '');
    if (!/^\+?\d+$/.test(compact)) return `${f.label} may contain only digits, spaces, dashes and a leading +.`;
    const digits = compact.replace('+', '').length;
    return digits < 10 || digits > 15 ? `${f.label} must have 10 to 15 digits.` : null;
  }
  if (f.type === 'DATE') {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return `${f.label} must be a date.`;
    const d = new Date(`${v}T00:00:00Z`);
    if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== v) return `${f.label} is not a real calendar date.`;
    if (f.minDate && v < f.minDate) return `${f.label} cannot be before ${f.minDate}.`;
    if (f.maxDate === 'TODAY' && v > today) return `${f.label} cannot be in the future.`;
    return null;
  }
  if (f.type === 'SELECT') return (f.options ?? []).some((o) => o.toLowerCase() === v.toLowerCase()) ? null : `Choose one of the listed options for ${f.label}.`;
  return null;
}

export const problemsOf = (fields: readonly ProfileField[], draft: Draft, today?: string): Record<string, string> => {
  const out: Record<string, string> = {};
  for (const f of fields) { const p = problemWith(f, draft[f.key] ?? '', today); if (p) out[f.key] = p; }
  return out;
};

/** Only the fields that differ from what was saved are sent, so everything else stays exactly as it is. */
export function changesOf(fields: readonly ProfileField[], draft: Draft): { changes: Record<string, string>; basedOn: Record<string, unknown> } {
  const changes: Record<string, string> = {};
  const basedOn: Record<string, unknown> = {};
  for (const f of fields) {
    const now = (draft[f.key] ?? '').trim();
    if (now !== textOf(f.value).trim() && (now !== '' || textOf(f.value).trim() === '')) {
      if (now === '') continue;
      changes[f.key] = now;
      basedOn[f.key] = f.value ?? null;
    }
  }
  return { changes, basedOn };
}

export const isDirty = (fields: readonly ProfileField[], draft: Draft): boolean => Object.keys(changesOf(fields, draft).changes).length > 0;

export const SOURCE_LABELS: Record<string, string> = { SALES: 'From Sales', MENTORING_UPDATED: 'Edited by a Mentor', MENTOR_COLLECTED: 'Collected by a Mentor', NONE: 'Not recorded' };

/** A value as the audit history shows it: phone numbers keep only their last three digits, a date of birth only its year, long text is cut. */
export function auditValue(fieldKey: string, v: unknown): string {
  if (typeof v !== 'string' || !v.trim()) return 'n/a';
  if (/Phone\d?$|whatsappNumber$/.test(fieldKey)) return `••••${v.replace(/\D/g, '').slice(-3)}`;
  if (fieldKey === 'student.dateOfBirth') return v.slice(0, 4);
  return v.length > 60 ? `${v.slice(0, 57)}...` : v;
}

/** One line for an edit in the audit history: what changed, from what, to what, and any reason the Mentor gave. */
export function auditLine(payload: { fieldKey?: unknown; previous?: unknown; next?: unknown; remarks?: unknown; verificationInvalidated?: unknown } | null | undefined): string | null {
  if (!payload || typeof payload.fieldKey !== 'string') return null;
  const k = payload.fieldKey;
  return `${auditValue(k, payload.previous)} to ${auditValue(k, payload.next)}${payload.verificationInvalidated === true ? ' · confirmation ended' : ''}${typeof payload.remarks === 'string' && payload.remarks ? ` · ${payload.remarks}` : ''}`;
}

export type SubmitResult =
  | { kind: 'busy' }
  | { kind: 'invalid'; message: string }
  | { kind: 'nothing'; message: string }
  | { kind: 'saved'; changed: string[] }
  | { kind: 'failed'; message: string };

/**
 * One attempt to save. It sends nothing when a value is invalid or nothing changed, and a second attempt made while one is in flight is refused
 * (`gate.busy` is set before the request starts). A failure returns the API's own message and leaves the draft with the caller, so unsaved text is kept.
 */
export async function submitProfile(
  input: { fields: readonly ProfileField[]; draft: Draft; reason: string; today?: string },
  gate: { busy: boolean },
  send: (body: { changes: Record<string, string>; basedOn: Record<string, unknown>; reason?: string }) => Promise<{ changed?: string[] } | undefined>,
): Promise<SubmitResult> {
  if (gate.busy) return { kind: 'busy' };
  if (Object.keys(problemsOf(input.fields, input.draft, input.today)).length > 0) return { kind: 'invalid', message: 'Some fields need attention. They are marked below.' };
  const { changes, basedOn } = changesOf(input.fields, input.draft);
  if (Object.keys(changes).length === 0) return { kind: 'nothing', message: 'Nothing has changed yet.' };
  gate.busy = true;
  try {
    const r = await send({ changes, basedOn, ...(input.reason.trim() ? { reason: input.reason.trim() } : {}) });
    return { kind: 'saved', changed: Array.isArray(r?.changed) ? r.changed : Object.keys(changes) };
  } catch (e) {
    return { kind: 'failed', message: e instanceof Error && e.message ? e.message : 'The profile could not be saved. Your changes are still here.' };
  } finally {
    gate.busy = false;
  }
}
