import { readFileSync } from 'fs';
import { join } from 'path';

import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { StudentWorkspaceClient } from './students/[id]/StudentWorkspaceClient';

jest.mock('./mentoring-client', () => ({ mentoringApi: jest.fn().mockResolvedValue({}) }));

/**
 * The mechanical rules of the project's Unslop skill (.claude/skills/unslop/SKILL.md), applied to every word the
 * redesigned Stage 1 and Stage 2 screens show and to the copy written in their source files. The skill is a writing
 * skill: it covers wording and punctuation, not layout.
 *   13 no em dashes or en dashes    17 sentence case headings    18 no decorative emoji
 *   19 straight quotes              7  no AI vocabulary          20 no chatbot phrases     23 no filler phrases
 */
const item = (key: string, over: Record<string, unknown> = {}) => ({
  key, label: `Requirement ${key}`, mandatory: true, state: 'PENDING_COLLECTION', value: null, note: null, reason: null, evidenceRef: null, requires: [],
  group: 'confirm_information', groupLabel: 'Confirmed with the parent', exception: false, exceptionDetail: null, updatedByName: null, updatedAt: null, ...over,
});

const handover = {
  completedAt: '2026-10-30T08:00:00Z',
  transferredFields: [
    { field: 'student.firstName', source: 'STUDENT', value: 'Asha' },
    { field: 'parent.primaryPhone', source: 'LEAD', value: '+971500000000' },
    { field: 'academic.subjects', source: 'REQUIREMENT', value: [{ requirementId: 'r1', subject: 'Mathematics', curriculum: 'CBSE', grade: 'Grade 8', monthlyHours: '8' }] },
  ],
  missingFields: [{ field: 'parent.relationship', reason: 'NOT_COLLECTED_IN_SALES' }, { field: 'student.gender', reason: 'NOT_PROVIDED' }],
  fieldValues: [{ fieldKey: 'student.gender', value: 'Female', origin: 'MENTOR_COLLECTED', salesValue: null, updatedByName: 'Mina Mentor', updatedAt: '2026-11-03T09:40:00Z', collectedByName: 'Mina Mentor', collectedAt: '2026-11-03T09:40:00Z' }],
  fieldVerifications: [{ fieldKey: 'student.firstName', verified: true, changedSinceVerified: false, verifiedByName: 'Mina Mentor', verifiedAt: '2026-11-03T09:10:00Z' }],
  editableFields: [{ key: 'parent.relationship', type: 'SELECT', options: ['Mother', 'Father'], columns: null, maxLength: null, minDate: null, maxDate: null }],
};

const workspace = (stageNumber: 1 | 2) => ({
  activation: { id: 'a1', status: 'ACTIVATION_IN_PROGRESS', currentStage: stageNumber, currentMentorUserId: 'mentor-1', currentMentorName: 'Mina Mentor' },
  student: { firstName: 'Asha', lastName: 'Menon', businessId: 'STU-0001' },
  parent: { name: 'Priya', primaryPhone: '+971500000000' },
  stages: [
    { number: 1, name: 'Admission Handover', status: stageNumber === 1 ? 'IN_PROGRESS' : 'COMPLETED', checklist: [item('missing_info_identified', { group: null, groupLabel: null })] },
    { number: 2, name: 'Meeting with Parents', status: stageNumber === 2 ? 'IN_PROGRESS' : 'NOT_STARTED', checklist: [
      item('a', { state: 'VERIFIED', updatedByName: 'Mina Mentor', updatedAt: '2026-11-03T09:00:00Z', note: 'Checked' }),
      item('b', { requires: [{ key: 'parent.relationship', label: 'Relationship to Student', collected: false }] }),
      item('c', { state: 'UNAVAILABLE', reason: 'School closed' }),
    ] },
    ...[3, 4, 5, 6, 7].map((n) => ({ number: n, name: `Stage ${n}`, status: 'NOT_STARTED', checklist: [] })),
  ],
  viewer: { userId: 'mentor-1', isMentor: true, isHead: false, canEditHandover: stageNumber === 2 },
  openHold: null, handover, legacyStage1Items: [{ key: 'student_parent_verified', label: 'Student and parent details verified', group: 'Original requirement', state: 'VERIFIED', note: 'Checked the form' }], tasks: [], events: [],
});

