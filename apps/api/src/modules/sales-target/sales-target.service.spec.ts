import { Test, TestingModule } from '@nestjs/testing';
import { SalesTargetService } from './sales-target.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../../common/audit/audit.service';
import { SalesTargetType } from '@prisma/client';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeTarget(overrides: Partial<any> = {}) {
  return {
    id: 'target-1',
    userId: 'counsellor-1',
    periodMonth: 9,
    periodYear: 2026,
    targetType: SalesTargetType.CONVERSION_PERCENTAGE,
    targetValue: '20.00', // 20%
    setByUserId: 'head-1',
    createdAt: new Date(),
    updatedAt: new Date(),
    history: [],
    ...overrides,
  };
}

// ── Mocks ────────────────────────────────────────────────────────────────────

const mockAudit = { recordInTx: jest.fn().mockResolvedValue(undefined) };

describe('SalesTargetService', () => {
  let service: SalesTargetService;
  let prisma: any;

  beforeEach(async () => {
    // Build a minimal prisma mock that we can configure per test
    prisma = {
      salesTarget: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
        upsert: jest.fn(),
      },
      salesTargetHistory: {
        create: jest.fn(),
      },
      leadAssignmentHistory: {
        findMany: jest.fn(),
      },
      leadStatusHistory: {
        findMany: jest.fn(),
      },
      targetCreditLedger: {
        aggregate: jest.fn(),
      },
      $transaction: jest.fn().mockImplementation(async (fn) => fn(prisma)),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SalesTargetService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditService, useValue: mockAudit },
      ],
    }).compile();

    service = module.get<SalesTargetService>(SalesTargetService);
  });

  afterEach(() => jest.clearAllMocks());

  // ── T1: Sales Head creates monthly conversion target ──────────────────────
  it('T1: creates a new conversion target', async () => {
    prisma.salesTarget.findUnique.mockResolvedValue(null);
    const created = makeTarget();
    prisma.salesTarget.upsert.mockResolvedValue(created);

    const result = await service.setTarget(
      {
        userId: 'counsellor-1',
        periodMonth: 9,
        periodYear: 2026,
        targetType: SalesTargetType.CONVERSION_PERCENTAGE,
        targetValue: 20,
      },
      'head-1',
    );

    expect(result.id).toBe('target-1');
    // No history snapshot on create
    expect(prisma.salesTargetHistory.create).not.toHaveBeenCalled();
    // Audit event fired
    expect(mockAudit.recordInTx).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ action: 'SALES_TARGET_CREATED' }),
    );
  });

  // ── T2: Sales Head creates monthly revenue target ─────────────────────────
  it('T2: creates a revenue target', async () => {
    prisma.salesTarget.findUnique.mockResolvedValue(null);
    const revenueTarget = makeTarget({
      targetType: SalesTargetType.REVENUE_AED,
      targetValue: '200000.00',
    });
    prisma.salesTarget.upsert.mockResolvedValue(revenueTarget);

    const result = await service.setTarget(
      {
        userId: 'counsellor-1',
        periodMonth: 9,
        periodYear: 2026,
        targetType: SalesTargetType.REVENUE_AED,
        targetValue: 200000,
      },
      'head-1',
    );

    expect(result.targetType).toBe(SalesTargetType.REVENUE_AED);
    expect(prisma.salesTargetHistory.create).not.toHaveBeenCalled();
  });

  // ── T3: Duplicate monthly target — upsert updates, snapshots history ──────
  it('T3: updating existing target snapshots history', async () => {
    const existing = makeTarget(); // 20% CONVERSION
    prisma.salesTarget.findUnique.mockResolvedValue(existing);

    const updated = makeTarget({
      targetType: SalesTargetType.REVENUE_AED,
      targetValue: '200000.00',
    });
    prisma.salesTarget.upsert.mockResolvedValue(updated);

    await service.setTarget(
      {
        userId: 'counsellor-1',
        periodMonth: 9,
        periodYear: 2026,
        targetType: SalesTargetType.REVENUE_AED,
        targetValue: 200000,
      },
      'head-1',
    );

    // History MUST be created with previous values
    expect(prisma.salesTargetHistory.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        previousType: SalesTargetType.CONVERSION_PERCENTAGE,
        previousValue: '20.00',
        newType: SalesTargetType.REVENUE_AED,
        newValue: 200000,
        changedByUserId: 'head-1',
      }),
    });

    expect(mockAudit.recordInTx).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        action: 'SALES_TARGET_UPDATED',
        oldValue: expect.objectContaining({ targetType: SalesTargetType.CONVERSION_PERCENTAGE }),
        newValue: expect.objectContaining({ targetType: SalesTargetType.REVENUE_AED }),
      }),
    );
  });

  // ── T4: No history snapshot when value is identical ───────────────────────
  it('T4: no history snapshot if type and value unchanged', async () => {
    const existing = makeTarget({ targetType: SalesTargetType.CONVERSION_PERCENTAGE, targetValue: '20.00' });
    prisma.salesTarget.findUnique.mockResolvedValue(existing);
    prisma.salesTarget.upsert.mockResolvedValue(existing);

    await service.setTarget(
      {
        userId: 'counsellor-1',
        periodMonth: 9,
        periodYear: 2026,
        targetType: SalesTargetType.CONVERSION_PERCENTAGE,
        targetValue: 20, // same
      },
      'head-1',
    );

    expect(prisma.salesTargetHistory.create).not.toHaveBeenCalled();
  });

  // ── T5: Revenue target progress uses TargetCreditLedger ──────────────────
  it('T5: getProgress for REVENUE_AED uses TargetCreditLedger', async () => {
    const target = makeTarget({ targetType: SalesTargetType.REVENUE_AED, targetValue: '200000.00' });
    prisma.salesTarget.findUnique.mockResolvedValue(target);
    prisma.targetCreditLedger.aggregate.mockResolvedValue({ _sum: { amount: '150000.00' } });

    const result = await service.getProgress('counsellor-1', 9, 2026);

    expect(result.actual).toBe(150000);
    expect(result.progress).toBeCloseTo(0.75); // 150000/200000
    expect(result.required).toBe(200000);
  });

  // ── T6: Conversion — 40 leads, 20% target = 8 required ───────────────────
  it('T6: 40 assigned leads + 20% target = 8 required PAID', async () => {
    const target = makeTarget({ targetType: SalesTargetType.CONVERSION_PERCENTAGE, targetValue: '20.00' });
    prisma.salesTarget.findUnique.mockResolvedValue(target);

    // 40 distinct leads assigned this month
    prisma.leadAssignmentHistory.findMany.mockResolvedValue(
      Array.from({ length: 40 }, (_, i) => ({ leadId: `lead-${i}` })),
    );
    // 6 leads reached PAID (current owner is counsellor-1)
    prisma.leadStatusHistory.findMany.mockResolvedValue(
      Array.from({ length: 6 }, (_, i) => ({ leadId: `lead-${i}` })),
    );

    const result = await service.getProgress('counsellor-1', 9, 2026);

    expect(result.denominatorCount).toBe(40);
    expect(result.numeratorCount).toBe(6);
    expect(result.required).toBe(8); // ceil(20% * 40)
    expect(result.actual).toBeCloseTo(15); // 6/40 * 100 = 15%
    expect(result.progress).toBeCloseTo(0.75); // 15% / 20% = 0.75
  });

  // ── T7: Unpaid leads do NOT count as conversion ───────────────────────────
  it('T7: only PAID status transitions count as numerator', async () => {
    const target = makeTarget({ targetType: SalesTargetType.CONVERSION_PERCENTAGE, targetValue: '20.00' });
    prisma.salesTarget.findUnique.mockResolvedValue(target);

    // 10 leads assigned
    prisma.leadAssignmentHistory.findMany.mockResolvedValue(
      Array.from({ length: 10 }, (_, i) => ({ leadId: `lead-${i}` })),
    );
    // 0 PAID transitions
    prisma.leadStatusHistory.findMany.mockResolvedValue([]);

    const result = await service.getProgress('counsellor-1', 9, 2026);

    expect(result.numeratorCount).toBe(0);
    expect(result.actual).toBe(0);
    expect(result.progress).toBe(0);
  });

  // ── T8: Current owner credit (B gets credit when A→B then B→PAID) ─────────
  it('T8: credit follows current owner at time of PAID transition', async () => {
    const target = makeTarget({ targetType: SalesTargetType.CONVERSION_PERCENTAGE, targetValue: '20.00' });
    prisma.salesTarget.findUnique.mockResolvedValue(target);

    // B (counsellor-1) has 5 leads assigned this month
    prisma.leadAssignmentHistory.findMany.mockResolvedValue(
      Array.from({ length: 5 }, (_, i) => ({ leadId: `lead-${i}` })),
    );
    // 3 leads reached PAID while B is the current owner
    // (The service queries LeadStatusHistory WHERE lead.assignedToUserId = counsellor-1)
    prisma.leadStatusHistory.findMany.mockResolvedValue([
      { leadId: 'lead-0' },
      { leadId: 'lead-1' },
      { leadId: 'lead-2' },
    ]);

    const result = await service.getProgress('counsellor-1', 9, 2026);

    expect(result.numeratorCount).toBe(3); // B gets credit for 3
    // Verify leadStatusHistory was called with lead.assignedToUserId = counsellor-1
    expect(prisma.leadStatusHistory.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          newStatus: 'PAID',
          lead: expect.objectContaining({ assignedToUserId: 'counsellor-1' }),
        }),
      }),
    );
  });

  // ── T9: No target set returns zeros ─────────────────────────────────────
  it('T9: returns zero progress when no target set', async () => {
    prisma.salesTarget.findUnique.mockResolvedValue(null);
    const result = await service.getProgress('counsellor-1', 9, 2026);
    expect(result.target).toBeNull();
    expect(result.progress).toBe(0);
    expect(result.actual).toBe(0);
  });

  // ── T10: Zero denominator avoids division-by-zero ────────────────────────
  it('T10: zero assigned leads returns 0% progress without error', async () => {
    const target = makeTarget();
    prisma.salesTarget.findUnique.mockResolvedValue(target);
    prisma.leadAssignmentHistory.findMany.mockResolvedValue([]);
    prisma.leadStatusHistory.findMany.mockResolvedValue([]);

    const result = await service.getProgress('counsellor-1', 9, 2026);
    expect(result.actual).toBe(0);
    expect(result.progress).toBe(0);
    expect(result.denominatorCount).toBe(0);
  });
});
