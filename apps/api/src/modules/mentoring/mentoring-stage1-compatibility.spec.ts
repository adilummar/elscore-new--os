/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-member-access */
import { readFileSync } from 'fs';
import { join } from 'path';

import { ConflictException } from '@nestjs/common';

import { MentoringAccessService } from './mentoring-access.service';
import { MentoringHistoryService } from './mentoring-history.service';
import { openStage, unresolvedMandatoryItems } from './mentoring-stage.helpers';
import { MentoringTaskService } from './mentoring-task.service';
import { MentoringWorkflowService } from './mentoring-workflow.service';
import { CHECKLIST, getChecklistDefinition } from './mentoring.constants';
import { clone, FakeDb } from './testing/mentoring-fake-db';
import {
  CARRIED_NOTE,
  LEGACY_STAGE1_KEYS,
  LegacyException,
  LegacyRow,
  NEW_STAGE1_KEYS,
  legacyGroupMap,
  planStage1Backfill,
} from './testing/stage1-checklist-backfill.reference';

/**
 * Existing Stage 1 data, as the version of the code that is deployed today stores it (8 requirement rows,
 * definition version 1), meeting the new code. Each scenario is checked WITHOUT the backfill (what would happen if
 * the new code were deployed alone) and WITH it (the reviewed script, in its reference form).
 */
const PERMS: Record<string, string[]> = {
  'mentor-1': ['mentoring.student.read-assigned', 'mentoring.stage.work', 'mentoring.stage.verify', 'mentoring.workflow.pause'],
  'head-1': ['mentoring.student.read-all', 'mentoring.exception.authorize', 'mentoring.workflow.pause'],
  'counselor-1': ['mentoring.student.read-assigned', 'mentoring.task.work'],
};

const T0 = new Date('2026-11-02T08:00:00Z');
const T1 = new Date('2026-11-02T09:30:00Z');

const OLD_DEFINITIONS = LEGACY_STAGE1_KEYS.map((key) => ({ key, mandatory: true }));
const NEW_DEFINITIONS = getChecklistDefinition(1);

type LegacyState = { state?: string; note?: string | null; reason?: string | null; evidenceRef?: string | null; value?: unknown; by?: string | null };

