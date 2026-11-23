import { OBSERVATION_STATUSES, assignmentText, observationLabel } from './constants';

describe('coordination constants', () => {
  it('has the three observation statuses', () => {
    expect(OBSERVATION_STATUSES.map((s) => s.label)).toEqual(['Observed', 'Not Observed', 'Pending']);
    expect(observationLabel(null)).toBe('Not assigned');
  });
  it('describes assignment history rows', () => {
    expect(assignmentText({ from: null, to: { email: 'a@x' } })).toBe('Assigned to a@x');
    expect(assignmentText({ from: { email: 'a@x' }, to: { email: 'b@x' } })).toBe('Reassigned from a@x to b@x');
    expect(assignmentText({ from: { email: 'a@x' }, to: null })).toBe('Unassigned from a@x');
  });
});
