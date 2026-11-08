import {
  DEFAULT_SESSION_MINUTES,
  ScheduleReferences,
  ScheduleValue,
  SubjectSchedule,
  classesIn,
  distributeEqually,
  endTimeFor,
  findConflicts,
  formatMinutes,
  hoursMismatch,
  hoursToMinutes,
  newSubject,
  parseSchedule,
  planTotals,
  rebalance,
  restoreEqualSplit,
  scheduleProblem,
  scheduledMinutes,
  sessionLabel,
  setFrequency,
  setOccurrences,
  setSessionDuration,
  setSessionEnd,
  setSessionStart,
  setTotalMinutes,
  subjectProblem,
  suggestedClasses,
  summariseSchedule,
  toggleDay,
  weeksCovered,
} from './subject-schedule';

const refs: ScheduleReferences = {
  subjects: [
    { id: 'sub-en', name: 'English' },
    { id: 'sub-ma', name: 'Mathematics' },
    { id: 'sub-sc', name: 'Science' },
    { id: 'sub-ss', name: 'Social Studies' },
    { id: 'sub-hi', name: 'Hindi' },
  ],
  grades: [
    { id: 'g-8', name: 'Grade 8' },
    { id: 'g-10', name: 'Grade 10' },
  ],
};

/** A subject the way the page builds it: pick the subject and level, set the hours, then choose the days. */
function build(subjectId: string, frequency: SubjectSchedule['frequency'], totalMinutes: number, days: Array<[string, (1 | 2)?]>): SubjectSchedule {
  const ref = refs.subjects.find((s) => s.id === subjectId)!;
  let s: SubjectSchedule = { ...newSubject(frequency), subjectId, subjectName: ref.name, gradeId: 'g-8', gradeName: 'Grade 8' };
  s = setTotalMinutes(s, totalMinutes);
  for (const [day, week] of days) s = toggleDay(s, day as never, week);
  return s;
}

const english = () => build('sub-en', 'WEEKLY', 240, [['Monday'], ['Tuesday'], ['Thursday'], ['Saturday']]);
const maths = () => build('sub-ma', 'WEEKLY', 180, [['Monday'], ['Wednesday']]);

describe('equal distribution', () => {
  it('4 hours over Monday, Tuesday, Thursday and Saturday is 1 hour each', () => {
    const s = english();
    expect(s.sessions.map((x) => [x.day, x.durationMinutes])).toEqual([['Monday', 60], ['Tuesday', 60], ['Thursday', 60], ['Saturday', 60]]);
    expect(scheduledMinutes(s)).toBe(240);
    expect(s.distribution).toBe('EQUAL');
    expect(subjectProblem(s, refs)).toBeNull();
  });

  it('1.5 hours on Monday only is 1 hour 30 minutes', () => {
    const s = build('sub-en', 'WEEKLY', 90, [['Monday']]);
    expect(s.sessions).toEqual([{ day: 'Monday', durationMinutes: 90 }]);
    expect(formatMinutes(s.sessions[0].durationMinutes)).toBe('1 hour 30 minutes');
  });

  it('3 hours over Monday and Wednesday is 1 hour 30 minutes each', () => {
    expect(maths().sessions.map((x) => x.durationMinutes)).toEqual([90, 90]);
  });

  it('shares out evenly again when a day is added or removed', () => {
    let s = english();
    s = toggleDay(s, 'Friday');
    // 4 hours over 5 days is 48 minutes each, which is not a multiple of 5, so three days get 50 and two get 45.
    expect(s.sessions.map((x) => x.durationMinutes)).toEqual([50, 50, 50, 45, 45]);
    expect(scheduledMinutes(s)).toBe(240);
    s = toggleDay(s, 'Friday');
    s = toggleDay(s, 'Saturday');
    expect(s.sessions.map((x) => x.durationMinutes)).toEqual([80, 80, 80]);
  });

  it('a total that cannot divide into whole steps differs by at most one step and still adds up', () => {
    const split = distributeEqually(60, [1, 1, 1, 1, 1, 1, 1]);
    expect(split.leftover).toBe(0);
    expect(Math.max(...split.durations) - Math.min(...split.durations)).toBeLessThanOrEqual(5);
    expect(split.durations.reduce((a, b) => a + b, 0)).toBe(60);
  });

  it('changing the total changes every class length', () => {
    const s = setTotalMinutes(english(), 360);
    expect(s.sessions.map((x) => x.durationMinutes)).toEqual([90, 90, 90, 90]);
  });
});

