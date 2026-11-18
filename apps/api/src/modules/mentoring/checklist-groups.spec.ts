import { MIN_REASON_LENGTH, canBeUnavailable, isMeaningfulReason, outcomeOf, summarizeChecklist } from './checklist-groups';
import { getChecklistDefinition } from './mentoring.constants';

const defs = getChecklistDefinition(2);
const row = (itemKey: string, state: string, reason: string | null = null) => ({ itemKey, state, reason });
const keysOf = (group: string) => defs.filter((d) => d.group === group).map((d) => d.key);

describe('the Meeting with Parents checklist is four groups of requirements', () => {
  it('maps all sixteen requirements into exactly four groups, in order', () => {
    const summary = summarizeChecklist(defs, [], new Set());
    expect(summary.groups.map((g) => [g.label, g.total])).toEqual([
      ['Student & Parent Verification', 4],
      ['Academic & Tutor Requirements', 4],
      ['Expectations & Learning Assessment', 2],
      ['Meeting, Communication & Follow-up', 6],
    ]);
    expect(summary.groups.flatMap((g) => g.itemKeys).sort()).toEqual(defs.map((d) => d.key).sort());
    expect(new Set(summary.groups.flatMap((g) => g.itemKeys)).size).toBe(16);
  });

  it('keeps every key the earlier sixteen-item checklist used, so rows saved before still count', () => {
    const earlier = [
      'student_parent_details_verified', 'parent_relationship_confirmed', 'contact_information_verified', 'preferred_language_collected', 'tutor_subject_requirements_confirmed',
      'academic_requirements_recorded', 'previous_marks_collected', 'examination_details_recorded', 'parent_expectations_documented', 'student_engagement_discussed',
      'additional_info_collected', 'methodology_explained', 'meet_and_timetable_instructions', 'admission_info_updated', 'meeting_notes_followups', 'parent_acknowledgement',
    ];
    expect(defs.map((d) => d.key)).toEqual(earlier);
  });

  it('a group is derived from its items: 3 completed + 1 pending is incomplete', () => {
    const [a, b, c] = keysOf('student_parent_verification');
    const g = summarizeChecklist(defs, [row(a, 'VERIFIED'), row(b, 'VERIFIED'), row(c, 'VERIFIED')], new Set()).groups[0];
    expect(g).toMatchObject({ completed: 3, pending: 1, complete: false, status: 'IN_PROGRESS' });
  });

  it('3 completed + 1 unavailable with a reason is complete, and so is 3 completed + 1 authorised exception', () => {
    const [a, b, c, d] = keysOf('academic_tutor_requirements');
    const unavailable = summarizeChecklist(defs, [row(a, 'VERIFIED'), row(b, 'VERIFIED'), row(c, 'UNAVAILABLE', 'School has not issued marks'), row(d, 'VERIFIED')], new Set()).groups[1];
    expect(unavailable).toMatchObject({ completed: 3, unavailable: 1, complete: true, status: 'COMPLETE' });
    const excepted = summarizeChecklist(defs, [row(a, 'VERIFIED'), row(b, 'VERIFIED'), row(c, 'VERIFIED')], new Set([d])).groups[1];
    expect(excepted).toMatchObject({ completed: 3, excepted: 1, complete: true });
  });

  it('2 completed + 2 pending is incomplete; nothing done is Not started; a blank reason does not resolve an item', () => {
    const keys = keysOf('student_parent_verification');
    expect(summarizeChecklist(defs, [row(keys[0], 'VERIFIED'), row(keys[1], 'VERIFIED')], new Set()).groups[0]).toMatchObject({ pending: 2, complete: false });
    expect(summarizeChecklist(defs, [], new Set()).groups.every((g) => g.status === 'NOT_STARTED')).toBe(true);
    expect(outcomeOf(row(keys[0], 'UNAVAILABLE', '   '), false)).toBe('PENDING');
    expect(outcomeOf(row(keys[0], 'COLLECTED'), false)).toBe('PENDING'); // collected is not completed
  });

  it('the whole checklist is complete only when every group is', () => {
    const allDone = defs.map((d) => row(d.key, 'VERIFIED'));
    expect(summarizeChecklist(defs, allDone, new Set()).complete).toBe(true);
    const oneOpen = allDone.filter((r) => r.itemKey !== 'parent_acknowledgement');
    const s = summarizeChecklist(defs, oneOpen, new Set());
    expect(s).toMatchObject({ complete: false, groupsComplete: 3, groupsTotal: 4, unresolved: ['parent_acknowledgement'] });
    expect(summarizeChecklist(defs, oneOpen, new Set(['parent_acknowledgement'])).complete).toBe(true);
  });

  it('only requirements about information that can be missing may be marked unavailable', () => {
    const allowing = defs.filter((d) => canBeUnavailable(d)).map((d) => d.key);
    expect(allowing).toEqual(expect.arrayContaining(['previous_marks_collected', 'examination_details_recorded', 'preferred_language_collected']));
    for (const key of keysOf('meeting_communication_followup')) expect(allowing).not.toContain(key);
  });

  it('a reason has to say something', () => {
    expect(MIN_REASON_LENGTH).toBe(5);
    expect([isMeaningfulReason(undefined), isMeaningfulReason('  '), isMeaningfulReason('n/a'), isMeaningfulReason('Parent has no marks yet')]).toEqual([false, false, false, true]);
  });
});

