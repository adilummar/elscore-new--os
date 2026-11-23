import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { AuditService } from '../../../common/audit/audit.service';
import { PrismaService, PrismaTxClient } from '../../../common/prisma/prisma.service';
import { RbacService } from '../../../common/rbac/rbac.service';
import { SESSION_CONDUCTOR_ROLES } from '../coordination/coordination-rules';

import {
  AddParticipantsDto,
  CorrectAttemptDto,
  CreateTrainingSessionDto,
  ListSessionsQueryDto,
  ListTraineesQueryDto,
  RecordAttemptDto,
  RescheduleTrainingSessionDto,
} from './training.dto';
import {
  assertValidResult,
  EnrolmentProgress,
  isPass,
  participantBlocker,
  TrainingAttendance,
  TrainingRuleError,
  traineeStage,
} from './training-rules';

export const TRAINING_OVERRIDE_PERMISSION = 'tutor_training.override';
/** Small allowance for clock drift between the browser and the server. */
const CLOCK_SKEW_MS = 5 * 60_000;
const DEFAULT_LOOKBACK_DAYS = 30;

const userSelect = { select: { id: true, email: true } } as const;
const leadSelect = {
  select: {
    id: true, businessId: true, firstName: true, lastName: true, phone: true, email: true,
    tutorProfile: { select: { id: true, tutorCode: true } },
  },
} as const;

