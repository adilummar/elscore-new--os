import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { Prisma, TutorClassRecordStatus, SessionCancellationReason } from '@prisma/client';

import { AuditService } from '../../common/audit/audit.service';
import { IdGeneratorService } from '../../common/id-generator/id-generator.service';
import { PrismaService } from '../../common/prisma/prisma.service';

import { SubmitTutorClassRecordDto, CorrectAttendanceDto } from './dto/attendance.dto';


@Injectable()
export class AttendanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly idGenerator: IdGeneratorService,
    private readonly audit: AuditService,
  ) {}

  async submitClassRecord(userId: string, dto: SubmitTutorClassRecordDto) {
    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      // 1. Verify tutor exists
      const tutor = await tx.user.findUnique({ where: { id: dto.tutorId }, include: { userRoles: { include: { role: true } } } });
      if (!tutor) throw new NotFoundException('Tutor not found');
      
      // We look up the tutor profile for rate mapping, if present. 
      // If we don't have it, we just proceed.
      const tutorProfile = await tx.tutorProfile.findFirst({
        where: { employee: { userId: tutor.id } },
        include: { rates: { where: { isActive: true } } }
      });

      const activeRate = tutorProfile?.rates?.[0];

      // 2. Check if a record already exists for this tutor & session
      const existing = await tx.tutorClassRecord.findUnique({
        where: { sessionId_tutorId: { sessionId: dto.sessionId, tutorId: dto.tutorId } },
      });
      if (existing) {
        throw new BadRequestException('A class record already exists for this session and tutor.');
      }

      // 3. Generate ID
      const tcrBusinessId = await this.idGenerator.nextIdInTx(tx, 'TCR');

      // 4. Create TutorClassRecord
      const tcr = await tx.tutorClassRecord.create({
        data: {
          businessId: tcrBusinessId,
          sessionId: dto.sessionId,
          tutorId: dto.tutorId,
          status: TutorClassRecordStatus.SUBMITTED,
          cancellation: dto.cancellation || SessionCancellationReason.NOT_CANCELLED,
          scheduledStart: new Date(dto.scheduledStart),
          scheduledEnd: new Date(dto.scheduledEnd),
          actualStart: dto.actualStart ? new Date(dto.actualStart) : null,
          actualEnd: dto.actualEnd ? new Date(dto.actualEnd) : null,
          workedMinutes: dto.workedMinutes || null,
          appliedRate: activeRate?.hourlyRate || null,
          currency: activeRate?.currency || 'AED',
          rateGrade: dto.rateGrade || null,
          rateSubject: dto.rateSubject || null,
          submittedAt: new Date(),
          
          studentAttendances: {
            create: await Promise.all(dto.studentAttendances.map(async (sa) => {
              const saBusinessId = await this.idGenerator.nextIdInTx(tx, 'STA');
              return {
                businessId: saBusinessId,
                sessionId: sa.sessionId,
                studentId: sa.studentId,
                status: sa.status,
                actualStart: sa.actualStart ? new Date(sa.actualStart) : null,
                actualEnd: sa.actualEnd ? new Date(sa.actualEnd) : null,
                markedByUserId: userId,
              };
            }))
          }
        },
        include: { studentAttendances: true }
      });

      // Audit
      await this.audit.recordInTx(tx, {
        actorUserId: userId,
        action: 'CLASS_RECORD_SUBMITTED',
        entityType: 'TutorClassRecord',
        entityId: tcr.id,
        metadata: { businessId: tcr.businessId, session: dto.sessionId, studentCount: dto.studentAttendances.length },
      });

      return tcr;
    });
  }

  async verifyClassRecord(userId: string, id: string) {
    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const record = await tx.tutorClassRecord.findUnique({ where: { id } });
      if (!record) throw new NotFoundException('Class record not found');
      if (record.status === 'VERIFIED') throw new BadRequestException('Record is already verified');

      const verified = await tx.tutorClassRecord.update({
        where: { id },
        data: {
          status: 'VERIFIED',
          verifiedAt: new Date(),
          verifiedByUserId: userId,
          isPayrollReady: true,
        },
      });

      await this.audit.recordInTx(tx, {
        actorUserId: userId,
        action: 'CLASS_RECORD_VERIFIED',
        entityType: 'TutorClassRecord',
        entityId: id,
        metadata: { businessId: record.businessId },
      });

      return verified;
    });
  }

  async correctTutorRecord(userId: string, id: string, dto: CorrectAttendanceDto) {
    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const record = await tx.tutorClassRecord.findUnique({ where: { id } });
      if (!record) throw new NotFoundException('Class record not found');

      const isVerified = record.status === 'VERIFIED';

      const updated = await tx.tutorClassRecord.update({
        where: { id },
        data: {
          actualStart: dto.actualStart ? new Date(dto.actualStart) : record.actualStart,
          actualEnd: dto.actualEnd ? new Date(dto.actualEnd) : record.actualEnd,
          workedMinutes: dto.workedMinutes !== undefined ? dto.workedMinutes : record.workedMinutes,
          isCorrected: true,
          correctionReason: dto.reason,
          status: isVerified ? 'CORRECTION_REQUESTED' : record.status,
          isPayrollReady: isVerified ? false : record.isPayrollReady,
          verifiedAt: isVerified ? null : record.verifiedAt,
          verifiedByUserId: isVerified ? null : record.verifiedByUserId,
        },
      });

      await this.audit.recordInTx(tx, {
        actorUserId: userId,
        action: 'CLASS_RECORD_CORRECTED',
        entityType: 'TutorClassRecord',
        entityId: id,
        oldValue: record,
        newValue: updated,
        metadata: { reason: dto.reason, verificationInvalidated: isVerified },
      });

      return updated;
    });
  }

  async correctStudentAttendance(userId: string, id: string, dto: CorrectAttendanceDto) {
    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const record = await tx.studentAttendance.findUnique({ where: { id } });
      if (!record) throw new NotFoundException('Student attendance not found');

      const updated = await tx.studentAttendance.update({
        where: { id },
        data: {
          status: dto.studentStatus || record.status,
          actualStart: dto.actualStart ? new Date(dto.actualStart) : record.actualStart,
          actualEnd: dto.actualEnd ? new Date(dto.actualEnd) : record.actualEnd,
          isCorrected: true,
          correctionReason: dto.reason,
          correctedByUserId: userId,
          correctedAt: new Date(),
        },
      });

      await this.audit.recordInTx(tx, {
        actorUserId: userId,
        action: 'STUDENT_ATTENDANCE_CORRECTED',
        entityType: 'StudentAttendance',
        entityId: id,
        oldValue: record,
        newValue: updated,
        metadata: { reason: dto.reason },
      });

      return updated;
    });
  }

  async getClassRecord(id: string) {
    const record = await this.prisma.tutorClassRecord.findUnique({
      where: { id },
      include: { studentAttendances: true },
    });
    if (!record) throw new NotFoundException('Record not found');
    return record;
  }
}
