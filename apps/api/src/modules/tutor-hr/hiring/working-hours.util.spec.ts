import { addWorkingMinutes, evaluationSla, HiringSchedule } from './working-hours.util';

const IST: HiringSchedule = { startTime: '09:00', endTime: '18:00', workingDays: [1, 2, 3, 4, 5, 6], timezone: 'Asia/Kolkata' };
// IST = UTC+5:30. 10:00 IST = 04:30Z.
const ist = (iso: string) => new Date(`${iso}+05:30`);

describe('addWorkingMinutes', () => {
  it('stays same day when it fits', () => {
    expect(addWorkingMinutes(ist('2026-11-16T10:00:00'), 120, IST).toISOString()).toBe(ist('2026-11-16T12:00:00').toISOString());
  });
  it('rolls over the evening to the next morning', () => {
    // Mon 17:00 + 2h => 1h Mon, 1h Tue => Tue 10:00
    expect(addWorkingMinutes(ist('2026-11-16T17:00:00'), 120, IST).toISOString()).toBe(ist('2026-11-17T10:00:00').toISOString());
  });
  it('starts the clock at opening when completed before hours', () => {
    expect(addWorkingMinutes(ist('2026-11-16T06:00:00'), 120, IST).toISOString()).toBe(ist('2026-11-16T11:00:00').toISOString());
  });
  it('starts next opening when completed after hours', () => {
    expect(addWorkingMinutes(ist('2026-11-16T20:00:00'), 120, IST).toISOString()).toBe(ist('2026-11-17T11:00:00').toISOString());
  });
  it('skips non-working days (Saturday 17:30 -> Monday)', () => {
    // 2026-11-21 is Saturday; Sunday off. 30 min Sat, 90 min Mon => Mon 10:30
    expect(addWorkingMinutes(ist('2026-11-21T17:30:00'), 120, IST).toISOString()).toBe(ist('2026-11-23T10:30:00').toISOString());
  });
  it('skips holidays', () => {
    expect(addWorkingMinutes(ist('2026-11-16T17:00:00'), 120, IST, new Set(['2026-11-17'])).toISOString()).toBe(ist('2026-11-18T10:00:00').toISOString());
  });
  it('rejects invalid schedules', () => {
    expect(() => addWorkingMinutes(new Date(), 10, { ...IST, endTime: '08:00' })).toThrow();
    expect(() => addWorkingMinutes(new Date(), 10, { ...IST, workingDays: [] })).toThrow();
  });
});

describe('evaluationSla', () => {
  const done = ist('2026-11-16T10:00:00');
  it('is PENDING before the deadline', () => {
    expect(evaluationSla(done, null, ist('2026-11-16T11:59:00'), IST).state).toBe('PENDING');
  });
  it('is OVERDUE after the deadline', () => {
    expect(evaluationSla(done, null, ist('2026-11-16T12:01:00'), IST).state).toBe('OVERDUE');
  });
  it('is not overdue overnight when hours are excluded', () => {
    const late = ist('2026-11-16T17:00:00');
    expect(evaluationSla(late, null, ist('2026-11-17T08:00:00'), IST).state).toBe('PENDING');
  });
  it('is COMPLETED once evaluated', () => {
    expect(evaluationSla(done, ist('2026-11-16T13:00:00'), ist('2026-11-17T00:00:00'), IST).state).toBe('COMPLETED');
  });
});
