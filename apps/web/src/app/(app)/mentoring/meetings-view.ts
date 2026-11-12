/**
 * How the Meetings workspace reads what the API sent. The API decides every state (scheduled, rescheduled, overdue, held but not complete,
 * completed) and every count. This file words them, groups them into the queues a Mentor works through and says what preparation is left.
 * A row with no meeting is a student whose learning plan is running and who needs a meeting date; it is not a meeting.
 */
import type { MeetingState, Tally } from './review-view';
import { timeLabel } from './review-view';

export interface MeetingRow {
  activationId: string;
  studentId: string;
  studentName: string;
  parentName: string | null;
  mentorName: string | null;
  meetingId: string | null;
  state: MeetingState;
  stateLabel: string;
  overdue: boolean;
  date: string | null;
  originalDate: string | null;
  startMinute: number | null;
  endMinute: number | null;
  period: { start: string | null; end: string | null };
  planStatus: string | null;
  preparation: { examsReviewed: boolean; subjects: number; subjectsWithGoals: number; tutorObservations: number; nextPlanSubjects: number; nextPlanApproved: boolean };
  exams: { total: number; conducted: number; marked: number; averagePercentage: number | null };
  goals: Tally;
  improvementAreas: number;
  parentFeedbackRecorded: boolean;
  completedAt: string | null;
  canWork: boolean;
}
export interface MeetingsData { counts: Record<string, number>; overdue: number; total: number; page: number; pageSize: number; pages: number; rows: MeetingRow[] }

export interface MeetingQueue { key: string; label: string; state: string }
/** The queues, in the order of a month: to schedule, coming up, overdue, held but not finished, history. */
export const MEETING_QUEUES: readonly MeetingQueue[] = [
  { key: 'all', label: 'All', state: '' },
  { key: 'schedule', label: 'Needs scheduling', state: 'NOT_SCHEDULED' },
  { key: 'upcoming', label: 'Scheduled', state: 'SCHEDULED' },
  { key: 'rescheduled', label: 'Rescheduled', state: 'RESCHEDULED' },
  { key: 'overdue', label: 'Overdue', state: 'OVERDUE' },
  { key: 'progress', label: 'Review in progress', state: 'REVIEW_IN_PROGRESS' },
  { key: 'completed', label: 'Completed', state: 'COMPLETED' },
];

/** How many meetings a queue holds, from the API's own counts. */
export function queueCount(q: MeetingQueue, data: Pick<MeetingsData, 'counts' | 'overdue' | 'total'>): number {
  if (q.key === 'all') return Object.values(data.counts).reduce((a, b) => a + b, 0);
  if (q.state === 'OVERDUE') return data.overdue;
  return data.counts[q.state] ?? 0;
}

export const whenText = (r: Pick<MeetingRow, 'date' | 'startMinute' | 'endMinute'>) => (r.date ? `${r.date}, ${timeLabel(r.startMinute, r.endMinute)}` : 'No date yet');

/** What the Mentor still has to prepare before the review can be held and completed, in words. Empty when everything is in place. */
export function preparationLeft(r: Pick<MeetingRow, 'state' | 'preparation' | 'goals'>): string[] {
  if (r.state === 'NOT_SCHEDULED' || r.state === 'COMPLETED' || r.state === 'CANCELLED') return [];
  const p = r.preparation;
  const out: string[] = [];
  if (!p.examsReviewed) out.push('Review the exam results');
  if (p.subjects > 0 && p.subjectsWithGoals < p.subjects) out.push(`Goals for ${p.subjects - p.subjectsWithGoals} of ${p.subjects} subjects`);
  if (r.goals.unevaluated > 0) out.push(`${r.goals.unevaluated} ${r.goals.unevaluated === 1 ? 'goal' : 'goals'} not evaluated`);
  if (p.subjects > 0 && p.tutorObservations < p.subjects) out.push(`Tutor observations for ${p.subjects - p.tutorObservations} of ${p.subjects} subjects`);
  if (p.subjects > 0 && p.nextPlanSubjects < p.subjects) out.push(`Next plan for ${p.subjects - p.nextPlanSubjects} of ${p.subjects} subjects`);
  else if (!p.nextPlanApproved && p.subjects > 0) out.push('Approve the next plan');
  return out;
}

export function preparationText(r: Pick<MeetingRow, 'state' | 'preparation' | 'goals'>): { tone: 'done' | 'waiting' | 'none'; text: string } {
  if (r.state === 'NOT_SCHEDULED') return { tone: 'none', text: 'Not started' };
  if (r.state === 'COMPLETED') return { tone: 'done', text: 'Review completed' };
  if (r.state === 'CANCELLED') return { tone: 'none', text: 'Cancelled' };
  const left = preparationLeft(r);
  return left.length === 0 ? { tone: 'done', text: 'Ready' } : { tone: 'waiting', text: `${left.length} to do` };
}

export function examSummaryText(e: MeetingRow['exams']): string {
  if (e.total === 0) return 'No exams in this period';
  const avg = e.averagePercentage === null ? 'no marks yet' : `average ${e.averagePercentage}%`;
  return `${e.conducted} of ${e.total} sat, ${e.marked} marked, ${avg}`;
}

export function goalsSummaryText(t: Tally): string {
  if (t.total === 0) return 'No goals set';
  return t.unevaluated === t.total ? `${t.total} ${t.total === 1 ? 'goal' : 'goals'}, none evaluated` : `${t.yes} met, ${t.partially} partly, ${t.no} not met of ${t.total}`;
}

export const meetingsQuery = (f: { state: string; student: string; from: string; to: string }, page = 1, pageSize = 100) => {
  const parts = Object.entries({ ...f, page: String(page), pageSize: String(pageSize) }).filter(([, v]) => v !== '').map(([k, v]) => `${k}=${encodeURIComponent(v)}`);
  return `?${parts.join('&')}`;
};
