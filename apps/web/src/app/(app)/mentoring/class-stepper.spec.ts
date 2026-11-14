import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { ClassStepper } from './ClassStepper';
import { AfterPanel, BeforePanel, TimingPanel, VerificationPanel } from './ClassStagePanels';
import {
  actualPayload, actualProblems, afterDraftOf, afterPayload, afterProblems, beforeProblems, emptyAfter, evidenceLines, minutesOfInput, nextStep, openingStep, rescheduleDraftOf, rescheduleProblems, stepViews, submissionNote, timeLines, toggleCode, tutorUpdateFull,
} from './class-stepper-view';
import { ActivityOption, labelProblem, sortedOptions } from './activity-options-view';

jest.mock('./mentoring-client', () => ({ mentoringApi: jest.fn() }));

const html = (el: React.ReactElement) => renderToStaticMarkup(el);
const noop = () => undefined;
const step = (key: string, state: string, reachable = true) => ({ key, state, reachable });
const flow = (steps: any[], submissions: any[] = [], extra: any = {}) => ({
  stages: { steps, suggested: 'BEFORE', submissions },
  mentorActual: null,
  activityChoices: [{ code: 'WORKSHEET', label: 'Worksheet', active: true }, { code: 'QUIZ', label: 'Quiz', active: true }, { code: 'OTHER', label: 'Other', active: true }, { code: 'OLD', label: 'Old one', active: false }],
  canReschedule: true,
  ...extra,
});
const fresh = flow([step('BEFORE', 'CURRENT'), step('AFTER', 'PENDING', false), step('TIMING', 'PENDING', false), step('VERIFICATION', 'PENDING', false)]);
const cls = (over: any = {}) => ({ key: 'k', sessionId: 's1', date: '2026-11-09', startMinute: 900, endMinute: 960, scheduledMinutes: 60, status: 'SCHEDULED', stateLabel: 'Scheduled', checklist: [], update: null, ...over });
const w = (over: any = {}) => ({
  class: cls(over.class), before: { targetAt: '2026-11-09T09:15:00Z', leadMinutes: 45, meetLink: 'https://meet.google.com/abc-defg-hij', meetLinkSource: 'SUBJECT', warning: null, done: false, message: { key: 'CLASS_REMINDER', share: null } },
  after: { voice: null, activities: [], messages: [], versions: [] }, review: { minutes: { scheduled: 60, reported: null, verified: null, consumed: 0 }, blockers: [], canVerify: false }, workflow: fresh, canWork: true, ...over.top,
}) as any;
const props = (ww: any, over: any = {}) => ({ w: ww, classKey: 'k', busy: false, canWork: true, run: noop, go: noop, ...over });

describe('the step bar', () => {
  it('shows the four steps in order, with the open one marked and the unreachable ones disabled', () => {
    const out = html(React.createElement(ClassStepper, { steps: stepViews(w(), 'before'), selected: 'before', onSelect: noop }));
    expect(out.indexOf('Before Class')).toBeLessThan(out.indexOf('After Class'));
    expect(out.indexOf('After Class')).toBeLessThan(out.indexOf('Actual Time'));
    expect(out.indexOf('Actual Time')).toBeLessThan(out.indexOf('Verification'));
    expect([...out.matchAll(/aria-current="step"/g)]).toHaveLength(1);
    expect([...out.matchAll(/disabled=""/g)]).toHaveLength(3);
    expect(out).toContain('Step 1 of 4, Before Class, current');
  });
  it('tells completed, current and not started apart in words, not colour alone', () => {
    const f = flow([step('BEFORE', 'COMPLETE'), step('AFTER', 'CURRENT'), step('TIMING', 'PENDING', false), step('VERIFICATION', 'PENDING', false)]);
    const out = html(React.createElement(ClassStepper, { steps: stepViews(w({ top: { workflow: f } }), 'after'), selected: 'after', onSelect: noop }));
    expect(out).toContain('Completed');
    expect(out).toContain('Current');
    expect(out).toContain('Not started');
  });
  it('marks a step that needs attention in words', () => {
    const f = flow([step('BEFORE', 'COMPLETE'), step('AFTER', 'COMPLETE'), step('TIMING', 'COMPLETE'), step('VERIFICATION', 'ATTENTION')]);
    expect(html(React.createElement(ClassStepper, { steps: stepViews(w({ top: { workflow: f } }), 'verification'), selected: 'verification', onSelect: noop }))).toContain('Needs attention');
  });
});

