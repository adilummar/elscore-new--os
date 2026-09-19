import { InjectQueue } from '@nestjs/bullmq';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FollowUpStatus } from '@prisma/client';
import { Queue } from 'bullmq';
import { endOfDay, startOfDay } from 'date-fns';
import { fromZonedTime, toZonedTime } from 'date-fns-tz';

import { AuditService } from '../../common/audit/audit.service';
import { IdGeneratorService } from '../../common/id-generator/id-generator.service';
import { decodeCursor, encodeCursor } from '../../common/pagination/paginate.util';
import { PrismaService, PrismaTxClient } from '../../common/prisma/prisma.service';
import { JOBS, QUEUES } from '../../common/queue/queue.constants';

import { CompleteFollowUpDto } from './dto/complete-follow-up.dto';
import { CreateFollowUpDto } from './dto/create-follow-up.dto';
import { FollowUpQueryDto } from './dto/follow-up-query.dto';
import { RescheduleFollowUpDto } from './dto/reschedule-follow-up.dto';
import { UpdateFollowUpDto } from './dto/update-follow-up.dto';

@Injectable()
export class FollowUpService {
  private readonly logger = new Logger(FollowUpService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly idGen: IdGeneratorService,
    private readonly config: ConfigService,
    @InjectQueue(QUEUES.DEADLINE_MONITOR) private readonly deadlineQueue: Queue,
  ) {}

  private getTimezone(): string {
    return this.config.get<string>('crm.businessTimezone') ?? 'Asia/Kolkata';
  }

  private getTodayBounds(): { start: Date; end: Date } {
    const tz = this.getTimezone();
    const nowInTz = toZonedTime(new Date(), tz);
    return {
      start: fromZonedTime(startOfDay(nowInTz), tz),
      end: fromZonedTime(endOfDay(nowInTz), tz),
    };
  }

  private async checkLeadAccess(leadId: string, userId: string, hasReadAll: boolean) {
    const lead = await this.prisma.lead.findUnique({
      where: { id: leadId },
      select: { id: true, isArchived: true, assignedToUserId: true },
    });
    if (!lead) throw new NotFoundException('Lead not found');
    if (!hasReadAll && lead.assignedToUserId !== userId) {
      throw new ForbiddenException('You do not have access to this lead');
    }
    return lead;
  }

  private async checkFollowUpAccess(
    fupId: string,
    leadId: string,
    userId: string,
    hasReadAll: boolean,
    opts: { requiresMutation?: boolean } = {},
  ) {
    await this.checkLeadAccess(leadId, userId, hasReadAll);
    const fup = await this.prisma.followUp.findFirst({
      where: { id: fupId, leadId },
      include: { rescheduleHistory: { orderBy: { rescheduledAt: 'asc' } } },
    });
    if (!fup) throw new NotFoundException('Follow-up not found');
    if (opts.requiresMutation) {
      if (fup.status === FollowUpStatus.COMPLETED) {
        throw new ForbiddenException('Follow-up is already completed and cannot be modified');
      }
      const lead = await this.prisma.lead.findUnique({
        where: { id: leadId },
        select: { assignedToUserId: true },
      });
      if (!hasReadAll && lead?.assignedToUserId !== userId) {
        throw new ForbiddenException('You are not the current owner of this lead');
      }
    }
    return fup;
  }

  private async scheduleBullMqJobs(fup: { id: string; scheduledAt: Date }) {
    const reminderJobId = 'followup-reminder-' + fup.id;
    const overdueJobId = 'followup-overdue-' + fup.id;
    const now = Date.now();
    const scheduledMs = fup.scheduledAt.getTime();
    const reminderDelay = scheduledMs - now - 10 * 60_000;
    const overdueDelay = Math.max(0, scheduledMs - now + 60_000);

    if (reminderDelay > 0) {
      try {
        await this.deadlineQueue.add(
          JOBS.FOLLOWUP_REMINDER,
          { idempotencyKey: reminderJobId, followUpId: fup.id },
          { delay: reminderDelay, jobId: reminderJobId },
        );
      } catch (err) {
        this.logger.warn('Failed to schedule reminder for FUP ' + fup.id + ': ' + String(err));
      }
    } else {
      this.logger.log('FUP ' + fup.id + ' scheduled soon — skipping reminder job');
    }
    try {
      await this.deadlineQueue.add(
        JOBS.FOLLOWUP_OVERDUE,
        { idempotencyKey: overdueJobId, followUpId: fup.id },
        { delay: overdueDelay, jobId: overdueJobId },
      );
    } catch (err) {
      this.logger.warn('Failed to schedule overdue job for FUP ' + fup.id + ': ' + String(err));
    }
    try {
      await this.prisma.followUp.update({
        where: { id: fup.id },
        data: { reminderJobId: reminderDelay > 0 ? reminderJobId : null, overdueJobId },
      });
    } catch (err) {
      this.logger.warn('Failed to persist job IDs for FUP ' + fup.id + ': ' + String(err));
    }
  }

