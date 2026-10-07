import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';

import { AuditService } from '../../common/audit/audit.service';
import { PrismaService, PrismaTxClient } from '../../common/prisma/prisma.service';

import { CreatePricingSlabDto, UpdatePricingSlabDto, CreateExceptionalRateDto, UpdateExceptionalRateDto, UpsertFinanceSettingDto } from './dto/pricing.dto';

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
    this.assertOrderedGradeRange(dto.gradeFrom, dto.gradeTo);
    return this.prisma.$transaction(async (tx) => {
      // gradeFrom/gradeTo are Grade.sortOrder values, not displayed grade numbers.
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

  async updatePricingSlab(id: string, dto: CreatePricingSlabDto, userId: string) {
    this.assertOrderedGradeRange(dto.gradeFrom, dto.gradeTo);
    return this.prisma.$transaction(async (tx) => {
      const current = await tx.pricingSlab.findUnique({ where: { id } });
      if (!current) throw new NotFoundException('Pricing slab not found');

      if (current.isActive) {
        const existing = await tx.pricingSlab.findFirst({
          where: {
            id: { not: id },
            curriculumId: dto.curriculumId,
            isActive: true,
            gradeFrom: { lte: dto.gradeTo },
            gradeTo: { gte: dto.gradeFrom },
          },
        });
        if (existing) {
          throw new BadRequestException('An active pricing slab already exists for this curriculum and overlapping grade range.');
        }
      }

      const slab = await tx.pricingSlab.update({
        where: { id },
        data: {
          curriculumId: dto.curriculumId,
          gradeFrom: dto.gradeFrom,
          gradeTo: dto.gradeTo,
          hourlyRate: dto.hourlyRate,
          updatedBy: userId,
        },
      });

      await this.audit.recordInTx(tx, {
        entityType: 'PricingSlab',
        entityId: slab.id,
        action: 'UPDATED',
        actorUserId: userId,
        oldValue: current,
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
      include: { subject: true, grade: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createExceptionalRate(dto: CreateExceptionalRateDto, userId: string) {
    this.assertExceptionalGrade(dto.gradeId);
    return this.prisma.$transaction(async (tx) => {
      await this.assertGradeExists(tx, dto.gradeId);
      await this.assertNoActiveConflict(tx, dto.subjectId, dto.gradeId);

      const rate = await tx.exceptionalSubjectRate.create({
        data: {
          businessId: 'EXR-' + Date.now(),
          subjectId: dto.subjectId,
          gradeId: dto.gradeId,
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

  async updateExceptionalRate(id: string, dto: CreateExceptionalRateDto, userId: string) {
    this.assertExceptionalGrade(dto.gradeId);
    return this.prisma.$transaction(async (tx) => {
      const current = await tx.exceptionalSubjectRate.findUnique({ where: { id } });
      if (!current) throw new NotFoundException('Exceptional subject rate not found');

      await this.assertGradeExists(tx, dto.gradeId);
      if (current.isActive) {
        await this.assertNoActiveConflict(tx, dto.subjectId, dto.gradeId, id);
      }

      const rate = await tx.exceptionalSubjectRate.update({
        where: { id },
        data: {
          subjectId: dto.subjectId,
          gradeId: dto.gradeId,
          hourlyRate: dto.hourlyRate,
          updatedBy: userId,
        },
      });

      await this.audit.recordInTx(tx, {
        entityType: 'ExceptionalSubjectRate',
        entityId: rate.id,
        action: 'UPDATED',
        actorUserId: userId,
        oldValue: current,
        newValue: rate,
      });

      return rate;
    });
  }

  async updateExceptionalRateStatus(id: string, dto: UpdateExceptionalRateDto, userId: string) {
    return this.prisma.$transaction(async (tx) => {
      const current = await tx.exceptionalSubjectRate.findUnique({ where: { id } });
      if (!current) throw new NotFoundException('Exceptional subject rate not found');
      if (dto.isActive) {
        await this.assertNoActiveConflict(tx, current.subjectId, current.gradeId, id);
      }

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
   * Pass the active transaction client during quotation generation so pricing
   * is read from the same transaction as the quotation snapshot.
   */
  async resolveHourlyRate(
    curriculumId: string,
    gradeSortOrder: number,
    subjectId: string,
    gradeId: string,
    db: PrismaTxClient | PrismaService = this.prisma,
  ): Promise<{ rate: number, source: string }> {
    const exceptional = gradeId
      ? await db.exceptionalSubjectRate.findFirst({
          where: { subjectId, gradeId, isActive: true },
        })
      : null;

    if (exceptional) {
      return { rate: Number(exceptional.hourlyRate), source: 'EXCEPTIONAL_SUBJECT' };
    }

    const slab = await db.pricingSlab.findFirst({
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

  private assertOrderedGradeRange(gradeFrom: number, gradeTo: number) {
    if (gradeFrom > gradeTo) {
      throw new BadRequestException('Grade From must be the same as or before Grade To.');
    }
  }

  private assertExceptionalGrade(gradeId: string) {
    if (!gradeId?.trim()) {
      throw new BadRequestException('Grade is required for an exceptional subject rate.');
    }
  }

  private async assertGradeExists(tx: PrismaTxClient, gradeId: string) {
    const grade = await tx.grade.findUnique({ where: { id: gradeId }, select: { id: true } });
    if (!grade) throw new BadRequestException('Grade not found.');
  }

  private async assertNoActiveConflict(
    tx: PrismaTxClient,
    subjectId: string,
    gradeId: string,
    excludeId?: string,
  ) {
    const existing = await tx.exceptionalSubjectRate.findFirst({
      where: {
        subjectId,
        gradeId,
        isActive: true,
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
    });
    if (existing) {
      throw new BadRequestException('An active exceptional rate already exists for this subject and grade.');
    }
  }

  async getFinanceSetting() {
    return this.prisma.financeSetting.findUnique({
      where: { code: 'DEFAULT' },
    });
  }

  async upsertFinanceSetting(dto: UpsertFinanceSettingDto, userId: string) {
    const currency = dto.currency || 'AED';
    if (currency !== 'AED') {
      throw new BadRequestException('AED is the authoritative quotation currency.');
    }

    const accountHolderName = dto.accountHolderName.trim();
    const bankName = dto.bankName.trim();
    const accountNumber = dto.accountNumber.trim();
    const iban = dto.iban.trim();

    if (!accountHolderName || !bankName || !accountNumber || !iban) {
      throw new BadRequestException(
        'Account Holder Name, Bank Name, Account Number, and IBAN are required.',
      );
    }

    return this.prisma.$transaction(async (tx) => {
      const setting = await tx.financeSetting.upsert({
        where: { code: 'DEFAULT' },
        update: {
          registrationFee: dto.registrationFee,
          currency: 'AED',
          accountHolderName,
          bankName,
          accountNumber,
          iban,
          updatedBy: userId,
        },
        create: {
          code: 'DEFAULT',
          registrationFee: dto.registrationFee,
          currency: 'AED',
          accountHolderName,
          bankName,
          accountNumber,
          iban,
          updatedBy: userId,
        },
      });

      await this.audit.recordInTx(tx, {
        entityType: 'FinanceSetting',
        entityId: setting.id,
        action: 'UPSERTED',
        actorUserId: userId,
        newValue: {
          code: setting.code,
          registrationFee: setting.registrationFee,
          currency: setting.currency,
        },
      });

      return setting;
    });
  }
}
