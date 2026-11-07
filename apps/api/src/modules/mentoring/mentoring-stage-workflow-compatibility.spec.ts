/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-member-access */
import { readFileSync } from 'fs';
import { join } from 'path';

import { ConflictException } from '@nestjs/common';

import { MentoringAccessService } from './mentoring-access.service';
import { MentoringHistoryService } from './mentoring-history.service';
import { MentoringWorkflowService } from './mentoring-workflow.service';
import { LEGACY_STAGE1_ITEMS, getChecklistDefinition } from './mentoring.constants';
import { clone, FakeDb } from './testing/mentoring-fake-db';

/**
 * Students who are already in Stage 1 or Stage 2 when the redesigned workflow arrives. Two earlier shapes exist:
 *   - version 1, the deployed code: Stage 1 has 8 requirement rows (7 groups plus missing_info_identified);
 *   - version 2, the local commit 45ce6f7: Stage 1 has 26 item rows.
 * Neither needs a data change. The tests below read and operate on rows in those shapes with the new code and prove
 * that nothing is reset, hidden or rewritten.
 */
const PERMS: Record<string, string[]> = {
  'mentor-1': ['mentoring.student.read-assigned', 'mentoring.stage.work', 'mentoring.stage.verify', 'mentoring.workflow.pause'],
  'head-1': ['mentoring.student.read-all', 'mentoring.exception.authorize', 'mentoring.workflow.pause'],
};

const V1_KEYS = [
  'student_parent_verified', 'tutor_subject_confirmed', 'weekly_timetable_verified', 'academic_requirements_recorded',
  'previous_marks', 'examination_details', 'parent_expectations', 'missing_info_identified',
];
const V2_KEYS = [
  'student_details_checked', 'parent_details_checked', 'contact_details_verified', 'parent_relationship_recorded', 'missing_info_identified',
  'tutor_assignment_confirmed', 'subject_requirements_confirmed', 'curriculum_grade_confirmed', 'academic_expectations_reviewed',
  'preferred_days_collected', 'preferred_time_slots_collected', 'tutor_availability_checked', 'timetable_confirmed',
  'learning_requirements_reviewed', 'subject_academic_needs_recorded', 'learning_concerns_documented', 'curriculum_syllabus_reviewed',
  'previous_marks_requested', 'previous_marks_collected', 'exam_dates_collected', 'exam_syllabus_collected', 'exam_preparation_recorded',
  'parent_expectations_recorded', 'parent_concerns_recorded', 'student_engagement_recorded', 'follow_up_identified',
];
const STAGE2_OLD_KEYS = ['additional_info_collected', 'methodology_explained', 'meet_and_timetable_instructions', 'admission_info_updated', 'meeting_notes_followups', 'parent_acknowledgement'];

type Status = 'NOT_STARTED' | 'IN_PROGRESS' | 'PENDING_REVIEW' | 'COMPLETED' | 'ON_HOLD' | 'BLOCKED';
type RowSpec = { state?: string; note?: string | null; reason?: string | null; evidenceRef?: string | null; value?: unknown };

