/**
 * Daily classes: which classes happen on a date, what the tutor must report, what state a class is in, and what a verified
 * class is worth. Pure rules, no database and no framework.
 *
 * A class exists because a tutor assignment's own recurrence rule produces it on that date (less any cancelled or moved
 * occurrence). Nothing here creates a class: the service stores a row only when something happens to one.
 */
import { formatRange } from '../tutor/tutor-availability';
import { datesBetween, isDateString, occursOn } from '../tutor/tutor-calendar';

import { WorkingPolicy, clockMinutes, zonedInstant } from './mentoring-sla';

// ─── Words and lists ─────────────────────────────────────────────────────────────────────────────────────────────
export const ACTIVITIES = [
  ['EDUCATIONAL_GAMES', 'Educational games'], ['WORKSHEET', 'Worksheet'], ['PRACTICE_QUESTIONS', 'Practice questions'], ['READING', 'Reading activity'], ['WRITING', 'Writing activity'],
  ['REVISION', 'Revision'], ['QUIZ', 'Quiz'], ['PROBLEM_SOLVING', 'Problem solving'], ['GROUP_DISCUSSION', 'Group discussion'], ['PRACTICAL', 'Practical activity'],
  ['HOMEWORK', 'Homework'], ['PROJECT_WORK', 'Project work'], ['OTHER', 'Other'],
] as const;
export type ActivityCode = (typeof ACTIVITIES)[number][0];
export const ACTIVITY_CODES: readonly string[] = ACTIVITIES.map((a) => a[0]);
export const ATTENDANCE = ['PRESENT', 'LATE', 'ABSENT', 'EXCUSED'] as const;
export const PARTICIPATION = ['EXCELLENT', 'GOOD', 'FAIR', 'POOR'] as const;
export const MAX_CLASS_MINUTES = 12 * 60;
export const TEXT_LIMIT = 2000;

export type ClassStatus = 'SCHEDULED' | 'RESCHEDULED' | 'AWAITING_MENTOR_VERIFICATION' | 'RETURNED_FOR_CORRECTION' | 'VERIFIED' | 'NOT_CONDUCTED' | 'CANCELLED';
export type DisplayState = 'SCHEDULED' | 'REMINDER_PENDING' | 'REMINDER_SENT' | 'AWAITING_TUTOR_UPDATE' | 'AWAITING_MENTOR_VERIFICATION' | 'RETURNED_FOR_CORRECTION' | 'VERIFIED' | 'NOT_CONDUCTED' | 'RESCHEDULED' | 'CANCELLED';
export const STATE_LABELS: Record<DisplayState, string> = {
  SCHEDULED: 'Scheduled', REMINDER_PENDING: 'Reminder pending', REMINDER_SENT: 'Reminder sent', AWAITING_TUTOR_UPDATE: 'Awaiting tutor update', AWAITING_MENTOR_VERIFICATION: 'Awaiting Mentor verification',
  RETURNED_FOR_CORRECTION: 'Returned for correction', VERIFIED: 'Verified', NOT_CONDUCTED: 'Not conducted', RESCHEDULED: 'Rescheduled', CANCELLED: 'Cancelled',
};

/** What may happen to a class in each stored status. */
export const TUTOR_CAN_UPDATE: readonly ClassStatus[] = ['SCHEDULED', 'RESCHEDULED', 'RETURNED_FOR_CORRECTION', 'AWAITING_MENTOR_VERIFICATION'];
export const MENTOR_CAN_REVIEW: readonly ClassStatus[] = ['AWAITING_MENTOR_VERIFICATION'];
export const CAN_RESCHEDULE: readonly ClassStatus[] = ['SCHEDULED', 'RESCHEDULED'];
export const CAN_REMIND: readonly ClassStatus[] = ['SCHEDULED', 'RESCHEDULED', 'RETURNED_FOR_CORRECTION'];

