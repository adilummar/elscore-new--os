/**
 * What the Stage 3 timetable page shows and how it lays it out. The API decides every class, date, tutor and warning; this
 * file only arranges what it sent. Dates stay plain YYYY-MM-DD text so no time zone can move a class to another day.
 */
export type TimetableViewName = 'weekly' | 'biweekly' | 'monthly';
export type TimetableStatus = 'DRAFT' | 'READY_FOR_REVIEW' | 'PENDING_MENTOR_APPROVAL' | 'APPROVED' | 'CONFLICT_DETECTED';

export interface TimetableEvent {
  id: string;
  date: string;
  subjectId: string;
  subjectName: string;
  gradeName: string;
  tutorProfileId: string | null;
  tutorName: string | null;
  startMinute: number;
  endMinute: number;
  durationMinutes: number;
  frequency: 'WEEKLY' | 'BIWEEKLY' | 'MONTHLY';
  frequencyLabel: string;
  recurrence: string;
  week: 1 | 2 | null;
  assignmentState: 'ASSIGNED' | 'NEEDS_REVIEW' | 'NO_TUTOR';
  availability: { status: string; reason: string } | null;
  classStatus: 'SCHEDULED' | 'CANCELLED' | 'RESCHEDULED' | 'MOVED_HERE';
  overlaps: string[];
  problems: string[];
  notes: string[];
  /** From the stored class record the tutor and Mentor views read too. Absent from older answers. */
  consumption?: 'CONSUMED' | 'NOT_CONSUMED';
  classRecordStatus?: string | null;
}

/** What the stored class record says about this class, in words. Nothing is shown for a class that nothing has happened to. */
export function recordLabel(e: Pick<TimetableEvent, 'consumption' | 'classRecordStatus'>): string | null {
  if (e.classRecordStatus === 'CANCELLED') return 'Cancelled, not consumed';
  if (e.consumption === 'CONSUMED') return 'Consumed, verified by the Mentor';
  if (e.classRecordStatus === 'NOT_CONDUCTED') return 'Not conducted, not consumed';
  if (e.classRecordStatus) return 'Not consumed until the Mentor verifies it';
  return null;
}

export interface TimetableData {
  student: { id: string; name: string };
  view: TimetableViewName;
  period: { view: TimetableViewName; from: string; to: string; month: string | null };
  timeZone: string;
  status: TimetableStatus;
  summary: { totalSubjects: number; scheduledSessions: number; teachingMinutes: number; assignedTutors: number; incompleteSubjects: number; subjectsWithoutTutor: number; unresolvedConflicts: number; tutorIssues: number };
  subjects: Array<{ subjectId: string; subjectName: string; gradeName: string; frequencyLabel: string; startDate: string | null; sessions: string[]; tutorProfileId: string | null; tutorName: string | null; assignmentState: TimetableEvent['assignmentState'] }>;
  warnings: Array<{ subjectId: string; subjectName: string; kind: string; message: string }>;
  events: TimetableEvent[];
  approval: { state: string | null; stageStatus: string | null };
  canViewTutorProfile: boolean;
}

export const STATUS_LABELS: Record<TimetableStatus, string> = {
  DRAFT: 'Draft',
  READY_FOR_REVIEW: 'Ready for review',
  PENDING_MENTOR_APPROVAL: 'Pending Mentor approval',
  APPROVED: 'Approved',
  CONFLICT_DETECTED: 'Conflict detected',
};

export const ASSIGNMENT_LABELS: Record<TimetableEvent['assignmentState'], string> = { ASSIGNED: 'Tutor assigned', NEEDS_REVIEW: 'Tutor needs review', NO_TUTOR: 'No tutor selected' };
export const CLASS_STATUS_LABELS: Record<TimetableEvent['classStatus'], string> = { SCHEDULED: 'Scheduled', CANCELLED: 'Cancelled', RESCHEDULED: 'Moved to another date', MOVED_HERE: 'Moved here' };

// ─── Dates ───────────────────────────────────────────────────────────────────────────────────────────────────────
const DAY_MS = 86_400_000;
const utc = (d: string) => new Date(`${d}T00:00:00Z`);
export const isoOf = (d: Date) => d.toISOString().slice(0, 10);
export const addDays = (d: string, n: number) => isoOf(new Date(utc(d).getTime() + n * DAY_MS));
export const mondayOf = (d: string) => addDays(d, -((utc(d).getUTCDay() + 6) % 7));
export const weekdayName = (d: string) => ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][utc(d).getUTCDay()];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export const dayLabel = (d: string) => `${weekdayName(d).slice(0, 3)} ${utc(d).getUTCDate()} ${MONTHS[utc(d).getUTCMonth()].slice(0, 3)}`;
export const longDayLabel = (d: string) => `${weekdayName(d)}, ${utc(d).getUTCDate()} ${MONTHS[utc(d).getUTCMonth()]} ${utc(d).getUTCFullYear()}`;
export const datesOf = (from: string, to: string): string[] => {
  const out: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
};