describe('Stages 4, 5 and 6 are shown as a few named requirements', () => {
  const shape = (n: number) => summarizeChecklist(getChecklistDefinition(n), [], new Set()).groups.map((g) => [g.label, g.itemKeys]);

  it('Group Creation is four groups over the nine earlier checks, with the class-start announcement advisory', () => {
    expect(shape(4)).toEqual([
      ['WhatsApp Group Setup', ['group_created', 'group_dp', 'members_verified']],
      ['Introductions & Welcome', ['welcome_messages', 'mentor_intro_voice']],
      ['Timetable & Class Access', ['timetable_receipt', 'meet_link_shared']],
      ['Class Communication & Readiness', ['class_update_format', 'class_start_announcement']],
    ]);
    const defs4 = getChecklistDefinition(4);
    expect(defs4.filter((d) => !d.mandatory).map((d) => d.key)).toEqual(['class_start_announcement']);
  });

  it('a group is complete when its mandatory checks are, whether or not the advisory one is done', () => {
    const defs4 = getChecklistDefinition(4);
    const rows = ['class_update_format'].map((k) => row(k, 'VERIFIED'));
    expect(summarizeChecklist(defs4, rows, new Set()).groups[3]).toMatchObject({ completed: 1, pending: 0, complete: true, status: 'COMPLETE' });
    expect(summarizeChecklist(defs4, [], new Set()).groups[3]).toMatchObject({ pending: 1, complete: false });
  });

  it('Individual Learning Plan has four requirements and keeps the two extra earlier checks as advisory', () => {
    expect(shape(5).map(([label]) => label)).toHaveLength(4);
    const defs5 = getChecklistDefinition(5);
    expect(defs5.map((d) => d.key)).toEqual(['plan_prepared', 'priorities_set', 'strengths_weaknesses', 'short_term_goals', 'long_term_goals', 'tutor_contributions', 'plan_shared_with_parent', 'parent_ack_plan']);
    expect(defs5.filter((d) => !d.mandatory).map((d) => d.key)).toEqual(['priorities_set', 'parent_ack_plan']);
    expect(summarizeChecklist(defs5, [], new Set()).unresolved).toEqual(['plan_prepared', 'strengths_weaknesses', 'short_term_goals', 'long_term_goals', 'tutor_contributions', 'plan_shared_with_parent']);
  });

  it('Class Readiness has the four requirements, each with the sub-checks the specification lists', () => {
    expect(shape(6)).toEqual([
      ['Class Schedule Confirmed', ['schedule_verified']],
      ['Reminders Sent', ['tutor_reminder', 'parent_reminder']],
      ['Academic Preparation Completed', ['materials_confirmed', 'lesson_plan_approved']],
      ['Class Readiness Confirmed', ['tutor_ready', 'meet_link_accessible']],
    ]);
  });

  it('every earlier item key of these stages is still defined, so rows saved before keep counting', () => {
    const earlier: Record<number, string[]> = {
      4: ['group_created', 'group_dp', 'members_verified', 'welcome_messages', 'timetable_receipt', 'mentor_intro_voice', 'meet_link_shared', 'class_update_format', 'class_start_announcement'],
      5: ['plan_prepared', 'priorities_set', 'strengths_weaknesses', 'short_term_goals', 'long_term_goals', 'tutor_contributions', 'plan_shared_with_parent', 'parent_ack_plan'],
      6: ['schedule_verified', 'tutor_reminder', 'parent_reminder', 'materials_confirmed', 'lesson_plan_approved', 'meet_link_accessible', 'tutor_ready'],
    };
    for (const n of [4, 5, 6]) expect(getChecklistDefinition(n).map((d) => d.key).sort()).toEqual(earlier[n].sort());
  });
});
