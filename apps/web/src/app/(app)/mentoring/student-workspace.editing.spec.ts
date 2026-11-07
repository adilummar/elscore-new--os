import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { StudentWorkspaceClient } from './students/[id]/StudentWorkspaceClient';

jest.mock('./mentoring-client', () => ({ mentoringApi: jest.fn().mockResolvedValue({}) }));

/**
 * Stage 2, Meeting with Parents, is the working stage: everything already known and everything still pending on one
 * page, edited in place, with a separate checklist that records what the Mentor confirmed with the parent.
 */
const meta = (key: string, type: string, extra: Record<string, unknown> = {}) => ({ key, type, options: null, columns: null, maxLength: null, minDate: null, maxDate: null, ...extra });
const item = (key: string, over: Record<string, unknown> = {}) => ({
  key, label: `Item ${key}`, mandatory: true, state: 'PENDING_COLLECTION', value: null, note: null, reason: null, evidenceRef: null, requires: [],
  group: null, groupLabel: null, exception: false, exceptionDetail: null, updatedByUserId: null, updatedByName: null, updatedAt: null, ...over,
});
const G1 = { group: 'confirm_information', groupLabel: 'Confirmed with the parent' };
const G2 = { group: 'meeting_conduct', groupLabel: 'Meeting and follow-up' };

const checklist = () => [
  item('c1', { ...G1, label: 'Student and parent details verified', state: 'VERIFIED', updatedByName: 'Mina Mentor', updatedAt: '2026-11-03T09:00:00Z', note: 'Checked against the form', evidenceRef: 'https://files.example/form', requires: [{ key: 'student.firstName', label: 'Student First Name', collected: true }] }),
  item('c2', { ...G1, label: 'Parent relationship confirmed', requires: [{ key: 'parent.relationship', label: 'Relationship to Student', collected: false }] }),
  item('c3', { ...G1, label: 'Contact information verified', requires: [{ key: 'parent.primaryPhone', label: 'Parent Contact Number', collected: true }] }),
  item('c4', { ...G1, label: 'Previous marks collected', state: 'UNAVAILABLE', reason: 'School has not issued marks', requires: [{ key: 'academic.previousMarks', label: 'Previous Academic Marks', collected: false }] }),
  item('c5', { ...G2, label: 'Meeting notes recorded', exception: true, exceptionDetail: { reason: 'Parent asked for a call later', authorizedByName: 'Hari Head', at: '2026-11-03T10:00:00Z' } }),
  item('c6', { ...G2, label: 'Methodology explained', state: 'COLLECTED' }),
];

const handover = () => ({
  completedAt: '2026-10-30T08:00:00Z',
  transferredFields: [
    { field: 'student.firstName', source: 'STUDENT', value: 'Asha' },
    { field: 'parent.primaryPhone', source: 'LEAD', value: '+971500000000' },
    { field: 'academic.subjects', source: 'REQUIREMENT', value: [{ requirementId: 'r1', subject: 'Mathematics', curriculum: 'CBSE', grade: 'Grade 8', monthlyHours: '8' }] },
  ],
  missingFields: [{ field: 'parent.relationship', reason: 'NOT_COLLECTED_IN_SALES' }, { field: 'student.gender', reason: 'NOT_PROVIDED' }],
  fieldValues: [
    { fieldKey: 'parent.primaryPhone', value: '+971501112222', origin: 'MENTORING_UPDATED', salesValue: '+971500000000', updatedByName: 'Mina Mentor', updatedAt: '2026-11-03T09:30:00Z', collectedByName: 'Mina Mentor', collectedAt: '2026-11-03T09:30:00Z' },
    { fieldKey: 'student.gender', value: 'Female', origin: 'MENTOR_COLLECTED', salesValue: null, updatedByName: 'Mina Mentor', updatedAt: '2026-11-03T09:40:00Z', collectedByName: 'Mina Mentor', collectedAt: '2026-11-03T09:40:00Z' },
  ],
  fieldVerifications: [
    { fieldKey: 'student.firstName', verified: true, changedSinceVerified: false, verifiedByName: 'Mina Mentor', verifiedAt: '2026-11-03T09:10:00Z' },
    { fieldKey: 'parent.primaryPhone', verified: false, changedSinceVerified: true, verifiedByName: 'Mina Mentor', verifiedAt: '2026-11-03T09:05:00Z' },
  ],
  editableFields: [
    meta('student.firstName', 'TEXT'), meta('parent.primaryPhone', 'PHONE'), meta('student.gender', 'SELECT', { options: ['Male', 'Female', 'Other'] }),
    meta('parent.relationship', 'SELECT', { options: ['Mother', 'Father', 'Guardian', 'Other'] }),
    meta('tutor.requirements', 'TEXTAREA', { maxLength: 2000 }),
    meta('examination.upcomingDates', 'ROWS', { columns: [{ key: 'subject', label: 'Subject / exam', type: 'text', required: true }, { key: 'date', label: 'Date', type: 'date', required: true }] }),
  ],
});

