// Shared (client + server safe) Tutor Coordination constants.
import type { BadgeVariant } from '../hiring/constants';

export const OBSERVATION_STATUSES = [
  { value: 'OBSERVED', label: 'Observed' },
  { value: 'NOT_OBSERVED', label: 'Not Observed' },
  { value: 'PENDING', label: 'Pending' },
] as const;

export const OBSERVATION_VARIANT: Record<string, BadgeVariant> = { OBSERVED: 'success', NOT_OBSERVED: 'danger', PENDING: 'warning' };

export const observationLabel = (v?: string | null) => OBSERVATION_STATUSES.find((s) => s.value === v)?.label ?? 'Not assigned';

/** "Assigned / reassigned / unassigned" wording for one history row. */
export function assignmentText(h: { from?: { email: string } | null; to?: { email: string } | null }): string {
  if (!h.to) return `Unassigned from ${h.from?.email ?? 'nobody'}`;
  if (!h.from) return `Assigned to ${h.to.email}`;
  return `Reassigned from ${h.from.email} to ${h.to.email}`;
}
