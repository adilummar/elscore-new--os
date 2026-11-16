/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-member-access */
import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';

import { PERMISSIONS_KEY } from '../../common/rbac/require-permissions.decorator';

import { MentoringAccessService } from './mentoring-access.service';
import { HANDOVER_FIELDS, PROFILE_FIELD_KEYS } from './mentoring-handover-fields';
import { MentoringHistoryService } from './mentoring-history.service';
import { MentoringStudentHubService } from './mentoring-student-hub.service';
import { MentoringTutorService } from './mentoring-tutor.service';
import { MentoringWorkflowController } from './mentoring-workflow.controller';
import { MentoringWorkflowService } from './mentoring-workflow.service';
import { clone, FakeDb } from './testing/mentoring-fake-db';

const PERMS: Record<string, string[]> = {
  'mentor-1': ['mentoring.student.read-assigned', 'mentoring.stage.work', 'mentoring.stage.verify'],
  'mentor-2': ['mentoring.student.read-assigned', 'mentoring.stage.work', 'mentoring.stage.verify'],
  'head-1': ['mentoring.student.read-all', 'mentoring.exception.authorize', 'mentoring.approval.final'],
  'ceo-1': ['mentoring.student.read-all'],
  'counselor-1': ['mentoring.student.read-assigned', 'mentoring.task.work'],
};
const SALES_PHONE = '+971500000000';

function world(status = 'ACTIVATED') {
  const db = new FakeDb();
  db.seed('student', { id: 'stu-1', businessId: 'STU-0001', firstName: 'Asha', lastName: 'K', currentGrade: '8', schoolName: 'Old School' });
  db.seed('lead', { id: 'lead-1', businessId: 'LED-0001', firstName: 'Parent', lastName: 'One', primaryPhone: SALES_PHONE, altPhone1: null, altPhone2: null, whatsappNumber: null });
  db.seed('enrollmentHandover', {
    id: 'ho-1', status: 'COMPLETED', completedAt: new Date(),
    transferredFields: [
      { field: 'student.firstName', source: 'STUDENT', value: 'Asha' },
      { field: 'student.dateOfBirth', source: 'STUDENT', value: '2015-05-12' },
      { field: 'student.schoolName', source: 'STUDENT', value: 'Old School' },
      { field: 'parent.name', source: 'LEAD', value: 'Parent One' },
      { field: 'parent.primaryPhone', source: 'LEAD', value: SALES_PHONE },
    ],
    missingFields: [], sourceSnapshot: { lead: { primaryPhone: SALES_PHONE } },
  });
  for (const id of Object.keys(PERMS)) db.seed('user', { id, status: 'ACTIVE' });
  db.seed('grade', { id: 'g-8', name: 'Grade 8', sortOrder: 8, isActive: true });
  db.seed('grade', { id: 'g-9', name: 'Grade 9', sortOrder: 9, isActive: true });
  db.seed('curriculum', { name: 'CBSE' });
  db.seed('mentoringActivation', { id: 'act-1', leadId: 'lead-1', studentId: 'stu-1', handoverId: 'ho-1', status, currentStage: 7, currentMentorUserId: 'mentor-1', activatedAt: new Date('2026-11-01T00:00:00Z') });
  for (let i = 1; i <= 7; i++) db.seed('mentoringStage', { activationId: 'act-1', stageNumber: i, key: `S${i}`, status: 'COMPLETED', startedAt: new Date(), completedAt: new Date() });
  // Operational records a profile edit must never touch.
  db.seed('mentoringClassSession', { id: 'cs-1', activationId: 'act-1', status: 'VERIFIED', verifiedMinutes: 60 });
  db.seed('mentoringExam', { id: 'ex-1', activationId: 'act-1', title: 'T', conducted: null });
  db.seed('mentoringTutorAssignment', { id: 'ta-1', activationId: 'act-1', subjectId: 'sub-en', status: 'ACTIVE' });
  db.seed('mentoringLearningPlan', { id: 'lp-1', activationId: 'act-1', status: 'APPROVED' });

  const history = new MentoringHistoryService({ recordInTx: jest.fn().mockResolvedValue(undefined) } as any);
  const access = new MentoringAccessService({ getPermissionsForUser: jest.fn((id: string) => Promise.resolve(new Set(PERMS[id] ?? []))) } as any);
  const workflow = new MentoringWorkflowService(db as any, access, history, new MentoringTutorService(db as any, history));
  const hub = new MentoringStudentHubService(db as any, access, {} as any, {} as any, {} as any, {} as any);
  return { db, workflow, hub, scope: (u: string) => access.scopeFor(u) };
}

