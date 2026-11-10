/**
 * What the complaint screens show and how what is typed is turned into a request. The API decides every status, stage, clock and
 * rule; this file only arranges what it sent and checks the obvious before asking. Dates stay plain text.
 */
export type Stage = 'STARTED' | 'ONGOING' | 'RESOLVED';
export type SlaState = 'WITHIN_SLA' | 'APPROACHING' | 'BREACHED' | 'RESOLVED';

export interface AckView {
  startedAt: string;
  dueAt: string | null;
  acknowledgedAt: string | null;
  firstResponseAt: string | null;
  state: SlaState | null;
  stateLabel: string | null;
  metSla: boolean | null;
  overdueMinutes: number;
  remainingMinutes: number;
  target: { label: string; targetMinutes: number; mode: string } | null;
}

export interface ComplaintRow {
  id: string;
  number: string;
  title: string;
  category: string;
  categoryLabel: string;
  priority: string;
  priorityLabel: string;
  activationId: string;
  studentName: string;
  parentName: string;
  status: string;
  statusLabel: string;
  stage: Stage;
  stageLabel: string;
  assignedToUserId: string | null;
  assignedToName: string | null;
  receivedAt: string;
  ack: AckView;
  resolutionMinutes: number | null;
  reopenCount: number;
}

export interface Entry { kind: string; visibility: 'INTERNAL' | 'PARENT'; text: string | null; at: string; by: string | null }

export interface ComplaintDetail extends ComplaintRow {
  description: string;
  channel: string;
  channelLabel: string;
  supportingNote: string | null;
  subjectName: string | null;
  tutorName: string | null;
  loggedAt: string;
  loggedByName: string | null;
  acknowledged: { at: string; byName: string | null; channelLabel: string | null; note: string | null } | null;
  resolution: { resolvedAt: string; resolvedByName: string | null; date: string | null; remarks: string | null; how: string | null; communication: string | null; communicationLabel: string | null; communicationNote: string | null; minutes: number | null } | null;
  resolutionNote: string;
  entries: Entry[];
  parentView: { stage: Stage; stageLabel: string; title: string; categoryLabel: string; history: Array<{ kind: string; text: string | null; at: string; by: string | null }>; note: string };
  actions: { canHandle: boolean; canAcknowledge: boolean; canRespond: boolean; canAssign: boolean; canSetStatus: boolean; canResolve: boolean; canReopen: boolean; reopenProblem: string | null };
}

export interface ComplaintList {
  rows: ComplaintRow[];
  counts: { STARTED: number; ONGOING: number; RESOLVED: number; new: number; WITHIN_SLA: number; APPROACHING: number; BREACHED: number; SLA_RESOLVED: number };
  canLog: boolean;
}

export const STAGE_TONE: Record<Stage, 'info' | 'warning' | 'success'> = { STARTED: 'info', ONGOING: 'warning', RESOLVED: 'success' };
export const SLA_TONE: Record<SlaState, 'info' | 'warning' | 'danger' | 'success'> = { WITHIN_SLA: 'info', APPROACHING: 'warning', BREACHED: 'danger', RESOLVED: 'success' };
export const PRIORITY_TONE: Record<string, 'default' | 'info' | 'warning' | 'danger'> = { LOW: 'default', NORMAL: 'info', HIGH: 'warning', URGENT: 'danger' };

export const CATEGORY_CHOICES: Array<[string, string]> = [['TUTOR', 'Tutor'], ['TIMETABLE', 'Timetable'], ['PAYMENT', 'Payment'], ['ACADEMIC_PROGRESS', 'Learning or academic progress'], ['OTHER', 'Other']];
export const PRIORITY_CHOICES: Array<[string, string]> = [['LOW', 'Low'], ['NORMAL', 'Normal'], ['HIGH', 'High'], ['URGENT', 'Urgent']];
export const CHANNEL_CHOICES: Array<[string, string]> = [['PHONE', 'Phone call'], ['WHATSAPP', 'WhatsApp message'], ['EMAIL', 'Email'], ['IN_PERSON', 'In person'], ['OTHER', 'Another way']];
export const STAGE_CHOICES: Array<[Stage, string]> = [['STARTED', 'Started'], ['ONGOING', 'Ongoing'], ['RESOLVED', 'Resolved']];
export const STATUS_CHOICES: Array<[string, string]> = [
  ['NEW', 'New'], ['ACKNOWLEDGED', 'Acknowledged'], ['ASSIGNED', 'Assigned'], ['IN_PROGRESS', 'In progress'], ['WAITING_FOR_PARENT', 'Waiting for parent'], ['WAITING_FOR_TUTOR', 'Waiting for tutor'], ['RESOLVED', 'Resolved'], ['REOPENED', 'Reopened'],
];
export const SETTABLE_STATUS_CHOICES: Array<[string, string]> = [['IN_PROGRESS', 'In progress'], ['WAITING_FOR_PARENT', 'Waiting for parent'], ['WAITING_FOR_TUTOR', 'Waiting for tutor']];
export const SLA_CHOICES: Array<[SlaState, string]> = [['WITHIN_SLA', 'Within SLA'], ['APPROACHING', 'Approaching SLA'], ['BREACHED', 'SLA breached'], ['RESOLVED', 'Resolved']];
export const COMMUNICATION_CHOICES: Array<[string, string]> = [['INFORMED', 'The parent has been told'], ['NOT_YET_INFORMED', 'The parent has not been told yet'], ['NOT_REACHABLE', 'The parent could not be reached']];

