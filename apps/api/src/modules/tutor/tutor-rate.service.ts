import { Injectable, NotFoundException } from '@nestjs/common';
import { TutorRate } from '@prisma/client';

import { AuditService } from '../../common/audit/audit.service';
import { PrismaService, PrismaTxClient } from '../../common/prisma/prisma.service';

@Injectable()
export class TutorRateService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async getActiveRate(tutorProfileId: string): Promise<TutorRate | null> {
    return this.prisma.tutorRate.findFirst({
      where: { tutorProfileId, isActive: true },
    });
  }

  async getRateHistory(tutorProfileId: string): Promise<TutorRate[]> {
    return this.prisma.tutorRate.findMany({
      where: { tutorProfileId },
      orderBy: { effectiveFrom: 'desc' },
    });
  }

  async setHourlyRate(tutorProfileId: string, hourlyRate: number, actorUserId: string): Promise<TutorRate> {
    const profile = await this.prisma.tutorProfile.findUnique({ where: { id: tutorProfileId } });
    if (!profile) throw new NotFoundException('Tutor profile not found');

    const result = await this.prisma.$transaction(async (tx: PrismaTxClient) => {
      // Deactivate current active rate if exists
      const current = await tx.tutorRate.findFirst({
        where: { tutorProfileId, isActive: true },
      });

      if (current) {
        if (Number(current.hourlyRate) === hourlyRate) {
          return current; // No change
        }

        await tx.tutorRate.update({
          where: { id: current.id },
          data: { isActive: false, effectiveTo: new Date() },
        });
      }

      // Create new rate
      const newRate = await tx.tutorRate.create({
        data: {
          tutorProfileId,
          hourlyRate,
          isActive: true,
          createdByUserId: actorUserId,
          effectiveFrom: new Date(),
        },
      });

      await this.audit.recordInTx(tx, {
        entityType: 'TutorProfile',
        entityId: tutorProfileId,
        action: 'TUTOR_RATE_CHANGED',
        actorUserId,
        metadata: { oldRate: current ? current.hourlyRate : null, newRate: hourlyRate },
      });

      return newRate;
    });

    return result;
  }
}
