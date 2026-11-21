/**
 * What the Mentor Portal Students list and Student Workspace show, and how their filters become a request. The API decides every figure,
 * every class record and who may see what; this file only arranges what it sent. A figure the API could not determine arrives as null
 * and is shown as "Unavailable", never as zero.
 */
export type Tone = 'grey' | 'blue' | 'amber' | 'red' | 'neutral';

export interface Balance {
  allocatedMinutes: number | null;
  consumedMinutes: number;
  scheduledMinutes: number | null;
  pendingMinutes: number;
  remainingMinutes: number | null;
  over: boolean;
  consumedClasses: number;
  scheduledClasses: number | null;
  band?: string;
}
export interface HubRow {
  activationId: string;
  studentId: string | null;
  name: string;
  photoUrl: string | null;
  grade: string | null;
  level: string | null;
  subjects: string[];
  tutors: string[];
  mentor: { userId: string | null; name: string | null };
  isMine: boolean;
  activatedAt: string | null;
  status: string;
  statusLabel: string;
  balance: Balance;
  nextClass: { date: string; startMinute: number; subjectName: string } | null;
  nextExam: { date: string; startMinute: number; title: string } | null;
  nextMeeting: { date: string; startMinute: number | null } | null;
  pending: { verification: number; complaints: number; tasks: number; total: number };
}
export interface HubList {
  period: { from: string; to: string };
  today: string;
  total: number;
  page: number;
  pageSize: number;
  pages: number;
  rows: HubRow[];
  options: { grades: string[]; subjects: Array<{ id: string; name: string }>; mentors: Array<{ userId: string; name: string }> };
  allocationNote: string;
}
export interface ClassRecord {
  key: string;
  sessionId: string | null;
  date: string;
  startMinute: number;
  endMinute: number;
  scheduledMinutes: number;
  subjectId: string;
  subjectName: string;
  tutorName: string;
  status: string;
  state: string;
  stateLabel: string;
  tone: Tone;
  moved: boolean;
  consumption: 'CONSUMED' | 'NOT_CONSUMED';
  verifiedMinutes: number | null;
  tutorSubmitted: boolean;
  voiceUploaded: boolean;
  returned: { reason: string; kind: string } | null;
  cancelled: { at: string; reason: string } | null;
}
export interface ClassCounts { records: number; consumedClasses: number; consumedMinutes: number; upcoming: number; awaitingTutor: number; awaitingMentor: number; returned: number; notConducted: number; cancelled: number }
export interface ClassesData { today: string; period: { from: string; to: string }; canVerify: boolean; balance: Balance; counts: { allTime: ClassCounts; period: ClassCounts }; records: ClassRecord[]; truncated: boolean; note: string }
export interface WorkspaceData {
  today: string;
  period: { from: string; to: string };
  header: {
    activationId: string; name: string; studentId: string | null; photoUrl: string | null; grade: string | null; level: string | null; curriculum: string | null; school: string | null; status: string; statusLabel: string; activatedAt: string | null;
    mentor: { userId: string | null; name: string | null }; group: string | null; parent: { name: string; phone: string | null } | null; parentHidden: boolean;
  };
  viewer: { isMentor: boolean; canVerify: boolean; canEditProfile: boolean; seesAll: boolean; readOnly: boolean };
  balance: Balance;
  cards: {
    nextClass: { date: string; startMinute: number; subjectName: string } | null; openComplaints: number; upcomingExams: number; pendingWorkflow: boolean;
    recentClasses: Array<{ key: string; date: string; startMinute: number; subjectName: string; stateLabel: string; tone: Tone }>;
    upcomingClasses: number; awaitingTutorUpdate: number; awaitingMentorVerification: number; returnedForCorrection: number;
    nextExam: HubRow['nextExam']; nextMeeting: HubRow['nextMeeting']; pending: HubRow['pending'];
    learningPlan: { status: string | null; start: string | null; endsOn: string | null } | null;
  };
  tutors: Array<{ subjectId: string; subjectName: string; tutorProfileId: string; tutorName: string; status: string; sessions: string[]; meetLink: string | null }>;
  allocationNote: string;
}

