import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import {
  Card, DashRow, GROUPS, Records, Summary, attention, emptyFilters, filtersActive, hrefOf, pageText, panelOf, queryOf,
} from './dashboard-view';
import { CardGrid, FilterBar, NotRecorded, RecordRow, RecordTable } from './dashboard/DashboardClient';

jest.mock('./mentoring-client', () => ({ mentoringApi: jest.fn().mockResolvedValue({}) }));
jest.mock('next/link', () => ({ __esModule: true, default: ({ href, children, ...rest }: any) => React.createElement('a', { href, ...rest }, children) }));

const text = (markup: string) => markup.replace(/<[^>]+>/g, ' ').replace(/&#x27;/g, "'").replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
const noop = () => undefined;
const render = (el: React.ReactElement) => renderToStaticMarkup(el);

const card = (key: string, group: Card['group'], label: string, count: number): Card => ({ key, group, label, count });
const summary = (): Summary => ({
  asOf: '2026-11-09T06:30:00.000Z', today: '2026-11-09', window: { from: '2026-11-09', to: '2026-11-16' },
  cards: [card('students_total', 'students', 'Assigned students', 42), card('classes_today', 'classes', "Today's scheduled classes", 12), card('classes_awaiting_verification', 'classes', 'Waiting for your verification', 3), card('exams_upcoming', 'exams', 'Upcoming exams', 0), card('complaints_breached', 'complaints', 'Complaint acknowledgement breached', 1)],
  notRecorded: [{ label: 'Pending follow-ups', reason: 'Follow-ups are not recorded as separate items yet.' }],
});
const row = (over: Partial<DashRow> = {}): DashRow => ({ id: 'r1', kind: 'CLASS', activationId: 'act-1', studentName: 'Asha Menon', studentId: 'STU-0001', title: 'English, Asha Menon', subjectName: 'English', tutorName: 'Meera Thomas', date: '2026-11-09', status: 'Scheduled', priority: null, slaState: null, panel: 'classes', ...over });
const records = (over: Partial<Records> = {}): Records => ({ key: 'classes_today', label: "Today's scheduled classes", total: 1, page: 1, pageSize: 25, pages: 1, rows: [row()], ...over });

describe('the cards', () => {
  it('shows every card the server counted, grouped, with its count, and marks the ones that need attention', () => {
    const html = render(React.createElement(CardGrid, { summary: summary(), selected: null, onOpen: noop }));
    const t = text(html);
    for (const part of ['Students', 'Daily classes', 'Weekly exams', 'Parent complaints', 'Assigned students', '42', "Today's scheduled classes", 'Waiting for your verification', 'Complaint acknowledgement breached']) expect(t).toContain(part);
    expect((html.match(/data-testid="dash-card"/g) ?? []).length).toBe(5);
    expect(html).toMatch(/data-key="classes_awaiting_verification" data-count="3"/);
    expect(html).toContain('text-amber-700'); // a count above zero that needs a look
  });

  it('does not colour a zero, or a card that is only information', () => {
    const only: Summary = { ...summary(), cards: [card('exams_upcoming', 'exams', 'Upcoming exams', 0), card('students_total', 'students', 'Assigned students', 42)] };
    expect(render(React.createElement(CardGrid, { summary: only, selected: null, onOpen: noop }))).not.toContain('text-amber-700');
    expect(attention('complaints_breached')).toBe(true);
    expect(attention('students_total')).toBe(false);
  });

  it('marks the open card, and has a heading for every group', () => {
    expect(render(React.createElement(CardGrid, { summary: summary(), selected: 'classes_today', onOpen: noop }))).toContain('aria-pressed="true"');
    expect(GROUPS.map((g) => g[1])).toEqual(['Students', 'Daily classes', 'Weekly exams', 'Monthly meetings', 'Parent complaints', 'Response time']);
  });

  it('says plainly what is not recorded, and shows nothing when everything is', () => {
    expect(text(render(React.createElement(NotRecorded, { items: summary().notRecorded })))).toContain('Pending follow-ups: Follow-ups are not recorded as separate items yet.');
    expect(render(React.createElement(NotRecorded, { items: [] }))).toBe('');
  });
});

describe('the filters', () => {
  it('has every filter of the brief the system supports, and a way to clear them', () => {
    const f = { ...emptyFilters(), studentQuery: 'Asha' };
    const t = text(render(React.createElement(FilterBar, { f, onChange: noop, onClear: noop })));
    for (const part of ['Student name or student ID', 'Period', 'Around the date', 'From', 'To', 'Class status', 'Exam status', 'Meeting status', 'Complaint category', 'Complaint status', 'Priority', 'Response time status', 'Clear the filters']) expect(t).toContain(part);
    expect(text(render(React.createElement(FilterBar, { f: emptyFilters(), onChange: noop, onClear: noop })))).not.toContain('Clear the filters');
  });

  it('sends only the filters that are set, encoded, so the server does the filtering', () => {
    expect(queryOf(emptyFilters())).toBe('');
    expect(queryOf({ ...emptyFilters(), studentQuery: 'Asha & Co', period: 'week' })).toBe('?studentQuery=Asha%20%26%20Co&period=week');
    expect(queryOf({ ...emptyFilters(), classState: 'VERIFIED' }, { page: 2, pageSize: 25 })).toBe('?classState=VERIFIED&page=2&pageSize=25');
    expect(filtersActive(emptyFilters())).toBe(false);
    expect(filtersActive({ ...emptyFilters(), priority: 'HIGH' })).toBe(true);
  });
});

describe('the records behind a card', () => {
  it('shows the student with their ID, the record, the tutor, the date and the status, and a link to open it where the work is done', () => {
    const html = render(React.createElement(RecordRow, { r: row() }));
    // a table row needs its table to parse, so check the text and the link
    const t = text(html);
    for (const part of ['Asha Menon', 'STU-0001', 'English, Asha Menon', 'Meera Thomas', 'Scheduled', 'Open']) expect(t).toContain(part);
    expect(html).toContain('href="/mentoring/students/act-1?panel=classes"');
  });

  it('opens a record on the panel that holds it, and has no link for one without a student', () => {
    expect(hrefOf({ activationId: 'a1', panel: 'exams' })).toBe('/mentoring/students/a1?panel=exams');
    expect(hrefOf({ activationId: 'a1', panel: 'checklist' })).toBe('/mentoring/students/a1');
    expect(hrefOf({ activationId: 'a1', panel: null })).toBe('/mentoring/students/a1');
    expect(hrefOf({ activationId: null, panel: 'classes' })).toBeNull();
    expect(panelOf('review')).toBe('review');
    expect(panelOf('../x')).toBeUndefined();
    expect(panelOf(undefined)).toBeUndefined();
  });

  it('shows the page, the range of records, and only the pages that exist', () => {
    const one = text(render(React.createElement(RecordTable, { data: records(), onPage: noop })));
    expect(one).toContain('1 to 1 of 1');
    expect(one).not.toContain('Next page');
    const many = render(React.createElement(RecordTable, { data: records({ total: 60, pages: 3, page: 2 }), onPage: noop }));
    expect(text(many)).toContain('26 to 50 of 60');
    expect(text(many)).toContain('Page 2 of 3');
    expect(many).not.toMatch(/<button[^>]*\sdisabled=""[^>]*>[^<]*Next page/);
    expect(render(React.createElement(RecordTable, { data: records({ page: 1, pages: 2, total: 30 }), onPage: noop }))).toMatch(/<button[^>]*\sdisabled=""[^>]*>[^<]*Previous page/);
    expect(pageText({ total: 0, page: 1, pageSize: 25 })).toBe('No records');
  });

  it('says plainly when nothing matches', () => {
    expect(text(render(React.createElement(RecordTable, { data: records({ total: 0, rows: [] }), onPage: noop })))).toContain('Nothing matches.');
  });
});

describe('the words', () => {
  it('writes no dashes or emoji in its copy', () => {
    const all = [
      render(React.createElement(CardGrid, { summary: summary(), selected: null, onOpen: noop })), render(React.createElement(FilterBar, { f: { ...emptyFilters(), period: 'week' }, onChange: noop, onClear: noop })),
      render(React.createElement(NotRecorded, { items: summary().notRecorded })), render(React.createElement(RecordTable, { data: records(), onPage: noop })),
    ].map(text).join(' ');
    expect(all).not.toMatch(/[–—]/);
    expect(all).not.toMatch(/\p{Extended_Pictographic}/u);
  });
});
