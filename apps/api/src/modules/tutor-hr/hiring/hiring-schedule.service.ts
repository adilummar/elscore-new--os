import { BadRequestException, Injectable } from '@nestjs/common';

import { AuditService } from '../../../common/audit/audit.service';
import { PrismaService } from '../../../common/prisma/prisma.service';

import { SetScheduleDto } from './hiring-demo.dto';
import { assertValidSchedule, HiringSchedule } from './working-hours.util';

/** Versioned hiring working-hours configuration. No default is ever invented. */
@Injectable()
export class HiringScheduleService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** Schedule in force at `at`, or null when the business has not configured one. */
  async getEffective(at: Date = new Date()): Promise<HiringSchedule | null> {
    const row = await this.prisma.tutorHiringSchedule.findFirst({
      where: { effectiveFrom: { lte: at } },
      orderBy: { effectiveFrom: 'desc' },
    });
    return row
      ? { startTime: row.startTime, endTime: row.endTime, workingDays: row.workingDays, timezone: row.timezone }
      : null;
  }

  list() {
    return this.prisma.tutorHiringSchedule.findMany({ orderBy: { effectiveFrom: 'desc' }, take: 20 });
  }

  async set(dto: SetScheduleDto, actorUserId: string) {
    const schedule: HiringSchedule = {
      startTime: dto.startTime,
      endTime: dto.endTime,
      workingDays: [...new Set(dto.workingDays)].sort(),
      timezone: dto.timezone,
    };
    try {
      assertValidSchedule(schedule);
      new Intl.DateTimeFormat('en-US', { timeZone: schedule.timezone });
    } catch (e) {
      throw new BadRequestException(e instanceof Error ? e.message : 'Invalid schedule');
    }
    const row = await this.prisma.tutorHiringSchedule.create({
      data: { ...schedule, effectiveFrom: dto.effectiveFrom ? new Date(dto.effectiveFrom) : new Date(), updatedBy: actorUserId },
    });
    await this.audit.record({
      entityType: 'TutorHiringSchedule', entityId: row.id, action: 'TUTOR_HIRING_SCHEDULE_SET', actorUserId, newValue: { ...schedule },
    });
    return row;
  }
}
