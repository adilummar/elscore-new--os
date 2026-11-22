import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { AuditService } from '../../../common/audit/audit.service';
import { PrismaService, PrismaTxClient } from '../../../common/prisma/prisma.service';

import { SubmitEvaluationDto } from './hiring-demo.dto';

@Injectable()
export class HiringEvaluationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Evaluation is linked to the actual attended booking and attributed to the staff member
   * who conducted the demo. Nobody else (including the Tutor Head) can file it on their behalf.
   */
  async submit(bookingId: string, dto: SubmitEvaluationDto, actorUserId: string) {
    const b = await this.prisma.tutorDemoBooking.findUnique({ where: { id: bookingId }, include: { evaluation: true } });
    if (!b) throw new NotFoundException('Booking not found');
    if (b.status !== 'ATTENDED' || !b.completedAt || !b.attendedByUserId) {
      throw new BadRequestException('Only an attended demo can be evaluated');
    }
    if (b.attendedByUserId !== actorUserId) {
      throw new ForbiddenException('Only the staff member who conducted the demo can submit the evaluation');
    }
    if (b.evaluation) throw new ConflictException('This demo has already been evaluated');
    if (dto.salarySlabId) {
      const slab = await this.prisma.tutorSalarySlab.findFirst({ where: { id: dto.salarySlabId, isActive: true } });
      if (!slab) throw new BadRequestException('Salary slab not found or inactive');
    }
    try {
      return await this.prisma.$transaction(async (tx: PrismaTxClient) => {
        const ev = await tx.tutorDemoEvaluation.create({
          data: {
            bookingId,
            tutorLeadId: b.tutorLeadId,
            evaluatedByUserId: actorUserId,
            teachingMethods: dto.teachingMethods,
            technicalSkills: dto.technicalSkills,
            englishRating: dto.englishRating,
            salarySlabId: dto.salarySlabId,
            remarks: dto.remarks,
          },
        });
        // Mirror onto the legacy lead field so existing HR Tutor screens show the proposed slab.
        if (dto.salarySlabId) await tx.tutorLead.update({ where: { id: b.tutorLeadId }, data: { salarySlabId: dto.salarySlabId } });
        await this.audit.recordInTx(tx, {
          entityType: 'TutorLead', entityId: b.tutorLeadId, action: 'TUTOR_DEMO_EVALUATED', actorUserId,
          newValue: { bookingId, evaluationId: ev.id, englishRating: dto.englishRating, salarySlabId: dto.salarySlabId ?? null },
          metadata: { late: b.evaluationDueAt ? ev.evaluatedAt > b.evaluationDueAt : null },
        });
        return { ...ev, evaluatedLate: b.evaluationDueAt ? ev.evaluatedAt > b.evaluationDueAt : null };
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new ConflictException('This demo has already been evaluated');
      }
      throw e;
    }
  }

  /** Active slabs offered in the evaluation form (existing Pay Slab records, read-only here). */
  listSlabs() {
    return this.prisma.tutorSalarySlab.findMany({
      where: { isActive: true }, orderBy: { hourlyRate: 'asc' }, select: { id: true, name: true, hourlyRate: true, currency: true },
    });
  }
}
