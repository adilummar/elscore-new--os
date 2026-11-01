import { PrismaTxClient } from '../../common/prisma/prisma.service';

import { CHECKLIST_DEFINITION_VERSION, STAGES, getChecklistDefinition, getStageDefinition } from './mentoring.constants';

/** Creates any of the seven stage rows that do not exist yet. Idempotent. */
export async function ensureStageRows(tx: PrismaTxClient, activationId: string): Promise<void> {
  const existing = await tx.mentoringStage.findMany({ where: { activationId }, select: { stageNumber: true } });
  const have = new Set(existing.map((s) => s.stageNumber));
  const missing = STAGES.filter((s) => !have.has(s.number));
  if (missing.length === 0) return;
  await tx.mentoringStage.createMany({
    data: missing.map((s) => ({ activationId, stageNumber: s.number, key: s.key, status: 'NOT_STARTED' as const })),
    skipDuplicates: true,
  });
}

/** Creates the checklist rows for a stage from its definition. Idempotent; never touches existing rows. */
export async function ensureChecklistRows(tx: PrismaTxClient, stageId: string, stageNumber: number): Promise<void> {
  const defs = getChecklistDefinition(stageNumber);
  if (defs.length === 0) return;
  await tx.stageChecklistResponse.createMany({
    data: defs.map((d) => ({
      stageId,
      itemKey: d.key,
      mandatory: d.mandatory,
      definitionVersion: CHECKLIST_DEFINITION_VERSION,
    })),
    skipDuplicates: true,
  });
}

/** Moves a stage to IN_PROGRESS and prepares its checklist. Used by the Mentor and by allocation (Stage 1). */
export async function openStage(tx: PrismaTxClient, activationId: string, stageNumber: number): Promise<string> {
  if (!getStageDefinition(stageNumber)) throw new Error(`Unknown stage ${stageNumber}`);
  await ensureStageRows(tx, activationId);
  const stage = await tx.mentoringStage.findUniqueOrThrow({
    where: { activationId_stageNumber: { activationId, stageNumber } },
  });
  await ensureChecklistRows(tx, stage.id, stageNumber);
  if (stage.status === 'NOT_STARTED') {
    await tx.mentoringStage.update({
      where: { id: stage.id },
      data: { status: 'IN_PROGRESS', startedAt: new Date() },
    });
    await tx.mentoringActivation.update({ where: { id: activationId }, data: { currentStage: stageNumber } });
  }
  return stage.id;
}

export interface ChecklistRowLike {
  itemKey: string;
  mandatory: boolean;
  state: string;
  reason: string | null;
}

/** Mandatory items that are not yet resolved. An item is resolved when the Mentor VERIFIED it, marked it
 * UNAVAILABLE / NOT_APPLICABLE with a reason, or the Head authorised an exception for it. */
export function unresolvedMandatoryItems(rows: ChecklistRowLike[], exceptionKeys: ReadonlySet<string>): string[] {
  return rows
    .filter((r) => r.mandatory)
    .filter((r) => {
      if (exceptionKeys.has(r.itemKey)) return false;
      if (r.state === 'VERIFIED') return false;
      if ((r.state === 'UNAVAILABLE' || r.state === 'NOT_APPLICABLE') && r.reason?.trim()) return false;
      return true;
    })
    .map((r) => r.itemKey);
}
