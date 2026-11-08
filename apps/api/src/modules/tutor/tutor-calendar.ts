/**
 * A tutor's real calendar: what a given date looks like once the weekly hours, holidays, leave, extra hours, blocked
 * time and every booked class are put together. Pure rules (it imports only the weekly availability helpers), so the
 * calendar screen, the tutor list for a subject and the assignment check all see the same day.
 *
 * One day is resolved in this order:
 *   1. A day the tutor is away is closed: approved leave, then a public holiday, then a special day off.
 *   2. Otherwise the weekly ranges for that weekday, plus any extra hours for that date, make the working time.
 *      The gap between two working ranges is a break.
 *   3. Blocked time is taken out of the working time.
 *   4. Classes are placed last. A recurring class produces one occurrence on each date its rule reaches; a cancelled
 *      occurrence is skipped and a rescheduled one appears on its new date.
 * Free time is working time minus blocked time minus classes. A booked time is never free.
 */
import { AvailabilityWindow, DAY_NAMES, DayNumber, clockToMinutes, formatRange } from './tutor-availability';

// ─── Dates (calendar dates only, as YYYY-MM-DD, never affected by a time zone) ───────────────────────────────────

const DAY_MS = 86_400_000;
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export const isDateString = (value: unknown): value is string => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
};
const toUtc = (date: string) => new Date(`${date}T00:00:00Z`);
export const formatDate = (d: Date): string => d.toISOString().slice(0, 10);
export const addDays = (date: string, n: number): string => formatDate(new Date(toUtc(date).getTime() + n * DAY_MS));
export const weekdayOf = (date: string): DayNumber => toUtc(date).getUTCDay() as DayNumber;
export const daysBetween = (from: string, to: string): number => Math.round((toUtc(to).getTime() - toUtc(from).getTime()) / DAY_MS);
const daysInMonth = (date: string): number => new Date(Date.UTC(toUtc(date).getUTCFullYear(), toUtc(date).getUTCMonth() + 1, 0)).getUTCDate();
/** The Monday of the week a date falls in. */
export const mondayOf = (date: string): string => addDays(date, -((weekdayOf(date) + 6) % 7));
/** "Tuesday, 10 November" */
export const describeDate = (date: string): string => `${DAY_NAMES[weekdayOf(date)]}, ${toUtc(date).getUTCDate()} ${MONTH_NAMES[toUtc(date).getUTCMonth()]}`;
export const datesBetween = (from: string, to: string): string[] => {
  const out: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
};

/** Classes saved without a start date count weeks from this Monday, which is how week patterns were read before dates existed. */
export const LEGACY_ANCHOR = '2024-01-01';
/** How far ahead a recurring class is checked when someone asks "is this tutor free for it". */
export const HORIZON_WEEKS = 8;

// ─── Recurring classes ───────────────────────────────────────────────────────────────────────────────────────────

export type Frequency = 'WEEKLY' | 'BIWEEKLY' | 'MONTHLY';
export type ClassSource = 'ANOTHER_STUDENT' | 'THIS_STUDENT' | 'BOOKED_CLASS';

/** What is shown for a booked class. `student` is null whenever the person looking is not allowed to see it. */
export interface ClassLabel {
  subject: string;
  student: string | null;
}

export interface ClassRule {
  id: string;
  dayNumber: number;
  frequency: Frequency;
  /** Bi-weekly only: which week of the two-week cycle. */
  week: 1 | 2 | null;
  /** Monthly only: EVERY, FIRST, SECOND, THIRD, FOURTH, LAST. */
  occurrences: readonly string[];
  startMinute: number;
  endMinute: number;
  /** The first date the class runs. Null: the week pattern is read from the legacy anchor. */
  startDate: string | null;
  endDate: string | null;
  label: ClassLabel;
  source: ClassSource;
}

export interface ClassOverride {
  ruleId: string;
  /** The occurrence being changed, and the start time it has by rule. */
  date: string;
  originalStartMinute: number;
  kind: 'CANCELLED' | 'RESCHEDULED';
  newDate: string | null;
  newStartMinute: number | null;
  newEndMinute: number | null;
  reason: string;
}

/** A single booking on one date: a demo, or a class that is not part of a recurring rule. */
export interface DatedClass {
  date: string;
  startMinute: number;
  endMinute: number;
  label: ClassLabel;
  source: ClassSource;
}

