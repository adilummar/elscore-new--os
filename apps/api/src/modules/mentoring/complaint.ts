/**
 * Parent complaints: what a complaint records, which checks apply, what the parent is shown, and what must be written before a
 * complaint can be called resolved. Pure rules, no database and no framework.
 *
 * Parents have no login here. The Mentor logs a complaint on the parent's behalf and records every exchange, so each item says
 * who recorded it and when. Two clocks are kept apart: the acknowledgement target (a policy, two working hours by default) and the
 * time a complaint takes to resolve (measured and shown, with no promise attached to it).
 */

export const TEXT_LIMIT = 4000;
export const REOPEN_WINDOW_DAYS = 30;
export const BACKDATE_LIMIT_DAYS = 30;

export const CATEGORIES = ['TUTOR', 'TIMETABLE', 'PAYMENT', 'ACADEMIC_PROGRESS', 'OTHER'] as const;
export type Category = (typeof CATEGORIES)[number];
export const CATEGORY_LABELS: Record<Category, string> = { TUTOR: 'Tutor', TIMETABLE: 'Timetable', PAYMENT: 'Payment', ACADEMIC_PROGRESS: 'Learning or academic progress', OTHER: 'Other' };

export const PRIORITIES = ['LOW', 'NORMAL', 'HIGH', 'URGENT'] as const;
export type Priority = (typeof PRIORITIES)[number];
export const PRIORITY_LABELS: Record<Priority, string> = { LOW: 'Low', NORMAL: 'Normal', HIGH: 'High', URGENT: 'Urgent' };
export const PRIORITY_ORDER: Record<Priority, number> = { URGENT: 0, HIGH: 1, NORMAL: 2, LOW: 3 };

export const CHANNELS = ['PHONE', 'WHATSAPP', 'EMAIL', 'IN_PERSON', 'OTHER'] as const;
export type Channel = (typeof CHANNELS)[number];
export const CHANNEL_LABELS: Record<Channel, string> = { PHONE: 'Phone call', WHATSAPP: 'WhatsApp message', EMAIL: 'Email', IN_PERSON: 'In person', OTHER: 'Another way' };

export const STATUSES = ['NEW', 'ACKNOWLEDGED', 'ASSIGNED', 'IN_PROGRESS', 'WAITING_FOR_PARENT', 'WAITING_FOR_TUTOR', 'RESOLVED', 'REOPENED'] as const;
export type Status = (typeof STATUSES)[number];
export const STATUS_LABELS: Record<Status, string> = {
  NEW: 'New', ACKNOWLEDGED: 'Acknowledged', ASSIGNED: 'Assigned', IN_PROGRESS: 'In progress', WAITING_FOR_PARENT: 'Waiting for parent', WAITING_FOR_TUTOR: 'Waiting for tutor', RESOLVED: 'Resolved', REOPENED: 'Reopened',
};
/** The statuses a Mentor may set by hand. The others come from an action of their own: acknowledge, assign, resolve, reopen. */
export const SETTABLE_STATUSES = ['IN_PROGRESS', 'WAITING_FOR_PARENT', 'WAITING_FOR_TUTOR'] as const;

export type Stage = 'STARTED' | 'ONGOING' | 'RESOLVED';
export const STAGE_LABELS: Record<Stage, string> = { STARTED: 'Started', ONGOING: 'Ongoing', RESOLVED: 'Resolved' };
/** What the parent is shown. Many internal statuses, three stages. */
export const stageOf = (status: Status): Stage => (status === 'RESOLVED' ? 'RESOLVED' : status === 'NEW' || status === 'ACKNOWLEDGED' || status === 'ASSIGNED' ? 'STARTED' : 'ONGOING');

export const COMMUNICATION = ['INFORMED', 'NOT_YET_INFORMED', 'NOT_REACHABLE'] as const;
export type Communication = (typeof COMMUNICATION)[number];
export const COMMUNICATION_LABELS: Record<Communication, string> = { INFORMED: 'The parent has been told', NOT_YET_INFORMED: 'The parent has not been told yet', NOT_REACHABLE: 'The parent could not be reached' };