// ─── Which classes happen on a date ──────────────────────────────────────────────────────────────────────────────
export interface AssignmentRow { id: string; activationId: string; subjectId: string; tutorProfileId: string; startDate: string | null; endDate: string | null }
export interface RuleRow { assignmentId: string; dayOfWeek: number; frequency: 'WEEKLY' | 'BIWEEKLY' | 'MONTHLY'; week: 1 | 2 | null; occurrences: readonly string[]; startMinute: number; endMinute: number }
export interface OverrideRow { assignmentId: string; date: string; originalStartMinute: number; kind: 'CANCELLED' | 'RESCHEDULED'; newDate: string | null; newStartMinute: number | null; newEndMinute: number | null }

export interface Occurrence {
  /** Finds the same class again: the assignment plus the date and start time its rule gave. */
  key: string;
  assignmentId: string;
  activationId: string;
  subjectId: string;
  tutorProfileId: string;
  date: string;
  startMinute: number;
  endMinute: number;
  originalDate: string;
  originalStartMinute: number;
  moved: boolean;
}

export const classKey = (assignmentId: string, originalDate: string, originalStartMinute: number) => `${assignmentId}~${originalDate}~${originalStartMinute}`;

/** Takes a key apart, or returns null when it could not have come from classKey. */
export function parseClassKey(key: unknown): { assignmentId: string; originalDate: string; originalStartMinute: number } | null {
  if (typeof key !== 'string') return null;
  const m = /^([A-Za-z0-9-]{8,64})~(\d{4}-\d{2}-\d{2})~(\d{1,4})$/.exec(key);
  if (!m || !isDateString(m[2]) || Number(m[3]) >= 1440) return null;
  return { assignmentId: m[1], originalDate: m[2], originalStartMinute: Number(m[3]) };
}

/** Every class that really happens between two dates: the rule's own days, less cancelled ones, with moved ones on their new date. */
export function occurrencesBetween(from: string, to: string, input: { assignments: readonly AssignmentRow[]; rules: readonly RuleRow[]; overrides: readonly OverrideRow[] }): Occurrence[] {
  const out: Occurrence[] = [];
  const days = datesBetween(from, to);
  for (const a of input.assignments) {
    const overrides = input.overrides.filter((o) => o.assignmentId === a.id);
    for (const r of input.rules.filter((x) => x.assignmentId === a.id)) {
      const rule = { dayNumber: r.dayOfWeek, frequency: r.frequency, week: r.week, occurrences: r.occurrences, startDate: a.startDate, endDate: a.endDate };
      const base = { assignmentId: a.id, activationId: a.activationId, subjectId: a.subjectId, tutorProfileId: a.tutorProfileId };
      for (const date of days) {
        if (!occursOn(rule, date)) continue;
        if (overrides.some((o) => o.date === date && o.originalStartMinute === r.startMinute)) continue; // cancelled, or moved elsewhere
        out.push({ ...base, key: classKey(a.id, date, r.startMinute), date, startMinute: r.startMinute, endMinute: r.endMinute, originalDate: date, originalStartMinute: r.startMinute, moved: false });
      }
      for (const o of overrides) {
        if (o.kind !== 'RESCHEDULED' || !o.newDate || o.newStartMinute === null || o.newEndMinute === null) continue;
        if (o.newDate < from || o.newDate > to || o.originalStartMinute !== r.startMinute || !occursOn(rule, o.date)) continue;
        out.push({ ...base, key: classKey(a.id, o.date, r.startMinute), date: o.newDate, startMinute: o.newStartMinute, endMinute: o.newEndMinute, originalDate: o.date, originalStartMinute: r.startMinute, moved: true });
      }
    }
  }
  return out.sort((a, b) => a.date.localeCompare(b.date) || a.startMinute - b.startMinute || a.key.localeCompare(b.key));
}

