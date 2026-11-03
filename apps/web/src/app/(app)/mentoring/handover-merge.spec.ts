import { describeFieldChange, formatRowsValue, presentHandover } from './handover-presentation';

const sales = (field: string, value: unknown) => ({ field, source: 'STUDENT', value });
const override = (fieldKey: string, value: unknown, over: Record<string, unknown> = {}) => ({
  fieldKey, value, origin: 'MENTORING_UPDATED', salesValue: null, updatedByName: 'Mina Mentor', updatedAt: '2026-11-03T09:30:00Z', ...over,
});

const handover = (over: Record<string, unknown> = {}) => ({
  transferredFields: [sales('student.firstName', 'Asha'), sales('parent.primaryPhone', '+971500000000'), sales('student.dateOfBirth', '2015-05-12')],
  missingFields: [{ field: 'parent.relationship', reason: 'NOT_COLLECTED_IN_SALES' }, { field: 'student.gender', reason: 'NOT_PROVIDED' }],
  fieldValues: [],
  editableFields: [
    { key: 'parent.primaryPhone', type: 'PHONE', options: null, columns: null, maxLength: null, minDate: null, maxDate: null },
    { key: 'parent.relationship', type: 'SELECT', options: ['Mother', 'Father', 'Guardian', 'Other'], columns: null, maxLength: null, minDate: null, maxDate: null },
  ],
  ...over,
});

describe('Mentoring values over the Sales snapshot', () => {
  it('shows a Mentoring correction instead of the Sales value, labelled, with the Sales value kept visible', () => {
    const { collected } = presentHandover(handover({ fieldValues: [override('parent.primaryPhone', '+971501112222', { salesValue: '+971500000000' })] }));
    const phone = collected.find((f) => f.fieldKey === 'parent.primaryPhone')!;
    expect(phone).toMatchObject({
      value: '+971501112222', source: 'MENTORING_UPDATED', salesValue: '+971500000000', updatedByName: 'Mina Mentor', updatedAt: '2026-11-03T09:30:00Z', status: 'COLLECTED',
    });
    expect(collected.find((f) => f.fieldKey === 'student.firstName')).toMatchObject({ value: 'Asha', source: 'SALES', salesValue: null });
  });

  it('a field Sales never collected becomes collected by the Mentor, and the counts move', () => {
    const before = presentHandover(handover());
    const after = presentHandover(handover({ fieldValues: [override('parent.relationship', 'Mother', { origin: 'MENTOR_COLLECTED' })] }));
    expect([before.collected.length, before.missing.length]).toEqual([3, 2]);
    expect([after.collected.length, after.missing.length]).toEqual([4, 1]);
    expect(after.collected.find((f) => f.fieldKey === 'parent.relationship')).toMatchObject({ value: 'Mother', source: 'MENTOR_COLLECTED', salesValue: null, updatedByName: 'Mina Mentor' });
    expect(after.missing.map((f) => f.fieldKey)).toEqual(['student.gender']);
  });

  it('works for a field Sales listed as missing for another reason (not provided)', () => {
    const after = presentHandover(handover({ fieldValues: [override('student.gender', 'Female', { origin: 'MENTOR_COLLECTED' })] }));
    expect(after.collected.find((f) => f.fieldKey === 'student.gender')).toMatchObject({ value: 'Female', source: 'MENTOR_COLLECTED' });
  });

  it('a blank Mentoring value does not count as collected and the Sales value stays', () => {
    const { collected, missing } = presentHandover(handover({ fieldValues: [override('student.firstName', '   '), override('parent.relationship', null, { origin: 'MENTOR_COLLECTED' })] }));
    expect(collected.find((f) => f.fieldKey === 'student.firstName')).toMatchObject({ value: 'Asha', source: 'SALES' });
    expect(missing.map((f) => f.fieldKey)).toContain('parent.relationship');
  });

  it('every row carries the input definition the page needs, and Sales-locked data has none', () => {
    const result = presentHandover(handover({
      transferredFields: [...handover().transferredFields, { field: 'academic.subjects', source: 'REQUIREMENT', value: [{ requirementId: 'r1', subject: 'Maths', curriculum: 'CBSE', grade: 'Grade 8' }] }],
    }));
    expect(result.collected.find((f) => f.fieldKey === 'parent.primaryPhone')!.editor).toMatchObject({ type: 'PHONE' });
    expect(result.missing.find((f) => f.fieldKey === 'parent.relationship')!.editor).toMatchObject({ type: 'SELECT', options: ['Mother', 'Father', 'Guardian', 'Other'] });
    expect(result.collected.find((f) => f.fieldKey === 'academic.subjects')!.editor).toBeNull();
  });

  it('the presenter only reads: the API data is not modified', () => {
    const input = JSON.parse(JSON.stringify(handover({ fieldValues: [override('parent.relationship', 'Mother', { origin: 'MENTOR_COLLECTED' })] })));
    const frozen = JSON.stringify(input);
    const deepFreeze = (o: any): any => { Object.values(o).forEach((v) => typeof v === 'object' && v && deepFreeze(v)); return Object.freeze(o); };
    deepFreeze(input);
    expect(() => presentHandover(input)).not.toThrow();
    expect(JSON.stringify(input)).toBe(frozen);
  });

  it('a handover from before this feature (no fieldValues or editableFields) still presents', () => {
    const legacy = { transferredFields: handover().transferredFields, missingFields: handover().missingFields };
    const { collected, missing } = presentHandover(legacy);
    expect([collected.length, missing.length]).toEqual([3, 2]);
    expect([...collected, ...missing].every((f) => f.editor === null)).toBe(true);
  });
});