function legacyWorld(config: {
  stageStatus: 'NOT_STARTED' | 'IN_PROGRESS' | 'PENDING_REVIEW' | 'COMPLETED' | 'ON_HOLD' | 'BLOCKED';
  activationStatus?: string;
  rows?: Record<string, LegacyState> | null; // null = the stage was never opened (no rows at all)
  exceptions?: Array<{ key: string; reason: string }>;
  hold?: { previousStageStatus: 'IN_PROGRESS' | 'PENDING_REVIEW'; kind?: 'HOLD' | 'BLOCK' };
}) {
  const db = new FakeDb();
  const history = new MentoringHistoryService({ recordInTx: jest.fn().mockResolvedValue(undefined) } as any);
  const access = new MentoringAccessService({ getPermissionsForUser: (id: string) => Promise.resolve(new Set(PERMS[id] ?? [])) } as any);
  const workflow = new MentoringWorkflowService(db as any, access, history);
  const tasks = new MentoringTaskService(db as any, history);

  db.seed('student', { id: 'stu-1', businessId: 'STU-1', firstName: 'Asha', lastName: 'K', currentGrade: '8', grade: { name: 'Grade 8' }, curriculum: { name: 'CBSE' } });
  db.seed('lead', { id: 'lead-1', businessId: 'LED-1', firstName: 'P', lastName: 'One', primaryPhone: '+971500000000', altPhone1: null, altPhone2: null, whatsappNumber: null });
  db.seed('enrollmentHandover', {
    id: 'ho-1', status: 'COMPLETED', completedAt: T0, sourceSnapshot: { lead: { primaryPhone: '+971500000000' } },
    transferredFields: [{ field: 'student.firstName', source: 'STUDENT', value: 'Asha' }], missingFields: [{ field: 'parent.relationship', reason: 'NOT_COLLECTED_IN_SALES' }],
  });
  for (const id of Object.keys(PERMS)) db.seed('user', { id, status: 'ACTIVE' });
  db.seed('employee', { userId: 'mentor-1', firstName: 'Mina', lastName: 'Mentor' });
  db.seed('employee', { userId: 'head-1', firstName: 'Hari', lastName: 'Head' });
  db.seed('userRole', { userId: 'head-1', role: { code: 'MENTORING_HEAD' }, user: { status: 'ACTIVE' } });
  db.seed('mentoringActivation', {
    id: 'act-1', leadId: 'lead-1', studentId: 'stu-1', handoverId: 'ho-1', status: config.activationStatus ?? 'ACTIVATION_IN_PROGRESS',
    currentStage: config.stageStatus === 'COMPLETED' ? 2 : 1, currentMentorUserId: 'mentor-1', submittedForApprovalAt: null, activatedAt: null,
  });
  for (let n = 1; n <= 7; n++) {
    const status = n === 1 ? config.stageStatus : n === 2 && config.stageStatus === 'COMPLETED' ? 'IN_PROGRESS' : 'NOT_STARTED';
    db.seed('mentoringStage', { activationId: 'act-1', stageNumber: n, key: `S${n}`, status, startedAt: status === 'NOT_STARTED' ? null : T0 });
  }
  const stage1 = db.rows('mentoringStage').find((s) => s.stageNumber === 1)!;

  if (config.rows !== null) {
    for (const key of LEGACY_STAGE1_KEYS) {
      const given = config.rows?.[key] ?? {};
      db.seed('stageChecklistResponse', {
        stageId: stage1.id, itemKey: key, mandatory: true, definitionVersion: 1, state: given.state ?? 'PENDING_COLLECTION',
        value: given.value ?? null, note: given.note ?? null, reason: given.reason ?? null, evidenceRef: given.evidenceRef ?? null,
        updatedByUserId: given.by ?? (given.state && given.state !== 'PENDING_COLLECTION' ? 'mentor-1' : null), createdAt: T0, updatedAt: T1,
      });
    }
  }
  for (const e of config.exceptions ?? []) db.seed('workflowException', { stageId: stage1.id, itemKey: e.key, reason: e.reason, authorizedByUserId: 'head-1', createdAt: T1 });
  if (config.hold) {
    db.seed('workflowHold', {
      activationId: 'act-1', stageId: stage1.id, kind: config.hold.kind ?? 'HOLD', reason: 'Parent travelling', responsibleUserId: 'counselor-1',
      previousActivationStatus: 'ACTIVATION_IN_PROGRESS', previousStageStatus: config.hold.previousStageStatus, createdByUserId: 'mentor-1', createdAt: T1, resolvedAt: null,
    });
  }

  const scope = (id: string) => access.scopeFor(id);
  const snapshot = () => clone({
    legacyRows: db.rows('stageChecklistResponse').filter((r) => r.definitionVersion === 1),
    stages: db.rows('mentoringStage'),
    handover: db.rows('enrollmentHandover'),
    exceptions: db.rows('workflowException'),
  });
  const stageRow = () => db.rows('mentoringStage').find((s) => s.stageNumber === 1)!;
  const checklist = async (viewer = 'mentor-1') => (await workflow.getWorkspace('act-1', await scope(viewer))).stages[0].checklist as any[];

  /** Applies the reference backfill the way the SQL script does (insert-only), and returns what was inserted. */
  const backfill = () => {
    const rows = db.rows('stageChecklistResponse') as unknown as LegacyRow[];
    const exceptions = db.rows('workflowException') as unknown as LegacyException[];
    const plan = planStage1Backfill(stage1.id, rows, exceptions, new Date('2026-11-03T12:00:00Z'));
    for (const r of plan.rows) db.seed('stageChecklistResponse', { ...r });
    for (const e of plan.exceptions) db.seed('workflowException', { ...e });
    if (plan.rows.length > 0) db.seed('mentoringEvent', { activationId: 'act-1', stageId: stage1.id, type: 'CHECKLIST_DEFINITION_MIGRATED', actorUserId: null });
    return plan;
  };
  return { db, workflow, tasks, scope, snapshot, stageRow, checklist, backfill, stage1 };
}

const verifiedAll = (): Record<string, LegacyState> => Object.fromEntries(LEGACY_STAGE1_KEYS.map((k) => [k, { state: 'VERIFIED' }]));
const stateOf = (items: any[], key: string) => items.find((i) => i.key === key);