const MENTOR = { userId: 'mentor-1', isMentor: true, isHead: false, canEditHandover: true };
const HEAD = { userId: 'head-1', isMentor: false, isHead: true, canEditHandover: false };
const CEO = { userId: 'ceo-1', isMentor: false, isHead: false, canEditHandover: false };
const COUNSELOR = { userId: 'dc-1', isMentor: false, isHead: false, canEditHandover: false };

const stages = (stage2Checklist: any[] = checklist(), stage2Status = 'IN_PROGRESS') => [
  { number: 1, name: 'Admission Handover', status: 'COMPLETED', checklist: [item('missing_info_identified', { state: 'VERIFIED' })] },
  { number: 2, name: 'Meeting with Parents', status: stage2Status, checklist: stage2Checklist },
  ...[3, 4, 5, 6, 7].map((n) => ({ number: n, name: `Stage ${n}`, status: 'NOT_STARTED', checklist: [] })),
];

const workspace = (viewer: any, over: Record<string, unknown> = {}) => ({
  activation: { id: 'a1', status: 'ACTIVATION_IN_PROGRESS', currentStage: 2, currentMentorUserId: 'mentor-1', currentMentorName: 'Mina Mentor' },
  student: { firstName: 'Asha', lastName: 'Menon', businessId: 'STU-0001' },
  parent: { name: 'Priya', primaryPhone: '+971501112222' },
  stages: stages(), viewer, openHold: null, handover: handover(), legacyStage1Items: [], tasks: [], events: [], ...over,
});

const render = (ws: any) => renderToStaticMarkup(React.createElement(StudentWorkspaceClient, { activationId: 'a1', initialWorkspace: ws }));
const text = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
const count = (html: string, needle: string) => html.split(needle).length - 1;
const enabledCheckboxes = (html: string) => (html.match(/<input[^>]*type="checkbox"[^>]*>/g) ?? []).filter((tag) => !/\sdisabled=""/.test(tag)).length;
const row = (html: string, fieldKey: string) => new RegExp(`<li[^>]*data-field="${fieldKey.replace('.', '\\.')}".*?</li>`, 's').exec(html)?.[0] ?? '';
const verifyButton = /<button[^>]*\sdisabled=""[^>]*>(?:<[^>]*>)*Verify and complete stage 2/;

