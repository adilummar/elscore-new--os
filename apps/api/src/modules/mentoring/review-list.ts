/**
 * What the Meetings workspace lists and in what order. Pure rules, no database and no framework.
 *
 * A monthly review meeting row is a fact read from the record. The workspace adds one more kind of row: a student whose learning plan is
 * running but who has no live meeting yet ("needs scheduling"). That row is not a meeting and is never stored; it only tells the Mentor
 * that one has to be scheduled.
 */
import { MeetingState, meetingState } from './review';

export interface ListMeeting { status: string; date: string | null; originalDate: string | null; conducted: boolean | null }

/** The state a row shows. No meeting at all is "not scheduled". */
export const listState = (m: ListMeeting | null): MeetingState =>
  m ? meetingState({ status: m.status as never, date: m.date, originalDate: m.originalDate ?? m.date, conducted: m.conducted }) : 'NOT_SCHEDULED';

/** A meeting that was due on a date that has passed and is still waiting to be held, or was not held and has no new date. */
export function isOverdueMeeting(state: MeetingState, date: string | null, today: string): boolean {
  if (state === 'NOT_CONDUCTED') return true;
  return (state === 'SCHEDULED' || state === 'RESCHEDULED') && !!date && date < today;
}

/** Work that waits on the Mentor comes first: overdue, then to be scheduled, then held but not finished, then the coming ones, then history. */
export function sortRank(state: MeetingState, overdue: boolean): number {
  if (overdue) return 0;
  if (state === 'NOT_SCHEDULED') return 1;
  if (state === 'REVIEW_IN_PROGRESS') return 2;
  if (state === 'SCHEDULED' || state === 'RESCHEDULED') return 3;
  return 4;
}

export interface Sortable { rank: number; date: string | null; studentName: string }
export function compareRows(a: Sortable, b: Sortable): number {
  if (a.rank !== b.rank) return a.rank - b.rank;
  // History newest first; everything else soonest first.
  if (a.rank === 4 && a.date !== b.date) return (b.date ?? '').localeCompare(a.date ?? '');
  if (a.date !== b.date) return (a.date ?? '').localeCompare(b.date ?? '');
  return a.studentName.localeCompare(b.studentName);
}

/** The average of the marked, conducted exams' percentages, or null when none has marks. Nothing is assumed for an exam without marks. */
export function averagePercentage(percentages: ReadonlyArray<number | null>): number | null {
  const real = percentages.filter((p): p is number => p !== null);
  return real.length === 0 ? null : Math.round((real.reduce((a, b) => a + b, 0) / real.length) * 100) / 100;
}
