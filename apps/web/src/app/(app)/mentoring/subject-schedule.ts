/**
 * Subject-wise preferred schedule for the Meeting with Parents.
 *
 * Pure rules with no imports, so the API (the authority) and the page (instant feedback) run exactly the same code.
 * `apps/web/src/app/(app)/mentoring/subject-schedule.ts` is a byte-for-byte copy, and a test fails if they differ.
 *
 * A schedule is one plan per subject. Each subject has its own frequency, its own total hours for that period and its
 * own sessions. Hours are always kept in whole minutes so 1.5 hours is 90, never 1.4999.
 */

export const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'] as const;
export type Weekday = (typeof WEEKDAYS)[number];

export const FREQUENCIES = ['WEEKLY', 'BIWEEKLY', 'MONTHLY'] as const;
export type Frequency = (typeof FREQUENCIES)[number];

export const OCCURRENCES = ['EVERY', 'FIRST', 'SECOND', 'THIRD', 'FOURTH', 'LAST'] as const;
export type Occurrence = (typeof OCCURRENCES)[number];

export type Distribution = 'EQUAL' | 'CUSTOM';

export interface ScheduleSession {
  day: Weekday;
  /** Bi-weekly only: which week of the two-week cycle. */
  week?: 1 | 2;
  /** Monthly only: which of that weekday's dates in the month. "EVERY" is every week of the month. */
  occurrences?: Occurrence[];
  durationMinutes: number;
  /** HH:MM, 24-hour. Optional; never invented. */
  start?: string;
  /** HH:MM. Always start plus the duration when a start time is set. */
  end?: string;
}

export interface SubjectSchedule {
  subjectId: string;
  subjectName: string;
  /** The required band or level: an entry of the existing grade master. */
  gradeId: string;
  gradeName: string;
  frequency: Frequency;
  /** Total teaching minutes for one period of the frequency: a week, a two-week cycle or a month. */
  totalMinutes: number;
  distribution: Distribution;
  sessions: ScheduleSession[];
  /**
   * The first date the classes run (YYYY-MM-DD). Optional. With it, a tutor is matched against exact dates: Week 1 of a
   * bi-weekly schedule is the week this date falls in, and "the first Monday" is a real date. Without it, tutors are
   * matched by week pattern only.
   */
  startDate?: string;
}

export interface ScheduleValue {
  version: 2;
  subjects: SubjectSchedule[];
}

export interface Reference {
  id: string;
  name: string;
}

export interface ScheduleReferences {
  subjects: readonly Reference[];
  grades: readonly Reference[];
}

/** A real calendar date written YYYY-MM-DD. */
export function isIsoDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

/** The department default for one class. A suggestion for planning, never a limit. */
export const DEFAULT_SESSION_MINUTES = 60;
export const MINUTE_STEP = 5;
export const MIN_SESSION_MINUTES = 15;
export const MAX_SESSION_MINUTES = 480;
export const MAX_TOTAL_MINUTES = 250 * 60;
export const MAX_SUBJECTS = 15;
/** A month is planned as four weeks, so "every Tuesday" is four sessions. */
export const WEEKS_IN_MONTH = 4;

export const FREQUENCY_LABELS: Record<Frequency, string> = { WEEKLY: 'Weekly', BIWEEKLY: 'Bi-weekly', MONTHLY: 'Monthly' };
/** The period the total hours belong to. Shown beside every total so hours are never read as the wrong period. */
export const PERIOD_LABELS: Record<Frequency, string> = { WEEKLY: 'per week', BIWEEKLY: 'per two-week cycle', MONTHLY: 'per month' };
export const OCCURRENCE_LABELS: Record<Occurrence, string> = { EVERY: 'Every', FIRST: 'First', SECOND: 'Second', THIRD: 'Third', FOURTH: 'Fourth', LAST: 'Last' };

// ---------------------------------------------------------------------------------------------------------------------
// Time and duration helpers
// ---------------------------------------------------------------------------------------------------------------------

const TIME = /^([01]\d|2[0-3]):([0-5]\d)$/;

