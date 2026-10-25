import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import {
  EmploymentStatus,
  GoalCategory,
  GoalMeasurementMethod,
  GoalStatus,
  PerformanceCycleStatus,
  PerformanceReviewStatus,
  PerformanceReviewType,
  PipObjectiveStatus,
  PipStatus,
  ReviewAcknowledgementStatus,
} from '@prisma/client';

import { AuditService } from '../../common/audit/audit.service';
import { IdGeneratorService } from '../../common/id-generator/id-generator.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { PerformanceService } from './performance.service';

describe('PerformanceService', () => {
  let service: PerformanceService;
  let prisma: any;
  let auditService: any;
  let idGenerator: any;

  const mockHrUserId = 'user-hr-mgr-1';
  const mockManagerUserId = 'user-mgr-1';
  const mockEmployeeUserId = 'user-emp-1';
  const mockOtherUserId = 'user-other-1';

  const mockDepartment = {
    id: 'dept-1',
    code: 'SALES',
    name: 'Sales Department',
    status: 'ACTIVE',
  };

  const mockManagerEmployee = {
    id: 'emp-mgr-1',
    businessId: 'EMP-0001',
    userId: mockManagerUserId,
    departmentId: mockDepartment.id,
    firstName: 'Sarah',
    lastName: 'Connor',
    employmentStatus: EmploymentStatus.ACTIVE,
  };

  const mockEmployee = {
    id: 'emp-1',
    businessId: 'EMP-0002',
    userId: mockEmployeeUserId,
    departmentId: mockDepartment.id,
    firstName: 'John',
    lastName: 'Doe',
    employmentStatus: EmploymentStatus.ACTIVE,
    reportingManagerId: mockManagerEmployee.id,
    department: mockDepartment,
  };

  const mockCycle = {
    id: 'cyc-1',
    cycleCode: 'CYC-0001',
    name: 'October 2026 Monthly Review',
    reviewType: PerformanceReviewType.MONTHLY,
    startDate: '2026-10-01',
    endDate: '2026-10-31',
    dueDate: '2026-11-07',
    status: PerformanceCycleStatus.ACTIVE,
    departmentId: mockDepartment.id,
    createdById: mockHrUserId,
  };

  const mockGoal = {
    id: 'gol-1',
    goalCode: 'GOL-0001',
    employeeId: mockEmployee.id,
    cycleId: mockCycle.id,
    reviewerId: mockManagerEmployee.id,
    title: 'Achieve 20 lead conversions',
    description: 'Target for Q4 marketing campaign',
    category: GoalCategory.SALES,
    measurementMethod: GoalMeasurementMethod.NUMERICAL,
    target: '20',
    actualResult: null,
    measurementPeriod: '2026-10',
    weight: 30,
    evidence: null,
    status: GoalStatus.NOT_STARTED,
    createdById: mockManagerUserId,
    employee: mockEmployee,
    reviewer: mockManagerEmployee,
    cycle: mockCycle,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockReview = {
    id: 'rev-1',
    reviewCode: 'REV-0001',
    employeeId: mockEmployee.id,
    reviewerId: mockManagerEmployee.id,
    cycleId: mockCycle.id,
    period: '2026-10',
    reviewType: PerformanceReviewType.MONTHLY,
    status: PerformanceReviewStatus.DRAFT,
    rating: null,
    strengths: null,
    areasForImprovement: null,
    qualityAssessment: null,
    competencyAssessment: null,
    managerFeedback: null,
    confidentialNotes: 'High potential for promotion to senior counselor.',
    employeeComments: null,
    recommendedTraining: null,
    pipRecommended: false,
    acknowledgementStatus: ReviewAcknowledgementStatus.PENDING,
    acknowledgedAt: null,
    employeeCommentsOnAcknowledgement: null,
    submittedAt: null,
    finalizedAt: null,
    finalizedById: null,
    createdById: mockManagerUserId,
    employee: mockEmployee,
    reviewer: mockManagerEmployee,
    cycle: mockCycle,
    amendments: [],
    pips: [],
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockPip = {
    id: 'pip-1',
    pipCode: 'PIP-0001',
    employeeId: mockEmployee.id,
    managerId: mockManagerEmployee.id,
    reviewId: mockReview.id,
    reason: 'SLA gaps in customer response time',
    performanceGap: 'Average response time was 3 hours instead of 45 mins',
    expectedStandard: 'Average response under 45 mins with 95% adherence',
    supportProvided: 'Daily coaching and morning triage check-ins',
    startDate: '2026-11-01',
    targetCompletionDate: '2026-12-01',
    reviewDate: '2026-11-15',
    progressUpdates: null,
    finalAssessment: null,
    employeeComments: null,
    closureReason: null,
    status: PipStatus.ACTIVE,
    createdById: mockManagerUserId,
    objectives: [
      {
        id: 'obj-1',
        pipId: 'pip-1',
        title: 'Maintain daily outreach speed',
        successCriteria: 'Response log verified daily',
        targetDate: '2026-11-30',
        status: PipObjectiveStatus.PENDING,
      },
    ],
    employee: mockEmployee,
    manager: mockManagerEmployee,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    prisma = {
      $transaction: jest.fn(async (cb) => cb(prisma)),
      $executeRaw: jest.fn().mockResolvedValue(1),
      performanceCycle: {
        create: jest.fn().mockResolvedValue(mockCycle),
        update: jest.fn().mockResolvedValue(mockCycle),
        findUnique: jest.fn().mockResolvedValue(mockCycle),
        findMany: jest.fn().mockResolvedValue([mockCycle]),
        count: jest.fn().mockResolvedValue(1),
      },
      employeeGoal: {
        create: jest.fn().mockResolvedValue(mockGoal),
        update: jest.fn().mockResolvedValue(mockGoal),
        findUnique: jest.fn().mockResolvedValue(mockGoal),
        findMany: jest.fn().mockResolvedValue([mockGoal]),
        count: jest.fn().mockResolvedValue(1),
      },
      performanceReview: {
        create: jest.fn().mockResolvedValue(mockReview),
        update: jest.fn().mockResolvedValue(mockReview),
        findUnique: jest.fn().mockResolvedValue(mockReview),
        findMany: jest.fn().mockResolvedValue([mockReview]),
        count: jest.fn().mockResolvedValue(1),
      },
      performanceReviewAmendment: {
        create: jest.fn().mockResolvedValue({ id: 'amend-1' }),
      },
      performanceImprovementPlan: {
        create: jest.fn().mockResolvedValue(mockPip),
        update: jest.fn().mockResolvedValue(mockPip),
        findUnique: jest.fn().mockResolvedValue(mockPip),
        findMany: jest.fn().mockResolvedValue([mockPip]),
        count: jest.fn().mockResolvedValue(1),
      },
      pipObjective: {
        create: jest.fn().mockResolvedValue({ id: 'obj-1' }),
        update: jest.fn().mockResolvedValue({ id: 'obj-1', status: PipObjectiveStatus.MET }),
        findUnique: jest.fn().mockResolvedValue({ id: 'obj-1', pipId: mockPip.id, status: PipObjectiveStatus.PENDING }),
      },
      employee: {
        findUnique: jest.fn().mockResolvedValue(mockEmployee),
        findFirst: jest.fn().mockImplementation((args: any) => {
          if (args?.where?.userId === mockManagerUserId) {
            return Promise.resolve(mockManagerEmployee);
          }
          if (args?.where?.userId === mockEmployeeUserId) {
            return Promise.resolve(mockEmployee);
          }
          if (args?.where?.userId === mockOtherUserId) {
            return Promise.resolve({
              id: 'emp-other-1',
              businessId: 'EMP-9999',
              userId: mockOtherUserId,
              departmentId: 'dept-other',
              reportingManagerId: null,
            });
          }
          return Promise.resolve(mockManagerEmployee);
        }),
      },
      department: {
        findMany: jest.fn().mockResolvedValue([mockDepartment]),
      },
    };

    auditService = {
      recordInTx: jest.fn().mockResolvedValue(undefined),
    };

    idGenerator = {
      nextIdInTx: jest.fn().mockImplementation((tx, entity) => {
        if (entity === 'CYC') return Promise.resolve('CYC-0001');
        if (entity === 'GOL') return Promise.resolve('GOL-0001');
        if (entity === 'REV') return Promise.resolve('REV-0001');
        if (entity === 'PIP') return Promise.resolve('PIP-0001');
        return Promise.resolve(`${entity}-0001`);
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PerformanceService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditService, useValue: auditService },
        { provide: IdGeneratorService, useValue: idGenerator },
      ],
    }).compile();

    service = module.get<PerformanceService>(PerformanceService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // ===========================================================================
  // 1. CYCLE TESTS
  // ===========================================================================
  describe('Performance Cycles', () => {
    it('creates cycle successfully with CYC-0001 business ID and audit log', async () => {
      const res = await service.createCycle(
        {
          name: 'October 2026 Monthly Review',
          reviewType: PerformanceReviewType.MONTHLY,
          startDate: '2026-10-01',
          endDate: '2026-10-31',
          dueDate: '2026-11-07',
          departmentId: mockDepartment.id,
        },
        mockHrUserId,
      );

      expect(res).toBeDefined();
      expect(idGenerator.nextIdInTx).toHaveBeenCalledWith(expect.anything(), 'CYC');
      expect(prisma.performanceCycle.create).toHaveBeenCalled();
      expect(auditService.recordInTx).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ action: 'PERFORMANCE_CYCLE_CREATED' }),
      );
    });

    it('rejects cycle with invalid date format', async () => {
      await expect(
        service.createCycle(
          {
            name: 'Invalid Date Cycle',
            startDate: 'invalid-date',
            endDate: '2026-10-31',
            dueDate: '2026-11-07',
          },
          mockHrUserId,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects cycle where startDate is after endDate', async () => {
      await expect(
        service.createCycle(
          {
            name: 'Inverted Cycle',
            startDate: '2026-11-01',
            endDate: '2026-10-31',
            dueDate: '2026-11-07',
          },
          mockHrUserId,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects cycle where dueDate is before endDate', async () => {
      await expect(
        service.createCycle(
          {
            name: 'Early Due Date Cycle',
            startDate: '2026-10-01',
            endDate: '2026-10-31',
            dueDate: '2026-10-25',
          },
          mockHrUserId,
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ===========================================================================
  // 2. GOALS TESTS
  // ===========================================================================
  describe('Employee Goals', () => {
    it('creates employee goal with GOL-0001 and audit record', async () => {
      const res = await service.createGoal(
        {
          employeeId: mockEmployee.id,
          title: 'Achieve 20 lead conversions',
          target: '20',
          measurementPeriod: '2026-10',
          weight: 30,
        },
        mockManagerUserId,
      );

      expect(res).toBeDefined();
      expect(idGenerator.nextIdInTx).toHaveBeenCalledWith(expect.anything(), 'GOL');
      expect(prisma.employeeGoal.create).toHaveBeenCalled();
      expect(auditService.recordInTx).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ action: 'EMPLOYEE_GOAL_CREATED' }),
      );
    });

    it('throws NotFoundException if employee does not exist when creating goal', async () => {
      prisma.employee.findUnique.mockResolvedValueOnce(null);

      await expect(
        service.createGoal(
          {
            employeeId: 'non-existent',
            title: 'Goal',
            target: '10',
            measurementPeriod: '2026-10',
          },
          mockManagerUserId,
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('updates goal progress and records audit trail', async () => {
      await service.updateGoal(
        mockGoal.id,
        { actualResult: '22', status: GoalStatus.ACHIEVED },
        mockManagerUserId,
      );

      expect(prisma.employeeGoal.update).toHaveBeenCalled();
      expect(auditService.recordInTx).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ action: 'EMPLOYEE_GOAL_UPDATED' }),
      );
    });

    it('allows employee to view their own goal details via getGoalById', async () => {
      const goal = await service.getGoalById(mockGoal.id, mockEmployeeUserId, false, false);
      expect(goal).toBeDefined();
      expect(goal.id).toBe(mockGoal.id);
    });

    it('rejects goal details access for another employee without permissions (SEC-PERF-001)', async () => {
      await expect(
        service.getGoalById(mockGoal.id, mockOtherUserId, false, false),
      ).rejects.toThrow(ForbiddenException);
    });

    it('allows manager in same department to view employee goal with team permission', async () => {
      const goal = await service.getGoalById(mockGoal.id, mockManagerUserId, false, true);
      expect(goal).toBeDefined();
      expect(goal.id).toBe(mockGoal.id);
    });

    it('rejects manager from another department trying to view goal with team permission', async () => {
      await expect(
        service.getGoalById(mockGoal.id, mockOtherUserId, false, true),
      ).rejects.toThrow(ForbiddenException);
    });

    it('allows organization-wide reader to view goal across departments', async () => {
      const goal = await service.getGoalById(mockGoal.id, mockHrUserId, true, false);
      expect(goal).toBeDefined();
      expect(goal.id).toBe(mockGoal.id);
    });

    it('throws NotFoundException if goal does not exist', async () => {
      prisma.employeeGoal.findUnique.mockResolvedValueOnce(null);
      await expect(
        service.getGoalById('non-existent', mockEmployeeUserId, false, false),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ===========================================================================
  // 3. REVIEWS & SEPARATION OF DUTIES TESTS
  // ===========================================================================
  describe('Performance Reviews & Separation of Duties', () => {
    it('creates review successfully with REV-0001 and default status DRAFT', async () => {
      const res = await service.createReview(
        {
          employeeId: mockEmployee.id,
          period: '2026-10',
        },
        mockManagerUserId,
      );

      expect(res).toBeDefined();
      expect(idGenerator.nextIdInTx).toHaveBeenCalledWith(expect.anything(), 'REV');
      expect(prisma.performanceReview.create).toHaveBeenCalled();
      expect(auditService.recordInTx).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ action: 'PERFORMANCE_REVIEW_CREATED' }),
      );
    });

    it('enforces segregation of duties: rejects when actor is the employee under review (userId check)', async () => {
      await expect(
        service.createReview(
          {
            employeeId: mockEmployee.id,
            period: '2026-10',
          },
          mockEmployeeUserId, // Same as employee.userId
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('enforces segregation of duties: rejects when actor is employee profile match', async () => {
      prisma.employee.findFirst.mockResolvedValueOnce(mockEmployee); // Actor is the employee

      await expect(
        service.createReview(
          {
            employeeId: mockEmployee.id,
            period: '2026-10',
          },
          'some-user-id',
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('rejects self-evaluation by the reviewed employee', async () => {
      await expect(
        service.evaluateReview(
          mockReview.id,
          { rating: 5, managerFeedback: 'Great self evaluation' },
          mockEmployeeUserId, // Reviewed employee trying to evaluate themselves
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('rejects self-finalization by the reviewed employee', async () => {
      await expect(
        service.finalizeReview(
          mockReview.id,
          {
            rating: 5,
            managerFeedback: 'Finalized feedback',
            strengths: 'Everything',
            areasForImprovement: 'None',
          },
          mockEmployeeUserId, // Reviewed employee trying to finalize own review
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('allows manager to evaluate review, transition status to MANAGER_REVIEW, and record ratings and feedback', async () => {
      await service.evaluateReview(
        mockReview.id,
        {
          rating: 4,
          managerFeedback: 'Strong performance across customer interactions.',
          strengths: 'Proactive follow-up',
          areasForImprovement: 'CRM notes documentation',
        },
        mockManagerUserId,
      );

      expect(prisma.performanceReview.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: PerformanceReviewStatus.MANAGER_REVIEW,
            rating: 4,
            managerFeedback: 'Strong performance across customer interactions.',
          }),
        }),
      );
      expect(auditService.recordInTx).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ action: 'PERFORMANCE_REVIEW_EVALUATED' }),
      );
    });

    it('rejects evaluation ratings outside 1-5 scale', async () => {
      await expect(
        service.evaluateReview(
          mockReview.id,
          { rating: 6 },
          mockManagerUserId,
        ),
      ).rejects.toThrow(BadRequestException);

      await expect(
        service.evaluateReview(
          mockReview.id,
          { rating: 0 },
          mockManagerUserId,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('allows reviewed employee to submit self-review comments', async () => {
      await service.updateSelfReview(
        mockReview.id,
        { employeeComments: 'Achieved my outreach target for this cycle.' },
        mockEmployeeUserId, // Reviewed employee
      );

      expect(prisma.performanceReview.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            employeeComments: 'Achieved my outreach target for this cycle.',
            status: PerformanceReviewStatus.MANAGER_REVIEW,
          }),
        }),
      );
      expect(auditService.recordInTx).toHaveBeenCalled();
    });

    it('rejects self-review submission by unauthorized non-employee user', async () => {
      await expect(
        service.updateSelfReview(
          mockReview.id,
          { employeeComments: 'Tampering feedback' },
          mockOtherUserId,
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('rejects finalizing review directly from DRAFT status (FLOW-PERF-001)', async () => {
      prisma.performanceReview.findUnique.mockResolvedValueOnce({
        ...mockReview,
        status: PerformanceReviewStatus.DRAFT,
      });

      await expect(
        service.finalizeReview(
          mockReview.id,
          {
            rating: 4,
            managerFeedback: 'Feedback',
            strengths: 'Strengths',
            areasForImprovement: 'Gaps',
          },
          mockManagerUserId,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects finalizing review directly from SELF_REVIEW status (FLOW-PERF-001)', async () => {
      prisma.performanceReview.findUnique.mockResolvedValueOnce({
        ...mockReview,
        status: PerformanceReviewStatus.SELF_REVIEW,
      });

      await expect(
        service.finalizeReview(
          mockReview.id,
          {
            rating: 4,
            managerFeedback: 'Feedback',
            strengths: 'Strengths',
            areasForImprovement: 'Gaps',
          },
          mockManagerUserId,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('finalizes review from MANAGER_REVIEW status, sets status COMPLETED, and executes transactional advisory lock', async () => {
      prisma.performanceReview.findUnique.mockResolvedValueOnce({
        ...mockReview,
        status: PerformanceReviewStatus.MANAGER_REVIEW,
      });

      await service.finalizeReview(
        mockReview.id,
        {
          rating: 4,
          managerFeedback: 'Exceeded expected outreach volumes consistently.',
          strengths: 'Fast responsiveness, team player',
          areasForImprovement: 'Documentation rigor',
        },
        mockManagerUserId,
      );

      expect(prisma.$executeRaw).toHaveBeenCalled();
      expect(prisma.performanceReview.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: PerformanceReviewStatus.COMPLETED,
            rating: 4,
            finalizedById: mockManagerUserId,
          }),
        }),
      );
      expect(auditService.recordInTx).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ action: 'PERFORMANCE_REVIEW_FINALIZED' }),
      );
    });

    it('rejects finalizing an already finalized review', async () => {
      prisma.performanceReview.findUnique.mockResolvedValueOnce({
        ...mockReview,
        status: PerformanceReviewStatus.COMPLETED,
      });

      await expect(
        service.finalizeReview(
          mockReview.id,
          {
            rating: 4,
            managerFeedback: 'Feedback',
            strengths: 'Strengths',
            areasForImprovement: 'Gaps',
          },
          mockManagerUserId,
        ),
      ).rejects.toThrow(ConflictException);
    });
  });

  // ===========================================================================
  // 4. CONFIDENTIALITY & MASKING TESTS
  // ===========================================================================
  describe('Confidentiality & Notes Masking', () => {
    it('redacts confidentialNotes when review is retrieved by the employee', async () => {
      const res = await service.getReviewById(mockReview.id, mockEmployeeUserId, false, false);

      expect(res.confidentialNotes).toBeNull();
    });

    it('rejects review access when requested by an employee from another department without permissions', async () => {
      await expect(
        service.getReviewById(mockReview.id, mockOtherUserId, false, false),
      ).rejects.toThrow(ForbiddenException);
    });

    it('preserves confidentialNotes when retrieved by designated manager reviewer', async () => {
      const res = await service.getReviewById(mockReview.id, mockManagerUserId, false, true);

      expect(res.confidentialNotes).toBe('High potential for promotion to senior counselor.');
    });

    it('preserves confidentialNotes when retrieved by organization-wide HR reader', async () => {
      const res = await service.getReviewById(mockReview.id, mockHrUserId, true, false);

      expect(res.confidentialNotes).toBe('High potential for promotion to senior counselor.');
    });

    it('redacts confidentialNotes for manager in same department who is NOT the designated reviewer (SEC-PERF-002)', async () => {
      const otherManagerUserId = 'user-mgr-team-other';
      prisma.performanceReview.findUnique.mockResolvedValueOnce({
        ...mockReview,
        employee: mockEmployee,
        reviewer: { ...mockManagerEmployee, userId: 'designated-reviewer-user-id' },
      });
      prisma.employee.findFirst.mockResolvedValueOnce({
        id: 'emp-mgr-colleague',
        userId: otherManagerUserId,
        departmentId: mockDepartment.id,
      });

      const res = await service.getReviewById(mockReview.id, otherManagerUserId, false, true);

      expect(res.confidentialNotes).toBeNull();
    });

    it('redacts confidentialNotes in listReviews when actor is employee or non-reviewer (SEC-PERF-002)', async () => {
      const res = await service.listReviews({}, mockEmployeeUserId, false, false);

      expect(res.data[0].confidentialNotes).toBeNull();
    });

    it('preserves confidentialNotes in listReviews when actor is organization-wide HR reader (SEC-PERF-002)', async () => {
      const res = await service.listReviews({}, mockHrUserId, true, false);

      expect(res.data[0].confidentialNotes).toBe('High potential for promotion to senior counselor.');
    });
  });

  // ===========================================================================
  // 5. ACKNOWLEDGEMENT TESTS
  // ===========================================================================
  describe('Review Acknowledgement', () => {
    it('allows reviewed employee to acknowledge completed review', async () => {
      prisma.performanceReview.findUnique.mockResolvedValueOnce({
        ...mockReview,
        status: PerformanceReviewStatus.COMPLETED,
      });

      const res = await service.acknowledgeReview(
        mockReview.id,
        {
          status: ReviewAcknowledgementStatus.ACKNOWLEDGED,
          comments: 'Received and discussed with manager.',
        },
        mockEmployeeUserId,
      );

      expect(prisma.performanceReview.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: PerformanceReviewStatus.ACKNOWLEDGED,
            acknowledgementStatus: ReviewAcknowledgementStatus.ACKNOWLEDGED,
          }),
        }),
      );
      expect(auditService.recordInTx).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ action: 'PERFORMANCE_REVIEW_ACKNOWLEDGED' }),
      );
    });

    it('rejects acknowledgement if review is not yet COMPLETED', async () => {
      prisma.performanceReview.findUnique.mockResolvedValueOnce({
        ...mockReview,
        status: PerformanceReviewStatus.DRAFT,
      });

      await expect(
        service.acknowledgeReview(
          mockReview.id,
          { status: ReviewAcknowledgementStatus.ACKNOWLEDGED },
          mockEmployeeUserId,
        ),
      ).rejects.toThrow(ConflictException);
    });

    it('rejects acknowledgement by user other than the reviewed employee', async () => {
      prisma.performanceReview.findUnique.mockResolvedValueOnce({
        ...mockReview,
        status: PerformanceReviewStatus.COMPLETED,
      });

      await expect(
        service.acknowledgeReview(
          mockReview.id,
          { status: ReviewAcknowledgementStatus.ACKNOWLEDGED },
          mockManagerUserId, // Manager cannot acknowledge on behalf of employee
        ),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  // ===========================================================================
  // 6. AMENDMENT TESTS
  // ===========================================================================
  describe('Review Amendments', () => {
    it('records immutable amendment record with documented reason', async () => {
      prisma.performanceReview.findUnique.mockResolvedValueOnce({
        ...mockReview,
        status: PerformanceReviewStatus.COMPLETED,
        rating: 3,
      });

      await service.amendReview(
        mockReview.id,
        {
          reason: 'Verified CRM logs showed additional 5 closed deals',
          newRating: 4,
        },
        mockHrUserId,
      );

      expect(prisma.performanceReviewAmendment.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            previousRating: 3,
            newRating: 4,
            reason: 'Verified CRM logs showed additional 5 closed deals',
          }),
        }),
      );
      expect(auditService.recordInTx).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ action: 'PERFORMANCE_REVIEW_AMENDED' }),
      );
    });

    it('rejects amendment without valid documented reason', async () => {
      await expect(
        service.amendReview(
          mockReview.id,
          { reason: '' },
          mockHrUserId,
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ===========================================================================
  // 7. PERFORMANCE IMPROVEMENT PLANS (PIPs) TESTS
  // ===========================================================================
  describe('Performance Improvement Plans (PIPs)', () => {
    it('creates PIP with PIP-0001, objectives, and audit record', async () => {
      const res = await service.createPip(
        {
          employeeId: mockEmployee.id,
          reason: 'SLA gaps in customer response time',
          performanceGap: 'Average response time was 3 hours instead of 45 mins',
          expectedStandard: 'Average response under 45 mins with 95% adherence',
          supportProvided: 'Daily coaching and morning triage check-ins',
          startDate: '2026-11-01',
          targetCompletionDate: '2026-12-01',
          objectives: [
            {
              title: 'Maintain daily outreach speed',
              successCriteria: 'Response log verified daily',
              targetDate: '2026-11-30',
            },
          ],
        },
        mockManagerUserId,
      );

      expect(res).toBeDefined();
      expect(idGenerator.nextIdInTx).toHaveBeenCalledWith(expect.anything(), 'PIP');
      expect(prisma.performanceImprovementPlan.create).toHaveBeenCalled();
      expect(auditService.recordInTx).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ action: 'PIP_CREATED' }),
      );
    });

    it('rejects creating a PIP on oneself', async () => {
      await expect(
        service.createPip(
          {
            employeeId: mockEmployee.id,
            reason: 'Self gap',
            performanceGap: 'Gap',
            expectedStandard: 'Standard',
            supportProvided: 'Support',
            startDate: '2026-11-01',
            targetCompletionDate: '2026-12-01',
            objectives: [
              {
                title: 'Objective',
                successCriteria: 'Criteria',
                targetDate: '2026-11-30',
              },
            ],
          },
          mockEmployeeUserId, // Employee trying to PIP themselves
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('transitions PIP status to IMPROVEMENT_ACHIEVED with closure reason and lock', async () => {
      await service.transitionPipStatus(
        mockPip.id,
        {
          status: PipStatus.IMPROVEMENT_ACHIEVED,
          closureReason: 'Target SLA achieved consistently over 4 consecutive weeks',
        },
        mockManagerUserId,
      );

      expect(prisma.$executeRaw).toHaveBeenCalled();
      expect(prisma.performanceImprovementPlan.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: PipStatus.IMPROVEMENT_ACHIEVED,
            closureReason: 'Target SLA achieved consistently over 4 consecutive weeks',
          }),
        }),
      );
      expect(auditService.recordInTx).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ action: 'PIP_STATUS_TRANSITIONED' }),
      );
    });

    it('rejects closing PIP without documented closure reason or assessment', async () => {
      await expect(
        service.transitionPipStatus(
          mockPip.id,
          { status: PipStatus.CLOSED },
          mockManagerUserId,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('allows employee to view their own PIP details via getPipById', async () => {
      const pip = await service.getPipById(mockPip.id, mockEmployeeUserId, false, false);
      expect(pip).toBeDefined();
      expect(pip.id).toBe(mockPip.id);
    });

    it('rejects PIP details access for another employee without permission (SEC-PERF-004)', async () => {
      await expect(
        service.getPipById(mockPip.id, mockOtherUserId, false, false),
      ).rejects.toThrow(ForbiddenException);
    });

    it('allows manager in same department to view employee PIP with team permission', async () => {
      const pip = await service.getPipById(mockPip.id, mockManagerUserId, false, true);
      expect(pip).toBeDefined();
      expect(pip.id).toBe(mockPip.id);
    });

    it('rejects manager from another department trying to view PIP with team permission', async () => {
      await expect(
        service.getPipById(mockPip.id, mockOtherUserId, false, true),
      ).rejects.toThrow(ForbiddenException);
    });

    it('allows organization-wide reader to view PIP across departments', async () => {
      const pip = await service.getPipById(mockPip.id, mockHrUserId, true, false);
      expect(pip).toBeDefined();
      expect(pip.id).toBe(mockPip.id);
    });

    it('throws NotFoundException if PIP does not exist', async () => {
      prisma.performanceImprovementPlan.findUnique.mockResolvedValueOnce(null);
      await expect(
        service.getPipById('non-existent', mockEmployeeUserId, false, false),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ===========================================================================
  // 8. DASHBOARD TESTS
  // ===========================================================================
  describe('Performance Dashboard', () => {
    it('returns aggregated metrics for reviews, goals, and active PIPs for org-wide readers', async () => {
      const metrics = await service.getDashboardMetrics(mockHrUserId, true, false);

      expect(metrics).toBeDefined();
      expect(metrics.reviewsTotal).toBe(1);
      expect(metrics.reviewsCompleted).toBe(1);
      expect(metrics.goalsOnTrack).toBe(1);
      expect(metrics.activePips).toBe(1);
      expect(metrics.departments).toBeDefined();
      expect(metrics.departments.length).toBeGreaterThan(0);
    });

    it('scopes metrics to employee own records when actor has own read permission (SEC-PERF-003)', async () => {
      const metrics = await service.getDashboardMetrics(mockEmployeeUserId, false, false);

      expect(metrics).toBeDefined();
      expect(prisma.performanceReview.count).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            employeeId: mockEmployee.id,
          }),
        }),
      );
      expect(prisma.employeeGoal.count).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            employeeId: mockEmployee.id,
          }),
        }),
      );
      expect(prisma.performanceImprovementPlan.count).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            employeeId: mockEmployee.id,
          }),
        }),
      );
      expect(metrics.departments).toHaveLength(1);
      expect(prisma.department.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ id: mockDepartment.id }),
        }),
      );
    });

    it('scopes metrics to department when actor has team read permission (SEC-PERF-003)', async () => {
      const metrics = await service.getDashboardMetrics(mockManagerUserId, false, true);

      expect(metrics).toBeDefined();
      expect(prisma.performanceReview.count).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: expect.arrayContaining([
              { employee: { departmentId: mockDepartment.id } },
            ]),
          }),
        }),
      );
      expect(prisma.employeeGoal.count).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: expect.arrayContaining([
              { employee: { departmentId: mockDepartment.id } },
            ]),
          }),
        }),
      );
      expect(prisma.performanceImprovementPlan.count).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: expect.arrayContaining([
              { employee: { departmentId: mockDepartment.id } },
            ]),
          }),
        }),
      );
      expect(metrics.departments).toBeDefined();
    });
  });
});
