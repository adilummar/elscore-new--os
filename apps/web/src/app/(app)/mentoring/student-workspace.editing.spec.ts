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
  sectionVerifications: [
    { sectionId: 'STUDENT_PARENT_INFO', label: 'Student & Parent Information', covers: 'Student personal information, parent information, contact information, address and background.', fieldKeys: ['student.firstName', 'student.lastName', 'student.dateOfBirth', 'student.gender', 'student.schoolName', 'student.currentGrade', 'student.grade', 'student.curriculum', 'student.cityLocation', 'student.notes', 'parent.name', 'parent.primaryPhone', 'parent.altPhone1', 'parent.altPhone2', 'parent.whatsappNumber', 'parent.relationship', 'academic.preferredLanguage'], status: 'VERIFIED', verifiedByName: 'Mina Mentor', verifiedAt: '2026-11-03T09:10:00Z' },
    { sectionId: 'SUBJECTS_TUTORS_TIMETABLE', label: 'Subjects, Tutors & Timetable', covers: 'Subjects and monthly hours, tutor requirements and assignments, and the class timetable.', fieldKeys: ['academic.weakAreas', 'academic.learningRequirements', 'academic.examPreparation', 'academic.subjectNotes', 'tutor.preferredQualifications', 'tutor.preferredLanguage', 'tutor.requirements', 'tutor.assignments', 'timetable.schedule'], status: 'NOT_VERIFIED', verifiedByName: null, verifiedAt: null },
    { sectionId: 'MARKS_EXAMINATIONS', label: 'Marks & Examinations', covers: 'Previous marks, upcoming examination dates and syllabus portions.', fieldKeys: ['academic.previousPerformance', 'academic.previousPerformanceReason', 'academic.previousMarks', 'examination.upcoming', 'examination.upcomingReason'], status: 'NOT_VERIFIED', verifiedByName: null, verifiedAt: null },
    { sectionId: 'EXPECTATIONS_ENGAGEMENT', label: 'Expectations & Engagement', covers: 'Student and parent expectations, engagement requirements and learning concerns.', fieldKeys: ['parentExpectations', 'studentEngagement', 'student.learningConcerns'], status: 'NOT_VERIFIED', verifiedByName: null, verifiedAt: null },
  ],
  editableFields: [
    meta('student.firstName', 'TEXT'), meta('student.dateOfBirth', 'DATE', { maxDate: '2026-11-07' }), meta('parent.primaryPhone', 'PHONE'), meta('student.gender', 'SELECT', { options: ['Male', 'Female', 'Other'] }),
    meta('parent.relationship', 'SELECT', { options: ['Mother', 'Father', 'Guardian', 'Other'] }),
    meta('tutor.requirements', 'TEXTAREA', { maxLength: 2000 }),
    meta('parent.whatsappNumber', 'PHONE'), meta('parent.altPhone1', 'PHONE', { optional: true }),
    meta('academic.weakAreas', 'TEXTAREA', { maxLength: 2000 }),
    meta('academic.previousPerformance', 'ROWS', { columns: [{ key: 'subject', label: 'Subject', type: 'text', required: true }, { key: 'marks', label: 'Marks / grade', type: 'text', required: true }, { key: 'term', label: 'Examination or term', type: 'text', required: false }] }),
    meta('examination.upcoming', 'ROWS', { columns: [{ key: 'subject', label: 'Subject', type: 'text', required: true }, { key: 'date', label: 'Examination date', type: 'date', required: true }, { key: 'portions', label: 'Syllabus / portions', type: 'text', required: true }] }),
  ],
});

