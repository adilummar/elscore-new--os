import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { ALL_FIELD_KEYS } from './handover-inventory';
import { StudentWorkspaceClient } from './students/[id]/StudentWorkspaceClient';

// The page loads its data in an effect, which does not run during server rendering; the workspace is passed in.
jest.mock('./mentoring-client', () => ({ mentoringApi: jest.fn().mockResolvedValue({}) }));

const STAGE_NAMES = ['Admission Handover', 'Student Profile', 'Academic Assessment', 'Tutor Matching', 'Timetable', 'Parent Orientation', 'Activation Review'];

const stage = (number: number, status = 'NOT_STARTED', checklist: any[] = []) => ({ number, name: STAGE_NAMES[number - 1], status, checklist });
const item = (key: string, over: any = {}) => ({ key, label: `Item ${key}`, mandatory: true, state: 'PENDING_COLLECTION', value: null, note: null, reason: null, exception: null, ...over });

const SALES = (field: string, value: unknown) => ({ field, source: 'STUDENT', value });
const NOT_BY_SALES = [
  'parent.relationship', 'tutor.assignments', 'academic.preferredLanguage', 'academic.previousMarks', 'timetable.schedule',
  'examination.upcomingDates', 'examination.syllabusPortions', 'parentExpectations', 'studentEngagement',
].map((field) => ({ field, reason: 'NOT_COLLECTED_IN_SALES' }));

const handover = (over: any = {}) => ({
  transferredFields: [
    SALES('student.firstName', 'Asha'), SALES('student.lastName', 'Menon'), SALES('student.grade', 'Grade 8'), SALES('student.curriculum', 'CBSE'),
    SALES('parent.name', 'Priya Menon'), SALES('parent.primaryPhone', '9876543210'),
    { field: 'academic.subjects', source: 'REQUIREMENT', value: [{ requirementId: 'r1', subject: 'Mathematics', curriculum: 'CBSE', grade: 'Grade 8', monthlyHours: '8' }] },
  ],
  missingFields: [...NOT_BY_SALES, { field: 'student.notes', reason: 'NOT_PROVIDED' }],
  ...over,
});

const workspace = (over: any = {}) => ({
  activation: { id: 'a1', status: 'ACTIVATION_IN_PROGRESS', currentStage: 1, currentMentorUserId: 'mentor-1', currentMentorName: 'Ravi Kumar' },
  student: { firstName: 'Asha', lastName: 'Menon', businessId: 'STU-0001', grade: { name: 'Grade 8' }, curriculum: { name: 'CBSE' } },
  parent: { name: 'Priya Menon', primaryPhone: '9876543210' },
  stages: [stage(1, 'IN_PROGRESS', [item('a')]), ...[2, 3, 4, 5, 6, 7].map((n) => stage(n))],
  viewer: { userId: 'mentor-1', isMentor: true, isHead: false },
  openHold: null,
  handover: handover(),
  tasks: [],
  events: [],
  ...over,
});

const render = (ws: any) => renderToStaticMarkup(React.createElement(StudentWorkspaceClient, { activationId: 'a1', initialWorkspace: ws }));
const text = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
const count = (html: string, needle: string) => html.split(needle).length - 1;
const RAW_FIELD = /student\.(firstName|lastName|grade|curriculum|notes)|parent\.(name|primaryPhone|whatsappNumber|relationship)|academic\.(preferredLanguage|previousMarks|subjects)|examination\.|timetable\.schedule|tutor\.assignments/;