/** Class colours. Cancelled is neutral and outlined, never grey, so it cannot be mistaken for a consumed class. Each also has a text label, so colour is never the only signal. */
export const TONES: Record<Tone, { label: string; chip: string; bar: string }> = {
  grey: { label: 'Verified and consumed', chip: 'bg-slate-200 text-slate-800 border-slate-300', bar: 'border-l-slate-500' },
  blue: { label: 'Upcoming', chip: 'bg-blue-50 text-blue-800 border-blue-200', bar: 'border-l-blue-500' },
  amber: { label: 'Awaiting tutor or Mentor', chip: 'bg-amber-50 text-amber-900 border-amber-300', bar: 'border-l-amber-500' },
  red: { label: 'Missed, returned or exception', chip: 'bg-red-50 text-red-800 border-red-200', bar: 'border-l-red-500' },
  neutral: { label: 'Cancelled', chip: 'bg-white text-slate-600 border-dashed border-slate-400', bar: 'border-l-transparent border-dashed' },
};
export const TONE_ORDER: Tone[] = ['grey', 'blue', 'amber', 'red', 'neutral'];

/** Minutes as hours and minutes. Null is n/a, never 0. */
export function minutesText(minutes: number | null | undefined): string {
  if (minutes === null || minutes === undefined) return 'n/a';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h && m ? `${h} h ${m} min` : h ? `${h} h` : `${m} min`;
}

const pad = (n: number) => String(n).padStart(2, '0');
export const clock = (minute: number) => `${pad(Math.floor(minute / 60))}:${pad(minute % 60)}`;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** 2026-11-09 as "9 Nov 2026". Plain text, so no time zone moves a class to another day. */
export function dateText(iso: string | null | undefined): string {
  if (!iso) return 'Not set';
  const d = iso.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return 'Not set';
  return `${Number(d.slice(8, 10))} ${MONTHS[Number(d.slice(5, 7)) - 1]} ${d.slice(0, 4)}`;
}
export const whenText = (x: { date: string; startMinute: number | null } | null): string => (x ? `${dateText(x.date)}${x.startMinute === null ? '' : `, ${clock(x.startMinute)}`}` : 'None scheduled');
export const initialsOf = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase()).join('') || '?';

export const CONSUMPTION_CHOICES: Array<[string, string]> = [['NOT_STARTED', 'Nothing consumed yet'], ['IN_PROGRESS', 'Partly consumed'], ['FULLY_CONSUMED', 'Fully consumed'], ['UNAVAILABLE', 'No allocation recorded']];
export const STATUS_CHOICES: Array<[string, string]> = [['ACTIVATED', 'Active'], ['ACTIVATION_IN_PROGRESS', 'Activation in progress'], ['ACTIVATION_ON_HOLD', 'On hold'], ['ACTIVATION_BLOCKED', 'Blocked'], ['PENDING_FINAL_APPROVAL', 'Waiting for final approval']];
export const SORT_CHOICES: Array<[string, string]> = [['name', 'Name'], ['studentId', 'Student ID'], ['grade', 'Grade'], ['activatedAt', 'Activation date'], ['status', 'Status'], ['consumed', 'Classes consumed'], ['remaining', 'Classes remaining'], ['nextClass', 'Next class']];

export interface ListFilters {
  search: string; grade: string; subjectId: string; status: string; consumption: string; pendingVerification: boolean; upcomingExam: boolean; mentorUserId: string; sort: string; dir: 'asc' | 'desc'; page: number; pageSize: number;
}
export const emptyListFilters = (): ListFilters => ({ search: '', grade: '', subjectId: '', status: '', consumption: '', pendingVerification: false, upcomingExam: false, mentorUserId: '', sort: 'name', dir: 'asc', page: 1, pageSize: 25 });

