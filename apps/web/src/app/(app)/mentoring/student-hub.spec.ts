import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import {
  HubRow, TABS, TAB_FOR_PANEL, dateText, emptyListFilters, filtersFromParams, initialsOf, listQuery, minutesText, rowHref, studentsHref, tabOf, wantsActivationWorkflow, whenText,
} from './student-hub-view';
import { StudentListClient } from './students/StudentListClient';

jest.mock('./mentoring-client', () => ({ mentoringApi: jest.fn().mockResolvedValue({}) }));
jest.mock('next/link', () => ({ __esModule: true, default: ({ href, children, ...rest }: any) => React.createElement('a', { href, ...rest }, children) }));

describe('figures', () => {
  it('shows a missing figure as Unavailable, never as zero', () => {
    expect(minutesText(null)).toBe('Unavailable');
    expect(minutesText(undefined)).toBe('Unavailable');
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
    expect(TABS.map(([, l]) => l)).toEqual(['Overview', 'Student Details', 'Classes', 'Timetable', 'Tutors', 'Exams', 'Meetings', 'Learning Plan', 'Complaints', 'Communication', 'History']);
    expect(tabOf('classes')).toBe('classes');
    expect(tabOf('nope')).toBe('overview');
    expect(TAB_FOR_PANEL.review).toBe('meetings');
    expect(wantsActivationWorkflow('checklist')).toBe(true);
    expect(wantsActivationWorkflow('classes')).toBe(false);
  });
});

describe('the Students list page', () => {
  it('renders the filters, the column headings and a loading state before any data arrives', () => {
    const html = renderToStaticMarkup(React.createElement(StudentListClient, {}));
    for (const t of ['Search by name or student ID', 'All grades', 'All subjects', 'Any class consumption', 'Classes waiting for my verification', 'Exam in the next two weeks', 'Next parent meeting', 'Classes this month']) expect(html).toContain(t);
    expect(html).toContain('aria-busy="true"');
  });

  it('types the row it renders', () => {
    const row: HubRow = {
      activationId: 'a1', studentId: 'STU-1', name: 'Asha Menon', photoUrl: null, grade: 'Grade 8', level: null, mentor: { userId: 'm', name: 'Mira' }, isMine: true, activatedAt: null, status: 'ACTIVATED', statusLabel: 'Active',
      balance: { allocatedMinutes: null, consumedMinutes: 0, scheduledMinutes: null, pendingMinutes: 0, remainingMinutes: null, over: false }, nextClass: null, nextExam: null, nextMeeting: null, pending: { verification: 0, complaints: 0, tasks: 0, total: 0 },
    };
    expect(minutesText(row.balance.allocatedMinutes)).toBe('Unavailable');
  });
});
