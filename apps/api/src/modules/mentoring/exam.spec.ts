import { ExamFacts, POST_EXAM_ITEMS, RE_EXAM_ITEMS, checkExam, checkItem, checkMarks, checkRemarks, checkReschedule, completionProblems, dateKey, examState, percentOf } from './exam';

const good = { title: 'Weekly English test', subjectId: 'sub-en', chapters: ['Tenses', 'Articles'], date: '2026-11-16', start: '10:00', end: '11:00', responsibleType: 'TUTOR' };

describe('one exam a day', () => {
  it('two exams for a student on one date have the same key, whatever the subject', () => {
    expect(dateKey('act-1', '2026-11-16')).toBe('act-1:2026-11-16');
    expect(dateKey('act-1', '2026-11-16')).toBe(dateKey('act-1', '2026-11-16'));
    expect(dateKey('act-1', '2026-11-16')).not.toBe(dateKey('act-1', '2026-11-17'));
    expect(dateKey('act-1', '2026-11-16')).not.toBe(dateKey('act-2', '2026-11-16'));
  });
});

describe('scheduling an exam', () => {
  it('takes a title, subject, chapters, portion, date, times, responsible person and instructions', () => {
    expect(checkExam({ ...good, portion: ' Units 1 to 3 ', instructions: ' Bring a pen ' })).toEqual({
      ok: true, value: { title: 'Weekly English test', subjectId: 'sub-en', chapters: ['Tenses', 'Articles'], portion: 'Units 1 to 3', date: '2026-11-16', startMinute: 600, endMinute: 660, responsibleType: 'TUTOR', responsibleName: null, instructions: 'Bring a pen' },
    });
  });

  it('allows several chapters in one exam, and needs at least one', () => {
    expect(checkExam({ ...good, chapters: ['A', ' ', 'B', 'C'] })).toMatchObject({ ok: true, value: { chapters: ['A', 'B', 'C'] } });
    expect(checkExam({ ...good, chapters: [] })).toMatchObject({ ok: false, message: expect.stringContaining('at least one chapter') });
    expect(checkExam({ ...good, chapters: 'Tenses' })).toMatchObject({ ok: false });
    expect(checkExam({ ...good, chapters: Array.from({ length: 31 }, (_, i) => `C${i}`) })).toMatchObject({ ok: false });
  });

  it('works out the end from a length, and refuses a missing, backwards or over-long time', () => {
    expect(checkExam({ ...good, end: undefined, durationMinutes: 90 })).toMatchObject({ ok: true, value: { endMinute: 690 } });
    expect(checkExam({ ...good, end: undefined })).toMatchObject({ ok: false, message: expect.stringContaining('how long') });
    expect(checkExam({ ...good, end: '09:00' })).toMatchObject({ ok: false, message: expect.stringContaining('end after it starts') });
    expect(checkExam({ ...good, end: '19:00' })).toMatchObject({ ok: false, message: expect.stringContaining('at most 8 hours') });
    expect(checkExam({ ...good, start: 'ten' })).toMatchObject({ ok: false });
    expect(checkExam({ ...good, date: '2026-02-30' })).toMatchObject({ ok: false });
  });

  it('needs a title and a subject', () => {
    expect(checkExam({ ...good, title: '  ' })).toMatchObject({ ok: false, message: 'Give the exam a title.' });
    expect(checkExam({ ...good, subjectId: undefined })).toMatchObject({ ok: false, message: 'Choose the subject.' });
    expect(checkExam({ ...good, title: 'x'.repeat(201) })).toMatchObject({ ok: false });
    expect(checkExam(null)).toMatchObject({ ok: false });
  });

  it('records who is responsible: the tutor, or a named parent or other person', () => {
    expect(checkExam({ ...good, responsibleType: 'PARENT' })).toMatchObject({ ok: false, message: expect.stringContaining('name of the parent') });
    expect(checkExam({ ...good, responsibleType: 'PARENT', responsibleName: 'Mrs Nair' })).toMatchObject({ ok: true, value: { responsibleType: 'PARENT', responsibleName: 'Mrs Nair' } });
    expect(checkExam({ ...good, responsibleType: 'OTHER' })).toMatchObject({ ok: false, message: expect.stringContaining('name of the person') });
    expect(checkExam({ ...good, responsibleType: 'OTHER', responsibleName: 'Aunt' })).toMatchObject({ ok: true });
    expect(checkExam({ ...good, responsibleType: 'TUTOR', responsibleName: 'ignored' })).toMatchObject({ ok: true, value: { responsibleName: null } });
    expect(checkExam({ ...good, responsibleType: 'NEIGHBOUR' })).toMatchObject({ ok: false });
  });
});

