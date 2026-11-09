import {
  ACTIVITIES, AssignmentRow, ChecklistInput, OverrideRow, RuleRow, checkMentorNotes, checkTutorUpdate, checklistOf, classKey, displayState, occurrencesBetween, parseClassKey, payableAmount, verificationWarnings,
} from './class-session';
import { DEFAULT_WORKING } from './mentoring-sla';

const m = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));
const at = (date: string, time: string) => new Date(`${date}T${time}:00+05:30`);
const MON = 1, WED = 3, SAT = 6;

const assignment = (over: Partial<AssignmentRow> = {}): AssignmentRow => ({ id: 'as-12345678', activationId: 'act-1', subjectId: 'sub-en', tutorProfileId: 'tp-1', startDate: '2026-11-09', endDate: null, ...over });
const rule = (over: Partial<RuleRow> = {}): RuleRow => ({ assignmentId: 'as-12345678', dayOfWeek: MON, frequency: 'WEEKLY', week: null, occurrences: [], startMinute: m('15:00'), endMinute: m('16:00'), ...over });
const between = (from: string, to: string, rules: RuleRow[], overrides: OverrideRow[] = [], assignments: AssignmentRow[] = [assignment()]) => occurrencesBetween(from, to, { assignments, rules, overrides });

describe('which classes happen on which dates', () => {
  it('a weekly rule gives one class a week, from the start date, with its key', () => {
    const list = between('2026-11-02', '2026-11-22', [rule()]);
    expect(list.map((o) => [o.date, o.startMinute, o.endMinute, o.moved])).toEqual([['2026-11-09', 900, 960, false], ['2026-11-16', 900, 960, false]]);
    expect(list[0].key).toBe('as-12345678~2026-11-09~900');
    expect(list[0]).toMatchObject({ activationId: 'act-1', subjectId: 'sub-en', tutorProfileId: 'tp-1' });
  });

  it('bi-weekly and monthly rules give their own dates, not weekly ones', () => {
    expect(between('2026-11-09', '2026-12-06', [rule({ frequency: 'BIWEEKLY', week: 2, dayOfWeek: WED })]).map((o) => o.date)).toEqual(['2026-11-18', '2026-12-02']);
    expect(between('2026-11-01', '2026-12-31', [rule({ frequency: 'MONTHLY', occurrences: ['THIRD'], dayOfWeek: SAT })], [], [assignment({ startDate: '2026-11-01' })]).map((o) => o.date)).toEqual(['2026-11-21', '2026-12-19']);
  });

  it('respects the assignment end date, and gives nothing outside the range asked for', () => {
    expect(between('2026-11-09', '2026-12-31', [rule()], [], [assignment({ endDate: '2026-11-16' })]).map((o) => o.date)).toEqual(['2026-11-09', '2026-11-16']);
    expect(between('2026-11-10', '2026-11-15', [rule()])).toEqual([]);
  });

  it('leaves out a cancelled class', () => {
    const cancelled: OverrideRow = { assignmentId: 'as-12345678', date: '2026-11-16', originalStartMinute: 900, kind: 'CANCELLED', newDate: null, newStartMinute: null, newEndMinute: null };
    expect(between('2026-11-09', '2026-11-23', [rule()], [cancelled]).map((o) => o.date)).toEqual(['2026-11-09', '2026-11-23']);
  });

  it('puts a moved class on its new date and keeps the key of the date the rule gave it', () => {
    const moved: OverrideRow = { assignmentId: 'as-12345678', date: '2026-11-16', originalStartMinute: 900, kind: 'RESCHEDULED', newDate: '2026-11-18', newStartMinute: m('17:00'), newEndMinute: m('18:00') };
    const list = between('2026-11-09', '2026-11-23', [rule()], [moved]);
    expect(list.map((o) => [o.date, o.startMinute, o.moved, o.key])).toEqual([
      ['2026-11-09', 900, false, 'as-12345678~2026-11-09~900'], ['2026-11-18', 1020, true, 'as-12345678~2026-11-16~900'], ['2026-11-23', 900, false, 'as-12345678~2026-11-23~900'],
    ]);
    // Asking only for the new date still finds it, though the rule's own date is outside the range.
    expect(between('2026-11-18', '2026-11-18', [rule()], [moved]).map((o) => o.key)).toEqual(['as-12345678~2026-11-16~900']);
    // A move for a class the rule never produced is ignored.
    // (A Wednesday rule has its own Wednesday class on the 18th, but nothing moved there.)
    expect(between('2026-11-18', '2026-11-18', [rule({ dayOfWeek: WED })], [moved]).map((o) => [o.moved, o.key])).toEqual([[false, 'as-12345678~2026-11-18~900']]);
  });

  it('keeps several classes on one day in time order, across assignments', () => {
    const second = assignment({ id: 'as-87654321', subjectId: 'sub-ma' });
    const list = occurrencesBetween('2026-11-09', '2026-11-09', {
      assignments: [assignment(), second],
      rules: [rule({ startMinute: m('17:00'), endMinute: m('18:00') }), rule({ assignmentId: 'as-87654321', startMinute: m('15:00'), endMinute: m('16:00') })],
      overrides: [],
    });
    expect(list.map((o) => [o.subjectId, o.startMinute])).toEqual([['sub-ma', 900], ['sub-en', 1020]]);
  });

  it('round trips a key and refuses anything that could not have come from one', () => {
    expect(parseClassKey(classKey('as-12345678', '2026-11-09', 900))).toEqual({ assignmentId: 'as-12345678', originalDate: '2026-11-09', originalStartMinute: 900 });
    for (const bad of ['', 'as-12345678~2026-02-30~900', 'as-12345678~2026-11-09~1500', 'x~2026-11-09~900', '../x~2026-11-09~900', 'as-12345678~2026-11-09', 42, null, undefined]) expect(parseClassKey(bad)).toBeNull();
  });
});

