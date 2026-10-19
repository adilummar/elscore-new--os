import { BadRequestException } from '@nestjs/common';
import { LeadStatus, DemoBookingStatus, DemoSessionStatus } from '@prisma/client';
import { v5 as uuidv5 } from 'uuid';

import { buildDefaultSessionRows } from './demo-requirement-autofill.helper';
import { DemoService } from './demo.service';
import { DEMO_BACKFILL_NAMESPACE } from './backfill/demo-backfill.service';

describe('Demo Module — Requirement Autofill & Multi-Session Booking', () => {
  const futureDate = new Date(Date.now() + 24 * 60 * 60 * 1000);
  const futureIso = futureDate.toISOString();
  const futureIso2 = new Date(futureDate.getTime() + 60 * 60 * 1000).toISOString();
  const futureIso3 = new Date(futureDate.getTime() + 120 * 60 * 1000).toISOString();

  describe('Autofill Session Rows Unit Logic', () => {
    it('1 Requirement -> generates exactly 1 preselected session with matching subjectId and requirementId', () => {
      const requirements = [
        {
          id: 'req-math-01',
          subjectId: 'sub-math-uuid',
          subject: { id: 'sub-math-uuid', name: 'Mathematics' },
          curriculumId: 'cur-cbse',
          gradeId: 'grd-10',
        },
      ];

      const sessions = buildDefaultSessionRows(requirements);

      expect(sessions).toHaveLength(1);
      expect(sessions[0]).toEqual({
        subjectId: 'sub-math-uuid',
        requirementId: 'req-math-01',
        startTime: '10:00',
        endTime: '11:00',
      });
    });

    it('Multiple Requirements -> all populated into distinct sessions with non-overlapping default time ranges', () => {
      const requirements = [
        {
          id: 'req-math-01',
          subjectId: 'sub-math-uuid',
          subject: { id: 'sub-math-uuid', name: 'Mathematics' },
        },
        {
          id: 'req-phys-02',
          subjectId: 'sub-phys-uuid',
          subject: { id: 'sub-phys-uuid', name: 'Physics' },
        },
        {
          id: 'req-chem-03',
          subjectId: 'sub-chem-uuid',
          subject: { id: 'sub-chem-uuid', name: 'Chemistry' },
        },
      ];

      const sessions = buildDefaultSessionRows(requirements);

      expect(sessions).toHaveLength(3);
      expect(sessions[0]).toEqual({
        subjectId: 'sub-math-uuid',
        requirementId: 'req-math-01',
        startTime: '10:00',
        endTime: '11:00',
      });
      expect(sessions[1]).toEqual({
        subjectId: 'sub-phys-uuid',
        requirementId: 'req-phys-02',
        startTime: '11:00',
        endTime: '12:00',
      });
      expect(sessions[2]).toEqual({
        subjectId: 'sub-chem-uuid',
        requirementId: 'req-chem-03',
        startTime: '12:00',
        endTime: '13:00',
      });
    });

    it('Deduplicates multiple requirements for the same subject to prevent duplicate sessions', () => {
      const requirements = [
        {
          id: 'req-math-01',
          subjectId: 'sub-math-uuid',
          subject: { id: 'sub-math-uuid', name: 'Mathematics' },
        },
        {
          id: 'req-math-dup',
          subjectId: 'sub-math-uuid',
          subject: { id: 'sub-math-uuid', name: 'Mathematics Advanced' },
        },
      ];

      const sessions = buildDefaultSessionRows(requirements);

      expect(sessions).toHaveLength(1);
      expect(sessions[0].subjectId).toBe('sub-math-uuid');
      expect(sessions[0].requirementId).toBe('req-math-01');
    });

    it('0 Requirements / empty array -> returns a clean, unpopulated session row with default times', () => {
      const sessions = buildDefaultSessionRows([]);

      expect(sessions).toHaveLength(1);
      expect(sessions[0]).toEqual({
        subjectId: '',
        requirementId: '',
        startTime: '10:00',
        endTime: '11:00',
      });
    });

    it('Manual subject addition preserves existing populated sessions and appends next non-overlapping slot', () => {
      const requirements = [
        {
          id: 'req-math-01',
          subjectId: 'sub-math-uuid',
        },
      ];

      const initialSessions = buildDefaultSessionRows(requirements);
      expect(initialSessions).toHaveLength(1);

      // Simulate adding another subject row manually
      const lastSession = initialSessions[initialSessions.length - 1];
      const nextStart = lastSession.endTime;
      const [h, m] = nextStart.split(':').map(Number);
      const nextEnd = `${(h + 1).toString().padStart(2, '0')}:${(m || 0).toString().padStart(2, '0')}`;

      const expandedSessions = [
        ...initialSessions,
        { subjectId: 'sub-bio-uuid', requirementId: '', startTime: nextStart, endTime: nextEnd },
      ];

      expect(expandedSessions).toHaveLength(2);
      expect(expandedSessions[0]).toEqual(initialSessions[0]);
      expect(expandedSessions[1]).toEqual({
        subjectId: 'sub-bio-uuid',
        requirementId: '',
        startTime: '11:00',
        endTime: '12:00',
      });
    });

    it('Switching students updates the session list from Student A requirements to Student B requirements', () => {
      const studentA = {
        id: 'student-A',
        requirements: [
          { id: 'req-a1', subjectId: 'sub-math' },
          { id: 'req-a2', subjectId: 'sub-phys' },
        ],
      };
      const studentB = {
        id: 'student-B',
        requirements: [{ id: 'req-b1', subjectId: 'sub-biology' }],
      };

      const sessionsA = buildDefaultSessionRows(studentA.requirements);
      expect(sessionsA).toHaveLength(2);
      expect(sessionsA[0].subjectId).toBe('sub-math');
      expect(sessionsA[1].subjectId).toBe('sub-phys');

      // User switches to Student B
      const sessionsB = buildDefaultSessionRows(studentB.requirements);
      expect(sessionsB).toHaveLength(1);
      expect(sessionsB[0].subjectId).toBe('sub-biology');
      expect(sessionsB[0].requirementId).toBe('req-b1');
    });
  });

  describe('DemoService Booking with Auto-Populated Sessions', () => {
    function buildMockDemoService(leadStatus: LeadStatus = LeadStatus.INTERESTED) {
      const student = {
        id: 'student-test-01',
        leadId: 'lead-test-01',
        curriculumId: 'cur-cbse',
        gradeId: 'grd-10',
        lead: {
          id: 'lead-test-01',
          status: leadStatus,
          assignedToUserId: 'counsellor-01',
        },
        requirements: [
          {
            id: 'req-math-01',
            studentId: 'student-test-01',
            subjectId: 'sub-math-01',
            curriculumId: 'cur-cbse',
            gradeId: 'grd-10',
            subject: { id: 'sub-math-01', name: 'Math' },
            curriculum: { id: 'cur-cbse', name: 'CBSE' },
            grade: { id: 'grd-10', name: 'Grade 10' },
          },
          {
            id: 'req-phys-02',
            studentId: 'student-test-01',
            subjectId: 'sub-phys-02',
            curriculumId: 'cur-cbse',
            gradeId: 'grd-10',
            subject: { id: 'sub-phys-02', name: 'Physics' },
            curriculum: { id: 'cur-cbse', name: 'CBSE' },
            grade: { id: 'grd-10', name: 'Grade 10' },
          },
        ],
      };

      const mockTx: any = {
        $queryRaw: jest.fn().mockResolvedValue([]),
        student: {
          findUnique: jest.fn().mockImplementation(({ where }: any) => {
            if (where?.id === student.id) {
              return Promise.resolve(student);
            }
            return Promise.resolve(null);
          }),
        },
        requirement: {
          findUnique: jest.fn().mockImplementation(({ where }: any) => {
            const req = student.requirements.find(r => r.id === where?.id);
            return Promise.resolve(req || null);
          }),
        },
        lead: {
          update: jest.fn().mockResolvedValue({ id: 'lead-test-01', status: LeadStatus.DEMO_BOOKED }),
        },
        leadStatusHistory: {
          create: jest.fn().mockResolvedValue({ id: 'lsh-1' }),
        },
        demoBooking: {
          findUnique: jest.fn().mockResolvedValue(null),
          create: jest.fn().mockImplementation((args: any) =>
            Promise.resolve({
              id: args.data?.id || 'dmo-booking-uuid',
              ...args.data,
              sessions: args.data?.sessions?.create || [],
            }),
          ),
          update: jest.fn().mockImplementation((args: any) =>
            Promise.resolve({
              id: args.where?.id || 'dmo-booking-uuid',
              ...args.data,
            }),
          ),
        },
        demoSession: {
          findMany: jest.fn().mockResolvedValue([]),
          create: jest.fn().mockImplementation((args: any) =>
            Promise.resolve({ id: `sess-${Math.random()}`, ...args.data }),
          ),
        },
        demo: {
          findMany: jest.fn().mockResolvedValue([]),
          create: jest.fn().mockImplementation((args: any) =>
            Promise.resolve({ id: `demo-leg-${Math.random()}`, ...args.data }),
          ),
        },
        roundRobinCoordinatorState: {
          findFirst: jest.fn().mockResolvedValue({
            userId: 'coord-01',
            currentLoad: 2,
          }),
          update: jest.fn().mockResolvedValue({ count: 1 }),
        },
        auditLog: {
          create: jest.fn().mockResolvedValue({ id: 'aud-1' }),
        },
      };

      const mockPrisma: any = {
        $transaction: jest.fn().mockImplementation(cb => cb(mockTx)),
      };

      const mockAudit: any = { recordInTx: jest.fn() };
      const mockIdGenerator: any = { nextIdInTx: jest.fn().mockResolvedValue('DMO-2026-0001') };
      const mockRbac: any = { hasPermissions: jest.fn().mockResolvedValue(true) };
      const mockQueue: any = { add: jest.fn() };

      const demoService = new DemoService(
        mockPrisma,
        mockAudit,
        mockIdGenerator,
        mockRbac,
        mockQueue,
      );

      return { demoService, mockTx, student };
    }

    it('Submitting booking with 1 auto-populated session succeeds against DemoService', async () => {
      const { demoService, mockTx } = buildMockDemoService(LeadStatus.INTERESTED);

      const user = { id: 'counsellor-01', email: 'counsellor@elscore.com' } as any;

      const result = await demoService.bookDemo(
        {
          studentId: 'student-test-01',
          sessions: [
            {
              sessionOrder: 1,
              requirementId: 'req-math-01',
              subjectId: 'sub-math-01',
              curriculumId: 'cur-cbse',
              gradeId: 'grd-10',
              scheduledStart: futureIso,
              scheduledEnd: futureIso2,
              durationMinutes: 60,
            },
          ],
        },
        user,
      );

      expect(result).toBeDefined();
      expect(mockTx.$queryRaw).toHaveBeenCalled(); // student lock
      expect(mockTx.lead.update).toHaveBeenCalledWith({
        where: { id: 'lead-test-01' },
        data: { status: LeadStatus.DEMO_BOOKED },
      });
      expect(mockTx.demoSession.create).toHaveBeenCalledTimes(1);
      expect(mockTx.demoSession.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            sessionOrder: 1,
            requirementId: 'req-math-01',
            subjectId: 'sub-math-01',
            durationMinutes: 60,
          }),
        }),
      );
    });

    it('Submitting booking with multiple auto-populated sessions succeeds and creates ordered non-overlapping sessions', async () => {
      const { demoService, mockTx } = buildMockDemoService(LeadStatus.INTERESTED);

      const user = { id: 'counsellor-01', email: 'counsellor@elscore.com' } as any;

      const result = await demoService.bookDemo(
        {
          studentId: 'student-test-01',
          sessions: [
            {
              sessionOrder: 1,
              requirementId: 'req-math-01',
              subjectId: 'sub-math-01',
              curriculumId: 'cur-cbse',
              gradeId: 'grd-10',
              scheduledStart: futureIso,
              scheduledEnd: futureIso2,
              durationMinutes: 60,
            },
            {
              sessionOrder: 2,
              requirementId: 'req-phys-02',
              subjectId: 'sub-phys-02',
              curriculumId: 'cur-cbse',
              gradeId: 'grd-10',
              scheduledStart: futureIso2,
              scheduledEnd: futureIso3,
              durationMinutes: 60,
            },
          ],
        },
        user,
      );

      expect(result).toBeDefined();
      expect(mockTx.demoSession.create).toHaveBeenCalledTimes(2);
      expect(mockTx.lead.update).toHaveBeenCalledWith({
        where: { id: 'lead-test-01' },
        data: { status: LeadStatus.DEMO_BOOKED },
      });
    });

    it('Rejects booking when session requirement does not belong to the student', async () => {
      const { demoService } = buildMockDemoService(LeadStatus.INTERESTED);

      const user = { id: 'counsellor-01', email: 'counsellor@elscore.com' } as any;

      await expect(
        demoService.bookDemo(
          {
            studentId: 'student-test-01',
            sessions: [
              {
                sessionOrder: 1,
                requirementId: 'req-alien-999',
                subjectId: 'sub-alien',
                curriculumId: 'cur-cbse',
                gradeId: 'grd-10',
                scheduledStart: futureIso,
                scheduledEnd: futureIso2,
                durationMinutes: 60,
              },
            ],
          },
          user,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('Rejects booking if lead status is not INTERESTED (e.g. NEW or CONTACTED)', async () => {
      const { demoService } = buildMockDemoService(LeadStatus.CONTACTED);

      const user = { id: 'counsellor-01', email: 'counsellor@elscore.com' } as any;

      await expect(
        demoService.bookDemo(
          {
            studentId: 'student-test-01',
            sessions: [
              {
                sessionOrder: 1,
                requirementId: 'req-math-01',
                subjectId: 'sub-math-01',
                curriculumId: 'cur-cbse',
                gradeId: 'grd-10',
                scheduledStart: futureIso,
                scheduledEnd: futureIso2,
                durationMinutes: 60,
              },
            ],
          },
          user,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('Preserves idempotency when repeating same idempotencyKey', async () => {
      const { demoService, mockTx } = buildMockDemoService(LeadStatus.INTERESTED);
      const idempotencyKey = 'idemp-autofill-test-001';
      const deterministicBookingId = uuidv5(idempotencyKey, DEMO_BACKFILL_NAMESPACE);

      mockTx.demoBooking.findUnique.mockResolvedValueOnce({
        id: deterministicBookingId,
        studentId: 'student-test-01',
        status: DemoBookingStatus.SCHEDULED,
        sessions: [{ id: 'sess-existing-1', sessionOrder: 1 }],
      });

      const user = { id: 'counsellor-01', email: 'counsellor@elscore.com' } as any;

      const result = await demoService.bookDemo(
        {
          idempotencyKey,
          studentId: 'student-test-01',
          sessions: [
            {
              sessionOrder: 1,
              requirementId: 'req-math-01',
              subjectId: 'sub-math-01',
              curriculumId: 'cur-cbse',
              gradeId: 'grd-10',
              scheduledStart: futureIso,
              scheduledEnd: futureIso2,
              durationMinutes: 60,
            },
          ],
        },
        user,
      );

      expect(result).toBeDefined();
      expect(result.id).toBe(deterministicBookingId);
      expect(mockTx.demoBooking.create).not.toHaveBeenCalled();
      expect(mockTx.lead.update).not.toHaveBeenCalled();
    });
  });
});
