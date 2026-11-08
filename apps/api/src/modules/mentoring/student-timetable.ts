/**
 * A student's timetable, worked out from what is already saved: the subject schedule from the Meeting with Parents stage
 * and the tutor assigned to each subject. Pure rules, no database and no framework.
 *
 * Nothing here is stored. Every class is produced from the saved recurrence rule for a real date, so a weekly class is
 * not shown as monthly, a bi-weekly class is not shown every week, and a change to the schedule shows up the next time
 * the timetable is read. Reading a timetable never creates a booking.
 */
import { DAY_NAMES, DayNumber, formatRange } from '../tutor/tutor-availability';
import { DateCheck, LEGACY_ANCHOR, addDays, daysBetween, datesBetween, isDateString, mondayOf, occursOn } from '../tutor/tutor-calendar';

import { FREQUENCY_LABELS, Frequency, ScheduleValue, SubjectSchedule, sessionLabel, timeToMinutes } from './subject-schedule';
import { WEEKDAY_NUMBER } from './tutor-matching';

export type TimetableView = 'weekly' | 'biweekly' | 'monthly';
export const TIMETABLE_VIEWS: readonly TimetableView[] = ['weekly', 'biweekly', 'monthly'];
/** The longest range one request may ask for: a six-week month grid. */
export const MAX_TIMETABLE_DAYS = 42;

export type TimetableStatus = 'DRAFT' | 'READY_FOR_REVIEW' | 'PENDING_MENTOR_APPROVAL' | 'APPROVED' | 'CONFLICT_DETECTED';
export type AssignmentState = 'ASSIGNED' | 'NEEDS_REVIEW' | 'NO_TUTOR';
export type ClassStatus = 'SCHEDULED' | 'CANCELLED' | 'RESCHEDULED' | 'MOVED_HERE';

// ─── The saved plan, as the builder reads it ─────────────────────────────────────────────────────────────────────
export interface PlanSession {
  dayNumber: DayNumber;
  week: 1 | 2 | null;
  occurrences: readonly string[];
  start: number | null;
  end: number | null;
  durationMinutes: number;
  label: string;
}

export interface PlanSubject {
  subjectId: string;
  subjectName: string;
  gradeName: string;
  frequency: Frequency;
  startDate: string | null;
  sessions: PlanSession[];
}

export interface PlanAssignment {
  id: string;
  subjectId: string;
  status: 'ACTIVE' | 'NEEDS_REVIEW';
  tutorProfileId: string;
  tutorName: string;
}

export interface PlanOverride {
  assignmentId: string;
  date: string;
  originalStartMinute: number;
  kind: 'CANCELLED' | 'RESCHEDULED';
  newDate: string | null;
  newStartMinute: number | null;
  newEndMinute: number | null;
  reason: string;
}

/** The saved schedule as plan subjects. A subject with a session that has no times keeps it, so it can be flagged. */
export function planFromSchedule(schedule: ScheduleValue | null): PlanSubject[] {
  if (!schedule) return [];
  return schedule.subjects.map((s: SubjectSchedule) => ({
    subjectId: s.subjectId,
    subjectName: s.subjectName,
    gradeName: s.gradeName,
    frequency: s.frequency,
    startDate: s.startDate ?? null,
    sessions: s.sessions.map((x) => {
      const start = x.start ? timeToMinutes(x.start) : null;
      const end = x.end ? timeToMinutes(x.end) : null;
      return {
        dayNumber: WEEKDAY_NUMBER[x.day],
        week: x.week ?? null,
        occurrences: x.occurrences ?? [],
        start,
        end,
        durationMinutes: start !== null && end !== null ? end - start : x.durationMinutes,
        label: sessionLabel(x, s.frequency),
      };
    }),
  }));
}

// ─── Periods ─────────────────────────────────────────────────────────────────────────────────────────────────────
export interface Period {
  view: TimetableView;
  from: string;
  to: string;
  /** Monthly only: the month shown, YYYY-MM. The grid also holds the days around it. */
  month: string | null;
}

