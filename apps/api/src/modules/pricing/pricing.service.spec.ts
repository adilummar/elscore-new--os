import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { AuditService } from '../../common/audit/audit.service';
import { PrismaService } from '../../common/prisma/prisma.service';

import { PricingService } from './pricing.service';

describe('PricingService grade-range lookup', () => {
  let service: PricingService;

  const slabs = [
    { id: 'slab-1', curriculumId: 'cbse', isActive: true, gradeFrom: 2, gradeTo: 6, hourlyRate: 11 },
  ];
  let exceptional: any = null;
  const grades = new Set(['grade-5', 'grade-6']);

  const matchesSlab = (where: any) =>
    slabs.find(
      (slab) =>
        slab.curriculumId === where.curriculumId &&
        slab.isActive === where.isActive &&
        slab.gradeFrom <= where.gradeFrom.lte &&
        slab.gradeTo >= where.gradeTo.gte,
    );

  const matchesException = (where: any) => {
    if (
      !exceptional ||
      exceptional.subjectId !== where.subjectId ||
      exceptional.gradeId !== where.gradeId ||
      exceptional.isActive !== where.isActive
    ) {
      return null;
    }
    if (where.id?.not && exceptional.id === where.id.not) return null;
    return exceptional;
  };

  const mockPrisma: any = {
    $transaction: jest.fn((callback: any) => callback(mockPrisma)),
    grade: {
      findUnique: jest.fn(({ where }: any) => (grades.has(where.id) ? { id: where.id } : null)),
    },
    exceptionalSubjectRate: {
      findFirst: jest.fn(({ where }: any) => matchesException(where)),
      findUnique: jest.fn(),
      create: jest.fn(({ data }: any) => ({ id: 'rate-new', ...data })),
      update: jest.fn(({ where, data }: any) => ({ id: where.id, ...data })),
    },
    pricingSlab: {
      findFirst: jest.fn(({ where }: any) => matchesSlab(where) ?? null),
    },
  };

  beforeEach(async () => {
    exceptional = null;
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PricingService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: AuditService, useValue: { recordInTx: jest.fn() } },
      ],
    }).compile();
    service = module.get(PricingService);
  });

  it('matches Grade 5 (sortOrder 6) to the CBSE Grade 1–5 slab at AED 11', async () => {
    await expect(service.resolveHourlyRate('cbse', 6, 'economics', 'grade-5')).resolves.toEqual({
      rate: 11,
      source: 'SLAB',
    });
  });

  it('matches Grade 4 (sortOrder 5) to the same slab', async () => {
    await expect(service.resolveHourlyRate('cbse', 5, 'economics', 'grade-4')).resolves.toEqual({
      rate: 11,
      source: 'SLAB',
    });
  });

  it('does not match Kindergarten (sortOrder 1)', async () => {
    await expect(service.resolveHourlyRate('cbse', 1, 'economics', 'kg')).rejects.toThrow(NotFoundException);
  });

  it('does not match Grade 6 (sortOrder 7)', async () => {
    await expect(service.resolveHourlyRate('cbse', 7, 'economics', 'grade-6')).rejects.toThrow(NotFoundException);
  });

  it('uses an active Economics Grade 5 exception before the general slab', async () => {
    exceptional = { subjectId: 'economics', gradeId: 'grade-5', isActive: true, hourlyRate: 14 };
    await expect(service.resolveHourlyRate('cbse', 6, 'economics', 'grade-5')).resolves.toEqual({
      rate: 14,
      source: 'EXCEPTIONAL_SUBJECT',
    });
  });

  it('does not apply an Economics Grade 5 exception to Economics Grade 6', async () => {
    exceptional = { subjectId: 'economics', gradeId: 'grade-5', isActive: true, hourlyRate: 14 };
    slabs.push({ id: 'slab-6', curriculumId: 'cbse', isActive: true, gradeFrom: 7, gradeTo: 7, hourlyRate: 12 });
    await expect(service.resolveHourlyRate('cbse', 7, 'economics', 'grade-6')).resolves.toEqual({
      rate: 12,
      source: 'SLAB',
    });
    slabs.pop();
  });

  it('applies an Economics Grade 6 exception only to Economics Grade 6', async () => {
    exceptional = { subjectId: 'economics', gradeId: 'grade-6', isActive: true, hourlyRate: 15 };
    await expect(service.resolveHourlyRate('cbse', 7, 'economics', 'grade-6')).resolves.toEqual({
      rate: 15,
      source: 'EXCEPTIONAL_SUBJECT',
    });
    await expect(service.resolveHourlyRate('cbse', 6, 'economics', 'grade-5')).resolves.toEqual({
      rate: 11,
      source: 'SLAB',
    });
  });

  it('does not apply an Economics Grade 5 exception to Mathematics Grade 5', async () => {
    exceptional = { subjectId: 'economics', gradeId: 'grade-5', isActive: true, hourlyRate: 14 };
    await expect(service.resolveHourlyRate('cbse', 6, 'mathematics', 'grade-5')).resolves.toEqual({
      rate: 11,
      source: 'SLAB',
    });
  });

  it('uses the general slab when no exceptional rate exists', async () => {
    await expect(service.resolveHourlyRate('cbse', 6, 'economics', 'grade-5')).resolves.toEqual({
      rate: 11,
      source: 'SLAB',
    });
  });

  it('rejects a reversed grade range', async () => {
    await expect(
      service.createPricingSlab({ curriculumId: 'cbse', gradeFrom: 6, gradeTo: 2, hourlyRate: 11 }, 'user-1'),
    ).rejects.toThrow(BadRequestException);
  });

  it('rejects an exceptional rate without a grade', async () => {
    await expect(
      service.createExceptionalRate({ subjectId: 'economics', gradeId: '', hourlyRate: 14 }, 'user-1'),
    ).rejects.toThrow(/Grade is required/);
  });

  it('rejects an unknown grade record', async () => {
    await expect(
      service.createExceptionalRate({ subjectId: 'economics', gradeId: 'not-a-grade', hourlyRate: 14 }, 'user-1'),
    ).rejects.toThrow(/Grade not found/);
  });

  it('creates an exceptional rate for a subject and exact grade', async () => {
    const created = await service.createExceptionalRate(
      { subjectId: 'economics', gradeId: 'grade-5', hourlyRate: 14 },
      'user-1',
    );
    expect(created).toEqual(expect.objectContaining({
      subjectId: 'economics',
      gradeId: 'grade-5',
      hourlyRate: 14,
    }));
  });

  it('rejects a second active rate for the same subject and grade', async () => {
    exceptional = { id: 'rate-1', subjectId: 'economics', gradeId: 'grade-5', isActive: true, hourlyRate: 14 };
    await expect(
      service.createExceptionalRate({ subjectId: 'economics', gradeId: 'grade-5', hourlyRate: 15 }, 'user-1'),
    ).rejects.toThrow(/subject and grade/);
  });

  it('allows the same subject at a different grade', async () => {
    exceptional = { id: 'rate-1', subjectId: 'economics', gradeId: 'grade-5', isActive: true, hourlyRate: 14 };
    await expect(
      service.createExceptionalRate({ subjectId: 'economics', gradeId: 'grade-6', hourlyRate: 15 }, 'user-1'),
    ).resolves.toEqual(expect.objectContaining({ gradeId: 'grade-6', hourlyRate: 15 }));
  });

  it('allows a different subject at the same grade', async () => {
    exceptional = { id: 'rate-1', subjectId: 'economics', gradeId: 'grade-5', isActive: true, hourlyRate: 14 };
    await expect(
      service.createExceptionalRate({ subjectId: 'mathematics', gradeId: 'grade-5', hourlyRate: 13 }, 'user-1'),
    ).resolves.toEqual(expect.objectContaining({ subjectId: 'mathematics', gradeId: 'grade-5' }));
  });

  it('requires a grade when an exceptional rate is edited', async () => {
    mockPrisma.exceptionalSubjectRate.findUnique.mockResolvedValue({
      id: 'rate-1',
      subjectId: 'economics',
      gradeId: 'grade-5',
      isActive: true,
    });
    await expect(
      service.updateExceptionalRate('rate-1', { subjectId: 'economics', gradeId: ' ', hourlyRate: 14 }, 'user-1'),
    ).rejects.toThrow(/Grade is required/);
  });
});
