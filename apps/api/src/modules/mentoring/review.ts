/**
 * The monthly parent review: what the meeting records, which checks apply, how goals add up, what state the review is in, and
 * what is still missing before it can be completed. Pure rules, no database and no framework.
 *
 * A review is complete only when every item of the completion checklist is recorded by a person. Nothing completes itself,
 * and nothing is invented: a result, a goal or an observation is either written by the Mentor or it is missing.
 */
import { addDays, isDateString } from '../tutor/tutor-calendar';

import { clockMinutes } from './mentoring-sla';

export const TEXT_LIMIT = 2000;
export const RESULTS = ['YES', 'PARTIALLY', 'NO'] as const;
export type GoalResult = (typeof RESULTS)[number];
export const RESULT_LABELS: Record<GoalResult, string> = { YES: 'Yes', PARTIALLY: 'Partially', NO: 'No' };
export const PARTICIPATION = ['FULL', 'PARTIAL', 'NONE'] as const;
export type Participation = (typeof PARTICIPATION)[number];
export const PARTICIPATION_LABELS: Record<Participation, string> = { FULL: 'Parent attended the whole meeting', PARTIAL: 'Parent attended part of the meeting', NONE: 'Parent did not attend' };
export const NEXT_PLAN_KINDS = ['NEW', 'CONTINUED', 'REVISED'] as const;
export type NextPlanKind = (typeof NEXT_PLAN_KINDS)[number];
export const NEXT_PLAN_KIND_LABELS: Record<NextPlanKind, string> = { NEW: 'New goals', CONTINUED: 'Continued goals', REVISED: 'Revised goals' };
export const NO_EXAMS_MESSAGE = 'No exam records available for this learning period.';

export type MeetingState = 'NOT_SCHEDULED' | 'SCHEDULED' | 'RESCHEDULED' | 'NOT_CONDUCTED' | 'REVIEW_IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
export const MEETING_STATE_LABELS: Record<MeetingState, string> = {
  NOT_SCHEDULED: 'Not scheduled', SCHEDULED: 'Scheduled', RESCHEDULED: 'Rescheduled', NOT_CONDUCTED: 'Not conducted', REVIEW_IN_PROGRESS: 'Meeting held, review not complete', COMPLETED: 'Completed', CANCELLED: 'Cancelled',
};

// ─── Checking what is typed ──────────────────────────────────────────────────────────────────────────────────────
export type Checked<T> = { ok: true; value: T } | { ok: false; message: string };
const text = (v: unknown): string | undefined => (v === undefined || v === null ? '' : typeof v === 'string' ? v.trim() : undefined);
const tooLong = (v: string, n = TEXT_LIMIT) => v.length > n;

export interface CheckedSchedule { date: string; startMinute: number | null; endMinute: number | null }
/** A meeting date, and optionally the start and end time. A time needs both ends, and the end after the start. */
export function checkSchedule(raw: unknown): Checked<CheckedSchedule> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ok: false, message: 'Send the meeting date.' };
  const r = raw as Record<string, unknown>;
  if (typeof r.date !== 'string' || !isDateString(r.date)) return { ok: false, message: 'Choose a real meeting date, written like 2026-12-10.' };
  const start = typeof r.start === 'string' && r.start ? clockMinutes(r.start) : null;
  const end = typeof r.end === 'string' && r.end ? clockMinutes(r.end) : null;
  if ((typeof r.start === 'string' && r.start && start === null) || (typeof r.end === 'string' && r.end && end === null)) return { ok: false, message: 'Enter the times like 16:30.' };
  if ((start === null) !== (end === null)) return { ok: false, message: 'Enter both the start time and the end time, or neither.' };
  if (start !== null && end !== null && end <= start) return { ok: false, message: 'The meeting must end after it starts, on the same day.' };
  return { ok: true, value: { date: r.date, startMinute: start, endMinute: end } };
}

