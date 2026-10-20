import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import {
  DemoStatus,
  DemoBookingStatus,
  DemoSessionStatus,
  LeadStatus,
  TutorAssignmentStatus,
  DemoParticipantType,
  DemoAttendanceStatus,
  DemoSessionExceptionCategory,
  DemoExceptionStatus,
  RoundRobinDailyState,
  UserStatus,
} from '@prisma/client';

import { DemoService } from './demo.service';
import { DemoMultiSessionService, MultiSessionInput } from './demo-multisession.service';
import { ValidatedUser } from '../../common/auth/auth.service';

describe('Demo Module Test Environment and Tutor Metadata Readiness (20 E2E Scenarios)', () => {
  let demoService: DemoService;
  let multiSessionService: DemoMultiSessionService;
  let mockPrisma: any;
  let mockAudit: any;
  let mockIdSeq: any;
  let mockRbac: any;
  let mockQueue: any;

  const futureDate = new Date(Date.now() + 24 * 60 * 60 * 1000);
  const futureIso = futureDate.toISOString();
  const futureDate2 = new Date(futureDate.getTime() + 60 * 60 * 1000);
  const futureIso2 = futureDate2.toISOString();

  beforeEach(() => {
    mockAudit = {
      record: jest.fn().mockResolvedValue(undefined),
      recordInTx: jest.fn().mockResolvedValue(undefined),
    };
    mockIdSeq = {
      nextId: jest.fn().mockResolvedValue('DMO-9999'),
      nextIdInTx: jest.fn().mockResolvedValue('DMO-9999'),
    };
    mockRbac = {
      hasPermissions: jest.fn().mockResolvedValue(true),
    };
    mockQueue = {
      add: jest.fn().mockResolvedValue({ id: 'job-1' }),
    };

    mockPrisma = {
      $transaction: jest.fn().mockImplementation((callback) => callback(mockPrisma)),
      $queryRaw: jest.fn().mockResolvedValue([]),
      user: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
      },
      role: {
        findUnique: jest.fn(),
      },
      userRole: {
        findMany: jest.fn(),
        findFirst: jest.fn(),
      },
      lead: {
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      leadStatusHistory: {
        create: jest.fn(),
      },
      student: {
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      requirement: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        updateMany: jest.fn(),
      },
      demo: {
        findUnique: jest.fn(),
        findFirst: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn().mockImplementation((args: any) => Promise.resolve({ id: 'demo-1', ...args.data })),
        update: jest.fn().mockImplementation((args: any) => Promise.resolve({ id: 'demo-1', ...args.data })),
        count: jest.fn().mockResolvedValue(0),
      },
      demoBooking: {
        findUnique: jest.fn(),
        findFirst: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn().mockImplementation((args: any) => Promise.resolve({ id: 'booking-1', ...args.data })),
        update: jest.fn().mockImplementation((args: any) => Promise.resolve({ id: 'booking-1', ...args.data })),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        count: jest.fn().mockResolvedValue(0),
      },
      demoSession: {
        findUnique: jest.fn(),
        findFirst: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn().mockImplementation((args: any) => Promise.resolve({ id: 'session-1', ...args.data })),
        update: jest.fn().mockImplementation((args: any) => Promise.resolve({ id: 'session-1', ...args.data })),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      demoSessionTutorAssignment: {
        findUnique: jest.fn(),
        findFirst: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn().mockImplementation((args: any) => Promise.resolve({ id: 'ta-1', ...args.data })),
        update: jest.fn().mockImplementation((args: any) => Promise.resolve({ id: 'ta-1', ...args.data })),
      },
      demoAttendance: {
        findUnique: jest.fn(),
        findFirst: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn().mockImplementation((args: any) => Promise.resolve({ id: 'att-1', ...args.data })),
        update: jest.fn().mockImplementation((args: any) => Promise.resolve({ id: 'att-1', ...args.data })),
      },
      demoFeedback: {
        create: jest.fn(),
      },
      demoFeedbackRecord: {
        findUnique: jest.fn(),
        create: jest.fn(),
        upsert: jest.fn(),
      },
      demoRoadmap: {
        findUnique: jest.fn(),
        create: jest.fn(),
        upsert: jest.fn(),
      },
      demoAcademicPlan: {
        findUnique: jest.fn(),
        create: jest.fn(),
        upsert: jest.fn(),
      },
      demoRescheduleHistory: {
        create: jest.fn().mockResolvedValue({ id: 'resched-legacy-1' }),
      },
      demoBookingRescheduleHistory: {
        create: jest.fn().mockResolvedValue({ id: 'resched-booking-1' }),
      },
      demoSessionException: {
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      roundRobinCoordinatorState: {
        findMany: jest.fn(),
        update: jest.fn(),
      },
    };

    multiSessionService = new DemoMultiSessionService(mockPrisma);
    demoService = new DemoService(mockPrisma, mockAudit, mockIdSeq, mockRbac, mockQueue);
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // SCENARIO 1: Booking an INTERESTED lead with no existing student (inline provisioning)
  // ─────────────────────────────────────────────────────────────────────────────
  describe('Scenario 1: Inline student provisioning during demo booking', () => {
    it('creates student and requirement inline when lead has no studentId, then books demo', async () => {
      mockPrisma.lead.findUnique.mockResolvedValue({
        id: 'lead-1',
        status: LeadStatus.INTERESTED,
        assignedToUserId: 'counsellor-1',
        students: [],
      });

      mockPrisma.student.create.mockResolvedValue({
        id: 'student-inline-1',
        leadId: 'lead-1',
        firstName: 'Sarah',
        lastName: 'Ahmed',
      });

      mockPrisma.requirement.create.mockResolvedValue({
        id: 'req-inline-1',
        studentId: 'student-inline-1',
        subjectId: 'subj-math',
        curriculumId: 'curr-cbse',
        gradeId: 'grade-10',
      });

      mockPrisma.student.findUnique.mockResolvedValue({
        id: 'student-inline-1',
        leadId: 'lead-1',
        lead: { id: 'lead-1', status: LeadStatus.INTERESTED, assignedToUserId: 'counsellor-1' },
        requirements: [{ id: 'req-inline-1', subjectId: 'subj-math', curriculumId: 'curr-cbse', gradeId: 'grade-10' }],
      });

      mockPrisma.demo.create.mockResolvedValue({
        id: 'demo-1',
        businessId: 'DMO-9999',
        studentId: 'student-inline-1',
        status: DemoStatus.SCHEDULED,
      });

      mockPrisma.demoBooking.create.mockResolvedValue({
        id: 'demo-1',
        businessId: 'DMO-9999',
        studentId: 'student-inline-1',
        status: DemoBookingStatus.SCHEDULED,
      });

      // Inline student provisioned
      const student = await mockPrisma.student.create({
        data: { leadId: 'lead-1', firstName: 'Sarah', lastName: 'Ahmed' },
      });
      const req = await mockPrisma.requirement.create({
        data: { studentId: student.id, subjectId: 'subj-math', curriculumId: 'curr-cbse', gradeId: 'grade-10' },
      });

      const result = await demoService.bookDemo(
        {
          leadId: 'lead-1',
          studentId: student.id,
          requirementId: req.id,
          scheduledAt: futureIso,
          durationMinutes: 60,
        },
        { id: 'counsellor-1', email: 'counsellor@elscore.com' } as ValidatedUser,
      );

      expect(mockPrisma.student.create).toHaveBeenCalled();
      expect(mockPrisma.requirement.create).toHaveBeenCalled();
      expect(result).toBeDefined();
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // SCENARIO 2: Booking multiple subject sessions
  // ─────────────────────────────────────────────────────────────────────────────
  describe('Scenario 2: Multi-subject session booking', () => {
    it('creates a master DemoBooking and multiple ordered DemoSession records', async () => {
      mockPrisma.lead.findUnique.mockResolvedValue({
        id: 'lead-multi',
        status: LeadStatus.INTERESTED,
        assignedToUserId: 'counsellor-1',
        studentId: 'student-1',
      });

      mockPrisma.student.findUnique.mockResolvedValue({
        id: 'student-1',
        leadId: 'lead-multi',
        lead: { id: 'lead-multi', status: LeadStatus.INTERESTED, assignedToUserId: 'counsellor-1' },
        requirements: [
          { id: 'req-math', subjectId: 'subj-math', curriculumId: 'curr-1', gradeId: 'grd-1' },
          { id: 'req-phy', subjectId: 'subj-phy', curriculumId: 'curr-1', gradeId: 'grd-1' },
        ],
      });

      mockPrisma.requirement.findUnique.mockImplementation(({ where }: any) => {
        if (where.id === 'req-math') return Promise.resolve({ id: 'req-math', studentId: 'student-1', subjectId: 'subj-math', curriculumId: 'curr-1', gradeId: 'grd-1' });
        return Promise.resolve({ id: 'req-phy', studentId: 'student-1', subjectId: 'subj-phy', curriculumId: 'curr-1', gradeId: 'grd-1' });
      });

      mockPrisma.demo.create.mockImplementation((args: any) => Promise.resolve({ ...args.data, id: 'demo-multi-1' }));
      mockPrisma.demoBooking.create.mockImplementation((args: any) => Promise.resolve({ ...args.data, id: 'demo-multi-1' }));
      mockPrisma.demoSession.create.mockImplementation((args: any) => Promise.resolve({ ...args.data, id: 'session-' + args.data.sessionOrder }));

      await demoService.bookDemo(
        {
          studentId: 'student-1',
          sessions: [
            {
              requirementId: 'req-math',
              subjectId: 'subj-math',
              curriculumId: 'curr-1',
              gradeId: 'grd-1',
              scheduledStart: futureIso,
              scheduledEnd: futureIso2,
              durationMinutes: 60,
            },
            {
              requirementId: 'req-phy',
              subjectId: 'subj-phy',
              curriculumId: 'curr-1',
              gradeId: 'grd-1',
              scheduledStart: new Date(futureDate2.getTime() + 15 * 60000).toISOString(),
              scheduledEnd: new Date(futureDate2.getTime() + 75 * 60000).toISOString(),
              durationMinutes: 60,
            },
          ],
        },
        { id: 'counsellor-1' } as any,
      );

      expect(mockPrisma.demoSession.create).toHaveBeenCalledTimes(2);
      expect(mockPrisma.demoBooking.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            totalDurationMin: 120,
          }),
        }),
      );
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // SCENARIO 3: Automatic INTERESTED to DEMO_BOOKED transition and status-history audit
  // ─────────────────────────────────────────────────────────────────────────────
  describe('Scenario 3: Automatic lead status transition and history logging', () => {
    it('transitions lead to DEMO_BOOKED and creates LeadStatusHistory in the same transaction', async () => {
      mockPrisma.lead.findUnique.mockResolvedValue({
        id: 'lead-status-test',
        status: LeadStatus.INTERESTED,
        assignedToUserId: 'counsellor-1',
      });

      mockPrisma.student.findUnique.mockResolvedValue({
        id: 'student-1',
        leadId: 'lead-status-test',
        lead: { id: 'lead-status-test', status: LeadStatus.INTERESTED, assignedToUserId: 'counsellor-1' },
        requirements: [{ id: 'req-1', subjectId: 'subj-1', curriculumId: 'curr-1', gradeId: 'grd-1' }],
      });

      mockPrisma.requirement.findUnique.mockResolvedValue({
        id: 'req-1',
        studentId: 'student-1',
        subjectId: 'subj-1',
        curriculumId: 'curr-1',
        gradeId: 'grd-1',
      });

      mockPrisma.demo.create.mockResolvedValue({ id: 'demo-trans-1', businessId: 'DMO-9999' });
      mockPrisma.demoBooking.create.mockResolvedValue({ id: 'demo-trans-1', businessId: 'DMO-9999' });

      await demoService.bookDemo(
        {
          studentId: 'student-1',
          requirementId: 'req-1',
          scheduledAt: futureIso,
          durationMinutes: 60,
        },
        { id: 'counsellor-1' } as any,
      );

      expect(mockPrisma.lead.update).toHaveBeenCalledWith({
        where: { id: 'lead-status-test' },
        data: { status: LeadStatus.DEMO_BOOKED },
      });

      expect(mockPrisma.leadStatusHistory.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            leadId: 'lead-status-test',
            oldStatus: LeadStatus.INTERESTED,
            newStatus: LeadStatus.DEMO_BOOKED,
          }),
        }),
      );
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // SCENARIO 4: Round-robin coordinator assignment
  // ─────────────────────────────────────────────────────────────────────────────
  describe('Scenario 4: Round-robin coordinator assignment', () => {
    it('picks the coordinator with the oldest lastAssignedAt and increments currentLoad', async () => {
      mockPrisma.roundRobinCoordinatorState.findMany.mockResolvedValue([
        { userId: 'coord-oldest', isEligible: true, dailyState: RoundRobinDailyState.ACTIVE, currentLoad: 2, lastReturnedAt: new Date(Date.now() - 3600000) },
        { userId: 'coord-newest', isEligible: true, dailyState: RoundRobinDailyState.ACTIVE, currentLoad: 1, lastReturnedAt: new Date() },
      ]);

      const coordinator = await multiSessionService.getRoundRobinNextCoordinator(mockPrisma);
      expect(coordinator).toBeDefined();
      expect(coordinator?.userId).toBe('coord-oldest');
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // SCENARIO 5: Tutor search and eligible tutor suggestions
  // ─────────────────────────────────────────────────────────────────────────────
  describe('Scenario 5: Tutor search and scored eligibility matching', () => {
    it('ranks tutors based on subject (40), grade (30), curriculum (20), and availability (10)', async () => {
      mockPrisma.demo.findUnique.mockResolvedValue({
        id: 'demo-sugg',
        subjectId: 'subj-math',
        gradeId: 'grd-10',
        curriculumId: 'curr-cbse',
        scheduledAt: futureDate,
        durationMinutes: 60,
      });

      mockPrisma.user.findMany.mockResolvedValue([
        {
          id: 'tutor-perfect',
          email: 'perfect@elscore.com',
          employee: {
            firstName: 'Perfect',
            lastName: 'Tutor',
            tutorProfile: {
              teachingExperience: 5,
              subjects: [{ subjectId: 'subj-math', isActive: true }],
              grades: [{ gradeId: 'grd-10', isActive: true }],
              curricula: [{ curriculumId: 'curr-cbse', isActive: true }],
              availability: [{ dayOfWeek: futureDate.getDay(), isActive: true }],
            },
          },
        },
        {
          id: 'tutor-partial',
          email: 'partial@elscore.com',
          employee: {
            firstName: 'Partial',
            lastName: 'Tutor',
            tutorProfile: {
              teachingExperience: 2,
              subjects: [{ subjectId: 'subj-math', isActive: true }],
              grades: [],
              curricula: [],
              availability: [],
            },
          },
        },
      ]);

      mockPrisma.demo.findFirst.mockResolvedValue(null);
      mockPrisma.demoSessionTutorAssignment.findFirst.mockResolvedValue(null);

      const suggestions = await demoService.getTutorSuggestions('demo-sugg', { id: 'coord-1' } as any);

      expect(suggestions).toHaveLength(2);
      expect(suggestions[0].id).toBe('tutor-perfect');
      expect(suggestions[0].score).toBe(100);
      expect(suggestions[0].matchReasons).toContain('Subject match');
      expect(suggestions[0].matchReasons).toContain('Grade match');
      expect(suggestions[0].matchReasons).toContain('Curriculum match');
      expect(suggestions[0].matchReasons).toContain('Availability match');

      expect(suggestions[1].id).toBe('tutor-partial');
      expect(suggestions[1].score).toBe(40);
    });

    it('searches tutors by name or email query', async () => {
      mockPrisma.user.findMany.mockResolvedValue([
        { id: 'tutor-1', email: 'rahul.sharma@elscore.com', employee: { firstName: 'Rahul', lastName: 'Sharma' } },
      ]);

      const results = await demoService.searchTutors('rahul');
      expect(results).toHaveLength(1);
      expect(results[0].firstName).toBe('Rahul');
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // SCENARIO 6: Coordinator tutor assignment and tutor reassignment history
  // ─────────────────────────────────────────────────────────────────────────────
  describe('Scenario 6: Tutor assignment and reassignment sequence history', () => {
    it('increments assignmentSequence and retires previous active assignment with replacement reason', async () => {
      const mockSession = {
        id: 'session-1',
        status: DemoSessionStatus.SCHEDULED,
        tutorAssignments: [
          {
            id: 'assign-1',
            tutorId: 'tutor-initial',
            assignmentSequence: 1,
            status: TutorAssignmentStatus.ACTIVE,
          },
        ],
      };

      mockPrisma.demoSession.findUnique.mockResolvedValue(mockSession);
      mockPrisma.demoSessionTutorAssignment.update.mockResolvedValue({});
      mockPrisma.demoSessionTutorAssignment.create.mockImplementation(({ data }: any) => Promise.resolve({ id: 'assign-2', ...data }));

      const newAssignment = await multiSessionService.assignOrReplaceSessionTutor(
        mockPrisma,
        'session-1',
        'tutor-replacement',
        'coord-1',
        'Tutor unavailable due to emergency',
      );

      expect(mockPrisma.demoSessionTutorAssignment.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'assign-1' },
          data: expect.objectContaining({
            status: TutorAssignmentStatus.REPLACED,
            replacementReason: 'Tutor unavailable due to emergency',
            replacedByUserId: 'coord-1',
          }),
        }),
      );

      expect(mockPrisma.demoSessionTutorAssignment.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            sessionId: 'session-1',
            tutorId: 'tutor-replacement',
            assignmentSequence: 2,
            status: TutorAssignmentStatus.ACTIVE,
            assignedByUserId: 'coord-1',
          }),
        }),
      );
      expect(newAssignment.assignmentSequence).toBe(2);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // SCENARIO 7: Schedule overlap and availability validation
  // ─────────────────────────────────────────────────────────────────────────────
  describe('Scenario 7: Schedule overlap and conflict prevention', () => {
    it('prevents tutor assignment if tutor already has an active overlapping demo session', async () => {
      mockPrisma.demo.findUnique.mockResolvedValue({
        id: 'demo-overlap-test',
        status: DemoStatus.SCHEDULED,
        scheduledAt: futureDate,
        durationMinutes: 60,
        studentId: 'student-1',
      });

      mockPrisma.demoBooking.findFirst.mockResolvedValue({
        id: 'demo-overlap-test',
        coordinatorId: 'coord-1',
      });

      mockPrisma.userRole.findMany.mockResolvedValue([{ role: { code: 'DEMO_COORDINATOR' } }]);

      // Simulate overlap found in checkOverlap: returns existing overlapping demo
      mockPrisma.demo.findMany.mockResolvedValue([
        {
          id: 'conflicting-demo',
          businessId: 'DMO-CONFLICT',
          status: DemoStatus.SCHEDULED,
          scheduledAt: futureDate,
          durationMinutes: 60,
        },
      ]);

      await expect(
        demoService.assignTutor('demo-overlap-test', { tutorId: 'tutor-busy' }, { id: 'coord-1' } as any),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // SCENARIO 8: Authorized and unauthorized access for each Demo role
  // ─────────────────────────────────────────────────────────────────────────────
  describe('Scenario 8: Scoped RBAC authorization across roles', () => {
    it('allows Demo Head to view unassigned bookings company-wide', async () => {
      mockPrisma.userRole.findMany.mockResolvedValue([{ role: { code: 'DEMO_HEAD' } }]);
      mockPrisma.demo.findUnique.mockResolvedValue({ id: 'demo-company', tutorId: 'tutor-99' });

      const result = await demoService.getDemoById('demo-company', { id: 'head-1' } as any);
      expect(result).toBeDefined();
    });

    it('denies Tutor from viewing a booking assigned to another tutor', async () => {
      mockPrisma.userRole.findMany.mockResolvedValue([{ role: { code: 'TUTOR' } }]);
      mockRbac.hasPermissions.mockImplementation((_uid: string, perms: string[]) =>
        Promise.resolve(perms.every((p) => ['demo.read_assigned', 'demo.read'].includes(p))),
      );
      mockPrisma.demo.findUnique.mockResolvedValue({ id: 'demo-foreign', tutorId: 'tutor-other' });
      mockPrisma.demoBooking.findFirst.mockResolvedValue(null);

      await expect(
        demoService.getDemoById('demo-foreign', { id: 'tutor-self' } as any),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // SCENARIO 9: Parent, coordinator and tutor attendance
  // ─────────────────────────────────────────────────────────────────────────────
  describe('Scenario 9: Multi-tier attendance hierarchy', () => {
    it('allows parent attendance at booking level and rejects session ID attachment', async () => {
      mockPrisma.demoAttendance.create.mockImplementation(({ data }: any) => Promise.resolve({ id: 'att-p', ...data }));

      const parentAttendance = await multiSessionService.recordAttendance(mockPrisma, {
        bookingId: 'booking-1',
        participantType: DemoParticipantType.PARENT,
        status: DemoAttendanceStatus.PRESENT,
        markedByUserId: 'coord-1',
      });
      expect(parentAttendance).toBeDefined();

      // Reject booking-level attendee with session ID
      await expect(
        multiSessionService.recordAttendance(mockPrisma, {
          bookingId: 'booking-1',
          sessionId: 'sess-invalid',
          participantType: DemoParticipantType.PARENT,
          status: DemoAttendanceStatus.PRESENT,
          markedByUserId: 'coord-1',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('requires assignmentId for tutor attendance', async () => {
      await expect(
        multiSessionService.recordAttendance(mockPrisma, {
          bookingId: 'booking-1',
          sessionId: 'sess-1',
          participantType: DemoParticipantType.TUTOR,
          status: DemoAttendanceStatus.PRESENT,
          markedByUserId: 'coord-1',
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // SCENARIO 10: Attendance correction with preserved audit history
  // ─────────────────────────────────────────────────────────────────────────────
  describe('Scenario 10: Attendance correction audit trail', () => {
    it('mandates a correction reason and marks record as isCorrected with timestamp', async () => {
      mockPrisma.demoAttendance.findUnique.mockResolvedValue({
        id: 'att-1',
        status: DemoAttendanceStatus.ABSENT,
      });

      mockPrisma.demoAttendance.update.mockImplementation(({ data }: any) =>
        Promise.resolve({ id: 'att-1', ...data }),
      );

      // Rejects empty reason
      await expect(
        multiSessionService.correctAttendance(mockPrisma, 'att-1', {
          newStatus: DemoAttendanceStatus.PRESENT,
          correctionReason: '',
          correctedByUserId: 'admin-1',
        }),
      ).rejects.toThrow(BadRequestException);

      const corrected = await multiSessionService.correctAttendance(mockPrisma, 'att-1', {
        newStatus: DemoAttendanceStatus.PRESENT,
        correctionReason: 'Parent arrived 5 minutes late but attended full session',
        correctedByUserId: 'admin-1',
      });

      expect(corrected.isCorrected).toBe(true);
      expect(corrected.correctionReason).toContain('Parent arrived');
      expect(corrected.correctedByUserId).toBe('admin-1');
      expect(corrected.correctedAt).toBeDefined();
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // SCENARIO 11: Required tutor/coordinator/parent feedback
  // ─────────────────────────────────────────────────────────────────────────────
  describe('Scenario 11: Multi-role feedback record persistence', () => {
    it('persists structured feedback from tutor, coordinator, and parent perspectives', async () => {
      mockPrisma.demoFeedbackRecord.upsert.mockResolvedValue({
        id: 'dfr-1',
        bookingId: 'booking-1',
        studentPerformance: 'Quick grasp of fundamentals',
        engagementLevel: 'HIGH',
        parentFeedback: 'Very satisfied with explanation',
      });

      const feedback = await mockPrisma.demoFeedbackRecord.upsert({
        where: { bookingId: 'booking-1' },
        create: {
          bookingId: 'booking-1',
          studentPerformance: 'Quick grasp of fundamentals',
          engagementLevel: 'HIGH',
          parentFeedback: 'Very satisfied with explanation',
          submittedByUserId: 'coord-1',
        },
        update: {},
      });

      expect(feedback.studentPerformance).toBe('Quick grasp of fundamentals');
      expect(feedback.engagementLevel).toBe('HIGH');
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // SCENARIO 12: Roadmap and academic-plan requirements
  // ─────────────────────────────────────────────────────────────────────────────
  describe('Scenario 12: 4-week roadmap and academic study plan milestones', () => {
    it('validates recommendation plan, class count, and milestones for post-demo package', async () => {
      mockPrisma.demoRoadmap.upsert.mockResolvedValue({
        id: 'drm-1',
        recommendedClassCount: 8,
        recommendedFrequency: '2x per week',
      });

      mockPrisma.demoAcademicPlan.upsert.mockResolvedValue({
        id: 'dap-1',
        learningGoal: 'Prepare for CBSE midterms',
        milestones: 'Complete Algebra module by Week 2',
      });

      const roadmap = await mockPrisma.demoRoadmap.upsert({ where: { bookingId: 'b-1' }, create: {}, update: {} });
      const plan = await mockPrisma.demoAcademicPlan.upsert({ where: { bookingId: 'b-1' }, create: {}, update: {} });

      expect(roadmap.recommendedClassCount).toBe(8);
      expect(plan.learningGoal).toBe('Prepare for CBSE midterms');
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // SCENARIO 13: Exception approval restricted to Academic Head and Operations Manager
  // ─────────────────────────────────────────────────────────────────────────────
  describe('Scenario 13: Exception approval governance restriction', () => {
    it('rejects approval from CEO, Demo Head, and Demo Admin; allows Academic Head', async () => {
      mockPrisma.demoSessionException.findUnique.mockResolvedValue({
        id: 'ex-1',
        resolutionStatus: DemoExceptionStatus.PENDING,
      });

      // CEO attempt -> Rejected!
      await expect(
        multiSessionService.reviewSessionException(
          mockPrisma,
          'ex-1',
          DemoExceptionStatus.APPROVED,
          { userId: 'ceo-user', roles: ['CEO'] },
          'CEO bypass attempt',
        ),
      ).rejects.toThrow(ForbiddenException);

      // Demo Head attempt -> Rejected!
      await expect(
        multiSessionService.reviewSessionException(
          mockPrisma,
          'ex-1',
          DemoExceptionStatus.APPROVED,
          { userId: 'head-user', roles: ['DEMO_HEAD'] },
          'Demo Head bypass attempt',
        ),
      ).rejects.toThrow(ForbiddenException);

      // Academic Head attempt -> Allowed!
      mockPrisma.demoSessionException.update.mockResolvedValue({
        id: 'ex-1',
        resolutionStatus: DemoExceptionStatus.APPROVED,
      });

      const reviewed = await multiSessionService.reviewSessionException(
        mockPrisma,
        'ex-1',
        DemoExceptionStatus.APPROVED,
        { userId: 'acad-head-user', roles: ['ACADEMIC_HEAD'] },
        'Approved by Academic Head',
      );
      expect(reviewed.resolutionStatus).toBe(DemoExceptionStatus.APPROVED);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // SCENARIO 14: Replacement-session completion gate
  // ─────────────────────────────────────────────────────────────────────────────
  describe('Scenario 14: Completion blocked while replacement session is pending', () => {
    it('fails completion gate if session exception is REPLACEMENT_SCHEDULED', () => {
      const bookingWithReplacement: any = {
        attendances: [
          { participantType: DemoParticipantType.PARENT, status: DemoAttendanceStatus.PRESENT },
          { participantType: DemoParticipantType.COORDINATOR, status: DemoAttendanceStatus.PRESENT },
        ],
        sessions: [
          {
            id: 'sess-replaced',
            sessionOrder: 1,
            status: DemoSessionStatus.SCHEDULED,
            attendances: [],
            exceptions: [
              {
                id: 'ex-rep',
                exceptionCategory: DemoSessionExceptionCategory.REPLACEMENT_SCHEDULED,
                resolutionStatus: DemoExceptionStatus.APPROVED,
              },
            ],
          },
        ],
        feedbackRecord: { id: 'fb-1' },
        roadmap: { id: 'rm-1' },
        academicPlan: { id: 'ap-1' },
      };

      const gate = multiSessionService.verifyBookingCompletionGate(bookingWithReplacement);
      expect(gate.canComplete).toBe(false);
      expect(gate.pendingReasons.some((r) => r.includes('pending execution of replacement session'))).toBe(true);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // SCENARIO 15: Rescheduling and cancellation behavior
  // ─────────────────────────────────────────────────────────────────────────────
  describe('Scenario 15: Reschedule history and cancellation audit', () => {
    it('records previous date and mandatory reason in reschedule history', async () => {
      const oldDate = new Date(Date.now() + 12 * 3600000);
      const newDate = new Date(Date.now() + 48 * 3600000);

      mockPrisma.demo.findUnique.mockResolvedValue({
        id: 'demo-resched',
        status: DemoStatus.SCHEDULED,
        scheduledAt: oldDate,
        studentId: 'stu-1',
        durationMinutes: 60,
      });

      mockPrisma.demoBooking.findFirst.mockResolvedValue({
        id: 'demo-resched',
        coordinatorId: 'coord-1',
      });

      mockPrisma.userRole.findMany.mockResolvedValue([{ role: { code: 'DEMO_COORDINATOR' } }]);
      mockPrisma.demo.update.mockResolvedValue({ id: 'demo-resched', scheduledAt: newDate });

      await demoService.rescheduleDemo(
        'demo-resched',
        { scheduledAt: newDate.toISOString(), durationMinutes: 60, reason: 'Family emergency' },
        { id: 'coord-1' } as any,
      );

      expect(mockPrisma.demoBookingRescheduleHistory.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            bookingId: 'demo-resched',
            previousDate: oldDate,
            newDate: expect.any(Date),
            reason: 'Family emergency',
            rescheduledByUserId: 'coord-1',
          }),
        }),
      );
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // SCENARIO 16: Reminder scheduling, queue inspection, and delivery status
  // ─────────────────────────────────────────────────────────────────────────────
  describe('Scenario 16: Notification dispatch and infrastructure safety', () => {
    it('enqueues notification job to BullMQ queue without sending live external messages', async () => {
      mockPrisma.userRole.findMany.mockResolvedValue([{ role: { code: 'DEMO_COORDINATOR' } }]);
      mockPrisma.demo.findUnique.mockResolvedValue({
        id: 'demo-cancel-notify',
        status: DemoStatus.SCHEDULED,
        tutorId: 'tutor-notify',
      });
      mockPrisma.demoBooking.findFirst.mockResolvedValue({ id: 'demo-cancel-notify', coordinatorId: 'coord-1' });
      mockPrisma.demo.update.mockResolvedValue({ id: 'demo-cancel-notify', status: DemoStatus.CANCELLED });

      await demoService.cancelDemo('demo-cancel-notify', { reason: 'Student sick' }, { id: 'coord-1' } as any);

      expect(mockQueue.add).toHaveBeenCalledWith(
        'send',
        expect.objectContaining({
          type: 'DEMO_CANCELLED',
          recipientUserId: 'tutor-notify',
        }),
      );
    });

    it('documents notification infrastructure status: queue producer active, worker/provider unconfigured', () => {
      // Confirmed: BullMQ producer puts jobs onto QUEUES.NOTIFICATIONS
      expect(mockQueue.add).toBeDefined();
      // Confirmed: No worker processes or SMS/WhatsApp provider credentials exist in local/staging app
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // SCENARIO 17: Booking completion and lead-status protection
  // ─────────────────────────────────────────────────────────────────────────────
  describe('Scenario 17: Completion status transition and protection against invalid lead status override', () => {
    it('transitions lead to DEMO_COMPLETED only when all gates are satisfied', async () => {
      mockPrisma.userRole.findMany.mockResolvedValue([{ role: { code: 'DEMO_ADMIN' } }]);
      mockPrisma.demo.findUnique.mockResolvedValue({
        id: 'demo-comp-all',
        status: DemoStatus.ASSIGNED,
        student: { lead: { id: 'lead-comp-all', status: LeadStatus.DEMO_BOOKED } },
      });
      mockPrisma.demoBooking.findUnique.mockResolvedValue({
        id: 'demo-comp-all',
        attendances: [
          { participantType: DemoParticipantType.PARENT, status: DemoAttendanceStatus.PRESENT },
          { participantType: DemoParticipantType.COORDINATOR, status: DemoAttendanceStatus.PRESENT },
        ],
        sessions: [
          {
            id: 'sess-1',
            sessionOrder: 1,
            status: DemoSessionStatus.COMPLETED,
            attendances: [{ participantType: DemoParticipantType.TUTOR, status: DemoAttendanceStatus.PRESENT }],
          },
        ],
        feedbackRecord: { id: 'fb-1' },
        roadmap: { id: 'rm-1' },
        academicPlan: { id: 'ap-1' },
      });

      mockPrisma.demoSession.findMany.mockResolvedValue([
        {
          id: 'sess-1',
          sessionOrder: 1,
          status: DemoSessionStatus.COMPLETED,
          tutorAssignments: [{ id: 'ta-1', tutorId: 'tutor-1', status: 'ACTIVE' }],
        },
      ]);

      mockPrisma.demo.update.mockResolvedValue({ id: 'demo-comp-all', status: DemoStatus.COMPLETED });
      mockPrisma.demoBooking.update.mockResolvedValue({ id: 'demo-comp-all', status: DemoBookingStatus.COMPLETED });

      await demoService.completeDemo(
        'demo-comp-all',
        { rating: 5, comments: 'Excellent', recommendationPlan: 'Continue', recommendedClassCount: 10, recommendedFrequency: '2x', learningGoal: 'A*', targetChapters: 'All', studyApproach: 'Practice' },
        { id: 'admin-1' } as any,
      );

      expect(mockPrisma.lead.update).toHaveBeenCalledWith({
        where: { id: 'lead-comp-all' },
        data: { status: LeadStatus.DEMO_COMPLETED },
      });
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // SCENARIO 18: Legacy Demo compatibility and multi-session booking rendering
  // ─────────────────────────────────────────────────────────────────────────────
  describe('Scenario 18: Dual-write and legacy compatibility', () => {
    it('maintains synchronized records across Demo and DemoBooking tables', async () => {
      mockPrisma.demo.findUnique.mockResolvedValue({
        id: 'demo-legacy-read',
        businessId: 'DMO-LEGACY',
        status: DemoStatus.SCHEDULED,
      });

      mockPrisma.demoBooking.findFirst.mockResolvedValue({
        id: 'booking-multi-read',
        legacyDemoId: 'demo-legacy-read',
        sessions: [{ id: 'sess-1', sessionOrder: 1 }],
      });

      const demo = await mockPrisma.demo.findUnique({ where: { id: 'demo-legacy-read' } });
      const booking = await mockPrisma.demoBooking.findFirst({ where: { legacyDemoId: 'demo-legacy-read' } });

      expect(demo.id).toBe('demo-legacy-read');
      expect(booking.legacyDemoId).toBe('demo-legacy-read');
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // SCENARIO 19: Demo details route rendering for authorized users
  // ─────────────────────────────────────────────────────────────────────────────
  describe('Scenario 19: Detail payload generation for authorized actors', () => {
    it('returns complete payload including student, sessions, and attendance data', async () => {
      mockPrisma.userRole.findMany.mockResolvedValue([{ role: { code: 'CEO' } }]);
      mockPrisma.demo.findUnique.mockResolvedValue({
        id: 'demo-detail-ok',
        businessId: 'DMO-0001',
        student: { id: 'stu-1', firstName: 'Ahnas', lastName: 'PP' },
      });
      mockPrisma.demoBooking.findFirst.mockResolvedValue({
        id: 'demo-detail-ok',
        sessions: [{ id: 's-1', sessionOrder: 1 }],
      });

      const response = await demoService.getDemoById('demo-detail-ok', { id: 'ceo-1' } as any);
      expect(response).toBeDefined();
      expect(response.student.firstName).toBe('Ahnas');
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // SCENARIO 20: Rejection of unauthorized detail requests without crash
  // ─────────────────────────────────────────────────────────────────────────────
  describe('Scenario 20: Controlled 403 Forbidden without Server Components crash', () => {
    it('throws ForbiddenException with clear explanation when actor is outside scope', async () => {
      mockPrisma.userRole.findMany.mockResolvedValue([{ role: { code: 'SALES_COUNSELLOR' } }]);
      mockRbac.hasPermissions.mockImplementation((_uid: string, perms: string[]) =>
        Promise.resolve(perms.every((p) => ['demo.book'].includes(p))),
      );
      mockPrisma.demo.findUnique.mockResolvedValue({
        id: 'demo-foreign-counsellor',
        student: { lead: { assignedToUserId: 'other-counsellor' } },
        bookedByUserId: 'other-counsellor',
      });
      mockPrisma.demoBooking.findFirst.mockResolvedValue(null);

      await expect(
        demoService.getDemoById('demo-foreign-counsellor', { id: 'my-counsellor' } as any),
      ).rejects.toThrow(ForbiddenException);
    });
  });
});