describe('which step opens', () => {
  const f = flow([step('BEFORE', 'COMPLETE'), step('AFTER', 'CURRENT'), step('TIMING', 'PENDING', false), step('VERIFICATION', 'PENDING', false)]);
  it('opens the step in the address when it can be reached, so a refresh stays put', () => {
    expect(openingStep('after', w({ top: { workflow: f } }))).toBe('after');
    expect(openingStep('before', w({ top: { workflow: f } }))).toBe('before');
  });
  it('opens the suggested step when the address names one that cannot be reached, or none', () => {
    expect(openingStep('verification', w({ top: { workflow: { ...f, stages: { ...f.stages, suggested: 'AFTER' } } } }))).toBe('after');
    expect(openingStep(undefined, w({ top: { workflow: { ...f, stages: { ...f.stages, suggested: 'AFTER' } } } }))).toBe('after');
  });
  it('reads "review" as verification, and opens Before Class when the API sent no workflow', () => {
    expect(openingStep('review', w({ top: { workflow: flow([step('BEFORE', 'COMPLETE'), step('AFTER', 'COMPLETE'), step('TIMING', 'COMPLETE'), step('VERIFICATION', 'CURRENT')]) } }))).toBe('verification');
    expect(openingStep(undefined, w({ top: { workflow: null } }))).toBe('before');
  });
  it('moves to the next step in order and stops after Verification', () => {
    expect(nextStep('before')).toBe('after');
    expect(nextStep('timing')).toBe('verification');
    expect(nextStep('verification')).toBeNull();
  });
  it('shows a step as current only while it is open and nothing was recorded; opening never completes it', () => {
    const views = stepViews(w(), 'before');
    expect(views.map((s) => s.state)).toEqual(['CURRENT', 'PENDING', 'PENDING', 'PENDING']);
    expect(stepViews(w({ top: { workflow: flow([step('BEFORE', 'PENDING'), step('AFTER', 'PENDING'), step('TIMING', 'PENDING'), step('VERIFICATION', 'PENDING')]) } }), 'timing').map((s) => s.state)).toEqual(['PENDING', 'PENDING', 'CURRENT', 'PENDING']);
  });
});

describe('Before Class', () => {
  it('has one real, unticked checkbox with its label, and Submit & Continue is off until it is ticked', () => {
    const out = html(React.createElement(BeforePanel, { ...props(w()), evidence: null, onReschedule: noop }));
    expect(out).toContain('type="checkbox"');
    expect(out).toContain('for="reminder-sent"');
    expect(out).toContain('Tutor has sent the class reminder to the student');
    expect(out).not.toMatch(/<input[^>]*checked=""/);
    expect(out).toMatch(/<button[^>]*disabled=""[^>]*>Submit &amp; Continue/);
    expect(out).toContain('Not submitted');
    expect(beforeProblems(false)).toHaveLength(1);
    expect(beforeProblems(true)).toEqual([]);
  });
  it('shows the saved tick with who and when, and the button simply continues', () => {
    const saved = { stage: 'BEFORE', version: 1, submittedAt: '2026-11-09T08:30:00Z', submittedBy: 'Mira Staff', checklist: { items: { reminderSent: true } } };
    const out = html(React.createElement(BeforePanel, { ...props(w({ top: { workflow: flow([step('BEFORE', 'COMPLETE'), step('AFTER', 'CURRENT'), step('TIMING', 'PENDING', false), step('VERIFICATION', 'PENDING', false)], [saved]) } })), evidence: null, onReschedule: noop }));
    expect(out).toMatch(/<input[^>]*checked=""/);
    expect(out).toContain('Submitted by Mira Staff on 2026-11-09 08:30 UTC');
    expect(out).toContain('>Continue</button>');
    expect(submissionNote({ ...saved, version: 3 })).toContain('corrected 2 times');
  });
  it('shows the scheduled time and the subject Meet link read-only, with no link editor', () => {
    const out = html(React.createElement(BeforePanel, { ...props(w()), evidence: null, onReschedule: noop }));
    expect(out).toContain('data-testid="scheduled-time"');
    expect(out).toContain('https://meet.google.com/abc-defg-hij');
    expect(out).not.toMatch(/type="url"|Save link|Change link/i);
  });
  it('keeps the reminder message record apart from the tick, and says neither changes the other', () => {
    const out = html(React.createElement(BeforePanel, { ...props(w()), evidence: React.createElement('div', { 'data-testid': 'ev' }, 'Prepared, not copied'), onReschedule: noop }));
    expect(out).toContain('data-testid="reminder-evidence"');
    expect(out).toContain('neither changes the other');
    expect(out).toContain('does not prove the student received or read it');
  });
  it('offers Edit Schedule / Reschedule only to someone who may, and only when the API allows it', () => {
    expect(html(React.createElement(BeforePanel, { ...props(w()), evidence: null, onReschedule: noop }))).toContain('Edit Schedule / Reschedule');
    expect(html(React.createElement(BeforePanel, { ...props(w(), { canWork: false }), evidence: null, onReschedule: noop }))).not.toContain('Edit Schedule / Reschedule');
    expect(html(React.createElement(BeforePanel, { ...props(w({ top: { workflow: flow([step('BEFORE', 'CURRENT')], [], { canReschedule: false }) } })), evidence: null, onReschedule: noop }))).not.toContain('Edit Schedule / Reschedule');
  });
  it('is read-only for someone who may not act: the box is disabled and there is no submit', () => {
    const out = html(React.createElement(BeforePanel, { ...props(w(), { canWork: false }), evidence: null, onReschedule: noop }));
    expect(out).toMatch(/<input[^>]*disabled=""/);
    expect(out).not.toContain('Submit &amp; Continue');
  });
});