export interface CheckedMove extends CheckedSchedule { reason: string }
export function checkMove(raw: unknown): Checked<CheckedMove> {
  const s = checkSchedule(raw && typeof raw === 'object' && !Array.isArray(raw) ? { date: (raw as Record<string, unknown>).newDate, start: (raw as Record<string, unknown>).newStart, end: (raw as Record<string, unknown>).newEnd } : raw);
  if (!s.ok) return { ok: false, message: s.message.replace('meeting date', 'new meeting date') };
  const reason = text((raw as Record<string, unknown>).reason);
  if (reason === undefined || !reason) return { ok: false, message: 'Say why the meeting is being rescheduled.' };
  if (tooLong(reason, 1000)) return { ok: false, message: 'The reason must be 1000 characters or fewer.' };
  return { ok: true, value: { ...s.value, reason } };
}

export interface CheckedActual { actualDate: string; startMinute: number; endMinute: number; attendees: string[]; participation: Participation; participationNote: string | null }
/** What really happened: the date, the actual times, who was there, and whether the parent took part. */
export function checkActual(raw: unknown, today: string): Checked<CheckedActual> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ok: false, message: 'Send the meeting details.' };
  const r = raw as Record<string, unknown>;
  if (typeof r.actualDate !== 'string' || !isDateString(r.actualDate)) return { ok: false, message: 'Choose the real date the meeting was held, written like 2026-12-10.' };
  if (r.actualDate > today) return { ok: false, message: 'The meeting date cannot be in the future.' };
  const start = typeof r.start === 'string' ? clockMinutes(r.start) : null;
  const end = typeof r.end === 'string' ? clockMinutes(r.end) : null;
  if (start === null || end === null) return { ok: false, message: 'Enter the actual start and end times like 16:30.' };
  if (end <= start) return { ok: false, message: 'The meeting must end after it starts, on the same day.' };
  const attendees = Array.isArray(r.attendees) ? r.attendees.map((a) => (typeof a === 'string' ? a.trim() : '')).filter(Boolean) : null;
  if (attendees === null || attendees.length === 0) return { ok: false, message: 'Write who attended the meeting.' };
  if (attendees.length > 20 || attendees.some((a) => a.length > 100)) return { ok: false, message: 'Use at most 20 attendees, each 100 characters or fewer.' };
  if (!(PARTICIPATION as readonly string[]).includes(r.participation as string)) return { ok: false, message: 'Say whether the parent took part in the meeting.' };
  const note = text(r.participationNote);
  if (note === undefined || tooLong(note, 1000)) return { ok: false, message: 'The note about the parent must be text of 1000 characters or fewer.' };
  return { ok: true, value: { actualDate: r.actualDate, startMinute: start, endMinute: end, attendees, participation: r.participation as Participation, participationNote: note || null } };
}

export interface CheckedGoal { goal: string; expectedOutcome: string | null; actualProgress: string | null; result: GoalResult | null; evidence: string | null; improvementAreas: string | null; remainingGaps: string | null }
/** One planned goal and how it went. The goal itself is required; the evaluation can be filled in later. */
export function checkGoal(raw: unknown): Checked<CheckedGoal> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ok: false, message: 'Send the goal.' };
  const r = raw as Record<string, unknown>;
  const f = { goal: text(r.goal), expectedOutcome: text(r.expectedOutcome), actualProgress: text(r.actualProgress), evidence: text(r.evidence), improvementAreas: text(r.improvementAreas), remainingGaps: text(r.remainingGaps) };
  if (Object.values(f).some((v) => v === undefined)) return { ok: false, message: 'The goal and its evaluation must be text.' };
  if (!f.goal) return { ok: false, message: 'Write the planned goal.' };
  if (Object.values(f).some((v) => tooLong(v as string))) return { ok: false, message: `Each field must be ${TEXT_LIMIT} characters or fewer.` };
  const result = r.result === undefined || r.result === null || r.result === '' ? null : r.result;
  if (result !== null && !(RESULTS as readonly unknown[]).includes(result)) return { ok: false, message: 'Choose whether the goal was achieved: yes, partially or no.' };
  return { ok: true, value: { goal: f.goal, expectedOutcome: f.expectedOutcome || null, actualProgress: f.actualProgress || null, result: result as GoalResult | null, evidence: f.evidence || null, improvementAreas: f.improvementAreas || null, remainingGaps: f.remainingGaps || null } };
}

