/**
 * Pure rules for the two compulsory onboarding sessions (confirmed 2026-11-22/23):
 *  - a session is passed only when the trainee Attended AND the task is Completed;
 *  - anything else means repeating the same session as a new attempt;
 *  - Session 2 opens only after Session 1 is passed; training completes when Session 2 is passed;
 *  - "Attended but Didn't Complete" requires remarks; a Not Attended reason is optional;
 *  - a recorded attempt is locked; only the Head can correct it.
 */

export const TRAINING_ATTENDANCE = ['ATTENDED', 'NOT_ATTENDED', 'ATTENDED_NOT_COMPLETED'] as const;
export type TrainingAttendance = (typeof TRAINING_ATTENDANCE)[number];

export const SESSION_NUMBERS = [1, 2] as const;
export type SessionNumber = (typeof SESSION_NUMBERS)[number];

export class TrainingRuleError extends Error {}

export interface AttemptResult {
  attendance: TrainingAttendance;
  taskCompleted: boolean;
  remarks?: string | null;
}

export function isPass(r: { attendance: TrainingAttendance | null; taskCompleted: boolean | null }): boolean {
  return r.attendance === 'ATTENDED' && r.taskCompleted === true;
}

/** Validates one recorded result. */
export function assertValidResult(r: AttemptResult): void {
  if (!TRAINING_ATTENDANCE.includes(r.attendance)) throw new TrainingRuleError('Unknown attendance status');
  if (r.attendance === 'ATTENDED_NOT_COMPLETED' && !r.remarks?.trim()) {
    throw new TrainingRuleError("Remarks are required for Attended but Didn't Complete");
  }
  if (r.attendance === 'NOT_ATTENDED' && r.taskCompleted) {
    throw new TrainingRuleError('A trainee who did not attend cannot have the task marked Completed');
  }
}

export interface EnrolmentProgress {
  session1PassedAt: Date | null;
  session2PassedAt: Date | null;
  /** Session numbers that already have an attempt waiting to be recorded. */
  pendingSessions: number[];
}

/** Can this trainee be added to a session with this number? Returns null if yes, else the reason. */
export function participantBlocker(p: EnrolmentProgress, sessionNumber: number): string | null {
  if (!SESSION_NUMBERS.includes(sessionNumber as SessionNumber)) return 'Unknown session number';
  if (p.session2PassedAt) return 'Training is already complete';
  if (sessionNumber === 1 && p.session1PassedAt) return 'Session 1 is already passed';
  if (sessionNumber === 2 && !p.session1PassedAt) return 'Session 1 must be passed (attended with the task completed) first';
  if (p.pendingSessions.includes(sessionNumber)) return `Already added to a Session ${sessionNumber} that has not been recorded yet`;
  return null;
}

export type TraineeStage =
  | 'AWAITING_SESSION_1'
  | 'SESSION_1_SCHEDULED'
  | 'AWAITING_SESSION_2'
  | 'SESSION_2_SCHEDULED'
  | 'COMPLETED';

/** Overall onboarding progress shown until both sessions are passed. */
export function traineeStage(p: EnrolmentProgress): TraineeStage {
  if (p.session2PassedAt) return 'COMPLETED';
  if (p.session1PassedAt) return p.pendingSessions.includes(2) ? 'SESSION_2_SCHEDULED' : 'AWAITING_SESSION_2';
  return p.pendingSessions.includes(1) ? 'SESSION_1_SCHEDULED' : 'AWAITING_SESSION_1';
}
