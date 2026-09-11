// write-fup-files.js  — run with: node write-fup-files.js
const fs = require('fs');
const path = require('path');

const BASE = path.join(__dirname, 'apps/api/src/modules/follow-up');
const mk = (rel, content) => fs.writeFileSync(path.join(BASE, rel), content, 'utf8');

// ──────────────────────────────────────────────────────────────────────────────
// follow-up.service.ts
// ──────────────────────────────────────────────────────────────────────────────
mk('follow-up.service.ts', `import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { ConfigService } from '@nestjs/config';
import { FollowUpStatus } from '@prisma/client';
import { Queue } from 'bullmq';
import { endOfDay, startOfDay } from 'date-fns';
import { fromZonedTime, toZonedTime } from 'date-fns-tz';

import { AuditService } from '../../common/audit/audit.service';
import { IdGeneratorService } from '../../common/id-generator/id-generator.service';
import { decodeCursor, encodeCursor } from '../../common/pagination/paginate.util';
import { PrismaService } from '../../common/prisma/prisma.service';
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
    const newFup = await this.prisma.$transaction(async (tx) => {
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
    if (dto.newLeadStatus && !dto.leadStatusReason) throw new BadRequestException('leadStatusReason is required when changing Lead status');

    let nextFupForJobs: { id: string; scheduledAt: Date } | null = null;
    const completedFup = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.followUp.update({
        where: { id: fupId },
        data: { status: FollowUpStatus.COMPLETED, completedAt: new Date(), completedByUserId: actorUserId, classification: dto.classification ?? fup.classification, remarks: dto.remarks ?? fup.remarks },
      });
      const hasNextInDto = !!dto.nextFollowUpAt;
      const otherActive = await tx.followUp.findFirst({
        where: { leadId, id: { not: fupId }, status: { in: [FollowUpStatus.SCHEDULED, FollowUpStatus.OVERDUE] } },
        select: { id: true },
      });
      if (!otherActive && !hasNextInDto) await tx.lead.update({ where: { id: leadId }, data: { requiresFollowUp: false } });
      await this.audit.recordInTx(tx, { entityType: 'FollowUp', entityId: fupId, action: 'FOLLOW_UP_COMPLETED', actorUserId, newValue: { status: 'COMPLETED' } });

      if (dto.newLeadStatus) {
        const currentLead = await tx.lead.findUnique({ where: { id: leadId }, select: { status: true } });
        if (currentLead && currentLead.status !== dto.newLeadStatus) {
          await tx.leadStatusHistory.create({ data: { leadId, oldStatus: currentLead.status, newStatus: dto.newLeadStatus, reason: dto.leadStatusReason!, changedByUserId: actorUserId } });
          await tx.lead.update({ where: { id: leadId }, data: { status: dto.newLeadStatus } });
          await this.audit.recordInTx(tx, { entityType: 'Lead', entityId: leadId, action: 'LEAD_STATUS_CHANGED', actorUserId, newValue: { newStatus: dto.newLeadStatus } });
        }
      }

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
    const rescheduled = await this.prisma.$transaction(async (tx) => {
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
    return this.prisma.$transaction(async (tx) => {
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
}
`);

