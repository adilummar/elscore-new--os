import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { fetchApi } from '@/lib/api/client';

import { AvailabilityWindow, validateAvailability } from './tutor-availability';
import { AssignmentView, CandidateList, TutorSessionView, TutorTools, TutorView } from './tutor-types';
import { InformationWorkspace } from './students/[id]/InformationWorkspace';
import { AssignedTutor, TutorChoices } from './students/[id]/TutorPanel';
import { TutorAvailabilityEditor, addRange } from './students/[id]/TutorAvailabilityEditor';
import { getMyAvailabilityAction, getTutorAvailabilityAction, saveTutorAvailabilityAction } from './schedule-actions';

jest.mock('@/lib/api/client', () => ({ fetchApi: jest.fn() }));

const text = (markup: string) => markup.replace(/<[^>]+>/g, ' ').replace(/&#x27;/g, "'").replace(/&amp;/g, '&').replace(/\s+/g, ' ');
const w = (day: number, start: string, end: string): AvailabilityWindow => ({ day: day as AvailabilityWindow['day'], start, end });

const session = (key: string, label: string, status: TutorSessionView['status'], reason: string, dayNumber = 1): TutorSessionView => ({
  key, label, status, reason, dayNumber, startMinute: 900, endMinute: 960,
  statusLabel: { AVAILABLE: 'Available', OCCUPIED: 'Occupied', NOT_WORKING_DAY: 'Not working this day', NOT_CONFIGURED: 'Availability not configured' }[status],
});
const tutor = (over: Partial<TutorView>): TutorView => ({
  tutorProfileId: 'tp-x', name: 'Tutor X', initials: 'TX', photoUrl: null, subjects: ['Mathematics'], levels: ['Grade 8', 'Grade 9', 'Grade 10'], hours: 'Monday 2:00 PM to 6:00 PM',
  verdict: 'FULL', summary: '', availableCount: 4, total: 4, sessions: [], ineligible: null, canAssign: true, isCurrent: false, ...over,
});

const rahul = tutor({
  tutorProfileId: 'tp-rahul', name: 'Rahul Menon', initials: 'RM', verdict: 'FULL',
  sessions: [session('0:Monday', 'Monday, 4:00 PM to 5:00 PM', 'AVAILABLE', 'Available.'), session('0:Wednesday', 'Wednesday, 4:00 PM to 5:00 PM', 'AVAILABLE', 'Available.', 3)],
});
const anjali = tutor({
  tutorProfileId: 'tp-anjali', name: 'Anjali Nair', initials: 'AN', verdict: 'PARTIAL', availableCount: 2, total: 4, canAssign: false, hours: 'Monday 2:00 PM to 6:00 PM, Thursday 3:00 PM to 7:00 PM',
  sessions: [
    session('0:Monday', 'Monday, 3:00 PM to 4:00 PM', 'AVAILABLE', 'Available.'),
    session('0:Tuesday', 'Tuesday, 3:00 PM to 4:00 PM', 'OCCUPIED', 'Already booked during this time.', 2),
    session('0:Thursday', 'Thursday, 3:00 PM to 4:00 PM', 'AVAILABLE', 'Available.', 4),
    session('0:Saturday', 'Saturday, 3:00 PM to 4:00 PM', 'NOT_WORKING_DAY', 'Does not work on Saturdays.', 6),
  ],
});
const meera = tutor({
  tutorProfileId: 'tp-meera', name: 'Meera Iyer', initials: 'MI', verdict: 'NONE', availableCount: 0, total: 1, canAssign: false,
  sessions: [session('0:Tuesday', 'Tuesday, 5:00 PM to 6:00 PM', 'NOT_CONFIGURED', 'Tuesday availability does not include 5:00 PM to 6:00 PM. Working on Tuesday: 3:00 PM to 4:30 PM.', 2)],
});
const neha = tutor({
  tutorProfileId: 'tp-neha', name: 'Neha Rao', initials: 'NR', verdict: 'NOT_ELIGIBLE', ineligible: "Grade 8 is not one of this tutor's levels.", canAssign: false,
  sessions: [session('0:Monday', 'Monday, 4:00 PM to 5:00 PM', 'AVAILABLE', 'Available.')],
});

const list = (over: Partial<CandidateList> = {}): CandidateList => ({
  subjectId: 'sub-ma', subjectName: 'Mathematics', gradeId: 'g-8', gradeName: 'Grade 8', ready: true, notReady: null,
  sessions: [{ key: '0:Monday', label: 'Monday, 4:00 PM to 5:00 PM' }, { key: '0:Wednesday', label: 'Wednesday, 4:00 PM to 5:00 PM' }],
  tutors: [rahul, anjali, meera, neha], current: null, canUpdateAvailability: true, ...over,
});

const tools = (over: Partial<TutorTools> = {}): TutorTools => ({
  assignments: [], canAssign: true, canManageAvailability: false,
  loadCandidates: async () => list(), assign: async () => undefined, remove: async () => undefined,
  loadAvailability: async () => ({ name: 'Rahul Menon', windows: [] }), saveAvailability: async () => undefined, ...over,
});

const choices = (data: CandidateList, t: TutorTools = tools()) =>
  renderToStaticMarkup(React.createElement(TutorChoices, { data, tools: t, busy: false, onSelect: () => undefined, onUpdateHours: () => undefined }));

describe('the tutor list for a subject', () => {
  it('shows the recommended tutor first, then every other tutor, with the schedule they were matched against', () => {
    const t = text(choices(list()));
    expect(t).toContain('Matched against the saved schedule: Monday, 4:00 PM to 5:00 PM; Wednesday, 4:00 PM to 5:00 PM.');
    expect(t.indexOf('Recommended')).toBeLessThan(t.indexOf('Rahul Menon'));
    expect(t.indexOf('Rahul Menon')).toBeLessThan(t.indexOf('Other tutors'));
    expect(t.indexOf('Other tutors')).toBeLessThan(t.indexOf('Anjali Nair'));
    expect(t.indexOf('Anjali Nair')).toBeLessThan(t.indexOf('Meera Iyer'));
    expect(t.indexOf('Meera Iyer')).toBeLessThan(t.indexOf('Neha Rao'));
  });

  it('says what each tutor teaches, the levels, and the working hours', () => {
    const t = text(choices(list()));
    expect(t).toContain('Rahul Menon Teaches Mathematics Levels: Grade 8, Grade 9, Grade 10');
    expect(t).toContain('Working hours: Monday 2:00 PM to 6:00 PM, Thursday 3:00 PM to 7:00 PM');
  });

  it('labels each tutor: recommended and fully available, partial with the count, not available, not eligible', () => {
    const t = text(choices(list()));
    expect(t).toContain('Recommended, fully available');
    expect(t).toContain('Partial availability, 2 of 4 sessions available');
    expect(t).toContain('Not available for any session');
    expect(t).toContain('Not eligible');
    expect(t).toContain("Grade 8 is not one of this tutor's levels.");
  });

  it('shows every session with its own status and the exact reason, separately', () => {
    const t = text(choices(list()));
    expect(t).toContain('Monday, 3:00 PM to 4:00 PM Available');
    expect(t).toContain('Tuesday, 3:00 PM to 4:00 PM Occupied Already booked during this time.');
    expect(t).toContain('Saturday, 3:00 PM to 4:00 PM Not working this day Does not work on Saturdays.');
    expect(t).toContain('Tuesday, 5:00 PM to 6:00 PM Availability not configured Tuesday availability does not include 5:00 PM to 6:00 PM. Working on Tuesday: 3:00 PM to 4:30 PM.');
  });

  it('uses green for available, amber for partial, red for occupied or not working, and a neutral colour for not configured', () => {
    const markup = choices(list());
    expect(markup).toMatch(/data-session-status="AVAILABLE"[\s\S]*?bg-emerald-500/);
    expect(markup).toMatch(/data-session-status="OCCUPIED"[\s\S]*?bg-red-500/);
    expect(markup).toMatch(/data-session-status="NOT_WORKING_DAY"[\s\S]*?bg-red-500/);
    expect(markup).toMatch(/data-session-status="NOT_CONFIGURED"[\s\S]*?bg-slate-400/);
    expect(markup).toContain('border-amber-200 bg-amber-50 text-amber-800'); // the partial availability chip
    expect(markup).toContain('border-emerald-200 bg-emerald-50 text-emerald-800'); // the fully available chip
  });

  it('only the fully available tutor can be selected, and the others explain why not', () => {
    const markup = choices(list());
    const cards = markup.split('data-tutor=').slice(1);
    const selectDisabled = cards.map((c) => {
      const attrs = /<button([^>]*)>(?:Select tutor|Selected)<\/button>/.exec(c)?.[1];
      return attrs === undefined ? null : /\sdisabled=""/.test(attrs);
    });
    expect(selectDisabled).toEqual([false, true, true, true]);
    expect(text(markup)).toContain('Every session must be available before this tutor can be selected.');
  });

  it('a tutor who cannot be selected for the level is never offered for selection and gets no availability action', () => {
    const t = text(choices(list({ tutors: [neha] }), tools({ canManageAvailability: true })));
    expect(t).not.toContain('Update tutor availability');
    expect(t).toContain('Not eligible');
  });

  it('offers Update tutor availability for missing hours only to people who may change them', () => {
    expect(text(choices(list(), tools({ canManageAvailability: true })))).toContain('Update tutor availability');
    const asMentor = text(choices(list(), tools({ canManageAvailability: false })));
    expect(asMentor).not.toContain('Update tutor availability');
    expect(asMentor).toContain('HR staff or the tutor can add the missing working hours.');
  });

  it('an occupied time cannot be fixed by adding hours, so it offers no availability action on its own', () => {
    const onlyOccupied = tutor({ tutorProfileId: 'tp-o', name: 'Omar Ali', verdict: 'PARTIAL', canAssign: false, availableCount: 0, total: 1, sessions: [session('0:Tuesday', 'Tuesday, 5:00 PM to 6:00 PM', 'OCCUPIED', 'Already booked during this time.', 2)] });
    expect(text(choices(list({ tutors: [onlyOccupied] }), tools({ canManageAvailability: true })))).not.toContain('Update tutor availability');
  });

  it('a Mentor who cannot assign (not the assigned Mentor) sees the list but no enabled Select tutor', () => {
    const markup = choices(list(), tools({ canAssign: false }));
    expect(markup.split('data-tutor=').slice(1).every((c) => /<button[^>]*disabled[^>]*>Select tutor<\/button>/.test(c))).toBe(true);
  });

  it('marks the current tutor and does not offer to select them again', () => {
    const t = text(choices(list({ tutors: [{ ...rahul, isCurrent: true }] })));
    expect(t).toContain('Current tutor');
    expect(t).toContain('Selected');
  });

  it('tells the Mentor when nobody is free for every session, so there is no recommended tutor', () => {
    expect(text(choices(list({ tutors: [anjali, meera] })))).toContain('No tutor is available for every session.');
  });

  it('says so when no tutor teaches the subject, and when the schedule is not ready', () => {
    expect(text(choices(list({ tutors: [] })))).toContain('No active tutor teaches Mathematics yet.');
    expect(text(choices(list({ ready: false, notReady: 'Set a start time for every class to check tutor availability. Missing for: Wednesday.', tutors: [] })))).toContain('Set a start time for every class');
  });
});

const assignment = (over: Partial<AssignmentView> = {}): AssignmentView => ({
  id: 'a1', subjectId: 'sub-ma', subjectName: 'Mathematics', status: 'ACTIVE', tutorProfileId: 'tp-rahul', tutorName: 'Rahul Menon', initials: 'RM', photoUrl: null,
  subjects: ['Mathematics'], levels: ['Grade 8'], sessions: ['Monday, 4:00 PM to 5:00 PM', 'Wednesday, 4:00 PM to 5:00 PM'], reviewDetail: null, assignedAt: '2026-11-08T09:00:00Z', ...over,
});
const assigned = (t: TutorTools, saved = true) => renderToStaticMarkup(React.createElement(AssignedTutor, { subjectId: 'sub-ma', subjectName: 'Mathematics', tools: t, saved }));

describe('the Assigned tutor section of a subject card', () => {
  it('invites the Mentor to select a tutor when there is none', () => {
    const t = text(assigned(tools()));
    expect(t).toContain('Assigned tutor');
    expect(t).toContain('No tutor selected for Mathematics.');
    expect(t).toContain('Select tutor');
  });

  it('shows the chosen tutor, what they teach, the sessions, and that they are confirmed', () => {
    const t = text(assigned(tools({ assignments: [assignment()] })));
    expect(t).toContain('Rahul Menon');
    expect(t).toContain('Confirmed for every session');
    expect(t).toContain('Teaches Mathematics. Levels: Grade 8.');
    expect(t).toContain('Monday, 4:00 PM to 5:00 PM');
    expect(t).toContain('Change tutor');
    expect(t).toContain('Remove tutor');
  });

  it('shows initials when there is no photo, and the photo when there is one', () => {
    expect(assigned(tools({ assignments: [assignment()] }))).toContain('>RM<');
    const withPhoto = assigned(tools({ assignments: [assignment({ photoUrl: 'https://files.example/rahul.jpg' })] }));
    expect(withPhoto).toContain('src="https://files.example/rahul.jpg"');
    expect(withPhoto).toContain('alt="Rahul Menon"');
  });

  it('flags a tutor who no longer fits, with the sessions affected, and says the booking stays', () => {
    const review = assignment({
      status: 'NEEDS_REVIEW',
      reviewDetail: { reason: 'Some sessions no longer fit the tutor.', sessions: [{ key: '0:Wednesday', label: 'Wednesday, 5:00 PM to 6:00 PM', status: 'NOT_CONFIGURED', reason: 'Wednesday availability does not include 5:00 PM to 6:00 PM.' }] },
    });
    const markup = assigned(tools({ assignments: [review] }));
    const t = text(markup);
    expect(t).toContain('Needs review');
    expect(t).toContain('This tutor no longer fits the schedule.');
    expect(t).toContain('Wednesday, 5:00 PM to 6:00 PM: Wednesday availability does not include 5:00 PM to 6:00 PM.');
    expect(t).toContain('The earlier booking stays until you choose another tutor');
    expect(markup).toContain('data-testid="tutor-review"');
    expect(t).not.toContain('Confirmed for every session');
  });

  it('asks for the schedule to be saved first when the card has unsaved changes', () => {
    const t = text(assigned(tools(), false));
    expect(t).toContain('Save the schedule to choose a tutor.');
    expect(t).not.toContain('Select tutor Save');
    expect(assigned(tools(), false)).not.toContain('>Select tutor<');
  });

  it('with a tutor already chosen, unsaved changes say the tutor will be re-checked once saved', () => {
    expect(text(assigned(tools({ assignments: [assignment()] }), false))).toContain('Save the schedule to re-check this tutor.');
  });

  it('a person who cannot assign sees the tutor but no buttons', () => {
    const t = text(assigned(tools({ canAssign: false, assignments: [assignment()] })));
    expect(t).toContain('Rahul Menon');
    expect(t).not.toContain('Change tutor');
    expect(t).not.toContain('Remove tutor');
    expect(text(assigned(tools({ canAssign: false })))).not.toContain('Select tutor');
  });

  it('an ended assignment is not shown as the current tutor', () => {
    expect(text(assigned(tools({ assignments: [assignment({ status: 'ENDED' })] })))).toContain('No tutor selected');
  });
});

describe('subject cards in the information workspace', () => {
  const handover = (canEditSchedule = true) => ({
    transferredFields: [{ field: 'student.firstName', source: 'STUDENT', value: 'Asha' }],
    missingFields: [],
    fieldValues: [{
      fieldKey: 'timetable.schedule', origin: 'MENTOR_COLLECTED', salesValue: null, updatedByName: 'Mina Mentor', updatedAt: '2026-11-08T09:00:00Z', collectedByName: 'Mina Mentor', collectedAt: '2026-11-08T09:00:00Z',
      value: { version: 2, subjects: [{ subjectId: 'sub-ma', subjectName: 'Mathematics', gradeId: 'g-8', gradeName: 'Grade 8', frequency: 'WEEKLY', totalMinutes: 120, distribution: 'EQUAL', sessions: [{ day: 'Monday', durationMinutes: 60, start: '16:00', end: '17:00' }, { day: 'Wednesday', durationMinutes: 60, start: '16:00', end: '17:00' }] }] },
    }],
    fieldVerifications: [],
    editableFields: canEditSchedule ? [{ key: 'timetable.schedule', type: 'SCHEDULE', options: null, columns: null, maxLength: null, minDate: null, maxDate: null, schedule: { subjects: [{ id: 'sub-ma', name: 'Mathematics' }], grades: [{ id: 'g-8', name: 'Grade 8' }], defaultSessionMinutes: 60, canAddSubject: false } }] : [],
  });
  const render = (t: TutorTools, canEdit = true) => renderToStaticMarkup(React.createElement(InformationWorkspace, { handover: handover(), canEdit, tutorTools: t } as never));

  it('puts an Assigned tutor section in each saved subject card, with a button to select', () => {
    const markup = render(tools());
    expect(markup).toContain('data-assigned-tutor="sub-ma"');
    expect(text(markup)).toContain('No tutor selected for Mathematics.');
    expect(text(markup)).toContain('Select tutor');
  });

  it('shows the assigned tutor in the card', () => {
    expect(text(render(tools({ assignments: [assignment()] })))).toContain('Confirmed for every session');
  });

  it('people who cannot edit see the schedule with each tutor, and no buttons', () => {
    const markup = render(tools({ canAssign: false, assignments: [assignment({ status: 'NEEDS_REVIEW' })] }), false);
    const t = text(markup);
    expect(markup).toContain('data-testid="schedule-view-tutor"');
    expect(t).toMatch(/Tutor: Rahul Menon\s*, needs review/);
    expect(t).not.toContain('Select tutor');
    expect(t).not.toContain('Change tutor');
  });

  it('without tutor tools the card has no tutor section, so other screens are unchanged', () => {
    expect(renderToStaticMarkup(React.createElement(InformationWorkspace, { handover: handover(), canEdit: true } as never))).not.toContain('Assigned tutor');
  });
});

describe('the tutor availability editor', () => {
  const render = (props: Partial<React.ComponentProps<typeof TutorAvailabilityEditor>> = {}) =>
    renderToStaticMarkup(React.createElement(TutorAvailabilityEditor, { name: 'Rahul Menon', initial: [w(1, '14:00', '18:00'), w(2, '15:00', '19:00'), w(6, '09:00', '13:00')], onSave: async () => undefined, ...props }));

  it('shows every day, the saved ranges, and Not working for a day with none', () => {
    const markup = render();
    const t = text(markup);
    for (const day of ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']) expect(t).toContain(day);
    expect(markup).toContain('aria-label="Monday range 1 start"');
    expect(markup).toContain('value="14:00"');
    expect(markup).toContain('value="18:00"');
    expect(t).toContain('Not working');
    expect(markup.match(/Not working/g)).toHaveLength(4); // Wednesday, Thursday, Friday, Sunday
  });

  it('lets a day hold several ranges, so a break is possible', () => {
    const markup = render({ initial: [w(1, '09:00', '12:00'), w(1, '14:00', '18:00')] });
    expect(markup).toContain('aria-label="Monday range 1 start"');
    expect(markup).toContain('aria-label="Monday range 2 start"');
    expect(text(markup)).toContain('Add two ranges on one day to leave a break.');
  });

  it('says changing hours never changes a booked class, and offers no save until something changes', () => {
    const markup = render();
    expect(text(markup)).toContain('Changing the hours never changes a class that is already booked.');
    expect(markup).toMatch(/<button[^>]*disabled[^>]*>Save availability<\/button>/);
    expect(text(markup)).toContain('No changes yet');
  });

  it('offers the exact times the student needs as one-click additions', () => {
    const t = text(render({ needed: [{ dayNumber: 2, startMinute: 17 * 60, endMinute: 18 * 60 }] }));
    expect(t).toContain('Times this student needs');
    expect(t).toContain('Add Tuesday 5:00 PM to 6:00 PM');
  });

  it('shows an invalid start straight away and blocks saving', () => {
    const markup = render({ initial: [w(1, '18:00', '14:00')] });
    expect(text(markup)).toContain('Monday: the end time must be after the start time.');
    expect(markup).toMatch(/<button[^>]*disabled[^>]*>Save availability<\/button>/);
  });

  it('shows overlapping ranges straight away and blocks saving', () => {
    expect(text(render({ initial: [w(2, '14:00', '17:00'), w(2, '16:00', '18:00')] }))).toContain('Tuesday: 4:00 PM to 6:00 PM overlaps 2:00 PM to 5:00 PM.');
  });

  it('adding a needed time joins it to a range it touches or overlaps, and the result is always valid', () => {
    const base = [w(2, '15:00', '17:00')];
    expect(addRange(base, w(2, '17:00', '18:00'))).toEqual([w(2, '15:00', '18:00')]);
    expect(addRange(base, w(2, '16:00', '19:00'))).toEqual([w(2, '15:00', '19:00')]);
    expect(addRange(base, w(2, '18:00', '19:00'))).toEqual([w(2, '15:00', '17:00'), w(2, '18:00', '19:00')]);
    expect(addRange(base, w(3, '10:00', '11:00'))).toEqual([w(2, '15:00', '17:00'), w(3, '10:00', '11:00')]);
    for (const next of [addRange(base, w(2, '17:00', '18:00')), addRange(base, w(2, '18:00', '19:00')), addRange(base, w(2, '14:00', '20:00'))]) expect(validateAvailability(next).ok).toBe(true);
  });

  it('has Save and Cancel with the wording a person would expect', () => {
    const t = text(render({ onCancel: () => undefined, saveLabel: 'Save availability' }));
    expect(t).toContain('Save availability');
    expect(t).toContain('Cancel');
  });
});

describe('tutor availability calls', () => {
  const mocked = fetchApi as jest.Mock;
  beforeEach(() => mocked.mockReset());

  it('go to the tutor profile availability route for that tutor, and return the API message on a refusal', async () => {
    mocked.mockResolvedValue({ windows: [] });
    await expect(getTutorAvailabilityAction('0a1b2c3d-1111-2222-3333-444455556666')).resolves.toEqual({ ok: true, data: { windows: [] } });
    expect(mocked).toHaveBeenCalledWith('/tutors/profile/0a1b2c3d-1111-2222-3333-444455556666/availability');
    mocked.mockRejectedValue(Object.assign(new Error('Access denied. Required permissions: tutor.profile.manage'), { status: 403 }));
    await expect(saveTutorAvailabilityAction('0a1b2c3d-1111-2222-3333-444455556666', [])).resolves.toEqual({ ok: false, message: 'Access denied. Required permissions: tutor.profile.manage' });
  });

  it('refuse an id that could change the route, without calling the API', async () => {
    for (const bad of ['../../users', 'a/b', '', 'x'.repeat(80), '1 OR 1=1']) {
      await expect(getTutorAvailabilityAction(bad)).resolves.toMatchObject({ ok: false });
      await expect(saveTutorAvailabilityAction(bad, [])).resolves.toMatchObject({ ok: false });
    }
    expect(mocked).not.toHaveBeenCalled();
  });

  it("a tutor's own hours use the me route and send only the ranges", async () => {
    mocked.mockResolvedValue({ windows: [] });
    await getMyAvailabilityAction();
    expect(mocked).toHaveBeenCalledWith('/tutors/profile/me/availability');
  });
});

describe('the tutor screens follow the Unslop rules', () => {
  const all = [
    choices(list(), tools({ canManageAvailability: true })),
    assigned(tools({ assignments: [assignment({ status: 'NEEDS_REVIEW', reviewDetail: { reason: 'Some sessions no longer fit the tutor.', sessions: [] } })] })),
    renderToStaticMarkup(React.createElement(TutorAvailabilityEditor, { name: 'Rahul Menon', initial: [], onSave: async () => undefined, onCancel: () => undefined, needed: [{ dayNumber: 2, startMinute: 1020, endMinute: 1080 }] })),
  ].map(text).join(' ');

  it('uses no em dash, en dash, emoji or curly quote', () => {
    expect(all).not.toMatch(/[–—]/);
    expect(all).not.toMatch(/\p{Extended_Pictographic}/u);
    expect(all).not.toMatch(/[‘’“”]/);
  });

  it('uses plain words in sentence case', () => {
    expect(all).not.toMatch(/\b(additionally|crucial|delve|enhance|fostering|intricate|pivotal|showcase|tapestry|testament|vibrant|leverage|utilize|facilitate)\b/i);
    for (const label of ['Select tutor', 'Update tutor availability', 'Other tutors', 'Not working', 'Add time range', 'Save availability']) expect(all).toContain(label);
    expect(all).not.toMatch(/Select Tutor|Update Tutor Availability|Not Working|Fully Available|Availability Not Configured/);
  });
});