describe('fractional and custom durations', () => {
  it.each([['1.5', 90], ['0.5', 30], ['2', 120], ['3.25', 195], ['4', 240]])('reads %s hours as %i minutes', (text, minutes) => {
    expect(hoursToMinutes(text)).toBe(minutes);
  });
  it.each(['', 'abc', '-1', '1.555', '1,5'])('refuses %p as hours', (text) => {
    expect(hoursToMinutes(text)).toBeNull();
  });
  it('formats lengths in plain words', () => {
    expect([30, 60, 90, 120, 45, 150].map(formatMinutes)).toEqual(['30 minutes', '1 hour', '1 hour 30 minutes', '2 hours', '45 minutes', '2 hours 30 minutes']);
  });
  it('the department default is one hour and is only a suggestion, never a limit', () => {
    expect(DEFAULT_SESSION_MINUTES).toBe(60);
    expect(suggestedClasses(240)).toBe(4);
    expect(suggestedClasses(240, 120)).toBe(2);
    expect(suggestedClasses(90)).toBeNull();
    // A 2 hour class and a 30 minute class are both accepted.
    let s = build('sub-en', 'WEEKLY', 150, [['Monday'], ['Friday']]);
    s = setSessionDuration(s, 0, 120);
    s = setSessionDuration(s, 1, 30);
    expect(subjectProblem(s, refs)).toBeNull();
  });
});

describe('manual adjustments', () => {
  it('4 hours as 1.5, 1 and 1.5 is allowed while the total matches', () => {
    let s = build('sub-ma', 'WEEKLY', 240, [['Monday'], ['Wednesday'], ['Friday']]);
    s = setSessionDuration(s, 0, 90);
    s = setSessionDuration(s, 1, 60);
    s = setSessionDuration(s, 2, 90);
    expect(s.distribution).toBe('CUSTOM');
    expect(scheduledMinutes(s)).toBe(240);
    expect(subjectProblem(s, refs)).toBeNull();
  });

  it('shows the remaining time when the sessions fall short', () => {
    const s = setSessionDuration(english(), 0, 30);
    expect(hoursMismatch(s)).toBe('The sessions add up to 3 hours 30 minutes per week, but 4 hours are required. 30 minutes remaining.');
    expect(subjectProblem(s, refs)).toBe(hoursMismatch(s));
  });

  it('shows the excess when the sessions go over', () => {
    const s = setSessionDuration(english(), 0, 120);
    expect(hoursMismatch(s)).toBe('The sessions add up to 5 hours per week, but only 4 hours are required. 1 hour over.');
  });

  it('custom lengths stay as set when a day is added, and the difference is shown', () => {
    let s = setSessionDuration(build('sub-ma', 'WEEKLY', 240, [['Monday'], ['Wednesday']]), 0, 90);
    s = toggleDay(s, 'Friday');
    expect(s.distribution).toBe('CUSTOM');
    expect(s.sessions.find((x) => x.day === 'Monday')!.durationMinutes).toBe(90);
    expect(hoursMismatch(s)).toBe('The sessions add up to 4 hours 30 minutes per week, but only 4 hours are required. 30 minutes over.');
  });

  it('restoring the equal split puts every class back to an even share', () => {
    let s = setSessionDuration(english(), 0, 120);
    s = restoreEqualSplit(s);
    expect(s.distribution).toBe('EQUAL');
    expect(s.sessions.map((x) => x.durationMinutes)).toEqual([60, 60, 60, 60]);
    expect(subjectProblem(s, refs)).toBeNull();
  });

  it('refuses zero and negative lengths', () => {
    for (const minutes of [0, -30]) {
      const s = setSessionDuration(english(), 0, minutes);
      expect(subjectProblem(s, refs)).toMatch(/length must be more than zero/);
    }
  });

  it('refuses a class that is too short or too long', () => {
    expect(subjectProblem(setSessionDuration(english(), 0, 10), refs)).toMatch(/at least 15 minutes/);
    expect(subjectProblem(setSessionDuration(english(), 0, 600), refs)).toMatch(/longer than 8 hours/);
  });
});

