import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';

import { TutorProfileService } from './tutor-profile.service';

const profile = (o: any = {}) => ({
  id: 'tp-1', tutorCode: 'TUT-0001', tutorOperationalStatus: 'INACTIVE', sourceTutorLeadId: 'lead-1',
  employee: { id: 'emp-1', firstName: 'Asha', lastName: 'Rao', phone: '+919876543210', user: { email: 'asha@x.test' } }, ...o,
});

function build(o: { profile?: any; details?: any; contacts?: any[]; perms?: string[]; full?: any; cas?: number; note?: any } = {}) {
  const tx: any = {
    employee: { update: jest.fn() },
    tutorPersonalDetails: { upsert: jest.fn() },
    tutorEmergencyContact: { upsert: jest.fn(), delete: jest.fn() },
    tutorQualification: { create: jest.fn().mockResolvedValue({ id: 'q1', name: 'B.Ed', institution: 'Calicut', yearOfCompletion: 2020 }), update: jest.fn(), updateMany: jest.fn().mockResolvedValue({ count: o.cas ?? 1 }) },
    tutorProfile: { updateMany: jest.fn().mockResolvedValue({ count: o.cas ?? 1 }) },
    tutorStatusHistory: { create: jest.fn().mockResolvedValue({ id: 'h1' }) },
    tutorHrNote: { create: jest.fn().mockResolvedValue({ id: 'n1' }), updateMany: jest.fn().mockResolvedValue({ count: o.cas ?? 1 }) },
    tutorHrNoteRevision: { create: jest.fn() },
  };
  const prisma: any = {
    tutorProfile: {
      findFirst: jest.fn().mockResolvedValue(o.profile === undefined ? profile() : o.profile),
      findUniqueOrThrow: jest.fn().mockResolvedValue(o.full),
    },
    tutorLead: { findUnique: jest.fn().mockResolvedValue({ phone: '+919876543210', phoneNormalized: '919876543210' }) },
    tutorPersonalDetails: { findUnique: jest.fn().mockResolvedValue(o.details ?? null) },
    tutorEmergencyContact: { findMany: jest.fn().mockResolvedValue(o.contacts ?? []) },
    tutorQualification: { findFirst: jest.fn().mockResolvedValue({ id: 'q1', name: 'B.Ed', institution: 'Calicut', yearOfCompletion: 2020 }) },
    tutorHrNote: { findFirst: jest.fn().mockResolvedValue(o.note === undefined ? { id: 'n1', body: 'old text' } : o.note) },
    $transaction: jest.fn((fn: any) => Promise.resolve(fn(tx))),
  };
  const audit: any = { recordInTx: jest.fn() };
  const perms = new Set(o.perms ?? []);
  const rbac: any = { hasPermissions: jest.fn((_u: string, p: string[]) => Promise.resolve(p.every((x) => perms.has(x)))) };
  const config: any = { get: jest.fn().mockReturnValue('Asia/Kolkata') };
  const statusCache: any = { invalidate: jest.fn().mockResolvedValue(undefined) };
  return { svc: new TutorProfileService(prisma, audit, rbac, config, statusCache), prisma, tx, audit, statusCache };
}

const primary = { name: 'Rahim', phone: '9876500000', relationship: 'Father' };

