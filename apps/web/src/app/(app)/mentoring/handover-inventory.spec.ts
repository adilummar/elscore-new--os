import { ALL_FIELD_KEYS, FIELD_SECTIONS, buildInventory, buildOverview, matchesFilter } from './handover-inventory';
import { handoverFieldLabel } from './handover-presentation';

const sales = (field: string, value: unknown, source = 'STUDENT') => ({ field, source, value });
const mentoring = (fieldKey: string, value: unknown, over: Record<string, unknown> = {}) => ({
  fieldKey, value, origin: 'MENTOR_COLLECTED', salesValue: null, updatedByName: 'Mina Mentor', updatedAt: '2026-11-03T09:00:00Z', collectedByName: 'Mina Mentor', collectedAt: '2026-11-03T09:00:00Z', ...over,
});
const editor = (key: string, type = 'TEXT') => ({ key, type, options: null, columns: null, maxLength: null, minDate: null, maxDate: null });

const base = (over: Record<string, unknown> = {}) => ({
  transferredFields: [sales('student.firstName', 'Asha'), sales('parent.primaryPhone', '+971500000000', 'LEAD'), sales('student.dateOfBirth', '2015-05-12')],
  missingFields: [{ field: 'parent.relationship', reason: 'NOT_COLLECTED_IN_SALES' }, { field: 'student.gender', reason: 'NOT_PROVIDED' }],
  fieldValues: [], editableFields: [editor('student.firstName'), editor('parent.relationship', 'SELECT'), editor('tutor.requirements', 'TEXTAREA')],
  ...over,
});

const rowOf = (handover: unknown, key: string) => buildInventory(handover).sections.flatMap((s) => s.rows).find((r) => r.fieldKey === key)!;

describe('the field inventory', () => {
  it('covers the whole required list, once each, with a human label for every field', () => {
    expect(ALL_FIELD_KEYS).toHaveLength(33);
    expect(new Set(ALL_FIELD_KEYS).size).toBe(33);
    for (const key of ALL_FIELD_KEYS) expect(handoverFieldLabel(key)).toMatch(/^[A-Z][^.]*$/); // starts with a capital and is never a raw dotted path or camelCase key
    expect(FIELD_SECTIONS.map((s) => s.label)).toEqual(['Student', 'Parent and contact', 'Subjects, tutor and timetable', 'Marks and examinations', 'Student learning profile']);
  });

  it('includes the fields the owner listed', () => {
    const labels = ALL_FIELD_KEYS.map(handoverFieldLabel);
    for (const expected of ['Student First Name', 'Student Last Name', 'Date of Birth', 'Gender', 'School Name', 'Grade / Class', 'Curriculum / Board', 'Parent / Guardian Name', 'Relationship to Student',
      'Primary Contact Number', 'WhatsApp Number', 'Alternate / Emergency Contact Number', 'Preferred Language', 'Subjects Required', 'Other Tutor Requirements', 'Previous Academic Performance',
      'Upcoming Examination Details', 'Academic Difficulties / Weak Areas', 'Specific Learning Requirements', 'Examination Preparation Requirements', 'Preferred Tutor Qualifications / Experience', 'Preferred Teaching Language', 'Preferred Timetable / Schedule', 'Parent Expectations', 'Student Engagement', 'Learning Difficulties or Concerns']) {
      expect(labels).toContain(expected);
    }
  });

  it('counts by field and the counts add up', () => {
    const inventory = buildInventory(base());
    expect(inventory.total).toBe(32); // the 33 fields, less the earlier marks note, which is shown only when it holds something
    expect(inventory.collected).toBe(3);
    expect(inventory.pending).toBe(29);
    expect(inventory.collected + inventory.pending).toBe(inventory.total);
  });

  it('never invents a value: a field with no data is pending with no value', () => {
    for (const key of ['parent.relationship', 'student.gender', 'tutor.requirements', 'academic.preferredLanguage']) {
      expect(rowOf(base(), key)).toMatchObject({ collection: 'PENDING', value: null, rawValue: null });
    }
  });

  it('a blank value, a placeholder and an empty list do not count as collected', () => {
    const inventory = buildInventory(base({ transferredFields: [sales('student.firstName', '   '), sales('student.lastName', 'null'), sales('student.schoolName', '-'), sales('student.cityLocation', [])] }));
    expect(inventory.collected).toBe(0);
  });

  it('a field Sales listed nowhere (added later) is still shown as pending and still gets its input', () => {
    const row = rowOf(base(), 'tutor.requirements');
    expect(row.collection).toBe('PENDING');
    expect(row.editor).toMatchObject({ type: 'TEXTAREA' });
    expect(row.hint).toBe('Not asked during the Sales admission. The Mentor collects this.');
  });

  it('keeps the reason Sales gave for a missing field', () => {
    expect(rowOf(base(), 'student.gender').hint).toBe('Sales did not enter this information.');
  });

  it('puts an unknown field in an Other section instead of dropping it', () => {
    const inventory = buildInventory(base({ transferredFields: [...base().transferredFields, sales('student.hobby', 'Chess')] }));
    const other = inventory.sections.find((s) => s.key === 'other')!;
    expect(other.rows).toEqual([expect.objectContaining({ label: 'Hobby', value: 'Chess' })]);
    expect(inventory.total).toBe(33);
  });

  it('survives missing or malformed input', () => {
    for (const input of [undefined, null, {}, { transferredFields: 'x', missingFields: null, fieldValues: 5, fieldVerifications: 'y', editableFields: {} }]) {
      expect(buildInventory(input).total).toBe(32);
      expect(buildInventory(input).collected).toBe(0);
    }
  });
});

