import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Curriculum, Grade, Subject } from '@prisma/client';

import { paginate, PaginateOptions } from '../../common/pagination/paginate.util';
import { PaginatedResponseDto } from '../../common/pagination/pagination.dto';
import { PrismaService } from '../../common/prisma/prisma.service';

import { CreateReferenceDto } from './dto/create-reference.dto';
import { UpdateReferenceStatusDto } from './dto/update-reference-status.dto';



@Injectable()
export class ReferenceService {
  constructor(private readonly prisma: PrismaService) {}

  async findAllSubjects(options: Pick<PaginateOptions, 'limit' | 'cursor'>): Promise<PaginatedResponseDto<Subject>> {
    return paginate(this.prisma.subject, { ...options, orderBy: { id: 'asc' } });
  }

  async findAllGrades(options: Pick<PaginateOptions, 'limit' | 'cursor'>): Promise<PaginatedResponseDto<Grade>> {
    return paginate(this.prisma.grade, { ...options, orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }] });
  }

  async findAllCurricula(options: Pick<PaginateOptions, 'limit' | 'cursor'>): Promise<PaginatedResponseDto<Curriculum>> {
    return paginate(this.prisma.curriculum, { ...options, orderBy: { id: 'asc' } });
  }

  async createSubject(dto: CreateReferenceDto): Promise<Subject> {
    const existing = await this.prisma.subject.findUnique({ where: { code: dto.code } });
    if (existing) throw new ConflictException('Subject with this code already exists');
    return this.prisma.subject.create({ data: { code: dto.code, name: dto.name } });
  }

  async createGrade(dto: CreateReferenceDto): Promise<Grade> {
    const existing = await this.prisma.grade.findUnique({ where: { code: dto.code } });
    if (existing) throw new ConflictException('Grade with this code already exists');
    return this.prisma.grade.create({
      data: { code: dto.code, name: dto.name, sortOrder: dto.sortOrder ?? 0 },
    });
  }

  async createCurriculum(dto: CreateReferenceDto): Promise<Curriculum> {
    const existing = await this.prisma.curriculum.findUnique({ where: { code: dto.code } });
    if (existing) throw new ConflictException('Curriculum with this code already exists');
    return this.prisma.curriculum.create({ data: { code: dto.code, name: dto.name } });
  }

  async updateSubjectStatus(id: string, dto: UpdateReferenceStatusDto): Promise<Subject> {
    const existing = await this.prisma.subject.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Subject not found');
    return this.prisma.subject.update({ where: { id }, data: { isActive: dto.isActive } });
  }

  async updateGradeStatus(id: string, dto: UpdateReferenceStatusDto): Promise<Grade> {
    const existing = await this.prisma.grade.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Grade not found');
    return this.prisma.grade.update({ where: { id }, data: { isActive: dto.isActive } });
  }

  async updateCurriculumStatus(id: string, dto: UpdateReferenceStatusDto): Promise<Curriculum> {
    const existing = await this.prisma.curriculum.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Curriculum not found');
    return this.prisma.curriculum.update({ where: { id }, data: { isActive: dto.isActive } });
  }
}
