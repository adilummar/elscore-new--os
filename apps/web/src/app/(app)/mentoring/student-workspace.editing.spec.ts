import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { StudentWorkspaceClient } from './students/[id]/StudentWorkspaceClient';

jest.mock('./mentoring-client', () => ({ mentoringApi: jest.fn().mockResolvedValue({}) }));

const meta = (key: string, type: string, extra: Record<string, unknown> = {}) => ({ key, type, options: null, columns: null, maxLength: null, minDate: null, maxDate: null, ...extra });
const item = (key: string, over: Record<string, unknown> = {}) => ({
  key, label: `Item ${key}`, mandatory: true, state: 'PENDING_COLLECTION', value: null, note: null, reason: null, evidenceRef: null,
  group: null, groupLabel: null, exception: false, exceptionDetail: null, updatedByUserId: null, updatedByName: null, updatedAt: null, ...over,
});
const G1 = { group: 'student_parent_verified', groupLabel: 'Student and parent details verified' };
const G2 = { group: 'tutor_subject_confirmed', groupLabel: 'Tutor and subject information confirmed' };
const G3 = { group: 'previous_marks', groupLabel: 'Previous marks collected or marked unavailable' };

const checklist = () => [
  item('a1', { ...G1, label: 'Student details checked', state: 'VERIFIED', updatedByName: 'Mina Mentor', updatedAt: '2026-11-03T09:00:00Z', note: 'Checked against the form' }),
  item('a2', { ...G1, label: 'Parent details checked' }),
  item('b1', { ...G2, label: 'Tutor assignment confirmed', state: 'UNAVAILABLE', reason: 'Tutor not yet allocated' }),
  item('b2', { ...G2, label: 'Subject requirements confirmed', state: 'COLLECTED' }),
  item('c1', { ...G3, label: 'Marks collected', exception: true, exceptionDetail: { reason: 'School closed until January', authorizedByName: 'Hari Head', at: '2026-11-03T10:00:00Z' } }),
];

const handover = () => ({
  transferredFields: [
    { field: 'student.firstName', source: 'STUDENT', value: 'Asha' },
    { field: 'parent.primaryPhone', source: 'LEAD', value: '+971500000000' },
  ],
  missingFields: [{ field: 'parent.relationship', reason: 'NOT_COLLECTED_IN_SALES' }, { field: 'student.gender', reason: 'NOT_PROVIDED' }],
  fieldValues: [
    { fieldKey: 'parent.primaryPhone', value: '+971501112222', origin: 'MENTORING_UPDATED', salesValue: '+971500000000', updatedByName: 'Mina Mentor', updatedAt: '2026-11-03T09:30:00Z' },
    { fieldKey: 'student.gender', value: 'Female', origin: 'MENTOR_COLLECTED', salesValue: null, updatedByName: 'Mina Mentor', updatedAt: '2026-11-03T09:40:00Z' },
  ],
  editableFields: [
    meta('student.firstName', 'TEXT'), meta('parent.primaryPhone', 'PHONE'), meta('student.gender', 'SELECT', { options: ['Male', 'Female', 'Other'] }),
    meta('parent.relationship', 'SELECT', { options: ['Mother', 'Father', 'Guardian', 'Other'] }),
  ],
});

const MENTOR = { userId: 'mentor-1', isMentor: true, isHead: false, canEditHandover: true };
const HEAD = { userId: 'head-1', isMentor: false, isHead: true, canEditHandover: false };
const CEO = { userId: 'ceo-1', isMentor: false, isHead: false, canEditHandover: false };
const COUNSELOR = { userId: 'dc-1', isMentor: false, isHead: false, canEditHandover: false };

const workspace = (viewer: any, over: Record<string, unknown> = {}) => ({
  activation: { id: 'a1', status: 'ACTIVATION_IN_PROGRESS', currentStage: 1, currentMentorUserId: 'mentor-1', currentMentorName: 'Mina Mentor' },
  student: { firstName: 'Asha', lastName: 'Menon', businessId: 'STU-0001' },
  parent: { name: 'Priya', primaryPhone: '+971501112222' },
  stages: [{ number: 1, name: 'Admission Handover', status: 'IN_PROGRESS', checklist: checklist() }],
  viewer, openHold: null, handover: handover(), tasks: [], events: [], ...over,
});

