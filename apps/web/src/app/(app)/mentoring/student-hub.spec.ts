import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import {
  HubRow, TABS, TONES, TONE_ORDER, daysUntil, isAuditEvent, profileModeOf, shiftAnchor, untilText, windowOf, TAB_FOR_PANEL, dateText, emptyListFilters, filtersFromParams, initialsOf, listQuery, minutesText, rowHref, studentsHref, tabOf, wantsActivationWorkflow, whenText,
} from './student-hub-view';
import { StudentListClient } from './students/StudentListClient';
import { groupByDate } from './students/[id]/ClassesTab';
import { isNavItemActive } from '@/components/layout/sidebar-navigation';

jest.mock('./mentoring-client', () => ({ mentoringApi: jest.fn().mockResolvedValue({}) }));
jest.mock('next/link', () => ({ __esModule: true, default: ({ href, children, ...rest }: any) => React.createElement('a', { href, ...rest }, children) }));

describe('figures', () => {
  it('shows a missing figure as n/a, never as zero', () => {
    expect(minutesText(null)).toBe('n/a');
    expect(minutesText(undefined)).toBe('n/a');
    expect(minutesText(0)).toBe('0 min');
    expect(minutesText(90)).toBe('1 h 30 min');
    expect(minutesText(120)).toBe('2 h');
  });

  it('writes dates as plain text so no time zone moves them', () => {
    expect(dateText('2026-11-09')).toBe('9 Nov 2026');
    expect(dateText('2026-11-09T22:30:00.000Z')).toBe('9 Nov 2026');
    expect(dateText(null)).toBe('Not set');
    expect(whenText({ date: '2026-11-09', startMinute: 900 })).toBe('9 Nov 2026, 15:00');
    expect(whenText(null)).toBe('None scheduled');
    expect(initialsOf('Asha Menon')).toBe('AM');
  });
});

describe('the list request', () => {
  it('leaves empty filters out and encodes the rest', () => {
    const f = { ...emptyListFilters(), search: 'a b&c', pendingVerification: true };
    expect(listQuery(f)).toBe('search=a%20b%26c&sort=name&dir=asc&page=1&pageSize=25&pendingVerification=true');
  });

  it('builds dashboard shortcuts that the list reads back as the same filters', () => {
    const href = studentsHref({ pendingVerification: true, consumption: 'FULLY_CONSUMED' });
    expect(href).toBe('/mentoring/students?consumption=FULLY_CONSUMED&pendingVerification=true');
    const q = new URLSearchParams(href.split('?')[1]);
    const f = filtersFromParams((k) => q.get(k));
    expect(f).toMatchObject({ pendingVerification: true, consumption: 'FULLY_CONSUMED', upcomingExam: false });
    expect(studentsHref()).toBe('/mentoring/students');
  });

  it('drops filter values it does not know', () => {
    expect(filtersFromParams((k) => (k === 'status' ? 'DROP TABLE' : k === 'consumption' ? 'x' : null))).toMatchObject({ status: '', consumption: '' });
  });
});

describe('opening a student', () => {
  it('opens an active student on the workspace and an onboarding one on the activation workflow', () => {
    expect(rowHref({ activationId: 'a1', status: 'ACTIVATED' })).toBe('/mentoring/students/a1');
    expect(rowHref({ activationId: 'a2', status: 'ACTIVATION_IN_PROGRESS' })).toBe('/mentoring/students/a2?panel=checklist');
  });

  it('has the eleven tabs in order, and maps the older panel links onto them', () => {
    expect(TABS.map(([, l]) => l)).toEqual(['Overview', 'Classes', 'Timetable', 'Exams', 'Complaints', 'Profile Details', 'Tutors', 'Learning Plan', 'Communication', 'Activation History', 'Audit History']);
    expect(tabOf('classes')).toBe('classes');
    expect(tabOf('nope')).toBe('overview');
    expect(TAB_FOR_PANEL.review).toBe('plan');
    expect(TAB_FOR_PANEL.history).toBe('activation');
    expect(wantsActivationWorkflow('checklist')).toBe(true);
    expect(wantsActivationWorkflow('classes')).toBe(false);
  });
});

