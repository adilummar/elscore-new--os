/**
 * What the monthly review screens show and how what is typed is turned into a request. The API decides every state, date, result
 * and completion rule; this file only arranges what it sent and checks the obvious before asking. Dates stay plain text.
 */
import { formatRange } from './tutor-availability';

export type MeetingState = 'NOT_SCHEDULED' | 'SCHEDULED' | 'RESCHEDULED' | 'NOT_CONDUCTED' | 'REVIEW_IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
export type GoalResult = 'YES' | 'PARTIALLY' | 'NO';

export interface Tally { total: number; yes: number; partially: number; no: number; unevaluated: number; percent: number | null; result: GoalResult | null }
export interface ReviewGoal { id: string; source: string; goal: string; expectedOutcome: string | null; actualProgress: string | null; result: GoalResult | null; evidence: string | null; improvementAreas: string | null; remainingGaps: string | null; evaluatedAt: string | null }
export interface ReviewSubject {
  subjectId: string;
  subjectName: string;
  planStart: string | null;
  planEnd: string | null;
  plan: { description: string; objectives: string; topics: string; outcomes: string };
  goals: ReviewGoal[];
  tally: Tally;
  improvementAreas: Array<{ id: string; area: string }>;
  tutorObservation: { note: string; recordedAt: string } | null;
  tutorFeedback: Array<{ source: string; date: string; text: string }>;
  examAverage: number | null;
  nextPlan: { kind: string; description: string; objectives: string; topics: string; outcomes: string } | null;
}
export interface ReviewExam {
  id: string; subjectId: string; subjectName: string; date: string; kind: string; title: string; conducted: boolean | null; marksObtained: number | null; maxMarks: number | null; percentage: number | null;
  chapters: string[]; portion: string | null; weaknesses: string | null; topicsToImprove: string | null; tutorSuggestions: string | null; mentorRemarks: string | null;
}
export interface ChecklistRow { key: string; label: string; done: boolean; detail: string }

export interface ReviewData {
  student: { id: string; name: string };
  mentorName: string | null;
  canWork: boolean;
  period: { planId: string | null; planStatus: string | null; start: string | null; end: string | null };
  meeting: null | {
    id: string; state: MeetingState; stateLabel: string; date: string; originalDate: string; startMinute: number | null; endMinute: number | null; status: string; conducted: boolean | null; notConductedReason: string | null;
    actual: { date: string; startMinute: number; endMinute: number } | null; attendees: string[]; participation: string | null; participationNote: string | null; examsReviewed: { at: string; note: string | null } | null; completedAt: string | null; nextPlanApproved: { at: string } | null;
  };
  exams: { items: ReviewExam[]; message: string | null; warnings: string[] };
  subjects: ReviewSubject[];
  overall: Tally;
  remarks: Record<string, string | null>;
  postMeeting: Record<string, string | null>;
  generalAreas: Array<{ id: string; area: string }>;
  checklist: ChecklistRow[];
  problems: string[];
  canComplete: boolean;
  previous: Array<{ meetingId: string; periodStart: string | null; periodEnd: string | null; date: string; completedAt: string | null }>;
  history?: Array<{ kind: string; at: string; actorUserId: string | null; reason: string | null; payload: unknown }>;
  notice: string | null;
}

export const MEETING_TONE: Record<MeetingState, 'default' | 'success' | 'warning' | 'danger' | 'info'> = {
  NOT_SCHEDULED: 'default', SCHEDULED: 'info', RESCHEDULED: 'info', NOT_CONDUCTED: 'danger', REVIEW_IN_PROGRESS: 'warning', COMPLETED: 'success', CANCELLED: 'default',
};
export const RESULT_CHOICES: Array<[GoalResult, string]> = [['YES', 'Yes'], ['PARTIALLY', 'Partially'], ['NO', 'No']];
export const resultLabel = (r: GoalResult | null) => (r === null ? 'Not evaluated' : RESULT_CHOICES.find((c) => c[0] === r)?.[1] ?? r);
export const PARTICIPATION_CHOICES: Array<[string, string]> = [['FULL', 'Parent attended the whole meeting'], ['PARTIAL', 'Parent attended part of the meeting'], ['NONE', 'Parent did not attend']];
export const NEXT_PLAN_KIND_CHOICES: Array<[string, string]> = [['NEW', 'New goals'], ['CONTINUED', 'Continued goals'], ['REVISED', 'Revised goals']];

export const REMARK_FIELDS: Array<[string, string]> = [['whatImproved', 'What improved'], ['mentorObservations', 'Mentor observations']];
export const EXPECTATION_FIELDS: Array<[string, string]> = [
  ['expHomePractice', 'Home practice'], ['expParentInvolvement', 'Parent involvement'], ['expStudyRoutine', 'Study routine'], ['expAttendanceSupport', 'Attendance support'], ['expOther', 'Other commitments'],
];
export const POST_MEETING_FIELDS: Array<[string, string]> = [
  ['parentCommunicated', 'What the parent communicated'], ['parentConcerns', 'Parent concerns'], ['parentFeedback', 'Parent feedback'], ['agreedActions', 'Agreed actions'],
  ['additionalSupport', 'Additional support required'], ['parentCommitments', 'Parent commitments'], ['followUp', 'Follow-up requirements'],
];