// ──────────────────────────────────────────────────────────────────────────────
// follow-up.controller.ts
// ──────────────────────────────────────────────────────────────────────────────
mk('follow-up.controller.ts', `import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';

import { CurrentUser, RequestUser } from '../../common/auth/decorators/current-user.decorator';
import { RbacGuard } from '../../common/rbac/rbac.guard';
import { RbacService } from '../../common/rbac/rbac.service';
import { RequirePermissions } from '../../common/rbac/require-permissions.decorator';

import { CompleteFollowUpDto } from './dto/complete-follow-up.dto';
import { CreateFollowUpDto } from './dto/create-follow-up.dto';
import { FollowUpQueryDto } from './dto/follow-up-query.dto';
import { RescheduleFollowUpDto } from './dto/reschedule-follow-up.dto';
import { UpdateFollowUpDto } from './dto/update-follow-up.dto';
import { FollowUpService } from './follow-up.service';

/** Lead-scoped Follow-up endpoints: /leads/:leadId/follow-ups/... */
@UseGuards(RbacGuard)
@Controller('leads/:leadId/follow-ups')
export class FollowUpController {
  constructor(
    private readonly followUpService: FollowUpService,
    private readonly rbacService: RbacService,
  ) {}

  private async hasReadAll(userId: string): Promise<boolean> {
    const perms = await this.rbacService.getPermissionsForUser(userId);
    return perms.has('followup.read-all');
  }

  @Post()
  @RequirePermissions('followup.create')
  async create(
    @Param('leadId') leadId: string,
    @Body() dto: CreateFollowUpDto,
    @CurrentUser() user: RequestUser,
  ) {
    const readAll = await this.hasReadAll(user.id);
    return this.followUpService.create(leadId, dto, user.id, readAll);
  }

  @Get()
  @RequirePermissions('followup.read')
  async findAll(
    @Param('leadId') leadId: string,
    @Query() query: FollowUpQueryDto,
    @CurrentUser() user: RequestUser,
  ) {
    const readAll = await this.hasReadAll(user.id);
    return this.followUpService.findByLead(leadId, user.id, readAll, query);
  }

  @Get(':id')
  @RequirePermissions('followup.read')
  async findOne(
    @Param('leadId') leadId: string,
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
  ) {
    const readAll = await this.hasReadAll(user.id);
    return this.followUpService.findOne(leadId, id, user.id, readAll);
  }

  @Patch(':id')
  @RequirePermissions('followup.update')
  async update(
    @Param('leadId') leadId: string,
    @Param('id') id: string,
    @Body() dto: UpdateFollowUpDto,
    @CurrentUser() user: RequestUser,
  ) {
    const readAll = await this.hasReadAll(user.id);
    return this.followUpService.update(leadId, id, dto, user.id, readAll);
  }

  @Post(':id/complete')
  @RequirePermissions('followup.complete')
  async complete(
    @Param('leadId') leadId: string,
    @Param('id') id: string,
    @Body() dto: CompleteFollowUpDto,
    @CurrentUser() user: RequestUser,
  ) {
    const readAll = await this.hasReadAll(user.id);
    return this.followUpService.complete(leadId, id, dto, user.id, readAll);
  }

  @Post(':id/reschedule')
  @RequirePermissions('followup.reschedule')
  async reschedule(
    @Param('leadId') leadId: string,
    @Param('id') id: string,
    @Body() dto: RescheduleFollowUpDto,
    @CurrentUser() user: RequestUser,
  ) {
    const readAll = await this.hasReadAll(user.id);
    return this.followUpService.reschedule(leadId, id, dto, user.id, readAll);
  }
}

/** Aggregate views: GET /follow-ups?view=today|upcoming|overdue */
@UseGuards(RbacGuard)
@Controller('follow-ups')
export class FollowUpAggregateController {
  constructor(
    private readonly followUpService: FollowUpService,
    private readonly rbacService: RbacService,
  ) {}

  private async hasReadAll(userId: string): Promise<boolean> {
    const perms = await this.rbacService.getPermissionsForUser(userId);
    return perms.has('followup.read-all');
  }

  @Get()
  @RequirePermissions('followup.read')
  async findAll(@Query() query: FollowUpQueryDto, @CurrentUser() user: RequestUser) {
    const readAll = await this.hasReadAll(user.id);
    return this.followUpService.findAll(user.id, readAll, query);
  }
}
`);

