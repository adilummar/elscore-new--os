/**
 * DRY RUN ONLY. No database is read or written. This file describes the fictional tutors, their weekly hours, their
 * bookings, leave and exceptions that are PROPOSED for staging, resolves them into real calendar dates, checks them,
 * and prints what would be created. It exists so the data can be reviewed, counted and tested before anything is
 * approved. Run:
 *
 *   npx ts-node --transpile-only src/modules/tutor/testing/timetable-fixture/preview.ts            (prints the report)
 *   npx ts-node --transpile-only src/modules/tutor/testing/timetable-fixture/preview.ts --markdown (writes the preview document)
 *
 * The date resolver below is also the prototype of the one the proposed engine change would use, so the counts here
 * are the counts the engine will see.
 */
import { writeFileSync } from 'fs';
import { join } from 'path';

// ─── Dates ───────────────────────────────────────────────────────────────────────────────────────────────────────
const DAY_MS = 86_400_000;
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const utc = (iso: string) => new Date(`${iso}T00:00:00Z`);
const iso = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (isoDate: string, n: number) => iso(new Date(utc(isoDate).getTime() + n * DAY_MS));
const weekdayOf = (isoDate: string) => utc(isoDate).getUTCDay();
const nice = (isoDate: string) => `${WEEKDAYS[weekdayOf(isoDate)]}, ${utc(isoDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', timeZone: 'UTC' })}`;
const minutes = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));
const clock = (m: number) => { const h = Math.floor(m / 60); const mm = m % 60; return `${h % 12 === 0 ? 12 : h % 12}:${String(mm).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`; };
const range = (a: number, b: number) => `${clock(a)} to ${clock(b)}`;

/** Week 1 of every bi-weekly schedule is the week that starts on the anchor Monday. */
export const ANCHOR = '2026-11-09';
export const WINDOW = { start: '2026-11-09', end: '2027-01-03' }; // eight weeks, Monday to Sunday
const daysIn = (isoDate: string) => new Date(Date.UTC(utc(isoDate).getUTCFullYear(), utc(isoDate).getUTCMonth() + 1, 0)).getUTCDate();

// ─── Model ───────────────────────────────────────────────────────────────────────────────────────────────────────
type Nth = 'EVERY' | 'FIRST' | 'SECOND' | 'THIRD' | 'FOURTH' | 'LAST';
type Rule = { kind: 'WEEKLY' } | { kind: 'BIWEEKLY'; week: 1 | 2 } | { kind: 'MONTHLY'; nth: Nth };
interface Booking { student: string; subject: string; level: number; rule: Rule; day: number; start: string; end: string }
interface Exception { date: string; kind: 'LEAVE' | 'DAY_OFF' | 'EXTRA' | 'BLOCKED'; start?: string; end?: string; note: string }
interface Override { student: string; date: string; kind: 'CANCELLED' | 'RESCHEDULED'; toDate?: string; toStart?: string; toEnd?: string; note: string }
interface Tutor {
  /** One extra tutor that exists only to show "availability not configured". It can be dropped. */
  helper?: boolean;
  key: string; name: string; subjects: string[]; levels: [number, number];
  weekly: Array<[number, string, string]>; // [day 0 = Sunday, from, to]. Two ranges on one day leave a break.
  bookings: Booking[]; exceptions: Exception[]; overrides: Override[];
}

const HELPER: Tutor = { helper: true, key: 'isha', name: 'Isha Varma', subjects: ['Science'], levels: [6, 10], weekly: [], bookings: [], exceptions: [], overrides: [] };

export const HOLIDAYS = [{ date: '2026-11-25', note: 'Synthetic public holiday (test)' }, { date: '2026-12-25', note: 'Synthetic public holiday (test)' }];

const W = (rule: 'W' | 'B1' | 'B2' | Nth, student: string, subject: string, level: number, day: number, start: string, end: string): Booking => ({
  student, subject, level, day, start, end,
  rule: rule === 'W' ? { kind: 'WEEKLY' } : rule === 'B1' ? { kind: 'BIWEEKLY', week: 1 } : rule === 'B2' ? { kind: 'BIWEEKLY', week: 2 } : { kind: 'MONTHLY', nth: rule },
});
const MON = 1, TUE = 2, WED = 3, THU = 4, FRI = 5, SAT = 6, SUN = 0;
const wk = (days: number[], from: string, to: string, breakFrom?: string, breakTo?: string): Array<[number, string, string]> =>
  days.flatMap((d) => (breakFrom && breakTo ? ([[d, from, breakFrom], [d, breakTo, to]] as Array<[number, string, string]>) : ([[d, from, to]] as Array<[number, string, string]>)));

