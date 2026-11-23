import { ATTENDANCE, TRAINEE_STAGE, candidateName, isPass, remarksRequired } from './constants';

describe('training constants', () => {
  it('lists the three confirmed attendance statuses', () => {
    expect(ATTENDANCE.map((a) => a.value)).toEqual(['ATTENDED', 'NOT_ATTENDED', 'ATTENDED_NOT_COMPLETED']);
  });
  it('passes only on Attended with the task completed', () => {
    expect(isPass({ attendance: 'ATTENDED', taskCompleted: true })).toBe(true);
    expect(isPass({ attendance: 'ATTENDED', taskCompleted: false })).toBe(false);
    expect(isPass({ attendance: 'ATTENDED_NOT_COMPLETED', taskCompleted: true })).toBe(false);
    expect(isPass({ attendance: null, taskCompleted: null })).toBe(false);
  });
  it("requires remarks only for Attended but Didn't Complete", () => {
    expect(remarksRequired('ATTENDED_NOT_COMPLETED')).toBe(true);
    expect(remarksRequired('NOT_ATTENDED')).toBe(false);
  });
  it('labels every trainee stage and names candidates safely', () => {
    for (const s of ['AWAITING_SESSION_1', 'SESSION_1_SCHEDULED', 'AWAITING_SESSION_2', 'SESSION_2_SCHEDULED', 'COMPLETED']) {
      expect(TRAINEE_STAGE[s]).toBeDefined();
    }
    expect(candidateName({ firstName: '', lastName: '', businessId: 'TL-9' })).toBe('TL-9');
  });
});
