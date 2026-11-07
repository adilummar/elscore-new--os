import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { HandoverReview } from './students/[id]/HandoverReview';
import { StudentWorkspaceClient } from './students/[id]/StudentWorkspaceClient';

jest.mock('./mentoring-client', () => ({ mentoringApi: jest.fn().mockResolvedValue({}) }));

/**
 * Stage 1, Admission Handover, is an overview: what Sales handed over and what is still needed. It holds one review
 * confirmation and nothing else. Collecting, verifying and the detailed checklist belong to Stage 2.
 */
const SALES = (field: string, value: unknown, source = 'STUDENT') => ({ field, source, value });

const handover = () => ({
  completedAt: '2026-10-30T08:00:00Z',
  transferredFields: [
    SALES('student.firstName', 'Asha'),
    SALES('student.lastName', 'Menon'),
    SALES('parent.name', 'Priya Menon', 'LEAD'),
    SALES('parent.primaryPhone', '9876543210', 'LEAD'),
    { field: 'academic.subjects', source: 'REQUIREMENT', value: [{ requirementId: 'r1', subject: 'Mathematics', curriculum: 'CBSE', grade: 'Grade 8', monthlyHours: '8' }] },
  ],
  missingFields: [{ field: 'parent.relationship', reason: 'NOT_COLLECTED_IN_SALES' }, { field: 'student.gender', reason: 'NOT_PROVIDED' }],
  fieldValues: [],
  fieldVerifications: [],
  editableFields: [{ key: 'parent.relationship', type: 'SELECT', options: ['Mother', 'Father'], columns: null, maxLength: null, minDate: null, maxDate: null }],
});

const review = (over: Record<string, unknown> = {}) => ({
  key: 'missing_info_identified', label: 'Handover reviewed and missing information identified for the parent meeting', mandatory: true,
  state: 'PENDING_COLLECTION', value: null, note: null, reason: null, evidenceRef: null, group: null, groupLabel: null, requires: [],
  exception: false, exceptionDetail: null, updatedByName: null, updatedAt: null, ...over,
});

const MENTOR = { userId: 'mentor-1', isMentor: true, isHead: false, can: { pause: true, manageTasks: true }, canEditHandover: false };
const HEAD = { userId: 'head-1', isMentor: false, isHead: true, can: { pause: true, cancel: true, authorizeException: true, approve: true, manageTasks: true }, canEditHandover: false };
// The API sends isHead: true to anyone with department-wide read access, the CEO included, and no capability flags.
const CEO = { userId: 'ceo-1', isMentor: false, isHead: true, can: {}, canEditHandover: false };
const COUNSELOR = { userId: 'dc-1', isMentor: false, isHead: false, canEditHandover: false };

const workspace = (viewer: any = MENTOR, over: Record<string, unknown> = {}) => ({
  activation: { id: 'a1', status: 'ACTIVATION_IN_PROGRESS', currentStage: 1, currentMentorUserId: 'mentor-1', currentMentorName: 'Mina Mentor' },
  student: { firstName: 'Asha', lastName: 'Menon', businessId: 'STU-0001' },
  parent: { name: 'Priya Menon', primaryPhone: '9876543210' },
  stages: [{ number: 1, name: 'Admission Handover', status: 'IN_PROGRESS', checklist: [review()] }, ...[2, 3, 4, 5, 6, 7].map((n) => ({ number: n, name: `Stage ${n}`, status: 'NOT_STARTED', checklist: [] }))],
  viewer, openHold: null, handover: handover(), legacyStage1Items: [{ key: 'student_parent_verified', label: 'Student and parent details verified', group: 'Original requirement', state: 'VERIFIED', note: 'Checked the form' }],
  tasks: [], events: [], ...over,
});

const render = (ws: any) => renderToStaticMarkup(React.createElement(StudentWorkspaceClient, { activationId: 'a1', initialWorkspace: ws }));
const text = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
const count = (html: string, needle: string) => html.split(needle).length - 1;
const verifyButton = /<button[^>]*\sdisabled=""[^>]*>(?:<[^>]*>)*Verify and complete stage 1/;

