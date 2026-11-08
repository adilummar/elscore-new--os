import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { fetchApi } from '@/lib/api/client';

import { CalendarDay, Segment, TutorCalendar, TutorTimetable, addDays, mondayOf } from '../tutors/[id]/TutorTimetable';
import { InformationWorkspace } from './students/[id]/InformationWorkspace';
import { TutorChoices } from './students/[id]/TutorPanel';
import { getTutorCalendarAction } from './schedule-actions';
import { CandidateList, TutorTools, TutorView } from './tutor-types';

jest.mock('@/lib/api/client', () => ({ fetchApi: jest.fn() }));

const text = (markup: string) => markup.replace(/<[^>]+>/g, ' ').replace(/&#x27;/g, "'").replace(/&amp;/g, '&').replace(/\s+/g, ' ');
const h = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));
const cls = (a: string, b: string, subject: string, student: string | null, extra: Partial<Segment> = {}): Segment => ({ start: h(a), end: h(b), state: 'CLASS', label: { subject, student }, ...extra });
const seg = (a: string, b: string, state: Segment['state'], note?: string): Segment => ({ start: h(a), end: h(b), state, ...(note ? { note } : {}) });
const off = (a: string, b: string) => seg(a, b, 'NOT_WORKING');

/** Meera Thomas, Monday 9 November, as the calendar route returns it. */
const monday: CalendarDay = {
  date: '2026-11-09', label: 'Monday, 9 November', weekday: 1, closed: null, configured: true,
  segments: [off('08:00', '14:00'), cls('14:00', '15:00', 'Science', 'Synthetic Student A'), cls('15:00', '16:00', 'Science', 'Synthetic Student B'), seg('16:00', '16:30', 'BREAK'), cls('16:30', '17:30', 'Biology', 'Synthetic Student C'), seg('17:30', '18:30', 'FREE'), cls('18:30', '19:30', 'Science', 'Synthetic Student D'), seg('19:30', '20:00', 'FREE'), off('20:00', '22:00')],
  totals: { freeMinutes: 90, bookedMinutes: 240, breakMinutes: 30 }, affected: [],
};
const leave: CalendarDay = { date: '2026-11-12', label: 'Thursday, 12 November', weekday: 4, closed: { kind: 'LEAVE', note: 'Approved leave' }, configured: true, segments: [seg('08:00', '22:00', 'LEAVE', 'Approved leave')], totals: { freeMinutes: 0, bookedMinutes: 0, breakMinutes: 0 }, affected: [{ startMinute: h('15:00'), endMinute: h('16:00'), subject: 'Biology', student: 'Synthetic Student E' }] };
const sunday: CalendarDay = { date: '2026-11-15', label: 'Sunday, 15 November', weekday: 0, closed: null, configured: true, segments: [off('08:00', '22:00')], totals: { freeMinutes: 0, bookedMinutes: 0, breakMinutes: 0 }, affected: [] };
const calendar = (days: CalendarDay[], canSeeStudents = true): TutorCalendar => ({ tutor: { id: 'tp-meera', name: 'Meera Thomas', photoUrl: null, subjects: ['Biology', 'Science'], levels: ['Grade 8'], active: true }, from: days[0].date, to: days[days.length - 1].date, canSeeStudents, days });

const render = (props: Partial<React.ComponentProps<typeof TutorTimetable>> = {}) =>
  renderToStaticMarkup(React.createElement(TutorTimetable, { calendar: calendar([monday]), selected: '2026-11-09', mode: 'day', onSelect: () => undefined, onMode: () => undefined, ...props }));