const render = (ws: any) => renderToStaticMarkup(React.createElement(StudentWorkspaceClient, { activationId: 'a1', initialWorkspace: ws }));
const text = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
const count = (html: string, needle: string) => html.split(needle).length - 1;
const enabledCheckboxes = (html: string) => (html.match(/<input[^>]*type="checkbox"[^>]*>/g) ?? []).filter((tag) => !/\sdisabled=""/.test(tag)).length;

describe('inline editing of handover information', () => {
  it('the assigned Mentor gets Edit on collected fields and Add on missing ones (not on locked Sales data)', () => {
    const html = render(workspace(MENTOR));
    // Collected and editable: first name, parent phone, gender. Missing and editable: relationship.
    expect(count(html, '>Edit<')).toBe(3);
    expect(count(html, '>Add<')).toBe(1);
  });

  it.each([['the Mentoring Head', HEAD], ['the CEO / CO_FOUNDER', CEO], ['a Demo Counselor', COUNSELOR]])('%s sees no edit controls', (_label, viewer) => {
    const html = render(workspace(viewer));
    expect(count(html, '>Edit<')).toBe(0);
    expect(count(html, '>Add<')).toBe(0);
  });

  it('nobody can edit while the workflow is not in progress (the server says so through canEditHandover)', () => {
    const html = render(workspace({ ...MENTOR, canEditHandover: false }));
    expect(count(html, '>Edit<') + count(html, '>Add<')).toBe(0);
  });

  it('shows where each value came from, who changed it and the original Sales value', () => {
    const t = text(render(workspace(MENTOR)));
    expect(t).toContain('Received from Sales');
    expect(t).toContain('Updated by Mentoring · Mina Mentor');
    expect(t).toContain('Collected by Mentor · Mina Mentor');
    expect(t).toContain('Sales value: +971500000000');
    expect(t).toContain('+971501112222');
  });

  it('counts include what the Mentor collected, and still-required shrinks accordingly', () => {
    const t = text(render(workspace(MENTOR)));
    expect(t).toContain('3 collected · 1 still required');
    expect(t).toContain('Information collected (3)');
    expect(t).toContain('Information still required (1)');
  });

  it('exposes no raw field path', () => {
    expect(text(render(workspace(MENTOR)))).not.toMatch(/student\.firstName|parent\.primaryPhone|parent\.relationship|student\.gender/);
  });
});

