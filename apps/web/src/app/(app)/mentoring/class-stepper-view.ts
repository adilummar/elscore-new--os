/**
 * The class workflow stepper: which step is open, what each step looks like, and what a form must have before it asks the API. The API
 * decides the stage statuses and every rule; this file only arranges what it sent. Opening a step never completes it: a step is complete
 * only when the API says it was submitted (Before and After class), recorded (Actual time) or verified (Verification).
 */
import { hoursText, timeLabel } from './class-view';
import { tutorUpdateRows as tutorUpdateRowsOf } from './class-sections-view';
import type { ActivityChoice, StageKey, StageStep, StageSubmission, WorkspaceData } from './workspace-view';

/** The step keys as they appear in the address (?tab=). */
export type StepId = 'before' | 'after' | 'timing' | 'verification';
export const STEP_IDS: ReadonlyArray<StepId> = ['before', 'after', 'timing', 'verification'];
export const STEP_LABELS: Record<StepId, string> = { before: 'Before Class', after: 'After Class', timing: 'Actual Time', verification: 'Verification' };
const API_KEY: Record<StepId, StageKey> = { before: 'BEFORE', after: 'AFTER', timing: 'TIMING', verification: 'VERIFICATION' };
const ID_OF: Record<StageKey, StepId> = { BEFORE: 'before', AFTER: 'after', TIMING: 'timing', VERIFICATION: 'verification' };

export const idOfStage = (k: StageKey): StepId => ID_OF[k];
export const stageOfId = (id: StepId): StageKey => API_KEY[id];

export interface StepView { id: StepId; label: string; state: StageStep['state']; stateText: string; reachable: boolean; number: number }

const STATE_TEXT: Record<StageStep['state'], string> = { COMPLETE: 'Completed', CURRENT: 'Current', PENDING: 'Not started', ATTENTION: 'Needs attention' };

/**
 * The four steps in order. Without the API's workflow (the class has no record yet, or it is cancelled) every step is open to look at and none is
 * marked done, so nothing is claimed that was not recorded.
 */
export function stepViews(w: Pick<WorkspaceData, 'workflow'>, selected: StepId): StepView[] {
  const steps = w.workflow?.stages.steps;
  return STEP_IDS.map((id, i) => {
    const s = steps?.find((x) => ID_OF[x.key] === id);
    const base: StageStep['state'] = s?.state ?? 'PENDING';
    // The step being looked at reads as current unless it is already complete or needs attention.
    const state = id === selected && base === 'PENDING' ? 'CURRENT' : base;
    return { id, label: STEP_LABELS[id], state, stateText: STATE_TEXT[state], reachable: s ? s.reachable : true, number: i + 1 };
  });
}

/** The step to open: the one in the address if the person may reach it, otherwise the API's suggestion, otherwise the first. */
export function openingStep(param: string | undefined, w: Pick<WorkspaceData, 'workflow'>): StepId {
  const wanted = param === 'review' ? 'verification' : STEP_IDS.find((x) => x === param);
  const steps = w.workflow?.stages.steps;
  const reachable = (id: StepId) => steps?.find((s) => ID_OF[s.key] === id)?.reachable ?? true;
  if (wanted && reachable(wanted)) return wanted;
  if (wanted && !w.workflow) return wanted;
  return w.workflow ? ID_OF[w.workflow.stages.suggested] : 'before';
}

export const nextStep = (id: StepId): StepId | null => STEP_IDS[STEP_IDS.indexOf(id) + 1] ?? null;

export const submissionOf = (w: Pick<WorkspaceData, 'workflow'>, stage: 'BEFORE' | 'AFTER'): StageSubmission | null => w.workflow?.stages.submissions.find((s) => s.stage === stage) ?? null;

/** Where the step bar says the person is: "Step 2 of 4, After Class, Not started". */
export const stepSummary = (s: StepView) => `Step ${s.number} of ${STEP_IDS.length}, ${s.label}, ${s.stateText.toLowerCase()}`;

// ─── Before Class ────────────────────────────────────────────────────────────────────────────────────────────────
export const BEFORE_ITEM = { key: 'reminderSent', label: 'Tutor has sent the class reminder to the student' } as const;

export function beforeProblems(ticked: boolean): string[] {
  return ticked ? [] : ['Tick that the tutor has sent the class reminder.'];
}
export const beforePayload = (ticked: boolean) => ({ items: { reminderSent: ticked } });

/** The submission says who recorded it and when. It is a statement, not proof the student received or read the reminder. */
export function submissionNote(s: Pick<StageSubmission, 'submittedAt' | 'submittedBy' | 'version'> | null): string | null {
  if (!s) return null;
  const at = `${s.submittedAt.slice(0, 10)} ${s.submittedAt.slice(11, 16)} UTC`;
  return `Submitted by ${s.submittedBy ?? 'a user'} on ${at}${s.version > 1 ? `, corrected ${s.version - 1} time${s.version > 2 ? 's' : ''}` : ''}.`;
}

