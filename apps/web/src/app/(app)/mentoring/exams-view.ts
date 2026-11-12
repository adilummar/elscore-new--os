/**
 * How the Exams workspace reads what the API sent. The API decides when an exam is due (three hours of Mentor-verified class time in
 * the subject since the last exam actually conducted) and what state an exam is in. This file only words it and groups states into
 * the queues a Mentor works through.
 */
import type { ExamItem, ExamState } from './exam-view';
import { hoursText } from './class-view';

export interface DueRow {
  activationId: string;
  studentId: string;
  studentName: string;
  subjectId: string;
  subjectName: string;
  lastConductedDate: string | null;
  verifiedMinutes: number;
  thresholdMinutes: number;
  remainingMinutes: number;
  progressPercent: number;
  due: boolean;
  scheduledExam: { id: string; date: string } | null;
}
export interface DueData { thresholdMinutes: number; rows: DueRow[] }
export interface ExamWorkspaceData { counts: Record<string, number>; total: number; page: number; pageSize: number; pages: number; exams: ExamItem[] }

export interface ExamQueue { key: string; label: string; states: readonly ExamState[] }
/** The queues a Mentor works through, in the order of an exam's life. "Due" is separate: it comes from verified class hours, not from an exam row. */
export const EXAM_QUEUES: readonly ExamQueue[] = [
  { key: 'scheduled', label: 'Scheduled', states: ['SCHEDULED', 'REMINDER_PENDING', 'READY_FOR_EXAM'] },
  { key: 'rescheduled', label: 'Rescheduled', states: ['RESCHEDULED'] },
  { key: 'paper', label: 'Awaiting paper collection', states: ['EXAM_COMPLETED', 'AWAITING_PAPER_COLLECTION'] },
  { key: 'evaluation', label: 'Awaiting tutor evaluation', states: ['AWAITING_EVALUATION'] },
  { key: 'marks', label: 'Marks pending', states: ['MARKS_PENDING'] },
  { key: 'parent', label: 'Results awaiting parent sharing', states: ['AWAITING_PARENT_SHARING'] },
  { key: 'reexam', label: 'Re-exams', states: ['RE_EXAM_REQUIRED'] },
  { key: 'completed', label: 'Completed', states: ['COMPLETED'] },
];

export const queueOf = (key: string) => EXAM_QUEUES.find((q) => q.key === key);
/** How many exams a queue holds, from the API's own count per state. */
export const queueCount = (q: ExamQueue, counts: Record<string, number>) => q.states.reduce((n, s) => n + (counts[s] ?? 0), 0);
export const examsInQueue = (q: ExamQueue, exams: readonly ExamItem[]) => exams.filter((e) => (q.states as readonly string[]).includes(e.state));

/** Why an exam is due, or how far off it is, in words. Nothing here is a separate figure: it is the API's own. */
export function dueReason(r: Pick<DueRow, 'verifiedMinutes' | 'thresholdMinutes' | 'remainingMinutes' | 'due' | 'lastConductedDate'>): string {
  const since = r.lastConductedDate ? `since the exam on ${r.lastConductedDate}` : 'and no exam has been conducted yet';
  const hours = `${hoursText(r.verifiedMinutes)} of verified classes ${since}`;
  return r.due ? `Due: ${hours}.` : `${hoursText(r.remainingMinutes)} more to go: ${hours}.`;
}

export type DueStatus = 'due' | 'due-scheduled' | 'scheduled' | 'counting';
/** Due and nothing booked, due and booked, booked early, or still counting. */
export function dueStatus(r: Pick<DueRow, 'due' | 'scheduledExam'>): DueStatus {
  if (r.due) return r.scheduledExam ? 'due-scheduled' : 'due';
  return r.scheduledExam ? 'scheduled' : 'counting';
}
export const DUE_STATUS_TEXT: Record<DueStatus, string> = {
  due: 'Due, not scheduled', 'due-scheduled': 'Due, scheduled', scheduled: 'Scheduled early', counting: 'Not due yet',
};

export const dueQuery = (f: { subjectId: string; student: string }) => {
  const parts = Object.entries(f).filter(([, v]) => v !== '').map(([k, v]) => `${k}=${encodeURIComponent(v)}`);
  return parts.length ? `?${parts.join('&')}` : '';
};
export const workspaceQuery = (f: { subjectId: string; student: string; from: string; to: string }, page = 1, pageSize = 100) => {
  const parts = Object.entries({ ...f, page: String(page), pageSize: String(pageSize) }).filter(([, v]) => v !== '').map(([k, v]) => `${k}=${encodeURIComponent(v)}`);
  return `?${parts.join('&')}`;
};
