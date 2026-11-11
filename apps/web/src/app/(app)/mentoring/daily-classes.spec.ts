import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { fetchApi } from '@/lib/api/client';

import { tutorPortalApiAction } from '../tutor-portal/actions';
import { ClassUpdateForm, EarningsView, MyClassCard } from '../tutor-portal/TutorClasses';

import {
  ACTIVITIES, ClassItem, EarningsData, STATE_CHOICES, STATE_TONE, TUTOR_CONFIRMATION_LABELS, UpdateDraft, VERIFICATION_LABELS, draftFromClass, hoursText, payloadOfUpdate, toggleActivity, updateProblems,
} from './class-view';
import { ClassCard, ClassReview, RescheduleForm } from './students/[id]/DailyClassesPanel';

jest.mock('@/lib/api/client', () => ({ fetchApi: jest.fn() }));

const text = (markup: string) => markup.replace(/<[^>]+>/g, ' ').replace(/&#x27;/g, "'").replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
const noop = () => undefined;

const item = (over: Partial<ClassItem> = {}): ClassItem => ({
  key: 'as-class-1~2026-11-09~900', sessionId: null, activationId: 'act-1', studentName: 'Synthetic Student A', subjectId: 'sub-en', subjectName: 'English', tutorProfileId: 'tp-1', tutorName: 'Meera Thomas',
  date: '2026-11-09', startMinute: 900, endMinute: 960, scheduledMinutes: 60, moved: false, status: 'SCHEDULED', state: 'SCHEDULED', stateLabel: 'Scheduled', reminder: null, tutorConfirmation: 'NOT_SENT',
  mentorVerification: 'PENDING', update: null,
  checklist: [{ key: 'REMINDER', label: 'Tutor class reminder', done: false, detail: 'Not prepared' }, { key: 'UPDATE', label: 'Class update from the tutor', done: false, detail: 'Not submitted' }],
  mentorRemarks: null, returned: null, verified: null, sla: null, ...over,
});
const submitted = (over: Partial<ClassItem> = {}) => item({
  sessionId: 'sess-1', status: 'AWAITING_MENTOR_VERIFICATION', state: 'AWAITING_MENTOR_VERIFICATION', stateLabel: 'Awaiting Mentor verification',
  update: {
    conducted: true, actualStartMinute: 905, actualEndMinute: 970, actualMinutes: 65, subjectCovered: 'English', topicsCovered: 'Tenses', attendance: 'PRESENT', participation: 'GOOD', classNotes: 'Calm class',
    notConductedReason: null, activities: ['QUIZ', 'OTHER'], otherActivity: 'Role play', evaluationRemarks: 'Attentive, needs practice', coveredRemarks: 'Chapter 3, exercise 2', voice: { sentAt: '2026-11-09T11:30:00.000Z', receivedAt: null, remarks: null }, submittedAt: '2026-11-09T11:35:00.000Z',
  },
  warnings: ['The tutor voice update has not been confirmed as received.'], ...over,
});

describe('the Mentor class card', () => {
  const card = (c: ClassItem, canWork = true) => renderToStaticMarkup(React.createElement(ClassCard, { c, canWork, onPrepare: noop, onSend: noop, onReschedule: noop, onReview: noop }));

  it("shows the student, subject, tutor, date, times, scheduled duration, tutor confirmation, class status and Mentor verification", () => {
    const t = text(card(item()));
    for (const part of ['English', '3:00 PM to 4:00 PM', 'Synthetic Student A', 'Meera Thomas', 'Monday, 9 November 2026', '1 h', 'No reminder sent', 'Not verified', 'Scheduled']) expect(t).toContain(part);
  });

  it("lists the checklist with each item pending until it is really done", () => {
    const markup = card(item({ checklist: [{ key: 'REMINDER', label: 'Tutor class reminder', done: true, detail: 'Sent' }, { key: 'UPDATE', label: 'Class update from the tutor', done: false, detail: '' }] }));
    expect(text(markup)).toContain('Tutor class reminder: done');
    expect(text(markup)).toContain('Class update from the tutor: pending');
  });

  it('offers reminder and reschedule actions to the Mentor for a class not yet reported, and nothing to verify', () => {
    const markup = text(card(item()));
    for (const a of ['Prepare reminder', 'Send reminder', 'Reschedule']) expect(markup).toContain(a);
    expect(markup).not.toContain('Review and verify');
  });

  it('offers the review once the tutor has submitted, and no reminder or reschedule any more', () => {
    const markup = text(card(submitted()));
    expect(markup).toContain('Review and verify');
    expect(markup).not.toContain('Send reminder');
    expect(markup).not.toContain('Reschedule');
  });

  it('shows someone who may not work the class no actions except viewing the update', () => {
    const markup = text(card(submitted(), false));
    expect(markup).not.toContain('Prepare reminder');
    expect(markup).not.toContain('Review and verify');
    expect(markup).toContain('View update');
    expect(text(card(item(), false))).not.toContain('Prepare reminder');
  });

  it('shows the response clock, how late it is, and why a class was returned', () => {
    const markup = text(card(submitted({ sla: { state: 'BREACHED', label: 'SLA breached', dueAt: '2026-11-10T04:30:00.000Z', overdueMinutes: 45 }, returned: { reason: 'Add the topics', kind: 'CORRECTION' } })));
    expect(markup).toContain('SLA breached, 45 min overdue');
    expect(markup).toContain('Returned to the tutor: Add the topics');
  });

  it('marks a moved class and names every state', () => {
    expect(text(card(item({ moved: true, status: 'RESCHEDULED', state: 'RESCHEDULED', stateLabel: 'Rescheduled' })))).toContain('Moved');
    expect(STATE_CHOICES.map((s) => s[1])).toEqual(['Scheduled', 'Reminder pending', 'Reminder sent', 'Awaiting tutor update', 'Awaiting Mentor verification', 'Returned for correction', 'Verified', 'Not conducted', 'Rescheduled', 'Cancelled']);
    expect(Object.keys(STATE_TONE)).toHaveLength(10);
    expect(TUTOR_CONFIRMATION_LABELS.ACKNOWLEDGED).toBe('Acknowledged by the tutor');
    expect(VERIFICATION_LABELS.VERIFIED).toBe('Verified');
  });
});

describe('the Mentor review of a class', () => {
  const review = (c: ClassItem, canWork = true) => renderToStaticMarkup(React.createElement(ClassReview, { c, canWork, onClose: noop, onNotes: noop, onVerify: noop, onReturn: noop, onAdjust: noop }));

  it("shows the tutor's update, the activities, and the two remarks as separate fields", () => {
    const t = text(review(submitted()));
    for (const part of ['Class conducted Yes', 'Actual time 3:05 PM to 4:10 PM (1 h 5 min)', 'Topics covered Tenses', 'Attendance Present', 'Participation Good', 'Quiz, Other: Role play', 'Remarks, class evaluation Attentive, needs practice', 'Remarks, topics covered in class Chapter 3, exercise 2', 'Class notes Calm class']) expect(t).toContain(part);
  });

  it('shows the checklist, the warnings before verifying, and every decision the Mentor can make', () => {
    const t = text(review(submitted()));
    expect(t).toContain('Before you verify');
    expect(t).toContain('The tutor voice update has not been confirmed as received.');
    for (const a of ['Verify class', 'Return to tutor for correction', 'Mark incomplete', 'Save remarks', 'Confirm the voice update arrived', 'Verified minutes']) expect(t).toContain(a);
  });

  it('says plainly when the tutor has submitted nothing, and offers no decision', () => {
    const t = text(review(item({ sessionId: 's' })));
    expect(t).toContain('The tutor has not submitted an update for this class.');
    expect(t).not.toContain('Verify class');
  });

  it('a class that was not conducted is confirmed, not verified for pay', () => {
    const c = submitted({ update: { ...submitted().update!, conducted: false, notConductedReason: 'Student unwell', actualStartMinute: null, actualEndMinute: null, actualMinutes: null, activities: [] } });
    const t = text(review(c));
    expect(t).toContain('Reason not conducted Student unwell');
    expect(t).toContain('Confirm class not conducted');
    expect(t).not.toContain('Verified minutes');
  });

  it('a verified class can be corrected only with a reason, and says payroll history is kept', () => {
    const c = submitted({ status: 'VERIFIED', state: 'VERIFIED', stateLabel: 'Verified', verified: { at: '2026-11-09T12:30:00.000Z', minutes: 65 }, warnings: [] });
    const t = text(review(c));
    expect(t).toContain('Verified for 1 h 5 min. A correction is recorded as an adjustment and payroll history is kept.');
    expect(t).toContain('Record correction');
    expect(t).not.toContain('Verify class');
    expect(t).not.toContain('Return to tutor');
  });

  it('shows no decision to someone who may not work the class', () => {
    const t = text(review(submitted(), false));
    expect(t).not.toContain('Verify class');
    expect(t).not.toContain('Save remarks');
    expect(t).toContain('Topics covered Tenses');
  });
});

describe('the reschedule form', () => {
  it('asks for the new date, times and a reason, and says what is checked and kept', () => {
    const t = text(renderToStaticMarkup(React.createElement(RescheduleForm, { c: item(), onSubmit: noop, onCancel: noop })));
    for (const part of ['Reschedule English on Monday, 9 November 2026, 3:00 PM to 4:00 PM', 'New date', 'New start', 'New end', 'Reason required', 'the tutor availability and the other classes of this student are checked', 'original time is kept in the history']) expect(t.toLowerCase()).toContain(part.toLowerCase());
    expect(renderToStaticMarkup(React.createElement(RescheduleForm, { c: item(), onSubmit: noop, onCancel: noop }))).toMatch(/<button[^>]*\sdisabled=""[^>]*>Move the class/);
  });
});

describe('the tutor class update form', () => {
  const empty = draftFromClass({ update: null });
  const form = (d: UpdateDraft, error: string | null = null) => renderToStaticMarkup(React.createElement(ClassUpdateForm, { c: item(), draft: d, error, onChange: noop, onSubmit: noop, onCancel: noop }));
  const good: UpdateDraft = { ...empty, conducted: 'yes', actualStart: '15:05', actualEnd: '16:10', topicsCovered: 'Tenses', attendance: 'PRESENT' };

  it('starts empty and asks first whether the class was conducted, filling nothing in for the tutor', () => {
    expect(empty).toMatchObject({ conducted: '', actualStart: '', actualEnd: '', topicsCovered: '', activities: [] });
    const markup = form(empty);
    expect(text(markup)).toContain('Was the class conducted?');
    expect(text(markup)).not.toContain('Actual start time');
    expect(markup).toMatch(/<button[^>]*\sdisabled=""[^>]*>Submit class update/);
    expect(text(markup)).toContain('Still needed: say whether the class was conducted.');
  });

  it('asks only for a reason when the class was not conducted', () => {
    const markup = form({ ...empty, conducted: 'no' });
    expect(text(markup)).toContain('Why was it not conducted? required');
    expect(text(markup)).not.toContain('Actual start time');
    expect(form({ ...empty, conducted: 'no', notConductedReason: 'Student unwell' })).not.toMatch(/<button[^>]*\sdisabled=""[^>]*>Submit class update/);
  });

  it('for a conducted class shows every field, with the duration worked out from the times', () => {
    const t = text(form(good));
    for (const part of ['Actual start time', 'Actual end time', 'Actual teaching duration 1 h 5 min', 'Subject covered', 'Topics covered', 'Attendance', 'Student participation', 'Post-class activities', 'Class notes']) expect(t).toContain(part);
    expect(form(good)).not.toMatch(/<button[^>]*\sdisabled=""[^>]*>Submit class update/);
  });

  it('keeps the two remarks as separate fields with their own labels and prompts', () => {
    const markup = form(good);
    expect(markup).toContain('id="update-as-class-1~2026-11-09~900-evaluation"');
    expect(markup).toContain('id="update-as-class-1~2026-11-09~900-covered"');
    expect(text(markup)).toContain('Remarks, class evaluation');
    expect(text(markup)).toContain('Remarks, topics covered in class');
    expect(markup).toContain('Understanding, attention and participation');
    expect(markup).toContain('Topics taught, chapters, exercises done');
  });

  it('lets several activities be chosen, with all thirteen on offer, and asks for a description when Other is ticked', () => {
    expect(ACTIVITIES).toHaveLength(13);
    const markup = form({ ...good, activities: ['QUIZ', 'REVISION'] });
    expect((markup.match(/type="checkbox"/g) ?? []).length).toBe(13 + 1); // thirteen activities and the voice update
    expect((markup.match(/checked=""/g) ?? []).length).toBeGreaterThanOrEqual(2);
    expect(text(markup)).not.toContain('Describe the other activity');
    expect(text(form({ ...good, activities: ['OTHER'] }))).toContain('Describe the other activity required');
    expect(updateProblems({ ...good, activities: ['OTHER'] })).toEqual(['a description of the other activity']);
    expect(toggleActivity(['QUIZ'], 'REVISION')).toEqual(['QUIZ', 'REVISION']);
    expect(toggleActivity(['QUIZ', 'REVISION'], 'QUIZ')).toEqual(['REVISION']);
  });

  it('treats the voice update as a checklist statement, not a recording', () => {
    const t = text(form(good));
    expect(t).toContain('I have sent my voice update to the Mentor.');
    expect(t).toContain('Nothing is recorded or stored here.');
    expect(form(good)).not.toContain('type="file"');
    expect(form(good)).not.toContain('audio');
  });

  it('says what is still missing, and what submitting does and does not do', () => {
    expect(updateProblems({ ...good, actualEnd: '15:00' })).toEqual(['an end time after the start time']);
    expect(updateProblems({ ...good, topicsCovered: ' ', attendance: '' })).toEqual(['the topics covered', 'attendance']);
    expect(updateProblems({ ...good, actualStart: '' })).toEqual(['the actual start and end times', 'the topics covered'].slice(0, 1));
    expect(text(form(good))).toContain('The class counts as completed only after the Mentor verifies it.');
  });

  it('turns the draft into the request the server expects', () => {
    expect(payloadOfUpdate({ ...good, activities: ['QUIZ', 'OTHER'], otherActivity: 'Role play', evaluationRemarks: 'Fine', coveredRemarks: 'Ch 3', voiceSent: true })).toEqual({
      conducted: true, actualStart: '15:05', actualEnd: '16:10', subjectCovered: undefined, topicsCovered: 'Tenses', attendance: 'PRESENT', participation: undefined, classNotes: undefined,
      activities: ['QUIZ', 'OTHER'], otherActivity: 'Role play', evaluationRemarks: 'Fine', coveredRemarks: 'Ch 3', voiceSent: true,
    });
    expect(payloadOfUpdate({ ...empty, conducted: 'no', notConductedReason: 'Unwell' })).toEqual({ conducted: false, notConductedReason: 'Unwell', voiceSent: false });
  });

  it('shows a correction of an earlier update with what was submitted', () => {
    const d = draftFromClass(submitted());
    expect(d).toMatchObject({ conducted: 'yes', actualStart: '15:05', actualEnd: '16:10', topicsCovered: 'Tenses', attendance: 'PRESENT', activities: ['QUIZ', 'OTHER'], otherActivity: 'Role play', voiceSent: true });
  });

  it('shows a server refusal beside the form', () => {
    expect(form(good, 'This class has already been verified, so it cannot be changed here.')).toContain('role="alert"');
  });
});

describe('my classes', () => {
  const card = (c: ClassItem) => renderToStaticMarkup(React.createElement(MyClassCard, { c, onUpdate: noop }));

  it('offers to submit an update, and to correct one that was returned, with the Mentor\'s reason', () => {
    expect(text(card(item()))).toContain('Submit class update');
    const returned = card(item({ status: 'RETURNED_FOR_CORRECTION', state: 'RETURNED_FOR_CORRECTION', stateLabel: 'Returned for correction', returned: { reason: 'Add the topics', kind: 'CORRECTION' }, update: submitted().update }));
    expect(text(returned)).toContain('Your Mentor returned this update: Add the topics');
    expect(text(returned)).toContain('Correct class update');
  });

  it('offers no update for a class that is already verified, and shows the verified time', () => {
    const t = text(card(item({ status: 'VERIFIED', state: 'VERIFIED', stateLabel: 'Verified', verified: { at: '2026-11-09T12:00:00.000Z', minutes: 60 } })));
    expect(t).not.toContain('Submit class update');
    expect(t).toContain('1 h verified');
  });
});

describe('my completed classes and earnings', () => {
  const data: EarningsData = {
    from: '2026-11-09', to: '2026-11-11',
    verified: [
      { sessionId: 's1', date: '2026-11-09', subject: 'English', scheduledMinutes: 60, actualMinutes: 60, verifiedMinutes: 60, estimatedAmount: 50, currency: 'AED', payroll: null, adjustments: [] },
      { sessionId: 's2', date: '2026-11-10', subject: 'English', scheduledMinutes: 60, actualMinutes: 60, verifiedMinutes: 60, estimatedAmount: null, currency: null,
        payroll: { period: '2026-11-01 to 2026-11-30', runStatus: 'FINALIZED', paymentStatus: 'PAID', amount: 50, currency: 'AED', paidAt: '2026-12-05T00:00:00.000Z' }, adjustments: [{ at: '2026-11-20T00:00:00.000Z', deltaMinutes: -15, reason: 'Ended early', appliedToRecord: false }] },
    ],
    pending: [{ sessionId: 's3', date: '2026-11-11', subject: 'English', scheduledMinutes: 90, actualMinutes: 90, status: 'AWAITING_MENTOR_VERIFICATION', pendingMinutes: 90 }],
    totals: { verifiedMinutes: 120, pendingMinutes: 90, estimatedAmount: 50, classesWithoutRate: 1 },
    note: 'The amount is an estimate from the hourly rate in force on each class date. The amount that is paid comes from the payroll run.',
  };
  const view = text(renderToStaticMarkup(React.createElement(EarningsView, { data })));

  it('shows verified time and pending time apart, as in the example: 2 hours verified, 1.5 hours pending', () => {
    expect(view).toContain('Verified teaching time 2 h');
    expect(view).toContain('Pending Mentor verification 1 h 30 min');
    expect(view).toContain('Nov, English, 1 h 30 min. Waiting for the Mentor.'.replace('Nov, ', ''));
  });

  it('shows the estimate as an estimate, a class with no rate as having none, and what payroll did', () => {
    expect(view).toContain('Estimated amount 50.00');
    expect(view).toContain('AED 50.00');
    expect(view).toContain('No rate set');
    expect(view).toContain('Classes with no rate set 1');
    expect(view).toContain('estimate from the hourly rate');
    expect(view).toContain('2026-11-01 to 2026-11-30');
    expect(view).toContain('Paid');
    expect(view).toContain('Not in a payroll run yet');
    expect(view).toContain('Correction -15 min: Ended early');
  });

  it('says plainly when nothing is verified or pending', () => {
    const none = text(renderToStaticMarkup(React.createElement(EarningsView, { data: { ...data, verified: [], pending: [], totals: { verifiedMinutes: 0, pendingMinutes: 0, estimatedAmount: 0, classesWithoutRate: 0 } } })));
    expect(none).toContain('No class has been verified in these dates.');
    expect(none).toContain('Nothing is waiting for your Mentor.');
  });
});

describe('the tutor portal bridge', () => {
  const mocked = fetchApi as jest.Mock;
  beforeEach(() => mocked.mockReset());

  it('forwards only the tutor portal routes it knows, and refuses everything else without calling the API', async () => {
    mocked.mockResolvedValue({ ok: 1 });
    await expect(tutorPortalApiAction('/tutor-portal/classes?from=2026-11-09&to=2026-11-15')).resolves.toMatchObject({ ok: true });
    await expect(tutorPortalApiAction('/tutor-portal/earnings?from=2026-11-01&to=2026-11-30')).resolves.toMatchObject({ ok: true });
    await expect(tutorPortalApiAction('/tutor-portal/classes/as-class-1~2026-11-09~900/update', 'PUT', { conducted: false })).resolves.toMatchObject({ ok: true });
    mocked.mockClear();
    for (const bad of ['/mentoring/classes/x/verify', '/tutor-portal/classes?from=2026-11-09&to=2026-11-15&tutor=x', '/tutor-portal/classes/../x/update', '/tutor-portal/classes/x/update', '/tutor-portal/me', 'https://evil.test/tutor-portal/classes?from=2026-11-09&to=2026-11-15']) {
      await expect(tutorPortalApiAction(bad, 'PUT', {})).resolves.toMatchObject({ ok: false });
    }
    await expect(tutorPortalApiAction('/tutor-portal/classes?from=2026-11-09&to=2026-11-15', 'PUT', {})).resolves.toMatchObject({ ok: false }); // a read is never a write
    await expect(tutorPortalApiAction('/tutor-portal/classes/as-class-1~2026-11-09~900/update', 'GET')).resolves.toMatchObject({ ok: false });
    expect(mocked).not.toHaveBeenCalled();
  });
});

describe('the words', () => {
  it('writes no dashes or emoji in its copy, and names durations plainly', () => {
    const all = [text(renderToStaticMarkup(React.createElement(ClassCard, { c: submitted(), canWork: true, onPrepare: noop, onSend: noop, onReschedule: noop, onReview: noop }))), ...STATE_CHOICES.map((s) => s[1]), ...Object.values(TUTOR_CONFIRMATION_LABELS), ...Object.values(VERIFICATION_LABELS), ...ACTIVITIES.map((a) => a[1])].join(' ');
    expect(all).not.toMatch(/[–—]/);
    expect(all).not.toMatch(/\p{Extended_Pictographic}/u);
    expect(hoursText(90)).toBe('1 h 30 min');
    expect(hoursText(45)).toBe('45 min');
    expect(hoursText(120)).toBe('2 h');
  });
});
