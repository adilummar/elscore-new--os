/**
 * Weekly exams: what an exam is, which checks apply, what state it is in, and when it is complete. Pure rules, no database and
 * no framework.
 *
 * One rule matters above the rest: a student has at most one exam on a date, whatever the subject. Several chapters of one
 * subject belong to the one exam. The rule is built into the exam's date key, so the database enforces it as well as the service.
 */
import { isDateString } from '../tutor/tutor-calendar';

import { clockMinutes } from './mentoring-sla';

export const RESPONSIBLE_TYPES = ['TUTOR', 'PARENT', 'OTHER'] as const;
export type ResponsibleType = (typeof RESPONSIBLE_TYPES)[number];
export const TEXT_LIMIT = 2000;
export const MAX_EXAM_MINUTES = 8 * 60;

export type ExamState =
  | 'SCHEDULED' | 'REMINDER_PENDING' | 'READY_FOR_EXAM' | 'EXAM_COMPLETED' | 'AWAITING_PAPER_COLLECTION' | 'AWAITING_EVALUATION' | 'MARKS_PENDING' | 'AWAITING_PARENT_SHARING' | 'COMPLETED' | 'RE_EXAM_REQUIRED' | 'RESCHEDULED';
export const EXAM_STATE_LABELS: Record<ExamState, string> = {
  SCHEDULED: 'Scheduled', REMINDER_PENDING: 'Reminder pending', READY_FOR_EXAM: 'Ready for exam', EXAM_COMPLETED: 'Exam completed', AWAITING_PAPER_COLLECTION: 'Awaiting paper collection',
  AWAITING_EVALUATION: 'Awaiting evaluation', MARKS_PENDING: 'Marks pending', AWAITING_PARENT_SHARING: 'Awaiting parent sharing', COMPLETED: 'Completed', RE_EXAM_REQUIRED: 'Re-exam required', RESCHEDULED: 'Rescheduled',
};

/** The one-exam-a-day key. Two live exams for a student on a date would have the same key. */
export const dateKey = (activationId: string, date: string) => `${activationId}:${date}`;

// ─── The checklists ──────────────────────────────────────────────────────────────────────────────────────────────
export interface ItemDef { kind: string; label: string; /** Who may confirm it besides the Mentor. */ tutorMay?: boolean }
export const POST_EXAM_ITEMS: readonly ItemDef[] = [
  { kind: 'COLLECT_PAPER', label: 'Collect the completed exam paper' },
  { kind: 'SHARE_WITH_TUTOR', label: 'Share the paper with the assigned tutor for evaluation' },
  { kind: 'TUTOR_RECEIPT', label: 'Tutor confirms the paper was received', tutorMay: true },
  { kind: 'COLLECT_CHECKED', label: 'Collect the checked paper from the tutor' },
  { kind: 'TUTOR_EVALUATION', label: 'Tutor evaluation completed', tutorMay: true },
  { kind: 'SHARE_WITH_PARENT', label: 'Share the evaluated paper with the parent' },
  { kind: 'PARENT_RECEIPT', label: 'Parent delivery or receipt confirmed' },
];
/** The re-exam checklist. The re-exam date and the person responsible come from the re-exam itself, not from a tick. */
export const RE_EXAM_ITEMS: readonly ItemDef[] = [
  { kind: 'COLLECT_ORIGINAL', label: 'Collect the original exam paper' },
  { kind: 'PREPARE_PAPER', label: 'Prepare and share the question paper' },
  { kind: 'NOTIFY', label: 'Parent and tutor notified' },
  { kind: 'REEXAM_COMPLETED', label: 'Re-exam completed' },
];
export const itemDefs = (list: 'POST_EXAM' | 'RE_EXAM') => (list === 'POST_EXAM' ? POST_EXAM_ITEMS : RE_EXAM_ITEMS);
export const ITEM_STATUSES = ['PENDING', 'DONE', 'NOT_APPLICABLE'] as const;
const settled = (s: string | undefined) => s === 'DONE' || s === 'NOT_APPLICABLE';

// ─── Checking what is typed ──────────────────────────────────────────────────────────────────────────────────────
export type Checked<T> = { ok: true; value: T } | { ok: false; message: string };
const text = (v: unknown): string | undefined => (v === undefined || v === null ? '' : typeof v === 'string' ? v.trim() : undefined);

