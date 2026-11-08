/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-member-access */
import { readFileSync } from 'fs';
import { join } from 'path';

import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';

import { PERMISSIONS_KEY } from '../../common/rbac/require-permissions.decorator';

import { MentoringAccessService } from './mentoring-access.service';
import { HANDOVER_FIELDS, HANDOVER_FIELD_LABELS, getHandoverField, isVerifiableField, validateHandoverFieldValue } from './mentoring-handover-fields';
import { MentoringHistoryService } from './mentoring-history.service';
import { unresolvedMandatoryItems } from './mentoring-stage.helpers';
import { MentoringWorkflowController } from './mentoring-workflow.controller';
import { MentoringWorkflowService } from './mentoring-workflow.service';
import { CHECKLIST, LEGACY_STAGE1_ITEMS, getChecklistDefinition } from './mentoring.constants';
import { clone, FakeDb } from './testing/mentoring-fake-db';

const PERMS: Record<string, string[]> = {
  'mentor-1': ['mentoring.student.read-assigned', 'mentoring.stage.work', 'mentoring.stage.verify', 'mentoring.workflow.pause'],
  'mentor-2': ['mentoring.student.read-assigned', 'mentoring.stage.work', 'mentoring.stage.verify'],
  'head-1': ['mentoring.student.read-all', 'mentoring.exception.authorize', 'mentoring.approval.final'],
  'ceo-1': ['mentoring.student.read-all', 'mentoring.audit.read'],
  'counselor-1': ['mentoring.student.read-assigned', 'mentoring.task.work'],
};

function services(db: FakeDb) {
  const history = new MentoringHistoryService({ recordInTx: jest.fn().mockResolvedValue(undefined) } as any);
  const rbac = { getPermissionsForUser: jest.fn((id: string) => Promise.resolve(new Set(PERMS[id] ?? []))) };
  const access = new MentoringAccessService(rbac as any);
  const workflow = new MentoringWorkflowService(db as any, access, history);
  return { workflow, scope: (id: string) => access.scopeFor(id) };
}

const SALES_PHONE = '+971500000000';

/**
 * `at: 2` (default) is a student whose Admission Handover is complete and whose Meeting with Parents is open, which is
 * where information is collected. `at: 1` is a student still in Stage 1.
 */
function world(over: { status?: string; at?: 1 | 2 } = {}) {
  const at = over.at ?? 2;
  const db = new FakeDb();
  db.seed('student', { id: 'stu-1', businessId: 'STU-0001', firstName: 'Asha', lastName: 'K', currentGrade: '8', grade: { name: 'Grade 8' }, curriculum: { name: 'CBSE' } });
  db.seed('lead', { id: 'lead-1', businessId: 'LED-0001', firstName: 'Parent', lastName: 'One', primaryPhone: SALES_PHONE, altPhone1: null, altPhone2: null, whatsappNumber: null });
  db.seed('enrollmentHandover', {
    id: 'ho-1', status: 'COMPLETED', completedAt: new Date(),
    transferredFields: [
      { field: 'student.firstName', source: 'STUDENT', value: 'Asha' },
      { field: 'student.dateOfBirth', source: 'STUDENT', value: '2015-05-12' },
      { field: 'parent.primaryPhone', source: 'LEAD', value: SALES_PHONE },
    ],
    missingFields: [
      { field: 'parent.relationship', reason: 'NOT_COLLECTED_IN_SALES' },
      { field: 'student.gender', reason: 'NOT_PROVIDED' },
    ],
    sourceSnapshot: { lead: { primaryPhone: SALES_PHONE }, student: { firstName: 'Asha', dateOfBirth: '2015-05-12' } },
  });
  for (const id of Object.keys(PERMS)) db.seed('user', { id, status: 'ACTIVE' });
  db.seed('employee', { userId: 'mentor-1', firstName: 'Mina', lastName: 'Mentor' });
  db.seed('employee', { userId: 'head-1', firstName: 'Hari', lastName: 'Head' });
  db.seed('userRole', { userId: 'head-1', role: { code: 'MENTORING_HEAD' }, user: { status: 'ACTIVE' } });
  db.seed('grade', { id: 'g-8', name: 'Grade 8', sortOrder: 8, isActive: true }); db.seed('grade', { id: 'g-9', name: 'Grade 9', sortOrder: 9, isActive: true });
  db.seed('grade', { id: 'g-old', name: 'Grade 7', sortOrder: 7, isActive: false });
  for (const [id, name] of [['sub-en', 'English'], ['sub-ma', 'Mathematics'], ['sub-sc', 'Science'], ['sub-ss', 'Social Studies']]) db.seed('subject', { id, name, isActive: true });
  db.seed('subject', { id: 'sub-old', name: 'Latin', isActive: false });
  db.seed('curriculum', { name: 'CBSE' }); db.seed('curriculum', { name: 'IGCSE' });
  const activation = db.seed('mentoringActivation', {
    id: 'act-1', leadId: 'lead-1', studentId: 'stu-1', handoverId: 'ho-1',
    status: over.status ?? 'ACTIVATION_IN_PROGRESS', currentStage: at, currentMentorUserId: 'mentor-1', submittedForApprovalAt: null, activatedAt: null,
  });
  for (let i = 1; i <= 7; i++) {
    const status = i < at ? 'COMPLETED' : i === at ? 'IN_PROGRESS' : 'NOT_STARTED';
    db.seed('mentoringStage', { activationId: activation.id, stageNumber: i, key: `S${i}`, status, startedAt: i <= at ? new Date() : null });
  }
  return { db, ...services(db) };
}

const salesDataOf = (db: FakeDb) => clone({ handover: db.rows('enrollmentHandover')[0], lead: db.rows('lead')[0], student: db.rows('student')[0] });
const fieldOf = (db: FakeDb, key: string) => db.rows('enrollmentHandoverField').find((f) => f.fieldKey === key)!;

describe('Editing a collected Sales field', () => {
  it('stores the correction beside the original and leaves every Sales record untouched', async () => {
    const { db, workflow } = world();
    const before = salesDataOf(db);

    await workflow.updateHandoverField('act-1', 'parent.primaryPhone', '+971 50 111 2222', 'mentor-1');

    expect(salesDataOf(db)).toEqual(before);
    expect(fieldOf(db, 'parent.primaryPhone')).toMatchObject({
      value: '+971501112222', salesValue: SALES_PHONE, origin: 'MENTORING_UPDATED', updatedByUserId: 'mentor-1',
    });
  });

  it('shows the Mentoring value as current and still exposes the Sales value, who changed it and when', async () => {
    const { db, workflow, scope } = world();
    await workflow.updateHandoverField('act-1', 'student.dateOfBirth', '2015-06-01', 'mentor-1');

    const view = (await workflow.getWorkspace('act-1', await scope('mentor-1'))).handover;
    expect(view.transferredFields).toEqual(clone(db.rows('enrollmentHandover')[0].transferredFields)); // original Sales list, unchanged
    expect(view.fieldValues).toEqual([
      expect.objectContaining({ fieldKey: 'student.dateOfBirth', value: '2015-06-01', salesValue: '2015-05-12', origin: 'MENTORING_UPDATED', updatedByName: 'Mina Mentor', updatedAt: expect.any(Date) }),
    ]);
  });

  it('keeps the first Sales value and origin when the field is corrected again', async () => {
    const { db, workflow } = world();
    await workflow.updateHandoverField('act-1', 'parent.primaryPhone', '9876543210', 'mentor-1');
    await workflow.updateHandoverField('act-1', 'parent.primaryPhone', '9876543211', 'mentor-1');
    expect(db.rows('enrollmentHandoverField')).toHaveLength(1);
    expect(fieldOf(db, 'parent.primaryPhone')).toMatchObject({ value: '9876543211', salesValue: SALES_PHONE, origin: 'MENTORING_UPDATED' });
  });
});

describe('Adding information Sales did not collect', () => {
  it('records it as collected by the Mentor, with no Sales value', async () => {
    const { db, workflow, scope } = world();
    await workflow.updateHandoverField('act-1', 'parent.relationship', 'mother', 'mentor-1');

    expect(fieldOf(db, 'parent.relationship')).toMatchObject({ value: 'Mother', origin: 'MENTOR_COLLECTED', updatedByUserId: 'mentor-1' });
    expect(fieldOf(db, 'parent.relationship').salesValue ?? null).toBeNull();
    const view = (await workflow.getWorkspace('act-1', await scope('mentor-1'))).handover;
    expect(view.missingFields).toEqual(clone(db.rows('enrollmentHandover')[0].missingFields)); // the Sales view of "missing" is unchanged
    expect(view.fieldValues.map((f: any) => [f.fieldKey, f.value, f.origin])).toEqual([['parent.relationship', 'Mother', 'MENTOR_COLLECTED']]);
  });

  it('structured values are kept as structured data', async () => {
    const { db, workflow } = world();
    await workflow.updateHandoverField('act-1', 'tutor.assignments', [{ subject: 'English', tutor: 'Ravi' }], 'mentor-1');
    expect(fieldOf(db, 'tutor.assignments').value).toEqual([{ subject: 'English', tutor: 'Ravi' }]);
  });
});

describe('Persistence and history', () => {
  it('values survive a reload: a brand-new service instance reads the same data', async () => {
    const { db, workflow } = world();
    await workflow.updateHandoverField('act-1', 'student.gender', 'female', 'mentor-1');
    const fresh = services(db);
    const view = (await fresh.workflow.getWorkspace('act-1', await fresh.scope('head-1'))).handover;
    expect(view.fieldValues).toEqual([expect.objectContaining({ fieldKey: 'student.gender', value: 'Female', updatedByName: 'Mina Mentor' })]);
  });

  it('every change is added to the history with who, the previous value and the new value', async () => {
    const { db, workflow } = world();
    await workflow.updateHandoverField('act-1', 'student.dateOfBirth', '2015-06-01', 'mentor-1');
    await workflow.updateHandoverField('act-1', 'student.dateOfBirth', '2015-06-02', 'mentor-1');
    const events = db.rows('mentoringEvent').filter((e) => e.type === 'HANDOVER_FIELD_UPDATED');
    expect(events).toHaveLength(2);
    expect(events[0]).toMatchObject({ actorUserId: 'mentor-1', payload: { fieldKey: 'student.dateOfBirth', previous: '2015-05-12', next: '2015-06-01', salesValue: '2015-05-12', origin: 'MENTORING_UPDATED' } });
    expect(events[1].payload).toMatchObject({ previous: '2015-06-01', next: '2015-06-02' });
  });

  it('saving the same value again changes nothing and adds no history', async () => {
    const { db, workflow } = world();
    await workflow.updateHandoverField('act-1', 'student.dateOfBirth', '2015-06-01', 'mentor-1');
    const again = await workflow.updateHandoverField('act-1', 'student.dateOfBirth', '2015-06-01', 'mentor-1');
    expect(again).toMatchObject({ changed: false });
    expect(db.rows('mentoringEvent').filter((e) => e.type === 'HANDOVER_FIELD_UPDATED')).toHaveLength(1);
  });

  it('counts: a field moves from "still required" to "collected" only after a valid save', async () => {
    const { workflow, scope } = world();
    const read = async () => (await workflow.getWorkspace('act-1', await scope('mentor-1'))).handover;
    expect((await read()).fieldValues).toHaveLength(0);
    await expect(workflow.updateHandoverField('act-1', 'student.gender', 'robot', 'mentor-1')).rejects.toBeInstanceOf(BadRequestException);
    expect((await read()).fieldValues).toHaveLength(0);
    await workflow.updateHandoverField('act-1', 'student.gender', 'Male', 'mentor-1');
    expect((await read()).fieldValues).toHaveLength(1);
  });
});

