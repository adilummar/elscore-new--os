// Shared (client + server safe) Training constants.
import type { BadgeVariant } from '../hiring/constants';

export const ATTENDANCE = [
  { value: 'ATTENDED', label: 'Attended' },
  { value: 'NOT_ATTENDED', label: 'Not Attended' },
  { value: 'ATTENDED_NOT_COMPLETED', label: "Attended but Didn't Complete" },
] as const;

export const ATTENDANCE_VARIANT: Record<string, BadgeVariant> = {
  ATTENDED: 'success',
  NOT_ATTENDED: 'danger',
  ATTENDED_NOT_COMPLETED: 'warning',
};

export const TRAINEE_STAGE: Record<string, { label: string; variant: BadgeVariant }> = {
  AWAITING_SESSION_1: { label: 'Needs Session 1', variant: 'warning' },
  SESSION_1_SCHEDULED: { label: 'Session 1 scheduled', variant: 'info' },
  AWAITING_SESSION_2: { label: 'Needs Session 2', variant: 'warning' },
  SESSION_2_SCHEDULED: { label: 'Session 2 scheduled', variant: 'info' },
  COMPLETED: { label: 'Training completed', variant: 'success' },
};

/** A session is passed only when the trainee attended and the task is completed. */
export const isPass = (a: { attendance?: string | null; taskCompleted?: boolean | null }) =>
  a.attendance === 'ATTENDED' && a.taskCompleted === true;

/** Remarks are mandatory only for Attended but Didn't Complete. */
export const remarksRequired = (attendance: string) => attendance === 'ATTENDED_NOT_COMPLETED';

export const candidateName = (l: { firstName?: string; lastName?: string; businessId?: string }) =>
  `${l.firstName ?? ''} ${l.lastName ?? ''}`.trim() || l.businessId || 'Unnamed';
