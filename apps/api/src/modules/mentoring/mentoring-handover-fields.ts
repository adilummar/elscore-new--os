import { BadRequestException } from '@nestjs/common';

/**
 * The admission handover fields a Mentor can fill in or correct on the student page, with the input type and
 * validation for each. The API is the single source of truth: it validates every save with these rules and sends the
 * same definitions to the page, which renders the matching control.
 *
 * Corrections are stored beside the original Sales snapshot (see EnrollmentHandoverField); they never replace it.
 * `academic.subjects` is deliberately absent: it mirrors the Sales subject requirements, which are locked once a
 * student is handed over.
 */
export type HandoverFieldType = 'TEXT' | 'PHONE' | 'DATE' | 'SELECT' | 'TEXTAREA' | 'ROWS';

export interface RowColumn {
  key: string;
  label: string;
  type: 'text' | 'date' | 'time' | 'select';
  options?: readonly string[];
  required: boolean;
}

export interface HandoverFieldDefinition {
  key: string;
  type: HandoverFieldType;
  /** Fixed choices for SELECT. */
  options?: readonly string[];
  /** SELECT choices that come from reference data (grades, curricula), supplied by the caller. */
  optionsFrom?: 'GRADES' | 'CURRICULA';
  columns?: readonly RowColumn[];
  maxLength?: number;
  maxRows?: number;
  /** Earliest / latest accepted calendar date for DATE fields. */
  minDate?: string;
  maxDate?: 'TODAY';
}

export const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'] as const;
export const GENDERS = ['Male', 'Female', 'Other'] as const;
export const RELATIONSHIPS = ['Mother', 'Father', 'Guardian', 'Other'] as const;
export const LANGUAGES = ['English', 'Hindi', 'Tamil', 'Malayalam', 'Telugu', 'Kannada', 'Marathi', 'Bengali', 'Gujarati', 'Other'] as const;

const text = (key: string, maxLength = 200): HandoverFieldDefinition => ({ key, type: 'TEXT', maxLength });
const phone = (key: string): HandoverFieldDefinition => ({ key, type: 'PHONE' });
const area = (key: string, maxLength = 2000): HandoverFieldDefinition => ({ key, type: 'TEXTAREA', maxLength });
const choice = (key: string, options: readonly string[]): HandoverFieldDefinition => ({ key, type: 'SELECT', options });
const col = (key: string, label: string, type: RowColumn['type'] = 'text', options?: readonly string[]): RowColumn => ({ key, label, type, options, required: true });

export const HANDOVER_FIELDS: Readonly<Record<string, HandoverFieldDefinition>> = Object.fromEntries(
  (
    [
      text('student.firstName', 100),
      text('student.lastName', 100),
      { key: 'student.dateOfBirth', type: 'DATE', minDate: '1990-01-01', maxDate: 'TODAY' },
      choice('student.gender', GENDERS),
      text('student.schoolName'),
      text('student.currentGrade', 100),
      { key: 'student.grade', type: 'SELECT', optionsFrom: 'GRADES' },
      { key: 'student.curriculum', type: 'SELECT', optionsFrom: 'CURRICULA' },
      text('student.cityLocation'),
      area('student.notes'),
      text('parent.name'),
      phone('parent.primaryPhone'),
      phone('parent.altPhone1'),
      phone('parent.altPhone2'),
      phone('parent.whatsappNumber'),
      choice('parent.relationship', RELATIONSHIPS),
      choice('academic.preferredLanguage', LANGUAGES),
      area('academic.previousMarks'),
      area('parentExpectations'),
      area('studentEngagement'),
      { key: 'tutor.assignments', type: 'ROWS', maxRows: 20, columns: [col('subject', 'Subject'), col('tutor', 'Tutor')] },
      {
        key: 'timetable.schedule',
        type: 'ROWS',
        maxRows: 21,
        columns: [col('day', 'Day', 'select', WEEKDAYS), col('start', 'From', 'time'), col('end', 'To', 'time')],
      },
      {
        key: 'examination.upcomingDates',
        type: 'ROWS',
        maxRows: 20,
        columns: [col('subject', 'Subject / exam'), col('date', 'Date', 'date')],
      },
      {
        key: 'examination.syllabusPortions',
        type: 'ROWS',
        maxRows: 20,
        columns: [col('subject', 'Subject'), col('portions', 'Syllabus / portions')],
      },
    ] as HandoverFieldDefinition[]
  ).map((definition) => [definition.key, definition]),
);

export function getHandoverField(key: string): HandoverFieldDefinition | undefined {
  return Object.prototype.hasOwnProperty.call(HANDOVER_FIELDS, key) ? HANDOVER_FIELDS[key] : undefined;
}

export interface ValidationContext {
  today: Date;
  /** Reference-data choices for fields that use `optionsFrom`. */
  referenceOptions?: { GRADES?: readonly string[]; CURRICULA?: readonly string[] };
}

