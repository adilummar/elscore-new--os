import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';

import { HiringDemoService } from './hiring-demo.service';
import { HiringEvaluationService } from './hiring-evaluation.service';

const SCHEDULE = { startTime: '09:00', endTime: '18:00', workingDays: [1, 2, 3, 4, 5, 6], timezone: 'Asia/Kolkata' };
const future = () => new Date(Date.now() + 86_400_000).toISOString();

const lead = { id: 'lead-1', businessId: 'TL-1', createdByUserId: 'u1', assignedToUserId: 'u1', hiringStage: 'LIVE_DEMO_INTERVIEW', decision: null, leadStatus: 'PROCESSING' };
const booked = {
  id: 'b1', tutorLeadId: 'lead-1', status: 'BOOKED', scheduledAt: new Date(Date.now() - 3_600_000),
  assignedToUserId: 'u1', tutorLead: lead, evaluationDueAt: null, completedAt: null, evaluation: null,
};

function build(o: { lead?: any; booking?: any; schedule?: any; readAll?: boolean; override?: boolean; active?: any; assignable?: boolean; cas?: number; nearby?: any[] } = {}) {
  const tx: any = {
    tutorDemoBooking: {
      findFirst: jest.fn().mockResolvedValue(o.active ?? null),
      create: jest.fn().mockResolvedValue({ id: 'new-b' }),
      updateMany: jest.fn().mockResolvedValue({ count: o.cas ?? 1 }),
    },
    tutorDemoAssignmentHistory: { create: jest.fn() },
  };
  const prisma: any = {
    tutorLead: { findFirst: jest.fn().mockResolvedValue(o.lead === undefined ? lead : o.lead) },
    tutorDemoBooking: {
      findUnique: jest.fn().mockResolvedValue(o.booking === undefined ? booked : o.booking),
      findMany: jest.fn().mockResolvedValue(o.nearby ?? []),
      updateMany: jest.fn().mockResolvedValue({ count: o.cas ?? 1 }),
    },
    user: { findFirst: jest.fn().mockResolvedValue(o.assignable === false ? null : { id: 'x' }) },
    $transaction: jest.fn((fn: any) => Promise.resolve(fn(tx))),
  };
  const audit: any = { record: jest.fn(), recordInTx: jest.fn() };
  const rbac: any = { hasPermissions: jest.fn().mockResolvedValue(!!o.readAll) };
  const candidates: any = {
    assertCanModifyLead: jest.fn().mockResolvedValue(undefined),
    canOverrideConductor: jest.fn().mockResolvedValue(!!o.override),
  };
  const schedules: any = { getEffective: jest.fn().mockResolvedValue(o.schedule === undefined ? SCHEDULE : o.schedule) };
  const config: any = { get: jest.fn().mockReturnValue('Asia/Kolkata') };
  return { svc: new HiringDemoService(prisma, audit, rbac, candidates, schedules, config), prisma, tx, audit, candidates };
}