export interface CheckedExam {
  title: string;
  subjectId: string;
  chapters: string[];
  portion: string | null;
  date: string;
  startMinute: number;
  endMinute: number;
  responsibleType: ResponsibleType;
  responsibleName: string | null;
  instructions: string | null;
}

/** The end of an exam: an end time, or a length from the start. Never both guessed. */
function endOf(r: Record<string, unknown>, start: number): number | string {
  if (typeof r.end === 'string' && r.end) {
    const end = clockMinutes(r.end);
    return end === null ? 'Enter the end time like 10:30.' : end;
  }
  const d = r.durationMinutes;
  if (typeof d === 'number' && Number.isInteger(d)) return start + d;
  return 'Enter the end time, or how long the exam lasts.';
}

export function checkExam(raw: unknown): Checked<CheckedExam> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ok: false, message: 'Send the exam details.' };
  const r = raw as Record<string, unknown>;
  const title = text(r.title);
  const portion = text(r.portion);
  const instructions = text(r.instructions);
  const name = text(r.responsibleName);
  if ([title, portion, instructions, name].some((v) => v === undefined)) return { ok: false, message: 'The title, portion, instructions and name must be text.' };
  if (!title) return { ok: false, message: 'Give the exam a title.' };
  if (title.length > 200) return { ok: false, message: 'The title must be 200 characters or fewer.' };
  if (typeof r.subjectId !== 'string' || !r.subjectId) return { ok: false, message: 'Choose the subject.' };
  const chapters = Array.isArray(r.chapters) ? r.chapters.map((c) => (typeof c === 'string' ? c.trim() : '')).filter(Boolean) : null;
  if (chapters === null || chapters.length === 0) return { ok: false, message: 'Add at least one chapter. Several chapters of the same subject belong to one exam.' };
  if (chapters.length > 30 || chapters.some((c) => c.length > 100)) return { ok: false, message: 'Use at most 30 chapters, each 100 characters or fewer.' };
  if ((portion ?? '').length > 1000 || (instructions ?? '').length > TEXT_LIMIT) return { ok: false, message: 'The portion or instructions are too long.' };
  if (typeof r.date !== 'string' || !isDateString(r.date)) return { ok: false, message: 'Choose a real exam date, written like 2026-11-09.' };
  const start = typeof r.start === 'string' ? clockMinutes(r.start) : null;
  if (start === null) return { ok: false, message: 'Enter the start time like 10:00.' };
  const end = endOf(r, start);
  if (typeof end === 'string') return { ok: false, message: end };
  if (end <= start) return { ok: false, message: 'The exam must end after it starts, on the same day.' };
  if (end > 24 * 60 || end - start > MAX_EXAM_MINUTES) return { ok: false, message: `An exam can last at most ${MAX_EXAM_MINUTES / 60} hours and must finish by midnight.` };
  if (!(RESPONSIBLE_TYPES as readonly string[]).includes(r.responsibleType as string)) return { ok: false, message: 'Choose who is responsible: the assigned tutor, the parent or another person.' };
  const type = r.responsibleType as ResponsibleType;
  if (type !== 'TUTOR' && !name) return { ok: false, message: type === 'PARENT' ? 'Write the name of the parent who is responsible.' : 'Write the name of the person who is responsible.' };
  if ((name ?? '').length > 100) return { ok: false, message: 'The name must be 100 characters or fewer.' };
  return { ok: true, value: { title, subjectId: r.subjectId, chapters, portion: portion || null, date: r.date, startMinute: start, endMinute: end, responsibleType: type, responsibleName: type === 'TUTOR' ? null : name ?? null, instructions: instructions || null } };
}

