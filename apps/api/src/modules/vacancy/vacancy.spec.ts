import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { EmploymentType, VacancyPriority, VacancyStatus } from '@prisma/client';

import { AuditService } from '../../common/audit/audit.service';
import { IdGeneratorService } from '../../common/id-generator/id-generator.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuthorizationService } from '../../common/rbac/authorization.service';
import { RbacService } from '../../common/rbac/rbac.service';

import { VacancyController } from './vacancy.controller';
import { VacancyService } from './vacancy.service';

describe('VacancyService', () => {
  let service: VacancyService;
  let prisma: any;
  let auditService: any;
  let idGenerator: any;
  let authService: any;

  const mockDepartment = {
    id: 'dept-123',
    name: 'Academic Counseling',
  };

  const mockRole = {
    id: 'role-456',
    name: 'Counselor',
  };

  const mockUser1 = {
    id: 'user-requester-1',
    email: 'requester@elscore.com',
    employee: {
      firstName: 'Requester',
      lastName: 'HR',
    },
  };

  const mockUser2 = {
    id: 'user-manager-2',
    email: 'manager@elscore.com',
    employee: {
      firstName: 'Reviewer',
      lastName: 'Manager',
    },
  };

  const mockVacancy = {
    id: 'vac-uuid-1',
    businessId: 'VAC-0001',
    title: 'Senior Academic Counselor',
    departmentId: 'dept-123',
    roleId: 'role-456',
    employmentType: EmploymentType.FULL_TIME,
    workMode: 'ON_SITE',
    location: 'Bangalore Office',
    targetHeadcount: 2,
    filledHeadcount: 0,
    priority: VacancyPriority.HIGH,
    status: VacancyStatus.DRAFT,
    justification: 'GCC expansion requires 2 new counselors',
    targetStartDate: '2026-11-01',
    targetClosureDate: '2026-11-15',
    budgetMin: 50000,
    budgetMax: 70000,
    currency: 'INR',
    notes: 'Urgent hiring',
    requestedByUserId: 'user-requester-1',
    reviewedByUserId: null,
    reviewedAt: null,
    reviewNote: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    department: mockDepartment,
    role: mockRole,
    requestedBy: mockUser1,
    reviewedBy: null,
  };

  beforeEach(async () => {
    prisma = {
      department: {
        findUnique: jest.fn().mockResolvedValue(mockDepartment),
      },
      role: {
        findUnique: jest.fn().mockResolvedValue(mockRole),
      },
      vacancy: {
        create: jest.fn().mockResolvedValue(mockVacancy),
        findUnique: jest.fn().mockResolvedValue(mockVacancy),
        update: jest.fn(),
        findMany: jest.fn().mockResolvedValue([mockVacancy]),
        count: jest.fn().mockResolvedValue(1),
      },
      $transaction: jest.fn().mockImplementation(async (callback) => {
        const tx = {
          $executeRaw: jest.fn().mockResolvedValue(1),
          department: prisma.department,
          role: prisma.role,
          vacancy: prisma.vacancy,
        };
        return callback(tx);
      }),
    };

    auditService = {
      recordInTx: jest.fn().mockResolvedValue(undefined),
    };

    idGenerator = {
      nextIdInTx: jest.fn().mockResolvedValue('VAC-0001'),
    };

    authService = {
      hasPermission: jest.fn().mockImplementation(async (userId: string, perm: string) => {
        // By default, manager has vacancy.update, requester has vacancy.create
        if (perm === 'vacancy.update') return true;
        if (perm === 'vacancy.create') return true;
        return false;
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        VacancyService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditService, useValue: auditService },
        { provide: IdGeneratorService, useValue: idGenerator },
        { provide: AuthorizationService, useValue: authService },
      ],
    }).compile();

    service = module.get<VacancyService>(VacancyService);
  });

  describe('createVacancy', () => {
    it('creates a draft vacancy with generated business ID and logs audit event', async () => {
      const result = await service.createVacancy(
        {
          title: 'Senior Academic Counselor',
          departmentId: 'dept-123',
          roleId: 'role-456',
          targetHeadcount: 2,
          priority: VacancyPriority.HIGH,
          justification: 'GCC expansion requires 2 new counselors',
          budgetMin: 50000,
          budgetMax: 70000,
          currency: 'INR',
          targetStartDate: '2026-11-01',
          targetClosureDate: '2026-11-15',
        },
        'user-requester-1',
      );

      expect(idGenerator.nextIdInTx).toHaveBeenCalledWith(expect.anything(), 'VAC');
      expect(prisma.vacancy.create).toHaveBeenCalled();
      expect(auditService.recordInTx).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          entityType: 'Vacancy',
          action: 'VACANCY_CREATED',
          actorUserId: 'user-requester-1',
        }),
      );
      expect(result.businessId).toBe('VAC-0001');
    });

    it('rejects if budgetMin > budgetMax', async () => {
      await expect(
        service.createVacancy(
          {
            title: 'Counselor',
            departmentId: 'dept-123',
            justification: 'Valid justification here',
            budgetMin: 80000,
            budgetMax: 50000,
          },
          'user-requester-1',
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects unsupported currency code (DATA-VAC-005)', async () => {
      await expect(
        service.createVacancy(
          {
            title: 'Counselor',
            departmentId: 'dept-123',
            justification: 'Valid justification',
            currency: 'XYZ',
          },
          'user-requester-1',
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects invalid calendar dates like Feb 30 (DATA-VAC-004)', async () => {
      await expect(
        service.createVacancy(
          {
            title: 'Counselor',
            departmentId: 'dept-123',
            justification: 'Valid justification',
            targetStartDate: '2026-02-30',
          },
          'user-requester-1',
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects if targetStartDate is after targetClosureDate (DATA-VAC-004)', async () => {
      await expect(
        service.createVacancy(
          {
            title: 'Counselor',
            departmentId: 'dept-123',
            justification: 'Valid justification',
            targetStartDate: '2026-12-01',
            targetClosureDate: '2026-11-01',
          },
          'user-requester-1',
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects if department does not exist', async () => {
      prisma.department.findUnique.mockResolvedValueOnce(null);

      await expect(
        service.createVacancy(
          {
            title: 'Counselor',
            departmentId: 'invalid-dept',
            justification: 'Valid justification',
          },
          'user-requester-1',
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('rejects if roleId provided does not exist', async () => {
      prisma.role.findUnique.mockResolvedValueOnce(null);

      await expect(
        service.createVacancy(
          {
            title: 'Counselor',
            departmentId: 'dept-123',
            roleId: 'non-existent-role',
            justification: 'Valid justification',
          },
          'user-requester-1',
        ),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('updateVacancy & Authorization (SEC-VAC-001, SEC-VAC-003, DATA-VAC-004)', () => {
    it('allows manager with vacancy.update to edit vacancy', async () => {
      authService.hasPermission.mockImplementation(async (userId: string, perm: string) => {
        return perm === 'vacancy.update';
      });

      prisma.vacancy.findUnique.mockResolvedValueOnce({
        ...mockVacancy,
        status: VacancyStatus.DRAFT,
      });
      prisma.vacancy.update.mockResolvedValueOnce({
        ...mockVacancy,
        title: 'Lead Academic Counselor',
      });

      const updated = await service.updateVacancy(
        'vac-uuid-1',
        { title: 'Lead Academic Counselor' },
        'user-manager-2',
      );

      expect(prisma.vacancy.update).toHaveBeenCalled();
      expect(updated.title).toBe('Lead Academic Counselor');
    });

    it('allows creator with only vacancy.create to edit their OWN draft vacancy (SEC-VAC-001)', async () => {
      authService.hasPermission.mockImplementation(async (userId: string, perm: string) => {
        return perm === 'vacancy.create'; // No vacancy.update!
      });

      prisma.vacancy.findUnique.mockResolvedValueOnce({
        ...mockVacancy,
        requestedByUserId: 'user-requester-1',
        status: VacancyStatus.DRAFT,
      });
      prisma.vacancy.update.mockResolvedValueOnce({
        ...mockVacancy,
        title: 'Updated By Creator',
      });

      const updated = await service.updateVacancy(
        'vac-uuid-1',
        { title: 'Updated By Creator' },
        'user-requester-1',
      );

      expect(prisma.vacancy.update).toHaveBeenCalled();
      expect(updated.title).toBe('Updated By Creator');
    });

    it('forbids creator with only vacancy.create from editing ANOTHER user vacancy (SEC-VAC-001)', async () => {
      authService.hasPermission.mockImplementation(async (userId: string, perm: string) => {
        return perm === 'vacancy.create';
      });

      prisma.vacancy.findUnique.mockResolvedValueOnce({
        ...mockVacancy,
        requestedByUserId: 'user-other-person',
        status: VacancyStatus.DRAFT,
      });

      await expect(
        service.updateVacancy('vac-uuid-1', { title: 'Unauthorized Edit' }, 'user-requester-1'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('forbids creator with only vacancy.create from editing a PENDING_APPROVAL vacancy', async () => {
      authService.hasPermission.mockImplementation(async (userId: string, perm: string) => {
        return perm === 'vacancy.create';
      });

      prisma.vacancy.findUnique.mockResolvedValueOnce({
        ...mockVacancy,
        requestedByUserId: 'user-requester-1',
        status: VacancyStatus.PENDING_APPROVAL,
      });

      await expect(
        service.updateVacancy('vac-uuid-1', { title: 'Edit Under Review' }, 'user-requester-1'),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects reducing targetHeadcount below existing filledHeadcount (SEC-VAC-003)', async () => {
      authService.hasPermission.mockResolvedValue(true);

      prisma.vacancy.findUnique.mockResolvedValueOnce({
        ...mockVacancy,
        status: VacancyStatus.DRAFT,
        targetHeadcount: 5,
        filledHeadcount: 3,
      });

      await expect(
        service.updateVacancy('vac-uuid-1', { targetHeadcount: 2 }, 'user-manager-2'),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects targetClosureDate before existing targetStartDate (DATA-VAC-004)', async () => {
      authService.hasPermission.mockResolvedValue(true);

      prisma.vacancy.findUnique.mockResolvedValueOnce({
        ...mockVacancy,
        status: VacancyStatus.DRAFT,
        targetStartDate: '2026-11-01',
        targetClosureDate: '2026-11-30',
      });

      await expect(
        service.updateVacancy(
          'vac-uuid-1',
          { targetClosureDate: '2026-10-15' }, // earlier than existing start date!
          'user-manager-2',
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('submitForApproval (SEC-VAC-001)', () => {
    it('allows creator with only vacancy.create to submit their OWN draft vacancy', async () => {
      authService.hasPermission.mockImplementation(async (userId: string, perm: string) => {
        return perm === 'vacancy.create'; // Creator without vacancy.update
      });

      prisma.vacancy.findUnique.mockResolvedValueOnce({
        ...mockVacancy,
        requestedByUserId: 'user-requester-1',
        status: VacancyStatus.DRAFT,
      });
      prisma.vacancy.update.mockResolvedValueOnce({
        ...mockVacancy,
        status: VacancyStatus.PENDING_APPROVAL,
      });

      const result = await service.submitForApproval('vac-uuid-1', 'user-requester-1');

      expect(prisma.vacancy.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: VacancyStatus.PENDING_APPROVAL,
          }),
        }),
      );
      expect(result.status).toBe(VacancyStatus.PENDING_APPROVAL);
    });

    it('forbids creator with only vacancy.create from submitting SOMEONE ELSES vacancy', async () => {
      authService.hasPermission.mockImplementation(async (userId: string, perm: string) => {
        return perm === 'vacancy.create';
      });

      prisma.vacancy.findUnique.mockResolvedValueOnce({
        ...mockVacancy,
        requestedByUserId: 'user-different-creator',
        status: VacancyStatus.DRAFT,
      });

      await expect(
        service.submitForApproval('vac-uuid-1', 'user-requester-1'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('allows manager with vacancy.update to submit any draft vacancy', async () => {
      authService.hasPermission.mockImplementation(async (userId: string, perm: string) => {
        return perm === 'vacancy.update';
      });

      prisma.vacancy.findUnique.mockResolvedValueOnce({
        ...mockVacancy,
        requestedByUserId: 'user-staff-member',
        status: VacancyStatus.DRAFT,
      });
      prisma.vacancy.update.mockResolvedValueOnce({
        ...mockVacancy,
        status: VacancyStatus.PENDING_APPROVAL,
      });

      const result = await service.submitForApproval('vac-uuid-1', 'user-manager-2');
      expect(result.status).toBe(VacancyStatus.PENDING_APPROVAL);
    });

    it('forbids user with neither vacancy.create nor vacancy.update from submitting', async () => {
      authService.hasPermission.mockResolvedValue(false);

      prisma.vacancy.findUnique.mockResolvedValueOnce({
        ...mockVacancy,
        requestedByUserId: 'user-requester-1',
        status: VacancyStatus.DRAFT,
      });

      await expect(
        service.submitForApproval('vac-uuid-1', 'user-requester-1'),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('reviewVacancy (SEC-VAC-002 & Anti-Self-Approval)', () => {
    it('approves a pending vacancy when reviewer is a different user', async () => {
      prisma.vacancy.findUnique.mockResolvedValueOnce({
        ...mockVacancy,
        status: VacancyStatus.PENDING_APPROVAL,
        requestedByUserId: 'user-requester-1',
      });
      prisma.vacancy.update.mockResolvedValueOnce({
        ...mockVacancy,
        status: VacancyStatus.APPROVED,
        reviewedByUserId: 'user-manager-2',
      });

      const result = await service.reviewVacancy(
        'vac-uuid-1',
        { action: 'APPROVE', reviewNote: 'Approved for Q4 expansion' },
        'user-manager-2',
      );

      expect(prisma.vacancy.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: VacancyStatus.APPROVED,
            reviewedByUserId: 'user-manager-2',
          }),
        }),
      );
      expect(result.status).toBe(VacancyStatus.APPROVED);
    });

    it('rejects a pending vacancy when valid review note is provided (SEC-VAC-002)', async () => {
      prisma.vacancy.findUnique.mockResolvedValueOnce({
        ...mockVacancy,
        status: VacancyStatus.PENDING_APPROVAL,
        requestedByUserId: 'user-requester-1',
      });
      prisma.vacancy.update.mockResolvedValueOnce({
        ...mockVacancy,
        status: VacancyStatus.REJECTED,
        reviewedByUserId: 'user-manager-2',
        reviewNote: 'Budget exceeded for this quarter',
      });

      const result = await service.reviewVacancy(
        'vac-uuid-1',
        { action: 'REJECT', reviewNote: 'Budget exceeded for this quarter' },
        'user-manager-2',
      );

      expect(result.status).toBe(VacancyStatus.REJECTED);
      expect(auditService.recordInTx).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          action: 'VACANCY_REJECTED',
          reason: 'Budget exceeded for this quarter',
        }),
      );
    });

    it('throws BadRequestException if review note is missing on REJECT (SEC-VAC-002)', async () => {
      prisma.vacancy.findUnique.mockResolvedValueOnce({
        ...mockVacancy,
        status: VacancyStatus.PENDING_APPROVAL,
        requestedByUserId: 'user-requester-1',
      });

      await expect(
        service.reviewVacancy(
          'vac-uuid-1',
          { action: 'REJECT' },
          'user-manager-2',
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException if review note is whitespace-only on REJECT (SEC-VAC-002)', async () => {
      prisma.vacancy.findUnique.mockResolvedValueOnce({
        ...mockVacancy,
        status: VacancyStatus.PENDING_APPROVAL,
        requestedByUserId: 'user-requester-1',
      });

      await expect(
        service.reviewVacancy(
          'vac-uuid-1',
          { action: 'REJECT', reviewNote: '    ' },
          'user-manager-2',
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects review when reviewer attempts self-approval', async () => {
      prisma.vacancy.findUnique.mockResolvedValueOnce({
        ...mockVacancy,
        status: VacancyStatus.PENDING_APPROVAL,
        requestedByUserId: 'user-requester-1',
      });

      await expect(
        service.reviewVacancy(
          'vac-uuid-1',
          { action: 'APPROVE' },
          'user-requester-1', // Same user as requestedByUserId!
        ),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('transitionStatus (SEC-VAC-003)', () => {
    it('allows partial hiring (e.g. 1 out of 2) while keeping status OPEN', async () => {
      prisma.vacancy.findUnique.mockResolvedValueOnce({
        ...mockVacancy,
        status: VacancyStatus.OPEN,
        targetHeadcount: 2,
        filledHeadcount: 0,
      });
      prisma.vacancy.update.mockResolvedValueOnce({
        ...mockVacancy,
        status: VacancyStatus.OPEN,
        targetHeadcount: 2,
        filledHeadcount: 1,
      });

      const res = await service.transitionStatus(
        'vac-uuid-1',
        { status: VacancyStatus.OPEN, filledHeadcount: 1 },
        'user-manager-2',
      );

      expect(res.filledHeadcount).toBe(1);
    });

    it('throws BadRequestException if filledHeadcount exceeds targetHeadcount (SEC-VAC-003)', async () => {
      prisma.vacancy.findUnique.mockResolvedValueOnce({
        ...mockVacancy,
        status: VacancyStatus.OPEN,
        targetHeadcount: 2,
        filledHeadcount: 0,
      });

      await expect(
        service.transitionStatus(
          'vac-uuid-1',
          { status: VacancyStatus.OPEN, filledHeadcount: 5 }, // 5 > 2!
          'user-manager-2',
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException if filledHeadcount is negative (SEC-VAC-003)', async () => {
      prisma.vacancy.findUnique.mockResolvedValueOnce({
        ...mockVacancy,
        status: VacancyStatus.OPEN,
        targetHeadcount: 2,
        filledHeadcount: 0,
      });

      await expect(
        service.transitionStatus(
          'vac-uuid-1',
          { status: VacancyStatus.OPEN, filledHeadcount: -1 },
          'user-manager-2',
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('auto-fills headcount to targetHeadcount when marked FILLED without explicit count', async () => {
      prisma.vacancy.findUnique.mockResolvedValueOnce({
        ...mockVacancy,
        status: VacancyStatus.OPEN,
        targetHeadcount: 3,
        filledHeadcount: 1,
      });
      prisma.vacancy.update.mockResolvedValueOnce({
        ...mockVacancy,
        status: VacancyStatus.FILLED,
        targetHeadcount: 3,
        filledHeadcount: 3,
      });

      const res = await service.transitionStatus(
        'vac-uuid-1',
        { status: VacancyStatus.FILLED },
        'user-manager-2',
      );

      expect(prisma.vacancy.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: VacancyStatus.FILLED,
            filledHeadcount: 3,
          }),
        }),
      );
    });

    it('allows valid reopening from FILLED to OPEN', async () => {
      prisma.vacancy.findUnique.mockResolvedValueOnce({
        ...mockVacancy,
        status: VacancyStatus.FILLED,
        targetHeadcount: 2,
        filledHeadcount: 2,
      });
      prisma.vacancy.update.mockResolvedValueOnce({
        ...mockVacancy,
        status: VacancyStatus.OPEN,
        targetHeadcount: 2,
        filledHeadcount: 1,
      });

      const res = await service.transitionStatus(
        'vac-uuid-1',
        { status: VacancyStatus.OPEN, filledHeadcount: 1 },
        'user-manager-2',
      );

      expect(res.status).toBe(VacancyStatus.OPEN);
      expect(res.filledHeadcount).toBe(1);
    });

    it('rejects direct transition from PENDING_APPROVAL to APPROVED without reviewVacancy (Policy A)', async () => {
      prisma.vacancy.findUnique.mockResolvedValueOnce({
        ...mockVacancy,
        status: VacancyStatus.PENDING_APPROVAL,
      });

      await expect(
        service.transitionStatus(
          'vac-uuid-1',
          { status: VacancyStatus.APPROVED },
          'user-manager-2',
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('getVacancy & getVacancies (Policy A Visibility)', () => {
    it('returns single vacancy if found', async () => {
      const res = await service.getVacancy('vac-uuid-1');
      expect(res.id).toBe('vac-uuid-1');
    });

    it('throws NotFoundException if vacancy does not exist', async () => {
      prisma.vacancy.findUnique.mockResolvedValueOnce(null);
      await expect(service.getVacancy('non-existent')).rejects.toThrow(NotFoundException);
    });

    it('allows creator to view their own DRAFT vacancy', async () => {
      prisma.vacancy.findUnique.mockResolvedValueOnce({
        ...mockVacancy,
        requestedByUserId: 'user-requester-1',
        status: VacancyStatus.DRAFT,
      });

      const res = await service.getVacancy('vac-uuid-1', 'user-requester-1', false);
      expect(res.id).toBe('vac-uuid-1');
    });

    it('allows creator to view their own PENDING_APPROVAL vacancy', async () => {
      prisma.vacancy.findUnique.mockResolvedValueOnce({
        ...mockVacancy,
        requestedByUserId: 'user-requester-1',
        status: VacancyStatus.PENDING_APPROVAL,
      });

      const res = await service.getVacancy('vac-uuid-1', 'user-requester-1', false);
      expect(res.id).toBe('vac-uuid-1');
    });

    it('allows CEO to view another user unapproved DRAFT vacancy', async () => {
      prisma.vacancy.findUnique.mockResolvedValueOnce({
        ...mockVacancy,
        requestedByUserId: 'user-requester-1',
        status: VacancyStatus.DRAFT,
      });

      const res = await service.getVacancy('vac-uuid-1', 'user-ceo-id', true);
      expect(res.id).toBe('vac-uuid-1');
    });

    it('allows CEO to view another user unapproved PENDING_APPROVAL vacancy', async () => {
      prisma.vacancy.findUnique.mockResolvedValueOnce({
        ...mockVacancy,
        requestedByUserId: 'user-requester-1',
        status: VacancyStatus.PENDING_APPROVAL,
      });

      const res = await service.getVacancy('vac-uuid-1', 'user-ceo-id', true);
      expect(res.id).toBe('vac-uuid-1');
    });

    it('forbids HR Manager (non-creator) from viewing another user unapproved DRAFT vacancy', async () => {
      prisma.vacancy.findUnique.mockResolvedValueOnce({
        ...mockVacancy,
        requestedByUserId: 'user-requester-1',
        status: VacancyStatus.DRAFT,
      });

      await expect(
        service.getVacancy('vac-uuid-1', 'user-hr-manager', false),
      ).rejects.toThrow(ForbiddenException);
    });

    it('forbids HR Manager (non-creator) from viewing another user unapproved PENDING_APPROVAL vacancy', async () => {
      prisma.vacancy.findUnique.mockResolvedValueOnce({
        ...mockVacancy,
        requestedByUserId: 'user-requester-1',
        status: VacancyStatus.PENDING_APPROVAL,
      });

      await expect(
        service.getVacancy('vac-uuid-1', 'user-hr-manager', false),
      ).rejects.toThrow(ForbiddenException);
    });

    it('forbids HR Manager (non-creator) from viewing another user REJECTED vacancy', async () => {
      prisma.vacancy.findUnique.mockResolvedValueOnce({
        ...mockVacancy,
        requestedByUserId: 'user-requester-1',
        status: VacancyStatus.REJECTED,
      });

      await expect(
        service.getVacancy('vac-uuid-1', 'user-hr-manager', false),
      ).rejects.toThrow(ForbiddenException);
    });

    it('allows any user to view an APPROVED vacancy', async () => {
      prisma.vacancy.findUnique.mockResolvedValueOnce({
        ...mockVacancy,
        requestedByUserId: 'user-requester-1',
        status: VacancyStatus.APPROVED,
      });

      const res = await service.getVacancy('vac-uuid-1', 'user-other-person', false);
      expect(res.id).toBe('vac-uuid-1');
    });

    it('allows any user to view an OPEN, ON_HOLD, or FILLED vacancy', async () => {
      prisma.vacancy.findUnique.mockResolvedValueOnce({
        ...mockVacancy,
        requestedByUserId: 'user-requester-1',
        status: VacancyStatus.OPEN,
      });

      const res = await service.getVacancy('vac-uuid-1', 'user-other-person', false);
      expect(res.id).toBe('vac-uuid-1');
    });

    it('returns paginated vacancies with filters', async () => {
      const res = await service.getVacancies({
        status: VacancyStatus.DRAFT,
        page: 1,
        limit: 10,
      });

      expect(res.items).toHaveLength(1);
      expect(res.total).toBe(1);
      expect(res.totalPages).toBe(1);
    });

    it('scopes unapproved vacancies to creator when caller is not CEO', async () => {
      await service.getVacancies({ page: 1, limit: 10 }, 'user-requester-1', false);

      expect(prisma.vacancy.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            AND: expect.arrayContaining([
              expect.objectContaining({
                OR: expect.arrayContaining([
                  { requestedByUserId: 'user-requester-1' },
                ]),
              }),
            ]),
          }),
        }),
      );
    });

    it('does not restrict to creator when caller is CEO', async () => {
      prisma.vacancy.findMany.mockClear();

      await service.getVacancies({ page: 1, limit: 10 }, 'user-ceo-id', true);

      expect(prisma.vacancy.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.not.objectContaining({
            AND: expect.anything(),
          }),
        }),
      );
    });
  });

  describe('VacancyController — CEO Visibility Resolution & CO_FOUNDER Protection', () => {
    let controller: VacancyController;
    let mockRbacService: { getPermissionsForUser: jest.Mock };
    let mockVacancyService: { getVacancies: jest.Mock; getVacancy: jest.Mock };

    beforeEach(() => {
      mockRbacService = {
        getPermissionsForUser: jest.fn(),
      };
      mockVacancyService = {
        getVacancies: jest.fn().mockResolvedValue({ items: [], total: 0 }),
        getVacancy: jest.fn().mockResolvedValue({ id: 'vac-1', status: 'DRAFT' }),
      };

      controller = new VacancyController(
        mockVacancyService as any,
        mockRbacService as any,
      );
    });

    it('resolves isCeo = true for CEO user holding vacancy.approve', async () => {
      mockRbacService.getPermissionsForUser.mockResolvedValue(
        new Set(['vacancy.read', 'vacancy.approve']),
      );

      await controller.getVacancies({}, { id: 'ceo-user-1', email: 'ceo@elscore.com' });

      expect(mockVacancyService.getVacancies).toHaveBeenCalledWith(
        {},
        'ceo-user-1',
        true, // isCeo = true
      );
    });

    it('resolves isCeo = false for HR Manager holding vacancy.read without vacancy.approve', async () => {
      mockRbacService.getPermissionsForUser.mockResolvedValue(
        new Set(['vacancy.read', 'vacancy.create', 'vacancy.update']),
      );

      await controller.getVacancies({}, { id: 'hr-mgr-1', email: 'hr@elscore.com' });

      expect(mockVacancyService.getVacancies).toHaveBeenCalledWith(
        {},
        'hr-mgr-1',
        false, // isCeo = false
      );
    });

    it('resolves isCeo = false for CO_FOUNDER holding analytics.ceo.read without vacancy.approve', async () => {
      mockRbacService.getPermissionsForUser.mockResolvedValue(
        new Set(['vacancy.read', 'analytics.ceo.read', 'report.view']),
      );

      await controller.getVacancies({}, { id: 'co-founder-1', email: 'cofounder@elscore.com' });

      expect(mockVacancyService.getVacancies).toHaveBeenCalledWith(
        {},
        'co-founder-1',
        false, // isCeo = false (CO_FOUNDER no longer receives CEO-level vacancy scoping!)
      );
    });

    it('passes isCeo = false to getVacancy for CO_FOUNDER holding analytics.ceo.read', async () => {
      mockRbacService.getPermissionsForUser.mockResolvedValue(
        new Set(['vacancy.read', 'analytics.ceo.read']),
      );

      await controller.getVacancy('vac-1', { id: 'co-founder-1', email: 'cofounder@elscore.com' });

      expect(mockVacancyService.getVacancy).toHaveBeenCalledWith(
        'vac-1',
        'co-founder-1',
        false, // isCeo = false
      );
    });

    it('passes isCeo = true to getVacancy for CEO holding vacancy.approve', async () => {
      mockRbacService.getPermissionsForUser.mockResolvedValue(
        new Set(['vacancy.read', 'vacancy.approve']),
      );

      await controller.getVacancy('vac-1', { id: 'ceo-user-1', email: 'ceo@elscore.com' });

      expect(mockVacancyService.getVacancy).toHaveBeenCalledWith(
        'vac-1',
        'ceo-user-1',
        true, // isCeo = true
      );
    });
  });
});
