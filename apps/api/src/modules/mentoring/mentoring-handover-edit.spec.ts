/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-member-access */
import { readFileSync } from 'fs';
import { join } from 'path';

import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';

import { PERMISSIONS_KEY } from '../../common/rbac/require-permissions.decorator';

import { MentoringAccessService } from './mentoring-access.service';
import { HANDOVER_FIELDS, getHandoverField, validateHandoverFieldValue } from './mentoring-handover-fields';
import { MentoringHistoryService } from './mentoring-history.service';
import { unresolvedMandatoryItems } from './mentoring-stage.helpers';
import { MentoringWorkflowController } from './mentoring-workflow.controller';
import { MentoringWorkflowService } from './mentoring-workflow.service';
import { CHECKLIST, getChecklistDefinition } from './mentoring.constants';
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

function world(over: { status?: string } = {}) {
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
  db.seed('grade', { name: 'Grade 8' }); db.seed('grade', { name: 'Grade 9' });
  db.seed('curriculum', { name: 'CBSE' }); db.seed('curriculum', { name: 'IGCSE' });
  const activation = db.seed('mentoringActivation', {
    id: 'act-1', leadId: 'lead-1', studentId: 'stu-1', handoverId: 'ho-1',
    status: over.status ?? 'ACTIVATION_IN_PROGRESS', currentStage: 1, currentMentorUserId: 'mentor-1', submittedForApprovalAt: null, activatedAt: null,
  });
  for (let i = 1; i <= 7; i++) {
    db.seed('mentoringStage', { activationId: activation.id, stageNumber: i, key: `S${i}`, status: i === 1 ? 'IN_PROGRESS' : 'NOT_STARTED', startedAt: i === 1 ? new Date() : null });
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
    const schedule = [{ day: 'monday', start: '16:00', end: '17:30' }, { day: 'Thursday', start: '18:00', end: '19:00' }];
    await workflow.updateHandoverField('act-1', 'timetable.schedule', schedule, 'mentor-1');
    expect(fieldOf(db, 'timetable.schedule').value).toEqual([{ day: 'Monday', start: '16:00', end: '17:30' }, { day: 'Thursday', start: '18:00', end: '19:00' }]);
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
    expect(Object.keys(HANDOVER_FIELDS)).toHaveLength(24);
    expect(getHandoverField('academic.subjects')).toBeUndefined();
    expect(getHandoverField('hasOwnProperty')).toBeUndefined();
  });

  it('reference-data selects refuse values that are not in the reference list', () => {
    expect(check('student.grade', 'Grade 8')()).toBe('Grade 8');
    expect(() => validateHandoverFieldValue(getHandoverField('student.grade')!, 'Grade 8', { today: new Date() })).toThrow(/no options/i);
  });
});

describe('Admission handover checklist: definitions', () => {
  const stage1 = getChecklistDefinition(1);
  const APPROVED_GROUPS = [
    'student_parent_verified', 'tutor_subject_confirmed', 'weekly_timetable_verified', 'academic_requirements_recorded',
    'previous_marks', 'examination_details', 'parent_expectations',
  ];

  it('splits the seven approved requirements into individual mandatory items', () => {
    expect(stage1).toHaveLength(26);
    expect(Array.from(new Set(stage1.map((d) => d.group)))).toEqual(APPROVED_GROUPS);
    expect(stage1.every((d) => d.mandatory)).toBe(true);
    expect(new Set(stage1.map((d) => d.key)).size).toBe(stage1.length);
    expect(stage1.map((d) => d.label)).toEqual(expect.arrayContaining([
      'Student details checked', 'Tutor assignment confirmed', 'Preferred days collected', 'Learning requirements reviewed',
      'Previous marks requested', 'Upcoming examination dates collected', 'Parent expectations recorded', 'Follow-up requirements identified',
    ]));
  });

  it('the other six stages are unchanged and ungrouped', () => {
    for (const n of [2, 3, 4, 5, 6, 7]) expect(getChecklistDefinition(n).every((d) => !d.group)).toBe(true);
    expect(Object.keys(CHECKLIST)).toEqual(['1', '2', '3', '4', '5', '6', '7']);
  });
});