export const isTime = (value: unknown): value is string => typeof value === 'string' && TIME.test(value);

export function timeToMinutes(value: string): number {
  const [h, m] = value.split(':').map(Number);
  return h * 60 + m;
}

export function minutesToTime(total: number): string {
  const h = Math.floor(total / 60);
  const m = total % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** The end time for a start and a length, or null when the class would run past midnight. */
export function endTimeFor(start: string, durationMinutes: number): string | null {
  if (!isTime(start) || !Number.isFinite(durationMinutes) || durationMinutes <= 0) return null;
  const end = timeToMinutes(start) + durationMinutes;
  return end > 24 * 60 - 1 ? null : minutesToTime(end);
}

/** "1 hour", "1 hour 30 minutes", "45 minutes". */
export function formatMinutes(minutes: number): string {
  const total = Math.max(0, Math.round(minutes));
  const h = Math.floor(total / 60);
  const m = total % 60;
  const hours = h === 1 ? '1 hour' : `${h} hours`;
  if (h === 0) return `${m} minute${m === 1 ? '' : 's'}`;
  return m === 0 ? hours : `${hours} ${m} minute${m === 1 ? '' : 's'}`;
}

/** Hours as a plain number for inputs: 90 becomes "1.5". Null when the text is not a usable amount of hours. */
export function hoursToMinutes(text: string): number | null {
  const cleaned = text.trim();
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  const minutes = Math.round(parseFloat(cleaned) * 60);
  return Number.isFinite(minutes) ? minutes : null;
}

export function minutesToHoursText(minutes: number): string {
  if (!minutes) return '';
  const hours = minutes / 60;
  return Number.isInteger(hours) ? String(hours) : String(Math.round(hours * 100) / 100);
}

// ---------------------------------------------------------------------------------------------------------------------
// Counting sessions and hours
// ---------------------------------------------------------------------------------------------------------------------

/** How many classes one session entry stands for in a period. Weekly and bi-weekly entries are one class each. */
export function classesIn(session: ScheduleSession, frequency: Frequency): number {
  if (frequency !== 'MONTHLY') return 1;
  const occurrences = session.occurrences ?? [];
  if (occurrences.includes('EVERY')) return WEEKS_IN_MONTH;
  return new Set(occurrences).size;
}

export function totalClasses(subject: Pick<SubjectSchedule, 'frequency' | 'sessions'>): number {
  return subject.sessions.reduce((sum, s) => sum + classesIn(s, subject.frequency), 0);
}

/** The minutes the sessions add up to for one period. */
export function scheduledMinutes(subject: Pick<SubjectSchedule, 'frequency' | 'sessions'>): number {
  return subject.sessions.reduce((sum, s) => sum + s.durationMinutes * classesIn(s, subject.frequency), 0);
}

export interface EqualSplit {
  durations: number[];
  /** Minutes that could not be shared out evenly. Zero means the split is exact. */
  leftover: number;
}

/**
 * Shares the total across the classes of a period as evenly as the step allows. Every class gets the same length when
 * the total divides evenly; otherwise a few get one extra step, so lengths differ by at most one step.
 */
export function distributeEqually(totalMinutes: number, classCounts: readonly number[]): EqualSplit {
  const slots = classCounts.reduce((a, b) => a + b, 0);
  if (slots === 0) return { durations: [], leftover: totalMinutes };
  const base = Math.floor(totalMinutes / slots / MINUTE_STEP) * MINUTE_STEP;
  const durations = classCounts.map(() => base);
  let leftover = totalMinutes - base * slots;
  classCounts.forEach((count, i) => {
    if (leftover >= count * MINUTE_STEP) {
      durations[i] += MINUTE_STEP;
      leftover -= count * MINUTE_STEP;
    }
  });
  return { durations, leftover };
}

/** The sessions with equal lengths and matching end times. A subject with a leftover is not exactly equal. */
export function withEqualDistribution(subject: SubjectSchedule): { subject: SubjectSchedule; leftover: number } {
  const { durations, leftover } = distributeEqually(subject.totalMinutes, subject.sessions.map((s) => classesIn(s, subject.frequency)));
  const sessions = subject.sessions.map((s, i) => withDuration(s, durations[i]));
  return { subject: { ...subject, sessions }, leftover };
}

export function withDuration(session: ScheduleSession, durationMinutes: number): ScheduleSession {
  const next: ScheduleSession = { ...session, durationMinutes };
  if (session.start) {
    const end = endTimeFor(session.start, durationMinutes);
    if (end) next.end = end;
    else delete next.end;
  }
  return next;
}

// ---------------------------------------------------------------------------------------------------------------------
// Labels
// ---------------------------------------------------------------------------------------------------------------------

const dayIndex = (day: Weekday) => WEEKDAYS.indexOf(day);

export function sortSessions(sessions: readonly ScheduleSession[]): ScheduleSession[] {
  return [...sessions].sort((a, b) => (a.week ?? 0) - (b.week ?? 0) || dayIndex(a.day) - dayIndex(b.day));
}

/** "Monday", "Week 2 Friday", "First and third Monday", "Every Tuesday". */
export function sessionLabel(session: ScheduleSession, frequency: Frequency): string {
  if (frequency === 'BIWEEKLY') return `Week ${session.week ?? 1} ${session.day}`;
  if (frequency === 'MONTHLY') {
    const picks = session.occurrences ?? [];
    if (picks.includes('EVERY')) return `Every ${session.day}`;
    const ordered = OCCURRENCES.filter((o) => picks.includes(o)).map((o) => OCCURRENCE_LABELS[o].toLowerCase());
    if (ordered.length === 0) return session.day;
    const text = ordered.length === 1 ? ordered[0] : `${ordered.slice(0, -1).join(', ')} and ${ordered[ordered.length - 1]}`;
    return `${text.charAt(0).toUpperCase()}${text.slice(1)} ${session.day}`;
  }
  return session.day;
}

/** One line per subject for read-only views and the history: "English, Grade 8, weekly, 4 hours per week: Monday 1 hour, ...". */
export function summariseSubject(subject: SubjectSchedule): string {
  const head = [subject.subjectName, subject.gradeName, FREQUENCY_LABELS[subject.frequency], `${formatMinutes(subject.totalMinutes)} ${PERIOD_LABELS[subject.frequency]}`, subject.startDate ? `from ${subject.startDate}` : ''].filter(Boolean).join(' · ');
  const parts = sortSessions(subject.sessions).map((s) => {
    const time = s.start ? ` (${s.start}${s.end ? ` to ${s.end}` : ''})` : '';
    const times = subject.frequency === 'MONTHLY' && classesIn(s, 'MONTHLY') > 1 ? ` x ${classesIn(s, 'MONTHLY')}` : '';
    return `${sessionLabel(s, subject.frequency)} ${formatMinutes(s.durationMinutes)}${times}${time}`;
  });
  return parts.length ? `${head}\n${parts.join(', ')}` : head;
}

export function summariseSchedule(value: ScheduleValue): string {
  return value.subjects.map(summariseSubject).join('\n');
}

// ---------------------------------------------------------------------------------------------------------------------
// Plan totals and conflicts
// ---------------------------------------------------------------------------------------------------------------------

export interface PlanTotals {
  subjects: number;
  /** Planned minutes for each frequency, in that frequency's own period. */
  byFrequency: Record<Frequency, { subjects: number; minutes: number }>;
  /** Everything expressed per month, counting a month as four weeks. For a rough overall figure only. */
  monthlyEquivalentMinutes: number;
}

export function planTotals(subjects: readonly SubjectSchedule[]): PlanTotals {
  const byFrequency: PlanTotals['byFrequency'] = { WEEKLY: { subjects: 0, minutes: 0 }, BIWEEKLY: { subjects: 0, minutes: 0 }, MONTHLY: { subjects: 0, minutes: 0 } };
  for (const s of subjects) {
    byFrequency[s.frequency].subjects += 1;
    byFrequency[s.frequency].minutes += s.totalMinutes;
  }
  return {
    subjects: subjects.length,
    byFrequency,
    monthlyEquivalentMinutes: byFrequency.WEEKLY.minutes * WEEKS_IN_MONTH + byFrequency.BIWEEKLY.minutes * (WEEKS_IN_MONTH / 2) + byFrequency.MONTHLY.minutes,
  };
}

/** Which of the four weeks of a month this session falls in. Used to tell whether two sessions can meet on the same date. */
export function weeksCovered(session: ScheduleSession, frequency: Frequency): number[] {
  if (frequency === 'WEEKLY') return [1, 2, 3, 4];
  if (frequency === 'BIWEEKLY') return session.week === 2 ? [2, 4] : [1, 3];
  const picks = session.occurrences ?? [];
  if (picks.includes('EVERY')) return [1, 2, 3, 4];
  const weeks = new Set<number>();
  for (const p of picks) weeks.add(p === 'FIRST' ? 1 : p === 'SECOND' ? 2 : p === 'THIRD' ? 3 : 4);
  return [...weeks];
}

export interface ScheduleConflict {
  day: Weekday;
  first: { subjectName: string; label: string; start: string; end: string };
  second: { subjectName: string; label: string; start: string; end: string };
}

/** Sessions of different subjects that can fall on the same date and overlap in time. Only sessions with times can clash. */
export function findConflicts(subjects: readonly SubjectSchedule[]): ScheduleConflict[] {
  const out: ScheduleConflict[] = [];
  for (let i = 0; i < subjects.length; i++) {
    for (let j = i + 1; j < subjects.length; j++) {
      for (const a of subjects[i].sessions) {
        for (const b of subjects[j].sessions) {
          if (a.day !== b.day || !a.start || !b.start || !a.end || !b.end) continue;
          const sameDate = weeksCovered(a, subjects[i].frequency).some((w) => weeksCovered(b, subjects[j].frequency).includes(w));
          if (!sameDate) continue;
          if (timeToMinutes(a.start) < timeToMinutes(b.end) && timeToMinutes(b.start) < timeToMinutes(a.end)) {
            out.push({
              day: a.day,
              first: { subjectName: subjects[i].subjectName, label: sessionLabel(a, subjects[i].frequency), start: a.start, end: a.end },
              second: { subjectName: subjects[j].subjectName, label: sessionLabel(b, subjects[j].frequency), start: b.start, end: b.end },
            });
          }
        }
      }
    }
  }
  return out;
}

export function conflictMessage(c: ScheduleConflict): string {
  return `${c.first.subjectName} (${c.first.label}, ${c.first.start} to ${c.first.end}) overlaps ${c.second.subjectName} (${c.second.label}, ${c.second.start} to ${c.second.end})`;
}

// ---------------------------------------------------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------------------------------------------------

/** What is wrong with the amount of time, as a sentence, or null when the sessions add up to the total. */
export function hoursMismatch(subject: Pick<SubjectSchedule, 'frequency' | 'sessions' | 'totalMinutes'>): string | null {
  const planned = scheduledMinutes(subject);
  if (planned === subject.totalMinutes) return null;
  const period = PERIOD_LABELS[subject.frequency];
  return planned < subject.totalMinutes
    ? `The sessions add up to ${formatMinutes(planned)} ${period}, but ${formatMinutes(subject.totalMinutes)} are required. ${formatMinutes(subject.totalMinutes - planned)} remaining.`
    : `The sessions add up to ${formatMinutes(planned)} ${period}, but only ${formatMinutes(subject.totalMinutes)} are required. ${formatMinutes(planned - subject.totalMinutes)} over.`;
}

/**
 * The first thing that stops this subject from being saved, or null. `refs` is optional so the page can check an
 * unfinished card without the master lists; the API always passes them.
 */
export function subjectProblem(subject: SubjectSchedule, refs?: ScheduleReferences): string | null {
  if (!subject.subjectId) return 'Choose a subject.';
  if (refs && !refs.subjects.some((s) => s.id === subject.subjectId)) return 'This subject is not in the subject list.';
  if (!subject.gradeId) return 'Choose the required level.';
  if (refs && !refs.grades.some((g) => g.id === subject.gradeId)) return 'This level is not in the level list.';
  if (!FREQUENCIES.includes(subject.frequency)) return 'Choose how often the classes happen.';
  if (subject.startDate !== undefined && !isIsoDate(subject.startDate)) return 'The start date must be a real date.';
  const period = PERIOD_LABELS[subject.frequency];
  if (!Number.isInteger(subject.totalMinutes) || subject.totalMinutes <= 0) return `Enter the total hours required ${period}.`;
  if (subject.totalMinutes % MINUTE_STEP !== 0) return `The total hours must be in steps of ${MINUTE_STEP} minutes.`;
  if (subject.totalMinutes > MAX_TOTAL_MINUTES) return `The total hours cannot be more than ${MAX_TOTAL_MINUTES / 60} ${period}.`;
  if (subject.sessions.length === 0) return subject.frequency === 'MONTHLY' ? 'Choose at least one day.' : 'Choose at least one preferred day.';

  const seen = new Set<string>();
  for (const s of subject.sessions) {
    if (!WEEKDAYS.includes(s.day)) return 'Choose a valid day.';
    const label = sessionLabel(s, subject.frequency);
    const key = `${s.week ?? 0}:${s.day}`;
    if (seen.has(key)) return `${label} is listed twice.`;
    seen.add(key);
    if (subject.frequency === 'BIWEEKLY' && s.week !== 1 && s.week !== 2) return `${s.day}: choose Week 1 or Week 2.`;
    if (subject.frequency !== 'BIWEEKLY' && s.week !== undefined) return `${s.day}: weeks only apply to bi-weekly schedules.`;
    if (subject.frequency === 'MONTHLY') {
      const picks = s.occurrences ?? [];
      if (picks.length === 0) return `${s.day}: choose which ${s.day}s of the month.`;
      if (picks.some((p) => !OCCURRENCES.includes(p))) return `${s.day}: choose a valid pattern.`;
      if (new Set(picks).size !== picks.length) return `${s.day}: a pattern is listed twice.`;
      if (picks.includes('EVERY') && picks.length > 1) return `${s.day}: "Every" cannot be combined with another pattern.`;
    } else if (s.occurrences !== undefined) return `${s.day}: monthly patterns only apply to monthly schedules.`;

    if (!Number.isInteger(s.durationMinutes) || s.durationMinutes <= 0) return `${label}: the class length must be more than zero.`;
    if (s.durationMinutes % MINUTE_STEP !== 0) return `${label}: the class length must be in steps of ${MINUTE_STEP} minutes.`;
    if (s.durationMinutes < MIN_SESSION_MINUTES) return `${label}: a class must be at least ${MIN_SESSION_MINUTES} minutes. Use fewer days or more hours.`;
    if (s.durationMinutes > MAX_SESSION_MINUTES) return `${label}: a class cannot be longer than ${MAX_SESSION_MINUTES / 60} hours.`;
    if (s.end && !s.start) return `${label}: add a start time or clear the end time.`;
    if (s.start) {
      if (!isTime(s.start)) return `${label}: the start time must be a time such as 16:30.`;
      const expected = endTimeFor(s.start, s.durationMinutes);
      if (!expected) return `${label}: the class would run past midnight. Choose an earlier start time.`;
      if (s.end !== undefined) {
        if (!isTime(s.end)) return `${label}: the end time must be a time such as 17:30.`;
        if (s.end <= s.start) return `${label}: the end time must be after the start time.`;
        if (s.end !== expected) return `${label}: the end time must match the class length. Change the length to change the end time.`;
      }
    }
  }

  const mismatch = hoursMismatch(subject);
  if (mismatch) return mismatch;

  if (subject.distribution === 'EQUAL') {
    const split = distributeEqually(subject.totalMinutes, subject.sessions.map((s) => classesIn(s, subject.frequency)));
    const equal = split.leftover === 0 && subject.sessions.every((s, i) => s.durationMinutes === split.durations[i]);
    if (!equal) return 'The class lengths are not an equal split. Use custom lengths or restore the equal split.';
  }
  return null;
}

/** A readable name for a subject card in messages, for example "English" or "Subject 2". */
function cardName(subject: Partial<SubjectSchedule>, index: number): string {
  return subject.subjectName?.trim() || `Subject ${index + 1}`;
}

export function scheduleProblem(value: ScheduleValue, refs?: ScheduleReferences): string | null {
  if (value.subjects.length === 0) return 'Add at least one subject.';
  if (value.subjects.length > MAX_SUBJECTS) return `No more than ${MAX_SUBJECTS} subjects are allowed.`;
  const ids = new Set<string>();
  for (let i = 0; i < value.subjects.length; i++) {
    const subject = value.subjects[i];
    if (subject.subjectId && ids.has(subject.subjectId)) return `${cardName(subject, i)} is already in this plan. Edit that card instead of adding it again.`;
    ids.add(subject.subjectId);
    const problem = subjectProblem(subject, refs);
    if (problem) return `${cardName(subject, i)}: ${problem}`;
  }
  return null;
}

// ---------------------------------------------------------------------------------------------------------------------
// Reading an unknown value (the API request, or a stored value)
// ---------------------------------------------------------------------------------------------------------------------

export type ParseResult = { ok: true; value: ScheduleValue } | { ok: false; message: string };

const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

export function isScheduleValue(value: unknown): value is ScheduleValue {
  return isRecord(value) && value.version === 2 && Array.isArray(value.subjects);
}

function onlyKeys(input: Record<string, unknown>, allowed: readonly string[]): boolean {
  return Object.keys(input).every((k) => allowed.includes(k));
}

/**
 * Turns an unknown value into a clean schedule or says what is wrong. Names come from the master lists, never from the
 * request, so a stored name always matches its ID. Sessions are put in a fixed order so equal schedules compare equal.
 */
export function parseSchedule(raw: unknown, refs: ScheduleReferences): ParseResult {
  const fail = (message: string): ParseResult => ({ ok: false, message });
  if (!isRecord(raw) || raw.version !== 2 || !onlyKeys(raw, ['version', 'subjects'])) return fail('The schedule is not in the expected format. Reload the page and try again.');
  if (!Array.isArray(raw.subjects) || raw.subjects.length === 0) return fail('Add at least one subject.');
  if (raw.subjects.length > MAX_SUBJECTS) return fail(`No more than ${MAX_SUBJECTS} subjects are allowed.`);

  const subjects: SubjectSchedule[] = [];
  for (let i = 0; i < raw.subjects.length; i++) {
    const item = raw.subjects[i];
    const at = `Subject ${i + 1}`;
    if (!isRecord(item) || !onlyKeys(item, ['subjectId', 'subjectName', 'gradeId', 'gradeName', 'frequency', 'totalMinutes', 'distribution', 'sessions', 'startDate'])) return fail(`${at} is not in the expected format.`);
    const subjectRef = refs.subjects.find((s) => s.id === item.subjectId);
    if (!subjectRef) return fail(item.subjectId ? `${at}: choose a subject from the subject list.` : `${at}: Choose a subject.`);
    const gradeRef = refs.grades.find((g) => g.id === item.gradeId);
    if (!gradeRef) return fail(item.gradeId ? `${subjectRef.name}: choose the required level from the level list.` : `${subjectRef.name}: Choose the required level.`);
    if (!Array.isArray(item.sessions)) return fail(`${subjectRef.name}: the sessions are not in the expected format.`);

    const sessions: ScheduleSession[] = [];
    for (const rawSession of item.sessions) {
      if (!isRecord(rawSession) || !onlyKeys(rawSession, ['day', 'week', 'occurrences', 'durationMinutes', 'start', 'end'])) return fail(`${subjectRef.name}: a session is not in the expected format.`);
      const session: ScheduleSession = { day: rawSession.day as Weekday, durationMinutes: rawSession.durationMinutes as number };
      if (rawSession.week !== undefined && rawSession.week !== null) session.week = rawSession.week as 1 | 2;
      if (rawSession.occurrences !== undefined && rawSession.occurrences !== null) {
        if (!Array.isArray(rawSession.occurrences)) return fail(`${subjectRef.name}: a monthly pattern is not in the expected format.`);
        session.occurrences = rawSession.occurrences as Occurrence[];
      }
      if (rawSession.start !== undefined && rawSession.start !== null && rawSession.start !== '') session.start = rawSession.start as string;
      if (rawSession.end !== undefined && rawSession.end !== null && rawSession.end !== '') session.end = rawSession.end as string;
      sessions.push(session);
    }

    const subject: SubjectSchedule = {
      subjectId: subjectRef.id,
      subjectName: subjectRef.name,
      gradeId: gradeRef.id,
      gradeName: gradeRef.name,
      frequency: item.frequency as Frequency,
      totalMinutes: item.totalMinutes as number,
      distribution: (item.distribution === 'CUSTOM' ? 'CUSTOM' : item.distribution === 'EQUAL' ? 'EQUAL' : 'invalid') as Distribution,
      sessions: sortSessions(sessions),
    };
    // An empty start date means "not set": it is left out, never stored as an empty string.
    if (item.startDate !== undefined && item.startDate !== null && item.startDate !== '') {
      if (!isIsoDate(item.startDate)) return fail(`${subjectRef.name}: the start date must be a real date.`);
      subject.startDate = item.startDate;
    }
    if ((subject.distribution as string) === 'invalid') return fail(`${subjectRef.name}: choose equal or custom class lengths.`);
    subjects.push(subject);
  }

  // A start time with no end gets the end that matches its length, so a stored session always carries both or neither.
  const completed = subjects.map((s) => ({
    ...s,
    sessions: s.sessions.map((session) => (session.start && !session.end && isTime(session.start) ? { ...session, end: endTimeFor(session.start, session.durationMinutes) ?? undefined } : session)),
  }));
  const value: ScheduleValue = { version: 2, subjects: completed.map((s) => ({ ...s, sessions: s.sessions.map(dropUndefined) })) };
  const problem = scheduleProblem(value, refs);
  return problem ? fail(problem) : { ok: true, value };
}

function dropUndefined(session: ScheduleSession): ScheduleSession {
  const out = { ...session };
  (Object.keys(out) as Array<keyof ScheduleSession>).forEach((k) => {
    if (out[k] === undefined) delete out[k];
  });
  return out;
}

// ---------------------------------------------------------------------------------------------------------------------
// Edits the page makes to a draft. Pure, so the rules (equal split follows days and hours) can be tested.
// ---------------------------------------------------------------------------------------------------------------------

export function newSubject(frequency: Frequency = 'WEEKLY'): SubjectSchedule {
  return { subjectId: '', subjectName: '', gradeId: '', gradeName: '', frequency, totalMinutes: 0, distribution: 'EQUAL', sessions: [] };
}

/** Keeps equal lengths equal after the days or the total change. Custom lengths are left as the Mentor set them. */
export function rebalance(subject: SubjectSchedule): SubjectSchedule {
  const sessions = sortSessions(subject.sessions);
  const sorted = { ...subject, sessions };
  if (subject.distribution !== 'EQUAL') return sorted;
  if (subject.totalMinutes <= 0 || sessions.length === 0) return sorted;
  const { subject: split, leftover } = withEqualDistribution(sorted);
  // A total that cannot be shared evenly becomes custom, with the remainder shown, rather than failing silently.
  return leftover === 0 ? split : { ...split, distribution: 'CUSTOM' };
}

export function setTotalMinutes(subject: SubjectSchedule, totalMinutes: number): SubjectSchedule {
  return rebalance({ ...subject, totalMinutes });
}

export function setFrequency(subject: SubjectSchedule, frequency: Frequency): SubjectSchedule {
  if (frequency === subject.frequency) return subject;
  const sessions: ScheduleSession[] = subject.sessions.map((s) => {
    const base: ScheduleSession = { day: s.day, durationMinutes: s.durationMinutes };
    if (s.start) base.start = s.start;
    if (frequency === 'BIWEEKLY') return { ...base, week: 1 };
    if (frequency === 'MONTHLY') return { ...base, occurrences: ['EVERY'] };
    return base;
  });
  // The total is for a different period now, so lengths are shared out again from the total.
  return rebalance({ ...subject, frequency, distribution: 'EQUAL', sessions: sessions.map((s) => withDuration(s, s.durationMinutes)) });
}

/** Adds the day if it is not chosen, removes it if it is. `week` applies to bi-weekly schedules. */
export function toggleDay(subject: SubjectSchedule, day: Weekday, week?: 1 | 2): SubjectSchedule {
  const index = subject.sessions.findIndex((s) => s.day === day && (subject.frequency !== 'BIWEEKLY' || s.week === week));
  if (index >= 0) return rebalance({ ...subject, sessions: subject.sessions.filter((_, i) => i !== index) });
  const added: ScheduleSession = { day, durationMinutes: DEFAULT_SESSION_MINUTES };
  if (subject.frequency === 'BIWEEKLY') added.week = week ?? 1;
  if (subject.frequency === 'MONTHLY') added.occurrences = ['EVERY'];
  return rebalance({ ...subject, sessions: [...subject.sessions, added] });
}

export function setOccurrences(subject: SubjectSchedule, day: Weekday, occurrences: Occurrence[]): SubjectSchedule {
  const cleaned = occurrences.includes('EVERY') && occurrences.length > 1 ? occurrences.filter((o) => o !== 'EVERY') : occurrences;
  return rebalance({ ...subject, sessions: subject.sessions.map((s) => (s.day === day ? { ...s, occurrences: cleaned } : s)) });
}

/** A hand-set class length. The subject becomes custom, and the Mentor sees how far the total is from the target. */
export function setSessionDuration(subject: SubjectSchedule, index: number, durationMinutes: number): SubjectSchedule {
  return { ...subject, distribution: 'CUSTOM', sessions: subject.sessions.map((s, i) => (i === index ? withDuration(s, durationMinutes) : s)) };
}

export function setSessionStart(subject: SubjectSchedule, index: number, start: string): SubjectSchedule {
  return {
    ...subject,
    sessions: subject.sessions.map((s, i) => {
      if (i !== index) return s;
      const { start: _oldStart, end: _oldEnd, ...rest } = s;
      void _oldStart;
      void _oldEnd;
      if (!start) return rest;
      const end = isTime(start) ? endTimeFor(start, s.durationMinutes) : null;
      return end ? { ...rest, start, end } : { ...rest, start };
    }),
  };
}

/** Moving the end time changes the class length, so the subject becomes custom. */
export function setSessionEnd(subject: SubjectSchedule, index: number, end: string): SubjectSchedule {
  const session = subject.sessions[index];
  if (!session?.start || !isTime(end) || !isTime(session.start)) return subject;
  const minutes = timeToMinutes(end) - timeToMinutes(session.start);
  if (minutes <= 0) return { ...subject, sessions: subject.sessions.map((s, i) => (i === index ? { ...s, end } : s)) }; // left as typed so the check can explain it
  return { ...subject, distribution: 'CUSTOM', sessions: subject.sessions.map((s, i) => (i === index ? { ...s, durationMinutes: minutes, end } : s)) };
}

export function restoreEqualSplit(subject: SubjectSchedule): SubjectSchedule {
  return rebalance({ ...subject, distribution: 'EQUAL' });
}

/** How many equal classes of the department length the total needs, for a hint while no days are chosen. */
export function suggestedClasses(totalMinutes: number, sessionMinutes: number = DEFAULT_SESSION_MINUTES): number | null {
  if (totalMinutes <= 0 || sessionMinutes <= 0 || totalMinutes % sessionMinutes !== 0) return null;
  return totalMinutes / sessionMinutes;
}