describe('the definition change itself', () => {
  it('the deployed definition had eight requirement keys; seven became groups and one kept its key', () => {
    expect(LEGACY_STAGE1_KEYS).toHaveLength(8);
    const groups = new Set(NEW_DEFINITIONS.map((d) => d.group));
    expect(LEGACY_STAGE1_KEYS.filter((k) => groups.has(k))).toHaveLength(7);
    expect(NEW_DEFINITIONS.map((d) => d.key)).toContain('missing_info_identified');
    expect(NEW_DEFINITIONS.map((d) => d.key).filter((k) => (LEGACY_STAGE1_KEYS as readonly string[]).includes(k))).toEqual(['missing_info_identified']);
  });

  it('no new item key collides with an old group key, so old rows never masquerade as new items', () => {
    for (const key of NEW_DEFINITIONS.map((d) => d.key).filter((k) => k !== 'missing_info_identified')) {
      expect((LEGACY_STAGE1_KEYS as readonly string[]).includes(key)).toBe(false);
    }
  });

  it('the other stages are unchanged, so their existing rows keep working', () => {
    expect(Object.keys(CHECKLIST).filter((n) => Number(n) > 1).every((n) => CHECKLIST[Number(n)].every((d) => !d.group))).toBe(true);
  });
});

describe('WITHOUT the backfill: what the new code does to an existing Stage 1', () => {
  it('a completed Stage 1 stays COMPLETED but its checklist looks almost empty', async () => {
    const w = legacyWorld({ stageStatus: 'COMPLETED', rows: verifiedAll() });
    const items = await w.checklist();
    expect(w.stageRow().status).toBe('COMPLETED');
    expect(items).toHaveLength(26);
    expect(items.filter((i) => i.state === 'VERIFIED')).toHaveLength(1); // only missing_info_identified kept its key
    expect(items.filter((i) => i.state === 'PENDING_COLLECTION')).toHaveLength(25);
  });

  it('a stage that was ready for review can no longer be verified (25 items outstanding)', async () => {
    const w = legacyWorld({ stageStatus: 'PENDING_REVIEW', rows: verifiedAll() });
    await expect(w.workflow.verifyStage('act-1', 1, 'mentor-1')).rejects.toMatchObject({ response: { message: 'Mandatory checklist items are not resolved' } });
    const error: any = await w.workflow.verifyStage('act-1', 1, 'mentor-1').catch((e) => e);
    expect(error.response.unresolved).toHaveLength(25);
  });

  it('touching any item moves a ready stage back from PENDING_REVIEW to IN_PROGRESS', async () => {
    const w = legacyWorld({ stageStatus: 'PENDING_REVIEW', rows: verifiedAll() });
    await w.workflow.updateChecklistItem('act-1', 1, 'student_details_checked', { state: 'VERIFIED' }, 'mentor-1');
    expect(w.stageRow().status).toBe('IN_PROGRESS');
  });

  it('a paused stage resumes into PENDING_REVIEW with 25 unresolved items (status and items disagree)', async () => {
    const w = legacyWorld({ stageStatus: 'ON_HOLD', activationStatus: 'ACTIVATION_ON_HOLD', rows: verifiedAll(), hold: { previousStageStatus: 'PENDING_REVIEW' } });
    await w.workflow.resume('act-1', 'Parent is back', await w.scope('mentor-1'));
    expect(w.stageRow().status).toBe('PENDING_REVIEW');
    await expect(w.workflow.verifyStage('act-1', 1, 'mentor-1')).rejects.toBeInstanceOf(ConflictException);
  });

  it('comments, evidence and values entered on an old requirement stay in the database but are not shown', async () => {
    const w = legacyWorld({ stageStatus: 'IN_PROGRESS', rows: { previous_marks: { state: 'COLLECTED', note: 'Parent sent term-1 marks', evidenceRef: 'https://files.example/marks.pdf', value: { maths: 82 } } } });
    const shown = JSON.stringify(await w.checklist());
    expect(shown).not.toContain('Parent sent term-1 marks');
    expect(shown).not.toContain('marks.pdf');
    expect(w.db.rows('stageChecklistResponse').find((r) => r.itemKey === 'previous_marks')).toMatchObject({ note: 'Parent sent term-1 marks', evidenceRef: 'https://files.example/marks.pdf' });
  });

  it('an exception authorised on an old requirement is kept but no longer resolves anything', async () => {
    const w = legacyWorld({ stageStatus: 'IN_PROGRESS', rows: verifiedAll(), exceptions: [{ key: 'previous_marks', reason: 'School closed' }] });
    expect((await w.checklist()).some((i) => i.exception)).toBe(false);
    expect(w.db.rows('workflowException')).toHaveLength(1);
  });

  it('a counselor cannot collect on a new item until a Mentor has touched the checklist (rows do not exist yet)', async () => {
    const w = legacyWorld({ stageStatus: 'IN_PROGRESS', rows: {} });
    w.db.seed('mentoringTask', { id: 'task-1', activationId: 'act-1', stageId: w.stage1.id, title: 'Collect marks', assigneeUserId: 'counselor-1', status: 'IN_PROGRESS' });
    await expect(w.tasks.collect('task-1', { itemKey: 'previous_marks_collected', value: '82%' }, 'counselor-1')).rejects.toThrow('not available yet');
  });

  it('nothing is deleted: every old row, exception and event is still there', async () => {
    const w = legacyWorld({ stageStatus: 'IN_PROGRESS', rows: verifiedAll(), exceptions: [{ key: 'previous_marks', reason: 'x' }] });
    const before = w.snapshot();
    await w.workflow.updateChecklistItem('act-1', 1, 'student_details_checked', { state: 'VERIFIED' }, 'mentor-1');
    const after = w.snapshot();
    expect(after.legacyRows).toEqual(before.legacyRows);
    expect(after.exceptions).toEqual(before.exceptions);
    expect(after.handover).toEqual(before.handover);
  });
});

