import { BadRequestException, ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import * as argon2 from 'argon2';

import { TutorTransferService } from './tutor-transfer.service';

jest.mock('argon2', () => ({ argon2id: 2, hash: jest.fn().mockResolvedValue('$argon2id$hash') }));

const passed = new Date('2026-11-20T10:00:00Z');
const readyLead = (o: any = {}) => ({
  id: 'lead-1', firstName: 'Asha', lastName: 'Rao', phone: '+919876543210', email: ' Asha.Rao@Example.com ',
  deletedAt: null, decision: 'HIRED', convertedTutorProfileId: null, currentStage: 'TRAINING', totalTeachingExperience: 3,
  trainingEnrolment: { session2PassedAt: passed },
  subjects: [{ subjectId: 'sub-1' }], grades: [{ gradeId: 'g-1' }], curricula: [{ curriculumId: 'c-1' }],
  availability: [{ dayOfWeek: 1, startTime: new Date('1970-01-01T17:00:00Z'), endTime: new Date('1970-01-01T20:00:00Z') }],
  ...o,
});

function build(o: { lead?: any; fresh?: any; taken?: boolean; dept?: any; role?: any; cas?: number; failWith?: any } = {}) {
  const lead = o.lead ?? readyLead();
  const tx: any = {
    $executeRaw: jest.fn().mockResolvedValue(1),
    tutorLead: {
      findUniqueOrThrow: jest.fn().mockResolvedValue(o.fresh ?? lead),
      updateMany: jest.fn().mockResolvedValue({ count: o.cas ?? 1 }),
    },
    user: { create: jest.fn().mockResolvedValue({ id: 'user-1' }) },
    employee: { create: jest.fn().mockResolvedValue({ id: 'emp-1' }) },
    userRole: { create: jest.fn() },
    tutorProfile: { create: jest.fn().mockResolvedValue({ id: 'tp-1' }) },
    tutorSubject: { createMany: jest.fn() },
    tutorGrade: { createMany: jest.fn() },
    tutorCurriculum: { createMany: jest.fn() },
    tutorAvailabilitySlot: { createMany: jest.fn() },
    tutorLeadStageHistory: { create: jest.fn() },
  };
  const prisma: any = {
    tutorLead: { findUnique: jest.fn().mockResolvedValue(lead) },
    user: { findFirst: jest.fn().mockResolvedValue(o.taken ? { id: 'someone' } : null) },
    department: { findUnique: jest.fn().mockResolvedValue(o.dept === undefined ? { id: 'dept-acad' } : o.dept) },
    role: { findUnique: jest.fn().mockResolvedValue(o.role === undefined ? { id: 'role-tutor' } : o.role) },
    $transaction: jest.fn((fn: any) => (o.failWith ? Promise.reject(o.failWith) : Promise.resolve(fn(tx)))),
  };
  const audit: any = { recordInTx: jest.fn() };
  const ids: any = { nextIdInTx: jest.fn((_tx: any, type: string) => Promise.resolve(type === 'TUT' ? 'TUT-0001' : 'EMP-0042')) };
  const rbac: any = { invalidateCache: jest.fn().mockResolvedValue(undefined) };
  return { svc: new TutorTransferService(prisma, audit, ids, rbac), prisma, tx, audit, ids, rbac };
}

describe('TutorTransferService.readyForAssignment', () => {
  it('creates User, Employee, role and TutorProfile in one transaction with a TUT Tutor ID', async () => {
    const { svc, tx, ids, prisma } = build();
    const r = await svc.readyForAssignment('lead-1', 'head');
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(ids.nextIdInTx).toHaveBeenCalledWith(tx, 'TUT');
    expect(tx.user.create.mock.calls[0][0].data).toEqual({
      email: 'asha.rao@example.com', passwordHash: '$argon2id$hash', status: 'PENDING_SETUP', mustChangePassword: true,
    });
    expect(tx.employee.create.mock.calls[0][0].data).toMatchObject({ businessId: 'EMP-0042', userId: 'user-1', departmentId: 'dept-acad', firstName: 'Asha', phone: '+919876543210' });
    expect(tx.userRole.create.mock.calls[0][0].data).toEqual({ userId: 'user-1', roleId: 'role-tutor', grantedByUserId: 'head' });
    expect(tx.tutorProfile.create.mock.calls[0][0].data).toMatchObject({
      employeeId: 'emp-1', sourceTutorLeadId: 'lead-1', tutorCode: 'TUT-0001', verifiedByUserId: 'head', teachingExperience: 3,
    });
    expect(tx.tutorProfile.create.mock.calls[0][0].data.tutorOperationalStatus).toBeUndefined(); // schema default: INACTIVE
    expect(r).toMatchObject({ tutorId: 'TUT-0001', loginEmail: 'asha.rao@example.com', mustChangePassword: true, tutorProfileId: 'tp-1' });
  });

  it('returns a strong temporary password once, hashes it with Argon2id, and never audits it', async () => {
    const { svc, audit } = build();
    const r = await svc.readyForAssignment('lead-1', 'head');
    expect(r.temporaryPassword).toMatch(/^.{14}$/);
    expect((argon2.hash as jest.Mock).mock.calls.at(-1)[0]).toBe(r.temporaryPassword);
    const audited = JSON.stringify(audit.recordInTx.mock.calls.map((c: any) => c[1]));
    expect(audited).not.toContain(r.temporaryPassword);
    expect(audited).not.toContain('argon2');
    expect(audit.recordInTx.mock.calls.map((c: any) => c[1].action)).toEqual(['USER_CREATED', 'EMPLOYEE_CREATED', 'USER_ROLE_ASSIGNED', 'TUTOR_READY_FOR_ASSIGNMENT']);
  });

  it('copies hiring data into the tutor profile and marks the candidate transferred', async () => {
    const { svc, tx } = build();
    await svc.readyForAssignment('lead-1', 'head');
    expect(tx.tutorSubject.createMany.mock.calls[0][0].data).toEqual([{ tutorProfileId: 'tp-1', subjectId: 'sub-1', addedByUserId: 'head' }]);
    expect(tx.tutorGrade.createMany).toHaveBeenCalled();
    expect(tx.tutorCurriculum.createMany).toHaveBeenCalled();
    expect(tx.tutorAvailabilitySlot.createMany.mock.calls[0][0].data[0]).toMatchObject({ tutorProfileId: 'tp-1', dayOfWeek: 1 });
    expect(tx.tutorLead.updateMany.mock.calls[0][0]).toMatchObject({
      where: { id: 'lead-1', convertedTutorProfileId: null },
      data: { convertedTutorProfileId: 'tp-1', currentStage: 'READY_FOR_ASSIGNMENT' },
    });
    expect(tx.tutorLeadStageHistory.create.mock.calls[0][0].data).toMatchObject({ previousStage: 'TRAINING', newStage: 'READY_FOR_ASSIGNMENT' });
    expect(tx.$executeRaw).toHaveBeenCalled(); // advisory lock against double clicks
  });

  it('requires both sessions passed, a Hired decision, and no earlier transfer', async () => {
    await expect(build({ lead: readyLead({ trainingEnrolment: { session2PassedAt: null } }) }).svc.readyForAssignment('lead-1', 'head')).rejects.toThrow(/Both training sessions/);
    await expect(build({ lead: readyLead({ trainingEnrolment: null }) }).svc.readyForAssignment('lead-1', 'head')).rejects.toBeInstanceOf(BadRequestException);
    await expect(build({ lead: readyLead({ convertedTutorProfileId: 'tp-0' }) }).svc.readyForAssignment('lead-1', 'head')).rejects.toBeInstanceOf(ConflictException);
  });

  it('re-checks inside the transaction (a concurrent click loses)', async () => {
    const { svc, tx } = build({ fresh: readyLead({ convertedTutorProfileId: 'tp-0' }) });
    await expect(svc.readyForAssignment('lead-1', 'head')).rejects.toBeInstanceOf(ConflictException);
    expect(tx.user.create).not.toHaveBeenCalled();
  });

  it('requires a valid, unused email and a name', async () => {
    await expect(build({ lead: readyLead({ email: null }) }).svc.readyForAssignment('lead-1', 'head')).rejects.toThrow(/email/);
    await expect(build({ lead: readyLead({ email: 'not-an-email' }) }).svc.readyForAssignment('lead-1', 'head')).rejects.toThrow(/valid email/);
    await expect(build({ taken: true }).svc.readyForAssignment('lead-1', 'head')).rejects.toThrow(/already used/);
    await expect(build({ lead: readyLead({ firstName: ' ' }) }).svc.readyForAssignment('lead-1', 'head')).rejects.toThrow(/name/);
  });

  it('maps a unique-email race to a clear conflict and refuses when the tutor role is missing', async () => {
    const race = new Prisma.PrismaClientKnownRequestError('dup', { code: 'P2002', clientVersion: 'x', meta: { target: ['email'] } });
    await expect(build({ failWith: race }).svc.readyForAssignment('lead-1', 'head')).rejects.toThrow(/already used/);
    await expect(build({ role: null }).svc.readyForAssignment('lead-1', 'head')).rejects.toThrow(/not configured/);
  });
});