const html = (stageNumber: 1 | 2) => renderToStaticMarkup(React.createElement(StudentWorkspaceClient, { activationId: 'a1', initialWorkspace: workspace(stageNumber) }));
const visible = (markup: string) => markup.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
// The h1 is the student name, which is data, so only the section headings are checked.
const headings = (markup: string) => Array.from(markup.matchAll(/<h[23][^>]*>(.*?)<\/h[23]>/gs)).map((m) => visible(m[1]).trim());

const AI_VOCABULARY = /\b(additionally|crucial|delve|enduring|enhance|fostering|garner|interplay|intricate|pivotal|showcase|tapestry|testament|underscore|vibrant|leverage|utilize|facilitate)\b/i;
const CHATBOT = /\b(i hope this helps|let me know if|of course!|certainly!|great question)\b/i;
const FILLER = /\b(in order to|due to the fact that|it is important to note)\b/i;
// Words that stay capitalised inside a sentence-case heading.
const PROPER = new Set(['Sales', 'Mentor', 'Mentoring', 'Google', 'Meet']);

describe.each([[1], [2]] as const)('Stage %i copy follows the Unslop rules', (stageNumber) => {
  const markup = html(stageNumber);
  const t = visible(markup);

  it('uses no em dash or en dash (rule 13)', () => {
    expect(t).not.toMatch(/[–—]/);
  });

  it('uses no decorative emoji (rule 18)', () => {
    expect(t).not.toMatch(/\p{Extended_Pictographic}/u);
  });

  it('uses straight quotes only (rule 19)', () => {
    expect(t).not.toMatch(/[‘’“”]/);
  });

  it('writes headings in sentence case (rule 17)', () => {
    const list = headings(markup);
    expect(list.length).toBeGreaterThan(0);
    for (const heading of list) {
      const words = heading.replace(/[^A-Za-z' -]/g, ' ').split(/\s+/).filter(Boolean).slice(1);
      const title = words.filter((w) => /^[A-Z]/.test(w) && !PROPER.has(w));
      expect(title).toEqual([]);
    }
  });

  it('avoids AI vocabulary, chatbot phrases and filler (rules 7, 20, 23)', () => {
    expect(t).not.toMatch(AI_VOCABULARY);
    expect(t).not.toMatch(CHATBOT);
    expect(t).not.toMatch(FILLER);
  });
});

describe('copy written in the redesigned source files', () => {
  const dir = join(__dirname, 'students/[id]');
  const files = ['HandoverOverview.tsx', 'HandoverReview.tsx', 'InformationWorkspace.tsx', 'ChecklistPanel.tsx', 'EarlierResults.tsx'];

  it.each(files)('%s has no em dash, en dash, emoji or curly quote in its text', (file) => {
    const source = readFileSync(join(dir, file), 'utf8');
    expect(source).not.toMatch(/[–—]/);
    expect(source).not.toMatch(/\p{Extended_Pictographic}/u);
    expect(source).not.toMatch(/[‘’“”]/);
  });

  it('the API checklist wording for Stage 1 and Stage 2 follows the same rules', () => {
    const constants = readFileSync(join(__dirname, '../../../../../api/src/modules/mentoring/mentoring.constants.ts'), 'utf8');
    const labels = Array.from(constants.matchAll(/(?:confirmInfo|meetingConduct|m)\('[a-z_]+', '([^']+)'/g)).map((m) => m[1]);
    expect(labels.length).toBeGreaterThan(20);
    for (const label of labels) {
      expect(label).not.toMatch(/[–—]/);
      expect(label).not.toMatch(AI_VOCABULARY);
      expect(label[0]).toBe(label[0].toUpperCase());
    }
  });
});
