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
  /** Absent from an older API; treated as none. */
  studentsWithoutHours?: number;
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

/** One hours figure for a student, everywhere: a missing or zero value is "not set", never a quiet 0 h. */
export function studentHoursText(hours: number | null | undefined): string {
  const n = Number(hours);
  return Number.isFinite(n) && n > 0 ? `${hoursText(n)} h a month` : 'Hours not set';
}

/** What assigning a student would do to a Mentor, said before the Head confirms. The server still decides. */
export function allocationPreview(mentor: { name: string; allocatedHours: number; monthlyHourLimit: number }, studentHours: number | null | undefined): { tone: 'ok' | 'warn' | 'over'; text: string } {
  const left = mentor.monthlyHourLimit - mentor.allocatedHours;
  const n = Number(studentHours);
  if (!Number.isFinite(n) || n <= 0) return { tone: 'warn', text: `${mentor.name} has ${hoursText(Math.max(0, left))} h left. This student's hours are not set, so nothing is added yet.` };
  if (n > left) return { tone: 'over', text: `${mentor.name} has ${hoursText(Math.max(0, left))} h left and this student needs ${hoursText(n)} h, so it would go ${hoursText(n - Math.max(0, left))} h over. You will be asked for a reason.` };
  return { tone: 'ok', text: `${mentor.name} has ${hoursText(left)} h left, ${hoursText(left - n)} h after this student.` };
}
