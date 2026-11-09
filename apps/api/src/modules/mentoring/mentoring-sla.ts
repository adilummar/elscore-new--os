/**
 * Response-time targets for Mentoring work. Pure rules, no database and no framework.
 *
 * The approved policy counts WORKING hours: a target of two hours runs only inside the staff working schedule, so work that
 * arrives at 17:30 is due at 10:30 the next working morning, not at 19:30. The schedule is the organisation's own (its start,
 * end and time zone), with Sunday as the weekly off day as elsewhere in the system. The policy can be switched to calendar
 * hours in the policy row without a code change.
 *
 * Complaint acknowledgement and full resolution are different clocks: the acknowledgement target stops at the first response
 * (measure FIRST_RESPONSE) and says nothing about when the complaint is resolved.
 */
export interface WorkingPolicy {
  /** Minutes from midnight in the organisation's time zone. */
  start: number;
  end: number;
  timeZone: string;
  /** Weekdays with no work, 0 = Sunday. */
  offDays: readonly number[];
}

/** Used only when no working schedule is saved. The values are the organisation's current schedule. */
export const DEFAULT_WORKING: WorkingPolicy = { start: 9 * 60, end: 18 * 60, timeZone: 'Asia/Kolkata', offDays: [0] };
export const DEFAULT_TARGET_MINUTES = 120;
export const DEFAULT_APPROACHING_PERCENT = 75;

export type SlaMode = 'WORKING_HOURS' | 'CALENDAR';
export type SlaMeasure = 'FIRST_RESPONSE' | 'COMPLETION';
export type SlaState = 'WITHIN_SLA' | 'APPROACHING' | 'BREACHED' | 'RESOLVED';

export interface SlaPolicyRules {
  key: string;
  label: string;
  targetMinutes: number;
  mode: SlaMode;
  measure: SlaMeasure;
  approachingPercent: number;
}

/** What each kind of work is measured by when its policy row has not been saved. All use the two-hour default. */
export const DEFAULT_POLICIES: Readonly<Record<string, SlaPolicyRules>> = {
  CLASS_UPDATE_REVIEW: { key: 'CLASS_UPDATE_REVIEW', label: 'Review a tutor class update', targetMinutes: DEFAULT_TARGET_MINUTES, mode: 'WORKING_HOURS', measure: 'COMPLETION', approachingPercent: DEFAULT_APPROACHING_PERCENT },
  RETURNED_UPDATE_ACTION: { key: 'RETURNED_UPDATE_ACTION', label: 'Act on a returned tutor update', targetMinutes: DEFAULT_TARGET_MINUTES, mode: 'WORKING_HOURS', measure: 'COMPLETION', approachingPercent: DEFAULT_APPROACHING_PERCENT },
  COMPLAINT_ACKNOWLEDGEMENT: { key: 'COMPLAINT_ACKNOWLEDGEMENT', label: 'Acknowledge a parent complaint', targetMinutes: DEFAULT_TARGET_MINUTES, mode: 'WORKING_HOURS', measure: 'FIRST_RESPONSE', approachingPercent: DEFAULT_APPROACHING_PERCENT },
};

