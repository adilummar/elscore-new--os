/** @jest-environment node */
import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'fs';
import { join } from 'path';

import { OwnCapacity, TeamCapacity, capacitySentence, needingAttention, parseLimit } from './capacity-view';
import { MentorCapacityCard, TeamCapacityView } from './CapacityPanels';
import { sectionsOf, verifiedCount, verifiedLine } from './section-verification-view';

jest.mock('./mentoring-client', () => ({ mentoringApi: jest.fn() }));
jest.mock('@/components/providers/AuthProvider', () => ({ usePermissions: () => ({ hasPermission: () => false }) }));

const own = (over: Partial<OwnCapacity> = {}): OwnCapacity => ({
  mentorUserId: 'm1', limitHours: 60, allocatedHours: 60, remainingHours: 0, utilizationPercent: 100, state: 'FULL', limitIsDefault: false,
  students: [
    { activationId: 'a1', studentId: 's1', studentBusinessId: 'STU-1', studentName: 'Asha K', status: 'ACTIVATED', monthlyHours: 20 },
    { activationId: 'a2', studentId: 's2', studentBusinessId: 'STU-2', studentName: 'Ravi P', status: 'ACTIVATED', monthlyHours: 15 },
    { activationId: 'a3', studentId: 's3', studentBusinessId: 'STU-3', studentName: 'Mina T', status: 'ACTIVATION_IN_PROGRESS', monthlyHours: 25 },
  ],
  ...over,
});
const team = (): TeamCapacity => ({
  warningPercent: 80, defaultLimitHours: 160,
  totals: { limitHours: 160, allocatedHours: 150, remainingHours: 10, utilizationPercent: 93.75, state: 'APPROACHING', mentors: 3, },
  counts: { approaching: 1, full: 0, over: 1 },
  mentors: [
    { mentorUserId: 'a', name: 'Asha', isActive: true, studentCount: 3, limitHours: 60, allocatedHours: 40, remainingHours: 20, utilizationPercent: 66.67, state: 'AVAILABLE', limitIsDefault: false },
    { mentorUserId: 'b', name: 'Bela', isActive: true, studentCount: 4, limitHours: 50, allocatedHours: 45, remainingHours: 5, utilizationPercent: 90, state: 'APPROACHING', limitIsDefault: true },
    { mentorUserId: 'c', name: 'Chitra', isActive: true, studentCount: 6, limitHours: 50, allocatedHours: 65, remainingHours: -15, utilizationPercent: 130, state: 'OVER', limitIsDefault: false },
  ],
});

describe('capacity wording and helpers', () => {
  it('says how many hours are used and left, or over', () => {
    expect(capacitySentence({ limitHours: 60, allocatedHours: 42, remainingHours: 18 })).toBe('42 of 60 hours used, 18 left');
    expect(capacitySentence({ limitHours: 50, allocatedHours: 65, remainingHours: -15 })).toBe('65 of 50 hours used, 15 over');
  });

  it('lists Mentors needing attention, most over capacity first', () => {
    expect(needingAttention(team()).map((m) => m.name)).toEqual(['Chitra', 'Bela']);
  });

  it('accepts only a number from 0 to 1000 as a limit', () => {
    expect([parseLimit('60'), parseLimit('12.5'), parseLimit(''), parseLimit('-1'), parseLimit('1001'), parseLimit('abc')]).toEqual([60, 12.5, null, null, null, null]);
  });
});

describe('the Mentor sees their own capacity, read only', () => {
  const html = renderToStaticMarkup(React.createElement(MentorCapacityCard, { capacity: own() }));

  it('shows limit, allocated, remaining, utilization, state and every contributing student', () => {
    for (const t of ['Monthly limit', '60 h', 'Allocated student hours', 'Remaining', 'Utilization', '100%', 'Fully utilized', 'Asha K', 'Ravi P', 'Mina T', '25 h']) expect(html).toContain(t);
    expect(html).toContain('href="/mentoring/students/a1"');
  });

  it('has no input, select, textarea or save button: a Mentor cannot change their limit', () => {
    expect(html).not.toMatch(/<(input|select|textarea)\b/);
    expect(html).not.toMatch(/Save|Edit/);
    expect(html).toContain('Only the Mentoring Head can change your limit');
  });

  it('warns when close to, at or over the limit', () => {
    const over = renderToStaticMarkup(React.createElement(MentorCapacityCard, { capacity: own({ allocatedHours: 70, remainingHours: -10, utilizationPercent: 116.67, state: 'OVER' }) }));
    expect(over).toContain('Over capacity');
    expect(over).toContain('10 hours over your monthly limit');
    expect(html).toContain('fully used');
  });
});

describe('the Mentoring Head sees the team', () => {
  const html = renderToStaticMarkup(React.createElement(TeamCapacityView, { team: team(), canManage: true, onChanged: () => undefined }));

  it('shows every Mentor with limit, allocated, remaining, utilization and state, and flags those needing attention', () => {
    for (const t of ['Asha', 'Bela', 'Chitra', 'Available', 'Approaching capacity', 'Over capacity', 'Needs attention', '130%']) expect(html).toContain(t);
    expect(html).toContain('default');
    expect(html).toContain('Team: 150 of 160 hours used');
  });

  it('keeps the limit editor out of the page until a row is opened, and never offers it without staff management', () => {
    expect(html).not.toMatch(/<input/);
    const source = readFileSync(join(__dirname, 'CapacityPanels.tsx'), 'utf8');
    expect(source).toContain('canManage ? (');
    expect(source).toContain("'/mentoring/capacity/team'");
    expect(source).toContain("'/mentoring/capacity/me'");
  });
});

describe('the pages use the capacity panels, and the old student-count capacity is gone', () => {
  const read = (f: string) => readFileSync(join(__dirname, f), 'utf8');
  it('the dashboard and the staff page show capacity; the staff form no longer takes a student-count capacity', () => {
    expect(read('dashboard/DashboardClient.tsx')).toContain('<DashboardCapacity />');
    expect(read('staff/StaffClient.tsx')).toContain('<DashboardCapacity />');
    expect(read('staff/StaffClient.tsx')).not.toContain('Capacity (Mentors)');
    expect(read('allocation/AllocationClient.tsx')).not.toContain('openStudents >= m.capacity');
  });
});

describe('section verification view', () => {
  const sec = (sectionId: string, status: string, extra = {}) => ({ sectionId, label: sectionId, covers: '', fieldKeys: [], status, verifiedByName: null, verifiedAt: null, ...extra });
  it('returns the four sections in the fixed order and ignores anything else', () => {
    const handover = { sectionVerifications: [sec('MARKS_EXAMINATIONS', 'NOT_VERIFIED'), sec('STUDENT_PARENT_INFO', 'VERIFIED'), sec('SOMETHING_ELSE', 'VERIFIED'), 'x', null] };
    expect(sectionsOf(handover).map((s) => s.sectionId)).toEqual(['STUDENT_PARENT_INFO', 'MARKS_EXAMINATIONS']);
    expect(verifiedCount(sectionsOf(handover))).toBe(1);
    expect(sectionsOf(null)).toEqual([]);
  });

  it('describes a verification with who and when, and says nothing while Not Verified', () => {
    expect(verifiedLine(sec('A', 'VERIFIED', { verifiedByName: 'Mina', verifiedAt: '2026-11-07T10:00:00Z' }) as never)).toBe('Verified by Mina, 7 Nov 2026');
    expect(verifiedLine(sec('A', 'VERIFIED') as never)).toBe('Verified');
    expect(verifiedLine(sec('A', 'NOT_VERIFIED') as never)).toBeNull();
  });
});