describe('WITH the backfill: every kind of existing Stage 1', () => {
  it('completed Stage 1: stays completed and shows 26 of 26 completed, by the same people at the same times', async () => {
    const w = legacyWorld({ stageStatus: 'COMPLETED', rows: verifiedAll() });
    const before = w.snapshot();
    const plan = w.backfill();
    expect(plan.rows).toHaveLength(25);
    const items = await w.checklist();
    expect(items.filter((i) => i.state === 'VERIFIED')).toHaveLength(26);
    expect(w.stageRow().status).toBe('COMPLETED');
    expect(stateOf(items, 'timetable_confirmed')).toMatchObject({ updatedByName: 'Mina Mentor', updatedAt: T1 });
    expect(w.snapshot().legacyRows).toEqual(before.legacyRows);
  });

  it('partially completed Stage 1: each old result is carried to the items of its group', async () => {
    const w = legacyWorld({
      stageStatus: 'IN_PROGRESS',
      rows: {
        student_parent_verified: { state: 'VERIFIED' },
        tutor_subject_confirmed: { state: 'COLLECTED', by: 'counselor-1' },
        weekly_timetable_verified: { state: 'UNAVAILABLE', reason: 'Parent has not decided' },
        previous_marks: { state: 'NOT_APPLICABLE', reason: 'New to school' },
      },
    });
    w.backfill();
    const items = await w.checklist();
    const groupStates = (group: string) => items.filter((i) => i.group === group).map((i) => i.state);
    expect(groupStates('student_parent_verified')).toEqual(Array(5).fill('PENDING_COLLECTION').map((_, i) => (i < 4 ? 'VERIFIED' : 'PENDING_COLLECTION'))); // 4 carried + missing_info (own, pending)
    expect(groupStates('tutor_subject_confirmed')).toEqual(Array(4).fill('COLLECTED'));
    expect(groupStates('weekly_timetable_verified')).toEqual(Array(4).fill('UNAVAILABLE'));
    expect(groupStates('previous_marks')).toEqual(Array(2).fill('NOT_APPLICABLE'));
    expect(groupStates('examination_details')).toEqual(Array(3).fill('PENDING_COLLECTION'));
    expect(items.filter((i) => i.group === 'weekly_timetable_verified').every((i) => i.reason === 'Parent has not decided')).toBe(true);
    expect(stateOf(items, 'tutor_assignment_confirmed').updatedByUserId).toBe('counselor-1');
  });

  it('pending Stage 1: stays pending, and rows now exist so counselors can collect', async () => {
    const w = legacyWorld({ stageStatus: 'IN_PROGRESS', rows: {} });
    w.backfill();
    expect((await w.checklist()).every((i) => i.state === 'PENDING_COLLECTION')).toBe(true);
    w.db.seed('mentoringTask', { id: 'task-1', activationId: 'act-1', stageId: w.stage1.id, title: 'Collect marks', assigneeUserId: 'counselor-1', status: 'IN_PROGRESS' });
    await expect(w.tasks.collect('task-1', { itemKey: 'previous_marks_collected', value: '82%' }, 'counselor-1')).resolves.toMatchObject({ state: 'COLLECTED' });
  });

  it('a stage that was never opened is left alone (the application creates its rows when it starts)', () => {
    const w = legacyWorld({ stageStatus: 'NOT_STARTED', activationStatus: 'AWAITING_ALLOCATION', rows: null });
    expect(w.backfill()).toEqual({ rows: [], exceptions: [] });
    expect(w.db.rows('stageChecklistResponse')).toHaveLength(0);
  });

  it.each([
    ['paused', 'ON_HOLD', 'ACTIVATION_ON_HOLD', 'HOLD', 'PENDING_REVIEW'],
    ['blocked', 'BLOCKED', 'ACTIVATION_BLOCKED', 'BLOCK', 'PENDING_REVIEW'],
  ] as const)('%s Stage 1 that was ready for review: hold kept, resumes ready, and can then be verified', async (_label, stageStatus, activationStatus, kind, previous) => {
    const w = legacyWorld({ stageStatus, activationStatus, rows: verifiedAll(), hold: { previousStageStatus: previous, kind } });
    w.backfill();
    expect(w.stageRow().status).toBe(stageStatus);
    expect(w.db.rows('workflowHold')[0].resolvedAt).toBeNull();
    await w.workflow.resume('act-1', 'Resolved', await w.scope('mentor-1'));
    expect(w.stageRow().status).toBe('PENDING_REVIEW');
    await expect(w.workflow.verifyStage('act-1', 1, 'mentor-1')).resolves.toBeDefined();
    expect(w.stageRow().status).toBe('COMPLETED');
  });

  it('paused Stage 1 that was still in progress: resumes in progress with its carried progress', async () => {
    const w = legacyWorld({ stageStatus: 'ON_HOLD', activationStatus: 'ACTIVATION_ON_HOLD', rows: { previous_marks: { state: 'VERIFIED' } }, hold: { previousStageStatus: 'IN_PROGRESS' } });
    w.backfill();
    await w.workflow.resume('act-1', 'Back', await w.scope('mentor-1'));
    expect(w.stageRow().status).toBe('IN_PROGRESS');
    expect((await w.checklist()).filter((i) => i.group === 'previous_marks').map((i) => i.state)).toEqual(['VERIFIED', 'VERIFIED']);
  });

  it('a stage ready for review can still be verified straight after the backfill', async () => {
    const w = legacyWorld({ stageStatus: 'PENDING_REVIEW', rows: verifiedAll() });
    w.backfill();
    await expect(w.workflow.verifyStage('act-1', 1, 'mentor-1')).resolves.toBeDefined();
  });

  it('stage with comments, evidence, a counselor-collected item and an exception: all visible, attributed and counted', async () => {
    const w = legacyWorld({
      stageStatus: 'IN_PROGRESS',
      rows: {
        student_parent_verified: { state: 'VERIFIED', note: 'Checked against the admission form', evidenceRef: 'https://files.example/form.pdf', value: { checkedBy: 'mentor' } },
        previous_marks: { state: 'COLLECTED', by: 'counselor-1', note: 'Parent sent term-1 marks', evidenceRef: 'https://files.example/marks.pdf' },
        examination_details: { state: 'PENDING_COLLECTION' },
      },
      exceptions: [{ key: 'examination_details', reason: 'Exams not yet scheduled' }],
    });
    w.backfill();
    const items = await w.checklist();

    const first = stateOf(items, 'student_details_checked');
    expect(first).toMatchObject({ state: 'VERIFIED', evidenceRef: 'https://files.example/form.pdf', value: { checkedBy: 'mentor' } });
    expect(first.note).toBe(`${CARRIED_NOTE} Checked against the admission form`);
    expect(stateOf(items, 'parent_details_checked').note).toBe(CARRIED_NOTE);
    expect(stateOf(items, 'parent_details_checked').evidenceRef).toBeNull();

    expect(stateOf(items, 'previous_marks_requested')).toMatchObject({ state: 'COLLECTED', evidenceRef: 'https://files.example/marks.pdf', updatedByUserId: 'counselor-1' });
    expect(stateOf(items, 'previous_marks_requested').note).toContain('Parent sent term-1 marks');

    const excepted = items.filter((i) => i.group === 'examination_details');
    expect(excepted).toHaveLength(3);
    expect(excepted.every((i) => i.exception && i.exceptionDetail.reason === 'Exams not yet scheduled' && i.exceptionDetail.authorizedByName === 'Hari Head')).toBe(true);
    expect(excepted.every((i) => i.state === 'PENDING_COLLECTION')).toBe(true);
  });

  it('a pending old requirement keeps any note or evidence entered on it (nothing is dropped)', async () => {
    const w = legacyWorld({ stageStatus: 'IN_PROGRESS', rows: { parent_expectations: { state: 'PENDING_COLLECTION', note: 'Call parent on Friday', evidenceRef: 'ref-1' } } });
    w.backfill();
    expect(stateOf(await w.checklist(), 'parent_expectations_recorded')).toMatchObject({ state: 'PENDING_COLLECTION', note: 'Call parent on Friday', evidenceRef: 'ref-1' });
  });

  it('the Sales snapshot, stage statuses, old rows and old exceptions are untouched', () => {
    const w = legacyWorld({ stageStatus: 'PENDING_REVIEW', rows: verifiedAll(), exceptions: [{ key: 'previous_marks', reason: 'x' }] });
    const before = w.snapshot();
    w.backfill();
    const after = w.snapshot();
    expect(after.handover).toEqual(before.handover);
    expect(after.stages).toEqual(before.stages);
    expect(after.legacyRows).toEqual(before.legacyRows);
    expect(after.exceptions.slice(0, before.exceptions.length)).toEqual(before.exceptions);
  });

  it('is idempotent: a second run inserts nothing', () => {
    const w = legacyWorld({ stageStatus: 'IN_PROGRESS', rows: verifiedAll(), exceptions: [{ key: 'previous_marks', reason: 'x' }] });
    expect(w.backfill().rows.length).toBeGreaterThan(0);
    const second = w.backfill();
    expect(second).toEqual({ rows: [], exceptions: [] });
  });

  it('never overwrites a row the new code already wrote', () => {
    const w = legacyWorld({ stageStatus: 'IN_PROGRESS', rows: { student_parent_verified: { state: 'VERIFIED' } } });
    w.db.seed('stageChecklistResponse', { stageId: w.stage1.id, itemKey: 'student_details_checked', mandatory: true, definitionVersion: 2, state: 'UNAVAILABLE', reason: 'Entered after deployment', note: null, value: null, evidenceRef: null, updatedByUserId: 'mentor-1' });
    const plan = w.backfill();
    expect(plan.rows.map((r) => r.itemKey)).not.toContain('student_details_checked');
    expect(w.db.rows('stageChecklistResponse').filter((r) => r.itemKey === 'student_details_checked')).toHaveLength(1);
    expect(w.db.rows('stageChecklistResponse').find((r) => r.itemKey === 'student_details_checked')!.reason).toBe('Entered after deployment');
  });
});

