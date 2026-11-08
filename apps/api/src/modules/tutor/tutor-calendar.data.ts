import { MentoringTutorAssignmentStatus } from '@prisma/client';

import { PrismaTxClient } from '../../common/prisma/prisma.service';

import { AvailabilityWindow, DayNumber } from './tutor-availability';
import {
  ClassOverride,
  ClassRule,
  DatedClass,
  Frequency,
  TutorCalendarInput,
  TutorException,
  datesBetween,
  formatDate,
  weekdayOf,
} from './tutor-calendar';

const LIVE: MentoringTutorAssignmentStatus[] = ['ACTIVE', 'NEEDS_REVIEW'];
const DATED_STATUSES = new Set(['SCHEDULED', 'ASSIGNED', 'IN_PROGRESS']);

/** A calendar date from a database value that is either a Date (a DATE column) or already text. */
export const dayOf = (value: Date | string): string => (typeof value === 'string' ? value.slice(0, 10) : formatDate(value));
const midnight = (day: string) => new Date(`${day}T00:00:00Z`);

export interface TutorRef {
  tutorProfileId: string;
  userId: string;
  employeeId: string;
  windows: readonly AvailabilityWindow[];
}

export interface CalendarOptions {
  from: string;
  to: string;
  /** Show the student behind a booked class. Off for anyone who may not see other students. */
  withStudentNames: boolean;
  timeZone: string;
  /**
   * When tutors are being matched for one subject of one student: that subject's own current assignment is left out
   * (it is being replaced or re-checked), and this student's other subjects count as this student's own.
   */
  forSubject?: { activationId: string; subjectId: string; ignoreAssignmentId?: string };
}

/** A moment in the operating time zone, as a calendar date and minutes from midnight. */
export function localMoment(at: Date, timeZone: string): { date: string; minutes: number } {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(at);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '00';
  return { date: `${get('year')}-${get('month')}-${get('day')}`, minutes: Number(get('hour')) * 60 + Number(get('minute')) };
}

/**
 * Builds every tutor's calendar input for a range of dates in a handful of queries. Nothing is written. Approved
 * leave is read from the leave module; recurring classes are read from the tutor assignments; one-off bookings are demo
 * sessions and scheduled class records.
 */
