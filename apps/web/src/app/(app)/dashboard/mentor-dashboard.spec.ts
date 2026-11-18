import * as fs from 'fs';
import * as path from 'path';
import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import MentorDashboard, { buildQueue } from '@/components/dashboard/MentorDashboard';

jest.mock('../mentoring/mentoring-client', () => ({ mentoringApi: jest.fn(() => new Promise(() => undefined)) }));
jest.mock('next/link', () => ({ __esModule: true, default: ({ href, children, ...rest }: any) => React.createElement('a', { href, ...rest }, children) }));
// The capacity card reads the signed-in user's permissions; it has its own tests (mentoring/capacity.spec.ts).
jest.mock('../mentoring/CapacityPanels', () => ({ DashboardCapacity: () => React.createElement('div', { 'data-testid': 'capacity-slot' }) }));
jest.mock('../mentoring/ClassWorkspaceDrawer', () => ({ ClassWorkspaceDrawer: () => React.createElement('div', null, 'Drawer') }));

const text = (markup: string) => markup.replace(/<[^>]+>/g, ' ').replace(/&#x27;/g, "'").replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
const source = fs.readFileSync(path.resolve(__dirname, '../../../components/dashboard/MentorDashboard.tsx'), 'utf8');

describe('Mentor dashboard shell', () => {
  const html = renderToStaticMarkup(React.createElement(MentorDashboard, {}));
  it('names the page and links to the four workspaces that exist', () => {
    expect(text(html)).toContain('Mentor dashboard');
    for (const href of ['/mentoring/classes', '/mentoring/exams', '/mentoring/meetings', '/mentoring/complaints']) expect(html).toContain(`href="${href}"`);
  });
  it('never links to routes that do not exist', () => {
    expect(source).not.toContain('/mentoring/reviews"');
    expect(source).not.toContain('classState=');
    expect(source).toContain('/mentoring/classes?state=SCHEDULED');
  });
  it('shows a loading skeleton, not zeros, before the first load', () => {
    expect(html).toContain('aria-label="Loading the dashboard"');
    expect(html).not.toContain('data-testid="today-classes-group"');
  });
  it('offers one search and keeps the rest behind More filters, with no dead complaint filters', () => {
    const t = text(html);
    expect(t).toContain('Student name or ID');
    expect(t).toContain('More filters');
    expect(html).toContain('aria-expanded="false"');
    expect(t).not.toContain('Complaint category');
    expect(t).not.toContain('Response time status');
  });
  it('offers the period choices as one grouped control', () => {
    const t = text(html);
    for (const w of ['Today', 'This week', 'This month', 'Custom dates']) expect(t).toContain(w);
  });
});

describe('Needs you now queue', () => {
  const data = {
    classes: [
      { key: 'c1', state: 'AWAITING_MENTOR_VERIFICATION', studentName: 'Asha', subjectName: 'Maths' },
      { key: 'c2', state: 'AWAITING_TUTOR_UPDATE', studentName: 'Ben', tutorName: 'Dr Rao' },
      { key: 'c3', state: 'VERIFIED', studentName: 'Cy' },
    ],
    complaints: [{ id: 'k1', number: 'C-1', title: 'Late class', studentName: 'Dev', ack: { state: 'BREACHED' } }],
    exams: [{ activationId: 'a1', subjectId: 's1', studentName: 'Eli', subjectName: 'Physics', due: true, scheduledExam: null }, { activationId: 'a2', subjectId: 's1', studentName: 'Fay', due: true, scheduledExam: { date: '2026-11-20' } }],
    reviews: [{ activationId: 'a3', studentName: 'Gus', overdue: true }],
    activations: [{ activationId: 'a4', studentName: 'Hal', blocked: true, stageNumber: 3, stageName: 'Parent orientation', daysPending: 6 }],
  };
  const verify = jest.fn();
  const queue = buildQueue(data, verify);
  it('lists only work that waits on the Mentor', () => {
    expect(queue.map((i) => i.category).sort()).toEqual(['Class', 'Class', 'Complaint', 'Exam', 'Handover', 'Meeting']);
  });
  it('puts missed deadlines first and reserves red for them', () => {
    const order = queue.map((i) => i.severity);
    expect(order).toEqual([...order].sort((a, b) => ['danger', 'warning', 'info'].indexOf(a) - ['danger', 'warning', 'info'].indexOf(b)));
    expect(queue.find((i) => i.id === 'class-verify-c1')?.severity).toBe('warning');
    expect(queue.find((i) => i.id === 'complaint-k1')?.severity).toBe('danger');
  });
  it('opens verification in place for a class', () => {
    queue.find((i) => i.id === 'class-verify-c1')?.onActionClick?.();
    expect(verify).toHaveBeenCalledWith('c1');
  });
  it('is empty when nothing waits', () => {
    expect(buildQueue({ classes: [], complaints: [], exams: [], reviews: [], activations: [] }, verify)).toEqual([]);
  });
});

describe('Mentor dashboard copy and verification', () => {
  it('opens verification in the shared dialog, not at the bottom of the page', () => {
    expect(source).toContain('<Overlay');
  });
  it('says what failed instead of showing zero', () => {
    expect(source).toContain('could not be loaded, so those figures show n/a instead of zero');
  });
  it('keeps UI copy free of em dashes and decorative bullets', () => {
    const copy = source.split('\n').filter((l) => !l.trim().startsWith('//') && !l.trim().startsWith('*')).join('\n');
    expect(copy).not.toMatch(/[—–•]/);
  });
});
