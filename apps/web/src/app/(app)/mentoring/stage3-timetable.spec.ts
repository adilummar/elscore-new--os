import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { DayDetails, EventDetails, MonthGrid, SummaryCards, TimetableBoard, WeekGrid, WeekList } from './students/[id]/TimetablePanel';
import {
  STATUS_LABELS, TimetableData, TimetableEvent, colourFor, hourSpan, monthWeeks, periodTitle, placeDay, shiftDate,
} from './timetable-view';

const text = (markup: string) => markup.replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
const noop = () => undefined;

const event = (over: Partial<TimetableEvent> = {}): TimetableEvent => ({
  id: 'sub-en:2026-11-09:900', date: '2026-11-09', subjectId: 'sub-en', subjectName: 'English', gradeName: 'Grade 8', tutorProfileId: 'tp-anjali', tutorName: 'Anjali Menon',
  startMinute: 900, endMinute: 960, durationMinutes: 60, frequency: 'WEEKLY', frequencyLabel: 'Weekly', recurrence: 'Monday', week: null, assignmentState: 'ASSIGNED',
  availability: { status: 'AVAILABLE', reason: 'Available.' }, classStatus: 'SCHEDULED', overlaps: [], problems: [], notes: [], ...over,
});

const data = (over: Partial<TimetableData> = {}, events: TimetableEvent[] = [event()]): TimetableData => ({
  student: { id: 'stu-1', name: 'Synthetic Student A' },
  view: 'weekly',
  period: { view: 'weekly', from: '2026-11-09', to: '2026-11-15', month: null },
  timeZone: 'Asia/Kolkata',
  status: 'READY_FOR_REVIEW',
  summary: { totalSubjects: 2, scheduledSessions: events.length, teachingMinutes: 60 * events.length, assignedTutors: 2, incompleteSubjects: 0, subjectsWithoutTutor: 0, unresolvedConflicts: 0, tutorIssues: 0 },
  subjects: [
    { subjectId: 'sub-en', subjectName: 'English', gradeName: 'Grade 8', frequencyLabel: 'Weekly', startDate: '2026-11-09', sessions: ['Monday'], tutorProfileId: 'tp-anjali', tutorName: 'Anjali Menon', assignmentState: 'ASSIGNED' },
    { subjectId: 'sub-ma', subjectName: 'Mathematics', gradeName: 'Grade 8', frequencyLabel: 'Weekly', startDate: '2026-11-09', sessions: ['Wednesday'], tutorProfileId: 'tp-rahul', tutorName: 'Rahul Nair', assignmentState: 'ASSIGNED' },
  ],
  warnings: [], events, approval: { state: null, stageStatus: 'IN_PROGRESS' }, canViewTutorProfile: true, ...over,
});
const maths = (over: Partial<TimetableEvent> = {}) => event({ id: 'sub-ma:2026-11-11:960', date: '2026-11-11', subjectId: 'sub-ma', subjectName: 'Mathematics', tutorProfileId: 'tp-rahul', tutorName: 'Rahul Nair', startMinute: 960, endMinute: 1020, recurrence: 'Wednesday', ...over });

describe('moving between periods', () => {
  it('weekly moves a week, bi-weekly two weeks, monthly to the first of the next or earlier month', () => {
    expect(shiftDate('weekly', '2026-11-09', 1)).toBe('2026-11-16');
    expect(shiftDate('weekly', '2026-11-09', -1)).toBe('2026-11-02');
    expect(shiftDate('biweekly', '2026-11-09', 1)).toBe('2026-11-23');
    expect(shiftDate('biweekly', '2026-11-09', -1)).toBe('2026-10-26');
    expect(shiftDate('monthly', '2026-11-30', 1)).toBe('2026-12-01');
    expect(shiftDate('monthly', '2026-12-15', 1)).toBe('2027-01-01');
    expect(shiftDate('monthly', '2026-01-20', -1)).toBe('2025-12-01');
  });

  it('writes the period out in words', () => {
    expect(periodTitle({ view: 'weekly', from: '2026-11-09', to: '2026-11-15', month: null })).toBe('9 November to 15 November 2026');
    expect(periodTitle({ view: 'biweekly', from: '2026-12-28', to: '2027-01-10', month: null })).toBe('28 December to 10 January 2027');
    expect(periodTitle({ view: 'monthly', from: '2026-10-26', to: '2026-12-06', month: '2026-11' })).toBe('November 2026');
  });

  it('cuts the month grid into whole weeks, Monday first', () => {
    const weeks = monthWeeks('2026-10-26', '2026-12-06');
    expect(weeks).toHaveLength(6);
    expect(weeks.every((w) => w.length === 7)).toBe(true);
    expect(weeks[0][0]).toBe('2026-10-26');
    expect(weeks[5][6]).toBe('2026-12-06');
  });
});

