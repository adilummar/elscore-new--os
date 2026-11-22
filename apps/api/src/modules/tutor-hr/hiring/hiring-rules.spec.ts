import {
  assertDecisionChange,
  assertLeadStatusChange,
  assertStageAdvance,
  canTransitionToTraining,
  HiringRuleError,
  leadStatusForDecision,
  remarksRequired,
} from './hiring-rules';

describe('stage advance', () => {
  it('allows only the next stage', () => {
    expect(() => assertStageAdvance('LEAD', 'DETAILS_SHARED')).not.toThrow();
    expect(() => assertStageAdvance('LEAD', 'CV')).toThrow(HiringRuleError);
    expect(() => assertStageAdvance('CV', 'DETAILS_SHARED')).toThrow(HiringRuleError);
    expect(() => assertStageAdvance('LIVE_DEMO_INTERVIEW', 'LIVE_DEMO_INTERVIEW')).toThrow(HiringRuleError);
  });
  it('never lets staff choose Training (it follows Hired automatically)', () => {
    expect(() => assertStageAdvance('LIVE_DEMO_INTERVIEW', 'TRAINING')).toThrow(/automatically/);
    expect(() => assertStageAdvance('TRAINING', 'LEAD')).toThrow(HiringRuleError);
  });
});

describe('lead status rules', () => {
  it('requires remarks for Rejected and Not Interested only', () => {
    expect(() => assertLeadStatusChange('PROCESSING', 'REJECTED')).toThrow(/Remarks are required/);
    expect(() => assertLeadStatusChange('PROCESSING', 'NOT_INTERESTED', ' ')).toThrow(/Remarks are required/);
    expect(() => assertLeadStatusChange('PROCESSING', 'REJECTED', 'not suitable')).not.toThrow();
    expect(() => assertLeadStatusChange('REJECTED', 'PROCESSING')).not.toThrow();
  });
  it('rejects a no-op change', () => {
    expect(() => assertLeadStatusChange('PROCESSING', 'PROCESSING')).toThrow(HiringRuleError);
  });
  it('maps Rejected / Not Interested decisions onto the Lead Status', () => {
    expect(leadStatusForDecision('REJECTED')).toBe('REJECTED');
    expect(leadStatusForDecision('NOT_INTERESTED')).toBe('NOT_INTERESTED');
    expect(leadStatusForDecision('ACCEPTED')).toBeNull();
    expect(leadStatusForDecision('NO_RESPONSE')).toBeNull();
  });
});

describe('decision rules', () => {
  const demo = 'LIVE_DEMO_INTERVIEW' as const;
  it('are recorded only at Live Demo & Interview', () => {
    for (const s of ['LEAD', 'DETAILS_SHARED', 'CV'] as const) {
      expect(() => assertDecisionChange(s, null, 'REJECTED', 'PROCESSING', 'x')).toThrow(/Live Demo/);
      expect(() => assertDecisionChange(s, null, 'NO_RESPONSE')).toThrow(HiringRuleError);
    }
    expect(() => assertDecisionChange(demo, null, 'NO_RESPONSE')).not.toThrow();
  });
  it('remarks: mandatory for Rejected / Not Interested, optional for Accepted', () => {
    expect(() => assertDecisionChange(demo, null, 'REJECTED')).toThrow(/Remarks are required/);
    expect(() => assertDecisionChange(demo, null, 'NOT_INTERESTED', 'PROCESSING', '')).toThrow(/Remarks are required/);
    expect(() => assertDecisionChange(demo, null, 'NOT_INTERESTED', 'PROCESSING', 'joined a school')).not.toThrow();
    expect(() => assertDecisionChange(demo, null, 'ACCEPTED')).not.toThrow();
    expect(remarksRequired('ACCEPTED')).toBe(false);
  });
  it('need the Lead Status to be Processing', () => {
    expect(() => assertDecisionChange(demo, null, 'ACCEPTED', 'REJECTED')).toThrow(/Processing/);
  });
  it('Hired requires Accepted first and is final', () => {
    expect(() => assertDecisionChange(demo, null, 'HIRED')).toThrow(HiringRuleError);
    expect(() => assertDecisionChange(demo, 'ACCEPTED', 'HIRED')).not.toThrow();
    expect(() => assertDecisionChange('TRAINING', 'HIRED', 'NOT_INTERESTED', 'PROCESSING', 'x')).toThrow(/final/);
  });
  it('rejects no-op changes; only Hired may reach Training', () => {
    expect(() => assertDecisionChange(demo, 'REJECTED', 'REJECTED', 'PROCESSING', 'x')).toThrow(HiringRuleError);
    expect(canTransitionToTraining('ACCEPTED')).toBe(false);
    expect(canTransitionToTraining(null)).toBe(false);
    expect(canTransitionToTraining('HIRED')).toBe(true);
  });
});
