import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { TutorLeadStageCode } from '@prisma/client';
import { AuditService } from '../../common/audit/audit.service';
import { PrismaService, PrismaTxClient } from '../../common/prisma/prisma.service';

export class ApproveTutorLeadDto {
  /**
   * The Employee ID to link this approved candidate to.
   * The employee must be created first via the standard onboarding flow,
   * then pass their Employee ID here. This preserves the requirement that
   * candidates do NOT get OS login via the approval flow — onboarding is
   * a deliberate, separate step.
   */
  existingEmployeeId!: string;
}

@Injectable()
export class TutorHrReviewService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async findPending() {
    return this.prisma.tutorLead.findMany({
      where: { currentStage: TutorLeadStageCode.READY_FOR_ASSIGNMENT },
      orderBy: { updatedAt: 'desc' },
      include: {
        motherTongue: true,
        salarySlab: true,
        subjects: { include: { subject: true } },
        grades: { include: { grade: true } },
      },
    });
  }

  /**
   * Approve a Tutor Lead — converts them to a TutorProfile.
   *
   * DESIGN DECISION: Candidates do NOT get OS login accounts during recruitment.
   * This method ONLY creates/updates a TutorProfile and copies recruitment data.
   * Physical onboarding (User + Employee creation) is a separate HR process.
   */
  async approve(leadId: string, dto: ApproveTutorLeadDto, actorUserId: string) {
    if (!dto.existingEmployeeId) {
      throw new (await import('@nestjs/common').then(m => m.BadRequestException))('existingEmployeeId is required. Onboard the candidate as an Employee first, then approve.');
    }

    const lead = await this.prisma.tutorLead.findUnique({
      where: { id: leadId },
      include: { subjects: true, grades: true, availability: true },
    });

    if (!lead) throw new NotFoundException('Tutor lead not found');
    if (lead.currentStage !== TutorLeadStageCode.READY_FOR_ASSIGNMENT) {
      throw new BadRequestException('Lead is not in READY_FOR_ASSIGNMENT stage. Move them there first.');
    }

    // Prevent double conversion
    const existingProfile = await this.prisma.tutorProfile.findFirst({ where: { sourceTutorLeadId: leadId } });
    if (existingProfile) throw new BadRequestException('This lead has already been converted to a Tutor Profile');

    const emp = await this.prisma.employee.findUnique({ where: { id: dto.existingEmployeeId } });
    if (!emp) throw new NotFoundException(`Employee ${dto.existingEmployeeId} not found`);

    return this.prisma.$transaction(async (tx: PrismaTxClient) => {
      let profile: any;

      const existingEmpProfile = await tx.tutorProfile.findUnique({ where: { employeeId: dto.existingEmployeeId } });

      if (existingEmpProfile) {
        profile = await tx.tutorProfile.update({
          where: { employeeId: dto.existingEmployeeId },
          data: { sourceTutorLeadId: lead.id, teachingExperience: lead.totalTeachingExperience },
        });
      } else {
        profile = await tx.tutorProfile.create({
          data: {
            employeeId: dto.existingEmployeeId,
            sourceTutorLeadId: lead.id,
            teachingExperience: lead.totalTeachingExperience,
          },
        });
      }

      // Copy Subjects
      if (lead.subjects.length > 0) {
        await tx.tutorSubject.createMany({
          data: lead.subjects.map((s: any) => ({ tutorProfileId: profile.id, subjectId: s.subjectId, addedByUserId: actorUserId, isActive: true })),
          skipDuplicates: true,
        });
      }

      // Copy Grades
      if (lead.grades.length > 0) {
        await tx.tutorGrade.createMany({
          data: lead.grades.map((g: any) => ({ tutorProfileId: profile.id, gradeId: g.gradeId, addedByUserId: actorUserId, isActive: true })),
          skipDuplicates: true,
        });
      }

      // Copy Availability
      if (lead.availability.length > 0) {
        await tx.tutorAvailabilitySlot.createMany({
          data: lead.availability.map((a: any) => ({
            tutorProfileId: profile.id, dayOfWeek: a.dayOfWeek,
            startTime: a.startTime, endTime: a.endTime,
            isActive: true, createdByUserId: actorUserId,
          })),
          skipDuplicates: true,
        });
      }

      await this.audit.recordInTx(tx, {
        entityType: 'TutorLead', entityId: leadId, action: 'TUTOR_LEAD_APPROVED', actorUserId,
        metadata: { tutorProfileId: profile.id, employeeId: dto.existingEmployeeId },
      });

      return { tutorProfileId: profile.id, leadId, approved: true };
    });
  }
}