describe('the tutor class update', () => {
  const ctx = { subjectName: 'English' };
  const good = { conducted: true, actualStart: '15:05', actualEnd: '16:10', topicsCovered: 'Tenses', attendance: 'PRESENT' };

  it('takes a conducted class with the actual times and works out the actual duration', () => {
    const r = checkTutorUpdate({ ...good, participation: 'GOOD', classNotes: 'Calm', activities: ['QUIZ', 'WORKSHEET'], evaluationRemarks: 'Understands well', coveredRemarks: 'Chapter 3, exercise 2', voiceSent: true }, ctx);
    expect(r).toEqual({
      ok: true,
      value: {
        conducted: true, actualStartMinute: 905, actualEndMinute: 970, actualMinutes: 65, subjectCovered: 'English', topicsCovered: 'Tenses', attendance: 'PRESENT', participation: 'GOOD', classNotes: 'Calm', notConductedReason: null,
        activities: ['QUIZ', 'WORKSHEET'], otherActivity: null, evaluationRemarks: 'Understands well', coveredRemarks: 'Chapter 3, exercise 2', voiceSent: true,
      },
    });
  });

  it('keeps the two remarks apart: evaluation is never merged with topics covered', () => {
    const r = checkTutorUpdate({ ...good, evaluationRemarks: 'Struggled with attention', coveredRemarks: 'Chapter 3' }, ctx);
    expect(r.ok && [r.value.evaluationRemarks, r.value.coveredRemarks]).toEqual(['Struggled with attention', 'Chapter 3']);
    const onlyOne = checkTutorUpdate({ ...good, evaluationRemarks: 'Fine' }, ctx);
    expect(onlyOne.ok && [onlyOne.value.evaluationRemarks, onlyOne.value.coveredRemarks]).toEqual(['Fine', null]);
  });

  it('lets several activities be chosen, once each, and asks for a description when Other is chosen', () => {
    expect(ACTIVITIES).toHaveLength(13);
    const several = checkTutorUpdate({ ...good, activities: ['QUIZ', 'REVISION', 'QUIZ', 'HOMEWORK'] }, ctx);
    expect(several.ok && several.value.activities).toEqual(['QUIZ', 'REVISION', 'HOMEWORK']);
    expect(checkTutorUpdate({ ...good, activities: ['OTHER'] }, ctx)).toEqual({ ok: false, message: 'Describe the other activity.' });
    const other = checkTutorUpdate({ ...good, activities: ['OTHER', 'QUIZ'], otherActivity: ' Role play ' }, ctx);
    expect(other.ok && [other.value.activities, other.value.otherActivity]).toEqual([['OTHER', 'QUIZ'], 'Role play']);
    const dropped = checkTutorUpdate({ ...good, activities: ['QUIZ'], otherActivity: 'ignored' }, ctx);
    expect(dropped.ok && dropped.value.otherActivity).toBeNull();
    expect(checkTutorUpdate({ ...good, activities: ['DANCING'] }, ctx)).toMatchObject({ ok: false, message: 'Choose activities from the list.' });
  });

  it('a class that was not conducted needs only the reason, and records no times or activities', () => {
    expect(checkTutorUpdate({ conducted: false }, ctx)).toEqual({ ok: false, message: 'Say why the class was not conducted.' });
    const r = checkTutorUpdate({ conducted: false, notConductedReason: 'Student unwell', actualStart: '15:00', activities: ['QUIZ'] }, ctx);
    expect(r).toMatchObject({ ok: true, value: { conducted: false, notConductedReason: 'Student unwell', actualStartMinute: null, actualMinutes: null, activities: [] } });
  });

  it('refuses a missing or unclear answer, bad times, and a class that is too long', () => {
    expect(checkTutorUpdate({ ...good, conducted: undefined }, ctx)).toMatchObject({ ok: false, message: 'Say whether the class was conducted.' });
    expect(checkTutorUpdate({ ...good, actualStart: undefined }, ctx)).toMatchObject({ ok: false, message: expect.stringContaining('actually started and ended') });
    expect(checkTutorUpdate({ ...good, actualEnd: '25:00' }, ctx)).toMatchObject({ ok: false });
    expect(checkTutorUpdate({ ...good, actualStart: '16:00', actualEnd: '15:00' }, ctx)).toMatchObject({ ok: false, message: expect.stringContaining('end after it started') });
    expect(checkTutorUpdate({ ...good, actualStart: '06:00', actualEnd: '19:00' }, ctx)).toMatchObject({ ok: false, message: expect.stringContaining('more than 12 hours') });
    expect(checkTutorUpdate({ ...good, topicsCovered: '  ' }, ctx)).toMatchObject({ ok: false, message: 'Say which topics were covered.' });
    expect(checkTutorUpdate({ ...good, attendance: 'MAYBE' }, ctx)).toMatchObject({ ok: false, message: expect.stringContaining('present, late, absent or excused') });
    expect(checkTutorUpdate({ ...good, participation: 'AMAZING' }, ctx)).toMatchObject({ ok: false });
    expect(checkTutorUpdate({ ...good, evaluationRemarks: 'x'.repeat(2001) }, ctx)).toMatchObject({ ok: false, message: expect.stringContaining('2000') });
    expect(checkTutorUpdate(null, ctx)).toMatchObject({ ok: false });
  });

  it('uses the subject the tutor names if they name one, and the assigned subject otherwise', () => {
    expect(checkTutorUpdate({ ...good, subjectCovered: 'Grammar' }, ctx)).toMatchObject({ ok: true, value: { subjectCovered: 'Grammar' } });
    expect(checkTutorUpdate(good, ctx)).toMatchObject({ ok: true, value: { subjectCovered: 'English' } });
  });
});