describe('structured values are shown as readable lines, not JSON', () => {
  it.each([
    ['timetable.schedule', [{ day: 'Monday', start: '16:00', end: '17:30' }, { day: 'Thursday', start: '18:00', end: '19:00' }], 'Monday 16:00–17:30\nThursday 18:00–19:00'],
    ['examination.upcomingDates', [{ subject: 'Maths term test', date: '2026-12-01' }], 'Maths term test — 1 Dec 2026'],
    ['examination.syllabusPortions', [{ subject: 'Science', portions: 'Chapters 1 to 5' }], 'Science: Chapters 1 to 5'],
    ['tutor.assignments', [{ subject: 'Maths', tutor: 'Ravi Kumar' }], 'Maths — Ravi Kumar'],
  ])('%s', (field, rows, expected) => {
    expect(formatRowsValue(field, rows)).toBe(expected);
    expect(formatRowsValue(field, rows)).not.toMatch(/[{}[\]"]/);
  });

  it('a saved structured value appears on the collected side with those lines', () => {
    const { collected } = presentHandover(handover({
      missingFields: [{ field: 'timetable.schedule', reason: 'NOT_COLLECTED_IN_SALES' }],
      fieldValues: [override('timetable.schedule', [{ day: 'Monday', start: '16:00', end: '17:00' }], { origin: 'MENTOR_COLLECTED' })],
      editableFields: [{ key: 'timetable.schedule', type: 'ROWS', options: null, columns: [], maxLength: null, minDate: null, maxDate: null }],
    }));
    expect(collected.find((f) => f.fieldKey === 'timetable.schedule')!.value).toBe('Monday 16:00–17:00');
  });
});

describe('history of a field change', () => {
  it('names the field in business words and shows from and to', () => {
    expect(describeFieldChange({ fieldKey: 'parent.primaryPhone', previous: '+971500000000', next: '+971501112222' })).toEqual({
      label: 'Parent Contact Number', from: '+971500000000', to: '+971501112222',
    });
  });

  it('shows "Not collected" when the field had no value before, and flattens structured values', () => {
    expect(describeFieldChange({ fieldKey: 'timetable.schedule', previous: null, next: [{ day: 'Monday', start: '16:00', end: '17:00' }] })).toEqual({
      label: 'Preferred Timetable / Schedule', from: 'Not collected', to: 'Monday 16:00–17:00',
    });
  });

  it.each([null, undefined, 'x', {}, { fieldKey: 5 }])('returns null for %p', (payload) => expect(describeFieldChange(payload)).toBeNull());
});