describe('Stage 2 shows all the information, existing and pending, on one page', () => {
  const html = render(workspace(MENTOR));
  const t = text(html);

  it('lists every field the Mentoring workflow needs, once, in sections', () => {
    expect(count(html, 'data-field="')).toBe(28);
    for (const section of ['Student', 'Parent and contact', 'Subjects, tutor and timetable', 'Marks and examinations', 'Expectations and engagement']) expect(t).toContain(section);
    for (const label of ['Student First Name', 'Student Last Name', 'Date of Birth', 'Gender', 'School Name', 'Grade / Class', 'Curriculum / Board', 'Parent / Guardian Name', 'Relationship to Student',
      'Parent Contact Number', 'Parent WhatsApp Number', 'Alternate Contact Number 1', 'Preferred Language', 'Subjects', 'Tutor Requirements', 'Previous Academic Marks',
      'Upcoming Examination Dates', 'Examination Syllabus / Portions', 'Preferred Timetable / Schedule', 'Parent Expectations', 'Student Engagement', 'Learning Difficulties or Concerns']) {
      expect(t).toContain(label);
    }
  });

  it('shows the real value, source, who changed it and the original Sales value', () => {
    expect(row(html, 'student.firstName')).toContain('Asha');
    expect(text(row(html, 'student.firstName'))).toContain('Received from Sales');
    expect(text(row(html, 'parent.primaryPhone'))).toContain('+971501112222');
    expect(text(row(html, 'parent.primaryPhone'))).toContain('Updated by Mina Mentor');
    expect(text(row(html, 'parent.primaryPhone'))).toContain('Sales value: +971500000000');
    expect(text(row(html, 'student.gender'))).toContain('Collected by Mina Mentor');
    expect(text(row(html, 'academic.subjects'))).toContain('Mathematics (CBSE · Grade 8) · 8 hrs / month');
  });

  it('marks every missing field as pending collection with a small red indicator', () => {
    const pending = count(html, 'data-status="pending"');
    expect(pending).toBe(24);
    expect(count(html, '>Pending collection<')).toBe(24);
    expect(html).toContain('text-red-700');
    expect(text(row(html, 'parent.relationship'))).toContain('Pending collection');
  });

  it('counts collected, pending and verified from the real data', () => {
    expect(t).toContain('4 of 28 collected, 24 pending, 1 verified in the meeting');
    expect(t).toContain('All 28');
    expect(t).toContain('Pending collection 24');
    expect(t).toContain('Not verified 3');
  });

  it('exposes no raw field path', () => {
    expect(t).not.toMatch(/student\.firstName|parent\.primaryPhone|parent\.relationship|academic\.subjectNotes|tutor\.requirements/);
    expect(html).not.toContain('[object Object]');
  });

  it('is laid out as two columns on a wide screen and one column on a phone, with a link to the checklist', () => {
    expect(html).toContain('lg:grid-cols-[minmax(0,1fr)_26rem]');
    expect(html).toContain('href="#meeting-checklist"');
    expect(html).toContain('id="meeting-checklist"');
    expect(html).toContain('[overflow-wrap:anywhere]');
  });
});

describe('Collection status and verification status are separate', () => {
  const html = render(workspace(MENTOR));

  it('a collected value is not verified until the Mentor confirms it', () => {
    expect(text(row(html, 'student.firstName'))).toContain('Verified by Mina Mentor');
    expect(text(row(html, 'student.gender'))).toContain('Not verified in the meeting');
    expect(text(row(html, 'academic.subjects'))).toContain('Not verified in the meeting');
  });

  it('a value that changed after it was verified is shown as changed, not as verified', () => {
    expect(text(row(html, 'parent.primaryPhone'))).toContain('Changed since it was verified');
    expect(text(row(html, 'parent.primaryPhone'))).not.toContain('Verified by');
  });

  it('a pending field offers no verification', () => {
    expect(row(html, 'parent.relationship')).not.toContain('>Verify<');
    expect(row(html, 'parent.relationship')).not.toContain('Verified');
  });

  it('having all the information a checklist item depends on does not complete it', () => {
    const contact = /<li[^>]*data-item="c3".*?<\/li>/s.exec(html)![0];
    expect(contact).toMatch(/aria-label="Contact information verified: not completed"/);
    expect(contact).not.toMatch(/disabled=""/); // everything it needs is collected, so the Mentor may confirm it
    expect(contact).not.toMatch(/checked/);
  });
});

