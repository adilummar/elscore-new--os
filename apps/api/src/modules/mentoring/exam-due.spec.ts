import { EXAM_DUE_MINUTES, examDue } from './exam-due';

const TODAY = '2026-11-12';
const cls = (date: string, verifiedMinutes: number) => ({ date, verifiedMinutes });
const ex = (id: string, date: string, conducted: boolean | null, kind = 'EXAM', dropped = false) => ({ id, kind, date, conducted, dropped });

describe('when the next exam is due', () => {
  it('is due after three hours of verified class time and not before', () => {
    expect(examDue([cls('2026-11-02', 60), cls('2026-11-03', 60)], [], TODAY)).toMatchObject({ verifiedMinutes: 120, due: false, remainingMinutes: 60, progressPercent: 67 });
    expect(examDue([cls('2026-11-02', 60), cls('2026-11-03', 60), cls('2026-11-04', 60)], [], TODAY)).toMatchObject({ verifiedMinutes: 180, due: true, remainingMinutes: 0, progressPercent: 100 });
    expect(EXAM_DUE_MINUTES).toBe(180);
  });

  it('counts only verified minutes: a class with none adds nothing', () => {
    expect(examDue([cls('2026-11-02', 0), cls('2026-11-03', 60)], [], TODAY).verifiedMinutes).toBe(60);
  });

  it('starts counting again only after an exam was actually conducted', () => {
    const exams = [ex('e1', '2026-11-05', true)];
    const classes = [cls('2026-11-02', 120), cls('2026-11-05', 60), cls('2026-11-09', 60), cls('2026-11-10', 30)];
    const r = examDue(classes, exams, TODAY);
    expect(r.lastConductedDate).toBe('2026-11-05');
    expect(r.verifiedMinutes).toBe(90);
    expect(r.due).toBe(false);
  });

  it('is not reset by an exam that is only scheduled, rescheduled, cancelled or not conducted', () => {
    const classes = [cls('2026-11-02', 180)];
    for (const e of [ex('s', '2026-11-20', null), ex('r', '2026-11-25', null), ex('c', '2026-11-04', null, 'EXAM', true), ex('n', '2026-11-04', false)]) {
      const r = examDue(classes, [e], TODAY);
      expect(r.verifiedMinutes).toBe(180);
      expect(r.due).toBe(true);
    }
  });

  it('is not reset by a re-exam, which repeats an earlier paper', () => {
    expect(examDue([cls('2026-11-02', 180)], [ex('re', '2026-11-10', true, 'RE_EXAM')], TODAY).verifiedMinutes).toBe(180);
  });

  it('uses the latest conducted exam when there are several', () => {
    const r = examDue([cls('2026-10-20', 60), cls('2026-11-08', 60)], [ex('a', '2026-10-15', true), ex('b', '2026-11-01', true)], TODAY);
    expect(r.lastConductedDate).toBe('2026-11-01');
    expect(r.verifiedMinutes).toBe(60);
  });

  it('shows the next scheduled exam without changing the count', () => {
    const r = examDue([cls('2026-11-02', 120)], [ex('s1', '2026-11-20', null), ex('s2', '2026-11-16', null), ex('past', '2026-11-01', null)], TODAY);
    expect(r.scheduledExam).toEqual({ id: 's2', date: '2026-11-16' });
    expect(r.verifiedMinutes).toBe(120);
  });

  it('has nothing for a subject with no classes', () => {
    expect(examDue([], [], TODAY)).toMatchObject({ verifiedMinutes: 0, due: false, lastConductedDate: null, scheduledExam: null, progressPercent: 0 });
  });
});