/** The goals written in a subject plan, one to a line, with any bullet or number taken off. Nothing is added. */
export function goalsFromPlan(objectives: string, description: string): string[] {
  const lines = objectives.split(/\r?\n/).map((l) => l.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, '').trim()).filter(Boolean);
  if (lines.length > 0) return lines.slice(0, 20);
  const d = description.trim();
  return d ? [d.length > 300 ? `${d.slice(0, 297)}...` : d] : [];
}

export interface CheckedRemarks { [k: string]: string }
export const MEETING_REMARK_FIELDS = ['whatImproved', 'expHomePractice', 'expParentInvolvement', 'expStudyRoutine', 'expAttendanceSupport', 'expOther', 'mentorObservations', 'noImprovementReason'] as const;
export const POST_MEETING_FIELDS = ['parentCommunicated', 'parentConcerns', 'parentFeedback', 'agreedActions', 'additionalSupport', 'parentCommitments', 'followUp'] as const;
const FIELD_LABELS: Record<string, string> = {
  whatImproved: 'what improved', expHomePractice: 'home practice expectations', expParentInvolvement: 'parent involvement', expStudyRoutine: 'study routine', expAttendanceSupport: 'attendance support', expOther: 'other commitments', mentorObservations: 'Mentor observations',
  noImprovementReason: 'the reason there are no improvement areas', parentCommunicated: 'what the parent communicated', parentConcerns: 'parent concerns', parentFeedback: 'parent feedback', agreedActions: 'agreed actions', additionalSupport: 'additional support required', parentCommitments: 'parent commitments', followUp: 'follow-up requirements',
};
/** The meeting-level remarks, each in its own field. Any field can be sent alone, and an empty one clears it. */
export function checkFields(raw: unknown, allowed: readonly string[]): Checked<CheckedRemarks> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ok: false, message: 'Send the remarks.' };
  const r = raw as Record<string, unknown>;
  const out: CheckedRemarks = {};
  for (const key of Object.keys(r)) {
    if (!allowed.includes(key)) return { ok: false, message: `${key} is not a field of this section.` };
    const v = text(r[key]);
    if (v === undefined) return { ok: false, message: `The ${FIELD_LABELS[key]} must be text.` };
    if (tooLong(v)) return { ok: false, message: `The ${FIELD_LABELS[key]} must be ${TEXT_LIMIT} characters or fewer.` };
    out[key] = v;
  }
  return Object.keys(out).length === 0 ? { ok: false, message: 'Send at least one remark.' } : { ok: true, value: out };
}

export interface CheckedArea { subjectId: string | null; area: string }
export function checkArea(raw: unknown): Checked<CheckedArea> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ok: false, message: 'Send the improvement area.' };
  const r = raw as Record<string, unknown>;
  const area = text(r.area);
  if (area === undefined) return { ok: false, message: 'The improvement area must be text.' };
  if (!area) return { ok: false, message: 'Write the concept, skill or behaviour that needs attention.' };
  if (tooLong(area, 500)) return { ok: false, message: 'The improvement area must be 500 characters or fewer.' };
  return { ok: true, value: { subjectId: typeof r.subjectId === 'string' && r.subjectId ? r.subjectId : null, area } };
}

