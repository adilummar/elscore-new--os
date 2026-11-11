import type * as fs from 'fs';

import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';

import { PrismaService, PrismaTxClient } from '../../common/prisma/prisma.service';
import { formatRange } from '../tutor/tutor-availability';
import { isDateString } from '../tutor/tutor-calendar';

import {
  ACTIVITY_TYPE_LABELS, CLASS_CARD_KEYS, LEARNING_LEVEL_LABELS, MAX_OPTIONS_PER_GROUP, countActivities, COMPLETION_LABELS, DEFAULT_TEMPLATES, MIN_ACTIVITIES, TEMPLATE_KEYS, checkActivity, checkAudio, checkMeetLink, checkReason, checkResponse, checkFollowUp, checkFollowUpDecision, checkFollowUpProgress, checkTemplate, classCardsOf, parseRange, renderTemplate, safeFileName, verificationBlockers,
} from './class-workspace';
import { MentoringAccessService, MentoringScope } from './mentoring-access.service';
import { ClassView, MentoringClassService, SessionRow } from './mentoring-class.service';
import { loadLockedActivation } from './mentoring-guards';
import { MentoringHistoryService } from './mentoring-history.service';
import { localMomentOf, zonedInstant } from './mentoring-sla';
import { MentoringSlaService } from './mentoring-sla.service';
import { MentoringStorageService } from './mentoring-storage.service';

const ENTITY = 'ClassSession';
const REMINDER_LEAD_MINUTES = 45;
const MAX_ACTIVITIES = 20;
const dayOf = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : null);
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const longDate = (iso: string) => {
  const d = new Date(`${iso}T00:00:00Z`);
  return `${DAYS[d.getUTCDay()]}, ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
};
const hoursText = (m: number) => (m >= 60 ? `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60} min` : ''}` : `${m} min`);

export interface UploadedAudio { originalname: string; mimetype: string; buffer: Buffer }
export interface ListFilters { date?: string; from?: string; to?: string; card?: string; mentorUserId?: string; studentQuery?: string; tutorProfileId?: string; subjectId?: string; state?: string; page?: number | string; pageSize?: number | string }

/**
 * The class workspace: what happens around one class. The tutor prepares the reminder, reports, uploads the voice recording and
 * creates the activities; the Mentor reviews and verifies. Each message and recording has three separate facts (made, shared in
 * the existing group by a named person, verified by the Mentor), and nothing here says anything was delivered. The stored class
 * row stays the one source of truth, so the student's and the tutor's views always agree on what is consumed.
 */
