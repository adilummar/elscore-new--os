/**
 * Who is eligible for operational Mentoring work. Pure rules, no database and no framework.
 *
 * The sequence is: the seven activation stages are completed, the Mentor submits for final approval, the Mentoring Head approves,
 * the student is Active. Daily classes then need the approved timetable as well (the timetable stage of the activation completed
 * and verified). Both must hold: activation does not imply an approved timetable, and an approved timetable does not make a
 * student eligible. Exams and monthly meetings need an Active student.
 *
 * Nothing here deletes or hides history. It decides only what is operational from now on: what is generated, listed, reminded
 * and writable. A paused or cancelled student keeps every earlier class, exam and meeting record.
 */

/** The timetable stage of the activation. Completing and verifying it is what "approved timetable" means. */
export const TIMETABLE_STAGE = 3;

export type EligibilityReason = 'NOT_ACTIVATED' | 'PAUSED' | 'CANCELLED' | 'TIMETABLE_NOT_APPROVED';
export interface Eligibility { eligible: boolean; reason: EligibilityReason | null }

const NOT_ACTIVATED = new Set(['AWAITING_ALLOCATION', 'ACTIVATION_IN_PROGRESS', 'PENDING_FINAL_APPROVAL']);
const PAUSED = new Set(['ACTIVATION_ON_HOLD', 'ACTIVATION_BLOCKED']);

/** The student is Active. The only status in which exams, meetings and classes are operational. */
export const isActive = (status: string | null | undefined) => status === 'ACTIVATED';

export const timetableApproved = (stages: ReadonlyArray<{ stageNumber: number; status: string }>) => stages.some((s) => s.stageNumber === TIMETABLE_STAGE && s.status === 'COMPLETED');

/** Why a status is not Active, in the terms the rules use. */
function statusReason(status: string | null | undefined): EligibilityReason | null {
  if (isActive(status)) return null;
  if (status && PAUSED.has(status)) return 'PAUSED';
  if (status === 'CANCELLED') return 'CANCELLED';
  if (!status || NOT_ACTIVATED.has(status)) return 'NOT_ACTIVATED';
  return 'NOT_ACTIVATED';
}

/** An Active student can have exams and meetings. */
export function studentEligibility(activation: { status: string }): Eligibility {
  const reason = statusReason(activation.status);
  return { eligible: reason === null, reason };
}

/** An Active student with an approved timetable can have daily classes. */
export function classEligibility(activation: { status: string }, stages: ReadonlyArray<{ stageNumber: number; status: string }>): Eligibility {
  const base = studentEligibility(activation);
  if (!base.eligible) return base;
  return timetableApproved(stages) ? { eligible: true, reason: null } : { eligible: false, reason: 'TIMETABLE_NOT_APPROVED' };
}

const WHAT: Record<EligibilityReason, string> = {
  NOT_ACTIVATED: 'has not been activated yet',
  PAUSED: 'is paused',
  CANCELLED: 'was cancelled',
  TIMETABLE_NOT_APPROVED: 'does not have an approved timetable yet',
};

/** The sentence a person is shown when something is refused. */
export function ineligibleMessage(reason: EligibilityReason, what: 'classes' | 'exams' | 'meetings' | 'the review'): string {
  return `This student ${WHAT[reason]}, so ${what} cannot be changed.`;
}

/** A stored class that has not progressed past scheduling. Such a class belongs to the operational list, not to history. */
export const OPEN_CLASS_STATUSES: ReadonlySet<string> = new Set(['SCHEDULED', 'RESCHEDULED']);

// ─── When a class is operational: after activation, and outside every pause ───────────────────────────────────────
/**
 * The moments a student's classes are operational, read from what is recorded: the instant the Mentoring Head approved the activation
 * (activatedAt, set once on approval) and every pause or block the workflow recorded (WorkflowHold: from the moment it was made to the
 * moment it was resolved, or still open). Nothing is estimated. A student with no recorded activation moment has no operational classes,
 * because no date is invented for them.
 */
export interface OperationalBoundary {
  activatedAt: Date | null;
  holds: ReadonlyArray<{ from: Date; to: Date | null }>;
}

/** Whether a class that starts at this instant is operational: not before activation, and not inside any pause. */
export function operationalAt(boundary: OperationalBoundary, start: Date): boolean {
  if (!boundary.activatedAt) return false;
  if (start.getTime() < boundary.activatedAt.getTime()) return false;
  return !boundary.holds.some((h) => start.getTime() >= h.from.getTime() && (h.to === null || start.getTime() < h.to.getTime()));
}
