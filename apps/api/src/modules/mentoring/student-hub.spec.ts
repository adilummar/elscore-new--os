import { allocatedMinutes, balanceOf, classTone, compareNullable, consumptionBand, countClasses, isConsumed, monthWindow } from './student-hub';

const c = (key: string, status: string, state: string, extra: Partial<{ scheduledMinutes: number; verifiedMinutes: number | null }> = {}) => ({ key, status, state, scheduledMinutes: 60, verifiedMinutes: null, ...extra });

describe('class colours', () => {
  it('maps every state to one colour', () => {
    expect(classTone({ status: 'VERIFIED', state: 'VERIFIED', consumption: 'CONSUMED' })).toBe('grey');
    expect(classTone({ status: 'SCHEDULED', state: 'SCHEDULED', consumption: 'NOT_CONSUMED' })).toBe('blue');
    expect(classTone({ status: 'RESCHEDULED', state: 'RESCHEDULED', consumption: 'NOT_CONSUMED' })).toBe('blue');
    expect(classTone({ status: 'SCHEDULED', state: 'AWAITING_TUTOR_UPDATE', consumption: 'NOT_CONSUMED' })).toBe('amber');
    expect(classTone({ status: 'AWAITING_MENTOR_VERIFICATION', state: 'AWAITING_MENTOR_VERIFICATION', consumption: 'NOT_CONSUMED' })).toBe('amber');
    expect(classTone({ status: 'NOT_CONDUCTED', state: 'NOT_CONDUCTED', consumption: 'NOT_CONSUMED' })).toBe('red');
    expect(classTone({ status: 'RETURNED_FOR_CORRECTION', state: 'RETURNED_FOR_CORRECTION', consumption: 'NOT_CONSUMED' })).toBe('red');
    expect(classTone({ status: 'AWAITING_MENTOR_VERIFICATION', state: 'AWAITING_MENTOR_VERIFICATION', consumption: 'NOT_CONSUMED', attention: true })).toBe('red');
  });

  it('never shows a cancelled class grey, and a verified record is grey only when it was consumed', () => {
    expect(classTone({ status: 'CANCELLED', state: 'CANCELLED', consumption: 'NOT_CONSUMED' })).toBe('neutral');
    expect(classTone({ status: 'VERIFIED', state: 'VERIFIED', consumption: 'NOT_CONSUMED' })).toBe('red');
  });
});

describe('consumption', () => {
  it('counts a class only when it is verified with minutes above zero', () => {
    expect(isConsumed({ status: 'VERIFIED', verifiedMinutes: 60 })).toBe(true);
    expect(isConsumed({ status: 'VERIFIED', verifiedMinutes: 0 })).toBe(false);
    expect(isConsumed({ status: 'VERIFIED', verifiedMinutes: null })).toBe(false);
    for (const s of ['AWAITING_MENTOR_VERIFICATION', 'CANCELLED', 'SCHEDULED', 'NOT_CONDUCTED', 'RETURNED_FOR_CORRECTION']) expect(isConsumed({ status: s, verifiedMinutes: 60 })).toBe(false);
  });

  it('counts cancelled, unverified, tutor-submitted and duplicate records as not consumed', () => {
    const counts = countClasses([
      c('a', 'VERIFIED', 'VERIFIED', { verifiedMinutes: 60 }),
      c('a', 'VERIFIED', 'VERIFIED', { verifiedMinutes: 60 }), // the same slot twice
      c('b', 'CANCELLED', 'CANCELLED', { verifiedMinutes: 60 }),
      c('c', 'AWAITING_MENTOR_VERIFICATION', 'AWAITING_MENTOR_VERIFICATION'),
      c('d', 'SCHEDULED', 'AWAITING_TUTOR_UPDATE'),
      c('e', 'SCHEDULED', 'SCHEDULED'),
      c('f', 'NOT_CONDUCTED', 'NOT_CONDUCTED'),
      c('g', 'RETURNED_FOR_CORRECTION', 'RETURNED_FOR_CORRECTION'),
    ]);
    expect(counts).toEqual({ records: 7, consumedClasses: 1, consumedMinutes: 60, upcoming: 1, awaitingTutor: 1, awaitingMentor: 1, returned: 1, notConducted: 1, cancelled: 1 });
  });
});

describe('the balance', () => {
  it('keeps allocated, scheduled, consumed and pending apart, and remaining is allocated minus consumed only', () => {
    expect(balanceOf({ allocatedMinutes: 600, consumedMinutes: 180, scheduledMinutes: 300, pendingMinutes: 120 })).toEqual({ allocatedMinutes: 600, consumedMinutes: 180, scheduledMinutes: 300, pendingMinutes: 120, remainingMinutes: 420, over: false, consumedClasses: 0, scheduledClasses: null });
  });

  it('shows remaining as unavailable, not zero, when nothing was allocated', () => {
    expect(balanceOf({ allocatedMinutes: null, consumedMinutes: 60, scheduledMinutes: null, pendingMinutes: 0 }).remainingMinutes).toBeNull();
  });

  it('never goes negative, and says when more was consumed than allocated', () => {
    expect(balanceOf({ allocatedMinutes: 60, consumedMinutes: 120, scheduledMinutes: 0, pendingMinutes: 0 })).toMatchObject({ remainingMinutes: 0, over: true });
  });

  it('adds up monthly hours in whole minutes and returns null when none was set', () => {
    expect(allocatedMinutes([{ monthlyHours: '4.5' }, { monthlyHours: 2 }, { monthlyHours: null }])).toBe(390);
    expect(allocatedMinutes([{ monthlyHours: null }])).toBeNull();
    expect(allocatedMinutes([])).toBeNull();
  });

  it('bands consumption for the filter', () => {
    expect(consumptionBand({ allocatedMinutes: null, consumedMinutes: 0 })).toBe('UNAVAILABLE');
    expect(consumptionBand({ allocatedMinutes: 120, consumedMinutes: 0 })).toBe('NOT_STARTED');
    expect(consumptionBand({ allocatedMinutes: 120, consumedMinutes: 60 })).toBe('IN_PROGRESS');
    expect(consumptionBand({ allocatedMinutes: 120, consumedMinutes: 120 })).toBe('FULLY_CONSUMED');
  });
});

describe('helpers', () => {
  it('finds the month a date falls in, including February', () => {
    expect(monthWindow('2026-11-15')).toEqual({ from: '2026-11-01', to: '2026-11-30' });
    expect(monthWindow('2028-02-10')).toEqual({ from: '2028-02-01', to: '2028-02-29' });
  });

  it('puts missing values last in either direction', () => {
    expect([3, null, 1].sort((a, b) => compareNullable(a, b, 1))).toEqual([1, 3, null]);
    expect([3, null, 1].sort((a, b) => compareNullable(a, b, -1))).toEqual([3, 1, null]);
  });
});