const MENTOR = { userId: 'mentor-1', isMentor: true, isHead: false, can: { pause: true, manageTasks: true }, canEditHandover: true };
const HEAD = { userId: 'head-1', isMentor: false, isHead: true, can: { pause: true, cancel: true, authorizeException: true, approve: true, manageTasks: true }, canEditHandover: false };
// The API sends isHead: true to anyone with department-wide read access, the CEO included, and no capability flags.
const CEO = { userId: 'ceo-1', isMentor: false, isHead: true, can: {}, canEditHandover: false };
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
const checklistOf = (html: string) => /<section aria-label="Checklist".*?<\/section>/s.exec(html)?.[0] ?? '';
const enabledCheckboxes = (html: string) => (checklistOf(html).match(/<input[^>]*type="checkbox"[^>]*>/g) ?? []).filter((tag) => !/\sdisabled=""/.test(tag)).length;
const row = (html: string, fieldKey: string) => new RegExp(`<li[^>]*data-field="${fieldKey.replace('.', '\\.')}".*?</li>`, 's').exec(html)?.[0] ?? '';
const verifyButton = /<button[^>]*\sdisabled=""[^>]*>(?:<[^>]*>)*Verify and complete stage 2/;

describe('Stage 2 shows every field, existing and pending, as an editable card', () => {
  const html = render(workspace(MENTOR));
  const t = text(html);

  it('lists every field the Mentoring workflow needs, once, in sections', () => {
    expect(count(html, 'data-field="')).toBe(32);
    for (const section of ['1. Student &amp; Parent Information', '2. Subjects, Tutors &amp; Timetable', '3. Marks &amp; Examinations', '4. Expectations &amp; Engagement']) expect(html).toContain(section);
    for (const label of ['Student First Name', 'Student Last Name', 'Date of Birth', 'Gender', 'School Name', 'Grade / Class', 'Curriculum / Board', 'Parent / Guardian Name', 'Relationship to Student',
      'Primary Contact Number', 'WhatsApp Number', 'Preferred Language', 'Subjects Required', 'Other Tutor Requirements', 'Previous Academic Performance',
      'Upcoming Examination Details', 'Preferred Timetable / Schedule', 'Parent Expectations', 'Student Engagement', 'Learning Difficulties or Concerns']) {
      expect(t).toContain(label);
    }
  });

  it('shows the current value in an input the Mentor can edit in the card, with its source and the original Sales value', () => {
    expect(row(html, 'student.firstName')).toMatch(/<input[^>]*aria-label="Student First Name"[^>]*value="Asha"/);
    expect(text(row(html, 'student.firstName'))).toContain('Source: Received from Sales');
    expect(row(html, 'parent.primaryPhone')).toMatch(/value="\+971501112222"/);
    expect(text(row(html, 'parent.primaryPhone'))).toContain('Source: Updated by Mina Mentor');
    expect(text(row(html, 'parent.primaryPhone'))).toContain('Sales value: +971500000000');
    expect(row(html, 'student.gender')).toMatch(/<option value="Female" selected/);
    expect(text(row(html, 'student.gender'))).toContain('Source: Collected by Mina Mentor');
    expect(text(row(html, 'academic.subjects'))).toContain('Mathematics (CBSE · Grade 8) · 8 hrs / month'); // the Sales subject list is read-only
  });

  it('uses the control that suits each field instead of a text box everywhere', () => {
    expect(row(html, 'student.firstName')).toMatch(/<input[^>]*type="text"|<input(?![^>]*type=)[^>]*aria-label="Student First Name"/); // text
    expect(row(html, 'student.dateOfBirth')).toMatch(/<input[^>]*type="date"/); // date picker
    expect(row(html, 'parent.primaryPhone')).toMatch(/<input[^>]*type="tel"/); // phone
    expect(row(html, 'student.gender')).toMatch(/<select[^>]*aria-label="Gender"/); // select from the supported values
    expect(row(html, 'student.gender')).toContain('<option value="Male"');
    expect(row(html, 'tutor.requirements')).toMatch(/<textarea[^>]*aria-label="Other Tutor Requirements"/); // notes
    expect(row(html, 'examination.upcoming')).toMatch(/aria-label="Upcoming Examination Details row 1 Examination date"[^>]*type="date"|type="date"[^>]*aria-label="Upcoming Examination Details row 1 Examination date"/); // list of dated rows
  });

  it('a missing field is an empty input with a placeholder, a Pending collection status and its source', () => {
    const relationship = row(html, 'parent.relationship');
    expect(relationship).toMatch(/<select[^>]*aria-label="Relationship to Student"/);
    expect(relationship).toMatch(/<option value=""[^>]*selected[^>]*>Select<\/option>/);
    expect(text(relationship)).toContain('Pending collection');
    expect(text(relationship)).toContain('Source: Not collected by Sales');
    expect(row(html, 'tutor.requirements')).toContain('placeholder="Enter other tutor requirements"');
    expect(row(html, 'parent.primaryPhone')).toContain('placeholder="e.g. +91 98765 43210"');
  });

  it('marks every missing field with a small amber indicator', () => {
    expect(count(html, 'data-status="pending"')).toBe(27); // the alternate number is optional, so it is not pending
    expect(count(html, '>Pending collection<')).toBe(27); // one per card
    expect(html).toContain('bg-amber-500');
  });

  it('exposes no raw field path', () => {
    expect(t).not.toMatch(/student\.firstName|parent\.primaryPhone|parent\.relationship|academic\.subjectNotes|tutor\.requirements/);
    expect(html).not.toContain('[object Object]');
  });

  it('is laid out as two columns on a wide screen, cards in a two-column grid that becomes one on a phone, with a link to the checklist', () => {
    expect(html).toContain('xl:grid-cols-[minmax(0,1fr)_24rem]');
    expect(html).toContain('sm:grid-cols-2');
    expect(html).toContain('href="#meeting-checklist"');
    expect(html).toContain('id="meeting-checklist"');
    expect(html).toContain('[overflow-wrap:anywhere]');
  });
});