// ──────────────────────────────────────────────────────────────────────────────
// processors/follow-up-reminder.processor.ts
// ──────────────────────────────────────────────────────────────────────────────
mk('processors/follow-up-reminder.processor.ts', `import { Processor } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import { FollowUpStatus } from '@prisma/client';
import { Job } from 'bullmq';

import { PrismaService } from '../../../common/prisma/prisma.service';
import { BaseJobProcessor } from '../../../common/queue/base-job-processor';
import { JOBS, QUEUES } from '../../../common/queue/queue.constants';

export interface FollowUpReminderJobData {
  idempotencyKey: string;
  followUpId: string;
}

/**
 * Sends a 10-minute reminder notification for a scheduled follow-up.
 * Notifies CURRENT lead owner (assignedToUserId), not historical creator.
 * Idempotent: skips if follow-up is already COMPLETED.
 */
@Injectable()
@Processor(QUEUES.DEADLINE_MONITOR)
export class FollowUpReminderProcessor extends BaseJobProcessor {
  constructor(private readonly prisma: PrismaService) {
    super(FollowUpReminderProcessor.name);
  }

  protected async processJob(job: Job<FollowUpReminderJobData>): Promise<void> {
    if (job.name !== JOBS.FOLLOWUP_REMINDER) return;

    const { followUpId, idempotencyKey } = job.data;
    this.logger.log('Reminder job [' + idempotencyKey + '] for FUP ' + followUpId);

    const fup = await this.prisma.followUp.findUnique({
      where: { id: followUpId },
      select: { id: true, businessId: true, status: true, leadId: true },
    });
    if (!fup) { this.logger.warn('FUP ' + followUpId + ' not found — skip'); return; }
    if (fup.status === FollowUpStatus.COMPLETED) { this.logger.log('FUP ' + followUpId + ' already COMPLETED — skip'); return; }

    const lead = await this.prisma.lead.findUnique({
      where: { id: fup.leadId },
      select: { assignedToUserId: true },
    });
    if (!lead?.assignedToUserId) { this.logger.warn('FUP ' + followUpId + ': lead has no assignee — skip'); return; }

    await this.prisma.notification.create({
      data: {
        recipientUserId: lead.assignedToUserId,
        type: 'FOLLOWUP_REMINDER',
        entityType: 'FollowUp',
        entityId: fup.id,
        message: 'Reminder: Follow-up ' + fup.businessId + ' is scheduled in 10 minutes.',
      },
    });
    this.logger.log('Reminder sent for FUP ' + fup.businessId + ' to user ' + lead.assignedToUserId);
  }
}
`);

