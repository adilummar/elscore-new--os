import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';

import { HiringCandidateService } from './hiring-candidate.service';

const baseLead = {
  id: 'lead-1', businessId: 'TL-0001', firstName: 'A', lastName: 'B', createdByUserId: 'owner', assignedToUserId: 'owner',
  hiringStage: 'LEAD', decision: null, leadStatus: 'PROCESSING', cvReceivedAt: null, detailsRespondedAt: null, trainingStartedAt: null,
  deletedAt: null, createdAt: new Date(), phoneCountryCode: '+91',
  onlineTeachingExperience: null, offlineTeachingExperience: null,
};

function build(opts: {
  lead?: any; readAll?: boolean; override?: boolean; existing?: any; participant?: number; casCount?: number; attended?: any; malayalam?: any;
} = {}) {
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
    tutorLeadStatusHistory: { create: jest.fn() },
    tutorTrainingEnrolment: { upsert: jest.fn() },
    tutorLeadCall: { create: jest.fn().mockResolvedValue({ id: 'call-1' }) },
    tutorLeadAvailability: {
      findMany: jest.fn().mockResolvedValue([]),
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      createMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
  };
  const prisma: any = {
    tutorLead: {
      // outside a transaction: phone lookups return `existing`, id lookups return the lead
      findFirst: jest.fn().mockImplementation((a: any) => Promise.resolve(a?.where?.phoneNormalized ? opts.existing ?? null : lead)),
    },
    tutorLeadSource: { findFirst: jest.fn().mockResolvedValue({ id: 'src-1' }) },
    motherTongue: { findFirst: jest.fn().mockResolvedValue(opts.malayalam === undefined ? { id: 'mt-ml' } : opts.malayalam) },
    tutorDemoBooking: {
      count: jest.fn().mockResolvedValue(opts.participant ?? 0),
      findFirst: jest.fn().mockResolvedValue(opts.attended ?? null),
    },
    $transaction: jest.fn((fn: any) => Promise.resolve(fn(tx))),
  };
  const audit: any = { recordInTx: jest.fn(), record: jest.fn() };
  const ids: any = { nextIdInTx: jest.fn().mockResolvedValue('TL-0042') };
  const rbac: any = {
    hasPermissions: jest.fn().mockImplementation((_u: string, perms: string[]) =>
      Promise.resolve(perms.includes('tutor_hiring.override') ? !!opts.override : !!opts.readAll)),
  };
  return { svc: new HiringCandidateService(prisma, audit, ids, rbac), prisma, tx, audit };
}