describe('the tutor timetable for a chosen date', () => {
  it('shows each class with its time, subject and student, the break, and the free time, in order', () => {
    const markup = render();
    const states = Array.from(markup.matchAll(/data-state="(\w+)"/g)).map((m) => m[1]);
    expect(states).toEqual(['CLASS', 'CLASS', 'BREAK', 'CLASS', 'FREE', 'CLASS', 'FREE']);
    const t = text(markup);
    expect(t).toContain('2:00 PM to 3:00 PM Science, Synthetic Student A, occupied');
    expect(t).toContain('4:00 PM to 4:30 PM Break');
    expect(t).toContain('4:30 PM to 5:30 PM Biology, Synthetic Student C, occupied');
    expect(t).toContain('5:30 PM to 6:30 PM Available');
    expect(t).toContain('7:30 PM to 8:00 PM Available');
  });

  it('does not list the long stretches outside working time on a working day', () => {
    expect(render()).not.toContain('data-state="NOT_WORKING"'); // the key still names it, but no stretch is drawn
  });

  it('totals the free, booked and break time for the day', () => {
    expect(text(render())).toContain('1 h 30 min free, 4 h booked, 30 min break');
  });

  it('a person who may not see students sees "Booked", and is told why', () => {
    const hidden: CalendarDay = { ...monday, segments: monday.segments.map((s) => (s.label ? { ...s, label: { subject: s.label.subject, student: null } } : s)) };
    const t = text(render({ calendar: calendar([hidden], false) }));
    expect(t).toContain('Science, Booked, occupied');
    expect(t).not.toMatch(/Synthetic Student/);
    expect(t).toContain('The student is shown only to people who may see that student.');
  });

  it('shows leave as a whole closed day, with the classes it affects listed and not cancelled', () => {
    const markup = render({ calendar: calendar([leave]), selected: '2026-11-12' });
    const t = text(markup);
    expect(t).toContain('On leave: Approved leave');
    expect(markup).toContain('data-testid="calendar-affected"');
    expect(t).toContain('Classes on a day the tutor is away. Nothing is cancelled until someone decides.');
    expect(t).toContain('3:00 PM to 4:00 PM, Biology, Synthetic Student E');
  });

  it('shows a day the tutor does not work, and a day with no hours set', () => {
    expect(text(render({ calendar: calendar([sunday]), selected: '2026-11-15' }))).toContain('Not working');
    const unset: CalendarDay = { ...sunday, configured: false, segments: [seg('08:00', '22:00', 'NOT_CONFIGURED')] };
    expect(text(render({ calendar: calendar([unset]) }))).toContain('Availability not configured');
  });

  it('shows a holiday and a moved class', () => {
    const holiday: CalendarDay = { ...leave, closed: { kind: 'HOLIDAY', note: 'Synthetic public holiday (test)' }, segments: [seg('08:00', '22:00', 'HOLIDAY', 'Synthetic public holiday (test)')], affected: [] };
    expect(text(render({ calendar: calendar([holiday]) }))).toContain('Public holiday: Synthetic public holiday (test)');
    const moved: CalendarDay = { ...monday, segments: [cls('19:00', '20:00', 'Mathematics', 'Synthetic Student 7', { moved: true })] };
    expect(text(render({ calendar: calendar([moved]) }))).toContain('(moved here)');
  });

  it('week view shows one card per day, and the navigation steps a week', () => {
    const week = calendar([monday, leave, sunday]);
    const markup = render({ calendar: week, mode: 'week' });
    expect(markup).toContain('data-mode="week"');
    expect(markup.match(/data-testid="calendar-day"/g)).toHaveLength(3);
    expect(markup).toContain('aria-label="Previous week"');
    expect(markup).toContain('aria-label="Next week"');
    expect(text(markup)).toContain('Week of 2026-11-09');
  });

  it('has Today, a date picker, and Day and Week buttons with the current one pressed', () => {
    const markup = render();
    expect(text(markup)).toContain('Today');
    expect(markup).toContain('aria-label="Choose a date"');
    expect(markup).toContain('value="2026-11-09"');
    expect(markup).toMatch(/aria-pressed="true"[^>]*>Day</);
    expect(markup).toMatch(/aria-pressed="false"[^>]*>Week</);
  });

  it('has a key that names every state, with words and not only colour', () => {
    const t = text(render());
    for (const word of ['Occupied by a student', 'Available', 'Break', 'Not working', 'Leave', 'Public holiday', 'Availability not configured']) expect(t).toContain(word);
  });

  it('shows an error and a loading state without a calendar', () => {
    expect(text(render({ calendar: null, error: 'Choose no more than 31 days at a time.' }))).toContain('Choose no more than 31 days at a time.');
    expect(text(render({ calendar: null, loading: true }))).toContain('Loading the timetable');
  });

  it('date steps never drift across month ends or time zones', () => {
    expect(addDays('2026-11-30', 1)).toBe('2026-12-01');
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31');
    expect(addDays('2026-11-09', 7)).toBe('2026-11-16');
    expect(mondayOf('2026-11-15')).toBe('2026-11-09');
    expect(mondayOf('2026-11-09')).toBe('2026-11-09');
  });
});