export interface CheckedMove { date: string; startMinute: number; endMinute: number; reason: string }
export function checkReschedule(raw: unknown, current: { startMinute: number; endMinute: number }): Checked<CheckedMove> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ok: false, message: 'Send the new date.' };
  const r = raw as Record<string, unknown>;
  if (typeof r.newDate !== 'string' || !isDateString(r.newDate)) return { ok: false, message: 'Choose a real new date, written like 2026-11-09.' };
  const reason = text(r.reason);
  if (reason === undefined || !reason) return { ok: false, message: 'Say why the exam is being rescheduled.' };
  if (reason.length > 1000) return { ok: false, message: 'The reason must be 1000 characters or fewer.' };
  const start = typeof r.newStart === 'string' && r.newStart ? clockMinutes(r.newStart) : current.startMinute;
  if (start === null) return { ok: false, message: 'Enter the new start time like 10:00.' };
  let end = current.endMinute - current.startMinute + start;
  if ((typeof r.newEnd === 'string' && r.newEnd) || typeof r.durationMinutes === 'number') {
    const e = endOf({ end: r.newEnd, durationMinutes: r.durationMinutes }, start);
    if (typeof e === 'string') return { ok: false, message: e };
    end = e;
  }
  if (end <= start || end > 24 * 60) return { ok: false, message: 'The exam must end after it starts, on the same day.' };
  return { ok: true, value: { date: r.newDate, startMinute: start, endMinute: end, reason } };
}

export interface CheckedMarks { obtained: number; max: number; percentage: number; evaluationDate: string | null }
const twoDecimals = (n: number) => Math.round(n * 100) / 100;
/** The percentage is worked out here, never typed: marks over maximum, to two decimals. */
export const percentOf = (obtained: number, max: number) => twoDecimals((obtained / max) * 100);

export function checkMarks(raw: unknown): Checked<CheckedMarks> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ok: false, message: 'Send the marks.' };
  const r = raw as Record<string, unknown>;
  const obtained = r.marksObtained;
  const max = r.maxMarks;
  if (typeof obtained !== 'number' || typeof max !== 'number' || !Number.isFinite(obtained) || !Number.isFinite(max)) return { ok: false, message: 'Enter the marks obtained and the maximum marks as numbers.' };
  if (max <= 0) return { ok: false, message: 'The maximum marks must be more than zero.' };
  if (obtained < 0) return { ok: false, message: 'The marks obtained cannot be negative.' };
  if (obtained > max) return { ok: false, message: 'The marks obtained cannot be more than the maximum marks.' };
  if (twoDecimals(obtained) !== obtained || twoDecimals(max) !== max) return { ok: false, message: 'Use at most two decimal places for marks.' };
  const evaluationDate = r.evaluationDate === undefined || r.evaluationDate === null || r.evaluationDate === '' ? null : r.evaluationDate;
  if (evaluationDate !== null && (typeof evaluationDate !== 'string' || !isDateString(evaluationDate))) return { ok: false, message: 'Choose a real evaluation date, written like 2026-11-09.' };
  return { ok: true, value: { obtained, max, percentage: percentOf(obtained, max), evaluationDate: evaluationDate } };
}

export interface CheckedRemarks { weaknesses?: string; topicsToImprove?: string; tutorSuggestions?: string; mentorRemarks?: string }
/** The four weekly remarks stay apart: each is its own field on its own exam. */
export function checkRemarks(raw: unknown, allowed: readonly (keyof CheckedRemarks)[] = ['weaknesses', 'topicsToImprove', 'tutorSuggestions', 'mentorRemarks']): Checked<CheckedRemarks> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ok: false, message: 'Send the remarks.' };
  const r = raw as Record<string, unknown>;
  const out: CheckedRemarks = {};
  for (const [key, label] of [['weaknesses', 'areas of weakness'], ['topicsToImprove', 'topics to improve'], ['tutorSuggestions', 'tutor suggestions'], ['mentorRemarks', 'Mentor remarks']] as const) {
    if (r[key] === undefined) continue;
    if (!allowed.includes(key)) return { ok: false, message: `The ${label} are not yours to change.` };
    const v = text(r[key]);
    if (v === undefined) return { ok: false, message: `The ${label} must be text.` };
    if (v.length > TEXT_LIMIT) return { ok: false, message: `The ${label} must be ${TEXT_LIMIT} characters or fewer.` };
    out[key] = v;
  }
  return Object.keys(out).length === 0 ? { ok: false, message: 'Send at least one remark.' } : { ok: true, value: out };
}