function build(config: {
  stage1: Status;
  stage2?: Status;
  stage3?: Status;
  activationStatus?: string;
  stage1Rows?: Record<string, RowSpec>;
  stage2Rows?: Record<string, RowSpec>;
  version?: 1 | 2;
  exceptions?: Array<{ stage: 1 | 2; key: string; reason: string }>;
}) {
  const db = new FakeDb();
  db.seed('student', { id: 'stu-1', businessId: 'STU-0001', firstName: 'Asha', lastName: 'K', currentGrade: '8', grade: { name: 'Grade 8' }, curriculum: { name: 'CBSE' } });
  db.seed('lead', { id: 'lead-1', businessId: 'LED-0001', firstName: 'Parent', lastName: 'One', primaryPhone: '+971500000000', altPhone1: null, altPhone2: null, whatsappNumber: null });
  db.seed('enrollmentHandover', {
    id: 'ho-1', status: 'COMPLETED', completedAt: new Date('2026-10-30T08:00:00Z'),
    transferredFields: [{ field: 'student.firstName', source: 'STUDENT', value: 'Asha' }, { field: 'parent.primaryPhone', source: 'LEAD', value: '+971500000000' }],
    missingFields: [{ field: 'parent.relationship', reason: 'NOT_COLLECTED_IN_SALES' }],
    sourceSnapshot: { capturedAt: '2026-10-30T08:00:00.000Z', lead: { primaryPhone: '+971500000000' }, student: { firstName: 'Asha' } },
  });
  for (const id of ['mentor-1', 'head-1']) db.seed('user', { id, status: 'ACTIVE' });
  db.seed('employee', { userId: 'mentor-1', firstName: 'Mina', lastName: 'Mentor' });
  db.seed('employee', { userId: 'head-1', firstName: 'Hari', lastName: 'Head' });
  db.seed('userRole', { userId: 'head-1', role: { code: 'MENTORING_HEAD' }, user: { status: 'ACTIVE' } });
  const current = config.stage3 ? 3 : config.stage2 && config.stage2 !== 'NOT_STARTED' ? 2 : 1;
  db.seed('mentoringActivation', {
    id: 'act-1', leadId: 'lead-1', studentId: 'stu-1', handoverId: 'ho-1', status: config.activationStatus ?? 'ACTIVATION_IN_PROGRESS',
    currentStage: current, currentMentorUserId: 'mentor-1', submittedForApprovalAt: null, activatedAt: null,
  });
  const statuses: Status[] = [config.stage1, config.stage2 ?? 'NOT_STARTED', config.stage3 ?? 'NOT_STARTED', 'NOT_STARTED', 'NOT_STARTED', 'NOT_STARTED', 'NOT_STARTED'];
  const stages = statuses.map((status, i) => db.seed('mentoringStage', { activationId: 'act-1', stageNumber: i + 1, key: `S${i + 1}`, status, startedAt: status === 'NOT_STARTED' ? null : new Date('2026-10-31T08:00:00Z') }));

  const version = config.version ?? 1;
  const keys = version === 1 ? V1_KEYS : V2_KEYS;
  for (const [key, spec] of Object.entries(config.stage1Rows ?? Object.fromEntries(keys.map((k) => [k, {}])))) {
    db.seed('stageChecklistResponse', { stageId: stages[0].id, itemKey: key, mandatory: true, definitionVersion: version, state: 'PENDING_COLLECTION', value: null, note: null, reason: null, evidenceRef: null, updatedByUserId: 'mentor-1', ...spec });
  }
  for (const [key, spec] of Object.entries(config.stage2Rows ?? {})) {
    db.seed('stageChecklistResponse', { stageId: stages[1].id, itemKey: key, mandatory: true, definitionVersion: version, state: 'PENDING_COLLECTION', value: null, note: null, reason: null, evidenceRef: null, updatedByUserId: 'mentor-1', ...spec });
  }
  for (const e of config.exceptions ?? []) db.seed('workflowException', { stageId: stages[e.stage - 1].id, itemKey: e.key, reason: e.reason, authorizedByUserId: 'head-1' });

  const history = new MentoringHistoryService({ recordInTx: jest.fn().mockResolvedValue(undefined) } as any);
  const rbac = { getPermissionsForUser: jest.fn((id: string) => Promise.resolve(new Set(PERMS[id] ?? []))) };
  const access = new MentoringAccessService(rbac as any);
  const workflow = new MentoringWorkflowService(db as any, access, history);
  return { db, workflow, scope: (id: string) => access.scopeFor(id), stage: (n: number) => db.rows('mentoringStage').find((s) => s.stageNumber === n)! };
}

