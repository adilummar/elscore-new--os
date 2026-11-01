import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { AuditService } from '../../common/audit/audit.service';
import { IdGeneratorService } from '../../common/id-generator/id-generator.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuthorizationService } from '../../common/rbac/authorization.service';
import { MentoringHandoverService } from '../mentoring/mentoring-handover.service';
import { PricingService } from '../pricing/pricing.service';

import { QuotationService } from './quotation.service';

const testUser = (id: string) => ({ id, email: `${id}@crm-test.com` });

describe('QuotationService', () => {
  let service: QuotationService;

  const mockPrisma: any = {
    $transaction: jest.fn((cb: any) => cb(mockPrisma)),
    $executeRaw: jest.fn().mockResolvedValue(1),
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
    requirement: {
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      findMany: jest.fn().mockResolvedValue([]),
    },
  };

  const mockHandover = {
    isHandedOver: jest.fn().mockResolvedValue(false),
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
    mockHandover.isHandedOver.mockResolvedValue(false);
    mockPrisma.requirement.findMany.mockResolvedValue([]);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        QuotationService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: AuditService, useValue: { recordInTx: jest.fn() } },
        { provide: IdGeneratorService, useValue: mockIdGenerator },
        { provide: PricingService, useValue: mockPricingService },
        { provide: AuthorizationService, useValue: mockAuthzService },
        { provide: MentoringHandoverService, useValue: mockHandover },
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
    mockPrisma.quotation.create.mockImplementation((args: any) => ({
      ...args.data,
      lineItems: args.data.lineItems?.create ?? [],
    }));
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

  it('should reject when requirement has no monthlyHours and no subjectHours override is provided', async () => {
    setupMockStudent('DEMO_COMPLETED', {
      requirements: [
        {
          subjectId: 'subj-no-hours',
          curriculumId: 'c1',
          gradeId: 'grade1',
          monthlyHours: null,
          subject: { name: 'Physics' },
          curriculum: { name: 'CBSE' },
          grade: { name: 'Grade 5', sortOrder: 6 },
        },
      ],
    });

    await expect(
      service.previewQuotation({ studentId: 's1' }, testUser('u1')),
    ).rejects.toThrow('Monthly hours missing or invalid for subject Physics.');
  });

  it('should preview and generate successfully when dto.subjectHours provides hours for a requirement without hours', async () => {
    setupMockStudent('DEMO_COMPLETED', {
      requirements: [
        {
          subjectId: 'subj-override',
          curriculumId: 'c1',
          gradeId: 'grade1',
          monthlyHours: null,
          subject: { name: 'Chemistry' },
          curriculum: { name: 'CBSE' },
          grade: { name: 'Grade 5', sortOrder: 6 },
        },
      ],
    });
    mockPricingService.resolveHourlyRate.mockResolvedValue({ rate: 20, source: 'SLAB' });

    const preview: any = await service.previewQuotation(
      {
        studentId: 's1',
        subjectHours: [{ subjectId: 'subj-override', monthlyHours: 15 }],
      },
      testUser('u1'),
    );

    expect(preview.lineItems[0].monthlyHours).toBe(15);
    expect(preview.normalMonthlyTotal).toBe(300);

    const generated: any = await service.generateQuotation(
      {
        studentId: 's1',
        subjectHours: [{ subjectId: 'subj-override', monthlyHours: 15 }],
      },
      testUser('u1'),
    );

    expect(generated.lineItems[0].monthlyHours).toBe(15);
    expect(mockPrisma.requirement.updateMany).toHaveBeenCalledWith({
      where: { studentId: 's1', subjectId: 'subj-override' },
      data: { monthlyHours: 15 },
    });
  });

  describe('Mentoring handover: Sales cannot change monthly hours through a quotation', () => {
    const storedRequirement = (monthlyHours: unknown) => ({
      subjectId: 'subj1',
      curriculumId: 'c1',
      gradeId: 'grade1',
      monthlyHours,
      subject: { name: 'Math' },
      curriculum: { name: 'CBSE' },
      grade: { name: 'Grade 5', sortOrder: 6 },
    });
    const handedOver = (hours: unknown = 10) => {
      mockHandover.isHandedOver.mockResolvedValue(true);
      setupMockStudent('DEMO_COMPLETED', { requirements: [storedRequirement(hours)] });
      mockPrisma.requirement.findMany.mockResolvedValue([{ subjectId: 'subj1', monthlyHours: hours }]);
    };
    const LOCK_MESSAGE = /handed over to Mentoring.*Request the correction through Mentoring/s;

    it('BEFORE handover: hours supplied in the quotation are still saved exactly as before', async () => {
      setupMockStudent('DEMO_COMPLETED');

      const generated: any = await service.generateQuotation(
        { studentId: 's1', subjectHours: [{ subjectId: 'subj1', monthlyHours: 12 }] },
        testUser('u1'),
      );

      expect(generated.lineItems[0].monthlyHours).toBe(12);
      expect(mockPrisma.requirement.updateMany).toHaveBeenCalledWith({
        where: { studentId: 's1', subjectId: 'subj1' },
        data: { monthlyHours: 12 },
      });
      expect(mockPrisma.requirement.findMany).not.toHaveBeenCalled();
    });

    it('AFTER handover: changing the hours is rejected with an actionable message, nothing is written', async () => {
      handedOver(10);

      const attempt = service.generateQuotation(
        { studentId: 's1', subjectHours: [{ subjectId: 'subj1', monthlyHours: 20 }] },
        testUser('u1'),
      );

      await expect(attempt).rejects.toBeInstanceOf(ForbiddenException);
      await expect(attempt).rejects.toThrow(LOCK_MESSAGE);
      expect(mockPrisma.requirement.updateMany).not.toHaveBeenCalled();
      expect(mockPrisma.quotation.create).not.toHaveBeenCalled();
    });

    it('AFTER handover: preview cannot be used to price different hours either', async () => {
      handedOver(10);

      await expect(
        service.previewQuotation({ studentId: 's1', subjectHours: [{ subjectId: 'subj1', monthlyHours: 25 }] }, testUser('u1')),
      ).rejects.toThrow(LOCK_MESSAGE);
    });

    it('AFTER handover: setting hours on a requirement that has none is also a change and is rejected', async () => {
      handedOver(null);

      await expect(
        service.generateQuotation({ studentId: 's1', subjectHours: [{ subjectId: 'subj1', monthlyHours: 8 }] }, testUser('u1')),
      ).rejects.toThrow(LOCK_MESSAGE);
      expect(mockPrisma.requirement.updateMany).not.toHaveBeenCalled();
    });

    it('AFTER handover: a quotation can still be generated from the verified stored hours (no overrides)', async () => {
      handedOver(10);

      const result: any = await service.generateQuotation({ studentId: 's1' }, testUser('u1'));

      expect(result.lineItems[0].monthlyHours).toBe(10);
      expect(result.quotationNumber).toBe('QUO-0001');
      expect(mockPrisma.requirement.updateMany).not.toHaveBeenCalled();
    });

    it('AFTER handover: re-sending the same hours is not a change, so generation succeeds without any write', async () => {
      handedOver('10.00');

      const result: any = await service.generateQuotation(
        { studentId: 's1', subjectHours: [{ subjectId: 'subj1', monthlyHours: 10 }] },
        testUser('u1'),
      );

      expect(result.lineItems[0].monthlyHours).toBe(10);
      expect(mockPrisma.requirement.updateMany).not.toHaveBeenCalled();
    });

    it('AFTER handover: pricing, offer rate and notes keep working (only monthly hours are locked)', async () => {
      handedOver(10);
      mockPricingService.resolveHourlyRate.mockResolvedValue({ rate: 50, source: 'SLAB' });

      const result: any = await service.generateQuotation(
        { studentId: 's1', offerHourlyRate: 40, quotationNotes: 'Sibling discount' },
        testUser('u1'),
      );

      expect(result.offerHourlyRate).toBe(40);
      expect(result.offerMonthlyTotal).toBe(400);
      expect(result.normalMonthlyTotal).toBe(500);
      expect(result.quotationNotes).toBe('Sibling discount');
    });

    it('AFTER handover: an override for a subject that is not one of the student\'s requirements changes nothing and is allowed', async () => {
      handedOver(10);

      await expect(
        service.generateQuotation({ studentId: 's1', subjectHours: [{ subjectId: 'not-a-requirement', monthlyHours: 5 }] }, testUser('u1')),
      ).resolves.toBeDefined();
      expect(mockPrisma.requirement.updateMany).not.toHaveBeenCalled();
    });

    it('the rule is enforced in the service (every caller), after locking the lead and before any write', async () => {
      handedOver(10);

      await expect(
        service.generateQuotation({ studentId: 's1', subjectHours: [{ subjectId: 'subj1', monthlyHours: 11 }] }, testUser('u1')),
      ).rejects.toBeInstanceOf(ForbiddenException);

      expect(mockPrisma.$executeRaw).toHaveBeenCalledTimes(1); // lead row locked so it cannot race a handover
      expect(mockHandover.isHandedOver).toHaveBeenCalledWith(mockPrisma, 's1');
      expect(mockPrisma.quotation.create).not.toHaveBeenCalled();
    });

    it('other rules are unchanged: an unauthorised user is still refused before the hours rule', async () => {
      handedOver(10);
      mockAuthzService.hasPermissions.mockResolvedValue(false);

      await expect(
        service.generateQuotation({ studentId: 's1', subjectHours: [{ subjectId: 'subj1', monthlyHours: 99 }] }, testUser('someone-else')),
      ).rejects.toThrow('You do not have permission to generate quotations for this student');
    });
  });
});