export interface ClassInstance {
  date: string;
  startMinute: number;
  endMinute: number;
  label: ClassLabel;
  source: ClassSource;
  ruleId: string | null;
  /** True for an occurrence that was moved here from another date. */
  moved: boolean;
}

const NTH: Record<string, number> = { FIRST: 1, SECOND: 2, THIRD: 3, FOURTH: 4 };

/** Does the rule produce a class on this date? Start and end dates, the weekday, and the week or month pattern all apply. */
export function occursOn(rule: Pick<ClassRule, 'dayNumber' | 'frequency' | 'week' | 'occurrences' | 'startDate' | 'endDate'>, date: string): boolean {
  if (weekdayOf(date) !== rule.dayNumber) return false;
  if (rule.startDate && date < rule.startDate) return false;
  if (rule.endDate && date > rule.endDate) return false;
  if (rule.frequency === 'WEEKLY') return true;
  if (rule.frequency === 'BIWEEKLY') {
    const anchor = rule.startDate ? mondayOf(rule.startDate) : LEGACY_ANCHOR;
    const index = Math.floor(daysBetween(anchor, date) / 7);
    return (((index % 2) + 2) % 2) + 1 === (rule.week ?? 1);
  }
  const dom = toUtc(date).getUTCDate();
  return rule.occurrences.some((o) => o === 'EVERY' || (o === 'LAST' ? dom + 7 > daysInMonth(date) : NTH[o] !== undefined && Math.ceil(dom / 7) === NTH[o]));
}

/** Every date in [from, to] on which the rule produces a class. */
export const occurrenceDates = (rule: Parameters<typeof occursOn>[0], from: string, to: string): string[] => datesBetween(from, to).filter((d) => occursOn(rule, d));

// ─── Exceptions ──────────────────────────────────────────────────────────────────────────────────────────────────

export interface TutorException {
  date: string;
  kind: 'HOLIDAY' | 'DAY_OFF' | 'EXTRA_HOURS' | 'BLOCKED' | 'LEAVE';
  startMinute: number | null;
  endMinute: number | null;
  note: string;
}

export interface TutorCalendarInput {
  weekly: readonly AvailabilityWindow[];
  exceptions: readonly TutorException[];
  rules: readonly ClassRule[];
  overrides: readonly ClassOverride[];
  dated: readonly DatedClass[];
}

export interface Range {
  start: number;
  end: number;
}

export type ClosedKind = 'LEAVE' | 'HOLIDAY' | 'DAY_OFF';

export interface DayTimetable {
  date: string;
  weekday: DayNumber;
  closed: { kind: ClosedKind; note: string } | null;
  /** The tutor has set no weekly hours at all. */
  configured: boolean;
  working: Range[];
  breaks: Range[];
  blocked: Range[];
  classes: ClassInstance[];
  free: Range[];
  /** Classes that fall on a day the tutor is away. They are reported, never deleted. */
  affected: ClassInstance[];
}

const sortRanges = (r: Range[]) => [...r].sort((a, b) => a.start - b.start || a.end - b.end);
function merge(ranges: Range[]): Range[] {
  const out: Range[] = [];
  for (const r of sortRanges(ranges)) {
    const last = out[out.length - 1];
    if (last && r.start <= last.end) last.end = Math.max(last.end, r.end);
    else out.push({ ...r });
  }
  return out;
}
function subtract(from: Range[], remove: Range[]): Range[] {
  let out = from.map((r) => ({ ...r }));
  for (const cut of merge(remove)) {
    out = out.flatMap((r) => {
      if (cut.end <= r.start || cut.start >= r.end) return [r];
      const parts: Range[] = [];
      if (cut.start > r.start) parts.push({ start: r.start, end: cut.start });
      if (cut.end < r.end) parts.push({ start: cut.end, end: r.end });
      return parts;
    });
  }
  return out;
}