describe('the summary and the filters come from the stored data', () => {
  const t = text(render(workspace(MENTOR)));

  const stillToCollect = (html: string) => Array.from(html.matchAll(/(\d+) of (\d+) fields still to collect/g)).map((m) => [Number(m[1]), Number(m[2])]);

  it('says in each step how many of its fields are still to collect, and the steps add up to the whole', () => {
    const per = stillToCollect(render(workspace(MENTOR)));
    expect(per.reduce((n, [p]) => n + p, 0)).toBe(27);
    expect(per.reduce((n, [, all]) => n + all, 0)).toBeLessThanOrEqual(32);
    expect(t).not.toContain('Collected, not verified');
  });

  it('the numbers move with the data: collecting a field changes the counts', () => {
    const next = handover();
    next.fieldValues.push({ fieldKey: 'parent.relationship', value: 'Mother', origin: 'MENTOR_COLLECTED', salesValue: null, updatedByName: 'Mina Mentor', updatedAt: '2026-11-03T09:55:00Z', collectedByName: 'Mina Mentor', collectedAt: '2026-11-03T09:55:00Z' } as any);
    const per = stillToCollect(render(workspace(MENTOR, { handover: next })));
    expect(per.reduce((n, [p]) => n + p, 0)).toBe(26);
  });

  it('keeps every step mounted and hides the others, so an unsaved draft survives moving between steps', () => {
    const page = require('fs').readFileSync(require('path').join(__dirname, 'students/[id]/InformationWorkspace.tsx'), 'utf8').replace(/\r\n/g, '\n');
    expect(page).toContain('hidden={!shown}');
    expect(page).toContain("shown ? '' : 'hidden '");
  });
});

