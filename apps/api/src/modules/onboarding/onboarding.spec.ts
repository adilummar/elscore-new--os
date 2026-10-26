import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import {
  ApplicationStage,
  ApplicationStatus,
  CompensationRequestStatus,
  DocumentVerificationStatus,
  EmploymentStatus,
  EmploymentType,
  OfferStatus,
  OnboardingCaseStatus,
  OnboardingDocumentType,
  OnboardingTaskCategory,
  OnboardingTaskStatus,
  Prisma,
  ProbationReviewOutcome,
  UserStatus,
} from '@prisma/client';

import { AuditService } from '../../common/audit/audit.service';
import { IdGeneratorService } from '../../common/id-generator/id-generator.service';
import { PrismaService } from '../../common/prisma/prisma.service';

import {
  CancelOnboardingDto,
  CreateOnboardingCaseDto,
  CreateProbationReviewDto,
  CreateTaskDto,
  FinalizeOnboardingDto,
  UpdateOnboardingCaseDto,
  UpdateTaskDto,
  UploadDocumentDto,
  VerifyDocumentDto,
} from './dto';
import { OnboardingService } from './onboarding.service';
import { OnboardingStorageService } from './onboarding-storage.service';

describe('OnboardingService', () => {
  let service: OnboardingService;
  let prisma: any;
  let auditService: any;
  let idGenerator: any;

  const mockActorUserId = 'user-hr-exec-1';
  const mockCeoUserId = 'user-ceo-1';

  const mockDepartment = {
    id: 'dept-1',
    code: 'ACADEMICS',
    name: 'Academics Department',
  };

  const mockRole = {
    id: 'role-counselor',
    code: 'ACADEMIC_COUNSELOR',
    name: 'Academic Counselor',
    isProtected: false,
  };

  const mockCandidate = {
    id: 'cand-1',
    businessId: 'CAN-0001',
    fullName: 'Robert Sterling',
    email: 'robert.s@example.com',
    phone: '+919876543210',
  };

  const mockVacancy = {
    id: 'vac-1',
    businessId: 'VAC-0001',
    title: 'Senior Academic Counselor',
    departmentId: mockDepartment.id,
    roleId: mockRole.id,
    department: mockDepartment,
    role: mockRole,
  };

  const mockOffer = {
    id: 'off-1',
    businessId: 'OFF-0001',
    applicationId: 'app-1',
    vacancyId: mockVacancy.id,
    roleTitle: 'Senior Academic Counselor',
    employmentType: EmploymentType.FULL_TIME,
    offeredSalary: new Prisma.Decimal(720000), // Annual 7,20,000 INR -> 60,000/mo
    currency: 'INR',
    salaryPeriod: 'ANNUAL',
    proposedStartDate: '2026-11-15',
    offerExpiryDate: '2026-11-01',
    status: OfferStatus.ACCEPTED,
    createdAt: new Date(),
  };

  const mockApplication = {
    id: 'app-1',
    businessId: 'APP-0001',
    candidateId: mockCandidate.id,
    vacancyId: mockVacancy.id,
    stage: ApplicationStage.OFFER_STAGE,
    status: ApplicationStatus.ACCEPTED,
    candidate: mockCandidate,
    vacancy: mockVacancy,
    offers: [mockOffer],
    onboardingCase: null as any,
  };

  const mockOnboardingCase = {
    id: 'case-1',
    businessId: 'ONB-0001',
    applicationId: mockApplication.id,
    offerId: mockOffer.id,
    employeeId: null,
    status: OnboardingCaseStatus.IN_PROGRESS,
    targetJoiningDate: '2026-11-15',
    confirmedJoiningDate: null,
    probationDurationMonths: 3,
    notes: 'Initial notes',
    cancellationReason: null,
    createdById: mockActorUserId,
    finalizedById: null,
    finalizedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    application: mockApplication,
    offer: mockOffer,
    documents: [] as any[],
    tasks: [] as any[],
  };

  const mockDocument = {
    id: 'doc-1',
    caseId: mockOnboardingCase.id,
    documentType: OnboardingDocumentType.PASSPORT,
    title: 'Passport Copy',
    filePath: 'uploads/onboarding/cases/passport.pdf',
    fileKey: 'passport.pdf',
    fileName: 'robert_passport.pdf',
    fileSize: 1048576,
    mimeType: 'application/pdf',
    status: DocumentVerificationStatus.PENDING,
    verifiedById: null,
    verifiedAt: null,
    verificationNotes: null,
    uploadedById: mockActorUserId,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockTask = {
    id: 'task-1',
    caseId: mockOnboardingCase.id,
    title: 'Setup Official Email and System Accounts',
    category: OnboardingTaskCategory.IT_SETUP,
    assignedToUserId: null,
    dueDate: '2026-11-14',
    status: OnboardingTaskStatus.PENDING,
    completedAt: null,
    completedById: null,
    notes: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockEmployee = {
    id: 'emp-1',
    businessId: 'EMP-0001',
    userId: 'user-emp-1',
    departmentId: mockDepartment.id,
    employmentStatus: EmploymentStatus.PROBATION,
    employmentType: EmploymentType.FULL_TIME,
    firstName: 'Robert',
    lastName: 'Sterling',
    phone: '+919876543210',
    joinedAt: new Date('2026-11-15T00:00:00.000Z'),
    jobTitle: 'Senior Academic Counselor',
    personalEmail: 'robert.s@example.com',
    probationEndDate: '2027-02-15',
    confirmationDate: null,
    user: { id: 'user-emp-1', email: 'robert.s@example.com', status: UserStatus.PENDING_SETUP },
  };

  beforeEach(async () => {
    prisma = {
      $transaction: jest.fn().mockImplementation((cb) => cb(prisma)),
      $executeRaw: jest.fn().mockResolvedValue(1),
      jobApplication: {
        findMany: jest.fn().mockResolvedValue([mockApplication]),
        findUnique: jest.fn().mockResolvedValue(mockApplication),
        update: jest.fn().mockImplementation((args) => Promise.resolve({ ...mockApplication, ...args.data })),
      },
      applicationStageHistory: {
        create: jest.fn().mockResolvedValue({ id: 'hist-1' }),
      },
      onboardingCase: {
        findMany: jest.fn().mockResolvedValue([mockOnboardingCase]),
        findUnique: jest.fn().mockImplementation((args) => {
          if (args.where?.id) return Promise.resolve(mockOnboardingCase);
          return Promise.resolve(null);
        }),
        count: jest.fn().mockResolvedValue(1),
        create: jest.fn().mockImplementation((args) => Promise.resolve({ ...mockOnboardingCase, ...args.data })),
        update: jest.fn().mockImplementation((args) => Promise.resolve({ ...mockOnboardingCase, ...args.data })),
      },
      onboardingDocument: {
        findMany: jest.fn().mockResolvedValue([mockDocument]),
        findUnique: jest.fn().mockResolvedValue(mockDocument),
        findFirst: jest.fn().mockResolvedValue(mockDocument),
        create: jest.fn().mockImplementation((args) => Promise.resolve({ ...mockDocument, ...args.data })),
        update: jest.fn().mockImplementation((args) => Promise.resolve({ ...mockDocument, ...args.data })),
      },
      onboardingTask: {
        findMany: jest.fn().mockResolvedValue([mockTask]),
        findFirst: jest.fn().mockResolvedValue(mockTask),
        create: jest.fn().mockImplementation((args) => Promise.resolve({ ...mockTask, ...args.data })),
        update: jest.fn().mockImplementation((args) => Promise.resolve({ ...mockTask, ...args.data })),
      },
      employee: {
        findUnique: jest.fn().mockResolvedValue(mockEmployee),
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue(mockEmployee),
        update: jest.fn().mockImplementation((args) => Promise.resolve({ ...mockEmployee, ...args.data })),
      },
      employeeStatusHistory: {
        create: jest.fn().mockResolvedValue({ id: 'esh-1' }),
      },
      employeeProbationReview: {
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn().mockImplementation((args) => Promise.resolve({ id: 'rev-1', ...args.data })),
      },
      employeeCompensationChangeRequest: {
        create: jest.fn().mockResolvedValue({ id: 'comp-req-1' }),
      },
      user: {
        findMany: jest.fn().mockResolvedValue([{ id: mockCeoUserId }]),
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: 'user-emp-1', email: mockCandidate.email }),
        update: jest.fn().mockResolvedValue({ id: 'user-emp-1', status: UserStatus.SUSPENDED }),
      },
      role: {
        findFirst: jest.fn().mockResolvedValue(mockRole),
        findUnique: jest.fn().mockImplementation((args) => {
          if (!args?.where?.id) return Promise.resolve(null);
          return Promise.resolve({ ...mockRole, id: args.where.id });
        }),
      },
      userRole: {
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
      notification: {
        create: jest.fn().mockResolvedValue({ id: 'notif-1' }),
      },
    };

    auditService = {
      recordInTx: jest.fn().mockResolvedValue(undefined),
    };

    idGenerator = {
      nextIdInTx: jest.fn().mockImplementation((tx, entity) => {
        if (entity === 'ONB') return Promise.resolve('ONB-0001');
        if (entity === 'EMP') return Promise.resolve('EMP-0001');
        return Promise.resolve(`${entity}-0001`);
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OnboardingService,
        OnboardingStorageService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditService, useValue: auditService },
        { provide: IdGeneratorService, useValue: idGenerator },
      ],
    }).compile();

    service = module.get<OnboardingService>(OnboardingService);
  });

  describe('listAcceptedApplicationsReadyForOnboarding', () => {
    it('returns applications that have ACCEPTED status and no onboarding case', async () => {
      const result = await service.listAcceptedApplicationsReadyForOnboarding();
      expect(result).toHaveLength(1);
      expect(prisma.jobApplication.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            status: ApplicationStatus.ACCEPTED,
            onboardingCase: null,
          },
        }),
      );
    });
  });

  describe('createCase', () => {
    const validDto: CreateOnboardingCaseDto = {
      applicationId: mockApplication.id,
      targetJoiningDate: '2026-11-15',
      probationDurationMonths: 3,
      notes: 'Standard onboarding',
    };

    it('successfully opens an onboarding case, assigns ONB ID, and seeds standard tasks', async () => {
      const result = await service.createCase(validDto, mockActorUserId);

      expect(idGenerator.nextIdInTx).toHaveBeenCalledWith(expect.anything(), 'ONB');
      expect(prisma.onboardingCase.create).toHaveBeenCalled();
      // Should seed the 8 standard onboarding tasks
      expect(prisma.onboardingTask.create).toHaveBeenCalledTimes(8);
      expect(auditService.recordInTx).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          action: 'ONBOARDING_CASE_CREATED',
          entityType: 'OnboardingCase',
          actorUserId: mockActorUserId,
        }),
      );
      expect(result.businessId).toBe('ONB-0001');
    });

    it('rejects targetJoiningDate with invalid calendar format or impossible date (e.g. 2026-02-30)', async () => {
      await expect(
        service.createCase({ ...validDto, targetJoiningDate: '2026-02-30' }, mockActorUserId),
      ).rejects.toThrow(BadRequestException);

      await expect(
        service.createCase({ ...validDto, targetJoiningDate: 'invalid-date' }, mockActorUserId),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws NotFoundException if JobApplication does not exist', async () => {
      prisma.jobApplication.findUnique.mockResolvedValueOnce(null);

      await expect(service.createCase(validDto, mockActorUserId)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('throws BadRequestException if JobApplication status is not ACCEPTED', async () => {
      prisma.jobApplication.findUnique.mockResolvedValueOnce({
        ...mockApplication,
        status: ApplicationStatus.INTERVIEWING,
      });

      await expect(service.createCase(validDto, mockActorUserId)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('throws BadRequestException if JobApplication has no accepted offer', async () => {
      prisma.jobApplication.findUnique.mockResolvedValueOnce({
        ...mockApplication,
        offers: [],
      });

      await expect(service.createCase(validDto, mockActorUserId)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('throws ConflictException if an onboarding case already exists for the application', async () => {
      prisma.jobApplication.findUnique.mockResolvedValueOnce({
        ...mockApplication,
        onboardingCase: { businessId: 'ONB-0001' },
      });

      await expect(service.createCase(validDto, mockActorUserId)).rejects.toThrow(
        ConflictException,
      );
    });

    it('throws ConflictException if an onboarding case already exists for the offer', async () => {
      prisma.onboardingCase.findUnique.mockResolvedValueOnce({
        businessId: 'ONB-0002',
      });

      await expect(service.createCase(validDto, mockActorUserId)).rejects.toThrow(
        ConflictException,
      );
    });
  });

  describe('updateCase', () => {
    const updateDto: UpdateOnboardingCaseDto = {
      targetJoiningDate: '2026-11-20',
      probationDurationMonths: 6,
    };

    it('successfully updates joining date and probation months', async () => {
      const result = await service.updateCase(mockOnboardingCase.id, updateDto, mockActorUserId);

      expect(prisma.onboardingCase.update).toHaveBeenCalled();
      expect(auditService.recordInTx).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ action: 'ONBOARDING_CASE_UPDATED' }),
      );
      expect(result).toBeDefined();
    });

    it('rejects impossible calendar date during update', async () => {
      await expect(
        service.updateCase(
          mockOnboardingCase.id,
          { targetJoiningDate: '2026-04-31' },
          mockActorUserId,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException if updating a COMPLETED onboarding case', async () => {
      prisma.onboardingCase.findUnique.mockResolvedValueOnce({
        ...mockOnboardingCase,
        status: OnboardingCaseStatus.COMPLETED,
      });

      await expect(
        service.updateCase(mockOnboardingCase.id, updateDto, mockActorUserId),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('uploadDocument & verifyDocument (SEC-ONB-001)', () => {
    const uploadDto: UploadDocumentDto = {
      documentType: OnboardingDocumentType.PASSPORT,
      title: 'Passport Scan',
    };

    const validPdfBuffer = Buffer.from(
      '%PDF-1.4\n%âãÏÓ\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF',
    );
    const validPdfFile = {
      fieldname: 'file',
      originalname: 'robert_passport.pdf',
      encoding: '7bit',
      mimetype: 'application/pdf',
      size: validPdfBuffer.length,
      buffer: validPdfBuffer,
    };

    const validPngBuffer = Buffer.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
    ]);
    const validPngFile = {
      fieldname: 'file',
      originalname: 'scan.png',
      encoding: '7bit',
      mimetype: 'image/png',
      size: validPngBuffer.length,
      buffer: validPngBuffer,
    };

    const validJpegBuffer = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
    const validJpegFile = {
      fieldname: 'file',
      originalname: 'photo.jpg',
      encoding: '7bit',
      mimetype: 'image/jpeg',
      size: validJpegBuffer.length,
      buffer: validJpegBuffer,
    };

    it('successfully uploads valid PDF document and sets status to PENDING with server-controlled paths', async () => {
      const doc = await service.uploadDocument(
        mockOnboardingCase.id,
        uploadDto,
        validPdfFile,
        mockActorUserId,
      );

      expect(prisma.onboardingDocument.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: DocumentVerificationStatus.PENDING,
            documentType: OnboardingDocumentType.PASSPORT,
            mimeType: 'application/pdf',
            fileName: 'robert_passport.pdf',
            fileKey: expect.stringContaining(`cases/${mockOnboardingCase.id}/`),
          }),
        }),
      );
      expect(auditService.recordInTx).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ action: 'ONBOARDING_DOCUMENT_UPLOADED' }),
      );
      expect(doc).toBeDefined();
    });

    it('successfully uploads PNG and JPEG documents', async () => {
      await service.uploadDocument(
        mockOnboardingCase.id,
        { ...uploadDto, documentType: OnboardingDocumentType.NATIONAL_ID },
        validPngFile,
        mockActorUserId,
      );

      await service.uploadDocument(
        mockOnboardingCase.id,
        { ...uploadDto, documentType: OnboardingDocumentType.DEGREE_CERTIFICATE },
        validJpegFile,
        mockActorUserId,
      );

      expect(prisma.onboardingDocument.create).toHaveBeenCalledTimes(2);
    });

    it('rejects upload when binary file is missing or has empty buffer', async () => {
      await expect(
        service.uploadDocument(mockOnboardingCase.id, uploadDto, null as any, mockActorUserId),
      ).rejects.toThrow(BadRequestException);

      await expect(
        service.uploadDocument(
          mockOnboardingCase.id,
          uploadDto,
          { ...validPdfFile, buffer: Buffer.alloc(0) },
          mockActorUserId,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects upload when file exceeds 10MB limit', async () => {
      const hugeBuffer = Buffer.alloc(11 * 1024 * 1024);
      hugeBuffer[0] = 0x25;
      hugeBuffer[1] = 0x50;
      hugeBuffer[2] = 0x44;
      hugeBuffer[3] = 0x46;
      hugeBuffer[4] = 0x2d;

      await expect(
        service.uploadDocument(
          mockOnboardingCase.id,
          uploadDto,
          { ...validPdfFile, buffer: hugeBuffer },
          mockActorUserId,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects forged MIME type: claimed application/pdf but bytes are plain text/HTML script', async () => {
      const forgedBuffer = Buffer.from('<html><script>alert("hacked")</script></html>');
      await expect(
        service.uploadDocument(
          mockOnboardingCase.id,
          uploadDto,
          { ...validPdfFile, buffer: forgedBuffer },
          mockActorUserId,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects upload if magic bytes match image/png but claimed mimeType is application/pdf', async () => {
      await expect(
        service.uploadDocument(
          mockOnboardingCase.id,
          uploadDto,
          { ...validPdfFile, buffer: validPngBuffer, mimetype: 'application/pdf' },
          mockActorUserId,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('sanitizes unsafe user filename with path traversal sequences', async () => {
      const traversalFile = {
        ...validPdfFile,
        originalname: '../../../../etc/passwd.pdf',
      };

      await service.uploadDocument(
        mockOnboardingCase.id,
        uploadDto,
        traversalFile,
        mockActorUserId,
      );

      expect(prisma.onboardingDocument.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            fileName: 'passwd.pdf',
          }),
        }),
      );
    });

    it('rejects upload if onboarding case is already COMPLETED', async () => {
      prisma.onboardingCase.findUnique.mockResolvedValueOnce({
        ...mockOnboardingCase,
        status: OnboardingCaseStatus.COMPLETED,
      });

      await expect(
        service.uploadDocument(mockOnboardingCase.id, uploadDto, validPdfFile, mockActorUserId),
      ).rejects.toThrow(BadRequestException);
    });

    it('successfully verifies a document with notes', async () => {
      const verifyDto: VerifyDocumentDto = {
        status: DocumentVerificationStatus.VERIFIED,
        verificationNotes: 'Verified against passport portal',
      };

      const result = await service.verifyDocument(
        mockOnboardingCase.id,
        mockDocument.id,
        verifyDto,
        mockActorUserId,
      );

      expect(prisma.onboardingDocument.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: DocumentVerificationStatus.VERIFIED,
            verifiedById: mockActorUserId,
          }),
        }),
      );
      expect(auditService.recordInTx).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ action: 'ONBOARDING_DOCUMENT_VERIFIED' }),
      );
      expect(result).toBeDefined();
    });

    it('throws NotFoundException if document does not belong to the case', async () => {
      prisma.onboardingDocument.findFirst.mockResolvedValueOnce(null);

      await expect(
        service.verifyDocument(
          mockOnboardingCase.id,
          'non-existent-doc',
          { status: DocumentVerificationStatus.VERIFIED },
          mockActorUserId,
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('getDocumentDownload: throws ForbiddenException when requesting cross-case document', async () => {
      prisma.onboardingDocument.findUnique.mockResolvedValueOnce({
        ...mockDocument,
        caseId: 'other-case-999',
      });

      await expect(
        service.getDocumentDownload(mockOnboardingCase.id, mockDocument.id, mockActorUserId),
      ).rejects.toThrow(ForbiddenException);
    });

    it('getDocumentDownload: throws NotFoundException when document does not exist', async () => {
      prisma.onboardingDocument.findUnique.mockResolvedValueOnce(null);

      await expect(
        service.getDocumentDownload(mockOnboardingCase.id, 'non-existent', mockActorUserId),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('createTask & updateTask', () => {
    it('creates an onboarding checklist task', async () => {
      const taskDto: CreateTaskDto = {
        title: 'Workspace Allocation',
        category: OnboardingTaskCategory.WORKSPACE,
        dueDate: '2026-11-15',
      };

      const result = await service.createTask(mockOnboardingCase.id, taskDto, mockActorUserId);

      expect(prisma.onboardingTask.create).toHaveBeenCalled();
      expect(auditService.recordInTx).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ action: 'ONBOARDING_TASK_CREATED' }),
      );
      expect(result).toBeDefined();
    });

    it('updates task to COMPLETED and records completedAt and completedById', async () => {
      const updateTaskDto: UpdateTaskDto = {
        status: OnboardingTaskStatus.COMPLETED,
        notes: 'Workspace desk 4B allocated with ThinkPad laptop',
      };

      const result = await service.updateTask(
        mockOnboardingCase.id,
        mockTask.id,
        updateTaskDto,
        mockActorUserId,
      );

      expect(prisma.onboardingTask.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: OnboardingTaskStatus.COMPLETED,
            completedById: mockActorUserId,
            completedAt: expect.any(Date),
          }),
        }),
      );
      expect(auditService.recordInTx).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ action: 'ONBOARDING_TASK_UPDATED' }),
      );
      expect(result).toBeDefined();
    });
  });

  describe('cancelOnboarding', () => {
    it('cancels case as WITHDRAWN, updates JobApplication status, and creates stage history', async () => {
      const cancelDto: CancelOnboardingDto = {
        status: OnboardingCaseStatus.WITHDRAWN,
        reason: 'Candidate accepted another job offer before joining.',
      };

      const result = await service.cancelOnboarding(
        mockOnboardingCase.id,
        cancelDto,
        mockActorUserId,
      );

      expect(prisma.onboardingCase.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: OnboardingCaseStatus.WITHDRAWN,
            cancellationReason: cancelDto.reason,
          }),
        }),
      );
      expect(prisma.jobApplication.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: ApplicationStatus.WITHDRAWN,
          }),
        }),
      );
      expect(prisma.applicationStageHistory.create).toHaveBeenCalled();
      expect(auditService.recordInTx).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ action: 'ONBOARDING_CANCELLED' }),
      );
      expect(result).toBeDefined();
    });

    it('cancels case as NO_SHOW and marks application as REJECTED', async () => {
      const cancelDto: CancelOnboardingDto = {
        status: OnboardingCaseStatus.NO_SHOW,
        reason: 'Candidate did not report to office on start date.',
      };

      await service.cancelOnboarding(mockOnboardingCase.id, cancelDto, mockActorUserId);

      expect(prisma.jobApplication.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: ApplicationStatus.REJECTED,
          }),
        }),
      );
    });

    it('throws BadRequestException if trying to cancel an already finalized case with employee record', async () => {
      prisma.onboardingCase.findUnique.mockResolvedValueOnce({
        ...mockOnboardingCase,
        status: OnboardingCaseStatus.COMPLETED,
        employeeId: 'emp-1',
      });

      await expect(
        service.cancelOnboarding(
          mockOnboardingCase.id,
          { status: OnboardingCaseStatus.WITHDRAWN, reason: 'Trying to cancel' },
          mockActorUserId,
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('finalizeOnboarding (Core Workflow)', () => {
    const finalizeDto: FinalizeOnboardingDto = {
      confirmedJoiningDate: '2026-11-15',
      emergencyContactName: 'Jane Sterling',
      emergencyContactPhone: '+919876543299',
      emergencyContactRelation: 'Spouse',
      personalEmail: 'robert.personal@example.com',
      dateOfBirth: '1992-08-20',
      gender: 'MALE',
      address: '124 Indiranagar, Bangalore, India',
    };

    const readyCase = {
      ...mockOnboardingCase,
      tasks: [
        { ...mockTask, id: 't-1', status: OnboardingTaskStatus.COMPLETED },
      ],
      documents: [
        {
          ...mockDocument,
          id: 'd-id-1',
          documentType: OnboardingDocumentType.PASSPORT,
          status: DocumentVerificationStatus.VERIFIED,
        },
        {
          ...mockDocument,
          id: 'd-offer-1',
          documentType: OnboardingDocumentType.SIGNED_OFFER_LETTER,
          status: DocumentVerificationStatus.VERIFIED,
        },
      ],
    };

    it('finalizes onboarding: creates User (PENDING_SETUP, mustChangePassword), Employee (EMP-0001, PROBATION), transitions Application stage to HIRED, creates Phase 2 Compensation Request (PENDING) with correct monthly salary calculation, and notifies CEOs', async () => {
      prisma.onboardingCase.findUnique.mockResolvedValue(readyCase);

      const result = await service.finalizeOnboarding(
        mockOnboardingCase.id,
        finalizeDto,
        mockActorUserId,
      );

      // 1. Deadlock-free sorted advisory lock verification
      expect(prisma.$executeRaw).toHaveBeenCalled();

      // 2. User account creation with PENDING_SETUP and mustChangePassword
      expect(prisma.user.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            email: mockCandidate.email.toLowerCase(),
            status: UserStatus.PENDING_SETUP,
            mustChangePassword: true,
            userRoles: expect.objectContaining({
              create: expect.objectContaining({
                roleId: mockRole.id,
              }),
            }),
          }),
        }),
      );

      // 3. Sequential EMP-#### ID generation
      expect(idGenerator.nextIdInTx).toHaveBeenCalledWith(expect.anything(), 'EMP');

      // 4. Employee record creation on PROBATION
      expect(prisma.employee.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            businessId: 'EMP-0001',
            employmentStatus: EmploymentStatus.PROBATION,
            firstName: 'Robert',
            lastName: 'Sterling',
            probationEndDate: '2027-02-15', // 3 months from 2026-11-15
          }),
        }),
      );

      // 5. Initial status history recorded
      expect(prisma.employeeStatusHistory.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            newStatus: EmploymentStatus.PROBATION,
            effectiveDate: '2026-11-15',
          }),
        }),
      );

      // 6. Transition JobApplication stage to HIRED and log history
      expect(prisma.jobApplication.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { stage: ApplicationStage.HIRED },
        }),
      );
      expect(prisma.applicationStageHistory.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            toStage: ApplicationStage.HIRED,
          }),
        }),
      );

      // 7. Phase 2 Compensation Request integration:
      // Annual 7,20,000 / 12 = 60,000 monthly base salary
      expect(prisma.employeeCompensationChangeRequest.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            employeeId: mockEmployee.id,
            requestedBaseSalary: new Prisma.Decimal(60000),
            currency: 'INR',
            paymentFrequency: 'MONTHLY',
            effectiveDate: '2026-11-15',
            status: CompensationRequestStatus.PENDING,
            requestedByUserId: mockActorUserId,
          }),
        }),
      );

      // 8. CEO notification triggered
      expect(prisma.notification.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            recipientUserId: mockCeoUserId,
            type: 'COMPENSATION_CHANGE_REQUESTED',
          }),
        }),
      );

      // 9. Case updated to COMPLETED with employeeId and audit log
      expect(prisma.onboardingCase.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: OnboardingCaseStatus.COMPLETED,
            employeeId: mockEmployee.id,
            finalizedById: mockActorUserId,
          }),
        }),
      );
      expect(auditService.recordInTx).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ action: 'ONBOARDING_FINALIZED' }),
      );

      expect(result).toBeDefined();
    });

    it('uses an explicit roleId instead of the vacancy role', async () => {
      prisma.onboardingCase.findUnique.mockResolvedValue(readyCase);

      await service.finalizeOnboarding(
        mockOnboardingCase.id,
        { ...finalizeDto, roleId: 'role-explicit' },
        mockActorUserId,
      );

      expect(prisma.user.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            userRoles: expect.objectContaining({
              create: expect.objectContaining({ roleId: 'role-explicit' }),
            }),
          }),
        }),
      );
      expect(prisma.role.findFirst).not.toHaveBeenCalled();
    });

    it('refuses finalization when neither the request nor the vacancy has a role', async () => {
      prisma.onboardingCase.findUnique.mockResolvedValue({
        ...readyCase,
        application: {
          ...readyCase.application,
          vacancy: { ...mockVacancy, roleId: null, role: null },
        },
      });

      await expect(
        service.finalizeOnboarding(mockOnboardingCase.id, finalizeDto, mockActorUserId),
      ).rejects.toBeInstanceOf(BadRequestException);
      await expect(
        service.finalizeOnboarding(mockOnboardingCase.id, finalizeDto, mockActorUserId),
      ).rejects.toMatchObject({
        response: expect.objectContaining({ code: 'ONBOARDING_ROLE_REQUIRED' }),
      });
      expect(prisma.role.findFirst).not.toHaveBeenCalled();
      expect(prisma.user.create).not.toHaveBeenCalled();
    });

    it('rejects an HR_MANAGER assigning a protected role from the vacancy', async () => {
      prisma.onboardingCase.findUnique.mockResolvedValue({
        ...readyCase,
        application: {
          ...readyCase.application,
          vacancy: { ...mockVacancy, roleId: 'role-ceo', role: { ...mockRole, id: 'role-ceo', code: 'CEO', isProtected: true } },
        },
      });
      prisma.role.findUnique.mockResolvedValue({
        id: 'role-ceo',
        code: 'CEO',
        isProtected: true,
      });
      prisma.user.findUnique
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({
          id: mockActorUserId,
          userRoles: [{ role: { code: 'HR_MANAGER', isProtected: false } }],
        });

      await expect(
        service.finalizeOnboarding(mockOnboardingCase.id, finalizeDto, mockActorUserId),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.user.create).not.toHaveBeenCalled();
      expect(prisma.userRole.create).not.toHaveBeenCalled();
    });

    it('allows a CEO actor to assign a protected role supplied as roleId', async () => {
      prisma.onboardingCase.findUnique.mockResolvedValue(readyCase);
      prisma.role.findUnique.mockResolvedValue({
        id: 'role-ceo',
        code: 'CEO',
        isProtected: true,
      });
      prisma.user.findUnique
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({
          id: mockCeoUserId,
          userRoles: [{ role: { code: 'CEO', isProtected: true } }],
        });

      await service.finalizeOnboarding(
        mockOnboardingCase.id,
        { ...finalizeDto, roleId: 'role-ceo' },
        mockCeoUserId,
      );

      expect(prisma.user.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            userRoles: expect.objectContaining({
              create: expect.objectContaining({ roleId: 'role-ceo', grantedByUserId: mockCeoUserId }),
            }),
          }),
        }),
      );
    });

    it('rejects SYSTEM actor attempting to assign a protected role even if it has a stored CEO role', async () => {
      prisma.onboardingCase.findUnique.mockResolvedValue(readyCase);
      prisma.role.findUnique.mockResolvedValue({
        id: 'role-ceo',
        code: 'CEO',
        isProtected: true,
      });
      prisma.user.findUnique
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({
          id: 'SYSTEM',
          email: 'system@elscore.internal',
          status: 'ACTIVE',
          userRoles: [{ role: { code: 'CEO', isProtected: true } }],
        });

      await expect(
        service.finalizeOnboarding(mockOnboardingCase.id, { ...finalizeDto, roleId: 'role-ceo' }, 'SYSTEM'),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.user.create).not.toHaveBeenCalled();
      expect(prisma.userRole.create).not.toHaveBeenCalled();
    });

    it('excludes SYSTEM actor from receiving CEO notifications when onboarding is finalized', async () => {
      prisma.onboardingCase.findUnique.mockResolvedValue(readyCase);
      prisma.user.findMany.mockResolvedValue([{ id: mockCeoUserId }]);

      await service.finalizeOnboarding(
        mockOnboardingCase.id,
        finalizeDto,
        mockActorUserId,
      );

      expect(prisma.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status: 'ACTIVE',
            id: { not: 'SYSTEM' },
            email: { not: 'system@elscore.internal' },
            userRoles: { some: { role: { code: 'CEO' } } },
          }),
        }),
      );
    });

    it('links an existing user without an employee and does not assign a role', async () => {
      prisma.onboardingCase.findUnique.mockResolvedValue(readyCase);
      prisma.user.findUnique.mockResolvedValue({
        id: 'existing-user',
        email: mockCandidate.email,
        employee: null,
        userRoles: [],
      });

      await service.finalizeOnboarding(mockOnboardingCase.id, finalizeDto, mockActorUserId);

      expect(prisma.user.create).not.toHaveBeenCalled();
      expect(prisma.user.update).not.toHaveBeenCalled();
      expect(prisma.userRole.create).not.toHaveBeenCalled();
      expect(prisma.userRole.delete).not.toHaveBeenCalled();
      expect(prisma.employee.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ userId: 'existing-user' }),
        }),
      );
    });

    it('keeps an existing user role unchanged during finalization', async () => {
      prisma.onboardingCase.findUnique.mockResolvedValue({
        ...readyCase,
        application: {
          ...readyCase.application,
          vacancy: { ...mockVacancy, roleId: 'role-ceo' },
        },
      });
      prisma.role.findUnique.mockResolvedValue({
        id: 'role-ceo',
        code: 'CEO',
        isProtected: true,
      });
      prisma.user.findUnique.mockResolvedValue({
        id: 'existing-user',
        email: mockCandidate.email,
        employee: null,
        userRoles: [{ roleId: 'role-assistant', role: { code: 'HR_ASSISTANT', isProtected: false } }],
      });

      await service.finalizeOnboarding(
        mockOnboardingCase.id,
        { ...finalizeDto, roleId: 'role-ceo' },
        mockActorUserId,
      );

      expect(prisma.user.create).not.toHaveBeenCalled();
      expect(prisma.user.update).not.toHaveBeenCalled();
      expect(prisma.userRole.create).not.toHaveBeenCalled();
      expect(prisma.userRole.update).not.toHaveBeenCalled();
      expect(prisma.userRole.delete).not.toHaveBeenCalled();
      expect(prisma.employee.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ userId: 'existing-user' }),
        }),
      );
    });

    it('FLOW-ONB-001: blocks finalization if checklist tasks are still PENDING or IN_PROGRESS', async () => {
      prisma.onboardingCase.findUnique.mockResolvedValueOnce({
        ...readyCase,
        tasks: [
          { ...mockTask, id: 't-1', status: OnboardingTaskStatus.PENDING, title: 'IT Setup' },
        ],
      });

      await expect(
        service.finalizeOnboarding(mockOnboardingCase.id, finalizeDto, mockActorUserId),
      ).rejects.toThrow(UnprocessableEntityException);
    });

    it('FLOW-ONB-001: allows finalization if checklist tasks are WAIVED', async () => {
      prisma.onboardingCase.findUnique.mockResolvedValue({
        ...readyCase,
        tasks: [
          { ...mockTask, id: 't-1', status: OnboardingTaskStatus.WAIVED, title: 'Optional Hardware' },
        ],
      });

      const res = await service.finalizeOnboarding(
        mockOnboardingCase.id,
        finalizeDto,
        mockActorUserId,
      );
      expect(res).toBeDefined();
    });

    it('FLOW-ONB-001: blocks finalization if mandatory Identity Proof is missing or unverified', async () => {
      prisma.onboardingCase.findUnique.mockResolvedValueOnce({
        ...readyCase,
        documents: [
          // Only offer letter, no passport/national ID
          {
            ...mockDocument,
            id: 'd-offer-1',
            documentType: OnboardingDocumentType.SIGNED_OFFER_LETTER,
            status: DocumentVerificationStatus.VERIFIED,
          },
        ],
      });

      await expect(
        service.finalizeOnboarding(mockOnboardingCase.id, finalizeDto, mockActorUserId),
      ).rejects.toThrow(UnprocessableEntityException);
    });

    it('FLOW-ONB-001: blocks finalization if mandatory Signed Offer Letter is missing or unverified', async () => {
      prisma.onboardingCase.findUnique.mockResolvedValueOnce({
        ...readyCase,
        documents: [
          // Only passport, no signed offer letter
          {
            ...mockDocument,
            id: 'd-id-1',
            documentType: OnboardingDocumentType.PASSPORT,
            status: DocumentVerificationStatus.VERIFIED,
          },
        ],
      });

      await expect(
        service.finalizeOnboarding(mockOnboardingCase.id, finalizeDto, mockActorUserId),
      ).rejects.toThrow(UnprocessableEntityException);
    });

    it('FLOW-ONB-001: blocks finalization if any document is in PENDING verification status', async () => {
      prisma.onboardingCase.findUnique.mockResolvedValueOnce({
        ...readyCase,
        documents: [
          ...readyCase.documents,
          {
            ...mockDocument,
            id: 'd-pending-1',
            title: 'Degree Certificate',
            documentType: OnboardingDocumentType.DEGREE_CERTIFICATE,
            status: DocumentVerificationStatus.PENDING,
          },
        ],
      });

      await expect(
        service.finalizeOnboarding(mockOnboardingCase.id, finalizeDto, mockActorUserId),
      ).rejects.toThrow(UnprocessableEntityException);
    });

    it('FLOW-ONB-001: blocks finalization if any document is REJECTED', async () => {
      prisma.onboardingCase.findUnique.mockResolvedValueOnce({
        ...readyCase,
        documents: [
          ...readyCase.documents,
          {
            ...mockDocument,
            id: 'd-rejected-1',
            title: 'Degree Certificate',
            documentType: OnboardingDocumentType.DEGREE_CERTIFICATE,
            status: DocumentVerificationStatus.REJECTED,
          },
        ],
      });

      await expect(
        service.finalizeOnboarding(mockOnboardingCase.id, finalizeDto, mockActorUserId),
      ).rejects.toThrow(UnprocessableEntityException);
    });

    it('enforces idempotency: throws ConflictException if case has already been finalized', async () => {
      prisma.onboardingCase.findUnique.mockResolvedValue({
        ...mockOnboardingCase,
        status: OnboardingCaseStatus.COMPLETED,
        employeeId: 'emp-1',
      });

      await expect(
        service.finalizeOnboarding(mockOnboardingCase.id, finalizeDto, mockActorUserId),
      ).rejects.toThrow(ConflictException);
    });

    it('rejects finalization if confirmedJoiningDate is not a valid real calendar date', async () => {
      await expect(
        service.finalizeOnboarding(
          mockOnboardingCase.id,
          { ...finalizeDto, confirmedJoiningDate: '2026-02-30' },
          mockActorUserId,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('allows empty string or omitted dateOfBirth without throwing BadRequestException', async () => {
      const readyCase = {
        ...mockOnboardingCase,
        status: OnboardingCaseStatus.IN_PROGRESS,
        employeeId: null,
        documents: [
          {
            id: 'doc-pass',
            documentType: OnboardingDocumentType.PASSPORT,
            status: DocumentVerificationStatus.VERIFIED,
            title: 'Passport Copy',
          },
          {
            id: 'doc-offer',
            documentType: OnboardingDocumentType.SIGNED_OFFER_LETTER,
            status: DocumentVerificationStatus.VERIFIED,
            title: 'Signed Corporate Offer',
          },
        ],
        tasks: [
          {
            id: 'task-1',
            status: OnboardingTaskStatus.COMPLETED,
            title: 'Complete Workstation Setup',
            category: OnboardingTaskCategory.IT_SETUP,
          },
        ],
      };

      prisma.onboardingCase.findUnique.mockResolvedValue(readyCase);

      await expect(
        service.finalizeOnboarding(
          mockOnboardingCase.id,
          { ...finalizeDto, dateOfBirth: '' },
          mockActorUserId,
        ),
      ).resolves.toBeDefined();

      expect(prisma.employee.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            dateOfBirth: null,
          }),
        }),
      );
    });

    it('rejects dateOfBirth if it is an invalid real calendar date', async () => {
      await expect(
        service.finalizeOnboarding(
          mockOnboardingCase.id,
          { ...finalizeDto, dateOfBirth: '2026-02-30' },
          mockActorUserId,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('DTO validation: transforms empty strings to undefined and passes validation', async () => {
      const { plainToInstance } = await import('class-transformer');
      const { validate } = await import('class-validator');

      const plain = {
        confirmedJoiningDate: '2026-11-20',
        personalEmail: '',
        dateOfBirth: '',
        departmentId: '',
        roleId: '',
      };

      const dto = plainToInstance(FinalizeOnboardingDto, plain);
      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    it('throws BadRequestException if trying to finalize a WITHDRAWN or REJECTED case', async () => {
      prisma.onboardingCase.findUnique.mockResolvedValue({
        ...mockOnboardingCase,
        status: OnboardingCaseStatus.WITHDRAWN,
      });

      await expect(
        service.finalizeOnboarding(mockOnboardingCase.id, finalizeDto, mockActorUserId),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('recordProbationReview', () => {
    it('handles CONFIRMED outcome: updates employee to ACTIVE, sets confirmationDate, and records status history', async () => {
      const reviewDto: CreateProbationReviewDto = {
        reviewDate: '2027-02-15',
        outcome: ProbationReviewOutcome.CONFIRMED,
        notes: 'Exceeded all milestones during 3-month probation period.',
      };

      const result = await service.recordProbationReview(mockEmployee.id, reviewDto, mockActorUserId);

      expect(prisma.employeeProbationReview.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            outcome: ProbationReviewOutcome.CONFIRMED,
            reviewDate: '2027-02-15',
          }),
        }),
      );

      expect(prisma.employee.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            employmentStatus: EmploymentStatus.ACTIVE,
            confirmationDate: '2027-02-15',
          }),
        }),
      );

      expect(prisma.employeeStatusHistory.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            previousStatus: EmploymentStatus.PROBATION,
            newStatus: EmploymentStatus.ACTIVE,
            effectiveDate: '2027-02-15',
          }),
        }),
      );

      expect(auditService.recordInTx).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ action: 'PROBATION_REVIEW_RECORDED' }),
      );

      expect(result).toBeDefined();
    });

    it('handles EXTENDED outcome: updates probationEndDate and logs status history', async () => {
      const reviewDto: CreateProbationReviewDto = {
        reviewDate: '2027-02-15',
        outcome: ProbationReviewOutcome.EXTENDED,
        extendedEndDate: '2027-05-15',
        notes: 'Extension requested for 3 additional months to achieve KPI targets.',
      };

      await service.recordProbationReview(mockEmployee.id, reviewDto, mockActorUserId);

      expect(prisma.employee.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            probationEndDate: '2027-05-15',
          }),
        }),
      );

      expect(prisma.employeeStatusHistory.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            effectiveDate: '2027-02-15',
            reason: expect.stringContaining('Probation extended until 2027-05-15'),
          }),
        }),
      );
    });

    it('rejects EXTENDED outcome if extendedEndDate is missing or not after reviewDate', async () => {
      await expect(
        service.recordProbationReview(
          mockEmployee.id,
          {
            reviewDate: '2027-02-15',
            outcome: ProbationReviewOutcome.EXTENDED,
            notes: 'Missing date',
          },
          mockActorUserId,
        ),
      ).rejects.toThrow(BadRequestException);

      await expect(
        service.recordProbationReview(
          mockEmployee.id,
          {
            reviewDate: '2027-02-15',
            outcome: ProbationReviewOutcome.EXTENDED,
            extendedEndDate: '2027-01-01', // Before reviewDate
            notes: 'Invalid past date',
          },
          mockActorUserId,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('handles TERMINATED outcome: updates employee to TERMINATED, suspends user account, and logs access restriction', async () => {
      const reviewDto: CreateProbationReviewDto = {
        reviewDate: '2027-02-15',
        outcome: ProbationReviewOutcome.TERMINATED,
        notes: 'Unsatisfactory performance and failure to meet core responsibilities.',
      };

      await service.recordProbationReview(mockEmployee.id, reviewDto, mockActorUserId);

      expect(prisma.employee.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            employmentStatus: EmploymentStatus.TERMINATED,
            lastWorkingDate: '2027-02-15',
          }),
        }),
      );

      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: mockEmployee.userId },
          data: { status: UserStatus.SUSPENDED },
        }),
      );

      expect(prisma.employeeStatusHistory.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            newStatus: EmploymentStatus.TERMINATED,
            accessRestricted: true,
            effectiveDate: '2027-02-15',
          }),
        }),
      );
    });

    it('SEC-ONB-002: rejects probation review with ForbiddenException if actor is the employee under review (self-review bypass prevention)', async () => {
      // The employee's linked userId is 'user-emp-1'
      const selfReviewActorId = mockEmployee.userId;

      await expect(
        service.recordProbationReview(
          mockEmployee.id,
          {
            reviewDate: '2027-02-15',
            outcome: ProbationReviewOutcome.CONFIRMED,
            notes: 'Attempting self-confirmation',
          },
          selfReviewActorId,
        ),
      ).rejects.toThrow(ForbiddenException);

      await expect(
        service.recordProbationReview(
          mockEmployee.id,
          {
            reviewDate: '2027-02-15',
            outcome: ProbationReviewOutcome.EXTENDED,
            extendedEndDate: '2027-05-15',
            notes: 'Attempting self-extension',
          },
          selfReviewActorId,
        ),
      ).rejects.toThrow(ForbiddenException);

      await expect(
        service.recordProbationReview(
          mockEmployee.id,
          {
            reviewDate: '2027-02-15',
            outcome: ProbationReviewOutcome.TERMINATED,
            notes: 'Attempting self-termination',
          },
          selfReviewActorId,
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('DATA-ONB-001: rejects review with ConflictException if employee is already CONFIRMED/ACTIVE', async () => {
      prisma.employee.findUnique.mockResolvedValueOnce({
        ...mockEmployee,
        employmentStatus: EmploymentStatus.ACTIVE,
      });

      await expect(
        service.recordProbationReview(
          mockEmployee.id,
          {
            reviewDate: '2027-02-15',
            outcome: ProbationReviewOutcome.CONFIRMED,
            notes: 'Cannot review already confirmed employee',
          },
          mockActorUserId,
        ),
      ).rejects.toThrow(ConflictException);

      expect(prisma.employee.update).not.toHaveBeenCalled();
      expect(prisma.employeeProbationReview.create).not.toHaveBeenCalled();
    });

    it('DATA-ONB-001: rejects review with ConflictException if employee is already TERMINATED', async () => {
      prisma.employee.findUnique.mockResolvedValueOnce({
        ...mockEmployee,
        employmentStatus: EmploymentStatus.TERMINATED,
      });

      await expect(
        service.recordProbationReview(
          mockEmployee.id,
          {
            reviewDate: '2027-02-15',
            outcome: ProbationReviewOutcome.CONFIRMED,
            notes: 'Cannot review terminated employee',
          },
          mockActorUserId,
        ),
      ).rejects.toThrow(ConflictException);

      expect(prisma.employee.update).not.toHaveBeenCalled();
      expect(prisma.employeeProbationReview.create).not.toHaveBeenCalled();
    });

    it('DATA-ONB-001: rejects review with ConflictException if employee is SUSPENDED or in any other non-PROBATION status', async () => {
      prisma.employee.findUnique.mockResolvedValueOnce({
        ...mockEmployee,
        employmentStatus: EmploymentStatus.SUSPENDED,
      });

      await expect(
        service.recordProbationReview(
          mockEmployee.id,
          {
            reviewDate: '2027-02-15',
            outcome: ProbationReviewOutcome.CONFIRMED,
            notes: 'Cannot review suspended employee',
          },
          mockActorUserId,
        ),
      ).rejects.toThrow(ConflictException);

      expect(prisma.employee.update).not.toHaveBeenCalled();
      expect(prisma.employeeProbationReview.create).not.toHaveBeenCalled();
    });
  });

  describe('getProbationReviews', () => {
    it('returns employee details and probation review history', async () => {
      const result = await service.getProbationReviews(mockEmployee.id);
      expect(result.employee).toBeDefined();
      expect(result.reviews).toBeDefined();
      expect(prisma.employeeProbationReview.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { employeeId: mockEmployee.id },
        }),
      );
    });
  });
});