const verifiedRows = (keys: string[], extra: Record<string, RowSpec> = {}) => Object.fromEntries(keys.map((k) => [k, { state: 'VERIFIED', ...(extra[k] ?? {}) }]));
const sales = (db: FakeDb) => clone({ handover: db.rows('enrollmentHandover')[0], lead: db.rows('lead')[0], student: db.rows('student')[0] });
const checklistRows = (db: FakeDb) => clone(db.rows('stageChecklistResponse'));
const stagesOf = (db: FakeDb) => clone(db.rows('mentoringStage').map((s) => ({ n: s.stageNumber, status: s.status, startedAt: s.startedAt, completedAt: s.completedAt })));

describe('Deployed (version 1) Stage 1 data meets the redesigned workflow', () => {
  it('a completed Stage 1 stays completed and its detailed results stay visible, read-only, with comments and evidence', async () => {
    const w = build({
      stage1: 'COMPLETED',
      stage2: 'IN_PROGRESS',
      stage1Rows: verifiedRows(V1_KEYS, { student_parent_verified: { note: 'Checked the admission form', evidenceRef: 'ev-1' }, previous_marks: { state: 'UNAVAILABLE', reason: 'School closed' } }),
    });
    const before = { rows: checklistRows(w.db), stages: stagesOf(w.db), sales: sales(w.db) };

    const view = await w.workflow.getWorkspace('act-1', await w.scope('mentor-1'));

    expect(view.stages[0].status).toBe('COMPLETED');
    expect(view.activation.currentStage).toBe(2);
    expect(view.stages[0].checklist).toHaveLength(1);
    expect(view.stages[0].checklist[0]).toMatchObject({ key: 'missing_info_identified', state: 'VERIFIED' });
    const legacy = view.legacyStage1Items;
    expect(legacy).toHaveLength(7); // the seven original requirements; the review item is current, not legacy
    expect(legacy.find((i: any) => i.key === 'student_parent_verified')).toMatchObject({ state: 'VERIFIED', note: 'Checked the admission form', evidenceRef: 'ev-1', updatedByName: 'Mina Mentor' });
    expect(legacy.find((i: any) => i.key === 'previous_marks')).toMatchObject({ state: 'UNAVAILABLE', reason: 'School closed' });
    expect({ rows: checklistRows(w.db), stages: stagesOf(w.db), sales: sales(w.db) }).toEqual(before); // reading rewrote nothing
  });

  it('a Stage 1 that was ready for review can still be completed with no data change', async () => {
    const w = build({ stage1: 'PENDING_REVIEW', stage1Rows: verifiedRows(V1_KEYS) });
    const rowsBefore = checklistRows(w.db);
    await expect(w.workflow.verifyStage('act-1', 1, 'mentor-1')).resolves.toMatchObject({ stageNumber: 1 });
    expect(w.stage(1).status).toBe('COMPLETED');
    expect(checklistRows(w.db)).toEqual(rowsBefore.map((r: any) => r)); // the old rows are exactly as they were
  });

  it('a Stage 1 that is not ready still needs the review item, whatever else was ticked', async () => {
    const w = build({ stage1: 'IN_PROGRESS', stage1Rows: verifiedRows(V1_KEYS.filter((k) => k !== 'missing_info_identified')) });
    await expect(w.workflow.verifyStage('act-1', 1, 'mentor-1')).rejects.toMatchObject({ response: { unresolved: ['missing_info_identified'] } });
    await w.workflow.updateChecklistItem('act-1', 1, 'missing_info_identified', { state: 'VERIFIED' }, 'mentor-1');
    await expect(w.workflow.verifyStage('act-1', 1, 'mentor-1')).resolves.toBeDefined();
  });

  it('a Stage 1 that was never opened gets its single review row from the application', async () => {
    const w = build({ stage1: 'IN_PROGRESS', stage1Rows: {} });
    expect(w.db.rows('stageChecklistResponse')).toHaveLength(0);
    await w.workflow.updateChecklistItem('act-1', 1, 'missing_info_identified', { state: 'VERIFIED' }, 'mentor-1');
    expect(w.db.rows('stageChecklistResponse')).toHaveLength(1);
    expect(w.db.rows('stageChecklistResponse')[0]).toMatchObject({ itemKey: 'missing_info_identified', definitionVersion: 3 });
  });

  it('the review item resolved by an unavailable reason or by a Head exception is honoured', async () => {
    const reasoned = build({ stage1: 'IN_PROGRESS', stage1Rows: { missing_info_identified: { state: 'UNAVAILABLE', reason: 'Sales record is empty' } } });
    await expect(reasoned.workflow.verifyStage('act-1', 1, 'mentor-1')).resolves.toBeDefined();

    const excepted = build({ stage1: 'IN_PROGRESS', stage1Rows: { missing_info_identified: {} }, exceptions: [{ stage: 1, key: 'missing_info_identified', reason: 'Head approved' }] });
    await expect(excepted.workflow.verifyStage('act-1', 1, 'mentor-1')).resolves.toBeDefined();
  });

  it('a workflow paused from review resumes in review and can still be completed', async () => {
    const w = build({ stage1: 'PENDING_REVIEW', stage1Rows: verifiedRows(V1_KEYS) });
    await w.workflow.pause('act-1', { reason: 'Parent travelling', pendingAction: 'Wait', responsibleUserId: 'head-1', followUpAt: new Date('2026-11-30T00:00:00Z') }, await w.scope('mentor-1'));
    expect(w.stage(1).status).toBe('ON_HOLD');
    await w.workflow.resume('act-1', undefined, await w.scope('mentor-1'));
    expect(w.stage(1).status).toBe('PENDING_REVIEW');
    await expect(w.workflow.verifyStage('act-1', 1, 'mentor-1')).resolves.toBeDefined();
  });

  it('an exception the Head authorised on an old requirement is listed with its reason, even if the Mentor never opened it', async () => {
    const w = build({ stage1: 'IN_PROGRESS', stage1Rows: {}, exceptions: [{ stage: 1, key: 'weekly_timetable_verified', reason: 'Timetable comes later' }] });
    const view = await w.workflow.getWorkspace('act-1', await w.scope('mentor-1'));
    expect(view.legacyStage1Items).toEqual([expect.objectContaining({ key: 'weekly_timetable_verified', exceptionReason: 'Timetable comes later', updatedByName: 'Hari Head' })]);
  });
});

