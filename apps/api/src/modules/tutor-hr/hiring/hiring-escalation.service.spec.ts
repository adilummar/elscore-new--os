import { HiringEscalationService } from './hiring-escalation.service';

const SCHEDULE = { startTime: '09:00', endTime: '18:00', workingDays: [1, 2, 3, 4, 5, 6], timezone: 'Asia/Kolkata' };
const overdueBooking = { id: 'b1', tutorLeadId: 'lead-1', assignedToUserId: 'mgr', evaluationDueAt: new Date(0), tutorLead: { businessId: 'TL-1' } };

function build(o: { overdue?: any[]; undated?: any[]; schedule?: any; heads?: any[]; existing?: Set<string>; failFirst?: boolean } = {}) {
  const created: any[] = [];
  const escalations: any[] = [];
  let calls = 0;
  const tx: any = {
    tutorEvaluationEscalation: {
      findUnique: jest.fn(({ where }: any) => Promise.resolve(o.existing?.has(where.bookingId_recipientUserId.recipientUserId) ? { id: 'x' } : null)),
      create: jest.fn((a: any) => { escalations.push(a.data); return Promise.resolve({}); }),
    },
    notification: { create: jest.fn((a: any) => { created.push(a.data); return Promise.resolve({ id: `n${created.length}`, createdAt: new Date('2026-11-16T10:00:00Z') }); }) },
  };
  const prisma: any = {
    tutorDemoBooking: {
      findMany: jest.fn().mockImplementation((a: any) => Promise.resolve(a.where.evaluationDueAt === null ? o.undated ?? [] : o.overdue ?? [])),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    user: { findMany: jest.fn().mockResolvedValue(o.heads ?? [{ id: 'head' }]) },
    $transaction: jest.fn((fn: any) => { calls++; if (o.failFirst && calls === 1) return Promise.reject(new Error('db down')); return Promise.resolve(fn(tx)); }),
  };
  const schedules: any = { getEffective: jest.fn().mockResolvedValue(o.schedule === undefined ? SCHEDULE : o.schedule) };
  return { svc: new HiringEscalationService(prisma, schedules), prisma, created, escalations };
}

describe('HiringEscalationService.runScan', () => {
  it('notifies the Head of Tutor Management only (not the assigned staff), storing notification evidence', async () => {
    const { svc, created, escalations } = build({ overdue: [overdueBooking] });
    const r = await svc.runScan(new Date());
    expect(created.map((n) => n.recipientUserId)).toEqual(['head']);
    expect(created[0]).toMatchObject({ type: 'TUTOR_EVALUATION_OVERDUE', entityId: 'lead-1' });
    expect(escalations.map((e) => [e.recipientUserId, e.recipientKind, !!e.notificationId, !!e.deliveredAt])).toEqual([
      ['head', 'TUTOR_HEAD', true, true],
    ]);
    expect(r).toMatchObject({ checked: 1, escalated: 1, notificationsWritten: 1 });
  });
  it('notifies every active Tutor Head, idempotently per recipient', async () => {
    const two = build({ overdue: [overdueBooking], heads: [{ id: 'head' }, { id: 'head2' }] });
    await two.svc.runScan(new Date());
    expect(two.created.map((n) => n.recipientUserId)).toEqual(['head', 'head2']);
    const again = build({ overdue: [overdueBooking], existing: new Set(['head']) });
    await again.svc.runScan(new Date());
    expect(again.created).toHaveLength(0);
  });
  it('records nothing when there is no active Tutor Head, so the next scan retries', async () => {
    const { svc, created, escalations, prisma } = build({ overdue: [overdueBooking], heads: [] });
    const r = await svc.runScan(new Date());
    expect(created).toHaveLength(0);
    expect(escalations).toHaveLength(0);
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(r.escalated).toBe(0);
  });
  it('only queries demos that are unevaluated, overdue and not yet escalated', async () => {
    const { svc, prisma } = build();
    await svc.runScan(new Date('2026-11-16T10:00:00Z'));
    const where = prisma.tutorDemoBooking.findMany.mock.calls.map((c: any) => c[0].where).find((w: any) => w.evaluationDueAt?.lt);
    expect(where).toMatchObject({ status: 'ATTENDED', evaluation: null, escalations: { none: {} } });
  });
  it('fills missing due dates only when a schedule exists', async () => {
    const undated = [{ id: 'b2', completedAt: new Date('2026-11-16T05:00:00Z') }];
    const withSchedule = build({ undated });
    expect((await withSchedule.svc.runScan()).dueDatesFilled).toBe(1);
    const without = build({ undated, schedule: null });
    const r = await without.svc.runScan();
    expect(r).toMatchObject({ dueDatesFilled: 0, skippedNoSchedule: true });
    expect(without.prisma.tutorDemoBooking.updateMany).not.toHaveBeenCalled();
  });
  it('one failing booking does not stop the others', async () => {
    const { svc, created } = build({ overdue: [overdueBooking, { ...overdueBooking, id: 'b3', tutorLeadId: 'lead-3' }], failFirst: true });
    const r = await svc.runScan();
    expect(r.escalated).toBe(1);
    expect(created.length).toBeGreaterThan(0);
  });
});

describe('HiringEscalationService.listForUser', () => {
  const now = new Date('2026-11-16T12:00:00Z');
  const row = (over: any = {}) => ({
    notificationId: 'n1', recipientKind: 'TUTOR_HEAD', escalatedAt: now, deliveredAt: new Date('2026-11-16T11:00:00Z'),
    booking: {
      id: 'b1', scheduledAt: new Date('2026-11-16T05:00:00Z'), completedAt: new Date('2026-11-16T06:00:00Z'),
      evaluationDueAt: new Date('2026-11-16T10:00:00Z'), evaluation: null,
      assignedTo: { id: 'a', email: 'assigned@x.test' },
      tutorLead: { id: 'lead-1', businessId: 'TL-1', firstName: 'Asha', lastName: 'Rao' },
      ...over,
    },
  });
  const build = (rows: any[], notifications: any[] = [{ id: 'n1', readAt: null, createdAt: new Date('2026-11-16T10:30:00Z') }]) => {
    const prisma: any = {
      tutorEvaluationEscalation: { findMany: jest.fn().mockResolvedValue(rows) },
      notification: { findMany: jest.fn().mockResolvedValue(notifications) },
    };
    return { svc: new HiringEscalationService(prisma, {} as any), prisma };
  };

  it('scopes to the caller and reports candidate, manager, status and overdue duration', async () => {
    const { svc, prisma } = build([row()]);
    const [r] = await svc.listForUser('u1', now);
    expect(prisma.tutorEvaluationEscalation.findMany.mock.calls[0][0].where).toEqual({ recipientUserId: 'u1' });
    expect(prisma.notification.findMany.mock.calls[0][0].where).toMatchObject({ recipientUserId: 'u1' });
    expect(r).toMatchObject({
      candidate: { candidateId: 'TL-1', name: 'Asha Rao' }, assignedManager: 'assigned@x.test',
      evaluationStatus: 'OVERDUE', overdueMinutes: 120,
    });
    expect(r.notifiedAt).toEqual(new Date('2026-11-16T10:30:00Z'));
  });
  it('uses the evaluation time once evaluated and names the Assigned To', async () => {
    const evaluatedAt = new Date('2026-11-16T10:45:00Z');
    const { svc } = build([row({ evaluation: { evaluatedAt } })]);
    const [r] = await svc.listForUser('u1', now);
    expect(r).toMatchObject({ evaluationStatus: 'EVALUATED', overdueMinutes: 45, assignedManager: 'assigned@x.test' });
  });
});
