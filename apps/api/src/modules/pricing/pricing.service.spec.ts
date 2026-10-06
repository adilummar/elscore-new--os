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

  const matchesSlab = (where: any) =>
    slabs.find(
      (slab) =>
        slab.curriculumId === where.curriculumId &&
        slab.isActive === where.isActive &&
        slab.gradeFrom <= where.gradeFrom.lte &&
        slab.gradeTo >= where.gradeTo.gte,
    );

  const mockPrisma: any = {
    exceptionalSubjectRate: {
      findFirst: jest.fn(async ({ where }: any) =>
        exceptional && exceptional.subjectId === where.subjectId && exceptional.isActive === where.isActive
          ? exceptional
          : null,
      ),
    },
    pricingSlab: {
      findFirst: jest.fn(async ({ where }: any) => matchesSlab(where) ?? null),
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
    await expect(service.resolveHourlyRate('cbse', 6, 'economics')).resolves.toEqual({
      rate: 11,
      source: 'SLAB',
    });
  });

  it('matches Grade 4 (sortOrder 5) to the same slab', async () => {
    await expect(service.resolveHourlyRate('cbse', 5, 'economics')).resolves.toEqual({
      rate: 11,
      source: 'SLAB',
    });
  });

  it('does not match Kindergarten (sortOrder 1)', async () => {
    await expect(service.resolveHourlyRate('cbse', 1, 'economics')).rejects.toThrow(NotFoundException);
  });

  it('does not match Grade 6 (sortOrder 7)', async () => {
    await expect(service.resolveHourlyRate('cbse', 7, 'economics')).rejects.toThrow(NotFoundException);
  });

  it('uses an active exceptional subject rate before the general slab', async () => {
    exceptional = { subjectId: 'economics', isActive: true, hourlyRate: 14 };
    await expect(service.resolveHourlyRate('cbse', 6, 'economics')).resolves.toEqual({
      rate: 14,
      source: 'EXCEPTIONAL_SUBJECT',
    });
  });

  it('uses the general slab when no exceptional rate exists', async () => {
    await expect(service.resolveHourlyRate('cbse', 6, 'economics')).resolves.toEqual({
      rate: 11,
      source: 'SLAB',
    });
  });

  it('rejects a reversed grade range', async () => {
    await expect(
      service.createPricingSlab({ curriculumId: 'cbse', gradeFrom: 6, gradeTo: 2, hourlyRate: 11 }, 'user-1'),
    ).rejects.toThrow(BadRequestException);
  });
});