describe('Who can edit', () => {
  const edit = (w: ReturnType<typeof world>, user: string) => w.workflow.updateHandoverField('act-1', 'student.notes', 'Needs extra help', user);

  it('only the assigned Mentor', async () => {
    const w = world();
    await expect(edit(w, 'mentor-2')).rejects.toBeInstanceOf(ForbiddenException);
    await expect(edit(w, 'head-1')).rejects.toBeInstanceOf(ForbiddenException);
    await expect(edit(w, 'counselor-1')).rejects.toBeInstanceOf(ForbiddenException);
    await expect(edit(w, 'ceo-1')).rejects.toBeInstanceOf(ForbiddenException);
    expect(w.db.rows('enrollmentHandoverField')).toHaveLength(0);
    await expect(edit(w, 'mentor-1')).resolves.toMatchObject({ changed: true });
  });

  it.each(['ACTIVATION_ON_HOLD', 'ACTIVATION_BLOCKED', 'PENDING_FINAL_APPROVAL', 'ACTIVATED', 'CANCELLED'])('not while the workflow is %s', async (status) => {
    const w = world({ status });
    await expect(edit(w, 'mentor-1')).rejects.toBeInstanceOf(ConflictException);
    expect(w.db.rows('enrollmentHandoverField')).toHaveLength(0);
  });

  it('refuses a field that cannot be edited here, including the Sales subject requirements', async () => {
    const w = world();
    for (const key of ['academic.subjects', 'student.businessId', '__proto__', 'constructor', 'unknown.field']) {
      await expect(w.workflow.updateHandoverField('act-1', key, 'x', 'mentor-1')).rejects.toBeInstanceOf(BadRequestException);
    }
  });

  it('a Counselor never sees parent contact corrections', async () => {
    const w = world();
    await w.workflow.updateHandoverField('act-1', 'parent.primaryPhone', '9876543210', 'mentor-1');
    await w.workflow.updateHandoverField('act-1', 'student.notes', 'Needs help', 'mentor-1');
    w.db.seed('mentoringTask', { id: 't1', activationId: 'act-1', stageId: null, title: 'x', assigneeUserId: 'counselor-1', status: 'OPEN' });
    const view = (await w.workflow.getWorkspace('act-1', await w.scope('counselor-1'))).handover;
    expect(view.fieldValues.map((f: any) => f.fieldKey)).toEqual(['student.notes']);
  });

  it('the page is told only the assigned Mentor, while the workflow is in progress, can edit', async () => {
    const w = world();
    expect((await w.workflow.getWorkspace('act-1', await w.scope('mentor-1'))).viewer.canEditHandover).toBe(true);
    expect((await w.workflow.getWorkspace('act-1', await w.scope('head-1'))).viewer.canEditHandover).toBe(false);
    expect((await w.workflow.getWorkspace('act-1', await w.scope('ceo-1'))).viewer.canEditHandover).toBe(false);
    const onHold = world({ status: 'ACTIVATION_ON_HOLD' });
    expect((await onHold.workflow.getWorkspace('act-1', await onHold.scope('mentor-1'))).viewer.canEditHandover).toBe(false);
  });
});

describe('Validation per input type', () => {
  const ctx = { today: new Date('2026-11-03T00:00:00Z'), referenceOptions: { GRADES: ['Grade 8', 'Grade 9'], CURRICULA: ['CBSE', 'IGCSE'] } };
  const check = (key: string, value: unknown) => () => validateHandoverFieldValue(getHandoverField(key)!, value, ctx);

  it.each([
    ['student.firstName', '  Asha  ', 'Asha'],
    ['parent.primaryPhone', '+91 98765-43210', '+919876543210'],
    ['parent.whatsappNumber', '(971) 50 123 4567', '971501234567'],
    ['student.dateOfBirth', '2015-05-12', '2015-05-12'],
    ['student.gender', 'male', 'Male'],
    ['parent.relationship', 'GUARDIAN', 'Guardian'],
    ['academic.preferredLanguage', 'tamil', 'Tamil'],
    ['student.grade', 'grade 9', 'Grade 9'],
    ['student.curriculum', 'igcse', 'IGCSE'],
    ['student.notes', 'Line one\nLine two', 'Line one\nLine two'],
  ])('%s accepts and normalises %p', (key, input, expected) => {
    expect(check(key, input)()).toBe(expected);
  });

  it.each([
    ['student.firstName', ''], ['student.firstName', '   '], ['student.firstName', 'x'.repeat(101)], ['student.firstName', 42], ['student.firstName', null], ['student.firstName', 'Line\nbreak'],
    ['parent.primaryPhone', '12345'], ['parent.primaryPhone', 'call me'], ['parent.primaryPhone', '+1234567890123456'], ['parent.primaryPhone', 9876543210],
    ['student.dateOfBirth', '12/05/2015'], ['student.dateOfBirth', '2015-02-30'], ['student.dateOfBirth', '2030-01-01'], ['student.dateOfBirth', '1980-01-01'],
    ['student.gender', 'robot'], ['student.gender', ''], ['student.grade', 'Grade 99'], ['student.curriculum', 'Unknown board'],
    ['student.notes', 'x'.repeat(2001)], ['student.notes', ''], ['student.notes', 'bell\u0007'],
    ['timetable.schedule', []], ['timetable.schedule', 'Mondays'], ['timetable.schedule', [{ day: 'Funday', start: '16:00', end: '17:00' }]],
    ['timetable.schedule', [{ day: 'Monday', start: '25:00', end: '26:00' }]], ['timetable.schedule', [{ day: 'Monday', start: '17:00', end: '16:00' }]],
    ['timetable.schedule', [{ day: 'Monday', start: '16:00' }]], ['timetable.schedule', [{ day: 'Monday', start: '16:00', end: '17:00', extra: 'x' }]],
    ['examination.upcomingDates', [{ subject: 'Maths', date: '2026-13-40' }]], ['examination.upcomingDates', [{ subject: '', date: '2026-12-01' }]],
    ['examination.syllabusPortions', [{ subject: 'Maths' }]], ['tutor.assignments', [{ subject: 'Maths', tutor: '' }]],
  ])('%s rejects %p', (key, input) => {
    expect(check(key, input)).toThrow(BadRequestException);
  });

  it('structured fields accept well-formed rows and cap the number of rows', () => {
    expect(check('examination.upcomingDates', [{ subject: ' Maths term test ', date: '2026-12-01' }])()).toEqual([{ subject: 'Maths term test', date: '2026-12-01' }]);
    expect(check('tutor.assignments', [{ subject: 'Maths', tutor: 'Ravi' }])()).toEqual([{ subject: 'Maths', tutor: 'Ravi' }]);
    expect(check('examination.syllabusPortions', Array.from({ length: 21 }, () => ({ subject: 'M', portions: 'P' })))).toThrow(BadRequestException);
  });

  it('the registry has a definition for every field the page offers and none for Sales-locked data', () => {
    expect(Object.keys(HANDOVER_FIELDS)).toHaveLength(27);
    expect(Object.keys(HANDOVER_FIELDS).sort()).toEqual(Object.keys(HANDOVER_FIELD_LABELS).filter((k) => k !== 'academic.subjects').sort());
    expect(getHandoverField('academic.subjects')).toBeUndefined();
    expect(getHandoverField('hasOwnProperty')).toBeUndefined();
  });

  it('reference-data selects refuse values that are not in the reference list', () => {
    expect(check('student.grade', 'Grade 8')()).toBe('Grade 8');
    expect(() => validateHandoverFieldValue(getHandoverField('student.grade')!, 'Grade 8', { today: new Date() })).toThrow(/no options/i);
  });
});

describe('Stage 1 and Stage 2 checklist definitions', () => {
  it('Stage 1 is a single handover review requirement and keeps the key students may already have resolved', () => {
    const stage1 = getChecklistDefinition(1);
    expect(stage1.map((d) => d.key)).toEqual(['missing_info_identified']);
    expect(stage1[0].mandatory).toBe(true);
    expect(stage1[0].fields).toBeUndefined(); // reviewing the handover does not depend on collecting anything
  });

  it('Stage 1 no longer holds any of the detailed meeting items', () => {
    const stage1Keys = new Set(getChecklistDefinition(1).map((d) => d.key));
    for (const key of Object.keys(LEGACY_STAGE1_ITEMS)) expect(stage1Keys.has(key)).toBe(false);
    expect(getChecklistDefinition(1).some((d) => d.group)).toBe(false);
  });

  it('Stage 2 holds the ten meeting verification requirements plus the six approved meeting requirements, each once', () => {
    const stage2 = getChecklistDefinition(2);
    expect(stage2).toHaveLength(16);
    expect(stage2.every((d) => d.mandatory)).toBe(true);
    expect(new Set(stage2.map((d) => d.key)).size).toBe(16);
    expect(stage2.filter((d) => d.group === 'confirm_information').map((d) => d.label)).toEqual([
      'Student and parent details verified',
      'Parent relationship confirmed',
      'Contact information verified',
      'Preferred language collected',
      'Tutor and subject requirements confirmed',
      'Academic requirements recorded',
      'Previous marks collected, or marked unavailable with a reason',
      'Examination details recorded, or marked pending or unavailable with a reason',
      'Parent expectations and concerns documented',
      'Student engagement and learning concerns discussed',
    ]);
    // The six approved Stage 2 requirements keep their keys, so rows saved earlier still count.
    expect(stage2.filter((d) => d.group === 'meeting_conduct').map((d) => d.key)).toEqual([
      'additional_info_collected', 'methodology_explained', 'meet_and_timetable_instructions', 'admission_info_updated', 'meeting_notes_followups', 'parent_acknowledgement',
    ]);
  });

  it('every field an item depends on is a field the page can show, and is editable unless it is the read-only Sales subjects', () => {
    for (const def of getChecklistDefinition(2)) {
      for (const key of def.fields ?? []) {
        expect(HANDOVER_FIELD_LABELS[key]).toBeDefined();
        expect(key === 'academic.subjects' || getHandoverField(key)).toBeTruthy();
      }
    }
  });

  it('the other five stages are unchanged and ungrouped', () => {
    for (const n of [3, 4, 5, 6, 7]) expect(getChecklistDefinition(n).every((d) => !d.group && !d.fields)).toBe(true);
    expect(Object.keys(CHECKLIST)).toEqual(['1', '2', '3', '4', '5', '6', '7']);
  });
});

describe('Information is collected in Stage 2, not Stage 1', () => {
  it('nothing can be saved or verified while the Meeting with Parents has not started', async () => {
    const w = world({ at: 1 });
    await expect(w.workflow.updateHandoverField('act-1', 'parent.relationship', 'Mother', 'mentor-1')).rejects.toBeInstanceOf(ConflictException);
    await expect(w.workflow.setHandoverFieldVerification('act-1', 'parent.primaryPhone', { verified: true }, 'mentor-1')).rejects.toBeInstanceOf(ConflictException);
    expect(w.db.rows('enrollmentHandoverField')).toHaveLength(0);
    expect(w.db.rows('enrollmentHandoverFieldVerification')).toHaveLength(0);
    expect((await w.workflow.getWorkspace('act-1', await w.scope('mentor-1'))).viewer.canEditHandover).toBe(false);
  });

  it('becomes available once Stage 2 is open, and stays available after Stage 2 is completed while the workflow runs', async () => {
    const w = world();
    await expect(w.workflow.updateHandoverField('act-1', 'parent.relationship', 'Mother', 'mentor-1')).resolves.toMatchObject({ changed: true });
    w.db.rows('mentoringStage').find((s) => s.stageNumber === 2)!.status = 'COMPLETED';
    await expect(w.workflow.updateHandoverField('act-1', 'parent.relationship', 'Father', 'mentor-1')).resolves.toMatchObject({ changed: true });
  });
});

