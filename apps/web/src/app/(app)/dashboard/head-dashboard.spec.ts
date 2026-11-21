import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import HeadDashboard, { buildHeadQueue } from '@/components/dashboard/HeadDashboard';
import { TeamCapacityCompact } from '../mentoring/CapacityPanels';
import { roleLabel } from '@/components/layout/TopHeader';
import { primaryNav, secondaryNav } from '../mentoring/shell-view';
import { mentorLines, pipeline, todayCells } from '@/components/dashboard/head-dashboard-view';

jest.mock('../mentoring/mentoring-client', () => ({ mentoringApi: jest.fn(() => new Promise(() => undefined)) }));
jest.mock('next/link', () => ({ __esModule: true, default: ({ href, children, ...rest }: any) => React.createElement('a', { href, ...rest }, children) }));
jest.mock('../mentoring/CapacityPanels', () => ({ ...jest.requireActual('../mentoring/CapacityPanels'), DashboardCapacity: () => React.createElement('div', { 'data-testid': 'capacity-slot' }) }));
jest.mock('@/components/providers/AuthProvider', () => ({ usePermissions: () => ({ hasPermission: () => true }), useAuth: () => ({}) }));

const text = (m: string) => m.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

describe('the decisions waiting on the Mentoring Head', () => {
  const q = buildHeadQueue({
    activations: [
      { activationId: 'a1', studentName: 'Asha', status: 'PENDING_FINAL_APPROVAL', daysPending: 3 },
      { activationId: 'a2', studentName: 'Ben', status: 'ACTIVATION_ON_HOLD', stageNumber: 3, stageName: 'Timetable', daysPending: 9 },
      { activationId: 'a3', studentName: 'Cy', status: 'ACTIVATION_IN_PROGRESS', blocked: true, stageNumber: 4 },
      { activationId: 'a4', studentName: 'Di', status: 'ACTIVATED' },
    ],
    complaints: [{ id: 'c1', number: 'C-1', title: 'Late', studentName: 'Eli', ack: { state: 'BREACHED' } }, { id: 'c2', number: 'C-2', title: 'Rude', studentName: 'Fay', ack: { state: 'WITHIN_SLA' } }],
  });
  it('lists approvals, stuck workflows and urgent complaints only', () => {
    expect(q.map((i) => i.id).sort()).toEqual(['approve-a1', 'complaint-c1', 'stuck-a2', 'stuck-a3']);
  });
  it('puts urgent items before the approvals', () => {
    expect(q[q.length - 1].id).toBe('approve-a1');
    expect(q[0].severity).toBe('danger');
  });
  it('is empty when nothing waits', () => {
    expect(buildHeadQueue({ activations: [], complaints: [] })).toEqual([]);
  });
});

describe('the Head dashboard shell', () => {
  const html = renderToStaticMarkup(React.createElement(HeadDashboard));
  it('shows a loading skeleton and the compact capacity slot, with no filters or hours tables', () => {
    expect(html).toContain('aria-label="Loading the dashboard"');
    expect(html).toContain('data-testid="capacity-slot"');
    expect(text(html)).not.toContain('More filters');
  });
  it('asks for the compact capacity card and never skips a failed part silently', () => {
    const fs = require('fs');
    const src = fs.readFileSync(require.resolve('@/components/dashboard/HeadDashboard').replace(/\.tsx?$/, '.tsx'), 'utf8');
    expect(src).toContain('<DashboardCapacity compact />');
    expect(src).toContain('could not be loaded, so those figures show n/a instead of zero');
  });
});

