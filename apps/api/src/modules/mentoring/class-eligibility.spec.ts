import { OPEN_CLASS_STATUSES, TIMETABLE_STAGE, classEligibility, ineligibleMessage, isActive, operationalAt, studentEligibility, timetableApproved } from './class-eligibility';

const stage = (status: string, stageNumber = TIMETABLE_STAGE) => ({ stageNumber, status });
const ALL = ['AWAITING_ALLOCATION', 'ACTIVATION_IN_PROGRESS', 'ACTIVATION_ON_HOLD', 'ACTIVATION_BLOCKED', 'PENDING_FINAL_APPROVAL', 'ACTIVATED', 'CANCELLED'];

describe('who is eligible for operational Mentoring work', () => {
  it('only an Active student is eligible for exams and meetings, and every other status says why not', () => {
    expect(studentEligibility({ status: 'ACTIVATED' })).toEqual({ eligible: true, reason: null });
    expect(studentEligibility({ status: 'AWAITING_ALLOCATION' })).toEqual({ eligible: false, reason: 'NOT_ACTIVATED' });
    expect(studentEligibility({ status: 'ACTIVATION_IN_PROGRESS' })).toEqual({ eligible: false, reason: 'NOT_ACTIVATED' });
    expect(studentEligibility({ status: 'PENDING_FINAL_APPROVAL' })).toEqual({ eligible: false, reason: 'NOT_ACTIVATED' });
    expect(studentEligibility({ status: 'ACTIVATION_ON_HOLD' })).toEqual({ eligible: false, reason: 'PAUSED' });
    expect(studentEligibility({ status: 'ACTIVATION_BLOCKED' })).toEqual({ eligible: false, reason: 'PAUSED' });
    expect(studentEligibility({ status: 'CANCELLED' })).toEqual({ eligible: false, reason: 'CANCELLED' });
    expect(studentEligibility({ status: 'SOMETHING_NEW' })).toEqual({ eligible: false, reason: 'NOT_ACTIVATED' });
    expect(ALL.filter((s) => isActive(s))).toEqual(['ACTIVATED']);
  });

  it('a class needs both: Active and an approved timetable, and neither alone is enough', () => {
    expect(classEligibility({ status: 'ACTIVATED' }, [stage('COMPLETED')])).toEqual({ eligible: true, reason: null });
    expect(classEligibility({ status: 'ACTIVATED' }, [])).toEqual({ eligible: false, reason: 'TIMETABLE_NOT_APPROVED' });
    for (const s of ['NOT_STARTED', 'IN_PROGRESS', 'PENDING_REVIEW', 'ON_HOLD', 'BLOCKED', 'CANCELLED']) expect(classEligibility({ status: 'ACTIVATED' }, [stage(s)])).toEqual({ eligible: false, reason: 'TIMETABLE_NOT_APPROVED' });
    for (const status of ALL.filter((s) => s !== 'ACTIVATED')) expect(classEligibility({ status }, [stage('COMPLETED')]).eligible).toBe(false);
  });

  it('only the timetable stage counts as the approved timetable', () => {
    expect(timetableApproved([stage('COMPLETED', 1), stage('COMPLETED', 2), stage('IN_PROGRESS', 3)])).toBe(false);
    expect(timetableApproved([stage('IN_PROGRESS', 1), stage('COMPLETED', 3)])).toBe(true);
    expect(timetableApproved([])).toBe(false);
    expect(TIMETABLE_STAGE).toBe(3);
  });

  it('says in plain words why something was refused, for classes, exams and meetings', () => {
    expect(ineligibleMessage('NOT_ACTIVATED', 'classes')).toBe('This student has not been activated yet, so classes cannot be changed.');
    expect(ineligibleMessage('PAUSED', 'exams')).toBe('This student is paused, so exams cannot be changed.');
    expect(ineligibleMessage('CANCELLED', 'meetings')).toBe('This student was cancelled, so meetings cannot be changed.');
    expect(ineligibleMessage('TIMETABLE_NOT_APPROVED', 'classes')).toBe('This student does not have an approved timetable yet, so classes cannot be changed.');
  });

  it('treats only a class that has not progressed as operational rather than history', () => {
    expect([...OPEN_CLASS_STATUSES].sort()).toEqual(['RESCHEDULED', 'SCHEDULED']);
  });
});

describe('operationalAt: after activation and outside every pause', () => {
  const d = (iso: string) => new Date(iso);
  const b = (activatedAt: string | null, holds: Array<[string, string | null]> = []) => ({ activatedAt: activatedAt ? d(activatedAt) : null, holds: holds.map(([from, to]) => ({ from: d(from), to: to ? d(to) : null })) });

  it('is false before the recorded activation and true from that moment', () => {
    const x = b('2026-11-04T08:00:00Z');
    expect(operationalAt(x, d('2026-11-04T07:59:59Z'))).toBe(false);
    expect(operationalAt(x, d('2026-11-04T08:00:00Z'))).toBe(true);
    expect(operationalAt(x, d('2026-12-01T00:00:00Z'))).toBe(true);
  });

  it('is never true for a student with no recorded activation, whatever else is recorded', () => {
    expect(operationalAt(b(null), d('2026-12-01T00:00:00Z'))).toBe(false);
    expect(operationalAt(b(null, [['2026-11-01T00:00:00Z', '2026-11-02T00:00:00Z']]), d('2026-12-01T00:00:00Z'))).toBe(false);
  });

  it('is false from the first moment of a pause until the moment it was resolved, and true again from then', () => {
    const x = b('2026-11-01T00:00:00Z', [['2026-11-14T00:00:00Z', '2026-11-20T00:00:00Z']]);
    expect(operationalAt(x, d('2026-11-13T23:59:59Z'))).toBe(true);
    expect(operationalAt(x, d('2026-11-14T00:00:00Z'))).toBe(false);
    expect(operationalAt(x, d('2026-11-19T23:59:59Z'))).toBe(false);
    expect(operationalAt(x, d('2026-11-20T00:00:00Z'))).toBe(true);
    expect(operationalAt(x, d('2027-01-01T00:00:00Z'))).toBe(true); // the historical pause does not come back
  });

  it('keeps every pause out, and an open pause out for good', () => {
    const x = b('2026-11-01T00:00:00Z', [['2026-11-08T00:00:00Z', '2026-11-12T00:00:00Z'], ['2026-11-22T00:00:00Z', null]]);
    expect(operationalAt(x, d('2026-11-10T00:00:00Z'))).toBe(false);
    expect(operationalAt(x, d('2026-11-15T00:00:00Z'))).toBe(true);
    expect(operationalAt(x, d('2026-11-23T00:00:00Z'))).toBe(false);
    expect(operationalAt(x, d('2027-06-01T00:00:00Z'))).toBe(false);
  });
});