describe('Collection and verification are separate facts', () => {
  const verified = (w: ReturnType<typeof world>) => w.db.rows('enrollmentHandoverFieldVerification');
  const read = async (w: ReturnType<typeof world>, user = 'mentor-1'): Promise<any> => (await w.workflow.getWorkspace('act-1', await w.scope(user))).handover;

  it('a Sales value is collected but not verified until the Mentor confirms it', async () => {
    const w = world();
    const view = await read(w);
    expect(view.transferredFields.find((f: any) => f.field === 'parent.primaryPhone')).toBeDefined();
    expect(view.fieldVerifications).toEqual([]);
  });

  it('collecting or editing a value never verifies it', async () => {
    const w = world();
    await w.workflow.updateHandoverField('act-1', 'parent.relationship', 'Mother', 'mentor-1');
    await w.workflow.updateHandoverField('act-1', 'parent.primaryPhone', '9876543210', 'mentor-1');
    expect(verified(w)).toHaveLength(0);
    expect((await read(w)).fieldVerifications).toEqual([]);
  });

  it('verifying a Sales value records who and when, keeps the Sales data untouched and adds history', async () => {
    const w = world();
    const before = salesDataOf(w.db);
    await expect(w.workflow.setHandoverFieldVerification('act-1', 'parent.primaryPhone', { verified: true, note: 'Confirmed on the call' }, 'mentor-1')).resolves.toMatchObject({ verified: true, changed: true });

    expect(salesDataOf(w.db)).toEqual(before);
    expect(w.db.rows('enrollmentHandoverField')).toHaveLength(0); // verifying does not create a Mentoring value
    expect(verified(w)[0]).toMatchObject({ fieldKey: 'parent.primaryPhone', verifiedValue: SALES_PHONE, verifiedByUserId: 'mentor-1', note: 'Confirmed on the call' });
    expect((await read(w)).fieldVerifications).toEqual([
      expect.objectContaining({ fieldKey: 'parent.primaryPhone', verified: true, changedSinceVerified: false, verifiedByName: 'Mina Mentor', verifiedAt: expect.any(Date), note: 'Confirmed on the call' }),
    ]);
    expect(w.db.rows('mentoringEvent').find((e) => e.type === 'HANDOVER_FIELD_VERIFIED')).toMatchObject({ actorUserId: 'mentor-1', payload: { fieldKey: 'parent.primaryPhone', value: SALES_PHONE } });
  });

  it('the read-only Sales subjects can be verified too', async () => {
    const w = world();
    w.db.rows('enrollmentHandover')[0].transferredFields.push({ field: 'academic.subjects', source: 'REQUIREMENT', value: [{ requirementId: 'r1', subject: 'Maths', curriculum: 'CBSE', grade: 'Grade 8', monthlyHours: '8' }] });
    await expect(w.workflow.setHandoverFieldVerification('act-1', 'academic.subjects', { verified: true }, 'mentor-1')).resolves.toMatchObject({ verified: true });
  });

  it('a field with no value cannot be verified', async () => {
    const w = world();
    await expect(w.workflow.setHandoverFieldVerification('act-1', 'parent.relationship', { verified: true }, 'mentor-1')).rejects.toBeInstanceOf(ConflictException);
    expect(verified(w)).toHaveLength(0);
  });

  it('changing a verified value makes it unverified again, without deleting the earlier confirmation', async () => {
    const w = world();
    await w.workflow.setHandoverFieldVerification('act-1', 'parent.primaryPhone', { verified: true }, 'mentor-1');
    await w.workflow.updateHandoverField('act-1', 'parent.primaryPhone', '9876543210', 'mentor-1');

    expect((await read(w)).fieldVerifications).toEqual([expect.objectContaining({ fieldKey: 'parent.primaryPhone', verified: false, changedSinceVerified: true })]);
    expect(verified(w)).toHaveLength(1); // the earlier confirmation is kept for the record

    await w.workflow.setHandoverFieldVerification('act-1', 'parent.primaryPhone', { verified: true }, 'mentor-1');
    expect(verified(w)).toHaveLength(1);
    expect((await read(w)).fieldVerifications).toEqual([expect.objectContaining({ verified: true, changedSinceVerified: false })]);
  });

  it('verifying twice changes nothing; withdrawing removes the confirmation and is recorded', async () => {
    const w = world();
    await w.workflow.setHandoverFieldVerification('act-1', 'parent.primaryPhone', { verified: true }, 'mentor-1');
    await expect(w.workflow.setHandoverFieldVerification('act-1', 'parent.primaryPhone', { verified: true }, 'mentor-1')).resolves.toMatchObject({ changed: false });
    await expect(w.workflow.setHandoverFieldVerification('act-1', 'parent.primaryPhone', { verified: false }, 'mentor-1')).resolves.toMatchObject({ verified: false, changed: true });
    expect(verified(w)).toHaveLength(0);
    expect(w.db.rows('mentoringEvent').map((e) => e.type)).toEqual(expect.arrayContaining(['HANDOVER_FIELD_VERIFIED', 'HANDOVER_FIELD_UNVERIFIED']));
  });

  it('who collected a value is recorded when it is first saved and survives later corrections by someone else', async () => {
    const w = world();
    await w.workflow.updateHandoverField('act-1', 'parent.relationship', 'Mother', 'mentor-1');
    expect(fieldOf(w.db, 'parent.relationship')).toMatchObject({ createdByUserId: 'mentor-1', updatedByUserId: 'mentor-1' });
    w.db.rows('mentoringActivation')[0].currentMentorUserId = 'mentor-2';
    await w.workflow.updateHandoverField('act-1', 'parent.relationship', 'Father', 'mentor-2');
    expect(fieldOf(w.db, 'parent.relationship')).toMatchObject({ createdByUserId: 'mentor-1', updatedByUserId: 'mentor-2' });
  });

  it('a value saved before the first-writer column existed falls back to the last writer', async () => {
    const w = world();
    w.db.seed('enrollmentHandoverField', { handoverId: 'ho-1', fieldKey: 'student.gender', value: 'Female', origin: 'MENTOR_COLLECTED', salesValue: null, updatedByUserId: 'mentor-1' });
    expect((await read(w)).fieldValues[0]).toMatchObject({ fieldKey: 'student.gender', collectedByName: 'Mina Mentor', collectedAt: expect.any(Date) });
  });

  it('only the assigned Mentor can verify; the Head, the CEO and a Counselor cannot', async () => {
    const w = world();
    for (const user of ['head-1', 'mentor-2', 'counselor-1', 'ceo-1']) {
      await expect(w.workflow.setHandoverFieldVerification('act-1', 'parent.primaryPhone', { verified: true }, user)).rejects.toBeInstanceOf(ForbiddenException);
    }
    expect(verified(w)).toHaveLength(0);
  });

  it('refuses fields that do not exist and a workflow that is on hold', async () => {
    const w = world();
    for (const key of ['student.businessId', '__proto__', 'unknown.field']) {
      await expect(w.workflow.setHandoverFieldVerification('act-1', key, { verified: true }, 'mentor-1')).rejects.toBeInstanceOf(BadRequestException);
    }
    const held = world({ status: 'ACTIVATION_ON_HOLD' });
    await expect(held.workflow.setHandoverFieldVerification('act-1', 'parent.primaryPhone', { verified: true }, 'mentor-1')).rejects.toBeInstanceOf(ConflictException);
  });

  it('a Counselor never sees the verification of a parent contact number', async () => {
    const w = world();
    await w.workflow.setHandoverFieldVerification('act-1', 'parent.primaryPhone', { verified: true }, 'mentor-1');
    await w.workflow.updateHandoverField('act-1', 'student.notes', 'Needs help', 'mentor-1');
    await w.workflow.setHandoverFieldVerification('act-1', 'student.notes', { verified: true }, 'mentor-1');
    w.db.seed('mentoringTask', { id: 't1', activationId: 'act-1', stageId: null, title: 'x', assigneeUserId: 'counselor-1', status: 'OPEN' });
    const view = await read(w, 'counselor-1');
    expect(view.fieldVerifications.map((v: any) => v.fieldKey)).toEqual(['student.notes']);
  });
});