export interface CheckedItem { status: (typeof ITEM_STATUSES)[number]; remarks: string | null; responsible: string | null; evidenceRef: string | null }
export function checkItem(raw: unknown): Checked<CheckedItem> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ok: false, message: 'Send the checklist update.' };
  const r = raw as Record<string, unknown>;
  if (typeof r.status !== 'string' || !(ITEM_STATUSES as readonly string[]).includes(r.status)) return { ok: false, message: 'Choose pending, done or not applicable.' };
  const remarks = text(r.remarks);
  const responsible = text(r.responsible);
  const evidence = text(r.evidenceRef);
  if ([remarks, responsible, evidence].some((v) => v === undefined)) return { ok: false, message: 'The remarks, person and evidence must be text.' };
  if ((remarks ?? '').length > 1000 || (responsible ?? '').length > 100 || (evidence ?? '').length > 200) return { ok: false, message: 'The remarks, person or evidence are too long.' };
  if (r.status === 'NOT_APPLICABLE' && !remarks) return { ok: false, message: 'Say why this does not apply.' };
  return { ok: true, value: { status: r.status as CheckedItem['status'], remarks: remarks || null, responsible: responsible || null, evidenceRef: evidence || null } };
}

// ─── State and completion ────────────────────────────────────────────────────────────────────────────────────────
export interface ExamFacts {
  date: string;
  originalDate: string;
  conducted: boolean | null;
  reExamRequired: boolean;
  hasReExam: boolean;
  marksRecorded: boolean;
  remarks: { weaknesses: string | null; topicsToImprove: string | null; tutorSuggestions: string | null; mentorRemarks: string | null };
  informed: boolean;
}
export type ReminderState = 'PREPARED' | 'SENT' | 'ACKNOWLEDGED' | null;

/** What is still needed before the exam counts as fully complete, in words. Empty means it is complete. */
export function completionProblems(f: ExamFacts, items: Readonly<Record<string, string>>): string[] {
  if (f.conducted === null) return ['Record whether the exam was conducted.'];
  if (f.conducted === false) return [];
  const out: string[] = [];
  if (!settled(items.COLLECT_PAPER)) out.push('Collect the completed exam paper.');
  for (const d of POST_EXAM_ITEMS.slice(1, 5)) if (!settled(items[d.kind])) out.push(`${d.label}.`);
  if (!f.marksRecorded) out.push('Record the marks.');
  const names: Array<[string, string | null]> = [['areas of weakness', f.remarks.weaknesses], ['topics to improve', f.remarks.topicsToImprove], ['tutor suggestions', f.remarks.tutorSuggestions], ['Mentor remarks', f.remarks.mentorRemarks]];
  const missing = names.filter(([, v]) => !v).map(([n]) => n);
  if (missing.length) out.push(`Record the ${missing.join(', ')}.`);
  for (const d of POST_EXAM_ITEMS.slice(5)) if (!settled(items[d.kind])) out.push(`${d.label}.`);
  if (f.reExamRequired && !f.hasReExam) out.push('Schedule the re-exam.');
  return out;
}

/**
 * The state shown for an exam. Everything is read from what is recorded: a reminder, the conducted record, the checklist, the
 * marks. A formally not-conducted exam is complete (it is closed, and can be rescheduled from its record).
 */
export function examState(f: ExamFacts, items: Readonly<Record<string, string>>, reminder: ReminderState, today: string): ExamState {
  if (f.conducted === false) return 'COMPLETED';
  if (f.conducted === null) {
    if (reminder === 'SENT' || reminder === 'ACKNOWLEDGED' || f.informed) return 'READY_FOR_EXAM';
    // A moved exam says so until its reminder goes out, even though a new reminder is already prepared for it.
    if (f.date !== f.originalDate) return 'RESCHEDULED';
    return reminder === 'PREPARED' ? 'REMINDER_PENDING' : 'SCHEDULED';
  }
  if (f.reExamRequired && !f.hasReExam) return 'RE_EXAM_REQUIRED';
  if (!settled(items.COLLECT_PAPER)) return f.date === today ? 'EXAM_COMPLETED' : 'AWAITING_PAPER_COLLECTION';
  if (POST_EXAM_ITEMS.slice(1, 5).some((d) => !settled(items[d.kind]))) return 'AWAITING_EVALUATION';
  const remarksDone = !!f.remarks.weaknesses && !!f.remarks.topicsToImprove && !!f.remarks.tutorSuggestions && !!f.remarks.mentorRemarks;
  if (!f.marksRecorded || !remarksDone) return 'MARKS_PENDING';
  if (POST_EXAM_ITEMS.slice(5).some((d) => !settled(items[d.kind]))) return 'AWAITING_PARENT_SHARING';
  return 'COMPLETED';
}