describe('TutorProfileService', () => {
  it('only shows profiles that have a Tutor ID', async () => {
    await expect(build({ profile: null }).svc.changeStatus('tp-x', { status: 'ACTIVE', reason: 'x y z' }, 'hr')).rejects.toBeInstanceOf(NotFoundException);
  });

  describe('profile edits', () => {
    it('saves details and contacts, auditing changed fields with the account number masked', async () => {
      const { svc, tx, audit } = build();
      const r = await svc.updateProfile('tp-1', {
        gender: 'FEMALE', bank: { accountNumber: '123456789012', ifsc: 'sbin0001234' }, primaryContact: primary,
      }, 'hr');
      expect(tx.tutorPersonalDetails.upsert.mock.calls[0][0].update).toMatchObject({ gender: 'FEMALE', bankAccountNumber: '123456789012', bankIfsc: 'SBIN0001234' });
      expect(tx.tutorEmergencyContact.upsert.mock.calls[0][0].create).toMatchObject({ kind: 'PRIMARY', phone: '+919876500000' });
      const row = audit.recordInTx.mock.calls[0][1];
      expect(row.action).toBe('TUTOR_PROFILE_UPDATED');
      expect(JSON.stringify(row)).not.toContain('123456789012');
      expect(row.newValue.bankAccountNumber).toBe('••••9012');
      expect(r.changed).toEqual(expect.arrayContaining(['gender', 'bankAccountNumber', 'primaryContact']));
    });
    it("refuses a primary contact number equal to the tutor's phone", async () => {
      await expect(build().svc.updateProfile('tp-1', { primaryContact: { ...primary, phone: '98765 43210' } }, 'hr')).rejects.toThrow(/must differ/);
    });
    it('needs the primary contact before a secondary one', async () => {
      await expect(build().svc.updateProfile('tp-1', { secondaryContact: primary }, 'hr')).rejects.toThrow(/primary emergency contact first/);
    });
    it('copies the permanent address when "same as permanent" is ticked', async () => {
      const { svc, tx } = build();
      await svc.updateProfile('tp-1', { permanentAddress: { house: 'Rose Villa', district: 'Malappuram', pin: '676505' }, currentSameAsPermanent: true }, 'hr');
      expect(tx.tutorPersonalDetails.upsert.mock.calls[0][0].update).toMatchObject({ curHouse: 'Rose Villa', curDistrict: 'Malappuram', curPin: '676505', currentSameAsPermanent: true });
    });
    it('writes no audit row when nothing changed', async () => {
      const { svc, audit } = build({ details: { gender: 'FEMALE' } });
      await expect(svc.updateProfile('tp-1', { gender: 'FEMALE' }, 'hr')).resolves.toEqual({ id: 'tp-1', changed: [] });
      expect(audit.recordInTx).not.toHaveBeenCalled();
    });
  });

  describe('viewing', () => {
    const full = {
      id: 'tp-1', tutorCode: 'TUT-0001', tutorOperationalStatus: 'INACTIVE', verifiedAt: new Date(), verifiedBy: null, coordinator: { id: 'coord-1', email: 'c1@x.test' }, coordinatorAssignedAt: null,
      employee: {}, personalDetails: { bankAccountNumber: '123456789012', gender: 'FEMALE', permDistrict: 'M' },
      emergencyContacts: [], qualifications: [], subjects: [], grades: [], curricula: [],
      tutorLead: { id: 'lead-1', businessId: 'TL-1', remarks: 'good', detailsDescription: null, motherTongue: { name: 'Malayalam' }, languages: [], demoEvaluations: [{ id: 'e1', englishRating: 4, evaluatedBy: { email: 'x' } }] },
    };
    it('masks the bank account for viewers who cannot manage, and hides notes/history access', async () => {
      const r = await build({ full, perms: ['tutor_hr.profile.read'] }).svc.getProfile('tp-1', 'tutor-head');
      expect(r.personal?.bankAccountNumber).toBe('••••9012');
      expect(r.access).toEqual({ canManage: false, canSeeNotes: false, canSeeHistory: false, bankFullyVisible: false });
      expect(r.hiring?.englishRating).toBe(4);
      expect(r.coordinator).toEqual({ id: 'coord-1', email: 'c1@x.test' });
      expect(r.gaps).toContain('Primary emergency contact');
    });
    it('shows the full number to HR Staff / HR Head', async () => {
      const r = await build({ full, perms: ['tutor_hr.profile.manage', 'tutor_hr.notes.manage'] }).svc.getProfile('tp-1', 'hr');
      expect(r.personal?.bankAccountNumber).toBe('123456789012');
      expect(r.access.canSeeNotes).toBe(true);
    });
  });

  describe('status', () => {
    it('changes status with a mandatory reason and keeps history', async () => {
      const { svc, tx } = build();
      await svc.changeStatus('tp-1', { status: 'ACTIVE', reason: 'first class taken' }, 'hr');
      expect(tx.tutorProfile.updateMany.mock.calls[0][0]).toEqual({ where: { id: 'tp-1', tutorOperationalStatus: 'INACTIVE' }, data: { tutorOperationalStatus: 'ACTIVE' } });
      expect(tx.tutorStatusHistory.create.mock.calls[0][0].data).toMatchObject({ previousStatus: 'INACTIVE', newStatus: 'ACTIVE', reason: 'first class taken', changedByUserId: 'hr' });
    });
    it('invalidates the login status cache so suspension and reactivation apply on the next request', async () => {
      const { svc, statusCache } = build({ profile: profile({ employee: { ...profile().employee, userId: 'user-9' } }) });
      await svc.changeStatus('tp-1', { status: 'SUSPENDED', reason: 'policy breach' }, 'hr');
      expect(statusCache.invalidate).toHaveBeenCalledWith('user-9');
    });
    it('rejects the same status and reports races', async () => {
      await expect(build().svc.changeStatus('tp-1', { status: 'INACTIVE', reason: 'same thing' }, 'hr')).rejects.toBeInstanceOf(BadRequestException);
      await expect(build({ cas: 0 }).svc.changeStatus('tp-1', { status: 'PAUSED', reason: 'on leave' }, 'hr')).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('qualifications', () => {
    it('adds and hides entries without deleting them', async () => {
      const { svc, tx } = build();
      await svc.addQualification('tp-1', { name: 'B.Ed', institution: 'Calicut', yearOfCompletion: 2020 }, 'hr');
      expect(tx.tutorQualification.create.mock.calls[0][0].data).toMatchObject({ tutorProfileId: 'tp-1', createdByUserId: 'hr' });
      await svc.removeQualification('tp-1', 'q1', 'hr');
      expect(tx.tutorQualification.updateMany.mock.calls[0][0].data).toMatchObject({ isActive: false });
    });
  });

  describe('HR internal notes', () => {
    it('never puts note text in the audit log', async () => {
      const { svc, audit } = build();
      await svc.addNote('tp-1', { body: 'Confidential: late twice' }, 'hr');
      expect(JSON.stringify(audit.recordInTx.mock.calls[0][1])).not.toContain('Confidential');
    });
    it('keeps the previous text as a revision when edited', async () => {
      const { svc, tx } = build();
      await svc.editNote('tp-1', 'n1', { body: 'new text' }, 'hr2');
      expect(tx.tutorHrNoteRevision.create.mock.calls[0][0].data).toMatchObject({ noteId: 'n1', previousBody: 'old text', editedByUserId: 'hr2' });
      expect(tx.tutorHrNote.updateMany.mock.calls[0][0]).toMatchObject({ where: { id: 'n1', body: 'old text' }, data: { body: 'new text' } });
      await expect(build().svc.editNote('tp-1', 'n1', { body: 'old text' }, 'hr')).rejects.toThrow(/Nothing changed/);
    });
  });
});