export async function loadCalendars(db: PrismaTxClient, tutors: readonly TutorRef[], opts: CalendarOptions): Promise<Map<string, TutorCalendarInput>> {
  const out = new Map<string, TutorCalendarInput>();
  const ids = tutors.map((t) => t.tutorProfileId);
  for (const t of tutors) out.set(t.tutorProfileId, { weekly: t.windows, exceptions: [], rules: [], overrides: [], dated: [] });
  if (ids.length === 0) return out;
  const push = <K extends keyof TutorCalendarInput>(id: string, key: K, items: Array<TutorCalendarInput[K] extends readonly (infer U)[] ? U : never>) => {
    const target = out.get(id);
    if (target) (target[key] as unknown[]).push(...items);
  };
  const days = datesBetween(opts.from, opts.to);

  // Dates that change the weekly pattern: this tutor's own, and the whole organisation's holidays.
  const rows = await db.tutorAvailabilityException.findMany({
    where: { isActive: true, date: { gte: midnight(opts.from), lte: midnight(opts.to) }, OR: [{ tutorProfileId: { in: ids } }, { tutorProfileId: null }] },
  });
  for (const r of rows) {
    const e: TutorException = { date: dayOf(r.date), kind: r.kind, startMinute: r.startMinute, endMinute: r.endMinute, note: r.note };
    if (r.tutorProfileId === null) for (const id of ids) push(id, 'exceptions', [e]);
    else push(r.tutorProfileId, 'exceptions', [e]);
  }

  // Approved leave, one closed day for each date it covers.
  const leave = await db.employeeLeaveRequest.findMany({
    where: { employeeId: { in: tutors.map((t) => t.employeeId) }, status: 'APPROVED', startDate: { lte: opts.to }, endDate: { gte: opts.from } },
  });
  for (const l of leave) {
    const tutor = tutors.find((t) => t.employeeId === l.employeeId);
    if (!tutor) continue;
    for (const d of days) if (d >= l.startDate && d <= l.endDate) push(tutor.tutorProfileId, 'exceptions', [{ date: d, kind: 'LEAVE', startMinute: null, endMinute: null, note: 'Approved leave' }]);
  }

  // Recurring classes and their changes.
  const [assignments, sessions] = await Promise.all([
    db.mentoringTutorAssignment.findMany({ where: { tutorProfileId: { in: ids }, status: { in: LIVE } } }),
    db.mentoringTutorAssignmentSession.findMany({ where: { tutorProfileId: { in: ids } } }),
  ]);
  const byAssignment = new Map(assignments.map((a) => [a.id, a]));
  const overrideRows = assignments.length ? await db.mentoringTutorAssignmentOverride.findMany({ where: { assignmentId: { in: assignments.map((a) => a.id) } } }) : [];
  const subjects = assignments.length ? await db.subject.findMany({ where: { id: { in: [...new Set(assignments.map((a) => a.subjectId))] } } }) : [];
  const subjectName = new Map(subjects.map((s) => [s.id, s.name]));
  const studentOf = new Map<string, string>();
  if (opts.withStudentNames && assignments.length) {
    const activations = await db.mentoringActivation.findMany({ where: { id: { in: [...new Set(assignments.map((a) => a.activationId))] } } });
    const students = await db.student.findMany({ where: { id: { in: activations.map((a) => a.studentId) } } });
    for (const a of activations) {
      const s = students.find((x) => x.id === a.studentId);
      if (s) studentOf.set(a.id, `${s.firstName} ${s.lastName}`.trim());
    }
  }
  const ruleIdsOf = new Map<string, ClassRule[]>();
  for (const row of sessions) {
    const a = byAssignment.get(row.assignmentId);
    if (!a || a.id === opts.forSubject?.ignoreAssignmentId) continue;
    if (opts.forSubject && a.activationId === opts.forSubject.activationId && a.subjectId === opts.forSubject.subjectId) continue; // being replaced
    const rule: ClassRule = {
      id: row.id,
      dayNumber: row.dayOfWeek,
      frequency: row.frequency as Frequency,
      week: (row.week as 1 | 2 | null) ?? null,
      occurrences: row.occurrences,
      startMinute: row.startMinute,
      endMinute: row.endMinute,
      startDate: a.startDate ? dayOf(a.startDate) : null,
      endDate: a.endDate ? dayOf(a.endDate) : null,
      label: { subject: subjectName.get(a.subjectId) ?? 'Class', student: opts.withStudentNames ? studentOf.get(a.activationId) ?? null : null },
      source: opts.forSubject && a.activationId === opts.forSubject.activationId ? 'THIS_STUDENT' : 'ANOTHER_STUDENT',
    };
    push(row.tutorProfileId, 'rules', [rule]);
    ruleIdsOf.set(a.id, [...(ruleIdsOf.get(a.id) ?? []), rule]);
  }
  for (const o of overrideRows) {
    const date = dayOf(o.date);
    for (const rule of ruleIdsOf.get(o.assignmentId) ?? []) {
      if (rule.startMinute !== o.originalStartMinute || weekdayOf(date) !== (rule.dayNumber as DayNumber)) continue;
      const change: ClassOverride = {
        ruleId: rule.id, date, originalStartMinute: o.originalStartMinute, kind: o.kind,
        newDate: o.newDate ? dayOf(o.newDate) : null, newStartMinute: o.newStartMinute, newEndMinute: o.newEndMinute, reason: o.reason,
      };
      const tutorId = byAssignment.get(o.assignmentId)?.tutorProfileId;
      if (tutorId) push(tutorId, 'overrides', [change]);
    }
  }

  // One-off bookings: demo sessions the tutor is assigned to, and classes already scheduled.
  const userIds = tutors.map((t) => t.userId).filter(Boolean);
  const profileOf = new Map(tutors.map((t) => [t.userId, t.tutorProfileId]));
  if (userIds.length > 0) {
    const [demos, classes] = await Promise.all([
      db.demoSessionTutorAssignment.findMany({ where: { tutorId: { in: userIds }, status: 'ACTIVE' }, include: { session: true } }),
      db.tutorClassRecord.findMany({ where: { tutorId: { in: userIds }, cancellation: 'NOT_CANCELLED' } }),
    ]);
    const place = (tutorUserId: string, start: Date, end: Date, label: string) => {
      const profileId = profileOf.get(tutorUserId);
      const a = localMoment(start, opts.timeZone);
      const b = localMoment(end, opts.timeZone);
      if (!profileId || a.date < opts.from || a.date > opts.to) return;
      const booking: DatedClass = { date: a.date, startMinute: a.minutes, endMinute: b.date === a.date ? b.minutes : 24 * 60, label: { subject: label, student: null }, source: 'BOOKED_CLASS' };
      if (booking.endMinute > booking.startMinute) push(profileId, 'dated', [booking]);
    };
    for (const d of demos) if (d.session && DATED_STATUSES.has(d.session.status)) place(d.tutorId, d.session.scheduledStart, d.session.scheduledEnd, 'Demo class');
    for (const c of classes) place(c.tutorId, c.scheduledStart, c.scheduledEnd, 'Class');
  }
  return out;
}

