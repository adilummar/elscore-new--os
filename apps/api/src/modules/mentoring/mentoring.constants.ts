import type { MentoringActivationStatus } from '@prisma/client';

export const TOTAL_STAGES = 7;

export interface StageDefinition {
  number: number;
  key: string;
  name: string;
}

export interface ChecklistItemDefinition {
  key: string;
  label: string;
  /** Mandatory items must be resolved before the stage can be verified; advisory ones are warnings only. */
  mandatory: boolean;
  /** Requirement this item belongs to (stage 1 groups its items under the seven approved requirements). */
  group?: string;
  groupLabel?: string;
  /**
   * Handover field keys this item depends on. The item can only be completed (VERIFIED) once each of these fields has
   * a real value; otherwise the Mentor marks it unavailable with a reason. Having a value never completes the item.
   */
  fields?: readonly string[];
}

/**
 * Bump when item definitions change; stored on every checklist response row.
 * Version 3 separates the two stages: Stage 1 (Admission Handover) is a single review requirement and Stage 2
 * (Meeting with Parents) holds the detailed verification checklist. Rows written under versions 1 and 2 keep their
 * data and are never deleted. Rows are matched by item key, so an old row whose key is still in the definition keeps
 * counting. The other old Stage 1 rows no longer count and are shown read-only on the Stage 2 page
 * (see LEGACY_STAGE1_ITEMS).
 */
export const CHECKLIST_DEFINITION_VERSION = 3;

export const STAGES: readonly StageDefinition[] = [
  { number: 1, key: 'ADMISSION_HANDOVER', name: 'Admission Handover' },
  { number: 2, key: 'PARENT_MEETING', name: 'Meeting with Parents' },
  { number: 3, key: 'TIMETABLE_CREATION', name: 'Timetable Creation' },
  { number: 4, key: 'GROUP_CREATION', name: 'Group Creation' },
  { number: 5, key: 'INDIVIDUAL_LEARNING_PLAN', name: 'Individual Learning Plan' },
  { number: 6, key: 'CLASS_READINESS', name: 'Class Readiness' },
  { number: 7, key: 'FIRST_CLASS_COMPLETION', name: 'First Class Completion' },
];

const m = (key: string, label: string): ChecklistItemDefinition => ({ key, label, mandatory: true });
/** Mandatory item that belongs to a named requirement group. */
const g = (group: string, groupLabel: string) => (key: string, label: string, fields?: readonly string[]): ChecklistItemDefinition => ({
  key,
  label,
  mandatory: true,
  group,
  groupLabel,
  ...(fields ? { fields } : {}),
});

const confirmInfo = g('confirm_information', 'Confirmed with the parent');
const meetingConduct = g('meeting_conduct', 'Meeting and follow-up');
const a = (key: string, label: string): ChecklistItemDefinition => ({ key, label, mandatory: false });

/**
 * Mandatory completion requirements per stage, taken from the approved Mentoring specification.
 * In WP3 these are Mentor-attested checklist items; the dedicated stage modules (parent meeting,
 * timetable engine, group setup, learning plan, class readiness, first class) will add automatic
 * evidence on top of the same items in WP4-WP7.
 */