describe('Local (version 2) Stage 1 data meets the redesigned workflow', () => {
  it('26 item rows: the review item counts, the other 25 are kept and listed read-only with their comments and evidence', async () => {
    const w = build({
      stage1: 'IN_PROGRESS', version: 2,
      stage1Rows: verifiedRows(V2_KEYS, { student_details_checked: { note: 'Checked', evidenceRef: 'https://files.example/a' }, contact_details_verified: { state: 'COLLECTED', value: { phone: 'confirmed' } } }),
    });
    const rowsBefore = checklistRows(w.db);
    const view = await w.workflow.getWorkspace('act-1', await w.scope('mentor-1'));
    expect(view.stages[0].checklist.map((i: any) => i.key)).toEqual(['missing_info_identified']);
    expect(view.legacyStage1Items).toHaveLength(25);
    expect(view.legacyStage1Items.find((i: any) => i.key === 'student_details_checked')).toMatchObject({ note: 'Checked', evidenceRef: 'https://files.example/a' });
    expect(view.legacyStage1Items.find((i: any) => i.key === 'contact_details_verified')).toMatchObject({ state: 'COLLECTED', value: { phone: 'confirmed' } });
    expect(checklistRows(w.db)).toEqual(rowsBefore);
    await expect(w.workflow.verifyStage('act-1', 1, 'mentor-1')).resolves.toBeDefined();
  });

  it('every earlier Stage 1 item is either the current review item or a known earlier item with a plain-language label', () => {
    const known = new Set([...Object.keys(LEGACY_STAGE1_ITEMS), ...getChecklistDefinition(1).map((d) => d.key)]);
    for (const key of [...V1_KEYS, ...V2_KEYS]) expect(known.has(key)).toBe(true);
    for (const { label, group } of Object.values(LEGACY_STAGE1_ITEMS)) {
      expect(label.length).toBeGreaterThan(3);
      expect(group.length).toBeGreaterThan(3);
    }
  });

  it('information a Mentor saved under the earlier commit is still shown, and was never verified by the new code', async () => {
    const w = build({ stage1: 'COMPLETED', stage2: 'IN_PROGRESS', stage1Rows: verifiedRows(V1_KEYS) });
    w.db.seed('enrollmentHandoverField', { handoverId: 'ho-1', fieldKey: 'parent.relationship', value: 'Mother', origin: 'MENTOR_COLLECTED', salesValue: null, updatedByUserId: 'mentor-1' });
    const view: any = (await w.workflow.getWorkspace('act-1', await w.scope('mentor-1'))).handover;
    expect(view.fieldValues).toEqual([expect.objectContaining({ fieldKey: 'parent.relationship', value: 'Mother', origin: 'MENTOR_COLLECTED', collectedByName: 'Mina Mentor' })]);
    expect(view.fieldVerifications).toEqual([]);
  });
});