/** The classes a tutor has on one date, with cancelled ones left out and moved ones where they now fall. */
export function classesOn(input: Pick<TutorCalendarInput, 'rules' | 'overrides' | 'dated'>, date: string): ClassInstance[] {
  const out: ClassInstance[] = [];
  for (const rule of input.rules) {
    const change = input.overrides.find((o) => o.ruleId === rule.id && o.date === date && o.originalStartMinute === rule.startMinute);
    if (occursOn(rule, date) && !change) out.push({ date, startMinute: rule.startMinute, endMinute: rule.endMinute, label: rule.label, source: rule.source, ruleId: rule.id, moved: false });
  }
  for (const o of input.overrides) {
    if (o.kind !== 'RESCHEDULED' || o.newDate !== date || o.newStartMinute === null || o.newEndMinute === null) continue;
    const rule = input.rules.find((r) => r.id === o.ruleId);
    if (rule) out.push({ date, startMinute: o.newStartMinute, endMinute: o.newEndMinute, label: rule.label, source: rule.source, ruleId: rule.id, moved: true });
  }
  for (const d of input.dated) if (d.date === date) out.push({ date, startMinute: d.startMinute, endMinute: d.endMinute, label: d.label, source: d.source, ruleId: null, moved: false });
  return out.sort((a, b) => a.startMinute - b.startMinute || a.endMinute - b.endMinute);
}

export function resolveDay(input: TutorCalendarInput, date: string): DayTimetable {
  const weekday = weekdayOf(date);
  const todays = input.exceptions.filter((e) => e.date === date);
  const closing = todays.find((e) => e.kind === 'LEAVE') ?? todays.find((e) => e.kind === 'HOLIDAY') ?? todays.find((e) => e.kind === 'DAY_OFF');
  const instances = classesOn(input, date);
  const configured = input.weekly.length > 0;
  if (closing) {
    return { date, weekday, closed: { kind: closing.kind as ClosedKind, note: closing.note }, configured, working: [], breaks: [], blocked: [], classes: [], free: [], affected: instances };
  }
  const ranges: Range[] = input.weekly.filter((w) => w.day === weekday).map((w) => ({ start: clockToMinutes(w.start), end: clockToMinutes(w.end) }));
  for (const e of todays) if (e.kind === 'EXTRA_HOURS' && e.startMinute !== null && e.endMinute !== null) ranges.push({ start: e.startMinute, end: e.endMinute });
  const working = merge(ranges);
  const blocked = merge(todays.filter((e) => e.kind === 'BLOCKED' && e.startMinute !== null && e.endMinute !== null).map((e) => ({ start: e.startMinute as number, end: e.endMinute as number })));
  const breaks = working.slice(1).map((r, i) => ({ start: working[i].end, end: r.start }));
  const free = subtract(subtract(working, blocked), instances.map((c) => ({ start: c.startMinute, end: c.endMinute })));
  return { date, weekday, closed: null, configured, working, breaks, blocked, classes: instances, free, affected: [] };
}

// ─── Is a time free? ─────────────────────────────────────────────────────────────────────────────────────────────

export type DateStatus =
  | 'AVAILABLE'
  | 'OCCUPIED'
  | 'OUTSIDE_HOURS'
  | 'BREAK'
  | 'LEAVE'
  | 'HOLIDAY'
  | 'DAY_OFF'
  | 'NOT_WORKING_DAY'
  | 'NOT_CONFIGURED'
  | 'BLOCKED';

export interface DateCheck {
  date: string;
  status: DateStatus;
  /** A reason that is safe to show: it never names another student. */
  reason: string;
}

const hoursText = (r: Range[]) => r.map((x) => formatRange(x.start, x.end)).join(' and ');

/** Is [start, end) free on this day, and if not, why not? The first reason that applies wins. */
export function checkWindow(day: DayTimetable, start: number, end: number): DateCheck {
  const date = day.date;
  const say = (status: DateStatus, reason: string): DateCheck => ({ date, status, reason });
  if (day.closed?.kind === 'LEAVE') return say('LEAVE', `On leave on ${describeDate(date)}.`);
  if (day.closed?.kind === 'HOLIDAY') return say('HOLIDAY', `Public holiday on ${describeDate(date)}.`);
  if (day.closed?.kind === 'DAY_OFF') return say('DAY_OFF', `Not working on ${describeDate(date)}.`);
  if (!day.configured && day.working.length === 0) return say('NOT_CONFIGURED', 'No weekly availability has been set for this tutor.');
  if (day.working.length === 0) return say('NOT_WORKING_DAY', `Does not work on ${DAY_NAMES[day.weekday]}s.`);
  if (day.working.some((w) => w.start <= start && end <= w.end)) {
    const clash = day.classes.find((c) => c.startMinute < end && start < c.endMinute);
    if (clash) return say('OCCUPIED', clash.source === 'THIS_STUDENT' ? 'Already assigned to another subject of this student at this time.' : 'Already booked during this time.');
    if (day.blocked.some((b) => b.start < end && start < b.end)) return say('BLOCKED', `Time blocked on ${describeDate(date)}.`);
    return say('AVAILABLE', 'Available.');
  }
  if (day.breaks.some((b) => b.start < end && start < b.end) && start >= day.working[0].start && end <= day.working[day.working.length - 1].end) {
    return say('BREAK', `Break time on ${describeDate(date)}.`);
  }
  return say('OUTSIDE_HOURS', `Outside working hours on ${describeDate(date)}. Working ${hoursText(day.working)}.`);
}