describe('HiringCandidateService', () => {
  describe('register', () => {
    it('creates a candidate with first enquiry, stage history and an advisory lock', async () => {
      const { svc, tx } = build();
      const r = await svc.register({ phone: '98765 43210', sourceId: 'src-1', leadDate: '2026-11-16' }, 'u1');
      expect(r).toEqual({ id: 'new-1', candidateId: 'TL-0042' });
      expect(tx.$executeRaw).toHaveBeenCalled();
      expect(tx.tutorLead.create.mock.calls[0][0].data).toMatchObject({
        phoneNormalized: '919876543210', hiringStage: 'LEAD', leadStatus: 'PROCESSING', motherTongueId: 'mt-ml', createdByUserId: 'u1',
      });
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
    it('leaves mother tongue empty when no Malayalam entry exists', async () => {
      const { svc, tx } = build({ malayalam: null });
      await svc.register({ phone: '9876543210', sourceId: 'src-1', leadDate: '2026-11-16' }, 'u1');
      expect(tx.tutorLead.create.mock.calls[0][0].data.motherTongueId).toBeNull();
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
    it('requires the responded date/time before completing Details Shared', async () => {
      const at = { ...baseLead, hiringStage: 'DETAILS_SHARED' };
      await expect(build({ lead: at }).svc.advanceStage('lead-1', { to: 'CV' }, 'owner')).rejects.toThrow(/responded/);
      await expect(build({ lead: { ...at, detailsRespondedAt: new Date() } }).svc.advanceStage('lead-1', { to: 'CV' }, 'owner')).resolves.toEqual({ id: 'lead-1', stage: 'CV' });
    });
    it('never lets staff pick Training as a stage', async () => {
      const { svc } = build({ lead: { ...baseLead, hiringStage: 'LIVE_DEMO_INTERVIEW' } });
      await expect(svc.advanceStage('lead-1', { to: 'TRAINING' }, 'owner')).rejects.toThrow(/automatically/);
    });
    it('blocks advancing rejected candidates and leads that are not Processing', async () => {
      await expect(build({ lead: { ...baseLead, decision: 'REJECTED' } }).svc.advanceStage('lead-1', { to: 'DETAILS_SHARED' }, 'owner')).rejects.toBeInstanceOf(BadRequestException);
      await expect(build({ lead: { ...baseLead, leadStatus: 'NOT_INTERESTED' } }).svc.advanceStage('lead-1', { to: 'DETAILS_SHARED' }, 'owner')).rejects.toThrow(/Processing/);
    });
    it('reports a concurrent change as 409', async () => {
      const { svc } = build({ casCount: 0 });
      await expect(svc.advanceStage('lead-1', { to: 'DETAILS_SHARED' }, 'owner')).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('lead status', () => {
    it('defaults to Processing and changes with remarks, history and the legacy stage', async () => {
      const { svc, tx } = build({ lead: { ...baseLead, hiringStage: 'CV' } });
      await svc.setLeadStatus('lead-1', { status: 'NOT_INTERESTED', remarks: 'Took another job' }, 'owner');
      expect(tx.tutorLead.updateMany.mock.calls[0][0]).toMatchObject({
        where: { id: 'lead-1', leadStatus: 'PROCESSING' },
        data: { leadStatus: 'NOT_INTERESTED', leadStatusRemarks: 'Took another job', currentStage: 'NOT_INTERESTED', leadStatusChangedById: 'owner' },
      });
      expect(tx.tutorLeadStatusHistory.create.mock.calls[0][0].data).toMatchObject({ previousStatus: 'PROCESSING', newStatus: 'NOT_INTERESTED', source: 'MANUAL' });
    });
    it('requires remarks for Rejected / Not Interested but not for Processing', async () => {
      await expect(build().svc.setLeadStatus('lead-1', { status: 'REJECTED', remarks: '  ' }, 'owner')).rejects.toThrow(/Remarks are required/);
      const back = build({ lead: { ...baseLead, hiringStage: 'CV', leadStatus: 'REJECTED' } });
      await back.svc.setLeadStatus('lead-1', { status: 'PROCESSING' }, 'owner');
      expect(back.tx.tutorLead.updateMany.mock.calls[0][0].data).toMatchObject({ leadStatus: 'PROCESSING', currentStage: 'CV_SHARED' });
    });
    it('rejects a no-op change and unrelated staff', async () => {
      await expect(build().svc.setLeadStatus('lead-1', { status: 'PROCESSING' }, 'owner')).rejects.toBeInstanceOf(BadRequestException);
      await expect(build().svc.setLeadStatus('lead-1', { status: 'REJECTED', remarks: 'x' }, 'stranger')).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  describe('decision', () => {
    const at = { ...baseLead, hiringStage: 'LIVE_DEMO_INTERVIEW' };
    const booked = { assignedToUserId: 'conductor', status: 'NOT_ATTENDED', evaluation: null };
    it('records only at Live Demo & Interview (Lead Status covers earlier stages)', async () => {
      await expect(build({ attended: booked, participant: 1 }).svc.changeDecision('lead-1', { decision: 'REJECTED', remarks: 'x' }, 'conductor')).rejects.toThrow(/Live Demo/);
      await expect(build().svc.changeDecision('lead-1', { decision: 'NO_RESPONSE' }, 'owner')).rejects.toBeInstanceOf(BadRequestException);
    });
    it('Rejected needs remarks, and also sets the Lead Status with history', async () => {
      await expect(build({ lead: at, attended: booked, participant: 1 }).svc.changeDecision('lead-1', { decision: 'REJECTED' }, 'conductor')).rejects.toThrow(/Remarks are required/);
      const { svc, tx } = build({ lead: at, attended: booked, participant: 1 });
      await svc.changeDecision('lead-1', { decision: 'REJECTED', remarks: 'no fit' }, 'conductor');
      expect(tx.tutorLead.updateMany.mock.calls[0][0]).toMatchObject({
        where: { id: 'lead-1', decision: null, leadStatus: 'PROCESSING' },
        data: { decision: 'REJECTED', leadStatus: 'REJECTED', leadStatusRemarks: 'no fit', currentStage: 'REJECTED' },
      });
      expect(tx.tutorLeadDecisionHistory.create.mock.calls[0][0].data).toMatchObject({ newDecision: 'REJECTED', previousDecision: null, remarks: 'no fit' });
      expect(tx.tutorLeadStatusHistory.create.mock.calls[0][0].data).toMatchObject({ newStatus: 'REJECTED', source: 'DECISION' });
    });
    it('Accepted remarks are optional and do not touch the Lead Status', async () => {
      const { svc, tx } = build({ lead: at, attended: { assignedToUserId: 'conductor', evaluation: { id: 'e' } }, participant: 1 });
      await svc.changeDecision('lead-1', { decision: 'ACCEPTED' }, 'conductor');
      expect(tx.tutorLead.updateMany.mock.calls[0][0].data.leadStatus).toBeUndefined();
      expect(tx.tutorLeadStatusHistory.create).not.toHaveBeenCalled();
    });
    it('blocks decisions while the Lead Status is not Processing', async () => {
      const { svc } = build({ lead: { ...at, leadStatus: 'REJECTED' }, attended: booked, participant: 1 });
      await expect(svc.changeDecision('lead-1', { decision: 'NOT_INTERESTED', remarks: 'x' }, 'conductor')).rejects.toThrow(/Processing/);
    });
    it('Hired requires Accepted, then moves the candidate to Training automatically', async () => {
      const attended = { assignedToUserId: 'conductor', evaluation: { id: 'e' } };
      await expect(build({ lead: at, attended, participant: 1 }).svc.changeDecision('lead-1', { decision: 'HIRED' }, 'conductor')).rejects.toThrow(/Accepted/);
      const { svc, tx } = build({ lead: { ...at, decision: 'ACCEPTED' }, attended, participant: 1 });
      await expect(svc.changeDecision('lead-1', { decision: 'HIRED' }, 'conductor')).resolves.toMatchObject({ stage: 'TRAINING' });
      const upd = tx.tutorLead.updateMany.mock.calls[0][0];
      expect(upd.where).toMatchObject({ decision: 'ACCEPTED', hiringStage: 'LIVE_DEMO_INTERVIEW' });
      expect(upd.data).toMatchObject({ decision: 'HIRED', hiringStage: 'TRAINING', currentStage: 'TRAINING' });
      expect(upd.data.trainingStartedAt).toBeInstanceOf(Date);
      expect(tx.tutorLeadStageHistory.create.mock.calls[0][0].data).toMatchObject({ previousStage: 'DEMO', newStage: 'TRAINING' });
      expect(tx.tutorTrainingEnrolment.upsert.mock.calls[0][0]).toMatchObject({ where: { tutorLeadId: 'lead-1' }, create: { tutorLeadId: 'lead-1', enrolledByUserId: 'conductor' } });
    });
    it('a Hired decision is final', async () => {
      const { svc } = build({ lead: { ...baseLead, hiringStage: 'TRAINING', decision: 'HIRED' } });
      await expect(svc.changeDecision('lead-1', { decision: 'NOT_INTERESTED', remarks: 'x' }, 'owner')).rejects.toThrow(/final/);
    });
  });

  describe('decision authority (Assigned To conducts; Head overrides)', () => {
    const at = { ...baseLead, hiringStage: 'LIVE_DEMO_INTERVIEW' };
    it('Accepted needs an attended demo and an evaluation', async () => {
      await expect(build({ lead: at }).svc.changeDecision('lead-1', { decision: 'ACCEPTED' }, 'owner')).rejects.toThrow(/attended/);
      const b = build({ lead: at, attended: { assignedToUserId: 'owner', evaluation: null } });
      await expect(b.svc.changeDecision('lead-1', { decision: 'ACCEPTED' }, 'owner')).rejects.toThrow(/evaluation/);
    });
    it('only the Assigned To may decide; read-all alone is not enough; the override holder may', async () => {
      const attended = { assignedToUserId: 'conductor', evaluation: { id: 'e' } };
      await expect(build({ lead: at, attended }).svc.changeDecision('lead-1', { decision: 'ACCEPTED' }, 'owner')).rejects.toBeInstanceOf(ForbiddenException);
      await expect(build({ lead: at, attended, readAll: true }).svc.changeDecision('lead-1', { decision: 'ACCEPTED' }, 'manager')).rejects.toBeInstanceOf(ForbiddenException);
      await expect(build({ lead: at, attended, participant: 1 }).svc.changeDecision('lead-1', { decision: 'ACCEPTED' }, 'conductor')).resolves.toBeDefined();
      const head = build({ lead: at, attended, readAll: true, override: true });
      await head.svc.changeDecision('lead-1', { decision: 'ACCEPTED' }, 'head');
      expect(head.audit.recordInTx.mock.calls[0][1].metadata).toEqual({ override: true });
    });
    it('Rejected / Not Interested need a demo booking', async () => {
      await expect(build({ lead: at }).svc.changeDecision('lead-1', { decision: 'REJECTED', remarks: 'x' }, 'owner')).rejects.toThrow(/Book a demo/);
    });
  });

  describe('details', () => {
    it('replaces availability by deactivating old slots (never deleting) and audits both', async () => {
      const { svc, tx, audit } = build();
      await svc.updateDetails('lead-1', { availability: [{ dayOfWeek: 1, startTime: '17:00', endTime: '20:00' }] }, 'owner');
      expect(tx.tutorLeadAvailability.updateMany).toHaveBeenCalledWith({ where: { tutorLeadId: 'lead-1', isActive: true }, data: { isActive: false } });
      expect(tx.tutorLeadAvailability.createMany.mock.calls[0][0].data[0]).toMatchObject({ dayOfWeek: 1, isActive: true });
      expect(tx.tutorLeadAvailability.createMany.mock.calls[0][0].data[0].startTime.toISOString()).toBe('1970-01-01T17:00:00.000Z');
      expect(audit.recordInTx.mock.calls[0][1].newValue.availability).toHaveLength(1);
    });
    it('rejects inverted and overlapping windows', async () => {
      await expect(build().svc.updateDetails('lead-1', { availability: [{ dayOfWeek: 1, startTime: '20:00', endTime: '17:00' }] }, 'owner')).rejects.toThrow(/end after/);
      await expect(build().svc.updateDetails('lead-1', {
        availability: [{ dayOfWeek: 2, startTime: '09:00', endTime: '11:00' }, { dayOfWeek: 2, startTime: '10:30', endTime: '12:00' }],
      }, 'owner')).rejects.toThrow(/overlap/);
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
