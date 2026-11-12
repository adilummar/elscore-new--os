import { readFileSync } from 'fs';
import { join } from 'path';

import { DUE_STATUS_TEXT, EXAM_QUEUES, dueQuery, dueReason, dueStatus, examsInQueue, queueCount, queueOf, workspaceQuery } from './exams-view';

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