/** "09:00" to 540. Returns null for anything that is not a clock time. */
export function clockMinutes(value: string): number | null {
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(value);
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

export function workingFrom(schedule: { startTime: string; endTime: string; timezone: string } | null | undefined): WorkingPolicy {
  if (!schedule) return DEFAULT_WORKING;
  const start = clockMinutes(schedule.startTime);
  const end = clockMinutes(schedule.endTime);
  if (start === null || end === null || end <= start) return DEFAULT_WORKING;
  return { start, end, timeZone: schedule.timezone || DEFAULT_WORKING.timeZone, offDays: DEFAULT_WORKING.offDays };
}

// ─── Time zones ──────────────────────────────────────────────────────────────────────────────────────────────────
const MINUTE = 60_000;
const DAY = 86_400_000;

function localOf(at: Date, timeZone: string): { date: string; minutes: number; weekday: number } {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23', weekday: 'short' }).formatToParts(at);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  const weekday = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(get('weekday'));
  return { date: `${get('year')}-${get('month')}-${get('day')}`, minutes: Number(get('hour')) * 60 + Number(get('minute')), weekday };
}

/** The moment at which the wall clock in `timeZone` reads `minutes` on `date`. */
function instantOf(date: string, minutes: number, timeZone: string): Date {
  const [y, mo, d] = date.split('-').map(Number);
  const asIfUtc = Date.UTC(y, mo - 1, d) + minutes * MINUTE;
  let guess = asIfUtc;
  for (let i = 0; i < 2; i++) {
    const l = localOf(new Date(guess), timeZone);
    const [ly, lmo, ld] = l.date.split('-').map(Number);
    const shown = Date.UTC(ly, lmo - 1, ld) + l.minutes * MINUTE;
    guess += asIfUtc - shown;
  }
  return new Date(guess);
}

const nextDate = (date: string) => new Date(Date.parse(`${date}T00:00:00Z`) + DAY).toISOString().slice(0, 10);
const isOff = (weekday: number, p: WorkingPolicy) => p.offDays.includes(weekday);

// ─── Counting working time ───────────────────────────────────────────────────────────────────────────────────────
/** The moment `minutes` of working time after `from`. Time outside the working schedule does not count. */
export function addWorkingMinutes(from: Date, minutes: number, p: WorkingPolicy): Date {
  let remaining = Math.max(0, Math.round(minutes));
  let { date, minutes: at, weekday } = localOf(from, p.timeZone);
  let moved = false;
  for (let guard = 0; guard < 800; guard++) {
    if (isOff(weekday, p) || at >= p.end) {
      date = nextDate(date);
      weekday = (weekday + 1) % 7;
      at = p.start;
      moved = true;
      continue;
    }
    if (at < p.start) {
      at = p.start;
      moved = true;
    }
    const room = p.end - at;
    if (remaining <= room) return remaining === 0 && !moved ? from : instantOf(date, at + remaining, p.timeZone);
    remaining -= room;
    date = nextDate(date);
    weekday = (weekday + 1) % 7;
    at = p.start;
    moved = true;
  }
  throw new Error('The working schedule leaves no working time.');
}

/** Working minutes from `a` to `b` (0 when b is not after a). */
export function workingMinutesBetween(a: Date, b: Date, p: WorkingPolicy): number {
  if (b.getTime() <= a.getTime()) return 0;
  let total = 0;
  let { date, weekday } = localOf(a, p.timeZone);
  const last = localOf(b, p.timeZone).date;
  for (let guard = 0; guard < 800 && date <= last; guard++) {
    if (!isOff(weekday, p)) {
      const open = instantOf(date, p.start, p.timeZone).getTime();
      const close = instantOf(date, p.end, p.timeZone).getTime();
      total += Math.max(0, Math.min(b.getTime(), close) - Math.max(a.getTime(), open));
    }
    date = nextDate(date);
    weekday = (weekday + 1) % 7;
  }
  return Math.round(total / MINUTE);
}

export const addMinutes = (from: Date, minutes: number, mode: SlaMode, p: WorkingPolicy): Date => (mode === 'CALENDAR' ? new Date(from.getTime() + minutes * MINUTE) : addWorkingMinutes(from, minutes, p));
export const minutesBetween = (a: Date, b: Date, mode: SlaMode, p: WorkingPolicy): number => (mode === 'CALENDAR' ? Math.max(0, Math.round((b.getTime() - a.getTime()) / MINUTE)) : workingMinutesBetween(a, b, p));

// ─── The state of one item ───────────────────────────────────────────────────────────────────────────────────────
export interface SlaItemTimes {
  status: 'OPEN' | 'COMPLETED' | 'CANCELLED';
  startedAt: Date;
  dueAt: Date;
  firstResponseAt: Date | null;
  completedAt: Date | null;
}

export interface SlaView {
  state: SlaState;
  label: string;
  /** Null while the item is still open. */
  metSla: boolean | null;
  /** How long past the due time, in the policy's own kind of minutes. Zero when not late. */
  overdueMinutes: number;
  remainingMinutes: number;
  elapsedMinutes: number;
}

export const SLA_LABELS: Record<SlaState, string> = { WITHIN_SLA: 'Within SLA', APPROACHING: 'Approaching SLA', BREACHED: 'SLA breached', RESOLVED: 'Resolved' };

/** Where an item stands now. The clock stops at the first response or at completion, whichever the policy measures. */
export function slaView(item: SlaItemTimes, policy: Pick<SlaPolicyRules, 'mode' | 'measure' | 'approachingPercent' | 'targetMinutes'>, working: WorkingPolicy, now: Date): SlaView {
  const stop = item.status === 'CANCELLED' ? item.completedAt ?? item.startedAt : policy.measure === 'FIRST_RESPONSE' ? item.firstResponseAt ?? item.completedAt : item.completedAt;
  const m = (a: Date, b: Date) => minutesBetween(a, b, policy.mode, working);
  if (stop) {
    const late = stop.getTime() > item.dueAt.getTime();
    return { state: 'RESOLVED', label: SLA_LABELS.RESOLVED, metSla: item.status === 'CANCELLED' ? null : !late, overdueMinutes: late ? m(item.dueAt, stop) : 0, remainingMinutes: 0, elapsedMinutes: m(item.startedAt, stop) };
  }
  const elapsed = m(item.startedAt, now);
  if (now.getTime() > item.dueAt.getTime()) return { state: 'BREACHED', label: SLA_LABELS.BREACHED, metSla: null, overdueMinutes: m(item.dueAt, now), remainingMinutes: 0, elapsedMinutes: elapsed };
  const approaching = elapsed * 100 >= policy.targetMinutes * policy.approachingPercent;
  return { state: approaching ? 'APPROACHING' : 'WITHIN_SLA', label: approaching ? SLA_LABELS.APPROACHING : SLA_LABELS.WITHIN_SLA, metSla: null, overdueMinutes: 0, remainingMinutes: m(now, item.dueAt), elapsedMinutes: elapsed };
}

/** The moment the wall clock in `timeZone` reads `minutes` on `date`. */
export const zonedInstant = instantOf;

/** The calendar date and minutes from midnight of a moment on the organisation clock. */
export const localMomentOf = localOf;
