import {
  DEFAULT_POLICIES, DEFAULT_WORKING, SlaItemTimes, SlaPolicyRules, WorkingPolicy, addMinutes, addWorkingMinutes, clockMinutes, minutesBetween, slaView, workingFrom, workingMinutesBetween,
} from './mentoring-sla';

/** A moment on the office clock (India, UTC+5:30, no daylight saving). */
const at = (date: string, time: string) => new Date(`${date}T${time}:00+05:30`);
const shown = (d: Date) => d.toLocaleString('sv-SE', { timeZone: 'Asia/Kolkata' }).slice(0, 16);
const W = DEFAULT_WORKING; // 09:00 to 18:00, Sunday off
// 2026-11-09 is a Monday.
const MON = '2026-11-09', TUE = '2026-11-10', SAT = '2026-11-14', SUN = '2026-11-15', NEXT_MON = '2026-11-16';

describe('adding working time', () => {
  it('two hours from mid-morning ends two hours later the same day', () => {
    expect(shown(addWorkingMinutes(at(MON, '10:00'), 120, W))).toBe('2026-11-09 12:00');
  });

  it('work that arrives at 17:30 is due at 10:30 the next working morning, not at 19:30', () => {
    expect(shown(addWorkingMinutes(at(MON, '17:30'), 120, W))).toBe('2026-11-10 10:30');
  });

  it('work that arrives before opening starts counting at opening', () => {
    expect(shown(addWorkingMinutes(at(MON, '07:00'), 120, W))).toBe('2026-11-09 11:00');
  });

  it('work that arrives after closing starts the next working morning', () => {
    expect(shown(addWorkingMinutes(at(MON, '20:00'), 120, W))).toBe('2026-11-10 11:00');
  });

  it('can end exactly at closing time', () => {
    expect(shown(addWorkingMinutes(at(MON, '16:00'), 120, W))).toBe('2026-11-09 18:00');
  });

  it('skips Sunday, the weekly off day', () => {
    expect(shown(addWorkingMinutes(at(SAT, '17:00'), 120, W))).toBe('2026-11-16 10:00');
    expect(shown(addWorkingMinutes(at(SUN, '12:00'), 60, W))).toBe('2026-11-16 10:00');
  });

  it('carries a long target over several days', () => {
    expect(shown(addWorkingMinutes(at(MON, '09:00'), 9 * 60 * 2, W))).toBe('2026-11-10 18:00');
  });

  it('zero minutes inside working time is the same moment, and outside it is the next opening', () => {
    const inside = at(MON, '10:00');
    expect(addWorkingMinutes(inside, 0, W)).toBe(inside);
    expect(shown(addWorkingMinutes(at(SUN, '12:00'), 0, W))).toBe('2026-11-16 09:00');
  });

  it('follows the saved schedule, not a fixed one, and its time zone', () => {
    const short: WorkingPolicy = { start: 10 * 60, end: 16 * 60, timeZone: 'Asia/Kolkata', offDays: [0, 6] };
    expect(shown(addWorkingMinutes(at(SAT, '11:00'), 60, short))).toBe('2026-11-16 11:00'); // Saturday and Sunday are both off here
    const dubai: WorkingPolicy = { start: 9 * 60, end: 18 * 60, timeZone: 'Asia/Dubai', offDays: [0] };
    expect(addWorkingMinutes(new Date('2026-11-09T06:00:00Z'), 120, dubai).toISOString()).toBe('2026-11-09T08:00:00.000Z'); // 10:00 in Dubai to 12:00
  });

  it('calendar mode counts every minute, through the night', () => {
    expect(shown(addMinutes(at(MON, '17:30'), 120, 'CALENDAR', W))).toBe('2026-11-09 19:30');
    expect(shown(addMinutes(at(MON, '17:30'), 120, 'WORKING_HOURS', W))).toBe('2026-11-10 10:30');
  });
});

describe('counting working time between two moments', () => {
  it('counts only working minutes, across the evening and across Sunday', () => {
    expect(workingMinutesBetween(at(MON, '17:00'), at(TUE, '10:00'), W)).toBe(120);
    expect(workingMinutesBetween(at(SAT, '17:00'), at(NEXT_MON, '10:00'), W)).toBe(120);
    expect(workingMinutesBetween(at(SUN, '09:00'), at(SUN, '18:00'), W)).toBe(0);
    expect(workingMinutesBetween(at(MON, '10:00'), at(MON, '10:00'), W)).toBe(0);
    expect(workingMinutesBetween(at(TUE, '10:00'), at(MON, '10:00'), W)).toBe(0);
  });

  it('a whole working week is five and a half nine-hour days', () => {
    expect(workingMinutesBetween(at(MON, '00:00'), at(NEXT_MON, '00:00'), W)).toBe(6 * 9 * 60);
  });

  it('calendar mode is plain elapsed time', () => {
    expect(minutesBetween(at(MON, '17:00'), at(TUE, '10:00'), 'CALENDAR', W)).toBe(17 * 60);
  });
});

