import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';


import { MentoringAccessService } from './mentoring-access.service';
import { MentoringHistoryService } from './mentoring-history.service';
import { MentoringWorkflowService } from './mentoring-workflow.service';
import { getChecklistDefinition } from './mentoring.constants';
import { clone, FakeDb } from './testing/mentoring-fake-db';

const PERMS: Record<string, string[]> = {
  'mentor-1': ['mentoring.student.read-assigned', 'mentoring.stage.work', 'mentoring.stage.verify', 'mentoring.workflow.pause'],
  'mentor-2': ['mentoring.student.read-assigned', 'mentoring.stage.work', 'mentoring.stage.verify', 'mentoring.workflow.pause'],
  'head-1': ['mentoring.student.read-all', 'mentoring.workflow.pause', 'mentoring.approval.final', 'mentoring.exception.authorize'],
  'counselor-1': ['mentoring.student.read-assigned', 'mentoring.task.work'],
};

/** Builds brand-new service instances over the same database: this is what a fresh login/request looks like. */
function services(db: FakeDb) {
  const history = new MentoringHistoryService({ recordInTx: jest.fn().mockResolvedValue(undefined) } as any);
  const rbac = { getPermissionsForUser: jest.fn((id: string) => Promise.resolve(new Set(PERMS[id] ?? []))) };
  const access = new MentoringAccessService(rbac as any);
  const workflow = new MentoringWorkflowService(db as any, access, history);
  return { workflow, access, scope: (id: string) => access.scopeFor(id) };
}

function seedBase(db: FakeDb) {
  db.seed('student', { id: 'stu-1', businessId: 'STU-0001', firstName: 'Asha', lastName: 'K', currentGrade: '8', grade: { name: 'Grade 8' }, curriculum: { name: 'CBSE' } });
  db.seed('lead', { id: 'lead-1', businessId: 'LED-0001', firstName: 'Parent', lastName: 'One', primaryPhone: '+971500000000', altPhone1: null, altPhone2: null, whatsappNumber: null });
  db.seed('enrollmentHandover', { id: 'ho-1', status: 'COMPLETED', completedAt: new Date(), missingFields: [], transferredFields: [{ field: 'parent.primaryPhone', source: 'LEAD', value: '+971500000000' }, { field: 'parent.name', source: 'LEAD', value: 'Parent One' }], sourceSnapshot: { lead: { primaryPhone: '+971500000000' } } });
  for (const id of ['mentor-1', 'mentor-2', 'head-1', 'counselor-1']) db.seed('user', { id, status: 'ACTIVE' });
  db.seed('employee', { userId: 'mentor-1', firstName: 'Mina', lastName: 'Mentor' });
  db.seed('userRole', { userId: 'head-1', role: { code: 'MENTORING_HEAD' }, user: { status: 'ACTIVE' } });
}

/** Activation with stages 1..n-1 completed and stage n open, with a mix of checklist states entered. */
function seedActivationAtStage(db: FakeDb, n: number, stageStatus: 'IN_PROGRESS' | 'PENDING_REVIEW' = 'IN_PROGRESS') {
  const activation = db.seed('mentoringActivation', {
    id: 'act-1', leadId: 'lead-1', studentId: 'stu-1', handoverId: 'ho-1',
    status: 'ACTIVATION_IN_PROGRESS', currentStage: n, currentMentorUserId: 'mentor-1',
    submittedForApprovalAt: null, activatedAt: null,
  });
  const started = new Date('2026-10-20T08:00:00Z');
  for (let i = 1; i <= 7; i++) {
    const status = i < n ? 'COMPLETED' : i === n ? stageStatus : 'NOT_STARTED';
    const stage = db.seed('mentoringStage', { activationId: activation.id, stageNumber: i, key: `S${i}`, status, startedAt: i <= n ? started : null });
    if (i === n) {
      getChecklistDefinition(i).forEach((d, idx) => {
        const allVerified = stageStatus === 'PENDING_REVIEW';
        const state = allVerified ? 'VERIFIED' : idx < 2 ? 'VERIFIED' : idx === 2 ? 'COLLECTED' : 'PENDING_COLLECTION';
        db.seed('stageChecklistResponse', {
          stageId: stage.id, itemKey: d.key, mandatory: d.mandatory, definitionVersion: 1, state,
          value: state === 'PENDING_COLLECTION' ? null : { entered: `value-${i}-${idx}` },
          note: idx === 0 ? `draft note for stage ${i}` : null, reason: null, evidenceRef: idx === 1 ? `ev-${i}` : null,
        });
      });
    }
  }
  db.seed('mentoringTask', { id: 'task-1', activationId: activation.id, stageId: db.rows('mentoringStage').find((s) => s.stageNumber === n)!.id, title: 'Collect marks', assigneeUserId: 'counselor-1', assignedByUserId: 'mentor-1' });
  db.seed('mentoringTaskComment', { taskId: 'task-1', authorUserId: 'counselor-1', body: 'Parent will send marks tomorrow' });
  return activation;
}