describe('weekly, bi-weekly and monthly', () => {
  it('weekly: hours are per week and the days repeat each week', () => {
    const s = english();
    expect(s.frequency).toBe('WEEKLY');
    expect(weeksCovered(s.sessions[0], 'WEEKLY')).toEqual([1, 2, 3, 4]);
    expect(sessionLabel(s.sessions[0], 'WEEKLY')).toBe('Monday');
  });

  it('bi-weekly: 4 hours per two-week cycle, Week 1 Tuesday and Thursday, Week 2 Monday and Friday', () => {
    const s = build('sub-sc', 'BIWEEKLY', 240, [['Tuesday', 1], ['Thursday', 1], ['Monday', 2], ['Friday', 2]]);
    expect(s.sessions.map((x) => [x.week, x.day, x.durationMinutes])).toEqual([[1, 'Tuesday', 60], [1, 'Thursday', 60], [2, 'Monday', 60], [2, 'Friday', 60]]);
    expect(scheduledMinutes(s)).toBe(240);
    expect(sessionLabel(s.sessions[0], 'BIWEEKLY')).toBe('Week 1 Tuesday');
    expect(subjectProblem(s, refs)).toBeNull();
  });

  it('bi-weekly: the same day can be chosen in both weeks', () => {
    const s = build('sub-sc', 'BIWEEKLY', 120, [['Monday', 1], ['Monday', 2]]);
    expect(s.sessions).toHaveLength(2);
    expect(subjectProblem(s, refs)).toBeNull();
  });

  it('bi-weekly hours are never read as weekly hours', () => {
    const s = build('sub-sc', 'BIWEEKLY', 240, [['Tuesday', 1]]);
    expect(hoursMismatch({ ...s, totalMinutes: 120 })).toContain('per two-week cycle');
  });

  it('monthly: 6 hours a month on every Tuesday is 4 classes of 1 hour 30 minutes', () => {
    let s = build('sub-ss', 'MONTHLY', 360, [['Tuesday']]);
    expect(classesIn(s.sessions[0], 'MONTHLY')).toBe(4);
    expect(s.sessions[0].durationMinutes).toBe(90);
    expect(scheduledMinutes(s)).toBe(360);
    expect(subjectProblem(s, refs)).toBeNull();
    s = setOccurrences(s, 'Tuesday', ['FIRST', 'THIRD']);
    expect(classesIn(s.sessions[0], 'MONTHLY')).toBe(2);
    expect(s.sessions[0].durationMinutes).toBe(180);
    expect(sessionLabel(s.sessions[0], 'MONTHLY')).toBe('First and third Tuesday');
  });

  it('monthly: first and third Monday plus every Friday share the month total by class', () => {
    let s = build('sub-ss', 'MONTHLY', 360, [['Monday'], ['Friday']]);
    s = setOccurrences(s, 'Monday', ['FIRST', 'THIRD']);
    expect(totalClassesOf(s)).toBe(6);
    expect(s.sessions.map((x) => x.durationMinutes)).toEqual([60, 60]);
    expect(scheduledMinutes(s)).toBe(360);
  });

  it('monthly: every cannot be mixed with another pattern, and a pattern is required', () => {
    let s = build('sub-ss', 'MONTHLY', 360, [['Tuesday']]);
    s = { ...s, sessions: [{ ...s.sessions[0], occurrences: ['EVERY', 'FIRST'] }] };
    expect(subjectProblem(s, refs)).toMatch(/cannot be combined/);
    s = { ...s, sessions: [{ ...s.sessions[0], occurrences: [] }] };
    expect(subjectProblem(s, refs)).toMatch(/choose which Tuesdays/);
  });

  it('changing frequency keeps the days, restarts the equal split, and states the new period', () => {
    const weekly = english();
    const biweekly = setFrequency(weekly, 'BIWEEKLY');
    expect(biweekly.sessions.every((x) => x.week === 1)).toBe(true);
    expect(biweekly.totalMinutes).toBe(240);
    const monthly = setFrequency(weekly, 'MONTHLY');
    expect(monthly.sessions.every((x) => x.occurrences?.[0] === 'EVERY')).toBe(true);
    expect(scheduledMinutes(monthly)).toBe(240);
    expect(setFrequency(monthly, 'WEEKLY').sessions.every((x) => x.week === undefined && x.occurrences === undefined)).toBe(true);
  });

  it('a total spread over so many days that classes fall under 15 minutes is refused with advice', () => {
    const s = build('sub-en', 'WEEKLY', 60, [['Monday'], ['Tuesday'], ['Wednesday'], ['Thursday'], ['Friday'], ['Saturday'], ['Sunday']]);
    expect(subjectProblem(s, refs)).toMatch(/at least 15 minutes/);
  });
});

