import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { ExamItem, emptyExamDraft, examProblems, payloadOfExam } from './exam-view';
import { ExamDetailDrawer } from './ExamDetailDrawer';
import { ExamForm } from './students/[id]/ExamsPanel';
import { PRIMARY_EXAM_TABS, tabCount } from './exams-view';

const text = (markup: string) => markup.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
const noop = () => undefined;

const makeExam = (over: Partial<ExamItem> = {}): ExamItem => ({
  id: 'ex-drawer-1',
  activationId: 'act-1',
  studentName: 'Rahul Sharma',
  subjectId: 'sub-math',
  subjectName: 'Mathematics',
  kind: 'EXAM',
  originalExamId: null,
  title: 'Mid-term Assessment',
  chapters: ['Calculus', 'Vectors'],
  portion: 'Term 1 Syllabus',
  date: '2026-11-20',
  originalDate: '2026-11-20',
  startMinute: 600,
  endMinute: 660,
  responsible: { type: 'TUTOR', name: 'Dr. Rao' },
  tutorName: 'Dr. Rao',
  instructions: 'Scientific calculator allowed',
  state: 'SCHEDULED',
  stateLabel: 'Scheduled',
  conducted: null,
  notConductedReason: null,
  reminder: { status: 'PREPARED', sentAt: null, acknowledgedAt: null, deliveryEvidence: null },
  informed: null,
  items: [
    { list: 'POST_EXAM', kind: 'COLLECT_PAPER', label: 'Collect the completed exam paper', status: 'PENDING', responsible: null, remarks: null, evidenceRef: null, doneAt: null, tutorMay: false },
    { list: 'POST_EXAM', kind: 'SHARE_WITH_TUTOR', label: 'Share the paper with the assigned tutor for evaluation', status: 'PENDING', responsible: null, remarks: null, evidenceRef: null, doneAt: null, tutorMay: false },
    { list: 'POST_EXAM', kind: 'TUTOR_RECEIPT', label: 'Tutor confirms the paper was received', status: 'PENDING', responsible: null, remarks: null, evidenceRef: null, doneAt: null, tutorMay: true },
    { list: 'POST_EXAM', kind: 'COLLECT_CHECKED', label: 'Collect the checked paper from the tutor', status: 'PENDING', responsible: null, remarks: null, evidenceRef: null, doneAt: null, tutorMay: false },
    { list: 'POST_EXAM', kind: 'TUTOR_EVALUATION', label: 'Tutor evaluation completed', status: 'PENDING', responsible: null, remarks: null, evidenceRef: null, doneAt: null, tutorMay: true },
    { list: 'POST_EXAM', kind: 'SHARE_WITH_PARENT', label: 'Share the evaluated paper with the parent', status: 'PENDING', responsible: null, remarks: null, evidenceRef: null, doneAt: null, tutorMay: false },
    { list: 'POST_EXAM', kind: 'PARENT_RECEIPT', label: 'Parent delivery or receipt confirmed', status: 'PENDING', responsible: null, remarks: null, evidenceRef: null, doneAt: null, tutorMay: false },
  ],
  problems: [],
  marks: null,
  remarks: { weaknesses: null, topicsToImprove: null, tutorSuggestions: null, mentorRemarks: null },
  reExam: { required: false, reason: null, examId: null, date: null, state: null },
  ...over,
});