describe('the calendar request', () => {
  const mocked = fetchApi as jest.Mock;
  beforeEach(() => mocked.mockReset());

  it('goes to the tutor calendar route with the dates, and returns the API message on a refusal', async () => {
    mocked.mockResolvedValue({ days: [] });
    await expect(getTutorCalendarAction('0a1b2c3d-1111-2222-3333-444455556666', '2026-11-09', '2026-11-15')).resolves.toEqual({ ok: true, data: { days: [] } });
    expect(mocked).toHaveBeenCalledWith('/tutors/profile/0a1b2c3d-1111-2222-3333-444455556666/calendar?from=2026-11-09&to=2026-11-15');
    mocked.mockRejectedValue(Object.assign(new Error('Choose no more than 31 days at a time.'), { status: 400 }));
    await expect(getTutorCalendarAction('0a1b2c3d-1111-2222-3333-444455556666', '2026-11-01', '2026-12-31')).resolves.toEqual({ ok: false, message: 'Choose no more than 31 days at a time.' });
  });

  it('refuses an id or a date that could change the route, without calling the API', async () => {
    for (const [id, from, to] of [['../x', '2026-11-09', '2026-11-09'], ['0a1b2c3d-1111-2222-3333-444455556666', '2026-11-09&x=1', '2026-11-09'], ['0a1b2c3d-1111-2222-3333-444455556666', '2026-11-09', 'soon']]) {
      await expect(getTutorCalendarAction(id, from, to)).resolves.toMatchObject({ ok: false });
    }
    expect(mocked).not.toHaveBeenCalled();
  });
});

describe('tutors matched on exact dates', () => {
  const tutor = (over: Partial<TutorView> = {}): TutorView => ({
    tutorProfileId: 'tp-meera', name: 'Meera Thomas', initials: 'MT', photoUrl: null, subjects: ['Science'], levels: ['Grade 8'], hours: 'Monday 2:00 PM to 8:00 PM', verdict: 'PARTIAL',
    summary: '', availableCount: 1, total: 3, canAssign: false, ineligible: null, isCurrent: false, dateTotals: { available: 7, total: 24 },
    sessions: [
      { key: '0:Monday', label: 'Monday, 5:30 PM to 6:30 PM', dayNumber: 1, startMinute: 1050, endMinute: 1110, status: 'OCCUPIED', statusLabel: 'Occupied', reason: '1 of 8 dates are not available. Already booked during this time.',
        dates: [{ date: '2026-11-09', status: 'AVAILABLE', reason: 'Available.' }, { date: '2026-12-07', status: 'OCCUPIED', reason: 'Already booked during this time.' }] },
      { key: '0:Tuesday', label: 'Tuesday, 5:30 PM to 6:30 PM', dayNumber: 2, startMinute: 1050, endMinute: 1110, status: 'LEAVE', statusLabel: 'On leave', reason: '1 of 8 dates are not available. On leave on Thursday, 12 November.',
        dates: [{ date: '2026-11-12', status: 'LEAVE', reason: 'On leave on Thursday, 12 November.' }, { date: '2026-11-16', status: 'BREAK', reason: 'Break time on Monday, 16 November.' }, { date: '2026-11-25', status: 'HOLIDAY', reason: 'Public holiday on Wednesday, 25 November.' }] },
      { key: '0:Wednesday', label: 'Wednesday, 5:30 PM to 6:30 PM', dayNumber: 3, startMinute: 1050, endMinute: 1110, status: 'AVAILABLE', statusLabel: 'Available', reason: 'Available.', dates: [{ date: '2026-11-11', status: 'AVAILABLE', reason: 'Available.' }] },
    ],
    ...over,
  });
  const data = (): CandidateList => ({ subjectId: 'sub-sc', subjectName: 'Science', gradeId: 'g-8', gradeName: 'Grade 8', ready: true, notReady: null, sessions: [{ key: '0:Monday', label: 'Monday, 5:30 PM to 6:30 PM' }], tutors: [tutor()], current: null, canUpdateAvailability: false });
  const tools: TutorTools = { assignments: [], canAssign: true, canManageAvailability: false, loadCandidates: async () => data(), assign: async () => undefined, remove: async () => undefined, loadAvailability: async () => ({ name: 'x', windows: [] }), saveAvailability: async () => undefined };
  const choices = () => renderToStaticMarkup(React.createElement(TutorChoices, { data: data(), tools, busy: false, onSelect: () => undefined, onUpdateHours: () => undefined }));

  it('lists the exact dates that fail, each with its own reason, and none of the free ones', () => {
    const markup = choices();
    const t = text(markup);
    expect(markup).toContain('data-testid="session-dates"');
    expect(t).toContain('2026-12-07 Occupied Already booked during this time.');
    expect(t).toContain('2026-11-12 On leave On leave on Thursday, 12 November.');
    expect(t).toContain('2026-11-16 Break time Break time on Monday, 16 November.');
    expect(t).toContain('2026-11-25 Public holiday Public holiday on Wednesday, 25 November.');
    expect(t).not.toContain('2026-11-09 Available');
    expect(markup.match(/data-date-status="AVAILABLE"/g)).toBeNull();
  });

  it('says how many of the real class dates are free, and links to the tutor timetable', () => {
    const markup = choices();
    expect(text(markup)).toContain('7 of 24 class dates free');
    expect(markup).toContain('href="/tutors/tp-meera"');
    expect(text(markup)).toContain('View timetable');
  });

  it('names every kind of reason with its own word', () => {
    const t = text(choices());
    for (const word of ['Occupied', 'On leave', 'Break time', 'Public holiday']) expect(t).toContain(word);
  });

  it('a tutor checked by week pattern only shows no date list', () => {
    const plain = tutor({ dateTotals: null, sessions: tutor().sessions.map(({ dates: _dates, ...rest }) => { void _dates; return rest; }) });
    const markup = renderToStaticMarkup(React.createElement(TutorChoices, { data: { ...data(), tutors: [plain] }, tools, busy: false, onSelect: () => undefined, onUpdateHours: () => undefined }));
    expect(markup).not.toContain('data-testid="session-dates"');
    expect(text(markup)).not.toContain('class dates free');
  });
});