const totalClassesOf = (s: SubjectSchedule) => s.sessions.reduce((n, x) => n + classesIn(x, s.frequency), 0);

describe('days', () => {
  it('each subject keeps its own days', () => {
    expect(english().sessions.map((s) => s.day)).toEqual(['Monday', 'Tuesday', 'Thursday', 'Saturday']);
    expect(maths().sessions.map((s) => s.day)).toEqual(['Monday', 'Wednesday']);
  });
  it('days come out in week order however they were chosen', () => {
    const s = build('sub-en', 'WEEKLY', 180, [['Saturday'], ['Monday'], ['Thursday']]);
    expect(s.sessions.map((x) => x.day)).toEqual(['Monday', 'Thursday', 'Saturday']);
  });
  it('a schedule with no day cannot be saved', () => {
    expect(subjectProblem(build('sub-en', 'WEEKLY', 120, []), refs)).toBe('Choose at least one preferred day.');
  });
});

describe('start and end times', () => {
  it('end follows the start and the length', () => {
    expect(endTimeFor('16:30', 60)).toBe('17:30');
    expect(endTimeFor('16:30', 90)).toBe('18:00');
    expect(endTimeFor('23:30', 60)).toBeNull();
  });
  it('setting a start fills the end; changing the length moves the end', () => {
    let s = setSessionStart(build('sub-en', 'WEEKLY', 120, [['Monday'], ['Friday']]), 0, '16:00');
    expect(s.sessions[0]).toMatchObject({ start: '16:00', end: '17:00' });
    s = setSessionDuration(s, 0, 90);
    expect(s.sessions[0]).toMatchObject({ start: '16:00', end: '17:30' });
  });
  it('clearing the start clears the end and saving without any time is allowed', () => {
    let s = setSessionStart(maths(), 0, '16:00');
    s = setSessionStart(s, 0, '');
    expect(s.sessions[0].start).toBeUndefined();
    expect(s.sessions[0].end).toBeUndefined();
    expect(subjectProblem(maths(), refs)).toBeNull();
  });
  it('editing the end time sets the length and makes the split custom', () => {
    let s = setSessionStart(build('sub-ma', 'WEEKLY', 120, [['Monday'], ['Friday']]), 0, '16:00');
    s = setSessionEnd(s, 0, '17:30');
    expect(s.sessions[0].durationMinutes).toBe(90);
    expect(s.distribution).toBe('CUSTOM');
    expect(hoursMismatch(s)).toContain('over');
  });
  it('an end at or before the start is refused', () => {
    let s = setSessionStart(maths(), 0, '16:00');
    s = setSessionEnd(s, 0, '15:00');
    expect(subjectProblem(s, refs)).toMatch(/end time must be after the start time/);
  });
  it('an end without a start is refused', () => {
    const s = { ...maths(), sessions: [{ ...maths().sessions[0], end: '17:00' }, maths().sessions[1]] };
    expect(subjectProblem(s, refs)).toMatch(/add a start time or clear the end time/);
  });
  it('a class that would run past midnight is refused', () => {
    expect(subjectProblem({ ...maths(), sessions: [{ day: 'Monday', durationMinutes: 90, start: '23:00' }, { day: 'Wednesday', durationMinutes: 90 }] }, refs)).toMatch(/past midnight/);
  });
});

