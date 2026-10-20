import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import {
  DemoStatus,
  DemoBookingStatus,
  DemoSessionStatus,
  LeadStatus,
  TutorAssignmentStatus,
  DemoParticipantType,
  DemoAttendanceStatus,
  DemoOperationalStage,
} from '@prisma/client';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';

import { DemoService } from './demo.service';
import { DemoMultiSessionService } from './demo-multisession.service';
import { CompleteDemoDto } from './dto/demo.dto';
import { ValidatedUser } from '../../common/auth/auth.service';

describe('Demo Evaluation Auto-Fill, Isolation & Field Integrity Spec', () => {
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

  const unauthorizedUser: ValidatedUser = {
    id: 'user-unauth-1',
    email: 'unauth@elscore.com',
    mustChangePassword: false,
  };

  const createSatisfiedBooking = (bookingId: string, overrides: any = {}) => ({
    id: bookingId,
    operationalStage: DemoOperationalStage.PARENT_CONFIRMATION,
    attendances: [
      { participantType: DemoParticipantType.PARENT, status: DemoAttendanceStatus.PRESENT },
      { participantType: DemoParticipantType.COORDINATOR, status: DemoAttendanceStatus.PRESENT },
    ],
    sessions: [
      {
        id: `sess-${bookingId}-1`,
        sessionOrder: 1,
        status: DemoSessionStatus.COMPLETED,
        attendances: [
          { participantType: DemoParticipantType.TUTOR, status: DemoAttendanceStatus.PRESENT },
        ],
        exceptions: [],
      },
    ],
    feedbackRecord: { id: `fb-${bookingId}` },
    roadmap: { id: `rm-${bookingId}`, recommendationPlan: '4-week plan' },
    academicPlan: { id: `ap-${bookingId}`, learningGoal: 'Core mastery' },
    ...overrides,
  });

  beforeEach(() => {
    mockAudit = {
      record: jest.fn().mockResolvedValue(undefined),
      recordInTx: jest.fn().mockResolvedValue(undefined),
    };
    mockIdSeq = {
      nextId: jest.fn().mockResolvedValue('DMO-2001'),
      nextIdInTx: jest.fn().mockResolvedValue('DMO-2001'),
    };
    mockRbac = {
      hasPermissions: jest.fn().mockResolvedValue(true),
      getPermissionsForUser: jest.fn().mockResolvedValue(new Set(['demo.book', 'demo.coordinate', 'demo.complete', 'demo.manage_team'])),
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
      demoAttendance: {
        create: jest.fn(),
        findFirst: jest.fn(),
      },
      demoFeedback: {
        create: jest.fn(),
        upsert: jest.fn(),
      },
      demoFeedbackRecord: {
        upsert: jest.fn(),
        findUnique: jest.fn(),
      },
      demoRoadmap: {
        upsert: jest.fn(),
        findUnique: jest.fn(),
      },
      demoAcademicPlan: {
        upsert: jest.fn(),
        findUnique: jest.fn(),
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

  // 1. A new Demo opens with no fabricated feedback
  it('1. persists null instead of fabricated sample sentences when fields are omitted on a new demo', async () => {
    mockPrisma.demo.findUnique.mockResolvedValue({
      id: 'demo-new-1',
      status: DemoStatus.ASSIGNED,
      tutorId: 'user-tutor-1',
      student: { lead: { id: 'lead-1', status: LeadStatus.INTERESTED } },
    });
    mockPrisma.demoBooking.findFirst.mockResolvedValue({
      id: 'booking-new-1',
      coordinatorId: coordinatorUser.id,
      operationalStage: DemoOperationalStage.PARENT_CONFIRMATION,
    });
    mockPrisma.demoBooking.findUnique.mockResolvedValue(createSatisfiedBooking('booking-new-1'));
    mockPrisma.demo.update.mockResolvedValue({ id: 'demo-new-1', status: DemoStatus.COMPLETED });

    await demoService.completeDemo(
      'demo-new-1',
      {
        rating: 4,
        comments: 'Genuine evaluation comments',
      },
      coordinatorUser,
    );

    // Verify create payload does NOT contain dummy sample text
    expect(mockPrisma.demoFeedbackRecord.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { bookingId: 'booking-new-1' },
        create: expect.objectContaining({
          academicAssessment: null,
          engagementLevel: null,
          parentFeedback: null,
          parentInterestLevel: null,
          learningBehaviour: null,
          coordinatorRemarks: null,
          parentConcerns: null,
        }),
      }),
    );
  });

  // 2. An existing Demo restores its actual saved evaluation
  it('2. returns actual persisted evaluation records in getDemoById and getDemos', async () => {
    const savedFeedbackRecord = {
      id: 'fb-rec-saved',
      bookingId: 'booking-saved-1',
      academicAssessment: 'Student demonstrated solid grasp of algebra basics.',
      engagementLevel: 'MEDIUM',
      parentFeedback: 'Parent requested extra emphasis on word problems.',
      parentInterestLevel: 'HIGH',
      rating: 5,
      comments: 'Great responsiveness during practice.',
    };

    mockPrisma.demo.findUnique.mockResolvedValue({
      id: 'demo-saved-1',
      status: DemoStatus.COMPLETED,
      student: { id: 'student-1', lead: { id: 'lead-1', assignedToUserId: 'user-sales-1' } },
      feedback: [],
    });

    mockPrisma.demoBooking.findFirst.mockResolvedValue({
      id: 'booking-saved-1',
      legacyDemoId: 'demo-saved-1',
      operationalStage: DemoOperationalStage.COMPLETED,
      feedbackRecord: savedFeedbackRecord,
      roadmap: { id: 'rm-1', recommendationPlan: '4-week plan' },
      academicPlan: { id: 'ap-1', learningGoal: 'Algebra mastery' },
      attendances: [],
    });

    const result = await demoService.getDemoById('demo-saved-1', coordinatorUser);

    expect(result.feedbackRecord).toEqual(savedFeedbackRecord);
    expect(result.feedbackRecord.academicAssessment).toBe('Student demonstrated solid grasp of algebra basics.');
    expect(result.feedbackRecord.engagementLevel).toBe('MEDIUM');
    expect(result.feedbackRecord.parentFeedback).toBe('Parent requested extra emphasis on word problems.');
    expect(result.feedbackRecord.parentInterestLevel).toBe('HIGH');
  });

  // 3. Missing fields remain empty rather than receiving sample text
  it('3. ensures missing fields in getDemoById remain null rather than receiving placeholder sample text', async () => {
    mockPrisma.demo.findUnique.mockResolvedValue({
      id: 'demo-empty-1',
      status: DemoStatus.ASSIGNED,
      student: { id: 'student-1', lead: { id: 'lead-1', assignedToUserId: 'user-sales-1' } },
      feedback: [],
    });

    mockPrisma.demoBooking.findFirst.mockResolvedValue({
      id: 'booking-empty-1',
      legacyDemoId: 'demo-empty-1',
      operationalStage: DemoOperationalStage.PARENT_CONFIRMATION,
      feedbackRecord: null,
      roadmap: null,
      academicPlan: null,
      attendances: [],
    });

    const result = await demoService.getDemoById('demo-empty-1', coordinatorUser);

    expect(result.feedbackRecord).toBeNull();
    expect(result.roadmap).toBeNull();
    expect(result.academicPlan).toBeNull();
  });

  // 4. Switching from Demo A to Demo B does not retain Demo A's values (Data isolation)
  it('4. strictly separates evaluation records between distinct Demos', async () => {
    const feedbackDemoA = {
      id: 'fb-a',
      academicAssessment: 'Assessment for Student A',
      parentFeedback: 'Feedback from Parent A',
      engagementLevel: 'HIGH',
      parentInterestLevel: 'HIGH',
    };
    const feedbackDemoB = {
      id: 'fb-b',
      academicAssessment: 'Assessment for Student B',
      parentFeedback: 'Feedback from Parent B',
      engagementLevel: 'LOW',
      parentInterestLevel: 'LOW',
    };

    mockPrisma.demo.findUnique
      .mockResolvedValueOnce({ id: 'demo-A', status: DemoStatus.COMPLETED })
      .mockResolvedValueOnce({ id: 'demo-B', status: DemoStatus.COMPLETED });

    mockPrisma.demoBooking.findFirst
      .mockResolvedValueOnce({ id: 'booking-A', legacyDemoId: 'demo-A', feedbackRecord: feedbackDemoA })
      .mockResolvedValueOnce({ id: 'booking-B', legacyDemoId: 'demo-B', feedbackRecord: feedbackDemoB });

    const demoA = await demoService.getDemoById('demo-A', coordinatorUser);
    const demoB = await demoService.getDemoById('demo-B', coordinatorUser);

    expect(demoA.feedbackRecord.academicAssessment).toBe('Assessment for Student A');
    expect(demoB.feedbackRecord.academicAssessment).toBe('Assessment for Student B');
    expect(demoA.feedbackRecord.academicAssessment).not.toEqual(demoB.feedbackRecord.academicAssessment);
  });

  // 5. Reopening a saved evaluation restores all four fields correctly
  it('5. allows reopening and restoring an already completed demo evaluation without throwing status error', async () => {
    mockPrisma.demo.findUnique.mockResolvedValue({
      id: 'demo-comp-reopen',
      status: DemoStatus.COMPLETED,
      tutorId: 'user-tutor-1',
      student: { lead: { id: 'lead-1', status: LeadStatus.DEMO_COMPLETED } },
    });
    mockPrisma.demoBooking.findFirst.mockResolvedValue({
      id: 'booking-comp-reopen',
      coordinatorId: coordinatorUser.id,
      operationalStage: DemoOperationalStage.COMPLETED,
    });
    mockPrisma.demoBooking.findUnique.mockResolvedValue(
      createSatisfiedBooking('booking-comp-reopen', { operationalStage: DemoOperationalStage.COMPLETED }),
    );
    mockPrisma.demo.update.mockResolvedValue({ id: 'demo-comp-reopen', status: DemoStatus.COMPLETED });

    await expect(
      demoService.completeDemo(
        'demo-comp-reopen',
        {
          rating: 5,
          comments: 'Updated comments after follow-up',
          academicAssessment: 'Updated coordinator assessment',
          engagementLevel: 'HIGH',
          parentFeedback: 'Updated parent feedback',
          parentInterestLevel: 'HIGH',
        },
        coordinatorUser,
      ),
    ).resolves.toBeDefined();

    expect(mockPrisma.demoFeedbackRecord.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { bookingId: 'booking-comp-reopen' },
        update: expect.objectContaining({
          academicAssessment: 'Updated coordinator assessment',
          engagementLevel: 'HIGH',
          parentFeedback: 'Updated parent feedback',
          parentInterestLevel: 'HIGH',
        }),
      }),
    );
  });

  // 6. Partial updates preserve fields that were not submitted
  it('6. preserves existing fields in update clause when optional properties are omitted', async () => {
    mockPrisma.demo.findUnique.mockResolvedValue({
      id: 'demo-partial-1',
      status: DemoStatus.ASSIGNED,
      tutorId: 'user-tutor-1',
      student: { lead: { id: 'lead-1', status: LeadStatus.INTERESTED } },
    });
    mockPrisma.demoBooking.findFirst.mockResolvedValue({
      id: 'booking-partial-1',
      coordinatorId: coordinatorUser.id,
      operationalStage: DemoOperationalStage.PARENT_CONFIRMATION,
    });
    mockPrisma.demoBooking.findUnique.mockResolvedValue(createSatisfiedBooking('booking-partial-1'));
    mockPrisma.demo.update.mockResolvedValue({ id: 'demo-partial-1', status: DemoStatus.COMPLETED });

    // Submit partial DTO without parentFeedback or academicAssessment
    await demoService.completeDemo(
      'demo-partial-1',
      {
        rating: 4,
        comments: 'Only tutor comments provided',
      },
      coordinatorUser,
    );

    expect(mockPrisma.demoFeedbackRecord.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({
          academicAssessment: undefined,
          engagementLevel: undefined,
          parentFeedback: undefined,
          parentInterestLevel: undefined,
        }),
      }),
    );
  });

  // 7. Save failures preserve user entered values (Atomic transaction rollback)
  it('7. cleanly aborts database modifications and surfaces failure if transaction errors', async () => {
    mockPrisma.demo.findUnique.mockResolvedValue({
      id: 'demo-fail-1',
      status: DemoStatus.ASSIGNED,
      tutorId: 'user-tutor-1',
      student: { lead: { id: 'lead-1', status: LeadStatus.INTERESTED } },
    });
    mockPrisma.demoBooking.findFirst.mockResolvedValue({
      id: 'booking-fail-1',
      coordinatorId: coordinatorUser.id,
      operationalStage: DemoOperationalStage.PARENT_CONFIRMATION,
    });
    mockPrisma.demoFeedbackRecord.upsert.mockRejectedValue(new Error('DB Connection Timeout'));

    await expect(
      demoService.completeDemo(
        'demo-fail-1',
        {
          rating: 4,
          comments: 'Testing failure handling',
          academicAssessment: 'Assessment text',
        },
        coordinatorUser,
      ),
    ).rejects.toThrow('DB Connection Timeout');

    // Demo status must not have been updated to COMPLETED
    expect(mockPrisma.demo.update).not.toHaveBeenCalled();
  });

  // 8. Dropdown values match supported backend values
  it('8. validates engagementLevel and parentInterestLevel dropdown values in CompleteDemoDto', async () => {
    // Valid values
    const validDto = plainToInstance(CompleteDemoDto, {
      rating: 5,
      comments: 'Valid comments',
      engagementLevel: 'HIGH',
      parentInterestLevel: 'MEDIUM',
    });
    const validErrors = await validate(validDto);
    expect(validErrors.length).toBe(0);

    // Invalid dropdown values
    const invalidDto = plainToInstance(CompleteDemoDto, {
      rating: 5,
      comments: 'Valid comments',
      engagementLevel: 'VERY_HIGH', // Invalid
      parentInterestLevel: 'NOT_INTERESTED', // Invalid
    });
    const invalidErrors = await validate(invalidDto);
    expect(invalidErrors.length).toBeGreaterThan(0);
    const errorProperties = invalidErrors.map((e) => e.property);
    expect(errorProperties).toContain('engagementLevel');
    expect(errorProperties).toContain('parentInterestLevel');
  });

  // 9. Coordinator and parent feedback remain mapped to their correct fields
  it('9. maintains distinct mapping between coordinator academic assessment and parent feedback', async () => {
    mockPrisma.demo.findUnique.mockResolvedValue({
      id: 'demo-mapping-1',
      status: DemoStatus.ASSIGNED,
      tutorId: 'user-tutor-1',
      student: { lead: { id: 'lead-1', status: LeadStatus.INTERESTED } },
    });
    mockPrisma.demoBooking.findFirst.mockResolvedValue({
      id: 'booking-mapping-1',
      coordinatorId: coordinatorUser.id,
      operationalStage: DemoOperationalStage.PARENT_CONFIRMATION,
    });
    mockPrisma.demoBooking.findUnique.mockResolvedValue(createSatisfiedBooking('booking-mapping-1'));
    mockPrisma.demo.update.mockResolvedValue({ id: 'demo-mapping-1', status: DemoStatus.COMPLETED });

    await demoService.completeDemo(
      'demo-mapping-1',
      {
        rating: 5,
        comments: 'Tutor performance observations',
        academicAssessment: 'Coordinator assessment on syllabus grasp',
        engagementLevel: 'HIGH',
        parentFeedback: 'Parent praised tutor patient approach',
        parentInterestLevel: 'MEDIUM',
      },
      coordinatorUser,
    );

    expect(mockPrisma.demoFeedbackRecord.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          academicAssessment: 'Coordinator assessment on syllabus grasp',
          engagementLevel: 'HIGH',
          parentFeedback: 'Parent praised tutor patient approach',
          parentInterestLevel: 'MEDIUM',
        }),
      }),
    );
  });

  // 10. Multi-session Demos use the intended booking scope
  it('10. targets multi-session parent booking ID when completeDemo is invoked on legacy demo ID', async () => {
    mockPrisma.demo.findUnique.mockResolvedValue({
      id: 'legacy-demo-multi-1',
      status: DemoStatus.ASSIGNED,
      tutorId: 'user-tutor-1',
      student: { lead: { id: 'lead-1', status: LeadStatus.INTERESTED } },
    });
    mockPrisma.demoBooking.findFirst.mockResolvedValue({
      id: 'parent-booking-uuid-999',
      legacyDemoId: 'legacy-demo-multi-1',
      coordinatorId: coordinatorUser.id,
      operationalStage: DemoOperationalStage.PARENT_CONFIRMATION,
    });
    mockPrisma.demoBooking.findUnique.mockResolvedValue(
      createSatisfiedBooking('parent-booking-uuid-999', {
        sessions: [
          { id: 'sess-1', sessionOrder: 1, status: DemoSessionStatus.COMPLETED, attendances: [{ participantType: DemoParticipantType.TUTOR, status: DemoAttendanceStatus.PRESENT }], exceptions: [] },
          { id: 'sess-2', sessionOrder: 2, status: DemoSessionStatus.COMPLETED, attendances: [{ participantType: DemoParticipantType.TUTOR, status: DemoAttendanceStatus.PRESENT }], exceptions: [] },
        ],
      }),
    );
    mockPrisma.demo.update.mockResolvedValue({ id: 'legacy-demo-multi-1', status: DemoStatus.COMPLETED });

    await demoService.completeDemo(
      'legacy-demo-multi-1',
      {
        rating: 5,
        comments: 'Multi-session demo evaluated',
      },
      coordinatorUser,
    );

    // Target booking ID for multi-session must be the parent DemoBooking UUID, not the legacy demo ID
    expect(mockPrisma.demoFeedbackRecord.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { bookingId: 'parent-booking-uuid-999' },
      }),
    );
  });

  // 11. Existing Demo completion gates and permissions remain unchanged
  it('11. enforces completion gate requirements before allowing stage transition to COMPLETED', async () => {
    mockPrisma.demo.findUnique.mockResolvedValue({
      id: 'demo-gate-fail',
      status: DemoStatus.ASSIGNED,
      tutorId: 'user-tutor-1',
      student: { lead: { id: 'lead-1', status: LeadStatus.INTERESTED } },
    });
    mockPrisma.demoBooking.findFirst.mockResolvedValue({
      id: 'booking-gate-fail',
      coordinatorId: coordinatorUser.id,
      operationalStage: DemoOperationalStage.PARENT_CONFIRMATION,
    });
    // Missing required roadmap in completion gate check
    mockPrisma.demoBooking.findUnique.mockResolvedValue({
      id: 'booking-gate-fail',
      operationalStage: DemoOperationalStage.PARENT_CONFIRMATION,
      feedbackRecord: { id: 'fb-1' },
      roadmap: null, // MISSING ROADMAP
      academicPlan: { id: 'ap-1' },
      sessions: [],
      attendances: [],
    });

    await expect(
      demoService.completeDemo(
        'demo-gate-fail',
        {
          rating: 4,
          comments: 'Testing completion gate failure',
        },
        coordinatorUser,
      ),
    ).rejects.toThrow(BadRequestException);

    expect(mockPrisma.demoBooking.update).not.toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ operationalStage: DemoOperationalStage.COMPLETED }),
      }),
    );
  });

  // 12. Unauthorized users are blocked from evaluating demos
  it('12. rejects users who are neither the assigned coordinator, assigned tutor, nor company-wide manager', async () => {
    mockPrisma.demo.findUnique.mockResolvedValue({
      id: 'demo-unauth-1',
      status: DemoStatus.ASSIGNED,
      tutorId: 'different-tutor',
    });
    mockPrisma.demoBooking.findFirst.mockResolvedValue({
      id: 'booking-unauth-1',
      coordinatorId: 'different-coord',
    });
    mockRbac.hasPermissions.mockResolvedValue(false);
    mockRbac.getPermissionsForUser.mockResolvedValue(new Set());

    await expect(
      demoService.completeDemo(
        'demo-unauth-1',
        {
          rating: 5,
          comments: 'Unauthorized completion attempt',
        },
        unauthorizedUser,
      ),
    ).rejects.toThrow(ForbiddenException);
  });
});