describe('Meeting checklist persistence, progress and blocking (Stage 2)', () => {
  const def = getChecklistDefinition(2);
  const withFields = def.filter((d) => d.fields);
  const withoutFields = def.filter((d) => !d.fields);
  const complete = (w: ReturnType<typeof world>, key: string, input: Parameters<MentoringWorkflowService['updateChecklistItem']>[3] = { state: 'VERIFIED' }, user = 'mentor-1') => w.workflow.updateChecklistItem('act-1', 2, key, input, user);
  const stage2 = (w: ReturnType<typeof world>) => w.db.rows('mentoringStage').find((s) => s.stageNumber === 2)!;
  /** Resolves every item: those that depend on information are marked unavailable with a reason. */
  const resolveAll = async (w: ReturnType<typeof world>, except: string[] = []) => {
    for (const d of def.filter((x) => !except.includes(x.key))) {
      await complete(w, d.key, d.fields ? { state: 'UNAVAILABLE', reason: 'Parent could not provide it' } : { state: 'VERIFIED' });
    }
  };

  it('a completed item is saved with who, when, comment and evidence, and is still there after a reload', async () => {
    const w = world();
    await complete(w, 'meeting_notes_followups', { state: 'VERIFIED', note: 'Parent asked for a call on Friday', evidenceRef: 'https://files.example/notes-1' });

    const fresh = services(w.db);
    const item = (await fresh.workflow.getWorkspace('act-1', await fresh.scope('head-1'))).stages[1].checklist.find((i: any) => i.key === 'meeting_notes_followups');
    expect(item).toMatchObject({
      state: 'VERIFIED', note: 'Parent asked for a call on Friday', evidenceRef: 'https://files.example/notes-1', group: 'meeting_conduct', mandatory: true,
      updatedByUserId: 'mentor-1', updatedByName: 'Mina Mentor', updatedAt: expect.any(Date),
    });
  });

  it('un-ticking an item puts it back to pending and keeps the history', async () => {
    const w = world();
    await complete(w, 'methodology_explained');
    await complete(w, 'methodology_explained', { state: 'PENDING_COLLECTION' });
    expect(w.db.rows('stageChecklistResponse').find((r) => r.itemKey === 'methodology_explained')!.state).toBe('PENDING_COLLECTION');
    expect(w.db.rows('mentoringEvent').filter((e) => e.type === 'CHECKLIST_UPDATED')).toHaveLength(2);
  });

  it('marking unavailable or not applicable needs a reason', async () => {
    const w = world();
    await expect(complete(w, 'previous_marks_collected', { state: 'UNAVAILABLE' })).rejects.toBeInstanceOf(BadRequestException);
    await expect(complete(w, 'previous_marks_collected', { state: 'UNAVAILABLE', reason: 'School has not issued reports' })).resolves.toBeDefined();
  });

  it('a requirement that depends on information cannot be completed while that information is missing', async () => {
    const w = world();
    await expect(complete(w, 'preferred_language_collected')).rejects.toThrow(/Collect this information first: Preferred Language/);
    expect(w.db.rows('stageChecklistResponse').find((r) => r.itemKey === 'preferred_language_collected')?.state ?? 'PENDING_COLLECTION').toBe('PENDING_COLLECTION');

    await w.workflow.updateHandoverField('act-1', 'academic.preferredLanguage', 'Tamil', 'mentor-1');
    await expect(complete(w, 'preferred_language_collected')).resolves.toMatchObject({ item: { state: 'VERIFIED' } });
  });

  it('a value that is only a placeholder does not satisfy a requirement', async () => {
    const w = world();
    w.db.seed('enrollmentHandoverField', { handoverId: 'ho-1', fieldKey: 'academic.preferredLanguage', value: ' - ', origin: 'MENTOR_COLLECTED', salesValue: null, updatedByUserId: 'mentor-1' });
    await expect(complete(w, 'preferred_language_collected')).rejects.toBeInstanceOf(ConflictException);
  });

  it('having every value does not complete a requirement or the stage: the Mentor still has to confirm each one', async () => {
    const w = world();
    // Collect every value the requirements depend on.
    const values: Record<string, unknown> = {
      'student.lastName': 'K', 'student.dateOfBirth': '2015-05-12', 'parent.name': 'Parent One', 'parent.relationship': 'Mother', 'academic.preferredLanguage': 'Tamil',
      'tutor.requirements': 'Female tutor', 'academic.subjectNotes': 'Algebra focus', 'academic.previousMarks': '78% in term 1',
      'examination.upcomingDates': [{ subject: 'Maths', date: '2026-12-01' }], 'examination.syllabusPortions': [{ subject: 'Maths', portions: 'Chapters 1 to 4' }],
      parentExpectations: 'Better exam results', studentEngagement: 'Shy but attentive', 'student.learningConcerns': 'Slow at word problems',
    };
    for (const [key, value] of Object.entries(values)) await w.workflow.updateHandoverField('act-1', key, value, 'mentor-1');
    w.db.rows('enrollmentHandover')[0].transferredFields.push({ field: 'academic.subjects', source: 'REQUIREMENT', value: [{ requirementId: 'r1', subject: 'Maths' }] });

    const view = await w.workflow.getWorkspace('act-1', await w.scope('mentor-1'));
    for (const item of view.stages[1].checklist.filter((i: any) => i.requires.length > 0)) {
      expect(item.requires.every((r: any) => r.collected)).toBe(true); // everything is collected...
      expect(item.state).toBe('PENDING_COLLECTION'); // ...and nothing is completed
    }
    expect(stage2(w).status).toBe('IN_PROGRESS');
    await expect(w.workflow.verifyStage('act-1', 2, 'mentor-1')).rejects.toBeInstanceOf(ConflictException);
  });

  it('the workspace tells the page which information each requirement is still waiting for', async () => {
    const w = world();
    const view = await w.workflow.getWorkspace('act-1', await w.scope('mentor-1'));
    const language = view.stages[1].checklist.find((i: any) => i.key === 'preferred_language_collected');
    expect(language!.requires).toEqual([{ key: 'academic.preferredLanguage', label: 'Preferred Language', collected: false }]);
    const contact = view.stages[1].checklist.find((i: any) => i.key === 'contact_information_verified');
    expect(contact!.requires).toEqual([{ key: 'parent.primaryPhone', label: 'Parent Contact Number', collected: true }]); // the Sales number counts
  });

  it('verification is blocked while mandatory items are outstanding, and lists them', async () => {
    const w = world();
    await resolveAll(w, ['parent_acknowledgement', 'methodology_explained']);
    await expect(w.workflow.verifyStage('act-1', 2, 'mentor-1')).rejects.toMatchObject({
      response: { message: 'Mandatory checklist items are not resolved', unresolved: ['methodology_explained', 'parent_acknowledgement'] },
    });
  });

  it('items whose rows were never created still block verification (they cannot be skipped)', async () => {
    const w = world();
    expect(w.db.rows('stageChecklistResponse')).toHaveLength(0);
    await expect(w.workflow.verifyStage('act-1', 2, 'mentor-1')).rejects.toBeInstanceOf(ConflictException);
  });

  it('resolving everything moves the stage to review and then it can be verified, by the Mentor only', async () => {
    const w = world();
    await resolveAll(w);
    expect(stage2(w).status).toBe('PENDING_REVIEW');
    await expect(w.workflow.verifyStage('act-1', 2, 'mentor-2')).rejects.toBeInstanceOf(ForbiddenException);
    await expect(w.workflow.verifyStage('act-1', 2, 'mentor-1')).resolves.toBeDefined();
    expect(stage2(w).status).toBe('COMPLETED');
  });

  it('the stage keeps its progress when a requirement is reopened', async () => {
    const w = world();
    await resolveAll(w);
    await complete(w, 'methodology_explained', { state: 'PENDING_COLLECTION' });
    expect(stage2(w).status).toBe('IN_PROGRESS');
    const done = (await w.workflow.getWorkspace('act-1', await w.scope('mentor-1'))).stages[1].checklist.filter((i: any) => i.state === 'VERIFIED' || i.state === 'UNAVAILABLE');
    expect(done).toHaveLength(def.length - 1);
  });

  it('a Head exception resolves one item, needs a reason, and records who, when and which item', async () => {
    const w = world();
    await resolveAll(w, ['previous_marks_collected']);
    await expect(w.workflow.authorizeException('act-1', 2, 'previous_marks_collected', '   ', 'head-1')).rejects.toBeInstanceOf(BadRequestException);

    await w.workflow.authorizeException('act-1', 2, 'previous_marks_collected', 'School is closed until January', 'head-1');

    const row = w.db.rows('workflowException')[0];
    expect(row).toMatchObject({ itemKey: 'previous_marks_collected', reason: 'School is closed until January', authorizedByUserId: 'head-1' });
    expect(row.createdAt).toBeInstanceOf(Date);
    expect(w.db.rows('mentoringEvent').find((e) => e.type === 'EXCEPTION_AUTHORIZED')).toMatchObject({ actorUserId: 'head-1', reason: 'School is closed until January', payload: { itemKey: 'previous_marks_collected', stageNumber: 2 } });

    const item = (await w.workflow.getWorkspace('act-1', await w.scope('mentor-1'))).stages[1].checklist.find((i: any) => i.key === 'previous_marks_collected');
    expect(item).toMatchObject({ exception: true, state: 'PENDING_COLLECTION', exceptionDetail: { reason: 'School is closed until January', authorizedByName: 'Hari Head', authorizedByUserId: 'head-1' } });
    expect(stage2(w).status).toBe('PENDING_REVIEW');
  });

  it('an ordinary tick is not an exception, and an exception does not change the item state', async () => {
    const w = world();
    await complete(w, 'methodology_explained');
    expect(w.db.rows('workflowException')).toHaveLength(0);
    await w.workflow.authorizeException('act-1', 2, 'tutor_subject_requirements_confirmed', 'Tutor not yet allocated', 'head-1');
    expect(w.db.rows('stageChecklistResponse').find((r) => r.itemKey === 'tutor_subject_requirements_confirmed')?.state ?? 'PENDING_COLLECTION').toBe('PENDING_COLLECTION');
  });

  it('only the assigned Mentor can change items; the Head and a Counselor cannot', async () => {
    const w = world();
    for (const user of ['head-1', 'mentor-2', 'counselor-1', 'ceo-1']) {
      await expect(complete(w, 'methodology_explained', { state: 'VERIFIED' }, user)).rejects.toBeInstanceOf(ForbiddenException);
    }
  });

  it('there are items with and without a dependency on information (guards the definition used above)', () => {
    expect(withFields).toHaveLength(10);
    expect(withoutFields).toHaveLength(6);
  });
});

describe('Stage 1: reviewing the handover', () => {
  const stage1 = (w: ReturnType<typeof world>) => w.db.rows('mentoringStage').find((s) => s.stageNumber === 1)!;

  it('the Mentor completes Stage 1 with the single review requirement, without collecting any information', async () => {
    const w = world({ at: 1 });
    await expect(w.workflow.verifyStage('act-1', 1, 'mentor-1')).rejects.toBeInstanceOf(ConflictException); // not reviewed yet
    await w.workflow.updateChecklistItem('act-1', 1, 'missing_info_identified', { state: 'VERIFIED' }, 'mentor-1');
    expect(stage1(w).status).toBe('PENDING_REVIEW');
    await expect(w.workflow.verifyStage('act-1', 1, 'mentor-1')).resolves.toMatchObject({ stageNumber: 1, allStagesCompleted: false });
    expect(stage1(w)).toMatchObject({ status: 'COMPLETED', verifiedByUserId: 'mentor-1' });
    expect(w.db.rows('mentoringActivation')[0].currentStage).toBe(2);
    expect(w.db.rows('enrollmentHandoverField')).toHaveLength(0); // nothing was filled in or invented
  });

  it('submitting needs no collected information: every Sales field can be missing and Stage 1 still completes', async () => {
    const w = world({ at: 1 });
    w.db.rows('enrollmentHandover')[0].transferredFields = []; // Sales handed over nothing
    w.db.rows('enrollmentHandover')[0].missingFields = Object.keys(HANDOVER_FIELDS).map((field) => ({ field, reason: 'NOT_COLLECTED_IN_SALES' }));
    const before = salesDataOf(w.db);
    await w.workflow.updateChecklistItem('act-1', 1, 'missing_info_identified', { state: 'VERIFIED' }, 'mentor-1');
    await expect(w.workflow.verifyStage('act-1', 1, 'mentor-1')).resolves.toMatchObject({ stageNumber: 1 });
    expect(stage1(w).status).toBe('COMPLETED');
    expect(salesDataOf(w.db)).toEqual(before);
    expect(w.db.rows('mentoringEvent').map((e) => e.type)).toEqual(expect.arrayContaining(['CHECKLIST_UPDATED', 'STAGE_VERIFIED']));
  });

  it('completing Stage 1 makes the Meeting with Parents the active stage, with who and when recorded on Stage 1', async () => {
    const w = world({ at: 1 });
    await w.workflow.updateChecklistItem('act-1', 1, 'missing_info_identified', { state: 'VERIFIED' }, 'mentor-1');
    await w.workflow.verifyStage('act-1', 1, 'mentor-1');
    const view = await w.workflow.getWorkspace('act-1', await w.scope('mentor-1'));
    expect(view.activation.currentStage).toBe(2);
    expect(view.stages[0]).toMatchObject({ number: 1, status: 'COMPLETED', completedAt: expect.any(Date) });
    expect(view.stages[0].checklist[0]).toMatchObject({ state: 'VERIFIED', updatedByName: 'Mina Mentor' });
    expect(view.stages[1]).toMatchObject({ number: 2, name: 'Meeting with Parents', status: 'NOT_STARTED' }); // the Mentor starts it
    expect(view.viewer.canEditHandover).toBe(false); // collecting begins only once Stage 2 is started
    await w.workflow.startStage('act-1', 2, 'mentor-1');
    expect((await w.workflow.getWorkspace('act-1', await w.scope('mentor-1'))).viewer.canEditHandover).toBe(true);
  });

  it('only the assigned Mentor can record the review or complete Stage 1: the Head, the CEO, a CO_FOUNDER, another Mentor and a Counselor are refused', async () => {
    const w = world({ at: 1 });
    for (const user of ['head-1', 'ceo-1', 'mentor-2', 'counselor-1', 'cofounder-1']) {
      await expect(w.workflow.updateChecklistItem('act-1', 1, 'missing_info_identified', { state: 'VERIFIED' }, user)).rejects.toBeInstanceOf(ForbiddenException);
    }
    expect(w.db.rows('stageChecklistResponse')).toHaveLength(0);

    await w.workflow.updateChecklistItem('act-1', 1, 'missing_info_identified', { state: 'VERIFIED' }, 'mentor-1');
    for (const user of ['head-1', 'ceo-1', 'mentor-2', 'counselor-1', 'cofounder-1']) {
      await expect(w.workflow.verifyStage('act-1', 1, user)).rejects.toBeInstanceOf(ForbiddenException);
    }
    expect(stage1(w).status).toBe('PENDING_REVIEW'); // nothing the refused users did changed the stage
  });

  it('the action is refused while the workflow is on hold, and a waiting Counselor task blocks completion without losing the recorded review', async () => {
    const held = world({ at: 1, status: 'ACTIVATION_ON_HOLD' });
    await expect(held.workflow.updateChecklistItem('act-1', 1, 'missing_info_identified', { state: 'VERIFIED' }, 'mentor-1')).rejects.toBeInstanceOf(ConflictException);

    const w = world({ at: 1 });
    w.db.seed('mentoringTask', { id: 't-wait', activationId: 'act-1', stageId: stage1(w).id, title: 'Collect marks', assigneeUserId: 'counselor-1', assignedByUserId: 'mentor-1', status: 'SUBMITTED' });
    await w.workflow.updateChecklistItem('act-1', 1, 'missing_info_identified', { state: 'VERIFIED' }, 'mentor-1');
    await expect(w.workflow.verifyStage('act-1', 1, 'mentor-1')).rejects.toBeInstanceOf(ConflictException);
    expect(stage1(w).status).toBe('PENDING_REVIEW'); // the page shows "Review recorded, ready to submit"
    expect(w.db.rows('stageChecklistResponse')[0]).toMatchObject({ itemKey: 'missing_info_identified', state: 'VERIFIED' });
  });

  it('a student with the review item resolved in an earlier definition keeps that result', async () => {
    const w = world({ at: 1 });
    w.db.seed('stageChecklistResponse', { stageId: stage1(w).id, itemKey: 'missing_info_identified', mandatory: true, definitionVersion: 1, state: 'VERIFIED', note: 'Phone and marks missing', updatedByUserId: 'mentor-1' });
    await expect(w.workflow.verifyStage('act-1', 1, 'mentor-1')).resolves.toBeDefined();
  });

  it('exposes the earlier detailed Stage 1 results read-only, with comments and evidence, and never counts them', async () => {
    const w = world();
    const s1 = stage1(w);
    w.db.seed('stageChecklistResponse', { stageId: s1.id, itemKey: 'student_parent_verified', mandatory: true, definitionVersion: 1, state: 'VERIFIED', note: 'Checked admission form', evidenceRef: 'ev-1', updatedByUserId: 'mentor-1' });
    w.db.seed('stageChecklistResponse', { stageId: s1.id, itemKey: 'contact_details_verified', mandatory: true, definitionVersion: 2, state: 'UNAVAILABLE', reason: 'Parent unreachable', updatedByUserId: 'mentor-1' });
    w.db.seed('stageChecklistResponse', { stageId: s1.id, itemKey: 'tutor_assignment_confirmed', mandatory: true, definitionVersion: 2, state: 'PENDING_COLLECTION' }); // nothing saved: not listed
    w.db.seed('stageChecklistResponse', { stageId: s1.id, itemKey: 'unknown_key', mandatory: true, definitionVersion: 2, state: 'VERIFIED' }); // not a known earlier item: not listed
    w.db.seed('workflowException', { stageId: s1.id, itemKey: 'follow_up_identified', reason: 'Head allowed it', authorizedByUserId: 'head-1' });
    const before = clone(w.db.rows('stageChecklistResponse'));

    const view = await w.workflow.getWorkspace('act-1', await w.scope('mentor-1'));
    expect(view.legacyStage1Items.map((i: any) => i.key).sort()).toEqual(['contact_details_verified', 'follow_up_identified', 'student_parent_verified']);
    expect(view.legacyStage1Items.find((i: any) => i.key === 'student_parent_verified')).toMatchObject({
      label: 'Student and parent details verified', state: 'VERIFIED', note: 'Checked admission form', evidenceRef: 'ev-1', updatedByName: 'Mina Mentor',
    });
    expect(view.legacyStage1Items.find((i: any) => i.key === 'contact_details_verified')).toMatchObject({ state: 'UNAVAILABLE', reason: 'Parent unreachable' });
    expect(view.legacyStage1Items.find((i: any) => i.key === 'follow_up_identified')).toMatchObject({ exceptionReason: 'Head allowed it' });
    expect(view.stages[0].checklist.map((i: any) => i.key)).toEqual(['missing_info_identified']);
    expect(clone(w.db.rows('stageChecklistResponse'))).toEqual(before); // reading changes nothing
  });
});

