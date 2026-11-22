import { fromZonedTime, toZonedTime } from 'date-fns-tz';

/**
 * Tutor hiring working-hours schedule.
 * Times are wall-clock "HH:mm" in `timezone`. `workingDays` uses 0=Sunday..6=Saturday.
 * The schedule is configuration owned by the business; nothing here supplies defaults.
 */
export interface HiringSchedule {
  startTime: string;
  endTime: string;
  workingDays: number[];
  timezone: string;
}

export type SlaState = 'PENDING' | 'COMPLETED' | 'OVERDUE';

const MS_PER_MINUTE = 60_000;

function parseHm(value: string): number {
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(value);
  if (!m) throw new Error(`Invalid time "${value}", expected HH:mm`);
  return Number(m[1]) * 60 + Number(m[2]);
}

export function assertValidSchedule(s: HiringSchedule): { startMin: number; endMin: number } {
  const startMin = parseHm(s.startTime);
  const endMin = parseHm(s.endTime);
  if (endMin <= startMin) throw new Error('Working hours must end after they start (overnight shifts unsupported)');
  if (!s.workingDays.length || s.workingDays.some((d) => !Number.isInteger(d) || d < 0 || d > 6)) {
    throw new Error('workingDays must contain integers 0-6');
  }
  return { startMin, endMin };
}

/** Local calendar parts of an instant in the schedule timezone. */
function localParts(instant: Date, tz: string) {
  const z = toZonedTime(instant, tz);
  return {
    y: z.getFullYear(),
    mo: z.getMonth(),
    d: z.getDate(),
    dow: z.getDay(),
    minutes: z.getHours() * 60 + z.getMinutes() + z.getSeconds() / 60 + z.getMilliseconds() / 60_000,
  };
}

/** UTC instant of a local wall-clock time (minutes after local midnight) on a local calendar day. */
function localToInstant(y: number, mo: number, d: number, minutes: number, tz: string): Date {
  const h = Math.floor(minutes / 60);
  const mi = minutes % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return fromZonedTime(`${y}-${pad(mo + 1)}-${pad(d)}T${pad(h)}:${pad(mi)}:00`, tz);
}

/**
 * Adds `workingMinutes` of working time to `start`, skipping time outside the
 * schedule (nights, non-working days, optional `holidays` as 'YYYY-MM-DD' local dates).
 * If `start` falls outside working time the clock starts at the next opening.
 */
export function addWorkingMinutes(
  start: Date,
  workingMinutes: number,
  schedule: HiringSchedule,
  holidays: ReadonlySet<string> = new Set(),
): Date {
  if (!(workingMinutes >= 0)) throw new Error('workingMinutes must be >= 0');
  const { startMin, endMin } = assertValidSchedule(schedule);
  const tz = schedule.timezone;
  const isWorkingDay = (y: number, mo: number, d: number, dow: number) =>
    schedule.workingDays.includes(dow) &&
    !holidays.has(`${y}-${String(mo + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`);

  let cursor = start;
  let remaining = workingMinutes;
  // Bounded: at most ~1 year of days is walked.
  for (let guard = 0; guard < 400; guard++) {
    const p = localParts(cursor, tz);
    if (isWorkingDay(p.y, p.mo, p.d, p.dow)) {
      const from = Math.max(p.minutes, startMin);
      if (from < endMin) {
        const available = endMin - from;
        if (remaining <= available) {
          const base = localToInstant(p.y, p.mo, p.d, startMin, tz);
          // Compute via absolute elapsed time from the opening to stay DST-safe.
          return new Date(base.getTime() + (from - startMin + remaining) * MS_PER_MINUTE);
        }
        remaining -= available;
      }
    }
    // Move to the opening of the next local day.
    const next = new Date(localToInstant(p.y, p.mo, p.d, 0, tz).getTime() + 36 * 60 * MS_PER_MINUTE);
    const np = localParts(next, tz);
    cursor = localToInstant(np.y, np.mo, np.d, startMin, tz);
  }
  throw new Error('Could not place deadline within schedule horizon');
}

export interface SlaStatus {
  state: SlaState;
  deadline: Date;
}

/**
 * Two-working-hour evaluation SLA. The timer starts at the actual demo
 * completion time. `evaluatedAt` present means COMPLETED regardless of timing
 * (lateness is derived by comparing evaluatedAt with deadline when reporting).
 */
export function evaluationSla(
  demoCompletedAt: Date,
  evaluatedAt: Date | null,
  now: Date,
  schedule: HiringSchedule,
  allowedWorkingMinutes = 120,
  holidays?: ReadonlySet<string>,
): SlaStatus {
  const deadline = addWorkingMinutes(demoCompletedAt, allowedWorkingMinutes, schedule, holidays);
  if (evaluatedAt) return { state: 'COMPLETED', deadline };
  return { state: now.getTime() > deadline.getTime() ? 'OVERDUE' : 'PENDING', deadline };
}