describe('reading the saved schedule', () => {
  it('turns the schedule row into a policy, and falls back to the default when it is missing or unusable', () => {
    expect(workingFrom({ startTime: '08:30', endTime: '17:00', timezone: 'Asia/Dubai' })).toEqual({ start: 510, end: 1020, timeZone: 'Asia/Dubai', offDays: [0] });
    expect(workingFrom(null)).toBe(DEFAULT_WORKING);
    expect(workingFrom({ startTime: '18:00', endTime: '09:00', timezone: 'Asia/Kolkata' })).toBe(DEFAULT_WORKING);
    expect(workingFrom({ startTime: 'nine', endTime: '18:00', timezone: 'Asia/Kolkata' })).toBe(DEFAULT_WORKING);
    expect(clockMinutes('24:00')).toBeNull();
    expect(clockMinutes('09:05')).toBe(545);
  });

  it('every default policy is two working hours, and only the acknowledgement stops at the first response', () => {
    expect(Object.values(DEFAULT_POLICIES).every((p) => p.targetMinutes === 120 && p.mode === 'WORKING_HOURS')).toBe(true);
    expect(DEFAULT_POLICIES.COMPLAINT_ACKNOWLEDGEMENT.measure).toBe('FIRST_RESPONSE');
    expect(DEFAULT_POLICIES.CLASS_UPDATE_REVIEW.measure).toBe('COMPLETION');
  });
});

describe('where an item stands', () => {
  const policy: SlaPolicyRules = DEFAULT_POLICIES.CLASS_UPDATE_REVIEW;
  const open = (startedAt: Date, over: Partial<SlaItemTimes> = {}): SlaItemTimes => ({ status: 'OPEN', startedAt, dueAt: addWorkingMinutes(startedAt, 120, W), firstResponseAt: null, completedAt: null, ...over });

  it('is within the target at first, approaching after three quarters of it, breached after the due time', () => {
    const item = open(at(MON, '10:00')); // due 12:00
    expect(slaView(item, policy, W, at(MON, '10:30'))).toMatchObject({ state: 'WITHIN_SLA', label: 'Within SLA', remainingMinutes: 90, elapsedMinutes: 30, overdueMinutes: 0 });
    expect(slaView(item, policy, W, at(MON, '11:29'))).toMatchObject({ state: 'WITHIN_SLA' });
    expect(slaView(item, policy, W, at(MON, '11:30'))).toMatchObject({ state: 'APPROACHING', label: 'Approaching SLA', remainingMinutes: 30 });
    expect(slaView(item, policy, W, at(MON, '12:00'))).toMatchObject({ state: 'APPROACHING' }); // exactly at the due time is not yet late
    expect(slaView(item, policy, W, at(MON, '12:45'))).toMatchObject({ state: 'BREACHED', label: 'SLA breached', overdueMinutes: 45 });
  });

  it('overdue time is counted in working minutes, so an overnight wait is not held against the Mentor', () => {
    const item = open(at(MON, '17:00')); // due Tuesday 10:00
    expect(slaView(item, policy, W, at(TUE, '09:30'))).toMatchObject({ state: 'APPROACHING' });
    expect(slaView(item, policy, W, at(TUE, '11:00'))).toMatchObject({ state: 'BREACHED', overdueMinutes: 60 });
  });

  it('an item that arrived after hours does not breach overnight', () => {
    const item = open(at(MON, '19:00')); // due Tuesday 11:00
    expect(slaView(item, policy, W, at(TUE, '08:00'))).toMatchObject({ state: 'WITHIN_SLA', elapsedMinutes: 0 });
    expect(slaView(item, policy, W, at(TUE, '10:30'))).toMatchObject({ state: 'APPROACHING' });
  });

  it('completed on time is resolved and met; completed late is resolved, not met, with the lateness', () => {
    const onTime = open(at(MON, '10:00'), { status: 'COMPLETED', completedAt: at(MON, '11:00') });
    expect(slaView(onTime, policy, W, at(TUE, '10:00'))).toMatchObject({ state: 'RESOLVED', label: 'Resolved', metSla: true, overdueMinutes: 0, elapsedMinutes: 60 });
    const late = open(at(MON, '10:00'), { status: 'COMPLETED', completedAt: at(MON, '13:00') });
    expect(slaView(late, policy, W, at(TUE, '10:00'))).toMatchObject({ state: 'RESOLVED', metSla: false, overdueMinutes: 60 });
  });

  it('a first response does not stop a completion clock, but does stop an acknowledgement clock', () => {
    const responded = open(at(MON, '10:00'), { firstResponseAt: at(MON, '10:20') });
    expect(slaView(responded, DEFAULT_POLICIES.CLASS_UPDATE_REVIEW, W, at(MON, '12:45'))).toMatchObject({ state: 'BREACHED' });
    expect(slaView(responded, DEFAULT_POLICIES.COMPLAINT_ACKNOWLEDGEMENT, W, at(MON, '12:45'))).toMatchObject({ state: 'RESOLVED', metSla: true, elapsedMinutes: 20 });
    const never = open(at(MON, '10:00'));
    expect(slaView(never, DEFAULT_POLICIES.COMPLAINT_ACKNOWLEDGEMENT, W, at(MON, '12:45'))).toMatchObject({ state: 'BREACHED' });
  });

  it('a cancelled item is resolved with no verdict', () => {
    const cancelled = open(at(MON, '10:00'), { status: 'CANCELLED', completedAt: at(MON, '10:10') });
    expect(slaView(cancelled, policy, W, at(MON, '15:00'))).toMatchObject({ state: 'RESOLVED', metSla: null });
  });

  it('calendar mode counts the night', () => {
    const calendar: SlaPolicyRules = { ...policy, mode: 'CALENDAR' };
    const item: SlaItemTimes = { status: 'OPEN', startedAt: at(MON, '17:30'), dueAt: addMinutes(at(MON, '17:30'), 120, 'CALENDAR', W), firstResponseAt: null, completedAt: null };
    expect(slaView(item, calendar, W, at(TUE, '09:00'))).toMatchObject({ state: 'BREACHED', overdueMinutes: 810 });
  });
});
