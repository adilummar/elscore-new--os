import { ForbiddenException } from '@nestjs/common';

import { DemoService } from './demo.service';

describe('Demo lead ownership', () => {
  const future = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

  function serviceFor(permissions: string[]) {
    const tx: any = {
      $queryRaw: jest.fn().mockResolvedValue([]),
      requirement: { findUnique: jest.fn() },
      student: { findUnique: jest.fn() },
      demo: {
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn().mockResolvedValue({ id: 'demo-1' }),
      },
    };
    const prisma: any = {
      $transaction: jest.fn(async (fn: (client: any) => Promise<unknown>) => fn(tx)),
      demo: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const rbac = {
      hasPermissions: jest.fn((_userId: string, codes: string[]) => codes.every((code) => permissions.includes(code))),
    };
    const service = new DemoService(
      prisma,
      { recordInTx: jest.fn() } as any,
      { nextIdInTx: jest.fn().mockResolvedValue('DMO-0001') } as any,
      rbac as any,
      { add: jest.fn() } as any,
    );
    return { service, tx, prisma, rbac };
  }

  it('denies a counsellor booking a demo on another counsellor’s student', async () => {
    const { service, tx } = serviceFor(['demo.book', 'demo.read']);
    tx.requirement.findUnique.mockResolvedValue({
      studentId: 'student-b',
      subjectId: 'math',
      curriculumId: 'cbse',
      gradeId: 'grade-5',
      student: { lead: { assignedToUserId: 'counsellor-b' } },
    });

    await expect(service.bookDemo({
      studentId: 'student-b',
      requirementId: 'req-b',
      scheduledAt: future,
      durationMinutes: 30,
    }, { id: 'counsellor-a', email: 'a@example.com' } as any)).rejects.toThrow(ForbiddenException);

    expect(tx.demo.create).not.toHaveBeenCalled();
  });

  it('lets a counsellor book a demo for their own lead and lets Sales Head book either', async () => {
    const own = serviceFor(['demo.book']);
    own.tx.requirement.findUnique.mockResolvedValue({
      studentId: 'student-a',
      subjectId: 'math',
      curriculumId: 'cbse',
      gradeId: 'grade-5',
      student: { lead: { assignedToUserId: 'counsellor-a' } },
    });
    await own.service.bookDemo({
      studentId: 'student-a',
      requirementId: 'req-a',
      scheduledAt: future,
      durationMinutes: 30,
    }, { id: 'counsellor-a', email: 'a@example.com' } as any);
    expect(own.tx.demo.create).toHaveBeenCalled();

    const head = serviceFor(['demo.manage_team']);
    head.tx.requirement.findUnique.mockResolvedValue({
      studentId: 'student-b',
      subjectId: 'math',
      curriculumId: 'cbse',
      gradeId: 'grade-5',
      student: { lead: { assignedToUserId: 'counsellor-b' } },
    });
    await head.service.bookDemo({
      studentId: 'student-b',
      requirementId: 'req-b',
      scheduledAt: future,
      durationMinutes: 30,
    }, { id: 'sales-head', email: 'head@example.com' } as any);
    expect(head.tx.demo.create).toHaveBeenCalled();
  });

  it('scopes the demo list to the caller’s assigned leads unless they manage the team', async () => {
    const counsellor = serviceFor(['demo.read']);
    await counsellor.service.getDemos({ id: 'counsellor-a', email: 'a@example.com' } as any);
    expect(counsellor.prisma.demo.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        student: { lead: { assignedToUserId: 'counsellor-a' } },
      },
    }));

    const head = serviceFor(['demo.manage_team']);
    await head.service.getDemos({ id: 'sales-head', email: 'head@example.com' } as any);
    expect(head.prisma.demo.findMany.mock.calls[0][0].where).toEqual({});
  });

  describe('Demo detail view scoping and multi-session attachment (getDemoById)', () => {
    const sampleDemo = {
      id: 'demo-123',
      businessId: 'DMO-0001',
      studentId: 'student-1',
      tutorId: null, // Unassigned demo
      status: 'SCHEDULED',
      scheduledAt: new Date('2026-10-20T10:00:00Z'),
      durationMinutes: 60,
      student: {
        id: 'student-1',
        firstName: 'Ahnas',
        lastName: 'PP',
        lead: { id: 'lead-1', assignedToUserId: 'counsellor-1' },
      },
      subject: { id: 'sub-1', name: 'History' },
      grade: { id: 'gr-8', name: 'Grade 8' },
      curriculum: { id: 'cur-1', name: 'CBSE' },
      requirement: { notes: 'Need focus on modern history' },
      tutor: null,
      feedback: [],
    };

    it('allows CEO / Coordinator with demo.manage_all to view unassigned demo without 403', async () => {
      // CEO has demo.manage_all, demo.manage_team, AND demo.read_assigned
      const ceo = serviceFor(['demo.manage_all', 'demo.manage_team', 'demo.read_assigned', 'demo.read']);
      (ceo.prisma.demo as any).findUnique = jest.fn().mockResolvedValue({ ...sampleDemo });
      (ceo.prisma as any).demoBooking = {
        findFirst: jest.fn().mockResolvedValue({
          id: 'demo-123',
          businessId: 'DMO-0001',
          sessions: [
            {
              id: 'sess-1',
              sessionOrder: 1,
              subject: { name: 'History' },
              grade: { name: 'Grade 8' },
              curriculum: { name: 'CBSE' },
              tutorAssignments: [],
            },
          ],
        }),
      };
      (ceo.prisma as any).auditEvent = { findMany: jest.fn().mockResolvedValue([]) };

      const result = await ceo.service.getDemoById('demo-123', { id: 'ceo-user', email: 'admin@elscore.internal' } as any);
      expect(result).toBeDefined();
      expect(result.id).toBe('demo-123');
      expect(result.businessId).toBe('DMO-0001');
      expect(result.booking).toBeDefined();
      expect(result.booking.sessions).toHaveLength(1);
    });

    it('allows Sales Head with demo.manage_team to view any demo', async () => {
      const head = serviceFor(['demo.manage_team', 'demo.read_assigned', 'demo.read']);
      (head.prisma.demo as any).findUnique = jest.fn().mockResolvedValue({ ...sampleDemo });
      (head.prisma as any).demoBooking = { findFirst: jest.fn().mockResolvedValue(null) };
      (head.prisma as any).auditEvent = { findMany: jest.fn().mockResolvedValue([]) };

      const result = await head.service.getDemoById('demo-123', { id: 'sales-head', email: 'head@elscore.internal' } as any);
      expect(result).toBeDefined();
      expect(result.id).toBe('demo-123');
    });

    it('allows assigned salesperson to view their lead demo', async () => {
      const counsellor = serviceFor(['demo.read', 'demo.read_own']);
      (counsellor.prisma.demo as any).findUnique = jest.fn().mockResolvedValue({ ...sampleDemo });
      (counsellor.prisma as any).demoBooking = { findFirst: jest.fn().mockResolvedValue(null) };
      (counsellor.prisma as any).auditEvent = { findMany: jest.fn().mockResolvedValue([]) };

      const result = await counsellor.service.getDemoById('demo-123', { id: 'counsellor-1', email: 'sales1@elscore.internal' } as any);
      expect(result).toBeDefined();
      expect(result.id).toBe('demo-123');
    });

    it('denies a salesperson viewing another counsellor demo with 403', async () => {
      const otherCounsellor = serviceFor(['demo.read', 'demo.read_own']);
      (otherCounsellor.prisma.demo as any).findUnique = jest.fn().mockResolvedValue({ ...sampleDemo });
      (otherCounsellor.prisma as any).demoBooking = { findFirst: jest.fn().mockResolvedValue(null) };
      (otherCounsellor.prisma as any).auditEvent = { findMany: jest.fn().mockResolvedValue([]) };

      await expect(
        otherCounsellor.service.getDemoById('demo-123', { id: 'counsellor-2', email: 'sales2@elscore.internal' } as any)
      ).rejects.toThrow(ForbiddenException);
    });

    it('allows assigned tutor to view legacy demo where tutorId matches', async () => {
      const tutor = serviceFor(['demo.read_assigned']);
      (tutor.prisma.demo as any).findUnique = jest.fn().mockResolvedValue({
        ...sampleDemo,
        tutorId: 'tutor-1',
        tutor: { id: 'tutor-1', email: 'tutor@elscore.internal', employee: { firstName: 'Sarah', lastName: 'Ali' } },
      });
      (tutor.prisma as any).demoBooking = { findFirst: jest.fn().mockResolvedValue(null) };
      (tutor.prisma as any).auditEvent = { findMany: jest.fn().mockResolvedValue([]) };

      const result = await tutor.service.getDemoById('demo-123', { id: 'tutor-1', email: 'tutor@elscore.internal' } as any);
      expect(result).toBeDefined();
      expect(result.tutor.firstName).toBe('Sarah');
      expect(result.tutor.lastName).toBe('Ali');
    });

    it('allows assigned tutor on multi-session booking where assigned in a session', async () => {
      const tutor = serviceFor(['demo.read_assigned']);
      (tutor.prisma.demo as any).findUnique = jest.fn().mockResolvedValue({
        ...sampleDemo,
        tutorId: 'other-tutor', // Primary session had a different tutor
      });
      (tutor.prisma as any).demoBooking = {
        findFirst: jest.fn().mockResolvedValue({
          id: 'demo-123',
          businessId: 'DMO-0001',
          sessions: [
            {
              id: 'sess-1',
              sessionOrder: 1,
              tutorAssignments: [{ tutorId: 'other-tutor', status: 'ACTIVE' }],
            },
            {
              id: 'sess-2',
              sessionOrder: 2,
              tutorAssignments: [{ tutorId: 'tutor-2', status: 'ACTIVE' }],
            },
          ],
        }),
      };
      (tutor.prisma as any).auditEvent = { findMany: jest.fn().mockResolvedValue([]) };

      const result = await tutor.service.getDemoById('demo-123', { id: 'tutor-2', email: 'tutor2@elscore.internal' } as any);
      expect(result).toBeDefined();
    });

    it('denies unassigned tutor with 403', async () => {
      const tutor = serviceFor(['demo.read_assigned']);
      (tutor.prisma.demo as any).findUnique = jest.fn().mockResolvedValue({
        ...sampleDemo,
        tutorId: 'other-tutor',
      });
      (tutor.prisma as any).demoBooking = { findFirst: jest.fn().mockResolvedValue(null) };
      (tutor.prisma as any).auditEvent = { findMany: jest.fn().mockResolvedValue([]) };

      await expect(
        tutor.service.getDemoById('demo-123', { id: 'unassigned-tutor', email: 'unassigned@elscore.internal' } as any)
      ).rejects.toThrow(ForbiddenException);
    });

    it('handles null optional relations safely without crashing', async () => {
      const ceo = serviceFor(['demo.manage_all']);
      (ceo.prisma.demo as any).findUnique = jest.fn().mockResolvedValue({
        id: 'demo-minimal',
        businessId: 'DMO-MIN',
        studentId: 'student-null',
        tutorId: null,
        status: 'SCHEDULED',
        scheduledAt: new Date(),
        durationMinutes: 45,
        student: { id: 'student-null', firstName: null, lastName: null, lead: null }, // Null lead
        subject: null,
        grade: null,
        curriculum: null,
        requirement: null,
        tutor: null,
        feedback: [],
      });
      (ceo.prisma as any).demoBooking = { findFirst: jest.fn().mockResolvedValue(null) };
      (ceo.prisma as any).auditEvent = { findMany: jest.fn().mockResolvedValue([]) };

      const result = await ceo.service.getDemoById('demo-minimal', { id: 'ceo-user', email: 'admin@elscore.internal' } as any);
      expect(result).toBeDefined();
      expect(result.id).toBe('demo-minimal');
      expect(result.tutor).toBeNull();
      expect(result.student).toEqual({ id: 'student-null', firstName: null, lastName: null });
    });

    it('successfully opens DMO-0004 (969bae7f-da35-4b13-b86a-5a77f2c3c35c) for CEO', async () => {
      const ceo = serviceFor(['demo.book', 'demo.read', 'demo.manage_all', 'demo.manage_team', 'demo.read_assigned', 'demo.assign_tutor', 'demo.complete']);
      (ceo.prisma.demo as any).findUnique = jest.fn().mockResolvedValue({
        id: '969bae7f-da35-4b13-b86a-5a77f2c3c35c',
        businessId: 'DMO-0004',
        studentId: 'student-4',
        tutorId: null,
        status: 'SCHEDULED',
        scheduledAt: new Date('2026-09-23T09:07:00Z'),
        durationMinutes: 60,
        student: { id: 'student-4', firstName: 'John', lastName: 'Doe', lead: { id: 'lead-4', assignedToUserId: 'sales-1' } },
        subject: { id: 'sub-1', name: 'Mathematics' },
        grade: { id: 'gr-6', name: 'Grade 6' },
        curriculum: { id: 'cur-1', name: 'IB' },
        requirement: { notes: 'Needs algebra support' },
        tutor: null,
        feedback: [],
      });
      (ceo.prisma as any).demoBooking = {
        findFirst: jest.fn().mockResolvedValue({
          id: '969bae7f-da35-4b13-b86a-5a77f2c3c35c',
          businessId: 'DMO-0004',
          sessions: [
            {
              id: 'sess-4',
              sessionOrder: 1,
              subject: { name: 'Mathematics' },
              grade: { name: 'Grade 6' },
              curriculum: { name: 'IB' },
              tutorAssignments: [],
            },
          ],
        }),
      };
      (ceo.prisma as any).auditEvent = { findMany: jest.fn().mockResolvedValue([]) };

      const res = await ceo.service.getDemoById('969bae7f-da35-4b13-b86a-5a77f2c3c35c', { id: 'ceo-1', email: 'admin@elscore.internal' } as any);
      expect(res).toBeDefined();
      expect(res.businessId).toBe('DMO-0004');
      expect(res.booking?.sessions).toHaveLength(1);
    });

    it('returns NotFoundException when demo ID does not exist in demo or booking tables', async () => {
      const ceo = serviceFor(['demo.manage_all']);
      (ceo.prisma.demo as any).findUnique = jest.fn().mockResolvedValue(null);
      (ceo.prisma as any).demoBooking = { findFirst: jest.fn().mockResolvedValue(null) };

      await expect(
        ceo.service.getDemoById('non-existent-id', { id: 'ceo-1', email: 'admin@elscore.internal' } as any)
      ).rejects.toThrow('Demo not found');
    });

    it('enforces CEO God View target scoping when target is a restricted salesperson', async () => {
      // In God View targeting sales-2, the effective caller is sales-2 who does NOT own lead-4
      const restrictedSales = serviceFor(['demo.read', 'demo.read_own']);
      (restrictedSales.prisma.demo as any).findUnique = jest.fn().mockResolvedValue({
        id: '969bae7f-da35-4b13-b86a-5a77f2c3c35c',
        businessId: 'DMO-0004',
        studentId: 'student-4',
        tutorId: null,
        status: 'SCHEDULED',
        scheduledAt: new Date('2026-09-23T09:07:00Z'),
        durationMinutes: 60,
        student: { id: 'student-4', firstName: 'John', lastName: 'Doe', lead: { id: 'lead-4', assignedToUserId: 'sales-1' } },
      });
      (restrictedSales.prisma as any).demoBooking = { findFirst: jest.fn().mockResolvedValue(null) };
      (restrictedSales.prisma as any).auditEvent = { findMany: jest.fn().mockResolvedValue([]) };

      await expect(
        restrictedSales.service.getDemoById('969bae7f-da35-4b13-b86a-5a77f2c3c35c', { id: 'sales-2', email: 'sales2@elscore.internal' } as any)
      ).rejects.toThrow(ForbiddenException);
    });
  });
});