// ──────────────────────────────────────────────────────────────────────────────
// processors/follow-up-overdue.processor.ts
// ──────────────────────────────────────────────────────────────────────────────
mk('processors/follow-up-overdue.processor.ts', `import { Processor } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import { FollowUpStatus } from '@prisma/client';
import { Job } from 'bullmq';

import { AuditService } from '../../../common/audit/audit.service';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { BaseJobProcessor } from '../../../common/queue/base-job-processor';
import { JOBS, QUEUES } from '../../../common/queue/queue.constants';

export interface FollowUpOverdueJobData {
  idempotencyKey: string;
  followUpId: string;
}

/**
 * Transitions a SCHEDULED follow-up to OVERDUE and notifies the current lead owner.
 * Idempotent: skips if already OVERDUE or COMPLETED.
 * Notifies CURRENT lead owner (assignedToUserId), not historical creator.
 */
@Injectable()
@Processor(QUEUES.DEADLINE_MONITOR)
export class FollowUpOverdueProcessor extends BaseJobProcessor {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {
    super(FollowUpOverdueProcessor.name);
  }

  protected async processJob(job: Job<FollowUpOverdueJobData>): Promise<void> {
    if (job.name !== JOBS.FOLLOWUP_OVERDUE) return;

    const { followUpId, idempotencyKey } = job.data;
    this.logger.log('Overdue job [' + idempotencyKey + '] for FUP ' + followUpId);

    const fup = await this.prisma.followUp.findUnique({
      where: { id: followUpId },
      select: { id: true, businessId: true, status: true, leadId: true, scheduledAt: true },
    });
    if (!fup) { this.logger.warn('FUP ' + followUpId + ' not found — skip'); return; }
    if (fup.status !== FollowUpStatus.SCHEDULED) { this.logger.log('FUP ' + followUpId + ' is ' + fup.status + ' — skip overdue'); return; }
    if (fup.scheduledAt > new Date()) { this.logger.warn('FUP ' + followUpId + ' scheduledAt in future — skip'); return; }

    await this.prisma.$transaction(async (tx) => {
      await tx.followUp.update({ where: { id: followUpId }, data: { status: FollowUpStatus.OVERDUE } });
      await this.audit.recordInTx(tx, { entityType: 'FollowUp', entityId: followUpId, action: 'FOLLOW_UP_OVERDUE', newValue: { businessId: fup.businessId, scheduledAt: fup.scheduledAt.toISOString() } });
    });
    this.logger.log('FUP ' + fup.businessId + ' transitioned to OVERDUE');

    const lead = await this.prisma.lead.findUnique({
      where: { id: fup.leadId },
      select: { assignedToUserId: true },
    });
    if (!lead?.assignedToUserId) { this.logger.warn('FUP ' + followUpId + ': lead has no assignee — skip notification'); return; }

    await this.prisma.notification.create({
      data: {
        recipientUserId: lead.assignedToUserId,
        type: 'FOLLOWUP_OVERDUE',
        entityType: 'FollowUp',
        entityId: followUpId,
        message: 'Follow-up ' + fup.businessId + ' is now overdue.',
      },
    });
    this.logger.log('Overdue notification sent for FUP ' + fup.businessId + ' to user ' + lead.assignedToUserId);
  }
}
`);

// ──────────────────────────────────────────────────────────────────────────────
// listeners/employee-checkout.listener.ts
// ──────────────────────────────────────────────────────────────────────────────
mk('listeners/employee-checkout.listener.ts', `import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { InjectQueue } from '@nestjs/bullmq';
import { ConfigService } from '@nestjs/config';
import { FollowUpStatus } from '@prisma/client';
import { Queue } from 'bullmq';
import { endOfDay, startOfDay } from 'date-fns';
import { fromZonedTime, toZonedTime } from 'date-fns-tz';

import { PrismaService } from '../../../common/prisma/prisma.service';
import { JOBS, QUEUES } from '../../../common/queue/queue.constants';
import { EmployeeCheckedOutPayload } from '../../../common/events/employee-checked-out.event';

/**
 * CRM integration boundary for the Attendance module.
 * When a Sales employee checks out, sends a consolidated notification to Sales Head
 * if they have incomplete Follow-ups due today.
 * DO NOT implement Attendance logic here.
 */
@Injectable()
export class EmployeeCheckoutListener {
  private readonly logger = new Logger(EmployeeCheckoutListener.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    @InjectQueue(QUEUES.NOTIFICATIONS) private readonly notificationsQueue: Queue,
  ) {}

  @OnEvent('employee.checked-out', { async: true })
  async handleEmployeeCheckedOut(payload: EmployeeCheckedOutPayload): Promise<void> {
    this.logger.log('Employee checked-out event for userId ' + payload.userId);

    const tz = this.config.get<string>('crm.businessTimezone') ?? 'Asia/Kolkata';
    const nowInTz = toZonedTime(new Date(), tz);
    const todayStart = fromZonedTime(startOfDay(nowInTz), tz);
    const todayEnd = fromZonedTime(endOfDay(nowInTz), tz);

    const incompleteFups = await this.prisma.followUp.findMany({
      where: {
        lead: { assignedToUserId: payload.userId },
        status: { in: [FollowUpStatus.SCHEDULED, FollowUpStatus.OVERDUE] },
        scheduledAt: { gte: todayStart, lte: todayEnd },
      },
      select: { id: true, businessId: true },
    });

    if (incompleteFups.length === 0) {
      this.logger.log('No incomplete FUPs today for user ' + payload.userId);
      return;
    }

    const salesHeads = await this.prisma.userRole.findMany({
      where: { role: { code: 'SALES_HEAD' } },
      select: { userId: true },
    });

    if (salesHeads.length === 0) {
      this.logger.warn('No SALES_HEAD users found — cannot send checkout notification');
      return;
    }

    const dateStr = todayStart.toISOString().slice(0, 10);
    const baseKey = 'checkout-notify-' + payload.userId + '-' + dateStr;

    for (const sh of salesHeads) {
      const jobId = baseKey + '-' + sh.userId;
      await this.notificationsQueue.add(
        JOBS.FOLLOWUP_CHECKOUT_NOTIFY,
        {
          idempotencyKey: jobId,
          employeeUserId: payload.userId,
          employeeId: payload.employeeId,
          salesHeadUserId: sh.userId,
          incompleteFupCount: incompleteFups.length,
          followUpBusinessIds: incompleteFups.map((f) => f.businessId),
          checkedOutAt: payload.checkedOutAt.toISOString(),
        },
        { jobId },
      );
    }

    this.logger.log('Checkout notification enqueued for ' + salesHeads.length + ' Sales Head(s) — ' + incompleteFups.length + ' incomplete FUPs');
  }
}
`);