describe('collection status is tracked per field', () => {
  it('a Sales value is collected from Sales', () => {
    expect(rowOf(base(), 'student.firstName')).toMatchObject({ collection: 'FROM_SALES', sourceText: 'Received from Sales', value: 'Asha' });
  });

  it('a Mentor value is collected by the Mentor', () => {
    const row = rowOf(base({ fieldValues: [mentoring('parent.relationship', 'Mother')] }), 'parent.relationship');
    expect(row).toMatchObject({ collection: 'COLLECTED', value: 'Mother' });
    expect(row.sourceText).toMatch(/^Collected by Mina Mentor/);
  });

  it('a correction shows the Mentoring value, who changed it, and the original Sales value', () => {
    const row = rowOf(base({ fieldValues: [mentoring('parent.primaryPhone', '+971501112222', { origin: 'MENTORING_UPDATED', salesValue: '+971500000000' })] }), 'parent.primaryPhone');
    expect(row).toMatchObject({ collection: 'UPDATED', value: '+971501112222', salesValue: '+971500000000' });
    expect(row.sourceText).toMatch(/^Updated by Mina Mentor/);
  });

  it('several Sales subject lines are one field', () => {
    const subjects = sales('academic.subjects', [{ requirementId: 'r1', subject: 'Maths', curriculum: 'CBSE', grade: 'Grade 8' }, { requirementId: 'r2', subject: 'Science', curriculum: 'CBSE', grade: 'Grade 8' }], 'REQUIREMENT');
    const handover = base({ transferredFields: [subjects] });
    expect(buildInventory(handover).collected).toBe(1);
    expect(rowOf(handover, 'academic.subjects').value).toBe('Maths (CBSE · Grade 8)\nScience (CBSE · Grade 8)');
  });

  it('the subjects row carries the whole stored list, so saving it is not refused as changed by someone else', () => {
    const list = [{ requirementId: 'r1', subject: 'Maths', curriculum: 'CBSE', grade: 'Grade 8' }, { requirementId: 'r2', subject: 'Science', curriculum: 'CBSE', grade: 'Grade 8' }];
    const handover = base({ transferredFields: [sales('academic.subjects', list, 'REQUIREMENT')] });
    // This is the value the page sends as "based on"; the API compares it with the stored Sales value for the field.
    expect(rowOf(handover, 'academic.subjects').rawValue).toEqual(list);
  });
});

describe('the Stage 1 overview', () => {
  it('lists what Sales sent, with where it came from, and what is still required', () => {
    const overview = buildOverview(base());
    expect(overview.received.map((r) => [r.label, r.value, r.note])).toEqual([
      ['Student First Name', 'Asha', 'Sales student record'],
      ['Date of Birth', '12 May 2015', 'Sales student record'],
      ['Primary Contact Number', '+971500000000', 'Sales lead record'],
    ]);
    expect(overview.required).toHaveLength(29);
    expect(overview.received.length + overview.required.length + overview.collectedSince).toBe(32);
  });

  it('always shows the value Sales sent, never a Mentoring correction', () => {
    const overview = buildOverview(base({ fieldValues: [mentoring('parent.primaryPhone', '+971501112222', { origin: 'MENTORING_UPDATED', salesValue: '+971500000000' })] }));
    const phone = overview.received.find((r) => r.fieldKey === 'parent.primaryPhone')!;
    expect(phone.value).toBe('+971500000000');
    expect(phone.changedSince).toBe(true);
  });

  it('a field collected by the Mentor leaves "still required" and is counted separately', () => {
    const overview = buildOverview(base({ fieldValues: [mentoring('parent.relationship', 'Mother')] }));
    expect(overview.required.map((r) => r.fieldKey)).not.toContain('parent.relationship');
    expect(overview.collectedSince).toBe(1);
    expect(overview.received).toHaveLength(3);
  });

  it('does not change its input', () => {
    const input = base({ fieldValues: [mentoring('parent.relationship', 'Mother')] });
    const frozen = JSON.stringify(input);
    buildOverview(input);
    buildInventory(input);
    expect(JSON.stringify(input)).toBe(frozen);
  });
});