describe('what the Mentor may add', () => {
  it('takes remarks, a voice confirmation and activities, each on its own, and needs at least one', () => {
    expect(checkMentorNotes({ mentorRemarks: ' Good session ' })).toEqual({ ok: true, value: { mentorRemarks: 'Good session' } });
    expect(checkMentorNotes({ voiceReceived: true, voiceRemarks: 'Clear' })).toEqual({ ok: true, value: { voiceReceived: true, voiceRemarks: 'Clear' } });
    expect(checkMentorNotes({ activities: ['OTHER'], otherActivity: 'Puppet show' })).toEqual({ ok: true, value: { activities: ['OTHER'], otherActivity: 'Puppet show' } });
    expect(checkMentorNotes({})).toMatchObject({ ok: false });
    expect(checkMentorNotes({ voiceReceived: 'yes' })).toMatchObject({ ok: false });
    expect(checkMentorNotes({ activities: ['OTHER'] })).toMatchObject({ ok: false, message: 'Describe the other activity.' });
    expect(checkMentorNotes({ mentorRemarks: 'x'.repeat(2001) })).toMatchObject({ ok: false });
  });
});

describe('the state of a class', () => {
  const s = (over: object = {}) => ({ status: 'SCHEDULED' as const, date: '2026-11-09', endMinute: m('16:00'), ...over });
  const W = DEFAULT_WORKING;

  it('is scheduled until something happens, then reminder pending, reminder sent', () => {
    const before = at('2026-11-09', '12:00');
    expect(displayState(s(), null, before, W)).toBe('SCHEDULED');
    expect(displayState(s(), 'PREPARED', before, W)).toBe('REMINDER_PENDING');
    expect(displayState(s(), 'SENT', before, W)).toBe('REMINDER_SENT');
    expect(displayState(s(), 'ACKNOWLEDGED', before, W)).toBe('REMINDER_SENT');
    expect(displayState(s({ status: 'RESCHEDULED' }), null, before, W)).toBe('RESCHEDULED');
  });

  it('is awaiting the tutor update once the class time has passed, whatever reminder went out', () => {
    expect(displayState(s(), 'SENT', at('2026-11-09', '16:01'), W)).toBe('AWAITING_TUTOR_UPDATE');
    expect(displayState(s(), null, at('2026-11-09', '15:59'), W)).toBe('SCHEDULED');
    expect(displayState(s({ status: 'RESCHEDULED' }), null, at('2026-11-10', '09:00'), W)).toBe('AWAITING_TUTOR_UPDATE');
  });

  it('the stored lifecycle states always win: awaiting verification, returned, verified, not conducted', () => {
    const later = at('2026-11-12', '09:00');
    for (const status of ['AWAITING_MENTOR_VERIFICATION', 'RETURNED_FOR_CORRECTION', 'VERIFIED', 'NOT_CONDUCTED'] as const) expect(displayState(s({ status }), 'SENT', later, W)).toBe(status);
  });
});