describe('Stage 1 is a handover overview', () => {
  const html = render(workspace());
  const t = text(html);

  it('has two sections, Received from Sales and Still required, with the real counts', () => {
    expect(t).toContain('Received from Sales 5');
    expect(t).toContain('Still required 23');
    expect(t).toContain('5 received, 23 still required');
    expect(t).toContain('Handed over on');
  });

  it('shows actual values with business labels and where Sales took them from', () => {
    for (const [label, value] of [['Student First Name', 'Asha'], ['Parent / Guardian Name', 'Priya Menon'], ['Parent Contact Number', '9876543210'], ['Subjects', 'Mathematics (CBSE · Grade 8) · 8 hrs / month']]) {
      expect(t).toContain(`${label} ${value}`);
    }
    expect(t).toContain('Sales lead record');
    expect(t).toContain('Sales student record');
    expect(t).toContain('Sales subject requirements');
  });

  it('explains each missing field and marks it with a small red indicator', () => {
    expect(t).toContain('Still required 23 Not asked during the Sales admission. The Mentor collects this. Where Sales left a field blank, the row says so.');
    expect(count(t, 'Not asked during the Sales admission')).toBe(1); // said once, not on every row
    expect(t).toContain('Gender Sales did not enter this information.');
    expect(count(html, 'aria-label="Missing"')).toBe(23);
    expect(count(html, 'aria-label="Received"')).toBe(5);
  });

  it('has no inputs and no edit, verify or collect controls', () => {
    const overview = /<section aria-label="Admission handover overview".*?<\/section>/s.exec(html)![0];
    expect(overview).not.toMatch(/<(input|textarea|select|button)\b/);
    expect(html).not.toMatch(/<(input|textarea|select)\b/);
    for (const label of ['Edit', 'Verify', 'Collect', 'Save', 'Undo verification', 'Authorise exception', 'Details']) expect(html).not.toContain(`>${label}<`);
  });

  it('has no detailed checklist, no verification checkboxes and no meeting items', () => {
    expect(html).not.toContain('type="checkbox"');
    expect(t).not.toContain('requirements completed');
    expect(t).not.toContain('Student and parent details verified');
    expect(t).not.toContain('Earlier Stage 1 results'); // that list belongs to Stage 2
    expect(html).not.toContain('role="progressbar"');
  });

  it('exposes no raw field path', () => {
    expect(t).not.toMatch(/student\.firstName|parent\.primaryPhone|parent\.relationship|academic\.subjects/);
  });

  it('keeps the original Sales value when Mentoring has changed it since, and says so', () => {
    const changed = text(render(workspace(MENTOR, { handover: { ...handover(), fieldValues: [{ fieldKey: 'parent.primaryPhone', value: '9000000000', origin: 'MENTORING_UPDATED', salesValue: '9876543210', updatedByName: 'Mina Mentor', updatedAt: '2026-11-03T09:00:00Z' }] } })));
    expect(changed).toContain('Parent Contact Number 9876543210');
    expect(changed).not.toContain('9000000000');
    expect(changed).toContain('Updated in the parent meeting; this is the value Sales sent.');
  });

  it('a field the Mentor has collected since is no longer still required, and is counted separately', () => {
    const later = text(render(workspace(MENTOR, { handover: { ...handover(), fieldValues: [{ fieldKey: 'parent.relationship', value: 'Mother', origin: 'MENTOR_COLLECTED', salesValue: null, updatedByName: 'Mina Mentor', updatedAt: '2026-11-03T09:00:00Z' }] } })));
    expect(later).toContain('5 received, 22 still required, 1 collected since by the Mentor');
    expect(later).not.toContain('Relationship to Student');
  });
});

