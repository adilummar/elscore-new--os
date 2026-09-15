import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';

import { AuditService } from '../../common/audit/audit.service';
import { IdGeneratorService } from '../../common/id-generator/id-generator.service';
import { PrismaService, PrismaTxClient } from '../../common/prisma/prisma.service';

import { CreateRequirementDto } from './dto/create-requirement.dto';
import { CreateStudentDto } from './dto/create-student.dto';
import { UpdateRequirementDto } from './dto/update-requirement.dto';
import { UpdateStudentDto } from './dto/update-student.dto';

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
}