// ─── What the tutor reports ──────────────────────────────────────────────────────────────────────────────────────
export interface CheckedUpdate {
  conducted: boolean;
  actualStartMinute: number | null;
  actualEndMinute: number | null;
  actualMinutes: number | null;
  subjectCovered: string | null;
  topicsCovered: string | null;
  attendance: (typeof ATTENDANCE)[number] | null;
  participation: (typeof PARTICIPATION)[number] | null;
  classNotes: string | null;
  notConductedReason: string | null;
  activities: ActivityCode[];
  otherActivity: string | null;
  evaluationRemarks: string | null;
  coveredRemarks: string | null;
  voiceSent: boolean;
  /** Homework or assignments given, and the portions completed. Required for a conducted class (a tutor may write None). */
  homework: string | null;
  portionsCompleted: string | null;
  /** The chapters covered, one per entry. The topics text above stays; these are what an exam chapter can later be chosen from. */
  chapters: string[];
  /** Why the update is being sent again, required when the Mentor or Head had returned it. */
  resubmitReason: string | null;
  /** The version of the update the tutor was looking at, when it was sent. A newer one on the server refuses the save. */
  expectedVersion: number | null;
}
export const MAX_CHAPTERS = 20;
export type Checked<T> = { ok: true; value: T } | { ok: false; message: string };

const str = (v: unknown): string | undefined => (v === undefined || v === null ? '' : typeof v === 'string' ? v.trim() : undefined);
const tooLong = (label: string, v: string, max = TEXT_LIMIT) => (v.length > max ? `The ${label} must be ${max} characters or fewer.` : null);