// Control characters are exactly what this pattern must detect.
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/;

function fail(message: string): never {
  throw new BadRequestException(message);
}

function cleanText(raw: unknown, label: string, maxLength: number, multiline: boolean): string {
  if (typeof raw !== 'string') fail(`${label} must be text`);
  const value = raw.trim();
  if (!value) fail(`${label} cannot be empty`);
  if (value.length > maxLength) fail(`${label} must be ${maxLength} characters or fewer`);
  if (CONTROL_CHARS.test(value) || (!multiline && /[\r\n]/.test(value))) fail(`${label} contains characters that are not allowed`);
  return value;
}

export function isoDate(raw: unknown, label: string): string {
  if (typeof raw !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(raw.trim())) fail(`${label} must be a date (YYYY-MM-DD)`);
  const value = raw.trim();
  const [y, m, d] = value.split('-').map(Number);
  const parsed = new Date(Date.UTC(y, m - 1, d));
  if (parsed.getUTCFullYear() !== y || parsed.getUTCMonth() !== m - 1 || parsed.getUTCDate() !== d) fail(`${label} is not a real calendar date`);
  return value;
}

function cleanPhone(raw: unknown, label: string): string {
  if (typeof raw !== 'string') fail(`${label} must be a phone number`);
  const compact = raw.replace(/[\s\-().]/g, '');
  if (!/^\+?\d+$/.test(compact)) fail(`${label} may contain only digits, spaces, dashes and a leading +`);
  const digits = compact.replace('+', '');
  if (digits.length < 10 || digits.length > 15) fail(`${label} must have 10 to 15 digits`);
  return compact;
}

function cleanTime(raw: unknown, label: string): string {
  if (typeof raw !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(raw.trim())) fail(`${label} must be a time (HH:MM, 24-hour)`);
  return raw.trim();
}

function pick(raw: unknown, options: readonly string[], label: string): string {
  if (typeof raw !== 'string') fail(`${label} must be one of the listed options`);
  const match = options.find((o) => o.toLowerCase() === raw.trim().toLowerCase());
  if (!match) fail(`${label} must be one of: ${options.join(', ')}`);
  return match;
}

/** Validates and normalises a value for the field; throws a 400 with a message the user can act on. */
export function validateHandoverFieldValue(definition: HandoverFieldDefinition, raw: unknown, context: ValidationContext): unknown {
  const label = definition.key;
  switch (definition.type) {
    case 'TEXT':
      return cleanText(raw, 'This field', definition.maxLength ?? 200, false);
    case 'TEXTAREA':
      return cleanText(raw, 'This field', definition.maxLength ?? 2000, true);
    case 'PHONE':
      return cleanPhone(raw, 'The phone number');
    case 'DATE': {
      const value = isoDate(raw, 'The date');
      if (definition.minDate && value < definition.minDate) fail(`The date cannot be before ${definition.minDate}`);
      if (definition.maxDate === 'TODAY' && value > context.today.toISOString().slice(0, 10)) fail('The date cannot be in the future');
      return value;
    }
    case 'SELECT': {
      const options = definition.options ?? (definition.optionsFrom ? context.referenceOptions?.[definition.optionsFrom] : undefined) ?? [];
      if (options.length === 0) fail('There are no options available for this field yet');
      return pick(raw, options, 'The selection');
    }
    case 'ROWS': {
      if (!Array.isArray(raw) || raw.length === 0) fail('Add at least one row');
      const maxRows = definition.maxRows ?? 20;
      if (raw.length > maxRows) fail(`No more than ${maxRows} rows are allowed`);
      const columns = definition.columns ?? [];
      return raw.map((row, index) => {
        if (!row || typeof row !== 'object' || Array.isArray(row)) fail(`Row ${index + 1} is not valid`);
        const input = row as Record<string, unknown>;
        const unknown = Object.keys(input).filter((k) => !columns.some((c) => c.key === k));
        if (unknown.length > 0) fail(`Row ${index + 1} has an unexpected column`);
        const out: Record<string, string> = {};
        for (const column of columns) {
          const cell = input[column.key];
          const at = `Row ${index + 1}: ${column.label}`;
          if (cell === undefined || cell === null || (typeof cell === 'string' && !cell.trim())) {
            if (column.required) fail(`${at} is required`);
            continue;
          }
          if (column.type === 'date') out[column.key] = isoDate(cell, at);
          else if (column.type === 'time') out[column.key] = cleanTime(cell, at);
          else if (column.type === 'select') out[column.key] = pick(cell, column.options ?? [], at);
          else out[column.key] = cleanText(cell, at, 200, false);
        }
        if (out.start && out.end && out.end <= out.start) fail(`Row ${index + 1}: the end time must be after the start time`);
        return out;
      });
    }
    default:
      return fail(`${label} cannot be edited`);
  }
}