export const TUTORS: Tutor[] = [
  {
    key: 'anjali', name: 'Anjali Menon', subjects: ['English', 'Social Studies'], levels: [5, 10],
    weekly: [...wk([MON, TUE, WED, THU, FRI], '15:00', '20:00', '17:00', '17:30'), [SAT, '09:00', '13:00']],
    bookings: [W('W', 'Student 1', 'English', 8, MON, '15:00', '16:00'), W('W', 'Student 2', 'English', 9, WED, '17:30', '18:30'), W('B1', 'Student 3', 'Social Studies', 7, TUE, '16:00', '17:00'), W('B2', 'Student 4', 'English', 6, SAT, '09:00', '10:00'), W('FIRST', 'Student 5', 'Social Studies', 10, MON, '18:30', '19:30')],
    exceptions: [{ date: '2026-11-20', kind: 'DAY_OFF', note: 'Special non-working day (test)' }],
    overrides: [],
  },
  {
    key: 'rahul', name: 'Rahul Nair', subjects: ['Mathematics'], levels: [6, 12],
    weekly: [...wk([MON, TUE, THU], '16:00', '21:00', '18:30', '19:00'), [WED, '14:00', '18:00'], ...wk([SAT], '10:00', '16:00', '13:00', '14:00')],
    bookings: [W('W', 'Student 6', 'Mathematics', 10, MON, '16:00', '17:00'), W('W', 'Student 7', 'Mathematics', 12, TUE, '19:00', '20:00'), W('W', 'Student 8', 'Mathematics', 8, THU, '16:00', '17:30'), W('B1', 'Student 9', 'Mathematics', 9, SAT, '10:00', '11:00'), W('THIRD', 'Student 10', 'Mathematics', 11, SAT, '14:00', '15:00')],
    exceptions: [{ date: '2026-11-17', kind: 'BLOCKED', start: '15:00', end: '17:00', note: 'Temporarily blocked: school meeting (test)' }],
    overrides: [{ student: 'Student 7', date: '2026-11-24', kind: 'RESCHEDULED', toDate: '2026-11-26', toStart: '19:00', toEnd: '20:00', note: 'Moved one class to Thursday (test)' }],
  },
  {
    key: 'arun', name: 'Arun Kumar', subjects: ['Physics', 'Mathematics'], levels: [8, 12],
    weekly: [...wk([MON, TUE, WED, THU, FRI], '17:00', '21:00'), [SAT, '09:00', '13:00'], [SAT, '15:00', '18:00']],
    bookings: [W('W', 'Student 11', 'Physics', 11, MON, '17:00', '18:00'), W('W', 'Student 12', 'Mathematics', 9, MON, '18:30', '19:30'), W('W', 'Student 13', 'Physics', 12, WED, '18:00', '19:00'), W('B1', 'Student 14', 'Mathematics', 10, FRI, '17:00', '18:00'), W('B2', 'Student 15', 'Physics', 10, SAT, '09:00', '10:30')],
    exceptions: [], overrides: [],
  },
  {
    key: 'meera', name: 'Meera Thomas', subjects: ['Science', 'Biology'], levels: [5, 10],
    weekly: [...wk([MON], '14:00', '20:00', '16:00', '16:30'), ...wk([TUE], '15:00', '20:00', '17:00', '17:30'), ...wk([WED], '14:00', '19:00', '16:00', '16:30'), ...wk([THU], '15:00', '20:00', '17:00', '17:30'), ...wk([FRI], '14:00', '18:00', '16:00', '16:30'), ...wk([SAT], '09:00', '14:00', '11:00', '11:30')],
    bookings: [
      W('W', 'Student A', 'Science', 8, MON, '14:00', '15:00'), W('W', 'Student B', 'Science', 7, MON, '15:00', '16:00'), W('W', 'Student C', 'Biology', 9, MON, '16:30', '17:30'), W('W', 'Student D', 'Science', 6, MON, '18:30', '19:30'),
      W('W', 'Student E', 'Biology', 10, TUE, '15:00', '16:00'), W('W', 'Student F', 'Science', 8, TUE, '17:30', '18:30'),
      W('W', 'Student G', 'Science', 7, WED, '15:00', '16:00'), W('W', 'Student H', 'Biology', 9, WED, '17:30', '18:30'),
      W('B1', 'Student I', 'Science', 6, THU, '15:00', '16:00'), W('B2', 'Student J', 'Biology', 10, SAT, '09:00', '10:00'),
      W('FIRST', 'Student K', 'Science', 8, MON, '17:30', '18:30'), W('THIRD', 'Student L', 'Science', 7, SAT, '10:00', '11:00'),
    ],
    exceptions: [
      { date: '2026-11-12', kind: 'LEAVE', note: 'Approved leave (test)' },
      { date: '2026-11-14', kind: 'EXTRA', start: '14:00', end: '18:00', note: 'Additional availability (test)' },
    ],
    overrides: [{ student: 'Student E', date: '2026-11-17', kind: 'CANCELLED', note: 'Student away, class cancelled (test)' }],
  },
  {
    key: 'neha', name: 'Neha Sharma', subjects: ['English', 'Hindi'], levels: [4, 9],
    weekly: wk([MON, TUE, WED, THU, FRI], '14:00', '18:00', '16:00', '16:30'),
    bookings: [W('W', 'Student 16', 'English', 5, MON, '14:00', '15:00'), W('W', 'Student 17', 'Hindi', 6, TUE, '14:00', '15:00'), W('W', 'Student 18', 'English', 8, WED, '16:30', '17:30'), W('B1', 'Student 19', 'Hindi', 4, THU, '14:00', '15:00')],
    exceptions: [], overrides: [],
  },
  {
    key: 'vivek', name: 'Vivek Raj', subjects: ['Chemistry', 'Physics'], levels: [9, 12],
    weekly: [...wk([TUE, THU], '16:00', '21:00'), ...wk([SAT], '09:00', '17:00', '12:30', '13:30'), [SUN, '10:00', '14:00']],
    bookings: [W('W', 'Student 20', 'Chemistry', 11, TUE, '16:00', '17:00'), W('W', 'Student 21', 'Physics', 12, THU, '17:00', '18:30'), W('W', 'Student 22', 'Chemistry', 10, SAT, '09:00', '10:00'), W('B2', 'Student 23', 'Physics', 9, SUN, '10:00', '11:00')],
    exceptions: [], overrides: [],
  },
  {
    key: 'priya', name: 'Priya Das', subjects: ['Mathematics', 'Science'], levels: [5, 10],
    weekly: [...wk([MON, TUE, WED, THU], '14:00', '18:00', '16:00', '16:30'), [FRI, '14:00', '17:00'], [SAT, '09:00', '12:00']],
    bookings: [W('W', 'Student 24', 'Mathematics', 8, MON, '17:00', '18:00'), W('W', 'Student 25', 'Science', 7, MON, '14:00', '15:00'), W('B1', 'Student 26', 'Science', 6, TUE, '16:30', '17:30'), W('W', 'Student 27', 'Mathematics', 9, THU, '14:00', '15:00'), W('FIRST', 'Student 28', 'Science', 10, FRI, '15:00', '16:00')],
    exceptions: [{ date: '2026-11-18', kind: 'LEAVE', note: 'Approved leave (test)' }, { date: '2026-11-19', kind: 'LEAVE', note: 'Approved leave (test)' }],
    overrides: [],
  },
  {
    key: 'kiran', name: 'Kiran Joseph', subjects: ['Computer Science', 'Mathematics'], levels: [6, 12],
    weekly: [...wk([MON, WED, FRI], '18:00', '22:00'), ...wk([SAT], '09:00', '18:00', '13:00', '14:00'), [SUN, '10:00', '16:00']],
    bookings: [W('W', 'Student 29', 'Computer Science', 9, MON, '18:00', '19:00'), W('W', 'Student 30', 'Mathematics', 11, WED, '19:00', '20:00'), W('W', 'Student 31', 'Computer Science', 12, SAT, '09:00', '10:30'), W('B1', 'Student 32', 'Mathematics', 7, SUN, '10:00', '11:00')],
    exceptions: [], overrides: [],
  },
  {
    key: 'divya', name: 'Divya Krishnan', subjects: ['Biology', 'Science'], levels: [7, 12],
    weekly: [...wk([MON, WED, FRI], '15:00', '19:00'), ...wk([TUE, THU], '16:00', '20:00', '18:00', '18:30'), [SAT, '09:00', '13:00']],
    bookings: [W('W', 'Student 33', 'Biology', 10, TUE, '16:00', '17:00'), W('W', 'Student 34', 'Science', 8, THU, '16:00', '17:00'), W('B2', 'Student 35', 'Biology', 11, SAT, '09:00', '10:00')],
    exceptions: [], overrides: [],
  },
  {
    key: 'sandeep', name: 'Sandeep Pillai', subjects: ['Social Studies', 'History'], levels: [5, 10],
    weekly: [...wk([MON, TUE, WED, THU, FRI], '14:30', '19:30', '17:00', '17:30'), [SAT, '10:00', '15:00']],
    bookings: [W('W', 'Student 36', 'History', 9, MON, '14:30', '15:30'), W('W', 'Student 37', 'Social Studies', 7, WED, '18:00', '19:00'), W('B1', 'Student 38', 'History', 10, SAT, '10:00', '11:00'), W('LAST', 'Student 39', 'Social Studies', 8, FRI, '15:00', '16:00')],
    exceptions: [], overrides: [],
  },
  HELPER,
];

