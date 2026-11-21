/** @jest-environment node */
import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'fs';
import { join } from 'path';

import { ChecklistPanel } from './students/[id]/ChecklistPanel';

const noop = async () => undefined;
const GROUPS = [
  { key: 'student_parent_verification', label: 'Student & Parent Verification' },
  { key: 'academic_tutor_requirements', label: 'Academic & Tutor Requirements' },
  { key: 'expectations_learning_assessment', label: 'Expectations & Learning Assessment' },
  { key: 'meeting_communication_followup', label: 'Meeting, Communication & Follow-up' },
];
const item = (key: string, groupIndex: number, over: Record<string, unknown> = {}) => ({
  key, label: `Requirement ${key}`, mandatory: true, allowsUnavailable: true, state: 'PENDING_COLLECTION', value: null, note: null, reason: null, evidenceRef: null,
  group: GROUPS[groupIndex].key, groupLabel: GROUPS[groupIndex].label, requires: [], exception: false, exceptionDetail: null, updatedByName: null, updatedAt: null, ...over,
});
const items = [
  item('a1', 0, { state: 'VERIFIED', updatedByName: 'Mina Mentor', updatedAt: '2026-11-03T09:00:00Z' }),
  item('a2', 0, { state: 'VERIFIED' }),
  item('a3', 0, { state: 'VERIFIED' }),
  item('a4', 0),
  item('b1', 1, { state: 'VERIFIED' }),
  item('b2', 1, { requires: [{ key: 'academic.weakAreas', label: 'Academic Difficulties / Weak Areas', collected: true }, { key: 'academic.examPreparation', label: 'Examination Preparation Requirements', collected: false }] }),
  item('b3', 1, { state: 'UNAVAILABLE', reason: 'School has not issued marks' }),
  item('b4', 1, { state: 'VERIFIED' }),
  item('c1', 2, { exception: true, exceptionDetail: { reason: 'Parent was unreachable', authorizedByName: 'Hari Head', at: '2026-11-04T10:00:00Z' } }),
  item('c2', 2, { state: 'VERIFIED' }),
  item('d1', 3, { allowsUnavailable: false }),
  item('d2', 3, { allowsUnavailable: false }),
];
const html = (over: Record<string, unknown> = {}) =>
  renderToStaticMarkup(React.createElement(ChecklistPanel, { items: items as any, editable: true, canAuthorizeException: false, busy: false, onUpdate: noop, onAuthorizeException: noop, onDirtyChange: () => undefined, ...over } as any));
