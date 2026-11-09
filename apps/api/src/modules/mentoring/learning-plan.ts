/**
 * The Individual Learning Plan: one plan for every subject, all inside one learning period that ends on the date of the
 * next monthly review meeting. Pure rules, no database and no framework.
 *
 * The end date is never worked out here. It is the date of a scheduled review meeting, or it is empty. There is no
 * 30 day default and no end of month default, because a date nobody scheduled would later disagree with the meeting.
 */
import { isDateString, occursOn, datesBetween, addDays } from '../tutor/tutor-calendar';

import { PlanSubject } from './student-timetable';

export type OverallStatus = 'NOT_STARTED' | 'DRAFT' | 'PENDING_REVIEW_DATE' | 'READY_FOR_REVIEW' | 'APPROVED';
export type SubjectStatus = 'NOT_STARTED' | 'DRAFT' | 'PENDING_END_DATE' | 'COMPLETE';

export const TEXT_LIMIT = 2000;
export const PENDING_REVIEW_MESSAGE = 'Monthly review meeting date pending';
export const PENDING_REVIEW_EXPLANATION = 'The learning plan end date will be confirmed when the next monthly review meeting is scheduled.';

export interface SubjectPlanFields {
  description: string;
  objectives: string;
  topics: string;
  outcomes: string;
  startsOn: string | null;
  endsOn: string | null;
}

/** What the Mentor has to choose a plan for: a subject of the saved Stage 2 schedule. */
export interface EnrolledSubject {
  subjectId: string;
  subjectName: string;
  gradeName: string;
  /** The date the subject's classes start, from the saved schedule. */
  scheduleStart: string | null;
  /** The date of the first planned class, found from the schedule's own rule. The default start date of the plan. */
  firstClass: string | null;
}

/** The first date, within about two months of the schedule's start date, on which the schedule really has a class. */
export function firstClassDate(subject: Pick<PlanSubject, 'startDate' | 'frequency' | 'sessions'>): string | null {
  if (!subject.startDate) return null;
  const days = datesBetween(subject.startDate, addDays(subject.startDate, 62));
  for (const date of days) {
    if (subject.sessions.some((s) => occursOn({ dayNumber: s.dayNumber, frequency: subject.frequency, week: s.week, occurrences: s.occurrences, startDate: subject.startDate, endDate: null }, date))) return date;
  }
  return null;
}

export function enrolledFrom(subjects: readonly PlanSubject[]): EnrolledSubject[] {
  return subjects.map((s) => ({ subjectId: s.subjectId, subjectName: s.subjectName, gradeName: s.gradeName, scheduleStart: s.startDate, firstClass: firstClassDate(s) }));
}

// ─── Checking what the Mentor typed ──────────────────────────────────────────────────────────────────────────────
export type Checked = { ok: true; value: SubjectPlanFields } | { ok: false; message: string };

const text = (v: unknown): string | null => (v === undefined || v === null ? '' : typeof v === 'string' ? v.trim() : null);

/**
 * Checks one subject's plan. `meetingDate` is the date of the scheduled monthly review meeting, or null when none is
 * scheduled. The end date is that date by default, may be earlier but never later, and cannot be given at all while no
 * meeting is scheduled.
 */
export function checkSubjectPlan(raw: unknown, ctx: { scheduleStart: string | null; meetingDate: string | null }): Checked {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ok: false, message: 'Send the learning plan for the subject.' };
  const r = raw as Record<string, unknown>;
  const description = text(r.description);
  const objectives = text(r.objectives);
  const topics = text(r.topics);
  const outcomes = text(r.outcomes);
  if (description === null || objectives === null || topics === null || outcomes === null) return { ok: false, message: 'The description, objectives, topics and outcomes must be text.' };
  if (!description) return { ok: false, message: 'Write the learning plan description for this subject.' };
  for (const [label, value] of [['description', description], ['objectives', objectives], ['topics', topics], ['outcomes', outcomes]] as const) {
    if (value.length > TEXT_LIMIT) return { ok: false, message: `The ${label} must be ${TEXT_LIMIT} characters or fewer.` };
  }

  const startsOn = r.startsOn;
  if (typeof startsOn !== 'string' || !isDateString(startsOn)) return { ok: false, message: 'Choose a real start date for this subject, written like 2026-11-10.' };
  if (ctx.scheduleStart && startsOn < ctx.scheduleStart) return { ok: false, message: `The plan cannot start before the classes start on ${ctx.scheduleStart}.` };
  if (ctx.meetingDate && startsOn > ctx.meetingDate) return { ok: false, message: `The plan cannot start after the monthly review meeting on ${ctx.meetingDate}.` };

  const given = r.endsOn === undefined || r.endsOn === null || r.endsOn === '' ? null : r.endsOn;
  if (!ctx.meetingDate) {
    if (given !== null) return { ok: false, message: 'The end date is the monthly review meeting date, and no meeting is scheduled yet. Leave it empty.' };
    return { ok: true, value: { description, objectives, topics, outcomes, startsOn, endsOn: null } };
  }
  if (given !== null && (typeof given !== 'string' || !isDateString(given))) return { ok: false, message: 'Choose a real end date, written like 2026-12-10.' };
  const endsOn = (given) ?? ctx.meetingDate;
  if (endsOn < startsOn) return { ok: false, message: 'The end date cannot be earlier than the start date.' };
  if (endsOn > ctx.meetingDate) return { ok: false, message: `The end date cannot be later than the monthly review meeting on ${ctx.meetingDate}.` };
  return { ok: true, value: { description, objectives, topics, outcomes, startsOn, endsOn } };
}