describe('the class checklist', () => {
  const base: ChecklistInput = { tutorSubmittedAt: null, voiceSentAt: null, voiceReceivedAt: null, activities: [], evaluationRemarks: null, coveredRemarks: null, status: 'SCHEDULED' };
  const none = { status: null, sentAt: null, acknowledgedAt: null } as const;
  const done = (items: ReturnType<typeof checklistOf>) => items.filter((i) => i.done).map((i) => i.key);

  it('has nothing ticked on a class where nothing has happened', () => {
    expect(done(checklistOf(base, none))).toEqual([]);
    expect(checklistOf(base, none).map((i) => i.key)).toEqual(['REMINDER', 'UPDATE', 'VOICE', 'ACTIVITIES', 'EVALUATION', 'COVERED', 'MENTOR']);
  });

  it('a reminder is done only once it is sent, and says whether it was acknowledged', () => {
    expect(checklistOf(base, { status: 'PREPARED', sentAt: null, acknowledgedAt: null })[0]).toMatchObject({ done: false, detail: 'Prepared, not sent' });
    expect(checklistOf(base, { status: 'SENT', sentAt: new Date(), acknowledgedAt: null })[0]).toMatchObject({ done: true, detail: 'Sent, not yet acknowledged' });
    expect(checklistOf(base, { status: 'ACKNOWLEDGED', sentAt: new Date(), acknowledgedAt: new Date() })[0]).toMatchObject({ done: true, detail: 'Sent and acknowledged by the tutor' });
  });

  it('the voice update is done only when the Mentor confirms it arrived, never because the tutor says it was sent', () => {
    expect(checklistOf({ ...base, voiceSentAt: new Date() }, none)[2]).toMatchObject({ done: false, detail: expect.stringContaining('The Mentor has not confirmed it') });
    expect(checklistOf({ ...base, voiceSentAt: new Date(), voiceReceivedAt: new Date() }, none)[2]).toMatchObject({ done: true });
  });

  it('activities, the two remarks and the update each tick only when recorded, and the Mentor item only when decided', () => {
    const full = { ...base, tutorSubmittedAt: new Date(), activities: ['QUIZ'], evaluationRemarks: 'x', coveredRemarks: 'y' };
    expect(done(checklistOf(full, none))).toEqual(['UPDATE', 'ACTIVITIES', 'EVALUATION', 'COVERED']);
    expect(done(checklistOf({ ...full, status: 'AWAITING_MENTOR_VERIFICATION' }, none))).not.toContain('MENTOR');
    expect(done(checklistOf({ ...full, status: 'VERIFIED' }, none))).toContain('MENTOR');
    expect(done(checklistOf({ ...base, evaluationRemarks: 'only this' }, none))).toEqual(['EVALUATION']);
  });

  it('warns about what is missing before verification, and about a missing rate, without blocking', () => {
    expect(verificationWarnings(base, true)).toHaveLength(4);
    expect(verificationWarnings({ ...base, voiceReceivedAt: new Date(), activities: ['QUIZ'], evaluationRemarks: 'x', coveredRemarks: 'y' }, true)).toEqual([]);
    expect(verificationWarnings({ ...base, voiceReceivedAt: new Date(), activities: ['QUIZ'], evaluationRemarks: 'x', coveredRemarks: 'y' }, false)).toEqual([expect.stringContaining('No hourly rate is set')]);
  });
});

describe('what verified minutes are worth', () => {
  it('is minutes times the hourly rate, to two decimals', () => {
    expect(payableAmount(60, 50)).toBe(50);
    expect(payableAmount(90, 50)).toBe(75);
    expect(payableAmount(65, 40)).toBe(43.33);
    expect(payableAmount(0, 50)).toBe(0);
  });

  it('is empty when there is no rate, and never a guess', () => {
    expect(payableAmount(60, null)).toBeNull();
    expect(payableAmount(60, Number.NaN)).toBeNull();
  });
});
