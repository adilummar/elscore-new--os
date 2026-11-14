/**
 * What the weekly exam screens show and how what is typed is turned into a request. The API decides every state, date, rule and
 * percentage; this file only arranges what it sent and checks the obvious before asking. Dates stay plain text.
 */
import { formatRange } from './tutor-availability';

export type ExamState =
  | 'SCHEDULED' | 'REMINDER_PENDING' | 'READY_FOR_EXAM' | 'EXAM_COMPLETED' | 'AWAITING_PAPER_COLLECTION' | 'AWAITING_EVALUATION' | 'MARKS_PENDING' | 'AWAITING_PARENT_SHARING' | 'COMPLETED' | 'RE_EXAM_REQUIRED' | 'RESCHEDULED';

export interface ExamItemRow { list: string; kind: string; label: string; status: string; responsible: string | null; remarks: string | null; evidenceRef: string | null; doneAt: string | null; tutorMay: boolean }

export interface ExamItem {
  id: string;
  activationId: string;
  studentName: string;
  subjectId: string;
  subjectName: string;
  kind: 'EXAM' | 'RE_EXAM';
  originalExamId: string | null;
  title: string;
  chapters: string[];
  portion: string | null;
  date: string;
  originalDate: string;
  startMinute: number;
  endMinute: number;
  responsible: { type: string; name: string | null };
  tutorName: string | null;
  instructions: string | null;
  state: ExamState;
  stateLabel: string;
  conducted: boolean | null;
  notConductedReason: string | null;
  reminder: { status: string; sentAt: string | null; acknowledgedAt: string | null; deliveryEvidence: string | null } | null;
  informed: { at: string; note: string | null } | null;
  items: ExamItemRow[];
  problems: string[];
  marks: { obtained: number; max: number; percentage: number; evaluationDate: string | null; evaluatingTutorName: string | null } | null;
  remarks: { weaknesses: string | null; topicsToImprove: string | null; tutorSuggestions: string | null; mentorRemarks: string | null };
  reExam: { required: boolean; reason: string | null; examId: string | null; date: string | null; state: ExamState | null };
  history?: Array<{ kind: string; at: string; actorUserId: string | null; reason: string | null; payload: unknown }>;
}

export interface ExamListData {
  student: { id: string; name: string };
  exams: ExamItem[];
  subjects: Array<{ subjectId: string; subjectName: string }>;
  canWork: boolean;
}

export const EXAM_TONE: Record<ExamState, 'default' | 'success' | 'warning' | 'danger' | 'info'> = {
  SCHEDULED: 'default', REMINDER_PENDING: 'info', READY_FOR_EXAM: 'info', EXAM_COMPLETED: 'warning', AWAITING_PAPER_COLLECTION: 'warning', AWAITING_EVALUATION: 'warning', MARKS_PENDING: 'warning', AWAITING_PARENT_SHARING: 'warning', COMPLETED: 'success', RE_EXAM_REQUIRED: 'danger', RESCHEDULED: 'info',
};
/** The states a Mentor can filter by, in the order of an exam's life. */
export const EXAM_STATE_CHOICES: Array<[ExamState, string]> = [
  ['SCHEDULED', 'Scheduled'], ['REMINDER_PENDING', 'Reminder pending'], ['READY_FOR_EXAM', 'Ready for exam'], ['RESCHEDULED', 'Rescheduled'], ['EXAM_COMPLETED', 'Exam completed'], ['AWAITING_PAPER_COLLECTION', 'Awaiting paper collection'],
  ['AWAITING_EVALUATION', 'Awaiting evaluation'], ['MARKS_PENDING', 'Marks pending'], ['AWAITING_PARENT_SHARING', 'Awaiting parent sharing'], ['RE_EXAM_REQUIRED', 'Re-exam required'], ['COMPLETED', 'Completed'],
];
export const RESPONSIBLE_CHOICES: Array<[string, string]> = [['TUTOR', 'Assigned tutor'], ['PARENT', 'Parent'], ['OTHER', 'Another person']];
export const responsibleLabel = (r: ExamItem['responsible']) => (r.type === 'TUTOR' ? `Assigned tutor${r.name ? `, ${r.name}` : ''}` : r.type === 'PARENT' ? `Parent${r.name ? `, ${r.name}` : ''}` : r.name ?? 'Another person');
export const ITEM_STATUS_LABELS: Record<string, string> = { PENDING: 'Pending', DONE: 'Done', NOT_APPLICABLE: 'Not applicable' };
export const examTime = (e: Pick<ExamItem, 'startMinute' | 'endMinute'>) => formatRange(e.startMinute, e.endMinute);

