import { readFileSync } from 'fs';
import { join } from 'path';

import {
  HANDOVER_FIELD_LABELS,
  formatHandoverValue,
  handoverFieldLabel,
  humanizeFieldKey,
  isMeaningfulValue,
  presentHandover,
} from './handover-presentation';

const read = (relative: string) => readFileSync(join(__dirname, relative), 'utf8').replace(/\r\n/g, '\n');
const handoverSource = read('../../../../../api/src/modules/mentoring/mentoring-handover.service.ts');

/** Every field path the backend can report, read from the service itself so a new field cannot slip through unlabelled. */
const takenFields = Array.from(handoverSource.matchAll(/take\('([A-Za-z0-9_.]+)'/g)).map((m) => m[1]);
const notCollectedInSales = Array.from(
  handoverSource.slice(handoverSource.indexOf('const NOT_COLLECTED_IN_SALES'), handoverSource.indexOf('] as const', handoverSource.indexOf('const NOT_COLLECTED_IN_SALES'))).matchAll(/'([A-Za-z0-9_.]+)'/g),
).map((m) => m[1]);
const backendFields = [...takenFields, ...notCollectedInSales, 'academic.subjects'];

const RAW_PATH = /\b(student|parent|academic|tutor|timetable|examination)\.[a-zA-Z0-9]+\b|\b(parentExpectations|studentEngagement)\b/;

const transferred = (field: string, value: unknown) => ({ field, source: 'STUDENT', value });
const subject = { requirementId: 'req-1', subject: 'Mathematics', curriculum: 'CBSE', grade: 'Grade 8', monthlyHours: '12', syllabus: null, notes: null };

describe('field labels', () => {
  it('the backend reports the fields this test expects (guards the parser)', () => {
    expect(takenFields.length).toBeGreaterThanOrEqual(15);
    expect(notCollectedInSales).toHaveLength(9);
  });

  it.each(backendFields)('%s has a business label that is not a raw path', (field) => {
    const label = handoverFieldLabel(field);
    expect(HANDOVER_FIELD_LABELS[field]).toBeDefined();
    expect(label).not.toMatch(RAW_PATH);
    expect(label).not.toContain('.');
    expect(label[0]).toBe(label[0].toUpperCase());
  });

  it('uses the owner-approved wording', () => {
    expect(handoverFieldLabel('student.firstName')).toBe('Student First Name');
    expect(handoverFieldLabel('student.lastName')).toBe('Student Last Name');
    expect(handoverFieldLabel('student.grade')).toBe('Grade / Class');
    expect(handoverFieldLabel('student.curriculum')).toBe('Curriculum / Board');
    expect(handoverFieldLabel('student.notes')).toBe('Student Notes');
    expect(handoverFieldLabel('parent.name')).toBe('Parent / Guardian Name');
    expect(handoverFieldLabel('parent.primaryPhone')).toBe('Parent Contact Number');
    expect(handoverFieldLabel('parent.whatsappNumber')).toBe('Parent WhatsApp Number');
    expect(handoverFieldLabel('parent.relationship')).toBe('Relationship to Student');
    expect(handoverFieldLabel('tutor.assignments')).toBe('Tutor Assignment');
    expect(handoverFieldLabel('academic.preferredLanguage')).toBe('Preferred Language');
    expect(handoverFieldLabel('academic.previousMarks')).toBe('Previous Academic Marks');
    expect(handoverFieldLabel('timetable.schedule')).toBe('Preferred Timetable / Schedule');
    expect(handoverFieldLabel('examination.upcomingDates')).toBe('Upcoming Examination Dates');
    expect(handoverFieldLabel('examination.syllabusPortions')).toBe('Examination Syllabus / Portions');
    expect(handoverFieldLabel('parentExpectations')).toBe('Parent Expectations');
    expect(handoverFieldLabel('studentEngagement')).toBe('Student Engagement');
    expect(handoverFieldLabel('student.dateOfBirth')).toBe('Date of Birth');
    expect(handoverFieldLabel('student.gender')).toBe('Gender');
    expect(handoverFieldLabel('student.schoolName')).toBe('School Name');
  });

  it('a field the mapping does not know yet is humanised, never shown as a raw path', () => {
    expect(humanizeFieldKey('student.favouriteSubject')).toBe('Favourite Subject');
    expect(handoverFieldLabel('exam.nextMock_date')).toBe('Next Mock Date');
    expect(handoverFieldLabel('')).toBe('Additional Information');
  });
});

describe('what counts as collected', () => {
  it.each([null, undefined, '', '   ', '\t\n', 'null', 'undefined', 'NaN', '-', '--', '—', NaN, [], [''], {}, { a: null }])(
    'treats %p as not collected',
    (value) => expect(isMeaningfulValue(value)).toBe(false),
  );

  it.each([0, false, '0', 'No', 'N/A school', 3.5, ['Maths'], { city: 'Pune' }])('treats %p as collected', (value) =>
    expect(isMeaningfulValue(value)).toBe(true),
  );

  it('keeps numeric zero and boolean false as collected values', () => {
    const result = presentHandover({ transferredFields: [transferred('academic.previousMarks', 0), transferred('student.gender', false)], missingFields: [] });
    expect(result.collected.map((f) => [f.label, f.value])).toEqual([
      ['Gender', 'No'],
      ['Previous Academic Marks', '0'],
    ]);
    expect(result.missing).toHaveLength(0);
  });

  it('does not mark a field collected just because the property exists', () => {
    const result = presentHandover({
      transferredFields: [transferred('student.firstName', 'Asha'), transferred('student.lastName', '   '), transferred('student.notes', null), transferred('parent.name', 'undefined')],
      missingFields: [],
    });
    expect(result.collected.map((f) => f.label)).toEqual(['Student First Name']);
    expect(result.missing.map((f) => [f.label, f.status])).toEqual([
      ['Student Last Name', 'NOT_PROVIDED'],
      ['Student Notes', 'NOT_PROVIDED'],
      ['Parent / Guardian Name', 'NOT_PROVIDED'],
    ]);
  });
});

describe('presentHandover', () => {
  const full = {
    transferredFields: [
      transferred('student.firstName', 'Asha'),
      transferred('student.dateOfBirth', '2015-05-12'),
      transferred('parent.primaryPhone', '9876543210'),
      { field: 'academic.subjects', source: 'REQUIREMENT', value: [subject, { ...subject, requirementId: 'req-2', subject: 'Science', monthlyHours: null }] },
    ],
    missingFields: [
      { field: 'parent.relationship', reason: 'NOT_COLLECTED_IN_SALES' },
      { field: 'student.gender', reason: 'NOT_PROVIDED' },
    ],
  };

  it('shows real values with business labels and the right status', () => {
    const { collected, missing } = presentHandover(full);
    expect(collected.map((f) => [f.label, f.value, f.status])).toEqual([
      ['Student First Name', 'Asha', 'COLLECTED'],
      ['Date of Birth', '12 May 2015', 'COLLECTED'],
      ['Parent Contact Number', '9876543210', 'COLLECTED'],
      ['Subjects', 'Mathematics (CBSE · Grade 8) · 12 hrs / month', 'COLLECTED'],
      ['Subjects', 'Science (CBSE · Grade 8)', 'COLLECTED'],
    ]);
    expect(missing.map((f) => [f.label, f.status, f.value])).toEqual([
      ['Gender', 'NOT_PROVIDED', null],
      ['Relationship to Student', 'NOT_COLLECTED_BY_SALES', null],
    ]);
  });

  it('distinguishes "not collected by Sales" from "not provided" with different hints', () => {
    const { missing } = presentHandover(full);
    const bySales = missing.find((f) => f.status === 'NOT_COLLECTED_BY_SALES')!;
    const notProvided = missing.find((f) => f.status === 'NOT_PROVIDED')!;
    expect(bySales.hint).toMatch(/Mentor collects/);
    expect(notProvided.hint).toMatch(/Sales did not enter/);
  });

  it('counts follow the lists exactly, whatever the API sends (not a hard-coded 9 and 16)', () => {
    const many = {
      transferredFields: Array.from({ length: 4 }, (_, i) => transferred(`student.custom${i}`, `value ${i}`)),
      missingFields: Array.from({ length: 3 }, (_, i) => ({ field: `parent.custom${i}`, reason: 'NOT_PROVIDED' })),
    };
    const { collected, missing } = presentHandover(many);
    expect([collected.length, missing.length]).toEqual([4, 3]);
  });

  it('a field is never in both lists', () => {
    const { collected, missing } = presentHandover({
      transferredFields: [transferred('student.firstName', 'Asha')],
      missingFields: [{ field: 'student.firstName', reason: 'NOT_PROVIDED' }, { field: 'student.lastName', reason: 'NOT_PROVIDED' }],
    });
    expect(collected.map((f) => f.key)).toEqual(['student.firstName']);
    expect(missing.map((f) => f.key)).toEqual(['student.lastName']);
  });

  it.each([null, undefined, 'text', 42, {}, { transferredFields: 'x', missingFields: 5 }, { transferredFields: [null, 1, {}, { field: 7 }], missingFields: [null, {}, { field: null }] }])(
    'does not throw for the malformed handover %p',
    (handover) => {
      expect(() => presentHandover(handover)).not.toThrow();
      expect(presentHandover(handover)).toEqual({ collected: [], missing: [] });
    },
  );

  it('an empty subject list is shown as still required, not as collected', () => {
    const { collected, missing } = presentHandover({ transferredFields: [{ field: 'academic.subjects', value: [] }], missingFields: [] });
    expect(collected).toHaveLength(0);
    expect(missing.map((f) => f.label)).toEqual(['Subjects']);
  });

  it('handles long values without altering them', () => {
    const long = 'Needs extra support with fractions and word problems, '.repeat(40) + 'https://example.com/' + 'a'.repeat(200);
    const { collected } = presentHandover({ transferredFields: [transferred('student.notes', long)], missingFields: [] });
    expect(collected[0].value).toBe(long.trim());
  });

  it('never changes the data it is given (the Sales snapshot stays as it was)', () => {
    const input = JSON.parse(JSON.stringify(full));
    const frozen = JSON.stringify(input);
    const deepFreeze = (o: any): any => { Object.values(o).forEach((v) => typeof v === 'object' && v && deepFreeze(v)); return Object.freeze(o); };
    deepFreeze(input);
    expect(() => presentHandover(input)).not.toThrow();
    expect(JSON.stringify(input)).toBe(frozen);
  });

  it('never produces a raw path, JSON braces or [object Object] in anything shown', () => {
    const shown = presentHandover({
      transferredFields: [transferred('student.firstName', 'Asha'), transferred('academic.preferredLanguage', { primary: 'Tamil', secondary: ['English'] })],
      missingFields: notCollectedInSales.map((field) => ({ field, reason: 'NOT_COLLECTED_IN_SALES' })),
    });
    const text = JSON.stringify([...shown.collected, ...shown.missing].map((f) => [f.label, f.value, f.hint]));
    expect(text).not.toMatch(RAW_PATH);
    expect(text).not.toContain('[object Object]');
    expect(shown.collected.find((f) => f.label === 'Preferred Language')?.value).toBe('Primary: Tamil; Secondary: English');
  });
});

describe('formatHandoverValue', () => {
  it('formats a date of birth without a time-zone shift', () => {
    expect(formatHandoverValue('student.dateOfBirth', '2015-01-01')).toBe('1 Jan 2015');
    expect(formatHandoverValue('student.dateOfBirth', '2015-12-31T00:00:00.000Z')).toBe('31 Dec 2015');
  });

  it('shows booleans as Yes/No and keeps zero', () => {
    expect(formatHandoverValue('x', true)).toBe('Yes');
    expect(formatHandoverValue('x', false)).toBe('No');
    expect(formatHandoverValue('x', 0)).toBe('0');
  });
});
