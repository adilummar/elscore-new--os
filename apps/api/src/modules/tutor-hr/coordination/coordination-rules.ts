/** Pure rules for Tutor Coordination (Tutor Coordinator Requirements; answers of 2026-11-23). */

export const OBSERVATION_STATUSES = ['OBSERVED', 'NOT_OBSERVED', 'PENDING'] as const;
export type ObservationStatus = (typeof OBSERVATION_STATUSES)[number];

/** A newly assigned tutor is Pending (not Not Observed) for this many days. */
export const PENDING_GRACE_DAYS = 7;

export class CoordinationRuleError extends Error {}

/**
 * Current-month observation status:
 *  - Observed: at least one observation this month;
 *  - Pending: none yet, and assigned less than 7 days ago or the tutor is not yet Active;
 *  - Not Observed: everything else.
 */
export function observationStatus(p: {
  observedThisMonth: number; assignedAt: Date | null; tutorStatus: string; now?: Date;
}): ObservationStatus {
  if (p.observedThisMonth > 0) return 'OBSERVED';
  const now = p.now ?? new Date();
  const recentlyAssigned = !!p.assignedAt && now.getTime() - p.assignedAt.getTime() < PENDING_GRACE_DAYS * 86_400_000;
  if (recentlyAssigned || p.tutorStatus !== 'ACTIVE') return 'PENDING';
  return 'NOT_OBSERVED';
}

/** Any tutor with a Tutor ID except Discontinued may be assigned to a coordinator. */
export function assertAssignable(tutorStatus: string): void {
  if (tutorStatus === 'DISCONTINUED') throw new CoordinationRuleError('Discontinued tutors cannot be assigned to a coordinator');
}

/** Assign (to set), reassign (to differs), or unassign (to null, reason required). */
export function assertAssignmentChange(from: string | null, to: string | null, reason?: string | null): void {
  if (from === to) throw new CoordinationRuleError(to ? 'The tutor is already assigned to this coordinator' : 'The tutor is not assigned to a coordinator');
  if (!to && !reason?.trim()) throw new CoordinationRuleError('A reason is required to unassign a tutor');
}

export type AssignmentKind = 'ASSIGNED' | 'REASSIGNED' | 'UNASSIGNED';
export function assignmentKind(from: string | null, to: string | null): AssignmentKind {
  return !to ? 'UNASSIGNED' : from ? 'REASSIGNED' : 'ASSIGNED';
}

/** Observation content: at least one of the two descriptive fields, and not in the future. */
export function assertObservation(o: { observedAt: Date; positiveFeedback?: string | null; negativeFeedback?: string | null }, now = new Date()): void {
  if (Number.isNaN(o.observedAt.getTime())) throw new CoordinationRuleError('Observed class date and time are required');
  if (o.observedAt.getTime() > now.getTime() + 5 * 60_000) throw new CoordinationRuleError('The observed class cannot be in the future');
  if (!o.positiveFeedback?.trim() && !o.negativeFeedback?.trim()) {
    throw new CoordinationRuleError('Enter positive or negative feedback');
  }
}

/** Training conductors (confirmed): Session 1 by a Tutor Coordinator or the Tutor Head; Session 2 by HR. */
export const SESSION_CONDUCTOR_ROLES: Record<number, string[]> = {
  1: ['TUTOR_COORDINATOR', 'TUTOR_HEAD'],
  2: ['HR_MANAGER', 'HR_EXECUTIVE'],
};