// ─── Resolving a day ─────────────────────────────────────────────────────────────────────────────────────────────
const nthOf = (d: string, nth: Nth) => {
  if (nth === 'EVERY') return true;
  const dom = utc(d).getUTCDate();
  if (nth === 'LAST') return dom + 7 > daysIn(d);
  return Math.ceil(dom / 7) === { FIRST: 1, SECOND: 2, THIRD: 3, FOURTH: 4 }[nth];
};
const weekIndex = (d: string) => Math.floor((utc(d).getTime() - utc(ANCHOR).getTime()) / DAY_MS / 7);

/** Does this rule produce a class on this date? */
export function occursOn(b: Booking, d: string): boolean {
  if (weekdayOf(d) !== b.day || d < ANCHOR) return false;
  if (b.rule.kind === 'WEEKLY') return true;
  if (b.rule.kind === 'BIWEEKLY') return (weekIndex(d) % 2) + 1 === b.rule.week;
  return nthOf(d, b.rule.nth);
}
export const describeRule = (r: Rule) => (r.kind === 'WEEKLY' ? 'weekly' : r.kind === 'BIWEEKLY' ? `bi-weekly, week ${r.week}` : `monthly, ${r.nth.toLowerCase()}`);

export type SlotState = 'OCCUPIED' | 'FREE' | 'BREAK' | 'LEAVE' | 'HOLIDAY' | 'NOT_WORKING' | 'BLOCKED';
interface Occupied { start: number; end: number; subject: string; student: string }
export interface DayView { date: string; working: Array<[number, number]>; closed: 'LEAVE' | 'HOLIDAY' | 'DAY_OFF' | null; occupied: Occupied[]; blocked: Array<[number, number]>; affected: Occupied[] }

