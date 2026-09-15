import { Injectable, NotFoundException } from '@nestjs/common';
import { TutorProfile } from '@prisma/client';

import { AuditService } from '../../common/audit/audit.service';
import { PrismaService, PrismaTxClient } from '../../common/prisma/prisma.service';

import { UpdateTeachingExperienceDto, UpdateTutorProfileDto } from './dto/tutor-profile.dto';

@Injectable()
export class TutorProfileService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async findByEmployeeId(employeeId: string): Promise<TutorProfile> {
    const profile = await this.prisma.tutorProfile.findUnique({
      where: { employeeId },
      include: {
        subjects: { include: { subject: true } },
        grades: { include: { grade: true } },
        curricula: { include: { curriculum: true } },
      },
    });
    if (!profile) throw new NotFoundException('Tutor profile not found');
    return profile;
  }

  async findByProfileId(id: string): Promise<TutorProfile> {
    const profile = await this.prisma.tutorProfile.findUnique({
      where: { id },
      include: {
        subjects: { include: { subject: true } },
        grades: { include: { grade: true } },
        curricula: { include: { curriculum: true } },
      },
    });
    if (!profile) throw new NotFoundException('Tutor profile not found');
    return profile;
  }

  async findByUserId(userId: string): Promise<TutorProfile> {
    const employee = await this.prisma.employee.findUnique({ where: { userId } });
    if (!employee) throw new NotFoundException('Employee not found');
    return this.findByEmployeeId(employee.id);
  }

  async updateProfile(id: string, dto: UpdateTutorProfileDto, actorUserId: string): Promise<TutorProfile> {
    const profile = await this.prisma.tutorProfile.findUnique({ where: { id } });
    if (!profile) throw new NotFoundException('Profile not found');

    const updated = await this.prisma.tutorProfile.update({
      where: { id },
      data: {
        bio: dto.bio,
        profilePhotoUrl: dto.profilePhotoUrl,
      },
    });

    await this.audit.record({
      entityType: 'TutorProfile',
      entityId: id,
      action: 'TUTOR_PROFILE_UPDATED',
      actorUserId,
      metadata: { ...dto },
    });

    return updated;
  }

  async updateExperience(id: string, dto: UpdateTeachingExperienceDto, actorUserId: string): Promise<TutorProfile> {
    const updated = await this.prisma.tutorProfile.update({
      where: { id },
      data: { teachingExperience: dto.yearsOfExperience },
    });

    await this.audit.record({
      entityType: 'TutorProfile',
      entityId: id,
      action: 'TUTOR_EXPERIENCE_UPDATED',
      actorUserId,
      metadata: { years: dto.yearsOfExperience },
    });

    return updated;
  }

  // Capability junctions
  async addSubject(id: string, subjectId: string, actorUserId: string) {
    const subject = await this.prisma.subject.findUnique({ where: { id: subjectId } });
    if (!subject) throw new NotFoundException('Subject not found');

    const existing = await this.prisma.tutorSubject.findFirst({
      where: { tutorProfileId: id, subjectId },
    });
    if (existing) return;

    await this.prisma.$transaction(async (tx: PrismaTxClient) => {
      await tx.tutorSubject.create({
        data: { tutorProfileId: id, subjectId, addedByUserId: actorUserId },
      });
      await this.audit.recordInTx(tx, {
        entityType: 'TutorProfile',
        entityId: id,
        action: 'TUTOR_SUBJECT_ADDED',
        actorUserId,
        metadata: { subjectId, subjectCode: subject.code },
      });
    });
  }

  async removeSubject(id: string, subjectId: string, actorUserId: string) {
    const existing = await this.prisma.tutorSubject.findFirst({
      where: { tutorProfileId: id, subjectId },
      include: { subject: true },
    });
    if (!existing) return;

    await this.prisma.$transaction(async (tx: PrismaTxClient) => {
      await tx.tutorSubject.delete({ where: { id: existing.id } });
      await this.audit.recordInTx(tx, {
        entityType: 'TutorProfile',
        entityId: id,
        action: 'TUTOR_SUBJECT_REMOVED',
        actorUserId,
        metadata: { subjectId, subjectCode: existing.subject.code },
      });
    });
  }

  async addGrade(id: string, gradeId: string, actorUserId: string) {
    const grade = await this.prisma.grade.findUnique({ where: { id: gradeId } });
    if (!grade) throw new NotFoundException('Grade not found');

    const existing = await this.prisma.tutorGrade.findFirst({
      where: { tutorProfileId: id, gradeId },
    });
    if (existing) return;

    await this.prisma.$transaction(async (tx: PrismaTxClient) => {
      await tx.tutorGrade.create({
        data: { tutorProfileId: id, gradeId, addedByUserId: actorUserId },
      });
      await this.audit.recordInTx(tx, {
        entityType: 'TutorProfile',
        entityId: id,
        action: 'TUTOR_GRADE_ADDED',
        actorUserId,
        metadata: { gradeId, gradeCode: grade.code },
      });
    });
  }

  async removeGrade(id: string, gradeId: string, actorUserId: string) {
    const existing = await this.prisma.tutorGrade.findFirst({
      where: { tutorProfileId: id, gradeId },
      include: { grade: true },
    });
    if (!existing) return;

    await this.prisma.$transaction(async (tx: PrismaTxClient) => {
      await tx.tutorGrade.delete({ where: { id: existing.id } });
      await this.audit.recordInTx(tx, {
        entityType: 'TutorProfile',
        entityId: id,
        action: 'TUTOR_GRADE_REMOVED',
        actorUserId,
        metadata: { gradeId, gradeCode: existing.grade.code },
      });
    });
  }

  async addCurriculum(id: string, curriculumId: string, actorUserId: string) {
    const curriculum = await this.prisma.curriculum.findUnique({ where: { id: curriculumId } });
    if (!curriculum) throw new NotFoundException('Curriculum not found');

    const existing = await this.prisma.tutorCurriculum.findFirst({
      where: { tutorProfileId: id, curriculumId },
    });
    if (existing) return;

    await this.prisma.$transaction(async (tx: PrismaTxClient) => {
      await tx.tutorCurriculum.create({
        data: { tutorProfileId: id, curriculumId, addedByUserId: actorUserId },
      });
      await this.audit.recordInTx(tx, {
        entityType: 'TutorProfile',
        entityId: id,
        action: 'TUTOR_CURRICULUM_ADDED',
        actorUserId,
        metadata: { curriculumId, curriculumCode: curriculum.code },
      });
    });
  }

  async removeCurriculum(id: string, curriculumId: string, actorUserId: string) {
    const existing = await this.prisma.tutorCurriculum.findFirst({
      where: { tutorProfileId: id, curriculumId },
      include: { curriculum: true },
    });
    if (!existing) return;

    await this.prisma.$transaction(async (tx: PrismaTxClient) => {
      await tx.tutorCurriculum.delete({ where: { id: existing.id } });
      await this.audit.recordInTx(tx, {
        entityType: 'TutorProfile',
        entityId: id,
        action: 'TUTOR_CURRICULUM_REMOVED',
        actorUserId,
        metadata: { curriculumId, curriculumCode: existing.curriculum.code },
      });
    });
  }
}