describe('laying out a day', () => {
  const at = (id: string, start: number, end: number) => event({ id, startMinute: start, endMinute: end });

  it('puts overlapping classes side by side and gives separate classes the whole width', () => {
    const placed = placeDay([at('a', 900, 960), at('b', 930, 990), at('c', 1080, 1140)]);
    expect(placed.map((p) => [p.event.id, p.lane, p.lanes])).toEqual([['a', 0, 2], ['b', 1, 2], ['c', 0, 1]]);
  });

  it('three at once take three lanes, and a class after a gap starts a new group', () => {
    const placed = placeDay([at('a', 900, 1000), at('b', 910, 1000), at('c', 920, 1000), at('d', 1000, 1060)]);
    expect(placed.map((p) => [p.event.id, p.lane, p.lanes])).toEqual([['a', 0, 3], ['b', 1, 3], ['c', 2, 3], ['d', 0, 1]]);
  });

  it('shows 8 AM to 8 PM and widens only for a class outside it', () => {
    expect(hourSpan([event()])).toEqual({ from: 8, to: 20 });
    expect(hourSpan([event({ startMinute: 6 * 60 + 30, endMinute: 7 * 60 }), event({ startMinute: 21 * 60, endMinute: 22 * 60 + 15 })])).toEqual({ from: 6, to: 23 });
  });

  it('gives a subject the same colour every time, and different subjects different colours', () => {
    const ids = ['sub-ma', 'sub-en', 'sub-sc'];
    expect(colourFor('sub-en', ids)).toBe(colourFor('sub-en', [...ids].reverse()));
    expect(new Set(ids.map((i) => colourFor(i, ids).dot)).size).toBe(3);
  });
});

describe('the weekly timetable', () => {
  const days = ['2026-11-09', '2026-11-10', '2026-11-11', '2026-11-12', '2026-11-13', '2026-11-14', '2026-11-15'];
  const grid = (d: TimetableData) => renderToStaticMarkup(React.createElement(WeekGrid, { data: d, days, onOpen: noop, selectedId: null, today: '2026-11-10' }));

  it('is Monday to Sunday with each class showing subject, tutor, time, duration and grade', () => {
    const markup = grid(data({}, [event(), maths()]));
    for (const d of ['Mon 9 Nov', 'Tue 10 Nov', 'Wed 11 Nov', 'Sun 15 Nov']) expect(text(markup)).toContain(d);
    expect(markup.match(/data-testid="timetable-event"/g)).toHaveLength(2);
    expect(markup).toContain('aria-label="English, Anjali Menon, Monday 3:00 PM to 4:00 PM"');
    expect(markup).toContain('aria-label="Mathematics, Rahul Nair, Wednesday 4:00 PM to 5:00 PM"');
  });

  it('says so on an empty day and does not invent classes', () => {
    const markup = grid(data({}, [event()]));
    expect(markup.match(/No classes/g)).toHaveLength(6);
  });

  it('shows overlapping classes both, flagged, and not hidden behind each other', () => {
    const a = event({ overlaps: ['b'], problems: ['Overlaps another class of this student.'] });
    const b = event({ id: 'b', subjectId: 'sub-ma', subjectName: 'Mathematics', startMinute: 930, endMinute: 990, overlaps: [a.id], problems: ['Overlaps another class of this student.'], tutorName: 'Rahul Nair' });
    const markup = grid(data({}, [a, b]));
    expect(markup.match(/data-testid="timetable-event"/g)).toHaveLength(2);
    expect(markup.match(/Overlaps another class/g)).toHaveLength(2);
    expect(markup).toContain('left:0%;width:50%');
    expect(markup).toContain('left:50%;width:50%');
  });

  it('shows a cancelled class struck through, not deleted, and not counted as occupied', () => {
    const markup = grid(data({}, [event({ classStatus: 'CANCELLED' })]));
    expect(markup).toContain('data-state="CANCELLED"');
    expect(markup).toContain('line-through');
  });
});