describe('After Class', () => {
  it('has three separate unticked boxes, the managed activity choices and Submit & Continue off', () => {
    const out = html(React.createElement(AfterPanel, { ...props(w()), evidence: null }));
    for (const label of ['After-class checklist shared', 'Voice recording shared', 'Activities given']) expect(out).toContain(label);
    expect([...out.matchAll(/id="after-/g)].length).toBeGreaterThanOrEqual(3);
    expect(out).toContain('Worksheet');
    expect(out).toContain('Quiz');
    expect(out).not.toContain('Old one');
    expect(out).toMatch(/<button[^>]*disabled=""[^>]*>Submit &amp; Continue/);
  });
  it('shows the tutor update read-only, with class status and the voice update, and no way to edit it', () => {
    const update = { submittedAt: '2026-11-09T11:00:00Z', conducted: true, actualStartMinute: 905, actualEndMinute: 965, actualMinutes: 60, subjectCovered: 'English', topicsCovered: 'Tenses', attendance: 'PRESENT', participation: 'GOOD', classNotes: 'Good class', evaluationRemarks: 'Fine', activities: ['WORKSHEET'], otherActivity: null, voice: { sentAt: '2026-11-09T11:05:00Z', receivedAt: null, remarks: 'Sent to group' } };
    const out = html(React.createElement(AfterPanel, { ...props(w({ class: { update, stateLabel: 'Waiting for the Mentor' } })), evidence: null }));
    expect(out).toContain('Update from the tutor');
    expect(out).toContain('Tenses');
    expect(out).toContain('Class status');
    expect(out).toContain('Waiting for the Mentor');
    expect(out).toContain('Voice update');
    expect(out).toContain('Sent to group');
    expect(out).toContain('only the tutor can change it');
    const rows = tutorUpdateFull({ class: cls({ update, stateLabel: 'Waiting' }) } as any);
    expect(rows[0]).toEqual({ label: 'Class status', value: 'Waiting' });
    expect(rows[rows.length - 1].label).toBe('Voice update');
  });
  it('says the tutor has not submitted when there is no update, and invents nothing', () => {
    expect(html(React.createElement(AfterPanel, { ...props(w()), evidence: null }))).toContain('The tutor has not submitted the class update yet.');
    expect(tutorUpdateFull({ class: cls() } as any)).toEqual([]);
  });
  it('needs all three ticks and at least one activity, and a description for Other', () => {
    const d = emptyAfter();
    expect(afterProblems(d)).toHaveLength(4);
    const ok = { items: { checklistShared: true, voiceShared: true, activitiesGiven: true }, activities: ['QUIZ'], otherDescription: '' };
    expect(afterProblems(ok)).toEqual([]);
    expect(afterProblems({ ...ok, activities: ['OTHER'] })).toEqual(['Describe the other activity.']);
    expect(afterProblems({ ...ok, items: { ...ok.items, voiceShared: false } })).toEqual(['Tick "Voice recording shared".']);
  });
  it('lets several activities be chosen and unchosen', () => {
    expect(toggleCode(toggleCode([], 'QUIZ'), 'WORKSHEET')).toEqual(['QUIZ', 'WORKSHEET']);
    expect(toggleCode(['QUIZ', 'WORKSHEET'], 'QUIZ')).toEqual(['WORKSHEET']);
  });
  it('sends the ticks and the codes of the chosen activities, and the description only for Other', () => {
    const ok = { items: { checklistShared: true, voiceShared: true, activitiesGiven: true }, activities: ['QUIZ', 'WORKSHEET'], otherDescription: ' x ' };
    expect(afterPayload(ok)).toEqual({ items: ok.items, activities: ['QUIZ', 'WORKSHEET'] });
    expect(afterPayload({ ...ok, activities: ['OTHER'] })).toEqual({ items: ok.items, activities: ['OTHER'], otherDescription: 'x' });
  });
  it('starts a correction from what was saved', () => {
    const saved: any = { stage: 'AFTER', version: 2, submittedAt: 'x', submittedBy: null, checklist: { items: { checklistShared: true, voiceShared: true, activitiesGiven: true }, activities: [{ code: 'QUIZ', label: 'Quiz' }], otherDescription: '' } };
    expect(afterDraftOf(saved)).toMatchObject({ activities: ['QUIZ'], items: { voiceShared: true } });
    const out = html(React.createElement(AfterPanel, { ...props(w({ top: { workflow: flow([step('BEFORE', 'COMPLETE'), step('AFTER', 'COMPLETE'), step('TIMING', 'CURRENT'), step('VERIFICATION', 'PENDING')], [saved]) } })), evidence: null }));
    expect(out).toContain('>Continue</button>');
  });
});

describe('Actual Time', () => {
  const update = { submittedAt: 'x', conducted: true, actualStartMinute: 930, actualEndMinute: 990, actualMinutes: 60, voice: null, activities: [] };
  it('keeps scheduled, tutor-reported, Mentor-recorded and verified on separate lines', () => {
    const ww = w({ class: { update }, top: { workflow: flow([], [], { mentorActual: { startMinute: 935, endMinute: 995, minutes: 60, reason: 'Checked the recording', by: 'Mira Staff', at: '2026-11-09T12:00:00Z' } }) } });
    const labels = timeLines(ww).map((l) => l.label);
    expect(labels).toEqual(['Scheduled start and end', 'Scheduled duration', 'Actual start and end, reported by the tutor', 'Actual duration, reported by the tutor', 'Actual start and end, recorded by the Mentor', 'Actual duration, recorded by the Mentor', 'Verified duration']);
    const lines = Object.fromEntries(timeLines(ww).map((l) => [l.label, l.value]));
    expect(lines['Scheduled start and end']).not.toBe(lines['Actual start and end, reported by the tutor']);
    expect(lines['Actual start and end, recorded by the Mentor']).not.toBe(lines['Actual start and end, reported by the tutor']);
    expect(lines['Verified duration']).toBe('Not verified');
  });
  it('says what is missing instead of filling it in', () => {
    const lines = Object.fromEntries(timeLines(w()).map((l) => [l.label, l.value]));
    expect(lines['Actual start and end, reported by the tutor']).toBe('Not reported by the tutor yet');
    expect(lines['Actual start and end, recorded by the Mentor']).toBe('Not recorded');
  });
  it('shows the form with a reason, and the note that the schedule is not changed', () => {
    const out = html(React.createElement(TimingPanel, props(w({ class: { update } }))));
    expect(out).toContain('type="time"');
    expect(out).toContain('Reason');
    expect(out).toContain('Recording a time never changes the schedule');
    expect(out).toContain('Continue to Verification');
  });
  it('has no form for someone who may not act', () => {
    expect(html(React.createElement(TimingPanel, props(w({ class: { update } }), { canWork: false })))).not.toContain('data-testid="actual-form"');
  });
  it('needs a start, an end after it, and a reason', () => {
    expect(actualProblems({ start: '', end: '', reason: '' })).toHaveLength(3);
    expect(actualProblems({ start: '16:30', end: '15:30', reason: 'x' })).toEqual(['an end time after the start time']);
    expect(actualProblems({ start: '15:30', end: '16:30', reason: ' ' })).toEqual(['the reason']);
    expect(actualPayload({ start: '15:30', end: '16:30', reason: ' late ' })).toEqual({ start: '15:30', end: '16:30', reason: 'late' });
    expect(minutesOfInput('16:30')).toBe(990);
    expect(minutesOfInput('24:00')).toBeNull();
  });
});

describe('rescheduling', () => {
  const c = { date: '2026-11-09', startMinute: 900, endMinute: 960 };
  it('starts from the current time and needs a different time, a reason and a confirmation', () => {
    const d = rescheduleDraftOf(c);
    expect(d).toMatchObject({ date: '2026-11-09', start: '15:00', end: '16:00', confirmed: false });
    expect(rescheduleProblems(d, c, '2026-11-01')).toEqual(['a time that is different from the current one', 'the reason', 'your confirmation']);
    expect(rescheduleProblems({ ...d, start: '16:00', end: '17:00', reason: 'Tutor unwell', confirmed: true }, c, '2026-11-01')).toEqual([]);
  });
  it('refuses a past date and an end before the start', () => {
    const d = { ...rescheduleDraftOf(c), reason: 'x', confirmed: true };
    expect(rescheduleProblems({ ...d, date: '2026-10-01' }, c, '2026-11-01')).toContain('a date that is today or later');
    expect(rescheduleProblems({ ...d, start: '17:00', end: '16:00' }, c, '2026-11-01')).toContain('an end time after the start time');
  });
});

describe('Verification', () => {
  const upd = { submittedAt: '2026-11-09T11:00:00Z', conducted: true, actualStartMinute: 900, actualEndMinute: 960, actualMinutes: 60, voice: null, activities: [] };
  it('lists the evidence, saying what is not recorded', () => {
    const lines = evidenceLines(w());
    expect(lines.map((l) => l.label)).toEqual(['Before-class checklist', 'Reminder shared in the group', 'After-class checklist', 'Activities given', 'Tutor update', 'Voice recording', 'Scheduled time', 'Actual time']);
    expect(lines.find((l) => l.label === 'Before-class checklist')).toMatchObject({ ok: false, value: 'Not submitted by the Mentor' });
    expect(lines.find((l) => l.label === 'Voice recording')).toMatchObject({ ok: false, value: 'Not uploaded' });
  });
  it('offers Return for Correction and Mark Incomplete only to the Mentor while the class waits, each needing a reason', () => {
    const waiting = w({ class: { status: 'AWAITING_MENTOR_VERIFICATION', update: upd } });
    const out = html(React.createElement(VerificationPanel, { w: waiting, busy: false, canWork: true, run: noop }, React.createElement('div', { 'data-testid': 'review' })));
    expect(out).toContain('Return for Correction');
    expect(out).toContain('Mark Incomplete');
    expect(out).toMatch(/<button[^>]*disabled=""[^>]*>Return for Correction/);
    expect(out).toContain('data-testid="review"');
    expect(out).toContain('Neither action verifies the class');
    expect(html(React.createElement(VerificationPanel, { w: waiting, busy: false, canWork: false, run: noop }, null))).not.toContain('Return for Correction');
    expect(html(React.createElement(VerificationPanel, { w: w(), busy: false, canWork: true, run: noop }, null))).not.toContain('Return for Correction');
  });
  it('does not verify anything by being opened', () => {
    const out = html(React.createElement(VerificationPanel, { w: w(), busy: false, canWork: true, run: noop }, null));
    expect(out).toContain('Nothing here is verified automatically');
  });
});

describe('the activity options list in Settings', () => {
  const rows: ActivityOption[] = [
    { id: 'b', code: 'QUIZ', label: 'Quiz', isActive: true, sortOrder: 20 },
    { id: 'a', code: 'WORKSHEET', label: 'Worksheet', isActive: false, sortOrder: 10 },
  ];
  it('lists by order', () => expect(sortedOptions(rows).map((r) => r.id)).toEqual(['a', 'b']));
  it('refuses a duplicate however it is written, and points to a switched-off one', () => {
    expect(labelProblem('  quiz ', rows, null)).toContain('already on the list');
    expect(labelProblem('WORKSHEET', rows, null)).toContain('Switch it on instead');
    expect(labelProblem('Quiz', rows, 'b')).toBeNull();
    expect(labelProblem('Quiz', rows, 'a')).toContain('already on the list');
  });
  it('needs a name of 60 characters or fewer', () => {
    expect(labelProblem('   ', rows, null)).toBe('Write the name of the activity.');
    expect(labelProblem('x'.repeat(61), rows, null)).toBe('The name must be 60 characters or fewer.');
    expect(labelProblem('Role play', rows, null)).toBeNull();
  });
});
