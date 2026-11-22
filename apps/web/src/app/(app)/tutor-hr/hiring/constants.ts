// Shared (client + server safe) constants and formatters for Tutor Hiring.

export const STAGES = [
  { value: 'LEAD', label: 'Lead' },
  { value: 'DETAILS_SHARED', label: 'Details Shared' },
  { value: 'CV', label: 'CV' },
  { value: 'LIVE_DEMO_INTERVIEW', label: 'Live Demo & Interview' },
] as const;

export const DECISIONS = [
  { value: 'ACCEPTED', label: 'Accepted' },
  { value: 'HIRED', label: 'Hired' },
  { value: 'REJECTED', label: 'Rejected' },
  { value: 'NOT_INTERESTED', label: 'Not Interested' },
  { value: 'NO_RESPONSE', label: 'No Response' },
] as const;

export const CALL_STATUSES = [
  { value: 'ATTENDED', label: 'Attended' },
  { value: 'BUSY_CALL_LATER', label: 'Busy, call later' },
  { value: 'NOT_ATTENDED', label: 'Not attended' },
] as const;

export const DEMO_STATUS_LABEL: Record<string, string> = {
  BOOKED: 'Booked',
  ATTENDED: 'Attended',
  NOT_ATTENDED: 'Not attended',
  RESCHEDULE: 'Rescheduled',
};

export type BadgeVariant = 'default' | 'success' | 'warning' | 'danger' | 'info';

export const labelOf = (list: readonly { value: string; label: string }[], v?: string | null) =>
  list.find((x) => x.value === v)?.label ?? (v ? v : '—');

export const DECISION_VARIANT: Record<string, BadgeVariant> = {
  ACCEPTED: 'info',
  HIRED: 'success',
  REJECTED: 'danger',
  NOT_INTERESTED: 'default',
  NO_RESPONSE: 'warning',
};

export const SLA_LABEL: Record<string, { label: string; variant: BadgeVariant }> = {
  PENDING: { label: 'Evaluation pending', variant: 'warning' },
  OVERDUE: { label: 'Evaluation overdue', variant: 'danger' },
  COMPLETED: { label: 'Evaluated', variant: 'success' },
  SLA_NOT_CONFIGURED: { label: 'SLA not configured', variant: 'default' },
  NOT_APPLICABLE: { label: '—', variant: 'default' },
};

export function fmtDateTime(v?: string | Date | null): string {
  if (!v) return '—';
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export function fmtDate(v?: string | Date | null): string {
  if (!v) return '—';
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

/** Value for <input type="datetime-local"> from an ISO string or Date, in the browser's local zone. */
export function toLocalInput(v?: string | Date | null): string {
  const d = v ? new Date(v) : new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

export const fromLocalInput = (v: string): string => new Date(v).toISOString();

export const todayLocal = (): string => toLocalInput().slice(0, 10);