// ─── Scheduling an exam, as it is being typed ───────────────────────────────────────────────────────────────────
export interface ExamDraft {
  title: string;
  subjectId: string;
  chaptersText: string;
  portion: string;
  date: string;
  start: string;
  end: string;
  durationMinutes?: number;
  responsibleType: string;
  responsibleName: string;
  instructions: string;
}

export const emptyExamDraft = (subjectId = '', date = '', duration = 60): ExamDraft => ({
  title: '',
  subjectId,
  chaptersText: '',
  portion: '',
  date,
  start: '',
  end: '',
  durationMinutes: duration,
  responsibleType: 'TUTOR',
  responsibleName: '',
  instructions: '',
});
/** Chapters are typed one to a line or separated by commas. Several chapters of one subject belong to one exam. */
export const chaptersOf = (text: string) => text.split(/[\n,]/).map((c) => c.trim()).filter(Boolean);

export function draftOfExam(e: ExamItem): ExamDraft {
  const clock = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
  const duration = e.endMinute - e.startMinute;
  return {
    title: e.title,
    subjectId: e.subjectId,
    chaptersText: e.chapters.join('\n'),
    portion: e.portion ?? '',
    date: e.date,
    start: clock(e.startMinute),
    end: clock(e.endMinute),
    durationMinutes: duration > 0 ? duration : 60,
    responsibleType: e.responsible.type,
    responsibleName: e.responsible.type === 'TUTOR' ? '' : e.responsible.name ?? '',
    instructions: e.instructions ?? '',
  };
}

/** What is plainly missing, so the button can say so before asking the server. The server still decides. */
export function examProblems(d: ExamDraft): string[] {
  const out: string[] = [];
  if (!d.title.trim()) out.push('a title');
  if (!d.subjectId) out.push('the subject');
  if (chaptersOf(d.chaptersText).length === 0) out.push('at least one chapter');
  if (!d.date) out.push('the date');
  if (!d.start || (!d.end && !d.durationMinutes)) out.push('the start and end times');
  else if (d.end && d.end <= d.start) out.push('an end time after the start time');
  if (d.responsibleType !== 'TUTOR' && !d.responsibleName.trim()) out.push('the name of the person responsible');
  return out;
}

export function payloadOfExam(d: ExamDraft): Record<string, unknown> {
  let end = d.end;
  if (!end && d.start && d.durationMinutes) {
    const [h, m] = d.start.split(':').map(Number);
    const total = h * 60 + m + d.durationMinutes;
    end = `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
  }
  return {
    title: d.title,
    subjectId: d.subjectId,
    chapters: chaptersOf(d.chaptersText),
    portion: d.portion || undefined,
    date: d.date,
    start: d.start,
    end,
    durationMinutes: d.durationMinutes || undefined,
    responsibleType: d.responsibleType,
    responsibleName: d.responsibleType === 'TUTOR' ? undefined : d.responsibleName,
    instructions: d.instructions || undefined,
  };
}

// ─── Marks ──────────────────────────────────────────────────────────────────────────────────────────────────────
/** The percentage shown while typing. The server works it out again and its figure is the one kept. */
export function marksPreview(obtained: string, max: string): { percentage: number | null; problem: string | null } {
  if (obtained.trim() === '' || max.trim() === '') return { percentage: null, problem: null };
  const o = Number(obtained);
  const m = Number(max);
  if (!Number.isFinite(o) || !Number.isFinite(m)) return { percentage: null, problem: 'Enter the marks as numbers.' };
  if (m <= 0) return { percentage: null, problem: 'The maximum marks must be more than zero.' };
  if (o < 0) return { percentage: null, problem: 'The marks obtained cannot be negative.' };
  if (o > m) return { percentage: null, problem: 'The marks obtained cannot be more than the maximum marks.' };
  return { percentage: Math.round((o / m) * 10000) / 100, problem: null };
}

export interface RemarksDraft { weaknesses: string; topicsToImprove: string; tutorSuggestions: string; mentorRemarks: string }
export const remarksDraftOf = (r: ExamItem['remarks']): RemarksDraft => ({ weaknesses: r.weaknesses ?? '', topicsToImprove: r.topicsToImprove ?? '', tutorSuggestions: r.tutorSuggestions ?? '', mentorRemarks: r.mentorRemarks ?? '' });
export const REMARK_FIELDS: Array<[keyof RemarksDraft, string]> = [['weaknesses', 'Areas of weakness'], ['topicsToImprove', 'Topics to improve'], ['tutorSuggestions', 'Tutor suggestions'], ['mentorRemarks', 'Mentor remarks']];

/** The exams worth the Mentor's attention first: anything not complete, soonest first. */
export const needsAttention = (e: ExamItem) => e.state !== 'COMPLETED';
