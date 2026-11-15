/**
 * Pure rules behind the Mentor Portal "Students" list and the Student Workspace. No imports, no database.
 *
 * Four numbers are kept apart on purpose and never folded into one:
 *   allocated  what the student is entitled to in the period (the Sales requirement's monthly hours), or null when it was never set
 *   scheduled  what the approved timetable puts in the period
 *   consumed   only classes the Mentor verified, at the minutes the Mentor verified
 *   pending    classes that happened or are reported but are not verified yet
 * Remaining is allocated minus consumed and exists only when an allocation exists. Nothing here ever invents a figure.
 */

export type ClassTone = 'green' | 'blue' | 'yellow' | 'red' | 'gray';

export interface ToneInput { status: string; state: string; consumption: 'CONSUMED' | 'NOT_CONSUMED' }

/** The colour of a class record: green verified and consumed, blue upcoming, yellow waiting for the tutor or the Mentor, red needs attention, gray cancelled. */
export function classTone(c: ToneInput): ClassTone {
  if (c.status === 'CANCELLED' || c.state === 'CANCELLED') return 'gray';
  if (c.status === 'VERIFIED') return c.consumption === 'CONSUMED' ? 'green' : 'red';
  if (c.status === 'NOT_CONDUCTED' || c.state === 'NOT_CONDUCTED') return 'red';
  if (c.state === 'AWAITING_TUTOR_UPDATE' || c.state === 'AWAITING_MENTOR_VERIFICATION' || c.state === 'RETURNED_FOR_CORRECTION') return 'yellow';
  return 'blue';
}

/** The one rule for "consumed": the Mentor verified it and confirmed minutes above zero. Matches the consumption on every class view. */
export const isConsumed = (s: { status: string; verifiedMinutes: number | null }): boolean => s.status === 'VERIFIED' && (s.verifiedMinutes ?? 0) > 0;

export interface PersistedClass { status: string; state: string; scheduledMinutes: number; verifiedMinutes: number | null; duplicateOf?: string | null }

export interface ClassCounts {
  /** Every stored record, whatever its state. */
  records: number;
  consumedClasses: number;
  consumedMinutes: number;
  upcoming: number;
  awaitingTutor: number;
  awaitingMentor: number;
  returned: number;
  notConducted: number;
  cancelled: number;
}

/**
 * Counts stored class records. A cancelled class, an unverified one and a tutor-submitted one never count as consumed.
 * A record that repeats another's slot (same key) is counted once.
 */
export function countClasses(rows: Array<PersistedClass & { key: string }>): ClassCounts {
  const seen = new Set<string>();
  const out: ClassCounts = { records: 0, consumedClasses: 0, consumedMinutes: 0, upcoming: 0, awaitingTutor: 0, awaitingMentor: 0, returned: 0, notConducted: 0, cancelled: 0 };
  for (const r of rows) {
    if (seen.has(r.key)) continue;
    seen.add(r.key);
    out.records += 1;
    if (r.status === 'CANCELLED') { out.cancelled += 1; continue; }
    if (isConsumed(r)) { out.consumedClasses += 1; out.consumedMinutes += r.verifiedMinutes ?? 0; continue; }
    if (r.status === 'NOT_CONDUCTED') out.notConducted += 1;
    else if (r.status === 'RETURNED_FOR_CORRECTION') out.returned += 1;
    else if (r.state === 'AWAITING_MENTOR_VERIFICATION') out.awaitingMentor += 1;
    else if (r.state === 'AWAITING_TUTOR_UPDATE') out.awaitingTutor += 1;
    else if (r.status === 'SCHEDULED' || r.status === 'RESCHEDULED') out.upcoming += 1;
  }
  return out;
}

export interface Balance {
  allocatedMinutes: number | null;
  consumedMinutes: number;
  scheduledMinutes: number | null;
  pendingMinutes: number;
  /** Null (unavailable) when nothing was allocated. Never negative. */
  remainingMinutes: number | null;
  over: boolean;
}

/** Remaining is allocated minus consumed. Pending and scheduled time is reported beside it and never subtracted. */
export function balanceOf(input: { allocatedMinutes: number | null; consumedMinutes: number; scheduledMinutes: number | null; pendingMinutes: number }): Balance {
  const a = input.allocatedMinutes;
  return {
    allocatedMinutes: a,
    consumedMinutes: input.consumedMinutes,
    scheduledMinutes: input.scheduledMinutes,
    pendingMinutes: input.pendingMinutes,
    remainingMinutes: a === null ? null : Math.max(0, a - input.consumedMinutes),
    over: a !== null && input.consumedMinutes > a,
  };
}

/** The monthly hours of the student's Sales requirements, in minutes. Null when no requirement carries hours. */
export function allocatedMinutes(requirements: Array<{ monthlyHours: unknown }>): number | null {
  let total = 0;
  let known = false;
  for (const r of requirements) {
    if (r.monthlyHours === null || r.monthlyHours === undefined) continue;
    const h = Number(r.monthlyHours);
    if (!Number.isFinite(h) || h < 0) continue;
    known = true;
    total += Math.round(h * 60);
  }
  return known ? total : null;
}

export type ConsumptionFilter = 'NOT_STARTED' | 'IN_PROGRESS' | 'FULLY_CONSUMED' | 'UNAVAILABLE';
export const CONSUMPTION_FILTERS: readonly ConsumptionFilter[] = ['NOT_STARTED', 'IN_PROGRESS', 'FULLY_CONSUMED', 'UNAVAILABLE'];

export function consumptionBand(b: Pick<Balance, 'allocatedMinutes' | 'consumedMinutes'>): ConsumptionFilter {
  if (b.allocatedMinutes === null) return 'UNAVAILABLE';
  if (b.consumedMinutes <= 0) return 'NOT_STARTED';
  return b.consumedMinutes >= b.allocatedMinutes ? 'FULLY_CONSUMED' : 'IN_PROGRESS';
}

/** The first calendar day and the last of the month a date falls in. */
export function monthWindow(iso: string): { from: string; to: string } {
  const y = Number(iso.slice(0, 4));
  const m = Number(iso.slice(5, 7));
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { from: `${iso.slice(0, 7)}-01`, to: `${iso.slice(0, 7)}-${String(last).padStart(2, '0')}` };
}

export const LIST_SORTS = ['name', 'studentId', 'grade', 'activatedAt', 'status', 'consumed', 'remaining', 'nextClass'] as const;
export type ListSort = (typeof LIST_SORTS)[number];
/** Sorts that need the figures worked out for every student before the page is cut. */
export const DERIVED_SORTS: readonly ListSort[] = ['consumed', 'remaining', 'nextClass'];

/** Compares two nullable values, with nothing last whichever way it is sorted. */
export function compareNullable<T extends string | number>(a: T | null, b: T | null, dir: 1 | -1): number {
  if (a === null && b === null) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return (a < b ? -1 : a > b ? 1 : 0) * dir;
}