describe('equivalence: resolved before == resolved after (the safety property the script also checks)', () => {
  const stateMixes: Array<[string, Record<string, LegacyState>, Array<{ key: string; reason: string }>]> = [
    ['all verified', verifiedAll(), []],
    ['all pending', {}, []],
    ['one pending', { ...verifiedAll(), previous_marks: { state: 'PENDING_COLLECTION' } }, []],
    ['one collected', { ...verifiedAll(), previous_marks: { state: 'COLLECTED' } }, []],
    ['unavailable with reason', { ...verifiedAll(), previous_marks: { state: 'UNAVAILABLE', reason: 'None issued' } }, []],
    ['unavailable without reason', { ...verifiedAll(), previous_marks: { state: 'UNAVAILABLE', reason: '  ' } }, []],
    ['pending but excepted', { ...verifiedAll(), examination_details: { state: 'PENDING_COLLECTION' } }, [{ key: 'examination_details', reason: 'Not scheduled' }]],
    ['missing_info pending', { ...verifiedAll(), missing_info_identified: { state: 'PENDING_COLLECTION' } }, []],
  ];

  it.each(stateMixes)('%s', (_label, rows, exceptions) => {
    const w = legacyWorld({ stageStatus: 'IN_PROGRESS', rows, exceptions });
    const oldRows = clone(w.db.rows('stageChecklistResponse')) as any[];
    const oldExceptions = new Set(w.db.rows('workflowException').map((e) => e.itemKey as string));
    const resolvedBefore = unresolvedMandatoryItems(OLD_DEFINITIONS, oldRows, oldExceptions).length === 0;

    w.backfill();
    const newRows = w.db.rows('stageChecklistResponse') as any[];
    const newExceptions = new Set(w.db.rows('workflowException').map((e) => e.itemKey as string));
    const resolvedAfter = unresolvedMandatoryItems(NEW_DEFINITIONS, newRows, newExceptions).length === 0;
    expect(resolvedAfter).toBe(resolvedBefore);
  });
});