/** The filters as the API query. Empty ones are left out, and everything is encoded. */
export function listQuery(f: ListFilters): string {
  const parts: Array<[string, string]> = [['search', f.search.trim()], ['grade', f.grade], ['subjectId', f.subjectId], ['status', f.status], ['consumption', f.consumption], ['mentorUserId', f.mentorUserId], ['sort', f.sort], ['dir', f.dir], ['page', String(f.page)], ['pageSize', String(f.pageSize)]];
  if (f.pendingVerification) parts.push(['pendingVerification', 'true']);
  if (f.upcomingExam) parts.push(['upcomingExam', 'true']);
  return parts.filter(([, v]) => v !== '').map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&');
}

/** The Students list address a dashboard shortcut opens, with the filters applied. */
export function studentsHref(f: Partial<Pick<ListFilters, 'status' | 'consumption' | 'pendingVerification' | 'upcomingExam' | 'search' | 'grade' | 'subjectId'>> = {}): string {
  const parts: Array<[string, string]> = [['status', f.status ?? ''], ['consumption', f.consumption ?? ''], ['search', f.search ?? ''], ['grade', f.grade ?? ''], ['subjectId', f.subjectId ?? '']];
  if (f.pendingVerification) parts.push(['pendingVerification', 'true']);
  if (f.upcomingExam) parts.push(['upcomingExam', 'true']);
  const q = parts.filter(([, v]) => v !== '').map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&');
  return `/mentoring/students${q ? `?${q}` : ''}`;
}

/** The list filters a link carries, read from the page address. Anything unrecognised is dropped. */
export function filtersFromParams(get: (k: string) => string | null | undefined): ListFilters {
  const f = emptyListFilters();
  f.search = get('search') ?? '';
  f.grade = get('grade') ?? '';
  f.subjectId = get('subjectId') ?? '';
  const status = get('status') ?? '';
  f.status = STATUS_CHOICES.some(([k]) => k === status) ? status : '';
  const consumption = get('consumption') ?? '';
  f.consumption = CONSUMPTION_CHOICES.some(([k]) => k === consumption) ? consumption : '';
  f.pendingVerification = get('pendingVerification') === 'true';
  f.upcomingExam = get('upcomingExam') === 'true';
  return f;
}

/** A student still being onboarded opens on the activation workflow; an active one opens on the journey. */
export const rowHref = (r: Pick<HubRow, 'activationId' | 'status'>): string => `/mentoring/students/${r.activationId}${r.status === 'ACTIVATED' ? '' : '?panel=checklist'}`;

export const TABS = [
  ['overview', 'Overview'], ['classes', 'Classes'], ['timetable', 'Timetable'], ['exams', 'Exams'], ['complaints', 'Complaints'], ['profile', 'Profile Details'],
  ['tutors', 'Tutors'], ['plan', 'Learning Plan'], ['communication', 'Communication'], ['activation', 'Activation History'], ['audit', 'Audit History'],
] as const;
export type TabKey = (typeof TABS)[number][0];
export const tabOf = (value: unknown): TabKey => (TABS.find(([k]) => k === value)?.[0] ?? 'overview');

/** The older student page panels that now live in a tab. The activation checklist and tasks stay on the older page. */
export const TAB_FOR_PANEL: Record<string, TabKey> = { classes: 'classes', exams: 'exams', review: 'plan', complaints: 'complaints', history: 'activation' };
/** The sections of a student that the sidebar links to (?panel=), in order. */
export const WORKSPACE_PANELS = ['checklist', 'classes', 'exams', 'review', 'complaints', 'tasks', 'history'] as const;
export type WorkspacePanel = (typeof WORKSPACE_PANELS)[number];
/** The panel an address asks for. Anything else is not a panel. */
export const workspacePanelOf = (value: unknown): WorkspacePanel | undefined =>
  typeof value === 'string' && (WORKSPACE_PANELS as readonly string[]).includes(value) ? (value as WorkspacePanel) : undefined;