describe('the compact team capacity', () => {
  const team: any = { warningPercent: 80, defaultLimitHours: 60, totals: { limitHours: 160, allocatedHours: 95, remainingHours: 65, utilizationPercent: 59, state: 'AVAILABLE', mentors: 2 }, counts: { approaching: 0, full: 1, over: 0 }, mentors: [
    { mentorUserId: 'm2', name: 'Nikhil', isActive: true, studentCount: 2, limitHours: 100, allocatedHours: 35, remainingHours: 65, utilizationPercent: 35, state: 'AVAILABLE', limitIsDefault: false },
    { mentorUserId: 'm1', name: 'Maya', isActive: true, studentCount: 3, limitHours: 60, allocatedHours: 60, remainingHours: 0, utilizationPercent: 100, state: 'FULL', limitIsDefault: false },
  ] };
  const html = renderToStaticMarkup(React.createElement(TeamCapacityCompact, { team, canManage: true }));
  it('lists the fullest Mentor first, with limit, allocation, bar and state', () => {
    expect(html.indexOf('Maya')).toBeLessThan(html.indexOf('Nikhil'));
    for (const t of ['60 of 60 h', 'Fully utilized', 'role="progressbar"', 'href="/mentoring/staff"', 'Manage limits']) expect(html).toContain(t);
  });
  it('has no input: limits are edited on the staff page', () => {
    expect(html).not.toMatch(/<(input|select|textarea)\b/);
  });
});

describe('the Head account and navigation', () => {
  it('writes the role as a name', () => {
    expect(roleLabel('MENTORING_HEAD')).toBe('Mentoring Head');
  });
  const can = (p: string) => ['mentoring.student.read-all', 'mentoring.staff.read', 'mentoring.allocation.read', 'mentoring.approval.final', 'mentoring.task.create'].includes(p);
  it('puts the Head\'s decisions ahead of the team pages and keeps the workspaces', () => {
    expect(secondaryNav(can).map((n) => n.section).slice(0, 3)).toEqual(['approvals', 'allocation', 'tasks']);
    expect(primaryNav(can).map((n) => n.section)).toEqual(['students', 'classes', 'exams', 'meetings', 
'complaints']);
  });
});

describe('the department view arrangements', () => {
  it('groups students in activation by stage and counts the stuck ones', () => {
    const cells = pipeline([
      { status: 'ACTIVATION_IN_PROGRESS', stageNumber: 2, stageName: 'Meeting with Parents', daysPending: 3 },
      { status: 'ACTIVATION_ON_HOLD', stageNumber: 2, daysPending: 9 },
      { status: 'ACTIVATION_IN_PROGRESS', stageNumber: 5, blocked: true, daysPending: 1 },
      { status: 'ACTIVATED', stageNumber: 7 },
      { status: 'CANCELLED', stageNumber: 1 },
    ]);
    expect(cells).toHaveLength(7);
    expect(cells[1]).toMatchObject({ count: 2, stuck: 1, longestDays: 9, name: 'Meeting with Parents' });
    expect(cells[4]).toMatchObject({ count: 1, stuck: 1 });
    expect(cells[6].count).toBe(0);
    expect(cells[0].count).toBe(0);
  });
  it('lists the team classes today with filters that exist, and adds not held to moved', () => {
    const c = todayCells({ SCHEDULED: 3, AWAITING_MENTOR_VERIFICATION: 2, NOT_CONDUCTED: 1, RESCHEDULED: 2 });
    expect(c.map((x) => x.n)).toEqual([3, 0, 2, 0, 3]);
    expect(c.find((x) => x.key === 'AWAITING_MENTOR_VERIFICATION')?.attention).toBe(true);
    expect(todayCells(null).every((x) => x.n === 0)).toBe(true);
  });
  it('orders Mentors by work waiting and never guesses a percentage without scheduled hours', () => {
    const lines = mentorLines([
      { mentorUserId: 'a', name: 'Asha', assignedStudents: 3, pendingVerification: 0, pendingTasks: 0, consumedHours: 5, scheduledHours: 0 },
      { mentorUserId: 'b', name: 'Ben', assignedStudents: 4, pendingVerification: 2, pendingTasks: 5, consumedHours: 10, scheduledHours: 40 },
    ]);
    expect(lines.map((l) => l.name)).toEqual(['Ben', 'Asha']);
    expect(lines[0].percent).toBe(25);
    expect(lines[1].percent).toBe(0);
  });
});