export function resolveDay(t: Tutor, d: string): DayView {
  const holiday = HOLIDAYS.find((h) => h.date === d);
  const ex = t.exceptions.filter((e) => e.date === d);
  const closed = holiday ? 'HOLIDAY' : ex.find((e) => e.kind === 'LEAVE') ? 'LEAVE' : ex.find((e) => e.kind === 'DAY_OFF') ? 'DAY_OFF' : null;
  const raw: Array<[number, number]> = t.weekly.filter(([day]) => day === weekdayOf(d)).map(([, a, b]) => [minutes(a), minutes(b)]);
  for (const e of ex) if (e.kind === 'EXTRA') raw.push([minutes(e.start as string), minutes(e.end as string)]);
  raw.sort((a, b) => a[0] - b[0]);
  const working: Array<[number, number]> = [];
  for (const r of raw) {
    const last = working[working.length - 1];
    if (last && r[0] <= last[1]) last[1] = Math.max(last[1], r[1]);
    else working.push([...r]);
  }
  const blocked = ex.filter((e) => e.kind === 'BLOCKED').map((e) => [minutes(e.start as string), minutes(e.end as string)] as [number, number]);

  const classes: Occupied[] = [];
  for (const b of t.bookings) {
    const o = t.overrides.find((x) => x.student === b.student && (x.date === d || (x.toDate === d && x.kind === 'RESCHEDULED')));
    if (o && o.date === d) continue; // cancelled, or moved away from this date
    if (o && o.toDate === d) classes.push({ start: minutes(o.toStart as string), end: minutes(o.toEnd as string), subject: b.subject, student: b.student });
    else if (occursOn(b, d)) classes.push({ start: minutes(b.start), end: minutes(b.end), subject: b.subject, student: b.student });
  }
  classes.sort((a, b) => a.start - b.start);
  // A class on a day the tutor is away is not deleted: it is reported as affected, so a person can decide.
  return closed ? { date: d, working: [], closed, occupied: [], blocked, affected: classes } : { date: d, working, closed: null, occupied: classes, blocked, affected: [] };
}