describe('HiringDemoService', () => {
  describe('book', () => {
    it('books with automatic booker/assigner attribution and first assignment history', async () => {
      const { svc, tx } = build();
      await svc.book('lead-1', { scheduledAt: future(), assignedToUserId: 'u2' }, 'u1');
      expect(tx.tutorDemoBooking.create.mock.calls[0][0].data).toMatchObject({ bookedByUserId: 'u1', assignedToUserId: 'u2' });
      expect(tx.tutorDemoAssignmentHistory.create.mock.calls[0][0].data).toMatchObject({ toUserId: 'u2', changedByUserId: 'u1' });
    });
    it('requires the Live Demo & Interview stage', async () => {
      const { svc } = build({ lead: { ...lead, hiringStage: 'CV' } });
      await expect(svc.book('lead-1', { scheduledAt: future(), assignedToUserId: 'u2' }, 'u1')).rejects.toBeInstanceOf(BadRequestException);
    });
    it('refuses leads whose Lead Status is not Processing', async () => {
      const { svc } = build({ lead: { ...lead, leadStatus: 'NOT_INTERESTED' } });
      await expect(svc.book('lead-1', { scheduledAt: future(), assignedToUserId: 'u2' }, 'u1')).rejects.toThrow(/Processing/);
    });
    it('refuses a second active booking', async () => {
      const { svc } = build({ active: { id: 'x' } });
      await expect(svc.book('lead-1', { scheduledAt: future(), assignedToUserId: 'u2' }, 'u1')).rejects.toBeInstanceOf(ConflictException);
    });
    it('rejects a non-assignable staff member and warns (not blocks) on nearby bookings', async () => {
      await expect(build({ assignable: false }).svc.book('lead-1', { scheduledAt: future(), assignedToUserId: 'u2' }, 'u1')).rejects.toBeInstanceOf(BadRequestException);
      const r = await build({ nearby: [{ id: 'other' }] }).svc.book('lead-1', { scheduledAt: future(), assignedToUserId: 'u2' }, 'u1');
      expect(r.conflicts).toHaveLength(1);
    });
  });

  describe('reschedule', () => {
    it('keeps the old booking as RESCHEDULE with reason and creates a linked new booking', async () => {
      const { svc, tx } = build();
      await svc.reschedule('b1', { scheduledAt: future(), reason: 'candidate unavailable' }, 'u1');
      expect(tx.tutorDemoBooking.updateMany.mock.calls[0][0]).toMatchObject({ where: { id: 'b1', status: 'BOOKED' }, data: { status: 'RESCHEDULE', rescheduleReason: 'candidate unavailable' } });
      expect(tx.tutorDemoBooking.create.mock.calls[0][0].data).toMatchObject({ rescheduledFromId: 'b1', assignedToUserId: 'u1' });
    });
    it('cannot reschedule a finished booking', async () => {
      const { svc } = build({ booking: { ...booked, status: 'ATTENDED' } });
      await expect(svc.reschedule('b1', { scheduledAt: future(), reason: 'whatever' }, 'u1')).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('reassign', () => {
    it('preserves the previous assignment and records who/when/why', async () => {
      const { svc, tx } = build();
      await svc.reassign('b1', { toUserId: 'u2', reason: 'workload balance' }, 'head');
      expect(tx.tutorDemoAssignmentHistory.create.mock.calls[0][0].data).toMatchObject({
        bookingId: 'b1', fromUserId: 'u1', toUserId: 'u2', reason: 'workload balance', changedByUserId: 'head',
      });
    });
    it('rejects reassigning to the same person and detects concurrent changes', async () => {
      await expect(build().svc.reassign('b1', { toUserId: 'u1', reason: 'same' }, 'head')).rejects.toBeInstanceOf(BadRequestException);
      await expect(build({ cas: 0 }).svc.reassign('b1', { toUserId: 'u2', reason: 'race' }, 'head')).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('attendance and SLA start (Assigned To conducts the demo)', () => {
    it('lets the Assigned To record it and starts a working-hours deadline from the completion time', async () => {
      const { svc, tx } = build();
      const completedAt = new Date(Date.now() - 600_000).toISOString();
      const r = await svc.recordAttendance('b1', { status: 'ATTENDED', completedAt }, 'u1');
      const data = tx.tutorDemoBooking.updateMany.mock.calls[0][0].data;
      expect(data).toEqual({ status: 'ATTENDED', completedAt: expect.any(Date), evaluationDueAt: expect.any(Date) });
      expect(data.completedAt.toISOString()).toBe(completedAt);
      expect(data.evaluationDueAt.getTime()).toBeGreaterThan(data.completedAt.getTime());
      expect(r).toMatchObject({ conductorUserId: 'u1', slaConfigured: true });
    });
    it('refuses other staff, even department-wide readers, but allows the Head override (audited)', async () => {
      await expect(build({ readAll: true }).svc.recordAttendance('b1', { status: 'ATTENDED' }, 'manager')).rejects.toBeInstanceOf(ForbiddenException);
      const head = build({ override: true });
      await head.svc.recordAttendance('b1', { status: 'ATTENDED' }, 'head');
      expect(head.audit.recordInTx.mock.calls[0][1].metadata).toEqual({ override: true });
      expect(head.audit.recordInTx.mock.calls[0][1].newValue.conductorUserId).toBe('u1');
    });
    it('leaves the deadline empty when no schedule is configured', async () => {
      const { svc, tx } = build({ schedule: null });
      const r = await svc.recordAttendance('b1', { status: 'ATTENDED' }, 'u1');
      expect(tx.tutorDemoBooking.updateMany.mock.calls[0][0].data.evaluationDueAt).toBeNull();
      expect(r.slaConfigured).toBe(false);
    });
    it('Not Attended does not start the SLA', async () => {
      const { svc, prisma } = build();
      await svc.recordAttendance('b1', { status: 'NOT_ATTENDED' }, 'u1');
      expect(prisma.tutorDemoBooking.updateMany.mock.calls[0][0].data).toEqual({ status: 'NOT_ATTENDED' });
    });
  });

  describe('workload scope', () => {
    const q = { from: '2026-11-16', to: '2026-11-16' };
    it('forces own workload for individuals and blocks viewing others', async () => {
      const { svc, prisma } = build();
      await svc.workload(q, 'u1');
      expect(prisma.tutorDemoBooking.findMany.mock.calls[0][0].where.assignedToUserId).toBe('u1');
      await expect(svc.workload({ ...q, assigneeId: 'other' }, 'u1')).rejects.toBeInstanceOf(ForbiddenException);
    });
    it('lets the Tutor Head see the department', async () => {
      const { svc, prisma } = build({ readAll: true });
      const r = await svc.workload(q, 'head');
      expect(prisma.tutorDemoBooking.findMany.mock.calls[0][0].where.assignedToUserId).toBeUndefined();
      expect(r.scope).toBe('DEPARTMENT');
    });
    it('rejects oversized ranges', async () => {
      await expect(build().svc.workload({ from: '2026-01-01', to: '2026-12-31' }, 'u1')).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('evaluation state', () => {
    const now = new Date('2026-11-16T10:00:00Z');
    it('derives Pending / Overdue / Completed / not configured', async () => {
      const { svc } = build();
      const done = new Date('2026-11-16T05:00:00Z');
      expect((await svc.slaFor({ status: 'ATTENDED', completedAt: done, evaluationDueAt: new Date('2026-11-16T12:00:00Z') }, now)).state).toBe('PENDING');
      expect((await svc.slaFor({ status: 'ATTENDED', completedAt: done, evaluationDueAt: new Date('2026-11-16T09:00:00Z') }, now)).state).toBe('OVERDUE');
      expect((await svc.slaFor({ status: 'ATTENDED', completedAt: done, evaluationDueAt: new Date('2026-11-16T09:00:00Z'), evaluation: { evaluatedAt: now } }, now)).state).toBe('COMPLETED');
      expect((await svc.slaFor({ status: 'BOOKED', completedAt: null, evaluationDueAt: null }, now)).state).toBe('NOT_APPLICABLE');
      expect((await build({ schedule: null }).svc.slaFor({ status: 'ATTENDED', completedAt: done, evaluationDueAt: null }, now, null)).state).toBe('SLA_NOT_CONFIGURED');
    });
  });
});

describe('HiringEvaluationService', () => {
  const attended = { id: 'b1', tutorLeadId: 'lead-1', status: 'ATTENDED', completedAt: new Date(), assignedToUserId: 'conductor', evaluationDueAt: new Date(Date.now() + 3_600_000), evaluation: null };
  function ev(o: { booking?: any; slab?: any; override?: boolean } = {}) {
    const tx: any = {
      tutorDemoEvaluation: { create: jest.fn().mockResolvedValue({ id: 'e1', evaluatedAt: new Date() }) },
      tutorLead: { update: jest.fn() },
    };
    const prisma: any = {
      tutorDemoBooking: { findUnique: jest.fn().mockResolvedValue(o.booking === undefined ? attended : o.booking) },
      tutorSalarySlab: { findFirst: jest.fn().mockResolvedValue(o.slab === undefined ? { id: 's1' } : o.slab) },
      $transaction: jest.fn((fn: any) => Promise.resolve(fn(tx))),
    };
    const audit: any = { recordInTx: jest.fn() };
    const candidates: any = { canOverrideConductor: jest.fn().mockResolvedValue(!!o.override) };
    return { svc: new HiringEvaluationService(prisma, audit, candidates), tx, audit };
  }
  const dto = { teachingMethods: 'clear', technicalSkills: 'good', englishRating: 4, salarySlabId: 's1' };

  it('links to the booking and attributes to the Assigned To (the conductor)', async () => {
    const { svc, tx, audit } = ev();
    await svc.submit('b1', dto, 'conductor');
    expect(tx.tutorDemoEvaluation.create.mock.calls[0][0].data).toMatchObject({ bookingId: 'b1', evaluatedByUserId: 'conductor', salarySlabId: 's1' });
    expect(audit.recordInTx.mock.calls[0][1].metadata.override).toBe(false);
  });
  it('refuses anyone else; the Head may file it on override, attributed to the Head', async () => {
    await expect(ev().svc.submit('b1', dto, 'manager')).rejects.toBeInstanceOf(ForbiddenException);
    const head = ev({ override: true });
    await head.svc.submit('b1', dto, 'head');
    expect(head.tx.tutorDemoEvaluation.create.mock.calls[0][0].data.evaluatedByUserId).toBe('head');
    expect(head.audit.recordInTx.mock.calls[0][1].metadata.override).toBe(true);
  });
  it('requires an attended demo, no prior evaluation, and an active slab', async () => {
    await expect(ev({ booking: { ...attended, status: 'BOOKED' } }).svc.submit('b1', dto, 'conductor')).rejects.toBeInstanceOf(BadRequestException);
    await expect(ev({ booking: { ...attended, evaluation: { id: 'x' } } }).svc.submit('b1', dto, 'conductor')).rejects.toBeInstanceOf(ConflictException);
    await expect(ev({ slab: null }).svc.submit('b1', dto, 'conductor')).rejects.toBeInstanceOf(BadRequestException);
  });
});