/** Whether the address asks for the activation workflow page. Anything else opens the workspace. */
export const wantsActivationWorkflow = (panel: unknown): boolean => panel === 'checklist' || panel === 'tasks';

/** Events that record an edit to profile information. They are the audit trail; every other event belongs to the activation history. */
export const isAuditEvent = (type: string): boolean => type.startsWith('HANDOVER_FIELD_');

export type Window = 'week' | 'month' | 'all';
const iso = (d: Date) => d.toISOString().slice(0, 10);
const utc = (d: string) => new Date(`${d}T00:00:00Z`);
/** The first and last day shown for a week (Monday to Sunday) or a month around a date. 'all' has no limits. */
export function windowOf(view: Window, anchor: string): { from: string; to: string } | null {
  if (view === 'all') return null;
  if (view === 'month') {
    const y = Number(anchor.slice(0, 4));
    const m = Number(anchor.slice(5, 7));
    return { from: `${anchor.slice(0, 7)}-01`, to: iso(new Date(Date.UTC(y, m, 0))) };
  }
  const d = utc(anchor);
  const mon = new Date(d.getTime() - ((d.getUTCDay() + 6) % 7) * 86_400_000);
  return { from: iso(mon), to: iso(new Date(mon.getTime() + 6 * 86_400_000)) };
}
/** Moves the anchor one week or one month. */
export function shiftAnchor(view: Window, anchor: string, dir: 1 | -1): string {
  const d = utc(anchor);
  if (view === 'month') return iso(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + dir, 1)));
  return iso(new Date(d.getTime() + dir * 7 * 86_400_000));
}
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
export const weekdayOf = (d: string) => WEEKDAYS[utc(d).getUTCDay()];
/** Whole days from one date to another, so a next class can be described without a clock or a time zone. */
export const daysUntil = (from: string, to: string) => Math.round((utc(to).getTime() - utc(from).getTime()) / 86_400_000);
export function untilText(today: string, date: string): string {
  const n = daysUntil(today, date);
  return n === 0 ? 'today' : n === 1 ? 'tomorrow' : n > 1 ? `in ${n} days` : `${-n} days ago`;
}

/**
 * Which profile a student opens. Only an activated student gets the operational workspace; anyone whose activation is still open
 * (in progress, on hold, blocked, waiting for final approval) gets the existing seven-stage activation workspace.
 */
export const profileModeOf = (status: string): 'OPERATIONS' | 'ACTIVATION' => (status === 'ACTIVATED' ? 'OPERATIONS' : 'ACTIVATION');

/** Each kind of pending item on a student opens the place where it is dealt with. */
export function pendingLinks(r: { activationId: string; name: string; pending: { verification: number; complaints: number; tasks: number } }): Array<{ key: 'verification' | 'complaints' | 'tasks'; label: string; href: string }> {
  const out: Array<{ key: 'verification' | 'complaints' | 'tasks'; label: string; href: string }> = [];
  if (r.pending.verification > 0) out.push({ key: 'verification', label: `${r.pending.verification} to verify`, href: `/mentoring/classes?card=classes_awaiting_verification&studentQuery=${encodeURIComponent(r.name)}` });
  if (r.pending.complaints > 0) out.push({ key: 'complaints', label: `${r.pending.complaints} ${r.pending.complaints === 1 ? 'complaint' : 'complaints'}`, href: `/mentoring/students/${r.activationId}?tab=complaints` });
  if (r.pending.tasks > 0) out.push({ key: 'tasks', label: `${r.pending.tasks} ${r.pending.tasks === 1 ? 'task' : 'tasks'}`, href: `/mentoring/students/${r.activationId}?panel=checklist` });
  return out;
}
