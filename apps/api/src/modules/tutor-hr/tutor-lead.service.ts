import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { TutorLead, TutorLeadStageCode } from '@prisma/client';

import { AuditService } from '../../common/audit/audit.service';
import { IdGeneratorService } from '../../common/id-generator/id-generator.service';
import { paginate, PaginateOptions } from '../../common/pagination/paginate.util';
import { PaginatedResponseDto } from '../../common/pagination/pagination.dto';
import { PrismaService, PrismaTxClient } from '../../common/prisma/prisma.service';

import {
  ChangeTutorLeadStageDto,
  CreateTutorLeadDto,
  RecordTutorLeadCallDto,
  RecordTutorLeadDemoDto,
  UpdateTutorLeadAvailabilityDto,
  UpdateTutorLeadDto,
} from './dto/tutor-lead.dto';

@Injectable()
export class TutorLeadService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly idGenerator: IdGeneratorService,
  ) {}

  async findAll(options: Pick<PaginateOptions, 'limit' | 'cursor'>, filters?: { search?: string; stage?: string }): Promise<PaginatedResponseDto<any>> {
    const where: any = {};
    if (filters?.stage) {
      where.currentStage = filters.stage;
    }
    if (filters?.search) {
      where.OR = [
        { firstName: { contains: filters.search, mode: 'insensitive' } },
        { lastName: { contains: filters.search, mode: 'insensitive' } },
        { email: { contains: filters.search, mode: 'insensitive' } },
        { phone: { contains: filters.search, mode: 'insensitive' } },
        { businessId: { contains: filters.search, mode: 'insensitive' } },
      ];
    }
    return paginate(this.prisma.tutorLead, {
      ...options,
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        motherTongue: true,
        salarySlab: true,
        subjects: { include: { subject: true } },
        grades: { include: { grade: true } },
        languages: { include: { language: true } },
      }
    });
  }

  async findOne(id: string) {
    const lead = await this.prisma.tutorLead.findUnique({
      where: { id },
      include: {
        motherTongue: true,
        salarySlab: true,
        subjects: { include: { subject: true } },
        grades: { include: { grade: true } },
        languages: { include: { language: true } },
        stageHistory: { orderBy: { changedAt: 'desc' }, include: { changedBy: { select: { email: true, id: true } } } },
        calls: { orderBy: { calledAt: 'desc' }, include: { caller: { select: { email: true, id: true } } } },
        demos: { orderBy: { createdAt: 'desc' }, include: { recordedBy: { select: { email: true, id: true } } } },
        trainingSessions: { orderBy: { sessionDate: 'desc' } },
        availability: true,
      },
    });
    if (!lead) throw new NotFoundException('Tutor lead not found');

    // Dynamically calculate online experience
    let onlineTeachingExperience = 0;
    if (lead.totalTeachingExperience !== null && lead.offlineTeachingExperience !== null) {
        onlineTeachingExperience = Math.max(0, lead.totalTeachingExperience - lead.offlineTeachingExperience);
    }
    
    return { ...lead, onlineTeachingExperience };
  }

  async create(dto: CreateTutorLeadDto, actorUserId: string) {
    if (dto.totalTeachingExperience !== undefined && dto.offlineTeachingExperience !== undefined) {
      if (dto.offlineTeachingExperience > dto.totalTeachingExperience) {
        throw new BadRequestException('Offline teaching experience cannot be greater than total teaching experience');
      }
    }

    const result = await this.prisma.$transaction(async (tx: PrismaTxClient) => {
      const businessId = await this.idGenerator.nextIdInTx(tx, 'TL');

      const lead = await tx.tutorLead.create({
        data: {
          businessId,
          firstName: dto.firstName,
          lastName: dto.lastName,
          phone: dto.phone,
          email: dto.email,
          motherTongueId: dto.motherTongueId,
          totalTeachingExperience: dto.totalTeachingExperience,
          offlineTeachingExperience: dto.offlineTeachingExperience,
          expectedHourlyRate: dto.expectedHourlyRate,
          remarks: dto.remarks,
          currentStage: TutorLeadStageCode.LEAD,
          createdByUserId: actorUserId,
        },
      });

      await tx.tutorLeadStageHistory.create({
        data: {
          tutorLeadId: lead.id,
          newStage: TutorLeadStageCode.LEAD,
          changedByUserId: actorUserId,
          remarks: 'Initial lead creation',
        },
      });

      if (dto.subjectIds?.length) {
        await tx.tutorLeadSubject.createMany({
          data: dto.subjectIds.map((subjectId) => ({ tutorLeadId: lead.id, subjectId })),
        });
      }
      if (dto.gradeIds?.length) {
        await tx.tutorLeadGrade.createMany({
          data: dto.gradeIds.map((gradeId) => ({ tutorLeadId: lead.id, gradeId })),
        });
      }
      if (dto.languageIds?.length) {
        await tx.tutorLeadLanguage.createMany({
          data: dto.languageIds.map((languageId) => ({ tutorLeadId: lead.id, languageId })),
        });
      }

      await this.audit.recordInTx(tx, {
        entityType: 'TutorLead',
        entityId: lead.id,
        action: 'TUTOR_LEAD_CREATED',
        actorUserId,
        metadata: { businessId, name: `${dto.firstName} ${dto.lastName}` },
      });

      return lead;
    });

    return result;
  }

  async update(id: string, dto: UpdateTutorLeadDto, actorUserId: string) {
    const lead = await this.findOne(id);
    
    // Check experience logic
    const totalExp = dto.totalTeachingExperience ?? lead.totalTeachingExperience;
    const offlineExp = dto.offlineTeachingExperience ?? lead.offlineTeachingExperience;
    
    if (totalExp !== null && offlineExp !== null && offlineExp > totalExp) {
        throw new BadRequestException('Offline teaching experience cannot be greater than total teaching experience');
    }

    return this.prisma.$transaction(async (tx: PrismaTxClient) => {
      const updated = await tx.tutorLead.update({
        where: { id },
        data: {
          firstName: dto.firstName,
          lastName: dto.lastName,
          phone: dto.phone,
          email: dto.email,
          motherTongueId: dto.motherTongueId,
          totalTeachingExperience: dto.totalTeachingExperience,
          offlineTeachingExperience: dto.offlineTeachingExperience,
          expectedHourlyRate: dto.expectedHourlyRate,
          remarks: dto.remarks,
        },
      });

      if (dto.subjectIds) {
        await tx.tutorLeadSubject.deleteMany({ where: { tutorLeadId: id } });
        await tx.tutorLeadSubject.createMany({
          data: dto.subjectIds.map((subjectId) => ({ tutorLeadId: id, subjectId })),
        });
      }
      if (dto.gradeIds) {
        await tx.tutorLeadGrade.deleteMany({ where: { tutorLeadId: id } });
        await tx.tutorLeadGrade.createMany({
          data: dto.gradeIds.map((gradeId) => ({ tutorLeadId: id, gradeId })),
        });
      }
      if (dto.languageIds) {
        await tx.tutorLeadLanguage.deleteMany({ where: { tutorLeadId: id } });
        await tx.tutorLeadLanguage.createMany({
          data: dto.languageIds.map((languageId) => ({ tutorLeadId: id, languageId })),
        });
      }

      await this.audit.recordInTx(tx, {
        entityType: 'TutorLead',
        entityId: id,
        action: 'TUTOR_LEAD_UPDATED',
        actorUserId,
      });

      return updated;
    });
  }

  async changeStage(id: string, dto: ChangeTutorLeadStageDto, actorUserId: string) {
    const lead = await this.findOne(id);

    if (lead.currentStage === dto.stage) {
      throw new BadRequestException('Lead is already at this stage');
    }

    return this.prisma.$transaction(async (tx: PrismaTxClient) => {
      const data: any = { currentStage: dto.stage };
      
      if (dto.stage === TutorLeadStageCode.TRAINING && lead.trainingStartedAt === null) {
          data.trainingStartedAt = new Date();
      }

      const updated = await tx.tutorLead.update({
        where: { id },
        data,
      });

      await tx.tutorLeadStageHistory.create({
        data: {
          tutorLeadId: id,
          previousStage: lead.currentStage,
          newStage: dto.stage,
          changedByUserId: actorUserId,
          remarks: dto.remarks,
        },
      });

      await this.audit.recordInTx(tx, {
        entityType: 'TutorLead',
        entityId: id,
        action: 'TUTOR_LEAD_STAGE_CHANGED',
        actorUserId,
        metadata: { oldStage: lead.currentStage, newStage: dto.stage },
      });

      return updated;
    });
  }

  async recordCall(id: string, dto: RecordTutorLeadCallDto, actorUserId: string) {
    const lead = await this.findOne(id);
    return this.prisma.tutorLeadCall.create({
      data: {
        tutorLeadId: lead.id,
        callerUserId: actorUserId,
        remark: dto.remark,
      },
    });
  }

  async recordDemo(id: string, dto: RecordTutorLeadDemoDto, actorUserId: string) {
    const lead = await this.findOne(id);
    
    return this.prisma.tutorLeadDemo.create({
      data: {
        tutorLeadId: lead.id,
        remarks: dto.remarks,
        isLiveDemo: dto.isLiveDemo ?? false,
        demoDate: dto.demoDate ? new Date(dto.demoDate) : null,
        startTime: dto.startTime ? new Date(`1970-01-01T${dto.startTime}Z`) : null,
        endTime: dto.endTime ? new Date(`1970-01-01T${dto.endTime}Z`) : null,
        recordedByUserId: actorUserId,
      }
    });
  }

  async updateAvailability(id: string, dto: UpdateTutorLeadAvailabilityDto, actorUserId: string) {
    const lead = await this.findOne(id);

    return this.prisma.$transaction(async (tx: PrismaTxClient) => {
      await tx.tutorLeadAvailability.deleteMany({ where: { tutorLeadId: id } });

      const slots = dto.slots.map(s => ({
        tutorLeadId: id,
        dayOfWeek: s.dayOfWeek,
        startTime: new Date(`1970-01-01T${s.startTime}Z`),
        endTime: new Date(`1970-01-01T${s.endTime}Z`),
        isActive: true,
      }));

      await tx.tutorLeadAvailability.createMany({ data: slots });

      await this.audit.recordInTx(tx, {
        entityType: 'TutorLead',
        entityId: id,
        action: 'TUTOR_LEAD_AVAILABILITY_UPDATED',
        actorUserId,
      });

      return { success: true };
    });
  }
}
