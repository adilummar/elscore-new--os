import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { TutorLeadStageCode } from '@prisma/client';
import { AuditService } from '../../common/audit/audit.service';
import { PrismaService, PrismaTxClient } from '../../common/prisma/prisma.service';
import { UserService } from '../user/user.service';
import { ApproveTutorLeadDto } from './dto/tutor-hr-review.dto';

@Injectable()
export class TutorHrReviewService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly userService: UserService,
  ) {}

  async findPending() {
    return this.prisma.tutorLead.findMany({
      where: { currentStage: TutorLeadStageCode.READY_FOR_ASSIGNMENT },
      orderBy: { updatedAt: 'desc' },
      include: {
        motherTongue: true,
        salarySlab: true,
      }
    });
  }

  async approve(leadId: string, dto: ApproveTutorLeadDto, actorUserId: string) {
    const lead = await this.prisma.tutorLead.findUnique({
      where: { id: leadId },
      include: {
        subjects: true,
        grades: true,
        availability: true,
      },
    });

    if (!lead) throw new NotFoundException('Tutor lead not found');
    if (lead.currentStage !== TutorLeadStageCode.READY_FOR_ASSIGNMENT) {
      throw new BadRequestException('Lead is not READY_FOR_ASSIGNMENT');
    }
    
    // Check if they already have a tutor profile
    const existingProfile = await this.prisma.tutorProfile.findFirst({ where: { sourceTutorLeadId: leadId } });
    if (existingProfile) {
      throw new BadRequestException('Lead is already converted to a Tutor');
    }

    let employeeId = dto.existingEmployeeId;

    if (!employeeId) {
      if (!dto.password || !dto.departmentId || !dto.roleId) {
        throw new BadRequestException('Password, departmentId, and roleId are required to create a new user');
      }
      
      const generatedEmail = lead.email || `tutor.${lead.businessId.toLowerCase()}@elscoreacademy.com`;
      
      // Call user service to create User, Employee, and the blank TutorProfile
      const user = await this.userService.create({
        email: generatedEmail,
        firstName: lead.firstName,
        lastName: lead.lastName,
        
        departmentId: dto.departmentId,
        roleId: dto.roleId,
        password: dto.password,
      }, actorUserId);

      // Now fetch the created employee
      const employee = await this.prisma.employee.findUniqueOrThrow({ where: { userId: user.id } });
      employeeId = employee.id;
    }

    // Now update the created TutorProfile with data from TutorLead
    return this.prisma.$transaction(async (tx: PrismaTxClient) => {
      // Find the profile (UserService.create made one if role was TUTOR, or we need to make one if not)
      let profile = await tx.tutorProfile.findUnique({ where: { employeeId } });
      
      if (!profile) {
        profile = await tx.tutorProfile.create({
          data: {
            employeeId,
            sourceTutorLeadId: lead.id,
            teachingExperience: lead.totalTeachingExperience,
          }
        });
      } else {
        profile = await tx.tutorProfile.update({
          where: { employeeId },
          data: {
            sourceTutorLeadId: lead.id,
            teachingExperience: lead.totalTeachingExperience,
          }
        });
      }

      // Copy Subjects
      if (lead.subjects.length > 0) {
        await tx.tutorSubject.createMany({
          data: lead.subjects.map((s: any) => ({
            tutorProfileId: profile.id,
            subjectId: s.subjectId,
            addedByUserId: actorUserId,
            isActive: true,
          }))
        });
      }

      // Copy Grades
      if (lead.grades.length > 0) {
        await tx.tutorGrade.createMany({
          data: lead.grades.map((g: any) => ({
            tutorProfileId: profile.id,
            gradeId: g.gradeId,
            addedByUserId: actorUserId,
            isActive: true,
          }))
        });
      }

      // Copy Availability
      if (lead.availability.length > 0) {
        await tx.tutorAvailabilitySlot.createMany({
          data: lead.availability.map((a: any) => ({
            tutorProfileId: profile.id,
            dayOfWeek: a.dayOfWeek,
            startTime: a.startTime,
            endTime: a.endTime,
            isActive: true,
            createdByUserId: actorUserId,
          }))
        });
      }

      await this.audit.recordInTx(tx, {
        entityType: 'TutorLead',
        entityId: leadId,
        action: 'TUTOR_LEAD_APPROVED',
        actorUserId,
        metadata: { tutorProfileId: profile.id, employeeId }
      });

      return profile;
    });
  }
}