// ─── After Class ─────────────────────────────────────────────────────────────────────────────────────────────────
export const AFTER_ITEMS: ReadonlyArray<{ key: 'checklistShared' | 'voiceShared' | 'activitiesGiven'; label: string }> = [
  { key: 'checklistShared', label: 'After-class checklist shared' },
  { key: 'voiceShared', label: 'Voice recording shared' },
  { key: 'activitiesGiven', label: 'Activities given' },
];
export interface AfterDraft { items: Record<string, boolean>; activities: string[]; otherDescription: string }

export const emptyAfter = (): AfterDraft => ({ items: { checklistShared: false, voiceShared: false, activitiesGiven: false }, activities: [], otherDescription: '' });
/** The draft a saved submission starts from, so a correction begins from what was recorded. */
export function afterDraftOf(s: StageSubmission | null): AfterDraft {
  if (!s) return emptyAfter();
  return {
    items: { checklistShared: !!s.checklist.items.checklistShared, voiceShared: !!s.checklist.items.voiceShared, activitiesGiven: !!s.checklist.items.activitiesGiven },
    activities: (s.checklist.activities ?? []).map((a) => a.code),
    otherDescription: s.checklist.otherDescription ?? '',
  };
}
export const toggleCode = (list: readonly string[], code: string) => (list.includes(code) ? list.filter((c) => c !== code) : [...list, code]);

export function afterProblems(d: AfterDraft): string[] {
  const out: string[] = [];
  for (const i of AFTER_ITEMS) if (!d.items[i.key]) out.push(`Tick "${i.label}".`);
  if (d.activities.length === 0) out.push('Choose at least one activity that was given.');
  if (d.activities.includes('OTHER') && !d.otherDescription.trim()) out.push('Describe the other activity.');
  return out;
}
export const afterPayload = (d: AfterDraft) => ({ items: d.items, activities: d.activities, ...(d.activities.includes('OTHER') ? { otherDescription: d.otherDescription.trim() } : {}) });

/** The choices the Mentor sees: the active options, plus any already recorded on this class that were since switched off. */
export const visibleChoices = (choices: ActivityChoice[]) => choices.filter((c) => c.active);

// ─── Actual Time ─────────────────────────────────────────────────────────────────────────────────────────────────
export interface TimeLine { label: string; value: string; note?: string; differs?: boolean }

const range = (a: number | null | undefined, b: number | null | undefined) => (a == null || b == null ? null : timeLabel({ startMinute: a, endMinute: b }));

/**
 * Scheduled, tutor-reported, Mentor-recorded and verified times, each on its own line. None replaces another: the scheduled time is never
 * changed by an actual time, and the verified minutes are set only by the Mentor's verification.
 */
export function timeLines(w: Pick<WorkspaceData, 'class' | 'review' | 'workflow'>): TimeLine[] {
  const c = w.class;
  const u = c.update;
  const tutor = u && u.conducted !== false && u.actualStartMinute != null && u.actualEndMinute != null ? { start: u.actualStartMinute, end: u.actualEndMinute, minutes: u.actualMinutes } : null;
  const mentor = w.workflow?.mentorActual ?? null;
  const shifted = (s: number, e: number) => s !== c.startMinute || e !== c.endMinute;
  const v = w.review.minutes.verified;
  return [
    { label: 'Scheduled start and end', value: timeLabel(c) },
    { label: 'Scheduled duration', value: hoursText(c.scheduledMinutes) },
    { label: 'Actual start and end, reported by the tutor', value: tutor ? (range(tutor.start, tutor.end) as string) : 'Not reported by the tutor yet', differs: !!tutor && shifted(tutor.start, tutor.end) },
    { label: 'Actual duration, reported by the tutor', value: tutor && tutor.minutes != null ? hoursText(tutor.minutes) : 'Not reported', differs: !!tutor && tutor.minutes != null && tutor.minutes !== c.scheduledMinutes },
    { label: 'Actual start and end, recorded by the Mentor', value: mentor ? (range(mentor.startMinute, mentor.endMinute) as string) : 'Not recorded', note: mentor ? `${mentor.by ?? 'The Mentor'}${mentor.at ? ` on ${mentor.at.slice(0, 16).replace('T', ' ')} UTC` : ''}. Reason: ${mentor.reason ?? 'not given'}` : undefined, differs: !!mentor && shifted(mentor.startMinute, mentor.endMinute) },
    { label: 'Actual duration, recorded by the Mentor', value: mentor ? hoursText(mentor.minutes) : 'Not recorded' },
    { label: 'Verified duration', value: v == null ? 'Not verified' : hoursText(v) },
  ];
}

/** "16:30" for an input of type time, from minutes after midnight. */
export const timeInputOf = (m: number | null | undefined) => (m == null ? '' : `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`);
export const minutesOfInput = (t: string): number | null => (/^([01]\d|2[0-3]):[0-5]\d$/.test(t) ? Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5)) : null);

export interface ActualDraft { start: string; end: string; reason: string }
export function actualProblems(d: ActualDraft): string[] {
  const out: string[] = [];
  const s = minutesOfInput(d.start);
  const e = minutesOfInput(d.end);
  if (s === null) out.push('the actual start time');
  if (e === null) out.push('the actual end time');
  if (s !== null && e !== null && e <= s) out.push('an end time after the start time');
  if (!d.reason.trim()) out.push('the reason');
  return out;
}
export const actualPayload = (d: ActualDraft) => ({ start: d.start, end: d.end, reason: d.reason.trim() });

