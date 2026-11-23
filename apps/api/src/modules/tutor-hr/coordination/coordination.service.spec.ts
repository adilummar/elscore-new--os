import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';

import { CoordinationService } from './coordination.service';

const tutor = (o: any = {}) => ({
  id: 'tp-1', tutorCode: 'TUT-0001', coordinatorUserId: null, tutorOperationalStatus: 'ACTIVE',
  employee: { firstName: 'Asha', lastName: 'Rao' }, ...o,
});
const row = (o: any = {}) => ({
  id: 'tp-1', tutorCode: 'TUT-0001', tutorOperationalStatus: 'ACTIVE', verifiedAt: new Date('2026-10-01'), coordinatorAssignedAt: new Date('2026-10-02'),
  coordinator: { id: 'coord-1', email: 'c1@x.test' },
  employee: { firstName: 'Asha', lastName: 'Rao', phone: '+919876543210', user: { email: 'asha@x.test' } },
  subjects: [{ subject: { name: 'Maths' } }], grades: [{ grade: { name: 'Grade 8' } }], qualifications: [{ name: 'B.Ed' }],
  observations: [], _count: { observations: 0 }, ...o,
});

function build(o: { head?: boolean; tutors?: any[]; rows?: any[]; seen?: any; coordinatorOk?: boolean; cas?: number; observation?: any } = {}) {
  const tx: any = {
    tutorProfile: { updateMany: jest.fn().mockResolvedValue({ count: o.cas ?? 1 }) },
    tutorCoordinatorAssignment: { create: jest.fn() },
    notification: { create: jest.fn() },
    tutorObservation: { create: jest.fn().mockResolvedValue({ id: 'ob-1' }), updateMany: jest.fn().mockResolvedValue({ count: o.cas ?? 1 }) },
    tutorObservationRevision: { create: jest.fn() },
  };
  const prisma: any = {
    user: { findFirst: jest.fn().mockResolvedValue(o.coordinatorOk === false ? null : { id: 'coord-2' }), findMany: jest.fn().mockResolvedValue([]) },
    tutorProfile: {
      findMany: jest.fn().mockImplementation((a: any) => Promise.resolve(a.select?._count ? o.rows ?? [row()] : o.tutors ?? [tutor()])),
      findFirst: jest.fn().mockResolvedValue(o.seen === undefined ? tutor({ coordinatorUserId: 'coord-1' }) : o.seen),
    },
    tutorObservation: { findMany: jest.fn().mockResolvedValue([]), findUnique: jest.fn().mockResolvedValue(o.observation ?? null) },
    tutorCoordinatorAssignment: { findMany: jest.fn().mockResolvedValue([]) },
    $transaction: jest.fn((fn: any) => Promise.resolve(fn(tx))),
  };
  const audit: any = { recordInTx: jest.fn() };
  const rbac: any = { hasPermissions: jest.fn().mockResolvedValue(!!o.head) };
  const config: any = { get: jest.fn().mockReturnValue('Asia/Kolkata') };
  return { svc: new CoordinationService(prisma, audit, rbac, config), prisma, tx, audit };
}

