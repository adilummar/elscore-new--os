import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import {
  Draft, ProfileField, auditLine, auditValue, changesOf, displayOf, draftOf, isDirty, problemWith, problemsOf, submitProfile,
} from './profile-form';
import { EditProfileDialog } from './students/[id]/EditProfileDialog';

jest.mock('./mentoring-client', () => ({ mentoringApi: jest.fn().mockResolvedValue({}) }));
jest.mock('@/components/ui/Button', () => ({ Button: ({ children, isLoading, ...rest }: any) => React.createElement('button', rest, children) }));

const f = (key: string, over: Partial<ProfileField> = {}): ProfileField => ({
  key, label: key, group: key.startsWith('parent.') ? 'PARENT' : key.startsWith('student.') ? 'STUDENT' : 'ACADEMIC', type: 'TEXT', options: null, maxLength: 100, minDate: null, maxDate: null,
  required: false, value: null, salesValue: null, source: 'SALES', ...over,
});
const FIELDS: ProfileField[] = [
  f('student.firstName', { label: 'Student First Name', required: true, value: 'Asha' }),
  f('student.dateOfBirth', { label: 'Date of Birth', type: 'DATE', minDate: '1990-01-01', maxDate: 'TODAY', value: '2015-05-12' }),
  f('student.gender', { label: 'Gender', type: 'SELECT', options: ['Male', 'Female', 'Other'], value: null }),
  f('student.schoolName', { label: 'School Name', value: 'Old School' }),
  f('student.notes', { label: 'Student Notes', type: 'TEXTAREA', maxLength: 2000 }),
  f('parent.name', { label: 'Parent Name', required: true, value: 'Parent One' }),
  f('parent.primaryPhone', { label: 'Parent Contact Number', type: 'PHONE', required: true, value: '+971500000000' }),
  f('parent.relationship', { label: 'Relationship', type: 'SELECT', options: ['Mother', 'Father', 'Guardian', 'Other'] }),
  f('academic.previousMarks', { label: 'Previous Marks', type: 'TEXTAREA' }),
];

describe('field-level validation', () => {
  it('shows saved values and n/a for a missing one', () => {
    expect(draftOf(FIELDS)['student.schoolName']).toBe('Old School');
    expect(draftOf(FIELDS)['student.gender']).toBe('');
    expect(displayOf(null)).toBe('n/a');
    expect(displayOf('  ')).toBe('n/a');
  });

  it('applies the same rules as the API, with a message for each', () => {
    const p = (key: string, text: string) => problemWith(FIELDS.find((x) => x.key === key)!, text, '2026-11-16');
    expect(p('student.firstName', '')).toContain('cannot be empty');
    expect(p('student.schoolName', '')).toContain('cannot be empty'); // a saved value cannot be blanked
    expect(p('student.notes', '')).toBeNull(); // an empty optional field is fine
    expect(p('student.firstName', 'x'.repeat(101))).toContain('100 characters');
    expect(p('student.firstName', 'Ash\nwin')).toContain('not allowed');
    expect(p('parent.primaryPhone', 'abc')).toContain('only digits');
    expect(p('parent.primaryPhone', '12345')).toContain('10 to 15 digits');
    expect(p('parent.primaryPhone', '+971 50 111 2222')).toBeNull();
    expect(p('student.dateOfBirth', '2999-01-01')).toContain('future');
    expect(p('student.dateOfBirth', '1980-01-01')).toContain('before');
    expect(p('student.dateOfBirth', '2015-02-30')).toContain('real calendar date');
    expect(p('student.gender', 'Robot')).toContain('Choose one');
    expect(p('student.gender', 'female')).toBeNull();
  });

  it('collects every problem, so none is hidden behind another', () => {
    const d: Draft = { ...draftOf(FIELDS), 'student.firstName': '', 'parent.primaryPhone': 'x' };
    expect(Object.keys(problemsOf(FIELDS, d, '2026-11-16')).sort()).toEqual(['parent.primaryPhone', 'student.firstName']);
  });
});

describe('what is sent', () => {
  it('sends only the fields that changed, each with the value it was based on, and nothing else', () => {
    const d = { ...draftOf(FIELDS), 'student.schoolName': 'New School', 'parent.relationship': 'Mother' };
    expect(changesOf(FIELDS, d)).toEqual({ changes: { 'student.schoolName': 'New School', 'parent.relationship': 'Mother' }, basedOn: { 'student.schoolName': 'Old School', 'parent.relationship': null } });
    expect(isDirty(FIELDS, draftOf(FIELDS))).toBe(false);
    expect(isDirty(FIELDS, d)).toBe(true);
  });

  it('never sends a blanked field, so a saved value cannot be wiped by accident', () => {
    expect(changesOf(FIELDS, { ...draftOf(FIELDS), 'student.schoolName': '' }).changes).toEqual({});
  });
});