const stateAt = (v: DayView, from: number, to: number): { state: SlotState; label?: string } => {
  if (v.closed === 'LEAVE' || v.closed === 'HOLIDAY') return { state: v.closed };
  if (v.closed === 'DAY_OFF') return { state: 'NOT_WORKING' };
  const cls = v.occupied.find((c) => c.start < to && from < c.end);
  if (cls) return { state: 'OCCUPIED', label: `${cls.subject}, ${cls.student}` };
  if (v.blocked.some(([a, b]) => a < to && from < b)) return { state: 'BLOCKED' };
  if (v.working.some(([a, b]) => a <= from && to <= b)) return { state: 'FREE' };
  const first = v.working[0]?.[0];
  const lastEnd = v.working[v.working.length - 1]?.[1];
  if (first !== undefined && lastEnd !== undefined && from >= first && to <= lastEnd) return { state: 'BREAK' };
  return { state: 'NOT_WORKING' };
};

/** Half-hour slots between 08:00 and 22:00, as counted in the report. */
const SLOT = 30;
export function countSlots(t: Tutor, from: string, to: string) {
  const out: Record<SlotState, number> & { affectedClasses: number; classes: number } = { OCCUPIED: 0, FREE: 0, BREAK: 0, LEAVE: 0, HOLIDAY: 0, NOT_WORKING: 0, BLOCKED: 0, affectedClasses: 0, classes: 0 };
  for (let d = from; d <= to; d = addDays(d, 1)) {
    const v = resolveDay(t, d);
    out.affectedClasses += v.affected.length;
    out.classes += v.occupied.length;
    for (let m = 8 * 60; m < 22 * 60; m += SLOT) {
      const s = stateAt(v, m, m + SLOT).state;
      if (v.working.length === 0 && s === 'NOT_WORKING') continue; // a day off is not counted slot by slot
      out[s]++;
    }
  }
  return out;
}

// ─── Checking a request, the way the proposed engine would ──────────────────────────────────────────────────────
export type Result = 'AVAILABLE' | 'OCCUPIED' | 'OUTSIDE_HOURS' | 'NOT_WORKING_DAY' | 'BREAK' | 'LEAVE' | 'HOLIDAY_OR_DAY_OFF' | 'NOT_CONFIGURED' | 'BLOCKED';
export function checkDate(t: Tutor, d: string, from: string, to: string): Result {
  const v = resolveDay(t, d);
  const a = minutes(from), b = minutes(to);
  if (v.closed === 'LEAVE') return 'LEAVE';
  if (v.closed === 'HOLIDAY' || v.closed === 'DAY_OFF') return 'HOLIDAY_OR_DAY_OFF';
  // No hours at all is "not configured". Hours on other days but none on this one is a day the tutor does not work.
  if (t.weekly.length === 0 && !t.exceptions.some((e) => e.kind === 'EXTRA')) return 'NOT_CONFIGURED';
  if (v.working.length === 0) return 'NOT_WORKING_DAY';
  if (v.working.some(([x, y]) => x <= a && b <= y)) {
    if (v.occupied.some((c) => c.start < b && a < c.end)) return 'OCCUPIED';
    if (v.blocked.some(([x, y]) => x < b && a < y)) return 'BLOCKED';
    return 'AVAILABLE';
  }
  const first = v.working[0][0], last = v.working[v.working.length - 1][1];
  if (a >= first && b <= last) return 'BREAK';
  return 'OUTSIDE_HOURS';
}
const eligible = (t: Tutor, subject: string, level: number) => t.subjects.includes(subject) && level >= t.levels[0] && level <= t.levels[1];
export const byKey = (k: string) => TUTORS.find((t) => t.key === k) as Tutor;

