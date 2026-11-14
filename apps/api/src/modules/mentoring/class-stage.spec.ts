import { checkStageSubmission, sameChecklist, stageStatuses, suggestedStage } from './class-stage';

const OPTIONS = [
  { code: 'WORKSHEET', label: 'Worksheet', active: true },
  { code: 'QUIZ', label: 'Quiz', active: true },
  { code: 'OTHER', label: 'Other', active: true },
  { code: 'OLD_ONE', label: 'Old one', active: false },
];

describe('checking a Before Class submission', () => {
  it('needs the reminder item to be ticked', () => {
    expect(checkStageSubmission('BEFORE', { items: { reminderSent: true } }, OPTIONS)).toEqual({ ok: true, value: { items: { reminderSent: true } } });
    expect(checkStageSubmission('BEFORE', { items: { reminderSent: false } }, OPTIONS)).toMatchObject({ ok: false });
    expect(checkStageSubmission('BEFORE', { items: {} }, OPTIONS)).toMatchObject({ ok: false });
    expect(checkStageSubmission('BEFORE', {}, OPTIONS)).toMatchObject({ ok: false });
    expect(checkStageSubmission('BEFORE', null, OPTIONS)).toMatchObject({ ok: false });
  });
  it('refuses an item that is not on the list, and a value that is not a tick', () => {
    expect(checkStageSubmission('BEFORE', { items: { reminderSent: true, voiceShared: true } }, OPTIONS)).toMatchObject({ ok: false });
    expect(checkStageSubmission('BEFORE', { items: { reminderSent: 'yes' } }, OPTIONS)).toMatchObject({ ok: false });
  });
});

describe('checking an After Class submission', () => {
  const items = { checklistShared: true, voiceShared: true, activitiesGiven: true };
  it('needs all three items ticked and says which are not', () => {
    const r = checkStageSubmission('AFTER', { items: { ...items, voiceShared: false }, activities: ['QUIZ'] }, OPTIONS);
    expect(r).toMatchObject({ ok: false });
    expect((r as { message: string }).message).toContain('Voice recording shared');
  });
  it('needs at least one activity from the list, and keeps its label at submission', () => {
    expect(checkStageSubmission('AFTER', { items, activities: [] }, OPTIONS)).toMatchObject({ ok: false });
    expect(checkStageSubmission('AFTER', { items }, OPTIONS)).toMatchObject({ ok: false });
    const ok = checkStageSubmission('AFTER', { items, activities: ['WORKSHEET', 'QUIZ', 'QUIZ'] }, OPTIONS);
    expect(ok).toEqual({ ok: true, value: { items, activities: [{ code: 'WORKSHEET', label: 'Worksheet' }, { code: 'QUIZ', label: 'Quiz' }] } });
  });
  it('refuses an activity that is not on the list or is switched off, unless this class already had it', () => {
    expect(checkStageSubmission('AFTER', { items, activities: ['NOPE'] }, OPTIONS)).toMatchObject({ ok: false });
    expect(checkStageSubmission('AFTER', { items, activities: ['OLD_ONE'] }, OPTIONS)).toMatchObject({ ok: false });
    const prev = { items, activities: [{ code: 'OLD_ONE', label: 'Old wording' }] };
    expect(checkStageSubmission('AFTER', { items, activities: ['OLD_ONE'] }, OPTIONS, prev)).toEqual({ ok: true, value: { items, activities: [{ code: 'OLD_ONE', label: 'Old wording' }] } });
  });
  it('keeps the label an earlier submission had, even after the option was renamed', () => {
    const renamed = [{ code: 'QUIZ', label: 'Quick quiz', active: true }];
    const prev = { items, activities: [{ code: 'QUIZ', label: 'Quiz' }] };
    expect(checkStageSubmission('AFTER', { items, activities: ['QUIZ'] }, renamed, prev)).toMatchObject({ ok: true, value: { activities: [{ code: 'QUIZ', label: 'Quiz' }] } });
    expect(checkStageSubmission('AFTER', { items, activities: ['QUIZ'] }, renamed)).toMatchObject({ ok: true, value: { activities: [{ code: 'QUIZ', label: 'Quick quiz' }] } });
  });
  it('needs a description when Other is chosen', () => {
    expect(checkStageSubmission('AFTER', { items, activities: ['OTHER'] }, OPTIONS)).toMatchObject({ ok: false });
    expect(checkStageSubmission('AFTER', { items, activities: ['OTHER'], otherDescription: 'Role play' }, OPTIONS)).toMatchObject({ ok: true, value: { otherDescription: 'Role play' } });
    expect(checkStageSubmission('AFTER', { items, activities: ['OTHER'], otherDescription: 'x'.repeat(201) }, OPTIONS)).toMatchObject({ ok: false });
  });
});