const checklistOf = (db: FakeDb) =>
  clone(db.rows('stageChecklistResponse').map(({ stageId, itemKey, state, value, note, reason, evidenceRef, mandatory }) => ({ stageId, itemKey, state, value, note, reason, evidenceRef, mandatory })));

const pauseInput = () => ({ reason: 'Parent travelling', pendingAction: 'Wait for parent return', responsibleUserId: 'counselor-1', followUpAt: new Date('2026-11-10T09:00:00Z') });

describe('Pause, leave the application, log back in and resume (every stage)', () => {
  const stageNumbers = [1, 2, 3, 4, 5, 6, 7];

  it.each(stageNumbers)('stage %i: exact saved stage, checklist, tasks and history survive', async (n) => {
    const db = new FakeDb();
    seedBase(db);
    seedActivationAtStage(db, n);
    const before = { checklist: checklistOf(db), tasks: clone(db.rows('mentoringTask')), comments: clone(db.rows('mentoringTaskComment')) };
    const startedAt = db.rows('mentoringStage').find((s) => s.stageNumber === n)!.startedAt;

    // Session 1: the Mentor pauses the workflow and "leaves the application".
    const s1 = services(db);
    await s1.workflow.pause('act-1', pauseInput(), await s1.scope('mentor-1'));

    expect(db.rows('mentoringActivation')[0].status).toBe('ACTIVATION_ON_HOLD');
    expect(db.rows('mentoringStage').find((s) => s.stageNumber === n)!.status).toBe('ON_HOLD');
    expect(checklistOf(db)).toEqual(before.checklist); // nothing entered is touched by a pause
    expect(clone(db.rows('mentoringTask'))).toEqual(before.tasks);
    expect(clone(db.rows('mentoringTaskComment'))).toEqual(before.comments);

    // Edits are refused while the workflow is on hold, and refusing them changes nothing.
    await expect(
      s1.workflow.updateChecklistItem('act-1', n, getChecklistDefinition(n)[3].key, { state: 'VERIFIED' }, 'mentor-1'),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(checklistOf(db)).toEqual(before.checklist);

    // Session 2: brand-new service instances (a fresh login) read the same saved state.
    const s2 = services(db);
    const onHold = await s2.workflow.getWorkspace('act-1', await s2.scope('mentor-1'));
    expect(onHold.activation.status).toBe('ACTIVATION_ON_HOLD');
    expect(onHold.openHold?.reason).toBe('Parent travelling');
    expect(onHold.openHold?.pendingAction).toBe('Wait for parent return');
    expect(onHold.openHold?.responsibleUserId).toBe('counselor-1');
    expect(onHold.stages[n - 1].status).toBe('ON_HOLD');

    // Resume opens the exact saved stage with the exact saved checklist.
    const resumed = await s2.workflow.resume('act-1', 'Parent is back', await s2.scope('mentor-1'));
    expect(resumed.stageNumber).toBe(n);

    const s3 = services(db);
    const after = await s3.workflow.getWorkspace('act-1', await s3.scope('mentor-1'));
    expect(after.activation.status).toBe('ACTIVATION_IN_PROGRESS');
    expect(after.activation.currentStage).toBe(n);
    expect(after.stages[n - 1].status).toBe('IN_PROGRESS'); // not restarted, not reset
    expect(after.openHold).toBeNull();
    expect(checklistOf(db)).toEqual(before.checklist);
    expect(clone(db.rows('mentoringTask'))).toEqual(before.tasks);
    expect(db.rows('mentoringStage').find((s) => s.stageNumber === n)!.startedAt).toEqual(startedAt);
    expect(after.stages[n - 1].checklist[0]).toMatchObject({ state: 'VERIFIED', note: `draft note for stage ${n}`, value: { entered: `value-${n}-0` } });
    expect(after.stages[n - 1].checklist[2].state).toBe('COLLECTED');

    const types = db.rows('mentoringEvent').map((e) => e.type);
    expect(types.indexOf('WORKFLOW_PAUSED')).toBeGreaterThan(-1);
    expect(types.indexOf('WORKFLOW_RESUMED')).toBeGreaterThan(types.indexOf('WORKFLOW_PAUSED'));

    // Work continues where it stopped.
    await expect(
      s3.workflow.updateChecklistItem('act-1', n, getChecklistDefinition(n)[3].key, { state: 'VERIFIED' }, 'mentor-1'),
    ).resolves.toMatchObject({ item: { state: 'VERIFIED' } });
  });

  it.each(stageNumbers)('stage %i: a stage waiting for review comes back waiting for review', async (n) => {
    const db = new FakeDb();
    seedBase(db);
    seedActivationAtStage(db, n, 'PENDING_REVIEW');

    const s1 = services(db);
    await s1.workflow.block('act-1', { reason: 'Tutor unavailable', dependency: 'Tutor confirmation', responsibleUserId: 'counselor-1', followUpAt: new Date('2026-11-12') }, await s1.scope('head-1'));
    expect(db.rows('mentoringActivation')[0].status).toBe('ACTIVATION_BLOCKED');
    expect(db.rows('mentoringStage').find((s) => s.stageNumber === n)!.status).toBe('BLOCKED');

    const s2 = services(db);
    await s2.workflow.resume('act-1', undefined, await s2.scope('head-1'));
    expect(db.rows('mentoringStage').find((s) => s.stageNumber === n)!.status).toBe('PENDING_REVIEW');
    expect(db.rows('mentoringActivation')[0].status).toBe('ACTIVATION_IN_PROGRESS');
  });

  it('requires reason, pending action, responsible person and follow-up date', async () => {
    const db = new FakeDb();
    seedBase(db);
    seedActivationAtStage(db, 1);
    const { workflow, scope } = services(db);
    const mentor = await scope('mentor-1');

    await expect(workflow.pause('act-1', { ...pauseInput(), reason: ' ' }, mentor)).rejects.toBeInstanceOf(BadRequestException);
    await expect(workflow.pause('act-1', { ...pauseInput(), pendingAction: '' }, mentor)).rejects.toBeInstanceOf(BadRequestException);
    await expect(workflow.pause('act-1', { ...pauseInput(), responsibleUserId: '' }, mentor)).rejects.toBeInstanceOf(BadRequestException);
    await expect(workflow.pause('act-1', { ...pauseInput(), followUpAt: new Date('nope') }, mentor)).rejects.toBeInstanceOf(BadRequestException);
    expect(db.rows('mentoringActivation')[0].status).toBe('ACTIVATION_IN_PROGRESS');
  });

  it('only the assigned Mentor or the Head can pause; a counselor or another Mentor cannot', async () => {
    const db = new FakeDb();
    seedBase(db);
    seedActivationAtStage(db, 2);
    const { workflow, scope } = services(db);

    await expect(workflow.pause('act-1', pauseInput(), await scope('mentor-2'))).rejects.toBeInstanceOf(ForbiddenException);
    await expect(workflow.pause('act-1', pauseInput(), await scope('counselor-1'))).rejects.toBeInstanceOf(ForbiddenException);
    await expect(workflow.pause('act-1', pauseInput(), await scope('head-1'))).resolves.toBeDefined();
  });
});

describe('Stage engine', () => {
  it('cannot start a stage before the previous one is completed', async () => {
    const db = new FakeDb();
    seedBase(db);
    seedActivationAtStage(db, 1);
    const { workflow } = services(db);

    await expect(workflow.startStage('act-1', 3, 'mentor-1')).rejects.toBeInstanceOf(ConflictException);
    await expect(workflow.startStage('act-1', 2, 'mentor-1')).rejects.toBeInstanceOf(ConflictException);
  });

  it('a counselor-collected item is not resolved until the Mentor verifies it', async () => {
    const db = new FakeDb();
    seedBase(db);
    seedActivationAtStage(db, 1);
    const { workflow } = services(db);
    const defs = getChecklistDefinition(1);

    for (const d of defs) await workflow.updateChecklistItem('act-1', 1, d.key, { state: 'COLLECTED' }, 'mentor-1');
    await expect(workflow.verifyStage('act-1', 1, 'mentor-1')).rejects.toBeInstanceOf(ConflictException);
    expect(db.rows('mentoringStage').find((s) => s.stageNumber === 1)!.status).toBe('IN_PROGRESS');
  });

  it('unavailable / not applicable need a reason and then count as resolved; stage reaches review then completes', async () => {
    const db = new FakeDb();
    seedBase(db);
    seedActivationAtStage(db, 1);
    const { workflow } = services(db);
    const defs = getChecklistDefinition(1);

    await expect(workflow.updateChecklistItem('act-1', 1, defs[0].key, { state: 'UNAVAILABLE' }, 'mentor-1')).rejects.toBeInstanceOf(BadRequestException);
    for (const [i, d] of defs.entries()) {
      await workflow.updateChecklistItem('act-1', 1, d.key, i === 4 ? { state: 'UNAVAILABLE', reason: 'School has not issued marks' } : { state: 'VERIFIED' }, 'mentor-1');
    }
    expect(db.rows('mentoringStage').find((s) => s.stageNumber === 1)!.status).toBe('PENDING_REVIEW');

    const result = await workflow.verifyStage('act-1', 1, 'mentor-1');
    expect(result.allStagesCompleted).toBe(false);
    expect(db.rows('mentoringStage').find((s) => s.stageNumber === 1)).toMatchObject({ status: 'COMPLETED', verifiedByUserId: 'mentor-1' });
    expect(db.rows('mentoringActivation')[0].currentStage).toBe(2);
  });

  it('only the assigned Mentor can edit or verify; the Head cannot verify stages', async () => {
    const db = new FakeDb();
    seedBase(db);
    seedActivationAtStage(db, 1, 'PENDING_REVIEW');
    const { workflow } = services(db);

    await expect(workflow.verifyStage('act-1', 1, 'mentor-2')).rejects.toBeInstanceOf(ForbiddenException);
    await expect(workflow.verifyStage('act-1', 1, 'head-1')).rejects.toBeInstanceOf(ForbiddenException);
    await expect(workflow.updateChecklistItem('act-1', 1, getChecklistDefinition(1)[0].key, { state: 'VERIFIED' }, 'counselor-1')).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('a Head-authorised exception resolves a mandatory item, with a reason', async () => {
    const db = new FakeDb();
    seedBase(db);
    seedActivationAtStage(db, 2, 'IN_PROGRESS');
    const { workflow } = services(db);

    await expect(workflow.authorizeException('act-1', 2, 'parent_acknowledgement', ' ', 'head-1')).rejects.toBeInstanceOf(BadRequestException);
    for (const d of getChecklistDefinition(2).filter((x) => x.key !== 'parent_acknowledgement')) {
      await workflow.updateChecklistItem('act-1', 2, d.key, { state: 'VERIFIED' }, 'mentor-1');
    }
    expect(db.rows('mentoringStage').find((s) => s.stageNumber === 2)!.status).toBe('IN_PROGRESS');

    await workflow.authorizeException('act-1', 2, 'parent_acknowledgement', 'Parent abroad, will acknowledge by email', 'head-1');
    expect(db.rows('mentoringStage').find((s) => s.stageNumber === 2)!.status).toBe('PENDING_REVIEW');
    await expect(workflow.authorizeException('act-1', 4, 'class_start_announcement', 'x', 'head-1')).rejects.toBeInstanceOf(BadRequestException); // advisory items need none
  });
});

describe('Final activation approval', () => {
  /** All seven stages complete except stage 7, which is ready for the Mentor's verification. */
  function readyForFinal(db: FakeDb) {
    seedBase(db);
    seedActivationAtStage(db, 7, 'PENDING_REVIEW');
  }

  it('moves to PENDING_FINAL_APPROVAL, creates the approval and notifies the Head', async () => {
    const db = new FakeDb();
    readyForFinal(db);
    const { workflow } = services(db);

    const result = await workflow.verifyStage('act-1', 7, 'mentor-1');

    expect(result.allStagesCompleted).toBe(true);
    expect(db.rows('mentoringActivation')[0].status).toBe('PENDING_FINAL_APPROVAL');
    expect(db.rows('finalApproval')).toHaveLength(1);
    expect(db.rows('notification').map((n) => n.recipientUserId)).toContain('head-1');
  });

  it('the Mentor who worked on the student cannot approve; the Head can', async () => {
    const db = new FakeDb();
    readyForFinal(db);
    const { workflow } = services(db);
    await workflow.verifyStage('act-1', 7, 'mentor-1');

    await expect(workflow.decideApproval('act-1', { decision: 'APPROVED' }, 'mentor-1')).rejects.toBeInstanceOf(ForbiddenException);
    expect(db.rows('mentoringActivation')[0].status).toBe('PENDING_FINAL_APPROVAL');

    await workflow.decideApproval('act-1', { decision: 'APPROVED' }, 'head-1');
    expect(db.rows('mentoringActivation')[0]).toMatchObject({ status: 'ACTIVATED' });
    expect(db.rows('mentoringActivation')[0].activatedAt).toBeInstanceOf(Date);
  });

  it('returning needs a comment and a stage, and reopens that stage for the Mentor', async () => {
    const db = new FakeDb();
    readyForFinal(db);
    const { workflow } = services(db);
    await workflow.verifyStage('act-1', 7, 'mentor-1');

    await expect(workflow.decideApproval('act-1', { decision: 'RETURNED' }, 'head-1')).rejects.toBeInstanceOf(BadRequestException);
    await workflow.decideApproval('act-1', { decision: 'RETURNED', comment: 'Timetable needs parent confirmation', returnToStage: 3 }, 'head-1');

    expect(db.rows('mentoringActivation')[0]).toMatchObject({ status: 'ACTIVATION_IN_PROGRESS', currentStage: 3 });
    expect(db.rows('mentoringStage').find((s) => s.stageNumber === 3)).toMatchObject({ status: 'IN_PROGRESS', completedAt: null });
  });

  it('cancelling closes open tasks and holds and clears the Mentor', async () => {
    const db = new FakeDb();
    seedBase(db);
    seedActivationAtStage(db, 2);
    const { workflow, scope } = services(db);
    await workflow.pause('act-1', pauseInput(), await scope('mentor-1'));

    await workflow.cancel('act-1', 'Family withdrew', 'head-1');

    expect(db.rows('mentoringActivation')[0]).toMatchObject({ status: 'CANCELLED', currentMentorUserId: null });
    expect(db.rows('mentoringTask')[0].status).toBe('CANCELLED');
    expect(db.rows('workflowHold')[0].resolvedAt).toBeInstanceOf(Date);
  });
});

describe('Who can see a student (scoping happens in the query)', () => {
  it('a Mentor lists only own students; the Head lists all; a user with no scope is refused', async () => {
    const db = new FakeDb();
    seedBase(db);
    seedActivationAtStage(db, 1);
    db.seed('student', { id: 'stu-2', businessId: 'STU-0002', firstName: 'Omar', lastName: 'Z' });
    db.seed('mentoringActivation', { id: 'act-2', leadId: 'lead-1', studentId: 'stu-2', handoverId: 'ho-1', status: 'ACTIVATION_IN_PROGRESS', currentStage: 1, currentMentorUserId: 'mentor-2' });
    const { workflow, scope } = services(db);

    expect((await workflow.list(await scope('mentor-1'), {})).items.map((i) => i.activationId)).toEqual(['act-1']);
    expect((await workflow.list(await scope('mentor-2'), {})).items.map((i) => i.activationId)).toEqual(['act-2']);
    expect((await workflow.list(await scope('head-1'), {})).total).toBe(2);
    await expect(workflow.list(await scope('nobody'), {})).rejects.toBeInstanceOf(ForbiddenException);
    await expect(workflow.getWorkspace('act-2', await scope('mentor-1'))).rejects.toThrow('Student not found');
  });

  it('a Counselor only sees a student through an assigned task, without parent contact details or history', async () => {
    const db = new FakeDb();
    seedBase(db);
    seedActivationAtStage(db, 1);
    const { workflow, scope } = services(db);

    const view = await workflow.getWorkspace('act-1', await scope('counselor-1'));

    expect(view.parent).toBeNull();
    expect(view.events).toEqual([]);
    expect(view.tasks).toHaveLength(1);
    expect(JSON.stringify(view.handover)).not.toContain('+971500000000');
    const mentorView = await workflow.getWorkspace('act-1', await scope('mentor-1'));
    expect(mentorView.parent?.primaryPhone).toBe('+971500000000');
  });
});
