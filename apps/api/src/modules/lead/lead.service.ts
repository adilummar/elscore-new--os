import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { LeadStatus, Prisma } from '@prisma/client';

import { AuditService } from '../../common/audit/audit.service';
import { IdGeneratorService } from '../../common/id-generator/id-generator.service';
import { encodeCursor, decodeCursor } from '../../common/pagination/paginate.util';
import { PrismaService } from '../../common/prisma/prisma.service';
import { RoundRobinService } from '../round-robin/round-robin.service';

import { CreateLeadDto } from './dto/create-lead.dto';
import { CreateSalesNoteDto } from './dto/create-sales-note.dto';
import { LeadQueryDto } from './dto/lead-query.dto';
import { ReassignLeadDto } from './dto/reassign-lead.dto';
import { UpdateLeadStatusDto } from './dto/update-lead-status.dto';
import { UpdateLeadDto } from './dto/update-lead.dto';
import { UpdateSalesNoteDto } from './dto/update-sales-note.dto';

@Injectable()
export class LeadService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly idGen: IdGeneratorService,
    private readonly roundRobin: RoundRobinService,
  ) {}

  /**
   * Ownership verification helper. Throws if forbidden.
   */
  private async checkOwnership(leadId: string, userId: string, hasReadAll: boolean) {
    const lead = await this.prisma.lead.findUnique({
      where: { id: leadId },
      select: { assignedToUserId: true },
    });
    if (!lead) throw new NotFoundException('Lead not found');

    if (!hasReadAll && lead.assignedToUserId !== userId) {
      throw new ForbiddenException('You do not have access to this lead');
    }
  }

  async create(dto: CreateLeadDto, actorUserId: string, hasReadAll: boolean, providedTx?: Prisma.TransactionClient) {
    const runInTx = providedTx ? (fn: (tx: Prisma.TransactionClient) => Promise<any>) => fn(providedTx) : this.prisma.$transaction.bind(this.prisma);

    const existing = await this.prisma.lead.findFirst({
      where: { primaryPhone: dto.primaryPhone },
      select: { firstName: true, lastName: true, primaryPhone: true },
    });

    const warnings: any[] = [];
    if (existing) {
      warnings.push({
        type: 'DUPLICATE_PHONE',
        message: 'A lead with this primary phone already exists.',
        existingLead: existing,
      });
    }

    const lead = await runInTx(async (tx: Prisma.TransactionClient) => {
      let assignedTo = hasReadAll ? null : actorUserId;
      let assignmentType = hasReadAll ? 'MANUAL_SALES_HEAD' : 'COUNSELLOR_SELF_CREATED';

      const isReferral = dto.source === 'REFERRAL';
      const shouldEnterRR = hasReadAll && !isReferral;

      if (shouldEnterRR) {
        const nextUser = await this.roundRobin.getNextAssignee(tx);
        if (nextUser) {
          assignedTo = nextUser;
          assignmentType = 'AUTOMATIC_ROUND_ROBIN';
        }
      } else if (isReferral) {
        assignmentType = 'REFERRAL';
      }

      const businessId = await this.idGen.nextIdInTx(tx, 'LED');
      const { channel, campaign, externalCampaignId, externalLeadId, ...leadData } = dto;

      const newLead = await tx.lead.create({
        data: {
          businessId,
          ...leadData,
          assignedToUserId: assignedTo,
          createdByUserId: actorUserId,
          creationChannel: hasReadAll ? 'SALES_HEAD' : 'SALES_COUNSELLOR',
        },
      });

      if (channel || campaign || externalCampaignId || externalLeadId) {
        await tx.marketingAttribution.create({
          data: {
            leadId: newLead.id,
            channel,
            campaign,
            externalCampaignId,
            externalLeadId,
          }
        });
      }

      await tx.leadStatusHistory.create({
        data: {
          leadId: newLead.id,
          newStatus: LeadStatus.NEW,
          reason: 'Initial creation',
          changedByUserId: actorUserId,
        },
      });

      if (assignedTo) {
        await tx.leadAssignmentHistory.create({
          data: {
            leadId: newLead.id,
            newOwnerUserId: assignedTo,
            reason: 'Auto-assigned on creation',
            assignmentType: assignmentType as any,
            assignedByUserId: actorUserId,
          },
        });
      }

      await this.audit.recordInTx(tx, {
        entityType: 'Lead',
        entityId: newLead.id,
        action: 'CREATE',
        actorUserId,
        newValue: newLead,
      });

      return newLead;
    });

    return { lead, warnings };
  }

  async findAll(query: LeadQueryDto, userId: string, hasReadAll: boolean) {
    const where: Prisma.LeadWhereInput = {
      isArchived: query.isArchived ?? false,
    };

    if (!hasReadAll) {
      where.assignedToUserId = userId;
    } else if (query.assignedToUserId !== undefined) {
      // Allow Sales Head to filter by assignee, including null
      where.assignedToUserId = query.assignedToUserId === 'null' ? null : query.assignedToUserId;
    }

    if (query.status) where.status = query.status;
    if (query.source) where.source = query.source;
    if (query.isReferral) where.source = 'REFERRAL';

    if (query.search) {
      where.OR = [
        { firstName: { contains: query.search, mode: 'insensitive' } },
        { lastName: { contains: query.search, mode: 'insensitive' } },
        { primaryPhone: { contains: query.search } },
        { students: { some: { firstName: { contains: query.search, mode: 'insensitive' } } } },
        { students: { some: { lastName: { contains: query.search, mode: 'insensitive' } } } },
      ];
    }

    const limit = query.limit ?? 20;
    const take = Math.min(limit + 1, 101);

    const items = await this.prisma.lead.findMany({
      where,
      take,
      ...(query.cursor ? { cursor: { id: decodeCursor(query.cursor) }, skip: 1 } : {}),
      orderBy: { createdAt: 'asc' }, // Oldest uncontacted first logic foundation
      include: {
        students: { select: { id: true, firstName: true, lastName: true, currentGrade: true } },
      }
    });

    const hasNextPage = items.length > limit;
    const data = hasNextPage ? items.slice(0, limit) : items;
    const nextCursor = hasNextPage && data.length > 0 ? encodeCursor(data[data.length - 1].id) : null;

    return { data, pagination: { nextCursor, hasNextPage, limit } };
  }

  async findOne(id: string, userId: string, hasReadAll: boolean) {
    await this.checkOwnership(id, userId, hasReadAll);
    return this.prisma.lead.findUnique({
      where: { id },
      include: {
        students: { include: { requirements: { include: { subject: true, grade: true, curriculum: true } } } },
        statusHistory: { orderBy: { changedAt: 'desc' } },
        assignmentHistory: { orderBy: { assignedAt: 'desc' } },
        salesNotes: { orderBy: { createdAt: 'desc' }, include: { createdByUser: { select: { id: true, email: true, employee: { select: { firstName: true, lastName: true } } } } } },
        marketingAttribution: true,
      },
    });
  }

  async update(id: string, dto: UpdateLeadDto, userId: string, hasReadAll: boolean) {
    await this.checkOwnership(id, userId, hasReadAll);

    const oldLead = await this.prisma.lead.findUnique({ where: { id } });

    const newLead = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.lead.update({
        where: { id },
        data: dto,
      });

      await this.audit.recordInTx(tx, {
        entityType: 'Lead',
        entityId: id,
        action: 'UPDATE',
        oldValue: oldLead as any,
        newValue: updated,
      });

      return updated;
    });

    return newLead;
  }

  async updateStatus(id: string, dto: UpdateLeadStatusDto, userId: string, hasReadAll: boolean) {
    await this.checkOwnership(id, userId, hasReadAll);

    return this.prisma.$transaction(async (tx) => {
      const oldLead = await tx.lead.findUniqueOrThrow({ where: { id } });

      let newAssignedTo = oldLead.assignedToUserId;
      let didReassign = false;

      if ((oldLead.status === 'NOT_INTERESTED' || oldLead.status === 'LOST') && dto.status !== 'NOT_INTERESTED' && dto.status !== 'LOST') {
        if (newAssignedTo) {
          const cs = await tx.roundRobinCounsellorState.findUnique({ where: { userId: newAssignedTo } });
          const userObj = await tx.user.findUnique({ where: { id: newAssignedTo } });
          
          const isEligible = cs?.isEligible && cs?.dailyState === 'ACTIVE' && userObj?.status === 'ACTIVE';
          if (!isEligible) {
            newAssignedTo = null;
            didReassign = true;
          }
        }
      }

      const updated = await tx.lead.update({
        where: { id, status: oldLead.status },
        data: { 
          status: dto.status,
          ...(didReassign ? { assignedToUserId: null } : {})
        },
      });

      if (didReassign) {
        await tx.leadAssignmentHistory.create({
          data: {
            leadId: id,
            oldOwnerUserId: oldLead.assignedToUserId,
            newOwnerUserId: null,
            reason: 'Reopened lead but previous owner ineligible',
            assignmentType: 'REOPENED',
            assignedByUserId: userId,
          },
        });
      }

      await tx.leadStatusHistory.create({
        data: {
          leadId: id,
          oldStatus: oldLead.status,
          newStatus: dto.status,
          reason: dto.reason,
          note: dto.note,
          changedByUserId: userId,
        },
      });

      await this.audit.recordInTx(tx, {
        entityType: 'Lead',
        entityId: id,
        action: 'STATUS_CHANGE',
        actorUserId: userId,
        oldValue: oldLead,
        newValue: updated,
      });

      return updated;
    });
  }

  async reassign(id: string, dto: ReassignLeadDto, userId: string) {
    // Only SALES_HEAD (lead.reassign) can call this, so we don't need checkOwnership (they have read-all).
    // The controller should guard this with 'lead.reassign'.
    return this.prisma.$transaction(async (tx) => {
      const oldLead = await tx.lead.findUniqueOrThrow({ where: { id } });

      const updated = await tx.lead.update({
        where: { id },
        data: { assignedToUserId: dto.assignedToUserId },
      });

      await tx.leadAssignmentHistory.create({
        data: {
          leadId: id,
          oldOwnerUserId: oldLead.assignedToUserId,
          newOwnerUserId: dto.assignedToUserId,
          reason: dto.reason,
          assignedByUserId: userId,
        },
      });

      await this.audit.recordInTx(tx, {
        entityType: 'Lead',
        entityId: id,
        action: 'REASSIGN',
        actorUserId: userId,
        oldValue: oldLead,
        newValue: updated,
      });

      return updated;
    });
  }

  async setArchive(id: string, isArchived: boolean, userId: string) {
    // Only lead.archive / lead.reopen
    return this.prisma.$transaction(async (tx) => {
      // Ensure lead exists
      await tx.lead.findUniqueOrThrow({ where: { id } });

      const updated = await tx.lead.update({
        where: { id },
        data: {
          isArchived,
          archivedAt: isArchived ? new Date() : null,
          archivedByUserId: isArchived ? userId : null,
        },
      });

      await this.audit.recordInTx(tx, {
        entityType: 'Lead',
        entityId: id,
        action: isArchived ? 'ARCHIVE' : 'UNARCHIVE',
        actorUserId: userId,
      });

      return updated;
    });
  }

  // --- Sales Notes ---
  async createNote(leadId: string, dto: CreateSalesNoteDto, userId: string, hasReadAll: boolean) {
    await this.checkOwnership(leadId, userId, hasReadAll);
    
    // Explicitly NO AUDIT RECORD for sales notes
    return this.prisma.salesNote.create({
      data: {
        leadId,
        content: dto.content,
        createdByUserId: userId,
      },
    });
  }

  async updateNote(leadId: string, noteId: string, dto: UpdateSalesNoteDto, userId: string, hasReadAll: boolean) {
    await this.checkOwnership(leadId, userId, hasReadAll);

    const note = await this.prisma.salesNote.findUnique({ where: { id: noteId, leadId } });
    if (!note) throw new NotFoundException('Note not found');
    if (note.createdByUserId !== userId && !hasReadAll) {
      throw new ForbiddenException("Cannot edit someone else's note");
    }

    return this.prisma.salesNote.update({
      where: { id: noteId },
      data: dto,
    });
  }

  async deleteNote(leadId: string, noteId: string, userId: string, hasReadAll: boolean) {
    await this.checkOwnership(leadId, userId, hasReadAll);

    const note = await this.prisma.salesNote.findUnique({ where: { id: noteId, leadId } });
    if (!note) throw new NotFoundException('Note not found');
    if (note.createdByUserId !== userId && !hasReadAll) {
      throw new ForbiddenException("Cannot delete someone else's note");
    }

    await this.prisma.salesNote.delete({ where: { id: noteId } });
  }
}
