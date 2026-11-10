import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';

import { PrismaService, PrismaTxClient } from '../../common/prisma/prisma.service';
import { isDateString } from '../tutor/tutor-calendar';

import {
  CheckedExam, EXAM_STATE_LABELS, ExamFacts, ExamState, ReminderState, checkExam, checkItem, checkMarks, checkRemarks, checkReschedule, completionProblems, dateKey, examState, POST_EXAM_ITEMS, RE_EXAM_ITEMS,
} from './exam';
import { MentoringAccessService, MentoringScope } from './mentoring-access.service';
import { MentoringAllocationService } from './mentoring-allocation.service';
import { loadLockedActivation } from './mentoring-guards';
import { MentoringHistoryService } from './mentoring-history.service';
import { MentoringReminderService } from './mentoring-reminder.service';
import { localMomentOf, zonedInstant } from './mentoring-sla';
import { MentoringSlaService } from './mentoring-sla.service';
import { isScheduleValue } from './subject-schedule';

const ENTITY = 'Exam';
const OPERATIONAL = new Set(['ACTIVATION_IN_PROGRESS', 'ACTIVATED']);
const dayOf = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : null);
const asDate = (d: string) => new Date(`${d}T00:00:00Z`);
const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));
const reminderKind = (date: string, start: number) => `EXAM_REMINDER:${date}:${start}`;

type ExamRow = NonNullable<Awaited<ReturnType<PrismaTxClient['mentoringExam']['findUnique']>>>;

export interface ExamFilters { subjectId?: string; state?: string; kind?: string; tutorUserId?: string; from?: string; to?: string; limit?: number | string }

export interface ExamView {
  id: string;
  activationId: string;
  studentName: string;
  subjectId: string;
  subjectName: string;
  kind: string;
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
  reminder: { status: ReminderState; sentAt: string | null; acknowledgedAt: string | null; deliveryEvidence: string | null } | null;
  informed: { at: string; note: string | null } | null;
  items: Array<{ list: string; kind: string; label: string; status: string; responsible: string | null; remarks: string | null; evidenceRef: string | null; doneAt: string | null; tutorMay: boolean }>;
  problems: string[];
  marks: { obtained: number; max: number; percentage: number; evaluationDate: string | null; evaluatingTutorName: string | null } | null;
  remarks: { weaknesses: string | null; topicsToImprove: string | null; tutorSuggestions: string | null; mentorRemarks: string | null };
  reExam: { required: boolean; reason: string | null; examId: string | null; date: string | null; state: ExamState | null };
  history?: Array<{ kind: string; at: string; actorUserId: string | null; reason: string | null; payload: unknown }>;
}

/**
 * Weekly exams. A student has at most one exam on a date, whatever the subject; the service refuses a second one, and the date
 * key in the database would too. Everything an exam needs after it is sat (paper, evaluation, marks, remarks, the parent) is
 * a recorded step with a person and a time, and nothing completes itself.
 */