describe('verification is per section, not per field', () => {
  const html = render(workspace(MENTOR));
  const steps = html.slice(html.indexOf('data-testid="section-steps"'), html.indexOf('data-testid="section-panel"'));
  const panelOf = (id: string) => new RegExp('<section[^>]*data-section-panel="' + id + '".*?</footer>', 's').exec(html)![0];

  it('shows exactly four steps, numbered 1 to 4, each with its own progress bar, in order', () => {
    const order = Array.from(steps.matchAll(/data-section="([A-Z_]+)"/g)).map((x) => x[1]);
    expect(order).toEqual(['STUDENT_PARENT_INFO', 'SUBJECTS_TUTORS_TIMETABLE', 'MARKS_EXAMINATIONS', 'EXPECTATIONS_ENGAGEMENT']);
    expect(count(steps, 'role="progressbar"')).toBe(4);
    for (const n of ['Step 1: ', 'Step 2: ', 'Step 3: ', 'Step 4: ']) expect(steps).toContain(n);
    expect(text(html)).toContain('1 of 4 sections verified');
  });

  it('a verified step is full and green; the others fill with the fields collected so far', () => {
    const bar = (id: string) => /style="width:(\d+)%"/.exec(new RegExp('data-section="' + id + '".*?</li>', 's').exec(steps)![0])![1];
    expect(bar('STUDENT_PARENT_INFO')).toBe('100');
    expect(Number(bar('MARKS_EXAMINATIONS'))).toBeLessThan(100);
    expect(new RegExp('data-section="STUDENT_PARENT_INFO".*?</li>', 's').exec(steps)![0]).toContain('bg-emerald-500');
  });

  it('each step holds its own fields, and every field is in exactly one step', () => {
    expect(panelOf('STUDENT_PARENT_INFO')).toContain('data-field="student.firstName"');
    expect(panelOf('STUDENT_PARENT_INFO')).toContain('data-field="parent.primaryPhone"');
    expect(panelOf('SUBJECTS_TUTORS_TIMETABLE')).toContain('data-field="academic.subjects"');
    expect(panelOf('SUBJECTS_TUTORS_TIMETABLE')).toContain('data-field="timetable.schedule"');
    expect(panelOf('MARKS_EXAMINATIONS')).toContain('data-field="academic.previousPerformance"');
    expect(panelOf('EXPECTATIONS_ENGAGEMENT')).toContain('data-field="parentExpectations"');
    expect(count(html, 'data-field="')).toBe(32);
  });

  it('each step ends with one verification button; a verified step says who verified it and when', () => {
    const verified = panelOf('STUDENT_PARENT_INFO');
    expect(text(verified)).toContain('Verified by Mina Mentor');
    expect(verified).toContain('Withdraw verification');
    const other = panelOf('MARKS_EXAMINATIONS');
    expect(text(other)).toContain('Not verified yet');
    expect(other).toContain('Verify section: Marks &amp; Examinations');
    expect(count(html, 'Verify section:') + count(html, 'Withdraw verification:')).toBe(4);
  });

  it('there is no Save button on any field: saving is part of verifying the step', () => {
    const page = require('fs').readFileSync(require('path').join(__dirname, 'students/[id]/InformationWorkspace.tsx'), 'utf8');
    expect(page).not.toContain('>Save</Button>');
    expect(page).toContain('Save and verify section');
    expect(page).toContain('They are saved when you verify this section.');
  });

  it('the field cards carry no verification ticks, statuses or text of their own', () => {
    const cards = html.slice(html.indexOf('data-testid="section-panel"'), html.indexOf('id="meeting-checklist"'));
    expect(cards).not.toContain('I have verified this information');
    expect(cards).not.toMatch(/data-verification=/);
    expect(count(cards, 'type="checkbox"')).toBe(1); // only the WhatsApp "same as primary contact number" box, which is not a verification
    expect(row(html, 'parent.whatsappNumber')).toMatch(/type="checkbox"/);
    expect(text(row(html, 'student.gender'))).toContain('Collected');
    expect(text(row(html, 'parent.relationship'))).toContain('Pending collection');
  });

  it('nothing is saved until the Mentor changes something: there is no Save button on an untouched card', () => {
    expect(count(html, '>Save<')).toBe(0);
  });

  it('having all the information a checklist item depends on does not complete it', () => {
    const contact = /<li[^>]*data-item="c3".*?<\/li>/s.exec(html)![0];
    expect(contact).toMatch(/aria-label="Contact information verified: not completed"/);
    expect(contact).not.toMatch(/disabled=""/);
    expect(contact).not.toMatch(/checked/);
  });
});