describe('moving an exam', () => {
  const current = { startMinute: 600, endMinute: 660 };

  it('needs a new date and a reason, and keeps the length when only the start moves', () => {
    expect(checkReschedule({ newDate: '2026-11-18', reason: 'Student unwell' }, current)).toEqual({ ok: true, value: { date: '2026-11-18', startMinute: 600, endMinute: 660, reason: 'Student unwell' } });
    expect(checkReschedule({ newDate: '2026-11-18', newStart: '14:00', reason: 'x' }, current)).toMatchObject({ ok: true, value: { startMinute: 840, endMinute: 900 } });
    expect(checkReschedule({ newDate: '2026-11-18', newStart: '14:00', newEnd: '16:00', reason: 'x' }, current)).toMatchObject({ ok: true, value: { endMinute: 960 } });
    expect(checkReschedule({ newDate: 'soon', reason: 'x' }, current)).toMatchObject({ ok: false });
    expect(checkReschedule({ newDate: '2026-11-18' }, current)).toMatchObject({ ok: false, message: 'Say why the exam is being rescheduled.' });
    expect(checkReschedule({ newDate: '2026-11-18', newStart: '14:00', newEnd: '13:00', reason: 'x' }, current)).toMatchObject({ ok: false });
  });
});

describe('marks', () => {
  it('works out the percentage itself, to two decimals', () => {
    expect(checkMarks({ marksObtained: 42, maxMarks: 50 })).toEqual({ ok: true, value: { obtained: 42, max: 50, percentage: 84, evaluationDate: null } });
    expect(checkMarks({ marksObtained: 17, maxMarks: 30, evaluationDate: '2026-11-18' })).toMatchObject({ ok: true, value: { percentage: 56.67, evaluationDate: '2026-11-18' } });
    expect(percentOf(0, 20)).toBe(0);
    expect(percentOf(20, 20)).toBe(100);
  });

  it('refuses negative marks, marks above the maximum, and a maximum that is not above zero', () => {
    expect(checkMarks({ marksObtained: -1, maxMarks: 50 })).toEqual({ ok: false, message: 'The marks obtained cannot be negative.' });
    expect(checkMarks({ marksObtained: 51, maxMarks: 50 })).toEqual({ ok: false, message: 'The marks obtained cannot be more than the maximum marks.' });
    expect(checkMarks({ marksObtained: 0, maxMarks: 0 })).toEqual({ ok: false, message: 'The maximum marks must be more than zero.' });
    expect(checkMarks({ marksObtained: 5, maxMarks: -10 })).toMatchObject({ ok: false });
  });

  it('accepts zero and full marks, and refuses anything that is not a plain number', () => {
    expect(checkMarks({ marksObtained: 0, maxMarks: 50 })).toMatchObject({ ok: true, value: { percentage: 0 } });
    expect(checkMarks({ marksObtained: 50, maxMarks: 50 })).toMatchObject({ ok: true, value: { percentage: 100 } });
    for (const bad of [{ marksObtained: '40', maxMarks: 50 }, { marksObtained: Number.NaN, maxMarks: 50 }, { marksObtained: 40 }, { marksObtained: 40.555, maxMarks: 50 }, { marksObtained: 40, maxMarks: 50, evaluationDate: 'soon' }, null]) {
      expect(checkMarks(bad)).toMatchObject({ ok: false });
    }
  });
});

describe('the weekly remarks', () => {
  it('keeps four separate fields, and accepts any of them on its own', () => {
    expect(checkRemarks({ weaknesses: ' Tenses ', topicsToImprove: 'Articles', tutorSuggestions: 'Daily reading', mentorRemarks: 'Follow up' })).toEqual({ ok: true, value: { weaknesses: 'Tenses', topicsToImprove: 'Articles', tutorSuggestions: 'Daily reading', mentorRemarks: 'Follow up' } });
    expect(checkRemarks({ mentorRemarks: 'Follow up' })).toEqual({ ok: true, value: { mentorRemarks: 'Follow up' } });
    expect(checkRemarks({})).toMatchObject({ ok: false });
    expect(checkRemarks({ weaknesses: 5 })).toMatchObject({ ok: false });
    expect(checkRemarks({ weaknesses: 'x'.repeat(2001) })).toMatchObject({ ok: false });
  });

  it('can limit who may change which remark: a tutor changes the tutor fields, not the Mentor remarks', () => {
    const tutor = ['weaknesses', 'topicsToImprove', 'tutorSuggestions'] as const;
    expect(checkRemarks({ weaknesses: 'Tenses', tutorSuggestions: 'Read daily' }, tutor)).toMatchObject({ ok: true });
    expect(checkRemarks({ mentorRemarks: 'Mine' }, tutor)).toEqual({ ok: false, message: 'The Mentor remarks are not yours to change.' });
  });
});