  private async cancelBullMqJobs(fup: { reminderJobId: string | null; overdueJobId: string | null }) {
    if (fup.reminderJobId) {
      try { const j = await this.deadlineQueue.getJob(fup.reminderJobId); await j?.remove(); } catch { /* ignore */ }
    }
    if (fup.overdueJobId) {
      try { const j = await this.deadlineQueue.getJob(fup.overdueJobId); await j?.remove(); } catch { /* ignore */ }
    }
  }

  async create(leadId: string, dto: CreateFollowUpDto, actorUserId: string, hasReadAll: boolean) {
    const lead = await this.checkLeadAccess(leadId, actorUserId, hasReadAll);
    if (lead.isArchived) throw new BadRequestException('Cannot create a follow-up for an archived lead');

    const existingActive = await this.prisma.followUp.findFirst({
      where: { leadId, status: { in: [FollowUpStatus.SCHEDULED, FollowUpStatus.OVERDUE] } },
      select: { id: true, businessId: true, status: true },
    });
    if (existingActive) {
      if (existingActive.status === FollowUpStatus.OVERDUE) {
        throw new ConflictException('An overdue follow-up (' + existingActive.businessId + ') exists. Complete or reschedule it first.');
      }
      throw new ConflictException('An active follow-up (' + existingActive.businessId + ') already exists for this lead.');
    }

    const scheduledAt = new Date(dto.scheduledAt);
    const newFup = await this.prisma.$transaction(async (tx: PrismaTxClient) => {
      const businessId = await this.idGen.nextIdInTx(tx, 'FUP');
      const fup = await tx.followUp.create({
        data: { businessId, leadId, createdByUserId: actorUserId, scheduledAt, classification: dto.classification, remarks: dto.remarks, status: FollowUpStatus.SCHEDULED },
      });
      await tx.lead.update({ where: { id: leadId }, data: { requiresFollowUp: true } });
      await this.audit.recordInTx(tx, { entityType: 'FollowUp', entityId: fup.id, action: 'FOLLOW_UP_CREATED', actorUserId, newValue: { businessId, scheduledAt: scheduledAt.toISOString(), leadId } });
      return fup;
    });

    void this.scheduleBullMqJobs(newFup);
    return newFup;
  }