describe('Stage 1 submit action by role', () => {
  const ACTION = 'Review and submit handover';
  const stage1 = (status: string, itemOver: Record<string, unknown> = {}) => ({ stages: [{ number: 1, name: 'Admission Handover', status, checklist: [review(itemOver)] }, ...[2, 3, 4, 5, 6, 7].map((n) => ({ number: n, name: `Stage ${n}`, status: 'NOT_STARTED', checklist: [] }))] });
  const button = (html: string, label: string) => new RegExp(`<button(?![^>]*\\sdisabled="")[^>]*>(?:<[^>]*>)*${label}<`).test(html);

  it('the assigned Mentor sees one clearly labelled primary button, and an explanation of what submitting confirms', () => {
    const html = render(workspace(MENTOR));
    expect(button(html, ACTION)).toBe(true);
    expect(html).toMatch(/<button[^>]*bg-brand-600[^>]*>(?:<[^>]*>)*Review and submit handover/); // the primary style
    expect(text(html)).toContain('Missing information is collected in the Meeting with Parents, so you can submit even while fields are missing.');
  });

  it('the confirmation dialog says what is being confirmed, with the real counts, and offers Cancel and Confirm', () => {
    const closed = render(workspace(MENTOR));
    expect(closed).not.toContain('role="dialog"'); // closed until the Mentor asks for it
    const open = renderToStaticMarkup(React.createElement(HandoverReview, { item: review() as any, stageStatus: 'IN_PROGRESS', editable: true, received: 5, required: 23, onSubmit: async () => undefined, defaultOpen: true }));
    const t = text(open);
    expect(open).toContain('role="dialog"');
    expect(open).toContain('aria-modal="true"');
    expect(t).toContain('Submit the admission handover');
    expect(t).toContain('what Sales handed over (5 items received)');
    expect(t).toContain('what is still required (23 items)');
    expect(t).toContain('Missing information does not stop you here.');
    expect(t).toContain('Submitting completes Stage 1 and opens the Meeting with Parents. The original Sales data is not changed.');
    expect(t).toContain('Cancel');
    expect(t).toContain('Confirm and submit');
  });

  it('submitting works with every field still missing: the number of required items never disables the action', () => {
    const none = workspace(MENTOR, { handover: { transferredFields: [], missingFields: [], fieldValues: [], fieldVerifications: [], editableFields: [] } });
    expect(button(render(none), ACTION)).toBe(true);
    expect(text(render(none))).toContain('28 still required');
  });

  it('a recorded review that is waiting to be submitted offers Submit handover and says so', () => {
    const html = render(workspace(MENTOR, stage1('PENDING_REVIEW', { state: 'VERIFIED', updatedByName: 'Mina Mentor', updatedAt: '2026-11-03T09:00:00Z' })));
    expect(button(html, 'Submit handover')).toBe(true);
    expect(text(html)).toContain('Review recorded, ready to submit');
    expect(text(html)).toContain('Pending review');
  });

  it('after submission the stage shows as completed, with no action left', () => {
    const html = render(workspace(MENTOR, stage1('COMPLETED', { state: 'VERIFIED', updatedByName: 'Mina Mentor', updatedAt: '2026-11-03T09:00:00Z' })));
    expect(text(html)).toContain('Handover submitted');
    expect(text(html)).toContain('Stage 1 is complete by Mina Mentor');
    expect(button(html, ACTION)).toBe(false);
    expect(button(html, 'Submit handover')).toBe(false);
  });

  it.each([['the Mentoring Head', HEAD], ['the CEO', CEO], ['a CO_FOUNDER (read-only, same flags as the CEO)', { ...CEO, userId: 'cof-1' }], ['a Demo Counselor', COUNSELOR]])('%s sees no action at all, only who submits', (_label, viewer) => {
    const html = render(workspace(viewer));
    expect(html).not.toMatch(/<button[^>]*>(?:<[^>]*>)*(Review and submit handover|Submit handover|Confirm and submit)/);
    expect(html).not.toContain('role="dialog"');
    expect(text(html)).toContain('Awaiting review. The assigned Mentor reviews and submits the handover.');
    for (const label of ['Verify and complete', 'Start stage', 'Authorise exception']) expect(text(html)).not.toContain(label);
  });

  it('a Mentor who is not assigned to the student gets no action either', () => {
    const html = render(workspace({ userId: 'mentor-2', isMentor: false, isHead: false, canEditHandover: false }));
    expect(button(html, ACTION)).toBe(false);
  });

  it.each([['AWAITING_ALLOCATION'], ['ACTIVATION_ON_HOLD'], ['ACTIVATION_BLOCKED']])('no action while the workflow is %s', (status) => {
    const html = render(workspace(MENTOR, { activation: { id: 'a1', status, currentStage: 1, currentMentorUserId: 'mentor-1', currentMentorName: 'Mina Mentor' } }));
    expect(button(html, ACTION)).toBe(false);
  });

  it('there is a single completion path on Stage 1: the stage action bar has no second Verify button', () => {
    expect(text(render(workspace(MENTOR)))).not.toContain('Verify and complete stage 1');
  });

  it('records the review and then completes the stage, and reloads even if the second call is refused', () => {
    const page = require('fs').readFileSync(require('path').join(__dirname, 'students/[id]/StudentWorkspaceClient.tsx'), 'utf8').replace(/\r\n/g, '\n');
    expect(page).toContain("mentoringApi(`${base}/stages/1/items/${checklist[0].key}`, 'PATCH', { state: 'VERIFIED' })");
    expect(page).toContain("mentoringApi(`${base}/stages/1/verify`, 'POST', {})");
    expect(page.indexOf('/stages/1/items/')).toBeLessThan(page.indexOf('/stages/1/verify'));
    expect(page).toMatch(/finally \{[^}]*await load\(\);/s);
    expect(page).toContain('Handover submitted. Stage 1 is complete and the Meeting with Parents is next.');
  });
});
