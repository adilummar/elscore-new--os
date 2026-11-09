/**
 * What the Stage 5 learning plan page shows and how a draft is turned into a request. The API decides every status, date
 * and rule; this file only arranges what it sent. Dates stay plain YYYY-MM-DD text so no time zone can move one.
 */
export type OverallStatus = 'NOT_STARTED' | 'DRAFT' | 'PENDING_REVIEW_DATE' | 'READY_FOR_REVIEW' | 'APPROVED';
export type SubjectStatus = 'NOT_STARTED' | 'DRAFT' | 'PENDING_END_DATE' | 'COMPLETE';

export interface SubjectPlanFields {
  description: string;
  objectives: string;
  topics: string;
  outcomes: string;
  startsOn: string | null;
  endsOn: string | null;
}

export interface LearningPlanSubject {
  subjectId: string;
  subjectName: string;
  gradeName: string;
  scheduleStart: string | null;
  defaultStart: string | null;
  status: SubjectStatus;
  plan: SubjectPlanFields | null;
  createdBy: string | null;
  createdAt: string | null;
  updatedBy: string | null;
  updatedAt: string | null;
}

export interface LearningPlanData {
  student: { id: string; name: string };
  status: OverallStatus;
  planStatus: 'DRAFT' | 'READY_FOR_REVIEW' | 'APPROVED' | null;
  summary: { enrolledSubjects: number; completedSubjects: number; overallStart: string | null; nextReviewMeeting: string | null; endsOn: string | null };
  meeting: { id: string; date: string } | null;
  pendingMessage: string | null;
  pendingExplanation: string | null;
  problems: string[];
  subjects: LearningPlanSubject[];
  history: Array<{ version: number; kind: string; reason: string | null; changedBy: string | null; at: string }>;
  approval: { by: string | null; at: string | null };
  stageStatus: string | null;
  canEdit: boolean;
}

export const OVERALL_LABELS: Record<OverallStatus, string> = {
  NOT_STARTED: 'Not started',
  DRAFT: 'Draft',
  PENDING_REVIEW_DATE: 'Pending review date',
  READY_FOR_REVIEW: 'Ready for review',
  APPROVED: 'Approved',
};

export const SUBJECT_LABELS: Record<SubjectStatus, string> = {
  NOT_STARTED: 'Not started',
  DRAFT: 'Incomplete',
  PENDING_END_DATE: 'Incomplete, end date pending',
  COMPLETE: 'Complete',
};

export const HISTORY_LABELS: Record<string, string> = {
  SAVED: 'Subject plan saved',
  REOPENED: 'Approved plan changed',
  MARKED_READY: 'Marked ready for review',
  APPROVED: 'Plan approved',
  REVIEW_DATE_SYNCED: 'Review meeting date applied',
};

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** "10 Nov 2026" for 2026-11-10. */
export const formatDate = (d: string | null | undefined): string => (d ? `${Number(d.slice(8, 10))} ${MONTHS[Number(d.slice(5, 7)) - 1]} ${d.slice(0, 4)}` : '');
export const formatDateTime = (iso: string) => `${formatDate(iso.slice(0, 10))}, ${iso.slice(11, 16)} UTC`;

/** What the Mentor is editing for one subject. Empty strings stand for "not chosen". */
export interface Draft {
  description: string;
  objectives: string;
  topics: string;
  outcomes: string;
  startsOn: string;
  endsOn: string;
}

/** The saved plan if there is one. Otherwise empty, with the planned first class offered as the start date. */
export function draftOf(subject: LearningPlanSubject, meetingDate: string | null): Draft {
  const p = subject.plan;
  return {
    description: p?.description ?? '',
    objectives: p?.objectives ?? '',
    topics: p?.topics ?? '',
    outcomes: p?.outcomes ?? '',
    startsOn: p?.startsOn ?? subject.defaultStart ?? '',
    endsOn: p?.endsOn ?? meetingDate ?? '',
  };
}

export const isDirty = (draft: Draft, subject: LearningPlanSubject, meetingDate: string | null): boolean => {
  const saved = draftOf(subject, meetingDate);
  return !subject.plan || (Object.keys(saved) as Array<keyof Draft>).some((k) => saved[k] !== draft[k]);
};

/** The request for one subject. The end date is sent only when a meeting is scheduled: until then there is none to send. */
export function payloadOf(draft: Draft, meetingDate: string | null, reason: string): Record<string, unknown> {
  return {
    description: draft.description,
    objectives: draft.objectives,
    topics: draft.topics,
    outcomes: draft.outcomes,
    startsOn: draft.startsOn || undefined,
    ...(meetingDate ? { endsOn: draft.endsOn || meetingDate } : {}),
    ...(reason.trim() ? { reason: reason.trim() } : {}),
  };
}

/** What the browser can already say is missing, before asking the server. The server still decides. */
export function missingFor(draft: Draft): string[] {
  const out: string[] = [];
  if (!draft.description.trim()) out.push('the description');
  if (!draft.startsOn) out.push('the start date');
  return out;
}