const monthOf = (date: string) => date.slice(0, 7);
const lastDayOfMonth = (date: string) => {
  const [y, m] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
};

/** Week 1 of a two-week period is the week of the earliest start date, so the weeks keep their meaning from page to page. */
export function biweeklyAnchor(subjects: readonly PlanSubject[]): string {
  const dates = subjects.map((s) => s.startDate).filter((d): d is string => !!d).sort();
  return mondayOf(dates[0] ?? LEGACY_ANCHOR);
}

/** The dates a view shows when it is opened on `date`: Monday to Sunday, a two-week block, or the month grid. */
export function periodFor(view: TimetableView, date: string, anchor: string = mondayOf(LEGACY_ANCHOR)): Period {
  if (view === 'weekly') {
    const from = mondayOf(date);
    return { view, from, to: addDays(from, 6), month: null };
  }
  if (view === 'biweekly') {
    const index = Math.floor(daysBetween(anchor, mondayOf(date)) / 14);
    const from = addDays(anchor, index * 14);
    return { view, from, to: addDays(from, 13), month: null };
  }
  const first = `${monthOf(date)}-01`;
  return { view, from: mondayOf(first), to: addDays(mondayOf(lastDayOfMonth(date)), 6), month: monthOf(date) };
}

/** Checks a requested range. Returns the reason it is refused, or null. */
export function rangeProblem(view: string, from: string, to: string): string | null {
  if (!(TIMETABLE_VIEWS as readonly string[]).includes(view)) return 'Choose weekly, bi-weekly or monthly.';
  if (!isDateString(from) || !isDateString(to)) return 'Choose real dates, written like 2026-11-09.';
  if (to < from) return 'The end date must not be before the start date.';
  if (daysBetween(from, to) + 1 > MAX_TIMETABLE_DAYS) return `Ask for at most ${MAX_TIMETABLE_DAYS} days at a time.`;
  return null;
}

// ─── Events ──────────────────────────────────────────────────────────────────────────────────────────────────────
export interface TimetableEvent {
  id: string;
  date: string;
  subjectId: string;
  subjectName: string;
  gradeName: string;
  tutorProfileId: string | null;
  tutorName: string | null;
  startMinute: number;
  endMinute: number;
  durationMinutes: number;
  frequency: Frequency;
  frequencyLabel: string;
  /** For example "Week 2 Thursday" or "First Monday". */
  recurrence: string;
  /** Bi-weekly only: the class's week in its own two-week cycle. */
  week: 1 | 2 | null;
  assignmentState: AssignmentState;
  /** What the tutor's own calendar says about this date. Null when there is no tutor to ask. */
  availability: { status: string; reason: string } | null;
  classStatus: ClassStatus;
  /** Ids of this student's other classes that overlap this one. */
  overlaps: string[];
  /** Anything that needs the Mentor's attention, in plain words. */
  problems: string[];
  notes: string[];
}

export interface SubjectWarning {
  subjectId: string;
  subjectName: string;
  kind: 'INCOMPLETE' | 'NO_TUTOR' | 'TUTOR_NEEDS_REVIEW';
  message: string;
}

export type AvailabilityOf = (assignment: PlanAssignment, subject: PlanSubject, date: string, start: number, end: number) => DateCheck | null;

export interface BuildInput {
  subjects: readonly PlanSubject[];
  assignments: readonly PlanAssignment[];
  overrides: readonly PlanOverride[];
  from: string;
  to: string;
  availabilityOf: AvailabilityOf;
}

const counts = (e: TimetableEvent) => e.classStatus === 'SCHEDULED' || e.classStatus === 'MOVED_HERE';
const overlap = (a: TimetableEvent, b: TimetableEvent) => a.date === b.date && a.startMinute < b.endMinute && b.startMinute < a.endMinute;

