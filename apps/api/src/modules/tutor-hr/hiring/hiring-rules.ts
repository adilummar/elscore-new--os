/**
 * Pure recruitment rules for the Hiring workflow. Three independent things are tracked:
 *  - stage: ordered, advanced explicitly by staff (Training is entered only by marking Hired);
 *  - lead status: overall pipeline state (Processing / Rejected / Not Interested);
 *  - decision: the post-demo candidate decision.
 */

export const HIRING_STAGES = ['LEAD', 'DETAILS_SHARED', 'CV', 'LIVE_DEMO_INTERVIEW', 'TRAINING'] as const;
export type HiringStage = (typeof HIRING_STAGES)[number];

export const HIRING_DECISIONS = ['ACCEPTED', 'HIRED', 'REJECTED', 'NOT_INTERESTED', 'NO_RESPONSE'] as const;
export type HiringDecision = (typeof HIRING_DECISIONS)[number];

export const LEAD_STATUSES = ['PROCESSING', 'REJECTED', 'NOT_INTERESTED'] as const;
export type LeadStatus = (typeof LEAD_STATUSES)[number];

export class HiringRuleError extends Error {}

/**
 * CONFIRMED by the business: Hired may only be chosen from Accepted, and only Hired candidates
 * may enter Training. Kept behind this flag so the rule lives in one place.
 */
export const HIRED_REQUIRES_ACCEPTED = true;

export function stageIndex(stage: HiringStage | null | undefined): number {
  return HIRING_STAGES.indexOf(stage ?? 'LEAD');
}

/** Staff explicitly completes a stage; only the next stage in order is allowed, and never Training. */
export function assertStageAdvance(current: HiringStage, next: HiringStage): void {
  const i = HIRING_STAGES.indexOf(current);
  const j = HIRING_STAGES.indexOf(next);
  if (i < 0 || j < 0) throw new HiringRuleError('Unknown stage');
  if (next === 'TRAINING') {
    throw new HiringRuleError('Training starts automatically when the candidate is marked Hired');
  }
  if (j !== i + 1) {
    throw new HiringRuleError(
      j <= i ? 'Stages cannot move backwards or repeat' : `Stages cannot be skipped: complete ${HIRING_STAGES[i + 1]} first`,
    );
  }
}

/** Remarks are mandatory for Rejected and Not Interested (decision and lead status alike). */
export function remarksRequired(value: HiringDecision | LeadStatus): boolean {
  return value === 'REJECTED' || value === 'NOT_INTERESTED';
}

function assertRemarks(value: HiringDecision | LeadStatus, remarks: string | undefined | null): void {
  if (remarksRequired(value) && !remarks?.trim()) {
    throw new HiringRuleError(`Remarks are required for ${value === 'REJECTED' ? 'Rejected' : 'Not Interested'}`);
  }
}

/** Lead Status can move between any two values; Rejected / Not Interested need remarks. */
export function assertLeadStatusChange(current: LeadStatus, next: LeadStatus, remarks?: string | null): void {
  if (!LEAD_STATUSES.includes(next)) throw new HiringRuleError('Unknown lead status');
  if (current === next) throw new HiringRuleError('Candidate already has this lead status');
  assertRemarks(next, remarks);
}

/** Lead status implied by a decision, if any. */
export function leadStatusForDecision(decision: HiringDecision): Exclude<LeadStatus, 'PROCESSING'> | null {
  return decision === 'REJECTED' || decision === 'NOT_INTERESTED' ? decision : null;
}

/**
 * Post-demo decision rules (all decisions are manual):
 *  - only at Live Demo & Interview, and only while the lead status is Processing
 *    (before the demo, staff use Lead Status for Rejected / Not Interested);
 *  - Hired only from Accepted, and is final (the candidate has moved to Training);
 *  - remarks mandatory for Rejected and Not Interested, optional otherwise.
 */
export function assertDecisionChange(
  stage: HiringStage,
  current: HiringDecision | null,
  next: HiringDecision,
  leadStatus: LeadStatus = 'PROCESSING',
  remarks?: string | null,
): void {
  if (!HIRING_DECISIONS.includes(next)) throw new HiringRuleError('Unknown decision');
  if (current === 'HIRED') throw new HiringRuleError('A Hired candidate has moved to Training; the decision is final');
  if (current === next) throw new HiringRuleError('Candidate already has this decision');
  if (leadStatus !== 'PROCESSING') {
    throw new HiringRuleError('Set the lead status back to Processing before recording a decision');
  }
  if (stage !== 'LIVE_DEMO_INTERVIEW') {
    throw new HiringRuleError('Candidate decisions are recorded only at the Live Demo & Interview stage');
  }
  if (next === 'HIRED' && HIRED_REQUIRES_ACCEPTED && current !== 'ACCEPTED') {
    throw new HiringRuleError('Only an Accepted candidate can be marked Hired');
  }
  assertRemarks(next, remarks);
}

/** Only Hired candidates may ever move to Training. */
export function canTransitionToTraining(decision: HiringDecision | null): boolean {
  return decision === 'HIRED';
}