describe('conflicts between subjects', () => {
  const at = (s: SubjectSchedule, i: number, start: string) => setSessionStart(s, i, start);

  it('two subjects at overlapping times on the same day are reported', () => {
    const a = at(english(), 0, '16:00'); // Monday 16:00 to 17:00
    const b = at(maths(), 0, '16:30'); // Monday 16:30 to 18:00
    const conflicts = findConflicts([a, b]);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].day).toBe('Monday');
  });
  it('back to back classes do not clash', () => {
    expect(findConflicts([at(english(), 0, '16:00'), at(maths(), 0, '17:00')])).toEqual([]);
  });
  it('different days do not clash', () => {
    expect(findConflicts([at(english(), 0, '16:00'), at(maths(), 1, '16:00')])).toEqual([]);
  });
  it('classes without times cannot clash', () => {
    expect(findConflicts([english(), maths()])).toEqual([]);
  });
  it('a Week 1 class and a Week 2 class on the same weekday do not clash', () => {
    const a = at(build('sub-sc', 'BIWEEKLY', 60, [['Monday', 1]]), 0, '16:00');
    const b = at(build('sub-hi', 'BIWEEKLY', 60, [['Monday', 2]]), 0, '16:00');
    expect(findConflicts([a, b])).toEqual([]);
  });
  it('a weekly class and a first-Monday class can fall on the same date', () => {
    const weekly = at(build('sub-en', 'WEEKLY', 60, [['Monday']]), 0, '16:00');
    let monthly = build('sub-ss', 'MONTHLY', 60, [['Monday']]);
    monthly = at(setOccurrences(monthly, 'Monday', ['FIRST']), 0, '16:00');
    expect(findConflicts([weekly, monthly])).toHaveLength(1);
  });
});

describe('plan totals', () => {
  it('keeps each frequency apart and gives one rough monthly figure', () => {
    const plan = [english(), maths(), build('sub-sc', 'BIWEEKLY', 240, [['Tuesday', 1]]), build('sub-ss', 'MONTHLY', 360, [['Tuesday']])];
    const totals = planTotals(plan);
    expect(totals.subjects).toBe(4);
    expect(totals.byFrequency.WEEKLY).toEqual({ subjects: 2, minutes: 420 });
    expect(totals.byFrequency.BIWEEKLY).toEqual({ subjects: 1, minutes: 240 });
    expect(totals.byFrequency.MONTHLY).toEqual({ subjects: 1, minutes: 360 });
    expect(totals.monthlyEquivalentMinutes).toBe(420 * 4 + 240 * 2 + 360);
  });
});

