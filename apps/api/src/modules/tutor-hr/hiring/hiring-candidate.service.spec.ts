import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';

import { HiringCandidateService } from './hiring-candidate.service';

const baseLead = {
  id: 'lead-1', businessId: 'TL-0001', firstName: 'A', lastName: 'B', createdByUserId: 'owner', assignedToUserId: 'owner',
  hiringStage: 'LEAD', decision: null, cvReceivedAt: null, deletedAt: null, createdAt: new Date(), phoneCountryCode: '+91',
  onlineTeachingExperience: null, offlineTeachingExperience: null,
};

function build(opts: { lead?: any; readAll?: boolean; existing?: any; participant?: number; casCount?: number; attended?: any } = {}) {
  const lead = opts.lead === undefined ? baseLead : opts.lead;
  const tx: any = {
    $executeRaw: jest.fn().mockResolvedValue(1),
    tutorLead: {
      findFirst: jest.fn().mockResolvedValue(opts.existing ?? null),
      create: jest.fn().mockResolvedValue({ id: 'new-1' }),
      update: jest.fn().mockResolvedValue({ ...baseLead }),
      updateMany: jest.fn().mockResolvedValue({ count: opts.casCount ?? 1 }),
    },
    tutorLeadEnquiry: { create: jest.fn().mockResolvedValue({ id: 'enq-1' }) },
    tutorLeadStageHistory: { create: jest.fn() },
    tutorLeadDecisionHistory: { create: jest.fn() },
    tutorLeadCall: { create: jest.fn().mockResolvedValue({ id: 'call-1' }) },
  };
  const prisma: any = {
    tutorLead: {
      // outside a transaction: phone lookups return `existing`, id lookups return the lead
      findFirst: jest.fn().mockImplementation((a: any) => Promise.resolve(a?.where?.phoneNormalized ? opts.existing ?? null : lead)),
    },
    tutorLeadSource: { findFirst: jest.fn().mockResolvedValue({ id: 'src-1' }) },
    tutorDemoBooking: {
      count: jest.fn().mockResolvedValue(opts.participant ?? 0),
      findFirst: jest.fn().mockResolvedValue(opts.attended ?? null),
    },
    $transaction: jest.fn((fn: any) => Promise.resolve(fn(tx))),
  };
  const audit: any = { recordInTx: jest.fn(), record: jest.fn() };
  const ids: any = { nextIdInTx: jest.fn().mockResolvedValue('TL-0042') };
  const rbac: any = { hasPermissions: jest.fn().mockResolvedValue(!!opts.readAll) };
  return { svc: new HiringCandidateService(prisma, audit, ids, rbac), prisma, tx, audit };
}

