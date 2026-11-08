import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';


import { MentoringAccessService } from './mentoring-access.service';
import { MentoringHistoryService } from './mentoring-history.service';
import { MentoringTaskService } from './mentoring-task.service';
import { MentoringTutorService } from './mentoring-tutor.service';
import { MentoringWorkflowService } from './mentoring-workflow.service';
import { getChecklistDefinition } from './mentoring.constants';
import { FakeDb } from './testing/mentoring-fake-db';

const PERMS: Record<string, string[]> = {
  'mentor-1': ['mentoring.student.read-assigned', 'mentoring.task.create', 'mentoring.task.verify', 'mentoring.stage.work', 'mentoring.stage.verify', 'mentoring.workflow.pause'],
  'mentor-2': ['mentoring.student.read-assigned', 'mentoring.task.create', 'mentoring.task.verify'],
  'head-1': ['mentoring.student.read-all', 'mentoring.task.create', 'mentoring.task.verify', 'mentoring.workflow.pause'],
  'counselor-1': ['mentoring.student.read-assigned', 'mentoring.task.work'],
  'counselor-2': ['mentoring.student.read-assigned', 'mentoring.task.work'],
};

function setup() {
  const db = new FakeDb();
  const history = new MentoringHistoryService({ recordInTx: jest.fn().mockResolvedValue(undefined) } as any);
  const access = new MentoringAccessService({ getPermissionsForUser: (id: string) => Promise.resolve(new Set(PERMS[id] ?? [])) } as any);
  const tasks = new MentoringTaskService(db as any, history);
  const workflow = new MentoringWorkflowService(db as any, access, history, new MentoringTutorService(db as any, history));
  const scope = (id: string) => access.scopeFor(id);

  db.seed('student', { id: 'stu-1', businessId: 'STU-0001', firstName: 'Asha', lastName: 'K' });
  db.seed('mentoringActivation', { id: 'act-1', leadId: 'lead-1', studentId: 'stu-1', handoverId: 'ho-1', status: 'ACTIVATION_IN_PROGRESS', currentStage: 1, currentMentorUserId: 'mentor-1' });
  const stage = db.seed('mentoringStage', { activationId: 'act-1', stageNumber: 1, key: 'ADMISSION_HANDOVER', status: 'IN_PROGRESS' });
  for (const d of getChecklistDefinition(1)) db.seed('stageChecklistResponse', { stageId: stage.id, itemKey: d.key, mandatory: d.mandatory, definitionVersion: 1 });
  for (const id of ['counselor-1', 'counselor-2']) {
    db.seed('user', { id, status: 'ACTIVE' });
    db.seed('mentoringStaffProfile', { userId: id, role: 'DEMO_COUNSELOR', isActive: true, acceptsAllocation: true });
    db.seed('userRole', { userId: id, role: { code: 'DEMO_COUNSELOR' }, user: { status: 'ACTIVE' } });
  }
  db.seed('user', { id: 'mentor-2', status: 'ACTIVE' });
  db.seed('mentoringStaffProfile', { userId: 'mentor-2', role: 'MENTOR', isActive: true, acceptsAllocation: true });
  db.seed('userRole', { userId: 'mentor-2', role: { code: 'MENTOR' }, user: { status: 'ACTIVE' } });
  return { db, tasks, workflow, scope, stage };
}

const newTask = (s: ReturnType<typeof setup>, over: Record<string, unknown> = {}) =>
  async () => s.tasks.create({ activationId: 'act-1', stageNumber: 1, title: 'Collect previous marks', assigneeUserId: 'counselor-1', ...over }, await s.scope('mentor-1'));