export const CHECKLIST: Record<number, readonly ChecklistItemDefinition[]> = {
  // Stage 1 is an overview of what Sales handed over. Its only requirement is the Mentor's review of that handover.
  // The key is the one the original Stage 1 used for "missing information identified", so students who already
  // resolved it keep their result without any data change.
  1: [m('missing_info_identified', 'Handover reviewed and missing information identified for the parent meeting')],
  // Stage 2 is the working stage: the Mentor confirms and collects information with the parent. An item with `fields`
  // cannot be completed while that information is missing. The last six items are the approved Stage 2 requirements
  // and keep their keys, so rows saved earlier still count.
  2: [
    confirmInfo('student_parent_details_verified', 'Student and parent details verified', ['student.firstName', 'student.lastName', 'student.dateOfBirth', 'parent.name']),
    confirmInfo('parent_relationship_confirmed', 'Parent relationship confirmed', ['parent.relationship']),
    confirmInfo('contact_information_verified', 'Contact information verified', ['parent.primaryPhone']),
    confirmInfo('preferred_language_collected', 'Preferred language collected', ['academic.preferredLanguage']),
    confirmInfo('tutor_subject_requirements_confirmed', 'Tutor and subject requirements confirmed', ['academic.subjects', 'tutor.requirements']),
    confirmInfo('academic_requirements_recorded', 'Academic requirements recorded', ['academic.subjectNotes']),
    confirmInfo('previous_marks_collected', 'Previous marks collected, or marked unavailable with a reason', ['academic.previousMarks']),
    confirmInfo('examination_details_recorded', 'Examination details recorded, or marked pending or unavailable with a reason', ['examination.upcomingDates', 'examination.syllabusPortions']),
    confirmInfo('parent_expectations_documented', 'Parent expectations and concerns documented', ['parentExpectations']),
    confirmInfo('student_engagement_discussed', 'Student engagement and learning concerns discussed', ['studentEngagement', 'student.learningConcerns']),
    meetingConduct('additional_info_collected', 'Additional student information collected'),
    meetingConduct('methodology_explained', 'Teaching methodology explained and recorded'),
    meetingConduct('meet_and_timetable_instructions', 'Google Meet and timetable instructions communicated'),
    meetingConduct('admission_info_updated', 'Missing admission information updated'),
    meetingConduct('meeting_notes_followups', 'Meeting notes and follow-up actions recorded'),
    meetingConduct('parent_acknowledgement', 'Parent acknowledgement recorded (or authorised exception)'),
  ],
  3: [
    m('all_subjects_scheduled', 'All enrolled subjects scheduled'),
    m('frequency_verified', 'Subject frequency verified'),
    m('timings_configured', 'Timings configured'),
    m('tutor_availability_confirmed', 'Tutor availability confirmed'),
    m('parent_convenience_confirmed', 'Parent convenience confirmed'),
    m('no_unresolved_conflicts', 'No unresolved conflicts'),
    m('mentor_approved_timetable', 'Mentor approves the timetable'),
    m('timetable_shared', 'Timetable shared'),
    m('parent_confirmation', 'Parent confirmation recorded'),
    m('tutor_confirmation', 'Tutor confirmation recorded'),
    m('daily_visibility_enabled', 'Daily schedule visibility enabled'),
    m('reminders_active', 'Reminder configuration active'),
  ],
  4: [
    m('group_created', 'Dedicated WhatsApp group created'),
    m('group_dp', 'Group DP set (academy logo and student ID)'),
    m('members_verified', 'Mentor, tutors and parents added and verified'),
    m('welcome_messages', 'Welcome messages and introductions sent'),
    m('timetable_receipt', 'Timetable shared and receipt verified'),
    m('mentor_intro_voice', 'Mentor introduction voice message shared'),
    m('meet_link_shared', 'Common Google Meet link shared and verified'),
    m('class_update_format', 'Class-update format shared and acknowledged by tutors'),
    a('class_start_announcement', 'Class-start announcement sent'),
  ],
  5: [
    m('plan_prepared', 'Individual learning plan prepared'),
    m('priorities_set', 'Subject priorities (high / medium / low) set'),
    m('strengths_weaknesses', 'Strengths and weaknesses recorded, each weakness with an improvement action'),
    m('short_term_goals', 'Short-term goals defined'),
    m('long_term_goals', 'Long-term goals defined and linked'),
    m('tutor_contributions', 'Tutor observations incorporated'),
    m('plan_shared_with_parent', 'Plan shared with parent'),
    m('parent_ack_plan', 'Parent feedback and acknowledgement recorded'),
  ],
  6: [
    m('schedule_verified', 'Class schedule verified'),
    m('tutor_reminder', 'Tutor reminder sent'),
    m('parent_reminder', 'Parent reminder sent with Meet link'),
    m('materials_confirmed', 'Learning materials confirmed'),
    m('lesson_plan_approved', 'Pre-class lesson plan approved'),
    m('meet_link_accessible', 'Meet link accessible'),
    m('tutor_ready', 'Tutor ready'),
  ],
  7: [
    m('class_update_verified', 'Class update received and verified'),
    m('activities_shared', 'At least three post-class activities shared'),
    m('tutor_voice_update', 'Tutor voice update received (or approved evidence recorded)'),
    m('mentor_verification', 'Mentor verification complete'),
  ],
};

/**
 * Stage 1 checklist rows written before definition version 3: the seven requirements of version 1 and the 25 items
 * of version 2. They no longer count towards Stage 1, but a Mentor may have saved results, comments and evidence on
 * them, so the Stage 2 page lists them read-only. Nothing is deleted or rewritten.
 */
