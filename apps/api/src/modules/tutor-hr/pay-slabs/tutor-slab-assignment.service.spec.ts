import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';

import { addMonths, monthText, TutorSlabAssignmentService } from './tutor-slab-assignment.service';

const NOV = new Date('2026-11-01T00:00:00Z');
const DEC = new Date('2026-12-01T00:00:00Z');
const OCT = new Date('2026-10-01T00:00:00Z');

type Row = { id: string; slabId: string; fromMonth: Date; toMonth: Date | null; source?: string; cancelledAt?: Date | null };

function build(o: { live?: Row[]; tutor?: any; slab?: any; row?: any; previous?: any; month?: Date } = {}) {
  const tx: any = {
    $executeRaw: jest.fn().mockResolvedValue(1),
    $queryRaw: jest.fn().mockResolvedValue([{ m: o.month ?? NOV }]),
    tutorProfile: {
      findUnique: jest.fn().mockResolvedValue(o.tutor === undefined ? { id: 'tp-1', tutorCode: 'TUT-0001' } : o.tutor),
    },
    tutorSalarySlab: {
      findUnique: jest.fn().mockResolvedValue(o.slab === undefined ? { id: 'slab-b', name: 'Slab B' } : o.slab),
      findMany: jest.fn().mockResolvedValue([]),
    },
    tutorSlabAssignment: {
      findMany: jest.fn().mockResolvedValue(o.live ?? []),
      findFirst: jest.fn()
        .mockResolvedValueOnce(o.row ?? null)
        .mockResolvedValueOnce(o.previous ?? null),
      create: jest.fn().mockResolvedValue({ id: 'new-1' }),
      update: jest.fn().mockResolvedValue({}),
    },
    tutorDemoEvaluation: { findFirst: jest.fn() },
  };
  const prisma: any = { ...tx, $transaction: jest.fn((fn: any) => Promise.resolve(fn(tx))) };
  const audit: any = { recordInTx: jest.fn() };
  return { svc: new TutorSlabAssignmentService(prisma, audit), tx, prisma, audit };
}

const dto = { slabId: 'slab-b', reason: ' Promoted ' };

describe('month helpers', () => {
  it('formats and adds whole months from the 1st', () => {
    expect(monthText(NOV)).toBe('2026-11-01');
    expect(monthText(addMonths(NOV, 1))).toBe('2026-12-01');
    expect(monthText(addMonths(DEC, 1))).toBe('2027-01-01');
    expect(monthText(addMonths(NOV, -1))).toBe('2026-10-01');
  });
});

