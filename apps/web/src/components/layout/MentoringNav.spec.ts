/** @jest-environment node */
import * as React from 'react';
import { readFileSync } from 'fs';
import { join } from 'path';
import { renderToStaticMarkup } from 'react-dom/server';

import { MentoringNav, isMentoringRoute, openStudentId } from './MentoringNav';

let mockPath = '/mentoring/students';
let mockQuery = '';
jest.mock('next/navigation', () => ({ usePathname: () => mockPath, useSearchParams: () => new URLSearchParams(mockQuery) }));
jest.mock('next/link', () => ({ __esModule: true, default: ({ href, children, ...rest }: any) => React.createElement('a', { href, ...rest }, children) }));

const MENTOR = new Set(['mentoring.student.read-assigned', 'mentoring.stage.work', 'mentoring.task.create', 'mentoring.task.work']);
const HEAD = new Set(['mentoring.student.read-all', 'mentoring.staff.read', 'mentoring.allocation.read', 'mentoring.approval.final']);
const render = (perms: Set<string>) => renderToStaticMarkup(React.createElement(MentoringNav, { hasPermission: (p: string) => perms.has(p) }));

describe('the Mentoring group in the sidebar', () => {
  it('lists the five main areas and the supporting links a Mentor may open, with the current page marked', () => {
    mockPath = '/mentoring/students'; mockQuery = '';
    const html = render(MENTOR);
    for (const label of ['My Students', 'Classes', 'Exams', 'Meetings', 'Complaints', 'Phase 1 onboarding', 'Pending actions', 'Overview']) expect(html).toContain(label);
    expect(html).not.toContain('Allocation');
    expect(html).not.toContain('Mentors and counselors');
    expect(html).toMatch(/href="\/mentoring\/students"[^>]*aria-current="page"/);
  });

  it('shows the Head the department areas as well', () => {
    mockPath = '/mentoring/allocation';
    const html = render(HEAD);
    for (const label of ['Students', 'Allocation', 'Final approvals', 'Mentors and counselors', 'Department overview']) expect(html).toContain(label);
    expect(html).toMatch(/href="\/mentoring\/allocation"[^>]*aria-current="page"/);
  });

  it('tells My Students from Phase 1 onboarding by the status in the address', () => {
    mockPath = '/mentoring/students'; mockQuery = 'status=ACTIVATION_IN_PROGRESS';
    const html = render(MENTOR);
    expect(html).toMatch(/href="\/mentoring\/students\?status=ACTIVATION_IN_PROGRESS"[^>]*aria-current="page"/);
    expect(html).not.toMatch(/href="\/mentoring\/students"[^>]*aria-current="page"/);
    mockQuery = '';
  });

  it('is open on Mentoring pages, and shows nothing to someone with no Mentoring access', () => {
    mockPath = '/mentoring/classes';
    expect(render(MENTOR)).toContain('aria-expanded="true"');
    expect(render(new Set())).toBe('');
    expect(isMentoringRoute('/mentoring/students/abc')).toBe(true);
    expect(isMentoringRoute('/dashboard')).toBe(false);
  });

  it('while one student is open, lists that student\'s sections and marks the open one', () => {
    mockPath = '/mentoring/students/abc-123'; mockQuery = 'panel=checklist';
    let html = render(MENTOR);
    expect(html).toContain('aria-label="This student"');
    for (const label of ['Checklist', 'Daily classes', 'Weekly exams', 'Monthly review', 'Complaints', 'Tasks', 'History']) expect(html).toContain(label);
    expect(html).toContain('href="/mentoring/students/abc-123?panel=classes"');
    expect(html).toMatch(/href="\/mentoring\/students\/abc-123\?panel=checklist"[^>]*aria-current="page"/);
    mockQuery = 'panel=exams';
    html = render(MENTOR);
    expect(html).toMatch(/href="\/mentoring\/students\/abc-123\?panel=exams"[^>]*aria-current="page"/);
    mockPath = '/mentoring/classes'; mockQuery = '';
    expect(render(MENTOR)).not.toContain('This student');
    expect(openStudentId('/mentoring/students/abc-123')).toBe('abc-123');
    expect(openStudentId('/mentoring/students')).toBeNull();
  });

  it('the page itself no longer carries the tabs and links, and the sidebar mounts the group', () => {
    const shell = readFileSync(join(__dirname, '../../app/(app)/mentoring/MentoringShell.tsx'), 'utf8');
    expect(shell).not.toContain('aria-label="Mentoring workspaces"');
    expect(shell).not.toContain('aria-label="More Mentoring areas"');
    expect(shell).toContain('aria-label="Breadcrumb"');
    const sidebar = readFileSync(join(__dirname, 'Sidebar.tsx'), 'utf8');
    expect(sidebar).toContain('<MentoringNav');
  });
});