const V1 = 'Original requirement';
const LEGACY_ROWS: ReadonlyArray<readonly [string, string, string]> = [
  ['student_parent_verified', 'Student and parent details verified', V1],
  ['tutor_subject_confirmed', 'Tutor and subject information confirmed', V1],
  ['weekly_timetable_verified', 'Weekly timetable verified', V1],
  ['academic_requirements_recorded', 'Academic requirements recorded', V1],
  ['previous_marks', 'Previous marks collected or marked unavailable', V1],
  ['examination_details', 'Examination details recorded or marked pending', V1],
  ['parent_expectations', 'Parent expectations and concerns documented', V1],
  ['student_details_checked', 'Student details checked', 'Student and parent details verified'],
  ['parent_details_checked', 'Parent / guardian details checked', 'Student and parent details verified'],
  ['contact_details_verified', 'Contact details verified', 'Student and parent details verified'],
  ['parent_relationship_recorded', 'Parent relationship recorded', 'Student and parent details verified'],
  ['tutor_assignment_confirmed', 'Tutor assignment confirmed', 'Tutor and subject information confirmed'],
  ['subject_requirements_confirmed', 'Subject requirements confirmed', 'Tutor and subject information confirmed'],
  ['curriculum_grade_confirmed', 'Curriculum and grade confirmed', 'Tutor and subject information confirmed'],
  ['academic_expectations_reviewed', 'Academic expectations reviewed', 'Tutor and subject information confirmed'],
  ['preferred_days_collected', 'Preferred days collected', 'Weekly timetable verified'],
  ['preferred_time_slots_collected', 'Preferred time slots collected', 'Weekly timetable verified'],
  ['tutor_availability_checked', 'Tutor availability checked', 'Weekly timetable verified'],
  ['timetable_confirmed', 'Timetable confirmed', 'Weekly timetable verified'],
  ['learning_requirements_reviewed', 'Learning requirements reviewed', 'Academic requirements recorded'],
  ['subject_academic_needs_recorded', 'Subject-wise academic needs recorded', 'Academic requirements recorded'],
  ['learning_concerns_documented', 'Learning difficulties or concerns documented', 'Academic requirements recorded'],
  ['curriculum_syllabus_reviewed', 'Curriculum and syllabus requirements reviewed', 'Academic requirements recorded'],
  ['previous_marks_requested', 'Previous marks requested', 'Previous marks collected or marked unavailable'],
  ['previous_marks_collected', 'Marks collected, or marked unavailable with a reason', 'Previous marks collected or marked unavailable'],
  ['exam_dates_collected', 'Upcoming examination dates collected', 'Examination details recorded or marked pending'],
  ['exam_syllabus_collected', 'Syllabus / portions collected', 'Examination details recorded or marked pending'],
  ['exam_preparation_recorded', 'Examination preparation requirements recorded', 'Examination details recorded or marked pending'],
  ['parent_expectations_recorded', 'Parent expectations recorded', 'Parent expectations and concerns documented'],
  ['parent_concerns_recorded', 'Parent concerns recorded', 'Parent expectations and concerns documented'],
  ['student_engagement_recorded', 'Student engagement information recorded', 'Parent expectations and concerns documented'],
  ['follow_up_identified', 'Follow-up requirements identified', 'Parent expectations and concerns documented'],
];
export const LEGACY_STAGE1_ITEMS: Readonly<Record<string, { label: string; group: string }>> = Object.fromEntries(
  LEGACY_ROWS.map(([key, label, group]) => [key, { label, group }]),
);

export function getStageDefinition(stageNumber: number): StageDefinition | undefined {
  return STAGES.find((s) => s.number === stageNumber);
}

export function getChecklistDefinition(stageNumber: number): readonly ChecklistItemDefinition[] {
  return CHECKLIST[stageNumber] ?? [];
}

/** Activation statuses that count against a Mentor's workload. */
export const CLOSED_ACTIVATION_STATUSES: readonly MentoringActivationStatus[] = ['ACTIVATED', 'CANCELLED'];

export const MENTOR_ROLE_CODE = 'MENTOR';
export const MENTORING_HEAD_ROLE_CODE = 'MENTORING_HEAD';
export const DEMO_COUNSELOR_ROLE_CODE = 'DEMO_COUNSELOR';

export const ADVISORY_LOCK_ALLOCATION = 'mentoring_allocation';
