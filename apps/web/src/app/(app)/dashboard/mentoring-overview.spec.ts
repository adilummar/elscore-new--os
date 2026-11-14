import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { getSession } from '@/lib/api/auth';

import {
  ActivationRow, Overview, MentorRow, Paged, StudentRow, Today, TodayRow, attentionHref, classTone, hoursText, progressPercent, query, studentHref, waitTone,
} from '../mentoring/overview-view';

import DashboardPage from './page';
import { ActivationTable, AgendaRow, AttentionPanel, ErrorNote, MentorTable, Pager, Skeleton, StudentTable, SummaryStrip, TodayAgenda } from './MentoringOverview';

jest.mock('@/lib/api/auth', () => ({ getSession: jest.fn() }));
jest.mock('@/components/dashboard/CeoDashboard', () => ({ __esModule: true, default: function CeoDashboard() { return null; } }));
jest.mock('@/components/dashboard/OperationalDashboard', () => ({ __esModule: true, default: function OperationalDashboard() { return null; } }));
jest.mock('@/components/dashboard/MentorDashboard', () => ({ __esModule: true, default: function MentorDashboard() { return null; } }));
jest.mock('./MentoringOverview', () => ({ ...jest.requireActual('./MentoringOverview'), MentoringOverview: function MentoringOverview() { return null; } }));
jest.mock('../mentoring/mentoring-client', () => ({ mentoringApi: jest.fn().mockResolvedValue({}) }));
jest.mock('next/link', () => ({ __esModule: true, default: ({ href, children, ...rest }: any) => React.createElement('a', { href, ...rest }, children) }));
jest.mock('next/navigation', () => ({ redirect: jest.fn() }));