// ──────────────────────────────────────────────────────────────────────────────
// follow-up.service.spec.ts
// ──────────────────────────────────────────────────────────────────────────────
mk('follow-up.service.spec.ts', `import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { FollowUpStatus } from '@prisma/client';
import { getQueueToken } from '@nestjs/bullmq';
import { ConfigService } from '@nestjs/config';

import { FollowUpService } from './follow-up.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../../common/audit/audit.service';
import { IdGeneratorService } from '../../common/id-generator/id-generator.service';
import { QUEUES } from '../../common/queue/queue.constants';

describe('FollowUpService', () => {
  let service: FollowUpService;
  let mockPrisma: any;
  let mockAudit: any;
  let mockIdGen: any;
  let mockQueue: any;
  let mockConfig: any;

  beforeEach(async () => {
    mockPrisma = {
      lead: { findUnique: jest.fn(), update: jest.fn() },
      followUp: { findFirst: jest.fn(), findUnique: jest.fn(), create: jest.fn(), update: jest.fn() },
      followUpRescheduleHistory: { create: jest.fn() },
      leadStatusHistory: { create: jest.fn() },
      $transaction: jest.fn((cb) => cb(mockPrisma)),
    };
    mockAudit = { recordInTx: jest.fn() };
    mockIdGen = { nextIdInTx: jest.fn().mockResolvedValue('FUP-0001') };
    mockQueue = { add: jest.fn(), getJob: jest.fn() };
    mockConfig = { get: jest.fn().mockReturnValue('Asia/Kolkata') };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FollowUpService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: AuditService, useValue: mockAudit },
        { provide: IdGeneratorService, useValue: mockIdGen },
        { provide: ConfigService, useValue: mockConfig },
        { provide: getQueueToken(QUEUES.DEADLINE_MONITOR), useValue: mockQueue },
      ],
    }).compile();

    service = module.get<FollowUpService>(FollowUpService);
  });

  describe('create', () => {
    it('creates follow-up successfully if no active exists', async () => {
      mockPrisma.lead.findUnique.mockResolvedValue({ id: 'lead1', assignedToUserId: 'user1', isArchived: false });
      mockPrisma.followUp.findFirst.mockResolvedValue(null);
      mockPrisma.followUp.create.mockResolvedValue({ id: 'fup1', status: 'SCHEDULED', scheduledAt: new Date(Date.now() + 1200000) });

      const res = await service.create('lead1', { scheduledAt: new Date(Date.now() + 1200000).toISOString() }, 'user1', false);
      expect(res.id).toBe('fup1');
      expect(mockPrisma.followUp.create).toHaveBeenCalled();
      expect(mockQueue.add).toHaveBeenCalledTimes(2); // reminder & overdue jobs
    });

    it('throws Forbidden if not lead owner', async () => {
      mockPrisma.lead.findUnique.mockResolvedValue({ id: 'lead1', assignedToUserId: 'owner1' });
      await expect(service.create('lead1', { scheduledAt: '2026-01-01T10:00:00Z' }, 'other_user', false)).rejects.toThrow(ForbiddenException);
    });

    it('throws Conflict if active follow-up already exists', async () => {
      mockPrisma.lead.findUnique.mockResolvedValue({ id: 'lead1', assignedToUserId: 'user1', isArchived: false });
      mockPrisma.followUp.findFirst.mockResolvedValue({ id: 'fup1', status: 'SCHEDULED', businessId: 'FUP-001' });

      await expect(service.create('lead1', { scheduledAt: '2026-01-01T10:00:00Z' }, 'user1', false)).rejects.toThrow(ConflictException);
    });
  });

  describe('complete', () => {
    it('completes follow-up and unsets requiresFollowUp if no next FUP', async () => {
      mockPrisma.lead.findUnique.mockResolvedValue({ id: 'lead1', assignedToUserId: 'user1' });
      mockPrisma.followUp.findFirst.mockResolvedValueOnce({ id: 'fup1', status: 'SCHEDULED', leadId: 'lead1' }); // access check
      mockPrisma.followUp.findFirst.mockResolvedValueOnce(null); // other active check
      mockPrisma.followUp.update.mockResolvedValue({ id: 'fup1', status: 'COMPLETED' });

      await service.complete('lead1', 'fup1', {}, 'user1', false);

      expect(mockPrisma.followUp.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: 'COMPLETED' }) }));
      expect(mockPrisma.lead.update).toHaveBeenCalledWith(expect.objectContaining({ data: { requiresFollowUp: false } }));
    });
  });
});
`);

