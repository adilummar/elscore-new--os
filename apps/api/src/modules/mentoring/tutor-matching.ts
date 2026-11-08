/**
 * Tutor matching for a subject schedule. Pure rules: no database, no framework. The API runs this on the server for
 * every list of candidates and again, inside the transaction, before an assignment is saved, so the page can never
 * assign a tutor the rules would refuse.
 *
 * A subject schedule becomes a list of recurring sessions (day, weeks, start, end). Each session of each tutor is then
 * one of four things:
 *   AVAILABLE        the tutor works then and nothing else is booked
 *   OCCUPIED         the tutor works then, but the time is already booked
 *   NOT_WORKING_DAY  the tutor has no working hours on that weekday
 *   NOT_CONFIGURED   the tutor works that day, but the time is outside the hours they have set
 * A tutor can be assigned only when every session is AVAILABLE. Adding working hours never changes a booking.
 */
import { AvailabilityWindow, DAY_NAMES, DayNumber, covers, describeAvailability, formatRange, mergedWindowsFor } from '../tutor/tutor-availability';

import {
  Frequency,
  Occurrence,
  SubjectSchedule,
  Weekday,
  sessionLabel,
  timeToMinutes,
  weeksCovered,
} from './subject-schedule';

export const WEEKDAY_NUMBER: Readonly<Record<Weekday, DayNumber>> = { Sunday: 0, Monday: 1, Tuesday: 2, Wednesday: 3, Thursday: 4, Friday: 5, Saturday: 6 };

/** How far ahead single dated bookings (demos, scheduled classes) are looked at when checking a recurring schedule. */
export const DATED_BOOKING_HORIZON_DAYS = 28;

export interface RequiredSession {
  /** Stable key within one subject: "<week or 0>:<day>". */
  key: string;
  label: string;
  day: Weekday;
  dayNumber: DayNumber;
  frequency: Frequency;
  /** Which of the four weeks of a month the session falls in. */
  weeks: number[];
  week?: 1 | 2;
  occurrences?: Occurrence[];
  /** Minutes from midnight. */
  start: number;
  end: number;
}

export type RequiredResult = { ok: true; sessions: RequiredSession[] } | { ok: false; message: string };

/** The recurring sessions a tutor must cover. Every class needs a start time, because availability is a time range. */
export function requiredSessions(subject: Pick<SubjectSchedule, 'frequency' | 'sessions'>): RequiredResult {
  const missing = subject.sessions.filter((s) => !s.start || !s.end).map((s) => sessionLabel(s, subject.frequency));
  if (subject.sessions.length === 0) return { ok: false, message: 'Choose the days and save the schedule first.' };
  if (missing.length > 0) {
    return { ok: false, message: `Set a start time for every class to check tutor availability. Missing for: ${missing.join(', ')}.` };
  }
  return {
    ok: true,
    sessions: subject.sessions.map((s) => {
      const start = timeToMinutes(s.start as string);
      const end = timeToMinutes(s.end as string);
      return {
        key: `${s.week ?? 0}:${s.day}`,
        label: `${sessionLabel(s, subject.frequency)}, ${formatRange(start, end)}`,
        day: s.day,
        dayNumber: WEEKDAY_NUMBER[s.day],
        frequency: subject.frequency,
        weeks: weeksCovered(s, subject.frequency),
        week: s.week,
        occurrences: s.occurrences,
        start,
        end,
      };
    }),
  };
}

export type BusySource = 'ANOTHER_STUDENT' | 'THIS_STUDENT' | 'BOOKED_CLASS';

export interface BusyBlock {
  dayNumber: DayNumber;
  start: number;
  end: number;
  source: BusySource;
  weeks: number[];
  /** A single booking on one date rather than a repeating class. */
  dated?: boolean;
}

