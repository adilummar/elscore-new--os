import { Injectable, NotFoundException } from '@nestjs/common';
import { TutorFeedback } from '@prisma/client';

import { AuditService } from '../../common/audit/audit.service';
import { PrismaService, PrismaTxClient } from '../../common/prisma/prisma.service';

import { CreateTutorFeedbackDto } from './dto/tutor-feedback.dto';

@Injectable()
export class TutorFeedbackService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async getFeedback(tutorProfileId: string): Promise<TutorFeedback[]> {
    return this.prisma.tutorFeedback.findMany({
      where: { tutorProfileId },
      orderBy: { createdAt: 'desc' },
      include: {
        givenBy: { select: { id: true, email: true } },
      },
    });
  }

  async addFeedback(tutorProfileId: string, dto: CreateTutorFeedbackDto, actorUserId: string): Promise<TutorFeedback> {
    const profile = await this.prisma.tutorProfile.findUnique({ where: { id: tutorProfileId } });
    if (!profile) throw new NotFoundException('Tutor profile not found');

    const result = await this.prisma.$transaction(async (tx: PrismaTxClient) => {
      const feedback = await tx.tutorFeedback.create({
        data: {
          tutorProfileId,
          givenByUserId: actorUserId,
          feedbackType: dto.feedbackType,
          feedbackPeriodDate: new Date(dto.feedbackPeriodDate),
          rating: dto.rating,
          remarks: dto.comments,
        },
      });

      await this.audit.recordInTx(tx, {
        entityType: 'TutorProfile',
        entityId: tutorProfileId,
        action: 'TUTOR_FEEDBACK_ADDED',
        actorUserId,
        metadata: { feedbackId: feedback.id, rating: dto.rating },
      });

      return feedback;
    });

    return result;
  }
}