  async complete(leadId: string, fupId: string, dto: CompleteFollowUpDto, actorUserId: string, hasReadAll: boolean) {
      const fup = await this.checkFollowUpAccess(fupId, leadId, actorUserId, hasReadAll, { requiresMutation: true });
    let nextFupForJobs: { id: string; scheduledAt: Date } | null = null;
    const completedFup = await this.prisma.$transaction(async (tx: PrismaTxClient) => {
      const updated = await tx.followUp.update({
        where: { id: fupId },
        data: { status: FollowUpStatus.COMPLETED, completedAt: new Date(), completedByUserId: actorUserId, classification: dto.classification ?? fup.classification, remarks: dto.remarks ?? fup.remarks },
      });
      const hasNextInDto = !!dto.nextFollowUpAt;
      const otherActive = await tx.followUp.findFirst({
        where: { leadId, id: { not: fupId }, status: { in: [FollowUpStatus.SCHEDULED, FollowUpStatus.OVERDUE] } },
        select: { id: true },
      });
      if (!otherActive && !hasNextInDto) {
        await tx.lead.update({ where: { id: leadId }, data: { requiresFollowUp: false, currentClassification: dto.classification ?? fup.classification } });
      } else {
        await tx.lead.update({ where: { id: leadId }, data: { currentClassification: dto.classification ?? fup.classification } });
      }
      await this.audit.recordInTx(tx, { entityType: 'FollowUp', entityId: fupId, action: 'FOLLOW_UP_COMPLETED', actorUserId, newValue: { status: 'COMPLETED', classification: dto.classification ?? fup.classification } });

      if (dto.nextFollowUpAt) {
        const nextScheduledAt = new Date(dto.nextFollowUpAt);
        const nextBusinessId = await this.idGen.nextIdInTx(tx, 'FUP');
        const createdNext = await tx.followUp.create({
          data: { businessId: nextBusinessId, leadId, createdByUserId: actorUserId, scheduledAt: nextScheduledAt, remarks: dto.nextFollowUpRemarks, status: FollowUpStatus.SCHEDULED },
        });
        await tx.lead.update({ where: { id: leadId }, data: { requiresFollowUp: true } });
        await this.audit.recordInTx(tx, { entityType: 'FollowUp', entityId: createdNext.id, action: 'FOLLOW_UP_CREATED', actorUserId, newValue: { businessId: nextBusinessId } });
        nextFupForJobs = { id: createdNext.id, scheduledAt: createdNext.scheduledAt };
      }
      return updated;
    });

    void this.cancelBullMqJobs(fup);
    if (nextFupForJobs) void this.scheduleBullMqJobs(nextFupForJobs);
    return { followUp: completedFup, nextFollowUp: nextFupForJobs };
  }

  async reschedule(leadId: string, fupId: string, dto: RescheduleFollowUpDto, actorUserId: string, hasReadAll: boolean) {
    const fup = await this.checkFollowUpAccess(fupId, leadId, actorUserId, hasReadAll, { requiresMutation: true });
    const newScheduledAt = new Date(dto.newScheduledAt);
    const rescheduled = await this.prisma.$transaction(async (tx: PrismaTxClient) => {
      await tx.followUpRescheduleHistory.create({ data: { followUpId: fupId, previousScheduledAt: fup.scheduledAt, newScheduledAt, reason: dto.reason, rescheduledByUserId: actorUserId } });
      const updated = await tx.followUp.update({
        where: { id: fupId },
        data: { scheduledAt: newScheduledAt, status: FollowUpStatus.SCHEDULED, reminderJobId: null, overdueJobId: null },
        include: { rescheduleHistory: { orderBy: { rescheduledAt: 'asc' } } },
      });
      await this.audit.recordInTx(tx, { entityType: 'FollowUp', entityId: fupId, action: 'FOLLOW_UP_RESCHEDULED', actorUserId, newValue: { previousScheduledAt: fup.scheduledAt.toISOString(), newScheduledAt: newScheduledAt.toISOString() } });
      return updated;
    });
    void this.cancelBullMqJobs(fup);
    void this.scheduleBullMqJobs(rescheduled);
    return rescheduled;
  }

  async update(leadId: string, fupId: string, dto: UpdateFollowUpDto, actorUserId: string, hasReadAll: boolean) {
    await this.checkFollowUpAccess(fupId, leadId, actorUserId, hasReadAll, { requiresMutation: true });
    return this.prisma.$transaction(async (tx: PrismaTxClient) => {
      const updated = await tx.followUp.update({
        where: { id: fupId },
        data: {
          ...(dto.classification !== undefined && { classification: dto.classification }),
          ...(dto.remarks !== undefined && { remarks: dto.remarks }),
        },
      });
      await this.audit.recordInTx(tx, { entityType: 'FollowUp', entityId: fupId, action: 'FOLLOW_UP_UPDATED', actorUserId, newValue: { classification: dto.classification, remarks: dto.remarks } });
      return updated;
    });
  }

  async findOne(leadId: string, fupId: string, userId: string, hasReadAll: boolean) {
    return this.checkFollowUpAccess(fupId, leadId, userId, hasReadAll);
  }