describe('the bi-weekly timetable', () => {
  const week1 = event({ id: 'w1', date: '2026-11-09', frequency: 'BIWEEKLY', frequencyLabel: 'Bi-weekly', week: 1 });
  const week2 = event({ id: 'w2', date: '2026-11-17', subjectId: 'sub-ma', subjectName: 'Mathematics', tutorName: 'Rahul Nair', frequency: 'BIWEEKLY', frequencyLabel: 'Bi-weekly', week: 2, startMinute: 960, endMinute: 1020 });
  const d = data({ view: 'biweekly', period: { view: 'biweekly', from: '2026-11-09', to: '2026-11-22', month: null } }, [week1, week2]);
  const board = (tab: 'week1' | 'week2' | 'combined') => renderToStaticMarkup(React.createElement(TimetableBoard, { data: d, biweeklyTab: tab, onBiweeklyTab: noop, selectedEvent: null, selectedDate: null, onOpen: noop, onPickDate: noop, today: '2026-11-10' }));

  const rowsOf = (markup: string) => text((markup.match(/<tbody>[\s\S]*?<\/tbody>/g) ?? []).join(" "));

  it('Week 1 shows only the Week 1 class with its exact dates, Week 2 only the Week 2 class', () => {
    const one = board('week1');
    expect(text(one)).toContain('Week 1 Mon 9 Nov to Sun 15 Nov');
    expect(rowsOf(one)).toContain('English');
    expect(rowsOf(one)).not.toContain('Mathematics');
    expect(text(one)).not.toContain('Week 2 Mon 16 Nov');
    const two = board('week2');
    expect(text(two)).toContain('Week 2 Mon 16 Nov to Sun 22 Nov');
    expect(rowsOf(two)).toContain('Mathematics');
    expect(rowsOf(two)).not.toContain('English');
  });

  it('the combined view shows both weeks, each with its own classes, and labels the class with its week', () => {
    const both = board('combined');
    expect(text(both)).toContain('Week 1 Mon 9 Nov to Sun 15 Nov');
    expect(text(both)).toContain('Week 2 Mon 16 Nov to Sun 22 Nov');
    expect(both.match(/data-testid="timetable-row"/g)).toHaveLength(2);
    expect(text(both)).toContain('Anjali Menon');
    expect(text(both)).toContain('Rahul Nair');
  });

  it('says a week has no classes rather than copying the other week', () => {
    const empty = renderToStaticMarkup(React.createElement(WeekList, { data: d, days: ['2026-11-23', '2026-11-24', '2026-11-25', '2026-11-26', '2026-11-27', '2026-11-28', '2026-11-29'], title: 'Week 1', onOpen: noop, selectedId: null }));
    expect(text(empty)).toContain('No classes this week.');
  });
});

