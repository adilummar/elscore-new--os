import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { AuditService } from '../../common/audit/audit.service';
import { IdGeneratorService } from '../../common/id-generator/id-generator.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuthorizationService } from '../../common/rbac/authorization.service';
import { PricingService } from '../pricing/pricing.service';

import { QuotationService } from './quotation.service';

const testUser = (id: string) => ({ id, email: `${id}@crm-test.com` });

describe('QuotationService', () => {
  let service: QuotationService;

  const mockPrisma: any = {
    $transaction: jest.fn((cb: any) => cb(mockPrisma)),
    student: {
      findUnique: jest.fn(),
    },
    financeSetting: {
      findUnique: jest.fn(),
    },
    quotation: {
      create: jest.fn(),
      findMany: jest.fn(),
    },
  };

  const mockPricingService = {
    resolveHourlyRate: jest.fn(),
  };

  const mockAuthzService = {
    hasPermissions: jest.fn().mockResolvedValue(true),
  };

  const mockIdGenerator = {
    nextIdInTx: jest.fn().mockResolvedValue('QUO-0001'),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    mockAuthzService.hasPermissions.mockResolvedValue(true);
    mockIdGenerator.nextIdInTx.mockResolvedValue('QUO-0001');

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        QuotationService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: AuditService, useValue: { recordInTx: jest.fn() } },
        { provide: IdGeneratorService, useValue: mockIdGenerator },
        { provide: PricingService, useValue: mockPricingService },
        { provide: AuthorizationService, useValue: mockAuthzService },
      ],
    }).compile();

    service = module.get<QuotationService>(QuotationService);
  });

  const setupMockStudent = (
    leadStatus: string,
    extra: {
      firstName?: string;
      lastName?: string;
      primaryPhone?: string;
      requirements?: any[];
      studentFirstName?: string;
      studentLastName?: string;
    } = {},
  ) => {
    mockPrisma.student.findUnique.mockResolvedValue({
      id: 's1',
      leadId: 'lead-1',
      firstName: extra.studentFirstName ?? 'Jane',
      lastName: extra.studentLastName ?? 'Doe',
      curriculumId: 'student-curriculum',
      gradeId: 'student-grade',
      grade: { name: 'Grade 12', sortOrder: 13 },
      lead: {
        assignedToUserId: 'u1',
        status: leadStatus,
        firstName: extra.firstName ?? 'John',
        lastName: extra.lastName ?? 'Doe',
        primaryPhone: extra.primaryPhone ?? '0501234567',
      },
      requirements: extra.requirements ?? [
        {
          subjectId: 'subj1',
          curriculumId: 'c1',
          gradeId: 'grade1',
          monthlyHours: 10,
          subject: { name: 'Math' },
          curriculum: { name: 'CBSE' },
          grade: { name: 'Grade 5', sortOrder: 6 },
        },
      ],
    });
    mockPrisma.financeSetting.findUnique.mockResolvedValue({
      code: 'DEFAULT',
      registrationFee: 100,
      currency: 'AED',
      accountHolderName: 'Test Holder',
      bankName: 'Test Bank',
      accountNumber: '123456',
      iban: 'AE000000000000000000001',
    });
    mockPrisma.quotation.create.mockImplementation((args: any) => args.data);
    mockPricingService.resolveHourlyRate.mockResolvedValue({ rate: 50, source: 'SLAB' });
  };

  it('TEST 1: should generate quotation when Lead.status = DEMO_COMPLETED', async () => {
    setupMockStudent('DEMO_COMPLETED');
    const result: any = await service.generateQuotation({ studentId: 's1' }, testUser('u1'));
    expect(result.normalMonthlyTotal).toBeDefined();
    expect(result.quotationNumber).toBe('QUO-0001');
  });

  it('TEST 5: should reject when Lead.status = CONTACTED', async () => {
    setupMockStudent('CONTACTED');
    await expect(service.generateQuotation({ studentId: 's1' }, testUser('u1'))).rejects.toThrow(BadRequestException);
  });

  it('TEST 6: should reject when Lead.status = NEGOTIATION', async () => {
    setupMockStudent('NEGOTIATION');
    await expect(service.generateQuotation({ studentId: 's1' }, testUser('u1'))).rejects.toThrow(BadRequestException);
  });

  it('TEST 7: should reject when Lead.status = ENROLLED', async () => {
    setupMockStudent('ENROLLED');
    await expect(service.generateQuotation({ studentId: 's1' }, testUser('u1'))).rejects.toThrow(BadRequestException);
  });

  it('TEST 9: should reject when user does not own Lead and has no bypass', async () => {
    setupMockStudent('DEMO_COMPLETED');
    mockAuthzService.hasPermissions.mockResolvedValue(false);
    await expect(service.generateQuotation({ studentId: 's1' }, testUser('u2'))).rejects.toThrow(ForbiddenException);
  });

  it('CEO/Sales Head with lead.read-all can view quotations for another counsellor student', async () => {
    setupMockStudent('DEMO_COMPLETED');
    mockPrisma.quotation.findMany.mockResolvedValue([]);
    mockAuthzService.hasPermissions.mockResolvedValue(true);
    await expect(service.getQuotationsByStudent('s1', testUser('sales-head'))).resolves.toEqual([]);
    expect(mockAuthzService.hasPermissions).toHaveBeenCalledWith('sales-head', ['lead.read-all']);
  });

  it('Sales Counsellor cannot view quotations for another counsellor student', async () => {
    setupMockStudent('DEMO_COMPLETED');
    mockAuthzService.hasPermissions.mockResolvedValue(false);
    await expect(service.getQuotationsByStudent('s1', testUser('u2'))).rejects.toThrow(
      /You do not have permission to view quotations for this student/,
    );
  });

  it('Sales Counsellor can view quotations for an owned student', async () => {
    setupMockStudent('DEMO_COMPLETED');
    mockPrisma.quotation.findMany.mockResolvedValue([{ id: 'q1' }]);
    mockAuthzService.hasPermissions.mockResolvedValue(false);
    await expect(service.getQuotationsByStudent('s1', testUser('u1'))).resolves.toEqual([{ id: 'q1' }]);
  });

  it('should snapshot parent name and phone from Lead firstName/lastName/primaryPhone', async () => {
    setupMockStudent('DEMO_COMPLETED', {
      firstName: 'Aisha',
      lastName: 'Khan',
      primaryPhone: '971501112233',
    });
    const result: any = await service.generateQuotation({ studentId: 's1' }, testUser('u1'));
    expect(result.parentName).toBe('Aisha Khan');
    expect(result.parentPhone).toBe('971501112233');
    expect(result.parentEmail).toBeNull();
  });

  it('should use Requirement curriculum/grade for the header, not Student-level fields', async () => {
    setupMockStudent('DEMO_COMPLETED');
    const result: any = await service.generateQuotation({ studentId: 's1' }, testUser('u1'));
    expect(result.curriculumName).toBe('CBSE');
    expect(result.gradeName).toBe('Grade 5');
  });

  it('should reject mixed Curriculum + Grade combinations on preview and generate', async () => {
    setupMockStudent('DEMO_COMPLETED', {
      requirements: [
        {
          subjectId: 'subj1',
          curriculumId: 'c1',
          gradeId: 'g1',
          monthlyHours: 10,
          subject: { name: 'Math' },
          curriculum: { name: 'CBSE' },
          grade: { name: 'Grade 5', sortOrder: 5 },
        },
        {
          subjectId: 'subj2',
          curriculumId: 'c2',
          gradeId: 'g2',
          monthlyHours: 8,
          subject: { name: 'English' },
          curriculum: { name: 'IGCSE' },
          grade: { name: 'Grade 6', sortOrder: 6 },
        },
      ],
    });

    await expect(service.previewQuotation({ studentId: 's1' }, testUser('u1'))).rejects.toThrow(
      /different Curriculum and Grade/,
    );
    await expect(service.generateQuotation({ studentId: 's1' }, testUser('u1'))).rejects.toThrow(
      /different Curriculum and Grade/,
    );
  });

  it('should fail closed when FinanceSetting is missing', async () => {
    setupMockStudent('DEMO_COMPLETED');
    mockPrisma.financeSetting.findUnique.mockResolvedValue(null);
    await expect(service.generateQuotation({ studentId: 's1' }, testUser('u1'))).rejects.toThrow(BadRequestException);
  });

  it('should fail closed when quotation account details are missing', async () => {
    setupMockStudent('DEMO_COMPLETED');
    mockPrisma.financeSetting.findUnique.mockResolvedValue({
      code: 'DEFAULT',
      registrationFee: 100,
      currency: 'AED',
      accountHolderName: null,
      bankName: 'Test Bank',
      accountNumber: '123',
      iban: 'AE00',
    });
    await expect(service.generateQuotation({ studentId: 's1' }, testUser('u1'))).rejects.toThrow(
      /account details are not configured/,
    );
  });

  it('should snapshot account details onto the generated quotation', async () => {
    setupMockStudent('DEMO_COMPLETED');
    const result: any = await service.generateQuotation({ studentId: 's1' }, testUser('u1'));
    expect(result.accountHolderName).toBe('Test Holder');
    expect(result.bankName).toBe('Test Bank');
    expect(result.accountNumber).toBe('123456');
    expect(result.iban).toBe('AE000000000000000000001');
  });

  it('prices Economics at the requirement grade using the general slab', async () => {
    setupMockStudent('DEMO_COMPLETED', {
      requirements: [
        {
          subjectId: 'economics',
          curriculumId: 'cbse',
          gradeId: 'grade-5',
          monthlyHours: 15,
          subject: { name: 'Economics' },
          curriculum: { name: 'CBSE' },
          grade: { name: 'Grade 5', sortOrder: 6 },
        },
      ],
    });
    mockPricingService.resolveHourlyRate.mockResolvedValue({ rate: 11, source: 'SLAB' });

    const preview: any = await service.previewQuotation({ studentId: 's1' }, testUser('u1'));

    expect(mockPricingService.resolveHourlyRate).toHaveBeenCalledWith('cbse', 6, 'economics', mockPrisma);
    expect(preview.lineItems[0].originalHourlyRate).toBe(11);
    expect(preview.lineItems[0].normalMonthlyAmount).toBe(165);
    expect(preview.lineItems[0].pricingSource).toBe('SLAB');
    expect(preview.curriculumName).toBe('CBSE');
    expect(preview.gradeName).toBe('Grade 5');
  });

  it('uses an exceptional subject rate returned for the requirement subject', async () => {
    setupMockStudent('DEMO_COMPLETED', {
      requirements: [
        {
          subjectId: 'economics',
          curriculumId: 'cbse',
          gradeId: 'grade-5',
          monthlyHours: 15,
          subject: { name: 'Economics' },
          curriculum: { name: 'CBSE' },
          grade: { name: 'Grade 5', sortOrder: 6 },
        },
      ],
    });
    mockPricingService.resolveHourlyRate.mockResolvedValue({ rate: 14, source: 'EXCEPTIONAL_SUBJECT' });

    const preview: any = await service.previewQuotation({ studentId: 's1' }, testUser('u1'));

    expect(preview.lineItems[0].originalHourlyRate).toBe(14);
    expect(preview.lineItems[0].normalMonthlyAmount).toBe(210);
    expect(preview.lineItems[0].pricingSource).toBe('EXCEPTIONAL_SUBJECT');
  });

  it('should resolve pricing through the transaction client', async () => {
    setupMockStudent('DEMO_COMPLETED');
    await service.generateQuotation({ studentId: 's1', offerHourlyRate: 40 }, testUser('u1'));
    expect(mockPricingService.resolveHourlyRate).toHaveBeenCalledWith('c1', 6, 'subj1', mockPrisma);
  });

  it('should apply offer totals from the shared calculation engine', async () => {
    setupMockStudent('DEMO_COMPLETED');
    const result: any = await service.generateQuotation({ studentId: 's1', offerHourlyRate: 40 }, testUser('u1'));

    expect(result.normalMonthlyTotal).toBe(500);
    expect(result.offerMonthlyTotal).toBe(400);
    expect(result.savingAmount).toBe(100);
    expect(result.totalAmountDue).toBe(500);
  });

  it('should reject if offer rate is > normal rate', async () => {
    setupMockStudent('DEMO_COMPLETED');
    await expect(service.generateQuotation({ studentId: 's1', offerHourlyRate: 60 }, testUser('u1'))).rejects.toThrow(
      BadRequestException,
    );
  });

  it('preview and generate must use the same totals', async () => {
    setupMockStudent('DEMO_COMPLETED');
    const preview: any = await service.previewQuotation({ studentId: 's1', offerHourlyRate: 40 }, testUser('u1'));
    const generated: any = await service.generateQuotation({ studentId: 's1', offerHourlyRate: 40 }, testUser('u1'));
    expect(preview.normalMonthlyTotal).toBe(generated.normalMonthlyTotal);
    expect(preview.offerMonthlyTotal).toBe(generated.offerMonthlyTotal);
    expect(preview.totalAmountDue).toBe(generated.totalAmountDue);
    expect(preview.parentName).toBe(generated.parentName);
    expect(preview.curriculumName).toBe(generated.curriculumName);
  });
});