describe('the Students list page', () => {
  it('renders the filters, the column headings and a loading state before any data arrives', () => {
    const html = renderToStaticMarkup(React.createElement(StudentListClient, {}));
    for (const t of ['Search by name or student ID', 'All grades', 'All subjects', 'Any class consumption', 'Classes waiting for my verification', 'Exam in the next two weeks', 'Next parent meeting', 'Classes and hours this month', 'Subjects', 'Tutors']) expect(html).toContain(t);
    expect(html).toContain('aria-busy="true"');
  });

  it('types the row it renders', () => {
    const row: HubRow = {
      activationId: 'a1', studentId: 'STU-1', name: 'Asha Menon', photoUrl: null, grade: 'Grade 8', level: null, subjects: [], tutors: [], mentor: { userId: 'm', name: 'Mira' }, isMine: true, activatedAt: null, status: 'ACTIVATED', statusLabel: 'Active',
      balance: { allocatedMinutes: null, consumedMinutes: 0, scheduledMinutes: null, pendingMinutes: 0, remainingMinutes: null, over: false, consumedClasses: 0, scheduledClasses: null }, nextClass: null, nextExam: null, nextMeeting: null, pending: { verification: 0, complaints: 0, tasks: 0, total: 0 },
    };
    expect(minutesText(row.balance.allocatedMinutes)).toBe('n/a');
  });
});

describe('lifecycle', () => {
  it('opens the activation workspace until the student is activated, and the operational workspace after', () => {
    for (const s of ['ACTIVATION_IN_PROGRESS', 'ACTIVATION_ON_HOLD', 'ACTIVATION_BLOCKED', 'PENDING_FINAL_APPROVAL']) expect(profileModeOf(s)).toBe('ACTIVATION');
    expect(profileModeOf('ACTIVATED')).toBe('OPERATIONS');
  });

  it('keeps profile edits in the audit history and every other event in the activation history', () => {
    expect(isAuditEvent('HANDOVER_FIELD_UPDATED')).toBe(true);
    expect(isAuditEvent('HANDOVER_FIELD_VERIFIED')).toBe(true);
    expect(isAuditEvent('STAGE_COMPLETED')).toBe(false);
  });
});

describe('class colours and the timeline', () => {
  it('has five colours, with cancelled outlined and never grey', () => {
    expect(TONE_ORDER).toEqual(['grey', 'blue', 'amber', 'red', 'neutral']);
    expect(TONES.neutral.label).toBe('Cancelled');
    expect(TONES.neutral.chip).toContain('border-dashed');
    expect(TONES.neutral.chip).not.toContain('bg-slate-200');
    expect(TONES.grey.label).toBe('Verified and consumed');
  });

  it('finds the week and the month around a date and moves between them', () => {
    expect(windowOf('week', '2026-11-11')).toEqual({ from: '2026-11-09', to: '2026-11-15' });
    expect(windowOf('week', '2026-11-15')).toEqual({ from: '2026-11-09', to: '2026-11-15' }); // a Sunday belongs to the week before it
    expect(windowOf('month', '2026-02-10')).toEqual({ from: '2026-02-01', to: '2026-02-28' });
    expect(windowOf('all', '2026-11-11')).toBeNull();
    expect(shiftAnchor('week', '2026-11-11', 1)).toBe('2026-11-18');
    expect(shiftAnchor('month', '2026-12-20', 1)).toBe('2027-01-01');
    expect(shiftAnchor('month', '2026-01-20', -1)).toBe('2025-12-01');
  });

  it('describes the next class by whole days, without a clock', () => {
    expect(daysUntil('2026-11-09', '2026-11-12')).toBe(3);
    expect(untilText('2026-11-09', '2026-11-09')).toBe('today');
    expect(untilText('2026-11-09', '2026-11-10')).toBe('tomorrow');
    expect(untilText('2026-11-09', '2026-11-14')).toBe('in 5 days');
  });

  it('groups records by day with each day in time order, without repeating or inventing any', () => {
    const r = (key: string, date: string, startMinute: number) => ({ key, date, startMinute, endMinute: startMinute + 60 } as any);
    const g = groupByDate([r('c', '2026-11-10', 600), r('a', '2026-11-09', 900), r('b', '2026-11-09', 600)]);
    expect(g.map(([d, list]) => [d, list.map((x) => x.key)])).toEqual([['2026-11-09', ['b', 'a']], ['2026-11-10', ['c']]]);
  });
});

describe('navigation active state', () => {
  it('lights Students on the list and on a student, and not Mentoring itself', () => {
    expect(isNavItemActive('/mentoring/students', '/mentoring/students')).toBe(true);
    expect(isNavItemActive('/mentoring/students', '/mentoring/students/abc')).toBe(true);
    expect(isNavItemActive('/mentoring/students', '/mentoring/classes')).toBe(false);
    expect(isNavItemActive('/mentoring', '/mentoring/classes')).toBe(true);
  });
});