describe('new students entering Stage 1 after deployment', () => {
  it('get all 26 items as version 2 when the stage opens, and the backfill has nothing to do for them', async () => {
    const db = new FakeDb();
    db.seed('mentoringActivation', { id: 'act-9', leadId: 'l', studentId: 's', handoverId: 'h', status: 'ACTIVATION_IN_PROGRESS', currentStage: 1, currentMentorUserId: 'mentor-1' });
    await openStage(db as any, 'act-9', 1);
    const rows = db.rows('stageChecklistResponse');
    expect(rows).toHaveLength(26);
    expect(rows.every((r) => r.definitionVersion === 2 && r.mandatory === true && r.state === 'PENDING_COLLECTION')).toBe(true);
    expect(new Set(rows.map((r) => r.itemKey))).toEqual(new Set(NEW_STAGE1_KEYS));
    const stageId = db.rows('mentoringStage').find((s) => s.stageNumber === 1)!.id;
    expect(planStage1Backfill(stageId, rows as unknown as LegacyRow[], [])).toEqual({ rows: [], exceptions: [] });
  });
});

describe('mapping and script', () => {
  const sql = readFileSync(join(__dirname, '../../../scripts/stage1-checklist-backfill.sql'), 'utf8').replace(/\r\n/g, '\n');
  const sqlPairs = Array.from(sql.matchAll(/\('([a-z_]+)', '([a-z_]+)', (true|false)\)/g)).map((m) => [m[1], m[2], m[3] === 'true']);
  const expectedPairs = Object.entries(legacyGroupMap()).flatMap(([legacy, keys]) => keys.map((key, index) => [legacy, key, index === 0]));
  const withoutComments = sql.replace(/--.*$/gm, '');
  const statements = withoutComments.replace(/ON COMMIT DROP/gi, '').replace(/'[^']*'/g, "''");

  it('the script maps exactly the groups the definitions declare (no drift)', () => {
    expect(sqlPairs).toEqual(expectedPairs);
    expect(sqlPairs).toHaveLength(25);
    expect(new Set(sqlPairs.map((p) => p[0]))).toEqual(new Set(LEGACY_STAGE1_KEYS.filter((k) => k !== 'missing_info_identified')));
  });

  it('is INSERT-only: no UPDATE, DELETE, TRUNCATE, DROP, ALTER, GRANT or REVOKE', () => {
    expect(statements).not.toMatch(/\b(UPDATE|DELETE|TRUNCATE|DROP|ALTER|GRANT|REVOKE)\b/i);
    const targets = Array.from(withoutComments.matchAll(/INSERT\s+INTO\s+([a-z_]+)/gi)).map((m) => m[1].toLowerCase());
    expect(new Set(targets)).toEqual(new Set(['_map', '_items', 'stage_checklist_responses', 'workflow_exceptions', 'mentoring_events']));
  });

  it('never touches stage status, holds, the Sales handover or other tables', () => {
    expect(statements).not.toMatch(/INSERT\s+INTO\s+(mentoring_stages|workflow_holds|enrollment_handovers|enrollment_handover_fields|mentoring_activations)/i);
  });

  it('is idempotent and insert-safe (ON CONFLICT DO NOTHING on every row insert)', () => {
    expect((withoutComments.match(/ON CONFLICT \(stage_id, item_key\) DO NOTHING/g) ?? [])).toHaveLength(3);
  });

  it('checks that old rows, stage statuses and the Sales data are unchanged, and that ready stages stay resolved', () => {
    for (const text of ['Version-1 checklist rows changed', 'A stage status changed', 'The Sales handover data changed', 'would have unresolved items', 'is missing checklist items']) {
      expect(sql).toContain(text);
    }
  });

  it('is a DRY RUN by default and marked as not executed', () => {
    expect(withoutComments.trim().endsWith('ROLLBACK;')).toBe(true);
    expect(withoutComments.split(';').map((s) => s.trim().toUpperCase())).not.toContain('COMMIT');
    expect(sql).toContain('*** NOT EXECUTED ***');
  });

  it('uses the same carry-over marker as the reference implementation', () => {
    expect(sql).toContain(CARRIED_NOTE);
  });

  it('the migration that ships with the code touches no checklist data', () => {
    const migration = readFileSync(join(__dirname, '../../../prisma/migrations/20261103100000_add_mentoring_handover_field_values/migration.sql'), 'utf8');
    // The foreign key's "ON DELETE RESTRICT ON UPDATE CASCADE" clause is referential, not a data change.
    const statements = migration.replace(/ON (DELETE|UPDATE) (RESTRICT|CASCADE|SET NULL|NO ACTION)/g, '');
    expect(statements).not.toMatch(/stage_checklist_responses|workflow_exceptions|mentoring_stages|mentoring_activations|\bUPDATE\b|\bDELETE\b|\bDROP\b|\bINSERT\b|\bTRUNCATE\b/);
    // Everything it creates or alters is the new table (plus the enum it uses); the Sales table is only referenced.
    expect(Array.from(statements.matchAll(/(?:CREATE TABLE|ALTER TABLE|CREATE (?:UNIQUE )?INDEX [^\n]* ON) "([a-z_]+)"/g)).map((m) => m[1])).toEqual([
      'enrollment_handover_fields', 'enrollment_handover_fields', 'enrollment_handover_fields',
    ]);
    expect(migration).toMatch(/CREATE TABLE "enrollment_handover_fields"/);
  });
});

