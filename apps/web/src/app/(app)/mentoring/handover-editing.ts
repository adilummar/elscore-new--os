import { EditableFieldMeta } from './handover-presentation';

/**
 * Input handling for the inline handover editor. These checks give instant feedback; the API repeats every rule
 * (it is the authority), so a value that passes here can still be refused there and the message is shown.
 */
export type EditorRow = Record<string, string>;
export type EditorValue = string | EditorRow[];

export type EditorResult = { ok: true; value: unknown } | { ok: false; message: string };

export function emptyRow(meta: EditableFieldMeta): EditorRow {
  return Object.fromEntries((meta.columns ?? []).map((c) => [c.key, '']));
}

/** The starting value for the editor: the current value when there is one, otherwise empty input. */
export function initialEditorValue(meta: EditableFieldMeta, current: unknown): EditorValue {
  if (meta.type === 'ROWS') {
    const rows = Array.isArray(current)
      ? current
          .filter((row): row is Record<string, unknown> => !!row && typeof row === 'object' && !Array.isArray(row))
          .map((row) => Object.fromEntries((meta.columns ?? []).map((c) => [c.key, typeof row[c.key] === 'string' ? (row[c.key] as string) : ''])))
      : [];
    return rows.length > 0 ? rows : [emptyRow(meta)];
  }
  return typeof current === 'string' ? current : '';
}

export function isEditorDirty(meta: EditableFieldMeta, initial: EditorValue, current: EditorValue): boolean {
  if (meta.type === 'ROWS') return JSON.stringify(initial) !== JSON.stringify(current);
  return String(initial).trim() !== String(current).trim();
}

const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/;

function realDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split('-').map(Number);
  const parsed = new Date(Date.UTC(y, m - 1, d));
  return parsed.getUTCFullYear() === y && parsed.getUTCMonth() === m - 1 && parsed.getUTCDate() === d;
}

function checkText(value: string, label: string, max: number, multiline: boolean): string | null {
  const text = value.trim();
  if (!text) return `${label} cannot be empty`;
  if (text.length > max) return `${label} must be ${max} characters or fewer`;
  if (CONTROL_CHARS.test(text) || (!multiline && /[\r\n]/.test(text))) return `${label} contains characters that are not allowed`;
  return null;
}

export function validateEditorValue(meta: EditableFieldMeta, value: EditorValue, today: Date = new Date()): EditorResult {
  const fail = (message: string): EditorResult => ({ ok: false, message });

  if (meta.type === 'ROWS') {
    if (!Array.isArray(value) || value.length === 0) return fail('Add at least one row');
    const columns = meta.columns ?? [];
    const out: EditorRow[] = [];
    for (let i = 0; i < value.length; i++) {
      const row: EditorRow = {};
      for (const column of columns) {
        const cell = (value[i][column.key] ?? '').trim();
        const at = `Row ${i + 1}: ${column.label}`;
        if (!cell) {
          if (column.required) return fail(`${at} is required`);
          continue;
        }
        if (column.type === 'date' && !realDate(cell)) return fail(`${at} must be a real date`);
        if (column.type === 'time' && !/^([01]\d|2[0-3]):[0-5]\d$/.test(cell)) return fail(`${at} must be a time (HH:MM)`);
        if (column.type === 'select' && !(column.options ?? []).includes(cell)) return fail(`${at} must be one of the listed options`);
        if (column.type === 'text') {
          const problem = checkText(cell, at, 200, false);
          if (problem) return fail(problem);
        }
        row[column.key] = cell;
      }
      if (row.start && row.end && row.end <= row.start) return fail(`Row ${i + 1}: the end time must be after the start time`);
      out.push(row);
    }
    if (out.length > 21) return fail('No more than 21 rows are allowed');
    return { ok: true, value: out };
  }

  const text = typeof value === 'string' ? value.trim() : '';
  switch (meta.type) {
    case 'TEXT':
    case 'TEXTAREA': {
      const problem = checkText(text, 'This field', meta.maxLength ?? (meta.type === 'TEXT' ? 200 : 2000), meta.type === 'TEXTAREA');
      return problem ? fail(problem) : { ok: true, value: text };
    }
    case 'PHONE': {
      const compact = text.replace(/[\s\-().]/g, '');
      if (!compact) return fail('The phone number cannot be empty');
      if (!/^\+?\d+$/.test(compact)) return fail('The phone number may contain only digits, spaces, dashes and a leading +');
      const digits = compact.replace('+', '');
      if (digits.length < 10 || digits.length > 15) return fail('The phone number must have 10 to 15 digits');
      return { ok: true, value: text };
    }
    case 'DATE': {
      if (!text) return fail('Choose a date');
      if (!realDate(text)) return fail('Enter a real calendar date');
      if (meta.minDate && text < meta.minDate) return fail(`The date cannot be before ${meta.minDate}`);
      const max = meta.maxDate ?? null;
      if (max && text > max) return fail('The date cannot be in the future');
      void today;
      return { ok: true, value: text };
    }
    case 'SELECT': {
      if (!text) return fail('Choose an option');
      const options = meta.options ?? [];
      if (!options.includes(text)) return fail('Choose one of the listed options');
      return { ok: true, value: text };
    }
    default:
      return fail('This information cannot be edited here');
  }
}