describe('validating a whole schedule', () => {
  const plan = (): ScheduleValue => ({ version: 2, subjects: [english(), maths()] });

  it('accepts a complete plan with several subjects', () => {
    expect(scheduleProblem(plan(), refs)).toBeNull();
    const parsed = parseSchedule(JSON.parse(JSON.stringify(plan())), refs);
    expect(parsed.ok).toBe(true);
  });

  it('needs at least one subject', () => {
    expect(scheduleProblem({ version: 2, subjects: [] }, refs)).toBe('Add at least one subject.');
  });

  it('refuses the same subject twice and names the card to edit', () => {
    const value: ScheduleValue = { version: 2, subjects: [english(), { ...maths(), subjectId: 'sub-en', subjectName: 'English' }] };
    expect(scheduleProblem(value, refs)).toBe('English is already in this plan. Edit that card instead of adding it again.');
  });

  it('refuses an unfinished card and says which one', () => {
    expect(scheduleProblem({ version: 2, subjects: [english(), newSubject()] }, refs)).toBe('Subject 2: Choose a subject.');
    const noLevel = { ...maths(), gradeId: '', gradeName: '' };
    expect(scheduleProblem({ version: 2, subjects: [noLevel] }, refs)).toBe('Mathematics: Choose the required level.');
    const noHours = { ...maths(), totalMinutes: 0 };
    expect(scheduleProblem({ version: 2, subjects: [noHours] }, refs)).toBe('Mathematics: Enter the total hours required per week.');
  });

  it('takes names from the master lists, whatever the request says', () => {
    const forged = JSON.parse(JSON.stringify(plan()));
    forged.subjects[0].subjectName = 'Hacked';
    forged.subjects[0].gradeName = 'Grade 99';
    const parsed = parseSchedule(forged, refs);
    expect(parsed.ok && parsed.value.subjects[0].subjectName).toBe('English');
    expect(parsed.ok && parsed.value.subjects[0].gradeName).toBe('Grade 8');
  });

  it('refuses a subject or level that is not in the master lists', () => {
    const a = JSON.parse(JSON.stringify(plan()));
    a.subjects[0].subjectId = 'unknown';
    expect(parseSchedule(a, refs)).toEqual({ ok: false, message: 'Subject 1: choose a subject from the subject list.' });
    const b = JSON.parse(JSON.stringify(plan()));
    b.subjects[0].gradeId = 'unknown';
    expect(parseSchedule(b, refs)).toEqual({ ok: false, message: 'English: choose the required level from the level list.' });
  });

  it('refuses unexpected shapes and extra keys', () => {
    expect(parseSchedule([{ day: 'Monday', start: '10:00', end: '11:00' }], refs).ok).toBe(false); // the old row format
    expect(parseSchedule({ version: 1, subjects: [] }, refs).ok).toBe(false);
    const extra = JSON.parse(JSON.stringify(plan()));
    extra.subjects[0].secret = true;
    expect(parseSchedule(extra, refs).ok).toBe(false);
    const extraSession = JSON.parse(JSON.stringify(plan()));
    extraSession.subjects[0].sessions[0].notes = 'x';
    expect(parseSchedule(extraSession, refs).ok).toBe(false);
  });

  it('refuses sessions that do not add up, and an equal split that is not equal', () => {
    const off = JSON.parse(JSON.stringify(plan()));
    off.subjects[0].sessions[0].durationMinutes = 90;
    const parsed = parseSchedule(off, refs);
    expect(parsed.ok).toBe(false);
    const unequal = JSON.parse(JSON.stringify(plan()));
    unequal.subjects[0].sessions[0].durationMinutes = 90;
    unequal.subjects[0].sessions[1].durationMinutes = 30;
    expect(parseSchedule(unequal, refs)).toEqual({ ok: false, message: 'English: The class lengths are not an equal split. Use custom lengths or restore the equal split.' });
    unequal.subjects[0].distribution = 'CUSTOM';
    expect(parseSchedule(unequal, refs).ok).toBe(true);
  });

  it('fills the end time from the start and the length, and refuses an end that disagrees', () => {
    const value = JSON.parse(JSON.stringify(plan()));
    value.subjects[0].sessions[0].start = '16:00';
    const parsed = parseSchedule(value, refs);
    expect(parsed.ok && parsed.value.subjects[0].sessions[0].end).toBe('17:00');
    value.subjects[0].sessions[0].end = '17:30';
    expect(parseSchedule(value, refs)).toEqual({ ok: false, message: 'English: Monday: the end time must match the class length. Change the length to change the end time.' });
  });

  it('refuses duplicate days, weeks on a weekly plan and monthly patterns on a weekly plan', () => {
    const dup = JSON.parse(JSON.stringify(plan()));
    dup.subjects[0].sessions.push({ day: 'Monday', durationMinutes: 60 });
    expect(parseSchedule(dup, refs).ok).toBe(false);
    const week = JSON.parse(JSON.stringify(plan()));
    week.subjects[0].sessions[0].week = 1;
    expect(parseSchedule(week, refs)).toEqual({ ok: false, message: 'English: Monday: weeks only apply to bi-weekly schedules.' });
    const pattern = JSON.parse(JSON.stringify(plan()));
    pattern.subjects[0].sessions[0].occurrences = ['EVERY'];
    expect(parseSchedule(pattern, refs).ok).toBe(false);
  });

  it('a stored schedule reads back exactly as it was saved', () => {
    const saved = parseSchedule(JSON.parse(JSON.stringify(plan())), refs);
    expect(saved.ok).toBe(true);
    if (!saved.ok) return;
    const reloaded = parseSchedule(JSON.parse(JSON.stringify(saved.value)), refs);
    expect(reloaded).toEqual(saved);
  });

  it('the read-only summary names every subject, level, frequency, period and class', () => {
    const text = summariseSchedule({ version: 2, subjects: [english(), build('sub-sc', 'BIWEEKLY', 240, [['Tuesday', 1], ['Monday', 2]])] });
    expect(text).toContain('English · Grade 8 · Weekly · 4 hours per week');
    expect(text).toContain('Monday 1 hour, Tuesday 1 hour, Thursday 1 hour, Saturday 1 hour');
    expect(text).toContain('Science · Grade 8 · Bi-weekly · 4 hours per two-week cycle');
    expect(text).toContain('Week 1 Tuesday 2 hours, Week 2 Monday 2 hours');
  });

  it('rebalance leaves custom lengths alone and keeps days in order', () => {
    const s = setSessionDuration(maths(), 0, 60);
    expect(rebalance(s).sessions.map((x) => x.durationMinutes)).toEqual([60, 90]);
  });
});
