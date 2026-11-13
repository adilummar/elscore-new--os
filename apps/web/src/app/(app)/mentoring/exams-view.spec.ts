import { readFileSync } from 'fs';
import { join } from 'path';

import { evaluationText, parentSharingText, DUE_STATUS_TEXT, EXAM_QUEUES, dueQuery, dueReason, dueStatus, examsInQueue, queueCount, queueOf, workspaceQuery } from './exams-view';

describe('Exams: queues', () => {
  it('puts every exam state the API can send into exactly one queue', () => {
    const api = readFileSync(join(__dirname, '../../../../../api/src/modules/mentoring/exam.ts'), 'utf8');
    const labels = /EXAM_STATE_LABELS[^=]*=\s*\{([\s\S]*?)\};/.exec(api)?.[1] ?? '';
    const apiStates = [...labels.matchAll(/([A-Z_]+):\s*'/g)].map((m) => m[1]);
    const mine = EXAM_QUEUES.flatMap((q) => q.states as readonly string[]);
    expect(new Set(mine).size).toBe(mine.length);
    expect(apiStates.filter((s) => !mine.includes(s))).toEqual([]);
  });

  it('counts a queue from the API counts and picks its exams', () => {
    const q = queueOf('paper')!;
    expect(queueCount(q, { EXAM_COMPLETED: 2, AWAITING_PAPER_COLLECTION: 1, COMPLETED: 9 })).toBe(3);
    expect(examsInQueue(q, [{ state: 'COMPLETED' }, { state: 'EXAM_COMPLETED' }] as never).length).toBe(1);
    expect(queueOf('nope')).toBeUndefined();
  });
});

describe('Exams: why it is due', () => {
  const base = { verifiedMinutes: 180, thresholdMinutes: 180, remainingMinutes: 0, due: true, lastConductedDate: '2026-11-05' };
  it('says what the verified hours are and since when', () => {
    expect(dueReason(base)).toBe('Due: 3 h of verified classes since the exam on 2026-11-05.');
    expect(dueReason({ ...base, verifiedMinutes: 100, remainingMinutes: 80, due: false })).toBe('1 h 20 min more to go: 1 h 40 min of verified classes since the exam on 2026-11-05.');
    expect(dueReason({ ...base, lastConductedDate: null })).toContain('no exam has been conducted yet');
  });
  it('tells due-and-unscheduled from the others', () => {
    expect(dueStatus({ due: true, scheduledExam: null })).toBe('due');
    expect(dueStatus({ due: true, scheduledExam: { id: 'x', date: '2026-11-20' } })).toBe('due-scheduled');
    expect(dueStatus({ due: false, scheduledExam: { id: 'x', date: '2026-11-20' } })).toBe('scheduled');
    expect(dueStatus({ due: false, scheduledExam: null })).toBe('counting');
    expect(DUE_STATUS_TEXT.due).toBe('Due, not scheduled');
  });
});

describe('Exams: requests', () => {
  it('sends only the filters that are set', () => {
    expect(dueQuery({ subjectId: '', student: '' })).toBe('');
    expect(dueQuery({ subjectId: 's1', student: 'asha rao' })).toBe('?subjectId=s1&student=asha%20rao');
    expect(workspaceQuery({ subjectId: '', student: 'a', from: '', to: '' })).toBe('?student=a&page=1&pageSize=100');
  });
});

describe('Exams: evaluation, marks and the parent', () => {
  const item = (kind: string, status: string) => ({ list: 'POST_EXAM', kind, status });
  it('shows marks only when recorded and says what is awaited otherwise', () => {
    expect(evaluationText({ conducted: null, tutorName: 'Meera', marks: null, items: [] }).text).toBe('Not sat yet');
    expect(evaluationText({ conducted: false, tutorName: null, marks: null, items: [] }).tone).toBe('none');
    expect(evaluationText({ conducted: true, tutorName: 'Meera', marks: null, items: [] }).text).toBe('Awaiting evaluation by Meera');
    expect(evaluationText({ conducted: true, tutorName: null, marks: null, items: [item('TUTOR_EVALUATION', 'DONE')] }).text).toBe('Evaluated, marks not recorded');
    expect(evaluationText({ conducted: true, tutorName: 'Meera', marks: { obtained: 8, max: 10, percentage: 80 }, items: [] })).toEqual({ tone: 'done', text: '8 of 10 (80%)' });
  });
  it('follows the parent steps of the checklist', () => {
    expect(parentSharingText({ conducted: null, items: [] }).tone).toBe('none');
    expect(parentSharingText({ conducted: true, items: [] }).text).toBe('Not shared with the parent yet');
    expect(parentSharingText({ conducted: true, items: [item('SHARE_WITH_PARENT', 'DONE')] }).text).toBe('Shared, receipt not confirmed');
    expect(parentSharingText({ conducted: true, items: [item('SHARE_WITH_PARENT', 'DONE'), item('PARENT_RECEIPT', 'DONE')] })).toEqual({ tone: 'done', text: 'Parent received it' });
  });
});