/** The heading for a period: "9 November to 15 November 2026", or "November 2026". */
export function periodTitle(p: TimetableData['period']): string {
  if (p.view === 'monthly' && p.month) return `${MONTHS[Number(p.month.slice(5, 7)) - 1]} ${p.month.slice(0, 4)}`;
  const part = (d: string) => `${utc(d).getUTCDate()} ${MONTHS[utc(d).getUTCMonth()]}`;
  return `${part(p.from)} to ${part(p.to)} ${utc(p.to).getUTCFullYear()}`;
}

/** The date to ask the API for when going to the previous or next period. */
export function shiftDate(view: TimetableViewName, date: string, direction: 1 | -1): string {
  if (view === 'weekly') return addDays(date, 7 * direction);
  if (view === 'biweekly') return addDays(date, 14 * direction);
  const [y, m] = date.split('-').map(Number);
  return isoOf(new Date(Date.UTC(y, m - 1 + direction, 1)));
}

/** Weeks of seven dates, Monday first, for the month grid. */
export function monthWeeks(from: string, to: string): string[][] {
  const days = datesOf(from, to);
  const weeks: string[][] = [];
  for (let i = 0; i < days.length; i += 7) weeks.push(days.slice(i, i + 7));
  return weeks;
}

// ─── Layout ──────────────────────────────────────────────────────────────────────────────────────────────────────
export const eventsOn = (events: readonly TimetableEvent[], date: string) => events.filter((e) => e.date === date).sort((a, b) => a.startMinute - b.startMinute || a.subjectName.localeCompare(b.subjectName));

/** One colour per subject, the same every time for the same student. */
export const SUBJECT_COLOURS = [
  { box: 'border-sky-300 bg-sky-50 text-sky-950', dot: 'bg-sky-500' },
  { box: 'border-emerald-300 bg-emerald-50 text-emerald-950', dot: 'bg-emerald-500' },
  { box: 'border-violet-300 bg-violet-50 text-violet-950', dot: 'bg-violet-500' },
  { box: 'border-amber-300 bg-amber-50 text-amber-950', dot: 'bg-amber-500' },
  { box: 'border-rose-300 bg-rose-50 text-rose-950', dot: 'bg-rose-500' },
  { box: 'border-teal-300 bg-teal-50 text-teal-950', dot: 'bg-teal-500' },
  { box: 'border-indigo-300 bg-indigo-50 text-indigo-950', dot: 'bg-indigo-500' },
  { box: 'border-orange-300 bg-orange-50 text-orange-950', dot: 'bg-orange-500' },
];
export const colourFor = (subjectId: string, subjectIds: readonly string[]) => SUBJECT_COLOURS[[...subjectIds].sort().indexOf(subjectId) % SUBJECT_COLOURS.length] ?? SUBJECT_COLOURS[0];

export interface Placed { event: TimetableEvent; lane: number; lanes: number }

/** Puts classes of one day side by side when they overlap, so none is hidden behind another. */
export function placeDay(day: readonly TimetableEvent[]): Placed[] {
  const sorted = [...day].sort((a, b) => a.startMinute - b.startMinute || a.endMinute - b.endMinute);
  const out: Placed[] = [];
  let cluster: Placed[] = [];
  let clusterEnd = -1;
  const close = () => {
    const lanes = Math.max(1, ...cluster.map((p) => p.lane + 1));
    for (const p of cluster) p.lanes = lanes;
    out.push(...cluster);
    cluster = [];
  };
  for (const event of sorted) {
    if (cluster.length && event.startMinute >= clusterEnd) close();
    const taken = new Set(cluster.filter((p) => p.event.endMinute > event.startMinute).map((p) => p.lane));
    let lane = 0;
    while (taken.has(lane)) lane++;
    cluster.push({ event, lane, lanes: 1 });
    clusterEnd = Math.max(clusterEnd, event.endMinute);
  }
  if (cluster.length) close();
  return out;
}

/** The hours the week grid covers: 8 AM to 8 PM, widened to fit any class outside that. */
export function hourSpan(events: readonly TimetableEvent[]): { from: number; to: number } {
  const live = events.filter((e) => e.classStatus !== 'CANCELLED');
  const from = Math.min(8, ...live.map((e) => Math.floor(e.startMinute / 60)));
  const to = Math.max(20, ...live.map((e) => Math.ceil(e.endMinute / 60)));
  return { from, to };
}

export const countsAsClass = (e: TimetableEvent) => e.classStatus === 'SCHEDULED' || e.classStatus === 'MOVED_HERE';
export const hoursText = (minutes: number) => {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h && m ? `${h} h ${m} min` : h ? `${h} h` : `${m} min`;
};
