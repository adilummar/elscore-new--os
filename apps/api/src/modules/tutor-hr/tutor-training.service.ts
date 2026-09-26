import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../../common/audit/audit.service';
import { CreateTutorLeadTrainingDto, UpdateTutorLeadTrainingDto } from './dto/tutor-training.dto';

@Injectable()
export class TutorTrainingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async create(tutorLeadId: string, dto: CreateTutorLeadTrainingDto, actorUserId: string) {
    const lead = await this.prisma.tutorLead.findUnique({ where: { id: tutorLeadId } });
    if (!lead) throw new NotFoundException('Tutor lead not found');

    const session = await this.prisma.tutorLeadTrainingSession.create({
      data: {
        tutorLeadId,
        sessionDate: new Date(dto.sessionDate),
        startTime: dto.startTime ? new Date(`1970-01-01T${dto.startTime}Z`) : null,
        endTime: dto.endTime ? new Date(`1970-01-01T${dto.endTime}Z`) : null,
        attendanceStatus: dto.attendanceStatus,
        taskStatus: dto.taskStatus,
        remarks: dto.remarks,
        createdById: actorUserId,
        updatedById: actorUserId,
      },
    });

    await this.audit.record({
      entityType: 'TutorLead',
      entityId: tutorLeadId,
      action: 'TUTOR_LEAD_TRAINING_CREATED',
      actorUserId,
      metadata: { sessionId: session.id },
    });

    return session;
  }

  async update(id: string, dto: UpdateTutorLeadTrainingDto, actorUserId: string) {
    const session = await this.prisma.tutorLeadTrainingSession.findUnique({ where: { id } });
    if (!session) throw new NotFoundException('Training session not found');

    const updated = await this.prisma.tutorLeadTrainingSession.update({
      where: { id },
      data: {
        sessionDate: new Date(dto.sessionDate),
        startTime: dto.startTime ? new Date(`1970-01-01T${dto.startTime}Z`) : null,
        endTime: dto.endTime ? new Date(`1970-01-01T${dto.endTime}Z`) : null,
        attendanceStatus: dto.attendanceStatus,
        taskStatus: dto.taskStatus,
        remarks: dto.remarks,
        updatedById: actorUserId,
      },
    });

    await this.audit.record({
      entityType: 'TutorLead',
      entityId: session.tutorLeadId,
      action: 'TUTOR_LEAD_TRAINING_UPDATED',
      actorUserId,
      metadata: { sessionId: session.id },
    });

    return updated;
  }
}