describe('unresolvedMandatoryItems', () => {
  const defs = [{ key: 'a', mandatory: true }, { key: 'b', mandatory: true }, { key: 'c', mandatory: false }];
  const row = (itemKey: string, state: string, reason: string | null = null) => ({ itemKey, mandatory: true, state, reason });

  it('counts a missing row as unresolved and ignores advisory items and obsolete rows', () => {
    expect(unresolvedMandatoryItems(defs, [row('a', 'VERIFIED'), row('zzz', 'PENDING_COLLECTION')], new Set())).toEqual(['b']);
  });

  it('resolves by verification, a reasoned unavailable / not-applicable, or a Head exception', () => {
    const rows = [row('a', 'UNAVAILABLE', 'No report issued'), row('b', 'COLLECTED')];
    expect(unresolvedMandatoryItems(defs, rows, new Set())).toEqual(['b']);
    expect(unresolvedMandatoryItems(defs, rows, new Set(['b']))).toEqual([]);
    expect(unresolvedMandatoryItems(defs, [row('a', 'NOT_APPLICABLE', '  '), row('b', 'VERIFIED')], new Set())).toEqual(['a']);
  });
});

describe('Read-only and counselor restrictions on the new routes', () => {
  const seed = readFileSync(join(__dirname, '../../../prisma/seed.ts'), 'utf8').replace(/\r\n/g, '\n');
  const required = (method: string): string[] | undefined => Reflect.getMetadata(PERMISSIONS_KEY, (MentoringWorkflowController.prototype as Record<string, any>)[method]);
  const grants = (role: string) => {
    const start = seed.indexOf(`\n  ${role}: [`);
    return start < 0 ? [] : Array.from(seed.slice(start, seed.indexOf('\n  ],', start)).matchAll(/'(mentoring\.[a-z.-]+)'/g)).map((m) => m[1]);
  };
  const operational = seed.slice(seed.indexOf('const MENTORING_OPERATIONAL_CODES'), seed.indexOf(']);', seed.indexOf('const MENTORING_OPERATIONAL_CODES')));

  it('editing information and items needs the Mentor stage permission; exceptions need the Head permission', () => {
    expect(required('updateHandoverField')).toEqual(['mentoring.stage.work']);
    expect(required('setHandoverFieldVerification')).toEqual(['mentoring.stage.work']);
    expect(required('updateItem')).toEqual(['mentoring.stage.work']);
    expect(required('authorizeException')).toEqual(['mentoring.exception.authorize']);
    expect(required('verifyStage')).toEqual(['mentoring.stage.verify']);
  });

  it('the Mentor can work and verify stages but cannot authorise exceptions', () => {
    expect(grants('MENTOR')).toEqual(expect.arrayContaining(['mentoring.stage.work', 'mentoring.stage.verify']));
    expect(grants('MENTOR')).not.toContain('mentoring.exception.authorize');
  });

  it('the Head authorises exceptions but cannot edit stage information or verify stages', () => {
    expect(grants('MENTORING_HEAD')).toContain('mentoring.exception.authorize');
    expect(grants('MENTORING_HEAD')).not.toContain('mentoring.stage.work');
    expect(grants('MENTORING_HEAD')).not.toContain('mentoring.stage.verify');
  });

  it('the Demo Counselor has none of the stage permissions', () => {
    for (const code of ['mentoring.stage.work', 'mentoring.stage.verify', 'mentoring.exception.authorize']) expect(grants('DEMO_COUNSELOR')).not.toContain(code);
  });

  it('the CEO (and CO_FOUNDER, read-only by design) hold no permission that edits or verifies', () => {
    for (const code of ['mentoring.stage.work', 'mentoring.stage.verify', 'mentoring.exception.authorize']) expect(operational).toContain(`'${code}'`);
    expect(seed).toContain('CEO: ALL_PERMISSION_CODES.filter((code) => !MENTORING_OPERATIONAL_CODES.has(code))');
  });
});

describe('Viewer capabilities sent to the page', () => {
  // The real role grants, read from the reviewed grant script (a test keeps that script in step with the seed).
  const grantSql = readFileSync(join(__dirname, '../../../scripts/mentoring-permission-grant.sql'), 'utf8');
  const grantsOf = (role: string) => Array.from(grantSql.matchAll(/^\s+\('([A-Z_]+)', '(mentoring\.[a-z.-]+)'\)[,;]/gm)).filter((m) => m[1] === role).map((m) => m[2]);
  /** Opens the workspace as a user holding exactly the real grants of the role. The shared fixture is restored afterwards. */
  const capabilitiesFor = async (role: string, userId: string) => {
    const saved = PERMS[userId];
    PERMS[userId] = grantsOf(role);
    try {
      const w = world();
      if (userId === 'counselor-1') w.db.seed('mentoringTask', { id: 't-cap', activationId: 'act-1', stageId: null, title: 'x', assigneeUserId: 'counselor-1', status: 'OPEN' });
      return (await w.workflow.getWorkspace('act-1', await w.scope(userId))).viewer;
    } finally {
      if (saved === undefined) delete PERMS[userId]; else PERMS[userId] = saved;
    }
  };
  const NONE = { pause: false, cancel: false, authorizeException: false, approve: false, manageTasks: false };

  it('the Mentoring Head can pause, cancel, authorise exceptions, approve and manage tasks', async () => {
    expect((await capabilitiesFor('MENTORING_HEAD', 'real-head')).can).toEqual({ pause: true, cancel: true, authorizeException: true, approve: true, manageTasks: true });
  });

  it('the CEO and the CO_FOUNDER see every student but can do none of it', async () => {
    for (const role of ['CEO', 'CO_FOUNDER']) {
      const viewer = await capabilitiesFor(role, `real-${role}`);
      expect(viewer.isHead).toBe(true); // department-wide read access, which is why the page must not use it for buttons
      expect(viewer.can).toEqual(NONE);
    }
  });

  it('a Demo Counselor can do none of it', async () => {
    expect((await capabilitiesFor('DEMO_COUNSELOR', 'counselor-1')).can).toEqual(NONE);
  });

  it('a Mentor can pause and manage tasks, but cannot cancel, authorise exceptions or approve', async () => {
    expect((await capabilitiesFor('MENTOR', 'mentor-1')).can).toEqual({ ...NONE, pause: true, manageTasks: true });
  });

  it('the capability flags never widen what the API allows: the CEO is still refused each action', () => {
    const w = world();
    const route = (method: string) => Reflect.getMetadata(PERMISSIONS_KEY, (MentoringWorkflowController.prototype as Record<string, any>)[method]) as string[];
    expect(route('pause')).toEqual(['mentoring.workflow.pause']);
    expect(route('cancel')).toEqual(['mentoring.activation.cancel']);
    expect(route('authorizeException')).toEqual(['mentoring.exception.authorize']);
    expect(route('decideApproval')).toEqual(['mentoring.approval.final']);
    for (const code of [...route('pause'), ...route('cancel'), ...route('authorizeException'), ...route('decideApproval')]) expect(grantsOf('CEO')).not.toContain(code);
    expect(w.db.rows('mentoringActivation')[0].status).toBe('ACTIVATION_IN_PROGRESS');
  });
});

