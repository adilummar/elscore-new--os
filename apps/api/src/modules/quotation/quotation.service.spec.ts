import { Test, TestingModule } from '@nestjs/testing';
import { QuotationService } from './quotation.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../../common/audit/audit.service';
import { IdGeneratorService } from '../../common/id-generator/id-generator.service';
import { PricingService } from '../pricing/pricing.service';
import { AuthorizationService } from '../../common/rbac/authorization.service';
import { BadRequestException, ForbiddenException } from '@nestjs/common';

describe('QuotationService', () => {
  let service: QuotationService;
  let pricingService: PricingService;

  const mockPrisma: any = {
    $transaction: jest.fn(async (cb: any) => cb(mockPrisma)),
    student: {
      findUnique: jest.fn(),
    },
    demo: {
      findFirst: jest.fn(),
    },
    financeSetting: {
      findFirst: jest.fn(),
    },
    quotation: {
      create: jest.fn(),
    },
  };

  const mockPricingService = {
    resolveHourlyRate: jest.fn(),
  };

  const mockAuthzService = {
    hasPermissions: jest.fn().mockResolvedValue(true),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        QuotationService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: AuditService, useValue: { recordInTx: jest.fn() } },
        { provide: IdGeneratorService, useValue: { nextIdInTx: jest.fn().mockResolvedValue('QT-1') } },
        { provide: PricingService, useValue: mockPricingService },
        { provide: AuthorizationService, useValue: mockAuthzService },
      ],
    }).compile();

    service = module.get<QuotationService>(QuotationService);
    pricingService = module.get<PricingService>(PricingService);
  });

  const setupMockStudent = (leadStatus: string, demoStatus: string | null) => {
    mockPrisma.student.findUnique.mockResolvedValue({
      id: 's1',
      lead: { assignedToUserId: 'u1', status: leadStatus },
      curriculumId: 'c1',
      curriculum: { name: 'CBSE' },
      grade: { sortOrder: 5, name: 'Grade 5' },
      requirements: [{ subjectId: 'subj1', monthlyHours: 10, subject: { name: 'Math' } }],
    });
    if (demoStatus) {
      mockPrisma.demo.findFirst.mockResolvedValue({ status: demoStatus });
    } else {
      mockPrisma.demo.findFirst.mockResolvedValue(null);
    }
    mockPrisma.financeSetting.findFirst.mockResolvedValue({ registrationFee: 100, currency: 'AED' });
    mockPrisma.quotation.create.mockImplementation((args: any) => args.data);
    mockPricingService.resolveHourlyRate.mockResolvedValue(50);
  };

  // TEST 1
  it('TEST 1: should generate quotation when Lead.status = DEMO_COMPLETED and Demo.status = SCHEDULED', async () => {
    setupMockStudent('DEMO_COMPLETED', 'SCHEDULED');
    const result: any = await service.generateQuotation({ studentId: 's1' }, { id: 'u1' });
    expect(result.normalMonthlyTotal).toBeDefined();
  });

  // TEST 2
  it('TEST 2: should generate quotation when Lead.status = DEMO_COMPLETED and Demo.status = ASSIGNED', async () => {
    setupMockStudent('DEMO_COMPLETED', 'ASSIGNED');
    const result: any = await service.generateQuotation({ studentId: 's1' }, { id: 'u1' });
    expect(result.normalMonthlyTotal).toBeDefined();
  });

  // TEST 3
  it('TEST 3: should generate quotation when Lead.status = DEMO_COMPLETED and Demo.status = COMPLETED', async () => {
    setupMockStudent('DEMO_COMPLETED', 'COMPLETED');
    const result: any = await service.generateQuotation({ studentId: 's1' }, { id: 'u1' });
    expect(result.normalMonthlyTotal).toBeDefined();
  });

  // TEST 4
  it('TEST 4: should generate quotation when Lead.status = DEMO_COMPLETED and Demo.status = CANCELLED', async () => {
    setupMockStudent('DEMO_COMPLETED', 'CANCELLED');
    const result: any = await service.generateQuotation({ studentId: 's1' }, { id: 'u1' });
    expect(result.normalMonthlyTotal).toBeDefined();
  });

  // TEST 5
  it('TEST 5: should reject when Lead.status = CONTACTED and Demo.status = COMPLETED', async () => {
    setupMockStudent('CONTACTED', 'COMPLETED');
    await expect(service.generateQuotation({ studentId: 's1' }, { id: 'u1' }))
      .rejects.toThrow(BadRequestException);
  });

  // TEST 6
  it('TEST 6: should reject when Lead.status = NEGOTIATION and Demo.status = COMPLETED', async () => {
    setupMockStudent('NEGOTIATION', 'COMPLETED');
    await expect(service.generateQuotation({ studentId: 's1' }, { id: 'u1' }))
      .rejects.toThrow(BadRequestException);
  });

  // TEST 7
  it('TEST 7: should reject when Lead.status = ENROLLED and Demo.status = COMPLETED', async () => {
    setupMockStudent('ENROLLED', 'COMPLETED');
    await expect(service.generateQuotation({ studentId: 's1' }, { id: 'u1' }))
      .rejects.toThrow(BadRequestException);
  });

  // TEST 9
  it('TEST 9: should reject when user does not own Lead and has no bypass', async () => {
    setupMockStudent('DEMO_COMPLETED', 'SCHEDULED');
    mockAuthzService.hasPermissions.mockResolvedValue(false); // No bypass
    // User u2 trying to access u1's lead
    await expect(service.generateQuotation({ studentId: 's1' }, { id: 'u2' }))
      .rejects.toThrow(ForbiddenException);
  });

  it('should apply exceptional rate regardless of curriculum/grade', async () => {
    setupMockStudent('DEMO_COMPLETED', 'SCHEDULED');
    const result: any = await service.generateQuotation({ studentId: 's1', offerHourlyRate: 40 }, { id: 'u1' });
    
    expect(mockPricingService.resolveHourlyRate).toHaveBeenCalledWith('c1', 5, 'subj1');
    expect(result.normalMonthlyTotal).toBe(500); // 10 * 50
    expect(result.offerMonthlyTotal).toBe(400); // 10 * 40
    expect(result.savingAmount).toBe(100);
    expect(result.totalAmountDue).toBe(500); // 400 + 100 fee
  });

  it('should reject if offer rate is > normal rate', async () => {
    setupMockStudent('DEMO_COMPLETED', 'SCHEDULED');

    await expect(service.generateQuotation({ studentId: 's1', offerHourlyRate: 60 }, { id: 'u1' }))
      .rejects.toThrow(BadRequestException);
  });
});