export const ENTRY_KINDS = ['LOGGED', 'ACKNOWLEDGED', 'INTERNAL_REMARK', 'ACTION_TAKEN', 'PARENT_RESPONSE', 'PARENT_MESSAGE', 'STATUS_CHANGED', 'ASSIGNED', 'ESCALATED', 'RESOLVED', 'REOPENED'] as const;
export type EntryKind = (typeof ENTRY_KINDS)[number];

// ─── Checking what is typed ──────────────────────────────────────────────────────────────────────────────────────
export type Checked<T> = { ok: true; value: T } | { ok: false; message: string };
const text = (v: unknown): string | undefined => (v === undefined || v === null ? '' : typeof v === 'string' ? v.trim() : undefined);
const isDate = (s: unknown): s is string => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`)) && new Date(`${s}T00:00:00Z`).toISOString().slice(0, 10) === s;
const DAY = 86_400_000;

export interface CheckedComplaint {
  title: string;
  category: Category;
  description: string;
  priority: Priority;
  channel: Channel;
  parentName: string;
  receivedAt: Date;
  subjectId: string | null;
  tutorUserId: string | null;
  supportingNote: string | null;
}

/**
 * A complaint as the Mentor logs it for the parent. The time it reached the Mentor is the time the response clock starts from:
 * it is today by default, can be earlier when the parent complained before the Mentor could write it down, and never in the
 * future or more than a month back.
 */
export function checkComplaint(raw: unknown, now: Date): Checked<CheckedComplaint> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ok: false, message: 'Send the complaint details.' };
  const r = raw as Record<string, unknown>;
  const f = { title: text(r.title), description: text(r.description), parentName: text(r.parentName), supportingNote: text(r.supportingNote) };
  if (Object.values(f).some((v) => v === undefined)) return { ok: false, message: 'The title, description, parent name and supporting note must be text.' };
  if (!f.title) return { ok: false, message: 'Give the complaint a title.' };
  if (f.title.length > 200) return { ok: false, message: 'The title must be 200 characters or fewer.' };
  if (!(CATEGORIES as readonly unknown[]).includes(r.category)) return { ok: false, message: 'Choose a category: tutor, timetable, payment, learning or academic progress, or other.' };
  if (!f.description) return { ok: false, message: 'Write what the parent complained about.' };
  if (f.description.length > TEXT_LIMIT) return { ok: false, message: `The description must be ${TEXT_LIMIT} characters or fewer.` };
  if (!f.parentName) return { ok: false, message: 'Write the name of the parent who complained.' };
  if (f.parentName.length > 100) return { ok: false, message: 'The parent name must be 100 characters or fewer.' };
  if ((f.supportingNote ?? '').length > 1000) return { ok: false, message: 'The supporting note must be 1000 characters or fewer.' };
  const priority = r.priority === undefined || r.priority === null || r.priority === '' ? 'NORMAL' : r.priority;
  if (!(PRIORITIES as readonly unknown[]).includes(priority)) return { ok: false, message: 'Choose a priority: low, normal, high or urgent.' };
  if (!(CHANNELS as readonly unknown[]).includes(r.channel)) return { ok: false, message: 'Say how the parent made the complaint: phone, WhatsApp, email, in person or another way.' };
  let receivedAt = now;
  if (r.receivedAt !== undefined && r.receivedAt !== null && r.receivedAt !== '') {
    const t = typeof r.receivedAt === 'string' ? Date.parse(r.receivedAt) : Number.NaN;
    if (Number.isNaN(t)) return { ok: false, message: 'Write the time the parent complained as a real date and time.' };
    receivedAt = new Date(t);
    if (receivedAt.getTime() > now.getTime() + 60_000) return { ok: false, message: 'The time the parent complained cannot be in the future.' };
    if (now.getTime() - receivedAt.getTime() > BACKDATE_LIMIT_DAYS * DAY) return { ok: false, message: `The complaint cannot be more than ${BACKDATE_LIMIT_DAYS} days old.` };
  }
  return {
    ok: true,
    value: {
      title: f.title, category: r.category as Category, description: f.description, priority: priority as Priority, channel: r.channel as Channel, parentName: f.parentName, receivedAt,
      subjectId: typeof r.subjectId === 'string' && r.subjectId ? r.subjectId : null, tutorUserId: typeof r.tutorUserId === 'string' && r.tutorUserId ? r.tutorUserId : null, supportingNote: f.supportingNote || null,
    },
  };
}

export interface CheckedAck { channel: Channel; note: string | null }
/** Acknowledging means telling the parent the complaint was received. The Mentor says how, and the record says when and by whom. */
export function checkAcknowledge(raw: unknown): Checked<CheckedAck> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ok: false, message: 'Send the acknowledgement.' };
  const r = raw as Record<string, unknown>;
  if (!(CHANNELS as readonly unknown[]).includes(r.channel)) return { ok: false, message: 'Say how you told the parent: phone, WhatsApp, email, in person or another way.' };
  const note = text(r.note);
  if (note === undefined || note.length > 1000) return { ok: false, message: 'The note must be text of 1000 characters or fewer.' };
  return { ok: true, value: { channel: r.channel as Channel, note: note || null } };
}

/** One piece of writing: an internal remark, an action taken, a response to the parent, or what the parent said. */
export function checkText(raw: unknown, label: string): Checked<string> {
  const v = raw && typeof raw === 'object' && !Array.isArray(raw) ? text((raw as Record<string, unknown>).text) : undefined;
  if (v === undefined) return { ok: false, message: `The ${label} must be text.` };
  if (!v) return { ok: false, message: `Write the ${label}.` };
  if (v.length > TEXT_LIMIT) return { ok: false, message: `The ${label} must be ${TEXT_LIMIT} characters or fewer.` };
  return { ok: true, value: v };
}

export interface CheckedAssign { userId: string; escalate: boolean; reason: string | null }
export function checkAssign(raw: unknown): Checked<CheckedAssign> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ok: false, message: 'Send who the complaint is for.' };
  const r = raw as Record<string, unknown>;
  if (typeof r.userId !== 'string' || !r.userId) return { ok: false, message: 'Choose the staff member.' };
  const escalate = r.escalate === true;
  const reason = text(r.reason);
  if (reason === undefined || reason.length > 1000) return { ok: false, message: 'The reason must be text of 1000 characters or fewer.' };
  if (escalate && !reason) return { ok: false, message: 'Say why the complaint is being escalated.' };
  return { ok: true, value: { userId: r.userId, escalate, reason: reason || null } };
}

export interface CheckedStatus { status: (typeof SETTABLE_STATUSES)[number]; note: string | null }
export function checkStatus(raw: unknown): Checked<CheckedStatus> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ok: false, message: 'Send the new status.' };
  const r = raw as Record<string, unknown>;
  if (!(SETTABLE_STATUSES as readonly unknown[]).includes(r.status)) return { ok: false, message: 'Choose in progress, waiting for parent or waiting for tutor. Use the other buttons to acknowledge, assign, resolve or reopen.' };
  const note = text(r.note);
  if (note === undefined || note.length > 1000) return { ok: false, message: 'The note must be text of 1000 characters or fewer.' };
  return { ok: true, value: { status: r.status as CheckedStatus['status'], note: note || null } };
}

export interface CheckedResolution { remarks: string; how: string; resolutionDate: string; communication: Communication; communicationNote: string | null }
/**
 * A complaint is resolved only with an explanation: what was concluded, how the problem was solved, when, and whether the parent
 * has been told. Nothing is filled in on the Mentor's behalf.
 */
export function checkResolution(raw: unknown, today: string, receivedDate: string): Checked<CheckedResolution> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ok: false, message: 'Send the resolution.' };
  const r = raw as Record<string, unknown>;
  const remarks = text(r.remarks);
  const how = text(r.how);
  const note = text(r.communicationNote);
  if (remarks === undefined || how === undefined || note === undefined) return { ok: false, message: 'The resolution remarks, how it was resolved and the note must be text.' };
  if (remarks.length < 10) return { ok: false, message: 'Explain how the complaint was resolved in the resolution remarks, in a few words at least.' };
  if (!how) return { ok: false, message: 'Say how the problem was resolved.' };
  if (remarks.length > TEXT_LIMIT || how.length > TEXT_LIMIT || note.length > 1000) return { ok: false, message: `The resolution text must be ${TEXT_LIMIT} characters or fewer.` };
  const resolutionDate = r.resolutionDate === undefined || r.resolutionDate === null || r.resolutionDate === '' ? today : r.resolutionDate;
  if (!isDate(resolutionDate)) return { ok: false, message: 'Choose a real resolution date, written like 2026-11-10.' };
  if (resolutionDate > today) return { ok: false, message: 'The resolution date cannot be in the future.' };
  if (resolutionDate < receivedDate) return { ok: false, message: 'The resolution date cannot be before the complaint was made.' };
  if (!(COMMUNICATION as readonly unknown[]).includes(r.communication)) return { ok: false, message: 'Say whether the parent has been told about the resolution.' };
  if (r.communication !== 'INFORMED' && !note) return { ok: false, message: 'Say why the parent has not been told yet.' };
  return { ok: true, value: { remarks, how, resolutionDate, communication: r.communication as Communication, communicationNote: note || null } };
}

export const checkReopen = (raw: unknown): Checked<string> => {
  const v = raw && typeof raw === 'object' && !Array.isArray(raw) ? text((raw as Record<string, unknown>).reason) : undefined;
  if (v === undefined) return { ok: false, message: 'The reason must be text.' };
  if (!v) return { ok: false, message: 'Say why the complaint is being reopened.' };
  if (v.length > 1000) return { ok: false, message: 'The reason must be 1000 characters or fewer.' };
  return { ok: true, value: v };
};

/** A resolved complaint can be reopened for a while after it was resolved. After that a new complaint is logged. */
export const reopenProblem = (resolvedAt: Date | null, now: Date): string | null => {
  if (!resolvedAt) return 'Only a resolved complaint can be reopened.';
  if (now.getTime() - resolvedAt.getTime() > REOPEN_WINDOW_DAYS * DAY) return `A complaint can be reopened for ${REOPEN_WINDOW_DAYS} days after it was resolved. Log a new complaint instead.`;
  return null;
};

// ─── What the parent is shown ────────────────────────────────────────────────────────────────────────────────────
export interface Entry { kind: EntryKind; visibility: 'INTERNAL' | 'PARENT'; text: string | null; at: string; by: string | null }

/** The communication history the parent can be shown: only entries meant for them, in the order they happened. */
export function parentHistory(entries: readonly Entry[]): Entry[] {
  return entries.filter((e) => e.visibility === 'PARENT').sort((a, b) => a.at.localeCompare(b.at));
}

/** How long a complaint took to resolve, from when it was made. A measurement, not a target. Null while it is open. */
export function resolutionMinutes(receivedAt: Date, resolvedAt: Date | null): number | null {
  return resolvedAt ? Math.max(0, Math.round((resolvedAt.getTime() - receivedAt.getTime()) / 60_000)) : null;
}

export const PRIORITY_FILTERS = PRIORITIES;
export const STAGE_FILTERS: readonly Stage[] = ['STARTED', 'ONGOING', 'RESOLVED'];
export const SLA_FILTERS = ['WITHIN_SLA', 'APPROACHING', 'BREACHED', 'RESOLVED'] as const;
