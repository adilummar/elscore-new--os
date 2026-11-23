import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { fromZonedTime, toZonedTime } from 'date-fns-tz';

import { AuditService } from '../../../common/audit/audit.service';
import { PrismaService, PrismaTxClient } from '../../../common/prisma/prisma.service';
import { RbacService } from '../../../common/rbac/rbac.service';

import { AssignCoordinatorDto, CoordinationQueryDto, HideObservationDto, ObservationDto } from './coordination.dto';
import {
  assertAssignable, assertAssignmentChange, assertObservation, assignmentKind, CoordinationRuleError, observationStatus,
} from './coordination-rules';

export const COORDINATION_MANAGE = 'tutor_coordination.manage';
export const COORDINATOR_ROLE = 'TUTOR_COORDINATOR';
const userSelect = { select: { id: true, email: true } } as const;

/** Shown wherever the requirements ask for data this branch does not have. */
export const NOT_AVAILABLE_YET = 'Not available yet';

/**
 * Tutor Coordination: coordinators see only their currently assigned tutors; the Head of Tutor
 * Management (tutor_coordination.manage) sees and manages everything.
 */
@Injectable()
export class CoordinationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly rbac: RbacService,
    private readonly config: ConfigService,
  ) {}

  private rule<T>(fn: () => T): T {
    try {
      return fn();
    } catch (e) {
      if (e instanceof CoordinationRuleError) throw new BadRequestException(e.message);
      throw e;
    }
  }

  isHead(userId: string) {
    return this.rbac.hasPermissions(userId, [COORDINATION_MANAGE]);
  }

  /** Current month in the business timezone, as UTC instants [start, end). */
  monthRange(now = new Date()) {
    const tz = this.config.get<string>('crm.businessTimezone') ?? 'Asia/Kolkata';
    const z = toZonedTime(now, tz);
    const first = `${z.getFullYear()}-${String(z.getMonth() + 1).padStart(2, '0')}-01`;
    const next = new Date(Date.UTC(z.getFullYear(), z.getMonth() + 1, 1)).toISOString().slice(0, 10);
    return { start: fromZonedTime(`${first}T00:00:00`, tz), end: fromZonedTime(`${next}T00:00:00`, tz), tz };
  }

  private name(e: { firstName: string; lastName: string }) {
    return `${e.firstName} ${e.lastName}`.trim();
  }

  /** Head: any tutor (optionally by coordinator). Coordinator: only tutors currently assigned to them. */
  private async scopeWhere(userId: string, coordinatorId?: string): Promise<{ where: Prisma.TutorProfileWhereInput; head: boolean }> {
    const head = await this.isHead(userId);
    const base: Prisma.TutorProfileWhereInput = { tutorCode: { not: null } };
    if (!head) {
      if (coordinatorId && coordinatorId !== userId) throw new ForbiddenException('The coordinator filter is for the Head of Tutor Management only');
      return { where: { ...base, coordinatorUserId: userId }, head };
    }
    if (coordinatorId === 'none') return { where: { ...base, coordinatorUserId: null }, head };
    return { where: { ...base, ...(coordinatorId ? { coordinatorUserId: coordinatorId } : {}) }, head };
  }

  private async assertCanSee(tutorProfileId: string, userId: string) {
    const t = await this.prisma.tutorProfile.findFirst({
      where: { id: tutorProfileId, tutorCode: { not: null } },
      select: { id: true, coordinatorUserId: true, tutorCode: true, tutorOperationalStatus: true, employee: { select: { firstName: true, lastName: true } } },
    });
    if (!t) throw new NotFoundException('Tutor not found');
    const head = await this.isHead(userId);
    if (!head && t.coordinatorUserId !== userId) throw new ForbiddenException('This tutor is not assigned to you');
    return { t, head };
  }

  // ── Lists and dashboards ──────────────────────────────────────────────────

  async listTutors(q: CoordinationQueryDto, userId: string, only?: Prisma.TutorProfileWhereInput) {
    const { where, head } = await this.scopeWhere(userId, q.coordinatorId);
    const and: Prisma.TutorProfileWhereInput[] = [where, ...(only ? [only] : [])];
    const s = q.search?.trim();
    if (s) {
      and.push({
        OR: [
          { tutorCode: { contains: s, mode: 'insensitive' } },
          { employee: { firstName: { contains: s, mode: 'insensitive' } } },
          { employee: { lastName: { contains: s, mode: 'insensitive' } } },
        ],
      });
    }
    if (q.subjectId) and.push({ subjects: { some: { subjectId: q.subjectId, isActive: true } } });
    if (q.gradeId) and.push({ grades: { some: { gradeId: q.gradeId, isActive: true } } });
    const { start, end, tz } = this.monthRange();
    if (q.joinedFrom || q.joinedTo) {
      and.push({
        verifiedAt: {
          ...(q.joinedFrom ? { gte: fromZonedTime(`${q.joinedFrom.slice(0, 10)}T00:00:00`, tz) } : {}),
          ...(q.joinedTo ? { lte: fromZonedTime(`${q.joinedTo.slice(0, 10)}T23:59:59.999`, tz) } : {}),
        },
      });
    }
    const rows = await this.prisma.tutorProfile.findMany({
      where: { AND: and },
      orderBy: { employee: { firstName: 'asc' } },
      take: 1000,
      select: {
        id: true, tutorCode: true, tutorOperationalStatus: true, verifiedAt: true, coordinatorAssignedAt: true,
        coordinator: userSelect,
        employee: { select: { firstName: true, lastName: true, phone: true, user: { select: { email: true } } } },
        subjects: { where: { isActive: true }, select: { subject: { select: { name: true } } } },
        grades: { where: { isActive: true }, select: { grade: { select: { name: true } } } },
        qualifications: { where: { isActive: true }, select: { name: true } },
        observations: { where: { hiddenAt: null }, orderBy: { observedAt: 'desc' }, take: 1, select: { observedAt: true } },
        _count: { select: { observations: { where: { hiddenAt: null, observedAt: { gte: start, lt: end } } } } },
      },
    });
    const now = new Date();
    const out = rows.map((r) => ({
      id: r.id,
      tutorId: r.tutorCode,
      name: this.name(r.employee),
      phone: r.employee.phone,
      email: r.employee.user.email,
      status: r.tutorOperationalStatus,
      subjects: r.subjects.map((x) => x.subject.name),
      grades: r.grades.map((x) => x.grade.name),
      qualifications: r.qualifications.map((x) => x.name),
      joinedAt: r.verifiedAt,
      // Class records on this branch are not linked to students; Mentoring owns that data.
      studentsPerGrade: NOT_AVAILABLE_YET,
      coordinator: r.coordinator,
      assignedAt: r.coordinatorAssignedAt,
      lastObservedAt: r.observations[0]?.observedAt ?? null,
      observationsThisMonth: r._count.observations,
      observationStatus: r.coordinator
        ? observationStatus({ observedThisMonth: r._count.observations, assignedAt: r.coordinatorAssignedAt, tutorStatus: r.tutorOperationalStatus, now })
        : null,
    }));
    const filtered = q.observationStatus ? out.filter((t) => t.observationStatus === q.observationStatus) : out;
    return { scope: head ? 'ALL' : 'OWN', data: filtered };
  }

  /** The five PDF metrics. Complaint metrics wait for the Mentoring branch. */
  async dashboard(q: CoordinationQueryDto, userId: string) {
    const { scope, data } = await this.listTutors({ coordinatorId: q.coordinatorId }, userId);
    const assigned = data.filter((t) => t.coordinator);
    const observed = assigned.filter((t) => t.observationStatus === 'OBSERVED').length;
    const metrics = {
      totalAssigned: assigned.length,
      observedThisMonth: observed,
      notYetObserved: assigned.length - observed,
      pendingComplaints: NOT_AVAILABLE_YET,
      complaintsAwaitingAction: NOT_AVAILABLE_YET,
    };
    if (scope !== 'ALL') return { scope, metrics };
    const byCoordinator = new Map<string, { coordinator: { id: string; email: string }; assigned: number; observed: number; pending: number; notObserved: number }>();
    for (const t of assigned) {
      const c = t.coordinator!;
      const e = byCoordinator.get(c.id) ?? { coordinator: c, assigned: 0, observed: 0, pending: 0, notObserved: 0 };
      e.assigned++;
      if (t.observationStatus === 'OBSERVED') e.observed++;
      else if (t.observationStatus === 'PENDING') e.pending++;
      else e.notObserved++;
      byCoordinator.set(c.id, e);
    }
    return {
      scope,
      metrics,
      unassigned: data.filter((t) => !t.coordinator && t.status !== 'DISCONTINUED').length,
      coordinators: [...byCoordinator.values()].map((c) => ({ ...c, coveragePercent: c.assigned ? Math.round((100 * c.observed) / c.assigned) : 0 })),
    };
  }

  async coordinators() {
    const users = await this.prisma.user.findMany({
      where: { status: 'ACTIVE', userRoles: { some: { role: { code: COORDINATOR_ROLE } } } },
      orderBy: { email: 'asc' },
      select: { id: true, email: true, employee: { select: { firstName: true, lastName: true } }, _count: { select: { tutorsCoordinated: true } } },
    });
    return users.map((u) => ({
      id: u.id, email: u.email, name: u.employee ? this.name(u.employee) : u.email, assignedTutors: u._count.tutorsCoordinated,
    }));
  }

  // ── Assignment (Head only) ────────────────────────────────────────────────

  async assign(dto: AssignCoordinatorDto, actorUserId: string) {
    const to = dto.coordinatorUserId;
    const reason = dto.reason?.trim() || null;
    if (to) {
      const ok = await this.prisma.user.findFirst({
        where: { id: to, status: 'ACTIVE', userRoles: { some: { role: { code: COORDINATOR_ROLE } } } }, select: { id: true },
      });
      if (!ok) throw new BadRequestException('Selected user is not an active Tutor Coordinator');
    }
    const ids = [...new Set(dto.tutorProfileIds)];
    const tutors = await this.prisma.tutorProfile.findMany({
      where: { id: { in: ids }, tutorCode: { not: null } },
      select: { id: true, tutorCode: true, coordinatorUserId: true, tutorOperationalStatus: true, employee: { select: { firstName: true, lastName: true } } },
    });
    if (tutors.length !== ids.length) throw new NotFoundException('One or more tutors were not found');
    const problems: string[] = [];
    for (const t of tutors) {
      try {
        assertAssignmentChange(t.coordinatorUserId, to, reason);
        if (to) assertAssignable(t.tutorOperationalStatus);
      } catch (e) {
        if (e instanceof CoordinationRuleError) problems.push(`${t.tutorCode}: ${e.message}`);
        else throw e;
      }
    }
    if (problems.length) throw new BadRequestException({ message: `Nothing was changed. ${problems.join('; ')}`, problems });

    const now = new Date();
    const changed = await this.prisma.$transaction(async (tx: PrismaTxClient) => {
      let notifications = 0;
      for (const t of tutors) {
        const from = t.coordinatorUserId;
        const res = await tx.tutorProfile.updateMany({
          where: { id: t.id, coordinatorUserId: from },
          data: { coordinatorUserId: to, coordinatorAssignedAt: to ? now : null },
        });
        if (res.count !== 1) throw new ConflictException('A tutor assignment changed at the same time; reload and retry');
        await tx.tutorCoordinatorAssignment.create({
          data: { tutorProfileId: t.id, fromUserId: from, toUserId: to, reason, changedByUserId: actorUserId, changedAt: now },
        });
        const kind = assignmentKind(from, to);
        const label = `${this.name(t.employee) || t.tutorCode} (${t.tutorCode})`;
        const link = `/tutor-hr/coordination/${t.id}`;
        // In-OS notifications: the new coordinator on assignment; previous and new on reassignment;
        // the previous coordinator on unassignment.
        if (to) {
          await tx.notification.create({
            data: { recipientUserId: to, type: 'TUTOR_COORDINATOR_ASSIGNED', entityType: 'TutorProfile', entityId: t.id, action: link, message: `Tutor ${label} has been assigned to you.` },
          });
          notifications++;
        }
        if (from) {
          await tx.notification.create({
            data: {
              recipientUserId: from, type: kind === 'UNASSIGNED' ? 'TUTOR_COORDINATOR_UNASSIGNED' : 'TUTOR_COORDINATOR_REASSIGNED',
              entityType: 'TutorProfile', entityId: t.id, action: '/tutor-hr/coordination',
              message: kind === 'UNASSIGNED' ? `Tutor ${label} is no longer assigned to you.` : `Tutor ${label} has been reassigned to another coordinator.`,
            },
          });
          notifications++;
        }
        await this.audit.recordInTx(tx, {
          entityType: 'TutorProfile', entityId: t.id, action: `TUTOR_COORDINATOR_${kind}`, actorUserId, reason: reason ?? undefined,
          oldValue: { coordinatorUserId: from }, newValue: { coordinatorUserId: to },
        });
      }
      return { changed: tutors.length, notifications };
    });
    return changed;
  }

  // ── Tutor detail, observations ────────────────────────────────────────────

  async tutorDetail(tutorProfileId: string, userId: string) {
    const { head } = await this.assertCanSee(tutorProfileId, userId);
    const [list] = (await this.listTutors({}, userId, { id: tutorProfileId })).data;
    const [observations, history] = await Promise.all([this.observations(tutorProfileId, head), this.assignmentHistory(tutorProfileId)]);
    return { tutor: list ?? null, observations, assignmentHistory: history, canManage: head };
  }

  /** Visible observations; the Head also sees hidden ones and every revision. */
  observations(tutorProfileId: string, includeHidden: boolean) {
    return this.prisma.tutorObservation.findMany({
      where: { tutorProfileId, ...(includeHidden ? {} : { hiddenAt: null }) },
      orderBy: { observedAt: 'desc' },
      include: {
        author: userSelect,
        ...(includeHidden
          ? { hiddenBy: userSelect, revisions: { orderBy: { editedAt: 'desc' as const }, include: { editedBy: userSelect } } }
          : {}),
      },
    });
  }

  assignmentHistory(tutorProfileId: string) {
    return this.prisma.tutorCoordinatorAssignment.findMany({
      where: { tutorProfileId },
      orderBy: { changedAt: 'desc' },
      include: { from: userSelect, to: userSelect, changedBy: userSelect },
    });
  }

  /** HR read-only view for the tutor profile's Feedback & Observations tab. */
  async profileView(tutorProfileId: string) {
    const t = await this.prisma.tutorProfile.findFirst({
      where: { id: tutorProfileId, tutorCode: { not: null } }, select: { id: true, coordinator: userSelect, coordinatorAssignedAt: true },
    });
    if (!t) throw new NotFoundException('Tutor not found');
    const [observations, history] = await Promise.all([this.observations(tutorProfileId, false), this.assignmentHistory(tutorProfileId)]);
    return { coordinator: t.coordinator, assignedAt: t.coordinatorAssignedAt, observations, assignmentHistory: history, departmentFeedback: NOT_AVAILABLE_YET };
  }

  async createObservation(tutorProfileId: string, dto: ObservationDto, userId: string) {
    await this.assertCanSee(tutorProfileId, userId);
    const data = {
      observedAt: new Date(dto.observedAt),
      positiveFeedback: dto.positiveFeedback?.trim() || null,
      negativeFeedback: dto.negativeFeedback?.trim() || null,
    };
    this.rule(() => assertObservation(data));
    return this.prisma.$transaction(async (tx: PrismaTxClient) => {
      const o = await tx.tutorObservation.create({ data: { tutorProfileId, authorUserId: userId, ...data } });
      await this.audit.recordInTx(tx, {
        entityType: 'TutorProfile', entityId: tutorProfileId, action: 'TUTOR_OBSERVATION_CREATED', actorUserId: userId,
        metadata: { observationId: o.id, observedAt: data.observedAt.toISOString() },
      });
      return o;
    });
  }

  /** Head only: keeps the previous values as a revision and in the audit log. */
  async editObservation(observationId: string, dto: ObservationDto, userId: string) {
    const o = await this.prisma.tutorObservation.findUnique({ where: { id: observationId } });
    if (!o || o.hiddenAt) throw new NotFoundException('Observation not found');
    const next = {
      observedAt: new Date(dto.observedAt),
      positiveFeedback: dto.positiveFeedback?.trim() || null,
      negativeFeedback: dto.negativeFeedback?.trim() || null,
    };
    this.rule(() => assertObservation(next));
    if (next.observedAt.getTime() === o.observedAt.getTime() && next.positiveFeedback === o.positiveFeedback && next.negativeFeedback === o.negativeFeedback) {
      throw new BadRequestException('Nothing changed');
    }
    return this.prisma.$transaction(async (tx: PrismaTxClient) => {
      const now = new Date();
      const res = await tx.tutorObservation.updateMany({
        where: { id: observationId, hiddenAt: null, observedAt: o.observedAt, positiveFeedback: o.positiveFeedback, negativeFeedback: o.negativeFeedback },
        data: { ...next, editedAt: now },
      });
      if (res.count !== 1) throw new ConflictException('The observation changed; reload and retry');
      await tx.tutorObservationRevision.create({
        data: {
          observationId,
          previousObservedAt: o.observedAt, previousPositiveFeedback: o.positiveFeedback, previousNegativeFeedback: o.negativeFeedback,
          newObservedAt: next.observedAt, newPositiveFeedback: next.positiveFeedback, newNegativeFeedback: next.negativeFeedback,
          editedByUserId: userId, editedAt: now,
        },
      });
      await this.audit.recordInTx(tx, {
        entityType: 'TutorProfile', entityId: o.tutorProfileId, action: 'TUTOR_OBSERVATION_EDITED', actorUserId: userId,
        oldValue: { observedAt: o.observedAt.toISOString(), positiveFeedback: o.positiveFeedback, negativeFeedback: o.negativeFeedback },
        newValue: { observedAt: next.observedAt.toISOString(), positiveFeedback: next.positiveFeedback, negativeFeedback: next.negativeFeedback },
        metadata: { observationId },
      });
      return { id: observationId, editedAt: now };
    });
  }

  /** Head only: "delete" hides the observation with a reason; the record stays traceable. */
  async hideObservation(observationId: string, dto: HideObservationDto, userId: string) {
    const o = await this.prisma.tutorObservation.findUnique({ where: { id: observationId } });
    if (!o || o.hiddenAt) throw new NotFoundException('Observation not found');
    const reason = dto.reason.trim();
    return this.prisma.$transaction(async (tx: PrismaTxClient) => {
      const res = await tx.tutorObservation.updateMany({
        where: { id: observationId, hiddenAt: null }, data: { hiddenAt: new Date(), hiddenByUserId: userId, hiddenReason: reason },
      });
      if (res.count !== 1) throw new ConflictException('The observation changed; reload and retry');
      await this.audit.recordInTx(tx, {
        entityType: 'TutorProfile', entityId: o.tutorProfileId, action: 'TUTOR_OBSERVATION_DELETED', actorUserId: userId, reason,
        metadata: { observationId },
      });
      return { id: observationId, hidden: true };
    });
  }
}
