import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { PlanHistory, PlanSummary, SubjectPlanCard } from './students/[id]/LearningPlanPanel';
import {
  Draft, HISTORY_LABELS, LearningPlanData, LearningPlanSubject, OVERALL_LABELS, SUBJECT_LABELS, draftOf, formatDate, isDirty, missingFor, payloadOf,
} from './learning-plan-view';

const text = (markup: string) => markup.replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
const noop = () => undefined;
const MEETING = '2026-12-10';

const subject = (over: Partial<LearningPlanSubject> = {}): LearningPlanSubject => ({
  subjectId: 'sub-ma', subjectName: 'Mathematics', gradeName: 'Grade 10', scheduleStart: '2026-11-10', defaultStart: '2026-11-10', status: 'NOT_STARTED', plan: null,
  createdBy: null, createdAt: null, updatedBy: null, updatedAt: null, ...over,
});
const saved = (over: Partial<LearningPlanSubject> = {}) => subject({
  status: 'COMPLETE', plan: { description: 'Improve problem solving', objectives: 'Algebra', topics: 'Equations', outcomes: 'Solves Grade 10 problems', startsOn: '2026-11-10', endsOn: MEETING },
  createdBy: 'Mira Mentor', createdAt: '2026-11-10T09:00:00.000Z', updatedBy: 'Mira Mentor', updatedAt: '2026-11-11T10:30:00.000Z', ...over,
});

const data = (over: Partial<LearningPlanData> = {}): LearningPlanData => ({
  student: { id: 'stu-1', name: 'Synthetic Student A' },
  status: 'DRAFT', planStatus: 'DRAFT',
  summary: { enrolledSubjects: 3, completedSubjects: 1, overallStart: '2026-11-10', nextReviewMeeting: null, endsOn: null },
  meeting: null, pendingMessage: 'Monthly review meeting date pending', pendingExplanation: 'The learning plan end date will be confirmed when the next monthly review meeting is scheduled.',
  problems: [], subjects: [saved()], history: [], approval: { by: null, at: null }, stageStatus: 'IN_PROGRESS', canEdit: true, ...over,
});

const card = (s: LearningPlanSubject, o: { meetingDate?: string | null; draft?: Draft; canEdit?: boolean; needsReason?: boolean; reason?: string; error?: string | null } = {}) => {
  const meetingDate = o.meetingDate === undefined ? null : o.meetingDate;
  return renderToStaticMarkup(React.createElement(SubjectPlanCard, {
    subject: s, meetingDate, draft: o.draft ?? draftOf(s, meetingDate), canEdit: o.canEdit ?? true, needsReason: o.needsReason ?? false, reason: o.reason ?? '', error: o.error ?? null, onChange: noop, onReason: noop, onSave: noop,
  }));
};

describe('the summary at the top of Stage 5', () => {
  it('shows the student, the counts, the dates and the status from the saved plan', () => {
    const t = text(renderToStaticMarkup(React.createElement(PlanSummary, { data: data({ summary: { enrolledSubjects: 3, completedSubjects: 2, overallStart: '2026-11-10', nextReviewMeeting: MEETING, endsOn: MEETING }, meeting: { id: 'm1', date: MEETING }, pendingMessage: null, pendingExplanation: null, status: 'READY_FOR_REVIEW' }) })));
    for (const part of ['Synthetic Student A, learning plan', 'Enrolled subjects 3', 'Subject plans complete 2 of 3', 'Overall start date 10 Nov 2026', 'Next monthly review meeting 10 Dec 2026', 'Overall end date 10 Dec 2026', 'Ready for review']) expect(t).toContain(part);
    expect(t).not.toContain('pending');
  });

  it('says "Monthly review meeting date pending" and explains it when no meeting is scheduled, and invents no date', () => {
    const markup = renderToStaticMarkup(React.createElement(PlanSummary, { data: data() }));
    expect(markup).toContain('data-testid="review-date-pending"');
    expect(text(markup)).toContain('Monthly review meeting date pending');
    expect(text(markup)).toContain('The learning plan end date will be confirmed when the next monthly review meeting is scheduled.');
    expect(text(markup)).toContain('Next monthly review meeting Pending');
    expect(text(markup)).toContain('Overall end date Pending');
  });

  it('uses the five status names', () => {
    expect(Object.values(OVERALL_LABELS)).toEqual(['Not started', 'Draft', 'Pending review date', 'Ready for review', 'Approved']);
  });
});

