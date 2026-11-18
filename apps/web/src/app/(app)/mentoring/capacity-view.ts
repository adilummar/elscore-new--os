/**
 * Mentor monthly hour capacity as the screens show it. Every number comes from the API (which calculates and enforces capacity);
 * nothing here decides whether an assignment is allowed. These helpers only turn the API's numbers into words and colours.
 */
export type CapacityState = 'AVAILABLE' | 'APPROACHING' | 'FULL' | 'OVER';

export interface ContributingStudent {
  activationId: string;
  studentId: string;
  studentBusinessId: string | null;
  studentName: string;
  status: string;
  monthlyHours: number;
}

export interface OwnCapacity {
  mentorUserId: string;
  limitHours: number;
  allocatedHours: number;
  remainingHours: number;
  utilizationPercent: number;
  state: CapacityState;
  limitIsDefault: boolean;
  students: ContributingStudent[];
}

export interface TeamMentor {
  mentorUserId: string;
  name: string;
  isActive: boolean;
  studentCount: number;
  limitHours: number;
  allocatedHours: number;
  remainingHours: number;
  utilizationPercent: number;
  state: CapacityState;
  limitIsDefault: boolean;
}

export interface TeamCapacity {
  warningPercent: number;
  defaultLimitHours: number;
  totals: { limitHours: number; allocatedHours: number; remainingHours: number; utilizationPercent: number; state: CapacityState; mentors: number };
  counts: { approaching: number; full: number; over: number };
  mentors: TeamMentor[];
}

export interface CapacityHistory {
  changes: Array<{ id: string; oldLimit: number | null; newLimit: number; reason: string | null; changedByName: string; createdAt: string }>;
  exceptions: Array<{ id: string; activationId: string; action: string; studentHours: number; allocatedAfter: number; limitAtApproval: number; reason: string; approvedByName: string; createdAt: string }>;
}

export const STATE_LABEL: Record<CapacityState, string> = {
  AVAILABLE: 'Available',
  APPROACHING: 'Approaching capacity',
  FULL: 'Fully utilized',
  OVER: 'Over capacity',
};

export const STATE_TONE: Record<CapacityState, 'success' | 'warning' | 'danger' | 'info'> = {
  AVAILABLE: 'success',
  APPROACHING: 'warning',
  FULL: 'info',
  OVER: 'danger',
};

export const EXCEPTION_ACTION_LABEL: Record<string, string> = {
  ASSIGN: 'Assigned',
  REASSIGN: 'Reassigned',
  TEMPORARY_TRANSFER: 'Temporary transfer',
  END_TRANSFER: 'Returned from transfer',
};

/** "12" or "12.5": hours without trailing zeros. */
export const hoursText = (h: number): string => `${Math.round(h * 100) / 100}`;

/** Width of a usage bar: 0 to 100 whatever the utilization (over capacity fills the bar). */
export const barWidth = (percent: number): number => Math.max(0, Math.min(100, percent));

/** The text a Mentor or Head reads for one capacity: "42 of 60 hours used, 18 left". Over capacity says by how much. */
export function capacitySentence(c: { limitHours: number; allocatedHours: number; remainingHours: number }): string {
  if (c.remainingHours < 0) return `${hoursText(c.allocatedHours)} of ${hoursText(c.limitHours)} hours used, ${hoursText(-c.remainingHours)} over`;
  return `${hoursText(c.allocatedHours)} of ${hoursText(c.limitHours)} hours used, ${hoursText(c.remainingHours)} left`;
}

/** Mentors that need the Head's attention, most over capacity first. */
export function needingAttention(team: TeamCapacity): TeamMentor[] {
  const rank: Record<CapacityState, number> = { OVER: 0, FULL: 1, APPROACHING: 2, AVAILABLE: 3 };
  return team.mentors.filter((m) => m.state !== 'AVAILABLE').sort((a, b) => rank[a.state] - rank[b.state] || b.utilizationPercent - a.utilizationPercent);
}

/** A new limit typed by the Head: a whole or half-hour number from 0 to 1000, or null when it is not usable. */
export function parseLimit(text: string): number | null {
  const n = Number(text.trim());
  if (text.trim() === '' || !Number.isFinite(n) || n < 0 || n > 1000) return null;
  return Math.round(n * 100) / 100;
}
