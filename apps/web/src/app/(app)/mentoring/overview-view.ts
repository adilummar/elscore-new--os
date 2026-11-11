/**
 * What the Mentoring overview shows and how its filters become a request. The API adds up every number from the services that own
 * the records; this file only arranges what it sent. Nothing here works out hours or counts students.
 */
import { formatRange } from './tutor-availability';

export type Role = 'HEAD' | 'MENTOR';
export interface Attention { key: string; label: string; count: number }
export interface Overview {
  role: Role;
  today: string;
  window: { from: string; to: string };
  period: string;
  summary: { activeStudents: number; ongoingActivations: number; scheduledMinutes: number; reportedMinutes: number; consumedMinutes: number; remainingMinutes: number; pendingClasses: number; pendingVerification: number; attentionTotal: number };
  activationByStatus: Array<{ status: string; label: string; count: number }>;
  attention: Attention[];
  note: string;
}
export interface Paged<T> { total: number; page: number; pageSize: number; pages: number; rows: T[] }
export interface MentorRow { mentorUserId: string; name: string; assignedStudents: number; activeStudents: number; ongoingActivations: number; scheduledHours: number; consumedHours: number; remainingHours: number; pendingVerification: number; pendingTasks: number }
export interface StudentRow { activationId: string; studentName: string; studentId: string | null; mentorUserId: string | null; mentorName: string | null; status: string; statusLabel: string; subjects: Array<{ id: string; name: string }>; scheduledHours: number; reportedHours: number; consumedHours: number; remainingHours: number; pendingClasses: number }
export interface ActivationRow { activationId: string; studentName: string; studentId: string | null; status: string; statusLabel: string; stageNumber: number; stageName: string | null; blocked: boolean; mentorName: string | null; responsible: string; nextAction: string; daysPending: number }
export interface TodayRow { key: string; activationId: string; date: string; startMinute: number; endMinute: number; scheduledMinutes: number; studentName: string; studentId: string | null; subjectName: string; tutorName: string; mentorName: string | null; state: string; stateLabel: string; consumption: 'CONSUMED' | 'NOT_CONSUMED'; warning: string | null }
export interface Today extends Paged<TodayRow> { date: string; today: string; counts: Record<string, number>; consumed: number }

export const hoursText = (minutes: number) => {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h && m ? `${h} h ${m} min` : h ? `${h} h` : `${m} min`;
};
export const hoursOnly = (h: number) => `${h} h`;
export const timeRange = (r: Pick<TodayRow, 'startMinute' | 'endMinute'>) => formatRange(r.startMinute, r.endMinute);

/** How far the verified hours have come of the scheduled hours, for the thin progress line. Never above a full line. */
export const progressPercent = (consumed: number, scheduled: number) => (scheduled <= 0 ? 0 : Math.max(0, Math.min(100, Math.round((consumed / scheduled) * 100))));

/** Amber for waiting that is getting long, red only for a real breach. Ordinary pending work is neither. */
export function waitTone(days: number, blocked: boolean): 'normal' | 'amber' | 'red' {
  if (blocked) return 'red';
  return days >= 14 ? 'red' : days >= 7 ? 'amber' : 'normal';
}
export function classTone(state: string, warning: string | null): 'normal' | 'amber' | 'red' | 'done' {
  if (state === 'VERIFIED') return 'done';
  if (warning?.includes('breached') || state === 'RETURNED_FOR_CORRECTION') return 'red';
  if (warning || state === 'AWAITING_MENTOR_VERIFICATION' || state === 'AWAITING_TUTOR_UPDATE') return 'amber';
  return 'normal';
}

export const PERIODS: Array<[string, string]> = [['week', 'This week'], ['month', 'This month']];
export const MENTOR_SORTS: Array<[string, string]> = [['name', 'Name'], ['assignedStudents', 'Students'], ['ongoingActivations', 'In activation'], ['scheduledHours', 'Scheduled hours'], ['consumedHours', 'Consumed hours'], ['pendingVerification', 'Waiting for verification'], ['pendingTasks', 'Pending tasks']];

export function query(params: Record<string, string | number | undefined>): string {
  const parts = Object.entries(params).filter(([, v]) => v !== undefined && v !== '').map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`);
  return parts.length ? `?${parts.join('&')}` : '';
}

/** Where each attention item opens: the full work lists, with that card already open. */
export const attentionHref = (key: string) => `/mentoring/dashboard?card=${encodeURIComponent(key)}`;
export const studentHref = (activationId: string, panel?: string) => `/mentoring/students/${activationId}${panel ? `?panel=${panel}` : ''}`;

export const HEAD_COPY = { title: 'Mentoring overview', subtitle: 'Monitor student allocation, academic operations and department performance.' };
export const MENTOR_COPY = { title: 'My day', subtitle: 'Your classes, what needs your verification and what is coming up for your students.' };
