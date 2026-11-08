import { ConflictException, NotFoundException } from '@nestjs/common';

import { PrismaTxClient } from '../../common/prisma/prisma.service';

/** Stage 2 statuses from which the Mentor works with the parent. Collection, verification and tutor selection start here. */
export const MEETING_OPEN_STATUSES: ReadonlySet<string> = new Set(['IN_PROGRESS', 'PENDING_REVIEW', 'COMPLETED']);

/** Locks the student's workflow row for the rest of the transaction and loads it with its stages. */
export async function loadLockedActivation(tx: PrismaTxClient, activationId: string) {
  await tx.$executeRaw`SELECT 1 FROM mentoring_activations WHERE id = ${activationId} FOR UPDATE`;
  const activation = await tx.mentoringActivation.findUnique({ where: { id: activationId }, include: { stages: true } });
  if (!activation) throw new NotFoundException('Activation not found');
  return activation;
}

export function assertWorkable(activation: { status: string }) {
  if (activation.status === 'ACTIVATION_ON_HOLD' || activation.status === 'ACTIVATION_BLOCKED') {
    throw new ConflictException('This student workflow is on hold. Resume it first.');
  }
  if (activation.status !== 'ACTIVATION_IN_PROGRESS') {
    throw new ConflictException(`The workflow is not in progress (${activation.status})`);
  }
}

/**
 * Information is collected and confirmed in Stage 2 (Meeting with Parents). Stage 1 only presents the handover,
 * so nothing can be saved before the Mentor has started Stage 2.
 */
export function assertMeetingStarted(activation: { stages: Array<{ stageNumber: number; status: string }> }) {
  const meeting = activation.stages.find((s) => s.stageNumber === 2);
  if (!meeting || !MEETING_OPEN_STATUSES.has(meeting.status)) {
    throw new ConflictException('Information is collected in the Meeting with Parents stage. Complete the handover review and start that stage first.');
  }
}
