import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { CompensationRequestStatus } from '@prisma/client';

import { AuditService } from '../../common/audit/audit.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { EmployeeCompensationService } from './employee-compensation.service';

describe('EmployeeCompensationService (HR Phase 2 Remediation)', () => {
  let service: EmployeeCompensationService;
  let prisma: any;
  let audit: any;
  let configService: any;

  const mockEmployee = {
    id: 'emp-101',
    businessId: 'EMP-0001',
    userId: 'user-emp-101',
    firstName: 'Arun',
    lastName: 'Kumar',
    jobTitle: 'Senior Tutor',
  };

  const mockActiveComp = {
    id: 'comp-1',
    employeeId: 'emp-101',
    baseSalary: 60000,
    currency: 'INR',
    paymentFrequency: 'MONTHLY',
    bankName: 'HDFC Bank',
    bankAccountNumber: '123456789012',
    bankIfsc: 'HDFC0001234',
    panNumber: 'ABCDE1234F',
    effectiveFrom: '2026-01-01',
    effectiveTo: null,
    isActive: true,
  };

  beforeEach(async () => {
    prisma = {
      $transaction: jest.fn(async (cb) => cb(prisma)),
      $executeRaw: jest.fn().mockResolvedValue(1),
      employee: {
        findUnique: jest.fn(),
      },
      user: {
        findUnique: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
      },
      employeeCompensation: {
        findFirst: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn(),
        updateMany: jest.fn(),
      },
      employeeCompensationChangeRequest: {
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      notification: {
        create: jest.fn().mockResolvedValue({ id: 'notif-1' }),
      },
    };

    audit = {
      record: jest.fn().mockResolvedValue({ id: 'audit-1' }),
      recordInTx: jest.fn().mockResolvedValue({ id: 'audit-tx-1' }),
    };

    configService = {
      get: jest.fn((key: string) => {
        if (key === 'crm.businessTimezone') return 'Asia/Kolkata';
        return null;
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EmployeeCompensationService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditService, useValue: audit },
        { provide: ConfigService, useValue: configService },
      ],
    }).compile();

    service = module.get<EmployeeCompensationService>(EmployeeCompensationService);
  });

  describe('SEC-COMP-005: Active CEO Defense-in-Depth', () => {
    const pendingRequest = {
      id: 'req-101',
      employeeId: 'emp-101',
      currentBaseSalary: 60000,
      requestedBaseSalary: 75000,
      currency: 'INR',
      effectiveDate: '2026-01-01',
      reason: 'Merit increase',
      status: CompensationRequestStatus.PENDING,
      requestedByUserId: 'user-hr-1',
      employee: mockEmployee,
    };

    it('allows active CEO to review request', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'ceo-user-1',
        status: 'ACTIVE',
        userRoles: [{ role: { code: 'CEO' } }],
      });
      prisma.employeeCompensationChangeRequest.findUnique.mockResolvedValue(pendingRequest);
      prisma.employeeCompensationChangeRequest.update.mockResolvedValue({
        ...pendingRequest,
        status: CompensationRequestStatus.APPROVED,
        reviewedByUserId: 'ceo-user-1',
      });

      const result = await service.reviewChange('req-101', { status: 'APPROVED' }, 'ceo-user-1');
      expect(result.status).toBe(CompensationRequestStatus.APPROVED);
    });

    it('blocks suspended CEO from reviewing request (ForbiddenException)', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'ceo-suspended',
        status: 'SUSPENDED',
        userRoles: [{ role: { code: 'CEO' } }],
      });

      await expect(
        service.reviewChange('req-101', { status: 'APPROVED' }, 'ceo-suspended'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('blocks inactive CEO from reviewing request (ForbiddenException)', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'ceo-inactive',
        status: 'INACTIVE',
        userRoles: [{ role: { code: 'CEO' } }],
      });

      await expect(
        service.reviewChange('req-101', { status: 'APPROVED' }, 'ceo-inactive'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('blocks non-CEO user from reviewing request (ForbiddenException)', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'hr-user-1',
        status: 'ACTIVE',
        userRoles: [{ role: { code: 'HR_MANAGER' } }],
      });

      await expect(
        service.reviewChange('req-101', { status: 'APPROVED' }, 'hr-user-1'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('blocks SYSTEM actor from reviewing request even if stored with active CEO role', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'SYSTEM',
        email: 'system@elscore.internal',
        status: 'ACTIVE',
        userRoles: [{ role: { code: 'CEO' } }],
      });

      await expect(
        service.reviewChange('req-101', { status: 'APPROVED' }, 'SYSTEM'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('excludes SYSTEM actor from receiving CEO notifications during requestChange', async () => {
      prisma.employee.findUnique.mockResolvedValue(mockEmployee);
      prisma.employeeCompensation.findFirst.mockResolvedValue(mockActiveComp);
      prisma.employeeCompensationChangeRequest.findFirst.mockResolvedValue(null);
      prisma.employeeCompensationChangeRequest.create.mockResolvedValue({
        id: 'req-new-1',
        employeeId: 'emp-101',
        status: CompensationRequestStatus.PENDING,
      });

      // Mock user.findMany in notifyCeoUsers to verify where clause
      prisma.user.findMany.mockResolvedValue([
        { id: 'ceo-real-1' },
      ]);

      await service.requestChange(
        'emp-101',
        {
          requestedBaseSalary: 70000,
          effectiveDate: '2026-12-01',
          reason: 'Promotion',
        },
        'hr-user-1',
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
      expect(prisma.notification.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            recipientUserId: 'ceo-real-1',
          }),
        }),
      );
    });
  });

  describe('SEC-COMP-002: Atomic JIT and Scheduled Activation Concurrency', () => {
    it('applies approved request and claims it atomically via updateMany', async () => {
      prisma.employee.findUnique.mockResolvedValue(mockEmployee);
      const dueApprovedReq = {
        id: 'req-due-1',
        employeeId: 'emp-101',
        status: CompensationRequestStatus.APPROVED,
        isApplied: false,
        effectiveDate: '2026-01-01',
        requestedBaseSalary: 85000,
        currency: 'INR',
        paymentFrequency: 'MONTHLY',
        reason: 'Mid-year hike',
        reviewedByUserId: 'ceo-user-1',
      };
      prisma.employeeCompensationChangeRequest.findMany.mockResolvedValue([dueApprovedReq]);
      prisma.employeeCompensationChangeRequest.updateMany.mockResolvedValue({ count: 1 });
      prisma.employeeCompensation.findFirst.mockResolvedValue({
        ...mockActiveComp,
        baseSalary: 85000,
      });

      await service.getActiveCompensation('emp-101');

      // Verifies advisory lock is acquired
      expect(prisma.$executeRaw).toHaveBeenCalled();
      // Verifies atomic claim on isApplied: false
      expect(prisma.employeeCompensationChangeRequest.updateMany).toHaveBeenCalledWith({
        where: {
          id: 'req-due-1',
          status: CompensationRequestStatus.APPROVED,
          isApplied: false,
        },
        data: expect.objectContaining({ isApplied: true }),
      });
      // Verifies active compensation created
      expect(prisma.employeeCompensation.create).toHaveBeenCalled();
      expect(audit.recordInTx).toHaveBeenCalledWith(
        prisma,
        expect.objectContaining({ action: 'EMPLOYEE_COMPENSATION_ACTIVATED' }),
      );
    });

    it('safely handles concurrent activation claim race (idempotent noop, zero duplicate rows/audits)', async () => {
      prisma.employee.findUnique.mockResolvedValue(mockEmployee);
      const dueApprovedReq = {
        id: 'req-due-1',
        employeeId: 'emp-101',
        status: CompensationRequestStatus.APPROVED,
        isApplied: false,
        effectiveDate: '2026-01-01',
        requestedBaseSalary: 85000,
        currency: 'INR',
        reason: 'Mid-year hike',
      };
      prisma.employeeCompensationChangeRequest.findMany.mockResolvedValue([dueApprovedReq]);
      // Simulate another concurrent thread already claimed the row
      prisma.employeeCompensationChangeRequest.updateMany.mockResolvedValue({ count: 0 });

      await service.applyApprovedChangesForEmployee('emp-101');

      // Must NOT create duplicate compensation record
      expect(prisma.employeeCompensation.create).not.toHaveBeenCalled();
      // Must NOT create duplicate audit log
      expect(audit.recordInTx).not.toHaveBeenCalledWith(
        prisma,
        expect.objectContaining({ action: 'EMPLOYEE_COMPENSATION_ACTIVATED' }),
      );
    });
  });

  describe('SEC-COMP-006: Timezone Consistency', () => {
    it('uses configured business timezone from ConfigService', () => {
      const today = service.getTodayCalendarDate();
      expect(today).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(configService.get).toHaveBeenCalledWith('crm.businessTimezone');
    });
  });

  describe('Submission & Review Separation of Duties', () => {
    it('rejects self-approval when CEO is the employee being reviewed', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'ceo-user-1',
        status: 'ACTIVE',
        userRoles: [{ role: { code: 'CEO' } }],
      });
      prisma.employeeCompensationChangeRequest.findUnique.mockResolvedValue({
        id: 'req-1',
        status: CompensationRequestStatus.PENDING,
        requestedByUserId: 'hr-1',
        employee: {
          id: 'emp-101',
          userId: 'ceo-user-1', // CEO is the employee
        },
      });

      await expect(
        service.reviewChange('req-1', { status: 'APPROVED' }, 'ceo-user-1'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('rejects self-approval when CEO is the requester', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'ceo-user-1',
        status: 'ACTIVE',
        userRoles: [{ role: { code: 'CEO' } }],
      });
      prisma.employeeCompensationChangeRequest.findUnique.mockResolvedValue({
        id: 'req-1',
        status: CompensationRequestStatus.PENDING,
        requestedByUserId: 'ceo-user-1', // CEO requested it
        employee: {
          id: 'emp-101',
          userId: 'other-user',
        },
      });

      await expect(
        service.reviewChange('req-1', { status: 'APPROVED' }, 'ceo-user-1'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('rejects invalid calendar dates', async () => {
      prisma.employee.findUnique.mockResolvedValue(mockEmployee);

      await expect(
        service.requestChange('emp-101', {
          requestedBaseSalary: 75000,
          effectiveDate: '2026-02-30',
          reason: 'Invalid date revision',
        }, 'user-hr-1'),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects duplicate pending requests under advisory lock', async () => {
      prisma.employee.findUnique.mockResolvedValue(mockEmployee);
      prisma.employeeCompensationChangeRequest.findFirst.mockResolvedValue({
        id: 'pending-1',
        status: CompensationRequestStatus.PENDING,
      });

      await expect(
        service.requestChange('emp-101', {
          requestedBaseSalary: 75000,
          effectiveDate: '2026-11-01',
          reason: 'Duplicate attempt',
        }, 'user-hr-1'),
      ).rejects.toThrow(ConflictException);
    });
  });
});