/** What is wrong with a subject's plan before any date is looked at. */
export function subjectWarnings(subjects: readonly PlanSubject[], assignments: readonly PlanAssignment[]): SubjectWarning[] {
  const out: SubjectWarning[] = [];
  for (const s of subjects) {
    const incomplete = s.sessions.length === 0 ? 'No days are chosen yet.' : s.sessions.some((x) => x.start === null || x.end === null) ? 'Every class needs a start time.' : null;
    if (incomplete) out.push({ subjectId: s.subjectId, subjectName: s.subjectName, kind: 'INCOMPLETE', message: `${s.subjectName}: ${incomplete} The schedule is not complete, so no classes are shown for it.` });
    const a = assignments.find((x) => x.subjectId === s.subjectId);
    if (!a) out.push({ subjectId: s.subjectId, subjectName: s.subjectName, kind: 'NO_TUTOR', message: `${s.subjectName}: no tutor is selected yet.` });
    else if (a.status === 'NEEDS_REVIEW') out.push({ subjectId: s.subjectId, subjectName: s.subjectName, kind: 'TUTOR_NEEDS_REVIEW', message: `${s.subjectName}: ${a.tutorName} no longer fits every class. The classes stay until you choose another tutor.` });
  }
  return out;
}

/**
 * Every class of the plan between two dates, with the tutor and what the tutor's calendar says. A subject whose plan is
 * incomplete produces no classes (a warning is given instead of a misleading card). A subject with no tutor still shows
 * its classes, marked as having no tutor.
 */
export function buildEvents(input: BuildInput): TimetableEvent[] {
  const events: TimetableEvent[] = [];
  const days = datesBetween(input.from, input.to);
  const make = (s: PlanSubject, x: PlanSession, a: PlanAssignment | undefined, date: string, start: number, end: number, classStatus: ClassStatus, notes: string[]): TimetableEvent => {
    const state: AssignmentState = !a ? 'NO_TUTOR' : a.status === 'NEEDS_REVIEW' ? 'NEEDS_REVIEW' : 'ASSIGNED';
    const check = a && classStatus !== 'CANCELLED' && classStatus !== 'RESCHEDULED' ? input.availabilityOf(a, s, date, start, end) : null;
    const problems: string[] = [];
    if (check && check.status !== 'AVAILABLE') problems.push(check.reason);
    if (state === 'NEEDS_REVIEW' && classStatus !== 'CANCELLED') problems.push(`${a?.tutorName ?? 'The tutor'} needs review for this subject.`);
    return {
      id: `${s.subjectId}:${date}:${start}`,
      date,
      subjectId: s.subjectId,
      subjectName: s.subjectName,
      gradeName: s.gradeName,
      tutorProfileId: a?.tutorProfileId ?? null,
      tutorName: a?.tutorName ?? null,
      startMinute: start,
      endMinute: end,
      durationMinutes: end - start,
      frequency: s.frequency,
      frequencyLabel: FREQUENCY_LABELS[s.frequency],
      recurrence: x.label,
      week: s.frequency === 'BIWEEKLY' ? x.week ?? 1 : null,
      assignmentState: state,
      availability: check ? { status: check.status, reason: check.reason } : null,
      classStatus,
      overlaps: [],
      problems,
      notes,
    };
  };

  for (const s of input.subjects) {
    if (s.sessions.length === 0 || s.sessions.some((x) => x.start === null || x.end === null)) continue;
    const a = input.assignments.find((x) => x.subjectId === s.subjectId);
    const mine = input.overrides.filter((o) => a && o.assignmentId === a.id);
    const rule = (x: PlanSession) => ({ dayNumber: x.dayNumber, frequency: s.frequency, week: x.week, occurrences: x.occurrences, startDate: s.startDate, endDate: null });

    for (const x of s.sessions) {
      for (const date of days) {
        if (!occursOn(rule(x), date)) continue;
        const start = x.start as number;
        const end = x.end as number;
        const change = mine.find((o) => o.date === date && o.originalStartMinute === start);
        if (change?.kind === 'CANCELLED') events.push(make(s, x, a, date, start, end, 'CANCELLED', [`Cancelled: ${change.reason}`]));
        else if (change?.kind === 'RESCHEDULED') events.push(make(s, x, a, date, start, end, 'RESCHEDULED', [`Moved to ${change.newDate ?? 'another date'}: ${change.reason}`]));
        else events.push(make(s, x, a, date, start, end, 'SCHEDULED', []));
      }
      // A class moved onto a date in the range, whatever date it was moved from.
      for (const o of mine) {
        if (o.kind !== 'RESCHEDULED' || !o.newDate || o.newStartMinute === null || o.newEndMinute === null) continue;
        if (o.newDate < input.from || o.newDate > input.to) continue;
        if (!occursOn(rule(x), o.date) || x.start !== o.originalStartMinute) continue;
        events.push(make(s, x, a, o.newDate, o.newStartMinute, o.newEndMinute, 'MOVED_HERE', [`Moved from ${o.date}: ${o.reason}`]));
      }
    }
  }

  // Classes that overlap are all kept and each one points at the others. Nothing is hidden or overwritten.
  const live = events.filter(counts);
  for (const e of live) e.overlaps = live.filter((o) => o !== e && overlap(e, o)).map((o) => o.id);
  for (const e of live) if (e.overlaps.length) e.problems.push('Overlaps another class of this student.');
  return events.sort((a, b) => a.date.localeCompare(b.date) || a.startMinute - b.startMinute || a.subjectName.localeCompare(b.subjectName));
}