  async findByLead(leadId: string, userId: string, hasReadAll: boolean, query: FollowUpQueryDto) {
    await this.checkLeadAccess(leadId, userId, hasReadAll);
    const limit = query.limit ?? 20;
    const take = limit + 1;
    const cursorId = query.cursor ? decodeCursor(query.cursor) : undefined;
    const items = await this.prisma.followUp.findMany({
      where: { leadId, ...(query.status ? { status: query.status } : {}) },
      orderBy: { scheduledAt: 'asc' },
      take,
      ...(cursorId ? { cursor: { id: cursorId }, skip: 1 } : {}),
      include: { rescheduleHistory: { orderBy: { rescheduledAt: 'asc' } } },
    });
    const hasNextPage = items.length > limit;
    const data = hasNextPage ? items.slice(0, limit) : items;
    const nextCursor = hasNextPage && data.length > 0 ? encodeCursor(data[data.length - 1].id) : null;
    return { data, pagination: { nextCursor, hasNextPage, limit } };
  }

  async findAll(userId: string, hasReadAll: boolean, query: FollowUpQueryDto) {
    if (query.ownerUserId && query.ownerUserId !== userId && !hasReadAll) {
      throw new ForbiddenException('Only Sales Head can filter by ownerUserId');
    }
    const limit = query.limit ?? 20;
    const take = limit + 1;
    const cursorId = query.cursor ? decodeCursor(query.cursor) : undefined;
    const { start: todayStart, end: todayEnd } = this.getTodayBounds();
    const ownerFilter = hasReadAll
      ? (query.ownerUserId ? { lead: { assignedToUserId: query.ownerUserId } } : {})
      : { lead: { assignedToUserId: userId } };
    let viewFilter: object = {};
    switch (query.view) {
      case 'today':
        viewFilter = { scheduledAt: { gte: todayStart, lte: todayEnd }, status: { in: [FollowUpStatus.SCHEDULED, FollowUpStatus.OVERDUE] } };
        break;
      case 'upcoming':
        viewFilter = { scheduledAt: { gt: new Date() }, status: FollowUpStatus.SCHEDULED };
        break;
      case 'overdue':
        viewFilter = { status: FollowUpStatus.OVERDUE };
        break;
      default:
        if (query.status) viewFilter = { status: query.status };
    }
    const items = await this.prisma.followUp.findMany({
      where: { ...ownerFilter, ...viewFilter, ...(query.leadId ? { leadId: query.leadId } : {}) },
      orderBy: { scheduledAt: 'asc' },
      take,
      ...(cursorId ? { cursor: { id: cursorId }, skip: 1 } : {}),
      include: {
        lead: { select: { businessId: true, firstName: true, lastName: true, primaryPhone: true, whatsappNumber: true, assignedToUserId: true, status: true } },
        createdByUser: { select: { id: true, email: true } },
      },
    });
    const hasNextPage = items.length > limit;
    const data = hasNextPage ? items.slice(0, limit) : items;
    const nextCursor = hasNextPage && data.length > 0 ? encodeCursor(data[data.length - 1].id) : null;
    return { data, pagination: { nextCursor, hasNextPage, limit } };
  }

  async getSummary(userId: string, hasReadAll: boolean) {
    const { start: todayStart, end: todayEnd } = this.getTodayBounds();
    const ownerFilter = hasReadAll ? {} : { lead: { assignedToUserId: userId } };

    const [today, upcoming, overdue, completedToday] = await Promise.all([
      this.prisma.followUp.count({
        where: { ...ownerFilter, scheduledAt: { gte: todayStart, lte: todayEnd }, status: { in: [FollowUpStatus.SCHEDULED, FollowUpStatus.OVERDUE] } },
      }),
      this.prisma.followUp.count({
        where: { ...ownerFilter, scheduledAt: { gt: new Date() }, status: FollowUpStatus.SCHEDULED },
      }),
      this.prisma.followUp.count({
        where: { ...ownerFilter, status: FollowUpStatus.OVERDUE },
      }),
      this.prisma.followUp.count({
        where: { ...ownerFilter, status: FollowUpStatus.COMPLETED, completedAt: { gte: todayStart, lte: todayEnd } },
      }),
    ]);

    return { today, upcoming, overdue, completedToday };
  }
}
