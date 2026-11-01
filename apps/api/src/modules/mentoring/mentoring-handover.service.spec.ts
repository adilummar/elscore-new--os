import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';

import { MentoringHandoverService } from './mentoring-handover.service';

const ref = (name: string) => ({ code: name.toUpperCase(), name });

function makeStudent(overrides: Record<string, unknown> = {}) {
  return {
    id: 'stu-1',
    businessId: 'STU-0001',
    firstName: 'Asha',
    lastName: 'K',
    dateOfBirth: null,
    gender: null,
    schoolName: 'City School',
    currentGrade: '8',
    cityLocation: null,
    notes: null,
    createdAt: new Date('2026-10-01'),
    curriculum: ref('CBSE'),
    grade: ref('Grade 8'),
    enrollmentHandover: null,
    requirements: [
      {
        id: 'req-1',
        monthlyHours: { toString: () => '8' },
        syllabus: 'Term 1',
        notes: null,
        createdAt: new Date('2026-10-01'),
        subject: ref('Maths'),
        curriculum: ref('CBSE'),
        grade: ref('Grade 8'),
      },
    ],
    ...overrides,
  };
}

function makeLead(students: unknown[]) {
  return {
    id: 'lead-1',
    businessId: 'LED-0001',
    firstName: 'Parent',
    lastName: 'One',
    primaryPhone: '+971500000000',
    altPhone1: null,
    altPhone2: null,
    whatsappNumber: null,
    status: 'ENROLLED',
    students,
  };
}

function makeTx(lead: unknown) {
  return {
    $executeRaw: jest.fn().mockResolvedValue(1),
    lead: { findUnique: jest.fn().mockResolvedValue(lead) },
    enrollmentHandover: { create: jest.fn().mockResolvedValue({ id: 'ho-1' }) },
    mentoringActivation: {
      create: jest.fn().mockResolvedValue({ id: 'act-1' }),
      count: jest.fn().mockResolvedValue(0),
    },
    student: { update: jest.fn().mockResolvedValue({}) },
  };
}

