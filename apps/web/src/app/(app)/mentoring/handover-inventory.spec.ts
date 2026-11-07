import { ALL_FIELD_KEYS, FIELD_SECTIONS, buildInventory, buildOverview } from './handover-inventory';
import { handoverFieldLabel } from './handover-presentation';

const sales = (field: string, value: unknown, source = 'STUDENT') => ({ field, source, value });
const mentoring = (fieldKey: string, value: unknown, over: Record<string, unknown> = {}) => ({
  fieldKey, value, origin: 'MENTOR_COLLECTED', salesValue: null, updatedByName: 'Mina Mentor', updatedAt: '2026-11-03T09:00:00Z', collectedByName: 'Mina Mentor', collectedAt: '2026-11-03T09:00:00Z', ...over,
});
const editor = (key: string, type = 'TEXT') => ({ key, type, options: null, columns: null, maxLength: null, minDate: null, maxDate: null });

const base = (over: Record<string, unknown> = {}) => ({
  transferredFields: [sales('student.firstName', 'Asha'), sales('parent.primaryPhone', '+971500000000', 'LEAD'), sales('student.dateOfBirth', '2015-05-12')],
  missingFields: [{ field: 'parent.relationship', reason: 'NOT_COLLECTED_IN_SALES' }, { field: 'student.gender', reason: 'NOT_PROVIDED' }],
  fieldValues: [], fieldVerifications: [], editableFields: [editor('student.firstName'), editor('parent.relationship', 'SELECT'), editor('tutor.requirements', 'TEXTAREA')],
  ...over,
});

const rowOf = (handover: unknown, key: string) => buildInventory(handover).sections.flatMap((s) => s.rows).find((r) => r.fieldKey === key)!;

