/**
 * Mentor monthly hourly capacity: the pure rules, with no database access so they are unit-tested directly.
 *
 * Every student's FULL monthly mentoring-hour requirement is charged to the assigned Mentor, however many tutors the student has and
 * however the hours are split between them. A student is one activation with one current Mentor, so a student is counted once.
 */

export type CapacityState = 'AVAILABLE' | 'APPROACHING' | 'FULL' | 'OVER';

export const DEFAULT_WARNING_PERCENT = 80;

export interface CapacitySummary {
  limitHours: number;
  allocatedHours: number;
  remainingHours: number;
  utilizationPercent: number;
  state: CapacityState;
}

/** Hours are kept to two decimals everywhere (the database column is DECIMAL(10,2)). */
export function roundHours(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/** The student's full monthly hours: the sum of the monthly hours of every requirement. Missing or invalid values count as zero. */
export function studentMonthlyHours(requirements: Array<{ monthlyHours: unknown }>): number {
  let total = 0;
  for (const r of requirements) {
    if (r.monthlyHours === null || r.monthlyHours === undefined) continue;
    const h = Number(r.monthlyHours);
    if (Number.isFinite(h) && h > 0) total += h;
  }
  return roundHours(total);
}

export function summarizeCapacity(limitHours: number, allocatedHours: number, warningPercent = DEFAULT_WARNING_PERCENT): CapacitySummary {
  const limit = roundHours(limitHours);
  const allocated = roundHours(allocatedHours);
  const remaining = roundHours(limit - allocated);
  const utilization = limit > 0 ? roundHours((allocated / limit) * 100) : allocated > 0 ? 100 : 0;
  let state: CapacityState;
  if (allocated > limit) state = 'OVER';
  else if (remaining <= 0) state = 'FULL';
  else if (utilization >= warningPercent) state = 'APPROACHING';
  else state = 'AVAILABLE';
  return { limitHours: limit, allocatedHours: allocated, remainingHours: remaining, utilizationPercent: utilization, state };
}

/** Would adding a student of `studentHours` push the Mentor past the limit? */
export function wouldExceed(limitHours: number, allocatedHours: number, studentHours: number): boolean {
  return roundHours(allocatedHours + studentHours) > roundHours(limitHours);
}

export const CAPACITY_STATE_LABEL: Record<CapacityState, string> = {
  AVAILABLE: 'Available',
  APPROACHING: 'Approaching capacity',
  FULL: 'Fully utilized',
  OVER: 'Over capacity',
};