describe('ExamDetailDrawer', () => {
  it('does not render markup when isOpen is false', () => {
    const html = renderToStaticMarkup(
      React.createElement(ExamDetailDrawer, {
        isOpen: false,
        onClose: noop,
        exam: makeExam(),
        canWork: true,
      }),
    );
    expect(html).toBe('');
  });

  it('renders student, subject, date, status and close button when open', () => {
    const html = renderToStaticMarkup(
      React.createElement(ExamDetailDrawer, {
        isOpen: true,
        onClose: noop,
        exam: makeExam(),
        canWork: true,
      }),
    );
    const t = text(html);
    expect(t).toContain('Rahul Sharma');
    expect(t).toContain('Mathematics');
    expect(t).toContain('Mid-term Assessment');
    expect(t).toContain('Scheduled');
    expect(t).toContain('10:00 AM to 11:00 AM');
    expect(html).toContain('aria-label="Close drawer"');
    expect(html).toContain('role="dialog"');
    expect(html).toContain('aria-modal="true"');
  });

  it('offers reschedule and send reminder for scheduled exams', () => {
    const html = renderToStaticMarkup(
      React.createElement(ExamDetailDrawer, {
        isOpen: true,
        onClose: noop,
        exam: makeExam(),
        canWork: true,
        onRescheduleClick: noop,
      }),
    );
    const t = text(html);
    expect(t).toContain('Reschedule exam');
    expect(t).toContain('Send reminder to tutor');
  });

  it('shows conducted exam with simplified checklist, marks, and remarks', () => {
    const satExam = makeExam({
      conducted: true,
      state: 'AWAITING_PAPER_COLLECTION',
      stateLabel: 'Awaiting paper collection',
      marks: { obtained: 42, max: 50, percentage: 84, evaluationDate: '2026-11-21', evaluatingTutorName: 'Dr. Rao' },
      remarks: { weaknesses: 'Trigonometry identities', topicsToImprove: 'Integration by parts', tutorSuggestions: 'Weekly practice sheet', mentorRemarks: 'Follow up on Sunday' },
    });

    const html = renderToStaticMarkup(
      React.createElement(ExamDetailDrawer, {
        isOpen: true,
        onClose: noop,
        exam: satExam,
        canWork: true,
      }),
    );
    const t = text(html);
    expect(t).toContain('After the Exam Checklist');
    expect(t).toContain('Collect the completed exam paper');
    expect(t).toContain('Share the paper with the assigned tutor for evaluation');
    expect(t).toContain('42 of 50 (84%)');
    expect(t).toContain('Trigonometry identities');
    expect(t).toContain('Integration by parts');
    expect(t).toContain('Follow up on Sunday');
  });
});

describe('ExamForm with duration and notification details', () => {
  it('supports duration in drafts and pre-fills durationMinutes', () => {
    const draft = emptyExamDraft('sub-math', '2026-11-20', 90);
    expect(draft.durationMinutes).toBe(90);
    expect(draft.subjectId).toBe('sub-math');
  });

  it('renders duration selector and notification information card', () => {
    const draft = {
      ...emptyExamDraft('sub-math', '2026-11-20', 60),
      title: 'Unit Assessment',
      chaptersText: 'Vectors',
      start: '10:00',
      end: '11:00',
    };
    const html = renderToStaticMarkup(
      React.createElement(ExamForm, {
        subjects: [{ subjectId: 'sub-math', subjectName: 'Mathematics' }],
        draft,
        heading: 'Schedule an exam',
        submitLabel: 'Schedule the exam',
        onChange: noop,
        onSubmit: noop,
        onCancel: noop,
      }),
    );
    const t = text(html);
    expect(t).toContain('Duration');
    expect(t).toContain('60 min (1 h)');
    expect(t).toContain('Notification Information');
    expect(t).toContain('reminder notification will be automatically prepared in-app');
  });

  it('calculates end time from start and durationMinutes in payload', () => {
    const draft = {
      ...emptyExamDraft('sub-math', '2026-11-20', 90),
      title: 'Unit Assessment',
      chaptersText: 'Vectors',
      start: '14:30',
      end: '',
    };
    const payload = payloadOfExam(draft);
    expect(payload.start).toBe('14:30');
    expect(payload.end).toBe('16:00');
    expect(payload.durationMinutes).toBe(90);
  });
});

describe('Workspace 5 primary sections', () => {
  it('correctly maps the 5 sections with queue counts', () => {
    expect(PRIMARY_EXAM_TABS.map((t) => t.key)).toEqual([
      'due',
      'upcoming',
      'rescheduled',
      'followup',
      'completed',
    ]);

    const counts = {
      SCHEDULED: 2,
      REMINDER_PENDING: 1,
      RESCHEDULED: 3,
      EXAM_COMPLETED: 1,
      AWAITING_PAPER_COLLECTION: 2,
      AWAITING_EVALUATION: 1,
      MARKS_PENDING: 1,
      AWAITING_PARENT_SHARING: 1,
      RE_EXAM_REQUIRED: 1,
      COMPLETED: 12,
    };

    const upcoming = PRIMARY_EXAM_TABS.find((t) => t.key === 'upcoming')!;
    const rescheduled = PRIMARY_EXAM_TABS.find((t) => t.key === 'rescheduled')!;
    const followup = PRIMARY_EXAM_TABS.find((t) => t.key === 'followup')!;
    const completed = PRIMARY_EXAM_TABS.find((t) => t.key === 'completed')!;
    const due = PRIMARY_EXAM_TABS.find((t) => t.key === 'due')!;

    expect(tabCount(upcoming, counts)).toBe(3);
    expect(tabCount(rescheduled, counts)).toBe(3);
    expect(tabCount(followup, counts)).toBe(7);
    expect(tabCount(completed, counts)).toBe(12);
    expect(tabCount(due, counts, 4)).toBe(4);
  });
});