describe('a checklist update', () => {
  it('takes pending, done or not applicable, with the person, remarks and a reference to the evidence', () => {
    expect(checkItem({ status: 'DONE', remarks: ' Collected from the parent ', responsible: 'Mentor', evidenceRef: 'Paper 14' })).toEqual({ ok: true, value: { status: 'DONE', remarks: 'Collected from the parent', responsible: 'Mentor', evidenceRef: 'Paper 14' } });
    expect(checkItem({ status: 'PENDING' })).toMatchObject({ ok: true });
    expect(checkItem({ status: 'DONE' })).toMatchObject({ ok: true, value: { remarks: null } });
  });

  it('needs a reason when something does not apply, and refuses anything else', () => {
    expect(checkItem({ status: 'NOT_APPLICABLE' })).toEqual({ ok: false, message: 'Say why this does not apply.' });
    expect(checkItem({ status: 'NOT_APPLICABLE', remarks: 'Parent not reachable' })).toMatchObject({ ok: true });
    expect(checkItem({ status: 'COMPLETE' })).toMatchObject({ ok: false });
    expect(checkItem({ status: 'DONE', evidenceRef: 'x'.repeat(201) })).toMatchObject({ ok: false });
  });

  it('has the seven post-exam items and the four re-exam items, with the tutor able to confirm only their own two', () => {
    expect(POST_EXAM_ITEMS.map((i) => i.kind)).toEqual(['COLLECT_PAPER', 'SHARE_WITH_TUTOR', 'TUTOR_RECEIPT', 'COLLECT_CHECKED', 'TUTOR_EVALUATION', 'SHARE_WITH_PARENT', 'PARENT_RECEIPT']);
    expect(POST_EXAM_ITEMS.filter((i) => i.tutorMay).map((i) => i.kind)).toEqual(['TUTOR_RECEIPT', 'TUTOR_EVALUATION']);
    expect(RE_EXAM_ITEMS.map((i) => i.kind)).toEqual(['COLLECT_ORIGINAL', 'PREPARE_PAPER', 'NOTIFY', 'REEXAM_COMPLETED']);
  });
});