describe('inline editing and collecting', () => {
  it('the assigned Mentor can edit and verify collected information, and collect pending information in place', () => {
    const html = render(workspace(MENTOR));
    expect(count(html, '>Edit<')).toBe(3); // first name, parent phone, gender. The Sales subject list is locked.
    expect(count(html, '>Verify<')).toBe(3); // parent phone (changed), gender, subjects
    expect(count(html, '>Undo verification<')).toBe(1); // first name
    // Pending fields show an input suited to the field type straight away.
    expect(row(html, 'parent.relationship')).toMatch(/<select[^>]*aria-label="Relationship to Student"/);
    expect(row(html, 'tutor.requirements')).toMatch(/<textarea[^>]*aria-label="Tutor Requirements"/);
    expect(row(html, 'examination.upcomingDates')).toContain('>Collect<'); // a table of rows opens on demand
    // Nothing to save until something is typed.
    expect(row(html, 'parent.relationship')).not.toContain('>Save<');
  });

  it('fields without an input definition cannot be edited, and the Sales subject list says why', () => {
    const html = render(workspace(MENTOR));
    expect(row(html, 'student.lastName')).not.toMatch(/<(input|select|textarea)/); // no definition sent for it in this fixture
    expect(text(row(html, 'academic.subjects'))).toContain('Set by Sales and locked after handover');
    expect(row(html, 'academic.subjects')).not.toContain('>Edit<');
  });

  it.each([['the Mentoring Head', HEAD], ['the CEO / CO_FOUNDER', CEO], ['a Demo Counselor', COUNSELOR]])('%s sees the information but no controls', (_label, viewer) => {
    const html = render(workspace(viewer));
    expect(text(html)).toContain('4 of 28 collected');
    for (const label of ['Edit', 'Verify', 'Undo verification', 'Collect', 'Save']) expect(count(html, `>${label}<`)).toBe(0);
    expect(html).not.toMatch(/<(input|select|textarea)[^>]*aria-label="Relationship to Student"/);
  });

  it('nobody can edit while the workflow is not in progress or the meeting has not started (the server says so through canEditHandover)', () => {
    const html = render(workspace({ ...MENTOR, canEditHandover: false }));
    for (const label of ['Edit', 'Verify', 'Collect']) expect(count(html, `>${label}<`)).toBe(0);
  });

  it('before the stage is started the Mentor is told to start it, and the information stays read-only', () => {
    const html = render(workspace({ ...MENTOR, canEditHandover: false }, { stages: stages(checklist(), 'NOT_STARTED') }));
    expect(text(html)).toContain('Start this stage to collect and verify information with the parent');
    expect(count(html, '>Edit<')).toBe(0);
  });

  it('offers filters that show only what is pending or not verified yet', () => {
    const html = render(workspace(MENTOR));
    expect(html).toMatch(/aria-pressed="true"[^>]*>All 28/);
    expect(count(html, 'aria-pressed=')).toBe(3);
  });
});

describe('the meeting verification checklist', () => {
  it('shows progress as completed requirements out of all requirements', () => {
    const t = text(render(workspace(MENTOR)));
    expect(t).toContain('1 of 6 requirements completed');
    expect(t).toContain('3 still to resolve before the stage can be completed');
    expect(t).toContain('1 marked unavailable or not applicable');
    expect(t).toContain('1 authorised as an exception');
    expect(t).toContain('Confirmed with the parent');
    expect(t).toContain('Meeting and follow-up');
  });

  it('every requirement is a checkbox that reflects its saved state, with who, when, comment and evidence', () => {
    const html = render(workspace(MENTOR));
    expect(count(html, 'type="checkbox"')).toBe(6);
    expect(html).toMatch(/aria-label="Student and parent details verified: completed"[^>]*checked/);
    const t = text(html);
    expect(t).toContain('Completed by Mina Mentor');
    expect(t).toContain('Comment: Checked against the form');
    expect(t).toContain('Evidence: https://files.example/form');
    expect(t).toContain('Reason: School has not issued marks');
    expect(t).toContain('Collected, awaiting verification');
  });

  it('a requirement is blocked, with the reason, while the information it depends on is missing', () => {
    const html = render(workspace(MENTOR));
    const blocked = /<li[^>]*data-item="c2".*?<\/li>/s.exec(html)![0];
    expect(text(blocked)).toContain('Waiting for Relationship to Student');
    expect(blocked).toMatch(/type="checkbox"[^>]*disabled=""/);
    expect(blocked).toContain('Collect first: Relationship to Student');
    expect(text(blocked)).toContain('Details'); // it can still be marked unavailable with a reason
  });

  it('an authorised exception shows who, when and why, and is not called completed', () => {
    const t = text(render(workspace(MENTOR)));
    expect(t).toContain('Exception authorised by Hari Head');
    expect(t).toContain('Reason: Parent asked for a call later');
  });

  it('the Mentor can tick unblocked items; nobody else can', () => {
    expect(enabledCheckboxes(render(workspace(MENTOR)))).toBe(4); // c2 and c4 wait for information; the rest can be ticked
    for (const viewer of [HEAD, CEO, COUNSELOR]) expect(enabledCheckboxes(render(workspace(viewer)))).toBe(0);
  });

  it('only the Mentoring Head is offered an exception, and only for unresolved requirements', () => {
    expect(count(render(workspace(HEAD)), '>Authorise exception<')).toBe(3); // c2, c3 and c6; c1, c4 and c5 are resolved
    for (const viewer of [MENTOR, CEO, COUNSELOR]) expect(count(render(workspace(viewer)), '>Authorise exception<')).toBe(0);
  });

  it('the Mentor can open details (comment, evidence, reason); read-only viewers cannot', () => {
    expect(count(render(workspace(MENTOR)), '>Details<')).toBe(6);
    for (const viewer of [HEAD, CEO, COUNSELOR]) expect(count(render(workspace(viewer)), '>Details<')).toBe(0);
  });

  it('completing the stage stays disabled until every requirement is resolved', () => {
    expect(render(workspace(MENTOR))).toMatch(verifyButton);
    const resolved = checklist().map((i) => ({ ...i, state: 'VERIFIED', requires: [] }));
    const html = render(workspace(MENTOR, { stages: stages(resolved, 'PENDING_REVIEW') }));
    expect(html).not.toMatch(verifyButton);
    expect(text(html)).toContain('Every requirement is resolved');
    expect(text(html)).toContain('6 of 6 requirements completed');
  });

  it('shows a progress bar that matches the resolved share', () => {
    expect(render(workspace(MENTOR))).toMatch(/role="progressbar"[^>]*aria-valuenow="50"/); // 3 of 6 resolved: completed, unavailable with a reason, exception
  });

  it('renders for a stage with an empty or missing checklist', () => {
    for (const value of [[], undefined]) {
      expect(() => render(workspace(MENTOR, { stages: stages(value as any) }))).not.toThrow();
    }
  });
});

