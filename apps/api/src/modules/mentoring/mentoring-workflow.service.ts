import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ChecklistItemState, MentoringStageStatus, Prisma } from '@prisma/client';

import { PrismaService, PrismaTxClient } from '../../common/prisma/prisma.service';

import { MentoringAccessService, MentoringScope } from './mentoring-access.service';
import { MentoringAllocationService } from './mentoring-allocation.service';
import { MentoringHistoryService } from './mentoring-history.service';
import { ensureChecklistRows, ensureStageRows, openStage, unresolvedMandatoryItems } from './mentoring-stage.helpers';
import { TOTAL_STAGES, getChecklistDefinition, getStageDefinition, STAGES } from './mentoring.constants';

export interface HoldInput {
  reason: string;
  pendingAction?: string;
  responsibleUserId: string;
  followUpAt: Date;
  dependency?: string;
}

export interface ChecklistUpdateInput {
  state?: ChecklistItemState;
  value?: unknown;
  note?: string | null;
  reason?: string | null;
  evidenceRef?: string | null;
}

const PARENT_CONTACT_FIELDS = new Set(['parent.primaryPhone', 'parent.altPhone1', 'parent.altPhone2', 'parent.whatsappNumber']);

@Injectable()
export class MentoringWorkflowService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: MentoringAccessService,
    private readonly history: MentoringHistoryService,
  ) {}

  // ─── Shared helpers ────────────────────────────────────────────────────────

  private async loadLocked(tx: PrismaTxClient, activationId: string) {
    await tx.$executeRaw`SELECT 1 FROM mentoring_activations WHERE id = ${activationId} FOR UPDATE`;
    const activation = await tx.mentoringActivation.findUnique({ where: { id: activationId }, include: { stages: true } });
    if (!activation) throw new NotFoundException('Activation not found');
    return activation;
  }

  private stageOf(activation: { stages: Array<{ stageNumber: number; id: string; status: MentoringStageStatus }> }, n: number) {
    if (!getStageDefinition(n)) throw new BadRequestException('Unknown stage');
    const stage = activation.stages.find((s) => s.stageNumber === n);
    if (!stage) throw new ConflictException(`Stage ${n} has not been created yet`);
    return stage;
  }

  private assertMentor(activation: { currentMentorUserId: string | null }, userId: string) {
    MentoringAllocationService.assertAssignedMentor(activation, userId);
  }

  private assertMentorOrHead(activation: { currentMentorUserId: string | null }, scope: MentoringScope) {
    if (!scope.all && activation.currentMentorUserId !== scope.userId) {
      throw new ForbiddenException('Only the assigned Mentor or the Mentoring Head can do this');
    }
  }

  private assertWorkable(activation: { status: string }) {
    if (activation.status === 'ACTIVATION_ON_HOLD' || activation.status === 'ACTIVATION_BLOCKED') {
      throw new ConflictException('This student workflow is on hold. Resume it first.');
    }
    if (activation.status !== 'ACTIVATION_IN_PROGRESS') {
      throw new ConflictException(`The workflow is not in progress (${activation.status})`);
    }
  }

  /** Moves a stage between IN_PROGRESS and PENDING_REVIEW depending on whether mandatory items are resolved. */
  private async reevaluateStage(tx: PrismaTxClient, stageId: string) {
    const stage = await tx.mentoringStage.findUniqueOrThrow({ where: { id: stageId } });
    if (stage.status !== 'IN_PROGRESS' && stage.status !== 'PENDING_REVIEW') return stage.status;
    const [rows, exceptions] = await Promise.all([
      tx.stageChecklistResponse.findMany({ where: { stageId } }),
      tx.workflowException.findMany({ where: { stageId }, select: { itemKey: true } }),
    ]);
    const unresolved = unresolvedMandatoryItems(rows, new Set(exceptions.map((e) => e.itemKey)));
    const target: MentoringStageStatus = unresolved.length === 0 ? 'PENDING_REVIEW' : 'IN_PROGRESS';
    if (target !== stage.status) {
      await tx.mentoringStage.update({
        where: { id: stageId },
        data: { status: target, pendingReviewAt: target === 'PENDING_REVIEW' ? new Date() : null },
      });
    }
    return target;
  }

  // ─── Stage execution (assigned Mentor) ─────────────────────────────────────

  async startStage(activationId: string, stageNumber: number, userId: string) {
    return this.prisma.$transaction(async (tx: PrismaTxClient) => {
      const activation = await this.loadLocked(tx, activationId);
      this.assertMentor(activation, userId);
      this.assertWorkable(activation);
      await ensureStageRows(tx, activationId);
      const fresh = await this.loadLocked(tx, activationId);
      const stage = this.stageOf(fresh, stageNumber);

      if (stage.status === 'IN_PROGRESS' || stage.status === 'PENDING_REVIEW') return { stageNumber, status: stage.status };
      if (stage.status !== 'NOT_STARTED') throw new ConflictException(`Stage ${stageNumber} cannot be started (${stage.status})`);
      for (let n = 1; n < stageNumber; n++) {
        if (this.stageOf(fresh, n).status !== 'COMPLETED') {
          throw new ConflictException(`Stage ${n} must be completed before stage ${stageNumber} can start`);
        }
      }

      await openStage(tx, activationId, stageNumber);
      await this.history.record(tx, {
        activationId,
        stageId: stage.id,
        type: 'STAGE_STARTED',
        actorUserId: userId,
        fromStatus: 'NOT_STARTED',
        toStatus: 'IN_PROGRESS',
        payload: { stageNumber },
      });
      return { stageNumber, status: 'IN_PROGRESS' as const };
    });
  }

  async updateChecklistItem(activationId: string, stageNumber: number, itemKey: string, input: ChecklistUpdateInput, userId: string) {
    const def = getChecklistDefinition(stageNumber).find((d) => d.key === itemKey);
    if (!def) throw new BadRequestException('Unknown checklist item for this stage');
    if (input.state && (input.state === 'UNAVAILABLE' || input.state === 'NOT_APPLICABLE') && !input.reason?.trim()) {
      throw new BadRequestException('A reason is required when an item is marked unavailable or not applicable');
    }

    return this.prisma.$transaction(async (tx: PrismaTxClient) => {
      const activation = await this.loadLocked(tx, activationId);
      this.assertMentor(activation, userId);
      this.assertWorkable(activation);
      const stage = this.stageOf(activation, stageNumber);
      if (stage.status !== 'IN_PROGRESS' && stage.status !== 'PENDING_REVIEW') {
        throw new ConflictException(`Stage ${stageNumber} is not open for editing (${stage.status})`);
      }

      await ensureChecklistRows(tx, stage.id, stageNumber);
      const row = await tx.stageChecklistResponse.findUniqueOrThrow({ where: { stageId_itemKey: { stageId: stage.id, itemKey } } });

      const nextState = input.state ?? row.state;
      const updated = await tx.stageChecklistResponse.update({
        where: { id: row.id },
        data: {
          state: nextState,
          ...(input.value !== undefined ? { value: input.value as Prisma.InputJsonValue } : {}),
          ...(input.note !== undefined ? { note: input.note } : {}),
          ...(input.reason !== undefined ? { reason: input.reason } : nextState === 'VERIFIED' || nextState === 'COLLECTED' ? { reason: null } : {}),
          ...(input.evidenceRef !== undefined ? { evidenceRef: input.evidenceRef } : {}),
          updatedByUserId: userId,
        },
      });

      await this.history.record(tx, {
        activationId,
        stageId: stage.id,
        type: 'CHECKLIST_UPDATED',
        actorUserId: userId,
        fromStatus: row.state,
        toStatus: updated.state,
        payload: { stageNumber, itemKey, mandatory: row.mandatory },
      });

      const stageStatus = await this.reevaluateStage(tx, stage.id);
      return { item: updated, stageStatus };
    });
  }

  async verifyStage(activationId: string, stageNumber: number, userId: string) {
    return this.prisma.$transaction(async (tx: PrismaTxClient) => {
      const activation = await this.loadLocked(tx, activationId);
      this.assertMentor(activation, userId);
      this.assertWorkable(activation);
      const stage = this.stageOf(activation, stageNumber);
      if (stage.status !== 'IN_PROGRESS' && stage.status !== 'PENDING_REVIEW') {
        throw new ConflictException(`Stage ${stageNumber} cannot be verified (${stage.status})`);
      }
      for (let n = 1; n < stageNumber; n++) {
        if (this.stageOf(activation, n).status !== 'COMPLETED') {
          throw new ConflictException(`Stage ${n} must be completed first`);
        }
      }

      const [rows, exceptions, submittedTasks] = await Promise.all([
        tx.stageChecklistResponse.findMany({ where: { stageId: stage.id } }),
        tx.workflowException.findMany({ where: { stageId: stage.id }, select: { itemKey: true } }),
        tx.mentoringTask.count({ where: { stageId: stage.id, status: 'SUBMITTED' } }),
      ]);
      const unresolved = unresolvedMandatoryItems(rows, new Set(exceptions.map((e) => e.itemKey)));
      if (unresolved.length > 0) {
        throw new ConflictException({ message: 'Mandatory checklist items are not resolved', unresolved });
      }
      if (submittedTasks > 0) {
        throw new ConflictException('Counselor tasks for this stage are waiting for your verification');
      }

      await tx.mentoringStage.update({
        where: { id: stage.id },
        data: { status: 'COMPLETED', completedAt: new Date(), verifiedByUserId: userId },
      });
      await this.history.record(tx, {
        activationId,
        stageId: stage.id,
        type: 'STAGE_VERIFIED',
        actorUserId: userId,
        fromStatus: stage.status,
        toStatus: 'COMPLETED',
        payload: { stageNumber },
      });

      const stages = await tx.mentoringStage.findMany({ where: { activationId } });
      const allDone = STAGES.every((def) => stages.find((s) => s.stageNumber === def.number)?.status === 'COMPLETED');
      if (!allDone) {
        const next = STAGES.find((def) => stages.find((s) => s.stageNumber === def.number)?.status !== 'COMPLETED');
        await tx.mentoringActivation.update({ where: { id: activationId }, data: { currentStage: next?.number ?? stageNumber } });
        return { stageNumber, activationStatus: activation.status, allStagesCompleted: false };
      }

      const approval = await tx.finalApproval.create({ data: { activationId, submittedByUserId: userId } });
      await tx.mentoringActivation.update({
        where: { id: activationId },
        data: { status: 'PENDING_FINAL_APPROVAL', submittedForApprovalAt: new Date(), currentStage: TOTAL_STAGES },
      });
      await this.history.record(tx, {
        activationId,
        type: 'SUBMITTED_FOR_APPROVAL',
        actorUserId: userId,
        fromStatus: activation.status,
        toStatus: 'PENDING_FINAL_APPROVAL',
        payload: { approvalId: approval.id },
      });
      await this.history.notify(tx, {
        recipientUserIds: await this.history.headUserIds(tx),
        type: 'MENTORING_APPROVAL_PENDING',
        activationId,
        message: 'All seven stages are complete. Phase 1 activation is waiting for your approval.',
        dedupeKey: `APPROVAL_PENDING:${approval.id}`,
      });
      return { stageNumber, activationStatus: 'PENDING_FINAL_APPROVAL' as const, allStagesCompleted: true };
    });
  }

  // ─── Pause, block and resume (whole student workflow) ──────────────────────

  private async holdInternal(activationId: string, kind: 'HOLD' | 'BLOCK', input: HoldInput, scope: MentoringScope) {
    if (!input.reason?.trim()) throw new BadRequestException('A reason is required');
    if (kind === 'HOLD' && !input.pendingAction?.trim()) throw new BadRequestException('The pending action is required');
    if (kind === 'BLOCK' && !input.dependency?.trim()) throw new BadRequestException('The missing dependency is required');
    if (!input.responsibleUserId) throw new BadRequestException('A responsible person is required');
    if (!(input.followUpAt instanceof Date) || Number.isNaN(input.followUpAt.getTime())) {
      throw new BadRequestException('A follow-up date is required');
    }

    return this.prisma.$transaction(async (tx: PrismaTxClient) => {
      const activation = await this.loadLocked(tx, activationId);
      this.assertMentorOrHead(activation, scope);
      if (activation.status !== 'ACTIVATION_IN_PROGRESS') {
        throw new ConflictException(`Only a workflow that is in progress can be ${kind === 'HOLD' ? 'paused' : 'blocked'} (${activation.status})`);
      }
      const responsible = await tx.user.count({ where: { id: input.responsibleUserId } });
      if (!responsible) throw new BadRequestException('The responsible person does not exist');

      const stage = activation.stages.find((s) => s.stageNumber === activation.currentStage);
      const holdsStage = stage && (stage.status === 'IN_PROGRESS' || stage.status === 'PENDING_REVIEW');
      const stageTarget: MentoringStageStatus = kind === 'HOLD' ? 'ON_HOLD' : 'BLOCKED';

      const hold = await tx.workflowHold.create({
        data: {
          activationId,
          stageId: stage?.id ?? null,
          kind,
          reason: input.reason.trim(),
          pendingAction: input.pendingAction?.trim() ?? null,
          dependency: input.dependency?.trim() ?? null,
          responsibleUserId: input.responsibleUserId,
          followUpAt: input.followUpAt,
          previousActivationStatus: activation.status,
          previousStageStatus: holdsStage ? stage.status : null,
          createdByUserId: scope.userId,
        },
      });

      // Only statuses change. Checklist rows, drafts, tasks, comments and history are left untouched.
      await tx.mentoringActivation.update({
        where: { id: activationId },
        data: { status: kind === 'HOLD' ? 'ACTIVATION_ON_HOLD' : 'ACTIVATION_BLOCKED' },
      });
      if (holdsStage) await tx.mentoringStage.update({ where: { id: stage.id }, data: { status: stageTarget } });

      await this.history.record(tx, {
        activationId,
        stageId: stage?.id ?? null,
        type: kind === 'HOLD' ? 'WORKFLOW_PAUSED' : 'WORKFLOW_BLOCKED',
        actorUserId: scope.userId,
        fromStatus: activation.status,
        toStatus: kind === 'HOLD' ? 'ACTIVATION_ON_HOLD' : 'ACTIVATION_BLOCKED',
        reason: input.reason,
        payload: {
          holdId: hold.id,
          stageNumber: activation.currentStage,
          pendingAction: input.pendingAction ?? null,
          dependency: input.dependency ?? null,
          responsibleUserId: input.responsibleUserId,
          followUpAt: input.followUpAt.toISOString(),
        },
      });
      await this.history.notify(tx, {
        recipientUserIds: [activation.currentMentorUserId, input.responsibleUserId, ...(await this.history.headUserIds(tx))],
        type: kind === 'HOLD' ? 'MENTORING_PAUSED' : 'MENTORING_BLOCKED',
        activationId,
        message: kind === 'HOLD' ? 'A student activation workflow was paused.' : 'A student activation workflow is blocked.',
        dedupeKey: `${kind}:${hold.id}`,
        excludeUserId: scope.userId,
      });
      return { holdId: hold.id, stageNumber: activation.currentStage };
    });
  }

  pause(activationId: string, input: HoldInput, scope: MentoringScope) {
    return this.holdInternal(activationId, 'HOLD', input, scope);
  }

  block(activationId: string, input: HoldInput, scope: MentoringScope) {
    return this.holdInternal(activationId, 'BLOCK', input, scope);
  }

  /** Restores the exact saved activation and stage statuses. Nothing is re-created or reset. */
  async resume(activationId: string, resolution: string | undefined, scope: MentoringScope) {
    return this.prisma.$transaction(async (tx: PrismaTxClient) => {
      const activation = await this.loadLocked(tx, activationId);
      this.assertMentorOrHead(activation, scope);
      if (activation.status !== 'ACTIVATION_ON_HOLD' && activation.status !== 'ACTIVATION_BLOCKED') {
        throw new ConflictException('This workflow is not on hold');
      }
      const hold = await tx.workflowHold.findFirst({ where: { activationId, resolvedAt: null }, orderBy: { createdAt: 'desc' } });
      if (!hold) throw new ConflictException('No open pause or blocker found');

      await tx.workflowHold.update({
        where: { id: hold.id },
        data: { resolvedAt: new Date(), resolvedByUserId: scope.userId, resolution: resolution?.trim() || null },
      });
      await tx.mentoringActivation.update({ where: { id: activationId }, data: { status: hold.previousActivationStatus } });

      let stageNumber = activation.currentStage;
      if (hold.stageId) {
        const stage = activation.stages.find((s) => s.id === hold.stageId);
        if (stage) {
          stageNumber = stage.stageNumber;
          if (hold.previousStageStatus && (stage.status === 'ON_HOLD' || stage.status === 'BLOCKED')) {
            await tx.mentoringStage.update({ where: { id: stage.id }, data: { status: hold.previousStageStatus } });
          }
        }
      }
      await this.history.record(tx, {
        activationId,
        stageId: hold.stageId,
        type: 'WORKFLOW_RESUMED',
        actorUserId: scope.userId,
        fromStatus: activation.status,
        toStatus: hold.previousActivationStatus,
        reason: resolution ?? null,
        payload: { holdId: hold.id, stageNumber, kind: hold.kind },
      });
      await this.history.notify(tx, {
        recipientUserIds: [activation.currentMentorUserId, hold.responsibleUserId, ...(await this.history.headUserIds(tx))],
        type: 'MENTORING_RESUMED',
        activationId,
        message: 'A student activation workflow was resumed.',
        dedupeKey: `RESUMED:${hold.id}`,
        excludeUserId: scope.userId,
      });
      return { activationId, stageNumber, status: hold.previousActivationStatus };
    });
  }

  // ─── Head: exceptions, final approval, cancellation ───────────────────────

  async authorizeException(activationId: string, stageNumber: number, itemKey: string, reason: string, userId: string) {
    if (!reason?.trim()) throw new BadRequestException('A reason is required for an exception');
    const def = getChecklistDefinition(stageNumber).find((d) => d.key === itemKey);
    if (!def) throw new BadRequestException('Unknown checklist item for this stage');
    if (!def.mandatory) throw new BadRequestException('Only mandatory items need an exception');

    return this.prisma.$transaction(async (tx: PrismaTxClient) => {
      const activation = await this.loadLocked(tx, activationId);
      if (activation.status === 'ACTIVATED' || activation.status === 'CANCELLED') {
        throw new ConflictException('This activation is closed');
      }
      const stage = this.stageOf(activation, stageNumber);
      const exception = await tx.workflowException.upsert({
        where: { stageId_itemKey: { stageId: stage.id, itemKey } },
        create: { stageId: stage.id, itemKey, reason: reason.trim(), authorizedByUserId: userId },
        update: { reason: reason.trim(), authorizedByUserId: userId },
      });
      await this.history.record(tx, {
        activationId,
        stageId: stage.id,
        type: 'EXCEPTION_AUTHORIZED',
        actorUserId: userId,
        reason,
        payload: { stageNumber, itemKey },
      });
      await this.history.notify(tx, {
        recipientUserIds: [activation.currentMentorUserId],
        type: 'MENTORING_EXCEPTION',
        activationId,
        message: `An exception was authorised for "${def.label}".`,
        dedupeKey: `EXCEPTION:${exception.id}:${exception.createdAt.getTime()}`,
        excludeUserId: userId,
      });
      await this.reevaluateStage(tx, stage.id);
      return exception;
    });
  }

  async decideApproval(
    activationId: string,
    dto: { decision: 'APPROVED' | 'RETURNED'; comment?: string; returnToStage?: number },
    userId: string,
  ) {
    if (dto.decision === 'RETURNED') {
      if (!dto.comment?.trim()) throw new BadRequestException('A comment is required when returning an activation');
      if (!dto.returnToStage || !getStageDefinition(dto.returnToStage)) throw new BadRequestException('Choose the stage to return to');
    }

    return this.prisma.$transaction(async (tx: PrismaTxClient) => {
      const activation = await this.loadLocked(tx, activationId);
      if (activation.status !== 'PENDING_FINAL_APPROVAL') throw new ConflictException('This activation is not waiting for approval');
      const approval = await tx.finalApproval.findFirst({ where: { activationId, decision: 'PENDING' }, orderBy: { submittedAt: 'desc' } });
      if (!approval) throw new ConflictException('No pending approval found');

      // Four-eyes rule: the assigned Mentor and whoever submitted the activation can never approve it.
      if (userId === activation.currentMentorUserId || userId === approval.submittedByUserId) {
        throw new ForbiddenException('The Mentor who worked on this student cannot approve its activation');
      }

      await tx.finalApproval.update({
        where: { id: approval.id },
        data: { decision: dto.decision, decidedByUserId: userId, decidedAt: new Date(), comment: dto.comment?.trim() || null, returnToStage: dto.returnToStage ?? null },
      });

      if (dto.decision === 'APPROVED') {
        await tx.mentoringActivation.update({ where: { id: activationId }, data: { status: 'ACTIVATED', activatedAt: new Date() } });
      } else {
        const stage = this.stageOf(activation, dto.returnToStage!);
        await tx.mentoringStage.update({
          where: { id: stage.id },
          data: { status: 'IN_PROGRESS', completedAt: null, pendingReviewAt: null, verifiedByUserId: null },
        });
        await tx.mentoringActivation.update({
          where: { id: activationId },
          data: { status: 'ACTIVATION_IN_PROGRESS', currentStage: dto.returnToStage!, submittedForApprovalAt: null },
        });
      }

      await this.history.record(tx, {
        activationId,
        type: dto.decision === 'APPROVED' ? 'APPROVAL_APPROVED' : 'APPROVAL_RETURNED',
        actorUserId: userId,
        fromStatus: 'PENDING_FINAL_APPROVAL',
        toStatus: dto.decision === 'APPROVED' ? 'ACTIVATED' : 'ACTIVATION_IN_PROGRESS',
        reason: dto.comment ?? null,
        payload: { approvalId: approval.id, returnToStage: dto.returnToStage ?? null },
      });
      await this.history.notify(tx, {
        recipientUserIds: [activation.currentMentorUserId, approval.submittedByUserId],
        type: dto.decision === 'APPROVED' ? 'MENTORING_ACTIVATED' : 'MENTORING_RETURNED',
        activationId,
        message: dto.decision === 'APPROVED' ? 'Phase 1 activation was approved.' : `Activation returned to stage ${dto.returnToStage} for correction.`,
        dedupeKey: `APPROVAL_DECIDED:${approval.id}`,
        excludeUserId: userId,
      });
      return { activationId, decision: dto.decision };
    });
  }

  async cancel(activationId: string, reason: string, userId: string) {
    if (!reason?.trim()) throw new BadRequestException('A reason is required');
    return this.prisma.$transaction(async (tx: PrismaTxClient) => {
      const activation = await this.loadLocked(tx, activationId);
      if (activation.status === 'ACTIVATED' || activation.status === 'CANCELLED') throw new ConflictException('This activation is already closed');

      await tx.mentorAssignment.updateMany({ where: { activationId, currentKey: activationId }, data: { currentKey: null, endedAt: new Date() } });
      await tx.mentoringTask.updateMany({
        where: { activationId, status: { in: ['OPEN', 'IN_PROGRESS', 'RETURNED', 'ON_HOLD', 'SUBMITTED'] } },
        data: { status: 'CANCELLED' },
      });
      await tx.workflowHold.updateMany({
        where: { activationId, resolvedAt: null },
        data: { resolvedAt: new Date(), resolvedByUserId: userId, resolution: 'Activation cancelled' },
      });
      await tx.mentoringActivation.update({
        where: { id: activationId },
        data: { status: 'CANCELLED', cancelledAt: new Date(), cancelReason: reason.trim(), currentMentorUserId: null },
      });
      await this.history.record(tx, {
        activationId,
        type: 'ACTIVATION_CANCELLED',
        actorUserId: userId,
        fromStatus: activation.status,
        toStatus: 'CANCELLED',
        reason,
      });
      await this.history.notify(tx, {
        recipientUserIds: [activation.currentMentorUserId],
        type: 'MENTORING_CANCELLED',
        activationId,
        message: 'A student activation was cancelled.',
        dedupeKey: `CANCELLED:${activationId}`,
        excludeUserId: userId,
      });
      return { activationId };
    });
  }

  // ─── Read models (scoped in the database query) ────────────────────────────

  async list(
    scope: MentoringScope,
    q: { status?: string; stage?: number; mentorUserId?: string; search?: string; page?: number; pageSize?: number },
  ) {
    const pageSize = Math.min(Math.max(q.pageSize ?? 25, 1), 100);
    const page = Math.max(q.page ?? 1, 1);
    const and: Prisma.MentoringActivationWhereInput[] = [this.access.visibilityWhere(scope)];
    if (q.status) and.push({ status: q.status as never });
    if (q.stage) and.push({ currentStage: q.stage });
    if (q.mentorUserId) and.push({ currentMentorUserId: q.mentorUserId });
    if (q.search?.trim()) {
      const s = q.search.trim();
      and.push({
        student: {
          OR: [
            { firstName: { contains: s, mode: 'insensitive' } },
            { lastName: { contains: s, mode: 'insensitive' } },
            { businessId: { contains: s, mode: 'insensitive' } },
          ],
        },
      });
    }
    const where: Prisma.MentoringActivationWhereInput = { AND: and };

    const [total, rows] = await Promise.all([
      this.prisma.mentoringActivation.count({ where }),
      this.prisma.mentoringActivation.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          id: true,
          status: true,
          currentStage: true,
          currentMentorUserId: true,
          createdAt: true,
          student: { select: { businessId: true, firstName: true, lastName: true } },
          stages: { select: { stageNumber: true, status: true } },
        },
      }),
    ]);

    const mentorIds = Array.from(new Set(rows.map((r) => r.currentMentorUserId).filter((x): x is string => !!x)));
    const emps = await this.prisma.employee.findMany({ where: { userId: { in: mentorIds } }, select: { userId: true, firstName: true, lastName: true } });
    const names = new Map(emps.map((e) => [e.userId, `${e.firstName} ${e.lastName}`]));

    return {
      total,
      page,
      pageSize,
      items: rows.map((r) => ({
        activationId: r.id,
        status: r.status,
        currentStage: r.currentStage,
        currentStageStatus: r.stages.find((s) => s.stageNumber === r.currentStage)?.status ?? 'NOT_STARTED',
        completedStages: r.stages.filter((s) => s.status === 'COMPLETED').length,
        studentBusinessId: r.student.businessId,
        studentName: [r.student.firstName, r.student.lastName].filter(Boolean).join(' '),
        mentorUserId: r.currentMentorUserId,
        mentorName: r.currentMentorUserId ? (names.get(r.currentMentorUserId) ?? null) : null,
        enrolledAt: r.createdAt,
      })),
    };
  }

  async getWorkspace(activationId: string, scope: MentoringScope) {
    const where: Prisma.MentoringActivationWhereInput = { AND: [{ id: activationId }, this.access.visibilityWhere(scope)] };
    const activation = await this.prisma.mentoringActivation.findFirst({
      where,
      include: {
        student: { select: { id: true, businessId: true, firstName: true, lastName: true, currentGrade: true, grade: { select: { name: true } }, curriculum: { select: { name: true } } } },
        lead: { select: { businessId: true, firstName: true, lastName: true, primaryPhone: true, altPhone1: true, altPhone2: true, whatsappNumber: true } },
        handover: { select: { status: true, completedAt: true, missingFields: true, transferredFields: true, sourceSnapshot: true } },
        stages: { orderBy: { stageNumber: 'asc' }, include: { checklist: true, exceptions: true } },
        holds: { orderBy: { createdAt: 'desc' }, take: 20 },
        approvals: { orderBy: { submittedAt: 'desc' }, take: 5 },
      },
    });
    if (!activation) throw new NotFoundException('Student not found');

    const seeParent = this.access.canSeeParentContact(scope, activation);
    const isMentorOrHead = scope.all || activation.currentMentorUserId === scope.userId;

    const [tasks, events, mentor] = await Promise.all([
      this.prisma.mentoringTask.findMany({
        where: { activationId, ...(isMentorOrHead ? {} : { assigneeUserId: scope.userId }) },
        orderBy: { createdAt: 'desc' },
        include: { comments: { orderBy: { createdAt: 'asc' } } },
      }),
      isMentorOrHead
        ? this.prisma.mentoringEvent.findMany({ where: { activationId }, orderBy: { createdAt: 'desc' }, take: 200 })
        : Promise.resolve([]),
      activation.currentMentorUserId
        ? this.prisma.employee.findFirst({ where: { userId: activation.currentMentorUserId }, select: { firstName: true, lastName: true } })
        : Promise.resolve(null),
    ]);

    const strip = (fields: unknown) =>
      Array.isArray(fields) ? fields.filter((f) => !(f && typeof f === 'object' && PARENT_CONTACT_FIELDS.has((f as { field: string }).field))) : fields;

    const handover = activation.handover && {
      status: activation.handover.status,
      completedAt: activation.handover.completedAt,
      missingFields: activation.handover.missingFields,
      transferredFields: seeParent ? activation.handover.transferredFields : strip(activation.handover.transferredFields),
      sourceSnapshot: seeParent ? activation.handover.sourceSnapshot : undefined,
    };

    return {
      activation: {
        id: activation.id,
        status: activation.status,
        currentStage: activation.currentStage,
        currentMentorUserId: activation.currentMentorUserId,
        currentMentorName: mentor ? `${mentor.firstName} ${mentor.lastName}` : null,
        submittedForApprovalAt: activation.submittedForApprovalAt,
        activatedAt: activation.activatedAt,
      },
      student: activation.student,
      parent: seeParent
        ? { name: [activation.lead.firstName, activation.lead.lastName].filter(Boolean).join(' '), primaryPhone: activation.lead.primaryPhone, altPhone1: activation.lead.altPhone1, altPhone2: activation.lead.altPhone2, whatsappNumber: activation.lead.whatsappNumber }
        : null,
      handover,
      stages: STAGES.map((def) => {
        const row = activation.stages.find((s) => s.stageNumber === def.number);
        const definitions = getChecklistDefinition(def.number);
        const rows = new Map((row?.checklist ?? []).map((c) => [c.itemKey, c]));
        const exceptionKeys = new Set((row?.exceptions ?? []).map((e) => e.itemKey));
        return {
          number: def.number,
          key: def.key,
          name: def.name,
          status: row?.status ?? 'NOT_STARTED',
          startedAt: row?.startedAt ?? null,
          completedAt: row?.completedAt ?? null,
          checklist: definitions.map((d) => {
            const r = rows.get(d.key);
            return {
              key: d.key,
              label: d.label,
              mandatory: d.mandatory,
              state: r?.state ?? 'PENDING_COLLECTION',
              value: r?.value ?? null,
              note: r?.note ?? null,
              reason: r?.reason ?? null,
              evidenceRef: r?.evidenceRef ?? null,
              exception: exceptionKeys.has(d.key),
              updatedAt: r?.updatedAt ?? null,
            };
          }),
        };
      }),
      openHold: activation.holds.find((h) => !h.resolvedAt) ?? null,
      holds: activation.holds,
      approvals: activation.approvals,
      tasks,
      events,
      viewer: { userId: scope.userId, isMentor: activation.currentMentorUserId === scope.userId, isHead: scope.all },
    };
  }

  async events(activationId: string, scope: MentoringScope) {
    const visible = await this.prisma.mentoringActivation.findFirst({
      where: { AND: [{ id: activationId }, this.access.visibilityWhere(scope)] },
      select: { id: true, currentMentorUserId: true },
    });
    if (!visible) throw new NotFoundException('Student not found');
    if (!scope.all && visible.currentMentorUserId !== scope.userId) throw new ForbiddenException('History is visible to the Mentor and the Mentoring Head');
    return this.prisma.mentoringEvent.findMany({ where: { activationId }, orderBy: { createdAt: 'desc' }, take: 500 });
  }
}