describe('the state of an exam', () => {
  const facts = (over: Partial<ExamFacts> = {}): ExamFacts => ({
    date: '2026-11-16', originalDate: '2026-11-16', conducted: null, reExamRequired: false, hasReExam: false, marksRecorded: false, informed: false,
    remarks: { weaknesses: null, topicsToImprove: null, tutorSuggestions: null, mentorRemarks: null }, ...over,
  });
  const done = (...kinds: string[]) => Object.fromEntries(kinds.map((k) => [k, 'DONE']));
  const ALL_REMARKS = { weaknesses: 'a', topicsToImprove: 'b', tutorSuggestions: 'c', mentorRemarks: 'd' };
  const upToEvaluation = ['COLLECT_PAPER', 'SHARE_WITH_TUTOR', 'TUTOR_RECEIPT', 'COLLECT_CHECKED', 'TUTOR_EVALUATION'];
  const TODAY = '2026-11-16';

  it('is scheduled, then reminder pending, then ready for the exam, from the reminder or the Mentor having informed the person', () => {
    expect(examState(facts(), {}, null, TODAY)).toBe('SCHEDULED');
    expect(examState(facts(), {}, 'PREPARED', TODAY)).toBe('REMINDER_PENDING');
    expect(examState(facts(), {}, 'SENT', TODAY)).toBe('READY_FOR_EXAM');
    expect(examState(facts(), {}, 'ACKNOWLEDGED', TODAY)).toBe('READY_FOR_EXAM');
    expect(examState(facts({ informed: true }), {}, null, TODAY)).toBe('READY_FOR_EXAM');
  });

  it('shows rescheduled until a reminder goes out for the new date', () => {
    expect(examState(facts({ date: '2026-11-18' }), {}, null, TODAY)).toBe('RESCHEDULED');
    expect(examState(facts({ date: '2026-11-18' }), {}, 'PREPARED', TODAY)).toBe('RESCHEDULED');
    expect(examState(facts({ date: '2026-11-18' }), {}, 'SENT', TODAY)).toBe('READY_FOR_EXAM');
  });

  it('follows the paper through collection, evaluation, marks and the parent, never skipping a step', () => {
    const c = { conducted: true as const };
    expect(examState(facts(c), {}, 'SENT', TODAY)).toBe('EXAM_COMPLETED'); // the exam was today
    expect(examState(facts(c), {}, 'SENT', '2026-11-17')).toBe('AWAITING_PAPER_COLLECTION');
    expect(examState(facts(c), done('COLLECT_PAPER'), null, TODAY)).toBe('AWAITING_EVALUATION');
    expect(examState(facts(c), done(...upToEvaluation.slice(0, 4)), null, TODAY)).toBe('AWAITING_EVALUATION');
    expect(examState(facts(c), done(...upToEvaluation), null, TODAY)).toBe('MARKS_PENDING');
    expect(examState(facts({ ...c, marksRecorded: true }), done(...upToEvaluation), null, TODAY)).toBe('MARKS_PENDING'); // remarks still missing
    expect(examState(facts({ ...c, marksRecorded: true, remarks: ALL_REMARKS }), done(...upToEvaluation), null, TODAY)).toBe('AWAITING_PARENT_SHARING');
    expect(examState(facts({ ...c, marksRecorded: true, remarks: ALL_REMARKS }), done(...upToEvaluation, 'SHARE_WITH_PARENT'), null, TODAY)).toBe('AWAITING_PARENT_SHARING');
    expect(examState(facts({ ...c, marksRecorded: true, remarks: ALL_REMARKS }), done(...upToEvaluation, 'SHARE_WITH_PARENT', 'PARENT_RECEIPT'), null, TODAY)).toBe('COMPLETED');
  });

  it('a step marked not applicable counts as settled, with a reason on record', () => {
    const items = { ...done(...upToEvaluation, 'SHARE_WITH_PARENT'), PARENT_RECEIPT: 'NOT_APPLICABLE' };
    expect(examState(facts({ conducted: true, marksRecorded: true, remarks: ALL_REMARKS }), items, null, TODAY)).toBe('COMPLETED');
  });

  it('an exam formally recorded as not conducted is closed', () => {
    expect(examState(facts({ conducted: false }), {}, null, TODAY)).toBe('COMPLETED');
    expect(completionProblems(facts({ conducted: false }), {})).toEqual([]);
  });

  it('needs a re-exam to be scheduled when one is required, and shows the original as done once it is', () => {
    const f = { conducted: true as const, marksRecorded: true, remarks: ALL_REMARKS, reExamRequired: true };
    const items = done(...upToEvaluation, 'SHARE_WITH_PARENT', 'PARENT_RECEIPT');
    expect(examState(facts(f), items, null, TODAY)).toBe('RE_EXAM_REQUIRED');
    expect(examState(facts({ ...f, hasReExam: true }), items, null, TODAY)).toBe('COMPLETED');
  });

  it('lists in words what is still needed, and nothing when the exam is complete', () => {
    expect(completionProblems(facts(), {})).toEqual(['Record whether the exam was conducted.']);
    const problems = completionProblems(facts({ conducted: true }), done('COLLECT_PAPER'));
    expect(problems).toEqual([
      'Share the paper with the assigned tutor for evaluation.', 'Tutor confirms the paper was received.', 'Collect the checked paper from the tutor.', 'Tutor evaluation completed.', 'Record the marks.',
      'Record the areas of weakness, topics to improve, tutor suggestions, Mentor remarks.', 'Share the evaluated paper with the parent.', 'Parent delivery or receipt confirmed.',
    ]);
    expect(completionProblems(facts({ conducted: true, marksRecorded: true, remarks: ALL_REMARKS }), done(...upToEvaluation, 'SHARE_WITH_PARENT', 'PARENT_RECEIPT'))).toEqual([]);
    expect(completionProblems(facts({ conducted: true, reExamRequired: true, marksRecorded: true, remarks: ALL_REMARKS }), done(...upToEvaluation, 'SHARE_WITH_PARENT', 'PARENT_RECEIPT'))).toEqual(['Schedule the re-exam.']);
  });
});