describe('student details page renders with a complete handover', () => {
  const html = render(workspace());

  it('renders without a Server Components error banner', () => {
    expect(html).toContain('Asha Menon');
    expect(html).not.toMatch(/Server Components render|digest/i);
    expect(html).not.toContain('border-red-200 bg-red-50 px-3 py-2');
  });

  it('shows business labels with the real values for collected information', () => {
    const t = text(html);
    for (const [label, value] of [['Student First Name', 'Asha'], ['Student Last Name', 'Menon'], ['Grade / Class', 'Grade 8'], ['Curriculum / Board', 'CBSE'],
      ['Parent / Guardian Name', 'Priya Menon'], ['Parent Contact Number', '9876543210'], ['Subjects', 'Mathematics (CBSE · Grade 8) · 8 hrs / month']]) {
      expect(t).toContain(`${label} ${value}`);
    }
  });

  it('lists what is still required with business labels, a short reason and a red missing indicator', () => {
    const t = text(html);
    for (const label of ['Relationship to Student', 'Preferred Language', 'Previous Academic Marks', 'Preferred Timetable / Schedule', 'Upcoming Examination Dates',
      'Examination Syllabus / Portions', 'Parent Expectations', 'Student Engagement', 'Tutor Assignment', 'Tutor Requirements', 'Student Notes', 'Learning Difficulties or Concerns']) {
      expect(t).toContain(label);
    }
    expect(t).toContain('Not asked during the Sales admission. The Mentor collects this.');
    expect(count(t, 'Not asked during the Sales admission')).toBe(1);
    expect(html).toContain('aria-label="Missing"');
    expect(html).toContain('bg-red-500');
  });

  it('green received and red missing indicators equal the real counts', () => {
    // Received from Sales: 6 fields plus the subject list = 7. The remaining 21 of the 28 fields are still required.
    expect(count(html, 'aria-label="Received"')).toBe(7);
    expect(count(html, 'aria-label="Missing"')).toBe(21);
    expect(text(html)).toContain('7 received, 21 still required');
    expect(text(html)).toContain('Received from Sales 7');
    expect(text(html)).toContain('Still required 21');
    expect(html).toContain('bg-emerald-500');
  });

  it('shows where the Sales data came from, read-only', () => {
    const t = text(html);
    expect(t).toContain('Sales student record');
    expect(t).toContain('Sales subject requirements');
    const overview = /<section aria-label="Admission handover overview".*?<\/section>/s.exec(html)![0];
    expect(overview).not.toMatch(/<(input|textarea|select|button)\b/);
    for (const label of ['Edit', 'Verify', 'Collect', 'Save']) expect(html).not.toContain(`>${label}<`);
  });

  it('exposes no raw field path anywhere on the page', () => {
    expect(text(html)).not.toMatch(RAW_FIELD);
    expect(html).not.toContain('[object Object]');
  });

  it('uses a two-column layout on desktop that collapses to one column, and wraps long values', () => {
    expect(html).toContain('md:grid-cols-2');
    expect(html).toContain('break-words');
    expect(html).toContain('[overflow-wrap:anywhere]');
  });
});

describe('student details page with partial or absent data', () => {
  it.each([
    ['no handover at all', { handover: undefined }],
    ['a handover with nothing collected', { handover: { transferredFields: [], missingFields: NOT_BY_SALES } }],
    ['a malformed handover', { handover: { transferredFields: 'x', missingFields: null } }],
    ['no parent', { parent: null }],
    ['incomplete parent information', { parent: { name: '', primaryPhone: null } }],
    ['no tasks', { tasks: [] }],
    ['tasks missing from the response', { tasks: undefined }],
    ['no history', { events: [] }],
    ['history missing from the response', { events: undefined }],
    ['a student awaiting a Mentor', { activation: { id: 'a1', status: 'AWAITING_ALLOCATION', currentStage: 1, currentMentorUserId: null, currentMentorName: null } }],
    ['a stage without a checklist', { stages: [{ number: 1, name: 'Admission Handover', status: 'IN_PROGRESS' }] }],
    ['no stages at all', { stages: [] }],
    ['no grade or curriculum relation', { student: { firstName: 'Asha', lastName: 'Menon', businessId: 'STU-1' } }],
    ['no viewer flags', { viewer: {} }],
  ])('renders for %s', (_label, over) => {
    expect(() => render(workspace(over))).not.toThrow();
  });

  it('says the Mentor is unallocated and shows parent details as not provided when they are missing', () => {
    const t = text(render(workspace({ activation: { id: 'a1', status: 'AWAITING_ALLOCATION', currentStage: 1, currentMentorUserId: null, currentMentorName: null }, parent: null })));
    expect(t).toContain('Mentor: unallocated');
    expect(t).toContain('details not provided');
    expect(t).toContain('Awaiting allocation');
  });

  it('shows the assigned Mentor', () => {
    expect(text(render(workspace()))).toContain('Mentor: Ravi Kumar');
  });

  it('shows what is known when parent information is incomplete', () => {
    expect(text(render(workspace({ parent: { name: 'Priya Menon', primaryPhone: null } })))).toContain('Parent / Guardian: Priya Menon');
  });

  it('with nothing received, shows the full required list and an empty-state message', () => {
    const t = text(render(workspace({ handover: { transferredFields: [], missingFields: NOT_BY_SALES } })));
    expect(t).toContain('Sales has not passed on any information yet.');
    expect(t).toContain('0 received, 28 still required');
  });

  it('with every field received, says nothing is missing', () => {
    const all = ALL_FIELD_KEYS.map((key) => (key === 'academic.subjects'
      ? { field: key, source: 'REQUIREMENT', value: [{ requirementId: 'r1', subject: 'Mathematics' }] }
      : SALES(key, key === 'student.dateOfBirth' ? '2015-05-12' : 'Provided')));
    const t = text(render(workspace({ handover: { transferredFields: all, missingFields: [] } })));
    expect(t).toContain('Nothing is missing.');
    expect(t).toContain('28 received, 0 still required');
  });

  it('shows a very long value inside its row', () => {
    const long = 'x'.repeat(500);
    const html = render(workspace({ handover: { transferredFields: [SALES('student.notes', long)], missingFields: [] } }));
    expect(html).toContain(long);
    expect(html).toContain('[overflow-wrap:anywhere]');
  });
});