// ─── Edit Schedule / Reschedule ──────────────────────────────────────────────────────────────────────────────────
export interface RescheduleDraft { date: string; start: string; end: string; reason: string; confirmed: boolean }
export const rescheduleDraftOf = (c: Pick<WorkspaceData['class'], 'date' | 'startMinute' | 'endMinute'>): RescheduleDraft => ({ date: c.date, start: timeInputOf(c.startMinute), end: timeInputOf(c.endMinute), reason: '', confirmed: false });

export function rescheduleProblems(d: RescheduleDraft, c: Pick<WorkspaceData['class'], 'date' | 'startMinute' | 'endMinute'>, today: string): string[] {
  const out: string[] = [];
  const s = minutesOfInput(d.start);
  const e = minutesOfInput(d.end);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d.date)) out.push('the new date');
  else if (d.date < today) out.push('a date that is today or later');
  if (s === null) out.push('the new start time');
  if (e === null) out.push('the new end time');
  if (s !== null && e !== null && e <= s) out.push('an end time after the start time');
  if (s !== null && e !== null && d.date === c.date && s === c.startMinute && e === c.endMinute) out.push('a time that is different from the current one');
  if (!d.reason.trim()) out.push('the reason');
  if (!d.confirmed) out.push('your confirmation');
  return out;
}
export const reschedulePayload = (key: string, d: RescheduleDraft) => ({ key, newDate: d.date, newStart: d.start, newEnd: d.end, reason: d.reason.trim() });

// ─── Verification ────────────────────────────────────────────────────────────────────────────────────────────────
export interface EvidenceLine { label: string; value: string; ok: boolean }

/** What the Mentor is verifying against, in one list. Each line says what was recorded and what was not. */
export function evidenceLines(w: Pick<WorkspaceData, 'class' | 'before' | 'after' | 'review' | 'workflow'>): EvidenceLine[] {
  const b = submissionOf(w, 'BEFORE');
  const a = submissionOf(w, 'AFTER');
  const u = w.class.update;
  const voice = w.after.voice;
  const given = a?.checklist.activities?.length ? a.checklist.activities.map((x) => (x.code === 'OTHER' && a.checklist.otherDescription ? `Other: ${a.checklist.otherDescription}` : x.label)).join(', ') : null;
  const mentor = w.workflow?.mentorActual ?? null;
  return [
    { label: 'Before-class checklist', ok: !!b, value: b ? (submissionNote(b) as string) : 'Not submitted by the Mentor' },
    { label: 'Reminder shared in the group', ok: !!w.before.message.share?.confirmedAt, value: w.before.message.share?.confirmedAt ? `Recorded by ${w.before.message.share.confirmedBy ?? 'a user'}` : w.before.message.share ? 'Prepared or copied, not recorded as shared' : 'No reminder message prepared' },
    { label: 'After-class checklist', ok: !!a, value: a ? (submissionNote(a) as string) : 'Not submitted by the Mentor' },
    { label: 'Activities given', ok: !!given, value: given ?? 'None recorded' },
    { label: 'Tutor update', ok: !!u?.submittedAt, value: u?.submittedAt ? `Submitted ${u.submittedAt.slice(0, 10)}` : 'The tutor has not submitted it' },
    { label: 'Voice recording', ok: !!voice?.sharedAt, value: voice ? (voice.sharedAt ? 'Uploaded and recorded as shared' : 'Uploaded, sharing not recorded') : 'Not uploaded' },
    { label: 'Scheduled time', ok: true, value: `${timeLabel(w.class)}, ${hoursText(w.class.scheduledMinutes)}` },
    { label: 'Actual time', ok: !!mentor || (!!u && u.actualStartMinute != null), value: mentor ? `Recorded by the Mentor: ${range(mentor.startMinute, mentor.endMinute)}` : u && u.actualStartMinute != null && u.actualEndMinute != null ? `Reported by the tutor: ${range(u.actualStartMinute, u.actualEndMinute)}` : 'No actual time recorded' },
  ];
}

// ─── The tutor update, read-only for the Mentor ──────────────────────────────────────────────────────────────────
/** The tutor's update in full: the class status and the voice update as well as the written fields. Empty fields stay empty. */
export function tutorUpdateFull(w: Pick<WorkspaceData, 'class'>): Array<{ label: string; value: string }> {
  const u = w.class.update;
  if (!u || !u.submittedAt) return [];
  const v = u.voice;
  const voice = v?.sentAt ? `Sent ${v.sentAt.slice(0, 10)}${v.remarks ? `. ${v.remarks}` : ''}` : v?.receivedAt ? `Received ${v.receivedAt.slice(0, 10)}${v.remarks ? `. ${v.remarks}` : ''}` : 'No voice update recorded';
  const rows = tutorUpdateRowsOf(w);
  return [{ label: 'Class status', value: w.class.stateLabel }, ...rows, { label: 'Voice update', value: voice }];
}