describe('MentoringHandoverService', () => {
  const audit = { recordInTx: jest.fn().mockResolvedValue(undefined) };
  const prisma = { lead: { findUnique: jest.fn() }, $transaction: jest.fn(), student: { findMany: jest.fn() } };
  const allocation = { autoAllocateInTx: jest.fn().mockResolvedValue({ allocated: true, mentorUserId: 'mentor-1' }) };
  let service: MentoringHandoverService;

  beforeEach(() => {
    jest.clearAllMocks();
    allocation.autoAllocateInTx.mockResolvedValue({ allocated: true, mentorUserId: 'mentor-1' });
    service = new MentoringHandoverService(prisma as any, audit as any, allocation as any);
  });

  describe('ensureHandoverInTx', () => {
    it('creates the handover, activation, Stage 1 and marks the student ENROLLED', async () => {
      const tx = makeTx(makeLead([makeStudent()]));

      const result = await service.ensureHandoverInTx(tx as any, 'lead-1', 'user-1');

      expect(tx.$executeRaw).toHaveBeenCalledTimes(1);
      expect(tx.enrollmentHandover.create).toHaveBeenCalledTimes(1);
      expect(tx.mentoringActivation.create).toHaveBeenCalledTimes(1);
      const activation = tx.mentoringActivation.create.mock.calls[0][0].data;
      expect(activation.status).toBe('AWAITING_ALLOCATION');
      expect(activation.currentStage).toBe(1);
      expect(activation.stages.create).toEqual([
        { stageNumber: 1, key: 'ADMISSION_HANDOVER', status: 'NOT_STARTED' },
      ]);
      expect(tx.student.update).toHaveBeenCalledWith({
        where: { id: 'stu-1' },
        data: { enrollmentState: 'ENROLLED' },
      });
      expect(allocation.autoAllocateInTx).toHaveBeenCalledWith(tx, 'act-1', 'user-1');
      expect(result.created).toEqual([{ studentId: 'stu-1', handoverId: 'ho-1', activationId: 'act-1' }]);
      expect(audit.recordInTx).toHaveBeenCalledWith(
        tx,
        expect.objectContaining({ entityType: 'EnrollmentHandover', action: 'CREATE', actorUserId: 'user-1' }),
      );
    });

    it('is idempotent: a student that already has a handover is not duplicated', async () => {
      const tx = makeTx(makeLead([makeStudent({ enrollmentHandover: { id: 'existing' } })]));

      const result = await service.ensureHandoverInTx(tx as any, 'lead-1', 'user-1');

      expect(tx.enrollmentHandover.create).not.toHaveBeenCalled();
      expect(tx.mentoringActivation.create).not.toHaveBeenCalled();
      expect(tx.student.update).not.toHaveBeenCalled();
      expect(allocation.autoAllocateInTx).not.toHaveBeenCalled();
      expect(result.alreadyHandedOver).toEqual(['stu-1']);
      expect(result.created).toEqual([]);
    });

    it('creates one handover per student and skips students without requirements', async () => {
      const tx = makeTx(
        makeLead([
          makeStudent({ id: 'stu-1' }),
          makeStudent({ id: 'stu-2', requirements: [] }),
          makeStudent({ id: 'stu-3' }),
        ]),
      );

      const result = await service.ensureHandoverInTx(tx as any, 'lead-1', 'user-1');

      expect(tx.enrollmentHandover.create).toHaveBeenCalledTimes(2);
      expect(result.created.map((c) => c.studentId)).toEqual(['stu-1', 'stu-3']);
      expect(result.skippedWithoutRequirements).toEqual(['stu-2']);
    });

    it('rejects a lead with no student that has a requirement', async () => {
      const tx = makeTx(makeLead([makeStudent({ requirements: [] })]));

      await expect(service.ensureHandoverInTx(tx as any, 'lead-1', 'user-1')).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(tx.enrollmentHandover.create).not.toHaveBeenCalled();
    });

    it('rejects a lead with no students at all', async () => {
      const tx = makeTx(makeLead([]));

      await expect(service.ensureHandoverInTx(tx as any, 'lead-1', 'user-1')).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('does not throw for an already handed-over lead even if no student could be newly handed over', async () => {
      const tx = makeTx(
        makeLead([makeStudent({ enrollmentHandover: { id: 'existing' }, requirements: [] })]),
      );

      await expect(service.ensureHandoverInTx(tx as any, 'lead-1', 'user-1')).resolves.toEqual(
        expect.objectContaining({ created: [] }),
      );
    });

    it('records missing information without inventing values', async () => {
      const tx = makeTx(makeLead([makeStudent()]));

      await service.ensureHandoverInTx(tx as any, 'lead-1', 'user-1');

      const data = tx.enrollmentHandover.create.mock.calls[0][0].data;
      const transferred = data.transferredFields as Array<{ field: string; value: unknown }>;
      const missing = data.missingFields as Array<{ field: string; reason: string }>;

      expect(transferred.find((f) => f.field === 'parent.name')?.value).toBe('Parent One');
      expect(transferred.find((f) => f.field === 'parent.primaryPhone')?.value).toBe('+971500000000');
      expect(transferred.find((f) => f.field === 'student.dateOfBirth')).toBeUndefined();
      expect(missing).toEqual(
        expect.arrayContaining([
          { field: 'student.dateOfBirth', reason: 'NOT_PROVIDED' },
          { field: 'academic.previousMarks', reason: 'NOT_COLLECTED_IN_SALES' },
          { field: 'tutor.assignments', reason: 'NOT_COLLECTED_IN_SALES' },
          { field: 'timetable.schedule', reason: 'NOT_COLLECTED_IN_SALES' },
        ]),
      );
      expect(data.sourceSnapshot.lead.businessId).toBe('LED-0001');
      expect(data.sourceSnapshot.student.businessId).toBe('STU-0001');
      expect(data.sourceSnapshot.requirements).toHaveLength(1);
    });
  });

  describe('assertCanLeaveEnrolled', () => {
    it('allows moving between ENROLLED and PAID without checking activations', async () => {
      const tx = makeTx(null);
      await service.assertCanLeaveEnrolled(tx as any, 'lead-1', 'PAID');
      await service.assertCanLeaveEnrolled(tx as any, 'lead-1', 'ENROLLED');
      expect(tx.mentoringActivation.count).not.toHaveBeenCalled();
    });

    it('blocks leaving ENROLLED while an activation is open', async () => {
      const tx = makeTx(null);
      tx.mentoringActivation.count.mockResolvedValue(1);

      await expect(service.assertCanLeaveEnrolled(tx as any, 'lead-1', 'LOST' as any)).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(tx.mentoringActivation.count).toHaveBeenCalledWith({
        where: { leadId: 'lead-1', status: { not: 'CANCELLED' } },
      });
    });

    it('allows leaving ENROLLED when every activation is cancelled', async () => {
      const tx = makeTx(null);
      tx.mentoringActivation.count.mockResolvedValue(0);

      await expect(service.assertCanLeaveEnrolled(tx as any, 'lead-1', 'LOST' as any)).resolves.toBeUndefined();
    });
  });

  describe('hasBeenEnrolled', () => {
    const clientWith = (status: string | null, enrolledHistory = 0) => ({
      lead: { findUnique: jest.fn().mockResolvedValue(status ? { status } : null) },
      leadStatusHistory: { count: jest.fn().mockResolvedValue(enrolledHistory) },
    });

    it('is true for an ENROLLED lead', async () => {
      await expect(service.hasBeenEnrolled(clientWith('ENROLLED') as any, 'lead-1')).resolves.toBe(true);
    });

    it('is true for a PAID lead that was ENROLLED before', async () => {
      const client = clientWith('PAID', 1);
      await expect(service.hasBeenEnrolled(client as any, 'lead-1')).resolves.toBe(true);
      expect(client.leadStatusHistory.count).toHaveBeenCalledWith({
        where: { leadId: 'lead-1', newStatus: 'ENROLLED' },
      });
    });

    it('is false for a PAID lead that was never ENROLLED', async () => {
      await expect(service.hasBeenEnrolled(clientWith('PAID', 0) as any, 'lead-1')).resolves.toBe(false);
    });

    it('is false for other statuses and missing leads', async () => {
      await expect(service.hasBeenEnrolled(clientWith('NEGOTIATION') as any, 'lead-1')).resolves.toBe(false);
      await expect(service.hasBeenEnrolled(clientWith(null) as any, 'lead-1')).resolves.toBe(false);
    });
  });

  describe('ensureHandoverIfEnrolledInTx (students added after enrollment)', () => {
    it('does nothing for a lead that has not been enrolled', async () => {
      const tx = makeTx(makeLead([makeStudent()]));
      tx.lead.findUnique.mockResolvedValue({ status: 'NEGOTIATION' });
      (tx as any).leadStatusHistory = { count: jest.fn().mockResolvedValue(0) };

      const result = await service.ensureHandoverIfEnrolledInTx(tx as any, 'lead-1', 'user-1');

      expect(result).toBeNull();
      expect(tx.enrollmentHandover.create).not.toHaveBeenCalled();
    });

    it('hands over a newly eligible student of an already-enrolled lead', async () => {
      const tx = makeTx(
        makeLead([makeStudent({ enrollmentHandover: { id: 'old' } }), makeStudent({ id: 'stu-2' })]),
      );
      (tx as any).leadStatusHistory = { count: jest.fn() };

      const result = await service.ensureHandoverIfEnrolledInTx(tx as any, 'lead-1', 'user-1');

      expect(result?.created.map((c) => c.studentId)).toEqual(['stu-2']);
      expect(result?.alreadyHandedOver).toEqual(['stu-1']);
      expect(tx.enrollmentHandover.create).toHaveBeenCalledTimes(1);
    });

    it('does not throw when the new student has no requirement yet', async () => {
      const tx = makeTx(makeLead([makeStudent({ requirements: [] })]));
      (tx as any).leadStatusHistory = { count: jest.fn() };

      const result = await service.ensureHandoverIfEnrolledInTx(tx as any, 'lead-1', 'user-1');

      expect(result?.created).toEqual([]);
      expect(result?.skippedWithoutRequirements).toEqual(['stu-1']);
    });
  });

  describe('assertStudentEditableBySales', () => {
    it('rejects Sales edits once the student has a handover', async () => {
      const client = { enrollmentHandover: { findUnique: jest.fn().mockResolvedValue({ id: 'ho-1' }) } };
      await expect(service.assertStudentEditableBySales(client as any, 'stu-1')).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it('allows edits before handover', async () => {
      const client = { enrollmentHandover: { findUnique: jest.fn().mockResolvedValue(null) } };
      await expect(service.assertStudentEditableBySales(client as any, 'stu-1')).resolves.toBeUndefined();
    });
  });

  describe('retryForLead', () => {
    it('refuses leads that have never been ENROLLED', async () => {
      prisma.lead.findUnique.mockResolvedValue({ id: 'lead-1' });
      const tx = makeTx({ status: 'PAID' });
      (tx as any).leadStatusHistory = { count: jest.fn().mockResolvedValue(0) };
      prisma.$transaction.mockImplementation((fn: (t: unknown) => unknown) => Promise.resolve(fn(tx)));

      await expect(service.retryForLead('lead-1', 'user-1')).rejects.toBeInstanceOf(BadRequestException);
      expect(tx.enrollmentHandover.create).not.toHaveBeenCalled();
    });

    it('runs the idempotent handover in a transaction for ENROLLED leads', async () => {
      prisma.lead.findUnique.mockResolvedValue({ id: 'lead-1' });
      const tx = makeTx(makeLead([makeStudent()]));
      (tx as any).leadStatusHistory = { count: jest.fn() };
      prisma.$transaction.mockImplementation((fn: (t: unknown) => unknown) => Promise.resolve(fn(tx)));

      const result = await service.retryForLead('lead-1', 'user-1');

      expect(result.created).toHaveLength(1);
    });
  });
});