describe('HiringCandidateService', () => {
  describe('register', () => {
    it('creates a candidate with first enquiry, stage history and an advisory lock', async () => {
      const { svc, tx } = build();
      const r = await svc.register({ phone: '98765 43210', sourceId: 'src-1', leadDate: '2026-11-16' }, 'u1');
      expect(r).toEqual({ id: 'new-1', candidateId: 'TL-0042' });
      expect(tx.$executeRaw).toHaveBeenCalled();
      expect(tx.tutorLead.create.mock.calls[0][0].data).toMatchObject({ phoneNormalized: '919876543210', hiringStage: 'LEAD', createdByUserId: 'u1' });
      expect(tx.tutorLeadEnquiry.create).toHaveBeenCalledTimes(1);
      expect(tx.tutorLeadStageHistory.create).toHaveBeenCalledTimes(1);
    });
    it('rejects a duplicate phone with the existing profile and creates nothing', async () => {
      const existing = { ...baseLead, assignedTo: { email: 'm@x.com' }, createdBy: { email: 'c@x.com' } };
      const { svc, tx } = build({ existing });
      await expect(svc.register({ phone: '+91 9876543210', sourceId: 'src-1', leadDate: '2026-11-16' }, 'u2')).rejects.toMatchObject({
        response: { code: 'DUPLICATE_CANDIDATE', existing: { candidateId: 'TL-0001', owner: 'm@x.com' } },
      });
      expect(tx.tutorLead.create).not.toHaveBeenCalled();
      expect(tx.tutorLeadEnquiry.create).not.toHaveBeenCalled();
    });
    it('rejects an inactive or unknown source and an invalid phone', async () => {
      const a = build();
      a.prisma.tutorLeadSource.findFirst.mockResolvedValue(null);
      await expect(a.svc.register({ phone: '9876543210', sourceId: 'x', leadDate: '2026-11-16' }, 'u')).rejects.toBeInstanceOf(BadRequestException);
      const b = build();
      await expect(b.svc.register({ phone: '123', sourceId: 'src-1', leadDate: '2026-11-16' }, 'u')).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('enquiries', () => {
    it('adds a new enquiry without touching the candidate record', async () => {
      const { svc, tx } = build();
      await svc.addEnquiry('lead-1', { sourceId: 'src-1', enquiryDate: '2026-11-20' }, 'other');
      expect(tx.tutorLeadEnquiry.create).toHaveBeenCalledTimes(1);
      expect(tx.tutorLead.update).not.toHaveBeenCalled();
      expect(tx.tutorLead.updateMany).not.toHaveBeenCalled();
    });
  });

  describe('stage', () => {
    it('advances one step with history and compare-and-set', async () => {
      const { svc, tx } = build();
      await svc.advanceStage('lead-1', { to: 'DETAILS_SHARED' }, 'owner');
      expect(tx.tutorLead.updateMany.mock.calls[0][0]).toMatchObject({ where: { id: 'lead-1', hiringStage: 'LEAD' } });
      expect(tx.tutorLeadStageHistory.create).toHaveBeenCalledTimes(1);
    });
    it('blocks skipping stages', async () => {
      const { svc } = build();
      await expect(svc.advanceStage('lead-1', { to: 'CV' }, 'owner')).rejects.toBeInstanceOf(BadRequestException);
    });
    it('requires CV received before completing the CV stage', async () => {
      const { svc } = build({ lead: { ...baseLead, hiringStage: 'CV' } });
      await expect(svc.advanceStage('lead-1', { to: 'LIVE_DEMO_INTERVIEW' }, 'owner')).rejects.toThrow(/CV received/);
    });
    it('blocks advancing rejected candidates', async () => {
      const { svc } = build({ lead: { ...baseLead, decision: 'REJECTED' } });
      await expect(svc.advanceStage('lead-1', { to: 'DETAILS_SHARED' }, 'owner')).rejects.toBeInstanceOf(BadRequestException);
    });
    it('reports a concurrent change as 409', async () => {
      const { svc } = build({ casCount: 0 });
      await expect(svc.advanceStage('lead-1', { to: 'DETAILS_SHARED' }, 'owner')).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('decision', () => {
    it('records manual decision with history', async () => {
      const { svc, tx } = build();
      await svc.changeDecision('lead-1', { decision: 'REJECTED', reason: 'no fit' }, 'owner');
      expect(tx.tutorLeadDecisionHistory.create.mock.calls[0][0].data).toMatchObject({ newDecision: 'REJECTED', previousDecision: null, reason: 'no fit' });
    });
    it('rejects No Response before Live Demo & Interview', async () => {
      const { svc } = build();
      await expect(svc.changeDecision('lead-1', { decision: 'NO_RESPONSE' }, 'owner')).rejects.toBeInstanceOf(BadRequestException);
    });
    it('rejects Hired without Accepted', async () => {
      const { svc } = build({ lead: { ...baseLead, hiringStage: 'LIVE_DEMO_INTERVIEW' } });
      await expect(svc.changeDecision('lead-1', { decision: 'HIRED' }, 'owner')).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('acceptance authority', () => {
    const at = { ...baseLead, hiringStage: 'LIVE_DEMO_INTERVIEW' };
    it('needs an attended demo and an evaluation', async () => {
      await expect(build({ lead: at }).svc.changeDecision('lead-1', { decision: 'ACCEPTED' }, 'owner')).rejects.toBeInstanceOf(BadRequestException);
      const b = build({ lead: at, attended: { attendedByUserId: 'owner', evaluation: null } });
      await expect(b.svc.changeDecision('lead-1', { decision: 'ACCEPTED' }, 'owner')).rejects.toThrow(/evaluation/);
    });
    it('only the conductor (or read-all) may accept', async () => {
      const attended = { attendedByUserId: 'conductor', evaluation: { id: 'e' } };
      await expect(build({ lead: at, attended }).svc.changeDecision('lead-1', { decision: 'ACCEPTED' }, 'owner')).rejects.toBeInstanceOf(ForbiddenException);
      await expect(build({ lead: at, attended, participant: 1 }).svc.changeDecision('lead-1', { decision: 'ACCEPTED' }, 'conductor')).resolves.toBeDefined();
      await expect(build({ lead: at, attended, readAll: true }).svc.changeDecision('lead-1', { decision: 'ACCEPTED' }, 'owner')).resolves.toBeDefined();
    });
  });

  describe('authorization', () => {
    it('forbids unrelated staff from modifying', async () => {
      const { svc } = build();
      await expect(svc.updateDetails('lead-1', { remarks: 'x' }, 'stranger')).rejects.toBeInstanceOf(ForbiddenException);
    });
    it('allows read-all holders (Tutor Head)', async () => {
      const { svc } = build({ readAll: true });
      await expect(svc.updateDetails('lead-1', { remarks: 'x' }, 'head')).resolves.toEqual({ id: 'lead-1' });
    });
    it('allows a demo participant', async () => {
      const { svc } = build({ participant: 1 });
      await expect(svc.updateDetails('lead-1', { remarks: 'x' }, 'assigned')).resolves.toBeDefined();
    });
    it('updating details never changes the stage', async () => {
      const { svc, tx } = build();
      await svc.updateDetails('lead-1', { remarks: 'x', onlineTeachingExperience: 2 }, 'owner');
      const data = tx.tutorLead.update.mock.calls[0][0].data;
      expect(data.hiringStage).toBeUndefined();
      expect(data.currentStage).toBeUndefined();
    });
  });

  describe('calls', () => {
    it('keeps each caller attribution and preserves every call', async () => {
      const { svc, tx } = build();
      await svc.logCall('lead-1', { status: 'BUSY_CALL_LATER' }, 'u-a');
      await svc.logCall('lead-1', { status: 'ATTENDED', remarks: 'ok' }, 'u-b');
      expect(tx.tutorLeadCall.create.mock.calls.map((c: any) => c[0].data.callerUserId)).toEqual(['u-a', 'u-b']);
    });
    it('rejects follow-up before the call', async () => {
      const { svc } = build();
      await expect(
        svc.logCall('lead-1', { status: 'ATTENDED', calledAt: '2026-11-16T10:00:00Z', followUpAt: '2026-11-16T09:00:00Z' }, 'u'),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });
});