export const timeLabel = (start: number | null, end: number | null) => (start === null || end === null ? 'No time set' : formatRange(start, end));
export const percentLabel = (p: number | null) => (p === null ? 'Not available' : `${p}%`);

/** How a subject is going, in words, from its separate goals. Nothing is said for a goal that has not been evaluated. */
export function tallyText(t: Tally): string {
  if (t.total === 0) return 'No goals yet';
  const parts = [t.yes && `${t.yes} achieved`, t.partially && `${t.partially} partly`, t.no && `${t.no} not achieved`, t.unevaluated && `${t.unevaluated} not evaluated`].filter(Boolean);
  return parts.join(', ');
}

// ─── A goal, as it is being typed ───────────────────────────────────────────────────────────────────────────────
export interface GoalDraft { goal: string; expectedOutcome: string; actualProgress: string; result: GoalResult | ''; evidence: string; improvementAreas: string; remainingGaps: string }
export const emptyGoalDraft = (): GoalDraft => ({ goal: '', expectedOutcome: '', actualProgress: '', result: '', evidence: '', improvementAreas: '', remainingGaps: '' });
export const draftOfGoal = (g: ReviewGoal): GoalDraft => ({ goal: g.goal, expectedOutcome: g.expectedOutcome ?? '', actualProgress: g.actualProgress ?? '', result: g.result ?? '', evidence: g.evidence ?? '', improvementAreas: g.improvementAreas ?? '', remainingGaps: g.remainingGaps ?? '' });
export const payloadOfGoal = (d: GoalDraft): Record<string, unknown> => ({ goal: d.goal, expectedOutcome: d.expectedOutcome, actualProgress: d.actualProgress, result: d.result || undefined, evidence: d.evidence, improvementAreas: d.improvementAreas, remainingGaps: d.remainingGaps });
/** What is plainly missing for the goal to count as evaluated. The server decides. */
export function goalProblems(d: GoalDraft): string[] {
  const out: string[] = [];
  if (!d.goal.trim()) out.push('the planned goal');
  if (!d.result) out.push('whether it was achieved');
  if (!d.actualProgress.trim()) out.push('the actual progress');
  return out;
}

// ─── The meeting details, as they are being typed ───────────────────────────────────────────────────────────────
export interface ActualDraft { actualDate: string; start: string; end: string; attendeesText: string; participation: string; participationNote: string }
export const attendeesOf = (text: string) => text.split(/[\n,]/).map((a) => a.trim()).filter(Boolean);
const clock = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
export const draftOfActual = (m: NonNullable<ReviewData['meeting']>): ActualDraft => ({
  actualDate: m.actual?.date ?? '', start: m.actual ? clock(m.actual.startMinute) : '', end: m.actual ? clock(m.actual.endMinute) : '', attendeesText: m.attendees.join('\n'), participation: m.participation ?? '', participationNote: m.participationNote ?? '',
});
export function actualProblems(d: ActualDraft): string[] {
  const out: string[] = [];
  if (!d.actualDate) out.push('the date the meeting was held');
  if (!d.start || !d.end) out.push('the start and end times');
  else if (d.end <= d.start) out.push('an end time after the start time');
  if (attendeesOf(d.attendeesText).length === 0) out.push('who attended');
  if (!d.participation) out.push('whether the parent took part');
  return out;
}
export const payloadOfActual = (d: ActualDraft): Record<string, unknown> => ({ actualDate: d.actualDate, start: d.start, end: d.end, attendees: attendeesOf(d.attendeesText), participation: d.participation, participationNote: d.participationNote });

// ─── The next plan of a subject, as it is being typed ───────────────────────────────────────────────────────────
export interface NextPlanDraft { kind: string; description: string; objectives: string; topics: string; outcomes: string }
export const draftOfNextPlan = (s: ReviewSubject): NextPlanDraft => ({ kind: s.nextPlan?.kind ?? 'CONTINUED', description: s.nextPlan?.description ?? '', objectives: s.nextPlan?.objectives ?? '', topics: s.nextPlan?.topics ?? '', outcomes: s.nextPlan?.outcomes ?? '' });
export const nextPlanProblems = (d: NextPlanDraft) => (d.description.trim() ? [] : ['the learning plan description']);

/** The first day of the next learning period, shown before the review is completed. It is the day after the meeting date. */
export function dayAfter(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  const next = new Date(Date.UTC(y, m - 1, d + 1));
  return `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, '0')}-${String(next.getUTCDate()).padStart(2, '0')}`;
}