// ─── Counts of what would be written ───────────────────────────────────────────────────────────────────────────
export function plan() {
  const students = new Set(TUTORS.flatMap((t) => t.bookings.map((b) => b.student)));
  const bookings = TUTORS.reduce((n, t) => n + t.bookings.length, 0);
  const slots = TUTORS.reduce((n, t) => n + t.weekly.length, 0);
  const subjects = new Set(TUTORS.flatMap((t) => t.subjects));
  const levelsPer = TUTORS.reduce((n, t) => n + (t.levels[1] - t.levels[0] + 1), 0);
  return { tutors: TUTORS.length, students: students.size, bookings, slots, subjects: [...subjects], tutorSubjects: TUTORS.reduce((n, t) => n + t.subjects.length, 0), tutorGrades: levelsPer, leave: TUTORS.flatMap((t) => t.exceptions.filter((e) => e.kind === 'LEAVE')).length, exceptions: TUTORS.flatMap((t) => t.exceptions.filter((e) => e.kind !== 'LEAVE')).length, overrides: TUTORS.reduce((n, t) => n + t.overrides.length, 0), holidays: HOLIDAYS.length };
}

// ─── Self checks: the data must hold together before anyone approves it ─────────────────────────────────────────
export function selfCheck(): string[] {
  const problems: string[] = [];
  for (const t of TUTORS) {
    // 1. no overlapping bookings on any real date, and every class sits inside working time
    for (let d = WINDOW.start; d <= WINDOW.end; d = addDays(d, 1)) {
      const v = resolveDay(t, d);
      for (let i = 1; i < v.occupied.length; i++) if (v.occupied[i].start < v.occupied[i - 1].end) problems.push(`${t.name} ${d}: ${v.occupied[i - 1].student} overlaps ${v.occupied[i].student}`);
      for (const c of v.occupied) if (!v.working.some(([a, b]) => a <= c.start && c.end <= b)) problems.push(`${t.name} ${d}: ${c.student} ${range(c.start, c.end)} is outside working time or in a break`);
      for (const c of v.occupied) if (v.blocked.some(([a, b]) => a < c.end && c.start < b)) problems.push(`${t.name} ${d}: ${c.student} sits in a blocked period`);
    }
    // 2. every booked subject is one the tutor teaches, at a level they teach
    for (const b of t.bookings) if (!eligible(t, b.subject, b.level)) problems.push(`${t.name}: ${b.student} ${b.subject} grade ${b.level} is outside the tutor's eligibility`);
  }
  return problems;
}

// ─── Scenarios the data must demonstrate ───────────────────────────────────────────────────────────────────────
interface Scenario { n: number; text: string; tutor: string; date: string; from: string; to: string; expect: Result }
export const SCENARIOS: Scenario[] = [
  { n: 1, text: 'A Science tutor with a completely free date and time', tutor: 'meera', date: '2026-11-09', from: '17:30', to: '18:30', expect: 'AVAILABLE' },
  { n: 2, text: 'A Science tutor occupied by another student', tutor: 'meera', date: '2026-11-10', from: '17:30', to: '18:30', expect: 'OCCUPIED' },
  { n: 3, text: 'A Science tutor working that day but unavailable at that time', tutor: 'priya', date: '2026-11-10', from: '18:30', to: '19:30', expect: 'OUTSIDE_HOURS' },
  { n: 4, text: 'A Science tutor who does not work that day', tutor: 'divya', date: '2026-11-15', from: '16:00', to: '17:00', expect: 'NOT_WORKING_DAY' },
  { n: 5, text: 'A Science tutor on leave', tutor: 'meera', date: '2026-11-12', from: '15:00', to: '16:00', expect: 'LEAVE' },
  { n: 6, text: 'A Science tutor with a break during the requested slot', tutor: 'meera', date: '2026-11-09', from: '16:00', to: '16:30', expect: 'BREAK' },
  { n: 7, text: 'A Science tutor with unconfigured availability (the optional helper tutor)', tutor: 'isha', date: '2026-11-10', from: '16:00', to: '17:00', expect: 'NOT_CONFIGURED' },
  { n: 10, text: 'A recurring booking that blocks a future occurrence (first Monday of the month)', tutor: 'meera', date: '2026-12-07', from: '17:30', to: '18:30', expect: 'OCCUPIED' },
];