describe('Concurrent edits and stale data', () => {
  const verifications = (w: ReturnType<typeof world>) => w.db.rows('enrollmentHandoverFieldVerification');
  const eventsOf = (w: ReturnType<typeof world>, type: string) => w.db.rows('mentoringEvent').filter((e) => e.type === type);

  it('a save based on the value the Mentor saw is accepted', async () => {
    const w = world();
    await expect(w.workflow.updateHandoverField('act-1', 'parent.primaryPhone', '9876543210', 'mentor-1', SALES_PHONE)).resolves.toMatchObject({ changed: true });
    await expect(w.workflow.updateHandoverField('act-1', 'parent.relationship', 'Mother', 'mentor-1', null)).resolves.toMatchObject({ changed: true }); // an empty field is based on null
  });

  it('a second save from a tab that still shows the old value is refused and writes nothing', async () => {
    const w = world();
    await w.workflow.updateHandoverField('act-1', 'parent.primaryPhone', '9876543210', 'mentor-1', SALES_PHONE); // tab A
    const before = clone(fieldOf(w.db, 'parent.primaryPhone'));
    await expect(w.workflow.updateHandoverField('act-1', 'parent.primaryPhone', '9876543211', 'mentor-1', SALES_PHONE)).rejects.toThrow(/changed by someone else/); // tab B, stale
    expect(clone(fieldOf(w.db, 'parent.primaryPhone'))).toEqual(before);
    expect(eventsOf(w, 'HANDOVER_FIELD_UPDATED')).toHaveLength(1);
  });

  it('a stale save to an empty field is refused when it has been collected in the meantime', async () => {
    const w = world();
    await w.workflow.updateHandoverField('act-1', 'parent.relationship', 'Mother', 'mentor-1', null);
    await expect(w.workflow.updateHandoverField('act-1', 'parent.relationship', 'Father', 'mentor-1', null)).rejects.toBeInstanceOf(ConflictException);
    expect(fieldOf(w.db, 'parent.relationship').value).toBe('Mother');
  });

  it('after loading the latest value the save goes through', async () => {
    const w = world();
    await w.workflow.updateHandoverField('act-1', 'parent.relationship', 'Mother', 'mentor-1', null);
    await expect(w.workflow.updateHandoverField('act-1', 'parent.relationship', 'Father', 'mentor-1', 'Mother')).resolves.toMatchObject({ changed: true });
    expect(fieldOf(w.db, 'parent.relationship').value).toBe('Father');
  });

  it('a blank or placeholder value counts as empty when checking staleness', async () => {
    const w = world();
    await expect(w.workflow.updateHandoverField('act-1', 'parent.relationship', 'Mother', 'mentor-1', '  ')).resolves.toMatchObject({ changed: true });
  });

  it('without basedOn the save is not checked, so an older client keeps working', async () => {
    const w = world();
    await w.workflow.updateHandoverField('act-1', 'parent.relationship', 'Mother', 'mentor-1');
    await expect(w.workflow.updateHandoverField('act-1', 'parent.relationship', 'Father', 'mentor-1')).resolves.toMatchObject({ changed: true });
  });

  it('confirming a value that has changed since the Mentor saw it is refused, so a stale value is never confirmed', async () => {
    const w = world();
    await expect(w.workflow.setHandoverFieldVerification('act-1', 'parent.primaryPhone', { verified: true, basedOn: '9000000000' }, 'mentor-1')).rejects.toThrow(/changed by someone else/);
    expect(verifications(w)).toHaveLength(0);
    await expect(w.workflow.setHandoverFieldVerification('act-1', 'parent.primaryPhone', { verified: true, basedOn: SALES_PHONE }, 'mentor-1')).resolves.toMatchObject({ verified: true });
  });

  it('the page always sends basedOn: the controller passes it through', () => {
    const controller = readFileSync(join(__dirname, 'mentoring-workflow.controller.ts'), 'utf8');
    expect(controller).toContain('dto.basedOn');
  });
});

describe('Verification audit trail', () => {
  const types = (w: ReturnType<typeof world>) => w.db.rows('mentoringEvent').map((e) => e.type).filter((t) => t.startsWith('HANDOVER_FIELD_'));

  it('collect, verify, correct, verify again: every step is a separate history entry with who, the value and the invalidation', async () => {
    const w = world();
    await w.workflow.updateHandoverField('act-1', 'parent.relationship', 'Mother', 'mentor-1', null);
    await w.workflow.setHandoverFieldVerification('act-1', 'parent.relationship', { verified: true, basedOn: 'Mother' }, 'mentor-1');
    await w.workflow.updateHandoverField('act-1', 'parent.relationship', 'Guardian', 'mentor-1', 'Mother');
    await w.workflow.setHandoverFieldVerification('act-1', 'parent.relationship', { verified: true, basedOn: 'Guardian' }, 'mentor-1');

    expect(types(w)).toEqual(['HANDOVER_FIELD_UPDATED', 'HANDOVER_FIELD_VERIFIED', 'HANDOVER_FIELD_UPDATED', 'HANDOVER_FIELD_VERIFIED']);
    const events = w.db.rows('mentoringEvent').filter((e) => e.type.startsWith('HANDOVER_FIELD_'));
    expect(events.every((e) => e.actorUserId === 'mentor-1')).toBe(true);
    expect(events[0].payload).toMatchObject({ previous: null, next: 'Mother', verificationInvalidated: false }); // collecting does not verify
    expect(events[1].payload).toMatchObject({ value: 'Mother' });
    expect(events[2].payload).toMatchObject({ previous: 'Mother', next: 'Guardian', verificationInvalidated: true }); // the edit ended the confirmation
    expect(events[3].payload).toMatchObject({ value: 'Guardian' });
  });

  it('between the edit and the new confirmation the field is not verified, and the old confirmation is kept for the record', async () => {
    const w = world();
    await w.workflow.updateHandoverField('act-1', 'parent.relationship', 'Mother', 'mentor-1', null);
    await w.workflow.setHandoverFieldVerification('act-1', 'parent.relationship', { verified: true }, 'mentor-1');
    await w.workflow.updateHandoverField('act-1', 'parent.relationship', 'Guardian', 'mentor-1', 'Mother');

    expect(w.db.rows('enrollmentHandoverFieldVerification')).toHaveLength(1);
    expect(w.db.rows('enrollmentHandoverFieldVerification')[0].verifiedValue).toBe('Mother'); // what was confirmed, unchanged
    const view = (await w.workflow.getWorkspace('act-1', await w.scope('mentor-1'))).handover as any;
    expect(view.fieldVerifications).toEqual([expect.objectContaining({ fieldKey: 'parent.relationship', verified: false, changedSinceVerified: true })]);
  });

  it('editing a value that was never verified does not claim a verification was ended', async () => {
    const w = world();
    await w.workflow.updateHandoverField('act-1', 'parent.primaryPhone', '9876543210', 'mentor-1', SALES_PHONE);
    expect(w.db.rows('mentoringEvent').find((e) => e.type === 'HANDOVER_FIELD_UPDATED')!.payload).toMatchObject({ verificationInvalidated: false });
  });

  it('withdrawing a verification is recorded with who confirmed it before, what they confirmed and when', async () => {
    const w = world();
    await w.workflow.setHandoverFieldVerification('act-1', 'parent.primaryPhone', { verified: true }, 'mentor-1');
    await w.workflow.setHandoverFieldVerification('act-1', 'parent.primaryPhone', { verified: false }, 'mentor-1');
    const event = w.db.rows('mentoringEvent').find((e) => e.type === 'HANDOVER_FIELD_UNVERIFIED')!;
    expect(event).toMatchObject({ actorUserId: 'mentor-1', payload: { fieldKey: 'parent.primaryPhone', previousVerifiedValue: SALES_PHONE, previousVerifiedByUserId: 'mentor-1' } });
    expect(event.payload.previousVerifiedAt).toBeInstanceOf(Date);
  });

  it('the verification time and the Mentor come from the server, not from the request', async () => {
    const w = world();
    const before = Date.now();
    await w.workflow.setHandoverFieldVerification('act-1', 'parent.primaryPhone', { verified: true }, 'mentor-1');
    const row = w.db.rows('enrollmentHandoverFieldVerification')[0];
    expect(row.verifiedByUserId).toBe('mentor-1');
    expect((row.verifiedAt as Date).getTime()).toBeGreaterThanOrEqual(before);
    expect(row.handoverId).toBe('ho-1');
    expect(row.fieldKey).toBe('parent.primaryPhone');
  });

  it('the request cannot name the verifier or the time: the verification body has no such fields', () => {
    const dto = readFileSync(join(__dirname, 'mentoring.dto.ts'), 'utf8');
    const block = dto.slice(dto.indexOf('class SetFieldVerificationDto'), dto.indexOf('class PauseDto'));
    expect(block).not.toMatch(/verifiedBy|verifiedAt|userId/);
  });
});

