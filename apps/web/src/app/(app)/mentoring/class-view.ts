/**
 * What the daily class screens show and how a tutor's update is turned into a request. The API decides every state, date,
 * minute and rule; this file only arranges what it sent and checks the obvious before asking. Dates stay plain text.
 */
import { formatRange, minutesToClock } from './tutor-availability';

export type ClassState =
  | 'SCHEDULED' | 'REMINDER_PENDING' | 'REMINDER_SENT' | 'AWAITING_TUTOR_UPDATE' | 'AWAITING_MENTOR_VERIFICATION' | 'RETURNED_FOR_CORRECTION' | 'VERIFIED' | 'NOT_CONDUCTED' | 'RESCHEDULED';

export interface ChecklistRow { key: string; label: string; done: boolean; detail: string }

export interface ClassUpdate {
  conducted: boolean | null;
  actualStartMinute: number | null;
  actualEndMinute: number | null;
  actualMinutes: number | null;
  subjectCovered: string | null;
  topicsCovered: string | null;
  attendance: string | null;
  participation: string | null;
  classNotes: string | null;
  notConductedReason: string | null;
  activities: string[];
  otherActivity: string | null;
  evaluationRemarks: string | null;
  coveredRemarks: string | null;
  voice: { sentAt: string | null; receivedAt: string | null; remarks: string | null };
  submittedAt: string | null;
}

export interface ClassItem {
  key: string;
  sessionId: string | null;
  activationId: string;
  studentName: string;
  subjectId: string;
  subjectName: string;
  tutorProfileId: string;
  tutorName: string;
  date: string;
  startMinute: number;
  endMinute: number;
  scheduledMinutes: number;
  moved: boolean;
  status: string;
  state: ClassState;
  stateLabel: string;
  reminder: { status: string | null; sentAt: string | null; acknowledgedAt: string | null } | null;
  tutorConfirmation: 'ACKNOWLEDGED' | 'SENT' | 'NOT_SENT';
  mentorVerification: 'VERIFIED' | 'NOT_CONDUCTED' | 'PENDING';
  update: ClassUpdate | null;
  checklist: ChecklistRow[];
  mentorRemarks: string | null;
  returned: { reason: string; kind: string } | null;
  verified: { at: string; minutes: number } | null;
  sla: { state: string; label: string; dueAt: string; overdueMinutes: number } | null;
  warnings?: string[];
  history?: Array<{ kind: string; at: string; actorUserId: string | null; reason: string | null; from: string | null; to: string | null }>;
  adjustments?: Array<{ at: string; previousMinutes: number; newMinutes: number; deltaMinutes: number; reason: string; appliedToRecord: boolean }>;
}

export interface DailyData {
  date: string;
  student: { id: string; name: string };
  classes: ClassItem[];
  counts: Record<string, number>;
  canWork: boolean;
}

export const STATE_TONE: Record<ClassState, 'default' | 'success' | 'warning' | 'danger' | 'info'> = {
  SCHEDULED: 'default', REMINDER_PENDING: 'info', REMINDER_SENT: 'info', AWAITING_TUTOR_UPDATE: 'warning', AWAITING_MENTOR_VERIFICATION: 'warning', RETURNED_FOR_CORRECTION: 'danger', VERIFIED: 'success', NOT_CONDUCTED: 'default', RESCHEDULED: 'info',
};
/** The states a Mentor can filter by, in the order of a class's life. */
export const STATE_CHOICES: Array<[ClassState, string]> = [
  ['SCHEDULED', 'Scheduled'], ['REMINDER_PENDING', 'Reminder pending'], ['REMINDER_SENT', 'Reminder sent'], ['AWAITING_TUTOR_UPDATE', 'Awaiting tutor update'], ['AWAITING_MENTOR_VERIFICATION', 'Awaiting Mentor verification'],
  ['RETURNED_FOR_CORRECTION', 'Returned for correction'], ['VERIFIED', 'Verified'], ['NOT_CONDUCTED', 'Not conducted'], ['RESCHEDULED', 'Rescheduled'],
];

export const TUTOR_CONFIRMATION_LABELS: Record<ClassItem['tutorConfirmation'], string> = { ACKNOWLEDGED: 'Acknowledged by the tutor', SENT: 'Reminder sent, not acknowledged', NOT_SENT: 'No reminder sent' };
export const VERIFICATION_LABELS: Record<ClassItem['mentorVerification'], string> = { VERIFIED: 'Verified', NOT_CONDUCTED: 'Confirmed not conducted', PENDING: 'Not verified' };