describe('who can edit and verify', () => {
  it('the assigned Mentor gets an input on every card whose value Sales or the Mentor can change, and the four section actions', () => {
    const html = render(workspace(MENTOR));
    expect(count(html, 'Verify section:') + count(html, 'Withdraw verification:')).toBe(4);
    expect(row(html, 'academic.subjects')).not.toMatch(/<(input[^>]*type="(text|tel|date)"|select|textarea)/); // the Sales subject list is not editable
    expect(row(html, 'academic.subjects')).not.toMatch(/type="checkbox"/); // and carries no tick of its own
    expect(text(row(html, 'academic.subjects'))).toContain('Set by Sales and locked after handover');
  });

  it.each([['the Mentoring Head', HEAD], ['the CEO / CO_FOUNDER', CEO], ['a Demo Counselor', COUNSELOR]])('%s sees the values and section statuses but no input, verify action or Save', (_label, viewer) => {
    const html = render(workspace(viewer));
    const fields = html.slice(html.indexOf('aria-label="Student information"'), html.indexOf('id="meeting-checklist"'));
    expect(fields).not.toMatch(/<(input|select|textarea)\b/);
    expect(count(fields, '>Save<')).toBe(0);
    expect(text(row(html, 'student.firstName'))).toContain('Asha');
    expect(text(fields)).toContain('1 of 4 sections verified');
    expect(fields).not.toContain('Verify section');
    expect(fields).not.toContain('Withdraw verification');
  });

  it('nobody can edit while the workflow is not in progress or the meeting has not started (the server says so through canEditHandover)', () => {
    const html = render(workspace({ ...MENTOR, canEditHandover: false }));
    const fields = html.slice(html.indexOf('aria-label="Student information"'), html.indexOf('id="meeting-checklist"'));
    expect(fields).not.toMatch(/<(input|select|textarea)\b/);
  });

  it('before the stage is started the Mentor is told to start it, and the information stays read-only', () => {
    const html = render(workspace({ ...MENTOR, canEditHandover: false }, { stages: stages(checklist(), 'NOT_STARTED') }));
    expect(text(html)).toContain('Start this stage to collect and verify information with the parent');
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
    expect(count(checklistOf(html), 'type="checkbox"')).toBe(6);
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
    const section = /<details(?:(?!<details)[^])*?Earlier Stage 1 results[^]*?<\/details>/.exec(render(workspace(MENTOR, { legacyStage1Items: earlier })))![0];
    expect(section).not.toMatch(/<(input|button|select|textarea)/);
  });

  it('is absent when there is nothing to show', () => {
    expect(text(render(workspace(MENTOR, { legacyStage1Items: [] })))).not.toContain('Earlier Stage 1 results');
    expect(() => render(workspace(MENTOR, { legacyStage1Items: undefined }))).not.toThrow();
  });
});

describe('what the page sends to the API', () => {
  const page = () => require('fs').readFileSync(require('path').join(__dirname, 'students/[id]/StudentWorkspaceClient.tsx'), 'utf8').replace(/\r\n/g, '\n');

  it('saves a field with PUT, verifies a section with PUT to its own route, saves a checklist item with PATCH and records an exception with POST', () => {
    expect(page()).toContain("mentoringApi(`${base}/handover/fields/${fieldKey}`, 'PUT', { value, basedOn: basedOn ?? null })");
    expect(page()).toContain("mentoringApi(`${base}/verification/sections/${sectionId}`, 'PUT', { verified })");
    expect(page()).not.toContain('/verification`, \'PUT\', { verified, basedOn');
    expect(page()).toContain("mentoringApi(`${base}/stages/${stage.number}/items/${itemKey}`, 'PATCH', update)");
    expect(page()).toContain("mentoringApi(`${base}/stages/${stage.number}/exceptions/${itemKey}`, 'POST', { reason })");
    expect(page()).toContain('await load()');
  });

  it('confirms every save with the field name, so the Mentor sees what changed', () => {
    expect(page()).toContain('setNotice(`${handoverFieldLabel(fieldKey)} saved.`)');
    expect(page()).toContain("setNotice(verified ? 'Section verified.'");
  });

  it('guards unsaved edits: browser close, stage change and any link, including the sidebar sections of the student', () => {
    expect(page()).toContain("window.addEventListener('beforeunload'");
    expect(page()).toContain('confirmLeave() && setStageNo');
    expect(page()).toContain("document.addEventListener('click', askBeforeLink, true)");
    expect(page()).not.toContain('role="tablist"');
  });
});

