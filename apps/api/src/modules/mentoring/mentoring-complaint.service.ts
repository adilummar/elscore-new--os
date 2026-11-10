import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';

import { PrismaService, PrismaTxClient } from '../../common/prisma/prisma.service';
import { isDateString } from '../tutor/tutor-calendar';

import {
  CATEGORIES, CATEGORY_LABELS, CHANNEL_LABELS, COMMUNICATION_LABELS, Entry, EntryKind, PRIORITIES, PRIORITY_LABELS, PRIORITY_ORDER, STAGE_FILTERS, STAGE_LABELS, STATUSES, STATUS_LABELS, SLA_FILTERS, Stage, Status, checkAcknowledge, checkAssign,
  checkComplaint, checkReopen, checkResolution, checkStatus, checkText, parentHistory, reopenProblem, resolutionMinutes, stageOf, Priority, Category, Channel, Communication,
} from './complaint';
import { MentoringAccessService, MentoringScope } from './mentoring-access.service';
import { loadLockedActivation } from './mentoring-guards';
import { MentoringHistoryService } from './mentoring-history.service';
import { localMomentOf, slaView, SlaState } from './mentoring-sla';
import { MentoringSlaService } from './mentoring-sla.service';
import { isScheduleValue } from './subject-schedule';

const POLICY = 'COMPLAINT_ACKNOWLEDGEMENT';
const ENTITY = 'Complaint';
const HANDLE = 'mentoring.complaint.handle';
const asDate = (d: string) => new Date(`${d}T00:00:00Z`);
const dayOf = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : null);
const MAX_ROWS = 500;

type ComplaintRow = NonNullable<Awaited<ReturnType<PrismaTxClient['mentoringComplaint']['findUnique']>>>;
type Activation = { id: string; handoverId: string | null; status: string; currentMentorUserId: string | null; studentId: string };

export interface ComplaintFilters { status?: string; stage?: string; category?: string; priority?: string; sla?: string; activationId?: string; assignedToUserId?: string; mine?: string | boolean; from?: string; to?: string; limit?: number | string }

export interface AckView {
  startedAt: string;
  dueAt: string | null;
  acknowledgedAt: string | null;
  firstResponseAt: string | null;
  state: SlaState | null;
  stateLabel: string | null;
  metSla: boolean | null;
  overdueMinutes: number;
  remainingMinutes: number;
  target: { label: string; targetMinutes: number; mode: string } | null;
}

export interface ComplaintView {
  id: string;
  number: string;
  title: string;
  category: Category;
  categoryLabel: string;
  priority: Priority;
  priorityLabel: string;
  activationId: string;
  studentName: string;
  parentName: string;
  status: Status;
  statusLabel: string;
  stage: Stage;
  stageLabel: string;
  assignedToUserId: string | null;
  assignedToName: string | null;
  receivedAt: string;
  ack: AckView;
  resolutionMinutes: number | null;
  reopenCount: number;
}

export interface ComplaintDetail extends ComplaintView {
  description: string;
  channel: Channel;
  channelLabel: string;
  supportingNote: string | null;
  subjectName: string | null;
  tutorName: string | null;
  loggedAt: string;
  loggedByName: string | null;
  acknowledged: { at: string; byName: string | null; channelLabel: string | null; note: string | null } | null;
  resolution: { resolvedAt: string; resolvedByName: string | null; date: string | null; remarks: string | null; how: string | null; communication: Communication | null; communicationLabel: string | null; communicationNote: string | null; minutes: number | null } | null;
  resolutionNote: string;
  entries: Array<{ kind: EntryKind; visibility: 'INTERNAL' | 'PARENT'; text: string | null; at: string; by: string | null }>;
  parentView: { stage: Stage; stageLabel: string; title: string; categoryLabel: string; history: Array<{ kind: EntryKind; text: string | null; at: string; by: string | null }>; note: string };
  actions: { canHandle: boolean; canAcknowledge: boolean; canRespond: boolean; canAssign: boolean; canSetStatus: boolean; canResolve: boolean; canReopen: boolean; reopenProblem: string | null };
}

const PARENT_NOTE = 'This is what the parent can be shown. Parents have no login, so you read or send it to them. Internal remarks and actions are never part of it.';
const RESOLUTION_NOTE = 'The resolution time is measured from when the parent complained. No resolution target is promised. The two-hour target is for acknowledgement only.';

/**
 * Parent complaints, logged and handled by the Mentor on the parent's behalf. The acknowledgement clock is the existing response-time
 * policy; the resolution time is only measured. A complaint is resolved only with its explanation, and reopened only for a while.
 */