describe('TutorSlabAssignmentService.assign', () => {
  it('gives a tutor with no slab a first slab starting this month (HR_INITIAL)', async () => {
    const { svc, tx, audit } = build({ live: [] });
    jest.spyOn(svc, 'getSalary').mockResolvedValue({} as any);
    await svc.assign('tp-1', dto, 'hr-1');
    expect(tx.tutorSlabAssignment.create.mock.calls[0][0].data).toEqual({
      tutorProfileId: 'tp-1', slabId: 'slab-b', fromMonth: NOV, source: 'HR_INITIAL', changedByUserId: 'hr-1', reason: 'Promoted',
    });
    expect(tx.tutorSlabAssignment.update).not.toHaveBeenCalled();
    expect(audit.recordInTx.mock.calls[0][1].action).toBe('TUTOR_SLAB_ASSIGNED');
  });

  it('a change mid-month closes the current row at this month and starts the new slab NEXT month', async () => {
    const { svc, tx, audit } = build({ live: [{ id: 'a-1', slabId: 'slab-a', fromMonth: OCT, toMonth: null }] });
    jest.spyOn(svc, 'getSalary').mockResolvedValue({} as any);
    await svc.assign('tp-1', dto, 'hr-1');
    expect(tx.tutorSlabAssignment.update).toHaveBeenCalledWith({ where: { id: 'a-1' }, data: { toMonth: NOV } });
    expect(tx.tutorSlabAssignment.create.mock.calls[0][0].data).toMatchObject({
      slabId: 'slab-b', fromMonth: DEC, source: 'HR_CHANGE', reason: 'Promoted',
    });
    // close happens before the insert
    expect(tx.tutorSlabAssignment.update.mock.invocationCallOrder[0]).toBeLessThan(
      tx.tutorSlabAssignment.create.mock.invocationCallOrder[0],
    );
    expect(audit.recordInTx.mock.calls[0][1]).toMatchObject({ action: 'TUTOR_SLAB_CHANGE_SCHEDULED' });
  });

  it('runs in one transaction under a per-tutor lock', async () => {
    const { svc, tx, prisma } = build({ live: [] });
    jest.spyOn(svc, 'getSalary').mockResolvedValue({} as any);
    await svc.assign('tp-1', dto, 'hr-1');
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(tx.$executeRaw).toHaveBeenCalledTimes(1);
  });

  it('refuses a change while another is already waiting for next month', async () => {
    const { svc, tx } = build({ live: [{ id: 'a-2', slabId: 'slab-c', fromMonth: DEC, toMonth: null }] });
    await expect(svc.assign('tp-1', dto, 'hr-1')).rejects.toThrow(/already waiting/);
    expect(tx.tutorSlabAssignment.create).not.toHaveBeenCalled();
  });

  it('refuses the slab the tutor is already on', async () => {
    const { svc } = build({ live: [{ id: 'a-1', slabId: 'slab-b', fromMonth: OCT, toMonth: null }] });
    await expect(svc.assign('tp-1', dto, 'hr-1')).rejects.toBeInstanceOf(ConflictException);
  });

  it('requires a reason, an existing slab and a tutor with a Tutor ID', async () => {
    await expect(build().svc.assign('tp-1', { slabId: 'slab-b', reason: '   ' }, 'hr-1')).rejects.toBeInstanceOf(BadRequestException);
    await expect(build({ slab: null }).svc.assign('tp-1', dto, 'hr-1')).rejects.toBeInstanceOf(BadRequestException);
    await expect(build({ tutor: null }).svc.assign('tp-1', dto, 'hr-1')).rejects.toBeInstanceOf(NotFoundException);
    await expect(build({ tutor: { id: 'tp-1', tutorCode: null } }).svc.assign('tp-1', dto, 'hr-1')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('turns a database refusal from a race into a plain 409', async () => {
    const { svc, tx } = build({ live: [] });
    tx.tutorSlabAssignment.create.mockRejectedValue(
      new Error('ConnectorError(PostgresError { code: "23P01", message: "conflicting key value violates exclusion constraint" })'),
    );
    await expect(svc.assign('tp-1', dto, 'hr-1')).rejects.toBeInstanceOf(ConflictException);
    tx.tutorSlabAssignment.create.mockRejectedValue(
      new Error('PostgresError { code: "23514", message: "A slab change is already waiting for next month: cancel it first" }'),
    );
    await expect(svc.assign('tp-1', dto, 'hr-1')).rejects.toThrow('A slab change is already waiting for next month: cancel it first');
  });

  it('lets unrelated errors through unchanged', async () => {
    const { svc, tx } = build({ live: [] });
    tx.tutorSlabAssignment.create.mockRejectedValue(new Error('boom'));
    await expect(svc.assign('tp-1', dto, 'hr-1')).rejects.toThrow('boom');
  });
});

describe('TutorSlabAssignmentService.cancel', () => {
  const change = { id: 'a-2', slabId: 'slab-b', fromMonth: DEC, source: 'HR_CHANGE', cancelledAt: null };
  const cdto = { reason: ' Wrong tutor ' };

  it('marks the change cancelled (row kept) and opens the previous row again, cancel first', async () => {
    const { svc, tx, audit } = build({ row: change, previous: { id: 'a-1' } });
    jest.spyOn(svc, 'getSalary').mockResolvedValue({} as any);
    await svc.cancel('tp-1', 'a-2', cdto, 'hr-1');
    const [cancelCall, reopenCall] = tx.tutorSlabAssignment.update.mock.calls;
    expect(cancelCall[0].where).toEqual({ id: 'a-2' });
    expect(cancelCall[0].data).toMatchObject({ cancelledByUserId: 'hr-1', cancelReason: 'Wrong tutor' });
    expect(cancelCall[0].data.cancelledAt).toBeInstanceOf(Date);
    expect(reopenCall[0]).toEqual({ where: { id: 'a-1' }, data: { toMonth: null } });
    expect(tx.tutorSlabAssignment.findFirst.mock.calls[1][0].where).toMatchObject({ toMonth: NOV, cancelledAt: null });
    expect(audit.recordInTx.mock.calls[0][1].action).toBe('TUTOR_SLAB_CHANGE_CANCELLED');
  });

  it('keeps every row: it only updates', async () => {
    const { svc, tx } = build({ row: change, previous: { id: 'a-1' } });
    jest.spyOn(svc, 'getSalary').mockResolvedValue({} as any);
    await svc.cancel('tp-1', 'a-2', cdto, 'hr-1');
    expect(tx.tutorSlabAssignment.update).toHaveBeenCalledTimes(2);
    expect(tx.tutorSlabAssignment.create).not.toHaveBeenCalled();
    expect(tx.tutorSlabAssignment.deleteMany).toBeUndefined();
  });

  it.each([
    ['unknown assignment', null, NotFoundException],
    ['already cancelled', { ...change, cancelledAt: new Date() }, ConflictException],
    ['the first slab', { ...change, source: 'DEMO_EVALUATION' }, ConflictException],
    ['a change whose month has started', { ...change, fromMonth: NOV }, ConflictException],
  ])('refuses %s', async (_n, row, err) => {
    const { svc, tx } = build({ row });
    await expect(svc.cancel('tp-1', 'a-2', cdto, 'hr-1')).rejects.toBeInstanceOf(err as any);
    expect(tx.tutorSlabAssignment.update).not.toHaveBeenCalled();
  });

  it('requires a reason', async () => {
    await expect(build({ row: change }).svc.cancel('tp-1', 'a-2', { reason: ' ' }, 'hr-1')).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('TutorSlabAssignmentService.assignFirstFromEvaluation', () => {
  it('uses the latest demo evaluation slab, from the current month, source DEMO_EVALUATION', async () => {
    const { svc, tx, audit } = build();
    tx.tutorDemoEvaluation.findFirst.mockResolvedValue({ id: 'ev-1', salarySlabId: 'slab-a' });
    const r = await svc.assignFirstFromEvaluation(tx, { tutorProfileId: 'tp-1', tutorLeadId: 'lead-1', actorUserId: 'head' });
    expect(tx.tutorDemoEvaluation.findFirst.mock.calls[0][0]).toMatchObject({ where: { tutorLeadId: 'lead-1' }, orderBy: { evaluatedAt: 'desc' } });
    expect(tx.tutorSlabAssignment.create.mock.calls[0][0].data).toMatchObject({
      tutorProfileId: 'tp-1', slabId: 'slab-a', fromMonth: NOV, source: 'DEMO_EVALUATION', evaluationId: 'ev-1', changedByUserId: 'head',
    });
    expect(r).toEqual({ assignmentId: 'new-1', slabId: 'slab-a' });
    expect(audit.recordInTx).toHaveBeenCalledTimes(1);
  });

  it('does nothing when the evaluation chose no slab (the tutor shows no slab)', async () => {
    const { svc, tx } = build();
    tx.tutorDemoEvaluation.findFirst.mockResolvedValue({ id: 'ev-1', salarySlabId: null });
    expect(await svc.assignFirstFromEvaluation(tx, { tutorProfileId: 'tp-1', tutorLeadId: 'lead-1', actorUserId: 'head' })).toBeNull();
    tx.tutorDemoEvaluation.findFirst.mockResolvedValue(null);
    expect(await svc.assignFirstFromEvaluation(tx, { tutorProfileId: 'tp-1', tutorLeadId: 'lead-1', actorUserId: 'head' })).toBeNull();
    expect(tx.tutorSlabAssignment.create).not.toHaveBeenCalled();
  });
});

describe('TutorSlabAssignmentService.getSalary', () => {
  it('splits the history into the slab for this month and the change waiting for next month', async () => {
    const mk = (id: string, slabId: string, f: Date, t: Date | null, extra: any = {}) => ({
      id, slabId, fromMonth: f, toMonth: t, source: extra.source ?? 'HR_CHANGE', reason: 'r', createdAt: new Date(),
      cancelledAt: extra.cancelledAt ?? null, cancelReason: extra.cancelReason ?? null,
      slab: { name: slabId, currency: 'INR' }, changedBy: { email: 'hr@x' }, cancelledBy: extra.cancelledAt ? { email: 'hr@x' } : null,
    });
    const { svc, tx, prisma } = build();
    prisma.tutorSlabAssignment.findMany.mockResolvedValue([
      mk('a-3', 'slab-b', DEC, null),
      mk('a-x', 'slab-c', DEC, null, { cancelledAt: new Date(), cancelReason: 'oops' }),
      mk('a-1', 'slab-a', OCT, NOV, { source: 'DEMO_EVALUATION' }),
    ]);
    prisma.tutorSalarySlab.findMany.mockResolvedValue([]);
    const r = await svc.getSalary('tp-1');
    expect(r.currentMonth).toBe('2026-11-01');
    expect(r.nextMonth).toBe('2026-12-01');
    expect(r.current?.id).toBe('a-1');
    expect(r.pending?.id).toBe('a-3');
    expect(r.pending?.canCancel).toBe(true);
    expect(r.current?.canCancel).toBe(false);
    expect(r.history.map((h) => h.id)).toEqual(['a-3', 'a-x', 'a-1']); // cancelled rows stay in history
    expect(r.history.find((h) => h.id === 'a-x')?.cancelled?.reason).toBe('oops');
    expect(r.history.find((h) => h.id === 'a-1')?.toMonth).toBe('2026-11-01');
    expect(tx).toBeDefined();
  });

  it('shows no slab for a tutor with no assignments', async () => {
    const { svc, prisma } = build();
    prisma.tutorSlabAssignment.findMany.mockResolvedValue([]);
    const r = await svc.getSalary('tp-1');
    expect(r.current).toBeNull();
    expect(r.pending).toBeNull();
    expect(r.history).toEqual([]);
  });
});
