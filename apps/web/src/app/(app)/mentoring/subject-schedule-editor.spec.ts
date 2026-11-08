import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { initialEditorValue, isEditorDirty, validateEditorValue } from './handover-editing';
import { EditableFieldMeta, describeFieldChange } from './handover-presentation';
import { buildInventory } from './handover-inventory';
import { InformationWorkspace } from './students/[id]/InformationWorkspace';

const KEY = 'timetable.schedule';
const lists = {
  subjects: [{ id: 'sub-en', name: 'English' }, { id: 'sub-ma', name: 'Mathematics' }, { id: 'sub-sc', name: 'Science' }, { id: 'sub-ss', name: 'Social Studies' }],
  grades: [{ id: 'g-8', name: 'Grade 8' }, { id: 'g-9', name: 'Grade 9' }],
  defaultSessionMinutes: 60,
  canAddSubject: false,
};
const scheduleMeta = (over: Partial<NonNullable<EditableFieldMeta['schedule']>> = {}): EditableFieldMeta => ({
  key: KEY, type: 'SCHEDULE', options: null, columns: null, maxLength: null, minDate: null, maxDate: null, schedule: { ...lists, ...over },
});

const day = (d: string, minutes: number, extra: object = {}) => ({ day: d, durationMinutes: minutes, ...extra });
const english = () => ({ subjectId: 'sub-en', subjectName: 'English', gradeId: 'g-8', gradeName: 'Grade 8', frequency: 'WEEKLY', totalMinutes: 240, distribution: 'EQUAL', sessions: [day('Monday', 60), day('Tuesday', 60), day('Thursday', 60), day('Saturday', 60)] });
const maths = () => ({ subjectId: 'sub-ma', subjectName: 'Mathematics', gradeId: 'g-8', gradeName: 'Grade 8', frequency: 'WEEKLY', totalMinutes: 180, distribution: 'EQUAL', sessions: [day('Monday', 90), day('Wednesday', 90)] });
const science = () => ({ subjectId: 'sub-sc', subjectName: 'Science', gradeId: 'g-9', gradeName: 'Grade 9', frequency: 'BIWEEKLY', totalMinutes: 240, distribution: 'EQUAL', sessions: [day('Tuesday', 60, { week: 1 }), day('Thursday', 60, { week: 1 }), day('Monday', 60, { week: 2 }), day('Friday', 60, { week: 2 })] });
const social = () => ({ subjectId: 'sub-ss', subjectName: 'Social Studies', gradeId: 'g-8', gradeName: 'Grade 8', frequency: 'MONTHLY', totalMinutes: 360, distribution: 'EQUAL', sessions: [day('Tuesday', 90, { occurrences: ['EVERY'] })] });
const plan = (...subjects: object[]) => ({ version: 2, subjects });

function handover(stored: unknown, over: { meta?: EditableFieldMeta; verified?: boolean; changed?: boolean } = {}) {
  return {
    transferredFields: [
      { field: 'student.firstName', source: 'STUDENT', value: 'Asha' },
      { field: 'academic.subjects', source: 'REQUIREMENT', value: [{ requirementId: 'r1', subject: 'Mathematics', curriculum: 'CBSE', grade: 'Grade 8', monthlyHours: '12' }] },
    ],
    missingFields: [],
    fieldValues: stored === undefined ? [] : [{ fieldKey: KEY, value: stored, origin: 'MENTOR_COLLECTED', salesValue: null, updatedByName: 'Mina Mentor', updatedAt: '2026-11-03T09:40:00Z', collectedByName: 'Mina Mentor', collectedAt: '2026-11-03T09:40:00Z' }],
    fieldVerifications: over.verified || over.changed ? [{ fieldKey: KEY, verified: !over.changed, changedSinceVerified: !!over.changed, verifiedByName: 'Mina Mentor', verifiedAt: '2026-11-03T09:50:00Z' }] : [],
    editableFields: [over.meta ?? scheduleMeta()],
  };
}

const render = (h: unknown, props: Record<string, unknown> = {}) =>
  renderToStaticMarkup(React.createElement(InformationWorkspace, { handover: h, canEdit: true, onSave: async () => undefined, onVerify: async () => undefined, ...props } as never));
const text = (markup: string) => markup.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
const pressedDays = (markup: string) => Array.from(markup.matchAll(/<button[^>]*aria-label="(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)"[^>]*aria-pressed="true"/g)).map((m) => m[1]);
const count = (markup: string, needle: string) => markup.split(needle).length - 1;