describe('the field inventory', () => {
  it('covers the whole required list, once each, with a human label for every field', () => {
    expect(ALL_FIELD_KEYS).toHaveLength(28);
    expect(new Set(ALL_FIELD_KEYS).size).toBe(28);
    for (const key of ALL_FIELD_KEYS) expect(handoverFieldLabel(key)).toMatch(/^[A-Z][^.]*$/); // starts with a capital and is never a raw dotted path or camelCase key
    expect(FIELD_SECTIONS.map((s) => s.label)).toEqual(['Student', 'Parent and contact', 'Subjects, tutor and timetable', 'Marks and examinations', 'Expectations and engagement']);
  });

  it('includes the fields the owner listed', () => {
    const labels = ALL_FIELD_KEYS.map(handoverFieldLabel);
    for (const expected of ['Student First Name', 'Student Last Name', 'Date of Birth', 'Gender', 'School Name', 'Grade / Class', 'Curriculum / Board', 'Parent / Guardian Name', 'Relationship to Student',
      'Parent Contact Number', 'Parent WhatsApp Number', 'Alternate Contact Number 1', 'Alternate Contact Number 2', 'Preferred Language', 'Subjects', 'Tutor Requirements', 'Previous Academic Marks',
      'Upcoming Examination Dates', 'Examination Syllabus / Portions', 'Preferred Timetable / Schedule', 'Parent Expectations', 'Student Engagement', 'Learning Difficulties or Concerns']) {
      expect(labels).toContain(expected);
    }
  });

  it('counts by field and the counts add up', () => {
    const inventory = buildInventory(base());
    expect(inventory.total).toBe(28);
    expect(inventory.collected).toBe(3);
    expect(inventory.pending).toBe(25);
    expect(inventory.collected + inventory.pending).toBe(inventory.total);
    expect(inventory.verified + inventory.unverified).toBe(inventory.collected);
  });

  it('never invents a value: a field with no data is pending with no value', () => {
    for (const key of ['parent.relationship', 'student.gender', 'tutor.requirements', 'academic.preferredLanguage']) {
      expect(rowOf(base(), key)).toMatchObject({ collection: 'PENDING', value: null, rawValue: null, verification: 'NOT_VERIFIED', verifiedText: null });
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
    expect(inventory.total).toBe(29);
  });

  it('survives missing or malformed input', () => {
    for (const input of [undefined, null, {}, { transferredFields: 'x', missingFields: null, fieldValues: 5, fieldVerifications: 'y', editableFields: {} }]) {
      expect(buildInventory(input).total).toBe(28);
      expect(buildInventory(input).collected).toBe(0);
    }
  });
});

describe('collection status and verification status are tracked separately', () => {
  it('a Sales value is collected from Sales and not verified', () => {
    expect(rowOf(base(), 'student.firstName')).toMatchObject({ collection: 'FROM_SALES', sourceText: 'Received from Sales', verification: 'NOT_VERIFIED', value: 'Asha' });
  });

  it('a Mentor value is collected by the Mentor and still not verified', () => {
    const row = rowOf(base({ fieldValues: [mentoring('parent.relationship', 'Mother')] }), 'parent.relationship');
    expect(row).toMatchObject({ collection: 'COLLECTED', value: 'Mother', verification: 'NOT_VERIFIED' });
    expect(row.sourceText).toMatch(/^Collected by Mina Mentor/);
  });

  it('a correction shows the Mentoring value, who changed it, and the original Sales value', () => {
    const row = rowOf(base({ fieldValues: [mentoring('parent.primaryPhone', '+971501112222', { origin: 'MENTORING_UPDATED', salesValue: '+971500000000' })] }), 'parent.primaryPhone');
    expect(row).toMatchObject({ collection: 'UPDATED', value: '+971501112222', salesValue: '+971500000000' });
    expect(row.sourceText).toMatch(/^Updated by Mina Mentor/);
  });

  it('a confirmation turns the row to verified and says who confirmed it', () => {
    const handover = base({ fieldVerifications: [{ fieldKey: 'student.firstName', verified: true, changedSinceVerified: false, verifiedByName: 'Mina Mentor', verifiedAt: '2026-11-03T09:10:00Z' }] });
    expect(rowOf(handover, 'student.firstName')).toMatchObject({ collection: 'FROM_SALES', verification: 'VERIFIED' });
    expect(rowOf(handover, 'student.firstName').verifiedText).toMatch(/^Verified by Mina Mentor/);
    const counts = buildInventory(handover);
    expect([counts.verified, counts.unverified]).toEqual([1, 2]);
  });

  it('a confirmation the value has outgrown is shown as changed and does not count as verified', () => {
    const handover = base({ fieldVerifications: [{ fieldKey: 'student.firstName', verified: false, changedSinceVerified: true, verifiedByName: 'Mina Mentor', verifiedAt: '2026-11-03T09:10:00Z' }] });
    expect(rowOf(handover, 'student.firstName')).toMatchObject({ verification: 'CHANGED', verifiedText: 'Changed since it was verified' });
    expect(buildInventory(handover).verified).toBe(0);
  });

  it('a pending field cannot be verified, even if a stale confirmation exists', () => {
    const handover = base({ fieldVerifications: [{ fieldKey: 'parent.relationship', verified: true, changedSinceVerified: false }] });
    expect(rowOf(handover, 'parent.relationship')).toMatchObject({ collection: 'PENDING', verification: 'NOT_VERIFIED' });
    expect(buildInventory(handover).verified).toBe(0);
  });

  it('several Sales subject lines are one field', () => {
    const subjects = sales('academic.subjects', [{ requirementId: 'r1', subject: 'Maths', curriculum: 'CBSE', grade: 'Grade 8' }, { requirementId: 'r2', subject: 'Science', curriculum: 'CBSE', grade: 'Grade 8' }], 'REQUIREMENT');
    const handover = base({ transferredFields: [subjects] });
    expect(buildInventory(handover).collected).toBe(1);
    expect(rowOf(handover, 'academic.subjects').value).toBe('Maths (CBSE · Grade 8)\nScience (CBSE · Grade 8)');
  });
});

describe('the Stage 1 overview', () => {
  it('lists what Sales sent, with where it came from, and what is still required', () => {
    const overview = buildOverview(base());
    expect(overview.received.map((r) => [r.label, r.value, r.note])).toEqual([
      ['Student First Name', 'Asha', 'Sales student record'],
      ['Date of Birth', '12 May 2015', 'Sales student record'],
      ['Parent Contact Number', '+971500000000', 'Sales lead record'],
    ]);
    expect(overview.required).toHaveLength(25);
    expect(overview.received.length + overview.required.length + overview.collectedSince).toBe(28);
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