describe('Counselor tasks', () => {
  it('the assigned Mentor creates a task for an active Demo Counselor and the counselor is notified', async () => {
    const s = setup();
    const task = await newTask(s)();

    expect(task).toMatchObject({ status: 'OPEN', assigneeUserId: 'counselor-1', assignedByUserId: 'mentor-1', priority: 'MEDIUM' });
    expect(s.db.rows('notification').map((n) => n.recipientUserId)).toEqual(['counselor-1']);
    expect(s.db.rows('mentoringEvent').map((e) => e.type)).toContain('TASK_ASSIGNED');
  });

  it('tasks can only go to Demo Counselors, and only the student\'s Mentor or the Head can create them', async () => {
    const s = setup();
    await expect(newTask(s, { assigneeUserId: 'mentor-2' })()).rejects.toBeInstanceOf(BadRequestException);
    await expect(s.tasks.create({ activationId: 'act-1', title: 'x', assigneeUserId: 'counselor-1' } as any, await s.scope('mentor-2'))).rejects.toBeInstanceOf(ForbiddenException);
    await expect(s.tasks.create({ activationId: 'act-1', title: 'x', assigneeUserId: 'counselor-1' } as any, await s.scope('head-1'))).resolves.toBeDefined();
    await expect(newTask(s, { title: ' ' })()).rejects.toBeInstanceOf(BadRequestException);
  });

  it('a counselor collects information as COLLECTED only; the Mentor still has to verify it', async () => {
    const s = setup();
    const task = await newTask(s)();
    const item = getChecklistDefinition(1)[0].key;

    await s.tasks.start(task.id, 'counselor-1');
    await s.tasks.collect(task.id, { itemKey: item, value: { marks: '78%' }, note: 'From report card' }, 'counselor-1');

    const row = s.db.rows('stageChecklistResponse').find((r) => r.itemKey === item)!;
    expect(row).toMatchObject({ state: 'COLLECTED', value: { marks: '78%' }, updatedByUserId: 'counselor-1' });
    expect(s.db.rows('mentoringStage')[0].status).toBe('IN_PROGRESS'); // collecting never advances the stage
  });

  it('a counselor cannot overwrite an item the Mentor has resolved, or work another counselor\'s task', async () => {
    const s = setup();
    const task = await newTask(s)();
    const item = getChecklistDefinition(1)[0].key;
    await s.workflow.updateChecklistItem('act-1', 1, item, { state: 'VERIFIED' }, 'mentor-1');

    await expect(s.tasks.collect(task.id, { itemKey: item, value: 'x' }, 'counselor-1')).rejects.toBeInstanceOf(ConflictException);
    await expect(s.tasks.start(task.id, 'counselor-2')).rejects.toBeInstanceOf(ForbiddenException);
    await expect(s.tasks.submit(task.id, {}, 'counselor-2')).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('counselors cannot collect while the student workflow is on hold', async () => {
    const s = setup();
    const task = await newTask(s)();
    await s.workflow.pause('act-1', { reason: 'Away', pendingAction: 'Wait', responsibleUserId: 'counselor-1', followUpAt: new Date('2026-11-30') }, await s.scope('mentor-1'));

    await expect(s.tasks.collect(task.id, { itemKey: getChecklistDefinition(1)[0].key, value: 'x' }, 'counselor-1')).rejects.toBeInstanceOf(ConflictException);
  });

  it('submit, return with a reason, resubmit and verify; a counselor cannot verify', async () => {
    const s = setup();
    const task = await newTask(s)();
    await s.tasks.start(task.id, 'counselor-1');
    await s.tasks.submit(task.id, { evidence: 'photo-of-marksheet' }, 'counselor-1');

    await expect(s.tasks.verify(task.id, await s.scope('counselor-1'))).rejects.toBeInstanceOf(ForbiddenException);
    await expect(s.tasks.returnTask(task.id, ' ', await s.scope('mentor-1'))).rejects.toBeInstanceOf(BadRequestException);
    await s.tasks.returnTask(task.id, 'Marks for term 2 missing', await s.scope('mentor-1'));
    expect(s.db.rows('mentoringTask')[0]).toMatchObject({ status: 'RETURNED', returnReason: 'Marks for term 2 missing' });

    await s.tasks.submit(task.id, {}, 'counselor-1');
    await s.tasks.verify(task.id, await s.scope('mentor-1'));
    expect(s.db.rows('mentoringTask')[0]).toMatchObject({ status: 'VERIFIED', verifiedByUserId: 'mentor-1' });
    expect(s.db.rows('mentoringTask')[0].evidence).toHaveLength(1);
  });

  it('a submitted task blocks stage verification until the Mentor deals with it', async () => {
    const s = setup();
    const task = await newTask(s)();
    for (const d of getChecklistDefinition(1)) await s.workflow.updateChecklistItem('act-1', 1, d.key, { state: 'VERIFIED' }, 'mentor-1');
    await s.tasks.start(task.id, 'counselor-1');
    await s.tasks.submit(task.id, {}, 'counselor-1');

    await expect(s.workflow.verifyStage('act-1', 1, 'mentor-1')).rejects.toBeInstanceOf(ConflictException);
    await s.tasks.verify(task.id, await s.scope('mentor-1'));
    await expect(s.workflow.verifyStage('act-1', 1, 'mentor-1')).resolves.toMatchObject({ stageNumber: 1 });
  });

  it('a counselor can pause and resume their own task without touching the student workflow', async () => {
    const s = setup();
    const task = await newTask(s)();
    await s.tasks.start(task.id, 'counselor-1');

    await expect(s.tasks.hold(task.id, '', 'counselor-1')).rejects.toBeInstanceOf(BadRequestException);
    await s.tasks.hold(task.id, 'Waiting for parent', 'counselor-1');
    expect(s.db.rows('mentoringTask')[0]).toMatchObject({ status: 'ON_HOLD', statusBeforeHold: 'IN_PROGRESS' });
    expect(s.db.rows('mentoringActivation')[0].status).toBe('ACTIVATION_IN_PROGRESS');

    await s.tasks.resumeTask(task.id, 'counselor-1');
    expect(s.db.rows('mentoringTask')[0]).toMatchObject({ status: 'IN_PROGRESS', statusBeforeHold: null });

    // The counselor has no way to pause or resume the overall workflow.
    await expect(s.workflow.pause('act-1', { reason: 'x', pendingAction: 'y', responsibleUserId: 'counselor-1', followUpAt: new Date('2026-12-01') }, await s.scope('counselor-1'))).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('counselors list only their own tasks; only the Head may list all', async () => {
    const s = setup();
    await newTask(s)();
    await newTask(s, { assigneeUserId: 'counselor-2', title: 'Other' })();

    expect((await s.tasks.list(await s.scope('counselor-1'), {})).map((t) => t.assigneeUserId)).toEqual(['counselor-1']);
    await expect(s.tasks.list(await s.scope('counselor-1'), { scope: 'all' })).rejects.toBeInstanceOf(ForbiddenException);
    expect(await s.tasks.list(await s.scope('head-1'), { scope: 'all' })).toHaveLength(2);
  });
});
