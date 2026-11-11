/**
 * What the Mentor dashboard shows and how its filters become a request. The API counts every card and opens its records; this file
 * only arranges what it sent. Nothing here filters a list that was already loaded.
 */
export type Group = 'students' | 'classes' | 'exams' | 'meetings' | 'complaints' | 'sla';
export type Panel = 'checklist' | 'classes' | 'exams' | 'review' | 'complaints';

export interface Card { key: string; group: Group; label: string; count: number }
export interface Summary { asOf: string; today: string; window: { from: string; to: string } | null; cards: Card[]; notRecorded: Array<{ label: string; reason: string }> }
export interface DashRow {
  id: string;
  kind: string;
  activationId: string | null;
  studentName: string;
  studentId: string | null;
  title: string;
  subjectName: string | null;
  tutorName: string | null;
  date: string | null;
  status: string;
  priority: string | null;
  slaState: string | null;
  panel: Panel | null;
}
export interface Records { key: string; label: string; total: number; page: number; pageSize: number; pages: number; rows: DashRow[] }

export const GROUPS: Array<[Group, string]> = [['students', 'Students'], ['classes', 'Daily classes'], ['exams', 'Weekly exams'], ['meetings', 'Monthly meetings'], ['complaints', 'Parent complaints'], ['sla', 'Response time']];
export const attention = (key: string) => /breached|awaiting|pending|overdue|reexam|new|approaching|needing|waiting|not_conducted|voice/.test(key);

export interface DashFilters {
  studentQuery: string;
  period: string;
  date: string;
  from: string;
  to: string;
  classState: string;
  examState: string;
  meetingState: string;
  complaintCategory: string;
  complaintStatus: string;
  priority: string;
  slaState: string;
}
export const emptyFilters = (): DashFilters => ({ studentQuery: '', period: '', date: '', from: '', to: '', classState: '', examState: '', meetingState: '', complaintCategory: '', complaintStatus: '', priority: '', slaState: '' });

