import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { subjectLines, subjectProblem } from './subjects-panel-view';
import { SubjectsPanel } from './students/[id]/SubjectsPanel';

const lines = [
  { requirementId: 'r1', subjectId: 's-math', subject: 'Mathematics', grade: 'Grade 8', monthlyHours: '12', addedByMentor: false },
  { requirementId: 'r2', subjectId: 's-sci', subject: 'Science', grade: 'Grade 8', monthlyHours: '6', addedByMentor: true, addedByName: 'Maya Mentor', addedAt: '2026-11-20T08:40:00.000Z' },
  { requirementId: 'r3', subjectId: 's-eng', subject: 'English', grade: 'Grade 8', monthlyHours: null, addedByMentor: false },
];

describe('the subject list', () => {
  it('says where each subject came from, and never shows missing hours as 0', () => {
    const l = subjectLines(lines);
    expect(l.map((x) => x.origin)).toEqual(['From Sales', 'Added by Maya Mentor, 20 Nov 2026', 'From Sales']);
    expect(l.map((x) => x.hoursText)).toEqual(['12 h a month', '6 h a month', 'Hours not set']);
    expect(subjectLines(null)).toEqual([]);
    expect(subjectLines([{ subject: '' }, null, 5])).toEqual([]);
  });

  it('explains why a subject cannot be added yet', () => {
    expect(subjectProblem('', '4')).toBe('Choose a subject.');
    expect(subjectProblem('s1', '')).toBe('Enter the hours a month.');
    expect(subjectProblem('s1', '0')).toBe('Enter the hours a month.');
    expect(subjectProblem('s1', '500')).toBe('Hours a month cannot be more than 200.');
    expect(subjectProblem('s1', '4.5')).toBeNull();
  });
});

describe('the Subjects panel', () => {
  const options = [{ id: 's-math', name: 'Mathematics' }, { id: 's-sci', name: 'Science' }, { id: 's-hist', name: 'History' }];
  const assignments: any[] = [{ id: 'a1', subjectId: 's-math', subjectName: 'Mathematics', status: 'ACTIVE', tutorName: 'Priya Nair' }];
  const render = (over: Partial<React.ComponentProps<typeof SubjectsPanel>> = {}) => renderToStaticMarkup(React.createElement(SubjectsPanel, { lines, assignments, schedule: null, options, canAdd: true, onAdd: async () => undefined, ...over }));

  it('lists every subject with its origin, tutor and schedule state', () => {
    const html = render();
    for (const t of ['Subjects (3)', 'Mathematics', 'From Sales', 'Added by Maya Mentor', 'Tutor: </span>Priya Nair', 'Not assigned yet', 'Not set yet', 'Hours not set']) expect(html).toContain(t);
    expect(html).toContain('data-origin="mentor"');
  });

  it('offers Add subject to the assigned Mentor, and not to anyone else', () => {
    expect(render()).toContain('Add subject');
    const readOnly = render({ canAdd: false });
    expect(readOnly).not.toContain('Add subject');
    expect(readOnly).not.toContain('Set schedule and tutor');
  });

  it('asks for the subjects when Sales collected none', () => {
    const html = render({ lines: [] });
    expect(html).toContain('Sales did not collect any subjects');
    expect(html).toContain('Subjects (0)');
  });
});