describe('management controls follow permissions, not visibility', () => {
  // The CEO and CO_FOUNDER can read every student, so the API sends isHead: true. They hold no management permission,
  // so the page must show them no management control. This fixture is what the API really sends for them.
  const COFOUNDER = { userId: 'cof-1', isMentor: false, isHead: true, can: {}, canEditHandover: false };
  const OLD_API = { userId: 'x', isMentor: false, isHead: true, canEditHandover: false }; // no capability flags at all
  const hold = { id: 'h1', kind: 'HOLD', reason: 'Parent travelling', pendingAction: 'Wait', followUpAt: '2026-11-20T09:00:00Z', createdAt: '2026-11-02T09:00:00Z' };
  const renderPanel = (ws: any, initialPanel: 'checklist' | 'tasks') =>
    renderToStaticMarkup(React.createElement(StudentWorkspaceClient, { activationId: 'a1', initialWorkspace: ws, initialPanel }));
  const MANAGEMENT = ['Pause', 'Report blocker', 'Cancel activation', 'Authorise exception'];

  it.each([['the CEO', CEO], ['a CO_FOUNDER', COFOUNDER], ['a Demo Counselor', COUNSELOR], ['a response without capability flags', OLD_API]])('%s sees no management button', (_label, viewer) => {
    const html = render(workspace(viewer));
    for (const label of MANAGEMENT) expect(count(html, `>${label}<`)).toBe(0);
    expect(count(renderPanel(workspace(viewer), 'tasks'), 'New task for a Demo Counselor')).toBe(0);
  });

  it.each([['the CEO', CEO], ['a CO_FOUNDER', COFOUNDER]])('%s sees no Resume on a paused workflow and no final approval', (_label, viewer) => {
    const paused = render(workspace(viewer, { activation: { id: 'a1', status: 'ACTIVATION_ON_HOLD', currentStage: 2, currentMentorUserId: 'mentor-1', currentMentorName: 'Mina Mentor' }, openHold: hold }));
    expect(text(paused)).toContain('Workflow paused'); // they can still read why
    expect(text(paused)).not.toContain('Resume exactly where it stopped');
    const pending = render(workspace(viewer, { activation: { id: 'a1', status: 'PENDING_FINAL_APPROVAL', currentStage: 7, currentMentorUserId: 'mentor-1', currentMentorName: 'Mina Mentor' } }));
    expect(text(pending)).not.toContain('Approve activation');
    expect(text(pending)).not.toContain('Return to Mentor');
  });

  it('the Mentoring Head keeps every control the Head had: pause, blocker, cancel, exceptions, resume, tasks and final approval', () => {
    const html = render(workspace(HEAD));
    for (const label of ['Pause', 'Report blocker', 'Cancel activation', 'Authorise exception']) expect(count(html, `>${label}<`)).toBeGreaterThan(0);
    expect(count(renderPanel(workspace(HEAD), 'tasks'), 'New task for a Demo Counselor')).toBe(1);
    const paused = render(workspace(HEAD, { activation: { id: 'a1', status: 'ACTIVATION_ON_HOLD', currentStage: 2, currentMentorUserId: 'mentor-1', currentMentorName: 'Mina Mentor' }, openHold: hold }));
    expect(text(paused)).toContain('Resume exactly where it stopped');
    const pending = render(workspace(HEAD, { activation: { id: 'a1', status: 'PENDING_FINAL_APPROVAL', currentStage: 7, currentMentorUserId: 'mentor-1', currentMentorName: 'Mina Mentor' } }));
    expect(text(pending)).toContain('Approve activation');
  });

  it('the assigned Mentor can pause, report a blocker and create tasks, but cannot cancel, authorise exceptions or approve', () => {
    const html = render(workspace(MENTOR));
    expect(count(html, '>Pause<')).toBe(1);
    expect(count(html, '>Report blocker<')).toBe(1);
    expect(count(html, '>Cancel activation<')).toBe(0);
    expect(count(html, '>Authorise exception<')).toBe(0);
    expect(count(renderPanel(workspace(MENTOR), 'tasks'), 'New task for a Demo Counselor')).toBe(1);
    const pending = render(workspace(MENTOR, { activation: { id: 'a1', status: 'PENDING_FINAL_APPROVAL', currentStage: 7, currentMentorUserId: 'mentor-1', currentMentorName: 'Mina Mentor' } }));
    expect(text(pending)).not.toContain('Approve activation');
  });
});