/** Is this a date the next phase may schedule the meeting on? It cannot fall before a subject's plan has started. */
export function meetingDateProblem(date: unknown, plannedStarts: readonly string[]): string | null {
  if (typeof date !== 'string' || !isDateString(date)) return 'Choose a real meeting date, written like 2026-12-10.';
  const latest = [...plannedStarts].sort().pop();
  if (latest && date < latest) return `The monthly review meeting cannot be before ${latest}, when a subject plan starts.`;
  return null;
}

// ─── Status ──────────────────────────────────────────────────────────────────────────────────────────────────────
export function subjectStatus(plan: SubjectPlanFields | null | undefined, meetingDate: string | null): SubjectStatus {
  if (!plan) return 'NOT_STARTED';
  if (!plan.description.trim() || !plan.startsOn) return 'DRAFT';
  if (!meetingDate || !plan.endsOn) return 'PENDING_END_DATE';
  return 'COMPLETE';
}

export interface OverallInput {
  enrolled: readonly EnrolledSubject[];
  plans: ReadonlyMap<string, SubjectPlanFields>;
  planStatus: 'DRAFT' | 'READY_FOR_REVIEW' | 'APPROVED' | null;
  meetingDate: string | null;
}

/**
 * The status of the whole plan. It is not complete until every enrolled subject has its own complete plan: another
 * subject's plan never counts for it, and a subject added after approval takes the plan out of Approved.
 */
export function overallStatus({ enrolled, plans, planStatus, meetingDate }: OverallInput): OverallStatus {
  if (enrolled.length === 0 || [...plans.keys()].length === 0) return 'NOT_STARTED';
  const states = enrolled.map((s) => subjectStatus(plans.get(s.subjectId), meetingDate));
  if (states.some((s) => s === 'NOT_STARTED' || s === 'DRAFT')) return 'DRAFT';
  if (states.some((s) => s === 'PENDING_END_DATE')) return 'PENDING_REVIEW_DATE';
  if (planStatus === 'APPROVED') return 'APPROVED';
  if (planStatus === 'READY_FOR_REVIEW') return 'READY_FOR_REVIEW';
  return 'DRAFT';
}

/** Why the plan cannot be marked ready or approved yet, in words. Empty when it can. */
export function readinessProblems(enrolled: readonly EnrolledSubject[], plans: ReadonlyMap<string, SubjectPlanFields>, meetingDate: string | null): string[] {
  const out: string[] = [];
  if (enrolled.length === 0) return ['There are no subjects in the saved schedule yet.'];
  for (const s of enrolled) {
    const st = subjectStatus(plans.get(s.subjectId), meetingDate);
    if (st === 'NOT_STARTED') out.push(`${s.subjectName}: no learning plan yet.`);
    else if (st === 'DRAFT') out.push(`${s.subjectName}: the description and start date are required.`);
  }
  if (!meetingDate) out.push(`${PENDING_REVIEW_MESSAGE}. ${PENDING_REVIEW_EXPLANATION}`);
  return out;
}

// ─── Following the meeting date ──────────────────────────────────────────────────────────────────────────────────
/**
 * The end date of each subject after the meeting date changes. A subject that ended on the old meeting date, or that had
 * no end date, ends on the new one. A subject the Mentor chose to end earlier keeps that date unless it is now later than
 * the meeting. With no meeting, no subject has an end date.
 */
export function syncedEndDate(current: string | null, previousMeeting: string | null, nextMeeting: string | null): string | null {
  if (!nextMeeting) return null;
  if (current === null || current === previousMeeting || current > nextMeeting) return nextMeeting;
  return current;
}

export interface PlanSnapshot {
  status: string;
  endsOn: string | null;
  reviewMeetingId: string | null;
  subjects: Array<SubjectPlanFields & { subjectId: string }>;
}

export const sameFields = (a: SubjectPlanFields, b: SubjectPlanFields) =>
  a.description === b.description && a.objectives === b.objectives && a.topics === b.topics && a.outcomes === b.outcomes && a.startsOn === b.startsOn && a.endsOn === b.endsOn;

/** Which fields differ, by name, for the history. */
export function changedFields(before: SubjectPlanFields | null, after: SubjectPlanFields): string[] {
  if (!before) return ['created'];
  return (['description', 'objectives', 'topics', 'outcomes', 'startsOn', 'endsOn'] as const).filter((k) => before[k] !== after[k]);
}
