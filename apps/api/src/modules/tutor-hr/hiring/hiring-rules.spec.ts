import { assertDecisionChange, assertStageAdvance, canTransitionToTraining, HiringRuleError } from './hiring-rules';

describe('stage advance', () => {
  it('allows only the next stage', () => {
    expect(() => assertStageAdvance('LEAD', 'DETAILS_SHARED')).not.toThrow();
    expect(() => assertStageAdvance('LEAD', 'CV')).toThrow(HiringRuleError);
    expect(() => assertStageAdvance('CV', 'DETAILS_SHARED')).toThrow(HiringRuleError);
    expect(() => assertStageAdvance('LIVE_DEMO_INTERVIEW', 'LIVE_DEMO_INTERVIEW')).toThrow(HiringRuleError);
  });
});

describe('decision rules', () => {
  it('Rejected and Not Interested at any stage', () => {
    for (const s of ['LEAD', 'DETAILS_SHARED', 'CV', 'LIVE_DEMO_INTERVIEW'] as const) {
      expect(() => assertDecisionChange(s, null, 'REJECTED')).not.toThrow();
      expect(() => assertDecisionChange(s, null, 'NOT_INTERESTED')).not.toThrow();
    }
  });
  it('No Response only at Live Demo & Interview', () => {
    expect(() => assertDecisionChange('CV', null, 'NO_RESPONSE')).toThrow(HiringRuleError);
    expect(() => assertDecisionChange('LIVE_DEMO_INTERVIEW', null, 'NO_RESPONSE')).not.toThrow();
  });
  it('Hired requires Accepted first', () => {
    expect(() => assertDecisionChange('LIVE_DEMO_INTERVIEW', null, 'HIRED')).toThrow(HiringRuleError);
    expect(() => assertDecisionChange('LIVE_DEMO_INTERVIEW', 'ACCEPTED', 'HIRED')).not.toThrow();
  });
  it('rejects no-op changes; only Hired may reach Training', () => {
    expect(() => assertDecisionChange('LEAD', 'REJECTED', 'REJECTED')).toThrow(HiringRuleError);
    expect(canTransitionToTraining('ACCEPTED')).toBe(false);
    expect(canTransitionToTraining(null)).toBe(false);
    expect(canTransitionToTraining('HIRED')).toBe(true);
  });
});