describe('the subject schedule editor', () => {
  it('shows one card per subject with its level, frequency, hours and the period the hours belong to', () => {
    const t = text(render(handover(plan(english(), maths(), science(), social()))));
    expect(t).toContain('English');
    expect(t).toContain('Grade 8 · Weekly · 4 hours per week');
    expect(t).toContain('Grade 9 · Bi-weekly · 4 hours per two-week cycle');
    expect(t).toContain('Grade 8 · Monthly · 6 hours per month');
    expect(count(render(handover(plan(english(), maths(), science(), social()))), 'data-subject-card=')).toBe(4);
  });

  it('marks the chosen days on each subject independently', () => {
    expect(pressedDays(render(handover(plan(english()))))).toEqual(['Monday', 'Tuesday', 'Thursday', 'Saturday']);
    expect(pressedDays(render(handover(plan(maths()))))).toEqual(['Monday', 'Wednesday']);
  });

  it('shows the generated schedule and the total against the target, for the 4 hour example', () => {
    const t = text(render(handover(plan(english()))));
    expect(t).toContain('Total: 4 / 4 hours per week');
    for (const label of ['Monday', 'Tuesday', 'Thursday', 'Saturday']) expect(t).toContain(`${label} 1 hour`);
  });

  it('shows 1 hour 30 minutes on each day for 3 hours over two days, and the same for 1.5 hours on one day', () => {
    expect(text(render(handover(plan(maths()))))).toMatch(/Monday 1 hour 30 minutes.*Wednesday 1 hour 30 minutes/);
    const single = { ...english(), totalMinutes: 90, sessions: [day('Monday', 90)] };
    const t = text(render(handover(plan(single))));
    expect(t).toContain('Monday 1 hour 30 minutes');
    expect(t).toContain('Total: 1.5 / 1.5 hours per week');
  });

  it('bi-weekly shows Week 1 and Week 2 separately', () => {
    const markup = render(handover(plan(science())));
    expect(text(markup)).toContain('Week 1');
    expect(text(markup)).toContain('Week 2');
    expect(markup).toContain('aria-label="Science week 1 days"');
    expect(markup).toContain('aria-label="Science week 2 days"');
    expect(text(markup)).toMatch(/Week 1 Tuesday.*Week 1 Thursday.*Week 2 Monday.*Week 2 Friday/);
  });

  it('monthly shows a pattern for each chosen day and the expected classes', () => {
    const markup = render(handover(plan(social())));
    expect(markup).toContain('aria-label="Tuesday pattern"');
    for (const label of ['Every', 'First', 'Second', 'Third', 'Fourth', 'Last']) expect(text(markup)).toContain(label);
    expect(text(markup)).toContain('4 classes a month');
    expect(text(markup)).toContain('Every Tuesday');
  });

  it('shows first and third Monday with the monthly total and class count', () => {
    const subject = { ...social(), totalMinutes: 180, sessions: [day('Monday', 90, { occurrences: ['FIRST', 'THIRD'] })] };
    const t = text(render(handover(plan(subject))));
    expect(t).toContain('First and third Monday');
    expect(t).toContain('2 classes a month');
    expect(t).toContain('Total: 3 / 3 hours per month');
  });

  it('keeps each frequency apart in the plan totals', () => {
    const t = text(render(handover(plan(english(), maths(), science(), social()))));
    expect(t).toContain('Learning plan: 4 subjects');
    expect(t).toContain('Weekly: 7 hours per week across 2 subjects');
    expect(t).toContain('Bi-weekly: 4 hours per two-week cycle across 1 subject');
    expect(t).toContain('Monthly: 6 hours per month across 1 subject');
    expect(t).toContain('About 42 hours a month in all, counting a month as four weeks.');
  });

  it('lets the Mentor edit the class lengths, and restore an equal split once they are custom', () => {
    expect(text(render(handover(plan(english()))))).toContain('Edit session durations');
    expect(text(render(handover(plan(english()))))).not.toContain('Restore equal distribution');
    const custom = { ...english(), distribution: 'CUSTOM', sessions: [day('Monday', 90), day('Tuesday', 30), day('Thursday', 60), day('Saturday', 60)] };
    const markup = render(handover(plan(custom)));
    expect(text(markup)).toContain('Restore equal distribution');
    expect(text(markup)).not.toContain('Edit session durations');
    expect(markup).toContain('aria-label="Monday length"');
  });

  it('has a start and end time for each class, and the end only works once a start is set', () => {
    const timed = { ...maths(), sessions: [day('Monday', 90, { start: '16:00', end: '17:30' }), day('Wednesday', 90)] };
    const markup = render(handover(plan(timed)));
    expect(markup).toContain('aria-label="Monday start time"');
    expect(markup).toContain('value="16:00"');
    expect(markup).toContain('value="17:30"');
    expect(markup).toMatch(/aria-label="Wednesday end time"[^>]*disabled/);
  });

  it('warns about overlapping classes of different subjects, and says saving is still possible', () => {
    const a = { ...english(), sessions: [day('Monday', 60, { start: '16:00', end: '17:00' }), day('Tuesday', 60), day('Thursday', 60), day('Saturday', 60)] };
    const b = { ...maths(), sessions: [day('Monday', 90, { start: '16:30', end: '18:00' }), day('Wednesday', 90)] };
    const t = text(render(handover(plan(a, b))));
    expect(t).toContain('Overlapping times');
    expect(t).toContain('English (Monday, 16:00 to 17:00) overlaps Mathematics (Monday, 16:30 to 18:00)');
    expect(t).toContain('You can still save.');
    expect(text(render(handover(plan(english(), maths()))))).not.toContain('Overlapping times');
  });

  it('offers Add subject, and Sales subjects that are not in the plan yet as quick additions', () => {
    const t = text(render(handover(plan(english()))));
    expect(t).toContain('Add subject');
    expect(t).toContain('Add Mathematics (Grade 8) from Sales');
    expect(text(render(handover(plan(maths()))))).not.toContain('Add Mathematics (Grade 8) from Sales');
  });

  it('tells the Mentor what Sales recorded for a subject already in the plan', () => {
    expect(text(render(handover(plan(maths()))))).toContain('Sales recorded 12 hours a month for this subject.');
  });

  it('adding a subject to the master list is offered only when the API said it is allowed', () => {
    const without = text(render(handover(plan(english()))));
    expect(without).toContain('can be added by someone with access to reference data');
    expect(without).not.toContain('Add to subject list');
    const allowed = text(render(handover(plan(english()), { meta: scheduleMeta({ canAddSubject: true }) }), { onCreateSubject: async () => undefined }));
    expect(allowed).toContain('Add to subject list');
    expect(allowed).not.toContain('can be added by someone with access');
  });

  it('removing a subject and a duplicate subject are handled in the card', () => {
    const markup = render(handover(plan(english(), maths())));
    expect(count(markup, 'Remove subject')).toBe(2);
    // The subject list marks the subject the other card already uses, so the same subject cannot be picked twice.
    expect(text(markup)).toContain('English (already added)');
    expect(text(markup)).toContain('Mathematics (already added)');
  });

  it('a timetable saved before subject schedules is shown as an earlier timetable and the plan starts empty', () => {
    const t = text(render(handover([{ day: 'Monday', start: '16:00', end: '17:00' }])));
    expect(t).toContain('Earlier timetable, without subjects');
    expect(t).toContain('Monday 16:00 to 17:00');
    expect(t).toContain('No subjects yet.');
  });

  it('with nothing saved the editor asks for the first subject', () => {
    const t = text(render(handover(undefined)));
    expect(t).toContain('No subjects yet.');
    expect(t).toContain('Pending collection');
  });
});