export interface CheckedNextPlan { kind: NextPlanKind; description: string; objectives: string; topics: string; outcomes: string }
/** One subject of the next learning plan. It has the same fields as the Individual Learning Plan it will become. */
export function checkNextPlan(raw: unknown): Checked<CheckedNextPlan> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ok: false, message: 'Send the next plan for the subject.' };
  const r = raw as Record<string, unknown>;
  if (!(NEXT_PLAN_KINDS as readonly unknown[]).includes(r.kind)) return { ok: false, message: 'Say whether these are new, continued or revised goals.' };
  const f = { description: text(r.description), objectives: text(r.objectives), topics: text(r.topics), outcomes: text(r.outcomes) };
  if (Object.values(f).some((v) => v === undefined)) return { ok: false, message: 'The description, objectives, topics and outcomes must be text.' };
  if (!f.description) return { ok: false, message: 'Write the learning plan description for this subject.' };
  if (Object.values(f).some((v) => tooLong(v as string))) return { ok: false, message: `The description, objectives, topics and outcomes must be ${TEXT_LIMIT} characters or fewer.` };
  return { ok: true, value: { kind: r.kind as NextPlanKind, description: f.description, objectives: f.objectives as string, topics: f.topics as string, outcomes: f.outcomes as string } };
}

// ─── Adding goals up ─────────────────────────────────────────────────────────────────────────────────────────────
export interface Tally { total: number; yes: number; partially: number; no: number; unevaluated: number; /** Yes counts one, partially a half, no nothing; over the evaluated goals. Null until a goal is evaluated. */ percent: number | null; result: GoalResult | null }

/** The result of a subject, worked out from its separate goals. There is no single checkbox for a subject or for the student. */
export function tally(results: ReadonlyArray<GoalResult | null>): Tally {
  const yes = results.filter((r) => r === 'YES').length;
  const partially = results.filter((r) => r === 'PARTIALLY').length;
  const no = results.filter((r) => r === 'NO').length;
  const done = yes + partially + no;
  const percent = done === 0 ? null : Math.round(((yes + partially / 2) / done) * 10000) / 100;
  const result: GoalResult | null = done === 0 || done < results.length ? null : yes === done ? 'YES' : no === done ? 'NO' : 'PARTIALLY';
  return { total: results.length, yes, partially, no, unevaluated: results.length - done, percent, result };
}

// ─── State and completion ────────────────────────────────────────────────────────────────────────────────────────
export interface ReviewFacts {
  status: 'SCHEDULED' | 'COMPLETED' | 'CANCELLED' | null;
  date: string | null;
  originalDate: string | null;
  conducted: boolean | null;
}

export function meetingState(f: ReviewFacts): MeetingState {
  if (f.status === null) return 'NOT_SCHEDULED';
  if (f.status === 'COMPLETED') return 'COMPLETED';
  if (f.status === 'CANCELLED') return 'CANCELLED';
  if (f.conducted === false) return 'NOT_CONDUCTED';
  if (f.conducted === true) return 'REVIEW_IN_PROGRESS';
  return f.date !== f.originalDate ? 'RESCHEDULED' : 'SCHEDULED';
}

export interface CompletionFacts {
  conducted: boolean | null;
  actualRecorded: boolean;
  examsReviewed: boolean;
  hasPlan: boolean;
  subjects: Array<{ subjectId: string; name: string; goals: Array<{ result: GoalResult | null; actualProgress: string | null }>; tutorObserved: boolean; nextPlanned: boolean }>;
  improvementAreas: number;
  noImprovementReason: boolean;
  expectationsRecorded: boolean;
  parentCommunicationRecorded: boolean;
  mentorObserved: boolean;
  nextPlanApproved: boolean;
}

export interface ChecklistRow { key: string; label: string; done: boolean; detail: string }