// ─── Summary and status ──────────────────────────────────────────────────────────────────────────────────────────
export interface TimetableSummary {
  totalSubjects: number;
  scheduledSessions: number;
  teachingMinutes: number;
  assignedTutors: number;
  incompleteSubjects: number;
  subjectsWithoutTutor: number;
  /** Pairs of this student's classes that overlap in the period. */
  unresolvedConflicts: number;
  /** Classes in the period whose tutor is not free, or whose assignment needs review. */
  tutorIssues: number;
}

export function summarise(subjects: readonly PlanSubject[], assignments: readonly PlanAssignment[], events: readonly TimetableEvent[], warnings: readonly SubjectWarning[]): TimetableSummary {
  const live = events.filter(counts);
  const pairs = live.reduce((n, e) => n + e.overlaps.length, 0) / 2;
  return {
    totalSubjects: subjects.length,
    scheduledSessions: live.length,
    teachingMinutes: live.reduce((n, e) => n + e.durationMinutes, 0),
    assignedTutors: new Set(assignments.filter((a) => subjects.some((s) => s.subjectId === a.subjectId)).map((a) => a.tutorProfileId)).size,
    incompleteSubjects: warnings.filter((w) => w.kind === 'INCOMPLETE').length,
    subjectsWithoutTutor: warnings.filter((w) => w.kind === 'NO_TUTOR').length,
    unresolvedConflicts: pairs,
    tutorIssues: live.filter((e) => (e.availability !== null && e.availability.status !== 'AVAILABLE') || e.assignmentState === 'NEEDS_REVIEW').length,
  };
}

export interface StatusInput {
  summary: TimetableSummary;
  /** The state of the "Mentor approves the timetable" checklist item, as saved. */
  approvalItem: string | null;
  stageStatus: string | null;
}

/**
 * The overall status, from what is saved. A problem found now always wins, even over an earlier approval: the timetable
 * needs to be looked at again.
 */
export function timetableStatus({ summary, approvalItem, stageStatus }: StatusInput): TimetableStatus {
  if (summary.unresolvedConflicts > 0 || summary.tutorIssues > 0) return 'CONFLICT_DETECTED';
  if (summary.totalSubjects === 0 || summary.incompleteSubjects > 0 || summary.subjectsWithoutTutor > 0) return 'DRAFT';
  if (approvalItem === 'VERIFIED') return 'APPROVED';
  if (stageStatus === 'PENDING_REVIEW') return 'PENDING_MENTOR_APPROVAL';
  return 'READY_FOR_REVIEW';
}

export const describeEventTime = (e: Pick<TimetableEvent, 'startMinute' | 'endMinute'>) => formatRange(e.startMinute, e.endMinute);
export const dayName = (n: DayNumber) => DAY_NAMES[n];