@Injectable()
export class MentoringExamService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: MentoringAccessService,
    private readonly history: MentoringHistoryService,
    private readonly reminders: MentoringReminderService,
    private readonly sla: MentoringSlaService,
  ) {}

  private get db() {
    return this.prisma as unknown as PrismaTxClient;
  }

  private async today(db: PrismaTxClient, now: Date) {
    const w = await this.sla.workingNow(db, now);
    return { date: localMomentOf(now, w.timeZone).date, timeZone: w.timeZone };
  }

  private async mentorGuard(tx: PrismaTxClient, activationId: string, userId: string) {
    const activation = await loadLockedActivation(tx, activationId);
    MentoringAllocationService.assertAssignedMentor(activation, userId);
    if (!OPERATIONAL.has(activation.status)) throw new ConflictException("This student's workflow is not running, so exams cannot be changed.");
    return activation;
  }

  private async logEvent(tx: PrismaTxClient, examId: string, kind: string, actorUserId: string | null, reason: string | null = null, payload?: Record<string, unknown>) {
    await tx.mentoringExamEvent.create({ data: { examId, kind, actorUserId, reason, payload: (payload ?? undefined) as never } });
  }

  private async seq(tx: PrismaTxClient, examId: string) {
    return (await tx.mentoringExamEvent.findMany({ where: { examId } })).length;
  }

  private async notify(tx: PrismaTxClient, recipient: string | null, type: string, exam: ExamRow, message: string) {
    if (!recipient) return null;
    return tx.notification.create({ data: { recipientUserId: recipient, type, entityType: ENTITY, entityId: exam.id, action: '/tutor-portal', message, dedupeKey: `exam:${exam.id}:${await this.seq(tx, exam.id)}:${type}` } });
  }

  private async enrolledSubjects(tx: PrismaTxClient, handoverId: string | null) {
    const field = handoverId ? await tx.enrollmentHandoverField.findUnique({ where: { handoverId_fieldKey: { handoverId, fieldKey: 'timetable.schedule' } } }) : null;
    return isScheduleValue(field?.value) ? field.value.subjects.map((s) => ({ subjectId: s.subjectId, subjectName: s.subjectName })) : [];
  }

  private async assignedTutor(tx: PrismaTxClient, activationId: string, subjectId: string) {
    const a = await tx.mentoringTutorAssignment.findFirst({ where: { activationId, subjectId, status: { in: ['ACTIVE', 'NEEDS_REVIEW'] } } });
    if (!a) return null;
    const profile = await tx.tutorProfile.findUnique({ where: { id: a.tutorProfileId } });
    const employee = profile ? await tx.employee.findUnique({ where: { id: profile.employeeId } }) : null;
    return employee ? { userId: employee.userId, name: `${employee.firstName} ${employee.lastName}`.trim() } : null;
  }

  private async conflictOn(tx: PrismaTxClient, activationId: string, date: string, exceptExamId: string | null, subjectId: string) {
    const other = (await tx.mentoringExam.findMany({ where: { activationId, date: asDate(date) } })).find((e) => e.id !== exceptExamId && e.dateKey !== null);
    if (!other) return;
    const name = (await tx.subject.findUnique({ where: { id: other.subjectId } }))?.name ?? 'another subject';
    throw new ConflictException(
      other.subjectId === subjectId
        ? `This student already has a ${name} exam on ${date}. Add the chapters to that exam instead of scheduling a second one.`
        : `This student already has a ${name} exam on ${date}. Only one subject exam is allowed for a student on a date. Choose another date.`,
    );
  }

  // ─── Reading ───────────────────────────────────────────────────────────────────────────────────────────────────
  private async build(db: PrismaTxClient, rows: ExamRow[], now: Date, withHistory = false, forTutor = false): Promise<ExamView[]> {
    if (rows.length === 0) return [];
    const ids = rows.map((r) => r.id);
    const { date: today } = await this.today(db, now);
    const [items, reminders, subjects, activations, events] = await Promise.all([
      db.mentoringExamItem.findMany({ where: { examId: { in: ids } } }),
      db.mentoringReminder.findMany({ where: { entityType: ENTITY, entityId: { in: ids }, status: { in: ['PREPARED', 'SENT', 'ACKNOWLEDGED'] } } }),
      db.subject.findMany({ where: { id: { in: [...new Set(rows.map((r) => r.subjectId))] } } }),
      db.mentoringActivation.findMany({ where: { id: { in: [...new Set(rows.map((r) => r.activationId))] } } }),
      withHistory ? db.mentoringExamEvent.findMany({ where: { examId: { in: ids } } }) : [],
    ]);
    const students = await db.student.findMany({ where: { id: { in: activations.map((a) => a.studentId) } } });
    const userIds = [...new Set(rows.flatMap((r) => [r.tutorUserId, r.evaluatingTutorUserId]).filter((u): u is string => !!u))];
    const people = userIds.length ? await db.employee.findMany({ where: { userId: { in: userIds } } }) : [];
    const personName = (id: string | null) => {
      const e = people.find((p) => p.userId === id);
      return e ? `${e.firstName} ${e.lastName}`.trim() : null;
    };
    const factsOf = (e: ExamRow): ExamFacts => ({
      date: dayOf(e.date) as string, originalDate: dayOf(e.originalDate) as string, conducted: e.conducted, reExamRequired: e.reExamRequired, hasReExam: rows.some((x) => x.originalExamId === e.id),
      marksRecorded: e.marksObtained !== null && e.marksObtained !== undefined, informed: e.informedAt !== null,
      remarks: { weaknesses: e.weaknesses, topicsToImprove: e.topicsToImprove, tutorSuggestions: e.tutorSuggestions, mentorRemarks: e.mentorRemarks },
    });
    // A re-exam may sit outside the rows asked for; look it up so the original can say what became of it.
    const reExams = await db.mentoringExam.findMany({ where: { originalExamId: { in: ids } } });
    const all = [...rows, ...reExams.filter((r) => !ids.includes(r.id))];
    const stateOf = (e: ExamRow) => {
      const mine = items.filter((i) => i.examId === e.id);
      const status = Object.fromEntries(mine.map((i) => [i.kind, i.status]));
      const rem = reminders.find((r) => r.entityId === e.id && r.kind === reminderKind(dayOf(e.date) as string, e.startMinute));
      const f = { ...factsOf(e), hasReExam: all.some((x) => x.originalExamId === e.id) };
      return { f, status, rem, state: examState(f, status, (rem?.status as ReminderState) ?? null, today), problems: completionProblems(f, status) };
    };
    return rows.map((e) => {
      const { status, rem, state, problems } = stateOf(e);
      const mine = items.filter((i) => i.examId === e.id);
      const defs = [...POST_EXAM_ITEMS.map((d) => ({ ...d, list: 'POST_EXAM' })), ...(e.reExamRequired ? RE_EXAM_ITEMS.map((d) => ({ ...d, list: 'RE_EXAM' })) : [])];
      const reExam = all.find((x) => x.originalExamId === e.id) ?? null;
      const reState = reExam ? stateOf(reExam).state : null;
      const activation = activations.find((a) => a.id === e.activationId);
      const student = students.find((s) => s.id === activation?.studentId);
      void status;
      return {
        id: e.id, activationId: e.activationId, studentName: student ? `${student.firstName} ${student.lastName ?? ''}`.trim() : 'Student', subjectId: e.subjectId, subjectName: subjects.find((s) => s.id === e.subjectId)?.name ?? 'Subject',
        kind: e.kind, originalExamId: e.originalExamId, title: e.title, chapters: e.chapters, portion: e.portion, date: dayOf(e.date) as string, originalDate: dayOf(e.originalDate) as string, startMinute: e.startMinute, endMinute: e.endMinute,
        responsible: { type: e.responsibleType, name: e.responsibleType === 'TUTOR' ? personName(e.responsibleUserId) : forTutor ? null : e.responsibleName }, tutorName: personName(e.tutorUserId), instructions: e.instructions,
        state, stateLabel: EXAM_STATE_LABELS[state], conducted: e.conducted, notConductedReason: e.notConductedReason,
        reminder: rem ? { status: rem.status as ReminderState, sentAt: rem.sentAt?.toISOString() ?? null, acknowledgedAt: rem.acknowledgedAt?.toISOString() ?? null, deliveryEvidence: rem.notificationId } : null,
        informed: e.informedAt ? { at: e.informedAt.toISOString(), note: forTutor ? null : e.informedNote } : null,
        items: defs.map((d) => {
          const it = mine.find((i) => i.kind === d.kind);
          return { list: d.list, kind: d.kind, label: d.label, status: it?.status ?? 'PENDING', responsible: it?.responsible ?? null, remarks: it?.remarks ?? null, evidenceRef: it?.evidenceRef ?? null, doneAt: it?.doneAt?.toISOString() ?? null, tutorMay: d.tutorMay === true };
        }),
        problems,
        marks: e.marksObtained !== null && e.marksObtained !== undefined ? { obtained: num(e.marksObtained) as number, max: num(e.maxMarks) as number, percentage: num(e.percentage) as number, evaluationDate: dayOf(e.evaluationDate), evaluatingTutorName: personName(e.evaluatingTutorUserId) } : null,
        remarks: { weaknesses: e.weaknesses, topicsToImprove: e.topicsToImprove, tutorSuggestions: e.tutorSuggestions, mentorRemarks: forTutor ? null : e.mentorRemarks },
        reExam: { required: e.reExamRequired, reason: e.reExamReason, examId: reExam?.id ?? null, date: reExam ? dayOf(reExam.date) : null, state: reState },
        ...(withHistory ? { history: events.filter((v) => v.examId === e.id).sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime()).map((v) => ({ kind: v.kind, at: v.createdAt.toISOString(), actorUserId: v.actorUserId, reason: v.reason, payload: v.payload })) } : {}),
      };
    });
  }

  /** One student's exams. Every filter, including the derived state, runs here and not on the page. */
  async list(activationId: string, filters: ExamFilters, scope: MentoringScope, now: Date = new Date()) {
    for (const d of [filters.from, filters.to]) if (d !== undefined && !isDateString(d)) throw new BadRequestException('Choose real dates, written like 2026-11-09.');
    const activation = await this.db.mentoringActivation.findFirst({ where: { AND: [{ id: activationId }, this.access.visibilityWhere(scope)] }, include: { student: true } });
    if (!activation) throw new NotFoundException('Student not found');
    const where: Record<string, unknown> = { activationId };
    if (filters.subjectId) where.subjectId = filters.subjectId;
    if (filters.kind) where.kind = filters.kind;
    if (filters.tutorUserId) where.tutorUserId = filters.tutorUserId;
    if (filters.from || filters.to) where.date = { ...(filters.from ? { gte: asDate(filters.from) } : {}), ...(filters.to ? { lte: asDate(filters.to) } : {}) };
    const rows = (await this.db.mentoringExam.findMany({ where, orderBy: { date: 'asc' } }));
    const views = await this.build(this.db, rows, now);
    const subjects = await this.enrolledSubjects(this.db, activation.handoverId);
    const limit = Math.min(200, Math.max(1, Number(filters.limit ?? 100) || 100));
    return {
      student: { id: activation.studentId, name: `${activation.student.firstName} ${activation.student.lastName ?? ''}`.trim() },
      exams: (filters.state ? views.filter((v) => v.state === filters.state) : views).slice(0, limit),
      subjects,
      canWork: activation.currentMentorUserId === scope.userId && scope.perms.has('mentoring.stage.work'),
    };
  }

  async detail(examId: string, scope: MentoringScope, now: Date = new Date()): Promise<ExamView> {
    this.access.requireAnyScope(scope);
    const row = (await this.db.mentoringExam.findUnique({ where: { id: examId } }));
    if (!row || !(await this.db.mentoringActivation.findFirst({ where: { AND: [{ id: row.activationId }, this.access.visibilityWhere(scope)] } }))) throw new NotFoundException('Exam not found');
    return (await this.build(this.db, [row], now, true))[0];
  }

  // ─── Scheduling ────────────────────────────────────────────────────────────────────────────────────────────────
  /** Schedules an exam for one of the student's subjects. At most one exam a day, whatever the subject. */
  async create(activationId: string, body: unknown, userId: string, now: Date = new Date()) {
    return this.prisma.$transaction(async (tx: PrismaTxClient) => {
      const activation = await this.mentorGuard(tx, activationId, userId);
      const checked = checkExam(body);
      if (!checked.ok) throw new BadRequestException(checked.message);
      const v = checked.value;
      const subjects = await this.enrolledSubjects(tx, activation.handoverId);
      if (!subjects.some((s) => s.subjectId === v.subjectId)) throw new BadRequestException("This subject is not in the student's saved schedule, so it has no exam.");
      const { date: today } = await this.today(tx, now);
      if (v.date < today) throw new ConflictException('Choose today or a later date for the exam.');
      await this.conflictOn(tx, activationId, v.date, null, v.subjectId);
      const tutor = await this.assignedTutor(tx, activationId, v.subjectId);
      if (v.responsibleType === 'TUTOR' && !tutor) throw new ConflictException('This subject has no assigned tutor yet, so the tutor cannot be made responsible.');
      return this.insertExam(tx, { activationId, kind: 'EXAM', originalExamId: null, v, tutor, userId, now });
    });
  }

  private async insertExam(tx: PrismaTxClient, o: { activationId: string; kind: 'EXAM' | 'RE_EXAM'; originalExamId: string | null; v: CheckedExam; tutor: { userId: string; name: string } | null; userId: string; now: Date }) {
    const { v } = o;
    const exam = (await tx.mentoringExam.create({
      data: {
        activationId: o.activationId, subjectId: v.subjectId, kind: o.kind, originalExamId: o.originalExamId, title: v.title, chapters: v.chapters, portion: v.portion, date: asDate(v.date), originalDate: asDate(v.date),
        startMinute: v.startMinute, endMinute: v.endMinute, responsibleType: v.responsibleType, responsibleUserId: v.responsibleType === 'TUTOR' ? o.tutor?.userId ?? null : null, responsibleName: v.responsibleName,
        tutorUserId: o.tutor?.userId ?? null, instructions: v.instructions, dateKey: dateKey(o.activationId, v.date), createdByUserId: o.userId,
      },
    }));
    for (const d of POST_EXAM_ITEMS) await tx.mentoringExamItem.create({ data: { examId: exam.id, list: 'POST_EXAM', kind: d.kind, status: 'PENDING' } });
    await this.logEvent(tx, exam.id, o.kind === 'RE_EXAM' ? 'RE_EXAM_SCHEDULED' : 'SCHEDULED', o.userId, null, { date: v.date, startMinute: v.startMinute, endMinute: v.endMinute, responsibleType: v.responsibleType, subjectId: v.subjectId });
    // The reminder is prepared at once for a tutor, who is in the app. A parent or another person is told by the Mentor.
    if (exam.responsibleUserId) {
      await this.reminders.prepare(tx, { kind: reminderKind(v.date, v.startMinute), entityType: ENTITY, entityId: exam.id, activationId: o.activationId, recipientUserId: exam.responsibleUserId, message: await this.reminderText(tx, exam), scheduledFor: zonedInstant(v.date, 7 * 60, (await this.sla.workingNow(tx, o.now)).timeZone) }, o.userId);
    }
    if (o.tutor && o.tutor.userId !== exam.responsibleUserId) await this.notify(tx, o.tutor.userId, 'MENTORING_EXAM_SCHEDULED', exam, `An exam was scheduled for your student: ${v.title} on ${v.date}.`);
    await this.history.record(tx, { activationId: o.activationId, type: 'MENTORING_EXAM_SCHEDULED', actorUserId: o.userId, payload: { examId: exam.id, date: v.date, kind: o.kind } });
    return { examId: exam.id, date: v.date };
  }

  private async reminderText(tx: PrismaTxClient, exam: ExamRow) {
    const subject = await tx.subject.findUnique({ where: { id: exam.subjectId } });
    const { formatRange } = await import('../tutor/tutor-availability');
    return `Exam reminder: ${exam.title} (${subject?.name ?? 'exam'}) on ${dayOf(exam.date)}, ${formatRange(exam.startMinute, exam.endMinute)}.`;
  }

  private async examForMentor(tx: PrismaTxClient, examId: string, userId: string) {
    const found = (await tx.mentoringExam.findUnique({ where: { id: examId } }));
    if (!found) throw new NotFoundException('Exam not found');
    await this.mentorGuard(tx, found.activationId, userId);
    return (await tx.mentoringExam.findUnique({ where: { id: examId } })) as ExamRow;
  }

  /** Changes the details of an exam that has not been sat: title, chapters, portion, times, instructions, who is responsible. The date moves only by rescheduling. */
  async update(examId: string, body: unknown, userId: string, now: Date = new Date()) {
    return this.prisma.$transaction(async (tx: PrismaTxClient) => {
      const exam = await this.examForMentor(tx, examId, userId);
      if (exam.conducted !== null) throw new ConflictException('This exam has been sat, so its details cannot be changed.');
      const checked = checkExam({ ...(body as object), subjectId: exam.subjectId, date: dayOf(exam.date) });
      if (!checked.ok) throw new BadRequestException(checked.message);
      const v = checked.value;
      if (typeof (body as { date?: unknown })?.date === 'string' && (body as { date: string }).date !== v.date) throw new ConflictException('Use reschedule to move the exam to another date.');
      const tutor = await this.assignedTutor(tx, exam.activationId, exam.subjectId);
      if (v.responsibleType === 'TUTOR' && !tutor) throw new ConflictException('This subject has no assigned tutor yet, so the tutor cannot be made responsible.');
      await tx.mentoringExam.update({
        where: { id: examId },
        data: { title: v.title, chapters: v.chapters, portion: v.portion, startMinute: v.startMinute, endMinute: v.endMinute, responsibleType: v.responsibleType, responsibleUserId: v.responsibleType === 'TUTOR' ? tutor?.userId ?? null : null, responsibleName: v.responsibleName, instructions: v.instructions },
      });
      await this.logEvent(tx, examId, 'DETAILS_CHANGED', userId, null, { title: v.title, chapters: v.chapters, startMinute: v.startMinute, endMinute: v.endMinute, responsibleType: v.responsibleType });
      void now;
      return { examId };
    });
  }

  /** Moves an exam, or a re-exam. The first date stays on record, the one-exam-a-day rule is checked again, and the people involved are told. */
  async reschedule(examId: string, body: unknown, userId: string, now: Date = new Date()) {
    return this.prisma.$transaction(async (tx: PrismaTxClient) => {
      const exam = await this.examForMentor(tx, examId, userId);
      if (exam.conducted !== null) throw new ConflictException('This exam has been sat, so it cannot be rescheduled. Schedule a re-exam instead.');
      const checked = checkReschedule(body, exam);
      if (!checked.ok) throw new BadRequestException(checked.message);
      const m = checked.value;
      const before = { date: dayOf(exam.date) as string, startMinute: exam.startMinute, endMinute: exam.endMinute };
      if (m.date === before.date && m.startMinute === before.startMinute && m.endMinute === before.endMinute) throw new ConflictException('That is the time the exam already has.');
      const { date: today } = await this.today(tx, now);
      if (m.date < today) throw new ConflictException('Choose today or a later date.');
      await this.conflictOn(tx, exam.activationId, m.date, exam.id, exam.subjectId);
      await tx.mentoringExam.update({ where: { id: examId }, data: { date: asDate(m.date), dateKey: dateKey(exam.activationId, m.date), startMinute: m.startMinute, endMinute: m.endMinute, informedAt: null, informedByUserId: null, informedNote: null } });
      // A reminder not yet sent for the old time is withdrawn, and the new time gets its own.
      for (const r of await tx.mentoringReminder.findMany({ where: { entityType: ENTITY, entityId: examId, status: 'PREPARED' } })) await this.reminders.cancel(tx, r.id);
      const moved = (await tx.mentoringExam.findUnique({ where: { id: examId } })) as ExamRow;
      if (moved.responsibleUserId) {
        await this.reminders.prepare(tx, { kind: reminderKind(m.date, m.startMinute), entityType: ENTITY, entityId: examId, activationId: exam.activationId, recipientUserId: moved.responsibleUserId, message: await this.reminderText(tx, moved), scheduledFor: zonedInstant(m.date, 7 * 60, (await this.sla.workingNow(tx, now)).timeZone) }, userId);
      }
      const told: string[] = [];
      for (const r of new Set([exam.responsibleUserId, exam.tutorUserId].filter((x): x is string => !!x))) {
        await this.notify(tx, r, 'MENTORING_EXAM_RESCHEDULED', moved, `The exam ${exam.title} was moved from ${before.date} to ${m.date}. Reason: ${m.reason}`);
        told.push(r);
      }
      await this.logEvent(tx, examId, 'RESCHEDULED', userId, m.reason, {
        from: before, to: { date: m.date, startMinute: m.startMinute, endMinute: m.endMinute }, requestedByUserId: userId, approvedByUserId: null,
        notified: { inApp: told, parentOrOther: exam.responsibleType === 'TUTOR' ? null : 'The Mentor tells them. Not delivered by the app.' },
      });
      await this.history.record(tx, { activationId: exam.activationId, type: 'MENTORING_EXAM_RESCHEDULED', actorUserId: userId, reason: m.reason, payload: { examId, from: before.date, to: m.date } });
      return { examId, from: before, to: { date: m.date, startMinute: m.startMinute, endMinute: m.endMinute }, notified: told.length };
    });
  }

  // ─── Reminders ─────────────────────────────────────────────────────────────────────────────────────────────────
  /** Sends the exam reminder to the responsible tutor, as an in-app notification. It counts as sent only once that notification exists. */
  async sendReminder(examId: string, userId: string, now: Date = new Date()) {
    return this.prisma.$transaction(async (tx: PrismaTxClient) => {
      const exam = await this.examForMentor(tx, examId, userId);
      if (!exam.responsibleUserId) throw new ConflictException("This exam's responsible person is not in the app. Record that you informed them instead.");
      if (exam.conducted !== null) throw new ConflictException('This exam has already been sat.');
      const prepared = await this.reminders.prepare(tx, { kind: reminderKind(dayOf(exam.date) as string, exam.startMinute), entityType: ENTITY, entityId: examId, activationId: exam.activationId, recipientUserId: exam.responsibleUserId, message: await this.reminderText(tx, exam) }, userId);
      const sent = await this.reminders.send(tx, prepared.id, userId, '/tutor-portal', now);
      await this.logEvent(tx, examId, 'REMINDER_SENT', userId, null, { reminderId: sent.id, notificationId: sent.notificationId });
      return { examId, reminderId: sent.id, status: sent.status, deliveryEvidence: sent.notificationId };
    });
  }

  /** The Mentor says they told the parent or another person by their own means. It is recorded as the Mentor's word, never as a delivery. */
  async markInformed(examId: string, note: unknown, userId: string, now: Date = new Date()) {
    return this.prisma.$transaction(async (tx: PrismaTxClient) => {
      const exam = await this.examForMentor(tx, examId, userId);
      if (exam.conducted !== null) throw new ConflictException('This exam has already been sat.');
      const text = typeof note === 'string' ? note.trim() : '';
      if (!text) throw new BadRequestException('Say how you told them, for example by phone, and when.');
      if (text.length > 1000) throw new BadRequestException('The note must be 1000 characters or fewer.');
      await tx.mentoringExam.update({ where: { id: examId }, data: { informedAt: now, informedByUserId: userId, informedNote: text } });
      await this.logEvent(tx, examId, 'MENTOR_INFORMED_RESPONSIBLE', userId, text, { responsibleType: exam.responsibleType });
      return { examId, informedAt: now.toISOString() };
    });
  }

  // ─── After the exam ────────────────────────────────────────────────────────────────────────────────────────────
  /** Records that the exam was sat, or formally that it was not (with a reason). Not before the exam date. */
  async recordConducted(examId: string, body: { conducted?: unknown; reason?: unknown }, userId: string, now: Date = new Date()) {
    return this.prisma.$transaction(async (tx: PrismaTxClient) => {
      const exam = await this.examForMentor(tx, examId, userId);
      if (typeof body.conducted !== 'boolean') throw new BadRequestException('Say whether the exam was conducted.');
      const { date: today } = await this.today(tx, now);
      if ((dayOf(exam.date) as string) > today) throw new ConflictException('The exam has not happened yet.');
      if (exam.marksObtained !== null && exam.marksObtained !== undefined) throw new ConflictException('Marks are already recorded, so this cannot be changed.');
      const reason = typeof body.reason === 'string' ? body.reason.trim() : '';
      if (body.conducted === false && !reason) throw new BadRequestException('Say why the exam was not conducted.');
      if (reason.length > 1000) throw new BadRequestException('The reason must be 1000 characters or fewer.');
      await tx.mentoringExam.update({ where: { id: examId }, data: { conducted: body.conducted, conductedAt: now, conductedByUserId: userId, notConductedReason: body.conducted ? null : reason } });
      await this.logEvent(tx, examId, body.conducted ? 'CONDUCTED' : 'NOT_CONDUCTED', userId, reason || null, { before: exam.conducted });
      await this.history.record(tx, { activationId: exam.activationId, type: body.conducted ? 'MENTORING_EXAM_CONDUCTED' : 'MENTORING_EXAM_NOT_CONDUCTED', actorUserId: userId, payload: { examId } });
      return { examId, conducted: body.conducted };
    });
  }

  private async applyItem(tx: PrismaTxClient, exam: ExamRow, kind: string, body: unknown, userId: string, now: Date, asTutor: boolean) {
    const def = [...POST_EXAM_ITEMS, ...RE_EXAM_ITEMS].find((d) => d.kind === kind);
    if (!def) throw new NotFoundException('That checklist item does not exist.');
    const list = POST_EXAM_ITEMS.some((d) => d.kind === kind) ? 'POST_EXAM' : 'RE_EXAM';
    if (asTutor && !def.tutorMay) throw new ForbiddenException('The Mentor confirms this step.');
    if (exam.conducted !== true) throw new ConflictException('Record that the exam was sat before the checklist.');
    if (list === 'RE_EXAM' && !exam.reExamRequired) throw new ConflictException('The re-exam checklist is only for an exam that needs a re-exam.');
    const checked = checkItem(body);
    if (!checked.ok) throw new BadRequestException(checked.message);
    const c = checked.value;
    if (kind === 'REEXAM_COMPLETED' && c.status === 'DONE') {
      const re = (await tx.mentoringExam.findMany({ where: { originalExamId: exam.id } }))[0];
      if (!re || re.conducted !== true) throw new ConflictException('The re-exam has not been sat yet.');
    }
    const existing = await tx.mentoringExamItem.findFirst({ where: { examId: exam.id, kind } });
    const data = { status: c.status, responsible: c.responsible, remarks: c.remarks, evidenceRef: c.evidenceRef, updatedByUserId: c.status === 'PENDING' ? null : userId, doneAt: c.status === 'PENDING' ? null : now };
    if (existing) await tx.mentoringExamItem.update({ where: { id: existing.id }, data });
    else await tx.mentoringExamItem.create({ data: { examId: exam.id, list, kind, ...data } });
    await this.logEvent(tx, exam.id, 'ITEM_UPDATED', userId, c.remarks, { kind, from: existing?.status ?? 'PENDING', to: c.status, by: asTutor ? 'TUTOR' : 'MENTOR' });
  }

  /** The Mentor confirms one step of the post-exam or re-exam checklist, with the person, remarks and a reference to the evidence. */
  async updateItem(examId: string, kind: string, body: unknown, userId: string, now: Date = new Date()) {
    return this.prisma.$transaction(async (tx: PrismaTxClient) => {
      const exam = await this.examForMentor(tx, examId, userId);
      await this.applyItem(tx, exam, kind, body, userId, now, false);
      return { examId, kind };
    });
  }

  private writeMarks(exam: ExamRow, v: { obtained: number; max: number; percentage: number; evaluationDate: string | null }, evaluator: string | null, userId: string, today: string, now: Date) {
    return { marksObtained: String(v.obtained), maxMarks: String(v.max), percentage: String(v.percentage), evaluatingTutorUserId: evaluator ?? exam.tutorUserId, evaluationDate: asDate(v.evaluationDate ?? today), marksRecordedAt: now, marksRecordedByUserId: userId };
  }

  /** Records or corrects the marks. The percentage is worked out here. Changing marks already recorded needs a reason, and both figures stay in the history. */
  async recordMarks(examId: string, body: Record<string, unknown>, userId: string, now: Date = new Date()) {
    return this.prisma.$transaction(async (tx: PrismaTxClient) => {
      const exam = await this.examForMentor(tx, examId, userId);
      return this.saveMarks(tx, exam, body, userId, now, false);
    });
  }

  private async saveMarks(tx: PrismaTxClient, exam: ExamRow, body: Record<string, unknown>, userId: string, now: Date, asTutor: boolean) {
    if (exam.conducted !== true) throw new ConflictException('Record that the exam was sat before the marks.');
    const checked = checkMarks(body);
    if (!checked.ok) throw new BadRequestException(checked.message);
    const had = exam.marksObtained !== null && exam.marksObtained !== undefined;
    const reason = typeof body.reason === 'string' ? body.reason.trim() : '';
    if (had && !reason) throw new BadRequestException('Marks are already recorded. Say why they are being changed.');
    const evaluator = !asTutor && typeof body.evaluatingTutorUserId === 'string' && body.evaluatingTutorUserId ? body.evaluatingTutorUserId : asTutor ? userId : exam.tutorUserId;
    if (evaluator && evaluator !== exam.tutorUserId) throw new BadRequestException("The marks are evaluated by the subject's assigned tutor.");
    const { date: today } = await this.today(tx, now);
    await tx.mentoringExam.update({ where: { id: exam.id }, data: this.writeMarks(exam, checked.value, evaluator, userId, today, now) });
    await this.logEvent(tx, exam.id, had ? 'MARKS_CHANGED' : 'MARKS_RECORDED', userId, reason || null, {
      before: had ? { obtained: num(exam.marksObtained), max: num(exam.maxMarks), percentage: num(exam.percentage) } : null, after: { obtained: checked.value.obtained, max: checked.value.max, percentage: checked.value.percentage }, by: asTutor ? 'TUTOR' : 'MENTOR',
    });
    await this.history.record(tx, { activationId: exam.activationId, type: had ? 'MENTORING_EXAM_MARKS_CHANGED' : 'MENTORING_EXAM_MARKS_RECORDED', actorUserId: userId, reason: reason || null, payload: { examId: exam.id, percentage: checked.value.percentage } });
    return { examId: exam.id, percentage: checked.value.percentage };
  }

  /** The weekly remarks, each in its own field on this exam. */
  async recordRemarks(examId: string, body: unknown, userId: string) {
    return this.prisma.$transaction(async (tx: PrismaTxClient) => {
      const exam = await this.examForMentor(tx, examId, userId);
      const checked = checkRemarks(body);
      if (!checked.ok) throw new BadRequestException(checked.message);
      const r = checked.value;
      await tx.mentoringExam.update({ where: { id: examId }, data: { ...('weaknesses' in r ? { weaknesses: r.weaknesses || null } : {}), ...('topicsToImprove' in r ? { topicsToImprove: r.topicsToImprove || null } : {}), ...('tutorSuggestions' in r ? { tutorSuggestions: r.tutorSuggestions || null } : {}), ...('mentorRemarks' in r ? { mentorRemarks: r.mentorRemarks || null } : {}) } });
      await this.logEvent(tx, examId, 'REMARKS_RECORDED', userId, null, { changed: Object.keys(r), by: 'MENTOR' });
      void exam;
      return { examId, changed: Object.keys(r) };
    });
  }

  // ─── Re-exams ──────────────────────────────────────────────────────────────────────────────────────────────────
  /** Says a re-exam is needed, with the reason, and opens the re-exam checklist. Or withdraws it while no re-exam is scheduled. */
  async setReExam(examId: string, body: { required?: unknown; reason?: unknown }, userId: string) {
    return this.prisma.$transaction(async (tx: PrismaTxClient) => {
      const exam = await this.examForMentor(tx, examId, userId);
      if (exam.kind === 'RE_EXAM') throw new ConflictException('A re-exam cannot have a re-exam of its own. Schedule a new exam instead.');
      if (exam.conducted !== true) throw new ConflictException('Record that the exam was sat first.');
      if (typeof body.required !== 'boolean') throw new BadRequestException('Say whether a re-exam is required.');
      const reason = typeof body.reason === 'string' ? body.reason.trim() : '';
      if (!reason) throw new BadRequestException('Say why a re-exam is needed, or why it is no longer needed.');
      if (reason.length > 1000) throw new BadRequestException('The reason must be 1000 characters or fewer.');
      if (!body.required && (await tx.mentoringExam.findMany({ where: { originalExamId: examId } })).length > 0) throw new ConflictException('A re-exam is already scheduled, so it cannot be withdrawn here.');
      await tx.mentoringExam.update({ where: { id: examId }, data: { reExamRequired: body.required, reExamReason: reason } });
      if (body.required) for (const d of RE_EXAM_ITEMS) if (!(await tx.mentoringExamItem.findFirst({ where: { examId, kind: d.kind } }))) await tx.mentoringExamItem.create({ data: { examId, list: 'RE_EXAM', kind: d.kind, status: 'PENDING' } });
      await this.logEvent(tx, examId, body.required ? 'RE_EXAM_REQUIRED' : 'RE_EXAM_WITHDRAWN', userId, reason);
      return { examId, required: body.required };
    });
  }

  /** Schedules the re-exam as an exam of its own: the original is never changed, and the one-exam-a-day rule applies to it too. */
  async scheduleReExam(examId: string, body: unknown, userId: string, now: Date = new Date()) {
    return this.prisma.$transaction(async (tx: PrismaTxClient) => {
      const exam = await this.examForMentor(tx, examId, userId);
      if (!exam.reExamRequired) throw new ConflictException('Say that a re-exam is required first.');
      if ((await tx.mentoringExam.findMany({ where: { originalExamId: examId } })).length > 0) throw new ConflictException('A re-exam is already scheduled. Reschedule that one instead.');
      const checked = checkExam({ title: `Re-exam: ${exam.title}`, chapters: exam.chapters, portion: exam.portion, ...(body as object), subjectId: exam.subjectId });
      if (!checked.ok) throw new BadRequestException(checked.message);
      const { date: today } = await this.today(tx, now);
      if (checked.value.date < today) throw new ConflictException('Choose today or a later date for the re-exam.');
      await this.conflictOn(tx, exam.activationId, checked.value.date, null, exam.subjectId);
      const tutor = await this.assignedTutor(tx, exam.activationId, exam.subjectId);
      if (checked.value.responsibleType === 'TUTOR' && !tutor) throw new ConflictException('This subject has no assigned tutor yet, so the tutor cannot be made responsible.');
      const made = await this.insertExam(tx, { activationId: exam.activationId, kind: 'RE_EXAM', originalExamId: examId, v: checked.value, tutor, userId, now });
      await this.logEvent(tx, examId, 'RE_EXAM_SCHEDULED', userId, null, { reExamId: made.examId, date: made.date });
      return made;
    });
  }

  // ─── The tutor ─────────────────────────────────────────────────────────────────────────────────────────────────
  /** The exams the signed-in tutor is responsible for or evaluates. Never the Mentor's remarks, and never another tutor's. */
  async tutorExams(userId: string, filters: { from?: string; to?: string } = {}, now: Date = new Date()) {
    for (const d of [filters.from, filters.to]) if (d !== undefined && !isDateString(d)) throw new BadRequestException('Choose real dates, written like 2026-11-09.');
    const employee = await this.db.employee.findUnique({ where: { userId } });
    if (!employee || !(await this.db.tutorProfile.findUnique({ where: { employeeId: employee.id } }))) throw new NotFoundException('You do not have a tutor profile.');
    const date = filters.from || filters.to ? { date: { ...(filters.from ? { gte: asDate(filters.from) } : {}), ...(filters.to ? { lte: asDate(filters.to) } : {}) } } : {};
    const rows = (await this.db.mentoringExam.findMany({ where: { tutorUserId: userId, ...date }, orderBy: { date: 'asc' } }));
    return this.build(this.db, rows, now, false, true);
  }

  private async examForTutor(tx: PrismaTxClient, examId: string, userId: string) {
    const exam = (await tx.mentoringExam.findUnique({ where: { id: examId } }));
    if (!exam || exam.tutorUserId !== userId) throw new ForbiddenException('This exam is not yours.');
    const activation = await tx.mentoringActivation.findUnique({ where: { id: exam.activationId } });
    if (!activation || !OPERATIONAL.has(activation.status)) throw new ConflictException("This student's workflow is not running.");
    return exam;
  }

  /** The tutor confirms the paper reached them. */
  async tutorConfirmReceipt(examId: string, body: unknown, userId: string, now: Date = new Date()) {
    return this.prisma.$transaction(async (tx: PrismaTxClient) => {
      const exam = await this.examForTutor(tx, examId, userId);
      const remarks = typeof (body as { remarks?: unknown })?.remarks === 'string' ? (body as { remarks: string }).remarks : '';
      await this.applyItem(tx, exam, 'TUTOR_RECEIPT', { status: 'DONE', remarks, responsible: 'Tutor' }, userId, now, true);
      return { examId };
    });
  }

  /**
   * The tutor submits the evaluation: the marks, and the tutor's own remarks. Submitting it is the tutor's confirmation that the
   * evaluation is complete; the Mentor's remarks and the rest of the checklist are not theirs to change.
   */
  async tutorEvaluate(examId: string, body: Record<string, unknown>, userId: string, now: Date = new Date()) {
    return this.prisma.$transaction(async (tx: PrismaTxClient) => {
      const exam = await this.examForTutor(tx, examId, userId);
      const remarks = checkRemarks(body, ['weaknesses', 'topicsToImprove', 'tutorSuggestions']);
      if (!remarks.ok && !/at least one remark/.test(remarks.message)) throw new BadRequestException(remarks.message);
      const saved = await this.saveMarks(tx, exam, body, userId, now, true);
      if (remarks.ok) {
        const r = remarks.value;
        await tx.mentoringExam.update({ where: { id: exam.id }, data: { ...('weaknesses' in r ? { weaknesses: r.weaknesses || null } : {}), ...('topicsToImprove' in r ? { topicsToImprove: r.topicsToImprove || null } : {}), ...('tutorSuggestions' in r ? { tutorSuggestions: r.tutorSuggestions || null } : {}) } });
        await this.logEvent(tx, exam.id, 'REMARKS_RECORDED', userId, null, { changed: Object.keys(r), by: 'TUTOR' });
      }
      await this.applyItem(tx, exam, 'TUTOR_EVALUATION', { status: 'DONE', responsible: 'Tutor', remarks: 'Evaluation submitted by the tutor' }, userId, now, true);
      return saved;
    });
  }
}