/** The filters as a query string. Empty ones are left out, and everything is encoded. */
export function queryOf(f: DashFilters, extra: Record<string, string | number> = {}): string {
  const parts = Object.entries({ ...f, ...extra }).filter(([, v]) => v !== '' && v !== undefined).map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`);
  return parts.length ? `?${parts.join('&')}` : '';
}
export const filtersActive = (f: DashFilters) => Object.values(f).some((v) => v !== '');

export const CLASS_STATES: Array<[string, string]> = [
  ['SCHEDULED', 'Scheduled'], ['REMINDER_PENDING', 'Reminder pending'], ['REMINDER_SENT', 'Reminder sent'], ['AWAITING_TUTOR_UPDATE', 'Awaiting tutor update'], ['AWAITING_MENTOR_VERIFICATION', 'Awaiting Mentor verification'],
  ['RETURNED_FOR_CORRECTION', 'Returned for correction'], ['VERIFIED', 'Verified'], ['NOT_CONDUCTED', 'Not conducted'], ['RESCHEDULED', 'Rescheduled'], ['CANCELLED', 'Cancelled'],
];
export const EXAM_STATES: Array<[string, string]> = [
  ['SCHEDULED', 'Scheduled'], ['REMINDER_PENDING', 'Reminder pending'], ['READY_FOR_EXAM', 'Ready for exam'], ['RESCHEDULED', 'Rescheduled'], ['AWAITING_PAPER_COLLECTION', 'Awaiting paper collection'], ['AWAITING_EVALUATION', 'Awaiting evaluation'],
  ['MARKS_PENDING', 'Marks pending'], ['AWAITING_PARENT_SHARING', 'Awaiting parent sharing'], ['RE_EXAM_REQUIRED', 'Re-exam required'], ['COMPLETED', 'Completed'],
];
export const MEETING_STATES: Array<[string, string]> = [['SCHEDULED', 'Scheduled'], ['RESCHEDULED', 'Rescheduled'], ['NOT_CONDUCTED', 'Not conducted'], ['REVIEW_IN_PROGRESS', 'Meeting held, review not complete']];
export const COMPLAINT_CATEGORIES: Array<[string, string]> = [['TUTOR', 'Tutor'], ['TIMETABLE', 'Timetable'], ['PAYMENT', 'Payment'], ['ACADEMIC_PROGRESS', 'Learning or academic progress'], ['OTHER', 'Other']];
export const COMPLAINT_STATUSES: Array<[string, string]> = [['NEW', 'New'], ['ACKNOWLEDGED', 'Acknowledged'], ['ASSIGNED', 'Assigned'], ['IN_PROGRESS', 'In progress'], ['WAITING_FOR_PARENT', 'Waiting for parent'], ['WAITING_FOR_TUTOR', 'Waiting for tutor'], ['RESOLVED', 'Resolved'], ['REOPENED', 'Reopened']];
export const PRIORITIES: Array<[string, string]> = [['LOW', 'Low'], ['NORMAL', 'Normal'], ['HIGH', 'High'], ['URGENT', 'Urgent']];
export const SLA_STATES: Array<[string, string]> = [['WITHIN_SLA', 'Within SLA'], ['APPROACHING', 'Approaching SLA'], ['BREACHED', 'SLA breached'], ['RESOLVED', 'Resolved']];
export const PERIODS: Array<[string, string]> = [['day', 'Day'], ['week', 'Week'], ['month', 'Month']];

/** The daily class cards. Each opens the Daily classes page on exactly the classes it counted. */
export const CLASS_CARD_KEYS: readonly string[] = ['classes_today', 'classes_upcoming', 'classes_awaiting_update', 'classes_awaiting_verification', 'classes_verified', 'classes_not_conducted', 'classes_rescheduled', 'classes_voice_pending', 'classes_conducted', 'classes_awaiting_activities', 'classes_cancelled'];

const plusDays = (iso: string, n: number) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

/**
 * The Daily classes address for a card: the dates the dashboard counted over (its window, or today and the next seven days when it
 * has none), the card itself, and the filters the dashboard had, so the list matches the number on the card. Null for any other card.
 * The Mentor filter is passed on when one is known; the dashboard shows each Mentor their own students and the Head everyone.
 */
export function classCardHref(card: Pick<Card, 'key'>, summary: Pick<Summary, 'today' | 'window'>, f: Pick<DashFilters, 'classState' | 'studentQuery'>, mentorUserId = ''): string | null {
  if (!CLASS_CARD_KEYS.includes(card.key)) return null;
  const w = summary.window ?? { from: summary.today, to: plusDays(summary.today, 7) };
  const parts: Array<[string, string]> = [['from', w.from], ['to', w.to], ['card', card.key], ['state', f.classState], ['studentQuery', f.studentQuery], ['mentorUserId', mentorUserId]];
  return `/mentoring/classes?${parts.filter(([, v]) => v !== '').map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&')}`;
}

/** Where a record opens: the student page, on the panel that holds it. */
export function hrefOf(r: Pick<DashRow, 'activationId' | 'panel'>): string | null {
  if (!r.activationId) return null;
  return `/mentoring/students/${r.activationId}${r.panel && r.panel !== 'checklist' ? `?panel=${r.panel}` : ''}`;
}

export const PANELS: readonly Panel[] = ['checklist', 'classes', 'exams', 'review', 'complaints'];
export const panelOf = (value: unknown): Panel | undefined => (typeof value === 'string' && (PANELS as readonly string[]).includes(value) ? (value as Panel) : undefined);

export const pageText = (r: Pick<Records, 'total' | 'page' | 'pageSize'>) => {
  if (r.total === 0) return 'No records';
  const from = (r.page - 1) * r.pageSize + 1;
  return `${from} to ${Math.min(r.total, r.page * r.pageSize)} of ${r.total}`;
};