// ──────────────────────────────────────────────────────────────────────────────
// follow-up.e2e-spec.ts
// ──────────────────────────────────────────────────────────────────────────────
fs.writeFileSync(path.join(__dirname, 'apps/api/test/follow-up.e2e-spec.ts'), `import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';
import { TransformInterceptor } from '../src/common/interceptors/transform.interceptor';
import { PrismaService } from '../src/common/prisma/prisma.service';
import { QueueModule } from '../src/common/queue/queue.module';

import { FollowUpReminderProcessor } from '../src/modules/follow-up/processors/follow-up-reminder.processor';
import { FollowUpOverdueProcessor } from '../src/modules/follow-up/processors/follow-up-overdue.processor';

class MockQueueModule {}

const TEST_PASSWORD = 'TestPassword123!';
const TEST_HASH = '$argon2id$v=19$m=65536,t=3,p=4$F8nnI8hF9A3BlyGdByiRoQ$wPiFQ/OJIFSbeMyUuGhTZ/4KdrmXoptkeZe1Kkqknio';

describe('FollowUpModule (e2e)', () => {
  jest.setTimeout(60000);

  let app: INestApplication;
  let prisma: PrismaService;
  let headToken: string;
  let counsellorToken: string;
  let counsellorId: string;
  let leadId: string;

  const loginAs = async (email: string): Promise<string> => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email, password: TEST_PASSWORD });
    return res.body.data.accessToken;
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(CACHE_MANAGER).useValue({ get: () => Promise.resolve(null), set: () => Promise.resolve(), del: () => Promise.resolve() })
      .overrideModule(QueueModule).useModule(MockQueueModule)
      .overrideProvider(FollowUpReminderProcessor).useValue({})
      .overrideProvider(FollowUpOverdueProcessor).useValue({})
      .compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true }));
    app.useGlobalFilters(new AllExceptionsFilter());
    app.useGlobalInterceptors(new TransformInterceptor());
    await app.init();

    prisma = app.get<PrismaService>(PrismaService);
    await prisma.cleanDatabase();

    const roleHead = await prisma.role.findUnique({ where: { code: 'SALES_HEAD' } });
    const roleCounsellor = await prisma.role.findUnique({ where: { code: 'SALES_COUNSELLOR' } });
    const deptSales = await prisma.department.findUnique({ where: { code: 'SALES' } });

    const head = await prisma.user.create({
      data: {
        email: 'head_fup@elscore.test', passwordHash: TEST_HASH, status: 'ACTIVE',
        userRoles: { create: { roleId: roleHead!.id } },
        employee: { create: { businessId: 'EMP-F01', departmentId: deptSales!.id, firstName: 'Head', lastName: 'Fup' } },
      },
    });

    const counsellor = await prisma.user.create({
      data: {
        email: 'counsellor_fup@elscore.test', passwordHash: TEST_HASH, status: 'ACTIVE',
        userRoles: { create: { roleId: roleCounsellor!.id } },
        employee: { create: { businessId: 'EMP-F02', departmentId: deptSales!.id, firstName: 'Counsellor', lastName: 'Fup' } },
      },
    });
    counsellorId = counsellor.id;

    headToken = await loginAs('head_fup@elscore.test');
    counsellorToken = await loginAs('counsellor_fup@elscore.test');

    const leadRes = await request(app.getHttpServer())
      .post('/api/v1/leads')
      .set('Authorization', \`Bearer \${counsellorToken}\`)
      .send({ firstName: 'Fup', lastName: 'Test', primaryPhone: '5550001111', leadSource: 'WEBSITE' });
    leadId = leadRes.body.data.id;
  });

  afterAll(async () => {
    await prisma.cleanDatabase();
    await app.close();
  });

  it('creates a follow-up successfully', async () => {
    const res = await request(app.getHttpServer())
      .post(\`/api/v1/leads/\${leadId}/follow-ups\`)
      .set('Authorization', \`Bearer \${counsellorToken}\`)
      .send({ scheduledAt: new Date(Date.now() + 86400000).toISOString(), remarks: 'First follow up' });

    expect(res.status).toBe(201);
    expect(res.body.data.businessId).toMatch(/^FUP-\\d{4}$/);
    expect(res.body.data.status).toBe('SCHEDULED');

    const leadRes = await request(app.getHttpServer())
      .get(\`/api/v1/leads/\${leadId}\`)
      .set('Authorization', \`Bearer \${counsellorToken}\`);
    expect(leadRes.body.data.requiresFollowUp).toBe(true);
  });

  it('fetches aggregate follow-ups (all)', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/follow-ups?view=all')
      .set('Authorization', \`Bearer \${counsellorToken}\`);
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThan(0);
  });
});
`, 'utf8');

// ──────────────────────────────────────────────────────────────────────────────

// Partial unique index migration SQL (with proper double-quoted identifiers)
// ──────────────────────────────────────────────────────────────────────────────
const q = '"';
const migSql = [
  '-- AddPartialUniqueIndex',
  '-- Enforces: at most one SCHEDULED or OVERDUE follow-up per lead at any time.',
  '-- Prisma cannot generate partial unique indexes; maintained manually.',
  'CREATE UNIQUE INDEX ' + q + 'follow_ups_lead_active_idx' + q,
  '  ON ' + q + 'follow_ups' + q + '(' + q + 'lead_id' + q + ')',
  "  WHERE status IN ('SCHEDULED', 'OVERDUE');",
  '',
].join('\n');
fs.writeFileSync(
  path.join(__dirname, 'apps/api/prisma/migrations/20260910160000_followup_active_partial_unique/migration.sql'),
  migSql,
  { encoding: 'utf8', flag: 'w' },
);

console.log('All follow-up source files written successfully.');