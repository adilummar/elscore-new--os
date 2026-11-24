import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { AuditService } from '../../../common/audit/audit.service';
import { PrismaService, PrismaTxClient } from '../../../common/prisma/prisma.service';
import { SLAB_WITH_RATES, toPaySlabView } from '../pay-slabs/pay-slab.mapper';

import { HiringCandidateService } from './hiring-candidate.service';
import { SubmitEvaluationDto } from './hiring-demo.dto';

@Injectable()
export class HiringEvaluationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly candidates: HiringCandidateService,
  ) {}

  /**
   * Evaluation is linked to the attended booking and filed by its Assigned To (the conductor).
   * The Head of Tutor Management may file it on override; it is then attributed to the Head
   * and the audit row is marked as an override.
   */
  async submit(bookingId: string, dto: SubmitEvaluationDto, actorUserId: string) {
    const b = await this.prisma.tutorDemoBooking.findUnique({ where: { id: bookingId }, include: { evaluation: true } });
    if (!b) throw new NotFoundException('Booking not found');
    if (b.status !== 'ATTENDED' || !b.completedAt) {
      throw new BadRequestException('Only an attended demo can be evaluated');
    }
    const override = b.assignedToUserId !== actorUserId;
    if (override && !(await this.candidates.canOverrideConductor(actorUserId))) {
      throw new ForbiddenException('Only the staff member assigned to conduct the demo can submit the evaluation');
    }
    if (b.evaluation) throw new ConflictException('This demo has already been evaluated');
    if (dto.salarySlabId) {
      const slab = await this.prisma.tutorSalarySlab.findFirst({ where: { id: dto.salarySlabId } });
      if (!slab) throw new BadRequestException('Salary slab not found');
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
          metadata: { late: b.evaluationDueAt ? ev.evaluatedAt > b.evaluationDueAt : null, override },
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

  /**
   * Every slab, with its per-grade rates, for the evaluation form (Pay Slab records, read-only here).
   * Slabs cannot be edited or deleted, so there is no active flag to filter on.
   */
  async listSlabs() {
    const rows = await this.prisma.tutorSalarySlab.findMany({ orderBy: { name: 'asc' }, select: SLAB_WITH_RATES });
    return rows.map(toPaySlabView);
  }
}
