import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import {
  ApplicationStage,
  ApplicationStatus,
  CandidateSource,
  InterviewMode,
  InterviewRecommendation,
  InterviewStatus,
  InterviewType,
  OfferStatus,
  Prisma,
  VacancyStatus,
} from '@prisma/client';

import { AuditService } from '../../common/audit/audit.service';
import { IdGeneratorService } from '../../common/id-generator/id-generator.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuthorizationService } from '../../common/rbac/authorization.service';

import { CandidateService } from './candidate.service';

describe('CandidateService', () => {
  let service: CandidateService;
  let prisma: any;
  let auditService: any;
  let idGenerator: any;
  let authService: any;

  const mockUser1 = {
    id: 'user-recruiter-1',
    email: 'recruiter@elscore.com',
    employee: { firstName: 'Recruiter', lastName: 'HR' },
  };

  const mockUser2 = {
    id: 'user-manager-2',
    email: 'manager@elscore.com',
    employee: { firstName: 'Manager', lastName: 'HR' },
  };

  const mockUser3 = {
    id: 'user-director-3',
    email: 'director@elscore.com',
    employee: { firstName: 'Director', lastName: 'HR' },
  };

  const mockVacancy = {
    id: 'vac-1',
    businessId: 'VAC-0001',
    title: 'Senior Academic Counselor',
    status: VacancyStatus.OPEN,
    budgetMin: new Prisma.Decimal(50000),
    budgetMax: new Prisma.Decimal(80000),
    currency: 'INR',
    targetHeadcount: 2,
    filledHeadcount: 0,
  };

  const mockCandidate = {
    id: 'cand-1',
    businessId: 'CAN-0001',
    fullName: 'Sarah Jenkins',
    email: 'sarah.j@example.com',
    phone: '+971501234567',
    source: CandidateSource.DIRECT_APPLICATION,
    referralDetails: null,
    notes: 'Top candidate',
    createdById: mockUser1.id,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockApplication = {
    id: 'app-1',
    businessId: 'APP-0001',
    candidateId: mockCandidate.id,
    vacancyId: mockVacancy.id,
    stage: ApplicationStage.SCREENING,
    status: ApplicationStatus.APPLIED,
    coverLetter: 'Excited to join',
    resumeUrl: null,
    appliedAt: new Date(),
    rejectionReason: null,
    withdrawnReason: null,
    createdById: mockUser1.id,
    createdAt: new Date(),
    updatedAt: new Date(),
    candidate: mockCandidate,
    vacancy: mockVacancy,
    interviews: [],
    stageHistory: [],
    offers: [],
  };

  const mockInterview = {
    id: 'int-1',
    applicationId: mockApplication.id,
    interviewType: InterviewType.TECHNICAL,
    interviewMode: InterviewMode.ONLINE,
    scheduledAt: new Date('2026-11-05T10:00:00Z'),
    interviewerUserId: mockUser2.id,
    interviewerName: 'Manager HR',
    location: 'https://meet.google.com/xyz',
    status: InterviewStatus.SCHEDULED,
    rating: null,
    recommendation: null,
    feedback: null,
    feedbackSubmittedAt: null,
    createdById: mockUser1.id,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockOffer = {
    id: 'off-1',
    businessId: 'OFF-0001',
    applicationId: mockApplication.id,
    vacancyId: mockVacancy.id,
    version: 1,
    roleTitle: 'Senior Academic Counselor',
    employmentType: 'FULL_TIME',
    workMode: 'ON_SITE',
    location: 'Bangalore Office',
    offeredSalary: new Prisma.Decimal(70000),
    currency: 'INR',
    salaryPeriod: 'ANNUAL',
    proposedStartDate: '2026-12-01',
    offerExpiryDate: '2026-11-20',
    notes: 'Standard allowances included',
    status: OfferStatus.DRAFT,
    requestedById: mockUser1.id,
    lastModifiedById: mockUser1.id,
    approvedById: null,
    approvedAt: null,
    approvalNotes: null,
    sentAt: null,
    responseNotes: null,
    respondedAt: null,
    declineReason: null,
    withdrawalReason: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    application: mockApplication,
    vacancy: mockVacancy,
    requestedBy: mockUser1,
    approvedBy: null,
    versions: [],
  };

  beforeEach(async () => {
    prisma = {
      candidate: {
        create: jest.fn().mockResolvedValue(mockCandidate),
        findUnique: jest.fn().mockResolvedValue(mockCandidate),
        findMany: jest.fn().mockResolvedValue([mockCandidate]),
        count: jest.fn().mockResolvedValue(1),
      },
      vacancy: {
        findUnique: jest.fn().mockResolvedValue(mockVacancy),
      },
      jobApplication: {
        create: jest.fn().mockResolvedValue(mockApplication),
        findUnique: jest.fn().mockResolvedValue(mockApplication),
        findMany: jest.fn().mockResolvedValue([mockApplication]),
        update: jest.fn().mockImplementation((args) => Promise.resolve({ ...mockApplication, ...args.data })),
        count: jest.fn().mockResolvedValue(1),
      },
      candidateInterview: {
        create: jest.fn().mockResolvedValue(mockInterview),
        findUnique: jest.fn().mockResolvedValue(mockInterview),
        update: jest.fn().mockImplementation((args) => Promise.resolve({ ...mockInterview, ...args.data })),
      },
      applicationStageHistory: {
        create: jest.fn().mockResolvedValue({ id: 'hist-1' }),
      },
      jobOffer: {
        create: jest.fn().mockResolvedValue(mockOffer),
        findUnique: jest.fn().mockResolvedValue(mockOffer),
        findFirst: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([mockOffer]),
        update: jest.fn().mockImplementation((args) => Promise.resolve({ ...mockOffer, ...args.data })),
        count: jest.fn().mockResolvedValue(1),
      },
      jobOfferHistory: {
        create: jest.fn().mockResolvedValue({ id: 'off-hist-1' }),
      },
      $transaction: jest.fn().mockImplementation(async (callback) => {
        const tx = {
          $executeRaw: jest.fn().mockResolvedValue(1),
          candidate: prisma.candidate,
          vacancy: prisma.vacancy,
          jobApplication: prisma.jobApplication,
          candidateInterview: prisma.candidateInterview,
          applicationStageHistory: prisma.applicationStageHistory,
          jobOffer: prisma.jobOffer,
          jobOfferHistory: prisma.jobOfferHistory,
        };
        return callback(tx);
      }),
    };

    auditService = {
      recordInTx: jest.fn().mockResolvedValue(undefined),
    };

    idGenerator = {
      nextIdInTx: jest.fn().mockImplementation((_tx, prefix) => Promise.resolve(`${prefix}-0001`)),
    };

    authService = {
      hasPermission: jest.fn().mockResolvedValue(true),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CandidateService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditService, useValue: auditService },
        { provide: IdGeneratorService, useValue: idGenerator },
        { provide: AuthorizationService, useValue: authService },
      ],
    }).compile();

    service = module.get<CandidateService>(CandidateService);
  });

  describe('Candidate Profile Management', () => {
    it('creates a candidate profile with generated business ID and logs audit event', async () => {
      const result = await service.createCandidate(
        {
          fullName: '  Sarah Jenkins  ',
          email: ' SARAH.J@example.COM ',
          phone: '+971501234567',
          source: CandidateSource.DIRECT_APPLICATION,
        },
        mockUser1.id,
      );

      expect(result).toBeDefined();
      expect(idGenerator.nextIdInTx).toHaveBeenCalledWith(expect.anything(), 'CAN');
      expect(prisma.candidate.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          businessId: 'CAN-0001',
          fullName: 'Sarah Jenkins',
          email: 'sarah.j@example.com',
          phone: '+971501234567',
          createdById: mockUser1.id,
        }),
      });
      expect(auditService.recordInTx).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          action: 'CANDIDATE_CREATED',
          actorUserId: mockUser1.id,
        }),
      );
    });

    it('returns candidate details by ID', async () => {
      const result = await service.getCandidate('cand-1');
      expect(result).toEqual(mockCandidate);
    });

    it('throws NotFoundException if candidate does not exist', async () => {
      prisma.candidate.findUnique.mockResolvedValueOnce(null);
      await expect(service.getCandidate('cand-unknown')).rejects.toThrow(NotFoundException);
    });
  });

  describe('Job Application Operations', () => {
    it('creates an application for an OPEN vacancy and records stage history', async () => {
      prisma.jobApplication.findUnique.mockResolvedValueOnce(null); // No duplicate

      const result = await service.createApplication(
        mockVacancy.id,
        { candidateId: mockCandidate.id, coverLetter: 'Hello team' },
        mockUser1.id,
      );

      expect(result).toBeDefined();
      expect(idGenerator.nextIdInTx).toHaveBeenCalledWith(expect.anything(), 'APP');
      expect(prisma.jobApplication.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          businessId: 'APP-0001',
          candidateId: mockCandidate.id,
          vacancyId: mockVacancy.id,
          stage: ApplicationStage.SCREENING,
          status: ApplicationStatus.APPLIED,
        }),
        include: expect.anything(),
      });
      expect(prisma.applicationStageHistory.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          fromStage: null,
          toStage: ApplicationStage.SCREENING,
          toStatus: ApplicationStatus.APPLIED,
        }),
      });
      expect(auditService.recordInTx).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ action: 'APPLICATION_CREATED' }),
      );
    });

    it('rejects application if vacancy is in DRAFT or CANCELLED status', async () => {
      prisma.vacancy.findUnique.mockResolvedValueOnce({
        ...mockVacancy,
        status: VacancyStatus.DRAFT,
      });

      await expect(
        service.createApplication(mockVacancy.id, { candidateId: mockCandidate.id }, mockUser1.id),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects duplicate application if candidate has already applied to this vacancy', async () => {
      prisma.jobApplication.findUnique.mockResolvedValueOnce(mockApplication); // Duplicate exists

      await expect(
        service.createApplication(mockVacancy.id, { candidateId: mockCandidate.id }, mockUser1.id),
      ).rejects.toThrow(BadRequestException);
    });

    it('transitions application stage and requires non-empty rejectionReason when rejecting', async () => {
      await expect(
        service.transitionStage(
          mockApplication.id,
          { stage: ApplicationStage.REJECTED, status: ApplicationStatus.REJECTED, rejectionReason: '   ' },
          mockUser1.id,
        ),
      ).rejects.toThrow(BadRequestException);

      const success = await service.transitionStage(
        mockApplication.id,
        { stage: ApplicationStage.REJECTED, status: ApplicationStatus.REJECTED, rejectionReason: 'Skills mismatch' },
        mockUser1.id,
      );

      expect(success.status).toBe(ApplicationStatus.REJECTED);
      expect(prisma.applicationStageHistory.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          toStage: ApplicationStage.REJECTED,
          toStatus: ApplicationStatus.REJECTED,
        }),
      });
    });

    it('confidentiality: masks interview feedback rating and scores if caller lacks candidate.interview.feedback-read', async () => {
      authService.hasPermission.mockImplementation((_user: string, perm: string) => {
        if (perm === 'candidate.interview.feedback-read') return Promise.resolve(false);
        return Promise.resolve(true);
      });

      prisma.jobApplication.findUnique.mockResolvedValueOnce({
        ...mockApplication,
        interviews: [
          {
            ...mockInterview,
            rating: 5,
            recommendation: InterviewRecommendation.STRONG_HIRE,
            feedback: 'Exceptional counseling skills',
          },
        ],
      });

      const app = await service.getApplication(mockApplication.id, 'user-limited');
      expect(app.interviews[0].rating).toBeNull();
      expect(app.interviews[0].recommendation).toBeNull();
      expect(app.interviews[0].feedback).toBeNull();
    });
  });

  describe('Interviews', () => {
    it('schedules an interview and advances application from APPLIED to INTERVIEWING', async () => {
      const interview = await service.scheduleInterview(
        mockApplication.id,
        {
          interviewType: InterviewType.TECHNICAL,
          interviewMode: InterviewMode.ONLINE,
          scheduledAt: '2026-11-05T10:00:00Z',
          interviewerUserId: mockUser2.id,
        },
        mockUser1.id,
      );

      expect(interview).toBeDefined();
      expect(prisma.jobApplication.update).toHaveBeenCalledWith({
        where: { id: mockApplication.id },
        data: {
          status: ApplicationStatus.INTERVIEWING,
          stage: ApplicationStage.INTERVIEW_ROUND_1,
        },
      });
      expect(auditService.recordInTx).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ action: 'INTERVIEW_SCHEDULED' }),
      );
    });

    it('records interview feedback and marks interview COMPLETED', async () => {
      const result = await service.recordInterviewFeedback(
        mockInterview.id,
        {
          rating: 4,
          recommendation: InterviewRecommendation.HIRE,
          feedback: 'Solid domain expertise and communication',
        },
        mockUser2.id,
      );

      expect(result.status).toBe(InterviewStatus.COMPLETED);
      expect(prisma.candidateInterview.update).toHaveBeenCalledWith({
        where: { id: mockInterview.id },
        data: expect.objectContaining({
          rating: 4,
          recommendation: InterviewRecommendation.HIRE,
          status: InterviewStatus.COMPLETED,
        }),
      });
    });
  });

  describe('Job Offers & Compensation Control', () => {
    it('creates a draft job offer with version 1 and advances application to OFFER_STAGE', async () => {
      const offer = await service.createOffer(
        mockApplication.id,
        {
          roleTitle: 'Senior Academic Counselor',
          offeredSalary: 75000,
          currency: 'INR',
          proposedStartDate: '2026-12-01',
          offerExpiryDate: '2026-11-20',
        },
        mockUser1.id,
      );

      expect(offer).toBeDefined();
      expect(idGenerator.nextIdInTx).toHaveBeenCalledWith(expect.anything(), 'OFF');
      expect(prisma.jobOffer.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          businessId: 'OFF-0001',
          version: 1,
          status: OfferStatus.DRAFT,
          offeredSalary: new Prisma.Decimal(75000),
          proposedStartDate: '2026-12-01',
          offerExpiryDate: '2026-11-20',
        }),
        include: expect.anything(),
      });
      expect(prisma.jobOfferHistory.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          version: 1,
          status: OfferStatus.DRAFT,
          action: 'CREATED',
        }),
      });
      expect(prisma.jobApplication.update).toHaveBeenCalledWith({
        where: { id: mockApplication.id },
        data: {
          stage: ApplicationStage.OFFER_STAGE,
          status: ApplicationStatus.OFFERED,
        },
      });
    });

    it('rejects offer with negative salary', async () => {
      await expect(
        service.createOffer(
          mockApplication.id,
          {
            roleTitle: 'Counselor',
            offeredSalary: -1000,
            proposedStartDate: '2026-12-01',
            offerExpiryDate: '2026-11-20',
          },
          mockUser1.id,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects offer with unsupported currency code', async () => {
      await expect(
        service.createOffer(
          mockApplication.id,
          {
            roleTitle: 'Counselor',
            offeredSalary: 50000,
            currency: 'GBP',
            proposedStartDate: '2026-12-01',
            offerExpiryDate: '2026-11-20',
          },
          mockUser1.id,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects offer with invalid calendar date like Feb 30', async () => {
      await expect(
        service.createOffer(
          mockApplication.id,
          {
            roleTitle: 'Counselor',
            offeredSalary: 50000,
            proposedStartDate: '2026-02-30',
            offerExpiryDate: '2026-02-15',
          },
          mockUser1.id,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects offer when offerExpiryDate is after proposedStartDate', async () => {
      await expect(
        service.createOffer(
          mockApplication.id,
          {
            roleTitle: 'Counselor',
            offeredSalary: 50000,
            proposedStartDate: '2026-11-01',
            offerExpiryDate: '2026-11-15', // After start date!
          },
          mockUser1.id,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('controlled versioning: reviseOffer increments version to 2 and resets to DRAFT', async () => {
      prisma.jobOffer.findUnique.mockResolvedValue({
        ...mockOffer,
        status: OfferStatus.SENT,
        version: 1,
      });

      const revised = await service.reviseOffer(
        mockOffer.id,
        { offeredSalary: 78000 },
        mockUser1.id,
      );

      expect(prisma.jobOffer.update).toHaveBeenCalledWith({
        where: { id: mockOffer.id },
        data: expect.objectContaining({
          version: 2,
          status: OfferStatus.DRAFT,
          offeredSalary: new Prisma.Decimal(78000),
          approvedById: null,
          approvedAt: null,
          sentAt: null,
        }),
        include: expect.anything(),
      });
      expect(prisma.jobOfferHistory.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          version: 2,
          status: OfferStatus.DRAFT,
          action: 'REVISED',
        }),
      });
    });

    it('submits a draft offer for approval', async () => {
      prisma.jobOffer.findUnique.mockResolvedValue(mockOffer);

      const submitted = await service.submitOfferForApproval(mockOffer.id, mockUser1.id);
      expect(submitted.status).toBe(OfferStatus.PENDING_APPROVAL);
      expect(prisma.jobOffer.update).toHaveBeenCalledWith({
        where: { id: mockOffer.id },
        data: { status: OfferStatus.PENDING_APPROVAL },
        include: expect.anything(),
      });
    });

    it('anti-self-approval: blocks offer requester from approving their own job offer', async () => {
      prisma.jobOffer.findUnique.mockResolvedValue({
        ...mockOffer,
        status: OfferStatus.PENDING_APPROVAL,
        requestedById: mockUser1.id,
        lastModifiedById: mockUser1.id,
      });

      await expect(
        service.reviewOffer(mockOffer.id, { action: 'APPROVE' }, mockUser1.id),
      ).rejects.toThrow(ForbiddenException);
    });

    it('SEC-CAN-001: anti-self-approval blocks reviser from approving their own revised offer', async () => {
      // requestedById is mockUser1, but mockUser2 revised the offer (lastModifiedById = mockUser2)
      prisma.jobOffer.findUnique.mockResolvedValue({
        ...mockOffer,
        status: OfferStatus.PENDING_APPROVAL,
        version: 2,
        requestedById: mockUser1.id,
        lastModifiedById: mockUser2.id,
      });

      // mockUser2 attempts to approve their own revision -> FORBIDDEN
      await expect(
        service.reviewOffer(mockOffer.id, { action: 'APPROVE' }, mockUser2.id),
      ).rejects.toThrow(ForbiddenException);

      // Separate manager mockUser3 can approve
      const approved = await service.reviewOffer(
        mockOffer.id,
        { action: 'APPROVE', approvalNotes: 'Director approved revision' },
        mockUser3.id,
      );
      expect(approved.status).toBe(OfferStatus.APPROVED);
    });

    it('approves a pending offer when reviewed by an authorized separate manager', async () => {
      prisma.jobOffer.findUnique.mockResolvedValue({
        ...mockOffer,
        status: OfferStatus.PENDING_APPROVAL,
        requestedById: mockUser1.id,
        lastModifiedById: mockUser1.id,
      });

      const approved = await service.reviewOffer(
        mockOffer.id,
        { action: 'APPROVE', approvalNotes: 'Within budget' },
        mockUser2.id,
      );

      expect(approved.status).toBe(OfferStatus.APPROVED);
      expect(prisma.jobOffer.update).toHaveBeenCalledWith({
        where: { id: mockOffer.id },
        data: expect.objectContaining({
          status: OfferStatus.APPROVED,
          approvedById: mockUser2.id,
        }),
        include: expect.anything(),
      });
    });

    it('rejects offer review if action is REJECT and approvalNotes is empty', async () => {
      prisma.jobOffer.findUnique.mockResolvedValue({
        ...mockOffer,
        status: OfferStatus.PENDING_APPROVAL,
        requestedById: mockUser1.id,
        lastModifiedById: mockUser1.id,
      });

      await expect(
        service.reviewOffer(mockOffer.id, { action: 'REJECT', approvalNotes: '   ' }, mockUser2.id),
      ).rejects.toThrow(BadRequestException);
    });

    it('sends an approved offer to the candidate', async () => {
      prisma.jobOffer.findUnique.mockResolvedValue({
        ...mockOffer,
        status: OfferStatus.APPROVED,
      });

      const sent = await service.sendOffer(mockOffer.id, mockUser1.id);
      expect(sent.status).toBe(OfferStatus.SENT);
      expect(prisma.jobOffer.update).toHaveBeenCalledWith({
        where: { id: mockOffer.id },
        data: expect.objectContaining({
          status: OfferStatus.SENT,
          sentAt: expect.any(Date),
        }),
        include: expect.anything(),
      });
    });

    it('records candidate decline with mandatory declineReason and marks application REJECTED', async () => {
      prisma.jobOffer.findUnique.mockResolvedValue({
        ...mockOffer,
        status: OfferStatus.SENT,
        offerExpiryDate: '2026-12-31',
      });

      await expect(
        service.recordOfferResponse(mockOffer.id, { decision: 'DECLINE', declineReason: '  ' }, mockUser1.id),
      ).rejects.toThrow(BadRequestException);

      const declined = await service.recordOfferResponse(
        mockOffer.id,
        { decision: 'DECLINE', declineReason: 'Accepted alternative offer' },
        mockUser1.id,
      );

      expect(declined.status).toBe(OfferStatus.DECLINED);
      expect(prisma.jobApplication.update).toHaveBeenCalledWith({
        where: { id: mockApplication.id },
        data: { status: ApplicationStatus.REJECTED },
      });
    });

    it('HANDOFF INVARIANT: accepting an offer does NOT create employee, user, or payroll records', async () => {
      prisma.jobOffer.findUnique.mockResolvedValue({
        ...mockOffer,
        status: OfferStatus.SENT,
        offerExpiryDate: '2026-12-31',
      });

      const accepted = await service.recordOfferResponse(
        mockOffer.id,
        { decision: 'ACCEPT', responseNotes: 'Signed offer letter received' },
        mockUser1.id,
      );

      expect(accepted.status).toBe(OfferStatus.ACCEPTED);
      expect(prisma.jobApplication.update).toHaveBeenCalledWith({
        where: { id: mockApplication.id },
        data: {
          status: ApplicationStatus.ACCEPTED,
          stage: ApplicationStage.OFFER_STAGE,
        },
      });

      // Assert that employee and user creation methods were NEVER called
      expect((prisma as any).employee?.create).toBeUndefined();
      expect((prisma as any).user?.create).toBeUndefined();
      expect((prisma as any).employeePayrollItem?.create).toBeUndefined();
    });

    it('rejects candidate response if offer has expired past offerExpiryDate', async () => {
      prisma.jobOffer.findUnique.mockResolvedValue({
        ...mockOffer,
        status: OfferStatus.SENT,
        offerExpiryDate: '2026-01-01', // Expired!
      });

      await expect(
        service.recordOfferResponse(mockOffer.id, { decision: 'ACCEPT' }, mockUser1.id),
      ).rejects.toThrow(BadRequestException);
    });

    it('withdraws an offer with mandatory withdrawalReason and marks application WITHDRAWN', async () => {
      prisma.jobOffer.findUnique.mockResolvedValue({
        ...mockOffer,
        status: OfferStatus.SENT,
      });

      const withdrawn = await service.withdrawOffer(
        mockOffer.id,
        { withdrawalReason: 'Project canceled' },
        mockUser1.id,
      );

      expect(withdrawn.status).toBe(OfferStatus.WITHDRAWN);
      expect(prisma.jobApplication.update).toHaveBeenCalledWith({
        where: { id: mockApplication.id },
        data: { status: ApplicationStatus.WITHDRAWN },
      });
    });

    it('SEC-CAN-002: getOffer does not include raw interview ratings or scorecard feedback', async () => {
      const { interviews: _unused, ...appWithoutInterviews } = mockApplication;
      prisma.jobOffer.findUnique.mockResolvedValue({
        ...mockOffer,
        application: appWithoutInterviews,
      });

      const offer = await service.getOffer(mockOffer.id, mockUser1.id);
      expect(offer).toBeDefined();
      expect((offer as any).interviews).toBeUndefined();
      expect((offer as any).application?.interviews).toBeUndefined();
    });

    it('BUS-CAN-001: rejects createOffer if application is already in ACCEPTED (Phase 6 handoff) status', async () => {
      prisma.jobApplication.findUnique.mockResolvedValueOnce({
        ...mockApplication,
        status: ApplicationStatus.ACCEPTED,
      });

      await expect(
        service.createOffer(
          mockApplication.id,
          {
            roleTitle: 'Counselor',
            offeredSalary: 70000,
            proposedStartDate: '2026-12-01',
            offerExpiryDate: '2026-11-20',
          },
          mockUser1.id,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('BUS-CAN-001: rejects createOffer if an active offer already exists for the application', async () => {
      prisma.jobOffer.findFirst.mockResolvedValueOnce({
        ...mockOffer,
        status: OfferStatus.SENT,
      });

      await expect(
        service.createOffer(
          mockApplication.id,
          {
            roleTitle: 'Counselor',
            offeredSalary: 70000,
            proposedStartDate: '2026-12-01',
            offerExpiryDate: '2026-11-20',
          },
          mockUser1.id,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('BUS-CAN-002: renegotiation allows reviseOffer on a DECLINED offer and revives application to OFFERED', async () => {
      prisma.jobOffer.findUnique.mockResolvedValue({
        ...mockOffer,
        status: OfferStatus.DECLINED,
        version: 1,
      });
      prisma.jobApplication.findUnique.mockResolvedValue({
        ...mockApplication,
        status: ApplicationStatus.REJECTED,
      });

      const revised = await service.reviseOffer(
        mockOffer.id,
        { offeredSalary: 75000 },
        mockUser1.id,
      );

      expect(revised).toBeDefined();
      expect(prisma.jobOffer.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            version: 2,
            status: OfferStatus.DRAFT,
            offeredSalary: new Prisma.Decimal(75000),
          }),
        }),
      );
      expect(prisma.jobApplication.update).toHaveBeenCalledWith({
        where: { id: mockApplication.id },
        data: {
          status: ApplicationStatus.OFFERED,
          stage: ApplicationStage.OFFER_STAGE,
        },
      });
    });

    it('BUS-CAN-002: rejects reviseOffer on an ACCEPTED offer', async () => {
      prisma.jobOffer.findUnique.mockResolvedValue({
        ...mockOffer,
        status: OfferStatus.ACCEPTED,
        version: 1,
      });

      await expect(
        service.reviseOffer(mockOffer.id, { offeredSalary: 75000 }, mockUser1.id),
      ).rejects.toThrow(BadRequestException);
    });

    it('BUS-CAN-003: expireOffer marks offer EXPIRED and reverts application to INTERVIEWING', async () => {
      prisma.jobOffer.findUnique.mockResolvedValue({
        ...mockOffer,
        status: OfferStatus.SENT,
        offerExpiryDate: '2026-01-01', // Already passed expiry
        application: {
          ...mockApplication,
          status: ApplicationStatus.OFFERED,
          stage: ApplicationStage.OFFER_STAGE,
        },
      });
      // No other active offer exists
      prisma.jobOffer.findFirst.mockResolvedValue(null);

      const expired = await service.expireOffer(mockOffer.id, mockUser1.id);
      expect(expired.status).toBe(OfferStatus.EXPIRED);
      expect(prisma.jobApplication.update).toHaveBeenCalledWith({
        where: { id: mockApplication.id },
        data: {
          status: ApplicationStatus.INTERVIEWING,
          stage: ApplicationStage.INTERVIEW_ROUND_1,
        },
      });
      expect(prisma.applicationStageHistory.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          applicationId: mockApplication.id,
          toStage: ApplicationStage.INTERVIEW_ROUND_1,
          toStatus: ApplicationStatus.INTERVIEWING,
        }),
      });
    });

    it('CONC-CAN-001: deterministic lock ordering: application lock acquired before offer lock in reviseOffer', async () => {
      prisma.jobOffer.findUnique.mockResolvedValue({
        ...mockOffer,
        status: OfferStatus.SENT,
        version: 1,
      });

      const lockCalls: string[] = [];
      (prisma.$transaction as jest.Mock).mockImplementationOnce(async (callback) => {
        const tx = {
          $executeRaw: jest.fn().mockImplementation((query) => {
            const raw = JSON.stringify(query);
            if (raw.includes('application-')) lockCalls.push('application-lock');
            if (raw.includes('offer-')) lockCalls.push('offer-lock');
            return Promise.resolve(1);
          }),
          candidate: prisma.candidate,
          vacancy: prisma.vacancy,
          jobApplication: prisma.jobApplication,
          candidateInterview: prisma.candidateInterview,
          applicationStageHistory: prisma.applicationStageHistory,
          jobOffer: prisma.jobOffer,
          jobOfferHistory: prisma.jobOfferHistory,
        };
        return callback(tx);
      });

      await service.reviseOffer(mockOffer.id, { offeredSalary: 78000 }, mockUser1.id);

      expect(lockCalls).toEqual(['application-lock', 'offer-lock']);
    });

    describe('Policy B: Approved Vacancy Salary Cap Enforcement', () => {
      it('creates offer successfully when offeredSalary is within vacancy budgetMax', async () => {
        prisma.jobApplication.findUnique.mockResolvedValueOnce({
          ...mockApplication,
          status: ApplicationStatus.APPLIED,
          vacancy: {
            ...mockVacancy,
            budgetMax: new Prisma.Decimal(80000),
            currency: 'INR',
          },
        });
        prisma.jobOffer.findFirst.mockResolvedValueOnce(null);

        const offer = await service.createOffer(
          mockApplication.id,
          {
            roleTitle: 'Senior Academic Counselor',
            offeredSalary: 75000,
            currency: 'INR',
            proposedStartDate: '2026-12-01',
            offerExpiryDate: '2026-11-20',
          },
          mockUser1.id,
        );

        expect(offer).toBeDefined();
        expect(prisma.jobOffer.create).toHaveBeenCalled();
      });

      it('rejects createOffer when offeredSalary exceeds vacancy budgetMax', async () => {
        prisma.jobApplication.findUnique.mockResolvedValueOnce({
          ...mockApplication,
          status: ApplicationStatus.APPLIED,
          vacancy: {
            ...mockVacancy,
            budgetMax: new Prisma.Decimal(80000),
            currency: 'INR',
          },
        });
        prisma.jobOffer.findFirst.mockResolvedValueOnce(null);

        await expect(
          service.createOffer(
            mockApplication.id,
            {
              roleTitle: 'Senior Academic Counselor',
              offeredSalary: 85000, // Exceeds 80000 cap!
              currency: 'INR',
              proposedStartDate: '2026-12-01',
              offerExpiryDate: '2026-11-20',
            },
            mockUser1.id,
          ),
        ).rejects.toThrow(BadRequestException);
      });

      it('rejects createOffer when offer currency differs from vacancy currency', async () => {
        prisma.jobApplication.findUnique.mockResolvedValueOnce({
          ...mockApplication,
          status: ApplicationStatus.APPLIED,
          vacancy: {
            ...mockVacancy,
            budgetMax: new Prisma.Decimal(80000),
            currency: 'INR',
          },
        });
        prisma.jobOffer.findFirst.mockResolvedValueOnce(null);

        await expect(
          service.createOffer(
            mockApplication.id,
            {
              roleTitle: 'Senior Academic Counselor',
              offeredSalary: 1000,
              currency: 'AED', // Mismatched currency
              proposedStartDate: '2026-12-01',
              offerExpiryDate: '2026-11-20',
            },
            mockUser1.id,
          ),
        ).rejects.toThrow(BadRequestException);
      });

      it('permits createOffer when vacancy has no budgetMax configured', async () => {
        prisma.jobApplication.findUnique.mockResolvedValueOnce({
          ...mockApplication,
          status: ApplicationStatus.APPLIED,
          vacancy: {
            ...mockVacancy,
            budgetMax: null,
            currency: 'INR',
          },
        });
        prisma.jobOffer.findFirst.mockResolvedValueOnce(null);

        const offer = await service.createOffer(
          mockApplication.id,
          {
            roleTitle: 'Senior Academic Counselor',
            offeredSalary: 120000,
            currency: 'INR',
            proposedStartDate: '2026-12-01',
            offerExpiryDate: '2026-11-20',
          },
          mockUser1.id,
        );

        expect(offer).toBeDefined();
        expect(prisma.jobOffer.create).toHaveBeenCalled();
      });

      it('rejects updateOffer when direct edit pushes offeredSalary above budgetMax', async () => {
        prisma.jobOffer.findUnique.mockResolvedValueOnce({
          ...mockOffer,
          status: OfferStatus.DRAFT,
          vacancy: {
            ...mockVacancy,
            budgetMax: new Prisma.Decimal(80000),
            currency: 'INR',
          },
        });

        await expect(
          service.updateOffer(
            mockOffer.id,
            { offeredSalary: 95000 },
            mockUser1.id,
          ),
        ).rejects.toThrow(BadRequestException);
      });

      it('rejects reviseOffer when renegotiated salary pushes offeredSalary above budgetMax', async () => {
        prisma.jobOffer.findUnique.mockResolvedValueOnce({
          ...mockOffer,
          status: OfferStatus.SENT,
          vacancy: {
            ...mockVacancy,
            budgetMax: new Prisma.Decimal(80000),
            currency: 'INR',
          },
        });

        await expect(
          service.reviseOffer(
            mockOffer.id,
            { offeredSalary: 90000 },
            mockUser1.id,
          ),
        ).rejects.toThrow(BadRequestException);
      });

      it('rejects reviewOffer approval when vacancy budget was lowered below offeredSalary while offer was pending', async () => {
        prisma.jobOffer.findUnique.mockResolvedValue({
          ...mockOffer,
          offeredSalary: new Prisma.Decimal(75000),
          currency: 'INR',
          status: OfferStatus.PENDING_APPROVAL,
          requestedById: mockUser1.id,
          lastModifiedById: mockUser1.id,
          vacancy: {
            ...mockVacancy,
            budgetMax: new Prisma.Decimal(70000), // Budget lowered to 70k, below 75k offer!
            currency: 'INR',
          },
        });

        await expect(
          service.reviewOffer(
            mockOffer.id,
            { action: 'APPROVE', approvalNotes: 'Attempting to approve over-cap' },
            mockUser2.id,
          ),
        ).rejects.toThrow(BadRequestException);
      });

      it('approves reviewOffer when offeredSalary remains within current vacancy budgetMax', async () => {
        prisma.jobOffer.findUnique.mockResolvedValue({
          ...mockOffer,
          offeredSalary: new Prisma.Decimal(75000),
          currency: 'INR',
          status: OfferStatus.PENDING_APPROVAL,
          requestedById: mockUser1.id,
          lastModifiedById: mockUser1.id,
          vacancy: {
            ...mockVacancy,
            budgetMax: new Prisma.Decimal(80000),
            currency: 'INR',
          },
        });

        const approved = await service.reviewOffer(
          mockOffer.id,
          { action: 'APPROVE', approvalNotes: 'Within approved limits' },
          mockUser2.id,
        );

        expect(approved.status).toBe(OfferStatus.APPROVED);
      });

      it('rejects reviewOffer approval if vacancy currency differs from offer currency', async () => {
        prisma.jobOffer.findUnique.mockResolvedValue({
          ...mockOffer,
          offeredSalary: new Prisma.Decimal(75000),
          currency: 'INR',
          status: OfferStatus.PENDING_APPROVAL,
          requestedById: mockUser1.id,
          lastModifiedById: mockUser1.id,
          vacancy: {
            ...mockVacancy,
            budgetMax: new Prisma.Decimal(80000),
            currency: 'AED', // Currency mismatch
          },
        });

        await expect(
          service.reviewOffer(
            mockOffer.id,
            { action: 'APPROVE', approvalNotes: 'Approval with currency mismatch' },
            mockUser2.id,
          ),
        ).rejects.toThrow(BadRequestException);
      });
    });
  });
});