describe('the same checklist', () => {
  it('is the same whatever the order of its keys and activities', () => {
    const a = { items: { checklistShared: true, voiceShared: true }, activities: [{ code: 'A', label: 'a' }, { code: 'B', label: 'b' }] };
    const b = { items: { voiceShared: true, checklistShared: true }, activities: [{ code: 'B', label: 'b' }, { code: 'A', label: 'a' }] };
    expect(sameChecklist(a, b)).toBe(true);
    expect(sameChecklist(a, { ...b, activities: [{ code: 'B', label: 'b' }] })).toBe(false);
    expect(sameChecklist(a, null)).toBe(false);
  });
});

describe('where the class is in its workflow', () => {
  const facts = (over = {}) => ({ status: 'SCHEDULED', tutorSubmitted: false, actualRecorded: false, ...over });
  const states = (stored: any, f: any, sel?: any) => stageStatuses(stored, f, sel).map((s) => `${s.key}:${s.state}${s.reachable ? '' : ':locked'}`);

  it('starts on Before Class with the rest locked, and nothing is complete because it was opened', () => {
    expect(states({}, facts())).toEqual(['BEFORE:CURRENT', 'AFTER:PENDING:locked', 'TIMING:PENDING:locked', 'VERIFICATION:PENDING:locked']);
    expect(states({}, facts(), 'AFTER')).toEqual(['BEFORE:PENDING', 'AFTER:CURRENT:locked', 'TIMING:PENDING:locked', 'VERIFICATION:PENDING:locked']);
  });
  it('completes a stored stage only when it was submitted, and unlocks the next one', () => {
    expect(states({ BEFORE: true }, facts())).toEqual(['BEFORE:COMPLETE', 'AFTER:CURRENT', 'TIMING:PENDING:locked', 'VERIFICATION:PENDING:locked']);
    expect(states({ BEFORE: true, AFTER: true }, facts())).toEqual(['BEFORE:COMPLETE', 'AFTER:COMPLETE', 'TIMING:CURRENT', 'VERIFICATION:PENDING']);
  });
  it('completes Actual Time when an actual time is recorded, and Verification when the Mentor verified', () => {
    expect(states({ BEFORE: true, AFTER: true }, facts({ actualRecorded: true }))).toEqual(['BEFORE:COMPLETE', 'AFTER:COMPLETE', 'TIMING:COMPLETE', 'VERIFICATION:CURRENT']);
    expect(states({ BEFORE: true, AFTER: true }, facts({ actualRecorded: true, status: 'VERIFIED' }))).toEqual(['BEFORE:COMPLETE', 'AFTER:COMPLETE', 'TIMING:COMPLETE', 'VERIFICATION:COMPLETE']);
  });
  it('never locks a class the tutor has already reported behind a stage that was never filled in', () => {
    const f = facts({ status: 'AWAITING_MENTOR_VERIFICATION', tutorSubmitted: true, actualRecorded: true });
    expect(stageStatuses({}, f).every((x) => x.reachable)).toBe(true);
    expect(suggestedStage({}, f)).toBe('BEFORE');
  });
  it('marks Verification as needing attention when the class was returned for correction', () => {
    expect(stageStatuses({ BEFORE: true, AFTER: true }, facts({ status: 'RETURNED_FOR_CORRECTION', tutorSubmitted: true })).find((x) => x.key === 'VERIFICATION')?.state).toBe('ATTENTION');
  });
  it('suggests the first stage that can be worked on and is not done', () => {
    expect(suggestedStage({}, facts())).toBe('BEFORE');
    expect(suggestedStage({ BEFORE: true }, facts())).toBe('AFTER');
    expect(suggestedStage({ BEFORE: true, AFTER: true }, facts())).toBe('TIMING');
  });
});