describe('the start date on a subject card', () => {
  const handover = (startDate?: string) => ({
    transferredFields: [], missingFields: [], fieldVerifications: [],
    fieldValues: [{ fieldKey: 'timetable.schedule', origin: 'MENTOR_COLLECTED', salesValue: null, updatedByName: 'Mina Mentor', updatedAt: '2026-11-08T09:00:00Z', collectedByName: 'Mina Mentor', collectedAt: '2026-11-08T09:00:00Z',
      value: { version: 2, subjects: [{ subjectId: 'sub-sc', subjectName: 'Science', gradeId: 'g-8', gradeName: 'Grade 8', frequency: 'WEEKLY', totalMinutes: 60, distribution: 'EQUAL', sessions: [{ day: 'Monday', durationMinutes: 60, start: '17:30', end: '18:30' }], ...(startDate ? { startDate } : {}) }] } }],
    editableFields: [{ key: 'timetable.schedule', type: 'SCHEDULE', options: null, columns: null, maxLength: null, minDate: null, maxDate: null, schedule: { subjects: [{ id: 'sub-sc', name: 'Science' }], grades: [{ id: 'g-8', name: 'Grade 8' }], defaultSessionMinutes: 60, canAddSubject: false } }],
  });
  const render = (startDate?: string) => renderToStaticMarkup(React.createElement(InformationWorkspace, { handover: handover(startDate), canEdit: true } as never));

  it('is an optional date box with an explanation, and shows the saved date', () => {
    const markup = render('2026-11-09');
    expect(markup).toContain('aria-label="Start date 1"');
    expect(markup).toContain('type="date"');
    expect(markup).toContain('value="2026-11-09"');
    expect(text(markup)).toContain('Classes start on');
    expect(text(markup)).toContain('With a date, tutors are checked on the exact dates, including leave and holidays.');
    expect(render()).not.toContain('value="2026-11-09"');
  });
});
