import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { EmploymentStatus, PayrollPaymentStatus, PayrollRunStatus, Prisma } from '@prisma/client';

import { AuditService } from '../../common/audit/audit.service';
import { IdGeneratorService } from '../../common/id-generator/id-generator.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { EmployeePayrollService } from './employee-payroll.service';

describe('EmployeePayrollService (HR Phase 3)', () => {
  let service: EmployeePayrollService;
  let prisma: any;
  let audit: any;
  let idGenerator: any;

  const mockEmployee1 = {
    id: 'emp-101',
    businessId: 'EMP-0001',
    firstName: 'Alice',
    lastName: 'Sharma',
    employmentStatus: EmploymentStatus.ACTIVE,
    compensations: [
      {
        id: 'comp-101',
        employeeId: 'emp-101',
        baseSalary: new Prisma.Decimal('75000.00'),
        isActive: true,
        effectiveFrom: '2026-01-01',
        effectiveTo: null,
      },
    ],
    department: { id: 'dep-1', name: 'Engineering' },
  };

  const mockEmployee2 = {
    id: 'emp-102',
    businessId: 'EMP-0002',
    firstName: 'Bob',
    lastName: 'Verma',
    employmentStatus: EmploymentStatus.PROBATION,
    compensations: [
      {
        id: 'comp-102',
        employeeId: 'emp-102',
        baseSalary: new Prisma.Decimal('50000.00'),
        isActive: true,
        effectiveFrom: '2026-06-01',
        effectiveTo: null,
      },
    ],
    department: { id: 'dep-2', name: 'Academics' },
  };

  beforeEach(async () => {
    prisma = {
      $transaction: jest.fn(async (cb) => cb(prisma)),
      $executeRaw: jest.fn().mockResolvedValue(1),
      employee: {
        findMany: jest.fn(),
      },
      employeePayrollRun: {
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      employeePayrollItem: {
        findUnique: jest.fn(),
        update: jest.fn(),
      },
    };

    audit = {
      recordInTx: jest.fn().mockResolvedValue(undefined),
    };

    idGenerator = {
      nextIdInTx: jest.fn().mockResolvedValue('PR-0001'),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EmployeePayrollService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditService, useValue: audit },
        { provide: IdGeneratorService, useValue: idGenerator },
      ],
    }).compile();

    service = module.get<EmployeePayrollService>(EmployeePayrollService);
  });

  describe('createDraftRun', () => {
    it('creates a draft employee payroll run aggregating base salaries and generating PR business ID', async () => {
      prisma.employeePayrollRun.findFirst.mockResolvedValue(null);
      prisma.employee.findMany.mockResolvedValue([mockEmployee1, mockEmployee2]);

      prisma.employeePayrollRun.create.mockImplementation(({ data }: any) => ({
        id: 'run-1',
        ...data,
        totalGross: data.totalGross,
        totalNet: data.totalNet,
        items: data.items.create.map((item: any, idx: number) => ({
          id: `item-${idx + 1}`,
          ...item,
        })),
      }));

      const result = await service.createDraftRun(
        { periodStart: '2026-10-01', periodEnd: '2026-10-31', notes: 'October regular payroll' },
        'finance-user-1',
      );

      expect(idGenerator.nextIdInTx).toHaveBeenCalledWith(expect.anything(), 'PR');
      expect(result.businessId).toBe('PR-0001');
      expect(result.employeeCount).toBe(2);
      expect(result.totalGross.toString()).toBe('125000');
      expect(result.totalNet.toString()).toBe('125000');
      expect(result.status).toBe(PayrollRunStatus.DRAFT);
      expect(audit.recordInTx).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          action: 'payroll.run.create',
          entityType: 'employee_payroll_run',
        }),
      );
    });

    it('rejects when an eligible employee is missing active compensation', async () => {
      prisma.employeePayrollRun.findFirst.mockResolvedValue(null);
      const employeeWithoutComp = {
        id: 'emp-103',
        businessId: 'EMP-0003',
        firstName: 'Charlie',
        lastName: 'Rao',
        employmentStatus: EmploymentStatus.ACTIVE,
        compensations: [],
      };
      prisma.employee.findMany.mockResolvedValue([mockEmployee1, employeeWithoutComp]);

      await expect(
        service.createDraftRun(
          { periodStart: '2026-10-01', periodEnd: '2026-10-31' },
          'finance-user-1',
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects invalid calendar dates or when periodStart > periodEnd', async () => {
      await expect(
        service.createDraftRun(
          { periodStart: '2026-10-31', periodEnd: '2026-10-01' },
          'finance-user-1',
        ),
      ).rejects.toThrow(BadRequestException);

      await expect(
        service.createDraftRun(
          { periodStart: 'not-a-date', periodEnd: '2026-10-31' },
          'finance-user-1',
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects duplicate or overlapping runs for the period', async () => {
      prisma.employeePayrollRun.findFirst.mockResolvedValue({
        id: 'run-existing',
        businessId: 'PR-0001',
        periodStart: '2026-10-01',
        periodEnd: '2026-10-31',
        status: PayrollRunStatus.FINALIZED,
      });

      await expect(
        service.createDraftRun(
          { periodStart: '2026-10-15', periodEnd: '2026-11-15' },
          'finance-user-1',
        ),
      ).rejects.toThrow(ConflictException);
    });

    it('rejects draft creation if an employee has multiple active compensations intersecting the period', async () => {
      prisma.employeePayrollRun.findFirst.mockResolvedValue(null);
      const multiCompEmployee = {
        id: 'emp-104',
        businessId: 'EMP-0004',
        firstName: 'Divya',
        lastName: 'Nair',
        employmentStatus: EmploymentStatus.ACTIVE,
        compensations: [
          {
            id: 'comp-104a',
            employeeId: 'emp-104',
            baseSalary: new Prisma.Decimal('60000.00'),
            isActive: true,
            effectiveFrom: '2026-10-15',
            effectiveTo: null,
          },
          {
            id: 'comp-104b',
            employeeId: 'emp-104',
            baseSalary: new Prisma.Decimal('50000.00'),
            isActive: true,
            effectiveFrom: '2026-01-01',
            effectiveTo: '2026-10-14',
          },
        ],
      };
      prisma.employee.findMany.mockResolvedValue([multiCompEmployee]);

      await expect(
        service.createDraftRun(
          { periodStart: '2026-10-01', periodEnd: '2026-10-31' },
          'finance-user-1',
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects draft creation if employee compensation starts mid-period', async () => {
      prisma.employeePayrollRun.findFirst.mockResolvedValue(null);
      const midPeriodEmployee = {
        id: 'emp-105',
        businessId: 'EMP-0005',
        firstName: 'Esha',
        lastName: 'Gupta',
        employmentStatus: EmploymentStatus.ACTIVE,
        compensations: [
          {
            id: 'comp-105',
            employeeId: 'emp-105',
            baseSalary: new Prisma.Decimal('70000.00'),
            isActive: true,
            effectiveFrom: '2026-10-10',
            effectiveTo: null,
          },
        ],
      };
      prisma.employee.findMany.mockResolvedValue([midPeriodEmployee]);

      await expect(
        service.createDraftRun(
          { periodStart: '2026-10-01', periodEnd: '2026-10-31' },
          'finance-user-1',
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects draft creation if employee compensation ends mid-period', async () => {
      prisma.employeePayrollRun.findFirst.mockResolvedValue(null);
      const midPeriodEndEmployee = {
        id: 'emp-106',
        businessId: 'EMP-0006',
        firstName: 'Fahad',
        lastName: 'Khan',
        employmentStatus: EmploymentStatus.ACTIVE,
        compensations: [
          {
            id: 'comp-106',
            employeeId: 'emp-106',
            baseSalary: new Prisma.Decimal('70000.00'),
            isActive: true,
            effectiveFrom: '2026-01-01',
            effectiveTo: '2026-10-20',
          },
        ],
      };
      prisma.employee.findMany.mockResolvedValue([midPeriodEndEmployee]);

      await expect(
        service.createDraftRun(
          { periodStart: '2026-10-01', periodEnd: '2026-10-31' },
          'finance-user-1',
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('finalizeRun', () => {
    it('finalizes a draft run and sets finalized metadata', async () => {
      prisma.employeePayrollRun.findUnique.mockResolvedValue({
        id: 'run-1',
        businessId: 'PR-0001',
        periodStart: '2026-10-01',
        periodEnd: '2026-10-31',
        status: PayrollRunStatus.DRAFT,
        totalGross: new Prisma.Decimal('125000.00'),
        totalNet: new Prisma.Decimal('125000.00'),
        employeeCount: 2,
      });
      prisma.employeePayrollRun.findFirst.mockResolvedValue(null);

      prisma.employeePayrollRun.update.mockResolvedValue({
        id: 'run-1',
        businessId: 'PR-0001',
        status: PayrollRunStatus.FINALIZED,
        finalizedByUserId: 'finance-head-1',
        finalizedAt: new Date(),
        totalGross: new Prisma.Decimal('125000.00'),
        totalNet: new Prisma.Decimal('125000.00'),
        employeeCount: 2,
      });

      const result = await service.finalizeRun('run-1', 'finance-head-1');

      expect(result.status).toBe(PayrollRunStatus.FINALIZED);
      expect(audit.recordInTx).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          action: 'payroll.run.finalize',
          entityId: 'run-1',
        }),
      );
    });

    it('rejects finalization if an overlapping payroll run is already finalized', async () => {
      prisma.employeePayrollRun.findUnique.mockResolvedValue({
        id: 'run-1',
        businessId: 'PR-0001',
        periodStart: '2026-10-15',
        periodEnd: '2026-11-15',
        status: PayrollRunStatus.DRAFT,
      });
      prisma.employeePayrollRun.findFirst.mockResolvedValue({
        id: 'run-earlier',
        businessId: 'PR-0000',
        periodStart: '2026-10-01',
        periodEnd: '2026-10-31',
        status: PayrollRunStatus.FINALIZED,
      });

      await expect(service.finalizeRun('run-1', 'finance-head-1')).rejects.toThrow(ConflictException);
    });

    it('rejects finalization if run is already finalized', async () => {
      prisma.employeePayrollRun.findUnique.mockResolvedValue({
        id: 'run-1',
        status: PayrollRunStatus.FINALIZED,
      });

      await expect(service.finalizeRun('run-1', 'finance-head-1')).rejects.toThrow(BadRequestException);
    });

    it('rejects finalization if run is cancelled', async () => {
      prisma.employeePayrollRun.findUnique.mockResolvedValue({
        id: 'run-1',
        status: PayrollRunStatus.CANCELLED,
      });

      await expect(service.finalizeRun('run-1', 'finance-head-1')).rejects.toThrow(BadRequestException);
    });
  });

  describe('recordItemPayment', () => {
    it('records payment on an item belonging to a finalized run', async () => {
      prisma.employeePayrollItem.findUnique.mockResolvedValue({
        id: 'item-1',
        payrollRunId: 'run-1',
        employeeId: 'emp-101',
        paymentStatus: PayrollPaymentStatus.UNPAID,
        netAmount: new Prisma.Decimal('75000.00'),
        payrollRun: {
          id: 'run-1',
          businessId: 'PR-0001',
          status: PayrollRunStatus.FINALIZED,
        },
        employee: {
          id: 'emp-101',
          businessId: 'EMP-0001',
          firstName: 'Alice',
          lastName: 'Sharma',
        },
      });

      prisma.employeePayrollItem.update.mockResolvedValue({
        id: 'item-1',
        paymentStatus: PayrollPaymentStatus.PAID,
        paidAt: new Date(),
        paidByUserId: 'finance-head-1',
        paymentReference: 'NEFT-987654',
      });

      const result = await service.recordItemPayment(
        'item-1',
        { paymentReference: 'NEFT-987654', paymentNotes: 'Bank transfer success' },
        'finance-head-1',
      );

      expect(result.paymentStatus).toBe(PayrollPaymentStatus.PAID);
      expect(audit.recordInTx).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          action: 'payroll.payment.record',
          entityId: 'item-1',
        }),
      );
    });

    it('rejects recording payment if payroll run is still in DRAFT', async () => {
      prisma.employeePayrollItem.findUnique.mockResolvedValue({
        id: 'item-1',
        paymentStatus: PayrollPaymentStatus.UNPAID,
        payrollRun: {
          id: 'run-1',
          status: PayrollRunStatus.DRAFT,
        },
      });

      await expect(
        service.recordItemPayment('item-1', { paymentReference: 'REF1' }, 'finance-head-1'),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects duplicate payment recording if item is already PAID', async () => {
      prisma.employeePayrollItem.findUnique.mockResolvedValue({
        id: 'item-1',
        paymentStatus: PayrollPaymentStatus.PAID,
        payrollRun: {
          id: 'run-1',
          status: PayrollRunStatus.FINALIZED,
        },
      });

      await expect(
        service.recordItemPayment('item-1', { paymentReference: 'REF1' }, 'finance-head-1'),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('cancelDraftRun', () => {
    it('cancels a draft payroll run and records audit log', async () => {
      prisma.employeePayrollRun.findUnique.mockResolvedValue({
        id: 'run-1',
        businessId: 'PR-0001',
        status: PayrollRunStatus.DRAFT,
      });

      prisma.employeePayrollRun.update.mockResolvedValue({
        id: 'run-1',
        businessId: 'PR-0001',
        status: PayrollRunStatus.CANCELLED,
      });

      const result = await service.cancelDraftRun('run-1', 'finance-head-1');

      expect(result.status).toBe(PayrollRunStatus.CANCELLED);
      expect(audit.recordInTx).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          action: 'payroll.run.cancel',
          entityId: 'run-1',
        }),
      );
    });

    it('rejects cancellation if payroll run is already finalized', async () => {
      prisma.employeePayrollRun.findUnique.mockResolvedValue({
        id: 'run-1',
        status: PayrollRunStatus.FINALIZED,
      });

      await expect(service.cancelDraftRun('run-1', 'finance-head-1')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('rejects cancellation if payroll run is already cancelled', async () => {
      prisma.employeePayrollRun.findUnique.mockResolvedValue({
        id: 'run-1',
        status: PayrollRunStatus.CANCELLED,
      });

      await expect(service.cancelDraftRun('run-1', 'finance-head-1')).rejects.toThrow(
        BadRequestException,
      );
    });
  });
});

