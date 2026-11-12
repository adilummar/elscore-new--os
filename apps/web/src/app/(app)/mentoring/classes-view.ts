/**
 * How the Classes workspace reads a class row. Everything here is read from what the API sent: nothing is worked out again, no
 * status is invented, and a missing fact is shown as missing. Scheduled and actual times stay apart.
 */
import { ClassItem, VERIFICATION_LABELS, hoursText, timeLabel } from './class-view';
import { formatRange } from './tutor-availability';

/** What a status cell looks like: done, still to come, needs the Mentor's eye, or not applicable yet. */
export type Tone = 'done' | 'waiting' | 'attention' | 'none';
export interface Cell { tone: Tone; text: string }

export const classHref = (key: string) => `/mentoring/classes/${encodeURIComponent(key)}`;

// ─── Dates ───────────────────────────────────────────────────────────────────────────────────────────────────────
const utc = (iso: string) => new Date(`${iso}T00:00:00Z`);
const iso = (d: Date) => d.toISOString().slice(0, 10);
export const shiftDay = (date: string, days: number) => { const d = utc(date); d.setUTCDate(d.getUTCDate() + days); return iso(d); };
/** Monday to Sunday around a date. */
export function weekOf(date: string): { from: string; to: string } {
  const dow = utc(date).getUTCDay();
  const from = shiftDay(date, dow === 0 ? -6 : 1 - dow);
  return { from, to: shiftDay(from, 6) };
}

export type RangeMode = 'day' | 'week' | 'range';
/** A range that came from a dashboard link is neither a day nor this week's Monday to Sunday, and is shown as it is. */
export function modeOf(f: { date: string; from: string; to: string }): RangeMode {
  if (!f.from && !f.to) return 'day';
  const w = weekOf(f.from || f.date);
  return f.from === w.from && f.to === w.to ? 'week' : 'range';
}

// ─── Quick views: the Mentor's work queues, each one the API's own card or state ─────────────────────────────────
export interface QuickView { key: string; label: string; card: string; state: string; wholeDay: boolean }
export const QUICK_VIEWS: readonly QuickView[] = [
  { key: 'all', label: 'All classes', card: '', state: '', wholeDay: false },
  { key: 'verify', label: 'Verification queue', card: 'classes_awaiting_verification', state: '', wholeDay: true },
  { key: 'update', label: 'Waiting for tutor update', card: 'classes_awaiting_update', state: '', wholeDay: true },
  { key: 'returned', label: 'Returned for correction', card: '', state: 'RETURNED_FOR_CORRECTION', wholeDay: true },
];
export const quickViewOf = (f: { card: string; state: string }): string =>
  QUICK_VIEWS.find((q) => q.key !== 'all' && q.card === f.card && q.state === f.state)?.key ?? (f.card || f.state ? 'other' : 'all');

// ─── What each cell says ─────────────────────────────────────────────────────────────────────────────────────────
type Row = Pick<ClassItem, 'status' | 'state' | 'tutorConfirmation' | 'mentorVerification' | 'update' | 'documentation' | 'returned' | 'sla' | 'startMinute' | 'endMinute' | 'scheduledMinutes' | 'verified' | 'consumption'>;
const closed = (r: Pick<Row, 'state' | 'status'>) => r.state === 'CANCELLED' || r.status === 'CANCELLED';

/** Whether the tutor's reminder reached the student, as the API records it. A prepared reminder is not a delivered one. */
export function reminderCell(r: Row): Cell {
  if (closed(r)) return { tone: 'none', text: 'Not needed' };
  if (r.tutorConfirmation === 'ACKNOWLEDGED') return { tone: 'done', text: 'Sent, acknowledged' };
  if (r.tutorConfirmation === 'SENT') return { tone: 'waiting', text: 'Sent, not acknowledged' };
  return { tone: 'waiting', text: 'Not sent' };
}