describe('Who may edit and verify a field, including the CO_FOUNDER', () => {
  it('the assigned Mentor only: the Head, CEO, CO_FOUNDER, another Mentor and a Counselor are refused for both actions', async () => {
    const w = world();
    for (const user of ['head-1', 'ceo-1', 'cofounder-1', 'mentor-2', 'counselor-1']) {
      await expect(w.workflow.updateHandoverField('act-1', 'parent.relationship', 'Mother', user, null)).rejects.toBeInstanceOf(ForbiddenException);
      await expect(w.workflow.setHandoverFieldVerification('act-1', 'parent.primaryPhone', { verified: true }, user)).rejects.toBeInstanceOf(ForbiddenException);
    }
    expect(w.db.rows('enrollmentHandoverField')).toHaveLength(0);
    expect(w.db.rows('enrollmentHandoverFieldVerification')).toHaveLength(0);
  });

  it('the Mentoring Head, CEO, CO_FOUNDER and Demo Counselor hold neither the stage work nor the stage verify permission', () => {
    const sql = readFileSync(join(__dirname, '../../../scripts/mentoring-permission-grant.sql'), 'utf8');
    const grants = (role: string) => Array.from(sql.matchAll(/^\s+\('([A-Z_]+)', '(mentoring\.[a-z.-]+)'\)[,;]/gm)).filter((m) => m[1] === role).map((m) => m[2]);
    for (const role of ['MENTORING_HEAD', 'CEO', 'CO_FOUNDER', 'DEMO_COUNSELOR']) {
      expect(grants(role)).not.toContain('mentoring.stage.work');
      expect(grants(role)).not.toContain('mentoring.stage.verify');
    }
    expect(grants('MENTOR')).toEqual(expect.arrayContaining(['mentoring.stage.work', 'mentoring.stage.verify']));
  });

  it('invalid input is refused by the server whatever the page sent, and nothing is stored', async () => {
    const w = world();
    for (const [key, bad] of [['parent.primaryPhone', '123'], ['student.dateOfBirth', '2030-01-01'], ['student.gender', 'Robot'], ['student.firstName', '   ']] as const) {
      await expect(w.workflow.updateHandoverField('act-1', key, bad, 'mentor-1', undefined)).rejects.toBeInstanceOf(BadRequestException);
    }
    expect(w.db.rows('enrollmentHandoverField')).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
// Subject-wise preferred schedule
// ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────

const weekly = (day: string, minutes: number, extra: object = {}) => ({ day, durationMinutes: minutes, ...extra });
const english = () => ({ subjectId: 'sub-en', subjectName: 'English', gradeId: 'g-8', gradeName: 'Grade 8', frequency: 'WEEKLY', totalMinutes: 240, distribution: 'EQUAL', sessions: [weekly('Monday', 60), weekly('Tuesday', 60), weekly('Thursday', 60), weekly('Saturday', 60)] });
const maths = () => ({ subjectId: 'sub-ma', subjectName: 'Mathematics', gradeId: 'g-8', gradeName: 'Grade 8', frequency: 'WEEKLY', totalMinutes: 180, distribution: 'EQUAL', sessions: [weekly('Monday', 90), weekly('Wednesday', 90)] });
const science = () => ({ subjectId: 'sub-sc', subjectName: 'Science', gradeId: 'g-9', gradeName: 'Grade 9', frequency: 'BIWEEKLY', totalMinutes: 240, distribution: 'EQUAL', sessions: [weekly('Tuesday', 60, { week: 1 }), weekly('Thursday', 60, { week: 1 }), weekly('Monday', 60, { week: 2 }), weekly('Friday', 60, { week: 2 })] });
const social = () => ({ subjectId: 'sub-ss', subjectName: 'Social Studies', gradeId: 'g-8', gradeName: 'Grade 8', frequency: 'MONTHLY', totalMinutes: 360, distribution: 'EQUAL', sessions: [weekly('Tuesday', 90, { occurrences: ['EVERY'] })] });
const plan = (...subjects: object[]) => ({ version: 2, subjects });
const KEY = 'timetable.schedule';

describe('Subject-wise preferred schedule: saving and reloading', () => {
  it('stores several subjects, each with its own frequency, hours, days and class lengths', async () => {
    const w = world();
    await w.workflow.updateHandoverField('act-1', KEY, plan(english(), maths(), science(), social()), 'mentor-1', null);
    const stored = fieldOf(w.db, KEY).value;
    expect(stored.version).toBe(2);
    expect(stored.subjects.map((s: any) => [s.subjectName, s.gradeName, s.frequency, s.totalMinutes])).toEqual([
      ['English', 'Grade 8', 'WEEKLY', 240], ['Mathematics', 'Grade 8', 'WEEKLY', 180], ['Science', 'Grade 9', 'BIWEEKLY', 240], ['Social Studies', 'Grade 8', 'MONTHLY', 360],
    ]);
    expect(stored.subjects[0].sessions.map((s: any) => s.day)).toEqual(['Monday', 'Tuesday', 'Thursday', 'Saturday']);
    expect(stored.subjects[1].sessions.map((s: any) => s.durationMinutes)).toEqual([90, 90]);
    expect(stored.subjects[2].sessions.map((s: any) => [s.week, s.day])).toEqual([[1, 'Tuesday'], [1, 'Thursday'], [2, 'Monday'], [2, 'Friday']]);
    expect(stored.subjects[3].sessions[0]).toEqual({ day: 'Tuesday', durationMinutes: 90, occurrences: ['EVERY'] });
    expect(fieldOf(w.db, KEY)).toMatchObject({ origin: 'MENTOR_COLLECTED', createdByUserId: 'mentor-1' });
  });

  it('puts bi-weekly sessions in week order, then weekday order, whatever order they arrive in', async () => {
    const w = world();
    const shuffled = { ...science(), sessions: [...science().sessions].reverse() };
    await w.workflow.updateHandoverField('act-1', KEY, plan(shuffled), 'mentor-1', null);
    expect(fieldOf(w.db, KEY).value.subjects[0].sessions.map((s: any) => [s.week, s.day])).toEqual([[1, 'Tuesday'], [1, 'Thursday'], [2, 'Monday'], [2, 'Friday']]);
  });

  it('a brand-new service reads back exactly what was saved, with who collected it', async () => {
    const w = world();
    await w.workflow.updateHandoverField('act-1', KEY, plan(english(), maths()), 'mentor-1', null);
    const fresh = services(w.db);
    const view = (await fresh.workflow.getWorkspace('act-1', await fresh.scope('head-1'))).handover as any;
    expect(view.fieldValues).toEqual([expect.objectContaining({ fieldKey: KEY, value: expect.objectContaining({ version: 2 }), origin: 'MENTOR_COLLECTED', collectedByName: 'Mina Mentor' })]);
    expect(view.fieldValues[0].value.subjects.map((s: any) => s.subjectName)).toEqual(['English', 'Mathematics']);
  });

  it('start and end times are stored, with the end following the class length; none is invented', async () => {
    const w = world();
    const withTimes = { ...maths(), sessions: [weekly('Monday', 90, { start: '16:00' }), weekly('Wednesday', 90)] };
    await w.workflow.updateHandoverField('act-1', KEY, plan(withTimes), 'mentor-1', null);
    const sessions = fieldOf(w.db, KEY).value.subjects[0].sessions;
    expect(sessions[0]).toEqual({ day: 'Monday', durationMinutes: 90, start: '16:00', end: '17:30' });
    expect(sessions[1]).toEqual({ day: 'Wednesday', durationMinutes: 90 });
  });

  it('takes the subject and level names from the master lists, not from the request', async () => {
    const w = world();
    await w.workflow.updateHandoverField('act-1', KEY, plan({ ...english(), subjectName: 'Pirate studies', gradeName: 'Grade 99' }), 'mentor-1', null);
    expect(fieldOf(w.db, KEY).value.subjects[0]).toMatchObject({ subjectName: 'English', gradeName: 'Grade 8' });
  });

  it('saving the same schedule again, with its keys in another order, changes nothing and adds no history', async () => {
    const w = world();
    await w.workflow.updateHandoverField('act-1', KEY, plan(english()), 'mentor-1', null);
    const stored = fieldOf(w.db, KEY).value;
    const reordered = JSON.parse(JSON.stringify(stored), (_k, v) => (v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.entries(v).reverse()) : v));
    const result = await w.workflow.updateHandoverField('act-1', KEY, reordered, 'mentor-1', stored);
    expect(result.changed).toBe(false);
    expect(w.db.rows('mentoringEvent').filter((e) => e.type === 'HANDOVER_FIELD_UPDATED')).toHaveLength(1);
  });
});

describe('Subject-wise preferred schedule: what is refused', () => {
  const refused = async (value: unknown, message?: RegExp) => {
    const w = world();
    await expect(w.workflow.updateHandoverField('act-1', KEY, value, 'mentor-1', null)).rejects.toBeInstanceOf(BadRequestException);
    if (message) await expect(w.workflow.updateHandoverField('act-1', KEY, value, 'mentor-1', null)).rejects.toThrow(message);
    expect(w.db.rows('enrollmentHandoverField')).toHaveLength(0); // nothing is stored
    expect(w.db.rows('mentoringEvent').filter((e) => e.type === 'HANDOVER_FIELD_UPDATED')).toHaveLength(0);
  };

  it('an incomplete plan: no subject, no level, no hours, no days', async () => {
    await refused(plan(), /Add at least one subject/);
    await refused(plan({ ...english(), subjectId: '' }), /Subject 1: Choose a subject./);
    await refused(plan({ ...english(), gradeId: '' }), /English: Choose the required level./);
    await refused(plan({ ...english(), totalMinutes: 0 }), /Enter the total hours required per week/);
    await refused(plan({ ...english(), sessions: [] }), /Choose at least one preferred day/);
  });

  it('hours that do not match the days, with how much is missing or over', async () => {
    await refused(plan({ ...english(), distribution: 'CUSTOM', sessions: [weekly('Monday', 60), weekly('Tuesday', 60), weekly('Thursday', 60), weekly('Saturday', 30)] }), /3 hours 30 minutes per week, but 4 hours are required\. 30 minutes remaining/);
    await refused(plan({ ...english(), distribution: 'CUSTOM', sessions: [weekly('Monday', 120), weekly('Tuesday', 60), weekly('Thursday', 60), weekly('Saturday', 60)] }), /1 hour over/);
  });

  it('an equal split that is not equal, and zero, negative or tiny class lengths', async () => {
    await refused(plan({ ...english(), sessions: [weekly('Monday', 90), weekly('Tuesday', 30), weekly('Thursday', 60), weekly('Saturday', 60)] }), /not an equal split/);
    await refused(plan({ ...english(), distribution: 'CUSTOM', sessions: [weekly('Monday', 0), weekly('Tuesday', 120), weekly('Thursday', 60), weekly('Saturday', 60)] }), /more than zero/);
    await refused(plan({ ...english(), distribution: 'CUSTOM', sessions: [weekly('Monday', -60), weekly('Tuesday', 120), weekly('Thursday', 120), weekly('Saturday', 60)] }), /more than zero/);
    await refused(plan({ ...english(), distribution: 'CUSTOM', sessions: [weekly('Monday', 10), weekly('Tuesday', 110), weekly('Thursday', 60), weekly('Saturday', 60)] }), /at least 15 minutes/);
  });

  it('the same subject twice, and a subject or level that is not in the lists', async () => {
    await refused(plan(english(), { ...maths(), subjectId: 'sub-en' }), /English is already in this plan/);
    await refused(plan({ ...english(), subjectId: 'sub-nope' }), /choose a subject from the subject list/);
    await refused(plan({ ...english(), gradeId: 'g-nope' }), /choose the required level from the level list/);
    await refused(plan({ ...english(), subjectId: 'sub-old' }), /choose a subject from the subject list/); // switched off
    await refused(plan({ ...english(), gradeId: 'g-old' }), /choose the required level from the level list/);
  });

  it('end times: after the start, matching the length, and not without a start', async () => {
    await refused(plan({ ...maths(), sessions: [weekly('Monday', 90, { start: '16:00', end: '15:00' }), weekly('Wednesday', 90)] }), /after the start time/);
    await refused(plan({ ...maths(), sessions: [weekly('Monday', 90, { start: '16:00', end: '17:00' }), weekly('Wednesday', 90)] }), /must match the class length/);
    await refused(plan({ ...maths(), sessions: [weekly('Monday', 90, { end: '17:00' }), weekly('Wednesday', 90)] }), /add a start time/);
    await refused(plan({ ...maths(), sessions: [weekly('Monday', 90, { start: '25:00' }), weekly('Wednesday', 90)] }), /start time must be a time/);
    await refused(plan({ ...maths(), sessions: [weekly('Monday', 90, { start: '23:00' }), weekly('Wednesday', 90)] }), /past midnight/);
  });

  it('days and patterns that do not belong to the frequency', async () => {
    await refused(plan({ ...english(), sessions: [weekly('Funday', 240)] }), /valid day/);
    await refused(plan({ ...maths(), sessions: [weekly('Monday', 90), weekly('Monday', 90)] }), /listed twice/);
    await refused(plan({ ...maths(), sessions: [weekly('Monday', 90, { week: 1 }), weekly('Wednesday', 90)] }), /weeks only apply to bi-weekly/);
    await refused(plan({ ...maths(), sessions: [weekly('Monday', 90, { occurrences: ['EVERY'] }), weekly('Wednesday', 90)] }), /monthly patterns only apply to monthly/);
    await refused(plan({ ...science(), sessions: science().sessions.map((s) => ({ day: s.day, durationMinutes: 60 })) }), /choose Week 1 or Week 2/);
    await refused(plan({ ...social(), sessions: [weekly('Tuesday', 90, { occurrences: [] })] }), /choose which Tuesdays/);
    await refused(plan({ ...social(), sessions: [weekly('Tuesday', 90, { occurrences: ['EVERY', 'FIRST'] })] }), /cannot be combined/);
  });

  it('values in the old day and time rows format, and anything else that is not a schedule', async () => {
    await refused([{ day: 'Monday', start: '16:00', end: '17:00' }], /not in the expected format/);
    await refused({ version: 1, subjects: [] }, /not in the expected format/);
    await refused('Mondays');
    await refused(null);
    await refused({ ...plan(english()), admin: true });
    await refused(plan({ ...english(), secret: 1 }));
    await refused(plan({ ...english(), sessions: [{ ...weekly('Monday', 240), notes: 'x' }] }));
  });
});

describe('Subject-wise preferred schedule: verification and audit', () => {
  const eventsOf = (w: ReturnType<typeof world>) => w.db.rows('mentoringEvent').filter((e) => e.type.startsWith('HANDOVER_FIELD_'));

  it('saving the schedule does not verify it', async () => {
    const w = world();
    await w.workflow.updateHandoverField('act-1', KEY, plan(english()), 'mentor-1', null);
    expect(w.db.rows('enrollmentHandoverFieldVerification')).toHaveLength(0);
    const view = (await w.workflow.getWorkspace('act-1', await w.scope('mentor-1'))).handover as any;
    expect(view.fieldVerifications).toEqual([]);
  });

  it('verification is a separate, explicit action that records who and when', async () => {
    const w = world();
    await w.workflow.updateHandoverField('act-1', KEY, plan(english(), maths()), 'mentor-1', null);
    const stored = fieldOf(w.db, KEY).value;
    await w.workflow.setHandoverFieldVerification('act-1', KEY, { verified: true, basedOn: stored }, 'mentor-1');
    expect(w.db.rows('enrollmentHandoverFieldVerification')[0]).toMatchObject({ fieldKey: KEY, verifiedByUserId: 'mentor-1', verifiedValue: stored });
    const view = (await w.workflow.getWorkspace('act-1', await w.scope('mentor-1'))).handover as any;
    expect(view.fieldVerifications).toEqual([expect.objectContaining({ fieldKey: KEY, verified: true, changedSinceVerified: false })]);
  });

  it('changing any subject, day, length or total after verifying ends the verification and keeps the earlier one on record', async () => {
    const changes: Array<[string, (p: any) => any]> = [
      ['a day is added', (p) => { p.subjects[0] = { ...english(), totalMinutes: 300, sessions: [...english().sessions, weekly('Friday', 60)] }; return p; }],
      ['a class length changes', (p) => { p.subjects[0] = { ...english(), distribution: 'CUSTOM', sessions: [weekly('Monday', 90), weekly('Tuesday', 30), weekly('Thursday', 60), weekly('Saturday', 60)] }; return p; }],
      ['the frequency changes', (p) => { p.subjects[0] = { ...english(), frequency: 'BIWEEKLY', sessions: english().sessions.map((s) => ({ ...s, week: 1 })) }; return p; }],
      ['a time is set', (p) => { p.subjects[0].sessions[0] = weekly('Monday', 60, { start: '16:00' }); return p; }],
      ['a subject is removed', (p) => { p.subjects.pop(); return p; }],
      ['the level changes', (p) => { p.subjects[0] = { ...english(), gradeId: 'g-9' }; return p; }],
    ];
    for (const [label, change] of changes) {
      const w = world();
      await w.workflow.updateHandoverField('act-1', KEY, plan(english(), maths()), 'mentor-1', null);
      const first = fieldOf(w.db, KEY).value;
      await w.workflow.setHandoverFieldVerification('act-1', KEY, { verified: true, basedOn: first }, 'mentor-1');
      await w.workflow.updateHandoverField('act-1', KEY, change(JSON.parse(JSON.stringify(first))), 'mentor-1', first);

      const view = (await w.workflow.getWorkspace('act-1', await w.scope('mentor-1'))).handover as any;
      expect({ label, row: view.fieldVerifications[0] }).toEqual({ label, row: expect.objectContaining({ verified: false, changedSinceVerified: true }) });
      expect(w.db.rows('enrollmentHandoverFieldVerification')[0].verifiedValue).toEqual(first); // the earlier confirmation is still there
    }
  });

  it('after the change it can be verified again, as a new recorded step', async () => {
    const w = world();
    await w.workflow.updateHandoverField('act-1', KEY, plan(english()), 'mentor-1', null);
    const first = fieldOf(w.db, KEY).value;
    await w.workflow.setHandoverFieldVerification('act-1', KEY, { verified: true, basedOn: first }, 'mentor-1');
    await w.workflow.updateHandoverField('act-1', KEY, plan(english(), maths()), 'mentor-1', first);
    const second = fieldOf(w.db, KEY).value;
    await w.workflow.setHandoverFieldVerification('act-1', KEY, { verified: true, basedOn: second }, 'mentor-1');
    expect(eventsOf(w).map((e) => e.type)).toEqual(['HANDOVER_FIELD_UPDATED', 'HANDOVER_FIELD_VERIFIED', 'HANDOVER_FIELD_UPDATED', 'HANDOVER_FIELD_VERIFIED']);
    const view = (await w.workflow.getWorkspace('act-1', await w.scope('mentor-1'))).handover as any;
    expect(view.fieldVerifications).toEqual([expect.objectContaining({ verified: true, changedSinceVerified: false })]);
  });

  it('the history holds the whole previous and new schedule, who changed it, and whether a verification ended', async () => {
    const w = world();
    await w.workflow.updateHandoverField('act-1', KEY, plan(english()), 'mentor-1', null);
    const first = fieldOf(w.db, KEY).value;
    await w.workflow.setHandoverFieldVerification('act-1', KEY, { verified: true, basedOn: first }, 'mentor-1');
    await w.workflow.updateHandoverField('act-1', KEY, plan(english(), maths()), 'mentor-1', first);
    const [collected, verified, edited] = eventsOf(w);
    expect(collected.payload).toMatchObject({ fieldKey: KEY, previous: null, verificationInvalidated: false, origin: 'MENTOR_COLLECTED' });
    expect(collected.payload.next.subjects).toHaveLength(1);
    expect(verified).toMatchObject({ type: 'HANDOVER_FIELD_VERIFIED', actorUserId: 'mentor-1' });
    expect(edited).toMatchObject({ actorUserId: 'mentor-1', payload: { fieldKey: KEY, verificationInvalidated: true } });
    expect(edited.payload.previous.subjects).toHaveLength(1);
    expect(edited.payload.next.subjects).toHaveLength(2);
  });

  it('a stale save or verification of the schedule is refused', async () => {
    const w = world();
    await w.workflow.updateHandoverField('act-1', KEY, plan(english()), 'mentor-1', null);
    const seen = fieldOf(w.db, KEY).value;
    await w.workflow.updateHandoverField('act-1', KEY, plan(english(), maths()), 'mentor-1', seen); // another tab
    await expect(w.workflow.updateHandoverField('act-1', KEY, plan(english(), science()), 'mentor-1', seen)).rejects.toBeInstanceOf(ConflictException);
    await expect(w.workflow.setHandoverFieldVerification('act-1', KEY, { verified: true, basedOn: seen }, 'mentor-1')).rejects.toBeInstanceOf(ConflictException);
    expect(fieldOf(w.db, KEY).value.subjects).toHaveLength(2);
  });
});

describe('Subject-wise preferred schedule: who may use it', () => {
  it('only the assigned Mentor can save or verify: the Head, CEO, CO_FOUNDER, another Mentor and a Counselor are refused', async () => {
    const w = world();
    await w.workflow.updateHandoverField('act-1', KEY, plan(english()), 'mentor-1', null);
    const before = JSON.stringify(w.db.rows('enrollmentHandoverField'));
    for (const user of ['head-1', 'ceo-1', 'cofounder-1', 'mentor-2', 'counselor-1']) {
      await expect(w.workflow.updateHandoverField('act-1', KEY, plan(english(), maths()), user, null)).rejects.toBeInstanceOf(ForbiddenException);
      await expect(w.workflow.setHandoverFieldVerification('act-1', KEY, { verified: true }, user)).rejects.toBeInstanceOf(ForbiddenException);
    }
    expect(JSON.stringify(w.db.rows('enrollmentHandoverField'))).toBe(before);
    expect(w.db.rows('enrollmentHandoverFieldVerification')).toHaveLength(0);
  });

  it('nothing can be saved before the Meeting with Parents is open, or while the workflow is on hold', async () => {
    const early = world({ at: 1 });
    await expect(early.workflow.updateHandoverField('act-1', KEY, plan(english()), 'mentor-1', null)).rejects.toBeInstanceOf(ConflictException);
    const onHold = world({ status: 'ACTIVATION_ON_HOLD' });
    await expect(onHold.workflow.updateHandoverField('act-1', KEY, plan(english()), 'mentor-1', null)).rejects.toBeInstanceOf(ConflictException);
  });

  it('the Head, CEO and Demo Counselor hold neither the stage work nor the stage verify permission', () => {
    for (const user of ['head-1', 'ceo-1', 'counselor-1']) {
      expect(PERMS[user]).not.toContain('mentoring.stage.work');
      expect(PERMS[user]).not.toContain('mentoring.stage.verify');
    }
  });

  it('the page is given the active subjects and levels, the department default length, and whether the viewer may add a subject', async () => {
    const w = world();
    const fields = ((await w.workflow.getWorkspace('act-1', await w.scope('mentor-1'))).handover as any).editableFields;
    const editor = fields.find((f: any) => f.key === KEY);
    expect(editor).toMatchObject({ type: 'SCHEDULE', columns: null, options: null });
    expect(editor.schedule.subjects.map((s: any) => s.name)).toEqual(['English', 'Mathematics', 'Science', 'Social Studies']); // Latin is switched off
    expect(editor.schedule.grades.map((g: any) => g.name)).toEqual(['Grade 8', 'Grade 9']); // Grade 7 is switched off
    expect(editor.schedule.subjects[0]).toEqual({ id: 'sub-en', name: 'English' });
    expect(editor.schedule.defaultSessionMinutes).toBe(60);
    expect(editor.schedule.canAddSubject).toBe(false); // a Mentor does not hold the reference data permission
    expect(fields.filter((f: any) => f.schedule !== null)).toHaveLength(1);
  });

  it('adding a subject to the master list is offered only to a holder of the reference data permission', async () => {
    const saved = PERMS['mentor-1'];
    PERMS['mentor-1'] = [...saved, 'reference.manage'];
    try {
      const w = world();
      const editor = ((await w.workflow.getWorkspace('act-1', await w.scope('mentor-1'))).handover as any).editableFields.find((f: any) => f.key === KEY);
      expect(editor.schedule.canAddSubject).toBe(true);
    } finally {
      PERMS['mentor-1'] = saved;
    }
    const ceo = world();
    expect(((await ceo.workflow.getWorkspace('act-1', await ceo.scope('ceo-1'))).handover as any).editableFields.find((f: any) => f.key === KEY).schedule.canAddSubject).toBe(false);
  });

  it('a subject or level already in the saved plan stays usable after it is switched off', async () => {
    const w = world();
    await w.workflow.updateHandoverField('act-1', KEY, plan(english()), 'mentor-1', null);
    w.db.rows('subject').find((s) => s.id === 'sub-en')!.isActive = false;
    const stored = fieldOf(w.db, KEY).value;
    const editor = ((await w.workflow.getWorkspace('act-1', await w.scope('mentor-1'))).handover as any).editableFields.find((f: any) => f.key === KEY);
    expect(editor.schedule.subjects.map((s: any) => s.name)).toContain('English');
    await w.workflow.updateHandoverField('act-1', KEY, plan({ ...english(), totalMinutes: 300, sessions: [...english().sessions, weekly('Friday', 60)] }), 'mentor-1', stored);
    // but a switched-off subject cannot be added to a plan that does not already use it
    await expect(w.workflow.updateHandoverField('act-1', KEY, plan(maths(), { ...science(), subjectId: 'sub-old' }), 'mentor-1', null)).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('Subject-wise preferred schedule: timetables saved before it existed', () => {
  const LEGACY = [{ day: 'Monday', start: '16:00', end: '17:00' }, { day: 'Thursday', start: '18:00', end: '19:00' }];
  const withLegacy = () => {
    const w = world();
    w.db.seed('enrollmentHandoverField', { handoverId: 'ho-1', fieldKey: KEY, value: LEGACY, origin: 'MENTOR_COLLECTED', salesValue: null, createdByUserId: 'mentor-1', updatedByUserId: 'mentor-1' });
    return w;
  };

  it('an old timetable is still returned unchanged, so it can be shown', async () => {
    const w = withLegacy();
    const view = (await w.workflow.getWorkspace('act-1', await w.scope('mentor-1'))).handover as any;
    expect(view.fieldValues[0]).toMatchObject({ fieldKey: KEY, value: LEGACY });
  });

  it('an old timetable that was verified keeps its verification until it is replaced', async () => {
    const w = withLegacy();
    await w.workflow.setHandoverFieldVerification('act-1', KEY, { verified: true, basedOn: LEGACY }, 'mentor-1');
    const view = (await w.workflow.getWorkspace('act-1', await w.scope('mentor-1'))).handover as any;
    expect(view.fieldVerifications).toEqual([expect.objectContaining({ verified: true, changedSinceVerified: false })]);
  });

  it('replacing it with a subject schedule is allowed, ends that verification, and keeps the old rows in the history', async () => {
    const w = withLegacy();
    await w.workflow.setHandoverFieldVerification('act-1', KEY, { verified: true, basedOn: LEGACY }, 'mentor-1');
    await w.workflow.updateHandoverField('act-1', KEY, plan(english()), 'mentor-1', LEGACY);
    expect(fieldOf(w.db, KEY).value.version).toBe(2);
    const event = w.db.rows('mentoringEvent').find((e) => e.type === 'HANDOVER_FIELD_UPDATED')!;
    expect(event.payload).toMatchObject({ previous: LEGACY, verificationInvalidated: true });
    const view = (await w.workflow.getWorkspace('act-1', await w.scope('mentor-1'))).handover as any;
    expect(view.fieldVerifications).toEqual([expect.objectContaining({ verified: false, changedSinceVerified: true })]);
  });

  it('a page that still sends the old rows is refused with a message to reload, and the old timetable is not touched', async () => {
    const w = withLegacy();
    await expect(w.workflow.updateHandoverField('act-1', KEY, LEGACY, 'mentor-1', LEGACY)).rejects.toThrow(/not in the expected format. Reload the page/);
    expect(fieldOf(w.db, KEY).value).toEqual(LEGACY);
  });

  it('the schedule field is still registered, verifiable and labelled for the checklist and the page', () => {
    expect(getHandoverField(KEY)).toEqual({ key: KEY, type: 'SCHEDULE' });
    expect(HANDOVER_FIELD_LABELS[KEY]).toBe('Preferred Timetable / Schedule');
    expect(Object.keys(HANDOVER_FIELDS)).toContain(KEY);
    expect(isVerifiableField(KEY)).toBe(true);
  });
});