describe('a subject learning plan card', () => {
  it('has its own description, objectives, topics, outcomes, start date and end date', () => {
    const markup = card(saved(), { meetingDate: MEETING });
    expect(markup).toContain('aria-label="Mathematics learning plan"');
    for (const part of ['Learning plan description', 'Learning objectives', 'Topics or syllabus to cover', 'Expected learning outcomes', 'Start date', 'End date']) expect(text(markup)).toContain(part);
    expect(markup).toContain('id="plan-sub-ma-description"');
    expect(markup).toContain('value="2026-11-10"');
    expect(markup).toContain('value="2026-12-10"');
  });

  it('two subjects render separately, each with its own text and dates', () => {
    const a = card(saved(), { meetingDate: MEETING });
    const b = card(saved({ subjectId: 'sub-en', subjectName: 'English', plan: { description: 'Reading and writing', objectives: 'Grammar', topics: 'Comprehension', outcomes: 'Better essays', startsOn: '2026-11-12', endsOn: MEETING } }), { meetingDate: MEETING });
    expect(a).toContain('Improve problem solving');
    expect(a).not.toContain('Reading and writing');
    expect(b).toContain('Reading and writing');
    expect(b).toContain('id="plan-sub-en-description"');
    expect(b).toContain('value="2026-11-12"');
  });

  it('offers the planned first class as the start date until a plan is saved', () => {
    const empty = subject({ defaultStart: '2026-11-11' });
    const markup = card(empty);
    expect(markup).toContain('value="2026-11-11"');
    expect(text(markup)).toContain('Offered from the planned first class on 11 Nov 2026');
    expect(draftOf(empty, null).startsOn).toBe('2026-11-11');
    expect(draftOf(subject({ defaultStart: null }), null).startsOn).toBe('');
  });

  it('shows the end date as pending, not a date, while no meeting is scheduled', () => {
    const markup = card(saved({ status: 'PENDING_END_DATE', plan: { ...saved().plan!, endsOn: null } }));
    expect(markup).toContain('data-testid="end-pending"');
    expect(text(markup)).toContain('Set when the monthly review meeting is scheduled.');
    expect(markup).not.toContain('value="2026-12-10"');
  });

  it('with a meeting, the end date can be earlier but the page will not offer a later one', () => {
    const markup = card(saved(), { meetingDate: MEETING });
    expect(markup).toContain(`max="${MEETING}"`);
    expect(text(markup)).toContain('A plan can end earlier, never later.');
  });

  it('shows independent statuses and who last changed it', () => {
    expect(text(card(saved()))).toContain('Complete');
    expect(text(card(subject()))).toContain('Not started');
    expect(text(card(saved({ status: 'PENDING_END_DATE' })))).toContain('Incomplete, end date pending');
    expect(text(card(saved()))).toContain('Created by Mira Mentor, last updated by Mira Mentor on 11 Nov 2026, 10:30 UTC');
  });

  it('cannot be saved without a description and a start date, and says what is missing', () => {
    const blank: Draft = { description: '', objectives: '', topics: '', outcomes: '', startsOn: '', endsOn: '' };
    const markup = card(subject({ defaultStart: null }), { draft: blank });
    expect(markup).toMatch(/<button[^>]*\sdisabled=""[^>]*>Save Mathematics plan/);
    expect(text(markup)).toContain('Add the description and the start date to save.');
    expect(missingFor({ ...blank, description: 'x' })).toEqual(['the start date']);
    expect(missingFor({ ...blank, description: 'x', startsOn: '2026-11-10' })).toEqual([]);
  });

  it('enables saving only when something changed', () => {
    const s = saved();
    expect(card(s, { meetingDate: MEETING })).toMatch(/<button[^>]*\sdisabled=""[^>]*>Save Mathematics plan/);
    const edited = { ...draftOf(s, MEETING), topics: 'Geometry' };
    expect(card(s, { meetingDate: MEETING, draft: edited })).not.toMatch(/<button[^>]*\sdisabled=""[^>]*>Save Mathematics plan/);
    expect(isDirty(draftOf(s, MEETING), s, MEETING)).toBe(false);
    expect(isDirty(edited, s, MEETING)).toBe(true);
    expect(isDirty(draftOf(subject(), null), subject(), null)).toBe(true); // a plan that was never saved can always be saved
  });

  it('is read-only for everyone who may not edit, with no save button', () => {
    const markup = card(saved(), { canEdit: false });
    expect(markup).not.toContain('Save Mathematics plan');
    expect(markup).toMatch(/<textarea[^>]*disabled/);
  });

  it('asks for a reason when an approved plan is being changed, and not otherwise', () => {
    expect(text(card(saved(), { needsReason: true }))).toContain('Why is this approved plan changing?');
    expect(card(saved(), { needsReason: false })).not.toContain('Why is this approved plan changing?');
    const edited = { ...draftOf(saved(), MEETING), topics: 'Geometry' };
    expect(card(saved(), { meetingDate: MEETING, draft: edited, needsReason: true, reason: '' })).toMatch(/<button[^>]*\sdisabled=""[^>]*>Save Mathematics plan/);
    expect(card(saved(), { meetingDate: MEETING, draft: edited, needsReason: true, reason: 'Parent asked' })).not.toMatch(/<button[^>]*\sdisabled=""[^>]*>Save Mathematics plan/);
  });

  it('shows a server error beside the card', () => {
    expect(card(saved(), { error: 'The end date cannot be earlier than the start date.' })).toContain('role="alert"');
  });
});