/** Checks a tutor's class update. A class that was not conducted needs only the reason. */
export function checkTutorUpdate(raw: unknown, ctx: { subjectName: string; resubmitting?: boolean }): Checked<CheckedUpdate> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ok: false, message: 'Send the class update.' };
  const r = raw as Record<string, unknown>;
  if (typeof r.conducted !== 'boolean') return { ok: false, message: 'Say whether the class was conducted.' };
  const blank: CheckedUpdate = { conducted: r.conducted, actualStartMinute: null, actualEndMinute: null, actualMinutes: null, subjectCovered: null, topicsCovered: null, attendance: null, participation: null, classNotes: null, notConductedReason: null, activities: [], otherActivity: null, evaluationRemarks: null, coveredRemarks: null, voiceSent: r.voiceSent === true, homework: null, portionsCompleted: null, chapters: [], resubmitReason: null, expectedVersion: null };
  if (r.expectedVersion !== undefined && r.expectedVersion !== null) {
    if (typeof r.expectedVersion !== 'number' || !Number.isInteger(r.expectedVersion) || r.expectedVersion < 0) return { ok: false, message: 'The version of the update must be a whole number.' };
    blank.expectedVersion = r.expectedVersion;
  }
  if (ctx.resubmitting) {
    const why = str(r.resubmitReason);
    if (why === undefined) return { ok: false, message: 'The reason for sending the update again must be text.' };
    if (!why) return { ok: false, message: 'Say what you changed, because the update was returned.' };
    if (why.length > 1000) return { ok: false, message: 'The reason for sending the update again must be 1000 characters or fewer.' };
    blank.resubmitReason = why;
  }

  if (!r.conducted) {
    const reason = str(r.notConductedReason);
    if (reason === undefined) return { ok: false, message: 'The reason must be text.' };
    if (!reason) return { ok: false, message: 'Say why the class was not conducted.' };
    const long = tooLong('reason', reason, 1000);
    return long ? { ok: false, message: long } : { ok: true, value: { ...blank, notConductedReason: reason } };
  }

  const start = typeof r.actualStart === 'string' ? clockMinutes(r.actualStart) : null;
  const end = typeof r.actualEnd === 'string' ? clockMinutes(r.actualEnd) : null;
  if (start === null || end === null) return { ok: false, message: 'Enter the time the class actually started and ended, like 15:00 and 16:00.' };
  if (end <= start) return { ok: false, message: 'The class must end after it started, on the same day.' };
  if (end - start > MAX_CLASS_MINUTES) return { ok: false, message: `A class cannot last more than ${MAX_CLASS_MINUTES / 60} hours.` };

  const topics = str(r.topicsCovered);
  const subject = str(r.subjectCovered);
  const notes = str(r.classNotes);
  const evaluation = str(r.evaluationRemarks);
  const covered = str(r.coveredRemarks);
  const other = str(r.otherActivity);
  if ([topics, subject, notes, evaluation, covered, other].some((v) => v === undefined)) return { ok: false, message: 'The topics, notes and remarks must be text.' };
  if (!topics) return { ok: false, message: 'Say which topics were covered.' };
  const homework = str(r.homework);
  const portions = str(r.portionsCompleted);
  if ([homework, portions].some((v) => v === undefined)) return { ok: false, message: 'The homework and the portions completed must be text.' };
  if (!portions) return { ok: false, message: 'Say which portions were completed.' };
  if (!homework) return { ok: false, message: 'Write the homework or assignments given, or write None.' };
  if (!notes) return { ok: false, message: 'Write your additional remarks, or write None.' };
  if (!r.participation) return { ok: false, message: 'Record the student participation: excellent, good, fair or poor.' };
  const chapterList = r.chapters === undefined || r.chapters === null ? [] : Array.isArray(r.chapters) ? r.chapters : null;
  if (chapterList === null || chapterList.some((c) => typeof c !== 'string')) return { ok: false, message: 'The chapters must be a list of text.' };
  const chapters = [...new Set((chapterList as string[]).map((c) => c.trim()).filter(Boolean))];
  if (chapters.length > MAX_CHAPTERS) return { ok: false, message: `List at most ${MAX_CHAPTERS} chapters.` };
  if (chapters.some((c) => c.length > 200)) return { ok: false, message: 'Each chapter must be 200 characters or fewer.' };
  for (const [label, v, max] of [['portions completed', portions, TEXT_LIMIT], ['homework', homework ?? '', TEXT_LIMIT], ['topics covered', topics, TEXT_LIMIT], ['subject covered', subject ?? '', 200], ['class notes', notes ?? '', TEXT_LIMIT], ['evaluation remarks', evaluation ?? '', TEXT_LIMIT], ['topics covered remarks', covered ?? '', TEXT_LIMIT]] as const) {
    const long = tooLong(label, v, max);
    if (long) return { ok: false, message: long };
  }
  if (typeof r.attendance !== 'string' || !(ATTENDANCE as readonly string[]).includes(r.attendance)) return { ok: false, message: 'Record whether the student was present, late, absent or excused.' };
  if (r.participation !== undefined && r.participation !== null && r.participation !== '' && !(PARTICIPATION as readonly string[]).includes(r.participation as string)) return { ok: false, message: 'Choose excellent, good, fair or poor for participation.' };

  const acts = Array.isArray(r.activities) ? r.activities : r.activities === undefined || r.activities === null ? [] : null;
  if (acts === null || acts.some((a) => typeof a !== 'string' || !ACTIVITY_CODES.includes(a))) return { ok: false, message: 'Choose activities from the list.' };
  const activities = [...new Set(acts as ActivityCode[])];
  if (activities.includes('OTHER') && !other) return { ok: false, message: 'Describe the other activity.' };
  if (other && other.length > 200) return { ok: false, message: 'The other activity must be 200 characters or fewer.' };

  return {
    ok: true,
    value: {
      ...blank, actualStartMinute: start, actualEndMinute: end, actualMinutes: end - start, subjectCovered: subject || ctx.subjectName, topicsCovered: topics, attendance: r.attendance as CheckedUpdate['attendance'],
      participation: r.participation ? (r.participation as CheckedUpdate['participation']) : null, classNotes: notes || null, activities, otherActivity: activities.includes('OTHER') ? other ?? null : null,
      evaluationRemarks: evaluation || null, coveredRemarks: covered || null, homework, portionsCompleted: portions, chapters,
    },
  };
}