describe('Students already in Stage 2 or later', () => {
  it('in-flight Stage 2 results keep their keys and count; the new meeting requirements start as pending', async () => {
    const w = build({
      stage1: 'COMPLETED', stage2: 'IN_PROGRESS', stage1Rows: verifiedRows(V1_KEYS),
      stage2Rows: verifiedRows(STAGE2_OLD_KEYS.slice(0, 4), { methodology_explained: { note: 'Explained the online method' } }),
    });
    const view = await w.workflow.getWorkspace('act-1', await w.scope('mentor-1'));
    const items = view.stages[1].checklist;
    expect(items).toHaveLength(16);
    expect(items.filter((i: any) => i.state === 'VERIFIED').map((i: any) => i.key)).toEqual(STAGE2_OLD_KEYS.slice(0, 4));
    expect(items.find((i: any) => i.key === 'methodology_explained')).toMatchObject({ note: 'Explained the online method' });
    expect(items.filter((i: any) => i.state === 'PENDING_COLLECTION')).toHaveLength(12);
    expect(w.stage(2).status).toBe('IN_PROGRESS');
  });

  it('a Stage 2 that was ready for review under the old six requirements is not changed by reading, but needs the new requirements to complete', async () => {
    const w = build({ stage1: 'COMPLETED', stage2: 'PENDING_REVIEW', stage2Rows: verifiedRows(STAGE2_OLD_KEYS) });
    await w.workflow.getWorkspace('act-1', await w.scope('mentor-1'));
    expect(w.stage(2).status).toBe('PENDING_REVIEW'); // stored status untouched until someone changes the checklist

    const missing = getChecklistDefinition(2).filter((d) => !STAGE2_OLD_KEYS.includes(d.key)).map((d) => d.key);
    await expect(w.workflow.verifyStage('act-1', 2, 'mentor-1')).rejects.toMatchObject({ response: { unresolved: missing } });
    expect(w.stage(2).status).toBe('PENDING_REVIEW');
  });

  it('a completed Stage 2 and a Stage 3 in progress are untouched', async () => {
    const w = build({ stage1: 'COMPLETED', stage2: 'COMPLETED', stage3: 'IN_PROGRESS', stage2Rows: verifiedRows(STAGE2_OLD_KEYS) });
    const before = { stages: stagesOf(w.db), rows: checklistRows(w.db), sales: sales(w.db) };
    const view = await w.workflow.getWorkspace('act-1', await w.scope('mentor-1'));
    expect(view.stages.map((s: any) => s.status).slice(0, 3)).toEqual(['COMPLETED', 'COMPLETED', 'IN_PROGRESS']);
    expect(view.activation.currentStage).toBe(3);
    expect({ stages: stagesOf(w.db), rows: checklistRows(w.db), sales: sales(w.db) }).toEqual(before);
    // Stage 3 work is not blocked by the new Stage 2 definition.
    await expect(w.workflow.updateChecklistItem('act-1', 3, getChecklistDefinition(3)[0].key, { state: 'VERIFIED' }, 'mentor-1')).resolves.toBeDefined();
  });

  it('Stage 2 cannot be started before Stage 1 is completed', async () => {
    const w = build({ stage1: 'IN_PROGRESS', stage1Rows: verifiedRows(V1_KEYS) });
    await expect(w.workflow.startStage('act-1', 2, 'mentor-1')).rejects.toBeInstanceOf(ConflictException);
  });
});

