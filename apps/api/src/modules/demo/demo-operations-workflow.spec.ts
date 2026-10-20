import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import {
  DemoStatus,
  DemoBookingStatus,
  DemoSessionStatus,
  LeadStatus,
  TutorAssignmentStatus,
  DemoParticipantType,
  DemoAttendanceStatus,
  DemoExceptionStatus,
  DemoOperationalStage,
  ParentConfirmationChannel,
  UserStatus,
} from '@prisma/client';

import { DemoService } from './demo.service';
import { DemoMultiSessionService } from './demo-multisession.service';
import { ValidatedUser } from '../../common/auth/auth.service';

describe('Demo Operations Workflow Specification & Stage Lifecycle Tests', () => {
  let demoService: DemoService;
  let multiSessionService: DemoMultiSessionService;
  let mockPrisma: any;
  let mockAudit: any;
  let mockIdSeq: any;
  let mockRbac: any;
  let mockQueue: any;

  const coordinatorUser: ValidatedUser = {
    id: 'user-coord-1',
    email: 'coordinator@elscore.com',
    mustChangePassword: false,
  };

  const salesUser: ValidatedUser = {
    id: 'user-sales-1',
    email: 'sales@elscore.com',
    mustChangePassword: false,
  };

  const adminUser: ValidatedUser = {
    id: 'user-admin-1',
    email: 'admin@elscore.com',
    mustChangePassword: false,
  };

  const tutorUser: ValidatedUser = {
    id: 'user-tutor-1',
    email: 'tutor@elscore.com',
    mustChangePassword: false,
  };

  const futureDate = new Date(Date.now() + 24 * 60 * 60 * 1000);
  const futureIso = futureDate.toISOString();

  beforeEach(() => {
    mockAudit = {
      record: jest.fn().mockResolvedValue(undefined),
      recordInTx: jest.fn().mockResolvedValue(undefined),
    };
    mockIdSeq = {
      nextId: jest.fn().mockResolvedValue('DMO-1001'),
      nextIdInTx: jest.fn().mockResolvedValue('DMO-1001'),
    };
    mockRbac = {
      hasPermissions: jest.fn().mockResolvedValue(true),
      getPermissionsForUser: jest.fn().mockResolvedValue(new Set(['demo.book', 'demo.coordinate', 'demo.manage_all', 'demo.assign_tutor'])),
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
      userRole: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      lead: {
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      leadStatusHistory: {
        create: jest.fn().mockResolvedValue({ id: 'lsh-1' }),
      },
      student: {
        findUnique: jest.fn(),
      },
      demo: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn(),
        update: jest.fn(),
        count: jest.fn().mockResolvedValue(0),
      },
      demoBooking: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
        count: jest.fn().mockResolvedValue(0),
      },
      demoSession: {
        findUnique: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
      },
      demoSessionTutorAssignment: {
        create: jest.fn(),
        update: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
      },
      demoMeetingLinkHistory: {
        create: jest.fn().mockResolvedValue({ id: 'link-hist-1' }),
      },
      demoOperationalStageHistory: {
        create: jest.fn().mockResolvedValue({ id: 'stage-hist-1' }),
        findMany: jest.fn().mockResolvedValue([]),
      },
      demoBookingRescheduleHistory: {
        create: jest.fn().mockResolvedValue({ id: 'resched-hist-1' }),
      },
      demoRescheduleHistory: {
        create: jest.fn().mockResolvedValue({ id: 'legacy-resched-1' }),
      },
      demoAttendance: {
        create: jest.fn(),
        findFirst: jest.fn(),
      },
      demoFeedback: {
        create: jest.fn(),
      },
      demoFeedbackRecord: {
        upsert: jest.fn(),
      },
      demoRoadmap: {
        upsert: jest.fn(),
      },
      demoAcademicPlan: {
        upsert: jest.fn(),
      },
      roundRobinCoordinatorState: {
        findMany: jest.fn().mockResolvedValue([]),
        findUnique: jest.fn(),
        update: jest.fn(),
      },
    };

    multiSessionService = new DemoMultiSessionService(mockPrisma);
    demoService = new DemoService(
      mockPrisma,
      mockAudit,
      mockIdSeq,
      mockRbac,
      mockQueue,
      multiSessionService,
    );
  });

  describe('1. Stage Progression: VALID_DEMO on Initial Booking', () => {
    it('creates a demo booking in VALID_DEMO stage and logs initial stage history', async () => {
      mockPrisma.student.findUnique.mockResolvedValue({
        id: 'student-1',
        firstName: 'John',
        lastName: 'Doe',
        lead: {
          id: 'lead-1',
          status: LeadStatus.INTERESTED,
          assignedToUserId: salesUser.id,
        },
        requirements: [
          {
            id: 'req-1',
            subjectId: 'sub-1',
            gradeId: 'grade-1',
            curriculumId: 'curr-1',
          },
        ],
      });

      mockPrisma.demoBooking.create.mockImplementation((args: any) => ({
        ...args.data,
        id: args.data.id || 'booking-1',
      }));

      mockPrisma.demo.create.mockResolvedValue({
        id: 'demo-1',
        businessId: 'DMO-1001',
        status: DemoStatus.SCHEDULED,
      });

      mockPrisma.demoSession.create.mockResolvedValue({
        id: 'session-1',
        sessionOrder: 1,
        status: DemoSessionStatus.SCHEDULED,
      });

      mockPrisma.lead.update.mockResolvedValue({ id: 'lead-1', status: LeadStatus.DEMO_BOOKED });

      const result = await demoService.bookDemo(
        {
          studentId: 'student-1',
          requirementId: 'req-1',
          scheduledAt: futureIso,
          durationMinutes: 60,
        },
        salesUser,
      );

      expect(mockPrisma.demoBooking.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            operationalStage: DemoOperationalStage.VALID_DEMO,
            status: DemoBookingStatus.SCHEDULED,
          }),
        }),
      );

      expect(mockPrisma.demoOperationalStageHistory.create).toHaveBeenCalledWith({
        data: {
          bookingId: 'booking-1',
          previousStage: null,
          newStage: DemoOperationalStage.VALID_DEMO,
          changedByUserId: salesUser.id,
          reason: 'Initial demo booking',
        },
      });

      // Lead status transitions to DEMO_BOOKED
      expect(mockPrisma.lead.update).toHaveBeenCalledWith({
        where: { id: 'lead-1' },
        data: { status: LeadStatus.DEMO_BOOKED },
      });
    });
  });

  describe('2. Round-Robin Coordinator Allocation & Safeguards', () => {
    it('selects active eligible coordinator with lowest load and advances round-robin state', async () => {
      mockPrisma.roundRobinCoordinatorState.findMany.mockResolvedValue([
        {
          id: 'rrc-1',
          userId: 'user-coord-1',
          currentLoad: 2,
          lastReturnedAt: new Date('2026-10-19T08:00:00Z'),
          user: {
            status: UserStatus.ACTIVE,
            userRoles: [{ role: { code: 'DEMO_COORDINATOR' } }],
          },
        },
        {
          id: 'rrc-2',
          userId: 'user-coord-2',
          currentLoad: 5,
          lastReturnedAt: new Date('2026-10-19T09:00:00Z'),
          user: {
            status: UserStatus.ACTIVE,
            userRoles: [{ role: { code: 'DEMO_COORDINATOR' } }],
          },
        },
      ]);

      const coordinator = await multiSessionService.getRoundRobinNextCoordinator(mockPrisma);
      expect(coordinator).toBeDefined();
      expect(coordinator?.userId).toBe('user-coord-1');
    });

    it('NEVER selects a CEO as coordinator even if present in round-robin state', async () => {
      mockPrisma.roundRobinCoordinatorState.findMany.mockResolvedValue([
        {
          id: 'rrc-ceo',
          userId: 'user-ceo',
          currentLoad: 0,
          lastReturnedAt: new Date('2026-10-19T08:00:00Z'),
          user: {
            status: UserStatus.ACTIVE,
            userRoles: [{ role: { code: 'CEO' } }],
          },
        },
        {
          id: 'rrc-coord',
          userId: 'user-coord-1',
          currentLoad: 3,
          lastReturnedAt: new Date('2026-10-19T09:00:00Z'),
          user: {
            status: UserStatus.ACTIVE,
            userRoles: [{ role: { code: 'DEMO_COORDINATOR' } }],
          },
        },
      ]);

      const coordinator = await multiSessionService.getRoundRobinNextCoordinator(mockPrisma);
      expect(coordinator).toBeDefined();
      expect(coordinator?.userId).toBe('user-coord-1');
      expect(coordinator?.userId).not.toBe('user-ceo');
    });

    it('returns null and leaves booking unassigned when coordinator pool is empty', async () => {
      mockPrisma.roundRobinCoordinatorState.findMany.mockResolvedValue([]);

      const coordinator = await multiSessionService.getRoundRobinNextCoordinator(mockPrisma);
      expect(coordinator).toBeNull();
    });
  });

  describe('3. Preparation Gate: "How to take the class" Instructions', () => {
    it('blocks tutor assignment when preparation notes are empty or under 15 characters', async () => {
      mockPrisma.demo.findUnique.mockResolvedValue({
        id: 'demo-1',
        status: DemoStatus.SCHEDULED,
        scheduledAt: futureDate,
        durationMinutes: 60,
        studentId: 'student-1',
      });

      mockPrisma.demoBooking.findFirst.mockResolvedValue({
        id: 'booking-1',
        preparationNotes: null, // Empty preparation notes!
        coordinatorId: coordinatorUser.id,
      });

      await expect(
        demoService.assignTutor('demo-1', { tutorId: tutorUser.id }, coordinatorUser),
      ).rejects.toThrow(BadRequestException);
    });

    it('saves preparation instructions, advances stage to PREPARATION, and logs stage history', async () => {
      mockPrisma.demoBooking.findFirst.mockResolvedValue({
        id: 'booking-1',
        operationalStage: DemoOperationalStage.VALID_DEMO,
        status: DemoBookingStatus.SCHEDULED,
        coordinatorId: coordinatorUser.id,
      });

      mockPrisma.demoBooking.update.mockResolvedValue({
        id: 'booking-1',
        operationalStage: DemoOperationalStage.PREPARATION,
        preparationNotes: 'Please ensure camera and mic are working, open scratchpad on chapter 4',
      });

      const result = await demoService.savePreparation(
        'booking-1',
        {
          preparationNotes: 'Please ensure camera and mic are working, open scratchpad on chapter 4',
        },
        coordinatorUser,
      );

      expect(mockPrisma.demoBooking.update).toHaveBeenCalledWith({
        where: { id: 'booking-1' },
        data: expect.objectContaining({
          preparationNotes: 'Please ensure camera and mic are working, open scratchpad on chapter 4',
          preparedByUserId: coordinatorUser.id,
          operationalStage: DemoOperationalStage.PREPARATION,
        }),
      });

      expect(mockPrisma.demoOperationalStageHistory.create).toHaveBeenCalledWith({
        data: {
          bookingId: 'booking-1',
          previousStage: DemoOperationalStage.VALID_DEMO,
          newStage: DemoOperationalStage.PREPARATION,
          changedByUserId: coordinatorUser.id,
          reason: 'Preparation instructions saved',
        },
      });
    });
  });

  describe('4. Multi-Session Tutor Assignment: TUTOR_ASSIGNED Stage', () => {
    it('advances stage to TUTOR_ASSIGNED only when all active sessions have an assigned tutor', async () => {
      mockPrisma.demo.findUnique.mockResolvedValue({
        id: 'demo-1',
        status: DemoStatus.SCHEDULED,
        scheduledAt: futureDate,
        durationMinutes: 60,
        studentId: 'student-1',
      });

      mockPrisma.demoBooking.findFirst.mockResolvedValue({
        id: 'booking-1',
        preparationNotes: 'Thorough preparation guidelines prepared for physics student',
        operationalStage: DemoOperationalStage.PREPARATION,
        coordinatorId: coordinatorUser.id,
      });

      mockPrisma.demoBooking.findUnique.mockResolvedValue({
        id: 'booking-1',
        operationalStage: DemoOperationalStage.PREPARATION,
      });

      mockPrisma.demo.update.mockResolvedValue({
        id: 'demo-1',
        status: DemoStatus.ASSIGNED,
        tutorId: tutorUser.id,
      });

      mockPrisma.demoSession.findUnique.mockResolvedValue({
        id: 'session-1',
        status: DemoSessionStatus.SCHEDULED,
        tutorAssignments: [],
      });

      mockPrisma.demoSession.findMany.mockImplementation((args: any) => {
        if (args?.include?.tutorAssignments) {
          return [
            {
              id: 'session-1',
              tutorAssignments: [{ id: 'ta-1', status: TutorAssignmentStatus.ACTIVE }],
            },
          ];
        }
        return [{ id: 'session-1' }];
      });

      mockPrisma.demoSessionTutorAssignment.create.mockResolvedValue({
        id: 'ta-1',
        status: TutorAssignmentStatus.ACTIVE,
      });

      await demoService.assignTutor('demo-1', { tutorId: tutorUser.id }, coordinatorUser);

      expect(mockPrisma.demoBooking.update).toHaveBeenCalledWith({
        where: { id: 'booking-1' },
        data: { operationalStage: DemoOperationalStage.TUTOR_ASSIGNED },
      });

      expect(mockPrisma.demoOperationalStageHistory.create).toHaveBeenCalledWith({
        data: {
          bookingId: 'booking-1',
          previousStage: DemoOperationalStage.PREPARATION,
          newStage: DemoOperationalStage.TUTOR_ASSIGNED,
          changedByUserId: coordinatorUser.id,
          reason: 'All active sessions assigned to tutors',
        },
      });
    });
  });

  describe('5. Link Sharing & History: LINK_SHARED Stage', () => {
    it('records meeting link, advances stage to LINK_SHARED, and writes versioned history', async () => {
      mockPrisma.demoBooking.findFirst.mockResolvedValue({
        id: 'booking-1',
        operationalStage: DemoOperationalStage.TUTOR_ASSIGNED,
        status: DemoBookingStatus.SCHEDULED,
        coordinatorId: coordinatorUser.id,
      });

      mockPrisma.demoBooking.update.mockResolvedValue({
        id: 'booking-1',
        operationalStage: DemoOperationalStage.LINK_SHARED,
        meetingLink: 'https://meet.google.com/abc-defg-hij',
      });

      await demoService.recordMeetingLink(
        'booking-1',
        {
          meetingLink: 'https://meet.google.com/abc-defg-hij',
        },
        coordinatorUser,
      );

      expect(mockPrisma.demoBooking.update).toHaveBeenCalledWith({
        where: { id: 'booking-1' },
        data: expect.objectContaining({
          meetingLink: 'https://meet.google.com/abc-defg-hij',
          meetingPlatform: 'GOOGLE_MEET',
          linkSharedByUserId: coordinatorUser.id,
          operationalStage: DemoOperationalStage.LINK_SHARED,
        }),
      });

      expect(mockPrisma.demoMeetingLinkHistory.create).toHaveBeenCalledWith({
        data: {
          bookingId: 'booking-1',
          sessionId: null,
          meetingLink: 'https://meet.google.com/abc-defg-hij',
          meetingPlatform: 'GOOGLE_MEET',
          sharedByUserId: coordinatorUser.id,
          reason: 'Meeting link provided',
        },
      });

      expect(mockPrisma.demoOperationalStageHistory.create).toHaveBeenCalledWith({
        data: {
          bookingId: 'booking-1',
          previousStage: DemoOperationalStage.TUTOR_ASSIGNED,
          newStage: DemoOperationalStage.LINK_SHARED,
          changedByUserId: coordinatorUser.id,
          reason: 'Meeting link recorded and shared internally',
        },
      });
    });
  });

  describe('6. Sales Handoff & WhatsApp Outreach: PARENT_CONFIRMATION Stage', () => {
    it('generates WhatsApp outreach template with prefilled wa.me link and records outreach', async () => {
      mockPrisma.demoBooking.findFirst.mockResolvedValue({
        id: 'booking-1',
        scheduledDate: futureDate,
        meetingLink: 'https://meet.google.com/abc-defg-hij',
        preparationNotes: 'Laptop recommended',
        bookedByUserId: salesUser.id,
        student: { firstName: 'Alice', lastName: 'Smith' },
        lead: {
          id: 'lead-1',
          primaryPhone: '+1-555-234-5678',
          assignedToUserId: salesUser.id,
        },
      });

      const outreach = await demoService.recordWhatsAppOutreach('booking-1', salesUser);

      expect(outreach.success).toBe(true);
      expect(outreach.waUrl).toContain('https://wa.me/15552345678');
      expect(outreach.waUrl).toContain('Alice%20Smith');
      expect(outreach.waUrl).toContain('https%3A%2F%2Fmeet.google.com%2Fabc-defg-hij');

      expect(mockPrisma.demoBooking.update).toHaveBeenCalledWith({
        where: { id: 'booking-1' },
        data: expect.objectContaining({
          whatsappOpenedByUserId: salesUser.id,
        }),
      });
    });

    it('confirms parent meeting, advances stage to PARENT_CONFIRMATION, and records history', async () => {
      mockPrisma.demoBooking.findFirst.mockResolvedValue({
        id: 'booking-1',
        meetingLink: 'https://meet.google.com/abc-defg-hij',
        operationalStage: DemoOperationalStage.LINK_SHARED,
        status: DemoBookingStatus.SCHEDULED,
        bookedByUserId: salesUser.id,
        lead: { assignedToUserId: salesUser.id },
      });

      mockPrisma.demoBooking.update.mockResolvedValue({
        id: 'booking-1',
        operationalStage: DemoOperationalStage.PARENT_CONFIRMATION,
      });

      await demoService.confirmParentMeeting(
        'booking-1',
        {
          confirmationChannel: ParentConfirmationChannel.WHATSAPP_CHAT,
          confirmationNotes: 'Mother confirmed via WhatsApp chat at 11:30 AM',
        },
        salesUser,
      );

      expect(mockPrisma.demoBooking.update).toHaveBeenCalledWith({
        where: { id: 'booking-1' },
        data: expect.objectContaining({
          confirmationChannel: ParentConfirmationChannel.WHATSAPP_CHAT,
          confirmationNotes: 'Mother confirmed via WhatsApp chat at 11:30 AM',
          parentConfirmedByUserId: salesUser.id,
          operationalStage: DemoOperationalStage.PARENT_CONFIRMATION,
        }),
      });

      expect(mockPrisma.demoOperationalStageHistory.create).toHaveBeenCalledWith({
        data: {
          bookingId: 'booking-1',
          previousStage: DemoOperationalStage.LINK_SHARED,
          newStage: DemoOperationalStage.PARENT_CONFIRMATION,
          changedByUserId: salesUser.id,
          reason: 'Parent confirmed via WHATSAPP_CHAT',
        },
      });
    });
  });

  describe('7. Authoritative Demo Completion Gate: COMPLETED Stage', () => {
    it('enforces all 6 gates, transitions stage to COMPLETED, and protects leads in NEGOTIATION', async () => {
      mockPrisma.demo.findUnique.mockResolvedValue({
        id: 'demo-1',
        status: DemoStatus.ASSIGNED,
        tutorId: tutorUser.id,
        student: {
          firstName: 'Alice',
          lead: {
            id: 'lead-1',
            status: LeadStatus.NEGOTIATION, // Protected status!
          },
        },
      });

      mockPrisma.demoBooking.findFirst.mockResolvedValue({
        id: 'demo-1',
        operationalStage: DemoOperationalStage.PARENT_CONFIRMATION,
        coordinatorId: coordinatorUser.id,
      });

      mockPrisma.demoBooking.findUnique.mockResolvedValue({
        id: 'demo-1',
        operationalStage: DemoOperationalStage.PARENT_CONFIRMATION,
        attendances: [
          { participantType: DemoParticipantType.PARENT, status: DemoAttendanceStatus.PRESENT },
          { participantType: DemoParticipantType.COORDINATOR, status: DemoAttendanceStatus.PRESENT },
        ],
        sessions: [
          {
            id: 'session-1',
            sessionOrder: 1,
            status: DemoSessionStatus.COMPLETED,
            attendances: [
              { participantType: DemoParticipantType.TUTOR, status: DemoAttendanceStatus.PRESENT },
            ],
            exceptions: [],
          },
        ],
        feedbackRecord: { id: 'fb-1', rating: 5 },
        roadmap: { id: 'rm-1', recommendationPlan: '4 weeks' },
        academicPlan: { id: 'ap-1', learningGoal: 'Core mastery' },
      });

      mockPrisma.demo.update.mockResolvedValue({ id: 'demo-1', status: DemoStatus.COMPLETED });

      await demoService.completeDemo(
        'demo-1',
        {
          rating: 5,
          comments: 'Outstanding demo',
        },
        coordinatorUser,
      );

      // DemoBooking transitions to COMPLETED
      expect(mockPrisma.demoBooking.update).toHaveBeenCalledWith({
        where: { id: 'demo-1' },
        data: {
          status: DemoBookingStatus.COMPLETED,
          operationalStage: DemoOperationalStage.COMPLETED,
        },
      });

      expect(mockPrisma.demoOperationalStageHistory.create).toHaveBeenCalledWith({
        data: {
          bookingId: 'demo-1',
          previousStage: DemoOperationalStage.PARENT_CONFIRMATION,
          newStage: DemoOperationalStage.COMPLETED,
          changedByUserId: coordinatorUser.id,
          reason: 'Authoritative completion gate satisfied',
        },
      });

      // Lead status is NOT regressed because it was in NEGOTIATION
      expect(mockPrisma.lead.update).not.toHaveBeenCalled();
    });
  });

  describe('8. Reschedule & No-Show Lifecycle', () => {
    it('marks demo as NOT_SHOW, updating status and stage', async () => {
      mockPrisma.demo.findUnique.mockResolvedValue({
        id: 'demo-1',
        status: DemoStatus.ASSIGNED,
        tutorId: tutorUser.id,
        bookedByUserId: salesUser.id,
      });

      mockPrisma.demoBooking.findFirst.mockResolvedValue({
        id: 'demo-1',
        operationalStage: DemoOperationalStage.PARENT_CONFIRMATION,
        coordinatorId: coordinatorUser.id,
      });

      await demoService.markNoShow('demo-1', { reason: 'Student did not join meet link' }, coordinatorUser);

      expect(mockPrisma.demoBooking.updateMany).toHaveBeenCalledWith({
        where: { id: 'demo-1' },
        data: {
          status: DemoBookingStatus.NO_SHOW,
          operationalStage: DemoOperationalStage.NOT_SHOW,
        },
      });

      expect(mockPrisma.demoOperationalStageHistory.create).toHaveBeenCalledWith({
        data: {
          bookingId: 'demo-1',
          previousStage: DemoOperationalStage.PARENT_CONFIRMATION,
          newStage: DemoOperationalStage.NOT_SHOW,
          changedByUserId: coordinatorUser.id,
          reason: 'Student did not join meet link',
        },
      });
    });

    it('reschedules a NOT_SHOW demo, resetting parent confirmation and setting isRescheduled = true', async () => {
      mockPrisma.demo.findUnique.mockResolvedValue({
        id: 'demo-1',
        status: DemoStatus.NO_SHOW, // Recovering from NO_SHOW!
        tutorId: tutorUser.id,
        scheduledAt: new Date(),
        studentId: 'student-1',
        bookedByUserId: salesUser.id,
      });

      mockPrisma.demoBooking.findFirst.mockResolvedValue({
        id: 'demo-1',
        operationalStage: DemoOperationalStage.NOT_SHOW,
        coordinatorId: coordinatorUser.id,
      });

      const newDate = new Date(Date.now() + 48 * 60 * 60 * 1000);

      await demoService.rescheduleDemo(
        'demo-1',
        {
          scheduledAt: newDate.toISOString(),
          durationMinutes: 45,
          reason: 'Parent requested to reschedule after missing session',
        },
        salesUser,
      );

      expect(mockPrisma.demoBooking.updateMany).toHaveBeenCalledWith({
        where: { id: 'demo-1' },
        data: expect.objectContaining({
          scheduledDate: newDate,
          totalDurationMin: 45,
          isRescheduled: true,
          operationalStage: DemoOperationalStage.RESCHEDULED,
          parentConfirmedAt: null,
          parentConfirmedByUserId: null,
          confirmationNotes: null,
          confirmationChannel: null,
          status: DemoBookingStatus.SCHEDULED,
        }),
      });

      expect(mockPrisma.demoOperationalStageHistory.create).toHaveBeenCalledWith({
        data: {
          bookingId: 'demo-1',
          previousStage: DemoOperationalStage.NOT_SHOW,
          newStage: DemoOperationalStage.RESCHEDULED,
          changedByUserId: salesUser.id,
          reason: 'Parent requested to reschedule after missing session',
        },
      });
    });

    it('marks a single session as NOT_SHOW without altering sibling active sessions or booking stage', async () => {
      mockPrisma.demo.findUnique.mockResolvedValue({
        id: 'demo-1',
        status: DemoStatus.ASSIGNED,
        tutorId: tutorUser.id,
        bookedByUserId: salesUser.id,
      });

      mockPrisma.demoBooking.findFirst.mockResolvedValue({
        id: 'demo-1',
        operationalStage: DemoOperationalStage.TUTOR_ASSIGNED,
        coordinatorId: coordinatorUser.id,
      });

      // Two sessions: session-1 (marked no-show) and session-2 (sibling still scheduled)
      mockPrisma.demoSession.findMany.mockResolvedValue([
        { id: 'session-1', status: DemoSessionStatus.NO_SHOW },
        { id: 'session-2', status: DemoSessionStatus.ASSIGNED },
      ]);

      await demoService.markNoShow(
        'demo-1',
        { sessionId: 'session-1', reason: 'Student skipped math session' },
        coordinatorUser,
      );

      // Session 1 updated to NO_SHOW specifically
      expect(mockPrisma.demoSession.updateMany).toHaveBeenCalledWith({
        where: {
          bookingId: 'demo-1',
          id: 'session-1',
        },
        data: { status: DemoSessionStatus.NO_SHOW },
      });

      // Sibling session-2 was NOT updated to NO_SHOW or CANCELLED
      expect(mockPrisma.demoSession.updateMany).not.toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ id: 'session-2' }),
        }),
      );

      // Booking level status should NOT be transitioned to NO_SHOW because session-2 is still active
      expect(mockPrisma.demo.update).not.toHaveBeenCalledWith(
        expect.objectContaining({
          data: { status: DemoStatus.NO_SHOW },
        }),
      );
    });

    it('advances RESCHEDULED demo to LINK_SHARED when new meeting link is recorded', async () => {
      mockPrisma.demoBooking.findFirst.mockResolvedValue({
        id: 'demo-1',
        operationalStage: DemoOperationalStage.RESCHEDULED,
        coordinatorId: coordinatorUser.id,
        status: DemoBookingStatus.SCHEDULED,
      });

      await demoService.recordMeetingLink(
        'demo-1',
        {
          meetingLink: 'https://meet.google.com/new-link-slot',
          meetingPlatform: 'GOOGLE_MEET',
          changeReason: 'Updated link for rescheduled session',
        },
        coordinatorUser,
      );

      expect(mockPrisma.demoBooking.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'demo-1' },
          data: expect.objectContaining({
            meetingLink: 'https://meet.google.com/new-link-slot',
            operationalStage: DemoOperationalStage.LINK_SHARED,
          }),
        }),
      );
    });
  });

  describe('9. Coordinator Reassignment & Load Balancing', () => {
    it('reassigns coordinator and balances currentLoad on round-robin states', async () => {
      mockPrisma.demoBooking.findFirst.mockResolvedValue({
        id: 'booking-1',
        coordinatorId: 'user-coord-1',
      });

      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'user-coord-2',
        status: UserStatus.ACTIVE,
        employee: { firstName: 'Sarah', lastName: 'Connor' },
      });

      mockPrisma.roundRobinCoordinatorState.findUnique
        .mockResolvedValueOnce({ id: 'rrc-1', userId: 'user-coord-1', currentLoad: 4 })
        .mockResolvedValueOnce({ id: 'rrc-2', userId: 'user-coord-2', currentLoad: 1 });

      await demoService.reassignCoordinator(
        'booking-1',
        {
          coordinatorId: 'user-coord-2',
          reason: 'Rebalancing due to leave',
        },
        adminUser,
      );

      expect(mockPrisma.demoBooking.update).toHaveBeenCalledWith({
        where: { id: 'booking-1' },
        data: { coordinatorId: 'user-coord-2' },
      });

      // Old coordinator load decremented
      expect(mockPrisma.roundRobinCoordinatorState.update).toHaveBeenCalledWith({
        where: { userId: 'user-coord-1' },
        data: { currentLoad: 3 },
      });

      // New coordinator load incremented
      expect(mockPrisma.roundRobinCoordinatorState.update).toHaveBeenCalledWith({
        where: { userId: 'user-coord-2' },
        data: { currentLoad: 2 },
      });
    });
  });

  describe('10. RBAC and Ownership Enforcement Negative Scenarios', () => {
    it('rejects cross-counsellor parent confirmation attempt', async () => {
      mockPrisma.demoBooking.findFirst.mockResolvedValue({
        id: 'booking-1',
        meetingLink: 'https://meet.google.com/abc-xyz',
        status: DemoBookingStatus.SCHEDULED,
        lead: { assignedToUserId: 'other-sales-user' },
        bookedByUserId: 'other-sales-user',
      });

      mockRbac.getPermissionsForUser.mockResolvedValue(new Set(['demo.read_own']));
      mockRbac.hasPermissions.mockResolvedValue(false);
      mockPrisma.userRole.findMany.mockResolvedValue([
        { role: { code: 'SALES_COUNSELLOR' } },
      ]);

      const unassignedSalesUser: ValidatedUser = {
        id: 'unauthorized-sales-id',
        email: 'attacker@elscore.com',
        mustChangePassword: false,
      };

      await expect(
        demoService.confirmParentMeeting(
          'booking-1',
          { confirmationChannel: 'WHATSAPP_CHAT' },
          unassignedSalesUser,
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('rejects cross-coordinator tutor assignment attempt', async () => {
      mockPrisma.demo.findUnique.mockResolvedValue({
        id: 'demo-1',
        status: DemoStatus.SCHEDULED,
      });

      mockPrisma.demoBooking.findFirst.mockResolvedValue({
        id: 'demo-1',
        coordinatorId: 'coordinator-alice',
        preparationNotes: 'Instructions with plenty of characters to pass the preparation gate.',
      });

      mockRbac.getPermissionsForUser.mockResolvedValue(new Set(['demo.coordinate', 'demo.assign_tutor']));
      mockRbac.hasPermissions.mockResolvedValue(false);
      mockPrisma.userRole.findMany.mockResolvedValue([
        { role: { code: 'DEMO_COORDINATOR' } },
      ]);

      const foreignCoordinator: ValidatedUser = {
        id: 'coordinator-bob',
        email: 'bob@elscore.com',
        mustChangePassword: false,
      };

      await expect(
        demoService.assignTutor(
          'demo-1',
          { tutorId: tutorUser.id },
          foreignCoordinator,
        ),
      ).rejects.toThrow(ForbiddenException);
    });
  });
});