const operational = (db: FakeDb) => clone({ s: db.rows('mentoringClassSession'), e: db.rows('mentoringExam'), t: db.rows('mentoringTutorAssignment'), p: db.rows('mentoringLearningPlan'), stages: db.rows('mentoringStage') });
const salesData = (db: FakeDb) => clone({ handover: db.rows('enrollmentHandover')[0], lead: db.rows('lead')[0], student: db.rows('student')[0] });

describe('Editing the profile of an activated student', () => {
  it('lets the assigned Mentor edit every student and parent field the handover holds', async () => {
    const w = world();
    const changes: Record<string, unknown> = {
      'student.firstName': 'Ashwin', 'student.lastName': 'Kumar', 'student.dateOfBirth': '2015-06-01', 'student.gender': 'Female', 'student.schoolName': 'New School',
      'student.currentGrade': '9', 'student.grade': 'Grade 9', 'student.curriculum': 'CBSE', 'student.cityLocation': 'Dubai', 'student.notes': 'Likes maths', 'student.learningConcerns': 'Reading speed',
      'parent.name': 'New Parent', 'parent.primaryPhone': '+971 50 111 2222', 'parent.altPhone1': '+971 50 333 4444', 'parent.altPhone2': '+971 50 555 6666', 'parent.whatsappNumber': '+971 50 777 8888', 'parent.relationship': 'Mother',
      'academic.preferredLanguage': 'English', 'academic.previousMarks': '80%', 'academic.subjectNotes': 'Needs help',
    };
    // Every supported student and parent field is covered by this test: if a field is added to the handover, this fails until it is considered.
    expect(Object.keys(changes).sort()).toEqual([...PROFILE_FIELD_KEYS].sort());
    const r = await w.workflow.updateStudentProfile('act-1', { changes }, 'mentor-1');
    expect(r.changed.sort()).toEqual(Object.keys(changes).sort());
    for (const key of ['student.schoolName', 'parent.name', 'student.grade']) expect(w.db.rows('enrollmentHandoverField').find((f) => f.fieldKey === key)).toBeDefined();
  });

  it('keeps unchanged fields, stores the Sales value beside the new one and never writes the Student or the Lead', async () => {
    const w = world();
    const before = salesData(w.db);
    const r = await w.workflow.updateStudentProfile('act-1', { changes: { 'student.schoolName': 'New School', 'parent.name': 'Parent One' } }, 'mentor-1');
    expect(r).toEqual({ changed: ['student.schoolName'], unchanged: ['parent.name'] }); // an identical value is not a change
    expect(salesData(w.db)).toEqual(before);
    expect(w.db.rows('enrollmentHandoverField').find((f) => f.fieldKey === 'student.schoolName')).toMatchObject({ value: 'New School', salesValue: 'Old School', origin: 'MENTORING_UPDATED', updatedByUserId: 'mentor-1' });
    expect(w.db.rows('enrollmentHandoverField').find((f) => f.fieldKey === 'student.firstName')).toBeUndefined(); // untouched fields get no row
  });

  it('records who changed what: the old and the new value, the source, the role and the reason', async () => {
    const w = world();
    await w.workflow.updateStudentProfile('act-1', { changes: { 'parent.primaryPhone': '+971 50 111 2222' }, reason: 'Parent changed number' }, 'mentor-1');
    const events = w.db.rows('mentoringEvent').filter((e) => e.type === 'HANDOVER_FIELD_UPDATED');
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ activationId: 'act-1', actorUserId: 'mentor-1', payload: { fieldKey: 'parent.primaryPhone', previous: SALES_PHONE, source: 'ACTIVATED_PROFILE_EDIT', actorRole: 'ASSIGNED_MENTOR', remarks: 'Parent changed number' } });
    expect(events[0].payload.next).toBe('+971501112222');
    expect(events[0].createdAt).toBeInstanceOf(Date);
  });

  it('keeps the activation, its stages and every operational record exactly as they were', async () => {
    const w = world();
    const ops = operational(w.db);
    await w.workflow.updateStudentProfile('act-1', { changes: { 'student.firstName': 'Ashwin', 'parent.name': 'X Parent' } }, 'mentor-1');
    expect(operational(w.db)).toEqual(ops);
    expect(w.db.rows('mentoringActivation')[0]).toMatchObject({ status: 'ACTIVATED', currentMentorUserId: 'mentor-1', currentStage: 7 });
    expect(w.db.rows('mentoringStage').every((s) => s.status === 'COMPLETED')).toBe(true);
  });

  it('refuses anyone but the assigned Mentor, and a student that is not activated', async () => {
    const w = world();
    const change = { changes: { 'student.schoolName': 'X' } };
    await expect(w.workflow.updateStudentProfile('act-1', change, 'mentor-2')).rejects.toBeInstanceOf(ForbiddenException); // another Mentor's student
    await expect(w.workflow.updateStudentProfile('act-1', change, 'head-1')).rejects.toBeInstanceOf(ForbiddenException);
    await expect(w.workflow.updateStudentProfile('act-1', change, 'ceo-1')).rejects.toBeInstanceOf(ForbiddenException);
    await expect(w.workflow.updateStudentProfile('act-1', change, 'counselor-1')).rejects.toBeInstanceOf(ForbiddenException);
    expect(w.db.rows('enrollmentHandoverField')).toHaveLength(0);
    const early = world('ACTIVATION_IN_PROGRESS');
    await expect(early.workflow.updateStudentProfile('act-1', change, 'mentor-1')).rejects.toBeInstanceOf(ConflictException);
  });

  it('is limited by the route to the permission that lets a Mentor work, so a Counselor or a read-only role never reaches the service', () => {
    const perms = Reflect.getMetadata(PERMISSIONS_KEY, (MentoringWorkflowController.prototype as unknown as Record<string, object>).updateProfile) as string[];
    expect(perms).toEqual(['mentoring.stage.work']);
    expect(PERMS['counselor-1']).not.toContain('mentoring.stage.work');
    expect(PERMS['ceo-1']).not.toContain('mentoring.stage.work');
    expect(PERMS['head-1']).not.toContain('mentoring.stage.work');
  });

  it('rejects unknown, unauthorised and operational fields, so nothing can be mass assigned', async () => {
    const w = world();
    const ops = operational(w.db);
    for (const key of ['status', 'currentMentorUserId', 'student.id', 'tutor.assignments', 'timetable.schedule', 'examination.upcomingDates', 'parentExpectations', '__proto__', 'constructor']) {
      await expect(w.workflow.updateStudentProfile('act-1', { changes: { [key]: 'x' } }, 'mentor-1')).rejects.toBeInstanceOf(BadRequestException);
    }
    await expect(w.workflow.updateStudentProfile('act-1', { changes: { 'student.schoolName': 'ok' }, basedOn: { status: 'x' } }, 'mentor-1')).rejects.toBeInstanceOf(BadRequestException);
    await expect(w.workflow.updateStudentProfile('act-1', { changes: {} }, 'mentor-1')).rejects.toBeInstanceOf(BadRequestException);
    await expect(w.workflow.updateStudentProfile('act-1', { changes: ['student.schoolName'] }, 'mentor-1')).rejects.toBeInstanceOf(BadRequestException);
    await expect(w.workflow.updateStudentProfile('act-1', {}, 'mentor-1')).rejects.toBeInstanceOf(BadRequestException);
    expect(operational(w.db)).toEqual(ops);
    expect(w.db.rows('enrollmentHandoverField')).toHaveLength(0);
  });

  it('validates every value with the existing field rules and saves nothing when one is wrong', async () => {
    const w = world();
    for (const bad of [
      { 'student.dateOfBirth': '2999-01-01' }, { 'student.dateOfBirth': 'soon' }, { 'student.gender': 'Robot' }, { 'student.grade': 'Grade 99' }, { 'parent.primaryPhone': 'abc' },
      { 'student.firstName': '   ' }, { 'student.firstName': 'x'.repeat(101) }, { 'student.schoolName': 42 }, { 'parent.relationship': 'Cousin' },
    ]) await expect(w.workflow.updateStudentProfile('act-1', { changes: bad }, 'mentor-1')).rejects.toBeInstanceOf(BadRequestException);
    await expect(w.workflow.updateStudentProfile('act-1', { changes: { 'student.schoolName': 'x' }, reason: 'y'.repeat(501) }, 'mentor-1')).rejects.toBeInstanceOf(BadRequestException);
    // One bad value among good ones saves none of them: the edit is a single transaction.
    await expect(w.workflow.updateStudentProfile('act-1', { changes: { 'student.schoolName': 'Good School', 'student.gender': 'Robot' } }, 'mentor-1')).rejects.toBeInstanceOf(BadRequestException);
    expect(w.db.rows('enrollmentHandoverField')).toHaveLength(0);
  });

  it('refuses a save made over a newer edit instead of overwriting it', async () => {
    const w = world();
    await w.workflow.updateStudentProfile('act-1', { changes: { 'student.schoolName': 'Mentor A school' } }, 'mentor-1');
    await expect(w.workflow.updateStudentProfile('act-1', { changes: { 'student.schoolName': 'Stale write' }, basedOn: { 'student.schoolName': 'Old School' } }, 'mentor-1')).rejects.toBeInstanceOf(ConflictException);
    expect(w.db.rows('enrollmentHandoverField').find((f) => f.fieldKey === 'student.schoolName')!.value).toBe('Mentor A school');
    await expect(w.workflow.updateStudentProfile('act-1', { changes: { 'student.schoolName': 'Fresh write' }, basedOn: { 'student.schoolName': 'Mentor A school' } }, 'mentor-1')).resolves.toMatchObject({ changed: ['student.schoolName'] });
  });

  it('ends a confirmation that covered the old value, in the history, without reopening a stage', async () => {
    const w = world();
    w.db.seed('enrollmentHandoverFieldVerification', { handoverId: 'ho-1', fieldKey: 'parent.primaryPhone', verifiedValue: SALES_PHONE, verifiedByUserId: 'mentor-1', verifiedAt: new Date() });
    await w.workflow.updateStudentProfile('act-1', { changes: { 'parent.primaryPhone': '+971 50 111 2222' } }, 'mentor-1');
    const e = w.db.rows('mentoringEvent').find((x) => x.type === 'HANDOVER_FIELD_UPDATED')!;
    expect(e.payload.verificationInvalidated).toBe(true);
    expect(w.db.rows('mentoringStage').every((s) => s.status === 'COMPLETED')).toBe(true);
  });
});