describe('saving', () => {
  const edited = (): Draft => ({ ...draftOf(FIELDS), 'student.schoolName': 'New School' });

  it('sends the change once and reports what was saved', async () => {
    const send = jest.fn().mockResolvedValue({ changed: ['student.schoolName'] });
    const r = await submitProfile({ fields: FIELDS, draft: edited(), reason: ' moved ' }, { busy: false }, send);
    expect(r).toEqual({ kind: 'saved', changed: ['student.schoolName'] });
    expect(send).toHaveBeenCalledWith({ changes: { 'student.schoolName': 'New School' }, basedOn: { 'student.schoolName': 'Old School' }, reason: 'moved' });
  });

  it('prevents a duplicate submission while one is in flight', async () => {
    let release!: (v: { changed: string[] }) => void;
    const send = jest.fn(() => new Promise<{ changed: string[] }>((res) => { release = res; }));
    const gate = { busy: false };
    const first = submitProfile({ fields: FIELDS, draft: edited(), reason: '' }, gate, send);
    const second = await submitProfile({ fields: FIELDS, draft: edited(), reason: '' }, gate, send);
    expect(second).toEqual({ kind: 'busy' });
    release({ changed: ['student.schoolName'] });
    expect((await first).kind).toBe('saved');
    expect(send).toHaveBeenCalledTimes(1);
    expect(gate.busy).toBe(false); // and it can be saved again afterwards
  });

  it('sends nothing when a value is invalid or nothing changed, and keeps the form as it was', async () => {
    const send = jest.fn();
    expect((await submitProfile({ fields: FIELDS, draft: { ...edited(), 'parent.primaryPhone': 'x' }, reason: '' }, { busy: false }, send)).kind).toBe('invalid');
    expect((await submitProfile({ fields: FIELDS, draft: draftOf(FIELDS), reason: '' }, { busy: false }, send)).kind).toBe('nothing');
    expect(send).not.toHaveBeenCalled();
  });

  it('shows the API message when the save is refused, and releases the gate so it can be retried', async () => {
    const gate = { busy: false };
    const r = await submitProfile({ fields: FIELDS, draft: edited(), reason: '' }, gate, jest.fn().mockRejectedValue(new Error('This information was changed by someone else since you opened it.')));
    expect(r).toEqual({ kind: 'failed', message: 'This information was changed by someone else since you opened it.' });
    expect(gate.busy).toBe(false);
    expect((await submitProfile({ fields: FIELDS, draft: edited(), reason: '' }, gate, jest.fn().mockRejectedValue('x'))).kind).toBe('failed');
  });
});

describe('the dialog', () => {
  const html = renderToStaticMarkup(React.createElement(EditProfileDialog, { activationId: 'a1', fields: FIELDS, onClose: () => undefined, onSaved: () => undefined }));

  it('is an accessible modal with a title, and offers Save changes and Cancel', () => {
    expect(html).toContain('role="dialog"');
    expect(html).toContain('aria-modal="true"');
    expect(html).toContain('aria-labelledby="edit-profile-title"');
    expect(html).toContain('Save changes');
    expect(html).toContain('Cancel');
    expect(html).toContain('disabled=""'); // Save is off until something changes
  });

  it('groups the fields into Student Details and Parent / Guardian Details and offers every supported field', () => {
    expect(html).toContain('Student Details');
    expect(html).toContain('Parent / Guardian Details');
    expect(html).toContain('Academic Profile');
    for (const field of FIELDS) expect(html).toContain(`id="pf-${field.key}"`);
  });

  it('fills in the saved values, marks required fields and uses the right input for each type', () => {
    expect(html).toContain('value="Old School"');
    expect(html).toContain('value="2015-05-12"');
    expect(html).toContain('type="date"');
    expect(html).toContain('type="tel"');
    expect(html).toContain('<textarea');
    expect(html).toContain('<select');
    expect(html).toContain('(required)');
    expect(html).toContain('Reason for the change');
  });

  it('is a full-screen sheet on a phone and a centred dialog from the small breakpoint up, with 44px touch targets', () => {
    expect(html).toContain('h-full w-full');
    expect(html).toContain('sm:max-w-3xl');
    expect(html).toContain('sm:grid-cols-2');
    expect(html).toContain('min-h-11');
    expect(html).not.toContain('overflow-x');
  });
});

describe('the audit history', () => {
  it('masks phone numbers and dates of birth, and cuts long text', () => {
    expect(auditValue('parent.primaryPhone', '+971500001234')).toBe('••••234');
    expect(auditValue('student.dateOfBirth', '2015-05-12')).toBe('2015');
    expect(auditValue('student.notes', 'x'.repeat(80))).toHaveLength(60);
    expect(auditValue('student.schoolName', null)).toBe('n/a');
  });

  it('summarises a change as before and after, with a reason and a note when a confirmation ended', () => {
    expect(auditLine({ fieldKey: 'student.schoolName', previous: 'Old School', next: 'New School', remarks: 'Moved', verificationInvalidated: true })).toBe('Old School to New School · confirmation ended · Moved');
    expect(auditLine({ fieldKey: 'parent.primaryPhone', previous: '+971500000000', next: '+971501112222' })).toBe('••••000 to ••••222');
    expect(auditLine(null)).toBeNull();
  });
});
