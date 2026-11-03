import { emptyRow, initialEditorValue, isEditorDirty, validateEditorValue } from './handover-editing';
import { EditableFieldMeta } from './handover-presentation';

const meta = (over: Partial<EditableFieldMeta> & Pick<EditableFieldMeta, 'type'>): EditableFieldMeta => ({
  key: 'x', options: null, columns: null, maxLength: null, minDate: null, maxDate: null, ...over,
});

const TEXT = meta({ type: 'TEXT', maxLength: 100 });
const PHONE = meta({ type: 'PHONE' });
const DATE = meta({ type: 'DATE', minDate: '1990-01-01', maxDate: '2026-11-03' });
const SELECT = meta({ type: 'SELECT', options: ['Male', 'Female', 'Other'] });
const AREA = meta({ type: 'TEXTAREA', maxLength: 50 });
const SCHEDULE = meta({
  type: 'ROWS',
  columns: [
    { key: 'day', label: 'Day', type: 'select', options: ['Monday', 'Tuesday'], required: true },
    { key: 'start', label: 'From', type: 'time', required: true },
    { key: 'end', label: 'To', type: 'time', required: true },
  ],
});
const EXAMS = meta({
  type: 'ROWS',
  columns: [{ key: 'subject', label: 'Subject / exam', type: 'text', required: true }, { key: 'date', label: 'Date', type: 'date', required: true }],
});

const ok = (m: EditableFieldMeta, v: any) => validateEditorValue(m, v);

describe('validation by input type (instant feedback; the API repeats every rule)', () => {
  it('text: required, trimmed, length-limited, single line', () => {
    expect(ok(TEXT, '  Asha ')).toEqual({ ok: true, value: 'Asha' });
    expect(ok(TEXT, '   ')).toMatchObject({ ok: false });
    expect(ok(TEXT, 'x'.repeat(101))).toMatchObject({ ok: false, message: expect.stringContaining('100') });
    expect(ok(TEXT, 'two\nlines')).toMatchObject({ ok: false });
  });

  it('textarea: allows line breaks, still limited', () => {
    expect(ok(AREA, 'line one\nline two')).toMatchObject({ ok: true });
    expect(ok(AREA, 'x'.repeat(51))).toMatchObject({ ok: false });
    expect(ok(AREA, '')).toMatchObject({ ok: false });
  });

  it.each(['+91 98765 43210', '98765-43210', '(971) 50 123 4567'])('phone accepts %s', (value) => expect(ok(PHONE, value)).toMatchObject({ ok: true }));
  it.each(['', '12345', 'call me', '+1234567890123456', '98765 4321x'])('phone rejects %p', (value) => expect(ok(PHONE, value)).toMatchObject({ ok: false }));

  it('date: real calendar date within the allowed range', () => {
    expect(ok(DATE, '2015-05-12')).toEqual({ ok: true, value: '2015-05-12' });
    for (const bad of ['', '12/05/2015', '2015-02-30', '1980-01-01', '2030-01-01']) expect(ok(DATE, bad)).toMatchObject({ ok: false });
  });

  it('select: only a listed option', () => {
    expect(ok(SELECT, 'Female')).toEqual({ ok: true, value: 'Female' });
    for (const bad of ['', 'robot']) expect(ok(SELECT, bad)).toMatchObject({ ok: false });
  });

  it('timetable rows: day, times and order', () => {
    expect(ok(SCHEDULE, [{ day: 'Monday', start: '16:00', end: '17:30' }])).toEqual({ ok: true, value: [{ day: 'Monday', start: '16:00', end: '17:30' }] });
    for (const bad of [
      [], [{ day: '', start: '16:00', end: '17:00' }], [{ day: 'Funday', start: '16:00', end: '17:00' }], [{ day: 'Monday', start: '25:00', end: '26:00' }],
      [{ day: 'Monday', start: '17:00', end: '16:00' }], [{ day: 'Monday', start: '16:00', end: '' }],
    ]) expect(ok(SCHEDULE, bad)).toMatchObject({ ok: false });
  });

  it('examination rows: a subject and a real date on every row, with the row number in the message', () => {
    expect(ok(EXAMS, [{ subject: 'Maths term test', date: '2026-12-01' }])).toMatchObject({ ok: true });
    expect(ok(EXAMS, [{ subject: 'Maths', date: '2026-12-01' }, { subject: 'Science', date: '2026-13-40' }])).toMatchObject({ ok: false, message: expect.stringContaining('Row 2') });
  });
});

describe('editor helpers', () => {
  it('starts with the current value, or an empty input / one empty row', () => {
    expect(initialEditorValue(TEXT, 'Asha')).toBe('Asha');
    expect(initialEditorValue(TEXT, null)).toBe('');
    expect(initialEditorValue(SCHEDULE, null)).toEqual([emptyRow(SCHEDULE)]);
    expect(initialEditorValue(SCHEDULE, [{ day: 'Monday', start: '16:00', end: '17:00', extra: 'x' }])).toEqual([{ day: 'Monday', start: '16:00', end: '17:00' }]);
  });

  it('notices unsaved changes (used to protect the user from losing edits)', () => {
    expect(isEditorDirty(TEXT, 'Asha', 'Asha ')).toBe(false);
    expect(isEditorDirty(TEXT, 'Asha', 'Ashok')).toBe(true);
    const rows = [{ day: 'Monday', start: '16:00', end: '17:00' }];
    expect(isEditorDirty(SCHEDULE, rows, rows.map((r) => ({ ...r })))).toBe(false);
    expect(isEditorDirty(SCHEDULE, rows, [{ ...rows[0], end: '18:00' }])).toBe(true);
  });
});