@Injectable()
export class MentoringComplaintService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: MentoringAccessService,
    private readonly history: MentoringHistoryService,
    private readonly sla: MentoringSlaService,
  ) {}

  private get db() {
    return this.prisma as unknown as PrismaTxClient;
  }

  private async tz(db: PrismaTxClient, now: Date) {
    return (await this.sla.workingNow(db, now)).timeZone;
  }

  // ─── Who may do what ───────────────────────────────────────────────────────────────────────────────────────────
  /** Handling needs the complaint permission, and then being the student's Mentor, the person it is assigned to, or the Mentoring Head. */
  private canHandle(scope: MentoringScope, complaint: Pick<ComplaintRow, 'assignedToUserId'>, activation: Pick<Activation, 'currentMentorUserId'>) {
    if (!scope.perms.has(HANDLE)) return false;
    return complaint.assignedToUserId === scope.userId || activation.currentMentorUserId === scope.userId || scope.perms.has('mentoring.allocation.manage');
  }

  private async visibleActivationIds(db: PrismaTxClient, scope: MentoringScope): Promise<string[] | null> {
    this.access.requireAnyScope(scope);
    if (scope.all) return null;
    return (await db.mentoringActivation.findMany({ where: this.access.visibilityWhere(scope) })).map((a) => a.id);
  }

  private async load(tx: PrismaTxClient, id: string) {
    const found = (await tx.mentoringComplaint.findUnique({ where: { id } }));
    if (!found) throw new NotFoundException('Complaint not found');
    return found;
  }

  /** The complaint with the student's workflow locked, after checking the caller may handle it. */
  private async handler(tx: PrismaTxClient, id: string, userId: string) {
    const found = await this.load(tx, id);
    const activation = (await loadLockedActivation(tx, found.activationId)) as unknown as Activation;
    const scope = await this.access.scopeFor(userId);
    if (!this.canHandle(scope, found, activation)) throw new ForbiddenException('You are not the Mentor or the staff member handling this complaint.');
    const complaint = await this.load(tx, id);
    return { complaint, activation };
  }

  private async entry(tx: PrismaTxClient, complaintId: string, kind: EntryKind, visibility: 'INTERNAL' | 'PARENT', text: string | null, actorUserId: string | null, payload?: Record<string, unknown>) {
    await tx.mentoringComplaintEntry.create({ data: { complaintId, kind, visibility, text, actorUserId, payload: (payload ?? undefined) as never } });
  }

  private async notify(tx: PrismaTxClient, recipient: string | null, type: string, complaint: ComplaintRow, message: string) {
    if (!recipient) return;
    const n = (await tx.mentoringComplaintEntry.findMany({ where: { complaintId: complaint.id } })).length;
    await tx.notification.create({ data: { recipientUserId: recipient, type, entityType: ENTITY, entityId: complaint.id, action: `/mentoring/students/${complaint.activationId}`, message, dedupeKey: `complaint:${complaint.id}:${n}:${type}` } });
  }

  private async studentSubjects(tx: PrismaTxClient, handoverId: string | null) {
    const field = handoverId ? await tx.enrollmentHandoverField.findUnique({ where: { handoverId_fieldKey: { handoverId, fieldKey: 'timetable.schedule' } } }) : null;
    return isScheduleValue(field?.value) ? field.value.subjects.map((s) => s.subjectId) : [];
  }

  private async openClock(tx: PrismaTxClient, id: string) {
    return tx.mentoringSlaItem.findFirst({ where: { currentKey: `${POLICY}:${ENTITY}:${id}` } });
  }

  // ─── Reading ───────────────────────────────────────────────────────────────────────────────────────────────────
  private async ackViews(db: PrismaTxClient, rows: ComplaintRow[], now: Date): Promise<Map<string, AckView>> {
    const out = new Map<string, AckView>();
    if (rows.length === 0) return out;
    const items = await db.mentoringSlaItem.findMany({ where: { policyKey: POLICY, entityType: ENTITY, entityId: { in: rows.map((r) => r.id) } } });
    const policy = await this.sla.policyFor(db, POLICY).catch(() => null);
    const working = await this.sla.workingNow(db, now);
    for (const r of rows) {
      const item = items.filter((i) => i.entityId === r.id).sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime())[0];
      const view = item && policy ? slaView({ status: item.status, startedAt: item.startedAt, dueAt: item.dueAt, firstResponseAt: item.firstResponseAt, completedAt: item.completedAt }, policy, working, now) : null;
      out.set(r.id, {
        startedAt: (item?.startedAt ?? r.receivedAt).toISOString(), dueAt: item?.dueAt.toISOString() ?? null, acknowledgedAt: r.acknowledgedAt?.toISOString() ?? null, firstResponseAt: (item?.firstResponseAt ?? r.firstResponseAt)?.toISOString() ?? null,
        state: view?.state ?? null, stateLabel: view?.label ?? null, metSla: view?.metSla ?? null, overdueMinutes: view?.overdueMinutes ?? 0, remainingMinutes: view?.remainingMinutes ?? 0,
        target: policy ? { label: policy.label, targetMinutes: policy.targetMinutes, mode: policy.mode } : null,
      });
    }
    return out;
  }

  private async names(db: PrismaTxClient, ids: Array<string | null | undefined>) {
    const wanted = [...new Set(ids.filter((i): i is string => !!i))];
    const out = new Map<string, string>();
    if (wanted.length) for (const e of await db.employee.findMany({ where: { userId: { in: wanted } } })) out.set(e.userId, `${e.firstName} ${e.lastName}`.trim());
    return out;
  }

  private async rowsOf(db: PrismaTxClient, rows: ComplaintRow[], now: Date): Promise<ComplaintView[]> {
    const acks = await this.ackViews(db, rows, now);
    const people = await this.names(db, rows.map((r) => r.assignedToUserId));
    const activations = rows.length ? await db.mentoringActivation.findMany({ where: { id: { in: [...new Set(rows.map((r) => r.activationId))] } } }) : [];
    const students = activations.length ? await db.student.findMany({ where: { id: { in: activations.map((a) => a.studentId) } } }) : [];
    return rows.map((r) => {
      const status = r.status as Status;
      const student = students.find((s) => s.id === activations.find((a) => a.id === r.activationId)?.studentId);
      return {
        id: r.id, number: `CMP-${r.id.slice(0, 8).toUpperCase()}`, title: r.title, category: r.category as Category, categoryLabel: CATEGORY_LABELS[r.category as Category] ?? r.category, priority: r.priority as Priority, priorityLabel: PRIORITY_LABELS[r.priority as Priority] ?? r.priority,
        activationId: r.activationId, studentName: student ? `${student.firstName} ${student.lastName ?? ''}`.trim() : 'Student', parentName: r.parentName, status, statusLabel: STATUS_LABELS[status], stage: stageOf(status), stageLabel: STAGE_LABELS[stageOf(status)],
        assignedToUserId: r.assignedToUserId, assignedToName: r.assignedToUserId ? people.get(r.assignedToUserId) ?? null : null, receivedAt: r.receivedAt.toISOString(), ack: acks.get(r.id) as AckView,
        resolutionMinutes: resolutionMinutes(r.receivedAt, r.resolvedAt), reopenCount: r.reopenCount,
      };
    });
  }

  /** Complaints the caller may see, filtered in the database query and then by the SLA state, which needs the clock. Open work comes first. */
  async list(scope: MentoringScope, f: ComplaintFilters = {}, now: Date = new Date()) {
    const db = this.db;
    const bad = (m: string) => new BadRequestException(m);
    if (f.status !== undefined && !(STATUSES as readonly string[]).includes(f.status)) throw bad('Choose a real status.');
    if (f.stage !== undefined && !(STAGE_FILTERS as readonly string[]).includes(f.stage)) throw bad('Choose started, ongoing or resolved.');
    if (f.category !== undefined && !(CATEGORIES as readonly string[]).includes(f.category)) throw bad('Choose a real category.');
    if (f.priority !== undefined && !(PRIORITIES as readonly string[]).includes(f.priority)) throw bad('Choose low, normal, high or urgent.');
    if (f.sla !== undefined && !(SLA_FILTERS as readonly string[]).includes(f.sla)) throw bad('Choose within SLA, approaching, breached or resolved.');
    for (const d of [f.from, f.to]) if (d !== undefined && !isDateString(d)) throw bad('Choose real dates, written like 2026-11-10.');
    const limit = Math.min(200, Math.max(1, Number(f.limit ?? 100) || 100));

    const visible = await this.visibleActivationIds(db, scope);
    const and: Array<Record<string, unknown>> = [];
    if (visible !== null) and.push({ OR: [{ activationId: { in: visible } }, { assignedToUserId: scope.userId }] });
    if (f.activationId) and.push({ activationId: f.activationId });
    if (f.category) and.push({ category: f.category });
    if (f.priority) and.push({ priority: f.priority });
    if (f.mine === true || f.mine === 'true') and.push({ assignedToUserId: scope.userId });
    else if (f.assignedToUserId) and.push({ assignedToUserId: f.assignedToUserId });
    if (f.from || f.to) and.push({ receivedAt: { ...(f.from ? { gte: asDate(f.from) } : {}), ...(f.to ? { lte: new Date(`${f.to}T23:59:59Z`) } : {}) } });
    const rows = (await db.mentoringComplaint.findMany({ where: and.length ? { AND: and } : {}, orderBy: { receivedAt: 'asc' } }));
    const views = await this.rowsOf(db, rows.slice(0, MAX_ROWS), now);

    const counts = { STARTED: 0, ONGOING: 0, RESOLVED: 0, new: 0, WITHIN_SLA: 0, APPROACHING: 0, BREACHED: 0, SLA_RESOLVED: 0 };
    for (const v of views) {
      counts[v.stage] += 1;
      if (v.status === 'NEW') counts.new += 1;
      if (v.ack.state === 'WITHIN_SLA') counts.WITHIN_SLA += 1;
      else if (v.ack.state === 'APPROACHING') counts.APPROACHING += 1;
      else if (v.ack.state === 'BREACHED') counts.BREACHED += 1;
      else if (v.ack.state === 'RESOLVED') counts.SLA_RESOLVED += 1;
    }
    const shown = views
      .filter((v) => (!f.status || v.status === f.status) && (!f.stage || v.stage === f.stage) && (!f.sla || v.ack.state === f.sla))
      .sort((a, b) => Number(a.stage === 'RESOLVED') - Number(b.stage === 'RESOLVED') || PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority] || a.receivedAt.localeCompare(b.receivedAt))
      .slice(0, limit);
    return { rows: shown, counts, canLog: scope.perms.has(HANDLE) };
  }

  /** One complaint with everything recorded on it, and what the caller may do next. */
  async detail(id: string, scope: MentoringScope, now: Date = new Date()): Promise<ComplaintDetail> {
    const db = this.db;
    const found = (await db.mentoringComplaint.findUnique({ where: { id } }));
    if (!found) throw new NotFoundException('Complaint not found');
    const visible = await this.visibleActivationIds(db, scope);
    if (visible !== null && !visible.includes(found.activationId) && found.assignedToUserId !== scope.userId) throw new NotFoundException('Complaint not found');
    const activation = (await db.mentoringActivation.findUnique({ where: { id: found.activationId } })) as unknown as Activation;
    const [view] = await this.rowsOf(db, [found], now);
    const entries = (await db.mentoringComplaintEntry.findMany({ where: { complaintId: id } })).sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
    const people = await this.names(db, [found.loggedByUserId, found.acknowledgedByUserId, found.resolvedByUserId, found.tutorUserId, ...entries.map((e) => e.actorUserId)]);
    const subject = found.subjectId ? await db.subject.findUnique({ where: { id: found.subjectId } }) : null;
    const status = found.status as Status;
    const mine = this.canHandle(scope, found, activation);
    const reopenBlock = status === 'RESOLVED' ? reopenProblem(found.resolvedAt, now) : 'Only a resolved complaint can be reopened.';
    const asEntries: Entry[] = entries.map((e) => ({ kind: e.kind as EntryKind, visibility: e.visibility as 'INTERNAL' | 'PARENT', text: e.text, at: e.createdAt.toISOString(), by: e.actorUserId ? people.get(e.actorUserId) ?? null : null }));
    const ackDone = found.acknowledgedAt !== null;
    return {
      ...view,
      description: found.description, channel: found.channel as Channel, channelLabel: CHANNEL_LABELS[found.channel as Channel] ?? found.channel, supportingNote: found.supportingNote, subjectName: subject?.name ?? null,
      tutorName: found.tutorUserId ? people.get(found.tutorUserId) ?? null : null, loggedAt: found.loggedAt.toISOString(), loggedByName: people.get(found.loggedByUserId) ?? null,
      acknowledged: found.acknowledgedAt ? { at: found.acknowledgedAt.toISOString(), byName: found.acknowledgedByUserId ? people.get(found.acknowledgedByUserId) ?? null : null, channelLabel: found.acknowledgedChannel ? CHANNEL_LABELS[found.acknowledgedChannel as Channel] ?? null : null, note: found.acknowledgedNote } : null,
      resolution: found.resolvedAt ? {
        resolvedAt: found.resolvedAt.toISOString(), resolvedByName: found.resolvedByUserId ? people.get(found.resolvedByUserId) ?? null : null, date: dayOf(found.resolutionDate), remarks: found.resolutionRemarks, how: found.resolutionHow,
        communication: found.parentCommunication as Communication | null, communicationLabel: found.parentCommunication ? COMMUNICATION_LABELS[found.parentCommunication as Communication] : null, communicationNote: found.parentCommunicationNote, minutes: resolutionMinutes(found.receivedAt, found.resolvedAt),
      } : null,
      resolutionNote: RESOLUTION_NOTE,
      entries: asEntries,
      parentView: { stage: view.stage, stageLabel: view.stageLabel, title: found.title, categoryLabel: view.categoryLabel, history: parentHistory(asEntries).map((e) => ({ kind: e.kind, text: e.text, at: e.at, by: e.by })), note: PARENT_NOTE },
      actions: {
        canHandle: mine, canAcknowledge: mine && !ackDone && status !== 'RESOLVED', canRespond: mine && ackDone, canAssign: mine && status !== 'RESOLVED', canSetStatus: mine && ackDone && status !== 'RESOLVED',
        canResolve: mine && ackDone && status !== 'RESOLVED', canReopen: mine && status === 'RESOLVED' && reopenBlock === null, reopenProblem: status === 'RESOLVED' ? reopenBlock : null,
      },
    };
  }

  /** Staff a complaint can be assigned or escalated to: people who really hold the complaint permission. */
  async handlers(scope: MentoringScope) {
    this.access.requireAnyScope(scope);
    const db = this.db;
    const ids = new Set<string>();
    for (const p of await db.mentoringStaffProfile.findMany({ where: { role: 'MENTOR', isActive: true } })) ids.add(p.userId);
    const heads = await db.role.findMany({ where: { code: 'MENTORING_HEAD' } });
    if (heads.length) for (const r of await db.userRole.findMany({ where: { roleId: { in: heads.map((h) => h.id) } } })) ids.add(r.userId);
    const out: Array<{ userId: string; name: string }> = [];
    const names = await this.names(db, [...ids]);
    for (const userId of ids) {
      if ((await this.access.scopeFor(userId)).perms.has(HANDLE) && names.has(userId)) out.push({ userId, name: names.get(userId) as string });
    }
    return out.sort((a, b) => a.name.localeCompare(b.name));
  }

  // ─── Logging ───────────────────────────────────────────────────────────────────────────────────────────────────
  /** Logs a complaint for the parent. The acknowledgement clock starts from the time the parent made it. */
  async create(activationId: string, body: unknown, userId: string, now: Date = new Date()) {
    return this.prisma.$transaction(async (tx: PrismaTxClient) => {
      const activation = (await loadLockedActivation(tx, activationId)) as unknown as Activation;
      const scope = await this.access.scopeFor(userId);
      if (!this.canHandle(scope, { assignedToUserId: null }, activation)) throw new ForbiddenException('Only the assigned Mentor or the Mentoring Head can log a complaint for this student.');
      const checked = checkComplaint(body, now);
      if (!checked.ok) throw new BadRequestException(checked.message);
      const v = checked.value;
      if (v.subjectId && !(await this.studentSubjects(tx, activation.handoverId)).includes(v.subjectId)) throw new BadRequestException("This subject is not in the student's saved schedule.");
      if (v.tutorUserId) {
        const assignments = await tx.mentoringTutorAssignment.findMany({ where: { activationId, status: { in: ['ACTIVE', 'NEEDS_REVIEW'] } } });
        const tutors = new Set<string>();
        for (const a of assignments.filter((x) => !v.subjectId || x.subjectId === v.subjectId)) {
          const profile = await tx.tutorProfile.findUnique({ where: { id: a.tutorProfileId } });
          const e = profile ? await tx.employee.findUnique({ where: { id: profile.employeeId } }) : null;
          if (e) tutors.add(e.userId);
        }
        if (!tutors.has(v.tutorUserId)) throw new BadRequestException("That tutor does not teach this student, or does not teach the chosen subject.");
      }
      const assignedTo = activation.currentMentorUserId ?? userId;
      const complaint = (await tx.mentoringComplaint.create({
        data: {
          activationId, title: v.title, category: v.category, description: v.description, priority: v.priority, channel: v.channel, parentName: v.parentName, receivedAt: v.receivedAt, loggedAt: now, loggedByUserId: userId,
          subjectId: v.subjectId, tutorUserId: v.tutorUserId, supportingNote: v.supportingNote, status: 'NEW', assignedToUserId: assignedTo, assignedAt: now,
        },
      }));
      const clock = await this.sla.start(tx, { policyKey: POLICY, entityType: ENTITY, entityId: complaint.id, activationId, responsibleUserId: assignedTo, startedAt: v.receivedAt });
      await this.entry(tx, complaint.id, 'LOGGED', 'PARENT', `Complaint recorded: ${v.title}`, userId, { channel: v.channel, parentName: v.parentName, receivedAt: v.receivedAt.toISOString() });
      if (assignedTo !== userId) await this.notify(tx, assignedTo, 'MENTORING_COMPLAINT_LOGGED', complaint, `A complaint was logged for your student: ${v.title}. Acknowledge it by ${clock.dueAt.toISOString().slice(0, 16).replace('T', ' ')} UTC.`);
      await this.history.record(tx, { activationId, type: 'MENTORING_COMPLAINT_LOGGED', actorUserId: userId, payload: { complaintId: complaint.id, category: v.category, priority: v.priority } });
      return { complaintId: complaint.id, number: `CMP-${complaint.id.slice(0, 8).toUpperCase()}`, acknowledgeBy: clock.dueAt.toISOString() };
    });
  }

  // ─── Working a complaint ───────────────────────────────────────────────────────────────────────────────────────
  /** Tells the parent the complaint was received. This stops the acknowledgement clock, on time or late. */
  async acknowledge(id: string, body: unknown, userId: string, now: Date = new Date()) {
    return this.prisma.$transaction(async (tx: PrismaTxClient) => {
      const { complaint } = await this.handler(tx, id, userId);
      if (complaint.status === 'RESOLVED') throw new ConflictException('This complaint is resolved. Reopen it first.');
      if (complaint.acknowledgedAt) throw new ConflictException('This complaint has already been acknowledged.');
      const checked = checkAcknowledge(body);
      if (!checked.ok) throw new BadRequestException(checked.message);
      const a = checked.value;
      await tx.mentoringComplaint.update({ where: { id }, data: { acknowledgedAt: now, acknowledgedByUserId: userId, acknowledgedChannel: a.channel, acknowledgedNote: a.note, firstResponseAt: complaint.firstResponseAt ?? now, status: complaint.status === 'NEW' ? 'ACKNOWLEDGED' : complaint.status } });
      await this.sla.respond(tx, POLICY, ENTITY, id, now);
      await this.entry(tx, id, 'ACKNOWLEDGED', 'PARENT', `Acknowledged by ${CHANNEL_LABELS[a.channel].toLowerCase()}${a.note ? `. ${a.note}` : ''}`, userId, { channel: a.channel });
      const ack = (await this.ackViews(tx, [complaint], now)).get(id) as AckView;
      return { complaintId: id, state: ack.state, stateLabel: ack.stateLabel, metSla: ack.metSla, overdueMinutes: ack.overdueMinutes };
    });
  }

  private async write(id: string, kind: EntryKind, visibility: 'INTERNAL' | 'PARENT', body: unknown, label: string, userId: string, opts: { needsAck: boolean; respond: boolean; now: Date }) {
    return this.prisma.$transaction(async (tx: PrismaTxClient) => {
      const { complaint } = await this.handler(tx, id, userId);
      if (opts.needsAck && !complaint.acknowledgedAt) throw new ConflictException('Acknowledge the complaint first.');
      const checked = checkText(body, label);
      if (!checked.ok) throw new BadRequestException(checked.message);
      await this.entry(tx, id, kind, visibility, checked.value, userId, body && typeof (body as Record<string, unknown>).channel === 'string' ? { channel: (body as Record<string, unknown>).channel } : undefined);
      if (opts.respond) await this.sla.respond(tx, POLICY, ENTITY, id, opts.now);
      if (opts.respond && !complaint.firstResponseAt) await tx.mentoringComplaint.update({ where: { id }, data: { firstResponseAt: opts.now } });
      return { complaintId: id };
    });
  }

  /** An internal remark. Never shown to the parent. */
  addRemark(id: string, body: unknown, userId: string, now: Date = new Date()) {
    return this.write(id, 'INTERNAL_REMARK', 'INTERNAL', body, 'remark', userId, { needsAck: false, respond: false, now });
  }

  /** An action taken on the complaint. Internal. */
  addAction(id: string, body: unknown, userId: string, now: Date = new Date()) {
    return this.write(id, 'ACTION_TAKEN', 'INTERNAL', body, 'action taken', userId, { needsAck: false, respond: false, now });
  }

  /** A response meant for the parent. It is the parent's communication history, and counts as a response for the clock. */
  respondToParent(id: string, body: unknown, userId: string, now: Date = new Date()) {
    return this.write(id, 'PARENT_RESPONSE', 'PARENT', body, 'response to the parent', userId, { needsAck: true, respond: true, now });
  }

  /** What the parent said to the Mentor after the complaint, written down by the Mentor. It is part of the communication history. */
  recordParentMessage(id: string, body: unknown, userId: string, now: Date = new Date()) {
    return this.write(id, 'PARENT_MESSAGE', 'PARENT', body, "parent's message", userId, { needsAck: false, respond: false, now });
  }

  /** Assigns the complaint to a staff member who holds the complaint permission, or escalates it to them with a reason. */
  async assign(id: string, body: unknown, userId: string, now: Date = new Date()) {
    return this.prisma.$transaction(async (tx: PrismaTxClient) => {
      const { complaint } = await this.handler(tx, id, userId);
      if (complaint.status === 'RESOLVED') throw new ConflictException('This complaint is resolved. Reopen it first.');
      const checked = checkAssign(body);
      if (!checked.ok) throw new BadRequestException(checked.message);
      const a = checked.value;
      if (a.userId === complaint.assignedToUserId) throw new ConflictException('The complaint is already assigned to that person.');
      const target = await this.access.scopeFor(a.userId);
      const employee = await tx.employee.findUnique({ where: { userId: a.userId } });
      if (!target.perms.has(HANDLE) || !employee || employee.employmentStatus !== 'ACTIVE') throw new BadRequestException('That person is not an authorized staff member for complaints.');
      const status = complaint.status === 'NEW' || complaint.status === 'ACKNOWLEDGED' ? 'ASSIGNED' : complaint.status;
      await tx.mentoringComplaint.update({ where: { id }, data: { assignedToUserId: a.userId, assignedAt: now, status, ...(a.escalate ? { escalatedAt: now } : {}) } });
      const clock = await this.openClock(tx, id);
      if (clock) await tx.mentoringSlaItem.update({ where: { id: clock.id }, data: { responsibleUserId: a.userId } });
      const name = `${employee.firstName} ${employee.lastName}`.trim();
      await this.entry(tx, id, a.escalate ? 'ESCALATED' : 'ASSIGNED', 'INTERNAL', `${a.escalate ? 'Escalated' : 'Assigned'} to ${name}${a.reason ? `. ${a.reason}` : ''}`, userId, { toUserId: a.userId, fromUserId: complaint.assignedToUserId, escalate: a.escalate });
      await this.notify(tx, a.userId, a.escalate ? 'MENTORING_COMPLAINT_ESCALATED' : 'MENTORING_COMPLAINT_ASSIGNED', complaint, `${a.escalate ? 'A complaint was escalated to you' : 'A complaint was assigned to you'}: ${complaint.title}.${a.reason ? ` ${a.reason}` : ''}`);
      await this.history.record(tx, { activationId: complaint.activationId, type: a.escalate ? 'MENTORING_COMPLAINT_ESCALATED' : 'MENTORING_COMPLAINT_ASSIGNED', actorUserId: userId, reason: a.reason, payload: { complaintId: id, toUserId: a.userId } });
      return { complaintId: id, assignedToUserId: a.userId, assignedToName: name, escalated: a.escalate };
    });
  }

  /** Moves the complaint between in progress and the two waiting statuses. The parent is told only when it passes from started to ongoing. */
  async setStatus(id: string, body: unknown, userId: string) {
    return this.prisma.$transaction(async (tx: PrismaTxClient) => {
      const { complaint } = await this.handler(tx, id, userId);
      if (complaint.status === 'RESOLVED') throw new ConflictException('This complaint is resolved. Reopen it first.');
      if (!complaint.acknowledgedAt) throw new ConflictException('Acknowledge the complaint first.');
      const checked = checkStatus(body);
      if (!checked.ok) throw new BadRequestException(checked.message);
      const to = checked.value.status;
      if (to === complaint.status) throw new ConflictException('The complaint already has that status.');
      const stageChanged = stageOf(complaint.status as Status) !== stageOf(to);
      await tx.mentoringComplaint.update({ where: { id }, data: { status: to } });
      await this.entry(tx, id, 'STATUS_CHANGED', stageChanged ? 'PARENT' : 'INTERNAL', stageChanged ? `Status: ${STAGE_LABELS[stageOf(to)]}` : `Status changed to ${STATUS_LABELS[to].toLowerCase()}`, userId, { from: complaint.status, to });
      if (checked.value.note) await this.entry(tx, id, 'INTERNAL_REMARK', 'INTERNAL', checked.value.note, userId);
      return { complaintId: id, status: to };
    });
  }

  // ─── Resolving and reopening ───────────────────────────────────────────────────────────────────────────────────
  /** Resolves the complaint. It needs the explanation, the date and whether the parent was told. It stops the clock if nothing did before. */
  async resolve(id: string, body: unknown, userId: string, now: Date = new Date()) {
    return this.prisma.$transaction(async (tx: PrismaTxClient) => {
      const { complaint } = await this.handler(tx, id, userId);
      if (complaint.status === 'RESOLVED') throw new ConflictException('This complaint is already resolved.');
      if (!complaint.acknowledgedAt) throw new ConflictException('Acknowledge the complaint first.');
      const tz = await this.tz(tx, now);
      const checked = checkResolution(body, localMomentOf(now, tz).date, localMomentOf(complaint.receivedAt, tz).date);
      if (!checked.ok) throw new BadRequestException(checked.message);
      const r = checked.value;
      await tx.mentoringComplaint.update({
        where: { id },
        data: { status: 'RESOLVED', resolvedAt: now, resolvedByUserId: userId, resolutionDate: asDate(r.resolutionDate), resolutionRemarks: r.remarks, resolutionHow: r.how, parentCommunication: r.communication, parentCommunicationNote: r.communicationNote },
      });
      await this.sla.complete(tx, POLICY, ENTITY, id, now);
      const minutes = resolutionMinutes(complaint.receivedAt, now);
      await this.entry(tx, id, 'RESOLVED', 'PARENT', `Resolved: ${r.how}`, userId, { remarks: r.remarks, how: r.how, resolutionDate: r.resolutionDate, communication: r.communication, communicationNote: r.communicationNote, resolutionMinutes: minutes });
      await this.history.record(tx, { activationId: complaint.activationId, type: 'MENTORING_COMPLAINT_RESOLVED', actorUserId: userId, payload: { complaintId: id, resolutionMinutes: minutes } });
      return { complaintId: id, resolutionMinutes: minutes };
    });
  }

  /** Reopens a complaint resolved in the last thirty days, with a reason. The history is kept, and a new response clock starts. */
  async reopen(id: string, body: unknown, userId: string, now: Date = new Date()) {
    return this.prisma.$transaction(async (tx: PrismaTxClient) => {
      const { complaint } = await this.handler(tx, id, userId);
      const blocked = complaint.status === 'RESOLVED' ? reopenProblem(complaint.resolvedAt, now) : 'Only a resolved complaint can be reopened.';
      if (blocked) throw new ConflictException(blocked);
      const checked = checkReopen(body);
      if (!checked.ok) throw new BadRequestException(checked.message);
      await tx.mentoringComplaint.update({
        where: { id },
        data: { status: 'REOPENED', reopenCount: complaint.reopenCount + 1, lastReopenedAt: now, resolvedAt: null, resolvedByUserId: null, resolutionDate: null, resolutionRemarks: null, resolutionHow: null, parentCommunication: null, parentCommunicationNote: null },
      });
      await this.sla.start(tx, { policyKey: POLICY, entityType: ENTITY, entityId: id, activationId: complaint.activationId, responsibleUserId: complaint.assignedToUserId, startedAt: now });
      await this.entry(tx, id, 'REOPENED', 'PARENT', 'The complaint was reopened for further action', userId, { reason: checked.value, previousResolvedAt: complaint.resolvedAt?.toISOString() ?? null });
      await this.entry(tx, id, 'INTERNAL_REMARK', 'INTERNAL', `Reopened: ${checked.value}`, userId);
      await this.notify(tx, complaint.assignedToUserId, 'MENTORING_COMPLAINT_REOPENED', complaint, `A complaint was reopened: ${complaint.title}. Reason: ${checked.value}`);
      await this.history.record(tx, { activationId: complaint.activationId, type: 'MENTORING_COMPLAINT_REOPENED', actorUserId: userId, reason: checked.value, payload: { complaintId: id } });
      return { complaintId: id, reopenCount: complaint.reopenCount + 1 };
    });
  }
}