describe('what is sent to the server', () => {
  const draft: Draft = { description: ' Plan ', objectives: 'O', topics: 'T', outcomes: 'U', startsOn: '2026-11-10', endsOn: '2026-12-01' };

  it('sends no end date while no meeting is scheduled, so none is ever invented', () => {
    expect(payloadOf(draft, null, '')).toEqual({ description: ' Plan ', objectives: 'O', topics: 'T', outcomes: 'U', startsOn: '2026-11-10' });
    expect(payloadOf(draft, null, '')).not.toHaveProperty('endsOn');
  });

  it('sends the chosen end date, or the meeting date when none was chosen, and a reason only when given', () => {
    expect(payloadOf(draft, MEETING, '')).toMatchObject({ endsOn: '2026-12-01' });
    expect(payloadOf({ ...draft, endsOn: '' }, MEETING, '')).toMatchObject({ endsOn: MEETING });
    expect(payloadOf(draft, MEETING, '  Parent asked  ')).toMatchObject({ reason: 'Parent asked' });
    expect(payloadOf(draft, MEETING, '')).not.toHaveProperty('reason');
  });
});

describe('the history and the words', () => {
  it('lists each version with its kind, who, when and why, and who approved', () => {
    const markup = renderToStaticMarkup(React.createElement(PlanHistory, { data: data({
      history: [
        { version: 3, kind: 'REVIEW_DATE_SYNCED', reason: 'The monthly review meeting moved from 2026-12-10 to 2026-12-17.', changedBy: 'Mira Mentor', at: '2026-11-20T08:00:00.000Z' },
        { version: 2, kind: 'APPROVED', reason: null, changedBy: 'Mira Mentor', at: '2026-11-18T08:00:00.000Z' },
      ],
      approval: { by: 'Mira Mentor', at: '2026-11-18T08:00:00.000Z' },
    }) }));
    const t = text(markup);
    expect(t).toContain('Review meeting date applied version 3, Mira Mentor, 20 Nov 2026, 08:00 UTC');
    expect(t).toContain('The monthly review meeting moved from 2026-12-10 to 2026-12-17.');
    expect(t).toContain('Plan approved version 2');
    expect(t).toContain('Approved by Mira Mentor on 18 Nov 2026, 08:00 UTC.');
  });

  it('says so when nothing is saved yet', () => {
    expect(text(renderToStaticMarkup(React.createElement(PlanHistory, { data: data() })))).toContain('Nothing has been saved yet.');
  });

  it('writes dates plainly and uses no dashes or emoji in its words', () => {
    expect(formatDate('2026-11-10')).toBe('10 Nov 2026');
    expect(formatDate(null)).toBe('');
    const words = [...Object.values(OVERALL_LABELS), ...Object.values(SUBJECT_LABELS), ...Object.values(HISTORY_LABELS)].join(' ');
    expect(words).not.toMatch(/[–—]/);
    expect(words).not.toMatch(/\p{Extended_Pictographic}/u);
  });
});