export const ACTIVITIES: Array<[string, string]> = [
  ['EDUCATIONAL_GAMES', 'Educational games'], ['WORKSHEET', 'Worksheet'], ['PRACTICE_QUESTIONS', 'Practice questions'], ['READING', 'Reading activity'], ['WRITING', 'Writing activity'],
  ['REVISION', 'Revision'], ['QUIZ', 'Quiz'], ['PROBLEM_SOLVING', 'Problem solving'], ['GROUP_DISCUSSION', 'Group discussion'], ['PRACTICAL', 'Practical activity'],
  ['HOMEWORK', 'Homework'], ['PROJECT_WORK', 'Project work'], ['OTHER', 'Other'],
];
export const activityLabel = (code: string) => ACTIVITIES.find((a) => a[0] === code)?.[1] ?? code;
export const ATTENDANCE_CHOICES: Array<[string, string]> = [['PRESENT', 'Present'], ['LATE', 'Late'], ['ABSENT', 'Absent'], ['EXCUSED', 'Excused']];
export const PARTICIPATION_CHOICES: Array<[string, string]> = [['EXCELLENT', 'Excellent'], ['GOOD', 'Good'], ['FAIR', 'Fair'], ['POOR', 'Poor']];

export const timeLabel = (c: Pick<ClassItem, 'startMinute' | 'endMinute'>) => formatRange(c.startMinute, c.endMinute);
export const hoursText = (minutes: number) => {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h && m ? `${h} h ${m} min` : h ? `${h} h` : `${m} min`;
};

// ─── The tutor's update, as it is being typed ────────────────────────────────────────────────────────────────────
export interface UpdateDraft {
  conducted: 'yes' | 'no' | '';
  actualStart: string;
  actualEnd: string;
  subjectCovered: string;
  topicsCovered: string;
  attendance: string;
  participation: string;
  classNotes: string;
  notConductedReason: string;
  activities: string[];
  otherActivity: string;
  evaluationRemarks: string;
  coveredRemarks: string;
  voiceSent: boolean;
}

/** A draft from what was already submitted, or an empty one. Nothing is filled in on the tutor's behalf. */
export function draftFromClass(c: Pick<ClassItem, 'update'>): UpdateDraft {
  const u = c.update;
  return {
    conducted: u?.conducted === true ? 'yes' : u?.conducted === false ? 'no' : '',
    actualStart: u?.actualStartMinute != null ? minutesToClock(u.actualStartMinute) : '',
    actualEnd: u?.actualEndMinute != null ? minutesToClock(u.actualEndMinute) : '',
    subjectCovered: u?.subjectCovered ?? '',
    topicsCovered: u?.topicsCovered ?? '',
    attendance: u?.attendance ?? '',
    participation: u?.participation ?? '',
    classNotes: u?.classNotes ?? '',
    notConductedReason: u?.notConductedReason ?? '',
    activities: u?.activities ?? [],
    otherActivity: u?.otherActivity ?? '',
    evaluationRemarks: u?.evaluationRemarks ?? '',
    coveredRemarks: u?.coveredRemarks ?? '',
    voiceSent: u?.voice.sentAt != null,
  };
}

/** What is plainly missing, so the button can say so before asking the server. The server still decides. */
export function updateProblems(d: UpdateDraft): string[] {
  if (d.conducted === '') return ['say whether the class was conducted'];
  if (d.conducted === 'no') return d.notConductedReason.trim() ? [] : ['say why it was not conducted'];
  const out: string[] = [];
  if (!d.actualStart || !d.actualEnd) out.push('the actual start and end times');
  else if (d.actualEnd <= d.actualStart) out.push('an end time after the start time');
  if (!d.topicsCovered.trim()) out.push('the topics covered');
  if (!d.attendance) out.push('attendance');
  if (d.activities.includes('OTHER') && !d.otherActivity.trim()) out.push('a description of the other activity');
  return out;
}

export function payloadOfUpdate(d: UpdateDraft): Record<string, unknown> {
  if (d.conducted === 'no') return { conducted: false, notConductedReason: d.notConductedReason, voiceSent: d.voiceSent };
  return {
    conducted: true, actualStart: d.actualStart, actualEnd: d.actualEnd, subjectCovered: d.subjectCovered || undefined, topicsCovered: d.topicsCovered, attendance: d.attendance,
    participation: d.participation || undefined, classNotes: d.classNotes || undefined, activities: d.activities, otherActivity: d.activities.includes('OTHER') ? d.otherActivity : undefined,
    evaluationRemarks: d.evaluationRemarks || undefined, coveredRemarks: d.coveredRemarks || undefined, voiceSent: d.voiceSent,
  };
}

export const toggleActivity = (list: readonly string[], code: string) => (list.includes(code) ? list.filter((a) => a !== code) : [...list, code]);

// ─── The tutor's earnings ────────────────────────────────────────────────────────────────────────────────────────
export interface EarningsData {
  from: string;
  to: string;
  verified: Array<{
    sessionId: string; date: string; subject: string; scheduledMinutes: number; actualMinutes: number | null; verifiedMinutes: number; estimatedAmount: number | null; currency: string | null;
    payroll: { period: string | null; runStatus: string | null; paymentStatus: string; amount: number; currency: string; paidAt: string | null } | null;
    adjustments: Array<{ at: string; deltaMinutes: number; reason: string; appliedToRecord: boolean }>;
  }>;
  pending: Array<{ sessionId: string; date: string; subject: string; scheduledMinutes: number; actualMinutes: number | null; status: string; pendingMinutes: number }>;
  totals: { verifiedMinutes: number; pendingMinutes: number; estimatedAmount: number; classesWithoutRate: number };
  note: string;
}
