/**
 * Pure recruitment rules for the Hiring workflow: stages are ordered and advanced
 * explicitly; decisions are a separate manual field with their own restrictions.
 */
export const HIRING_STAGES = ['LEAD', 'DETAILS_SHARED', 'CV', 'LIVE_DEMO_INTERVIEW'] as const;
export type HiringStage = (typeof HIRING_STAGES)[number];

export const HIRING_DECISIONS = ['ACCEPTED', 'HIRED', 'REJECTED', 'NOT_INTERESTED', 'NO_RESPONSE'] as const;
export type HiringDecision = (typeof HIRING_DECISIONS)[number];

export class HiringRuleError extends Error {}

/**
 * CONFIRMED by the business: Hired may only be chosen from Accepted, and only Hired candidates
 * may enter Training. Kept behind this flag so the rule lives in one place.
 */
export const HIRED_REQUIRES_ACCEPTED = true;

/** Staff explicitly completes a stage; only the next stage in order is allowed. */
export function assertStageAdvance(current: HiringStage, next: HiringStage): void {
  const i = HIRING_STAGES.indexOf(current);
  const j = HIRING_STAGES.indexOf(next);
  if (i < 0 || j < 0) throw new HiringRuleError('Unknown stage');
  if (j !== i + 1) {
    throw new HiringRuleError(
      j <= i ? 'Stages cannot move backwards or repeat' : `Stages cannot be skipped: complete ${HIRING_STAGES[i + 1]} first`,
    );
  }
}

/**
 * Decision restrictions:
 *  - REJECTED / NOT_INTERESTED: any stage.
 *  - NO_RESPONSE: only once the candidate has reached Live Demo & Interview.
 *  - ACCEPTED: only at Live Demo & Interview (approval follows the demo).
 *  - HIRED: from ACCEPTED only (confirmed; see HIRED_REQUIRES_ACCEPTED).
 * Decisions are never set automatically; this validates a manual change.
 */
export function assertDecisionChange(
  stage: HiringStage,
  current: HiringDecision | null,
  next: HiringDecision,
): void {
  if (current === next) throw new HiringRuleError('Candidate already has this decision');
  switch (next) {
    case 'REJECTED':
    case 'NOT_INTERESTED':
      return;
    case 'NO_RESPONSE':
    case 'ACCEPTED':
      if (stage !== 'LIVE_DEMO_INTERVIEW') {
        throw new HiringRuleError(`${next} is only available at the Live Demo & Interview stage`);
      }
      return;
    case 'HIRED':
      if (HIRED_REQUIRES_ACCEPTED && current !== 'ACCEPTED') throw new HiringRuleError('Only an Accepted candidate can be marked Hired');
      return;
    default:
      throw new HiringRuleError('Unknown decision');
  }
}

/** Only Hired candidates may ever move to Training (future phase). */
export function canTransitionToTraining(decision: HiringDecision | null): boolean {
  return decision === 'HIRED';
}
