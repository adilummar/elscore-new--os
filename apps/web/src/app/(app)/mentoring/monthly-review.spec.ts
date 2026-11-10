import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import {
  EXPECTATION_FIELDS, MEETING_TONE, NEXT_PLAN_KIND_CHOICES, PARTICIPATION_CHOICES, POST_MEETING_FIELDS, REMARK_FIELDS, RESULT_CHOICES, ReviewData, ReviewGoal, ReviewSubject, Tally, actualProblems, attendeesOf, dayAfter, draftOfActual, draftOfGoal, draftOfNextPlan,
  emptyGoalDraft, goalProblems, nextPlanProblems, payloadOfActual, payloadOfGoal, percentLabel, resultLabel, tallyText, timeLabel,
} from './review-view';
import {
  CompletionChecklist, ExamRecord, FieldsForm, GoalCard, GoalEvaluation, ImprovementAreas, MeetingRecord, NextPlan, NextPlanSubject, ReviewDashboard, ReviewMoveForm, ScheduleForm, TutorObservations,
} from './students/[id]/MonthlyReviewPanel';

const text = (markup: string) => markup.replace(/<[^>]+>/g, ' ').replace(/&#x27;/g, "'").replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
const noop = () => undefined;
const render = (el: React.ReactElement) => renderToStaticMarkup(el);

const tally = (over: Partial<Tally> = {}): Tally => ({ total: 0, yes: 0, partially: 0, no: 0, unevaluated: 0, percent: null, result: null, ...over });
const goal = (over: Partial<ReviewGoal> = {}): ReviewGoal => ({ id: 'g-1', source: 'PLAN', goal: 'Read a page aloud', expectedOutcome: null, actualProgress: null, result: null, evidence: null, improvementAreas: null, remainingGaps: null, evaluatedAt: null, ...over });
const subject = (over: Partial<ReviewSubject> = {}): ReviewSubject => ({
  subjectId: 'sub-en', subjectName: 'English', planStart: '2026-11-10', planEnd: '2026-12-10', plan: { description: 'English plan', objectives: 'Read a page aloud', topics: 'Reading', outcomes: 'Fluent' },
  goals: [goal()], tally: tally({ total: 1, unevaluated: 1 }), improvementAreas: [], tutorObservation: null, tutorFeedback: [], examAverage: null, nextPlan: null, ...over,
});
const data = (over: Partial<ReviewData> = {}): ReviewData => ({
  student: { id: 'stu-1', name: 'Synthetic Student A' }, mentorName: 'Mira Mentor', canWork: true, period: { planId: 'p-1', planStatus: 'APPROVED', start: '2026-11-10', end: '2026-12-10' },
  meeting: {
    id: 'm-1', state: 'SCHEDULED', stateLabel: 'Scheduled', date: '2026-12-10', originalDate: '2026-12-10', startMinute: 990, endMinute: 1050, status: 'SCHEDULED', conducted: null, notConductedReason: null, actual: null, attendees: [],
    participation: null, participationNote: null, examsReviewed: null, completedAt: null, nextPlanApproved: null,
  },
  exams: { items: [], message: 'No exam records available for this learning period.', warnings: [] }, subjects: [subject()], overall: tally({ total: 1, unevaluated: 1 }),
  remarks: {}, postMeeting: {}, generalAreas: [], checklist: [{ key: 'CONDUCTED', label: 'Meeting conducted', done: false, detail: 'Not recorded yet' }], problems: ['x'], canComplete: false, previous: [], notice: null, ...over,
});

describe('the dashboard', () => {
  it('shows the plan period, the meeting date and time, the Mentor, the parent meeting status, progress and exam performance', () => {
    const t = text(render(React.createElement(ReviewDashboard, { d: data() })));
    for (const part of ['Learning plan start Tuesday, 10 November 2026', 'Learning plan end Thursday, 10 December 2026', 'Review meeting Thursday, 10 December 2026, 4:30 PM to 5:30 PM', 'Assigned Mentor Mira Mentor', 'Parent meeting Scheduled', 'No exams in this period', 'English', '1 not evaluated']) expect(t).toContain(part);
  });

  it('says plainly that the date is pending when no meeting is scheduled', () => {
    const t = text(render(React.createElement(ReviewDashboard, { d: data({ meeting: null, period: { planId: 'p-1', planStatus: 'DRAFT', start: '2026-11-10', end: null }, notice: 'No monthly review meeting is scheduled.' }) })));
    expect(t).toContain('Monthly review meeting date pending');
    expect(t).toContain('Not scheduled');
    expect(t).toContain('No monthly review meeting is scheduled.');
  });

  it('shows the first date of a moved meeting, and the overall result worked out from the separate goals', () => {
    const moved = data({ overall: tally({ total: 4, yes: 1, no: 1, unevaluated: 2, percent: 50 }) });
    (moved.meeting as NonNullable<ReviewData['meeting']>).date = '2026-12-15';
    const t = text(render(React.createElement(ReviewDashboard, { d: moved })));
    expect(t).toContain('First scheduled date Thursday, 10 December 2026');
    expect(t).toContain('Overall, worked out from the separate goals: 1 achieved, 1 not achieved, 2 not evaluated. 50% of the evaluated goals achieved.');
  });
});

describe('scheduling and moving', () => {
  it('says the meeting date becomes the end of the learning plan, and needs a date before it can be used', () => {
    const html = render(React.createElement(ScheduleForm, { onSubmit: noop }));
    expect(text(html)).toContain('end date of the current learning plan for every subject');
    expect(html).toMatch(/<button[^>]*\sdisabled=""[^>]*>[^<]*Schedule the meeting/);
  });

  it('needs a reason and a change to move the meeting, and says what is kept and who is told', () => {
    const html = render(React.createElement(ReviewMoveForm, { d: data(), onSubmit: noop, onCancel: noop }));
    expect(html).toMatch(/<button[^>]*\sdisabled=""[^>]*>[^<]*Move the meeting/);
    const t = text(html);
    for (const part of ['first date is kept in the history', 'end date of the learning plan moves with the meeting', 'tutors are told in the app', 'You tell the parent']) expect(t).toContain(part);
  });
});

describe('the meeting record', () => {
  const record = (d: ReviewData) => text(render(React.createElement(MeetingRecord, { d, busy: false, call: noop })));

  it('offers only held or not held before the meeting is recorded, and no details form', () => {
    const t = record(data());
    expect(t).toContain('The meeting was held');
    expect(t).toContain('The meeting was not held');
    expect(t).not.toContain('Actual start');
  });

  it('after the meeting was held asks for the real date, times, attendees and parent participation, and says what is missing', () => {
    const d = data();
    (d.meeting as NonNullable<ReviewData['meeting']>).conducted = true;
    const t = record(d);
    for (const part of ['Date held', 'Actual start', 'Actual end', 'Attendees', 'Parent participation', 'Still needed: the date the meeting was held, the start and end times, who attended, whether the parent took part']) expect(t).toContain(part);
  });

  it('shows what was recorded, and says a meeting not held must be rescheduled', () => {
    const d = data();
    const m = d.meeting as NonNullable<ReviewData['meeting']>;
    m.conducted = true; m.actual = { date: '2026-12-10', startMinute: 995, endMinute: 1040 }; m.attendees = ['Mentor', 'Parent A']; m.participation = 'PARTIAL'; m.participationNote = 'Left early';
    expect(record(d)).toContain('Held on Thursday, 10 December 2026, 4:35 PM to 5:20 PM. Attended by Mentor, Parent A. Parent attended part of the meeting. Left early');
    const n = data();
    (n.meeting as NonNullable<ReviewData['meeting']>).conducted = false;
    (n.meeting as NonNullable<ReviewData['meeting']>).notConductedReason = 'Parent did not come';
    expect(record(n)).toContain('The meeting was not held: Parent did not come. Reschedule it to continue.');
  });

  it('turns what is typed into a request, and checks the obvious first', () => {
    const d = { actualDate: '2026-12-10', start: '16:35', end: '17:20', attendeesText: 'Mentor\nParent A, Tutor', participation: 'FULL', participationNote: '' };
    expect(attendeesOf(d.attendeesText)).toEqual(['Mentor', 'Parent A', 'Tutor']);
    expect(payloadOfActual(d)).toMatchObject({ actualDate: '2026-12-10', start: '16:35', end: '17:20', attendees: ['Mentor', 'Parent A', 'Tutor'], participation: 'FULL' });
    expect(actualProblems(d)).toEqual([]);
    expect(actualProblems({ ...d, end: '16:00', attendeesText: '', participation: '' })).toEqual(['an end time after the start time', 'who attended', 'whether the parent took part']);
    const m = data().meeting as NonNullable<ReviewData['meeting']>;
    m.actual = { date: '2026-12-10', startMinute: 995, endMinute: 1040 }; m.attendees = ['Mentor'];
    expect(draftOfActual(m)).toMatchObject({ actualDate: '2026-12-10', start: '16:35', end: '17:20', attendeesText: 'Mentor' });
  });
});

describe('the exam record of the period', () => {
  const exams = (d: ReviewData) => text(render(React.createElement(ExamRecord, { d, busy: false, call: noop })));
  const exam = { id: 'e-1', subjectId: 'sub-en', subjectName: 'English', date: '2026-11-20', kind: 'EXAM', title: 'English unit 1', conducted: true as boolean | null, marksObtained: 45 as number | null, maxMarks: 60 as number | null, percentage: 75 as number | null, chapters: ['Tenses', 'Nouns'], portion: 'Chapters 1 and 2', weaknesses: 'Tenses', topicsToImprove: 'Past perfect', tutorSuggestions: 'Daily practice', mentorRemarks: null as string | null };

  it('says there are no exams, in the words of the specification, and invents nothing', () => {
    const t = exams(data());
    expect(t).toContain('No exam records available for this learning period.');
    expect(t).toContain('Record that there are no exams to review');
  });

  it('shows every field of an exam, grouped by subject, with none recorded where nothing was written', () => {
    const t = exams(data({ exams: { items: [exam], message: null, warnings: [] } }));
    for (const part of ['English', 'English unit 1, Friday, 20 November 2026', 'Marks 45 of 60, 75%', 'Chapters: Tenses, Nouns', 'Portion: Chapters 1 and 2', 'Areas of weakness: Tenses', 'Topics to improve: Past perfect', 'Tutor suggestions: Daily practice', 'Mentor remarks: None recorded', 'I have reviewed the exam performance']) expect(t).toContain(part);
  });

  it('shows an exam without marks as having none, and one not conducted as not conducted', () => {
    expect(exams(data({ exams: { items: [{ ...exam, marksObtained: null, maxMarks: null, percentage: null }], message: null, warnings: ['1 exam was sat and has no marks recorded yet.'] } }))).toContain('Marks not recorded. Chapters');
    expect(exams(data({ exams: { items: [{ ...exam, conducted: false, marksObtained: null, maxMarks: null, percentage: null }], message: null, warnings: [] } }))).toContain('Not conducted.');
    expect(exams(data({ exams: { items: [exam], message: null, warnings: ['1 exam was sat and has no marks recorded yet.'] } }))).toContain('1 exam was sat and has no marks recorded yet.');
  });

  it('shows that the exams were reviewed once the Mentor says so', () => {
    const d = data();
    (d.meeting as NonNullable<ReviewData['meeting']>).examsReviewed = { at: '2026-12-10T12:00:00.000Z', note: 'No exams this month' };
    const t = exams(d);
    expect(t).toContain('Reviewed');
    expect(t).toContain('No exams this month');
    expect(t).not.toContain('Record that there are no exams to review');
  });
});

describe('goal evaluation', () => {
  const card = (g: ReviewGoal, canWork = true) => render(React.createElement(GoalCard, { g, canWork, busy: false, onSave: noop, onRemove: noop }));

  it('has the fields of the specification for every goal, each on its own', () => {
    const t = text(card(goal()));
    for (const part of ['Read a page aloud', 'From the plan', 'Goal achieved: Not evaluated', 'Expected learning outcome', 'Actual progress', 'Goal achieved?', 'Evidence or observation', 'Improvement areas', 'Remaining gaps', 'Save this goal', 'Remove this goal']) expect(t).toContain(part);
    expect(text(card(goal()))).toContain('Still needed: whether it was achieved, the actual progress');
  });

  it('offers yes, partially and no, and no single completed box', () => {
    expect(RESULT_CHOICES.map((r) => r[1])).toEqual(['Yes', 'Partially', 'No']);
    const t = card(goal());
    expect(t).not.toMatch(/type="checkbox"/);
  });

  it('shows an evaluated goal read only for someone who cannot change it', () => {
    const t = text(card(goal({ result: 'PARTIALLY', actualProgress: 'Reads short pages', evidence: 'Class work', remainingGaps: 'Long words' }), false));
    expect(t).toContain('Goal achieved: Partially');
    expect(t).toContain('Actual progress: Reads short pages');
    expect(t).toContain('Remaining gaps: Long words');
    expect(t).not.toContain('Save this goal');
  });

  it('turns a goal into a request, and says what is missing', () => {
    const d = draftOfGoal(goal({ result: 'YES', actualProgress: 'Done', evidence: 'Test' }));
    expect(d).toMatchObject({ goal: 'Read a page aloud', result: 'YES', actualProgress: 'Done', evidence: 'Test' });
    expect(payloadOfGoal(d)).toMatchObject({ goal: 'Read a page aloud', result: 'YES', actualProgress: 'Done' });
    expect(payloadOfGoal(emptyGoalDraft()).result).toBeUndefined();
    expect(goalProblems(d)).toEqual([]);
    expect(goalProblems(emptyGoalDraft())).toEqual(['the planned goal', 'whether it was achieved', 'the actual progress']);
  });

  it('shows each subject with its own goals and its own result, worked out from the goals', () => {
    const d = data({ subjects: [subject({ goals: [goal({ id: 'a', result: 'YES', actualProgress: 'x' }), goal({ id: 'b', goal: 'Write five sentences', result: 'NO', actualProgress: 'y' })], tally: tally({ total: 2, yes: 1, no: 1, percent: 50, result: 'PARTIALLY' }) }), subject({ subjectId: 'sub-ma', subjectName: 'Mathematics', goals: [], tally: tally() })] });
    const html = render(React.createElement(GoalEvaluation, { d, busy: false, call: noop }));
    const t = text(html);
    expect(t).toContain('1 achieved, 1 not achieved. Subject result: Partially');
    expect(t).toContain('No goal to evaluate for this subject yet.');
    expect(t).toContain('Add a goal for English');
    expect((html.match(/data-testid="goal"/g) ?? []).length).toBe(2);
    expect(t).not.toContain('Take the goals from the learning plan'); // some goals already exist
  });

  it('offers to take the goals from the plan only when there are none', () => {
    expect(text(render(React.createElement(GoalEvaluation, { d: data({ subjects: [subject({ goals: [], tally: tally() })] }), busy: false, call: noop })))).toContain('Take the goals from the learning plan');
  });

  it('words a result and a tally plainly', () => {
    expect(resultLabel(null)).toBe('Not evaluated');
    expect(resultLabel('NO')).toBe('No');
    expect(tallyText(tally())).toBe('No goals yet');
    expect(tallyText(tally({ total: 3, yes: 1, partially: 1, unevaluated: 1 }))).toBe('1 achieved, 1 partly, 1 not evaluated');
  });
});

describe('improvement areas, remarks and observations', () => {
  it('lists the areas by subject and for the student as a whole, and offers a reason when there are none', () => {
    const d = data({ subjects: [subject({ improvementAreas: [{ id: 'a1', area: 'Past tense' }, { id: 'a2', area: 'Spelling' }] })], generalAreas: [{ id: 'a3', area: 'Homework routine' }] });
    const html = render(React.createElement(ImprovementAreas, { d, busy: false, call: noop }));
    expect((html.match(/data-testid="area"/g) ?? []).length).toBe(3);
    const t = text(html);
    expect(t).toContain('English: Past tense');
    expect(t).toContain('The student as a whole: Homework routine');
    expect(t).not.toContain('Or, if none is needed');
    expect(text(render(React.createElement(ImprovementAreas, { d: data(), busy: false, call: noop })))).toContain('Or, if none is needed, why');
  });

  it('has the remarks in separate fields, named as in the specification', () => {
    expect(REMARK_FIELDS.map((f) => f[1])).toEqual(['What improved', 'Mentor observations']);
    expect(EXPECTATION_FIELDS.map((f) => f[1])).toEqual(['Home practice', 'Parent involvement', 'Study routine', 'Attendance support', 'Other commitments']);
    expect(POST_MEETING_FIELDS.map((f) => f[1])).toEqual(['What the parent communicated', 'Parent concerns', 'Parent feedback', 'Agreed actions', 'Additional support required', 'Parent commitments', 'Follow-up requirements']);
    const t = text(render(React.createElement(FieldsForm, { title: 'Expectations from the parent', fields: EXPECTATION_FIELDS, values: { expStudyRoutine: 'After dinner' }, canWork: true, busy: false, saveLabel: 'Save the expectations', onSave: noop })));
    for (const [, label] of EXPECTATION_FIELDS) expect(t).toContain(label);
    expect(t).toContain('Save the expectations');
  });

  it('shows the fields read only for someone who may not change them', () => {
    const html = render(React.createElement(FieldsForm, { title: 'x', fields: REMARK_FIELDS, values: {}, canWork: false, busy: false, saveLabel: 'Save', onSave: noop }));
    expect(text(html)).not.toContain('Save');
    expect(html).toContain('disabled=""');
  });

  it('shows the tutor feedback already in the system beside the tutor observation the Mentor records', () => {
    const d = data({ subjects: [subject({ tutorFeedback: [{ source: 'Class update', date: '2026-11-18', text: 'Attentive, needs practice' }], tutorObservation: { note: 'Reads fluently', recordedAt: '2026-12-09T10:00:00.000Z' } }), subject({ subjectId: 'sub-ma', subjectName: 'Mathematics' })] });
    const html = render(React.createElement(TutorObservations, { d, busy: false, call: noop }));
    const t = text(html);
    expect(t).toContain('Class update: Attentive, needs practice');
    expect(t).toContain('No tutor feedback recorded in the system for this period.');
    expect(t).toContain('You record it, so it shows as collected by you');
    expect(html).toContain('Reads fluently');
  });
});

describe('the next plan', () => {
  it('has the same fields as the learning plan and the three kinds of goal, and says when it takes effect', () => {
    expect(NEXT_PLAN_KIND_CHOICES.map((k) => k[1])).toEqual(['New goals', 'Continued goals', 'Revised goals']);
    const d = data();
    const t = text(render(React.createElement(NextPlan, { d, busy: false, call: noop })));
    for (const part of ['Next month learning plan', 'starts on Friday, 11 December 2026', 'the day after this review', 'becomes the active plan only when this review is completed', 'A new subject needs the schedule changed first', 'Start from the current plan', 'Not written', 'Next plan not approved', 'Subject-specific objectives', 'Planned topics', 'Expected outcomes']) expect(t).toContain(part);
  });

  it('does not offer approval until every subject has its next plan', () => {
    const none = render(React.createElement(NextPlan, { d: data(), busy: false, call: noop }));
    expect(none).toMatch(/<button[^>]*\sdisabled=""[^>]*>[^<]*Approve the next plan/);
    const written = data({ subjects: [subject({ nextPlan: { kind: 'CONTINUED', description: 'Keep reading', objectives: '', topics: '', outcomes: '' } })] });
    expect(render(React.createElement(NextPlan, { d: written, busy: false, call: noop }))).not.toMatch(/<button[^>]*\sdisabled=""[^>]*>[^<]*Approve the next plan/);
    expect(text(render(React.createElement(NextPlan, { d: written, busy: false, call: noop })))).not.toContain('Start from the current plan');
  });

  it('shows the approval once given', () => {
    const d = data();
    (d.meeting as NonNullable<ReviewData['meeting']>).nextPlanApproved = { at: '2026-12-10T12:00:00.000Z' };
    expect(text(render(React.createElement(NextPlan, { d, busy: false, call: noop })))).toContain('Next plan approved');
  });

  it('starts a subject from the current plan or from what was written, and checks the description', () => {
    expect(draftOfNextPlan(subject())).toMatchObject({ kind: 'CONTINUED', description: '' });
    expect(draftOfNextPlan(subject({ nextPlan: { kind: 'REVISED', description: 'Focus on essays', objectives: 'o', topics: 't', outcomes: 'x' } }))).toEqual({ kind: 'REVISED', description: 'Focus on essays', objectives: 'o', topics: 't', outcomes: 'x' });
    expect(nextPlanProblems({ kind: 'NEW', description: ' ', objectives: '', topics: '', outcomes: '' })).toEqual(['the learning plan description']);
    const t = text(render(React.createElement(NextPlanSubject, { s: subject(), canWork: true, busy: false, onSave: noop })));
    expect(t).toContain('Still needed: the learning plan description');
  });

  it('works out the first day of the next period', () => {
    expect(dayAfter('2026-12-10')).toBe('2026-12-11');
    expect(dayAfter('2026-12-31')).toBe('2027-01-01');
    expect(dayAfter('2028-02-28')).toBe('2028-02-29');
  });
});

describe('completing the review', () => {
  const rows = [
    { key: 'CONDUCTED', label: 'Meeting conducted', done: true, detail: 'Recorded as conducted' },
    { key: 'ACTUAL_TIME', label: 'Actual meeting time recorded', done: false, detail: 'Record the date, start and end times, attendees and parent participation' },
  ];

  it('lists every item with whether it is recorded and what is missing, and the count', () => {
    const html = render(React.createElement(CompletionChecklist, { d: data({ checklist: rows }), busy: false, onComplete: noop }));
    const t = text(html);
    expect(t).toContain('Done , Meeting conducted : Recorded as conducted');
    expect(t).toContain('Pending , Actual meeting time recorded : Record the date, start and end times');
    expect(t).toContain('1 of 2 recorded.');
    expect(t).toContain('Nothing completes itself');
  });

  it('keeps the complete button off until the server says every item is recorded', () => {
    expect(render(React.createElement(CompletionChecklist, { d: data({ checklist: rows, canComplete: false }), busy: false, onComplete: noop }))).toMatch(/<button[^>]*\sdisabled=""[^>]*>[^<]*Complete the review/);
    expect(render(React.createElement(CompletionChecklist, { d: data({ checklist: rows.map((r) => ({ ...r, done: true })), canComplete: true }), busy: false, onComplete: noop }))).not.toMatch(/<button[^>]*\sdisabled=""[^>]*>[^<]*Complete the review/);
    expect(text(render(React.createElement(CompletionChecklist, { d: data({ canWork: false }), busy: false, onComplete: noop })))).not.toContain('Complete the review');
  });
});

describe('the words', () => {
  it('writes no dashes or emoji in its copy', () => {
    const d = data({ subjects: [subject({ improvementAreas: [{ id: 'a', area: 'x' }] })] });
    const all = [
      render(React.createElement(ReviewDashboard, { d })), render(React.createElement(ScheduleForm, { onSubmit: noop })), render(React.createElement(ReviewMoveForm, { d, onSubmit: noop, onCancel: noop })),
      render(React.createElement(MeetingRecord, { d, busy: false, call: noop })), render(React.createElement(ExamRecord, { d, busy: false, call: noop })), render(React.createElement(GoalEvaluation, { d, busy: false, call: noop })),
      render(React.createElement(ImprovementAreas, { d, busy: false, call: noop })), render(React.createElement(TutorObservations, { d, busy: false, call: noop })), render(React.createElement(NextPlan, { d, busy: false, call: noop })),
      render(React.createElement(CompletionChecklist, { d, busy: false, onComplete: noop })),
    ].map(text).join(' ') + [...PARTICIPATION_CHOICES.map((p) => p[1]), ...RESULT_CHOICES.map((r) => r[1]), ...NEXT_PLAN_KIND_CHOICES.map((k) => k[1])].join(' ');
    expect(all).not.toMatch(/[–—]/);
    expect(all).not.toMatch(/\p{Extended_Pictographic}/u);
    expect(Object.keys(MEETING_TONE)).toHaveLength(7);
    expect(timeLabel(null, null)).toBe('No time set');
    expect(percentLabel(null)).toBe('Not available');
    expect(percentLabel(70)).toBe('70%');
  });
});
