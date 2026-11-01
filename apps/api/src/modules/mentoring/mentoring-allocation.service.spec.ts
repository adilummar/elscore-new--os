import { BadRequestException, ConflictException } from '@nestjs/common';


import { chooseMentor, MentoringAllocationService, MentorCandidate } from './mentoring-allocation.service';
import { MentoringHistoryService } from './mentoring-history.service';
import { FakeDb } from './testing/mentoring-fake-db';

const cand = (userId: string, load: number, capacity = 40, last: Date | null = null): MentorCandidate => ({ userId, load, capacity, lastAssignedAt: last });

describe('chooseMentor (selection rule)', () => {
  it('picks the least-loaded mentor', () => {
    expect(chooseMentor([cand('a', 5), cand('b', 2), cand('c', 9)])).toEqual({ mentorUserId: 'b', reason: 'LEAST_LOADED' });
  });

  it('never picks a mentor at capacity', () => {
    expect(chooseMentor([cand('a', 10, 10), cand('b', 30)])?.mentorUserId).toBe('b');
    expect(chooseMentor([cand('a', 10, 10), cand('b', 5, 5)])).toBeNull();
    expect(chooseMentor([])).toBeNull();
  });

  it('breaks load ties by load/capacity, then least recent assignment, then user id', () => {
    expect(chooseMentor([cand('a', 4, 10), cand('b', 4, 40)])?.mentorUserId).toBe('b');
    const old = new Date('2026-01-01');
    const recent = new Date('2026-10-01');
    expect(chooseMentor([cand('a', 4, 40, recent), cand('b', 4, 40, old)])?.mentorUserId).toBe('b');
    expect(chooseMentor([cand('a', 4, 40, recent), cand('b', 4, 40, null)])?.mentorUserId).toBe('b');
    expect(chooseMentor([cand('z', 4), cand('m', 4)])?.mentorUserId).toBe('m');
  });

  it('keeps siblings with the same mentor when that mentor still has capacity', () => {
    const picked = chooseMentor([cand('a', 1), cand('b', 20)], { siblingAffinity: true, siblingMentorIds: ['b'] });
    expect(picked).toEqual({ mentorUserId: 'b', reason: 'SIBLING_AFFINITY' });
  });

  it('ignores sibling affinity when the sibling mentor is full or the rule is off', () => {
    expect(chooseMentor([cand('a', 1), cand('b', 40, 40)], { siblingAffinity: true, siblingMentorIds: ['b'] })?.mentorUserId).toBe('a');
    expect(chooseMentor([cand('a', 1), cand('b', 20)], { siblingAffinity: false, siblingMentorIds: ['b'] })?.mentorUserId).toBe('a');
  });
});

function setup() {
  const db = new FakeDb();
  const history = new MentoringHistoryService({ recordInTx: jest.fn().mockResolvedValue(undefined) } as any);
  const service = new MentoringAllocationService(db as any, history);

  const mentor = (id: string, opts: { load?: number; capacity?: number | null; active?: boolean; accepting?: boolean; employment?: string; userStatus?: string; role?: boolean } = {}) => {
    db.seed('user', { id, status: opts.userStatus ?? 'ACTIVE' });
    db.seed('employee', { userId: id, firstName: id, lastName: 'M', employmentStatus: opts.employment ?? 'ACTIVE' });
    db.seed('mentoringStaffProfile', { userId: id, role: 'MENTOR', capacity: opts.capacity ?? null, isActive: opts.active ?? true, acceptsAllocation: opts.accepting ?? true });
    if (opts.role !== false) db.seed('userRole', { userId: id, role: { code: 'MENTOR' }, user: { status: 'ACTIVE' } });
    for (let i = 0; i < (opts.load ?? 0); i++) {
      db.seed('mentoringActivation', { id: `${id}-open-${i}`, leadId: `L-${id}-${i}`, studentId: `S-${id}-${i}`, status: 'ACTIVATION_IN_PROGRESS', currentStage: 1, currentMentorUserId: id });
    }
  };
  const awaiting = (id = 'act-new', leadId = 'lead-new') =>
    db.seed('mentoringActivation', { id, leadId, studentId: `stu-${id}`, handoverId: `ho-${id}`, status: 'AWAITING_ALLOCATION', currentStage: 1, currentMentorUserId: null });
  const head = () => db.seed('userRole', { userId: 'head-1', role: { code: 'MENTORING_HEAD' }, user: { status: 'ACTIVE' } });
  const activation = (id: string) => db.rows('mentoringActivation').find((a) => a.id === id)!;
  return { db, service, mentor, awaiting, head, activation, tx: db as any };
}