function report() {
  const p = plan();
  const lines: string[] = [];
  const out = (s = '') => lines.push(s);
  out('# Proposed tutor timetable fixture: dry run');
  out();
  out(`Window: ${nice(WINDOW.start)} ${utc(WINDOW.start).getUTCFullYear()} to ${nice(WINDOW.end)} ${utc(WINDOW.end).getUTCFullYear()}. Week 1 of every bi-weekly class starts ${nice(ANCHOR)}. Nothing here has been written to any database.`);
  out();
  out('## What would be created');
  out();
  out(`- ${p.tutors - 1} requested fictional tutors, plus 1 optional helper tutor with no working hours (${p.tutors} in all), ${p.tutorSubjects} subject links, ${p.tutorGrades} level links, ${p.slots} weekly working ranges`);
  out(`- ${p.students} synthetic students, ${p.bookings} recurring bookings`);
  out(`- ${p.leave} approved leave days in ${TUTORS.filter((t) => t.exceptions.some((e) => e.kind === 'LEAVE')).length} leave requests, ${p.exceptions} date exceptions (extra hours, blocked time, day off), ${p.overrides} class overrides (one cancelled, one rescheduled), ${p.holidays} organisation holidays`);
  out(`- Subjects used: ${p.subjects.join(', ')}`);
  out();
  out('## Weekly working hours (a gap between two ranges is a break)');
  out();
  for (const t of TUTORS) {
    out(`**${t.name}**, ${t.subjects.join(' and ')}, grades ${t.levels[0]} to ${t.levels[1]}`);
    for (let d = 1; d <= 7; d++) {
      const day = d % 7;
      const ranges = t.weekly.filter(([x]) => x === day).map(([, a, b]) => [minutes(a), minutes(b)] as [number, number]);
      const gaps = ranges.slice(1).map((r, i) => range(ranges[i][1], r[0]));
      out(`- ${WEEKDAYS[day]}: ${ranges.length ? `${range(ranges[0][0], ranges[ranges.length - 1][1])}${gaps.length ? ` (break ${gaps.join(', ')})` : ''}` : 'not working'}`);
    }
    out();
  }
  out('## Bookings');
  out();
  for (const t of TUTORS) {
    out(`**${t.name}**`);
    for (const b of t.bookings) out(`- ${b.student}: ${b.subject}, grade ${b.level}, ${WEEKDAYS[b.day]} ${range(minutes(b.start), minutes(b.end))}, ${describeRule(b.rule)}`);
    out();
  }
  out('## Meera Thomas, the three days in the request');
  out();
  for (const d of ['2026-11-09', '2026-11-10', '2026-11-11']) {
    const v = resolveDay(byKey('meera'), d);
    out(`**${nice(d)} ${utc(d).getUTCFullYear()}**`);
    out();
    out('| Time | Subject | Student | Status |');
    out('|---|---|---|---|');
    let m = v.working[0][0];
    const end = v.working[v.working.length - 1][1];
    while (m < end) {
      const cls = v.occupied.find((c) => c.start === m);
      if (cls) { out(`| ${range(cls.start, cls.end)} | ${cls.subject} | Synthetic ${cls.student} | Occupied |`); m = cls.end; continue; }
      let next = m + SLOT;
      const st = stateAt(v, m, next).state;
      while (next < end && stateAt(v, next, next + SLOT).state === st && !v.occupied.some((c) => c.start === next)) next += SLOT;
      out(`| ${range(m, next)} | | | ${st === 'FREE' ? 'Free' : st === 'BREAK' ? 'Break' : st} |`);
      m = next;
    }
    out();
  }
  out('## The example in the request, checked against the data');
  out();
  out('Science, 5:30 PM to 6:30 PM, on three dates, for Meera Thomas:');
  out();
  out('| Date | Result | Why |');
  out('|---|---|---|');
  const why: Record<string, string> = { AVAILABLE: 'Free', OCCUPIED: 'Another student has the slot' };
  for (const d of ['2026-11-09', '2026-11-10', '2026-11-11']) {
    const r = checkDate(byKey('meera'), d, '17:30', '18:30');
    const c = resolveDay(byKey('meera'), d).occupied.find((x) => x.start < minutes('18:30') && minutes('17:30') < x.end);
    out(`| ${nice(d)} | ${r} | ${why[r] ?? r}${c ? `: ${c.subject} with Synthetic ${c.student}` : ''} |`);
  }
  out();
  out('The request expected November 11 to be available, but its own timetable for that day has Biology with Student H at 5:30 PM to 6:30 PM. The data follows the timetable, so the honest result is 1 of 3 dates available, not 2 of 3.');
  out();
  out('## Slot counts over the window (half-hour slots between 8 AM and 10 PM on working days)');
  out();
  out('| Tutor | Classes | Occupied | Free | Break | Leave or holiday | Classes affected by leave |');
  out('|---|---:|---:|---:|---:|---:|---:|');
  for (const t of TUTORS) {
    const c = countSlots(t, WINDOW.start, WINDOW.end);
    out(`| ${t.name} | ${c.classes} | ${c.OCCUPIED} | ${c.FREE} | ${c.BREAK} | ${c.LEAVE + c.HOLIDAY} | ${c.affectedClasses} |`);
  }
  out();
  out('## Scenario check');
  out();
  out('| # | Scenario | Tutor and request | Expected | Result |');
  out('|---|---|---|---|---|');
  for (const s of SCENARIOS) {
    const r = checkDate(byKey(s.tutor), s.date, s.from, s.to);
    out(`| ${s.n} | ${s.text} | ${byKey(s.tutor).name}, ${nice(s.date)}, ${range(minutes(s.from), minutes(s.to))} | ${s.expect} | ${r}${r === s.expect ? '' : ' MISMATCH'} |`);
  }
  // 8: grade-ineligible; 9: multi-subject conflict
  const g = TUTORS.filter((t) => t.subjects.includes('Science')).map((t) => `${t.name}: ${eligible(t, 'Science', 11) ? 'eligible' : 'not eligible'}`);
  out(`| 8 | A tutor who is qualified but grade-ineligible | Science, grade 11 | Meera ineligible | ${g.join('; ')} |`);
  const priya = checkDate(byKey('priya'), '2026-11-09', '17:30', '18:00');
  out(`| 9 | A tutor with several subjects but conflicting bookings | Priya Das teaches Mathematics and Science; Science requested Monday 5:30 PM to 6:00 PM | OCCUPIED | ${priya} (her Monday Mathematics class 5:00 PM to 6:00 PM) |`);
  out();
  out('## Recurring bookings blocking a later date');
  out();
  const weekly = (t: Tutor, day: number, from: string, to: string) => {
    const dates: string[] = [];
    for (let d = WINDOW.start; d <= WINDOW.end; d = addDays(d, 1)) if (weekdayOf(d) === day) dates.push(d);
    return dates.map((d) => `${d.slice(5)}: ${checkDate(t, d, from, to)}`).join(', ');
  };
  out(`A weekly Tuesday 4:30 PM to 5:30 PM class for Priya Das (her bi-weekly Week 1 class sits there): ${weekly(byKey('priya'), TUE, '16:30', '17:30')}`);
  out();
  const problems = selfCheck();
  out('## Self checks');
  out();
  out(problems.length ? problems.map((x) => `- PROBLEM: ${x}`).join('\n') : '- No overlapping bookings for any tutor on any date, every class sits inside working time and outside breaks, and every booking matches the tutor\'s subjects and levels.');
  return lines.join('\n');
}

if (require.main === module) {
  const text = report();
  if (process.argv.includes('--markdown')) {
    const target = join(__dirname, '../../../../../../../docs/operations/TUTOR_TIMETABLE_FIXTURE_PREVIEW.md');
    writeFileSync(target, `${text}\n`);
    console.log(`written: ${target}`);
  } else console.log(text);
  const bad = selfCheck();
  const mismatches = SCENARIOS.filter((s) => checkDate(byKey(s.tutor), s.date, s.from, s.to) !== s.expect);
  if (bad.length || mismatches.length) {
    console.error(`FAILED: ${bad.length} data problems, ${mismatches.length} scenario mismatches`);
    process.exit(1);
  }
}