@Injectable()
export class TrainingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly rbac: RbacService,
  ) {}

  // ── Helpers ───────────────────────────────────────────────────────────────

  private rule<T>(fn: () => T): T {
    try {
      return fn();
    } catch (e) {
      if (e instanceof TrainingRuleError) throw new BadRequestException(e.message);
      throw e;
    }
  }

  private name(l: { firstName: string; lastName: string; businessId: string }) {
    return `${l.firstName} ${l.lastName}`.trim() || l.businessId;
  }

  /** Session 1: a Tutor Coordinator or the Tutor Head. Session 2: HR Manager or HR Executive. */
  private async assertConductor(userId: string, sessionNumber: number) {
    const roles = SESSION_CONDUCTOR_ROLES[sessionNumber] ?? [];
    const u = await this.prisma.user.findFirst({
      where: { id: userId, status: 'ACTIVE', userRoles: { some: { role: { code: { in: roles } } } } },
      select: { id: true },
    });
    if (!u) {
      throw new BadRequestException(sessionNumber === 1
        ? 'Session 1 is conducted by a Tutor Coordinator or the Tutor Head'
        : 'Session 2 is conducted by the HR Department (HR Manager or HR Executive)');
    }
  }

  /** Staff who may conduct a session with this number, for the scheduling form. */
  async conductors(sessionNumber: number) {
    const roles = SESSION_CONDUCTOR_ROLES[sessionNumber];
    if (!roles) throw new BadRequestException('Unknown session number');
    const users = await this.prisma.user.findMany({
      where: { status: 'ACTIVE', userRoles: { some: { role: { code: { in: roles } } } } },
      orderBy: { email: 'asc' },
      select: { id: true, email: true, employee: { select: { firstName: true, lastName: true } } },
    });
    return users.map((u) => ({ id: u.id, email: u.email, name: u.employee ? `${u.employee.firstName} ${u.employee.lastName}`.trim() : u.email }));
  }

  private progressOf(e: {
    session1PassedAt: Date | null; session2PassedAt: Date | null;
    attempts: Array<{ sessionNumber: number; attendance: TrainingAttendance | null }>;
  }): EnrolmentProgress {
    return {
      session1PassedAt: e.session1PassedAt,
      session2PassedAt: e.session2PassedAt,
      pendingSessions: [...new Set(e.attempts.filter((a) => a.attendance === null).map((a) => a.sessionNumber))],
    };
  }

  private async loadSession(id: string) {
    const s = await this.prisma.tutorTrainingSession.findUnique({ where: { id } });
    if (!s) throw new NotFoundException('Training session not found');
    return s;
  }

  private async loadAttempt(id: string) {
    const a = await this.prisma.tutorTrainingAttempt.findUnique({ where: { id }, include: { session: true, enrolment: true } });
    if (!a) throw new NotFoundException('Training attempt not found');
    return a;
  }

  /**
   * Recomputes "session N passed" from the attempts after a recording or correction:
   * passed at the earliest passing attempt, or not passed if none remains.
   */
  private async syncPassed(tx: PrismaTxClient, enrolmentId: string, sessionNumber: number) {
    const first = await tx.tutorTrainingAttempt.findFirst({
      where: { enrolmentId, sessionNumber, attendance: 'ATTENDED', taskCompleted: true },
      orderBy: { recordedAt: 'asc' },
      select: { recordedAt: true },
    });
    const field = sessionNumber === 1 ? 'session1PassedAt' : 'session2PassedAt';
    await tx.tutorTrainingEnrolment.update({ where: { id: enrolmentId }, data: { [field]: first?.recordedAt ?? null } });
    return first?.recordedAt ?? null;
  }

  // ── Sessions (Head of Tutor Management) ───────────────────────────────────

  async createSession(dto: CreateTrainingSessionDto, actorUserId: string) {
    const scheduledAt = new Date(dto.scheduledAt);
    if (scheduledAt.getTime() < Date.now() - CLOCK_SKEW_MS) throw new BadRequestException('A session cannot be scheduled in the past');
    await this.assertConductor(dto.conductorUserId, dto.sessionNumber);
    return this.prisma.$transaction(async (tx: PrismaTxClient) => {
      const s = await tx.tutorTrainingSession.create({
        data: { sessionNumber: dto.sessionNumber, scheduledAt, conductorUserId: dto.conductorUserId, createdByUserId: actorUserId },
      });
      await this.audit.recordInTx(tx, {
        entityType: 'TutorTrainingSession', entityId: s.id, action: 'TUTOR_TRAINING_SESSION_CREATED', actorUserId,
        newValue: { sessionNumber: s.sessionNumber, scheduledAt: scheduledAt.toISOString(), conductorUserId: s.conductorUserId },
      });
      return s;
    });
  }

  /** The earlier time and conductor are kept in history. Not allowed once attendance is recorded. */
  async rescheduleSession(id: string, dto: RescheduleTrainingSessionDto, actorUserId: string) {
    const s = await this.loadSession(id);
    const scheduledAt = new Date(dto.scheduledAt);
    if (scheduledAt.getTime() < Date.now() - CLOCK_SKEW_MS) throw new BadRequestException('A session cannot be moved to the past');
    const conductorUserId = dto.conductorUserId ?? s.conductorUserId;
    if (conductorUserId !== s.conductorUserId) await this.assertConductor(conductorUserId, s.sessionNumber);
    if (scheduledAt.getTime() === s.scheduledAt.getTime() && conductorUserId === s.conductorUserId) {
      throw new BadRequestException('Nothing changed');
    }
    const recorded = await this.prisma.tutorTrainingAttempt.count({ where: { sessionId: id, attendance: { not: null } } });
    if (recorded) throw new BadRequestException('Attendance is already recorded for this session; schedule a new session instead');

    return this.prisma.$transaction(async (tx: PrismaTxClient) => {
      const res = await tx.tutorTrainingSession.updateMany({
        where: { id, scheduledAt: s.scheduledAt, conductorUserId: s.conductorUserId },
        data: { scheduledAt, conductorUserId },
      });
      if (res.count !== 1) throw new ConflictException('Session changed; reload and retry');
      await tx.tutorTrainingSessionHistory.create({
        data: {
          sessionId: id, previousScheduledAt: s.scheduledAt, newScheduledAt: scheduledAt,
          previousConductorUserId: s.conductorUserId, newConductorUserId: conductorUserId,
          reason: dto.reason.trim(), changedByUserId: actorUserId,
        },
      });
      await this.audit.recordInTx(tx, {
        entityType: 'TutorTrainingSession', entityId: id, action: 'TUTOR_TRAINING_SESSION_RESCHEDULED', actorUserId, reason: dto.reason.trim(),
        oldValue: { scheduledAt: s.scheduledAt.toISOString(), conductorUserId: s.conductorUserId },
        newValue: { scheduledAt: scheduledAt.toISOString(), conductorUserId },
      });
      return { id, scheduledAt, conductorUserId };
    });
  }

  // ── Participants (HR Staff) ───────────────────────────────────────────────

  /** Adds Hired trainees to a session. A repeat of a failed session is simply another session. */
  async addParticipants(sessionId: string, dto: AddParticipantsDto, actorUserId: string) {
    const s = await this.loadSession(sessionId);
    const ids = [...new Set(dto.tutorLeadIds)];
    const enrolments = await this.prisma.tutorTrainingEnrolment.findMany({
      where: { tutorLeadId: { in: ids } },
      include: { attempts: { select: { sessionId: true, sessionNumber: true, attendance: true } }, tutorLead: leadSelect },
    });
    const byLead = new Map(enrolments.map((e) => [e.tutorLeadId, e]));
    const problems: string[] = [];
    for (const leadId of ids) {
      const e = byLead.get(leadId);
      if (!e) { problems.push(`${leadId}: not a Hired candidate in Training`); continue; }
      if (e.attempts.some((a) => a.sessionId === sessionId)) { problems.push(`${this.name(e.tutorLead)}: already in this session`); continue; }
      const why = participantBlocker(this.progressOf(e), s.sessionNumber);
      if (why) problems.push(`${this.name(e.tutorLead)}: ${why}`);
    }
    if (problems.length) {
      throw new BadRequestException({ message: `Nobody was added. ${problems.join('; ')}`, problems });
    }

    try {
      return await this.prisma.$transaction(async (tx: PrismaTxClient) => {
        const now = new Date();
        for (const leadId of ids) {
          const e = byLead.get(leadId)!;
          await tx.tutorTrainingAttempt.create({
            data: { enrolmentId: e.id, sessionId, sessionNumber: s.sessionNumber, addedByUserId: actorUserId, addedAt: now },
          });
          await this.audit.recordInTx(tx, {
            entityType: 'TutorLead', entityId: leadId, action: 'TUTOR_TRAINING_PARTICIPANT_ADDED', actorUserId,
            metadata: { sessionId, sessionNumber: s.sessionNumber },
          });
        }
        return { sessionId, added: ids.length };
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new ConflictException('A trainee was added to this session at the same time; reload and retry');
      }
      throw e;
    }
  }

  // ── Attendance (conductor; Head may override or correct) ──────────────────

  async recordAttempt(attemptId: string, dto: RecordAttemptDto, actorUserId: string) {
    const a = await this.loadAttempt(attemptId);
    const remarks = dto.remarks?.trim() || null;
    this.rule(() => assertValidResult({ ...dto, remarks }));
    const override = a.session.conductorUserId !== actorUserId;
    if (override && !(await this.rbac.hasPermissions(actorUserId, [TRAINING_OVERRIDE_PERMISSION]))) {
      throw new ForbiddenException('Only the session conductor can record attendance');
    }
    if (a.attendance !== null) throw new ConflictException('Attendance is already recorded and locked; the Head of Tutor Management can correct it');
    if (a.session.scheduledAt.getTime() > Date.now() + CLOCK_SKEW_MS) throw new BadRequestException('Attendance can be recorded once the session has started');

    const passed = isPass(dto);
    return this.prisma.$transaction(async (tx: PrismaTxClient) => {
      const now = new Date();
      const res = await tx.tutorTrainingAttempt.updateMany({
        where: { id: attemptId, attendance: null },
        data: { attendance: dto.attendance, taskCompleted: dto.taskCompleted, remarks, recordedByUserId: actorUserId, recordedAt: now },
      });
      if (res.count !== 1) throw new ConflictException('Attendance was recorded at the same time; reload');
      const passedAt = passed ? await this.syncPassed(tx, a.enrolmentId, a.sessionNumber) : null;
      await this.audit.recordInTx(tx, {
        entityType: 'TutorLead', entityId: a.enrolment.tutorLeadId, action: 'TUTOR_TRAINING_ATTENDANCE_RECORDED', actorUserId,
        newValue: { attemptId, sessionNumber: a.sessionNumber, attendance: dto.attendance, taskCompleted: dto.taskCompleted },
        reason: remarks ?? undefined,
        metadata: { override, passed },
      });
      return {
        id: attemptId, passed, passedAt,
        trainingCompleted: passed && a.sessionNumber === 2,
        repeatRequired: !passed,
      };
    });
  }

  /** Head-only correction. The previous values are kept; progress is recomputed from the attempts. */
  async correctAttempt(attemptId: string, dto: CorrectAttemptDto, actorUserId: string) {
    const a = await this.loadAttempt(attemptId);
    if (a.attendance === null || a.taskCompleted === null) throw new BadRequestException('Nothing to correct: attendance has not been recorded');
    const remarks = dto.remarks?.trim() || null;
    this.rule(() => assertValidResult({ ...dto, remarks }));
    if (a.attendance === dto.attendance && a.taskCompleted === dto.taskCompleted && (a.remarks ?? null) === remarks) {
      throw new BadRequestException('Nothing changed');
    }
    const wasPass = isPass(a);
    const nowPass = isPass(dto);
    if (a.sessionNumber === 1 && wasPass && !nowPass) {
      const otherPass = await this.prisma.tutorTrainingAttempt.count({
        where: { enrolmentId: a.enrolmentId, sessionNumber: 1, attendance: 'ATTENDED', taskCompleted: true, id: { not: attemptId } },
      });
      const session2 = await this.prisma.tutorTrainingAttempt.count({ where: { enrolmentId: a.enrolmentId, sessionNumber: 2 } });
      if (!otherPass && session2) {
        throw new BadRequestException('This trainee already has Session 2 attempts that depend on this pass; correct those first');
      }
    }

    return this.prisma.$transaction(async (tx: PrismaTxClient) => {
      const res = await tx.tutorTrainingAttempt.updateMany({
        where: { id: attemptId, attendance: a.attendance, taskCompleted: a.taskCompleted },
        data: { attendance: dto.attendance, taskCompleted: dto.taskCompleted, remarks },
      });
      if (res.count !== 1) throw new ConflictException('Attempt changed; reload and retry');
      await tx.tutorTrainingAttemptCorrection.create({
        data: {
          attemptId,
          previousAttendance: a.attendance!, previousTaskCompleted: a.taskCompleted!, previousRemarks: a.remarks,
          newAttendance: dto.attendance, newTaskCompleted: dto.taskCompleted, newRemarks: remarks,
          reason: dto.reason.trim(), correctedByUserId: actorUserId,
        },
      });
      const passedAt = wasPass !== nowPass ? await this.syncPassed(tx, a.enrolmentId, a.sessionNumber) : undefined;
      await this.audit.recordInTx(tx, {
        entityType: 'TutorLead', entityId: a.enrolment.tutorLeadId, action: 'TUTOR_TRAINING_ATTENDANCE_CORRECTED', actorUserId,
        reason: dto.reason.trim(),
        oldValue: { attendance: a.attendance, taskCompleted: a.taskCompleted, remarks: a.remarks },
        newValue: { attendance: dto.attendance, taskCompleted: dto.taskCompleted, remarks },
        metadata: { attemptId, sessionNumber: a.sessionNumber },
      });
      return { id: attemptId, passed: nowPass, ...(passedAt !== undefined ? { passedAt } : {}) };
    });
  }

  // ── Reads ─────────────────────────────────────────────────────────────────

  async listSessions(q: ListSessionsQueryDto) {
    const from = q.from ? new Date(q.from) : new Date(Date.now() - DEFAULT_LOOKBACK_DAYS * 86_400_000);
    const to = q.to ? new Date(new Date(q.to).getTime() + 86_400_000) : undefined;
    const rows = await this.prisma.tutorTrainingSession.findMany({
      where: { scheduledAt: { gte: from, ...(to ? { lt: to } : {}) }, ...(q.sessionNumber ? { sessionNumber: q.sessionNumber } : {}) },
      orderBy: { scheduledAt: 'asc' },
      take: 200,
      include: {
        conductor: userSelect,
        history: { orderBy: { changedAt: 'desc' }, include: { changedBy: userSelect } },
        attempts: {
          orderBy: { addedAt: 'asc' },
          include: {
            recordedBy: userSelect,
            corrections: { orderBy: { correctedAt: 'desc' }, include: { correctedBy: userSelect } },
            enrolment: { select: { id: true, tutorLead: leadSelect } },
          },
        },
      },
    });
    return rows.map((s) => ({
      ...s,
      participantCount: s.attempts.length,
      recordedCount: s.attempts.filter((a) => a.attendance !== null).length,
    }));
  }

  async listTrainees(q: ListTraineesQueryDto) {
    const rows = await this.prisma.tutorTrainingEnrolment.findMany({
      where: q.status === 'COMPLETED' ? { session2PassedAt: { not: null } } : q.status === 'IN_PROGRESS' ? { session2PassedAt: null } : {},
      orderBy: { enrolledAt: 'desc' },
      take: 500,
      include: {
        tutorLead: leadSelect,
        attempts: { orderBy: { addedAt: 'asc' }, include: { session: { select: { id: true, sessionNumber: true, scheduledAt: true } } } },
      },
    });
    const out = rows.map((e) => {
      const progress = this.progressOf(e);
      const failed = (n: number) => e.attempts.filter((a) => a.sessionNumber === n && a.attendance !== null && !isPass(a)).length;
      return {
        enrolmentId: e.id,
        candidate: { ...e.tutorLead, name: this.name(e.tutorLead) },
        enrolledAt: e.enrolledAt,
        session1PassedAt: e.session1PassedAt,
        session2PassedAt: e.session2PassedAt,
        stage: traineeStage(progress),
        tutorId: e.tutorLead.tutorProfile?.tutorCode ?? null,
        tutorProfileId: e.tutorLead.tutorProfile?.id ?? null,
        attempts: e.attempts.length,
        repeats: { session1: failed(1), session2: failed(2) },
        eligibleFor: [1, 2].filter((n) => participantBlocker(progress, n) === null),
      };
    });
    return q.eligibleFor ? out.filter((t) => t.eligibleFor.includes(q.eligibleFor!)) : out;
  }

  /** Full training history for one candidate (all attempts, corrections and session changes). */
  async traineeHistory(tutorLeadId: string) {
    const e = await this.prisma.tutorTrainingEnrolment.findUnique({
      where: { tutorLeadId },
      include: {
        tutorLead: leadSelect,
        enrolledBy: userSelect,
        attempts: {
          orderBy: { addedAt: 'asc' },
          include: {
            addedBy: userSelect,
            recordedBy: userSelect,
            corrections: { orderBy: { correctedAt: 'asc' }, include: { correctedBy: userSelect } },
            session: { include: { conductor: userSelect, history: { orderBy: { changedAt: 'asc' } } } },
          },
        },
      },
    });
    if (!e) return { enrolled: false as const };
    const progress = this.progressOf(e);
    return { enrolled: true as const, ...e, stage: traineeStage(progress), eligibleFor: [1, 2].filter((n) => participantBlocker(progress, n) === null) };
  }
}