describe('the monthly timetable', () => {
  const period = { view: 'monthly' as const, from: '2026-10-26', to: '2026-12-06', month: '2026-11' };
  const render = (events: TimetableEvent[], selectedDate: string | null = null) =>
    renderToStaticMarkup(React.createElement(MonthGrid, { data: data({ view: 'monthly', period }, events), onOpen: noop, onPickDate: noop, selectedDate, today: '2026-11-10' }));

  it('is a six-week grid with the weekday names, the dates around the month marked, and today marked', () => {
    const markup = render([]);
    expect(markup.match(/data-date=/g)).toHaveLength(42);
    expect(markup.match(/data-outside="true"/g)).toHaveLength(12); // 5 days of October and 7 of December
    for (const n of ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']) expect(text(markup)).toContain(n);
    expect(markup).toContain('bg-brand-600 font-semibold text-white'); // today
  });

  it('puts a class on its date only, and collapses a crowded day into "more"', () => {
    const many = [1, 2, 3, 4, 5].map((i) => event({ id: `e${i}`, startMinute: 600 + i * 60, endMinute: 660 + i * 60 }));
    const markup = render([...many, event({ id: 'other', date: '2026-11-16' })]);
    expect(markup.match(/data-testid="timetable-event"/g)).toHaveLength(4); // 3 shown on the 9th, 1 on the 16th
    expect(text(markup)).toContain('+2 more');
  });

  it('opens every class of a chosen date', () => {
    const list = [event({ id: 'x' }), event({ id: 'y', startMinute: 1020, endMinute: 1080 })];
    const markup = renderToStaticMarkup(React.createElement(DayDetails, { date: '2026-11-09', data: data({}, list), onOpen: noop, onClose: noop }));
    expect(text(markup)).toContain('Monday, 9 November 2026');
    expect(markup.match(/data-testid="timetable-event"/g)).toHaveLength(2);
    expect(text(renderToStaticMarkup(React.createElement(DayDetails, { date: '2026-11-10', data: data({}, list), onOpen: noop, onClose: noop })))).toContain('No classes on this date.');
  });
});

describe('class details', () => {
  const open = (e: TimetableEvent, over: Partial<TimetableData> = {}) => renderToStaticMarkup(React.createElement(EventDetails, { e, data: data(over, [e]), onClose: noop }));

  it('lists subject, tutor, student, grade, date, time, frequency, assignment, availability and status', () => {
    const t = text(open(event()));
    for (const part of ['English', 'Anjali Menon', 'Synthetic Student A', 'Grade 8', 'Monday, 9 November 2026', '3:00 PM to 4:00 PM (1 h)', 'Weekly, Monday', 'Tutor assigned', 'Confirmed for this date', 'Scheduled', 'Classes start on Monday, 9 November 2026']) expect(t).toContain(part);
  });

  it('links to the tutor profile only for people who may read it', () => {
    expect(open(event())).toContain('href="/tutors/tp-anjali"');
    expect(open(event(), { canViewTutorProfile: false })).not.toContain('/tutors/');
  });

  it('explains a problem in words, and says plainly when there is no tutor', () => {
    const t = text(open(event({ problems: ['On leave on Monday, 9 November.'], availability: { status: 'LEAVE', reason: 'On leave on Monday, 9 November.' } })));
    expect(t).toContain('On leave on Monday, 9 November.');
    const none = text(open(event({ tutorName: null, tutorProfileId: null, assignmentState: 'NO_TUTOR', availability: null })));
    expect(none).toContain('No tutor selected');
    expect(none).toContain('Not checked, no tutor');
  });
});

describe('the summary and the status', () => {
  it('shows the six counts, and marks incomplete subjects and conflicts', () => {
    const d = data({ summary: { totalSubjects: 3, scheduledSessions: 5, teachingMinutes: 390, assignedTutors: 2, incompleteSubjects: 1, subjectsWithoutTutor: 1, unresolvedConflicts: 1, tutorIssues: 2 } });
    const markup = renderToStaticMarkup(React.createElement(SummaryCards, { data: d }));
    const t = text(markup);
    expect(t).toContain('Subjects 3');
    expect(t).toContain('Scheduled sessions 5');
    expect(t).toContain('Teaching hours 6 h 30 min');
    expect(t).toContain('Assigned tutors 2');
    expect(t).toContain('Incomplete subjects 2');
    expect(t).toContain('Unresolved conflicts 3');
    expect(markup.match(/border-red-200/g)).toHaveLength(2);
  });

  it('uses the five status names the workflow defines', () => {
    expect(Object.values(STATUS_LABELS)).toEqual(['Draft', 'Ready for review', 'Pending Mentor approval', 'Approved', 'Conflict detected']);
  });

  it('writes no dashes or emoji in its words', () => {
    const all = [...Object.values(STATUS_LABELS), periodTitle({ view: 'weekly', from: '2026-11-09', to: '2026-11-15', month: null })].join(' ');
    expect(all).not.toMatch(/[–—]/);
    expect(all).not.toMatch(/\p{Extended_Pictographic}/u);
  });
});