/** Two sessions can fall on the same date only when their weeks share a week of the month. */
export function overlaps(session: RequiredSession, block: BusyBlock): boolean {
  if (session.dayNumber !== block.dayNumber) return false;
  if (!(session.start < block.end && block.start < session.end)) return false;
  // A single dated booking blocks a weekly or bi-weekly class on that weekday (its week cannot be told without start
  // dates, so it counts), and blocks a monthly class only when it falls in one of the class's weeks.
  if (block.dated && session.frequency !== 'MONTHLY') return true;
  return session.weeks.some((w) => block.weeks.includes(w));
}

/** A one-off booking (a demo or a scheduled class) as a busy block in the operating time zone. Null when it is not usable. */
export function busyFromDatedBooking(startsAt: Date, endsAt: Date, timeZone: string, source: BusySource = 'BOOKED_CLASS'): BusyBlock | null {
  if (!(startsAt instanceof Date) || !(endsAt instanceof Date) || Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime()) || endsAt <= startsAt) return null;
  const parts = (d: Date) => {
    const f = new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'long', day: 'numeric', hour: 'numeric', minute: 'numeric', hourCycle: 'h23' }).formatToParts(d);
    const get = (t: string) => f.find((p) => p.type === t)?.value ?? '';
    return { weekday: get('weekday') as Weekday, day: Number(get('day')), minutes: Number(get('hour')) * 60 + Number(get('minute')) };
  };
  const a = parts(startsAt);
  const b = parts(endsAt);
  if (!(a.weekday in WEEKDAY_NUMBER)) return null;
  const sameDay = a.day === b.day;
  return {
    dayNumber: WEEKDAY_NUMBER[a.weekday],
    start: a.minutes,
    end: sameDay ? b.minutes : 24 * 60,
    source,
    weeks: [Math.min(4, Math.ceil(a.day / 7))],
    dated: true,
  };
}

export type SessionStatus = 'AVAILABLE' | 'OCCUPIED' | 'NOT_WORKING_DAY' | 'NOT_CONFIGURED';

export interface SessionCheck {
  key: string;
  label: string;
  /** Where the session falls, so a missing working time can be added exactly. */
  dayNumber: DayNumber;
  startMinute: number;
  endMinute: number;
  status: SessionStatus;
  /** Why, in words that are safe to show: it never names another student. */
  reason: string;
}

export const SESSION_STATUS_LABELS: Readonly<Record<SessionStatus, string>> = {
  AVAILABLE: 'Available',
  OCCUPIED: 'Occupied',
  NOT_WORKING_DAY: 'Not working this day',
  NOT_CONFIGURED: 'Availability not configured',
};

export function checkSession(session: RequiredSession, windows: readonly AvailabilityWindow[], busy: readonly BusyBlock[]): SessionCheck {
  const base = { key: session.key, label: session.label, dayNumber: session.dayNumber, startMinute: session.start, endMinute: session.end };
  const name = DAY_NAMES[session.dayNumber];
  if (windows.length === 0) return { ...base, status: 'NOT_CONFIGURED', reason: 'No weekly availability has been set for this tutor.' };
  const dayWindows = mergedWindowsFor(windows, session.dayNumber);
  if (dayWindows.length === 0) return { ...base, status: 'NOT_WORKING_DAY', reason: `Does not work on ${name}s.` };
  if (!covers(windows, session.dayNumber, session.start, session.end)) {
    const working = dayWindows.map((w) => formatRange(w.start, w.end)).join(' and ');
    return { ...base, status: 'NOT_CONFIGURED', reason: `${name} availability does not include ${formatRange(session.start, session.end)}. Working on ${name}: ${working}.` };
  }
  const clash = busy.find((b) => overlaps(session, b));
  if (clash) {
    return {
      ...base,
      status: 'OCCUPIED',
      reason: clash.source === 'THIS_STUDENT' ? 'Already assigned to another subject of this student at this time.' : 'Already booked during this time.',
    };
  }
  return { ...base, status: 'AVAILABLE', reason: 'Available.' };
}

export interface TutorFacts {
  tutorProfileId: string;
  name: string;
  photoUrl: string | null;
  /** The tutor is active and may take new assignments. */
  active: boolean;
  subjectIds: readonly string[];
  gradeIds: readonly string[];
  windows: readonly AvailabilityWindow[];
}