describe('the schedule card keeps the collection and verification workflow', () => {
  it('shows the source, the status and the verification checkbox', () => {
    const t = text(render(handover(plan(english()))));
    expect(t).toContain('Preferred Timetable / Schedule');
    expect(t).toContain('Source: Collected by Mina Mentor');
    expect(t).toContain('Not verified');
    expect(t).toContain('I have verified this information');
  });

  it('shows verified, and shows changed since verified after an edit', () => {
    expect(text(render(handover(plan(english()), { verified: true })))).toContain('Verified by Mina Mentor');
    expect(text(render(handover(plan(english()), { changed: true })))).toContain('Changed since verified');
  });

  it('the schedule counts as one collected field, and as pending when nothing is saved', () => {
    expect(buildInventory(handover(plan(english()))).collected).toBeGreaterThanOrEqual(1);
    const row = buildInventory(handover(plan(english()))).sections.flatMap((s) => s.rows).find((r) => r.fieldKey === KEY)!;
    expect(row.collection).toBe('COLLECTED');
    expect(row.value).toContain('English · Grade 8 · Weekly · 4 hours per week');
    expect(row.rawValue).toEqual(plan(english()));
    expect(buildInventory(handover(undefined)).sections.flatMap((s) => s.rows).find((r) => r.fieldKey === KEY)!.collection).toBe('PENDING');
  });

  it('a person who cannot edit sees the saved schedule as plain text blocks, with no inputs or buttons', () => {
    const markup = render(handover(plan(english(), science())), { canEdit: false });
    const t = text(markup);
    expect(markup).toContain('data-testid="schedule-view"');
    expect(t).toContain('English');
    expect(t).toContain('Monday, 1 hour');
    expect(t).toContain('Week 1 Tuesday, 1 hour');
    expect(markup).not.toContain('aria-label="Monday"'); // no day chips
    expect(markup).not.toContain('type="time"');
    expect(t).not.toContain('Add subject');
    expect(t).not.toContain('I have verified this information');
  });
});

