import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { CompensationRequestStatus } from '@prisma/client';

import { AuditService } from '../../common/audit/audit.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { TutorRateService } from './tutor-rate.service';

describe('TutorRateService Remediation & Approval Governance (HR Phase 2)', () => {
  let service: TutorRateService;
  let prisma: any;
  let audit: any;
  let configService: any;

  const mockTutorProfile = {
    id: 'tutor-prof-1',
    employeeId: 'emp-101',
    employee: {
      id: 'emp-101',
      businessId: 'EMP-0001',
      userId: 'user-tutor-1',
      firstName: 'Fatima',
      lastName: 'Al Zahra',
    },
  };

  const mockActiveRate = {
    id: 'rate-1',
    tutorProfileId: 'tutor-prof-1',
    hourlyRate: 150,
    currency: 'AED',
    effectiveFrom: new Date('2026-01-01T00:00:00.000Z'),
    effectiveTo: null,
    isActive: true,
  };

  beforeEach(async () => {
    prisma = {
      $transaction: jest.fn(async (cb) => cb(prisma)),
      $executeRaw: jest.fn().mockResolvedValue(1),
      tutorProfile: {
        findUnique: jest.fn().mockResolvedValue(mockTutorProfile),
      },
      user: {
        findUnique: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
      },
      tutorRate: {
        findFirst: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn(),
        updateMany: jest.fn(),
      },
      tutorRateChangeRequest: {
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn().mockImplementation((args) => ({
          id: 'rate-req-1',
          ...args.data,
        })),
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
        TutorRateService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditService, useValue: audit },
        { provide: ConfigService, useValue: configService },
      ],
    }).compile();

    service = module.get<TutorRateService>(TutorRateService);
  });

  describe('SEC-COMP-001: CEO Direct Tutor-Rate Assignment vs Self-Approval Prevention', () => {
    it('allows CEO to directly assign hourly rate for another tutor without false self-approval rejection', async () => {
      // Caller is active CEO
      prisma.user.findUnique.mockResolvedValue({
        id: 'ceo-user-1',
        status: 'ACTIVE',
        userRoles: [{ role: { code: 'CEO' } }],
      });
      prisma.tutorRateChangeRequest.findUnique.mockResolvedValue({
        id: 'rate-req-1',
        tutorProfileId: 'tutor-prof-1',
        requestedHourlyRate: 200,
        currency: 'AED',
        effectiveDate: '2026-01-01',
        status: CompensationRequestStatus.PENDING,
        requestedByUserId: 'ceo-user-1',
        tutorProfile: mockTutorProfile, // Tutor is user-tutor-1 != ceo-user-1
      });
      prisma.tutorRateChangeRequest.update.mockResolvedValue({
        id: 'rate-req-1',
        tutorProfileId: 'tutor-prof-1',
        requestedHourlyRate: 200,
        currency: 'AED',
        effectiveDate: '2026-01-01',
        status: CompensationRequestStatus.APPROVED,
        isApplied: true,
      });
      prisma.tutorRate.findFirst.mockResolvedValue({
        ...mockActiveRate,
        hourlyRate: 200,
      });

      const res = await service.setHourlyRate(
        'tutor-prof-1',
        200,
        'ceo-user-1',
        '2026-01-01',
        'Direct CEO Assignment',
      );

      // Verifies active rate returned successfully
      expect(res.hourlyRate).toBe(200);
      expect(prisma.tutorRate.create).toHaveBeenCalled();
    });

    it('strictly blocks CEO from directly setting their own tutor rate (ForbiddenException)', async () => {
      // Tutor profile belongs to the CEO themselves
      prisma.tutorProfile.findUnique.mockResolvedValue({
        ...mockTutorProfile,
        employee: {
          ...mockTutorProfile.employee,
          userId: 'ceo-user-1', // CEO is the tutor!
        },
      });

      await expect(
        service.setHourlyRate('tutor-prof-1', 250, 'ceo-user-1', '2026-01-01', 'CEO self raise'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('strictly blocks CEO from approving their own tutor rate change request in reviewRateChange', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'ceo-user-1',
        status: 'ACTIVE',
        userRoles: [{ role: { code: 'CEO' } }],
      });
      prisma.tutorRateChangeRequest.findUnique.mockResolvedValue({
        id: 'rate-req-1',
        tutorProfileId: 'tutor-prof-1',
        status: CompensationRequestStatus.PENDING,
        requestedByUserId: 'hr-user-1',
        tutorProfile: {
          ...mockTutorProfile,
          employee: {
            ...mockTutorProfile.employee,
            userId: 'ceo-user-1', // CEO is the tutor
          },
        },
      });

      await expect(
        service.reviewRateChange('rate-req-1', { status: 'APPROVED' }, 'ceo-user-1'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('routes non-CEO callers to a pending change request awaiting CEO review', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'hr-user-1',
        status: 'ACTIVE',
        userRoles: [{ role: { code: 'HR_MANAGER' } }],
      });
      prisma.tutorRateChangeRequest.findFirst.mockResolvedValue(null);

      const res = await service.setHourlyRate('tutor-prof-1', 180, 'hr-user-1', '2026-11-01', 'HR request');

      // Creates pending request awaiting CEO review
      expect(res.status).toBe(CompensationRequestStatus.PENDING);
      expect(prisma.tutorRate.create).not.toHaveBeenCalled();
    });

    it('strictly blocks non-CEO users from approving tutor rate change requests', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'hr-user-1',
        status: 'ACTIVE',
        userRoles: [{ role: { code: 'HR_MANAGER' } }],
      });

      await expect(
        service.reviewRateChange('rate-req-1', { status: 'APPROVED' }, 'hr-user-1'),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('SEC-COMP-002: Atomic Concurrency and Idempotent Activation', () => {
    it('claims rate change request atomically on isApplied: false inside transaction', async () => {
      const dueReq = {
        id: 'rate-due-1',
        tutorProfileId: 'tutor-prof-1',
        status: CompensationRequestStatus.APPROVED,
        isApplied: false,
        effectiveDate: '2026-01-01',
        requestedHourlyRate: 200,
        currency: 'AED',
        reason: 'Mid-year bump',
        reviewedByUserId: 'ceo-user-1',
      };
      prisma.tutorRateChangeRequest.findMany.mockResolvedValue([dueReq]);
      prisma.tutorRateChangeRequest.updateMany.mockResolvedValue({ count: 1 });
      prisma.tutorRate.findFirst.mockResolvedValue({
        ...mockActiveRate,
        hourlyRate: 200,
      });

      await service.getActiveRate('tutor-prof-1');

      // Verifies advisory lock per tutor profile
      expect(prisma.$executeRaw).toHaveBeenCalled();
      // Verifies atomic claim
      expect(prisma.tutorRateChangeRequest.updateMany).toHaveBeenCalledWith({
        where: {
          id: 'rate-due-1',
          status: CompensationRequestStatus.APPROVED,
          isApplied: false,
        },
        data: expect.objectContaining({ isApplied: true }),
      });
      expect(prisma.tutorRate.create).toHaveBeenCalled();
    });

    it('safely handles concurrent activation claim race (idempotent noop, zero duplicate rate rows)', async () => {
      const dueReq = {
        id: 'rate-due-1',
        tutorProfileId: 'tutor-prof-1',
        status: CompensationRequestStatus.APPROVED,
        isApplied: false,
        effectiveDate: '2026-01-01',
        requestedHourlyRate: 200,
        currency: 'AED',
      };
      prisma.tutorRateChangeRequest.findMany.mockResolvedValue([dueReq]);
      // Another thread already claimed it
      prisma.tutorRateChangeRequest.updateMany.mockResolvedValue({ count: 0 });

      await service.applyApprovedRateChangesForTutor('tutor-prof-1');

      // Zero duplicate active rows created
      expect(prisma.tutorRate.create).not.toHaveBeenCalled();
      expect(audit.recordInTx).not.toHaveBeenCalledWith(
        prisma,
        expect.objectContaining({ action: 'TUTOR_RATE_ACTIVATED' }),
      );
    });
  });

  describe('SEC-COMP-003: Approved Effective Date Boundary Preservation', () => {
    it('preserves exact approved effectiveDate boundary (not execution timestamp) on TutorRate creation', async () => {
      const backdatedReq = {
        id: 'rate-req-backdated',
        tutorProfileId: 'tutor-prof-1',
        requestedHourlyRate: 210,
        currency: 'AED',
        effectiveDate: '2026-04-01', // April 1st
        status: CompensationRequestStatus.APPROVED,
        isApplied: false,
        reason: 'Q2 revision',
        reviewedByUserId: 'ceo-user-1',
      };

      await (service as any).applySingleApprovedRateRequest(prisma, backdatedReq);

      const createCallArgs = prisma.tutorRate.create.mock.calls[0][0];
      const createdEffectiveFrom: Date = createCallArgs.data.effectiveFrom;

      // Verifies effectiveFrom is April 1st, 2026 (exact calendar date converted from timezone)
      expect(createdEffectiveFrom.toISOString().slice(0, 7)).toBe('2026-03'); // In UTC, midnight April 1 IST is 2026-03-31T18:30:00.000Z
      expect(createCallArgs.data.hourlyRate).toBe(210);

      // Verifies prior rate was closed at the exact same effective date boundary
      const updateCallArgs = prisma.tutorRate.updateMany.mock.calls[0][0];
      expect(updateCallArgs.data.effectiveTo).toEqual(createdEffectiveFrom);
    });
  });

  describe('SEC-COMP-005: Active CEO Defense-in-Depth', () => {
    it('blocks suspended CEO from reviewing rate requests', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'ceo-suspended',
        status: 'SUSPENDED',
        userRoles: [{ role: { code: 'CEO' } }],
      });

      await expect(
        service.reviewRateChange('rate-req-1', { status: 'APPROVED' }, 'ceo-suspended'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('blocks inactive CEO from reviewing rate requests', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'ceo-inactive',
        status: 'INACTIVE',
        userRoles: [{ role: { code: 'CEO' } }],
      });

      await expect(
        service.reviewRateChange('rate-req-1', { status: 'APPROVED' }, 'ceo-inactive'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('blocks SYSTEM actor from reviewing rate requests even if CEO role is stored on its row', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'SYSTEM',
        email: 'system@elscore.internal',
        status: 'ACTIVE',
        userRoles: [{ role: { code: 'CEO' } }],
      });

      await expect(
        service.reviewRateChange('rate-req-1', { status: 'APPROVED' }, 'SYSTEM'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('excludes SYSTEM actor from receiving CEO notifications when rate change is requested', async () => {
      prisma.tutorProfile.findUnique.mockResolvedValue(mockTutorProfile);
      prisma.tutorRate.findFirst.mockResolvedValue(mockActiveRate);
      prisma.tutorRateChangeRequest.create.mockResolvedValue({
        id: 'rate-req-1',
        tutorProfileId: 'tutor-prof-1',
        requestedHourlyRate: 200,
        status: CompensationRequestStatus.PENDING,
      });
      prisma.user.findMany.mockResolvedValue([{ id: 'real-ceo-1' }]);

      await service.requestRateChange(
        'tutor-prof-1',
        {
          requestedHourlyRate: 200,
          effectiveDate: '2026-05-01',
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
            recipientUserId: 'real-ceo-1',
          }),
        }),
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
});
