import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import {
  DemoBookingStatus,
  DemoSessionStatus,
  DemoParticipantType,
  DemoAttendanceStatus,
  TutorAssignmentStatus,
  DemoSessionExceptionCategory,
  DemoExceptionStatus,
} from '@prisma/client';

import { DemoMultiSessionService, MultiSessionInput } from './demo-multisession.service';

describe('DemoMultiSessionService', () => {
  let service: DemoMultiSessionService;
  let mockPrisma: any;

  beforeEach(() => {
    mockPrisma = {};
    service = new DemoMultiSessionService(mockPrisma);
  });

  describe('Multi-Session Structure Validation', () => {
    const validSession1: MultiSessionInput = {
      requirementId: 'req-1',
      subjectId: 'subj-math',
      curriculumId: 'curr-1',
      gradeId: 'grade-1',
      scheduledStart: new Date('2026-10-20T10:00:00Z'),
      scheduledEnd: new Date('2026-10-20T10:30:00Z'),
      durationMinutes: 30,
    };

    const validSession2: MultiSessionInput = {
      requirementId: 'req-2',
      subjectId: 'subj-physics',
      curriculumId: 'curr-1',
      gradeId: 'grade-1',
      scheduledStart: new Date('2026-10-20T10:30:00Z'),
      scheduledEnd: new Date('2026-10-20T11:15:00Z'),
      durationMinutes: 45,
    };

    it('successfully validates non-overlapping multi-session inputs and calculates total duration', () => {
      const result = service.validateMultiSessionStructure([validSession1, validSession2]);
      expect(result.totalDurationMinutes).toBe(75);
      expect(result.orderedSessions.length).toBe(2);
      expect(result.orderedSessions[0].sessionOrder).toBe(1);
      expect(result.orderedSessions[0].subjectId).toBe('subj-math');
      expect(result.orderedSessions[1].sessionOrder).toBe(2);
      expect(result.orderedSessions[1].subjectId).toBe('subj-physics');
    });

    it('rejects empty sessions array', () => {
      expect(() => service.validateMultiSessionStructure([])).toThrow(BadRequestException);
    });

    it('rejects session where scheduledStart is at or after scheduledEnd', () => {
      const invalidSession: MultiSessionInput = {
        ...validSession1,
        scheduledStart: new Date('2026-10-20T11:00:00Z'),
        scheduledEnd: new Date('2026-10-20T10:00:00Z'),
      };
      expect(() => service.validateMultiSessionStructure([invalidSession])).toThrow(BadRequestException);
    });

    it('rejects session where stated durationMinutes does not match start/end delta', () => {
      const invalidDurationSession: MultiSessionInput = {
        ...validSession1,
        durationMinutes: 60, // Actually 30m delta
      };
      expect(() => service.validateMultiSessionStructure([invalidDurationSession])).toThrow(BadRequestException);
    });

    it('detects and rejects overlapping session windows in the same booking', () => {
      const overlappingSession2: MultiSessionInput = {
        ...validSession2,
        scheduledStart: new Date('2026-10-20T10:20:00Z'), // Overlaps with session1 (10:00 - 10:30)
        scheduledEnd: new Date('2026-10-20T11:05:00Z'),
        durationMinutes: 45,
      };
      expect(() => service.validateMultiSessionStructure([validSession1, overlappingSession2])).toThrow(
        BadRequestException,
      );
    });
  });

  describe('Tutor Assignment & Replacement History', () => {
    it('creates sequence 1 ACTIVE assignment when no prior tutor was assigned', async () => {
      const mockTx = {
        demoSession: {
          findUnique: jest.fn().mockResolvedValue({
            id: 'session-1',
            status: DemoSessionStatus.SCHEDULED,
            tutorAssignments: [],
          }),
          update: jest.fn().mockResolvedValue({}),
        },
        demoSessionTutorAssignment: {
          create: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'assign-1', ...data })),
        },
      };

      const result = await service.assignOrReplaceSessionTutor(
        mockTx as any,
        'session-1',
        'tutor-new-1',
        'coordinator-1',
      );

      expect(mockTx.demoSessionTutorAssignment.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          sessionId: 'session-1',
          tutorId: 'tutor-new-1',
          assignmentSequence: 1,
          status: TutorAssignmentStatus.ACTIVE,
          assignedByUserId: 'coordinator-1',
        }),
      });
      expect(mockTx.demoSession.update).toHaveBeenCalledWith({
        where: { id: 'session-1' },
        data: { status: DemoSessionStatus.ASSIGNED },
      });
      expect(result.assignmentSequence).toBe(1);
    });

    it('marks prior active assignment as REPLACED and creates sequence 2 for replacement tutor', async () => {
      const mockPriorAssignment = {
        id: 'assign-old-1',
        sessionId: 'session-1',
        tutorId: 'tutor-old',
        assignmentSequence: 1,
        status: TutorAssignmentStatus.ACTIVE,
      };

      const mockTx = {
        demoSession: {
          findUnique: jest.fn().mockResolvedValue({
            id: 'session-1',
            status: DemoSessionStatus.ASSIGNED,
            tutorAssignments: [mockPriorAssignment],
          }),
        },
        demoSessionTutorAssignment: {
          update: jest.fn().mockResolvedValue({}),
          create: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'assign-new-2', ...data })),
        },
      };

      const result = await service.assignOrReplaceSessionTutor(
        mockTx as any,
        'session-1',
        'tutor-replacement',
        'coordinator-1',
        'Tutor unavailable due to emergency',
      );

      // Verify prior assignment marked as REPLACED with audit info
      expect(mockTx.demoSessionTutorAssignment.update).toHaveBeenCalledWith({
        where: { id: 'assign-old-1' },
        data: expect.objectContaining({
          status: TutorAssignmentStatus.REPLACED,
          replacedByUserId: 'coordinator-1',
          replacementReason: 'Tutor unavailable due to emergency',
        }),
      });

      // Verify new assignment with incremented sequence
      expect(mockTx.demoSessionTutorAssignment.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          sessionId: 'session-1',
          tutorId: 'tutor-replacement',
          assignmentSequence: 2,
          status: TutorAssignmentStatus.ACTIVE,
          assignedByUserId: 'coordinator-1',
        }),
      });
      expect(result.assignmentSequence).toBe(2);
    });
  });

  describe('Attendance Scoping & Correction Auditing', () => {
    it('requires assignmentId for tutor attendance', async () => {
      const mockTx = { demoAttendance: { create: jest.fn() } };

      await expect(
        service.recordAttendance(mockTx as any, {
          bookingId: 'booking-1',
          participantType: DemoParticipantType.TUTOR,
          status: DemoAttendanceStatus.PRESENT,
          markedByUserId: 'user-coord',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects sessionId / assignmentId for booking-level parent or coordinator attendance', async () => {
      const mockTx = { demoAttendance: { create: jest.fn() } };

      await expect(
        service.recordAttendance(mockTx as any, {
          bookingId: 'booking-1',
          sessionId: 'session-1', // Invalid: parent must be booking level
          participantType: DemoParticipantType.PARENT,
          status: DemoAttendanceStatus.PRESENT,
          markedByUserId: 'user-coord',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('audits attendance correction with timestamp, actor, and mandatory reason', async () => {
      const mockTx = {
        demoAttendance: {
          findUnique: jest.fn().mockResolvedValue({
            id: 'att-1',
            status: DemoAttendanceStatus.ABSENT,
          }),
          update: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'att-1', ...data })),
        },
      };

      const result = await service.correctAttendance(mockTx as any, 'att-1', {
        newStatus: DemoAttendanceStatus.PRESENT,
        correctionReason: 'Tutor arrived 5 minutes late due to network glitch, verified in call log',
        correctedByUserId: 'user-coord',
      });

      expect(mockTx.demoAttendance.update).toHaveBeenCalledWith({
        where: { id: 'att-1' },
        data: expect.objectContaining({
          status: DemoAttendanceStatus.PRESENT,
          isCorrected: true,
          correctionReason: 'Tutor arrived 5 minutes late due to network glitch, verified in call log',
          correctedByUserId: 'user-coord',
        }),
      });
      expect(result.isCorrected).toBe(true);
    });
  });

  describe('Session Exception Review Authorization Gate', () => {
    const mockPendingException = {
      id: 'exc-1',
      sessionId: 'session-1',
      exceptionCategory: DemoSessionExceptionCategory.WAIVER,
      resolutionStatus: DemoExceptionStatus.PENDING,
    };

    it('rejects approval attempt by unauthorized roles (Sales Counsellor, Demo Coordinator, Tutor)', async () => {
      const mockTx = { demoSessionException: { findUnique: jest.fn(), update: jest.fn() } };

      await expect(
        service.reviewSessionException(
          mockTx as any,
          'exc-1',
          DemoExceptionStatus.APPROVED,
          { userId: 'user-counsellor', roles: ['SALES_COUNSELLOR'] },
          'Approve waiver',
        ),
      ).rejects.toThrow(ForbiddenException);

      await expect(
        service.reviewSessionException(
          mockTx as any,
          'exc-1',
          DemoExceptionStatus.APPROVED,
          { userId: 'user-coord', roles: ['DEMO_COORDINATOR'] },
          'Approve waiver',
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('allows approval by Academic Head or Operations Manager', async () => {
      const mockTx = {
        demoSessionException: {
          findUnique: jest.fn().mockResolvedValue(mockPendingException),
          update: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'exc-1', ...data })),
        },
      };

      const resultAcadHead = await service.reviewSessionException(
        mockTx as any,
        'exc-1',
        DemoExceptionStatus.APPROVED,
        { userId: 'acad-head-1', roles: ['ACADEMIC_HEAD'] },
        'Approved after reviewing student curriculum gap',
      );

      expect(resultAcadHead.resolutionStatus).toBe(DemoExceptionStatus.APPROVED);
      expect(resultAcadHead.reviewedByUserId).toBe('acad-head-1');

      const resultOpsMgr = await service.reviewSessionException(
        mockTx as any,
        'exc-1',
        DemoExceptionStatus.APPROVED,
        { userId: 'ops-mgr-1', roles: ['OPERATIONS_MANAGER'] },
        'Approved by Operations',
      );
      expect(resultOpsMgr.resolutionStatus).toBe(DemoExceptionStatus.APPROVED);
      expect(resultOpsMgr.reviewedByUserId).toBe('ops-mgr-1');
    });
  });

  describe('Authoritative Completion Gate & Replacement Safeguard', () => {
    const baseBooking = {
      attendances: [
        { participantType: DemoParticipantType.PARENT, status: DemoAttendanceStatus.PRESENT },
        { participantType: DemoParticipantType.COORDINATOR, status: DemoAttendanceStatus.PRESENT },
      ],
      feedbackRecord: { id: 'fb-1' },
      roadmap: { id: 'road-1' },
      academicPlan: { id: 'plan-1' },
    };

    it('allows completion when all sessions are COMPLETED with valid tutor attendance', () => {
      const booking = {
        ...baseBooking,
        sessions: [
          {
            id: 'session-1',
            sessionOrder: 1,
            status: DemoSessionStatus.COMPLETED,
            attendances: [{ participantType: DemoParticipantType.TUTOR, status: DemoAttendanceStatus.PRESENT }],
          },
          {
            id: 'session-2',
            sessionOrder: 2,
            status: DemoSessionStatus.COMPLETED,
            attendances: [{ participantType: DemoParticipantType.TUTOR, status: DemoAttendanceStatus.LATE }],
          },
        ],
      };

      const result = service.verifyBookingCompletionGate(booking);
      expect(result.canComplete).toBe(true);
      expect(result.pendingReasons).toHaveLength(0);
    });

    it('fails completion if parent or coordinator attendance is missing', () => {
      const bookingNoParent = {
        ...baseBooking,
        attendances: [{ participantType: DemoParticipantType.COORDINATOR, status: DemoAttendanceStatus.PRESENT }],
        sessions: [
          {
            id: 'session-1',
            sessionOrder: 1,
            status: DemoSessionStatus.COMPLETED,
            attendances: [{ participantType: DemoParticipantType.TUTOR, status: DemoAttendanceStatus.PRESENT }],
          },
        ],
      };

      const result = service.verifyBookingCompletionGate(bookingNoParent);
      expect(result.canComplete).toBe(false);
      expect(result.pendingReasons).toContain('Parent booking-level attendance is required');
    });

    it('allows completion when uncompleted session has an approved WAIVER or PARENT_DECLINED_SUBJECT', () => {
      const bookingWithWaiver = {
        ...baseBooking,
        sessions: [
          {
            id: 'session-1',
            sessionOrder: 1,
            status: DemoSessionStatus.COMPLETED,
            attendances: [{ participantType: DemoParticipantType.TUTOR, status: DemoAttendanceStatus.PRESENT }],
          },
          {
            id: 'session-2',
            sessionOrder: 2,
            status: DemoSessionStatus.SCHEDULED, // Not completed
            exceptions: [
              {
                exceptionCategory: DemoSessionExceptionCategory.WAIVER,
                resolutionStatus: DemoExceptionStatus.APPROVED,
              },
            ],
          },
        ],
      };

      const result = service.verifyBookingCompletionGate(bookingWithWaiver);
      expect(result.canComplete).toBe(true);
      expect(result.pendingReasons).toHaveLength(0);
    });

    it('PROVES MANDATORY SAFEGUARD: An approved REPLACEMENT_SCHEDULED exception CANNOT silently satisfy completion', () => {
      const bookingWithReplacement = {
        ...baseBooking,
        sessions: [
          {
            id: 'session-1',
            sessionOrder: 1,
            status: DemoSessionStatus.COMPLETED,
            attendances: [{ participantType: DemoParticipantType.TUTOR, status: DemoAttendanceStatus.PRESENT }],
          },
          {
            id: 'session-2',
            sessionOrder: 2,
            status: DemoSessionStatus.SCHEDULED, // Not completed
            exceptions: [
              {
                exceptionCategory: DemoSessionExceptionCategory.REPLACEMENT_SCHEDULED,
                resolutionStatus: DemoExceptionStatus.APPROVED,
              },
            ],
          },
        ],
      };

      const result = service.verifyBookingCompletionGate(bookingWithReplacement);
      expect(result.canComplete).toBe(false);
      expect(result.pendingReasons).toContain(
        'Session 2 has a replacement scheduled; pending execution of replacement session',
      );
    });

    it('fails completion if feedback, roadmap, or academic plan is missing', () => {
      const bookingMissingPlan = {
        ...baseBooking,
        academicPlan: null,
        sessions: [
          {
            id: 'session-1',
            sessionOrder: 1,
            status: DemoSessionStatus.COMPLETED,
            attendances: [{ participantType: DemoParticipantType.TUTOR, status: DemoAttendanceStatus.PRESENT }],
          },
        ],
      };

      const result = service.verifyBookingCompletionGate(bookingMissingPlan);
      expect(result.canComplete).toBe(false);
      expect(result.pendingReasons).toContain('Post-demo academic plan is required');
    });
  });
});