describe('MentoringAllocationService automatic allocation', () => {
  it('allocates to the least-loaded eligible mentor, records the decision, opens Stage 1 and notifies', async () => {
    const { db, service, mentor, awaiting, head, activation, tx } = setup();
    mentor('m1', { load: 3 }); mentor('m2', { load: 1 }); mentor('m3', { load: 2 });
    awaiting(); head();

    const result = await service.autoAllocateInTx(tx, 'act-new', 'system');

    expect(result).toEqual({ allocated: true, mentorUserId: 'm2' });
    expect(activation('act-new')).toMatchObject({ currentMentorUserId: 'm2', status: 'ACTIVATION_IN_PROGRESS' });
    const assignment = db.rows('mentorAssignment')[0];
    expect(assignment).toMatchObject({ mentorUserId: 'm2', type: 'AUTO', currentKey: 'act-new', reason: 'LEAST_LOADED' });
    expect(assignment.decision.candidates).toEqual(expect.arrayContaining([{ userId: 'm1', load: 3, capacity: 40 }, { userId: 'm2', load: 1, capacity: 40 }]));
    expect(db.rows('mentoringStage')).toHaveLength(7);
    expect(db.rows('mentoringStage').find((s) => s.stageNumber === 1)!.status).toBe('IN_PROGRESS');
    expect(db.rows('stageChecklistResponse').length).toBeGreaterThan(0);
    expect(db.rows('notification').map((n) => n.recipientUserId).sort()).toEqual(['head-1', 'm2']);
  });

  it('is idempotent: allocating the same student twice does nothing the second time', async () => {
    const { db, service, mentor, awaiting, tx } = setup();
    mentor('m1'); awaiting();

    await service.autoAllocateInTx(tx, 'act-new', 'system');
    const again = await service.autoAllocateInTx(tx, 'act-new', 'system');

    expect(again).toMatchObject({ allocated: false, reason: 'NOT_AWAITING_ALLOCATION' });
    expect(db.rows('mentorAssignment')).toHaveLength(1);
  });

  it('never moves a student who already has a mentor, even if another mentor is less loaded', async () => {
    const { db, service, mentor, activation, tx } = setup();
    mentor('busy', { load: 10 }); mentor('idle', { load: 0 });
    const existing = activation('busy-open-0');

    const result = await service.autoAllocateInTx(tx, existing.id, 'system');

    expect(result.allocated).toBe(false);
    expect(activation('busy-open-0').currentMentorUserId).toBe('busy');
    expect(db.rows('mentorAssignment')).toHaveLength(0);
  });

  it('skips inactive mentors, mentors not accepting, mentors on leave, inactive users and mentors at capacity', async () => {
    const { service, mentor, awaiting, activation, tx } = setup();
    mentor('inactive', { active: false });
    mentor('not-accepting', { accepting: false });
    mentor('on-leave', { employment: 'ON_LEAVE' });
    mentor('disabled-user', { userStatus: 'INACTIVE' });
    mentor('no-role', { role: false });
    mentor('full', { load: 2, capacity: 2 });
    mentor('ok', { load: 5 });
    awaiting();

    const result = await service.autoAllocateInTx(tx, 'act-new', 'system');

    expect(result).toEqual({ allocated: true, mentorUserId: 'ok' });
    expect(activation('act-new').currentMentorUserId).toBe('ok');
  });

  it('queues the student and alerts the Head when nobody is eligible', async () => {
    const { db, service, mentor, awaiting, head, activation, tx } = setup();
    mentor('full', { load: 1, capacity: 1 });
    awaiting(); head();

    const result = await service.autoAllocateInTx(tx, 'act-new', 'system');

    expect(result).toMatchObject({ allocated: false, reason: 'NO_ELIGIBLE_MENTOR' });
    expect(activation('act-new')).toMatchObject({ status: 'AWAITING_ALLOCATION', currentMentorUserId: null });
    expect(db.rows('notification').map((n) => n.recipientUserId)).toEqual(['head-1']);
    expect(db.rows('mentoringEvent').map((e) => e.type)).toContain('ALLOCATION_QUEUED');
  });

  it('leaves the student in the queue when allocation is set to manual', async () => {
    const { db, service, mentor, awaiting, tx } = setup();
    mentor('m1'); awaiting();
    db.seed('mentoringSetting', { id: 'default', allocationMode: 'MANUAL', defaultCapacity: 40, siblingAffinity: true });

    const result = await service.autoAllocateInTx(tx, 'act-new', 'system');

    expect(result).toMatchObject({ allocated: false, reason: 'MANUAL_MODE' });
    expect(db.rows('mentorAssignment')).toHaveLength(0);
  });

  it('keeps siblings of the same lead with the same mentor', async () => {
    const { service, mentor, awaiting, db, activation, tx } = setup();
    mentor('m1', { load: 8 }); mentor('m2', { load: 0 });
    db.seed('mentoringActivation', { id: 'sibling-1', leadId: 'lead-shared', studentId: 'stu-s1', status: 'ACTIVATION_IN_PROGRESS', currentStage: 1, currentMentorUserId: 'm1' });
    awaiting('act-sib', 'lead-shared');

    await service.autoAllocateInTx(tx, 'act-sib', 'system');

    expect(activation('act-sib').currentMentorUserId).toBe('m1');
    expect(db.rows('mentorAssignment')[0].reason).toBe('SIBLING_AFFINITY');
  });
});