export const ENTRY_LABELS: Record<string, string> = {
  LOGGED: 'Complaint recorded', ACKNOWLEDGED: 'Acknowledged', INTERNAL_REMARK: 'Internal remark', ACTION_TAKEN: 'Action taken', PARENT_RESPONSE: 'Response to the parent', PARENT_MESSAGE: 'Message from the parent',
  STATUS_CHANGED: 'Status changed', ASSIGNED: 'Assigned', ESCALATED: 'Escalated', RESOLVED: 'Resolved', REOPENED: 'Reopened',
};

/** A length of time in words, for the clock and the resolution time. */
export function minutesText(minutes: number): string {
  if (minutes < 1) return 'under a minute';
  const d = Math.floor(minutes / 1440);
  const h = Math.floor((minutes % 1440) / 60);
  const m = minutes % 60;
  return [d && `${d} ${d === 1 ? 'day' : 'days'}`, h && `${h} h`, m && !d && `${m} min`].filter(Boolean).join(' ');
}

/** What the acknowledgement clock says, in one sentence. */
export function ackText(a: AckView): string {
  if (!a.state) return 'No response target is set.';
  const target = a.target ? `${a.target.label}, ${minutesText(a.target.targetMinutes)} of ${a.target.mode === 'WORKING_HOURS' ? 'working hours' : 'calendar hours'}` : '';
  if (a.state === 'RESOLVED') return `${a.metSla === false ? `Answered late, ${minutesText(a.overdueMinutes)} over the target` : 'Answered within the target'}. ${target}.`;
  if (a.state === 'BREACHED') return `${minutesText(a.overdueMinutes)} past the target. ${target}.`;
  return `${minutesText(a.remainingMinutes)} left. ${target}.`;
}

// ─── A complaint, as it is being logged ─────────────────────────────────────────────────────────────────────────
export interface ComplaintDraft { title: string; category: string; priority: string; channel: string; parentName: string; description: string; supportingNote: string; receivedAtLocal: string }
export const emptyComplaintDraft = (parentName = ''): ComplaintDraft => ({ title: '', category: '', priority: 'NORMAL', channel: '', parentName, description: '', supportingNote: '', receivedAtLocal: '' });

/** The time typed in the browser, as an exact moment. Empty means now. */
export function isoFromLocal(value: string): string | undefined {
  if (!value) return undefined;
  const t = new Date(value);
  return Number.isNaN(t.getTime()) ? undefined : t.toISOString();
}

export function complaintProblems(d: ComplaintDraft): string[] {
  const out: string[] = [];
  if (!d.title.trim()) out.push('a title');
  if (!d.category) out.push('the category');
  if (!d.description.trim()) out.push('what the parent complained about');
  if (!d.parentName.trim()) out.push('the name of the parent');
  if (!d.channel) out.push('how the parent made the complaint');
  if (d.receivedAtLocal && isoFromLocal(d.receivedAtLocal) === undefined) out.push('a real date and time');
  return out;
}

export const payloadOfComplaint = (d: ComplaintDraft): Record<string, unknown> => ({
  title: d.title, category: d.category, priority: d.priority, channel: d.channel, parentName: d.parentName, description: d.description, supportingNote: d.supportingNote || undefined, receivedAt: isoFromLocal(d.receivedAtLocal),
});

// ─── The resolution, as it is being typed ───────────────────────────────────────────────────────────────────────
export interface ResolutionDraft { remarks: string; how: string; resolutionDate: string; communication: string; communicationNote: string }
export const emptyResolutionDraft = (): ResolutionDraft => ({ remarks: '', how: '', resolutionDate: '', communication: '', communicationNote: '' });

/** What is plainly missing for the complaint to be resolved. The server decides. */
export function resolutionProblems(d: ResolutionDraft): string[] {
  const out: string[] = [];
  if (d.remarks.trim().length < 10) out.push('the resolution remarks, explaining how it was resolved');
  if (!d.how.trim()) out.push('how the problem was resolved');
  if (!d.communication) out.push('whether the parent has been told');
  else if (d.communication !== 'INFORMED' && !d.communicationNote.trim()) out.push('why the parent has not been told yet');
  return out;
}
export const payloadOfResolution = (d: ResolutionDraft): Record<string, unknown> => ({ remarks: d.remarks, how: d.how, resolutionDate: d.resolutionDate || undefined, communication: d.communication, communicationNote: d.communicationNote });
