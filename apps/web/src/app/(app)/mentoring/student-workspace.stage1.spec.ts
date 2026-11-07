import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

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

const MENTOR = { userId: 'mentor-1', isMentor: true, isHead: false, canEditHandover: false };
const HEAD = { userId: 'head-1', isMentor: false, isHead: true, canEditHandover: false };
const CEO = { userId: 'ceo-1', isMentor: false, isHead: false, canEditHandover: false };
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

describe('Stage 1 review confirmation', () => {
  it('only the assigned Mentor, with Stage 1 open, can confirm the review', () => {
    expect(text(render(workspace(MENTOR)))).toContain('Confirm handover reviewed');
    for (const viewer of [HEAD, CEO, COUNSELOR]) expect(text(render(workspace(viewer)))).not.toContain('Confirm handover reviewed');
    expect(text(render(workspace(MENTOR, { stages: [{ number: 1, name: 'Admission Handover', status: 'COMPLETED', checklist: [review({ state: 'VERIFIED' })] }] })))).not.toContain('Confirm handover reviewed');
  });

  it('completing the stage stays disabled until the review is confirmed, then becomes available', () => {
    expect(render(workspace(MENTOR))).toMatch(verifyButton);
    const done = render(workspace(MENTOR, { stages: [{ number: 1, name: 'Admission Handover', status: 'PENDING_REVIEW', checklist: [review({ state: 'VERIFIED', updatedByName: 'Mina Mentor', updatedAt: '2026-11-03T09:00:00Z' })] }] }));
    expect(done).not.toMatch(verifyButton);
    expect(text(done)).toContain('Handover reviewed');
    expect(text(done)).toContain('Confirmed by Mina Mentor');
    expect(text(done)).toContain('Undo');
  });

  it('the review is the only thing Stage 1 asks of the Mentor: collecting is not required to complete it', () => {
    const done = render(workspace(MENTOR, { stages: [{ number: 1, name: 'Admission Handover', status: 'PENDING_REVIEW', checklist: [review({ state: 'VERIFIED' })] }] }));
    expect(done).not.toMatch(verifyButton);
    expect(text(done)).toContain('23 still required'); // everything is still missing, and that does not block Stage 1
  });

  it('read-only viewers see no stage actions on Stage 1', () => {
    for (const viewer of [CEO, COUNSELOR]) {
      const t = text(render(workspace(viewer)));
      for (const label of ['Verify and complete', 'Start stage', 'Confirm handover reviewed', 'Authorise exception']) expect(t).not.toContain(label);
    }
  });

  it('sends the review to the checklist item route', () => {
    const page = require('fs').readFileSync(require('path').join(__dirname, 'students/[id]/StudentWorkspaceClient.tsx'), 'utf8').replace(/\r\n/g, '\n');
    expect(page).toContain("mentoringApi(`${base}/stages/1/items/${checklist[0].key}`, 'PATCH'");
  });
});