describe('MentoringAllocationService manual allocation by the Head', () => {
  it('allocates, reassigns and keeps the full history with exactly one current assignment', async () => {
    const { db, service, mentor, awaiting, activation } = setup();
    mentor('m1'); mentor('m2'); awaiting();

    await service.allocate('act-new', { mentorUserId: 'm1', reason: 'Language match' }, 'head-1');
    await service.reassign('act-new', { mentorUserId: 'm2', reason: 'Workload balance' }, 'head-1');

    const history = db.rows('mentorAssignment');
    expect(history).toHaveLength(2);
    expect(history.filter((a) => a.currentKey)).toHaveLength(1);
    expect(history.find((a) => a.mentorUserId === 'm1')).toMatchObject({ currentKey: null });
    expect(history.find((a) => a.mentorUserId === 'm1')!.endedAt).toBeInstanceOf(Date);
    expect(activation('act-new').currentMentorUserId).toBe('m2');
    expect(db.rows('notification').filter((n) => n.type === 'MENTORING_REASSIGNED_AWAY').map((n) => n.recipientUserId)).toEqual(['m1']);
  });

  it('refuses invalid targets and over-capacity allocation without a reason', async () => {
    const { service, mentor, awaiting, db } = setup();
    mentor('full', { load: 1, capacity: 1 }); awaiting();
    db.seed('user', { id: 'plain', status: 'ACTIVE' });

    await expect(service.allocate('act-new', { mentorUserId: 'plain' }, 'head-1')).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.allocate('act-new', { mentorUserId: 'full' }, 'head-1')).rejects.toBeInstanceOf(ConflictException);
    await expect(service.allocate('act-new', { mentorUserId: 'full', overCapacityReason: 'Exam season cover' }, 'head-1')).resolves.toBeDefined();
  });

  it('temporary transfer can be ended to return the student to the original mentor', async () => {
    const { db, service, mentor, awaiting, activation } = setup();
    mentor('m1'); mentor('m2'); awaiting();
    await service.allocate('act-new', { mentorUserId: 'm1' }, 'head-1');

    await service.temporaryTransfer('act-new', { mentorUserId: 'm2', reason: 'Leave cover', expectedReturnAt: new Date('2026-11-20') }, 'head-1');
    expect(activation('act-new').currentMentorUserId).toBe('m2');

    await service.endTransfer('act-new', 'head-1');
    expect(activation('act-new').currentMentorUserId).toBe('m1');
    expect(db.rows('mentorAssignment')).toHaveLength(3);
  });

  it('returns a student to the queue, only while the workflow is in progress', async () => {
    const { service, mentor, awaiting, activation } = setup();
    mentor('m1'); awaiting();
    await service.allocate('act-new', { mentorUserId: 'm1' }, 'head-1');

    await service.returnToQueue('act-new', 'Mentor leaving', 'head-1');
    expect(activation('act-new')).toMatchObject({ status: 'AWAITING_ALLOCATION', currentMentorUserId: null });
    await expect(service.returnToQueue('act-new', 'again', 'head-1')).rejects.toBeInstanceOf(ConflictException);
  });
});