describe('Checklist persistence, progress and blocking', () => {
  const keys = getChecklistDefinition(1).map((d) => d.key);
  const resolveAll = async (w: ReturnType<typeof world>, except: string[] = []) => {
    for (const key of keys.filter((k) => !except.includes(k))) await w.workflow.updateChecklistItem('act-1', 1, key, { state: 'VERIFIED' }, 'mentor-1');
  };

  it('a completed item is saved with who and when, and is still there after a reload', async () => {
    const w = world();
    await w.workflow.updateChecklistItem('act-1', 1, 'student_details_checked', { state: 'VERIFIED', note: 'Checked against the admission form', evidenceRef: 'https://files.example/adm-1' }, 'mentor-1');

    const fresh = services(w.db);
    const item = (await fresh.workflow.getWorkspace('act-1', await fresh.scope('head-1'))).stages[0].checklist.find((i: any) => i.key === 'student_details_checked');
    expect(item).toMatchObject({
      state: 'VERIFIED', note: 'Checked against the admission form', evidenceRef: 'https://files.example/adm-1',
      group: 'student_parent_verified', groupLabel: 'Student and parent details verified', mandatory: true,
      updatedByUserId: 'mentor-1', updatedByName: 'Mina Mentor', updatedAt: expect.any(Date),
    });
  });

  it('un-ticking an item puts it back to pending and keeps the history', async () => {
    const w = world();
    await w.workflow.updateChecklistItem('act-1', 1, 'student_details_checked', { state: 'VERIFIED' }, 'mentor-1');
    await w.workflow.updateChecklistItem('act-1', 1, 'student_details_checked', { state: 'PENDING_COLLECTION' }, 'mentor-1');
    expect(w.db.rows('stageChecklistResponse').find((r) => r.itemKey === 'student_details_checked')!.state).toBe('PENDING_COLLECTION');
    expect(w.db.rows('mentoringEvent').filter((e) => e.type === 'CHECKLIST_UPDATED')).toHaveLength(2);
  });

  it('marking unavailable or not applicable needs a reason', async () => {
    const w = world();
    await expect(w.workflow.updateChecklistItem('act-1', 1, 'previous_marks_collected', { state: 'UNAVAILABLE' }, 'mentor-1')).rejects.toBeInstanceOf(BadRequestException);
    await expect(w.workflow.updateChecklistItem('act-1', 1, 'previous_marks_collected', { state: 'UNAVAILABLE', reason: 'School has not issued reports' }, 'mentor-1')).resolves.toBeDefined();
  });

  it('verification is blocked while mandatory items are outstanding, and lists them', async () => {
    const w = world();
    await resolveAll(w, ['follow_up_identified', 'timetable_confirmed']);
    await expect(w.workflow.verifyStage('act-1', 1, 'mentor-1')).rejects.toMatchObject({
      response: { message: 'Mandatory checklist items are not resolved', unresolved: ['timetable_confirmed', 'follow_up_identified'] },
    });
  });

  it('items whose rows were never created still block verification (they cannot be skipped)', async () => {
    const w = world();
    // No checklist rows exist at all yet.
    expect(w.db.rows('stageChecklistResponse')).toHaveLength(0);
    await expect(w.workflow.verifyStage('act-1', 1, 'mentor-1')).rejects.toBeInstanceOf(ConflictException);
  });

  it('rows left from the old definition neither block nor count', async () => {
    const w = world();
    const stage = w.db.rows('mentoringStage').find((s) => s.stageNumber === 1)!;
    w.db.seed('stageChecklistResponse', { stageId: stage.id, itemKey: 'student_parent_verified', mandatory: true, definitionVersion: 1, state: 'PENDING_COLLECTION', value: null, note: null, reason: null, evidenceRef: null });
    await resolveAll(w);
    const done = await w.workflow.verifyStage('act-1', 1, 'mentor-1');
    expect(done).toBeDefined();
    expect(w.db.rows('mentoringStage').find((s) => s.stageNumber === 1)!.status).toBe('COMPLETED');
  });

  it('resolving everything moves the stage to review and then it can be verified, by the Mentor only', async () => {
    const w = world();
    await resolveAll(w);
    expect(w.db.rows('mentoringStage').find((s) => s.stageNumber === 1)!.status).toBe('PENDING_REVIEW');
    await expect(w.workflow.verifyStage('act-1', 1, 'mentor-2')).rejects.toBeInstanceOf(ForbiddenException);
    await expect(w.workflow.verifyStage('act-1', 1, 'mentor-1')).resolves.toBeDefined();
  });

  it('a Head exception resolves one item, needs a reason, and records who, when and which item', async () => {
    const w = world();
    await resolveAll(w, ['previous_marks_collected']);
    await expect(w.workflow.authorizeException('act-1', 1, 'previous_marks_collected', '   ', 'head-1')).rejects.toBeInstanceOf(BadRequestException);

    await w.workflow.authorizeException('act-1', 1, 'previous_marks_collected', 'School is closed until January', 'head-1');

    const row = w.db.rows('workflowException')[0];
    expect(row).toMatchObject({ itemKey: 'previous_marks_collected', reason: 'School is closed until January', authorizedByUserId: 'head-1' });
    expect(row.createdAt).toBeInstanceOf(Date);
    expect(w.db.rows('mentoringEvent').find((e) => e.type === 'EXCEPTION_AUTHORIZED')).toMatchObject({ actorUserId: 'head-1', reason: 'School is closed until January', payload: { itemKey: 'previous_marks_collected', stageNumber: 1 } });

    const item = (await w.workflow.getWorkspace('act-1', await w.scope('mentor-1'))).stages[0].checklist.find((i: any) => i.key === 'previous_marks_collected');
    expect(item).toMatchObject({ exception: true, state: 'PENDING_COLLECTION', exceptionDetail: { reason: 'School is closed until January', authorizedByName: 'Hari Head', authorizedByUserId: 'head-1' } });
    expect(w.db.rows('mentoringStage').find((s) => s.stageNumber === 1)!.status).toBe('PENDING_REVIEW');
  });

  it('an ordinary tick is not an exception, and an exception does not change the item state', async () => {
    const w = world();
    await w.workflow.updateChecklistItem('act-1', 1, 'student_details_checked', { state: 'VERIFIED' }, 'mentor-1');
    expect(w.db.rows('workflowException')).toHaveLength(0);
    await w.workflow.authorizeException('act-1', 1, 'tutor_assignment_confirmed', 'Tutor not yet allocated', 'head-1');
    expect(w.db.rows('stageChecklistResponse').find((r) => r.itemKey === 'tutor_assignment_confirmed')?.state ?? 'PENDING_COLLECTION').toBe('PENDING_COLLECTION');
  });

  it('only the assigned Mentor can change items; the Head and a Counselor cannot', async () => {
    const w = world();
    for (const user of ['head-1', 'mentor-2', 'counselor-1', 'ceo-1']) {
      await expect(w.workflow.updateChecklistItem('act-1', 1, 'student_details_checked', { state: 'VERIFIED' }, user)).rejects.toBeInstanceOf(ForbiddenException);
    }
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
