import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { EnrollmentState, Prisma } from '@prisma/client';

import { AuditService } from '../../common/audit/audit.service';
import { IdGeneratorService } from '../../common/id-generator/id-generator.service';
import { PrismaService, PrismaTxClient } from '../../common/prisma/prisma.service';

import { CreateRequirementDto } from './dto/create-requirement.dto';
import { CreateStudentDto } from './dto/create-student.dto';
import { UpdateRequirementDto } from './dto/update-requirement.dto';
import { UpdateStudentDto } from './dto/update-student.dto';
import {
  StudentDeletionBlocker,
  studentDeletionBlockedMessage,
} from './student-deletion-message';

@Injectable()
export class StudentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly idGen: IdGeneratorService,
  ) {}

  private async checkLeadOwnership(leadId: string, userId: string, hasReadAll: boolean) {
    const lead = await this.prisma.lead.findUnique({
      where: { id: leadId },
      select: { assignedToUserId: true },
    });
    if (!lead) throw new NotFoundException('Lead not found');

    if (!hasReadAll && lead.assignedToUserId !== userId) {
      throw new ForbiddenException('You do not have access to this lead');
    }
  }

  async create(dto: CreateStudentDto, userId: string, hasReadAll: boolean) {
    await this.checkLeadOwnership(dto.leadId, userId, hasReadAll);

    return this.prisma.$transaction(async (tx: PrismaTxClient) => {
      const businessId = await this.idGen.nextIdInTx(tx, 'STU');

      const student = await tx.student.create({
        data: {
          ...dto,
          businessId,
        },
      });

      await this.audit.recordInTx(tx, {
        entityType: 'Student',
        entityId: student.id,
        action: 'CREATE',
        actorUserId: userId,
        newValue: student,
      });

      return student;
    });
  }

  async findAll() {
    return this.prisma.student.findMany();
  }

  async findOne(id: string, userId: string, hasReadAll: boolean) {
    const student = await this.prisma.student.findUnique({
      where: { id },
      include: { requirements: { include: { subject: true, grade: true, curriculum: true } } },
    });
    if (!student) throw new NotFoundException('Student not found');

    await this.checkLeadOwnership(student.leadId, userId, hasReadAll);
    return student;
  }

  async update(id: string, dto: UpdateStudentDto, userId: string, hasReadAll: boolean) {
    const student = await this.prisma.student.findUnique({ where: { id } });
    if (!student) throw new NotFoundException('Student not found');
    await this.checkLeadOwnership(student.leadId, userId, hasReadAll);

    return this.prisma.$transaction(async (tx: PrismaTxClient) => {
      const updated = await tx.student.update({
        where: { id },
        data: dto,
      });

      await this.audit.recordInTx(tx, {
        entityType: 'Student',
        entityId: id,
        action: 'UPDATE',
        actorUserId: userId,
        oldValue: student,
        newValue: updated,
      });

      return updated;
    });
  }

  async createRequirement(studentId: string, dto: CreateRequirementDto, userId: string, hasReadAll: boolean) {
    const student = await this.prisma.student.findUnique({ where: { id: studentId } });
    if (!student) throw new NotFoundException('Student not found');
    await this.checkLeadOwnership(student.leadId, userId, hasReadAll);

    return this.prisma.$transaction(async (tx: PrismaTxClient) => {
      const businessId = await this.idGen.nextIdInTx(tx, 'RQT');

      const requirement = await tx.requirement.create({
        data: {
          ...dto,
          studentId,
          businessId,
        },
      });

      await this.audit.recordInTx(tx, {
        entityType: 'Requirement',
        entityId: requirement.id,
        action: 'CREATE',
        actorUserId: userId,
        newValue: requirement,
      });

      return requirement;
    });
  }

  async updateRequirement(id: string, dto: UpdateRequirementDto, userId: string, hasReadAll: boolean) {
    const req = await this.prisma.requirement.findUnique({ where: { id }, include: { student: true } });
    if (!req) throw new NotFoundException('Requirement not found');
    await this.checkLeadOwnership(req.student.leadId, userId, hasReadAll);

    return this.prisma.$transaction(async (tx: PrismaTxClient) => {
      const updated = await tx.requirement.update({
        where: { id },
        data: dto,
      });

      await this.audit.recordInTx(tx, {
        entityType: 'Requirement',
        entityId: id,
        action: 'UPDATE',
        actorUserId: userId,
        oldValue: req,
        newValue: updated,
      });

      return updated;
    });
  }

  async saveBundle(leadId: string, studentId: string | null, dto: any, userId: string, hasReadAll: boolean) {
    await this.checkLeadOwnership(leadId, userId, hasReadAll);

    return this.prisma.$transaction(async (tx: PrismaTxClient) => {
      let student;
      const { subjectIds, ...studentData } = dto;

      if (studentId) {
        const existing = await tx.student.findUnique({ where: { id: studentId } });
        if (!existing) throw new NotFoundException('Student not found');
        if (existing.leadId !== leadId) {
          throw new ForbiddenException('Student does not belong to this lead');
        }
        student = await tx.student.update({ where: { id: studentId }, data: studentData });
      } else {
        const businessId = await this.idGen.nextIdInTx(tx, 'STU');
        student = await tx.student.create({ data: { ...studentData, leadId, businessId } });
      }

      if (Array.isArray(subjectIds)) {
        const curriculumId = studentData.curriculumId;
        const gradeId = studentData.gradeId;
        const existingReqs = await tx.requirement.findMany({ where: { studentId: student.id } });
        const existingSubjectIds = existingReqs.map((r: any) => r.subjectId);

        const subjectsToAdd = subjectIds.filter((id: string) => !existingSubjectIds.includes(id));
        const subjectsToRemove = existingSubjectIds.filter((id: string) => !subjectIds.includes(id));

        if (subjectsToRemove.length > 0) {
          await tx.requirement.deleteMany({
            where: { studentId: student.id, subjectId: { in: subjectsToRemove } }
          });
        }

        const subjectsToUpdate = existingSubjectIds.filter((id: string) => subjectIds.includes(id));
        if (subjectsToUpdate.length > 0) {
          await tx.requirement.updateMany({
            where: { studentId: student.id, subjectId: { in: subjectsToUpdate } },
            data: { curriculumId, gradeId }
          });
        }

        for (const subId of subjectsToAdd) {
          const reqBusinessId = await this.idGen.nextIdInTx(tx, 'RQT');
          await tx.requirement.create({
            data: {
               businessId: reqBusinessId,
               studentId: student.id,
               subjectId: subId,
               curriculumId,
               gradeId
            }
          });
        }
      }

      return student;
    });
  }

  async deleteStudent(id: string, reason: string, userId: string, hasReadAll: boolean): Promise<void> {
    const existing = await this.prisma.student.findUnique({
      where: { id },
      select: { id: true, leadId: true },
    });
    if (!existing) throw new NotFoundException('Student not found');
    await this.checkLeadOwnership(existing.leadId, userId, hasReadAll);

    await this.prisma.$transaction(async (tx: PrismaTxClient) => {
      // FOR UPDATE conflicts with the key-share lock taken by a child insert,
      // so a protected record cannot commit between the checks and the delete.
      const locked = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT "id" FROM "students" WHERE "id" = ${id} FOR UPDATE
      `;
      if (locked.length === 0) throw new NotFoundException('Student not found');

      const student = await tx.student.findUnique({ where: { id } });
      if (!student) throw new NotFoundException('Student not found');

      const lead = await tx.lead.findUnique({
        where: { id: student.leadId },
        select: { assignedToUserId: true },
      });
      if (!lead) throw new NotFoundException('Lead not found');
      if (!hasReadAll && lead.assignedToUserId !== userId) {
        throw new ForbiddenException('You do not have access to this lead');
      }

      const blockers = await this.collectDeletionBlockers(tx, student.id, student.enrollmentState);
      if (blockers.length > 0) {
        throw this.studentInUse(blockers);
      }

      const requirementCount = await tx.requirement.count({ where: { studentId: student.id } });

      try {
        await tx.student.delete({ where: { id: student.id } });
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError
          && (error.code === 'P2003' || error.code === 'P2014')
        ) {
          throw new ConflictException({
            code: 'STUDENT_IN_USE',
            message: studentDeletionBlockedMessage([]),
            blockers: [],
          });
        }
        throw error;
      }

      const displayName = [student.firstName, student.lastName].filter(Boolean).join(' ');
      const summary = {
        businessId: student.businessId,
        leadId: student.leadId,
        displayName,
        enrollmentState: student.enrollmentState,
        requirementCount,
      };

      await this.audit.recordInTx(tx, {
        entityType: 'Student',
        entityId: student.id,
        action: 'DELETE',
        actorUserId: userId,
        reason,
        oldValue: {
          id: student.id,
          ...summary,
        },
        newValue: summary,
        metadata: summary,
      });
    });
  }

  private async collectDeletionBlockers(
    tx: PrismaTxClient,
    studentId: string,
    enrollmentState: EnrollmentState,
  ): Promise<StudentDeletionBlocker[]> {
    const [demos, quotations, invoices, targetCredits, attendance] = await Promise.all([
      tx.demo.count({ where: { studentId } }),
      tx.quotation.count({ where: { studentId } }),
      tx.invoice.count({ where: { studentId } }),
      tx.targetCreditLedger.count({ where: { studentId } }),
      tx.studentAttendance.count({ where: { studentId } }),
    ]);

    const blockers: StudentDeletionBlocker[] = [];
    if (demos > 0) blockers.push('DEMO');
    if (quotations > 0) blockers.push('QUOTATION');
    if (invoices > 0) blockers.push('INVOICE');
    if (targetCredits > 0) blockers.push('TARGET_CREDIT');
    if (attendance > 0) blockers.push('ATTENDANCE');
    if (enrollmentState === EnrollmentState.ENROLLED) blockers.push('ENROLLED');
    if (enrollmentState === EnrollmentState.NOT_ENROLLING) blockers.push('NOT_ENROLLING');
    return blockers;
  }

  private studentInUse(blockers: StudentDeletionBlocker[]): ConflictException {
    return new ConflictException({
      code: 'STUDENT_IN_USE',
      message: studentDeletionBlockedMessage(blockers),
      blockers,
    });
  }
}