export interface CheckedMentorNotes { mentorRemarks?: string; voiceReceived?: boolean; voiceRemarks?: string; activities?: ActivityCode[]; otherActivity?: string | null; evaluationRemarks?: string; coveredRemarks?: string }

/** What the Mentor may add to a class: their own remarks, that the voice update arrived, and the activities and remarks. */
export function checkMentorNotes(raw: unknown): Checked<CheckedMentorNotes> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ok: false, message: 'Send what you want to add.' };
  const r = raw as Record<string, unknown>;
  const out: CheckedMentorNotes = {};
  for (const [key, label] of [['mentorRemarks', 'Mentor remarks'], ['voiceRemarks', 'voice remarks'], ['evaluationRemarks', 'evaluation remarks'], ['coveredRemarks', 'topics covered remarks']] as const) {
    if (r[key] === undefined) continue;
    const v = str(r[key]);
    if (v === undefined) return { ok: false, message: `The ${label} must be text.` };
    const long = tooLong(label, v);
    if (long) return { ok: false, message: long };
    out[key] = v;
  }
  if (r.voiceReceived !== undefined) {
    if (typeof r.voiceReceived !== 'boolean') return { ok: false, message: 'Say whether the voice update was received.' };
    out.voiceReceived = r.voiceReceived;
  }
  if (r.activities !== undefined) {
    if (!Array.isArray(r.activities) || r.activities.some((a) => typeof a !== 'string' || !ACTIVITY_CODES.includes(a))) return { ok: false, message: 'Choose activities from the list.' };
    out.activities = [...new Set(r.activities as ActivityCode[])];
    const other = str(r.otherActivity);
    if (out.activities.includes('OTHER') && !other) return { ok: false, message: 'Describe the other activity.' };
    out.otherActivity = out.activities.includes('OTHER') ? (other ?? null) : null;
  }
  return Object.keys(out).length === 0 ? { ok: false, message: 'Send what you want to add.' } : { ok: true, value: out };
}

// ─── States and the checklist ────────────────────────────────────────────────────────────────────────────────────
export type ReminderState = 'PREPARED' | 'SENT' | 'ACKNOWLEDGED' | null;

/**
 * The state shown for a class. The stored status is the lifecycle; the rest is read from the reminder and the clock. A class
 * whose time has passed with no tutor update is awaiting that update, whatever reminder was sent.
 */
export function displayState(s: { status: ClassStatus; date: string; endMinute: number }, reminder: ReminderState, now: Date, working: Pick<WorkingPolicy, 'timeZone'>): DisplayState {
  if (s.status === 'VERIFIED' || s.status === 'NOT_CONDUCTED' || s.status === 'CANCELLED' || s.status === 'AWAITING_MENTOR_VERIFICATION' || s.status === 'RETURNED_FOR_CORRECTION') return s.status;
  if (zonedInstant(s.date, s.endMinute, working.timeZone).getTime() < now.getTime()) return 'AWAITING_TUTOR_UPDATE';
  if (reminder === 'SENT' || reminder === 'ACKNOWLEDGED') return 'REMINDER_SENT';
  if (reminder === 'PREPARED') return 'REMINDER_PENDING';
  return s.status === 'RESCHEDULED' ? 'RESCHEDULED' : 'SCHEDULED';
}

export interface ChecklistInput {
  tutorSubmittedAt: Date | null;
  voiceSentAt: Date | null;
  voiceReceivedAt: Date | null;
  activities: readonly string[];
  evaluationRemarks: string | null;
  coveredRemarks: string | null;
  status: ClassStatus;
  /** What the class workspace has recorded. When present it replaces the older voice and activity flags. */
  workspace?: { voiceUploaded: boolean; voiceShared: boolean; activitiesCreated: number; activitiesShared: number; exceptionStatus: string | null };
}
export interface ChecklistItem { key: string; label: string; done: boolean; detail: string }