@Injectable()
export class MentoringClassWorkspaceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: MentoringAccessService,
    private readonly classes: MentoringClassService,
    private readonly history: MentoringHistoryService,
    private readonly sla: MentoringSlaService,
    private readonly storage: MentoringStorageService,
  ) {}

  private get db() {
    return this.prisma as unknown as PrismaTxClient;
  }

  // ─── Who may act on a class ────────────────────────────────────────────────────────────────────────────────────
  /** The tutor's own class. A tutor can never reach another tutor's class, and a closed class cannot be changed except for what the student did. */
  private async tutorCtx(tx: PrismaTxClient, userId: string, key: string) {
    const o = await this.classes.occurrenceForKey(tx, key);
    const profile = await this.classes.tutorProfileOf(tx, userId);
    if (o.tutorProfileId !== profile.id) throw new ForbiddenException('This class is not yours.');
    const activation = await loadLockedActivation(tx, o.activationId);
    this.classes.requireEligible(activation);
    const session = await this.classes.ensureSession(tx, o);
    if (session.tutorUserId !== userId) throw new ForbiddenException('This class is not yours.');
    return { o, session, activation };
  }

  private async mentorCtx(tx: PrismaTxClient, userId: string, key: string) {
    const o = await this.classes.occurrenceForKey(tx, key);
    const activation = await this.classes.mentorGuard(tx, o.activationId, userId);
    const session = await this.classes.ensureSession(tx, o);
    return { o, session, activation };
  }

  private open(session: SessionRow) {
    if (session.status === 'CANCELLED') throw new ConflictException('This class was cancelled, so it cannot be changed.');
    if (session.status === 'VERIFIED' || session.status === 'NOT_CONDUCTED') throw new ConflictException('This class is verified, so this can no longer be changed. What the student did with an activity can still be recorded.');
  }

  private async reached(tx: PrismaTxClient, session: SessionRow, now: Date) {
    const today = localMomentOf(now, (await this.sla.workingNow(tx, now)).timeZone).date;
    if ((dayOf(session.date) as string) > today) throw new ConflictException('This class has not happened yet.');
  }

  // ─── Templates ─────────────────────────────────────────────────────────────────────────────────────────────────
  /** The templates in use: the built-in ones, replaced by any that have been saved. */
  private async templates(db: PrismaTxClient) {
    const saved = await db.mentoringMessageTemplate.findMany({ where: { isActive: true } });
    return DEFAULT_TEMPLATES.map((d) => {
      const s = saved.find((x) => x.key === d.key);
      return { key: d.key, name: s?.name ?? d.name, body: s?.body ?? d.body, placeholders: s ? s.placeholders : [...d.placeholders], customised: !!s };
    });
  }

  async listTemplates(scope: MentoringScope) {
    this.access.requireAnyScope(scope);
    return { templates: await this.templates(this.db), canEdit: scope.perms.has('mentoring.template.manage') };
  }

  /** Edits a template. Needs the template permission, which no role holds until it is granted. */
  async saveTemplate(scope: MentoringScope, key: string, body: unknown) {
    if (!scope.perms.has('mentoring.template.manage')) throw new ForbiddenException('You do not have permission to edit message templates.');
    if (!TEMPLATE_KEYS.includes(key)) throw new NotFoundException('That template does not exist.');
    const checked = checkTemplate(body);
    if (!checked.ok) throw new BadRequestException(checked.message);
    const { placeholdersIn } = await import('./class-workspace');
    return this.prisma.$transaction(async (tx: PrismaTxClient) => {
      const existing = await tx.mentoringMessageTemplate.findFirst({ where: { key } });
      const data = { name: checked.value.name, body: checked.value.body, placeholders: placeholdersIn(checked.value.body), isActive: true, updatedByUserId: scope.userId };
      if (existing) await tx.mentoringMessageTemplate.update({ where: { id: existing.id }, data });
      else await tx.mentoringMessageTemplate.create({ data: { key, ...data } });
      return { key, name: data.name };
    });
  }

  // ─── Reading one class ─────────────────────────────────────────────────────────────────────────────────────────
  private async facts(db: PrismaTxClient, session: SessionRow, view: ClassView) {
    const [activation, subject, tutorEmp] = await Promise.all([
      db.mentoringActivation.findUnique({ where: { id: session.activationId } }),
      db.subject.findUnique({ where: { id: session.subjectId } }),
      db.employee.findUnique({ where: { userId: session.tutorUserId } }),
    ]);
    const mentor = activation?.currentMentorUserId ? await db.employee.findUnique({ where: { userId: activation.currentMentorUserId } }) : null;
    return { studentId: activation?.studentId ?? null, subject: subject?.name ?? view.subjectName, tutorName: tutorEmp ? `${tutorEmp.firstName} ${tutorEmp.lastName}`.trim() : view.tutorName, mentorName: mentor ? `${mentor.firstName} ${mentor.lastName}`.trim() : null };
  }

  private async people(db: PrismaTxClient, ids: Array<string | null | undefined>) {
    const wanted = [...new Set(ids.filter((i): i is string => !!i))];
    const out = new Map<string, string>();
    if (wanted.length) for (const e of await db.employee.findMany({ where: { userId: { in: wanted } } })) out.set(e.userId, `${e.firstName} ${e.lastName}`.trim());
    return out;
  }

  /** The values a message is filled from. Only what is recorded; a missing value stays missing. */
  private values(session: SessionRow, view: ClassView, f: Awaited<ReturnType<MentoringClassWorkspaceService['facts']>>, activities: Array<{ title: string; instructions: string }>, over: Record<string, string> = {}) {
    const minutes = session.actualMinutes ?? null;
    const list = activities.map((a, i) => `${i + 1}. ${a.title}: ${a.instructions}`).join('\n');
    const base: Record<string, string | null> = {
      studentName: view.studentName, tutorName: f.tutorName, classDate: longDate(view.date), classTime: formatRange(view.startMinute, view.endMinute), subject: f.subject,
      duration: minutes !== null ? hoursText(minutes) : null, topicsCovered: session.topicsCovered ?? null, practiceWork: activities.length ? activities.map((a) => a.title).join(', ') : null,
      meetLink: session.meetLink ?? null, activityList: list || null, mentorName: f.mentorName,
    };
    for (const [k, v] of Object.entries(over)) if (typeof v === 'string' && v.trim()) base[k] = v.trim();
    return base;
  }

  private async workspaceView(db: PrismaTxClient, session: SessionRow, now: Date, role: 'TUTOR' | 'MENTOR', scope?: MentoringScope) {
    const view = await this.classes.viewFor(db, session, now);
    const [f, activities, attachments, shares, templates] = await Promise.all([
      this.facts(db, session, view),
      db.mentoringClassActivity.findMany({ where: { sessionId: session.id, removedAt: null } }),
      db.mentoringClassAttachment.findMany({ where: { sessionId: session.id } }),
      db.mentoringMessageShare.findMany({ where: { sessionId: session.id } }),
      this.templates(db),
    ]);
    const names = await this.people(db, [...shares.flatMap((s) => [s.preparedByUserId, s.copiedByUserId, s.confirmedByUserId]), ...activities.flatMap((a) => [a.sharedByUserId, a.respondedByUserId]), ...attachments.flatMap((a) => [a.uploadedByUserId, a.sharedByUserId, a.mentorVerifiedByUserId]), session.cancelledByUserId, session.exceptionRequestedByUserId, session.exceptionDecidedByUserId]);
    const nm = (id: string | null | undefined) => (id ? names.get(id) ?? 'A user' : null);
    const sorted = [...activities].sort((a, b) => a.position - b.position);
    const current = attachments.filter((a) => !a.supersededAt).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0] ?? null;
    const tz = (await this.sla.workingNow(db, now)).timeZone;
    const target = zonedInstant(view.date, view.startMinute - REMINDER_LEAD_MINUTES, tz);
    const start = zonedInstant(view.date, view.startMinute, tz);
    const lastShare = (key: string) => [...shares].filter((s) => s.templateKey === key).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0] ?? null;
    const shareView = (s: (typeof shares)[number] | null) => (s ? { id: s.id, text: s.text, preparedBy: nm(s.preparedByUserId), preparedAt: s.createdAt.toISOString(), copiedAt: s.copiedAt?.toISOString() ?? null, confirmedAt: s.confirmedAt?.toISOString() ?? null, confirmedBy: nm(s.confirmedByUserId) } : null);
    const reminder = lastShare('CLASS_REMINDER');
    const reminderDone = !!reminder?.confirmedAt;
    const reminderWarning = reminderDone || ['VERIFIED', 'NOT_CONDUCTED', 'CANCELLED', 'AWAITING_MENTOR_VERIFICATION'].includes(view.status) ? null
      : now.getTime() > start.getTime() ? { level: 'red' as const, text: 'The class has started and the reminder was never recorded as shared.' }
        : now.getTime() > target.getTime() ? { level: 'amber' as const, text: 'The reminder is due now: 45 minutes before the class.' } : null;
    const preview = (key: string, over: Record<string, string> = {}) => {
      const t = templates.find((x) => x.key === key) as (typeof templates)[number];
      const r = renderTemplate(t.body, this.values(session, view, f, sorted, over));
      return { key, name: t.name, ok: r.ok, text: r.ok ? r.text : null, missing: r.ok ? [] : r.missing, message: r.ok ? null : r.message, placeholders: t.placeholders, share: shareView(lastShare(key)) };
    };
    const counted = countActivities(sorted);
    const grades = await db.grade.findMany({});
    const gradeName = (id: string | null) => (id ? grades.find((g) => g.id === id)?.name ?? null : null);
    const studentGradeId = await this.studentGradeOf(db, session);
    const versions = await this.versionsOf(db, session.id, nm);
    const followUps = await this.followUpsOf(db, session, role, scope, now, nm);
    const blockers = verificationBlockers({ conducted: session.conducted, tutorSubmitted: !!session.tutorSubmittedAt, voiceUploaded: !!current, voiceShared: !!current?.sharedAt, activitiesCreated: counted.created, activitiesShared: counted.shared, exceptionApproved: session.exceptionStatus === 'APPROVED' });
    const scopeOk = role === 'MENTOR' && !!scope;
    return {
      class: role === 'TUTOR' ? { ...view, sla: null } : view,
      student: { name: view.studentName, studentId: f.studentId },
      tutorName: f.tutorName,
      mentorName: f.mentorName,
      before: {
        targetAt: target.toISOString(), leadMinutes: REMINDER_LEAD_MINUTES, meetLink: session.meetLink ?? null, warning: reminderWarning, done: reminderDone,
        message: preview('CLASS_REMINDER'),
        inApp: view.reminder,
      },
      after: {
        update: view.update,
        voice: current ? { id: current.id, fileName: current.fileName, size: current.fileSize, mimeType: current.mimeType, uploadedAt: current.createdAt.toISOString(), uploadedBy: nm(current.uploadedByUserId), sharedAt: current.sharedAt?.toISOString() ?? null, sharedBy: nm(current.sharedByUserId), mentorVerifiedAt: current.mentorVerifiedAt?.toISOString() ?? null, mentorVerifiedBy: nm(current.mentorVerifiedByUserId) } : null,
        earlierVoice: attachments.filter((a) => a.supersededAt).length,
        activities: sorted.map((a) => ({
          id: a.id, position: a.position, title: a.title, type: a.type, typeLabel: ACTIVITY_TYPE_LABELS[a.type as keyof typeof ACTIVITY_TYPE_LABELS] ?? a.type, typeDescription: a.typeDescription, topic: a.topic, instructions: a.instructions, dueDate: dayOf(a.dueDate),
          gradeId: a.gradeId ?? null, gradeName: gradeName(a.gradeId ?? null), learningLevel: a.learningLevel ?? null, learningLevelLabel: a.learningLevel ? LEARNING_LEVEL_LABELS[a.learningLevel as keyof typeof LEARNING_LEVEL_LABELS] ?? a.learningLevel : null, suitabilityNote: a.suitabilityNote ?? null, optionGroupKey: a.optionGroupKey ?? null, optionLabel: a.optionLabel ?? null,
          sharedAt: a.sharedAt?.toISOString() ?? null, sharedBy: nm(a.sharedByUserId), studentResponse: a.studentResponse, respondedAt: a.respondedAt?.toISOString() ?? null, completion: a.completion, completionLabel: COMPLETION_LABELS[a.completion as keyof typeof COMPLETION_LABELS] ?? a.completion,
          tutorRemarks: a.tutorRemarks, mentorRemarks: a.mentorRemarks,
        })),
        minimumActivities: MIN_ACTIVITIES,
        activityCounts: counted,
        activityOptions: { grades: grades.map((g) => ({ id: g.id, name: g.name })), studentGradeId, levels: Object.entries(LEARNING_LEVEL_LABELS).map(([value, label]) => ({ value, label })), maxOptionsPerGroup: MAX_OPTIONS_PER_GROUP },
        versions,
        messages: [preview('CLASS_UPDATE'), preview('POST_CLASS_ACTIVITIES')],
        canEdit: view.status !== 'VERIFIED' && view.status !== 'NOT_CONDUCTED' && view.status !== 'CANCELLED',
      },
      review: {
        blockers, canVerify: scopeOk && view.status === 'AWAITING_MENTOR_VERIFICATION' && blockers.length === 0, mentorRemarks: session.mentorRemarks,
        exception: { status: session.exceptionStatus ?? null, reason: session.exceptionReason, requestedBy: nm(session.exceptionRequestedByUserId), requestedAt: session.exceptionRequestedAt?.toISOString() ?? null, decidedBy: nm(session.exceptionDecidedByUserId), decidedAt: session.exceptionDecidedAt?.toISOString() ?? null, decisionNote: session.exceptionDecisionNote },
        cancelled: session.cancelledAt ? { at: session.cancelledAt.toISOString(), by: nm(session.cancelledByUserId), reason: session.cancelReason } : null,
        followUps,
        consumption: view.consumption, minutes: { scheduled: view.scheduledMinutes, reported: view.update?.actualMinutes ?? null, verified: view.verified?.minutes ?? null, consumed: view.consumption === 'CONSUMED' ? view.verified?.minutes ?? 0 : 0 },
      },
    };
  }

  /** Every submission of the tutor update, oldest first, as it was sent, and what changed from the one before. */
  private async versionsOf(db: PrismaTxClient, sessionId: string, nm: (id: string | null | undefined) => string | null) {
    const events = (await db.mentoringClassSessionEvent.findMany({ where: { sessionId, kind: { in: ['TUTOR_SUBMITTED', 'TUTOR_RESUBMITTED'] } } })).sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
    const people = await this.people(db, events.map((e) => e.actorUserId));
    let before: Record<string, unknown> | null = null;
    return events.map((e, i) => {
      const payload = (e.payload ?? {}) as { version?: number; snapshot?: Record<string, unknown> };
      const snapshot = payload.snapshot ?? null;
      const changed = snapshot && before ? Object.keys(snapshot).filter((k) => JSON.stringify(snapshot[k]) !== JSON.stringify(before?.[k])) : [];
      before = snapshot ?? before;
      return { version: payload.version ?? i + 1, at: e.createdAt.toISOString(), by: e.actorUserId ? people.get(e.actorUserId) ?? nm(e.actorUserId) : null, resubmission: e.kind === 'TUTOR_RESUBMITTED', reason: e.reason ?? null, snapshot, changed };
    });
  }

  /** The follow-up tasks of this class. A Mentor sees all of them, the tutor only the ones given to them. */
  private async followUpsOf(db: PrismaTxClient, session: SessionRow, role: 'TUTOR' | 'MENTOR', scope: MentoringScope | undefined, now: Date, nm: (id: string | null | undefined) => string | null) {
    const rows = await db.mentoringTask.findMany({ where: { sourceType: 'CLASS', sourceId: session.id } });
    const mine = role === 'TUTOR' ? rows.filter((t) => t.assigneeUserId === session.tutorUserId) : rows;
    const people = await this.people(db, mine.flatMap((t) => [t.assigneeUserId, t.assignedByUserId]));
    void scope;
    return mine.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime()).map((t) => ({
      id: t.id, title: t.title, description: t.description ?? null, priority: t.priority, status: t.status, dueAt: t.dueAt?.toISOString() ?? null,
      overdue: !!t.dueAt && t.dueAt.getTime() < now.getTime() && !['VERIFIED', 'CANCELLED'].includes(t.status),
      assignee: people.get(t.assigneeUserId) ?? nm(t.assigneeUserId), assigneeRole: t.assigneeUserId === session.tutorUserId ? 'TUTOR' : 'MENTOR', assignedBy: people.get(t.assignedByUserId) ?? nm(t.assignedByUserId),
      note: (t.evidence as { note?: string } | null)?.note ?? null, returnReason: t.returnReason ?? null, createdAt: t.createdAt.toISOString(),
    }));
  }

  /** The tutor's view of one of their own classes. */
  async tutorWorkspace(userId: string, key: string, now: Date = new Date()) {
    const o = await this.classes.occurrenceForKey(this.db, key);
    const profile = await this.classes.tutorProfileOf(this.db, userId);
    if (o.tutorProfileId !== profile.id) throw new ForbiddenException('This class is not yours.');
    const existing = await this.db.mentoringClassSession.findFirst({ where: { assignmentId: o.assignmentId, originalDate: new Date(`${o.originalDate}T00:00:00Z`), originalStartMinute: o.originalStartMinute } });
    if (existing) return this.workspaceView(this.db, existing, now, 'TUTOR');
    // Nothing has happened to this class yet, so there is no stored row. Make it, as every first action does.
    return this.prisma.$transaction(async (tx: PrismaTxClient) => this.workspaceView(tx, await this.classes.ensureSession(tx, o), now, 'TUTOR'));
  }

  /** The Mentor's view of one class of their students (or any, for the Head and the CEO to read). */
  async mentorWorkspace(scope: MentoringScope, key: string, now: Date = new Date()) {
    this.access.requireAnyScope(scope);
    const o = await this.classes.occurrenceForKey(this.db, key);
    if (!(await this.db.mentoringActivation.findFirst({ where: { AND: [{ id: o.activationId }, this.access.visibilityWhere(scope)] } }))) throw new NotFoundException('Class not found');
    const existing = await this.db.mentoringClassSession.findFirst({ where: { assignmentId: o.assignmentId, originalDate: new Date(`${o.originalDate}T00:00:00Z`), originalStartMinute: o.originalStartMinute } });
    const session = existing ?? (await this.prisma.$transaction(async (tx: PrismaTxClient) => this.classes.ensureSession(tx, o)));
    const view = await this.workspaceView(this.db, session, now, 'MENTOR', scope);
    const activation = await this.db.mentoringActivation.findUnique({ where: { id: o.activationId } });
    const mine = activation?.currentMentorUserId === scope.userId && scope.perms.has('mentoring.stage.work');
    return { ...view, canWork: mine, canDecideException: scope.perms.has('mentoring.exception.authorize'), review: { ...view.review, canVerify: view.review.canVerify && mine } };
  }

  // ─── Before class: messages and the Meet link ──────────────────────────────────────────────────────────────────
  /** Makes the message for a template from the class, with any missing field supplied by the person. Nothing is shared yet. */
  async prepareShare(userId: string, role: 'TUTOR' | 'MENTOR', key: string, templateKey: string, overrides: Record<string, unknown> = {}, now: Date = new Date()) {
    if (!TEMPLATE_KEYS.includes(templateKey)) throw new NotFoundException('That template does not exist.');
    return this.prisma.$transaction(async (tx: PrismaTxClient) => {
      const { session } = role === 'TUTOR' ? await this.tutorCtx(tx, userId, key) : await this.mentorCtx(tx, userId, key);
      if (session.status === 'CANCELLED') throw new ConflictException('This class was cancelled.');
      const view = await this.classes.viewFor(tx, session, now);
      const f = await this.facts(tx, session, view);
      const activities = (await tx.mentoringClassActivity.findMany({ where: { sessionId: session.id, removedAt: null } })).sort((a, b) => a.position - b.position);
      const t = (await this.templates(tx)).find((x) => x.key === templateKey) as { body: string };
      // Only the Meet link can be typed in, because it is the one value that is not recorded anywhere else. Every other value comes from
      // the class record, so a caller can never change the student, tutor, date, time or subject that a message states.
      const over: Record<string, string> = {};
      if (typeof overrides.meetLink === 'string' && overrides.meetLink.trim()) {
        const link = checkMeetLink({ link: overrides.meetLink });
        if (!link.ok) throw new BadRequestException(link.message);
        if (link.value) over.meetLink = link.value;
      }
      const r = renderTemplate(t.body, this.values(session, view, f, activities, over));
      if (!r.ok) throw new BadRequestException(r.message);
      const made = await tx.mentoringMessageShare.create({ data: { sessionId: session.id, templateKey, text: r.text, preparedByUserId: userId } });
      await this.classes.logEvent(tx, session.id, 'MESSAGE_PREPARED', userId, { payload: { shareId: made.id, templateKey } });
      return { shareId: made.id, text: r.text, shared: false };
    });
  }

  private async shareOf(tx: PrismaTxClient, shareId: string, userId: string, role: 'TUTOR' | 'MENTOR') {
    const share = await tx.mentoringMessageShare.findUnique({ where: { id: shareId } });
    if (!share) throw new NotFoundException('Message not found');
    const session = (await tx.mentoringClassSession.findUnique({ where: { id: share.sessionId } })) as SessionRow;
    if (role === 'TUTOR') {
      if (session.tutorUserId !== userId) throw new ForbiddenException('This class is not yours.');
    } else await this.classes.mentorGuard(tx, session.activationId, userId);
    return { share, session };
  }

  /** The person copied the message. This is not sharing: copying and closing the window leaves it not confirmed. */
  async markCopied(userId: string, role: 'TUTOR' | 'MENTOR', shareId: string, now: Date = new Date()) {
    return this.prisma.$transaction(async (tx: PrismaTxClient) => {
      const { share } = await this.shareOf(tx, shareId, userId, role);
      if (!share.copiedAt) await tx.mentoringMessageShare.update({ where: { id: shareId }, data: { copiedAt: now, copiedByUserId: userId } });
      return { shareId, copied: true, shared: !!share.confirmedAt };
    });
  }

  /** The person says they pasted the message into the existing group. The record names them and the time. It is not a delivery. */
  async confirmShare(userId: string, role: 'TUTOR' | 'MENTOR', shareId: string, now: Date = new Date()) {
    return this.prisma.$transaction(async (tx: PrismaTxClient) => {
      const { share, session } = await this.shareOf(tx, shareId, userId, role);
      if (share.confirmedAt) return { shareId, shared: true, confirmedAt: share.confirmedAt.toISOString(), already: true };
      await tx.mentoringMessageShare.update({ where: { id: shareId }, data: { confirmedAt: now, confirmedByUserId: userId, ...(share.copiedAt ? {} : { copiedAt: now, copiedByUserId: userId }) } });
      await this.classes.logEvent(tx, session.id, 'MESSAGE_SHARE_CONFIRMED', userId, { payload: { shareId, templateKey: share.templateKey, by: role } });
      return { shareId, shared: true, confirmedAt: now.toISOString(), already: false };
    });
  }

  /** The common Meet link of the class. Empty clears it. */
  async setMeetLink(userId: string, key: string, body: unknown) {
    const checked = checkMeetLink(body);
    if (!checked.ok) throw new BadRequestException(checked.message);
    return this.prisma.$transaction(async (tx: PrismaTxClient) => {
      const { session } = await this.mentorCtx(tx, userId, key);
      this.open(session);
      await tx.mentoringClassSession.update({ where: { id: session.id }, data: { meetLink: checked.value } });
      await this.classes.logEvent(tx, session.id, 'MEET_LINK_SET', userId, { payload: { cleared: checked.value === null } });
      return { sessionId: session.id, meetLink: checked.value };
    });
  }

  // ─── After class: the activities ───────────────────────────────────────────────────────────────────────────────
  /** The grade this student has for the subject, from the saved schedule. Null when the schedule does not say. */
  private async studentGradeOf(tx: PrismaTxClient, session: SessionRow): Promise<string | null> {
    const activation = await tx.mentoringActivation.findUnique({ where: { id: session.activationId } });
    if (!activation) return null;
    const field = await tx.enrollmentHandoverField.findFirst({ where: { handoverId: activation.handoverId, fieldKey: 'timetable.schedule' } });
    const subjects = (field?.value as { subjects?: Array<{ subjectId?: string; gradeId?: string }> } | null)?.subjects ?? [];
    return subjects.find((s) => s.subjectId === session.subjectId)?.gradeId ?? null;
  }

  /** The grade must exist, and a grade other than the student's own needs a reason. The level is checked by the rule itself. */
  private async checkSuitability(tx: PrismaTxClient, session: SessionRow, v: { gradeId: string | null; suitabilityNote: string | null }) {
    if (!v.gradeId) return;
    if (!(await tx.grade.findUnique({ where: { id: v.gradeId } }))) throw new BadRequestException('That grade does not exist.');
    const own = await this.studentGradeOf(tx, session);
    if (own && v.gradeId !== own && !v.suitabilityNote) throw new BadRequestException('This activity is for a different grade from the student. Say why it suits them.');
  }

  /** At most three options in a group, each with its own label. The activity being edited is left out of the count. */
  private checkOptionGroup(others: Array<{ id: string; optionGroupKey: string | null; optionLabel: string | null }>, v: { optionGroupKey: string | null; optionLabel: string | null }, selfId: string | null) {
    if (!v.optionGroupKey) return;
    const group = others.filter((o) => o.optionGroupKey === v.optionGroupKey && o.id !== selfId);
    if (group.length >= MAX_OPTIONS_PER_GROUP) throw new ConflictException(`A group can have at most ${MAX_OPTIONS_PER_GROUP} options.`);
    if (group.some((o) => (o.optionLabel ?? '').toLowerCase() === (v.optionLabel ?? '').toLowerCase())) throw new BadRequestException('Another option in this group already has that label.');
  }

  async addActivity(userId: string, key: string, body: unknown, now: Date = new Date()) {
    const checked = checkActivity(body);
    if (!checked.ok) throw new BadRequestException(checked.message);
    return this.prisma.$transaction(async (tx: PrismaTxClient) => {
      const { session } = await this.tutorCtx(tx, userId, key);
      this.open(session);
      await this.reached(tx, session, now);
      const have = await tx.mentoringClassActivity.findMany({ where: { sessionId: session.id, removedAt: null } });
      if (have.length >= MAX_ACTIVITIES) throw new ConflictException(`A class can have at most ${MAX_ACTIVITIES} activities.`);
      const v = checked.value;
      await this.checkSuitability(tx, session, v);
      this.checkOptionGroup(have, v, null);
      const made = await tx.mentoringClassActivity.create({
        data: {
          sessionId: session.id, position: have.length + 1, title: v.title, type: v.type, typeDescription: v.typeDescription, topic: v.topic, instructions: v.instructions, dueDate: v.dueDate ? new Date(`${v.dueDate}T00:00:00Z`) : null,
          gradeId: v.gradeId, learningLevel: v.learningLevel, suitabilityNote: v.suitabilityNote, optionGroupKey: v.optionGroupKey, optionLabel: v.optionLabel, createdByUserId: userId,
        },
      });
      await this.classes.logEvent(tx, session.id, 'ACTIVITY_ADDED', userId, { payload: { activityId: made.id, type: v.type, gradeId: v.gradeId, learningLevel: v.learningLevel, optionGroupKey: v.optionGroupKey } });
      return { activityId: made.id, created: countActivities([...have, made]).created };
    });
  }

  private async activityOf(tx: PrismaTxClient, activityId: string) {
    const a = await tx.mentoringClassActivity.findUnique({ where: { id: activityId } });
    if (!a || a.removedAt) throw new NotFoundException('Activity not found');
    const session = (await tx.mentoringClassSession.findUnique({ where: { id: a.sessionId } })) as SessionRow;
    return { a, session };
  }

  private tutorOwns(session: SessionRow, userId: string) {
    if (session.tutorUserId !== userId) throw new ForbiddenException('This class is not yours.');
  }

  async updateActivity(userId: string, activityId: string, body: unknown) {
    return this.prisma.$transaction(async (tx: PrismaTxClient) => {
      const { a, session } = await this.activityOf(tx, activityId);
      this.tutorOwns(session, userId);
      this.open(session);
      // An activity made before grade and level were required can still be edited without them (C11). A newer one keeps the rules.
      const checked = checkActivity(body, { strict: a.learningLevel !== null });
      if (!checked.ok) throw new BadRequestException(checked.message);
      const v = checked.value;
      await this.checkSuitability(tx, session, v);
      this.checkOptionGroup(await tx.mentoringClassActivity.findMany({ where: { sessionId: session.id, removedAt: null } }), v, activityId);
      await tx.mentoringClassActivity.update({
        where: { id: activityId },
        data: {
          title: v.title, type: v.type, typeDescription: v.typeDescription, topic: v.topic, instructions: v.instructions, dueDate: v.dueDate ? new Date(`${v.dueDate}T00:00:00Z`) : null,
          gradeId: v.gradeId, learningLevel: v.learningLevel, suitabilityNote: v.suitabilityNote, optionGroupKey: v.optionGroupKey, optionLabel: v.optionLabel,
          ...(a.sharedAt ? { sharedAt: null, sharedByUserId: null } : {}),
        },
      });
      await this.classes.logEvent(tx, session.id, 'ACTIVITY_CHANGED', userId, { payload: { activityId, sharingWithdrawn: !!a.sharedAt } });
      return { activityId, sharingWithdrawn: !!a.sharedAt };
    });
  }

  /** Removes an activity from the class. The row is kept with who and when, so nothing is lost from the history. */
  async removeActivity(userId: string, activityId: string, now: Date = new Date()) {
    return this.prisma.$transaction(async (tx: PrismaTxClient) => {
      const { session } = await this.activityOf(tx, activityId);
      this.tutorOwns(session, userId);
      this.open(session);
      await tx.mentoringClassActivity.update({ where: { id: activityId }, data: { removedAt: now, removedByUserId: userId } });
      await this.classes.logEvent(tx, session.id, 'ACTIVITY_REMOVED', userId, { payload: { activityId } });
      return { activityId };
    });
  }

  /** The tutor says they shared the activity in the existing group. A person's word, with their name and the time. */
  async shareActivity(userId: string, activityId: string, now: Date = new Date()) {
    return this.prisma.$transaction(async (tx: PrismaTxClient) => {
      const { a, session } = await this.activityOf(tx, activityId);
      this.tutorOwns(session, userId);
      this.open(session);
      if (a.sharedAt) return { activityId, sharedAt: a.sharedAt.toISOString(), already: true };
      await tx.mentoringClassActivity.update({ where: { id: activityId }, data: { sharedAt: now, sharedByUserId: userId } });
      await this.classes.logEvent(tx, session.id, 'ACTIVITY_SHARED', userId, { payload: { activityId } });
      return { activityId, sharedAt: now.toISOString(), already: false };
    });
  }

  /**
   * What the student did with an activity, written down by the tutor or by the Mentor (students have no login). It can be written
   * at any time, including after the class is verified, and it never affects verification or consumption.
   */
  async recordResponse(userId: string, role: 'TUTOR' | 'MENTOR', activityId: string, body: unknown, now: Date = new Date()) {
    const checked = checkResponse(body);
    if (!checked.ok) throw new BadRequestException(checked.message);
    return this.prisma.$transaction(async (tx: PrismaTxClient) => {
      const { session } = await this.activityOf(tx, activityId);
      if (role === 'TUTOR') this.tutorOwns(session, userId);
      else await this.classes.mentorGuard(tx, session.activationId, userId);
      const v = checked.value;
      if (role === 'TUTOR' && v.hasMentorRemarks) throw new ForbiddenException('The Mentor remarks are written by the Mentor.');
      if (role === 'MENTOR' && v.hasTutorRemarks) throw new ForbiddenException('The tutor remarks are written by the tutor.');
      await tx.mentoringClassActivity.update({
        where: { id: activityId },
        data: {
          // A response is only replaced when a new one is written, so the Mentor marking completion keeps what the tutor recorded.
          ...(v.response ? { studentResponse: v.response, respondedAt: now, respondedByUserId: userId } : {}), completion: v.completion, completionUpdatedAt: now, completionUpdatedByUserId: userId,
          ...(v.hasTutorRemarks ? { tutorRemarks: v.tutorRemarks } : {}), ...(v.hasMentorRemarks ? { mentorRemarks: v.mentorRemarks } : {}),
        },
      });
      await this.classes.logEvent(tx, session.id, 'ACTIVITY_RESPONSE_RECORDED', userId, { payload: { activityId, completion: v.completion, by: role } });
      return { activityId, completion: v.completion, classStatus: session.status };
    });
  }

  // ─── After class: the voice recording ──────────────────────────────────────────────────────────────────────────
  /** Stores the tutor's recording in private storage. A newer recording supersedes the older one, which stays on record. Sharing must be confirmed again. */
  async uploadVoice(userId: string, key: string, file: UploadedAudio | null | undefined, now: Date = new Date()) {
    if (!file) throw new BadRequestException('Choose the voice recording to upload.');
    const checked = checkAudio(file.buffer, file.mimetype || '');
    if (!checked.ok) throw new BadRequestException({ code: checked.code, message: checked.message });
    let savedKey: string | null = null;
    try {
      return await this.prisma.$transaction(async (tx: PrismaTxClient) => {
      const { session } = await this.tutorCtx(tx, userId, key);
      this.open(session);
      await this.reached(tx, session, now);
      const fileKey = await this.storage.saveAudio(session.id, file.buffer, checked.extension);
      savedKey = fileKey;
      for (const old of await tx.mentoringClassAttachment.findMany({ where: { sessionId: session.id, supersededAt: null } })) await tx.mentoringClassAttachment.update({ where: { id: old.id }, data: { supersededAt: now } });
      const made = await tx.mentoringClassAttachment.create({ data: { sessionId: session.id, kind: 'VOICE', fileKey, fileName: safeFileName(file.originalname), fileSize: file.buffer.length, mimeType: checked.mime, uploadedByUserId: userId } });
      await this.classes.logEvent(tx, session.id, 'VOICE_UPLOADED', userId, { payload: { attachmentId: made.id, size: file.buffer.length, mimeType: checked.mime } });
      return { attachmentId: made.id, uploaded: true, shared: false };
      });
    } catch (e) {
      // The file was written before the database could say no, so it is removed. Nothing refers to it.
      if (savedKey) await this.storage.deleteQuietly(savedKey);
      throw e;
    }
  }

  /** The tutor says they posted the recording in the existing group. Uploading alone never means this. */
  async confirmVoiceShared(userId: string, key: string, now: Date = new Date()) {
    return this.prisma.$transaction(async (tx: PrismaTxClient) => {
      const { session } = await this.tutorCtx(tx, userId, key);
      this.open(session);
      const att = (await tx.mentoringClassAttachment.findMany({ where: { sessionId: session.id, supersededAt: null } }))[0];
      if (!att) throw new ConflictException('Upload the voice recording first.');
      if (att.sharedAt) return { attachmentId: att.id, sharedAt: att.sharedAt.toISOString(), already: true };
      await tx.mentoringClassAttachment.update({ where: { id: att.id }, data: { sharedAt: now, sharedByUserId: userId } });
      await this.classes.logEvent(tx, session.id, 'VOICE_SHARED', userId, { payload: { attachmentId: att.id } });
      return { attachmentId: att.id, sharedAt: now.toISOString(), already: false };
    });
  }

  /**
   * The recording for playback. Only the tutor of the class and the Mentoring staff who may see the student can open it, and every
   * open goes through this check, so there is no address that works without a signed-in, authorised user.
   */
  async voiceStream(attachmentId: string, userId: string, scope: MentoringScope | null, rangeHeader?: string | null): Promise<{ stream: fs.ReadStream | null; mimeType: string; fileName: string; size: number; status: 200 | 206 | 416; start: number; end: number }> {
    const att = await this.db.mentoringClassAttachment.findUnique({ where: { id: attachmentId } });
    if (!att) throw new NotFoundException('Recording not found');
    const session = (await this.db.mentoringClassSession.findUnique({ where: { id: att.sessionId } })) as SessionRow;
    const isTutor = session.tutorUserId === userId;
    const staff = !isTutor && scope && (scope.all || scope.assigned) ? await this.db.mentoringActivation.findFirst({ where: { AND: [{ id: session.activationId }, this.access.visibilityWhere(scope)] } }) : null;
    if (!isTutor && !staff) throw new NotFoundException('Recording not found');
    // The range is read only after the caller is known to be allowed, so a refused caller learns nothing about the file.
    const range = parseRange(rangeHeader, att.fileSize);
    const base = { mimeType: att.mimeType, fileName: att.fileName, size: att.fileSize };
    if (range.kind === 'unsatisfiable') return { ...base, stream: null, status: 416, start: 0, end: 0 };
    if (range.kind === 'ok') return { ...base, stream: await this.storage.readStream(att.fileKey, { start: range.start, end: range.end }), status: 206, start: range.start, end: range.end };
    return { ...base, stream: await this.storage.readStream(att.fileKey), status: 200, start: 0, end: att.fileSize - 1 };
  }

  // ─── Follow-up tasks of a class ─────────────────────────────────────────────────────────────────────────────────
  /** A Mentor gives a follow-up task about this class to the tutor or keeps it. It is an ordinary Mentoring task with its source set. */
  async createFollowUp(userId: string, key: string, body: unknown, now: Date = new Date()) {
    return this.prisma.$transaction(async (tx: PrismaTxClient) => {
      const tz = (await this.sla.workingNow(tx, now)).timeZone;
      const today = localMomentOf(now, tz).date;
      const checked = checkFollowUp(body, today);
      if (!checked.ok) throw new BadRequestException(checked.message);
      const v = checked.value;
      const { session, activation } = await this.mentorCtx(tx, userId, key);
      const assigneeUserId = v.assignee === 'TUTOR' ? session.tutorUserId : userId;
      const task = await tx.mentoringTask.create({
        data: {
          activationId: activation.id, title: v.title, description: v.description, priority: v.priority, status: 'OPEN', dueAt: zonedInstant(v.dueDate, 24 * 60 - 1, tz),
          assigneeUserId, assignedByUserId: userId, sourceType: 'CLASS', sourceId: session.id,
        },
      });
      if (assigneeUserId !== userId) await tx.notification.create({ data: { recipientUserId: assigneeUserId, type: 'MENTORING_CLASS_FOLLOW_UP', entityType: ENTITY, entityId: session.id, action: '/tutor-portal', message: `A follow-up was given to you about the class on ${dayOf(session.date)}: ${v.title}`, dedupeKey: `class-follow-up:${task.id}` } });
      await this.classes.logEvent(tx, session.id, 'FOLLOW_UP_CREATED', userId, { payload: { taskId: task.id, assignee: v.assignee, dueDate: v.dueDate } });
      await this.history.record(tx, { activationId: activation.id, type: 'MENTORING_CLASS_FOLLOW_UP_CREATED', actorUserId: userId, payload: { sessionId: session.id, taskId: task.id } });
      return { taskId: task.id, status: 'OPEN' as const };
    });
  }

  private async followUpOf(tx: PrismaTxClient, taskId: string) {
    const task = await tx.mentoringTask.findUnique({ where: { id: taskId } });
    if (!task || task.sourceType !== 'CLASS' || !task.sourceId) throw new NotFoundException('Follow-up not found');
    const session = (await tx.mentoringClassSession.findUnique({ where: { id: task.sourceId } }));
    if (!session) throw new NotFoundException('Follow-up not found');
    return { task, session };
  }

  /** The tutor starts a follow-up, or hands it in with a note for the Mentor. Only the tutor it was given to. */
  async tutorUpdateFollowUp(userId: string, taskId: string, body: unknown, now: Date = new Date()) {
    const checked = checkFollowUpProgress(body);
    if (!checked.ok) throw new BadRequestException(checked.message);
    return this.prisma.$transaction(async (tx: PrismaTxClient) => {
      const { task, session } = await this.followUpOf(tx, taskId);
      if (task.assigneeUserId !== userId || session.tutorUserId !== userId) throw new ForbiddenException('This follow-up is not yours.');
      const activation = await loadLockedActivation(tx, session.activationId);
      this.classes.requireEligible(activation);
      if (!['OPEN', 'IN_PROGRESS', 'RETURNED'].includes(task.status)) throw new ConflictException('This follow-up is already handed in or closed.');
      const v = checked.value;
      await tx.mentoringTask.update({ where: { id: taskId }, data: { status: v.status, ...(v.note ? { evidence: { note: v.note } } : {}), ...(v.status === 'SUBMITTED' ? { submittedAt: now, returnReason: null } : {}) } });
      if (v.status === 'SUBMITTED' && activation.currentMentorUserId) await tx.notification.create({ data: { recipientUserId: activation.currentMentorUserId, type: 'MENTORING_CLASS_FOLLOW_UP_DONE', entityType: ENTITY, entityId: session.id, action: `/mentoring/students/${activation.id}`, message: `A follow-up was handed in for the class on ${dayOf(session.date)}: ${task.title}`, dedupeKey: `class-follow-up-done:${taskId}:${now.getTime()}` } });
      await this.classes.logEvent(tx, session.id, v.status === 'SUBMITTED' ? 'FOLLOW_UP_SUBMITTED' : 'FOLLOW_UP_STARTED', userId, { payload: { taskId } });
      return { taskId, status: v.status };
    });
  }

  /** The Mentor verifies a follow-up, sends it back with a reason, or cancels it with a reason. */
  async mentorDecideFollowUp(userId: string, taskId: string, body: unknown, now: Date = new Date()) {
    const checked = checkFollowUpDecision(body);
    if (!checked.ok) throw new BadRequestException(checked.message);
    return this.prisma.$transaction(async (tx: PrismaTxClient) => {
      const { task, session } = await this.followUpOf(tx, taskId);
      const activation = await this.classes.mentorGuard(tx, session.activationId, userId);
      const v = checked.value;
      if (['VERIFIED', 'CANCELLED'].includes(task.status)) throw new ConflictException('This follow-up is already closed.');
      const own = task.assigneeUserId === userId;
      if (v.decision === 'RETURNED' && task.status !== 'SUBMITTED') throw new ConflictException('Only a follow-up that was handed in can be sent back.');
      if (v.decision === 'VERIFIED' && task.status !== 'SUBMITTED' && !own) throw new ConflictException('Only a follow-up that was handed in can be verified.');
      await tx.mentoringTask.update({
        where: { id: taskId },
        data: v.decision === 'VERIFIED' ? { status: 'VERIFIED', verifiedByUserId: userId, verifiedAt: now } : v.decision === 'RETURNED' ? { status: 'RETURNED', returnReason: v.reason } : { status: 'CANCELLED', returnReason: v.reason },
      });
      if (v.decision !== 'VERIFIED' && task.assigneeUserId !== userId) await tx.notification.create({ data: { recipientUserId: task.assigneeUserId, type: 'MENTORING_CLASS_FOLLOW_UP_DECIDED', entityType: ENTITY, entityId: session.id, action: '/tutor-portal', message: `Your follow-up was ${v.decision === 'RETURNED' ? 'sent back' : 'cancelled'}: ${v.reason}`, dedupeKey: `class-follow-up-decided:${taskId}:${now.getTime()}` } });
      await this.classes.logEvent(tx, session.id, `FOLLOW_UP_${v.decision}`, userId, { reason: v.reason, payload: { taskId } });
      await this.history.record(tx, { activationId: activation.id, type: `MENTORING_CLASS_FOLLOW_UP_${v.decision}`, actorUserId: userId, reason: v.reason, payload: { sessionId: session.id, taskId } });
      return { taskId, status: v.decision };
    });
  }

  // ─── The Mentor: exceptions and the daily list ─────────────────────────────────────────────────────────────────
  /** The Mentor asks for the voice and activity conditions to be waived for one class. It needs a reason, and only the Mentoring Head can decide it. */
  async requestException(userId: string, key: string, body: unknown, now: Date = new Date()) {
    const why = checkReason(body, 'the exception is needed');
    if (!why.ok) throw new BadRequestException(why.message);
    return this.prisma.$transaction(async (tx: PrismaTxClient) => {
      const { session, activation } = await this.mentorCtx(tx, userId, key);
      this.open(session);
      if (session.exceptionStatus === 'REQUESTED') throw new ConflictException('An exception has already been requested for this class and is waiting for the Mentoring Head.');
      if (session.exceptionStatus === 'APPROVED') throw new ConflictException('An exception has already been approved for this class.');
      await tx.mentoringClassSession.update({ where: { id: session.id }, data: { exceptionStatus: 'REQUESTED', exceptionRequestedAt: now, exceptionRequestedByUserId: userId, exceptionReason: why.value, exceptionDecidedAt: null, exceptionDecidedByUserId: null, exceptionDecisionNote: null } });
      await this.classes.logEvent(tx, session.id, 'EXCEPTION_REQUESTED', userId, { reason: why.value });
      await this.history.record(tx, { activationId: activation.id, type: 'MENTORING_CLASS_EXCEPTION_REQUESTED', actorUserId: userId, reason: why.value, payload: { sessionId: session.id } });
      return { sessionId: session.id, status: 'REQUESTED' as const };
    });
  }

  /** The Mentoring Head approves or rejects it. Not the Mentor who asked, and not anyone without the exception permission. */
  async decideException(scope: MentoringScope, key: string, body: { approve?: unknown; note?: unknown }, now: Date = new Date()) {
    if (!scope.perms.has('mentoring.exception.authorize')) throw new ForbiddenException('Only the Mentoring Head can approve an exception.');
    if (typeof body.approve !== 'boolean') throw new BadRequestException('Say whether you approve or reject the exception.');
    const note = typeof body.note === 'string' ? body.note.trim() : '';
    if (!body.approve && !note) throw new BadRequestException('Say why the exception is rejected.');
    if (note.length > 1000) throw new BadRequestException('The note must be 1000 characters or fewer.');
    return this.prisma.$transaction(async (tx: PrismaTxClient) => {
      const o = await this.classes.occurrenceForKey(tx, key);
      const activation = await loadLockedActivation(tx, o.activationId);
      const session = await this.classes.ensureSession(tx, o);
      if (session.exceptionStatus !== 'REQUESTED') throw new ConflictException('There is no exception waiting for a decision on this class.');
      if (session.exceptionRequestedByUserId === scope.userId) throw new ForbiddenException('You cannot decide an exception you asked for.');
      this.open(session);
      await tx.mentoringClassSession.update({ where: { id: session.id }, data: { exceptionStatus: body.approve ? 'APPROVED' : 'REJECTED', exceptionDecidedAt: now, exceptionDecidedByUserId: scope.userId, exceptionDecisionNote: note || null } });
      await this.classes.logEvent(tx, session.id, body.approve ? 'EXCEPTION_APPROVED' : 'EXCEPTION_REJECTED', scope.userId, { reason: note || null, payload: { requestedBy: session.exceptionRequestedByUserId, requestReason: session.exceptionReason } });
      await this.history.record(tx, { activationId: activation.id, type: body.approve ? 'MENTORING_CLASS_EXCEPTION_APPROVED' : 'MENTORING_CLASS_EXCEPTION_REJECTED', actorUserId: scope.userId, reason: note || null, payload: { sessionId: session.id, requestedBy: session.exceptionRequestedByUserId } });
      if (session.exceptionRequestedByUserId) await tx.notification.create({ data: { recipientUserId: session.exceptionRequestedByUserId, type: body.approve ? 'MENTORING_CLASS_EXCEPTION_APPROVED' : 'MENTORING_CLASS_EXCEPTION_REJECTED', entityType: ENTITY, entityId: session.id, action: `/mentoring/students/${activation.id}`, message: `Your exception request for the class on ${dayOf(session.date)} was ${body.approve ? 'approved' : 'rejected'}.${note ? ` ${note}` : ''}`, dedupeKey: `class-exception:${session.id}:${now.getTime()}` } });
      return { sessionId: session.id, status: body.approve ? ('APPROVED' as const) : ('REJECTED' as const) };
    });
  }

  /**
   * The classes of a day or a range of days for the people the caller may see, filtered and paged in the query. The Head can filter
   * by Mentor. A dashboard card key opens exactly the classes that card counted, because both use classCardsOf; the card that counts
   * classes waiting for the Mentor also includes the older ones still in the queue, as the dashboard does.
   */
  async list(scope: MentoringScope, f: ListFilters = {}, now: Date = new Date()) {
    this.access.requireAnyScope(scope);
    for (const [label, v] of [['date', f.date], ['from', f.from], ['to', f.to]] as const) if (v !== undefined && v !== '' && !isDateString(v)) throw new BadRequestException(`Choose a real ${label}, written like 2026-11-09.`);
    if (f.card && !(CLASS_CARD_KEYS as readonly string[]).includes(f.card)) throw new BadRequestException('That is not a class card.');
    const db = this.db;
    const today = localMomentOf(now, (await this.sla.workingNow(db, now)).timeZone).date;
    const from = f.from || f.date || today;
    const to = f.to || (f.from ? f.from : f.date || today);
    let acts = await db.mentoringActivation.findMany({ where: this.access.visibilityWhere(scope) });
    if (f.mentorUserId) acts = acts.filter((a) => a.currentMentorUserId === f.mentorUserId);
    const students = acts.length ? await db.student.findMany({ where: { id: { in: acts.map((a) => a.studentId) } } }) : [];
    const q = f.studentQuery?.trim().toLowerCase();
    if (q) {
      const keep = new Set(students.filter((s) => `${s.firstName} ${s.lastName ?? ''} ${(s as { businessId?: string | null }).businessId ?? ''}`.toLowerCase().includes(q)).map((s) => s.id));
      acts = acts.filter((a) => keep.has(a.studentId));
    }
    const mentors = await this.people(db, acts.map((a) => a.currentMentorUserId));
    const ids = acts.map((a) => a.id);
    const filters = { subjectId: f.subjectId, tutorProfileId: f.tutorProfileId, state: f.state };
    let found = ids.length === 0 ? [] : await this.classes.range(scope, from, to, ids, filters, now);
    if (f.card === 'classes_awaiting_verification' && ids.length) {
      for (const k of (await this.classes.queue(scope, filters, now)).filter((x) => ids.includes(x.activationId) && x.state === 'AWAITING_MENTOR_VERIFICATION')) if (!found.some((x) => x.key === k.key)) found = [...found, k];
    }
    if (f.card) found = found.filter((k) => classCardsOf(k, today).includes(f.card as (typeof CLASS_CARD_KEYS)[number]));
    found = [...found].sort((a, b) => a.date.localeCompare(b.date) || a.startMinute - b.startMinute || a.studentName.localeCompare(b.studentName));
    const out = found.map((c) => {
      const a = acts.find((x) => x.id === c.activationId);
      const s = students.find((x) => x.id === a?.studentId);
      return { ...c, studentId: (s as { businessId?: string | null } | undefined)?.businessId ?? null, mentorUserId: a?.currentMentorUserId ?? null, mentorName: a?.currentMentorUserId ? mentors.get(a.currentMentorUserId) ?? null : null, sla: null };
    });
    const counts: Record<string, number> = {};
    for (const c of out) counts[c.state] = (counts[c.state] ?? 0) + 1;
    const size = Math.min(100, Math.max(1, Number(f.pageSize) || 50));
    const page = Math.max(1, Math.floor(Number(f.page) || 1));
    return { date: from, from, to, card: f.card ?? null, counts, total: out.length, page, pageSize: size, pages: Math.max(1, Math.ceil(out.length / size)), rows: out.slice((page - 1) * size, page * size) };
  }
}
