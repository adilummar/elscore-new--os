import {
  assertAssignable, assertAssignmentChange, assertObservation, assignmentKind, CoordinationRuleError, observationStatus, SESSION_CONDUCTOR_ROLES,
} from './coordination-rules';

const now = new Date('2026-11-23T10:00:00Z');
const daysAgo = (d: number) => new Date(now.getTime() - d * 86_400_000);

describe('coordination rules', () => {
  it('Observed when there is at least one observation this month', () => {
    expect(observationStatus({ observedThisMonth: 1, assignedAt: daysAgo(30), tutorStatus: 'ACTIVE', now })).toBe('OBSERVED');
    expect(observationStatus({ observedThisMonth: 2, assignedAt: daysAgo(1), tutorStatus: 'INACTIVE', now })).toBe('OBSERVED');
  });
  it('Pending when none yet and assigned under 7 days ago or not yet Active', () => {
    expect(observationStatus({ observedThisMonth: 0, assignedAt: daysAgo(6), tutorStatus: 'ACTIVE', now })).toBe('PENDING');
    expect(observationStatus({ observedThisMonth: 0, assignedAt: daysAgo(40), tutorStatus: 'INACTIVE', now })).toBe('PENDING');
    expect(observationStatus({ observedThisMonth: 0, assignedAt: daysAgo(40), tutorStatus: 'PAUSED', now })).toBe('PENDING');
  });
  it('Not Observed otherwise', () => {
    expect(observationStatus({ observedThisMonth: 0, assignedAt: daysAgo(7), tutorStatus: 'ACTIVE', now })).toBe('NOT_OBSERVED');
  });

  it('assigns any status except Discontinued', () => {
    for (const s of ['ACTIVE', 'INACTIVE', 'PAUSED', 'SUSPENDED']) expect(() => assertAssignable(s)).not.toThrow();
    expect(() => assertAssignable('DISCONTINUED')).toThrow(CoordinationRuleError);
  });

  it('unassigning needs a reason; no-op changes are refused', () => {
    expect(() => assertAssignmentChange('c1', null)).toThrow(/reason/);
    expect(() => assertAssignmentChange('c1', null, 'left the team')).not.toThrow();
    expect(() => assertAssignmentChange('c1', 'c1')).toThrow(/already assigned/);
    expect(() => assertAssignmentChange(null, null, 'x')).toThrow(/not assigned/);
    expect([assignmentKind(null, 'c1'), assignmentKind('c1', 'c2'), assignmentKind('c1', null)]).toEqual(['ASSIGNED', 'REASSIGNED', 'UNASSIGNED']);
  });

  it('an observation needs feedback and a past date', () => {
    expect(() => assertObservation({ observedAt: now, positiveFeedback: ' ', negativeFeedback: '' }, now)).toThrow(/feedback/);
    expect(() => assertObservation({ observedAt: new Date(now.getTime() + 86_400_000), positiveFeedback: 'good' }, now)).toThrow(/future/);
    expect(() => assertObservation({ observedAt: daysAgo(1), negativeFeedback: 'late start' }, now)).not.toThrow();
  });

  it('Session 1 is conducted by coordinators or the Tutor Head; Session 2 by HR', () => {
    expect(SESSION_CONDUCTOR_ROLES[1]).toEqual(['TUTOR_COORDINATOR', 'TUTOR_HEAD']);
    expect(SESSION_CONDUCTOR_ROLES[2]).toEqual(['HR_MANAGER', 'HR_EXECUTIVE']);
  });
});