/** The class checklist. An item is done only when what it names has really been recorded; nothing here ticks itself. */
export function checklistOf(s: ChecklistInput, reminder: { status: ReminderState; sentAt: Date | null; acknowledgedAt: Date | null }): ChecklistItem[] {
  const reminderDone = reminder.status === 'SENT' || reminder.status === 'ACKNOWLEDGED';
  return [
    { key: 'REMINDER', label: 'Tutor class reminder', done: reminderDone, detail: reminder.status === 'ACKNOWLEDGED' ? 'Sent and acknowledged by the tutor' : reminderDone ? 'Sent, not yet acknowledged' : reminder.status === 'PREPARED' ? 'Prepared, not sent' : 'Not prepared' },
    { key: 'UPDATE', label: 'Class update from the tutor', done: s.tutorSubmittedAt !== null, detail: s.tutorSubmittedAt ? 'Submitted' : 'Not submitted' },
    s.workspace
      ? { key: 'VOICE', label: 'Tutor voice update', done: s.workspace.voiceUploaded && s.workspace.voiceShared, detail: !s.workspace.voiceUploaded ? 'Not uploaded' : s.workspace.voiceShared ? 'Uploaded and shared in the group' : 'Uploaded, sharing in the group not confirmed' }
      : { key: 'VOICE', label: 'Tutor voice update', done: s.voiceReceivedAt !== null, detail: s.voiceReceivedAt ? 'Received, confirmed by the Mentor' : s.voiceSentAt ? 'The tutor says it was sent. The Mentor has not confirmed it.' : 'Not received' },
    s.workspace
      ? { key: 'ACTIVITIES', label: 'Post-class activities', done: s.workspace.activitiesCreated >= 3 && s.workspace.activitiesShared >= 3, detail: s.workspace.activitiesCreated < 3 ? `${s.workspace.activitiesCreated} of 3 created` : s.workspace.activitiesShared < 3 ? `${s.workspace.activitiesCreated} created, ${s.workspace.activitiesShared} confirmed shared` : `${s.workspace.activitiesCreated} created and shared` }
      : { key: 'ACTIVITIES', label: 'Post-class activities', done: s.activities.length > 0, detail: s.activities.length ? `${s.activities.length} selected` : 'None selected' },
    { key: 'EVALUATION', label: 'Remarks, class evaluation', done: !!s.evaluationRemarks, detail: s.evaluationRemarks ? 'Written' : 'Not written' },
    { key: 'COVERED', label: 'Remarks, topics covered in class', done: !!s.coveredRemarks, detail: s.coveredRemarks ? 'Written' : 'Not written' },
    { key: 'MENTOR', label: 'Mentor verification', done: s.status === 'VERIFIED' || s.status === 'NOT_CONDUCTED', detail: s.status === 'VERIFIED' ? 'Verified' : s.status === 'NOT_CONDUCTED' ? 'Confirmed not conducted' : s.status === 'CANCELLED' ? 'Cancelled' : 'Not verified' },
  ];
}

/** What the Mentor should notice before verifying. None of these blocks verification except a missing update. */
export function verificationWarnings(s: ChecklistInput, hasRate: boolean): string[] {
  const out: string[] = [];
  if (!s.voiceReceivedAt) out.push('The tutor voice update has not been confirmed as received.');
  if (s.activities.length === 0) out.push('No post-class activities are recorded.');
  if (!s.evaluationRemarks) out.push('The class evaluation remarks are empty.');
  if (!s.coveredRemarks) out.push('The topics covered remarks are empty.');
  if (!hasRate) out.push('No hourly rate is set for this tutor on this date. Payroll cannot include the class until HR sets one.');
  return out;
}

/** The pay for verified minutes at an hourly rate, to two decimals. Empty when there is no rate: no rate is ever invented. */
export function payableAmount(minutes: number, hourlyRate: number | null): number | null {
  if (hourlyRate === null || !Number.isFinite(hourlyRate)) return null;
  return Math.round((minutes / 60) * hourlyRate * 100) / 100;
}

export const timeRange = (start: number, end: number) => formatRange(start, end);