const text = (markup: string) => markup.replace(/<[^>]+>/g, ' ').replace(/&#x27;/g, "'").replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
const noop = () => undefined;
const render = (el: React.ReactElement) => renderToStaticMarkup(el);
const paged = <T,>(rows: T[], over: Partial<Paged<T>> = {}): Paged<T> => ({ total: rows.length, page: 1, pageSize: 25, pages: 1, rows, ...over });

const overview = (over: Partial<Overview['summary']> = {}): Overview => ({
  role: 'HEAD', today: '2026-11-09', window: { from: '2026-11-01', to: '2026-11-30' }, period: 'month',
  summary: { activeStudents: 42, ongoingActivations: 6, scheduledMinutes: 12000, reportedMinutes: 5000, consumedMinutes: 6000, remainingMinutes: 6000, pendingClasses: 100, pendingVerification: 5, attentionTotal: 9, ...over },
  activationByStatus: [], attention: [{ key: 'classes_awaiting_verification', label: 'Classes waiting for verification', count: 5 }], note: 'Scheduled hours come from the approved schedule. Consumed hours count only classes the Mentor verified.',
});
const mentor = (over: Partial<MentorRow> = {}): MentorRow => ({ mentorUserId: 'm1', name: 'Mira Mentor', assignedStudents: 28, activeStudents: 25, ongoingActivations: 3, scheduledHours: 420, consumedHours: 365, remainingHours: 55, pendingVerification: 4, pendingTasks: 7, ...over });
const student = (): StudentRow => ({ activationId: 'a1', studentName: 'Asha Menon', studentId: 'STU-0001', mentorUserId: 'm1', mentorName: 'Mira Mentor', status: 'ACTIVATED', statusLabel: 'Active', subjects: [{ id: 's1', name: 'English' }], scheduledHours: 16, reportedHours: 12.5, consumedHours: 11, remainingHours: 5, pendingClasses: 2 });
const activation = (over: Partial<ActivationRow> = {}): ActivationRow => ({ activationId: 'a2', studentName: 'Basil Nair', studentId: 'STU-0002', status: 'ACTIVATION_IN_PROGRESS', statusLabel: 'In progress', stageNumber: 3, stageName: 'Timetable Creation', blocked: false, mentorName: 'Mohan Mentor', responsible: 'Mohan Mentor', nextAction: 'Complete stage 3, Timetable Creation', daysPending: 8, ...over });
const classRow = (over: Partial<TodayRow> = {}): TodayRow => ({ key: 'k1', activationId: 'a1', date: '2026-11-09', startMinute: 900, endMinute: 960, scheduledMinutes: 60, studentName: 'Asha Menon', studentId: 'STU-0001', subjectName: 'English', tutorName: 'Meera Thomas', mentorName: 'Mira Mentor', state: 'SCHEDULED', stateLabel: 'Scheduled', consumption: 'NOT_CONSUMED', warning: null, ...over });
const today = (rows: TodayRow[] = [classRow()]): Today => ({ ...paged(rows), date: '2026-11-09', today: '2026-11-09', counts: {}, consumed: rows.filter((r) => r.consumption === 'CONSUMED').length });

describe('which dashboard a person gets', () => {
  const as = async (permissions: string[], roles: string[] = []) => {
    (getSession as jest.Mock).mockResolvedValue({ permissions, roles });
    return (await DashboardPage({ searchParams: {} })) as any;
  };

  it('lands a Mentor on the dedicated MentorDashboard and sends Mentoring Head to Classes', async () => {
    const { redirect } = jest.requireMock('next/navigation');
    redirect.mockClear();

    // Mentoring Head is redirected to Classes
    await as(['mentoring.student.read-all', 'mentoring.allocation.manage'], ['MENTORING_HEAD']);
    expect(redirect).toHaveBeenCalledTimes(1);
    expect(redirect).toHaveBeenCalledWith('/mentoring/classes');

    // Mentor lands on dedicated MentorDashboard
    const mentorPage = await as(['mentoring.student.read-assigned', 'mentoring.stage.work'], ['MENTOR']);
    expect(mentorPage.type.name).toBe('MentorDashboard');
  });

  it('leaves the CEO, Sales and anyone who also does Sales exactly as they were', async () => {
    expect((await as(['analytics.ceo.read', 'mentoring.student.read-all'])).type.name).toBe('CeoDashboard');
    expect((await as(['lead.read', 'followup.read'])).type.name).toBe('OperationalDashboard');
    expect((await as(['lead.read', 'mentoring.student.read-all'])).type.name).toBe('OperationalDashboard');
    expect((await as([])).type.name).toBe('OperationalDashboard');
  });
});

describe('the summary strip', () => {
  it('shows the six figures a Head looks at first, with what each one means', () => {
    const html = render(React.createElement(SummaryStrip, { o: overview() }));
    const t = text(html);
    for (const part of ['Active students', '42', 'Activations in progress', 'Not active yet', 'Scheduled hours', '200 h', 'From the approved schedule', 'Consumed hours', '100 h', 'Verified by a Mentor', 'Waiting for verification', 'Conducted, not yet consumed', 'Needs attention', '9']) expect(t).toContain(part);
    expect((html.match(/data-testid="summary-item"/g) ?? []).length).toBe(6);
    expect(t).toContain('Consumed hours count only classes the Mentor verified');
  });

  it('draws the consumed share as a thin line, and colours a count amber only when there is something to do', () => {
    const html = render(React.createElement(SummaryStrip, { o: overview() }));
    expect(html).toContain('aria-valuenow="50"');
    expect(text(html)).toContain('50%');
    expect(html).toContain('text-amber-700');
    expect(render(React.createElement(SummaryStrip, { o: overview({ pendingVerification: 0, attentionTotal: 0 }) }))).not.toContain('text-amber-700');
    expect(render(React.createElement(SummaryStrip, { o: overview({ scheduledMinutes: 0, consumedMinutes: 0 }) }))).toContain('aria-valuenow="0"');
  });

  it('shows no Sales figures', () => {
    const t = text(render(React.createElement(SummaryStrip, { o: overview() })) + render(React.createElement(AttentionPanel, { items: overview().attention })));
    for (const sales of ['Total Leads', 'Contacted', 'Demo Booked', 'Enrolled', 'Conversion', 'Pipeline']) expect(t).not.toContain(sales);
  });
});

describe('what needs attention', () => {
  it('lists each item with its count and a link to the records, and says when nothing is waiting', () => {
    const html = render(React.createElement(AttentionPanel, { items: overview().attention }));
    expect(text(html)).toContain('Classes waiting for verification');
    expect(html).toContain('href="/mentoring/dashboard?card=classes_awaiting_verification"');
    expect(text(render(React.createElement(AttentionPanel, { items: [] })))).toContain('Nothing needs attention right now.');
    expect(attentionHref('a b')).toBe('/mentoring/dashboard?card=a%20b');
  });
});

describe('Mentor by Mentor', () => {
  const table = (rows: MentorRow[], selected: string | null = null) => render(React.createElement(MentorTable, { data: paged(rows), search: '', sort: 'name', selected, onSearch: noop, onSort: noop, onSelect: noop, onPage: noop }));

  it('shows each Mentor with their students, hours and pending work, and a way to open them', () => {
    const html = table([mentor(), mentor({ mentorUserId: 'm2', name: 'Mohan Mentor', activeStudents: 20, scheduledHours: 375, consumedHours: 330 })]);
    const t = text(html);
    for (const part of ['Mira Mentor', '28 assigned', '420 h', '365 h', '55 h', 'Mohan Mentor', '375 h', 'Active', 'In activation', 'Scheduled', 'Consumed', 'Remaining', 'Waiting for verification', 'Pending tasks', 'Search Mentors']) expect(t + html).toContain(part);
    expect((html.match(/data-testid="mentor-row"/g) ?? []).length).toBe(2);
    expect(t).toContain('View');
  });

  it('marks the Mentor being shown, and amber only for work waiting on verification', () => {
    const html = table([mentor()], 'm1');
    expect(text(html)).toContain('Showing');
    expect(html).toContain('text-amber-700');
    expect(table([mentor({ pendingVerification: 0 })])).not.toContain('text-amber-700');
  });

  it('says plainly when no Mentor matches', () => {
    expect(text(table([]))).toContain('No Mentor matches.');
  });
});

describe('students and hours', () => {
  it('keeps scheduled, reported and consumed hours in separate columns, and says what each means', () => {
    const html = render(React.createElement(StudentTable, { data: paged([student()]), search: '', onSearch: noop, onPage: noop }));
    const t = text(html);
    for (const part of ['Asha Menon', 'STU-0001', 'Active', 'Mira Mentor', 'English', 'Scheduled', '16 h', 'Reported', '12.5 h', 'Consumed', '11 h', 'Remaining', 'Classes left', 'consumed hours only from Mentor verification']) expect(t).toContain(part);
    expect(html).toContain('href="/mentoring/students/a1"');
  });

  it('says plainly when no student matches', () => {
    expect(text(render(React.createElement(StudentTable, { data: paged<StudentRow>([]), search: 'zzz', onSearch: noop, onPage: noop })))).toContain('No student matches.');
  });
});

describe('activations in progress', () => {
  it('shows the stage, who has it, what happens next and how long it has waited', () => {
    const html = render(React.createElement(ActivationTable, { data: paged([activation()]), onPage: noop }));
    const t = text(html);
    for (const part of ['Basil Nair', 'STU-0002', '3. Timetable Creation', 'In progress', 'Mohan Mentor', 'Complete stage 3, Timetable Creation', '8 days']) expect(t).toContain(part);
    expect(html).toContain('data-tone="amber"');
  });

  it('turns red only for a blocked workflow or a very long wait, and not for ordinary pending work', () => {
    expect(waitTone(2, false)).toBe('normal');
    expect(waitTone(7, false)).toBe('amber');
    expect(waitTone(14, false)).toBe('red');
    expect(waitTone(1, true)).toBe('red');
    expect(render(React.createElement(ActivationTable, { data: paged([activation({ daysPending: 1 })]), onPage: noop }))).toContain('data-tone="normal"');
    expect(render(React.createElement(ActivationTable, { data: paged([activation({ blocked: true, statusLabel: 'Blocked' })]), onPage: noop }))).toContain('data-tone="red"');
  });

  it('names the Mentoring Head as the person for an approval, and says when nobody is waiting', () => {
    expect(text(render(React.createElement(ActivationTable, { data: paged([activation({ responsible: 'Mentoring Head', nextAction: 'Give final approval' })]), onPage: noop })))).toContain('Give final approval');
    expect(text(render(React.createElement(ActivationTable, { data: paged<ActivationRow>([]), onPage: noop })))).toContain('No student is waiting to be activated.');
  });
});

describe("the day's classes", () => {
  it('lists classes in time order with the tutor, the Mentor and whether each is consumed', () => {
    const html = render(React.createElement(TodayAgenda, { data: today([classRow(), classRow({ key: 'k2', startMinute: 1020, endMinute: 1080, state: 'VERIFIED', stateLabel: 'Verified', consumption: 'CONSUMED', studentName: 'Chitra Pillai' })]), date: '2026-11-09', search: '', onDate: noop, onSearch: noop, onPage: noop }));
    const t = text(html);
    for (const part of ['Monday, 9 November 2026', '2 classes, 1 consumed', '3:00 PM to 4:00 PM', 'English, Asha Menon', 'Tutor Meera Thomas', 'Mentor Mira Mentor', 'Not consumed', 'Chitra Pillai', 'Consumed', 'Previous day', 'Next day', 'Today']) expect(t + html).toContain(part);
    expect(html.indexOf('Asha Menon')).toBeLessThan(html.indexOf('Chitra Pillai'));
    expect(html).toContain('href="/mentoring/students/a1?panel=classes"');
  });

  it('marks a class consumed only for a verified one, and shows a warning in amber or red as it deserves', () => {
    expect(classTone('VERIFIED', null)).toBe('done');
    expect(classTone('SCHEDULED', null)).toBe('normal');
    expect(classTone('AWAITING_MENTOR_VERIFICATION', null)).toBe('amber');
    expect(classTone('SCHEDULED', 'Response time approaching')).toBe('amber');
    expect(classTone('AWAITING_MENTOR_VERIFICATION', 'Response time breached')).toBe('red');
    expect(classTone('RETURNED_FOR_CORRECTION', null)).toBe('red');
    const row = render(React.createElement(AgendaRow, { r: classRow({ state: 'AWAITING_MENTOR_VERIFICATION', stateLabel: 'Awaiting Mentor verification', warning: 'Response time breached' }) }));
    expect(row).toContain('data-tone="red"');
    expect(row).toContain('data-consumption="NOT_CONSUMED"');
    expect(text(row)).toContain('Response time breached');
  });

  it('says plainly when nothing is scheduled, and when a search finds nothing', () => {
    expect(text(render(React.createElement(TodayAgenda, { data: today([]), date: '2026-11-09', search: '', onDate: noop, onSearch: noop, onPage: noop })))).toContain('No classes scheduled for this date.');
    expect(text(render(React.createElement(TodayAgenda, { data: today([]), date: '2026-11-09', search: 'zz', onDate: noop, onSearch: noop, onPage: noop })))).toContain('No class matches this search.');
  });
});

describe('loading, errors and paging', () => {
  it('shows a skeleton while loading and an error with a way to try again', () => {
    expect(render(React.createElement(Skeleton, { rows: 3 }))).toContain('aria-busy="true"');
    const t = text(render(React.createElement(ErrorNote, { message: 'The classes could not be loaded.', onRetry: noop })));
    expect(t).toContain('The classes could not be loaded.');
    expect(t).toContain('Try again');
  });

  it('pages only when there is more than one page', () => {
    expect(render(React.createElement(Pager, { data: paged([1]), onPage: noop }))).toBe('');
    const t = text(render(React.createElement(Pager, { data: paged([1], { pages: 3, page: 2, total: 60 }), onPage: noop })));
    expect(t).toContain('Page 2 of 3, 60 in all');
  });
});

describe('the helpers and the words', () => {
  it('works out the share consumed without going over a full line, and writes hours plainly', () => {
    expect(progressPercent(50, 100)).toBe(50);
    expect(progressPercent(150, 100)).toBe(100);
    expect(progressPercent(5, 0)).toBe(0);
    expect(hoursText(90)).toBe('1 h 30 min');
    expect(hoursText(120)).toBe('2 h');
    expect(query({ period: 'month', search: '', mentorUserId: undefined, page: 2 })).toBe('?period=month&page=2');
    expect(query({ search: 'a & b' })).toBe('?search=a%20%26%20b');
    expect(studentHref('a1', 'exams')).toBe('/mentoring/students/a1?panel=exams');
  });

  it('writes no dashes or emoji in its copy', () => {
    const all = [
      render(React.createElement(SummaryStrip, { o: overview() })), render(React.createElement(AttentionPanel, { items: overview().attention })), render(React.createElement(ActivationTable, { data: paged([activation()]), onPage: noop })),
      render(React.createElement(StudentTable, { data: paged([student()]), search: '', onSearch: noop, onPage: noop })), render(React.createElement(TodayAgenda, { data: today(), date: '2026-11-09', search: '', onDate: noop, onSearch: noop, onPage: noop })),
      render(React.createElement(MentorTable, { data: paged([mentor()]), search: '', sort: 'name', selected: null, onSearch: noop, onSort: noop, onSelect: noop, onPage: noop })),
    ].map(text).join(' ');
    expect(all).not.toMatch(/[–—]/);
    expect(all).not.toMatch(/\p{Extended_Pictographic}/u);
  });
});
