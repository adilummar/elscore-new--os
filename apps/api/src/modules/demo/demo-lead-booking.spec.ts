import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { DemoStatus, DemoBookingStatus, DemoSessionStatus, LeadStatus, DemoOperationalStage } from '@prisma/client';
import { v5 as uuidv5 } from 'uuid';

import { DemoService } from './demo.service';
import { LeadService } from '../lead/lead.service';
import { StudentService } from '../student/student.service';
import { DEMO_BACKFILL_NAMESPACE } from './backfill/demo-backfill.service';
import { DemoController } from './demo.controller';

describe('Demo Module — Lead-to-Demo Booking Workflow', () => {
  const futureDate = new Date(Date.now() + 24 * 60 * 60 * 1000);
  const futureIso = futureDate.toISOString();
  const futureIso2 = new Date(futureDate.getTime() + 60 * 60 * 1000).toISOString();

  function buildMockContext(permissions: string[] = ['demo.book', 'lead.view_all']) {
    const defaultStudent = {
      id: 'student-1',
      leadId: 'lead-1',
      lead: {
        id: 'lead-1',
        status: LeadStatus.INTERESTED,
        assignedToUserId: 'counsellor-1',
      },
      requirements: [
        {
          id: 'req-1',
          studentId: 'student-1',
          subjectId: 'sub-1',
          curriculumId: 'cur-1',
          gradeId: 'grd-1',
          subject: { id: 'sub-1', name: 'Math' },
          curriculum: { id: 'cur-1', name: 'CBSE' },
          grade: { id: 'grd-1', name: 'Grade 10' },
        },
        {
          id: 'req-2',
          studentId: 'student-1',
          subjectId: 'sub-physics',
          curriculumId: 'cur-1',
          gradeId: 'grd-1',
          subject: { id: 'sub-physics', name: 'Physics' },
          curriculum: { id: 'cur-1', name: 'CBSE' },
          grade: { id: 'grd-1', name: 'Grade 10' },
        },
      ],
    };

    const mockTx: any = {
      $queryRaw: jest.fn().mockResolvedValue([]),
      requirement: {
        findUnique: jest.fn().mockImplementation(({ where }: any) => {
          return Promise.resolve({
            id: where?.id || 'req-1',
            studentId: 'student-1',
            subjectId: 'sub-1',
            curriculumId: 'cur-1',
            gradeId: 'grd-1',
            student: defaultStudent,
          });
        }),
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn().mockImplementation((args: any) => Promise.resolve({ id: args.data?.id || 'req-1', ...args.data })),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      student: {
        findUnique: jest.fn().mockImplementation(({ where }: any) => {
          return Promise.resolve({
            ...defaultStudent,
            id: where?.id || 'student-1',
          });
        }),
        create: jest.fn().mockImplementation((args: any) => Promise.resolve({ id: args.data?.id || 'student-1', ...args.data })),
        update: jest.fn().mockImplementation((args: any) => Promise.resolve({ id: args.where?.id || 'student-1', ...args.data })),
      },
      lead: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'lead-1',
          status: LeadStatus.INTERESTED,
          assignedToUserId: 'counsellor-1',
        }),
        update: jest.fn().mockResolvedValue({ id: 'lead-1', status: LeadStatus.DEMO_BOOKED }),
      },
      leadStatusHistory: {
        create: jest.fn().mockResolvedValue({ id: 'lsh-1' }),
      },
      demo: {
        findMany: jest.fn().mockResolvedValue([]),
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockImplementation((args) => Promise.resolve({ ...args.data, id: args.data?.id || 'demo-legacy-1' })),
      },
      demoBooking: {
        findUnique: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn().mockImplementation((args) => Promise.resolve({ ...args.data, id: args.data?.id || 'booking-1' })),
        update: jest.fn().mockImplementation((args) => Promise.resolve({ ...args.data, id: args.where?.id || 'booking-1' })),
      },
      demoSession: {
        findMany: jest.fn().mockResolvedValue([]),
        findUnique: jest.fn().mockImplementation(({ where }: any) =>
          Promise.resolve({ id: where?.id || 'session-1', tutorAssignments: [] }),
        ),
        update: jest.fn().mockImplementation((args: any) => Promise.resolve({ id: args.where?.id || 'session-1', ...args.data })),
        create: jest.fn().mockImplementation((args) => Promise.resolve({ id: 'session-1', ...args.data })),
      },
      demoSessionTutorAssignment: {
        create: jest.fn().mockResolvedValue({ id: 'ta-1', sessionId: 'session-1', tutorId: 'tutor-1' }),
        findMany: jest.fn().mockResolvedValue([]),
        update: jest.fn().mockResolvedValue({ id: 'ta-1' }),
      },
      roundRobinCoordinatorState: {
        findFirst: jest.fn().mockResolvedValue(null),
        update: jest.fn().mockResolvedValue({}),
      },
      roundRobinCounsellorState: {
        findUnique: jest.fn().mockResolvedValue(null),
      },
      user: {
        findUnique: jest.fn().mockResolvedValue({ id: 'user-1', status: 'ACTIVE' }),
      },
    };

    const mockPrisma: any = {
      $transaction: jest.fn(async (cb: (tx: any) => Promise<any>) => cb(mockTx)),
      demo: {
        findMany: jest.fn().mockResolvedValue([]),
        findUnique: jest.fn().mockResolvedValue(null),
      },
      demoBooking: {
        findUnique: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([]),
      },
      lead: {
        findUnique: jest.fn().mockResolvedValue({ id: 'lead-1', assignedToUserId: 'counsellor-1', status: LeadStatus.INTERESTED }),
      },
    };

    const mockAudit = {
      recordInTx: jest.fn().mockResolvedValue(undefined),
      record: jest.fn().mockResolvedValue(undefined),
    };

    const mockIdGen = {
      nextIdInTx: jest.fn().mockImplementation(async (_tx: any, prefix: string) => `${prefix}-0001`),
    };

    const mockRbac = {
      hasPermissions: jest.fn((_userId: string, codes: string[]) =>
        codes.every((code) => permissions.includes(code))
      ),
    };

    const mockQueue = {
      add: jest.fn().mockResolvedValue(undefined),
    };

    const demoService = new DemoService(
      mockPrisma as any,
      mockAudit as any,
      mockIdGen as any,
      mockRbac as any,
      mockQueue as any,
    );

    return {
      demoService,
      mockPrisma,
      mockTx,
      mockAudit,
      mockIdGen,
      mockRbac,
      mockQueue,
    };
  }

  describe('Scenario 1: An INTERESTED lead with 0 students books a demo (inline auto-provisioning)', () => {
    it('creates student and requirements atomically via saveBundle then completes multi-session demo booking', async () => {
      const { demoService, mockPrisma, mockTx, mockAudit, mockIdGen, mockRbac } = buildMockContext(['demo.book', 'lead.view_all']);

      const studentService = new StudentService(
        mockPrisma as any,
        mockAudit as any,
        mockIdGen as any,
      );

      // Lead with 0 students
      mockPrisma.lead.findUnique.mockResolvedValue({
        id: 'lead-empty-1',
        status: LeadStatus.INTERESTED,
        assignedToUserId: 'counsellor-1',
      });
      mockTx.lead.findUnique.mockResolvedValue({
        id: 'lead-empty-1',
        status: LeadStatus.INTERESTED,
        assignedToUserId: 'counsellor-1',
        students: [],
      });

      const createdStudentId = 'student-new-1';
      const createdReqs = [
        {
          id: 'req-math-new',
          studentId: createdStudentId,
          subjectId: 'sub-math-id',
          curriculumId: 'cur-cbse-id',
          gradeId: 'grd-10-id',
          subject: { id: 'sub-math-id', name: 'Mathematics' },
          curriculum: { id: 'cur-cbse-id', name: 'CBSE' },
          grade: { id: 'grd-10-id', name: 'Grade 10' },
        },
        {
          id: 'req-phys-new',
          studentId: createdStudentId,
          subjectId: 'sub-phys-id',
          curriculumId: 'cur-cbse-id',
          gradeId: 'grd-10-id',
          subject: { id: 'sub-phys-id', name: 'Physics' },
          curriculum: { id: 'cur-cbse-id', name: 'CBSE' },
          grade: { id: 'grd-10-id', name: 'Grade 10' },
        },
      ];

      mockTx.student.create.mockResolvedValue({
        id: createdStudentId,
        businessId: 'STU-0010',
        firstName: 'Arjun',
        lastName: 'Kumar',
        leadId: 'lead-empty-1',
        curriculumId: 'cur-cbse-id',
        gradeId: 'grd-10-id',
      });

      mockTx.student.findUnique.mockResolvedValue({
        id: createdStudentId,
        businessId: 'STU-0010',
        firstName: 'Arjun',
        lastName: 'Kumar',
        leadId: 'lead-empty-1',
        curriculumId: 'cur-cbse-id',
        gradeId: 'grd-10-id',
        lead: {
          id: 'lead-empty-1',
          status: LeadStatus.INTERESTED,
          assignedToUserId: 'counsellor-1',
        },
        requirements: createdReqs,
      });

      // 1. Auto-provision student bundle
      const bundle = await studentService.saveBundle(
        'lead-empty-1',
        null,
        {
          firstName: 'Arjun',
          lastName: 'Kumar',
          curriculumId: 'cur-cbse-id',
          gradeId: 'grd-10-id',
          subjectIds: ['sub-math-id', 'sub-phys-id'],
        },
        'counsellor-1',
        true,
      );

      expect(bundle).toBeDefined();
      expect(bundle!.id).toBe(createdStudentId);
      expect(bundle!.requirements).toHaveLength(2);

      // 2. Book multi-session demo using newly provisioned student & requirements
      const bookingResult = await demoService.bookDemo(
        {
          studentId: bundle!.id,
          sessions: [
            {
              sessionOrder: 1,
              requirementId: 'req-math-new',
              subjectId: 'sub-math-id',
              curriculumId: 'cur-cbse-id',
              gradeId: 'grd-10-id',
              scheduledStart: futureIso,
              scheduledEnd: new Date(new Date(futureIso).getTime() + 60 * 60000).toISOString(),
              durationMinutes: 60,
            },
            {
              sessionOrder: 2,
              requirementId: 'req-phys-new',
              subjectId: 'sub-phys-id',
              curriculumId: 'cur-cbse-id',
              gradeId: 'grd-10-id',
              scheduledStart: new Date(new Date(futureIso).getTime() + 75 * 60000).toISOString(),
              scheduledEnd: new Date(new Date(futureIso).getTime() + 135 * 60000).toISOString(),
              durationMinutes: 60,
            },
          ],
        },
        { id: 'counsellor-1', email: 'c@example.com' } as any,
      );

      expect(bookingResult).toBeDefined();
      expect(mockTx.lead.update).toHaveBeenCalledWith({
        where: { id: 'lead-empty-1' },
        data: { status: LeadStatus.DEMO_BOOKED },
      });
      expect(mockTx.demoSession.create).toHaveBeenCalledTimes(2);
    });
  });

  describe('Scenario 2: Successful booking changes INTERESTED to DEMO_BOOKED', () => {
    it('transitions lead status from INTERESTED to DEMO_BOOKED and logs history and audit record', async () => {
      const { demoService, mockTx, mockAudit } = buildMockContext(['demo.book', 'lead.view_all']);

      const result = await demoService.bookDemo(
        {
          studentId: 'student-1',
          requirementId: 'req-1',
          scheduledAt: futureIso,
          durationMinutes: 60,
        },
        { id: 'counsellor-1', email: 'c@example.com' } as any,
      );

      expect(result).toBeDefined();
      expect(mockTx.lead.update).toHaveBeenCalledWith({
        where: { id: 'lead-1' },
        data: { status: LeadStatus.DEMO_BOOKED },
      });
      expect(mockTx.leadStatusHistory.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          leadId: 'lead-1',
          oldStatus: LeadStatus.INTERESTED,
          newStatus: LeadStatus.DEMO_BOOKED,
          changedByUserId: 'counsellor-1',
        }),
      });
      expect(mockAudit.recordInTx).toHaveBeenCalledWith(
        mockTx,
        expect.objectContaining({
          entityType: 'Lead',
          entityId: 'lead-1',
          action: 'STATUS_CHANGE',
          actorUserId: 'counsellor-1',
          newValue: expect.objectContaining({ status: LeadStatus.DEMO_BOOKED }),
        }),
      );
    });
  });

  describe('Scenario 3: Booking failure leaves lead status unchanged', () => {
    it('does not modify lead status when validation throws an overlapping error', async () => {
      const { demoService, mockTx } = buildMockContext(['demo.book', 'lead.view_all']);

      // Existing overlapping demo
      mockTx.demo.findMany.mockResolvedValue([
        {
          id: 'existing-demo',
          studentId: 'student-1',
          scheduledAt: new Date(futureIso),
          durationMinutes: 60,
          status: DemoStatus.SCHEDULED,
        },
      ]);

      await expect(
        demoService.bookDemo(
          {
            studentId: 'student-1',
            requirementId: 'req-1',
            scheduledAt: futureIso,
            durationMinutes: 60,
          },
          { id: 'counsellor-1', email: 'c@example.com' } as any,
        ),
      ).rejects.toThrow(BadRequestException);

      expect(mockTx.lead.update).not.toHaveBeenCalled();
      expect(mockTx.leadStatusHistory.create).not.toHaveBeenCalled();
    });
  });

  describe('Scenario 4: Multiple subject sessions saved and displayed correctly', () => {
    it('creates parent DemoBooking and multiple DemoSession records with sequence and duration', async () => {
      const { demoService, mockTx } = buildMockContext(['demo.book', 'lead.view_all']);

      const result = await demoService.bookDemo(
        {
          studentId: 'student-1',
          scheduledAt: futureIso,
          durationMinutes: 120,
          sessions: [
            {
              sessionOrder: 1,
              requirementId: 'req-1',
              subjectId: 'sub-1',
              curriculumId: 'cur-1',
              gradeId: 'grd-1',
              scheduledStart: futureIso,
              scheduledEnd: futureIso2,
              durationMinutes: 60,
            },
            {
              sessionOrder: 2,
              requirementId: 'req-2',
              subjectId: 'sub-physics',
              curriculumId: 'cur-1',
              gradeId: 'grd-1',
              scheduledStart: futureIso2,
              scheduledEnd: new Date(new Date(futureIso2).getTime() + 60 * 60 * 1000).toISOString(),
              durationMinutes: 60,
            },
          ],
        },
        { id: 'counsellor-1', email: 'c@example.com' } as any,
      );

      expect(result).toBeDefined();
      expect(mockTx.demoBooking.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            studentId: 'student-1',
            leadId: 'lead-1',
            totalDurationMin: 120,
            status: DemoBookingStatus.SCHEDULED,
          }),
        }),
      );
      expect(mockTx.demoSession.create).toHaveBeenCalledTimes(2);
      expect(mockTx.demoSession.create).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({
          data: expect.objectContaining({
            sessionOrder: 1,
            requirementId: 'req-1',
            subjectId: 'sub-1',
            durationMinutes: 60,
          }),
        }),
      );
      expect(mockTx.demoSession.create).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          data: expect.objectContaining({
            sessionOrder: 2,
            requirementId: 'req-2',
            subjectId: 'sub-physics',
            durationMinutes: 60,
          }),
        }),
      );
    });
  });

  describe('Scenario 5: Duplicate/retried requests do not create duplicate records', () => {
    it('returns existing booking when idempotencyKey matches without creating duplicate rows', async () => {
      const { demoService, mockTx } = buildMockContext(['demo.book', 'lead.view_all']);
      const idempotencyKey = 'retry-key-unique-123';
      const expectedDeterministicBookingId = uuidv5(idempotencyKey, DEMO_BACKFILL_NAMESPACE);

      const existingBooking = {
        id: expectedDeterministicBookingId,
        businessId: 'BKG-0001',
        studentId: 'student-1',
        leadId: 'lead-1',
        status: DemoBookingStatus.SCHEDULED,
        legacyDemoId: 'demo-existing-1',
        sessions: [],
      };

      // Mock finding the existing booking by deterministic id
      mockTx.demoBooking.findUnique.mockResolvedValue(existingBooking);

      const result = await demoService.bookDemo(
        {
          studentId: 'student-1',
          requirementId: 'req-1',
          scheduledAt: futureIso,
          durationMinutes: 60,
          idempotencyKey,
        },
        { id: 'counsellor-1', email: 'c@example.com' } as any,
      );

      expect(result).toEqual(existingBooking);
      expect(mockTx.demoBooking.create).not.toHaveBeenCalled();
      expect(mockTx.demo.create).not.toHaveBeenCalled();
    });
  });

  describe('Scenario 6: Lead status guard — only INTERESTED leads can have demos booked', () => {
    it('rejects booking for lead status NEW with BadRequestException', async () => {
      const { demoService, mockTx } = buildMockContext(['demo.book', 'lead.view_all']);
      const studentWithNewLead = {
        id: 'student-1',
        leadId: 'lead-1',
        lead: {
          id: 'lead-1',
          status: LeadStatus.NEW,
          assignedToUserId: 'counsellor-1',
        },
        requirements: [
          {
            id: 'req-1',
            studentId: 'student-1',
            subjectId: 'sub-1',
            curriculumId: 'cur-1',
            gradeId: 'grd-1',
            subject: { id: 'sub-1', name: 'Math' },
            curriculum: { id: 'cur-1', name: 'CBSE' },
            grade: { id: 'grd-1', name: 'Grade 10' },
          },
        ],
      };
      mockTx.student.findUnique.mockResolvedValue(studentWithNewLead);
      mockTx.requirement.findUnique.mockResolvedValue({
        id: 'req-1',
        studentId: 'student-1',
        subjectId: 'sub-1',
        curriculumId: 'cur-1',
        gradeId: 'grd-1',
        student: studentWithNewLead,
      });

      await expect(
        demoService.bookDemo(
          {
            studentId: 'student-1',
            requirementId: 'req-1',
            scheduledAt: futureIso,
            durationMinutes: 60,
          },
          { id: 'counsellor-1', email: 'c@example.com' } as any,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects booking for lead status CONTACTED with BadRequestException', async () => {
      const { demoService, mockTx } = buildMockContext(['demo.book', 'lead.view_all']);
      const studentWithContactedLead = {
        id: 'student-1',
        leadId: 'lead-1',
        lead: {
          id: 'lead-1',
          status: LeadStatus.CONTACTED,
          assignedToUserId: 'counsellor-1',
        },
        requirements: [
          {
            id: 'req-1',
            studentId: 'student-1',
            subjectId: 'sub-1',
            curriculumId: 'cur-1',
            gradeId: 'grd-1',
            subject: { id: 'sub-1', name: 'Math' },
            curriculum: { id: 'cur-1', name: 'CBSE' },
            grade: { id: 'grd-1', name: 'Grade 10' },
          },
        ],
      };
      mockTx.student.findUnique.mockResolvedValue(studentWithContactedLead);
      mockTx.requirement.findUnique.mockResolvedValue({
        id: 'req-1',
        studentId: 'student-1',
        subjectId: 'sub-1',
        curriculumId: 'cur-1',
        gradeId: 'grd-1',
        student: studentWithContactedLead,
      });

      await expect(
        demoService.bookDemo(
          {
            studentId: 'student-1',
            requirementId: 'req-1',
            scheduledAt: futureIso,
            durationMinutes: 60,
          },
          { id: 'counsellor-1', email: 'c@example.com' } as any,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it.each([
      LeadStatus.NEGOTIATION,
      LeadStatus.ENROLLED,
      LeadStatus.PAID,
      LeadStatus.DEMO_BOOKED,
      LeadStatus.DEMO_COMPLETED,
      LeadStatus.NURTURE,
      LeadStatus.NO_RESPONSE,
      LeadStatus.LOST,
      LeadStatus.NOT_INTERESTED,
      LeadStatus.JUNK,
    ])(
      'rejects booking for ineligible/protected/terminal lead status %s with BadRequestException',
      async (ineligibleStatus) => {
        const { demoService, mockTx } = buildMockContext(['demo.book', 'lead.view_all']);

        const studentWithIneligibleLead = {
          id: 'student-1',
          leadId: 'lead-1',
          lead: {
            id: 'lead-1',
            status: ineligibleStatus,
            assignedToUserId: 'counsellor-1',
          },
          requirements: [
            {
              id: 'req-1',
              studentId: 'student-1',
              subjectId: 'sub-1',
              curriculumId: 'cur-1',
              gradeId: 'grd-1',
              subject: { id: 'sub-1', name: 'Math' },
              curriculum: { id: 'cur-1', name: 'CBSE' },
              grade: { id: 'grd-1', name: 'Grade 10' },
            },
          ],
        };
        mockTx.student.findUnique.mockResolvedValue(studentWithIneligibleLead);
        mockTx.requirement.findUnique.mockResolvedValue({
          id: 'req-1',
          studentId: 'student-1',
          subjectId: 'sub-1',
          curriculumId: 'cur-1',
          gradeId: 'grd-1',
          student: studentWithIneligibleLead,
        });

        await expect(
          demoService.bookDemo(
            {
              studentId: 'student-1',
              requirementId: 'req-1',
              scheduledAt: futureIso,
              durationMinutes: 60,
            },
            { id: 'counsellor-1', email: 'c@example.com' } as any,
          ),
        ).rejects.toThrow(BadRequestException);

        expect(mockTx.demoBooking.create).not.toHaveBeenCalled();
        expect(mockTx.lead.update).not.toHaveBeenCalled();
      },
    );

    it('permits booking when lead status is exactly INTERESTED', async () => {
      const { demoService, mockTx } = buildMockContext(['demo.book', 'lead.view_all']);

      const studentWithInterestedLead = {
        id: 'student-1',
        leadId: 'lead-1',
        lead: {
          id: 'lead-1',
          status: LeadStatus.INTERESTED,
          assignedToUserId: 'counsellor-1',
        },
        requirements: [
          {
            id: 'req-1',
            studentId: 'student-1',
            subjectId: 'sub-1',
            curriculumId: 'cur-1',
            gradeId: 'grd-1',
            subject: { id: 'sub-1', name: 'Math' },
            curriculum: { id: 'cur-1', name: 'CBSE' },
            grade: { id: 'grd-1', name: 'Grade 10' },
          },
        ],
      };
      mockTx.student.findUnique.mockResolvedValue(studentWithInterestedLead);
      mockTx.requirement.findUnique.mockResolvedValue({
        id: 'req-1',
        studentId: 'student-1',
        subjectId: 'sub-1',
        curriculumId: 'cur-1',
        gradeId: 'grd-1',
        student: studentWithInterestedLead,
      });

      const res = await demoService.bookDemo(
        {
          studentId: 'student-1',
          requirementId: 'req-1',
          scheduledAt: futureIso,
          durationMinutes: 60,
        },
        { id: 'counsellor-1', email: 'c@example.com' } as any,
      );

      expect(res).toBeDefined();
      expect(mockTx.demoBooking.create).toHaveBeenCalled();
      expect(mockTx.lead.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'lead-1' },
          data: { status: LeadStatus.DEMO_BOOKED },
        }),
      );
    });
  });

  describe('Scenario 7: Unauthorized users cannot book demos outside permitted lead scope', () => {
    it('throws ForbiddenException when counsellor attempts booking for another user’s lead', async () => {
      // Counsellor only has demo.book, NOT lead.view_all, NOT demo.manage_team
      const { demoService, mockTx } = buildMockContext(['demo.book']);

      const studentOtherLead = {
        id: 'student-1',
        leadId: 'lead-1',
        lead: {
          id: 'lead-1',
          status: LeadStatus.INTERESTED,
          assignedToUserId: 'counsellor-2', // assigned to someone else
        },
        requirements: [
          {
            id: 'req-1',
            studentId: 'student-1',
            subjectId: 'sub-1',
            curriculumId: 'cur-1',
            gradeId: 'grd-1',
            subject: { id: 'sub-1', name: 'Math' },
            curriculum: { id: 'cur-1', name: 'CBSE' },
            grade: { id: 'grd-1', name: 'Grade 10' },
          },
        ],
      };
      mockTx.student.findUnique.mockResolvedValue(studentOtherLead);
      mockTx.requirement.findUnique.mockResolvedValue({
        id: 'req-1',
        studentId: 'student-1',
        subjectId: 'sub-1',
        curriculumId: 'cur-1',
        gradeId: 'grd-1',
        student: studentOtherLead,
      });

      await expect(
        demoService.bookDemo(
          {
            studentId: 'student-1',
            requirementId: 'req-1',
            scheduledAt: futureIso,
            durationMinutes: 60,
          },
          { id: 'counsellor-1', email: 'c1@example.com' } as any,
        ),
      ).rejects.toThrow(ForbiddenException);

      expect(mockTx.demoBooking.create).not.toHaveBeenCalled();
      expect(mockTx.lead.update).not.toHaveBeenCalled();
    });
  });

  describe('Scenario 8: CEO God View uses target user scope correctly', () => {
    it('ensures DemoController does not declare JwtAuthGuard at class level overriding GodViewGuard', () => {
      const guards = Reflect.getMetadata('__guards__', DemoController) || [];
      const guardNames = guards.map((g: any) => g.name || g.constructor?.name);
      expect(guardNames).not.toContain('JwtAuthGuard');
    });
  });

  describe('Scenario 9: Lead Demos tab data bridge returns newly saved booking', () => {
    it('queries demoBookings with sessions, requirements, and tutor assignments in LeadService.findOne', async () => {
      const mockPrisma: any = {
        lead: {
          findUnique: jest.fn().mockImplementation(({ select, include }: any) => {
            if (select) {
              return Promise.resolve({ assignedToUserId: 'user-1' });
            }
            return Promise.resolve({
              id: 'lead-1',
              assignedToUserId: 'user-1',
              status: LeadStatus.DEMO_BOOKED,
              students: [
                {
                  id: 'student-1',
                  demos: [],
                  demoBookings: [
                    {
                      id: 'bkg-1',
                      businessId: 'BKG-0001',
                      status: DemoBookingStatus.SCHEDULED,
                      scheduledDate: new Date(),
                      sessions: [
                        {
                          id: 'sess-1',
                          sessionOrder: 1,
                          subject: { name: 'Mathematics' },
                          grade: { name: 'Grade 10' },
                          curriculum: { name: 'IGCSE' },
                          durationMinutes: 60,
                        },
                      ],
                    },
                  ],
                },
              ],
              demoBookings: [
                {
                  id: 'bkg-1',
                  businessId: 'BKG-0001',
                  status: DemoBookingStatus.SCHEDULED,
                  scheduledDate: new Date(),
                  sessions: [
                    {
                      id: 'sess-1',
                      sessionOrder: 1,
                      subject: { name: 'Mathematics' },
                      grade: { name: 'Grade 10' },
                      curriculum: { name: 'IGCSE' },
                      durationMinutes: 60,
                    },
                  ],
                },
              ],
            });
          }),
        },
      };

      const leadService = new LeadService(
        mockPrisma as any,
        { recordInTx: jest.fn() } as any,
        { nextIdInTx: jest.fn() } as any,
        {} as any,
      );

      const lead = await leadService.findOne('lead-1', 'user-1', true);

      expect(lead).toBeDefined();
      expect(lead?.demoBookings).toBeDefined();
      expect(lead?.demoBookings?.length).toBe(1);
      expect(lead?.demoBookings?.[0].sessions[0].subject.name).toBe('Mathematics');
      expect(lead?.students[0].demoBookings?.length).toBe(1);

      // Verify the include options in findUnique
      const findOneCallArgs = mockPrisma.lead.findUnique.mock.calls.find((c: any) => c[0]?.include);
      expect(findOneCallArgs).toBeDefined();
      expect(findOneCallArgs[0].include.demoBookings).toBeDefined();
      expect(findOneCallArgs[0].include.students.include.demoBookings).toBeDefined();
    });
  });

  describe('Scenario 10: Existing legacy Demo data and workflows remain compatible', () => {
    it('dual-writes primary session to legacy demos table and links legacyDemoId on booking', async () => {
      const { demoService, mockTx } = buildMockContext(['demo.book', 'lead.view_all']);

      const result = await demoService.bookDemo(
        {
          studentId: 'student-1',
          requirementId: 'req-1',
          scheduledAt: futureIso,
          durationMinutes: 45,
        },
        { id: 'counsellor-1', email: 'c@example.com' } as any,
      );

      expect(result).toBeDefined();
      expect(mockTx.demo.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          studentId: 'student-1',
          requirementId: 'req-1',
          status: DemoStatus.SCHEDULED,
          durationMinutes: 45,
        }),
      });
      expect(mockTx.demoBooking.update).toHaveBeenCalledWith({
        where: { id: expect.any(String) },
        data: { legacyDemoId: expect.any(String) },
      });
    });

    it('returns both legacy demos and modern bookings in lead detail query for backwards compatibility', async () => {
      const mockPrisma: any = {
        lead: {
          findUnique: jest.fn().mockImplementation(({ select }: any) => {
            if (select) return Promise.resolve({ assignedToUserId: 'user-1' });
            return Promise.resolve({
              id: 'lead-compat-1',
              assignedToUserId: 'user-1',
              status: LeadStatus.DEMO_BOOKED,
              students: [
                {
                  id: 'student-1',
                  demos: [
                    {
                      id: 'legacy-demo-1',
                      businessId: 'DMO-LEGACY',
                      status: DemoStatus.COMPLETED,
                      scheduledAt: new Date(Date.now() - 7 * 24 * 3600 * 1000),
                      durationMinutes: 60,
                      subject: { name: 'Chemistry' },
                      grade: { name: 'Grade 9' },
                    },
                  ],
                  demoBookings: [
                    {
                      id: 'booking-modern-1',
                      businessId: 'DMO-0099',
                      legacyDemoId: 'legacy-demo-linked',
                      status: DemoBookingStatus.SCHEDULED,
                      scheduledDate: new Date(),
                      sessions: [
                        {
                          id: 'sess-1',
                          sessionOrder: 1,
                          subject: { name: 'Math' },
                          grade: { name: 'Grade 10' },
                          curriculum: { name: 'CBSE' },
                          durationMinutes: 60,
                        },
                      ],
                    },
                  ],
                },
              ],
              demoBookings: [],
            });
          }),
        },
      };

      const leadService = new LeadService(
        mockPrisma as any,
        { recordInTx: jest.fn() } as any,
        { nextIdInTx: jest.fn() } as any,
        {} as any,
      );

      const lead = await leadService.findOne('lead-compat-1', 'user-1', true);
      expect(lead).toBeDefined();
      expect(lead?.students[0].demos).toHaveLength(1);
      expect(lead?.students[0].demos[0].id).toBe('legacy-demo-1');
      expect(lead?.students[0].demoBookings).toHaveLength(1);
      expect(lead?.students[0].demoBookings[0].id).toBe('booking-modern-1');
    });
  });

  describe('Demo Module — Source of Truth Specification Requirements', () => {
    it('returns scored and ranked tutor suggestions matching subject, grade, curriculum, and availability', async () => {
      const demoDate = new Date(Date.now() + 48 * 3600 * 1000);
      const dayOfWeek = demoDate.getDay();

      const mockPrisma: any = {
        demo: {
          findUnique: jest.fn().mockResolvedValue({
            id: 'demo-sugg-1',
            scheduledAt: demoDate,
            durationMinutes: 60,
            subjectId: 'sub-math',
            gradeId: 'grd-10',
            curriculumId: 'cur-cbse',
          }),
          findFirst: jest.fn().mockResolvedValue(null),
        },
        user: {
          findMany: jest.fn().mockResolvedValue([
            {
              id: 'tutor-perfect',
              email: 'perfect@example.com',
              employee: {
                firstName: 'Alice',
                lastName: 'Smith',
                tutorProfile: {
                  teachingExperience: 5,
                  subjects: [{ subjectId: 'sub-math', isActive: true }],
                  grades: [{ gradeId: 'grd-10', isActive: true }],
                  curricula: [{ curriculumId: 'cur-cbse', isActive: true }],
                  availability: [{ dayOfWeek, startTime: '10:00', endTime: '18:00' }],
                },
              },
            },
            {
              id: 'tutor-partial',
              email: 'partial@example.com',
              employee: {
                firstName: 'Bob',
                lastName: 'Jones',
                tutorProfile: {
                  teachingExperience: 2,
                  subjects: [{ subjectId: 'sub-math', isActive: true }],
                  grades: [],
                  curricula: [],
                  availability: [],
                },
              },
            },
          ]),
        },
      };

      const demoService = new DemoService(
        mockPrisma as any,
        { recordInTx: jest.fn() } as any,
        { nextIdInTx: jest.fn() } as any,
        { hasPermissions: jest.fn().mockResolvedValue(true) } as any,
        { add: jest.fn() } as any,
      );

      const suggestions = await demoService.getTutorSuggestions('demo-sugg-1', { id: 'coord-1' } as any);
      expect(suggestions).toHaveLength(2);
      expect(suggestions[0].id).toBe('tutor-perfect');
      expect(suggestions[0].score).toBe(100); // 40 + 30 + 20 + 10
      expect(suggestions[1].id).toBe('tutor-partial');
      expect(suggestions[1].score).toBe(40); // 40
    });

    it('dual-writes tutor assignment to DemoBooking and DemoSessionTutorAssignment', async () => {
      const mockTx: any = {
        demo: {
          findUnique: jest.fn().mockResolvedValue({
            id: 'demo-assign-1',
            status: DemoStatus.SCHEDULED,
            scheduledAt: new Date(Date.now() + 24 * 3600 * 1000),
            durationMinutes: 60,
            studentId: 'student-1',
            tutorId: null,
          }),
          findMany: jest.fn().mockResolvedValue([]),
          update: jest.fn().mockImplementation((args) => Promise.resolve({ ...args.data, id: 'demo-assign-1' })),
        },
        demoBooking: {
          findFirst: jest.fn().mockResolvedValue({
            id: 'demo-assign-1',
            preparationNotes: 'Preparation notes for testing tutor assignment gate',
          }),
          findUnique: jest.fn().mockResolvedValue({
            id: 'demo-assign-1',
            operationalStage: DemoOperationalStage.PREPARATION,
          }),
          update: jest.fn().mockResolvedValue({ id: 'demo-assign-1' }),
          updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        },
        demoSession: {
          findMany: jest.fn().mockResolvedValue([
            { id: 'session-1', bookingId: 'demo-assign-1', status: DemoSessionStatus.SCHEDULED, tutorAssignments: [{ id: 'ta-1', status: 'ACTIVE' }] },
          ]),
          findUnique: jest.fn().mockResolvedValue({
            id: 'session-1',
            status: DemoSessionStatus.SCHEDULED,
            tutorAssignments: [],
          }),
          update: jest.fn().mockResolvedValue({ id: 'session-1', status: DemoSessionStatus.ASSIGNED }),
        },
        demoSessionTutorAssignment: {
          create: jest.fn().mockResolvedValue({ id: 'ta-1', sessionId: 'session-1', tutorId: 'tutor-1' }),
        },
      };

      const mockPrisma: any = {
        $transaction: jest.fn().mockImplementation((cb) => cb(mockTx)),
      };

      const demoService = new DemoService(
        mockPrisma as any,
        { recordInTx: jest.fn() } as any,
        { nextIdInTx: jest.fn() } as any,
        { hasPermissions: jest.fn().mockResolvedValue(true) } as any,
        { add: jest.fn() } as any,
      );

      await demoService.assignTutor('demo-assign-1', { tutorId: 'tutor-1' }, { id: 'coord-1' } as any);

      expect(mockTx.demo.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'demo-assign-1' },
          data: expect.objectContaining({ tutorId: 'tutor-1', status: DemoStatus.ASSIGNED }),
        })
      );
      expect(mockTx.demoBooking.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'demo-assign-1' },
          data: { status: DemoBookingStatus.ASSIGNED },
        })
      );
      expect(mockTx.demoSessionTutorAssignment.create).toHaveBeenCalled();
    });

    it('enforces completion gate, persists multi-role feedback, roadmap, academic plan, and transitions Lead to DEMO_COMPLETED', async () => {
      const mockTx: any = {
        demo: {
          findUnique: jest.fn().mockResolvedValue({
            id: 'demo-comp-1',
            status: DemoStatus.ASSIGNED,
            tutorId: 'tutor-1',
            bookedByUserId: 'counsellor-1',
            student: {
              firstName: 'TestStudent',
              lead: {
                id: 'lead-comp-1',
                status: LeadStatus.DEMO_BOOKED,
              },
            },
          }),
          update: jest.fn().mockResolvedValue({ id: 'demo-comp-1', status: DemoStatus.COMPLETED }),
        },
        demoFeedback: {
          create: jest.fn().mockResolvedValue({ id: 'fb-legacy-1' }),
        },
        demoAttendance: {
          findFirst: jest.fn().mockResolvedValue(null),
          create: jest.fn().mockResolvedValue({ id: 'att-1' }),
        },
        demoFeedbackRecord: {
          upsert: jest.fn().mockResolvedValue({ id: 'dfr-1' }),
        },
        demoRoadmap: {
          upsert: jest.fn().mockResolvedValue({ id: 'drm-1' }),
        },
        demoAcademicPlan: {
          upsert: jest.fn().mockResolvedValue({ id: 'dap-1' }),
        },
        demoSession: {
          findMany: jest.fn().mockResolvedValue([
            {
              id: 'sess-1',
              tutorAssignments: [{ id: 'ta-1', tutorId: 'tutor-1', status: 'ACTIVE' }],
            },
          ]),
          updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        },
        demoBooking: {
          findUnique: jest.fn().mockResolvedValue({
            id: 'demo-comp-1',
            attendances: [
              { participantType: 'PARENT', status: 'PRESENT' },
              { participantType: 'COORDINATOR', status: 'PRESENT' },
            ],
            sessions: [
              {
                id: 'sess-1',
                sessionOrder: 1,
                status: DemoSessionStatus.COMPLETED,
                attendances: [{ participantType: 'TUTOR', status: 'PRESENT' }],
                exceptions: [],
              },
            ],
            feedbackRecord: { id: 'dfr-1' },
            roadmap: { id: 'drm-1' },
            academicPlan: { id: 'dap-1' },
          }),
          update: jest.fn().mockResolvedValue({ id: 'demo-comp-1', status: DemoBookingStatus.COMPLETED }),
        },
        lead: {
          update: jest.fn().mockResolvedValue({ id: 'lead-comp-1', status: LeadStatus.DEMO_COMPLETED }),
        },
        leadStatusHistory: {
          create: jest.fn().mockResolvedValue({ id: 'lsh-1' }),
        },
      };

      const mockPrisma: any = {
        $transaction: jest.fn().mockImplementation((cb) => cb(mockTx)),
      };

      const demoService = new DemoService(
        mockPrisma as any,
        { recordInTx: jest.fn() } as any,
        { nextIdInTx: jest.fn() } as any,
        { hasPermissions: jest.fn().mockResolvedValue(true) } as any,
        { add: jest.fn() } as any,
      );

      await demoService.completeDemo(
        'demo-comp-1',
        {
          rating: 5,
          comments: 'Exceptional student performance and engagement',
          recommendationPlan: '4-week acceleration plan',
          recommendedClassCount: 8,
          recommendedFrequency: '2 classes/week',
          learningGoal: 'Master algebra',
          targetChapters: 'Chapters 1-3',
          studyApproach: 'Concept walkthrough',
          milestones: 'Week 4 test',
        },
        { id: 'tutor-1' } as any
      );

      // Verify gate and post-demo updates
      expect(mockTx.demoFeedbackRecord.upsert).toHaveBeenCalled();
      expect(mockTx.demoRoadmap.upsert).toHaveBeenCalled();
      expect(mockTx.demoAcademicPlan.upsert).toHaveBeenCalled();
      expect(mockTx.demoBooking.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'demo-comp-1' },
          data: expect.objectContaining({ status: DemoBookingStatus.COMPLETED }),
        })
      );
      // Verify atomic lead status transition
      expect(mockTx.lead.update).toHaveBeenCalledWith({
        where: { id: 'lead-comp-1' },
        data: { status: LeadStatus.DEMO_COMPLETED },
      });
      expect(mockTx.leadStatusHistory.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            leadId: 'lead-comp-1',
            oldStatus: LeadStatus.DEMO_BOOKED,
            newStatus: LeadStatus.DEMO_COMPLETED,
          }),
        })
      );
    });
  });

  describe('Tutor Assignment & Rescheduling Overlap Safeguards', () => {
    it('successfully assigns a tutor without self-overlap false-positive against its own session', async () => {
      const { demoService, mockTx, mockRbac } = buildMockContext(['demo.manage_team']);
      mockRbac.hasPermissions = jest.fn().mockResolvedValue(true);

      const demoId = 'demo-dmo-14';
      const scheduledStart = new Date(Date.now() + 86400000);
      const scheduledEnd = new Date(scheduledStart.getTime() + 60 * 60000);

      mockTx.demo.findUnique = jest.fn().mockResolvedValue({
        id: demoId,
        studentId: 'student-1',
        scheduledAt: scheduledStart,
        durationMinutes: 60,
        status: DemoStatus.SCHEDULED,
        tutorId: null,
      });

      mockTx.demoBooking.findFirst = jest.fn().mockResolvedValue({
        id: demoId,
        studentId: 'student-1',
        coordinatorId: 'coord-1',
        preparationNotes: 'Instructions for demo class exceeding 15 chars',
        status: DemoBookingStatus.SCHEDULED,
      });

      // The booking's own session is returned by findMany when querying demoSession
      mockTx.demoSession.findMany = jest.fn().mockImplementation(({ where }: any) => {
        // When checking allSessions for booking stage transition
        if (where?.bookingId === demoId) {
          return Promise.resolve([
            {
              id: 'session-dmo-14',
              bookingId: demoId,
              scheduledStart,
              scheduledEnd,
              status: DemoSessionStatus.SCHEDULED,
              tutorAssignments: [{ id: 'ta-1', status: 'ACTIVE' }],
            },
          ]);
        }
        // If booking id is properly excluded, the query returns 0 sessions (or only other bookings' sessions)
        if (where?.booking?.id?.not === demoId || where?.booking?.AND) {
          return Promise.resolve([]);
        }
        // If not excluded, it would return the session itself and trigger false-positive
        return Promise.resolve([
          {
            id: 'session-dmo-14',
            bookingId: demoId,
            scheduledStart,
            scheduledEnd,
            status: DemoSessionStatus.SCHEDULED,
            tutorAssignments: [],
          },
        ]);
      });

      mockTx.demo.update = jest.fn().mockResolvedValue({ id: demoId, status: DemoStatus.ASSIGNED, tutorId: 'tutor-1' });
      mockTx.demoBooking.updateMany = jest.fn().mockResolvedValue({ count: 1 });
      mockTx.auditLog = { create: jest.fn().mockResolvedValue({}) };

      const result = await demoService.assignTutor(demoId, { tutorId: 'tutor-1' }, { id: 'coord-1' } as any);
      expect(result).toBeDefined();
      expect(result.status).toBe(DemoStatus.ASSIGNED);
    });

    it('rejects tutor assignment if student has an overlapping session in another booking', async () => {
      const { demoService, mockTx, mockRbac } = buildMockContext(['demo.manage_team']);
      mockRbac.hasPermissions = jest.fn().mockResolvedValue(true);

      const demoId = 'demo-dmo-14';
      const scheduledStart = new Date(Date.now() + 86400000);
      const scheduledEnd = new Date(scheduledStart.getTime() + 60 * 60000);

      mockTx.demo.findUnique = jest.fn().mockResolvedValue({
        id: demoId,
        studentId: 'student-1',
        scheduledAt: scheduledStart,
        durationMinutes: 60,
        status: DemoStatus.SCHEDULED,
        tutorId: null,
      });

      mockTx.demoBooking.findFirst = jest.fn().mockResolvedValue({
        id: demoId,
        studentId: 'student-1',
        coordinatorId: 'coord-1',
        preparationNotes: 'Instructions for demo class exceeding 15 chars',
        status: DemoBookingStatus.SCHEDULED,
      });

      // Another session for the same student exists from a different booking at the same time
      mockTx.demoSession.findMany = jest.fn().mockResolvedValue([
        {
          id: 'session-other-booking',
          bookingId: 'other-booking-id',
          scheduledStart,
          scheduledEnd,
          status: DemoSessionStatus.SCHEDULED,
        },
      ]);

      await expect(
        demoService.assignTutor(demoId, { tutorId: 'tutor-1' }, { id: 'coord-1' } as any)
      ).rejects.toThrow('Student already has an overlapping demo session');
    });
  });
});
