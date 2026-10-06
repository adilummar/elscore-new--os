import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../../common/audit/audit.service';
import { CreateMasterDataDto, CreateTutorSalarySlabDto, UpdateMasterDataDto, UpdateTutorSalarySlabDto } from './dto/tutor-hr-settings.dto';

@Injectable()
export class TutorHrSettingsService {
  constructor(private prisma: PrismaService, private audit: AuditService) {}

  // Mother Tongue
  async getMotherTongues() {
    return this.prisma.motherTongue.findMany({ orderBy: { name: 'asc' } });
  }
  async createMotherTongue(dto: CreateMasterDataDto) {
    return this.prisma.motherTongue.create({ data: { name: dto.name, isActive: dto.isActive ?? true } });
  }
  async updateMotherTongue(id: string, dto: UpdateMasterDataDto) {
    return this.prisma.motherTongue.update({ where: { id }, data: { name: dto.name, isActive: dto.isActive } });
  }

  // Communication Language
  async getCommunicationLanguages() {
    return this.prisma.communicationLanguage.findMany({ orderBy: { name: 'asc' } });
  }
  async createCommunicationLanguage(dto: CreateMasterDataDto) {
    return this.prisma.communicationLanguage.create({ data: { name: dto.name, isActive: dto.isActive ?? true } });
  }
  async updateCommunicationLanguage(id: string, dto: UpdateMasterDataDto) {
    return this.prisma.communicationLanguage.update({ where: { id }, data: { name: dto.name, isActive: dto.isActive } });
  }

  // Salary Slabs
  async getSalarySlabs() {
    return this.prisma.tutorSalarySlab.findMany({ orderBy: { name: 'asc' } });
  }
  async createSalarySlab(dto: CreateTutorSalarySlabDto) {
    return this.prisma.tutorSalarySlab.create({
      data: {
        name: dto.name,
        hourlyRate: dto.hourlyRate,
        currency: dto.currency ?? 'AED',
        isActive: dto.isActive ?? true,
      }
    });
  }
  async updateSalarySlab(id: string, dto: UpdateTutorSalarySlabDto) {
    return this.prisma.tutorSalarySlab.update({
      where: { id },
      data: {
        name: dto.name,
        hourlyRate: dto.hourlyRate,
        currency: dto.currency,
        isActive: dto.isActive,
      }
    });
  }
}