describe('interactive stage checklist', () => {
  it('shows requirement groups, progress and outstanding mandatory items', () => {
    const t = text(render(workspace(MENTOR)));
    expect(t).toContain('1 of 3 requirements completed');
    expect(t).toContain('1 of 5 completed · 2 unavailable or excepted');
    expect(t).toContain('2 mandatory items outstanding');
    expect(t).toContain('1 exception authorised');
    expect(t).toContain('Student and parent details verified');
    expect(t).toContain('Tutor and subject information confirmed');
  });

  it('every item is a real checkbox reflecting its saved state, with status, who and when', () => {
    const html = render(workspace(MENTOR));
    expect(count(html, 'type="checkbox"')).toBe(5);
    expect(html).toMatch(/aria-label="Student details checked: completed"[^>]*checked/);
    expect(html).toMatch(/aria-label="Parent details checked: not completed"/);
    const t = text(html);
    expect(t).toContain('Completed');
    expect(t).toContain('Collected, awaiting verification');
    expect(t).toContain('Unavailable');
    expect(t).toContain('Reason: Tutor not yet allocated');
    expect(t).toContain('Updated by Mina Mentor');
    expect(t).toContain('Note: Checked against the form');
    expect(t).toContain('Mandatory');
  });

  it('shows an authorised exception with who, when and why, and does not call it completed', () => {
    const t = text(render(workspace(MENTOR)));
    expect(t).toContain('Exception authorised by Hari Head');
    expect(t).toContain('Reason: School closed until January');
    expect(t).toContain('Exception authorised');
  });

  it('the Mentor can tick items; nobody else can', () => {
    expect(enabledCheckboxes(render(workspace(MENTOR)))).toBe(5);
    for (const viewer of [HEAD, CEO, COUNSELOR]) expect(enabledCheckboxes(render(workspace(viewer)))).toBe(0);
  });

  it('only the Mentoring Head is offered an exception, and only for unresolved mandatory items', () => {
    const head = render(workspace(HEAD));
    expect(count(head, '>Authorise exception<')).toBe(2); // a2 and b2; the others are resolved
    for (const viewer of [MENTOR, CEO, COUNSELOR]) expect(count(render(workspace(viewer)), '>Authorise exception<')).toBe(0);
  });

  it('the Mentor can open details (comment, evidence, reason); read-only viewers cannot', () => {
    expect(count(render(workspace(MENTOR)), '>Details<')).toBe(5);
    for (const viewer of [HEAD, CEO, COUNSELOR]) expect(count(render(workspace(viewer)), '>Details<')).toBe(0);
  });

  it('verification stays disabled while mandatory items are outstanding, and is available once resolved', () => {
    expect(render(workspace(MENTOR))).toMatch(/<button[^>]*\sdisabled=""[^>]*>(?:<[^>]*>)*Verify and complete stage 1/);
    const resolved = checklist().map((i) => ({ ...i, state: 'VERIFIED' }));
    const html = render(workspace(MENTOR, { stages: [{ number: 1, name: 'Admission Handover', status: 'PENDING_REVIEW', checklist: resolved }] }));
    expect(html).not.toMatch(/<button[^>]*\sdisabled=""[^>]*>(?:<[^>]*>)*Verify and complete stage 1/);
    expect(text(html)).toContain('All mandatory items resolved');
    expect(text(html)).toContain('3 of 3 requirements completed');
  });

  it('shows a progress bar that matches the resolved share', () => {
    expect(render(workspace(MENTOR))).toMatch(/role="progressbar"[^>]*aria-valuenow="60"/);
  });

  it('stages without requirement groups show a plain list with item progress', () => {
    const flat = [item('x1', { state: 'VERIFIED' }), item('x2')];
    const t = text(render(workspace(MENTOR, { stages: [{ number: 2, name: 'Meeting with Parents', status: 'IN_PROGRESS', checklist: flat }], activation: { id: 'a1', status: 'ACTIVATION_IN_PROGRESS', currentStage: 2, currentMentorUserId: 'mentor-1' } })));
    expect(t).toContain('1 of 2 completed');
    expect(t).not.toContain('requirements completed');
  });

  it('renders for a stage with an empty or missing checklist', () => {
    for (const checklistValue of [[], undefined]) {
      expect(() => render(workspace(MENTOR, { stages: [{ number: 1, name: 'Admission Handover', status: 'IN_PROGRESS', checklist: checklistValue }] }))).not.toThrow();
    }
  });
});

describe('what the page sends to the API', () => {
  it('saves a field with PUT to the handover field route and a checklist item with PATCH, both through the result-returning wrapper', () => {
    const page = require('fs').readFileSync(require('path').join(__dirname, 'students/[id]/StudentWorkspaceClient.tsx'), 'utf8').replace(/\r\n/g, '\n');
    expect(page).toContain("mentoringApi(`${base}/handover/fields/${fieldKey}`, 'PUT', { value })");
    expect(page).toContain("mentoringApi(`${base}/stages/${stage.number}/items/${itemKey}`, 'PATCH', update)");
    expect(page).toContain("mentoringApi(`${base}/stages/${stage.number}/exceptions/${itemKey}`, 'POST', { reason })");
    expect(page).toContain('await load()');
  });

  it('guards unsaved edits: browser close, stage change and panel change', () => {
    const page = require('fs').readFileSync(require('path').join(__dirname, 'students/[id]/StudentWorkspaceClient.tsx'), 'utf8').replace(/\r\n/g, '\n');
    expect(page).toContain("window.addEventListener('beforeunload'");
    expect(page).toContain('confirmLeave() && setStageNo');
    expect(page).toContain('confirmLeave() && setPanel');
  });
});