export type Verdict = 'FULL' | 'PARTIAL' | 'NONE' | 'NOT_ELIGIBLE';

export interface TutorMatch {
  tutorProfileId: string;
  verdict: Verdict;
  availableCount: number;
  total: number;
  sessions: SessionCheck[];
  /** Set when the tutor cannot be assigned for a reason other than the timetable. */
  ineligible: string | null;
  /** True only when the tutor is eligible and every session is available. */
  canAssign: boolean;
}

export interface MatchTarget {
  subjectId: string;
  subjectName: string;
  gradeId: string;
  gradeName: string;
}

export function evaluateTutor(required: readonly RequiredSession[], tutor: TutorFacts, busy: readonly BusyBlock[], target: MatchTarget): TutorMatch {
  const sessions = required.map((s) => checkSession(s, tutor.windows, busy));
  const availableCount = sessions.filter((s) => s.status === 'AVAILABLE').length;
  const total = sessions.length;

  let ineligible: string | null = null;
  if (!tutor.active) ineligible = 'Not active for new assignments.';
  else if (!tutor.subjectIds.includes(target.subjectId)) ineligible = `Does not teach ${target.subjectName}.`;
  else if (!tutor.gradeIds.includes(target.gradeId)) ineligible = `${target.gradeName} is not one of this tutor's levels.`;

  const verdict: Verdict = ineligible ? 'NOT_ELIGIBLE' : total > 0 && availableCount === total ? 'FULL' : availableCount > 0 ? 'PARTIAL' : 'NONE';
  return { tutorProfileId: tutor.tutorProfileId, verdict, availableCount, total, sessions, ineligible, canAssign: verdict === 'FULL' };
}

const ORDER: Readonly<Record<Verdict, number>> = { FULL: 0, PARTIAL: 1, NONE: 2, NOT_ELIGIBLE: 3 };

/** Fully available tutors first, then partial (most sessions first), then none, then those who cannot be assigned. */
export function rankMatches<T extends { match: TutorMatch; name: string }>(items: readonly T[]): T[] {
  return [...items].sort(
    (a, b) =>
      ORDER[a.match.verdict] - ORDER[b.match.verdict] ||
      b.match.availableCount - a.match.availableCount ||
      a.name.localeCompare(b.name),
  );
}

/** One line for the card: "Fully available", "2 of 4 sessions available" and so on. */
export function describeMatch(match: TutorMatch): string {
  if (match.verdict === 'NOT_ELIGIBLE') return match.ineligible ?? 'Not eligible';
  if (match.verdict === 'FULL') return `Fully available, ${match.total} of ${match.total} sessions`;
  if (match.verdict === 'PARTIAL') return `Partial availability, ${match.availableCount} of ${match.total} sessions available`;
  return `Not available for any of the ${match.total} sessions`;
}

/** The readable list of a tutor's working hours, for the card. */
export function describeHours(windows: readonly AvailabilityWindow[]): string {
  return windows.length ? describeAvailability(windows) : 'No working hours set';
}

/** The rows stored for an assignment: one per session, so a tutor's bookings can be read back across students. */
export interface StoredSession {
  dayNumber: DayNumber;
  frequency: Frequency;
  week: 1 | 2 | null;
  occurrences: Occurrence[];
  startMinute: number;
  endMinute: number;
}

export function toStoredSessions(required: readonly RequiredSession[]): StoredSession[] {
  return required.map((s) => ({ dayNumber: s.dayNumber, frequency: s.frequency, week: s.week ?? null, occurrences: s.occurrences ?? [], startMinute: s.start, endMinute: s.end }));
}

/** A stored session read back as a busy block for another assignment of the same tutor. */
export function busyFromStored(row: StoredSession, source: BusySource): BusyBlock {
  const weeks = weeksCovered({ day: 'Monday', durationMinutes: 0, week: row.week ?? undefined, occurrences: row.occurrences }, row.frequency);
  return { dayNumber: row.dayNumber, start: row.startMinute, end: row.endMinute, source, weeks };
}
