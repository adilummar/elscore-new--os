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
}

/**
 * Bump when item definitions change; stored on every checklist response row.
 * Version 2 splits each Admission Handover requirement into individual items. Rows written under version 1
 * keep their data but are no longer part of the checklist (they are ignored, never deleted).
 */
export const CHECKLIST_DEFINITION_VERSION = 2;

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
const g = (group: string, groupLabel: string) => (key: string, label: string): ChecklistItemDefinition => ({ key, label, mandatory: true, group, groupLabel });

const studentParent = g('student_parent_verified', 'Student and parent details verified');
const tutorSubject = g('tutor_subject_confirmed', 'Tutor and subject information confirmed');
const weeklyTimetable = g('weekly_timetable_verified', 'Weekly timetable verified');
const academicRequirements = g('academic_requirements_recorded', 'Academic requirements recorded');
const previousMarks = g('previous_marks', 'Previous marks collected or marked unavailable');
const examination = g('examination_details', 'Examination details recorded or marked pending');
const parentExpectations = g('parent_expectations', 'Parent expectations and concerns documented');
const a = (key: string, label: string): ChecklistItemDefinition => ({ key, label, mandatory: false });

/**
 * Mandatory completion requirements per stage, taken from the approved Mentoring specification.
 * In WP3 these are Mentor-attested checklist items; the dedicated stage modules (parent meeting,
 * timetable engine, group setup, learning plan, class readiness, first class) will add automatic
 * evidence on top of the same items in WP4-WP7.
 */
export const CHECKLIST: Record<number, readonly ChecklistItemDefinition[]> = {
  // Stage 1 keeps the approved requirements as groups; each is split into the items a Mentor actually ticks off.
  // Every item is mandatory and can be resolved by completing it, marking it unavailable / not applicable with a
  // reason, or a Mentoring Head exception.
  1: [
    studentParent('student_details_checked', 'Student details checked'),
    studentParent('parent_details_checked', 'Parent / guardian details checked'),
    studentParent('contact_details_verified', 'Contact details verified'),
    studentParent('parent_relationship_recorded', 'Parent relationship recorded'),
    studentParent('missing_info_identified', 'Missing information identified and addressed or documented'),
    tutorSubject('tutor_assignment_confirmed', 'Tutor assignment confirmed'),
    tutorSubject('subject_requirements_confirmed', 'Subject requirements confirmed'),
    tutorSubject('curriculum_grade_confirmed', 'Curriculum and grade confirmed'),
    tutorSubject('academic_expectations_reviewed', 'Academic expectations reviewed'),
    weeklyTimetable('preferred_days_collected', 'Preferred days collected'),
    weeklyTimetable('preferred_time_slots_collected', 'Preferred time slots collected'),
    weeklyTimetable('tutor_availability_checked', 'Tutor availability checked'),
    weeklyTimetable('timetable_confirmed', 'Timetable confirmed'),
    academicRequirements('learning_requirements_reviewed', 'Learning requirements reviewed'),
    academicRequirements('subject_academic_needs_recorded', 'Subject-wise academic needs recorded'),
    academicRequirements('learning_concerns_documented', 'Learning difficulties or concerns documented'),
    academicRequirements('curriculum_syllabus_reviewed', 'Curriculum and syllabus requirements reviewed'),
    previousMarks('previous_marks_requested', 'Previous marks requested'),
    previousMarks('previous_marks_collected', 'Marks collected, or marked unavailable with a reason'),
    examination('exam_dates_collected', 'Upcoming examination dates collected'),
    examination('exam_syllabus_collected', 'Syllabus / portions collected'),
    examination('exam_preparation_recorded', 'Examination preparation requirements recorded'),
    parentExpectations('parent_expectations_recorded', 'Parent expectations recorded'),
    parentExpectations('parent_concerns_recorded', 'Parent concerns recorded'),
    parentExpectations('student_engagement_recorded', 'Student engagement information recorded'),
    parentExpectations('follow_up_identified', 'Follow-up requirements identified'),
  ],
  2: [
    m('additional_info_collected', 'Additional student information collected'),
    m('methodology_explained', 'Teaching methodology explained and recorded'),
    m('meet_and_timetable_instructions', 'Google Meet and timetable instructions communicated'),
    m('admission_info_updated', 'Missing admission information updated'),
    m('meeting_notes_followups', 'Meeting notes and follow-up actions recorded'),
    m('parent_acknowledgement', 'Parent acknowledgement recorded (or authorised exception)'),
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