describe('editing helpers for the schedule', () => {
  const meta = scheduleMeta();

  it('start from the saved plan as an independent copy, or from an empty plan', () => {
    const stored = plan(english());
    const start = initialEditorValue(meta, stored) as any;
    expect(start).toEqual(stored);
    start.subjects[0].totalMinutes = 1;
    expect(stored.subjects[0].totalMinutes).toBe(240);
    expect(initialEditorValue(meta, undefined)).toEqual({ version: 2, subjects: [] });
    expect(initialEditorValue(meta, [{ day: 'Monday', start: '16:00', end: '17:00' }])).toEqual({ version: 2, subjects: [] });
  });

  it('is dirty only when the plan changed, whatever order the saved keys came back in', () => {
    const stored = plan(english());
    const reordered = JSON.parse(JSON.stringify(stored), (_k, v) => (v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.entries(v).reverse()) : v));
    expect(isEditorDirty(meta, initialEditorValue(meta, stored), reordered)).toBe(false);
    const changed = JSON.parse(JSON.stringify(stored));
    changed.subjects[0].totalMinutes = 300;
    expect(isEditorDirty(meta, initialEditorValue(meta, stored), changed)).toBe(true);
  });

  it('accepts a complete plan and gives back names from the lists', () => {
    const result = validateEditorValue(meta, { ...plan(english()), subjects: [{ ...english(), subjectName: 'x' }] } as any);
    expect(result.ok && (result.value as any).subjects[0].subjectName).toBe('English');
  });

  it('refuses an incomplete plan with a message the Mentor can act on', () => {
    expect(validateEditorValue(meta, plan() as any)).toEqual({ ok: false, message: 'Add at least one subject.' });
    expect(validateEditorValue(meta, plan({ ...english(), gradeId: '' }) as any)).toEqual({ ok: false, message: 'English: Choose the required level.' });
    expect(validateEditorValue(meta, plan({ ...english(), sessions: [day('Monday', 120), ...english().sessions.slice(1)], distribution: 'CUSTOM' }) as any)).toEqual({
      ok: false,
      message: 'English: The sessions add up to 5 hours per week, but only 4 hours are required. 1 hour over.',
    });
    expect(validateEditorValue(meta, plan(english(), { ...maths(), subjectId: 'sub-en' }) as any)).toEqual({ ok: false, message: 'English is already in this plan. Edit that card instead of adding it again.' });
  });

  it('explains a stored change in the history in words', () => {
    const change = describeFieldChange({ fieldKey: KEY, previous: [{ day: 'Monday', start: '16:00', end: '17:00' }], next: plan(english()) });
    expect(change?.label).toBe('Preferred Timetable / Schedule');
    expect(change?.from).toContain('Monday 16:00');
    expect(change?.to).toContain('English · Grade 8 · Weekly · 4 hours per week');
    expect(change?.to).not.toMatch(/\n/);
  });
});

describe('the schedule screen follows the Unslop rules', () => {
  const t = text(render(handover(plan(english(), maths(), science(), social()), { meta: scheduleMeta({ canAddSubject: true }) }), { onCreateSubject: async () => undefined }));

  it('uses no em dash, en dash, emoji or curly quote', () => {
    expect(t).not.toMatch(/[–—]/);
    expect(t).not.toMatch(/\p{Extended_Pictographic}/u);
    expect(t).not.toMatch(/[‘’“”]/);
  });

  it('uses plain words, with no AI vocabulary, chatbot phrases or filler', () => {
    expect(t).not.toMatch(/\b(additionally|crucial|delve|enhance|fostering|intricate|pivotal|showcase|tapestry|testament|vibrant|leverage|utilize|facilitate)\b/i);
    expect(t).not.toMatch(/\b(i hope this helps|let me know if|of course!|certainly!)\b/i);
    expect(t).not.toMatch(/\b(in order to|due to the fact that|it is important to note)\b/i);
  });

  it('writes buttons and labels in sentence case', () => {
    for (const label of ['Add subject', 'Remove subject', 'Edit session durations', 'Add to subject list', 'Required level', 'Preferred days']) expect(t).toContain(label);
    expect(t).not.toMatch(/Add Subject|Remove Subject|Edit Session Durations|Restore Equal Distribution/);
  });
});