/**
 * Rolling the CODE back (to a1716ad) after version-2 rows exist. The deployed gate counts EVERY mandatory row of a
 * stage, not just the ones in its own definition, so unresolved version-2 rows would block verification there.
 */
describe('rollback of the code after version-2 rows exist', () => {
  // The gate exactly as deployed in a1716ad (it takes rows only, not the definition).
  const deployedGate = (rows: Array<{ itemKey: string; mandatory: boolean; state: string; reason: string | null }>, exceptionKeys: ReadonlySet<string>) =>
    rows
      .filter((r) => r.mandatory)
      .filter((r) => {
        if (exceptionKeys.has(r.itemKey)) return false;
        if (r.state === 'VERIFIED') return false;
        if ((r.state === 'UNAVAILABLE' || r.state === 'NOT_APPLICABLE') && r.reason?.trim()) return false;
        return true;
      })
      .map((r) => r.itemKey);

  it('with the backfill, a stage that was ready is still ready for the old code (the old rows are untouched)', () => {
    const w = legacyWorld({ stageStatus: 'PENDING_REVIEW', rows: verifiedAll() });
    w.backfill();
    const rows = w.db.rows('stageChecklistResponse') as any[];
    expect(deployedGate(rows, new Set())).toEqual([]);
  });

  it('a stage the new code opened (26 pending version-2 rows) would be blocked by the old gate after a code rollback', async () => {
    const db = new FakeDb();
    db.seed('mentoringActivation', { id: 'act-9', leadId: 'l', studentId: 's', handoverId: 'h', status: 'ACTIVATION_IN_PROGRESS', currentStage: 1, currentMentorUserId: 'mentor-1' });
    await openStage(db as any, 'act-9', 1);
    const rows = db.rows('stageChecklistResponse') as any[];
    // Even if the Mentor finished every item the old code knows about, the unknown version-2 rows still count.
    expect(deployedGate(rows, new Set())).toHaveLength(26);
  });

  it('the rollback step (mark version-2 rows non-mandatory) lets the old code verify again, without deleting anything', async () => {
    const db = new FakeDb();
    db.seed('mentoringActivation', { id: 'act-9', leadId: 'l', studentId: 's', handoverId: 'h', status: 'ACTIVATION_IN_PROGRESS', currentStage: 1, currentMentorUserId: 'mentor-1' });
    await openStage(db as any, 'act-9', 1);
    const rows = db.rows('stageChecklistResponse') as any[];
    const before = rows.length;
    rows.filter((r) => r.definitionVersion === 2 && !(LEGACY_STAGE1_KEYS as readonly string[]).includes(r.itemKey)).forEach((r) => { r.mandatory = false; });
    // Only the one version-2 row that shares an old key (missing_info_identified) still counts for the old code.
    expect(deployedGate(rows, new Set())).toEqual(['missing_info_identified']);
    expect(rows).toHaveLength(before);
  });
});
