import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { MentoringTaskPriority, MentoringTaskStatus, Prisma } from '@prisma/client';

import { PrismaService, PrismaTxClient } from '../../common/prisma/prisma.service';

import { MentoringScope } from './mentoring-access.service';
import { MentoringHistoryService } from './mentoring-history.service';
import { CLOSED_ACTIVATION_STATUSES, DEMO_COUNSELOR_ROLE_CODE, getChecklistDefinition } from './mentoring.constants';

export interface CreateTaskInput {
  activationId: string;
  stageNumber?: number;
  title: string;
  description?: string;
  priority?: MentoringTaskPriority;
  dueAt?: Date;
  assigneeUserId: string;
}

const WORKING: MentoringTaskStatus[] = ['OPEN', 'IN_PROGRESS', 'RETURNED'];

/**
 * Counselor task layer. Counselors can collect information and submit work; only the assigned Mentor
 * (or the Mentoring Head) verifies tasks, and only the Mentor verifies stage checklist items.
 */
@Injectable()
export class MentoringTaskService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly history: MentoringHistoryService,
  ) {}

  private async loadTask(tx: PrismaTxClient, id: string) {
    await tx.$executeRaw`SELECT 1 FROM mentoring_tasks WHERE id = ${id} FOR UPDATE`;
    const task = await tx.mentoringTask.findUnique({ where: { id }, include: { activation: true, stage: true } });
    if (!task) throw new NotFoundException('Task not found');
    return task;
  }

  /**
   * A task raised from a class (a class follow-up) is run from the class workspace, where the assigned Mentor and the tutor each do their
   * part and every step is written to the class history. The general task routes refuse it, so verifying, sending back or cancelling it
   * here cannot skip that history or the assigned Mentor rule.
   */
  private assertNotClassFollowUp(task: { sourceType?: string | null }) {
    if (task.sourceType) throw new ConflictException('This task follows up a class. Open the class workspace to work on it.');
  }

  private assertManager(task: { activation: { currentMentorUserId: string | null } }, scope: MentoringScope) {
    if (!scope.all && task.activation.currentMentorUserId !== scope.userId) {
      throw new ForbiddenException('Only the assigned Mentor or the Mentoring Head can do this');
    }
  }

  private assertAssignee(task: { assigneeUserId: string }, userId: string) {
    if (task.assigneeUserId !== userId) throw new ForbiddenException('This task is not assigned to you');
  }

  async create(input: CreateTaskInput, scope: MentoringScope) {
    if (!input.title?.trim()) throw new BadRequestException('A title is required');

    return this.prisma.$transaction(async (tx: PrismaTxClient) => {
      await tx.$executeRaw`SELECT 1 FROM mentoring_activations WHERE id = ${input.activationId} FOR UPDATE`;
      const activation = await tx.mentoringActivation.findUnique({ where: { id: input.activationId }, include: { stages: true } });
      if (!activation) throw new NotFoundException('Student not found');
      this.assertManager({ activation }, scope);
      if (CLOSED_ACTIVATION_STATUSES.includes(activation.status)) throw new ConflictException('This activation is closed');

      const assignee = await tx.mentoringStaffProfile.findUnique({ where: { userId: input.assigneeUserId } });
      const hasRole = await tx.userRole.count({ where: { userId: input.assigneeUserId, role: { code: DEMO_COUNSELOR_ROLE_CODE } } });
      if (!assignee || assignee.role !== 'DEMO_COUNSELOR' || !assignee.isActive || !hasRole) {
        throw new BadRequestException('Tasks can only be assigned to an active Demo Counselor');
      }

      let stageId: string | null = null;
      if (input.stageNumber) {
        const stage = activation.stages.find((s) => s.stageNumber === input.stageNumber);
        if (!stage) throw new BadRequestException('Stage not available yet');
        stageId = stage.id;
      }

      const task = await tx.mentoringTask.create({
        data: {
          activationId: input.activationId,
          stageId,
          title: input.title.trim(),
          description: input.description?.trim() || null,
          priority: input.priority ?? 'MEDIUM',
          dueAt: input.dueAt ?? null,
          assigneeUserId: input.assigneeUserId,
          assignedByUserId: scope.userId,
        },
      });
      await this.history.record(tx, {
        activationId: input.activationId,
        stageId,
        taskId: task.id,
        type: 'TASK_ASSIGNED',
        actorUserId: scope.userId,
        toStatus: 'OPEN',
        payload: { title: task.title, assigneeUserId: input.assigneeUserId, priority: task.priority, dueAt: input.dueAt?.toISOString() ?? null },
      });
      await this.history.notify(tx, {
        recipientUserIds: [input.assigneeUserId],
        type: 'MENTORING_TASK_ASSIGNED',
        activationId: input.activationId,
        message: `New task assigned: ${task.title}`,
        dedupeKey: `TASK_ASSIGNED:${task.id}`,
      });
      return task;
    });
  }

  async list(scope: MentoringScope, q: { scope?: 'assigned' | 'created' | 'all'; status?: MentoringTaskStatus; activationId?: string }) {
    const where: Prisma.MentoringTaskWhereInput = {
      ...(q.status ? { status: q.status } : {}),
      ...(q.activationId ? { activationId: q.activationId } : {}),
    };
    if (q.scope === 'all') {
      if (!scope.all) throw new ForbiddenException('Only the Mentoring Head can list every task');
    } else if (q.scope === 'created') {
      where.assignedByUserId = scope.userId;
    } else {
      where.assigneeUserId = scope.userId;
    }
    const rows = await this.prisma.mentoringTask.findMany({
      where,
      orderBy: [{ status: 'asc' }, { dueAt: 'asc' }],
      take: 200,
      include: { activation: { select: { id: true, student: { select: { businessId: true, firstName: true, lastName: true } } } } },
    });
    return rows.map((t) => ({
      id: t.id,
      activationId: t.activationId,
      title: t.title,
      description: t.description,
      priority: t.priority,
      status: t.status,
      dueAt: t.dueAt,
      stageId: t.stageId,
      assigneeUserId: t.assigneeUserId,
      assignedByUserId: t.assignedByUserId,
      returnReason: t.returnReason,
      studentBusinessId: t.activation.student.businessId,
      studentName: [t.activation.student.firstName, t.activation.student.lastName].filter(Boolean).join(' '),
    }));
  }

  async start(id: string, userId: string) {
    return this.prisma.$transaction(async (tx: PrismaTxClient) => {
      const task = await this.loadTask(tx, id);
      this.assertNotClassFollowUp(task);
      this.assertAssignee(task, userId);
      if (task.status !== 'OPEN' && task.status !== 'RETURNED') throw new ConflictException(`Task cannot be started (${task.status})`);
      await tx.mentoringTask.update({ where: { id }, data: { status: 'IN_PROGRESS' } });
      await this.history.record(tx, { activationId: task.activationId, taskId: id, type: 'TASK_STARTED', actorUserId: userId, fromStatus: task.status, toStatus: 'IN_PROGRESS' });
      return { id, status: 'IN_PROGRESS' };
    });
  }

  async comment(id: string, body: string, scope: MentoringScope) {
    if (!body?.trim()) throw new BadRequestException('A comment is required');
    return this.prisma.$transaction(async (tx: PrismaTxClient) => {
      const task = await this.loadTask(tx, id);
      if (task.assigneeUserId !== scope.userId && !scope.all && task.activation.currentMentorUserId !== scope.userId) {
        throw new ForbiddenException('You cannot comment on this task');
      }
      const comment = await tx.mentoringTaskComment.create({ data: { taskId: id, authorUserId: scope.userId, body: body.trim() } });
      await this.history.record(tx, { activationId: task.activationId, taskId: id, type: 'TASK_COMMENTED', actorUserId: scope.userId });
      const recipients = scope.userId === task.assigneeUserId ? [task.assignedByUserId, task.activation.currentMentorUserId] : [task.assigneeUserId];
      await this.history.notify(tx, {
        recipientUserIds: recipients,
        type: 'MENTORING_TASK_COMMENT',
        activationId: task.activationId,
        message: `New comment on task: ${task.title}`,
        dedupeKey: `TASK_COMMENT:${comment.id}`,
        excludeUserId: scope.userId,
      });
      return comment;
    });
  }

  /**
   * Permitted information update by a Counselor: records collected data against a checklist item of the
   * task's stage as COLLECTED. It never verifies the item and never touches an item the Mentor has resolved.
   */
  async collect(id: string, input: { itemKey: string; value?: unknown; note?: string; evidenceRef?: string }, userId: string) {
    return this.prisma.$transaction(async (tx: PrismaTxClient) => {
      const task = await this.loadTask(tx, id);
      this.assertNotClassFollowUp(task);
      this.assertAssignee(task, userId);
      if (!WORKING.includes(task.status)) throw new ConflictException(`Task is not open for work (${task.status})`);
      if (task.activation.status !== 'ACTIVATION_IN_PROGRESS') {
        throw new ConflictException('The student workflow is not in progress (it may be on hold)');
      }
      if (!task.stage || (task.stage.status !== 'IN_PROGRESS' && task.stage.status !== 'PENDING_REVIEW')) {
        throw new ConflictException('The task stage is not open for editing');
      }
      if (!getChecklistDefinition(task.stage.stageNumber).some((d) => d.key === input.itemKey)) {
        throw new BadRequestException('Unknown checklist item for this task');
      }
      const row = await tx.stageChecklistResponse.findUnique({ where: { stageId_itemKey: { stageId: task.stage.id, itemKey: input.itemKey } } });
      if (!row) throw new ConflictException('Checklist item is not available yet');
      if (row.state === 'VERIFIED' || row.state === 'UNAVAILABLE' || row.state === 'NOT_APPLICABLE') {
        throw new ConflictException('The Mentor has already resolved this item');
      }
      await tx.stageChecklistResponse.update({
        where: { id: row.id },
        data: {
          state: 'COLLECTED',
          ...(input.value !== undefined ? { value: input.value as Prisma.InputJsonValue } : {}),
          ...(input.note !== undefined ? { note: input.note } : {}),
          ...(input.evidenceRef !== undefined ? { evidenceRef: input.evidenceRef } : {}),
          updatedByUserId: userId,
        },
      });
      await this.history.record(tx, {
        activationId: task.activationId,
        stageId: task.stage.id,
        taskId: id,
        type: 'INFO_COLLECTED',
        actorUserId: userId,
        fromStatus: row.state,
        toStatus: 'COLLECTED',
        payload: { itemKey: input.itemKey },
      });
      return { itemKey: input.itemKey, state: 'COLLECTED' };
    });
  }

  async submit(id: string, input: { note?: string; evidence?: string }, userId: string) {
    return this.prisma.$transaction(async (tx: PrismaTxClient) => {
      const task = await this.loadTask(tx, id);
      this.assertNotClassFollowUp(task);
      this.assertAssignee(task, userId);
      if (!WORKING.includes(task.status)) throw new ConflictException(`Task cannot be submitted (${task.status})`);
      const evidence = Array.isArray(task.evidence) ? [...(task.evidence as unknown[])] : [];
      if (input.evidence?.trim()) evidence.push({ ref: input.evidence.trim(), by: userId, at: new Date().toISOString() });
      await tx.mentoringTask.update({
        where: { id },
        data: { status: 'SUBMITTED', submittedAt: new Date(), evidence: evidence as Prisma.InputJsonValue, returnReason: null },
      });
      await this.history.record(tx, {
        activationId: task.activationId,
        taskId: id,
        type: 'TASK_SUBMITTED',
        actorUserId: userId,
        fromStatus: task.status,
        toStatus: 'SUBMITTED',
        reason: input.note ?? null,
      });
      await this.history.notify(tx, {
        recipientUserIds: [task.activation.currentMentorUserId, task.assignedByUserId],
        type: 'MENTORING_TASK_SUBMITTED',
        activationId: task.activationId,
        message: `Task submitted for verification: ${task.title}`,
        dedupeKey: `TASK_SUBMITTED:${id}:${Date.now()}`,
        excludeUserId: userId,
      });
      return { id, status: 'SUBMITTED' };
    });
  }

  async verify(id: string, scope: MentoringScope) {
    return this.prisma.$transaction(async (tx: PrismaTxClient) => {
      const task = await this.loadTask(tx, id);
      this.assertNotClassFollowUp(task);
      this.assertManager(task, scope);
      if (task.status !== 'SUBMITTED') throw new ConflictException('Only a submitted task can be verified');
      await tx.mentoringTask.update({ where: { id }, data: { status: 'VERIFIED', verifiedByUserId: scope.userId, verifiedAt: new Date() } });
      await this.history.record(tx, { activationId: task.activationId, taskId: id, type: 'TASK_VERIFIED', actorUserId: scope.userId, fromStatus: 'SUBMITTED', toStatus: 'VERIFIED' });
      await this.history.notify(tx, {
        recipientUserIds: [task.assigneeUserId],
        type: 'MENTORING_TASK_VERIFIED',
        activationId: task.activationId,
        message: `Task verified: ${task.title}`,
        dedupeKey: `TASK_VERIFIED:${id}`,
        excludeUserId: scope.userId,
      });
      return { id, status: 'VERIFIED' };
    });
  }

  async returnTask(id: string, reason: string, scope: MentoringScope) {
    if (!reason?.trim()) throw new BadRequestException('A reason is required');
    return this.prisma.$transaction(async (tx: PrismaTxClient) => {
      const task = await this.loadTask(tx, id);
      this.assertNotClassFollowUp(task);
      this.assertManager(task, scope);
      if (task.status !== 'SUBMITTED') throw new ConflictException('Only a submitted task can be returned');
      await tx.mentoringTask.update({ where: { id }, data: { status: 'RETURNED', returnReason: reason.trim() } });
      await this.history.record(tx, { activationId: task.activationId, taskId: id, type: 'TASK_RETURNED', actorUserId: scope.userId, fromStatus: 'SUBMITTED', toStatus: 'RETURNED', reason });
      await this.history.notify(tx, {
        recipientUserIds: [task.assigneeUserId],
        type: 'MENTORING_TASK_RETURNED',
        activationId: task.activationId,
        message: `Task returned: ${task.title}`,
        dedupeKey: `TASK_RETURNED:${id}:${Date.now()}`,
        excludeUserId: scope.userId,
      });
      return { id, status: 'RETURNED' };
    });
  }

  /** A Counselor may pause their own task; this never touches the student workflow. */
  async hold(id: string, reason: string, userId: string) {
    if (!reason?.trim()) throw new BadRequestException('A reason is required');
    return this.prisma.$transaction(async (tx: PrismaTxClient) => {
      const task = await this.loadTask(tx, id);
      this.assertNotClassFollowUp(task);
      this.assertAssignee(task, userId);
      if (!WORKING.includes(task.status)) throw new ConflictException(`Task cannot be paused (${task.status})`);
      await tx.mentoringTask.update({ where: { id }, data: { status: 'ON_HOLD', statusBeforeHold: task.status, holdReason: reason.trim() } });
      await this.history.record(tx, { activationId: task.activationId, taskId: id, type: 'TASK_PAUSED', actorUserId: userId, fromStatus: task.status, toStatus: 'ON_HOLD', reason });
      await this.history.notify(tx, {
        recipientUserIds: [task.activation.currentMentorUserId, task.assignedByUserId],
        type: 'MENTORING_TASK_PAUSED',
        activationId: task.activationId,
        message: `Task paused: ${task.title}`,
        dedupeKey: `TASK_PAUSED:${id}:${Date.now()}`,
        excludeUserId: userId,
      });
      return { id, status: 'ON_HOLD' };
    });
  }

  async resumeTask(id: string, userId: string) {
    return this.prisma.$transaction(async (tx: PrismaTxClient) => {
      const task = await this.loadTask(tx, id);
      this.assertNotClassFollowUp(task);
      this.assertAssignee(task, userId);
      if (task.status !== 'ON_HOLD') throw new ConflictException('Task is not paused');
      const restored = task.statusBeforeHold ?? 'IN_PROGRESS';
      await tx.mentoringTask.update({ where: { id }, data: { status: restored, statusBeforeHold: null, holdReason: null } });
      await this.history.record(tx, { activationId: task.activationId, taskId: id, type: 'TASK_RESUMED', actorUserId: userId, fromStatus: 'ON_HOLD', toStatus: restored });
      return { id, status: restored };
    });
  }

  async cancel(id: string, reason: string, scope: MentoringScope) {
    if (!reason?.trim()) throw new BadRequestException('A reason is required');
    return this.prisma.$transaction(async (tx: PrismaTxClient) => {
      const task = await this.loadTask(tx, id);
      this.assertNotClassFollowUp(task);
      this.assertManager(task, scope);
      if (task.status === 'VERIFIED' || task.status === 'CANCELLED') throw new ConflictException('Task is already closed');
      await tx.mentoringTask.update({ where: { id }, data: { status: 'CANCELLED' } });
      await this.history.record(tx, { activationId: task.activationId, taskId: id, type: 'TASK_CANCELLED', actorUserId: scope.userId, fromStatus: task.status, toStatus: 'CANCELLED', reason });
      return { id, status: 'CANCELLED' };
    });
  }
}