describe('contact numbers and the language list', () => {
  const html = render(workspace(MENTOR));
  const source = (f: string) => require('fs').readFileSync(require('path').join(__dirname, f), 'utf8');

  it('shows the primary number, the WhatsApp number and one optional Alternate / Emergency Contact Number', () => {
    for (const key of ['parent.primaryPhone', 'parent.whatsappNumber', 'parent.altPhone1']) expect(html).toContain('data-field="' + key + '"');
    expect(html).not.toContain('data-field="parent.altPhone2"');
    expect(html).not.toContain('Add another phone number');
    expect(text(row(html, 'parent.altPhone1'))).toContain('Alternate / Emergency Contact Number');
    expect(text(row(html, 'parent.altPhone1'))).toContain('Optional');
  });

  it('the WhatsApp card has the "same as primary contact number" checkbox, and the box follows the primary number while it is ticked', () => {
    expect(text(row(html, 'parent.whatsappNumber'))).toContain('WhatsApp number is the same as primary contact number.');
    expect(row(html, 'parent.whatsappNumber')).toMatch(/<input[^>]*type="checkbox"/);
    expect(row(html, 'parent.primaryPhone')).not.toMatch(/type="checkbox"/);
    const source = require('fs').readFileSync(require('path').join(__dirname, 'students/[id]/InformationWorkspace.tsx'), 'utf8');
    expect(source).toContain('if (isWhatsapp && sameAsPrimary && value !== primaryPhone) setValue(primaryPhone)');
  });

  it('the preferred language list ends with an option to add another language', () => {
    expect(source('students/[id]/FieldInput.tsx')).toContain('Add another language');
    expect(source('students/[id]/FieldInput.tsx')).toContain('Type the language');
    expect(source('handover-editing.ts')).toContain('meta.allowCustom');
  });
});

