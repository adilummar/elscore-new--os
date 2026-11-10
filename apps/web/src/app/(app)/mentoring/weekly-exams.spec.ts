import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { fetchApi } from '@/lib/api/client';

import { tutorPortalApiAction } from '../tutor-portal/actions';
import { EvaluationForm, MyExamCard } from '../tutor-portal/TutorExams';

import {
  EXAM_STATE_CHOICES, EXAM_TONE, ExamItem, ITEM_STATUS_LABELS, REMARK_FIELDS, RESPONSIBLE_CHOICES, chaptersOf, draftOfExam, emptyExamDraft, examProblems, marksPreview, payloadOfExam, remarksDraftOf, responsibleLabel,
} from './exam-view';
import { ExamCard, ExamDetail, ExamForm, ExamRescheduleForm } from './students/[id]/ExamsPanel';

jest.mock('@/lib/api/client', () => ({ fetchApi: jest.fn() }));

const text = (markup: string) => markup.replace(/<[^>]+>/g, ' ').replace(/&#x27;/g, "'").replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
const noop = () => undefined;
const POST = ['COLLECT_PAPER', 'SHARE_WITH_TUTOR', 'TUTOR_RECEIPT', 'COLLECT_CHECKED', 'TUTOR_EVALUATION', 'SHARE_WITH_PARENT', 'PARENT_RECEIPT'];

const exam = (over: Partial<ExamItem> = {}): ExamItem => ({
  id: 'ex-1', activationId: 'act-1', studentName: 'Synthetic Student A', subjectId: 'sub-en', subjectName: 'English', kind: 'EXAM', originalExamId: null, title: 'Unit test 1', chapters: ['Tenses', 'Nouns'], portion: 'Chapters 1 and 2',
  date: '2026-11-12', originalDate: '2026-11-12', startMinute: 600, endMinute: 660, responsible: { type: 'TUTOR', name: 'Meera Thomas' }, tutorName: 'Meera Thomas', instructions: 'Closed book', state: 'REMINDER_PENDING', stateLabel: 'Reminder pending',
  conducted: null, notConductedReason: null, reminder: { status: 'PREPARED', sentAt: null, acknowledgedAt: null, deliveryEvidence: null }, informed: null,
  items: POST.map((kind) => ({ list: 'POST_EXAM', kind, label: kind.replace(/_/g, ' ').toLowerCase(), status: 'PENDING', responsible: null, remarks: null, evidenceRef: null, doneAt: null, tutorMay: kind.startsWith('TUTOR') })),
  problems: ['Record whether the exam was conducted.'], marks: null, remarks: { weaknesses: null, topicsToImprove: null, tutorSuggestions: null, mentorRemarks: null },
  reExam: { required: false, reason: null, examId: null, date: null, state: null }, ...over,
});
const sat = (over: Partial<ExamItem> = {}) => exam({ conducted: true, state: 'AWAITING_PAPER_COLLECTION', stateLabel: 'Awaiting paper collection', problems: ['Collect the completed exam paper.'], ...over });

describe('the exam form', () => {
  const full = { ...emptyExamDraft('sub-en', '2026-11-12'), title: 'Unit test 1', chaptersText: 'Tenses\nNouns, Articles', start: '10:00', end: '11:00' };

  it('says what is still needed before asking the server, and nothing once it is complete', () => {
    expect(examProblems(emptyExamDraft())).toEqual(['a title', 'the subject', 'at least one chapter', 'the date', 'the start and end times']);
    expect(examProblems(full)).toEqual([]);
    expect(examProblems({ ...full, end: '09:00' })).toEqual(['an end time after the start time']);
    expect(examProblems({ ...full, responsibleType: 'PARENT' })).toEqual(['the name of the person responsible']);
    expect(examProblems({ ...full, responsibleType: 'PARENT', responsibleName: 'Parent A' })).toEqual([]);
  });

  it('turns chapters typed on lines or with commas into a list, so several chapters make one exam', () => {
    expect(chaptersOf('Tenses\nNouns, Articles,,  ')).toEqual(['Tenses', 'Nouns', 'Articles']);
    expect(payloadOfExam(full)).toMatchObject({ title: 'Unit test 1', subjectId: 'sub-en', chapters: ['Tenses', 'Nouns', 'Articles'], date: '2026-11-12', start: '10:00', end: '11:00', responsibleType: 'TUTOR' });
  });

  it('sends no name for the tutor, and the name for a parent or another person', () => {
    expect(payloadOfExam(full).responsibleName).toBeUndefined();
    expect(payloadOfExam({ ...full, responsibleType: 'PARENT', responsibleName: 'Parent A' }).responsibleName).toBe('Parent A');
  });

  it('opens an exam for changes with its own values', () => {
    expect(draftOfExam(exam())).toMatchObject({ title: 'Unit test 1', subjectId: 'sub-en', chaptersText: 'Tenses\nNouns', start: '10:00', end: '11:00', date: '2026-11-12', responsibleType: 'TUTOR', responsibleName: '' });
  });

  it('shows the one exam a day rule and what is missing, and disables saving until it is complete', () => {
    const subjects = [{ subjectId: 'sub-en', subjectName: 'English' }, { subjectId: 'sub-ma', subjectName: 'Mathematics' }];
    const html = renderToStaticMarkup(React.createElement(ExamForm, { subjects, draft: emptyExamDraft(), heading: 'Schedule an exam', submitLabel: 'Schedule the exam', onChange: noop, onSubmit: noop, onCancel: noop }));
    expect(text(html)).toContain('only one exam on a date, whatever the subject');
    expect(text(html)).toContain('Still needed: a title, the subject');
    expect(html).toMatch(/<button[^>]*\sdisabled=""[^>]*>[^<]*Schedule the exam/);
    expect(text(html)).toContain('Mathematics');
  });
});

describe('the exam card', () => {
  const card = (e: ExamItem, canWork = true) => renderToStaticMarkup(React.createElement(ExamCard, { e, canWork, onOpen: noop, onSend: noop, onReschedule: noop, onEdit: noop }));

  it('shows the subject, chapters, date and time, who is responsible, the reminder and the marks', () => {
    const t = text(card(exam()));
    for (const part of ['Unit test 1', 'English', 'Thursday, 12 November 2026', '10:00 AM to 11:00 AM', 'Tenses, Nouns', 'Assigned tutor, Meera Thomas', 'Prepared, not sent', 'Not recorded', 'Reminder pending']) expect(t).toContain(part);
  });

  it('says a reminder was sent only when the API says so', () => {
    expect(text(card(exam({ reminder: { status: 'SENT', sentAt: '2026-11-12T01:30:00.000Z', acknowledgedAt: null, deliveryEvidence: 'n-1' } })))).toContain('Sent to the tutor');
    expect(text(card(exam({ reminder: { status: 'ACKNOWLEDGED', sentAt: 'x', acknowledgedAt: 'y', deliveryEvidence: 'n-1' } })))).toContain('Sent and acknowledged');
    expect(text(card(exam({ reminder: null, responsible: { type: 'PARENT', name: 'Parent A' } })))).toContain('Not sent');
    expect(text(card(exam({ reminder: null, informed: { at: '2026-11-10T10:00:00.000Z', note: 'Phoned' }, responsible: { type: 'PARENT', name: 'Parent A' } })))).toContain('Mentor told them');
  });

  it('shows a moved exam with its original date', () => {
    const t = text(card(exam({ date: '2026-11-13', originalDate: '2026-11-12', state: 'RESCHEDULED', stateLabel: 'Rescheduled' })));
    expect(t).toContain('Moved');
    expect(t).toContain('Original date Thursday, 12 November 2026');
  });

  it('offers reminder, changes and rescheduling before the exam, and none of them after it was sat', () => {
    const before = text(card(exam()));
    for (const a of ['Open', 'Send reminder', 'Change details', 'Reschedule']) expect(before).toContain(a);
    const after = text(card(sat()));
    for (const a of ['Send reminder', 'Change details', 'Reschedule']) expect(after).not.toContain(a);
    expect(after).toContain('Open');
  });

  it('gives a parent responsible no send reminder button, since they have no account', () => {
    expect(text(card(exam({ responsible: { type: 'PARENT', name: 'Parent A' } })))).not.toContain('Send reminder');
  });

  it('gives someone who may not work the exam no actions except opening it', () => {
    const t = text(card(exam(), false));
    expect(t).toContain('Open');
    for (const a of ['Send reminder', 'Change details', 'Reschedule']) expect(t).not.toContain(a);
  });

  it('shows a re-exam and the need for one', () => {
    expect(text(card(exam({ kind: 'RE_EXAM' })))).toContain('Re-exam');
    expect(text(card(sat({ reExam: { required: true, reason: 'Below the pass mark', examId: null, date: null, state: null } })))).toContain('A re-exam is required and not yet scheduled. Below the pass mark');
    expect(text(card(sat({ reExam: { required: true, reason: 'Below the pass mark', examId: 'ex-2', date: '2026-11-19', state: 'SCHEDULED' } })))).toContain('Re-exam on Thursday, 19 November 2026.');
    expect(text(card(exam({ conducted: false, notConductedReason: 'Hospital', state: 'COMPLETED', stateLabel: 'Completed' })))).toContain('Not conducted: Hospital');
  });
});

describe('the exam detail', () => {
  const detail = (e: ExamItem, canWork = true, error: string | null = null) => renderToStaticMarkup(React.createElement(ExamDetail, { e, canWork, error, subjects: [{ subjectId: 'sub-en', subjectName: 'English' }], call: noop, onClose: noop }));

  it('before the exam offers only recording it as conducted or not, and shows no checklist', () => {
    const t = text(detail(exam()));
    expect(t).toContain('The exam was conducted');
    expect(t).toContain('The exam was not conducted');
    expect(t).not.toContain('After the exam');
    expect(t).not.toContain('Marks obtained');
  });

  it('after the exam shows the seven checklist steps, all pending until someone records them', () => {
    const html = detail(sat());
    expect(text(html)).toContain('After the exam');
    expect((html.match(/data-testid="exam-item"/g) ?? []).length).toBe(7);
    expect((html.match(/data-status="PENDING"/g) ?? []).length).toBe(7);
    expect(text(html)).toContain('Still needed before this exam is complete');
  });

  it('shows who did a step, when and what evidence', () => {
    const e = sat({ items: sat().items.map((i) => (i.kind === 'COLLECT_PAPER' ? { ...i, status: 'DONE', responsible: 'Mentor', evidenceRef: 'Paper 12', remarks: 'Collected at home', doneAt: '2026-11-13T09:00:00.000Z' } : i)) });
    const t = text(detail(e));
    expect(t).toContain('Mentor, Paper 12. Collected at home');
    expect(t).toContain(ITEM_STATUS_LABELS.DONE);
  });

  it('keeps the four remarks in four separate fields', () => {
    const t = text(detail(sat()));
    for (const [, label] of REMARK_FIELDS) expect(t).toContain(label);
    expect(REMARK_FIELDS.map(([k]) => k)).toEqual(['weaknesses', 'topicsToImprove', 'tutorSuggestions', 'mentorRemarks']);
  });

  it('shows the re-exam checklist only when a re-exam is required', () => {
    expect(detail(sat())).not.toContain('Re-exam checklist');
    const re = sat({ reExam: { required: true, reason: 'Below the pass mark', examId: null, date: null, state: null }, items: [...sat().items, ...['COLLECT_ORIGINAL', 'PREPARE_PAPER', 'NOTIFY', 'REEXAM_COMPLETED'].map((kind) => ({ list: 'RE_EXAM', kind, label: kind.toLowerCase(), status: 'PENDING', responsible: null, remarks: null, evidenceRef: null, doneAt: null, tutorMay: false }))] });
    const html = detail(re);
    expect(html).toContain('Re-exam checklist');
    expect(text(html)).toContain('Schedule the re-exam');
    expect((html.match(/data-testid="exam-item"/g) ?? []).length).toBe(11);
  });

  it('shows marks that were recorded, and the history of what happened', () => {
    const e = sat({ marks: { obtained: 45, max: 60, percentage: 75, evaluationDate: '2026-11-13', evaluatingTutorName: 'Meera Thomas' }, history: [{ kind: 'RESCHEDULED', at: '2026-11-10T09:00:00.000Z', actorUserId: 'm', reason: 'Student unwell', payload: {} }] });
    const t = text(detail(e));
    expect(t).toContain('45 of 60, 75%, evaluated by Meera Thomas on Friday, 13 November 2026');
    expect(t).toContain('rescheduled');
    expect(t).toContain('Student unwell');
  });

  it('gives someone who may not work the exam no buttons that change it', () => {
    const t = text(detail(sat(), false));
    for (const a of ['Mark done', 'Save the marks', 'Save remarks', 'A re-exam is required']) expect(t).not.toContain(a);
  });

  it('shows an error from the server as it is', () => {
    expect(text(detail(sat(), true, 'This student already has a English exam on 2026-11-12.'))).toContain('This student already has a English exam on 2026-11-12.');
  });
});

describe('marks', () => {
  it('works out the percentage to two decimals and says nothing until both numbers are typed', () => {
    expect(marksPreview('45', '60')).toEqual({ percentage: 75, problem: null });
    expect(marksPreview('1', '3')).toEqual({ percentage: 33.33, problem: null });
    expect(marksPreview('', '60')).toEqual({ percentage: null, problem: null });
  });

  it('refuses negative marks, marks above the maximum, a maximum of zero and non numbers, in words', () => {
    expect(marksPreview('-1', '60').problem).toBe('The marks obtained cannot be negative.');
    expect(marksPreview('61', '60').problem).toBe('The marks obtained cannot be more than the maximum marks.');
    expect(marksPreview('0', '0').problem).toBe('The maximum marks must be more than zero.');
    expect(marksPreview('abc', '60').problem).toBe('Enter the marks as numbers.');
    expect(marksPreview('61', '60').percentage).toBeNull();
  });

  it('makes remarks drafts from what is saved without filling anything in', () => {
    expect(remarksDraftOf({ weaknesses: null, topicsToImprove: 'Past perfect', tutorSuggestions: null, mentorRemarks: null })).toEqual({ weaknesses: '', topicsToImprove: 'Past perfect', tutorSuggestions: '', mentorRemarks: '' });
  });
});

describe('rescheduling', () => {
  it('needs a reason and a change before the button works, and says what is kept and who is told', () => {
    const html = renderToStaticMarkup(React.createElement(ExamRescheduleForm, { e: exam(), onSubmit: noop, onCancel: noop }));
    expect(html).toMatch(/<button[^>]*\sdisabled=""[^>]*>[^<]*Move the exam/);
    const t = text(html);
    expect(t).toContain('original date is kept in the history');
    expect(t).toContain('one exam a day rule is checked again');
    expect(t).toContain('tutor is told in the app');
  });
});

describe('the tutor exams', () => {
  const mine = (e: ExamItem) => text(renderToStaticMarkup(React.createElement(MyExamCard, { e, onReceipt: noop, onEvaluate: noop })));

  it('shows a tutor the exam, the student and the chapters, and no step before the exam was sat', () => {
    const t = mine(exam());
    for (const part of ['Unit test 1', 'Synthetic Student A', 'Tenses, Nouns', 'Closed book']) expect(t).toContain(part);
    expect(t).not.toContain('Confirm I received the paper');
  });

  it('offers receipt first, then the evaluation, then a correction', () => {
    expect(mine(sat())).toContain('Confirm I received the paper');
    const received = sat({ items: sat().items.map((i) => (i.kind === 'TUTOR_RECEIPT' ? { ...i, status: 'DONE' } : i)) });
    expect(mine(received)).toContain('Evaluate the exam');
    expect(mine(received)).not.toContain('Confirm I received the paper');
    const evaluated = sat({ items: sat().items.map((i) => (i.kind === 'TUTOR_RECEIPT' || i.kind === 'TUTOR_EVALUATION' ? { ...i, status: 'DONE' } : i)) });
    expect(mine(evaluated)).toContain('Correct the evaluation');
  });

  it('has an evaluation form with the marks and three tutor remarks, and no Mentor remarks', () => {
    const draft = { obtained: '40', max: '50', evaluationDate: '', weaknesses: '', topicsToImprove: '', tutorSuggestions: '' };
    const t = text(renderToStaticMarkup(React.createElement(EvaluationForm, { e: sat(), draft, onChange: noop, onSubmit: noop, onCancel: noop })));
    for (const part of ['Marks obtained', 'Maximum marks', '80%', 'Areas of weakness', 'Topics to improve', 'Your suggestions', 'Submit the evaluation']) expect(t).toContain(part);
    expect(t).not.toContain('Mentor remarks');
  });

  it('keeps the submit button off while the marks are not valid', () => {
    const draft = { obtained: '60', max: '50', evaluationDate: '', weaknesses: '', topicsToImprove: '', tutorSuggestions: '' };
    const html = renderToStaticMarkup(React.createElement(EvaluationForm, { e: sat(), draft, onChange: noop, onSubmit: noop, onCancel: noop }));
    expect(text(html)).toContain('cannot be more than the maximum marks');
    expect(html).toMatch(/<button[^>]*\sdisabled=""[^>]*>[^<]*Submit the evaluation/);
  });
});

describe('the tutor portal bridge for exams', () => {
  const mocked = fetchApi as jest.Mock;
  beforeEach(() => mocked.mockReset());

  it('forwards the exam routes with the right method, and nothing else', async () => {
    mocked.mockResolvedValue({ ok: 1 });
    await expect(tutorPortalApiAction('/tutor-portal/exams?from=2026-11-09&to=2026-11-15')).resolves.toMatchObject({ ok: true });
    await expect(tutorPortalApiAction('/tutor-portal/exams/ex-12345678/receipt', 'POST', {})).resolves.toMatchObject({ ok: true });
    await expect(tutorPortalApiAction('/tutor-portal/exams/ex-12345678/evaluation', 'PUT', { marksObtained: 1, maxMarks: 2 })).resolves.toMatchObject({ ok: true });
    mocked.mockClear();
    const refused = [
      tutorPortalApiAction('/tutor-portal/exams/ex-12345678/receipt', 'PUT', {}),
      tutorPortalApiAction('/tutor-portal/exams/ex-12345678/evaluation', 'POST', {}),
      tutorPortalApiAction('/tutor-portal/exams?from=2026-11-09&to=2026-11-15', 'POST', {}),
      tutorPortalApiAction('/tutor-portal/exams/ex-12345678/evaluation', 'GET'),
      tutorPortalApiAction('/tutor-portal/exams/../x/receipt', 'POST', {}),
      tutorPortalApiAction('/tutor-portal/exams?from=2026-11-09&to=2026-11-15&tutor=x'),
      tutorPortalApiAction('/mentoring/exams/ex-12345678/marks', 'PUT', {}),
      tutorPortalApiAction('/tutor-portal/exams/ex-12345678/conducted', 'POST', {}),
    ];
    for (const r of await Promise.all(refused)) expect(r).toMatchObject({ ok: false });
    expect(mocked).not.toHaveBeenCalled();
  });
});

describe('the words', () => {
  it('writes no dashes or emoji in its copy, and has a label and tone for every state', () => {
    const all = [
      text(renderToStaticMarkup(React.createElement(ExamCard, { e: sat(), canWork: true, onOpen: noop, onSend: noop, onReschedule: noop, onEdit: noop }))),
      text(renderToStaticMarkup(React.createElement(ExamDetail, { e: sat(), canWork: true, subjects: [], call: noop, onClose: noop }))),
      text(renderToStaticMarkup(React.createElement(ExamRescheduleForm, { e: exam(), onSubmit: noop, onCancel: noop }))),
      ...EXAM_STATE_CHOICES.map((s) => s[1]), ...RESPONSIBLE_CHOICES.map((r) => r[1]), ...Object.values(ITEM_STATUS_LABELS),
    ].join(' ');
    expect(all).not.toMatch(/[–—]/);
    expect(all).not.toMatch(/\p{Extended_Pictographic}/u);
    expect(EXAM_STATE_CHOICES).toHaveLength(Object.keys(EXAM_TONE).length);
    expect(responsibleLabel({ type: 'OTHER', name: 'Uncle' })).toBe('Uncle');
  });
});
