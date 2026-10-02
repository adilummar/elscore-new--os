import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../../common/audit/audit.service';
import { CreatePricingSlabDto, UpdatePricingSlabDto, CreateExceptionalRateDto, UpdateExceptionalRateDto } from './dto/pricing.dto';
import { IdGeneratorService } from '../../common/id-generator/id-generator.service';

@Injectable()
export class PricingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async getPricingSlabs() {
    return this.prisma.pricingSlab.findMany({
      include: { curriculum: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createPricingSlab(dto: CreatePricingSlabDto, userId: string) {
    return this.prisma.$transaction(async (tx) => {
      // Check for overlapping/ambiguous active slabs
      const existing = await tx.pricingSlab.findFirst({
        where: {
          curriculumId: dto.curriculumId,
          isActive: true,
          OR: [
            { gradeFrom: { lte: dto.gradeTo }, gradeTo: { gte: dto.gradeFrom } }
          ]
        },
      });

      if (existing) {
        throw new BadRequestException('An active pricing slab already exists for this curriculum and overlapping grade range.');
      }

      const slab = await tx.pricingSlab.create({
        data: {
          businessId: 'SLAB-' + Date.now(), // Minimal fallback since no sequence for SLAB
          curriculumId: dto.curriculumId,
          gradeFrom: dto.gradeFrom,
          gradeTo: dto.gradeTo,
          hourlyRate: dto.hourlyRate,
          createdBy: userId,
        },
      });

      await this.audit.recordInTx(tx, {
        entityType: 'PricingSlab',
        entityId: slab.id,
        action: 'CREATED',
        actorUserId: userId,
        newValue: slab,
      });

      return slab;
    });
  }

  async updatePricingSlabStatus(id: string, dto: UpdatePricingSlabDto, userId: string) {
    return this.prisma.$transaction(async (tx) => {
      const slab = await tx.pricingSlab.update({
        where: { id },
        data: { isActive: dto.isActive, updatedBy: userId },
      });

      await this.audit.recordInTx(tx, {
        entityType: 'PricingSlab',
        entityId: slab.id,
        action: dto.isActive ? 'ACTIVATED' : 'DEACTIVATED',
        actorUserId: userId,
        newValue: { isActive: dto.isActive },
      });

      return slab;
    });
  }

  async getExceptionalRates() {
    return this.prisma.exceptionalSubjectRate.findMany({
      include: { subject: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createExceptionalRate(dto: CreateExceptionalRateDto, userId: string) {
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.exceptionalSubjectRate.findFirst({
        where: { subjectId: dto.subjectId, isActive: true },
      });

      if (existing) {
        throw new BadRequestException('An active exceptional rate already exists for this subject.');
      }

      const rate = await tx.exceptionalSubjectRate.create({
        data: {
          businessId: 'EXR-' + Date.now(),
          subjectId: dto.subjectId,
          hourlyRate: dto.hourlyRate,
          createdBy: userId,
        },
      });

      await this.audit.recordInTx(tx, {
        entityType: 'ExceptionalSubjectRate',
        entityId: rate.id,
        action: 'CREATED',
        actorUserId: userId,
        newValue: rate,
      });

      return rate;
    });
  }

  async updateExceptionalRateStatus(id: string, dto: UpdateExceptionalRateDto, userId: string) {
    return this.prisma.$transaction(async (tx) => {
      const rate = await tx.exceptionalSubjectRate.update({
        where: { id },
        data: { isActive: dto.isActive, updatedBy: userId },
      });

      await this.audit.recordInTx(tx, {
        entityType: 'ExceptionalSubjectRate',
        entityId: rate.id,
        action: dto.isActive ? 'ACTIVATED' : 'DEACTIVATED',
        actorUserId: userId,
        newValue: { isActive: dto.isActive },
      });

      return rate;
    });
  }

  /**
   * Resolves the normal hourly rate for a subject.
   */
  async resolveHourlyRate(curriculumId: string, gradeSortOrder: number, subjectId: string): Promise<{ rate: number, source: string }> {
    // 1. Exceptional Rate overrides all
    const exceptional = await this.prisma.exceptionalSubjectRate.findFirst({
      where: { subjectId, isActive: true },
    });

    if (exceptional) {
      return { rate: Number(exceptional.hourlyRate), source: 'EXCEPTIONAL_SUBJECT' };
    }

    // 2. Base Slab
    const slab = await this.prisma.pricingSlab.findFirst({
      where: {
        curriculumId,
        isActive: true,
        gradeFrom: { lte: gradeSortOrder },
        gradeTo: { gte: gradeSortOrder },
      },
    });

    if (!slab) {
      throw new NotFoundException('No applicable pricing slab found for this curriculum and grade.');
    }

    return { rate: Number(slab.hourlyRate), source: 'SLAB' };
  }
}
