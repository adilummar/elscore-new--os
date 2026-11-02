import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { MentorAssignmentType, MentoringSetting, Prisma } from '@prisma/client';

import { PrismaService, PrismaTxClient } from '../../common/prisma/prisma.service';

import { mentorIneligibleReason } from './mentoring-eligibility';
import { MentoringHistoryService } from './mentoring-history.service';
import { openStage } from './mentoring-stage.helpers';
import {
  ADVISORY_LOCK_ALLOCATION,
  CLOSED_ACTIVATION_STATUSES,
  DEMO_COUNSELOR_ROLE_CODE,
  MENTOR_ROLE_CODE,
  MENTORING_HEAD_ROLE_CODE,
} from './mentoring.constants';

interface EligibilityFacts {
  userStatus: string | null;
  employmentStatus: string | null;
  roleCodes: Set<string>;
}

export const ALLOCATION_RULE_VERSION = 'LEAST_LOADED_V1';

export interface MentorCandidate {
  userId: string;
  load: number;
  capacity: number;
  lastAssignedAt: Date | null;
}

export interface AllocationChoice {
  mentorUserId: string;
  reason: string;
}

/**
 * Pure selection rule (unit-tested):
 *  1. Only mentors with spare capacity are eligible.
 *  2. If siblings from the same lead already have a mentor who is still eligible, use that mentor.
 *  3. Otherwise the lowest load wins; ties go to the lowest load/capacity ratio, then the mentor who
 *     was assigned a student least recently (never-assigned first), then the lowest user id.
 */
export function chooseMentor(
  candidates: MentorCandidate[],
  opts: { siblingMentorIds?: string[]; siblingAffinity?: boolean } = {},
): AllocationChoice | null {
  const eligible = candidates.filter((c) => c.load < c.capacity);
  if (eligible.length === 0) return null;

  if (opts.siblingAffinity && opts.siblingMentorIds?.length) {
    const sibling = eligible
      .filter((c) => opts.siblingMentorIds!.includes(c.userId))
      .sort((x, y) => x.load - y.load || x.userId.localeCompare(y.userId))[0];
    if (sibling) return { mentorUserId: sibling.userId, reason: 'SIBLING_AFFINITY' };
  }

  const sorted = [...eligible].sort((x, y) => {
    if (x.load !== y.load) return x.load - y.load;
    const rx = x.load / x.capacity;
    const ry = y.load / y.capacity;
    if (rx !== ry) return rx - ry;
    const tx = x.lastAssignedAt?.getTime() ?? -Infinity;
    const ty = y.lastAssignedAt?.getTime() ?? -Infinity;
    if (tx !== ty) return tx - ty;
    return x.userId.localeCompare(y.userId);
  });
  return { mentorUserId: sorted[0].userId, reason: 'LEAST_LOADED' };
}

