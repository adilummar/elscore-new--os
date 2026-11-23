import { assertValidResult, isPass, participantBlocker, traineeStage, TrainingRuleError } from './training-rules';

const fresh = { session1PassedAt: null, session2PassedAt: null, pendingSessions: [] as number[] };
const day = new Date('2026-11-20T10:00:00Z');

describe('training rules', () => {
  it('passes only when Attended AND the task is Completed', () => {
    expect(isPass({ attendance: 'ATTENDED', taskCompleted: true })).toBe(true);
    expect(isPass({ attendance: 'ATTENDED', taskCompleted: false })).toBe(false);
    expect(isPass({ attendance: 'ATTENDED_NOT_COMPLETED', taskCompleted: true })).toBe(false);
    expect(isPass({ attendance: 'NOT_ATTENDED', taskCompleted: false })).toBe(false);
    expect(isPass({ attendance: null, taskCompleted: null })).toBe(false);
  });

  it("requires remarks for Attended but Didn't Complete; Not Attended reason is optional", () => {
    expect(() => assertValidResult({ attendance: 'ATTENDED_NOT_COMPLETED', taskCompleted: false })).toThrow(/Remarks are required/);
    expect(() => assertValidResult({ attendance: 'ATTENDED_NOT_COMPLETED', taskCompleted: false, remarks: 'left at 20 min' })).not.toThrow();
    expect(() => assertValidResult({ attendance: 'NOT_ATTENDED', taskCompleted: false })).not.toThrow();
  });

  it('refuses a completed task for someone who did not attend', () => {
    expect(() => assertValidResult({ attendance: 'NOT_ATTENDED', taskCompleted: true })).toThrow(TrainingRuleError);
  });

  it('locks Session 2 until Session 1 is passed, and blocks double booking', () => {
    expect(participantBlocker(fresh, 1)).toBeNull();
    expect(participantBlocker(fresh, 2)).toMatch(/Session 1 must be passed/);
    expect(participantBlocker({ ...fresh, pendingSessions: [1] }, 1)).toMatch(/not been recorded/);
    const s1 = { ...fresh, session1PassedAt: day };
    expect(participantBlocker(s1, 1)).toMatch(/already passed/);
    expect(participantBlocker(s1, 2)).toBeNull();
    expect(participantBlocker({ ...s1, session2PassedAt: day }, 2)).toMatch(/complete/);
    expect(participantBlocker(fresh, 3)).toMatch(/Unknown/);
  });

  it('allows a repeat of the same session after a failed attempt (nothing pending)', () => {
    // A failed Session 1 leaves session1PassedAt null and no pending attempt, so Session 1 is open again.
    expect(participantBlocker(fresh, 1)).toBeNull();
  });

  it('derives overall progress', () => {
    expect(traineeStage(fresh)).toBe('AWAITING_SESSION_1');
    expect(traineeStage({ ...fresh, pendingSessions: [1] })).toBe('SESSION_1_SCHEDULED');
    expect(traineeStage({ ...fresh, session1PassedAt: day })).toBe('AWAITING_SESSION_2');
    expect(traineeStage({ ...fresh, session1PassedAt: day, pendingSessions: [2] })).toBe('SESSION_2_SCHEDULED');
    expect(traineeStage({ ...fresh, session1PassedAt: day, session2PassedAt: day })).toBe('COMPLETED');
  });
});