// ─── The screen: a day as a list of stretches of time ───────────────────────────────────────────────────────────

export type SegmentState = 'CLASS' | 'FREE' | 'BREAK' | 'BLOCKED' | 'NOT_WORKING' | 'LEAVE' | 'HOLIDAY' | 'DAY_OFF' | 'NOT_CONFIGURED';

export interface Segment {
  start: number;
  end: number;
  state: SegmentState;
  /** Set for a class. */
  label?: ClassLabel;
  moved?: boolean;
  note?: string;
}

export const DEFAULT_DAY_START = 8 * 60;
export const DEFAULT_DAY_END = 22 * 60;

/** The day as consecutive stretches: class, free, break, blocked, or not working. Together they cover the whole shown day. */
export function timeline(day: DayTimetable, from = DEFAULT_DAY_START, to = DEFAULT_DAY_END): Segment[] {
  const lo = Math.min(from, ...day.working.map((w) => w.start), ...day.classes.map((c) => c.startMinute));
  const hi = Math.max(to, ...day.working.map((w) => w.end), ...day.classes.map((c) => c.endMinute));
  if (day.closed) return [{ start: lo, end: hi, state: day.closed.kind, note: day.closed.note }];
  if (!day.configured && day.working.length === 0) return [{ start: lo, end: hi, state: 'NOT_CONFIGURED' }];
  const cuts = new Set<number>([lo, hi]);
  for (const r of [...day.working, ...day.blocked, ...day.breaks]) { cuts.add(r.start); cuts.add(r.end); }
  for (const c of day.classes) { cuts.add(c.startMinute); cuts.add(c.endMinute); }
  const points = [...cuts].filter((m) => m >= lo && m <= hi).sort((a, b) => a - b);
  const first = day.working[0]?.start;
  const last = day.working[day.working.length - 1]?.end;
  const out: Segment[] = [];
  for (let i = 0; i + 1 < points.length; i++) {
    const a = points[i];
    const b = points[i + 1];
    const cls = day.classes.find((c) => c.startMinute < b && a < c.endMinute);
    let seg: Segment;
    if (cls) seg = { start: a, end: b, state: 'CLASS', label: cls.label, moved: cls.moved };
    else if (day.blocked.some((x) => x.start < b && a < x.end)) seg = { start: a, end: b, state: 'BLOCKED' };
    else if (day.working.some((w) => w.start <= a && b <= w.end)) seg = { start: a, end: b, state: 'FREE' };
    else if (first !== undefined && last !== undefined && a >= first && b <= last) seg = { start: a, end: b, state: 'BREAK' };
    else seg = { start: a, end: b, state: 'NOT_WORKING' };
    const prev = out[out.length - 1];
    const sameClass = seg.state === 'CLASS' && prev?.state === 'CLASS' && prev.label === seg.label && prev.end === seg.start;
    if (prev && prev.state === seg.state && (seg.state !== 'CLASS' || sameClass)) prev.end = seg.end;
    else out.push(seg);
  }
  return out;
}

/** "Free 5:30 PM to 6:30 PM" style totals for a day: minutes of working time that are free, booked, and in a break. */
export function dayTotals(day: DayTimetable): { freeMinutes: number; bookedMinutes: number; breakMinutes: number } {
  const sum = (r: Range[]) => r.reduce((n, x) => n + (x.end - x.start), 0);
  return { freeMinutes: sum(day.free), bookedMinutes: day.classes.reduce((n, c) => n + (c.endMinute - c.startMinute), 0), breakMinutes: sum(day.breaks) };
}
