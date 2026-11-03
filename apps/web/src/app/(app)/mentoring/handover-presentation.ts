/**
 * How the Admission Handover is shown to business users.
 *
 * The API reports fields by internal path (`student.firstName`, `parent.primaryPhone`, ...). Those paths are
 * data identifiers, not labels: this module maps them to plain wording, formats values, and decides — from the
 * actual value, never from the mere presence of a property — whether a field counts as collected.
 * It only reads the API response; it never changes it.
 */

/** Presentation labels. Keys are the API's field paths; the API and database names are not renamed. */
export const HANDOVER_FIELD_LABELS: Readonly<Record<string, string>> = {
  'student.firstName': 'Student First Name',
  'student.lastName': 'Student Last Name',
  'student.dateOfBirth': 'Date of Birth',
  'student.gender': 'Gender',
  'student.schoolName': 'School Name',
  'student.currentGrade': 'Current Grade (as entered)',
  'student.grade': 'Grade / Class',
  'student.curriculum': 'Curriculum / Board',
  'student.cityLocation': 'City / Location',
  'student.notes': 'Student Notes',
  'parent.name': 'Parent / Guardian Name',
  'parent.primaryPhone': 'Parent Contact Number',
  'parent.altPhone1': 'Alternate Contact Number 1',
  'parent.altPhone2': 'Alternate Contact Number 2',
  'parent.whatsappNumber': 'Parent WhatsApp Number',
  'parent.relationship': 'Relationship to Student',
  'academic.subjects': 'Subject Requirement',
  'academic.preferredLanguage': 'Preferred Language',
  'academic.previousMarks': 'Previous Academic Marks',
  'tutor.assignments': 'Tutor Assignment',
  'timetable.schedule': 'Preferred Timetable / Schedule',
  'examination.upcomingDates': 'Upcoming Examination Dates',
  'examination.syllabusPortions': 'Examination Syllabus / Portions',
  parentExpectations: 'Parent Expectations',
  studentEngagement: 'Student Engagement',
};

/** Display order: student, parent, academics, then everything Mentoring still has to gather. */
const FIELD_ORDER: readonly string[] = Object.keys(HANDOVER_FIELD_LABELS);

/** Used for a field the mapping does not know yet: never shows the raw dotted path or camelCase key. */
export function humanizeFieldKey(key: string): string {
  const last = key.split('.').pop() ?? key;
  const words = last
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .trim()
    .toLowerCase();
  return words ? words.replace(/\b\w/g, (c) => c.toUpperCase()) : 'Additional Information';
}

export function handoverFieldLabel(key: string): string {
  return HANDOVER_FIELD_LABELS[key] ?? humanizeFieldKey(key);
}

const PLACEHOLDER_TEXT = new Set(['null', 'undefined', 'nan']);

/**
 * True when the value is real information. Empty strings, whitespace, null/undefined, NaN, empty lists and
 * placeholders such as "null" or "-" are NOT information. Numeric zero and boolean false ARE.
 */
export function isMeaningfulValue(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === 'string') {
    const text = value.trim();
    if (!text) return false;
    if (PLACEHOLDER_TEXT.has(text.toLowerCase())) return false;
    if (/^[-–—_.\s]+$/.test(text)) return false;
    return true;
  }
  if (typeof value === 'number') return Number.isFinite(value);
  if (typeof value === 'boolean') return true;
  if (value instanceof Date) return !Number.isNaN(value.getTime());
  if (Array.isArray(value)) return value.some(isMeaningfulValue);
  if (typeof value === 'object') return Object.values(value as Record<string, unknown>).some(isMeaningfulValue);
  return false;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** A date-only value such as 2015-05-12 is formatted without going through a time zone (no off-by-one day). */
function formatDateOnly(text: string): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})(?:T.*)?$/.exec(text);
  if (!match) return null;
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return `${day} ${MONTHS[month - 1]} ${match[1]}`;
}

/** Plain-text rendering of a value. Never produces "[object Object]" or raw JSON braces. */
export function formatHandoverValue(field: string, value: unknown): string {
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value === 'number') return String(value);
  if (typeof value === 'string') {
    const text = value.trim();
    if (field.toLowerCase().includes('dateofbirth') || /date/i.test(field)) {
      const formatted = formatDateOnly(text);
      if (formatted) return formatted;
    }
    return text;
  }
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? '' : value.toISOString().slice(0, 10);
  if (Array.isArray(value)) return value.filter(isMeaningfulValue).map((v) => formatHandoverValue(field, v)).join(', ');
  if (value && typeof value === 'object') {
    return Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => isMeaningfulValue(v))
      .map(([k, v]) => `${humanizeFieldKey(k)}: ${formatHandoverValue(k, v)}`)
      .join('; ');
  }
  return '';
}