describe('the Stage 2 filters', () => {
  // Pending (relationship), collected from Sales (first name, date of birth), updated by Mentoring (phone), collected by the Mentor (gender).
  const handover = base({
    fieldValues: [mentoring('parent.primaryPhone', '+971501112222', { origin: 'MENTORING_UPDATED', salesValue: '+971500000000' }), mentoring('student.gender', 'Female')],
  });
  const rows = buildInventory(handover).sections.flatMap((s) => s.rows);
  const keys = (filter: Parameters<typeof matchesFilter>[0]) => rows.filter((r) => matchesFilter(filter, r)).map((r) => r.fieldKey);

  it('All shows every field', () => {
    expect(keys('ALL')).toHaveLength(32);
  });

  it('Pending collection shows only fields with no value', () => {
    expect(keys('PENDING')).toContain('parent.relationship');
    expect(keys('PENDING')).not.toContain('student.firstName');
    expect(keys('PENDING')).toHaveLength(32 - 4);
  });

  it('the filter counts match the summary', () => {
    const inventory = buildInventory(handover);
    expect([inventory.total, inventory.collected, inventory.pending]).toEqual([32, 4, 28]);
    expect(keys('PENDING').length).toBe(inventory.pending);
  });

  it('there is no per-field verification status or filter any more', () => {
    const row = rows[0] as unknown as Record<string, unknown>;
    expect('verification' in row).toBe(false);
    expect('verifiedText' in row).toBe(false);
  });

});

describe('where a pending field says it came from', () => {
  it('says Sales did not provide it when Sales listed it as left blank, and not collected when Sales never asked', () => {
    expect(rowOf(base(), 'student.gender').sourceText).toBe('Not provided by Sales');
    expect(rowOf(base(), 'parent.relationship').sourceText).toBe('Not collected by Sales');
    expect(rowOf(base(), 'tutor.requirements').sourceText).toBe('Not collected by Sales');
  });
});

describe('optional fields', () => {
  const OPTIONAL = ['student.lastName', 'student.dateOfBirth', 'student.schoolName', 'student.cityLocation', 'tutor.requirements'];
  const withOptional = () => base({ editableFields: OPTIONAL.map((key) => ({ ...editor(key, key === 'tutor.requirements' ? 'TEXTAREA' : 'TEXT'), optional: true })) });

  it('an empty optional field is shown, but it is not counted as still to collect', () => {
    const inventory = buildInventory(withOptional());
    expect(inventory.optionalPending).toBe(4); // date of birth came from Sales, so it is not empty
    expect(inventory.pending).toBe(32 - 3 - 4); // the 3 collected fields and the 4 empty optional ones are not outstanding
    expect(rowOf(withOptional(), 'student.lastName')).toMatchObject({ optional: true, collection: 'PENDING' });
    expect(rowOf(withOptional(), 'student.gender')).toMatchObject({ optional: false });
  });

  it('the Stage 1 overview lists them apart from what is still required', () => {
    const overview = buildOverview(withOptional());
    expect(overview.optional.map((r) => r.fieldKey).sort()).toEqual(OPTIONAL.filter((k) => k !== 'student.dateOfBirth').sort());
    expect(overview.required.some((r) => OPTIONAL.includes(r.fieldKey))).toBe(false);
  });

  it('the retired second grade field is never offered, even when an earlier handover carries it', () => {
    const old = base({ transferredFields: [sales('student.currentGrade', '8'), sales('student.firstName', 'Asha')], missingFields: [] });
    expect(buildInventory(old).sections.flatMap((s) => s.rows).some((r) => r.fieldKey === 'student.currentGrade')).toBe(false);
    expect(buildInventory(old).sections.some((s) => s.key === 'other')).toBe(false);
    expect(buildOverview(old).received.some((r) => r.fieldKey === 'student.currentGrade')).toBe(false);
    expect(FIELD_SECTIONS.flatMap((s) => s.fields)).not.toContain('student.currentGrade');
  });
});