const renderPanel = (ws: any, initialPanel: 'checklist' | 'tasks' | 'history') =>
  renderToStaticMarkup(React.createElement(StudentWorkspaceClient, { activationId: 'a1', initialWorkspace: ws, initialPanel }));

describe('history and tasks show business wording', () => {
  const events = [
    { id: 'e1', type: 'ALLOCATION_QUEUED', reason: 'NO_ELIGIBLE_MENTOR', createdAt: '2026-11-02T10:00:00Z' },
    { id: 'e2', type: 'MENTOR_ALLOCATED', reason: 'LEAST_LOADED', createdAt: '2026-11-02T10:05:00Z' },
    { id: 'e3', type: 'ALLOCATION_QUEUED', reason: 'MANUAL_MODE', createdAt: '2026-11-02T10:06:00Z' },
    { id: 'e4', type: 'WORKFLOW_RESUMED', fromStatus: 'ACTIVATION_ON_HOLD', toStatus: 'ACTIVATION_IN_PROGRESS', reason: 'Parent confirmed the timetable', createdAt: '2026-11-02T10:07:00Z' },
  ];

  it('shows event types and system reason codes in plain language, and keeps typed reasons as written', () => {
    const t = text(renderPanel(workspace({ events }), 'history'));
    expect(t).toContain('Waiting for a Mentor · No eligible Mentor is available');
    expect(t).toContain('Mentor allocated · Mentor with the lightest workload');
    expect(t).toContain('Allocation is set to Manual');
    expect(t).toContain('On hold → Activation in progress');
    expect(t).toContain('Parent confirmed the timetable');
    for (const code of ['NO_ELIGIBLE_MENTOR', 'LEAST_LOADED', 'MANUAL_MODE', 'ALLOCATION_QUEUED', 'MENTOR_ALLOCATED', 'ACTIVATION_ON_HOLD']) {
      expect(t).not.toContain(code);
    }
  });

  it('shows task priority and status as words, with comments and an empty state', () => {
    const task = { id: 't1', title: 'Collect marksheet', status: 'IN_PROGRESS', priority: 'URGENT', assigneeUserId: 'dc-1', stageId: 's1', comments: [{ id: 'c1', body: 'Parent will send it tonight' }] };
    const t = text(renderPanel(workspace({ tasks: [task] }), 'tasks'));
    expect(t).toContain('Collect marksheet');
    expect(t).toContain('In progress');
    expect(t).toContain('Urgent');
    expect(t).toContain('Parent will send it tonight');
    expect(t).not.toMatch(/URGENT|IN_PROGRESS/);
    expect(text(renderPanel(workspace({ tasks: [] }), 'tasks'))).toContain('No tasks yet.');
  });

  it('the History and Tasks panels render when the lists are missing', () => {
    expect(text(renderPanel(workspace({ events: undefined }), 'history'))).toContain('History is visible to the Mentor and the Mentoring Head.');
    expect(() => renderPanel(workspace({ tasks: undefined }), 'tasks')).not.toThrow();
  });
});

describe('role restrictions on the page are unchanged', () => {
  const has = (html: string, label: string) => text(html).includes(label);

  it('only the assigned Mentor sees the Stage 1 submit action', () => {
    expect(has(render(workspace()), 'Review and submit handover')).toBe(true);
    for (const viewer of [{ userId: 'head', isMentor: false, isHead: true, can: { pause: true, cancel: true, authorizeException: true, approve: true, manageTasks: true } }, { userId: 'ceo', isHead: true, can: {} }, { userId: 'dc', isMentor: false, isHead: false }]) {
      expect(has(render(workspace({ viewer })), 'Review and submit handover')).toBe(false);
    }
  });

  it('only the Mentoring Head sees final approval, and a Mentor does not', () => {
    const pending = { id: 'a1', status: 'PENDING_FINAL_APPROVAL', currentStage: 7, currentMentorUserId: 'mentor-1', currentMentorName: 'Ravi Kumar' };
    expect(has(render(workspace({ activation: pending, viewer: { userId: 'head', isHead: true, can: { pause: true, cancel: true, authorizeException: true, approve: true, manageTasks: true } } })), 'Approve activation')).toBe(true);
    expect(has(render(workspace({ activation: pending, viewer: { userId: 'mentor-1', isMentor: true } })), 'Approve activation')).toBe(false);
    expect(has(render(workspace({ activation: pending, viewer: { userId: 'ceo' } })), 'Approve activation')).toBe(false);
  });

  it('read-only viewers (CEO, CO_FOUNDER) see no action buttons', () => {
    const html = render(workspace({ viewer: { userId: 'ceo', isMentor: false, isHead: false } }));
    for (const label of ['Start stage', 'Verify and complete', 'Pause', 'Report blocker', 'Cancel activation', 'Approve activation', 'Authorise exception']) {
      expect(has(html, label)).toBe(false);
    }
  });
});