export type HandoverFieldStatus = 'COLLECTED' | 'NOT_COLLECTED_BY_SALES' | 'NOT_PROVIDED';

export interface PresentedField {
  /** Stable React key; not shown. */
  key: string;
  label: string;
  /** Formatted value for collected fields, null otherwise. */
  value: string | null;
  status: HandoverFieldStatus;
  /** Short explanation for a field that is still required. */
  hint: string | null;
}

export interface PresentedHandover {
  collected: PresentedField[];
  missing: PresentedField[];
}

const HINTS: Record<Exclude<HandoverFieldStatus, 'COLLECTED'>, string> = {
  NOT_COLLECTED_BY_SALES: 'Not asked during the Sales admission. The Mentor collects this.',
  NOT_PROVIDED: 'Sales did not enter this information.',
};

function orderOf(field: string): number {
  const index = FIELD_ORDER.indexOf(field);
  return index === -1 ? FIELD_ORDER.length : index;
}

function describeRequirement(requirement: Record<string, unknown>): string | null {
  const subject = typeof requirement.subject === 'string' ? requirement.subject.trim() : '';
  if (!subject) return null;
  const detail = [requirement.curriculum, requirement.grade]
    .filter((part): part is string => typeof part === 'string' && part.trim().length > 0)
    .map((part) => part.trim())
    .join(' · ');
  const hours = isMeaningfulValue(requirement.monthlyHours) ? ` · ${String(requirement.monthlyHours).trim()} hrs / month` : '';
  return `${subject}${detail ? ` (${detail})` : ''}${hours}`;
}

/**
 * Turns the API's handover into the two lists shown on screen, with counts that always equal the number of rows.
 * A transferred field whose value turns out to be blank is moved to "not collected" (reason: not provided).
 */
export function presentHandover(handover: unknown): PresentedHandover {
  const source = (handover && typeof handover === 'object' ? handover : {}) as { transferredFields?: unknown; missingFields?: unknown };
  const transferred = Array.isArray(source.transferredFields) ? source.transferredFields : [];
  const reported = Array.isArray(source.missingFields) ? source.missingFields : [];

  const collected: PresentedField[] = [];
  const missing = new Map<string, PresentedField>();
  const collectedKeys = new Set<string>();

  const addMissing = (field: string, status: Exclude<HandoverFieldStatus, 'COLLECTED'>) => {
    if (!missing.has(field)) {
      missing.set(field, { key: field, label: handoverFieldLabel(field), value: null, status, hint: HINTS[status] });
    }
  };

  for (const entry of transferred) {
    if (!entry || typeof entry !== 'object' || typeof (entry as { field?: unknown }).field !== 'string') continue;
    const { field, value } = entry as { field: string; value: unknown };

    if (field === 'academic.subjects') {
      const rows = (Array.isArray(value) ? value : [])
        .map((requirement, index) => ({
          key: `${field}:${(requirement as { requirementId?: string })?.requirementId ?? index}`,
          text: requirement && typeof requirement === 'object' ? describeRequirement(requirement as Record<string, unknown>) : null,
        }))
        .filter((row): row is { key: string; text: string } => row.text !== null);
      if (rows.length === 0) addMissing(field, 'NOT_PROVIDED');
      for (const row of rows) {
        collected.push({ key: row.key, label: handoverFieldLabel(field), value: row.text, status: 'COLLECTED', hint: null });
        collectedKeys.add(field);
      }
      continue;
    }

    if (isMeaningfulValue(value)) {
      const text = formatHandoverValue(field, value);
      if (text) {
        collected.push({ key: field, label: handoverFieldLabel(field), value: text, status: 'COLLECTED', hint: null });
        collectedKeys.add(field);
        continue;
      }
    }
    addMissing(field, 'NOT_PROVIDED');
  }

  for (const entry of reported) {
    if (!entry || typeof entry !== 'object' || typeof (entry as { field?: unknown }).field !== 'string') continue;
    const { field, reason } = entry as { field: string; reason?: string };
    if (collectedKeys.has(field)) continue;
    addMissing(field, reason === 'NOT_COLLECTED_IN_SALES' ? 'NOT_COLLECTED_BY_SALES' : 'NOT_PROVIDED');
  }

  const byOrder = (a: PresentedField, b: PresentedField) => orderOf(a.key.split(':')[0]) - orderOf(b.key.split(':')[0]);
  return { collected: collected.sort(byOrder), missing: [...missing.values()].sort(byOrder) };
}