describe('Reading the profile for the form', () => {
  it('shows the saved value, the Sales value and where it came from, and offers every field', async () => {
    const w = world();
    await w.workflow.updateStudentProfile('act-1', { changes: { 'student.schoolName': 'New School' } }, 'mentor-1');
    const p = await w.hub.profile('act-1', await w.scope('mentor-1'));
    expect(p.canEdit).toBe(true);
    expect(p.fields.map((f) => f.key).sort()).toEqual([...PROFILE_FIELD_KEYS].sort());
    expect(p.fields.find((f) => f.key === 'student.schoolName')).toMatchObject({ value: 'New School', salesValue: 'Old School', source: 'MENTORING_UPDATED', group: 'STUDENT', type: 'TEXT' });
    expect(p.fields.find((f) => f.key === 'parent.primaryPhone')).toMatchObject({ value: SALES_PHONE, source: 'SALES', group: 'PARENT', required: true });
    expect(p.fields.find((f) => f.key === 'student.grade')!.options).toEqual(['Grade 8', 'Grade 9']);
    expect(Object.keys(HANDOVER_FIELDS)).toEqual(expect.arrayContaining(PROFILE_FIELD_KEYS));
  });

  it('is read only for everyone but the assigned Mentor, hides parent fields from a Counselor, and is not found for another Mentor', async () => {
    const w = world();
    expect((await w.hub.profile('act-1', await w.scope('head-1'))).canEdit).toBe(false);
    expect((await w.hub.profile('act-1', await w.scope('ceo-1'))).canEdit).toBe(false);
    w.db.seed('mentoringTask', { activationId: 'act-1', assigneeUserId: 'counselor-1', title: 'x' });
    const c = await w.hub.profile('act-1', await w.scope('counselor-1'));
    expect(c.canEdit).toBe(false);
    expect(c.parentHidden).toBe(true);
    expect(c.fields.some((f) => f.group === 'PARENT')).toBe(false);
    await expect(w.hub.profile('act-1', await w.scope('mentor-2'))).rejects.toThrow('Student not found');
  });
});
