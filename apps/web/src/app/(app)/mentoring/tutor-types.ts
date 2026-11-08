import { AvailabilityWindow } from './tutor-availability';

/** What the API sends about tutors for a subject. The server decides availability; the page only shows it. */
export type SessionStatus =
  | 'AVAILABLE'
  | 'OCCUPIED'
  | 'NOT_WORKING_DAY'
  | 'NOT_CONFIGURED'
  | 'OUTSIDE_HOURS'
  | 'BREAK'
  | 'LEAVE'
  | 'HOLIDAY'
  | 'DAY_OFF'
  | 'BLOCKED';

/** One real date a class falls on, and whether the tutor is free then. */
export interface DateCheck {
  date: string;
  status: SessionStatus;
  reason: string;
}
export type Verdict = 'FULL' | 'PARTIAL' | 'NONE' | 'NOT_ELIGIBLE';

export interface TutorSessionView {
  key: string;
  label: string;
  /** 0 = Sunday ... 6 = Saturday, and the class time as minutes from midnight. */
  dayNumber: number;
  startMinute: number;
  endMinute: number;
  status: SessionStatus;
  statusLabel: string;
  reason: string;
  /** Set when the schedule has a start date: the result on each real date. */
  dates?: DateCheck[];
}

export interface TutorView {
  tutorProfileId: string;
  name: string;
  initials: string;
  photoUrl: string | null;
  subjects: string[];
  levels: string[];
  hours: string;
  verdict: Verdict;
  summary: string;
  availableCount: number;
  total: number;
  sessions: TutorSessionView[];
  ineligible: string | null;
  canAssign: boolean;
  isCurrent: boolean;
  /** Set when the schedule has a start date: how many of the real class dates are free. */
  dateTotals: { available: number; total: number } | null;
}

export interface AssignmentView {
  id: string;
  subjectId: string;
  subjectName: string;
  status: 'ACTIVE' | 'NEEDS_REVIEW' | 'ENDED';
  tutorProfileId: string;
  tutorName: string;
  initials: string;
  photoUrl: string | null;
  subjects: string[];
  levels: string[];
  sessions: string[];
  reviewDetail: { reason?: string; sessions?: Array<{ key: string; label: string; status: SessionStatus; reason: string }> } | null;
  assignedAt: string;
}

export interface CandidateList {
  subjectId: string;
  subjectName: string;
  gradeId: string;
  gradeName: string;
  ready: boolean;
  notReady: string | null;
  sessions: Array<{ key: string; label: string }>;
  tutors: TutorView[];
  current: AssignmentView | null;
  canUpdateAvailability: boolean;
}

/** Everything a subject card needs to show and change its tutor. Each call goes to the API, which checks it again. */
export interface TutorTools {
  assignments: AssignmentView[];
  /** The assigned Mentor, while the workflow runs and the meeting is open. */
  canAssign: boolean;
  /** HR staff and the tutor themselves. A Mentor sees who to ask instead. */
  canManageAvailability: boolean;
  loadCandidates: (subjectId: string) => Promise<CandidateList>;
  assign: (subjectId: string, tutorProfileId: string) => Promise<void>;
  remove: (subjectId: string, reason?: string) => Promise<void>;
  loadAvailability: (tutorProfileId: string) => Promise<{ name: string; windows: AvailabilityWindow[] }>;
  saveAvailability: (tutorProfileId: string, windows: AvailabilityWindow[]) => Promise<void>;
}

export const VERDICT_TONE: Record<Verdict, 'green' | 'amber' | 'red' | 'neutral'> = { FULL: 'green', PARTIAL: 'amber', NONE: 'red', NOT_ELIGIBLE: 'neutral' };
export const SESSION_TONE: Record<SessionStatus, 'green' | 'amber' | 'red' | 'neutral'> = {
  AVAILABLE: 'green',
  OCCUPIED: 'red',
  NOT_WORKING_DAY: 'red',
  NOT_CONFIGURED: 'neutral',
  OUTSIDE_HOURS: 'red',
  BREAK: 'amber',
  LEAVE: 'amber',
  HOLIDAY: 'amber',
  DAY_OFF: 'amber',
  BLOCKED: 'amber',
};

export const STATUS_LABELS: Record<SessionStatus, string> = {
  AVAILABLE: 'Available',
  OCCUPIED: 'Occupied',
  NOT_WORKING_DAY: 'Not working this day',
  NOT_CONFIGURED: 'Availability not configured',
  OUTSIDE_HOURS: 'Outside working hours',
  BREAK: 'Break time',
  LEAVE: 'On leave',
  HOLIDAY: 'Public holiday',
  DAY_OFF: 'Non-working date',
  BLOCKED: 'Time blocked',
};

/** A session the Mentor could fix by adding working hours. An occupied session cannot be fixed that way. */
export const needsHours = (status: SessionStatus) => status === 'NOT_WORKING_DAY' || status === 'NOT_CONFIGURED' || status === 'OUTSIDE_HOURS';