const text = (s: string) => s.replace(/<[^>]*>/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
const groupOf = (markup: string, label: string) => new RegExp('<details[^>]*aria-label="' + label.replace(/&/g, '&amp;') + '".*?</details>', 's').exec(markup)![0];

describe('the four group cards', () => {
  const out = html();

  it('shows exactly four groups in order, each with a title, counts, a status and a progress indicator', () => {
    const labels = Array.from(out.matchAll(/<details[^>]*role="group" aria-label="([^"]+)"/g)).map((m) => m[1].replace(/&amp;/g, '&'));
    expect(labels).toEqual(GROUPS.map((g) => g.label));
    for (const g of GROUPS) {
      const card = groupOf(out, g.label);
      expect(card).toContain('data-testid="group-counts"');
      expect(card).toMatch(/role="progressbar"/);
      expect(card).toMatch(/<svg[^>]*lucide-chevron-down/); // the expand and collapse control
    }
  });

  it('counts requirements, completed and pending in the words of the specification', () => {
    expect(text(groupOf(out, 'Student & Parent Verification'))).toContain('4 requirements | 3 completed | 1 pending');
    expect(text(groupOf(out, 'Academic & Tutor Requirements'))).toContain('4 requirements | 2 completed | 1 pending | 1 unavailable');
    expect(text(groupOf(out, 'Expectations & Learning Assessment'))).toContain('2 requirements | 1 completed | 0 pending | 1 excepted');
    expect(text(groupOf(out, 'Meeting, Communication & Follow-up'))).toContain('2 requirements | 0 completed | 2 pending');
  });

  it('a group is Complete only with no pending requirement: 3 + 1 pending is In progress, an exception can complete it, nothing done is Not started', () => {
    expect(text(groupOf(out, 'Student & Parent Verification'))).toContain('In progress');
    expect(text(groupOf(out, 'Academic & Tutor Requirements'))).toContain('In progress');
    expect(text(groupOf(out, 'Expectations & Learning Assessment'))).toContain('Complete');
    expect(text(groupOf(out, 'Meeting, Communication & Follow-up'))).toContain('Not started');
    expect(groupOf(out, 'Expectations & Learning Assessment')).toContain('data-group-status="complete"');
  });

  it('the progress bar fills with the resolved requirements', () => {
    const bar = (label: string) => /aria-valuenow="(\d+)"/.exec(groupOf(out, label))![1];
    expect([bar('Student & Parent Verification'), bar('Academic & Tutor Requirements'), bar('Expectations & Learning Assessment'), bar('Meeting, Communication & Follow-up')]).toEqual(['75', '75', '100', '0']);
  });

  it('opens the first group that is not complete, so a Mentor lands on the work, and each group can be opened and closed', () => {
    expect(groupOf(out, 'Student & Parent Verification')).toMatch(/^<details open=""/);
    expect(groupOf(out, 'Expectations & Learning Assessment')).not.toMatch(/^<details open=""/);
    const source = readFileSync(join(__dirname, 'students/[id]/ChecklistPanel.tsx'), 'utf8');
    expect(source).toContain('onToggle={(e) => setOpen');
    expect(source).toContain('motion-reduce:transition-none');
  });

  it('the API\'s group figures are used when it sends them, not the page\'s own count', () => {
    const summary = {
      groups: GROUPS.map((g, i) => ({ key: g.key, label: g.label, total: 4, completed: i === 0 ? 4 : 0, unavailable: 0, excepted: 0, pending: i === 0 ? 0 : 4, complete: i === 0, status: i === 0 ? 'COMPLETE' : 'NOT_STARTED', itemKeys: [] })),
      groupsTotal: 4, groupsComplete: 1, complete: false,
    };
    const served = html({ summary });
    expect(text(groupOf(served, 'Student & Parent Verification'))).toContain('4 requirements | 4 completed | 0 pending');
    expect(text(served)).toContain('1 of 4 groups complete');
  });

  it('says when every group is complete', () => {
    const summary = { groups: [], groupsTotal: 4, groupsComplete: 4, complete: true };
    expect(text(html({ summary }))).toContain('4 of 4 groups complete. Every group is complete.');
  });
});

describe('the requirements inside a group', () => {
  const out = html();
  const row = (key: string) => new RegExp('<li[^>]*data-item="' + key + '".*?</li>', 's').exec(out)![0];

  it('each requirement keeps its own status, its own control and who completed it', () => {
    expect(row('a1')).toMatch(/aria-label="Requirement a1: completed"[^>]*checked/);
    expect(text(row('a1'))).toContain('Completed by Mina Mentor');
    expect(row('a4')).toMatch(/aria-label="Requirement a4: not completed"/);
    expect(row('a4')).not.toMatch(/checked/);
    expect(text(row('b3'))).toContain('Unavailable');
    expect(text(row('b3'))).toContain('Reason: School has not issued marks');
  });

  it('shows the information collected for a requirement and what it is still waiting for', () => {
    expect(text(row('b2'))).toContain('Collected: Academic Difficulties / Weak Areas');
    expect(text(row('b2'))).toContain('Waiting for Examination Preparation Requirements');
  });

  it('shows an authorised exception with who authorised it, when, and why', () => {
    expect(text(row('c1'))).toContain('Exception authorised by Hari Head');
    expect(text(row('c1'))).toContain('Reason: Parent was unreachable');
  });

  it('shows the history of a requirement when there is some, and not when there is none', () => {
    const events = [
      { id: 'e1', type: 'CHECKLIST_UPDATED', fromStatus: 'PENDING_COLLECTION', toStatus: 'VERIFIED', actorName: 'Mina Mentor', createdAt: '2026-11-03T09:00:00Z', payload: { itemKey: 'a1' } },
      { id: 'e2', type: 'EXCEPTION_AUTHORIZED', reason: 'Parent was unreachable', actorName: 'Hari Head', createdAt: '2026-11-04T10:00:00Z', payload: { itemKey: 'c1' } },
      { id: 'e3', type: 'MENTOR_ALLOCATED', createdAt: '2026-11-01T09:00:00Z', payload: {} },
    ];
    const withHistory = html({ events });
    const a1 = new RegExp('<li[^>]*data-item="a1".*?</li>', 's').exec(withHistory)![0];
    expect(a1).toContain('data-testid="item-history"');
    expect(text(a1)).toContain('History (1)');
    expect(text(a1)).toContain('Mina Mentor: Pending to Completed');
    expect(text(new RegExp('<li[^>]*data-item="c1".*?</li>', 's').exec(withHistory)![0])).toContain('exception authorised. Reason: Parent was unreachable');
    expect(new RegExp('<li[^>]*data-item="a2".*?</li>', 's').exec(withHistory)![0]).not.toContain('item-history');
    expect(row('a1')).not.toContain('item-history');
  });

  it('an action cannot be marked unavailable: the status list leaves out unavailable and not applicable, and says why', () => {
    const source = readFileSync(join(__dirname, 'students/[id]/ChecklistPanel.tsx'), 'utf8');
    expect(source).toContain("item.allowsUnavailable === false ? STATE_CHOICES.filter(");
    expect(source).toContain('This requirement cannot be marked unavailable. Complete it, or ask the Mentoring Head to authorise an exception.');
    expect(source).toContain("reason.trim().length < 5");
  });

  it('a Mentoring Head sees Authorise exception on a pending requirement, and nobody sees a group-level control that bypasses its items', () => {
    const head = html({ editable: false, canAuthorizeException: true });
    expect(head).toContain('Authorise exception');
    const card = groupOf(out, 'Student & Parent Verification');
    const summaryPart = card.slice(0, card.indexOf('<ul'));
    expect(summaryPart).not.toMatch(/<input|<button/); // the group header has no checkbox or button of its own
  });

  it('a person who cannot edit sees the requirements and their status, with no controls', () => {
    const readOnly = html({ editable: false });
    expect(readOnly).not.toContain('>Details<');
    expect(readOnly.match(/type="checkbox"[^>]*disabled/g)?.length).toBe(items.length);
  });
});

describe('empty and partial states', () => {
  it('a checklist with no items renders an empty panel without failing', () => {
    expect(() => html({ items: [] })).not.toThrow();
    expect(text(html({ items: [] }))).toContain('0 of 0 requirements completed');
  });

  it('items that belong to no group are listed plainly, without a group card', () => {
    const plain = html({ items: [{ ...item('z1', 0), group: null, groupLabel: null }] });
    expect(plain).not.toContain('<details');
    expect(plain).toContain('data-item="z1"');
  });
});

describe('Group Creation (stage 4) in the same panel', () => {
  const G = [
    ['whatsapp_group_setup', 'WhatsApp Group Setup'], ['introductions_welcome', 'Introductions & Welcome'],
    ['timetable_class_access', 'Timetable & Class Access'], ['class_communication_readiness', 'Class Communication & Readiness'],
  ];
  const mk = (key: string, gi: number, over: Record<string, unknown> = {}) => ({ ...item(key, 0, over), group: G[gi][0], groupLabel: G[gi][1], allowsUnavailable: false });
  const stage4 = [
    mk('group_created', 0, { state: 'VERIFIED', updatedByName: 'Mina Mentor', updatedAt: '2026-11-03T09:30:00Z' }), mk('group_dp', 0), mk('members_verified', 0),
    mk('welcome_messages', 1), mk('mentor_intro_voice', 1),
    mk('timetable_receipt', 2), mk('meet_link_shared', 2),
    mk('class_update_format', 3, { state: 'VERIFIED' }), mk('class_start_announcement', 3, { mandatory: false }),
  ];
  const out = html({ items: stage4 });

  it('shows four groups, with every sub-check inside its group, and the optional one marked advisory', () => {
    expect(Array.from(out.matchAll(/<details[^>]*role="group" aria-label="([^"]+)"/g)).map((m) => m[1].replace(/&amp;/g, '&'))).toEqual(G.map((g) => g[1]));
    expect(text(groupOf(out, 'WhatsApp Group Setup'))).toContain('3 requirements | 1 completed | 2 pending');
    expect(text(groupOf(out, 'Class Communication & Readiness'))).toContain('Advisory');
  });

  it('an advisory check never holds its group back, and who completed a check and when is shown', () => {
    expect(text(groupOf(out, 'Class Communication & Readiness'))).toContain('Complete');
    expect(text(new RegExp('<li[^>]*data-item="group_created".*?</li>', 's').exec(out)![0])).toContain('Completed by Mina Mentor');
  });
});