@Injectable()
export class MentoringAllocationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly history: MentoringHistoryService,
  ) {}

  // ─── Settings ──────────────────────────────────────────────────────────────

  async getSettings(client: Pick<PrismaTxClient, 'mentoringSetting'> = this.prisma): Promise<MentoringSetting> {
    const row = await client.mentoringSetting.findUnique({ where: { id: 'default' } });
    return (
      row ?? {
        id: 'default',
        allocationMode: 'AUTO',
        defaultCapacity: 40,
        siblingAffinity: true,
        updatedByUserId: null,
        updatedAt: new Date(0),
      }
    );
  }

  async updateSettings(
    dto: { allocationMode?: 'AUTO' | 'MANUAL'; defaultCapacity?: number; siblingAffinity?: boolean },
    actorUserId: string,
  ) {
    return this.prisma.$transaction(async (tx: PrismaTxClient) => {
      const before = await this.getSettings(tx);
      const updated = await tx.mentoringSetting.upsert({
        where: { id: 'default' },
        create: { id: 'default', ...dto, updatedByUserId: actorUserId },
        update: { ...dto, updatedByUserId: actorUserId },
      });
      await tx.auditEvent.create({
        data: {
          entityType: 'MentoringSetting',
          entityId: 'default',
          action: 'UPDATE',
          actorUserId,
          oldValue: before,
          newValue: updated,
        },
      });
      return updated;
    });
  }

  // ─── Candidates and workload ───────────────────────────────────────────────

  /** The facts the shared eligibility rule needs, read the same way for automatic, manual and workload views. */
  private async eligibilityFacts(tx: PrismaTxClient, userIds: string[]): Promise<Map<string, EligibilityFacts>> {
    const [users, roleRows] = await Promise.all([
      tx.user.findMany({
        where: { id: { in: userIds } },
        select: { id: true, status: true, employee: { select: { employmentStatus: true } } },
      }),
      tx.userRole.findMany({
        where: { userId: { in: userIds }, role: { code: { in: [MENTOR_ROLE_CODE, MENTORING_HEAD_ROLE_CODE] } } },
        select: { userId: true, role: { select: { code: true } } },
      }),
    ]);
    const facts = new Map<string, EligibilityFacts>();
    for (const u of users) {
      facts.set(u.id, { userStatus: u.status, employmentStatus: u.employee?.employmentStatus ?? null, roleCodes: new Set() });
    }
    for (const r of roleRows) facts.get(r.userId)?.roleCodes.add(r.role.code);
    return facts;
  }

  private ineligibleReason(
    profile: { role: string; isActive: boolean; acceptsAllocation: boolean },
    facts: EligibilityFacts | undefined,
    forAutomatic: boolean,
  ): string | null {
    return mentorIneligibleReason(
      {
        profile,
        userStatus: facts?.userStatus ?? null,
        employmentStatus: facts?.employmentStatus ?? null,
        roleCodes: facts?.roleCodes ?? new Set(),
      },
      { forAutomatic },
    );
  }

  private async candidates(tx: PrismaTxClient, settings: MentoringSetting, onlyAccepting: boolean): Promise<MentorCandidate[]> {
    const allProfiles = await tx.mentoringStaffProfile.findMany({ where: { role: 'MENTOR', isActive: true } });
    if (allProfiles.length === 0) return [];
    const ids = allProfiles.map((p) => p.userId);

    const [facts, loads, lastAssigned] = await Promise.all([
      this.eligibilityFacts(tx, ids),
      tx.mentoringActivation.groupBy({
        by: ['currentMentorUserId'],
        where: { currentMentorUserId: { in: ids }, status: { notIn: [...CLOSED_ACTIVATION_STATUSES] } },
        _count: { _all: true },
      }),
      tx.mentorAssignment.groupBy({ by: ['mentorUserId'], where: { mentorUserId: { in: ids } }, _max: { startedAt: true } }),
    ]);

    const loadMap = new Map(loads.map((l) => [l.currentMentorUserId as string, l._count._all]));
    const lastMap = new Map(lastAssigned.map((l) => [l.mentorUserId, l._max.startedAt ?? null]));

    return allProfiles
      .filter((p) => this.ineligibleReason(p, facts.get(p.userId), onlyAccepting) === null)
      .map((p) => ({
        userId: p.userId,
        load: loadMap.get(p.userId) ?? 0,
        capacity: p.capacity ?? settings.defaultCapacity,
        lastAssignedAt: lastMap.get(p.userId) ?? null,
      }));
  }

  async workload() {
    return this.prisma.$transaction(async (tx: PrismaTxClient) => {
      const settings = await this.getSettings(tx);
      const profiles = await tx.mentoringStaffProfile.findMany({ orderBy: { createdAt: 'asc' } });
      const ids = profiles.map((p) => p.userId);
      const [facts, employees, loads, taskLoads, queued] = await Promise.all([
        this.eligibilityFacts(tx, ids),
        tx.employee.findMany({ where: { userId: { in: ids } }, select: { userId: true, firstName: true, lastName: true, employmentStatus: true } }),
        tx.mentoringActivation.groupBy({
          by: ['currentMentorUserId'],
          where: { currentMentorUserId: { in: ids }, status: { notIn: [...CLOSED_ACTIVATION_STATUSES] } },
          _count: { _all: true },
        }),
        tx.mentoringTask.groupBy({
          by: ['assigneeUserId'],
          where: { assigneeUserId: { in: ids }, status: { in: ['OPEN', 'IN_PROGRESS', 'RETURNED', 'ON_HOLD'] } },
          _count: { _all: true },
        }),
        tx.mentoringActivation.count({ where: { status: 'AWAITING_ALLOCATION' } }),
      ]);
      const emp = new Map(employees.map((e) => [e.userId, e]));
      const loadMap = new Map(loads.map((l) => [l.currentMentorUserId as string, l._count._all]));
      const taskMap = new Map(taskLoads.map((l) => [l.assigneeUserId, l._count._all]));

      return {
        settings,
        queuedStudents: queued,
        staff: profiles.map((p) => {
          const e = emp.get(p.userId);
          const f = facts.get(p.userId);
          // The same rule the allocation paths use: `eligibleForManual` fills the Head's Mentor dropdown,
          // `eligibleForAuto` is what automatic allocation would consider.
          const manualReason = this.ineligibleReason(p, f, false);
          const autoReason = this.ineligibleReason(p, f, true);
          return {
            userId: p.userId,
            name: e ? `${e.firstName} ${e.lastName}` : p.userId,
            employmentStatus: e?.employmentStatus ?? null,
            userStatus: f?.userStatus ?? null,
            eligibleForManual: manualReason === null,
            eligibleForAuto: autoReason === null,
            ineligibleReason: manualReason ?? autoReason,
            role: p.role,
            team: p.team,
            isActive: p.isActive,
            acceptsAllocation: p.acceptsAllocation,
            capacity: p.role === 'MENTOR' ? (p.capacity ?? settings.defaultCapacity) : null,
            openStudents: p.role === 'MENTOR' ? (loadMap.get(p.userId) ?? 0) : null,
            openTasks: taskMap.get(p.userId) ?? 0,
          };
        }),
      };
    });
  }

  async queue() {
    const rows = await this.prisma.mentoringActivation.findMany({
      where: { status: 'AWAITING_ALLOCATION' },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        createdAt: true,
        student: { select: { businessId: true, firstName: true, lastName: true } },
        lead: { select: { businessId: true } },
      },
    });
    return rows.map((r) => ({
      activationId: r.id,
      queuedAt: r.createdAt,
      studentBusinessId: r.student.businessId,
      studentName: [r.student.firstName, r.student.lastName].filter(Boolean).join(' '),
      leadBusinessId: r.lead.businessId,
    }));
  }

  // ─── Automatic allocation ──────────────────────────────────────────────────

  private async lockActivation(tx: PrismaTxClient, activationId: string) {
    await tx.$executeRaw`SELECT 1 FROM mentoring_activations WHERE id = ${activationId} FOR UPDATE`;
  }

  private async lockAllocation(tx: PrismaTxClient) {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${ADVISORY_LOCK_ALLOCATION}))`;
  }

  /**
   * Allocates a student who is awaiting allocation. Never moves a student who already has a Mentor.
   * Runs inside the caller's transaction (the ENROLLED handover) and is idempotent.
   */
  async autoAllocateInTx(tx: PrismaTxClient, activationId: string, actorUserId: string | null) {
    await this.lockActivation(tx, activationId);
    const activation = await tx.mentoringActivation.findUnique({ where: { id: activationId } });
    if (!activation || activation.currentMentorUserId || activation.status !== 'AWAITING_ALLOCATION') {
      return { allocated: false as const, reason: 'NOT_AWAITING_ALLOCATION' };
    }

    const settings = await this.getSettings(tx);
    if (settings.allocationMode !== 'AUTO') return this.queueInTx(tx, activation.id, 'MANUAL_MODE');

    await this.lockAllocation(tx);
    const candidates = await this.candidates(tx, settings, true);

    const siblings = await tx.mentoringActivation.findMany({
      where: { leadId: activation.leadId, id: { not: activation.id }, currentMentorUserId: { not: null }, status: { notIn: [...CLOSED_ACTIVATION_STATUSES] } },
      select: { currentMentorUserId: true },
    });
    const choice = chooseMentor(candidates, {
      siblingAffinity: settings.siblingAffinity,
      siblingMentorIds: siblings.map((s) => s.currentMentorUserId as string),
    });
    if (!choice) return this.queueInTx(tx, activation.id, 'NO_ELIGIBLE_MENTOR');

    await this.assignInTx(tx, {
      activationId: activation.id,
      mentorUserId: choice.mentorUserId,
      type: 'AUTO',
      reason: choice.reason,
      actorUserId,
      decision: {
        rule: ALLOCATION_RULE_VERSION,
        chosen: choice.mentorUserId,
        candidates: candidates.map((c) => ({ userId: c.userId, load: c.load, capacity: c.capacity })),
      },
    });
    return { allocated: true as const, mentorUserId: choice.mentorUserId };
  }

  private async queueInTx(tx: PrismaTxClient, activationId: string, reason: string) {
    await this.history.record(tx, { activationId, type: 'ALLOCATION_QUEUED', reason, payload: { reason } });
    const heads = await this.history.headUserIds(tx);
    await this.history.notify(tx, {
      recipientUserIds: heads,
      type: 'MENTORING_AWAITING_ALLOCATION',
      activationId,
      message: 'A newly enrolled student is waiting for Mentor allocation.',
      dedupeKey: `QUEUED:${activationId}`,
    });
    return { allocated: false as const, reason };
  }

  /** Re-runs automatic allocation for everyone still in the queue (one transaction per student). */
  async runAutoForQueue(actorUserId: string) {
    const queued = await this.prisma.mentoringActivation.findMany({
      where: { status: 'AWAITING_ALLOCATION' },
      orderBy: { createdAt: 'asc' },
      select: { id: true },
    });
    const results: Array<{ activationId: string; allocated: boolean; reason?: string }> = [];
    for (const { id } of queued) {
      const r = await this.prisma.$transaction((tx: PrismaTxClient) => this.autoAllocateInTx(tx, id, actorUserId));
      results.push({ activationId: id, allocated: r.allocated, reason: r.allocated ? undefined : r.reason });
    }
    return results;
  }

  // ─── Assignment primitive ──────────────────────────────────────────────────

  private async assignInTx(
    tx: PrismaTxClient,
    p: {
      activationId: string;
      mentorUserId: string;
      type: MentorAssignmentType;
      reason: string;
      actorUserId: string | null;
      decision?: Record<string, unknown>;
      returnToUserId?: string | null;
      expectedReturnAt?: Date | null;
    },
  ) {
    const activation = await tx.mentoringActivation.findUniqueOrThrow({ where: { id: p.activationId } });
    const previousMentor = activation.currentMentorUserId;

    // End the current assignment (history is kept; only one row may have currentKey set).
    await tx.mentorAssignment.updateMany({
      where: { activationId: p.activationId, currentKey: p.activationId },
      data: { currentKey: null, endedAt: new Date() },
    });

    const assignment = await tx.mentorAssignment.create({
      data: {
        activationId: p.activationId,
        mentorUserId: p.mentorUserId,
        assignedByUserId: p.actorUserId,
        type: p.type,
        reason: p.reason,
        decision: (p.decision ?? undefined) as Prisma.InputJsonValue | undefined,
        currentKey: p.activationId,
        returnToUserId: p.returnToUserId ?? null,
        expectedReturnAt: p.expectedReturnAt ?? null,
      },
    });

    const wasAwaiting = activation.status === 'AWAITING_ALLOCATION';
    await tx.mentoringActivation.update({
      where: { id: p.activationId },
      data: {
        currentMentorUserId: p.mentorUserId,
        ...(wasAwaiting ? { status: 'ACTIVATION_IN_PROGRESS' as const } : {}),
      },
    });

    // Stage 1 is ready for the Mentor as soon as a Mentor owns the student.
    if (wasAwaiting) await openStage(tx, p.activationId, activation.currentStage || 1);

    await this.history.record(tx, {
      activationId: p.activationId,
      type: p.type === 'AUTO' ? 'MENTOR_ALLOCATED_AUTO' : p.type === 'TEMPORARY' ? 'MENTOR_TRANSFERRED_TEMP' : previousMentor ? 'MENTOR_REASSIGNED' : 'MENTOR_ALLOCATED',
      actorUserId: p.actorUserId,
      reason: p.reason,
      payload: { assignmentId: assignment.id, from: previousMentor, to: p.mentorUserId, decision: p.decision },
    });

    const heads = await this.history.headUserIds(tx);
    await this.history.notify(tx, {
      recipientUserIds: [p.mentorUserId],
      type: 'MENTORING_ALLOCATED',
      activationId: p.activationId,
      message: 'A student has been allocated to you. Open Stage 1 to verify the admission information.',
      dedupeKey: `ALLOCATED:${assignment.id}`,
    });
    if (previousMentor && previousMentor !== p.mentorUserId) {
      await this.history.notify(tx, {
        recipientUserIds: [previousMentor],
        type: 'MENTORING_REASSIGNED_AWAY',
        activationId: p.activationId,
        message: 'A student has been reassigned from you to another Mentor.',
        dedupeKey: `REASSIGNED_AWAY:${assignment.id}`,
      });
    }
    await this.history.notify(tx, {
      recipientUserIds: heads,
      type: 'MENTORING_ALLOCATION_RECORDED',
      activationId: p.activationId,
      message: `Student allocated (${p.type.toLowerCase()}).`,
      dedupeKey: `ALLOCATION_RECORDED:${assignment.id}`,
      excludeUserId: p.actorUserId,
    });
    return assignment;
  }

  // ─── Manual allocation by the Mentoring Head ───────────────────────────────

  private async assertAssignable(tx: PrismaTxClient, mentorUserId: string, overCapacityReason?: string) {
    const profile = await tx.mentoringStaffProfile.findUnique({ where: { userId: mentorUserId } });
    if (!profile) {
      throw new BadRequestException(
        'The selected user has no Mentor staff profile. Open Mentoring → Staff and use "Add missing Mentors", or choose another Mentor.',
      );
    }
    const facts = await this.eligibilityFacts(tx, [mentorUserId]);
    const reason = this.ineligibleReason(profile, facts.get(mentorUserId), false);
    if (reason) throw new BadRequestException(`The selected user cannot be assigned students: ${reason}`);

    const settings = await this.getSettings(tx);
    const load = await tx.mentoringActivation.count({
      where: { currentMentorUserId: mentorUserId, status: { notIn: [...CLOSED_ACTIVATION_STATUSES] } },
    });
    const capacity = profile.capacity ?? settings.defaultCapacity;
    if (load >= capacity && !overCapacityReason?.trim()) {
      throw new ConflictException(`Mentor is at capacity (${load}/${capacity}). Provide overCapacityReason to override.`);
    }
    return { load, capacity };
  }

  private async loadOpenActivation(tx: PrismaTxClient, activationId: string) {
    await this.lockActivation(tx, activationId);
    const activation = await tx.mentoringActivation.findUnique({ where: { id: activationId } });
    if (!activation) throw new NotFoundException('Activation not found');
    if (CLOSED_ACTIVATION_STATUSES.includes(activation.status)) {
      throw new ConflictException('This activation is closed and cannot be reallocated');
    }
    return activation;
  }

  async allocate(activationId: string, dto: { mentorUserId: string; reason?: string; overCapacityReason?: string }, actorUserId: string) {
    return this.prisma.$transaction(async (tx: PrismaTxClient) => {
      const activation = await this.loadOpenActivation(tx, activationId);
      if (activation.currentMentorUserId) throw new ConflictException('Student already has a Mentor. Use reassign.');
      await this.lockAllocation(tx);
      const { load, capacity } = await this.assertAssignable(tx, dto.mentorUserId, dto.overCapacityReason);
      await this.assignInTx(tx, {
        activationId,
        mentorUserId: dto.mentorUserId,
        type: 'MANUAL',
        reason: dto.reason?.trim() || 'Manual allocation',
        actorUserId,
        decision: { rule: 'MANUAL', load, capacity, overCapacityReason: dto.overCapacityReason ?? null },
      });
      return { activationId, mentorUserId: dto.mentorUserId };
    });
  }

  async reassign(activationId: string, dto: { mentorUserId: string; reason: string; overCapacityReason?: string }, actorUserId: string) {
    return this.prisma.$transaction(async (tx: PrismaTxClient) => {
      const activation = await this.loadOpenActivation(tx, activationId);
      if (!activation.currentMentorUserId) throw new ConflictException('Student has no Mentor yet. Use assign.');
      if (activation.currentMentorUserId === dto.mentorUserId) throw new ConflictException('Student is already with this Mentor');
      await this.lockAllocation(tx);
      const { load, capacity } = await this.assertAssignable(tx, dto.mentorUserId, dto.overCapacityReason);
      await this.assignInTx(tx, {
        activationId,
        mentorUserId: dto.mentorUserId,
        type: 'MANUAL',
        reason: dto.reason,
        actorUserId,
        decision: { rule: 'MANUAL_REASSIGN', from: activation.currentMentorUserId, load, capacity },
      });
      return { activationId, mentorUserId: dto.mentorUserId };
    });
  }

  async temporaryTransfer(activationId: string, dto: { mentorUserId: string; reason: string; expectedReturnAt: Date }, actorUserId: string) {
    return this.prisma.$transaction(async (tx: PrismaTxClient) => {
      const activation = await this.loadOpenActivation(tx, activationId);
      if (!activation.currentMentorUserId) throw new ConflictException('Student has no Mentor to transfer from');
      if (activation.currentMentorUserId === dto.mentorUserId) throw new ConflictException('Student is already with this Mentor');
      await this.lockAllocation(tx);
      await this.assertAssignable(tx, dto.mentorUserId, 'temporary transfer');
      await this.assignInTx(tx, {
        activationId,
        mentorUserId: dto.mentorUserId,
        type: 'TEMPORARY',
        reason: dto.reason,
        actorUserId,
        returnToUserId: activation.currentMentorUserId,
        expectedReturnAt: dto.expectedReturnAt,
      });
      return { activationId, mentorUserId: dto.mentorUserId };
    });
  }

  async endTransfer(activationId: string, actorUserId: string) {
    return this.prisma.$transaction(async (tx: PrismaTxClient) => {
      await this.loadOpenActivation(tx, activationId);
      const current = await tx.mentorAssignment.findFirst({ where: { activationId, currentKey: activationId } });
      if (!current || current.type !== 'TEMPORARY' || !current.returnToUserId) {
        throw new ConflictException('There is no temporary transfer to end');
      }
      await this.lockAllocation(tx);
      await this.assertAssignable(tx, current.returnToUserId, 'returning from temporary transfer');
      await this.assignInTx(tx, {
        activationId,
        mentorUserId: current.returnToUserId,
        type: 'MANUAL',
        reason: 'Temporary transfer ended',
        actorUserId,
      });
      return { activationId, mentorUserId: current.returnToUserId };
    });
  }

  async returnToQueue(activationId: string, reason: string, actorUserId: string) {
    return this.prisma.$transaction(async (tx: PrismaTxClient) => {
      const activation = await this.loadOpenActivation(tx, activationId);
      if (!activation.currentMentorUserId) throw new ConflictException('Student is already in the queue');
      if (activation.status !== 'ACTIVATION_IN_PROGRESS') {
        throw new ConflictException('Only an activation that is in progress can be returned to the queue');
      }
      const previous = activation.currentMentorUserId;
      await tx.mentorAssignment.updateMany({
        where: { activationId, currentKey: activationId },
        data: { currentKey: null, endedAt: new Date() },
      });
      await tx.mentoringActivation.update({
        where: { id: activationId },
        data: { currentMentorUserId: null, status: 'AWAITING_ALLOCATION' },
      });
      await this.history.record(tx, {
        activationId,
        type: 'RETURNED_TO_QUEUE',
        actorUserId,
        reason,
        fromStatus: activation.status,
        toStatus: 'AWAITING_ALLOCATION',
        payload: { previousMentorUserId: previous },
      });
      await this.history.notify(tx, {
        recipientUserIds: [previous],
        type: 'MENTORING_REASSIGNED_AWAY',
        activationId,
        message: 'A student was returned to the allocation queue.',
        dedupeKey: `QUEUE_RETURN:${activationId}:${Date.now()}`,
        excludeUserId: actorUserId,
      });
      return { activationId };
    });
  }

  /** Throws unless the user is the current Mentor of the activation. Shared by workflow and task services. */
  static assertAssignedMentor(activation: { currentMentorUserId: string | null }, userId: string) {
    if (activation.currentMentorUserId !== userId) {
      throw new ForbiddenException('Only the Mentor assigned to this student can do this');
    }
  }

  static readonly COUNSELOR_ROLE_CODE = DEMO_COUNSELOR_ROLE_CODE;
}
