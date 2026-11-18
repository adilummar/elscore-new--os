/**
 * Information saved before fields were combined stays readable. Nothing is deleted or rewritten: the combined field is derived from the
 * older ones until the Mentor saves it, and from then on the combined field is the one that counts.
 *
 *  - Upcoming examinations used to be two lists (dates by subject, syllabus by subject). They are one subject-wise table now.
 *  - A second alternate phone number used to have its own field. There is one Alternate / Emergency Contact Number now; the second
 *    number is shown there when the first was empty.
 */
export const UPCOMING_EXAMS_KEY = 'examination.upcoming';
const OLD_EXAM_DATES = 'examination.upcomingDates';
const OLD_EXAM_PORTIONS = 'examination.syllabusPortions';
const ALT_PHONE = 'parent.altPhone1';
const OLD_ALT_PHONE_2 = 'parent.altPhone2';

export interface ExamRow {
  subject: string;
  date: string;
  portions: string;
}

const cell = (row: unknown, key: string): string => {
  if (!row || typeof row !== 'object') return '';
  const v = (row as Record<string, unknown>)[key];
  return typeof v === 'string' ? v.trim() : '';
};

/** One row per subject, from the two older lists. Null when neither list has anything. */
export function mergeLegacyExamRows(dates: unknown, portions: unknown): ExamRow[] | null {
  const bySubject = new Map<string, ExamRow>();
  const order: string[] = [];
  const row = (subject: string): ExamRow => {
    const k = subject.toLowerCase();
    let r = bySubject.get(k);
    if (!r) {
      r = { subject, date: '', portions: '' };
      bySubject.set(k, r);
      order.push(k);
    }
    return r;
  };
  for (const d of Array.isArray(dates) ? dates : []) {
    const subject = cell(d, 'subject');
    if (subject) row(subject).date = cell(d, 'date');
  }
  for (const p of Array.isArray(portions) ? portions : []) {
    const subject = cell(p, 'subject');
    if (subject) row(subject).portions = cell(p, 'portions');
  }
  return order.length > 0 ? order.map((k) => bySubject.get(k) as ExamRow) : null;
}

interface RowLike {
  fieldKey: string;
  value: unknown;
  updatedAt: Date;
}

/** The stored rows plus the derived ones: a combined examination table and a first alternate number, only where the new field has no row yet. */
export function withLegacyRows<T extends RowLike>(rows: T[]): T[] {
  const has = (key: string) => rows.some((r) => r.fieldKey === key);
  const find = (key: string) => rows.find((r) => r.fieldKey === key);
  const out = [...rows];
  if (!has(UPCOMING_EXAMS_KEY)) {
    const dates = find(OLD_EXAM_DATES);
    const portions = find(OLD_EXAM_PORTIONS);
    const merged = mergeLegacyExamRows(dates?.value, portions?.value);
    const source = [dates, portions].filter((r): r is T => !!r).sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())[0];
    if (merged && source) out.push({ ...source, fieldKey: UPCOMING_EXAMS_KEY, value: merged });
  }
  if (!has(ALT_PHONE) && has(OLD_ALT_PHONE_2)) {
    const source = find(OLD_ALT_PHONE_2) as T;
    out.push({ ...source, fieldKey: ALT_PHONE });
  }
  return out;
}

/** The same derivation for a key to value map (what the checklist and the section fingerprints read). */
export function withLegacyValues(values: Map<string, unknown>): Map<string, unknown> {
  if (!values.has(UPCOMING_EXAMS_KEY)) {
    const merged = mergeLegacyExamRows(values.get(OLD_EXAM_DATES), values.get(OLD_EXAM_PORTIONS));
    if (merged) values.set(UPCOMING_EXAMS_KEY, merged);
  }
  if (!values.has(ALT_PHONE) && values.has(OLD_ALT_PHONE_2)) values.set(ALT_PHONE, values.get(OLD_ALT_PHONE_2));
  return values;
}
