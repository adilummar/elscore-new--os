import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import {
  PayrollPaymentStatus,
  PayrollRunStatus,
  Prisma,
  SessionCancellationReason,
  TutorClassRecordStatus,
} from '@prisma/client';

import { AuditService } from '../../common/audit/audit.service';
import { IdGeneratorService } from '../../common/id-generator/id-generator.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { TutorPayableService } from './tutor-payable.service';

describe('TutorPayableService (HR Phase 3)', () => {
  let service: TutorPayableService;
  let prisma: any;
  let audit: any;
  let idGenerator: any;
  let configService: any;

  const mockTutorRate = {
    id: 'rate-1',
    tutorProfileId: 'profile-1',
    hourlyRate: new Prisma.Decimal('120.00'),
    currency: 'AED',
    effectiveFrom: new Date('2026-01-01T00:00:00.000Z'),
    effectiveTo: null,
    isActive: true,
  };

  const mockClassRecord1 = {
    id: 'class-rec-1',
    businessId: 'TCR-0001',
    sessionId: 'sess-1',
    tutorId: 'user-tutor-1',
    status: TutorClassRecordStatus.VERIFIED,
    cancellation: SessionCancellationReason.NOT_CANCELLED,
    isPayrollReady: true,
    scheduledStart: new Date('2026-10-15T10:00:00.000Z'),
    scheduledEnd: new Date('2026-10-15T11:00:00.000Z'),
    workedMinutes: 60,
    tutor: {
      id: 'user-tutor-1',
      email: 'tutor1@elscore.com',
      employee: {
        id: 'emp-tutor-1',
        businessId: 'EMP-0101',
        firstName: 'Farhan',
        lastName: 'Akhtar',
        tutorProfile: {
          id: 'profile-1',
          rates: [mockTutorRate],
        },
      },
    },
  };

  const mockClassRecord2 = {
    id: 'class-rec-2',
    businessId: 'TCR-0002',
    sessionId: 'sess-2',
    tutorId: 'user-tutor-1',
    status: TutorClassRecordStatus.VERIFIED,
    cancellation: SessionCancellationReason.NOT_CANCELLED,
    isPayrollReady: true,
    scheduledStart: new Date('2026-10-16T14:00:00.000Z'),
    scheduledEnd: new Date('2026-10-16T15:30:00.000Z'),
    workedMinutes: 90, // 1.5 hours
    tutor: {
      id: 'user-tutor-1',
      email: 'tutor1@elscore.com',
      employee: {
        id: 'emp-tutor-1',
        businessId: 'EMP-0101',
        firstName: 'Farhan',
        lastName: 'Akhtar',
        tutorProfile: {
          id: 'profile-1',
          rates: [mockTutorRate],
        },
      },
    },
  };

  beforeEach(async () => {
    prisma = {
      $transaction: jest.fn(async (cb) => cb(prisma)),
      $executeRaw: jest.fn().mockResolvedValue(1),
      tutorPayableRun: {
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      tutorPayableItem: {
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      tutorClassRecord: {
        findMany: jest.fn(),
      },
    };

    audit = {
      recordInTx: jest.fn().mockResolvedValue(undefined),
    };

    idGenerator = {
      nextIdInTx: jest.fn().mockResolvedValue('TPR-0001'),
    };

    configService = {
      get: jest.fn((key: string) => {
        if (key === 'crm.businessTimezone') return 'Asia/Kolkata';
        return null;
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TutorPayableService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditService, useValue: audit },
        { provide: IdGeneratorService, useValue: idGenerator },
        { provide: ConfigService, useValue: configService },
      ],
    }).compile();

    service = module.get<TutorPayableService>(TutorPayableService);
  });

  describe('createDraftRun', () => {
    it('creates a draft tutor payable run calculating hours, amounts, and generating TPR business ID', async () => {
      prisma.tutorPayableRun.findFirst.mockResolvedValue(null);
      prisma.tutorClassRecord.findMany.mockResolvedValue([mockClassRecord1, mockClassRecord2]);

      prisma.tutorPayableRun.create.mockImplementation(({ data }: any) => ({
        id: 'payable-run-1',
        ...data,
        items: data.items.create.map((item: any, idx: number) => ({
          id: `item-${idx + 1}`,
          ...item,
        })),
      }));

      const result = await service.createDraftRun(
        { periodStart: '2026-10-01', periodEnd: '2026-10-31', notes: 'October teaching hours' },
        'finance-head-1',
      );

      expect(idGenerator.nextIdInTx).toHaveBeenCalledWith(expect.anything(), 'TPR');
      expect(result.businessId).toBe('TPR-0001');
      expect(result.classCount).toBe(2);
      expect(result.tutorCount).toBe(1);
      // 1 hr * 120 = 120; 1.5 hr * 120 = 180; total = 300 AED
      expect(result.totalAmount.toString()).toBe('300');
      // 60 min + 90 min = 150 min = 2.50 hrs
      expect(result.totalHours.toString()).toBe('2.5');
      expect(result.status).toBe(PayrollRunStatus.DRAFT);
      expect(audit.recordInTx).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          action: 'tutor.payable.create',
          entityType: 'tutor_payable_run',
        }),
      );
    });

    it('rejects when tutor profile is missing for a class record', async () => {
      prisma.tutorPayableRun.findFirst.mockResolvedValue(null);
      const invalidRecord = {
        ...mockClassRecord1,
        tutor: { id: 'user-tutor-99', employee: null },
      };
      prisma.tutorClassRecord.findMany.mockResolvedValue([invalidRecord]);

      await expect(
        service.createDraftRun({ periodStart: '2026-10-01', periodEnd: '2026-10-31' }, 'finance-head-1'),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects when no active tutor rate matches class date', async () => {
      prisma.tutorPayableRun.findFirst.mockResolvedValue(null);
      const recordWithoutRates = {
        ...mockClassRecord1,
        tutor: {
          id: 'user-tutor-1',
          employee: {
            id: 'emp-tutor-1',
            firstName: 'Farhan',
            lastName: 'Akhtar',
            tutorProfile: { id: 'profile-1', rates: [] },
          },
        },
      };
      prisma.tutorClassRecord.findMany.mockResolvedValue([recordWithoutRates]);

      await expect(
        service.createDraftRun({ periodStart: '2026-10-01', periodEnd: '2026-10-31' }, 'finance-head-1'),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects duplicate or overlapping runs for same period', async () => {
      prisma.tutorPayableRun.findFirst.mockResolvedValue({
        id: 'run-existing',
        businessId: 'TPR-0001',
        periodStart: '2026-10-01',
        periodEnd: '2026-10-31',
        status: PayrollRunStatus.FINALIZED,
      });

      await expect(
        service.createDraftRun({ periodStart: '2026-10-15', periodEnd: '2026-11-15' }, 'finance-head-1'),
      ).rejects.toThrow(ConflictException);
    });

    it('rejects when no eligible class records are found', async () => {
      prisma.tutorPayableRun.findFirst.mockResolvedValue(null);
      prisma.tutorClassRecord.findMany.mockResolvedValue([]);

      await expect(
        service.createDraftRun({ periodStart: '2026-10-01', periodEnd: '2026-10-31' }, 'finance-head-1'),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('finalizeRun', () => {
    it('finalizes tutor payable run and logs audit event', async () => {
      prisma.tutorPayableRun.findUnique.mockResolvedValue({
        id: 'payable-run-1',
        businessId: 'TPR-0001',
        periodStart: '2026-10-01',
        periodEnd: '2026-10-31',
        status: PayrollRunStatus.DRAFT,
        totalAmount: new Prisma.Decimal('300.00'),
        totalHours: new Prisma.Decimal('2.50'),
        classCount: 2,
        tutorCount: 1,
        items: [
          { id: 'item-1', classRecordId: 'class-rec-1' },
          { id: 'item-2', classRecordId: 'class-rec-2' },
        ],
      });
      prisma.tutorPayableRun.findFirst.mockResolvedValue(null);
      prisma.tutorPayableItem.findFirst.mockResolvedValue(null);

      prisma.tutorPayableRun.update.mockResolvedValue({
        id: 'payable-run-1',
        businessId: 'TPR-0001',
        status: PayrollRunStatus.FINALIZED,
        finalizedByUserId: 'finance-head-1',
        finalizedAt: new Date(),
        totalAmount: new Prisma.Decimal('300.00'),
        totalHours: new Prisma.Decimal('2.50'),
        classCount: 2,
        tutorCount: 1,
      });

      const result = await service.finalizeRun('payable-run-1', 'finance-head-1');

      expect(result.status).toBe(PayrollRunStatus.FINALIZED);
      expect(audit.recordInTx).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          action: 'tutor.payable.finalize',
          entityId: 'payable-run-1',
        }),
      );
    });

    it('rejects finalization if an overlapping tutor payable run is already finalized', async () => {
      prisma.tutorPayableRun.findUnique.mockResolvedValue({
        id: 'payable-run-1',
        businessId: 'TPR-0001',
        periodStart: '2026-10-15',
        periodEnd: '2026-11-15',
        status: PayrollRunStatus.DRAFT,
        items: [],
      });
      prisma.tutorPayableRun.findFirst.mockResolvedValue({
        id: 'payable-run-0',
        businessId: 'TPR-0000',
        periodStart: '2026-10-01',
        periodEnd: '2026-10-31',
        status: PayrollRunStatus.FINALIZED,
      });

      await expect(service.finalizeRun('payable-run-1', 'finance-head-1')).rejects.toThrow(
        ConflictException,
      );
    });

    it('rejects finalization if run is already finalized', async () => {
      prisma.tutorPayableRun.findUnique.mockResolvedValue({
        id: 'payable-run-1',
        status: PayrollRunStatus.FINALIZED,
        items: [],
      });

      await expect(service.finalizeRun('payable-run-1', 'finance-head-1')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('rejects finalization if run is cancelled', async () => {
      prisma.tutorPayableRun.findUnique.mockResolvedValue({
        id: 'payable-run-1',
        status: PayrollRunStatus.CANCELLED,
        items: [],
      });

      await expect(service.finalizeRun('payable-run-1', 'finance-head-1')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('rejects finalization if any class record was already finalized in another payable run (FIN-AUD-001)', async () => {
      prisma.tutorPayableRun.findUnique.mockResolvedValue({
        id: 'payable-run-1',
        periodStart: '2026-10-01',
        periodEnd: '2026-10-31',
        status: PayrollRunStatus.DRAFT,
        items: [{ id: 'item-1', classRecordId: 'class-rec-1' }],
      });
      prisma.tutorPayableRun.findFirst.mockResolvedValue(null);
      prisma.tutorPayableItem.findFirst.mockResolvedValue({
        id: 'item-conflict',
        classRecord: { businessId: 'TCR-0001' },
        payableRun: { businessId: 'TPR-0088' },
      });

      await expect(service.finalizeRun('payable-run-1', 'finance-head-1')).rejects.toThrow(
        ConflictException,
      );
    });
  });

  describe('recordItemPayment', () => {
    it('records payment on a tutor payable item belonging to a finalized run', async () => {
      prisma.tutorPayableItem.findUnique.mockResolvedValue({
        id: 'item-1',
        payableRunId: 'payable-run-1',
        tutorId: 'user-tutor-1',
        paymentStatus: PayrollPaymentStatus.UNPAID,
        amount: new Prisma.Decimal('180.00'),
        payableRun: {
          id: 'payable-run-1',
          businessId: 'TPR-0001',
          status: PayrollRunStatus.FINALIZED,
        },
        tutor: {
          id: 'user-tutor-1',
          email: 'tutor1@elscore.com',
          employee: { firstName: 'Farhan', lastName: 'Akhtar', businessId: 'EMP-0101' },
        },
      });

      prisma.tutorPayableItem.update.mockResolvedValue({
        id: 'item-1',
        paymentStatus: PayrollPaymentStatus.PAID,
        paidAt: new Date(),
        paidByUserId: 'finance-head-1',
        paymentReference: 'WIRE-AED-001',
      });

      const result = await service.recordItemPayment(
        'item-1',
        { paymentReference: 'WIRE-AED-001', paymentNotes: 'Direct bank transfer in AED' },
        'finance-head-1',
      );

      expect(result.paymentStatus).toBe(PayrollPaymentStatus.PAID);
      expect(audit.recordInTx).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          action: 'tutor.payable.payment.record',
          entityId: 'item-1',
        }),
      );
    });

    it('rejects payment recording if run is in DRAFT', async () => {
      prisma.tutorPayableItem.findUnique.mockResolvedValue({
        id: 'item-1',
        paymentStatus: PayrollPaymentStatus.UNPAID,
        payableRun: {
          id: 'payable-run-1',
          status: PayrollRunStatus.DRAFT,
        },
      });

      await expect(
        service.recordItemPayment('item-1', { paymentReference: 'REF1' }, 'finance-head-1'),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects duplicate payment if item is already PAID', async () => {
      prisma.tutorPayableItem.findUnique.mockResolvedValue({
        id: 'item-1',
        paymentStatus: PayrollPaymentStatus.PAID,
        payableRun: {
          id: 'payable-run-1',
          status: PayrollRunStatus.FINALIZED,
        },
      });

      await expect(
        service.recordItemPayment('item-1', { paymentReference: 'REF1' }, 'finance-head-1'),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('cancelDraftRun', () => {
    it('cancels draft tutor payable run and records audit event', async () => {
      prisma.tutorPayableRun.findUnique.mockResolvedValue({
        id: 'payable-run-1',
        businessId: 'TPR-0001',
        status: PayrollRunStatus.DRAFT,
      });

      prisma.tutorPayableRun.update.mockResolvedValue({
        id: 'payable-run-1',
        businessId: 'TPR-0001',
        status: PayrollRunStatus.CANCELLED,
      });

      const result = await service.cancelDraftRun('payable-run-1', 'finance-head-1');

      expect(result.status).toBe(PayrollRunStatus.CANCELLED);
      expect(audit.recordInTx).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          action: 'tutor.payable.cancel',
          entityId: 'payable-run-1',
        }),
      );
    });

    it('rejects cancelling a finalized tutor payable run', async () => {
      prisma.tutorPayableRun.findUnique.mockResolvedValue({
        id: 'payable-run-1',
        status: PayrollRunStatus.FINALIZED,
      });

      await expect(service.cancelDraftRun('payable-run-1', 'finance-head-1')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('rejects cancelling an already cancelled tutor payable run', async () => {
      prisma.tutorPayableRun.findUnique.mockResolvedValue({
        id: 'payable-run-1',
        status: PayrollRunStatus.CANCELLED,
      });

      await expect(service.cancelDraftRun('payable-run-1', 'finance-head-1')).rejects.toThrow(
        BadRequestException,
      );
    });
  });
});