export function updateCell(r: Row): Cell {
  if (closed(r)) return { tone: 'none', text: 'Not needed' };
  if (r.state === 'RETURNED_FOR_CORRECTION') return { tone: 'attention', text: 'Returned to the tutor' };
  if (!r.update?.submittedAt) return { tone: 'waiting', text: 'Not submitted' };
  return { tone: 'done', text: (r.update.version ?? 1) > 1 ? 'Submitted again' : 'Submitted' };
}

export function voiceCell(r: Row): Cell {
  if (closed(r) || r.update?.conducted === false) return { tone: 'none', text: 'Not needed' };
  const v = r.update?.voice;
  if (v?.receivedAt) return { tone: 'done', text: 'Received' };
  if (v?.sentAt) return { tone: 'waiting', text: 'Sent, not confirmed' };
  return { tone: 'waiting', text: 'Not sent' };
}

export function checklistCell(r: Row): Cell {
  const d = r.documentation;
  if (!d) return { tone: 'none', text: 'Not available' };
  if (d.status === 'COMPLETE') return { tone: 'done', text: d.label };
  if (d.status === 'NOT_REQUIRED') return { tone: 'none', text: d.label };
  if (d.status === 'RETURNED') return { tone: 'attention', text: d.label };
  return { tone: 'waiting', text: d.label };
}

export function verificationCell(r: Row): Cell {
  if (closed(r)) return { tone: 'none', text: 'Not needed' };
  const text = VERIFICATION_LABELS[r.mentorVerification];
  if (r.mentorVerification === 'VERIFIED' || r.mentorVerification === 'NOT_CONDUCTED') return { tone: 'done', text };
  return { tone: r.state === 'AWAITING_MENTOR_VERIFICATION' ? 'attention' : 'waiting', text };
}

export const scheduledText = (r: Pick<Row, 'startMinute' | 'endMinute' | 'scheduledMinutes'>) => `${timeLabel(r)} (${hoursText(r.scheduledMinutes)})`;

/** The time the tutor says it ran, kept apart from the scheduled time. Null until the tutor has reported it. */
export function actualText(r: Pick<Row, 'update'>): string | null {
  const u = r.update;
  if (!u || u.conducted === false || u.actualStartMinute == null || u.actualEndMinute == null) return null;
  return `${formatRange(u.actualStartMinute, u.actualEndMinute)}${u.actualMinutes != null ? ` (${hoursText(u.actualMinutes)})` : ''}`;
}

/** Whether the actual time differs from the schedule. Only then is it worth the Mentor's attention. */
export const actualDiffers = (r: Pick<Row, 'update' | 'startMinute' | 'endMinute'>) =>
  !!r.update && r.update.actualStartMinute != null && r.update.actualEndMinute != null && (r.update.actualStartMinute !== r.startMinute || r.update.actualEndMinute !== r.endMinute);

export const isOverdue = (r: Pick<Row, 'sla'>) => r.sla?.state === 'BREACHED';

/** Classes that wait on a person right now. */
const NEEDS = new Set(['AWAITING_TUTOR_UPDATE', 'AWAITING_MENTOR_VERIFICATION', 'RETURNED_FOR_CORRECTION']);
export const needsAction = (r: Pick<Row, 'state'>) => NEEDS.has(r.state);

/** The strip above the list: how many classes of the shown range are in each state that waits on someone. Counts come from the API. */
export function workload(counts: Record<string, number>, total: number): Array<{ state: string; label: string; count: number }> {
  const parts: Array<[string, string]> = [['AWAITING_MENTOR_VERIFICATION', 'to verify'], ['AWAITING_TUTOR_UPDATE', 'waiting for tutor update'], ['RETURNED_FOR_CORRECTION', 'returned'], ['VERIFIED', 'verified']];
  const out = parts.map(([state, label]) => ({ state, label, count: counts[state] ?? 0 })).filter((p) => p.count > 0);
  return total > 0 ? out : [];
}