describe('CoordinationService', () => {
  describe('scope', () => {
    it('a coordinator only lists tutors assigned to them, and cannot use the coordinator filter', async () => {
      const { svc, prisma } = build();
      const r = await svc.listTutors({}, 'coord-1');
      expect(r.scope).toBe('OWN');
      expect(prisma.tutorProfile.findMany.mock.calls[0][0].where.AND[0]).toMatchObject({ coordinatorUserId: 'coord-1' });
      await expect(svc.listTutors({ coordinatorId: 'coord-2' }, 'coord-1')).rejects.toBeInstanceOf(ForbiddenException);
    });
    it('the Head sees everything and can filter by coordinator or unassigned', async () => {
      const { svc, prisma } = build({ head: true });
      expect((await svc.listTutors({}, 'head')).scope).toBe('ALL');
      expect(prisma.tutorProfile.findMany.mock.calls[0][0].where.AND[0].coordinatorUserId).toBeUndefined();
      await svc.listTutors({ coordinatorId: 'none' }, 'head');
      expect(prisma.tutorProfile.findMany.mock.calls[1][0].where.AND[0]).toMatchObject({ coordinatorUserId: null });
    });
    it('returns the list fields, last observation and this month status; students per grade not available', async () => {
      const last = new Date('2026-11-20T09:00:00Z');
      const { svc } = build({ rows: [row({ observations: [{ observedAt: last }], _count: { observations: 1 } })] });
      const [t] = (await svc.listTutors({}, 'coord-1')).data;
      expect(t).toMatchObject({
        tutorId: 'TUT-0001', name: 'Asha Rao', phone: '+919876543210', email: 'asha@x.test', subjects: ['Maths'], grades: ['Grade 8'],
        qualifications: ['B.Ed'], lastObservedAt: last, observationStatus: 'OBSERVED', studentsPerGrade: 'Not available yet',
      });
      expect(t).not.toHaveProperty('bank');
    });
    it('a coordinator cannot open a tutor assigned to someone else', async () => {
      await expect(build({ seen: tutor({ coordinatorUserId: 'coord-2' }) }).svc.tutorDetail('tp-1', 'coord-1')).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  describe('dashboard', () => {
    it('reports the five metrics, complaints not available yet', async () => {
      const { svc } = build({ rows: [row({ _count: { observations: 1 } }), row({ id: 'tp-2', coordinatorAssignedAt: new Date('2026-01-01') })] });
      const r = await svc.dashboard({}, 'coord-1');
      expect(r.metrics).toEqual({ totalAssigned: 2, observedThisMonth: 1, notYetObserved: 1, pendingComplaints: 'Not available yet', complaintsAwaitingAction: 'Not available yet' });
      expect((r as any).coordinators).toBeUndefined();
    });
    it('gives the Head a per-coordinator breakdown', async () => {
      const r: any = await build({ head: true, rows: [row({ _count: { observations: 1 } }), row({ id: 'tp-2' })] }).svc.dashboard({}, 'head');
      expect(r.coordinators).toEqual([expect.objectContaining({ coordinator: { id: 'coord-1', email: 'c1@x.test' }, assigned: 2, observed: 1, coveragePercent: 50 })]);
    });
  });

  describe('assignment', () => {
    it('assigns with history and notifies the new coordinator only', async () => {
      const { svc, tx } = build({ head: true });
      await svc.assign({ tutorProfileIds: ['tp-1'], coordinatorUserId: 'coord-2' }, 'head');
      expect(tx.tutorProfile.updateMany.mock.calls[0][0]).toMatchObject({ where: { id: 'tp-1', coordinatorUserId: null }, data: { coordinatorUserId: 'coord-2' } });
      expect(tx.tutorCoordinatorAssignment.create.mock.calls[0][0].data).toMatchObject({ fromUserId: null, toUserId: 'coord-2', changedByUserId: 'head' });
      expect(tx.notification.create.mock.calls.map((c: any) => [c[0].data.recipientUserId, c[0].data.type])).toEqual([['coord-2', 'TUTOR_COORDINATOR_ASSIGNED']]);
    });
    it('reassignment notifies both the previous and the new coordinator', async () => {
      const { svc, tx } = build({ head: true, tutors: [tutor({ coordinatorUserId: 'coord-1' })] });
      await svc.assign({ tutorProfileIds: ['tp-1'], coordinatorUserId: 'coord-2', reason: 'workload' }, 'head');
      expect(tx.notification.create.mock.calls.map((c: any) => [c[0].data.recipientUserId, c[0].data.type])).toEqual([
        ['coord-2', 'TUTOR_COORDINATOR_ASSIGNED'], ['coord-1', 'TUTOR_COORDINATOR_REASSIGNED'],
      ]);
      expect(tx.tutorCoordinatorAssignment.create.mock.calls[0][0].data).toMatchObject({ fromUserId: 'coord-1', toUserId: 'coord-2', reason: 'workload' });
    });
    it('unassigning needs a reason and notifies the coordinator who loses the tutor', async () => {
      const assigned = [tutor({ coordinatorUserId: 'coord-1' })];
      await expect(build({ head: true, tutors: assigned }).svc.assign({ tutorProfileIds: ['tp-1'], coordinatorUserId: null }, 'head')).rejects.toBeInstanceOf(BadRequestException);
      const { svc, tx } = build({ head: true, tutors: assigned });
      await svc.assign({ tutorProfileIds: ['tp-1'], coordinatorUserId: null, reason: 'coordinator left' }, 'head');
      expect(tx.notification.create.mock.calls.map((c: any) => [c[0].data.recipientUserId, c[0].data.type])).toEqual([['coord-1', 'TUTOR_COORDINATOR_UNASSIGNED']]);
    });
    it('refuses Discontinued tutors, non-coordinators and concurrent changes', async () => {
      await expect(build({ head: true, tutors: [tutor({ tutorOperationalStatus: 'DISCONTINUED' })] }).svc.assign({ tutorProfileIds: ['tp-1'], coordinatorUserId: 'coord-2' }, 'head')).rejects.toThrow(/Discontinued/);
      await expect(build({ head: true, coordinatorOk: false }).svc.assign({ tutorProfileIds: ['tp-1'], coordinatorUserId: 'x' }, 'head')).rejects.toThrow(/Tutor Coordinator/);
      await expect(build({ head: true, cas: 0 }).svc.assign({ tutorProfileIds: ['tp-1'], coordinatorUserId: 'coord-2' }, 'head')).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('observations', () => {
    const obs = { id: 'ob-1', tutorProfileId: 'tp-1', observedAt: new Date('2026-11-20T09:00:00Z'), positiveFeedback: 'clear', negativeFeedback: null, hiddenAt: null };
    it('the assigned coordinator can create one', async () => {
      const { svc, tx } = build();
      await svc.createObservation('tp-1', { observedAt: '2026-11-20T09:00:00Z', positiveFeedback: 'Engaging', negativeFeedback: ' ' }, 'coord-1');
      expect(tx.tutorObservation.create.mock.calls[0][0].data).toMatchObject({ tutorProfileId: 'tp-1', authorUserId: 'coord-1', positiveFeedback: 'Engaging', negativeFeedback: null });
    });
    it('another coordinator cannot', async () => {
      await expect(build({ seen: tutor({ coordinatorUserId: 'coord-2' }) }).svc.createObservation('tp-1', { observedAt: '2026-11-20T09:00:00Z', positiveFeedback: 'x' }, 'coord-1')).rejects.toBeInstanceOf(ForbiddenException);
    });
    it('a Head edit keeps the previous values as a revision and in the audit log', async () => {
      const { svc, tx, audit } = build({ head: true, observation: obs });
      await svc.editObservation('ob-1', { observedAt: '2026-11-20T09:00:00Z', positiveFeedback: 'clear', negativeFeedback: 'ran 10 min late' }, 'head');
      expect(tx.tutorObservationRevision.create.mock.calls[0][0].data).toMatchObject({ previousNegativeFeedback: null, newNegativeFeedback: 'ran 10 min late', editedByUserId: 'head' });
      expect(audit.recordInTx.mock.calls[0][1]).toMatchObject({ action: 'TUTOR_OBSERVATION_EDITED', oldValue: { negativeFeedback: null }, newValue: { negativeFeedback: 'ran 10 min late' } });
    });
    it('a Head delete hides it with a reason instead of removing it', async () => {
      const { svc, tx } = build({ head: true, observation: obs });
      await svc.hideObservation('ob-1', { reason: 'wrong tutor' }, 'head');
      expect(tx.tutorObservation.updateMany.mock.calls[0][0]).toMatchObject({ where: { id: 'ob-1', hiddenAt: null }, data: { hiddenByUserId: 'head', hiddenReason: 'wrong tutor' } });
    });
  });
});
