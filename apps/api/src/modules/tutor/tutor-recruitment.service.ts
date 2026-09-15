import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { TutorRecruitment, TutorRecruitmentStageCode } from '@prisma/client';

import { AuditService } from '../../common/audit/audit.service';
import { IdGeneratorService } from '../../common/id-generator/id-generator.service';
import { paginate, PaginateOptions } from '../../common/pagination/paginate.util';
import { PaginatedResponseDto } from '../../common/pagination/pagination.dto';
import { PrismaService, PrismaTxClient } from '../../common/prisma/prisma.service';

import { AdvanceRecruitmentStageDto, CreateRecruitmentDto, RejectRecruitmentDto } from './dto/tutor-recruitment.dto';

@Injectable()
export class TutorRecruitmentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly idGenerator: IdGeneratorService,
  ) {}

  async findAll(options: Pick<PaginateOptions, 'limit' | 'cursor'>): Promise<PaginatedResponseDto<TutorRecruitment>> {
    return paginate(this.prisma.tutorRecruitment, {
      ...options,
      orderBy: { createdAt: 'desc' }, // Latest first
    });
  }

  async findOne(id: string): Promise<TutorRecruitment> {
    const rec = await this.prisma.tutorRecruitment.findUnique({
      where: { id },
      include: {
        stages: { orderBy: { enteredAt: 'asc' } },
        interviews: true,
      },
    });
    if (!rec) throw new NotFoundException('Recruitment application not found');
    return rec;
  }

  async create(dto: CreateRecruitmentDto, actorUserId: string): Promise<TutorRecruitment> {
    const result = await this.prisma.$transaction(async (tx: PrismaTxClient) => {
      const businessId = await this.idGenerator.nextIdInTx(tx, 'REC');

      const recruitment = await tx.tutorRecruitment.create({
        data: {
          businessId,
          firstName: dto.firstName,
          lastName: dto.lastName,
          phone: dto.phone,
          email: dto.email,
          yearsOfExperience: dto.yearsOfExperience,
          expectedHourlyRate: dto.expectedHourlyRate,
          subjectsText: dto.subjectsText,
          gradesText: dto.gradesText,
          curriculumText: dto.curriculumText,
          availabilityText: dto.availabilityText,
          remarks: dto.remarks,
          currentStage: TutorRecruitmentStageCode.LEAD,
          createdByUserId: actorUserId,
        },
      });

      // Initial stage
      await tx.tutorRecruitmentStage.create({
        data: {
          recruitmentId: recruitment.id,
          stage: TutorRecruitmentStageCode.LEAD,
          enteredByUserId: actorUserId,
          notes: 'Initial enquiry',
        },
      });

      await this.audit.recordInTx(tx, {
        entityType: 'TutorRecruitment',
        entityId: recruitment.id,
        action: 'TUTOR_RECRUITMENT_CREATED',
        actorUserId,
        metadata: { businessId, name: `${dto.firstName} ${dto.lastName}` },
      });

      return recruitment;
    });

    return result;
  }

  async advanceStage(id: string, dto: AdvanceRecruitmentStageDto, actorUserId: string): Promise<TutorRecruitment> {
    const rec = await this.findOne(id);
    if (rec.isRejected) throw new BadRequestException('Cannot advance a rejected application');
    if (rec.currentStage === dto.stage) throw new BadRequestException('Application is already at this stage');
    if (rec.currentStage === TutorRecruitmentStageCode.RECRUITED) throw new BadRequestException('Application is already completed (RECRUITED)');

    const result = await this.prisma.$transaction(async (tx: PrismaTxClient) => {
      const updated = await tx.tutorRecruitment.update({
        where: { id },
        data: { currentStage: dto.stage },
      });

      await tx.tutorRecruitmentStage.create({
        data: {
          recruitmentId: id,
          stage: dto.stage,
          enteredByUserId: actorUserId,
          notes: dto.notes,
        },
      });

      await this.audit.recordInTx(tx, {
        entityType: 'TutorRecruitment',
        entityId: id,
        action: 'TUTOR_RECRUITMENT_STAGE_ADVANCED',
        actorUserId,
        metadata: { oldStage: rec.currentStage, newStage: dto.stage },
      });

      return updated;
    });

    return result;
  }

  async reject(id: string, dto: RejectRecruitmentDto, actorUserId: string): Promise<TutorRecruitment> {
    const rec = await this.findOne(id);
    if (rec.isRejected) throw new BadRequestException('Application is already rejected');
    if (rec.currentStage === TutorRecruitmentStageCode.RECRUITED) throw new BadRequestException('Application is already recruited (cannot reject)');

    const result = await this.prisma.$transaction(async (tx: PrismaTxClient) => {
      const updated = await tx.tutorRecruitment.update({
        where: { id },
        data: {
          isRejected: true,
          rejectionReason: dto.reason,
          rejectedAt: new Date(),
        },
      });

      await this.audit.recordInTx(tx, {
        entityType: 'TutorRecruitment',
        entityId: id,
        action: 'TUTOR_RECRUITMENT_REJECTED',
        actorUserId,
        metadata: { reason: dto.reason },
      });

      return updated;
    });

    return result;
  }
}
