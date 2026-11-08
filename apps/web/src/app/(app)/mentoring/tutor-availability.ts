/**
 * A tutor's weekly working availability, as a list of time windows.
 *
 * Pure rules with no imports, so the API (the authority) and the page (instant feedback) run exactly the same code.
 * `apps/web/src/app/(app)/mentoring/tutor-availability.ts` is a byte-for-byte copy, and a test fails if they differ.
 *
 * The shape matches the existing `TutorAvailabilitySlot` table: one row is one window on one day, and a day with no
 * window is a day the tutor does not work. Two windows on one day leave a break between them.
 */

/** 0 = Sunday ... 6 = Saturday, the same numbering the table uses. */
export type DayNumber = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export interface AvailabilityWindow {
  day: DayNumber;
  /** HH:MM, 24-hour. */
  start: string;
  end: string;
}

/** Monday first, the order the page shows the days in. */
export const DAY_ORDER: readonly DayNumber[] = [1, 2, 3, 4, 5, 6, 0];
export const DAY_NAMES: Readonly<Record<DayNumber, string>> = { 0: 'Sunday', 1: 'Monday', 2: 'Tuesday', 3: 'Wednesday', 4: 'Thursday', 5: 'Friday', 6: 'Saturday' };

export const MIN_WINDOW_MINUTES = 15;
export const MAX_WINDOWS_PER_DAY = 6;

const TIME = /^([01]\d|2[0-3]):([0-5]\d)$/;

export const isClock = (value: unknown): value is string => typeof value === 'string' && TIME.test(value);

export function clockToMinutes(value: string): number {
  const [h, m] = value.split(':').map(Number);
  return h * 60 + m;
}

export function minutesToClock(total: number): string {
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

/** "5:00 PM" for 17:00, the way the page and the messages write times. */
export function formatClock(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  const suffix = h >= 12 ? 'PM' : 'AM';
  const hour = h % 12 === 0 ? 12 : h % 12;
  return `${hour}:${String(m).padStart(2, '0')} ${suffix}`;
}

export function formatRange(start: number, end: number): string {
  return `${formatClock(start)} to ${formatClock(end)}`;
}

export type AvailabilityResult = { ok: true; value: AvailabilityWindow[] } | { ok: false; message: string };

const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

/**
 * Checks a weekly availability and returns it in a fixed order (Monday first, earliest window first), or says what is
 * wrong. An empty list is allowed: it means the tutor has no working hours set.
 */
export function validateAvailability(raw: unknown): AvailabilityResult {
  const fail = (message: string): AvailabilityResult => ({ ok: false, message });
  if (!Array.isArray(raw)) return fail('The availability is not in the expected format. Reload the page and try again.');
  if (raw.length > 7 * MAX_WINDOWS_PER_DAY) return fail(`No more than ${MAX_WINDOWS_PER_DAY} time ranges are allowed on one day.`);

  const windows: AvailabilityWindow[] = [];
  for (const item of raw) {
    if (!isRecord(item) || Object.keys(item).some((k) => !['day', 'start', 'end'].includes(k))) return fail('A time range is not in the expected format.');
    const day = item.day;
    if (typeof day !== 'number' || !Number.isInteger(day) || day < 0 || day > 6) return fail('Choose a day of the week for every time range.');
    const name = DAY_NAMES[day as DayNumber];
    if (!isClock(item.start)) return fail(`${name}: the start time must be a time such as 14:00.`);
    if (!isClock(item.end)) return fail(`${name}: the end time must be a time such as 18:00.`);
    const start = clockToMinutes(item.start);
    const end = clockToMinutes(item.end);
    if (end <= start) return fail(`${name}: the end time must be after the start time.`);
    if (end - start < MIN_WINDOW_MINUTES) return fail(`${name}: a time range must be at least ${MIN_WINDOW_MINUTES} minutes.`);
    windows.push({ day: day as DayNumber, start: item.start, end: item.end });
  }

  const sorted = [...windows].sort((a, b) => DAY_ORDER.indexOf(a.day) - DAY_ORDER.indexOf(b.day) || clockToMinutes(a.start) - clockToMinutes(b.start));
  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1];
    const cur = sorted[i];
    if (prev.day === cur.day && clockToMinutes(cur.start) < clockToMinutes(prev.end)) {
      return fail(`${DAY_NAMES[cur.day]}: ${formatRange(clockToMinutes(cur.start), clockToMinutes(cur.end))} overlaps ${formatRange(clockToMinutes(prev.start), clockToMinutes(prev.end))}.`);
    }
  }
  const perDay = new Map<number, number>();
  for (const w of sorted) perDay.set(w.day, (perDay.get(w.day) ?? 0) + 1);
  for (const [day, count] of perDay) if (count > MAX_WINDOWS_PER_DAY) return fail(`${DAY_NAMES[day as DayNumber]}: no more than ${MAX_WINDOWS_PER_DAY} time ranges are allowed on one day.`);
  return { ok: true, value: sorted };
}

export interface MinuteWindow {
  start: number;
  end: number;
}

/** The windows of one day as minutes, with overlapping or touching windows joined, so coverage can be tested. */
export function mergedWindowsFor(windows: readonly AvailabilityWindow[], day: DayNumber): MinuteWindow[] {
  const list = windows
    .filter((w) => w.day === day)
    .map((w) => ({ start: clockToMinutes(w.start), end: clockToMinutes(w.end) }))
    .sort((a, b) => a.start - b.start);
  const merged: MinuteWindow[] = [];
  for (const w of list) {
    const last = merged[merged.length - 1];
    if (last && w.start <= last.end) last.end = Math.max(last.end, w.end);
    else merged.push({ ...w });
  }
  return merged;
}

/** True when one working window covers the whole time range. */
export function covers(windows: readonly AvailabilityWindow[], day: DayNumber, start: number, end: number): boolean {
  return mergedWindowsFor(windows, day).some((w) => w.start <= start && w.end >= end);
}

/** "Monday 2:00 PM to 6:00 PM, Tuesday ..." for a short readable summary, Monday first. */
export function describeAvailability(windows: readonly AvailabilityWindow[]): string {
  const parts: string[] = [];
  for (const day of DAY_ORDER) {
    const merged = mergedWindowsFor(windows, day);
    if (merged.length) parts.push(`${DAY_NAMES[day]} ${merged.map((w) => formatRange(w.start, w.end)).join(' and ')}`);
  }
  return parts.join(', ');
}