describe('The Sales handover is never changed by the new workflow', () => {
  it('collecting, correcting, verifying, completing Stage 1 and completing Stage 2 leave every Sales record byte for byte the same', async () => {
    const w = build({ stage1: 'IN_PROGRESS', stage1Rows: verifiedRows(V1_KEYS) });
    const before = sales(w.db);

    await w.workflow.verifyStage('act-1', 1, 'mentor-1');
    await w.workflow.startStage('act-1', 2, 'mentor-1');
    await w.workflow.updateHandoverField('act-1', 'parent.relationship', 'Mother', 'mentor-1');
    await w.workflow.updateHandoverField('act-1', 'parent.primaryPhone', '9876543210', 'mentor-1');
    await w.workflow.setHandoverFieldVerification('act-1', 'student.firstName', { verified: true }, 'mentor-1');
    for (const d of getChecklistDefinition(2)) {
      await w.workflow.updateChecklistItem('act-1', 2, d.key, d.fields ? { state: 'UNAVAILABLE', reason: 'Not provided' } : { state: 'VERIFIED' }, 'mentor-1');
    }
    await w.workflow.verifyStage('act-1', 2, 'mentor-1');

    expect(w.stage(2).status).toBe('COMPLETED');
    expect(sales(w.db)).toEqual(before);
    // The correction sits beside the original, which is also kept inside the Mentoring row.
    expect(w.db.rows('enrollmentHandoverField').find((f) => f.fieldKey === 'parent.primaryPhone')).toMatchObject({ value: '9876543210', salesValue: '+971500000000' });
  });
});

describe('The additive migration', () => {
  const sql = readFileSync(join(__dirname, '../../../prisma/migrations/20261107100000_add_mentoring_field_verification/migration.sql'), 'utf8')
    .split('\n').filter((line) => !line.trim().startsWith('--')).join('\n');

  it('only adds: no drop, delete, update, truncate, rename or type change', () => {
    // "ON DELETE" and "ON UPDATE" inside the foreign key describe the constraint; they are not data changes.
    expect(sql).not.toMatch(/\b(DROP|TRUNCATE|RENAME)\b|\bDELETE\s+FROM\b|\bUPDATE\s+"|ALTER\s+COLUMN/i);
    expect(sql).toMatch(/ADD COLUMN "created_by_user_id" TEXT;/); // nullable, no default, no rewrite
    expect(sql).toMatch(/CREATE TABLE "enrollment_handover_field_verifications"/);
  });

  it('touches only the two Mentoring handover tables', () => {
    const tables = Array.from(sql.matchAll(/(?:ALTER TABLE|CREATE TABLE|ON)\s+"([a-z_]+)"/g)).map((m) => m[1]);
    expect(Array.from(new Set(tables)).sort()).toEqual(['enrollment_handover_field_verifications', 'enrollment_handover_fields']);
  });

  it('the earlier field-value migration is left as it was', () => {
    const earlier = readFileSync(join(__dirname, '../../../prisma/migrations/20261103100000_add_mentoring_handover_field_values/migration.sql'), 'utf8');
    expect(earlier).toContain('CREATE TABLE "enrollment_handover_fields"');
    expect(earlier).not.toContain('created_by_user_id');
  });
});