describe('earlier Stage 1 results are kept and shown read-only on Stage 2', () => {
  const earlier = [
    { key: 'student_parent_verified', label: 'Student and parent details verified', group: 'Original requirement', state: 'VERIFIED', note: 'Checked the admission form', evidenceRef: 'ev-1', updatedByName: 'Mina Mentor', updatedAt: '2026-10-31T09:00:00Z' },
    { key: 'previous_marks', label: 'Previous marks collected or marked unavailable', group: 'Original requirement', state: 'UNAVAILABLE', reason: 'School closed', exceptionReason: 'Head allowed it' },
  ];

  it('lists the results with their comments, evidence and reasons', () => {
    const html = render(workspace(MENTOR, { legacyStage1Items: earlier }));
    const t = text(html);
    expect(t).toContain('Earlier Stage 1 results (2)');
    expect(t).toContain('They do not count towards any stage');
    expect(t).toContain('Comment: Checked the admission form');
    expect(t).toContain('Evidence: ev-1');
    expect(t).toContain('Reason: School closed');
    expect(t).toContain('Exception reason: Head allowed it');
    expect(html).toContain('<details');
  });

  it('is read-only: no checkbox or button belongs to it', () => {
    const section = /<details.*?<\/details>/s.exec(render(workspace(MENTOR, { legacyStage1Items: earlier })))![0];
    expect(section).not.toMatch(/<(input|button|select|textarea)/);
  });

  it('is absent when there is nothing to show', () => {
    expect(text(render(workspace(MENTOR, { legacyStage1Items: [] })))).not.toContain('Earlier Stage 1 results');
    expect(() => render(workspace(MENTOR, { legacyStage1Items: undefined }))).not.toThrow();
  });
});

describe('what the page sends to the API', () => {
  const page = () => require('fs').readFileSync(require('path').join(__dirname, 'students/[id]/StudentWorkspaceClient.tsx'), 'utf8').replace(/\r\n/g, '\n');

  it('saves a field with PUT, verifies it with PUT to its own route, saves a checklist item with PATCH and records an exception with POST', () => {
    expect(page()).toContain("mentoringApi(`${base}/handover/fields/${fieldKey}`, 'PUT', { value })");
    expect(page()).toContain("mentoringApi(`${base}/handover/fields/${fieldKey}/verification`, 'PUT', { verified })");
    expect(page()).toContain("mentoringApi(`${base}/stages/${stage.number}/items/${itemKey}`, 'PATCH', update)");
    expect(page()).toContain("mentoringApi(`${base}/stages/${stage.number}/exceptions/${itemKey}`, 'POST', { reason })");
    expect(page()).toContain('await load()');
  });

  it('confirms every save with the field name, so the Mentor sees what changed', () => {
    expect(page()).toContain('setNotice(`${handoverFieldLabel(fieldKey)} saved.`)');
    expect(page()).toContain('setNotice(verified ?');
  });

  it('guards unsaved edits: browser close, stage change and panel change', () => {
    expect(page()).toContain("window.addEventListener('beforeunload'");
    expect(page()).toContain('confirmLeave() && setStageNo');
    expect(page()).toContain('confirmLeave() && setPanel');
  });
});