/** The nine things that must be recorded before a monthly review can be completed, each with what is still missing. */
export function completionChecklist(f: CompletionFacts): ChecklistRow[] {
  const row = (key: string, label: string, done: boolean, ok: string, missing: string): ChecklistRow => ({ key, label, done, detail: done ? ok : missing });
  const noGoal = f.subjects.filter((s) => s.goals.length === 0).map((s) => s.name);
  const open = f.subjects.filter((s) => s.goals.some((g) => g.result === null || !g.actualProgress));
  const goalsDone = f.hasPlan && f.subjects.length > 0 && noGoal.length === 0 && open.length === 0;
  const noTutor = f.subjects.filter((s) => !s.tutorObserved).map((s) => s.name);
  const noNext = f.subjects.filter((s) => !s.nextPlanned).map((s) => s.name);
  return [
    row('CONDUCTED', 'Meeting conducted', f.conducted === true, 'Recorded as conducted', f.conducted === false ? 'Recorded as not conducted. Reschedule the meeting.' : 'Not recorded yet'),
    row('ACTUAL_TIME', 'Actual meeting time recorded', f.actualRecorded, 'Date, times and attendees recorded', 'Record the date, start and end times, attendees and parent participation'),
    row('EXAMS_REVIEWED', 'Exam performance reviewed', f.examsReviewed, 'Reviewed, or recorded that there are no exams', 'Review the exams of this period, or record that there are none'),
    row('GOALS_EVALUATED', 'Subject-wise goals evaluated', goalsDone, 'Every goal has a result and its actual progress',
      !f.hasPlan || f.subjects.length === 0 ? 'There is no learning plan to evaluate' : noGoal.length ? `No goal for ${noGoal.join(', ')}` : `Evaluate every goal of ${open.map((s) => s.name).join(', ')}`),
    row('IMPROVEMENT_AREAS', 'Improvement areas recorded', f.improvementAreas > 0 || f.noImprovementReason, f.improvementAreas > 0 ? `${f.improvementAreas} recorded` : 'Recorded that none are needed, with the reason', 'Record the improvement areas, or the reason there are none'),
    row('PARENT_RECORDED', 'Parent expectations and communication recorded', f.expectationsRecorded && f.parentCommunicationRecorded, 'Recorded',
      !f.expectationsRecorded ? 'Record what you expect from the parent' : 'Record what the parent communicated after the meeting'),
    row('OBSERVATIONS', 'Tutor and Mentor observations recorded', f.mentorObserved && noTutor.length === 0 && f.subjects.length > 0, 'Recorded',
      !f.mentorObserved ? 'Record your own observations' : f.subjects.length === 0 ? 'There are no subjects' : `Record the tutor observations for ${noTutor.join(', ')}`),
    row('NEXT_PLAN', 'Next month learning plan written', f.subjects.length > 0 && noNext.length === 0, 'Every subject has its next plan', f.subjects.length === 0 ? 'There are no subjects' : `Write the next plan for ${noNext.join(', ')}`),
    row('NEXT_PLAN_APPROVED', 'Next plan approved and linked to the next period', f.nextPlanApproved, 'Approved. It becomes the active plan when the review is completed', 'Approve the next plan'),
  ];
}

export const checklistProblems = (rows: readonly ChecklistRow[]) => rows.filter((r) => !r.done).map((r) => `${r.label}: ${r.detail}.`);

/** The day the next learning period starts: the day after the one that has just ended. */
export const nextPeriodStart = (endsOn: string) => addDays(endsOn, 1);

export interface ExamForReview {
  id: string;
  subjectId: string;
  date: string;
  kind: string;
  conducted: boolean | null;
  marks: { obtained: number; max: number; percentage: number } | null;
}
/** The average percentage of the exams that have marks, per subject. Exams without marks are not counted and not guessed. */
export function examAverage(exams: readonly ExamForReview[]): number | null {
  const marked = exams.filter((e) => e.marks !== null);
  if (marked.length === 0) return null;
  return Math.round((marked.reduce((s, e) => s + (e.marks as { percentage: number }).percentage, 0) / marked.length) * 100) / 100;
}
/** Is this date inside the learning period? Both ends count. */
export const inPeriod = (date: string, start: string | null, end: string | null) => !!start && !!end && date >= start && date <= end;