describe('the sixteen requirements are four groups', () => {
  const G = (n: number) => [
    { group: 'student_parent_verification', groupLabel: 'Student & Parent Verification' },
    { group: 'academic_tutor_requirements', groupLabel: 'Academic & Tutor Requirements' },
    { group: 'expectations_learning_assessment', groupLabel: 'Expectations & Learning Assessment' },
    { group: 'meeting_communication_followup', groupLabel: 'Meeting, Communication & Follow-up' },
  ][n];
  const items = [
    item('a1', { ...G(0), label: 'Student and parent details verified, including Date of Birth', state: 'VERIFIED' }),
    item('a2', { ...G(0), label: 'Parent relationship confirmed', state: 'VERIFIED' }),
    item('b1', { ...G(1), label: 'Tutor and subject requirements confirmed', state: 'VERIFIED' }),
    item('b2', { ...G(1), label: 'Academic requirements and subject details recorded' }),
    item('b3', { ...G(1), label: 'Previous academic marks collected, or marked unavailable with a reason', state: 'UNAVAILABLE', reason: 'School has not issued marks' }),
    item('c1', { ...G(2), label: 'Parent expectations and concerns documented', exception: true, exceptionDetail: { reason: 'Parent unavailable', authorizedByName: 'Hari Head', authorizedAt: '2026-11-04T10:00:00Z', stageAdvanced: false } }),
    item('d1', { ...G(3), label: 'Additional student information collected' }),
  ];
  const html = render(workspace(MENTOR, { stages: stages(items) }));
  const groupOf = (label: string) => new RegExp('<details[^>]*aria-label="' + label.replace(/&/g, '&amp;') + '".*?</details>', 's').exec(html)![0];

  it('shows four groups, each opened to show its own requirements', () => {
    const labels = Array.from(html.matchAll(/<details[^>]*role="group" aria-label="([^"]+)"/g)).map((m) => m[1]);
    expect(labels).toEqual(['Student &amp; Parent Verification', 'Academic &amp; Tutor Requirements', 'Expectations &amp; Learning Assessment', 'Meeting, Communication &amp; Follow-up']);
    expect(groupOf('Academic & Tutor Requirements')).toContain('Tutor and subject requirements confirmed');
    expect(groupOf('Academic & Tutor Requirements')).toContain('Academic requirements and subject details recorded');
    expect(groupOf('Student & Parent Verification')).not.toContain('Additional student information collected');
  });

  it('a group is Complete only when every requirement in it is completed, unavailable with a reason, or excepted', () => {
    expect(text(groupOf('Student & Parent Verification'))).toContain('Complete');
    expect(text(groupOf('Expectations & Learning Assessment'))).toContain('Complete'); // its one requirement has an authorised exception
    expect(text(groupOf('Academic & Tutor Requirements'))).toContain('In progress'); // one requirement is still open
    expect(text(groupOf('Academic & Tutor Requirements'))).toContain('3 requirements | 1 completed | 1 pending | 1 unavailable');
    expect(text(groupOf('Meeting, Communication & Follow-up'))).toContain('Not started');
  });

  it('keeps each requirement\'s own status inside its group', () => {
    expect(text(groupOf('Academic & Tutor Requirements'))).toContain('School has not issued marks');
    expect(groupOf('Student & Parent Verification')).toContain('data-item="a1"');
  });
});

describe('the fields of each step are in named parts', () => {
  const html = render(workspace(MENTOR));
  const part = (id: string) => Array.from(html.matchAll(/data-subsection="([^"]+)"/g)).map((m) => m[1]).filter(() => true);

  it('names the parts of every step', () => {
    const parts = Array.from(html.matchAll(/<h4[^>]*>([^<]+)<\/h4>/g)).map((m) => m[1]);
    for (const expected of ['Student profile', 'Parent and contact information', 'A. Academic requirements', 'B. Tutor preferences', 'C. Tutor assignment', 'D. Preferred timetable', 'A. Previous academic performance', 'B. Upcoming examination details', 'A. Parent expectations', 'B. Student engagement', 'C. Learning difficulties and concerns']) {
      expect(parts).toContain(expected);
    }
    expect(part('x').length).toBe(parts.length);
  });

  it('the Student Learning Profile keeps its three fields separate', () => {
    for (const key of ['parentExpectations', 'studentEngagement', 'student.learningConcerns']) expect(html).toContain('data-field="' + key + '"');
  });

  it('the earlier note on marks is not asked for, and the two earlier examination lists are not offered', () => {
    expect(html).not.toContain('data-field="academic.previousMarks"');
    expect(html).not.toContain('data-field="examination.upcomingDates"');
    expect(html).not.toContain('data-field="examination.syllabusPortions"');
  });
});
