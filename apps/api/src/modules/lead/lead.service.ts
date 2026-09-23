import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { LeadStatus, Prisma } from '@prisma/client';

import { AuditService } from '../../common/audit/audit.service';
import { IdGeneratorService } from '../../common/id-generator/id-generator.service';
import { encodeCursor, decodeCursor } from '../../common/pagination/paginate.util';
import { PrismaService, PrismaTxClient } from '../../common/prisma/prisma.service';
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
        if (nextUser.userId) {
          assignedTo = nextUser.userId;
          assignmentType = 'AUTOMATIC_ROUND_ROBIN';
        }
      } else if (isReferral) {
        assignmentType = 'REFERRAL';
      }

      const businessId = await this.idGen.nextIdInTx(tx, 'LED');
      const { channel, campaign, externalCampaignId, externalLeadId, students, ...leadData } = dto;

      const newLead = await tx.lead.create({
        data: {
          businessId,
          ...leadData,
          assignedToUserId: assignedTo,
          createdByUserId: actorUserId,
          creationChannel: hasReadAll ? 'SALES_HEAD' : 'SALES_COUNSELLOR',
        },
      });

      if (students && students.length > 0) {
        for (const stuDto of students) {
          const stuBusinessId = await this.idGen.nextIdInTx(tx, 'STU');
          const { requirements, ...stuData } = stuDto;

          const newStudent = await tx.student.create({
            data: {
              businessId: stuBusinessId,
              leadId: newLead.id,
              ...stuData,
            },
          });

          await this.audit.recordInTx(tx, {
            entityType: 'Student',
            entityId: newStudent.id,
            action: 'CREATE',
            actorUserId: actorUserId,
            newValue: newStudent,
          });

          if (requirements && requirements.length > 0) {
            for (const reqDto of requirements) {
              const reqBusinessId = await this.idGen.nextIdInTx(tx, 'RQT');
              const newReq = await tx.requirement.create({
                data: {
                  businessId: reqBusinessId,
                  studentId: newStudent.id,
                  ...reqDto,
                },
              });

              await this.audit.recordInTx(tx, {
                entityType: 'Requirement',
                entityId: newReq.id,
                action: 'CREATE',
                actorUserId: actorUserId,
                newValue: newReq,
              });
            }
          }
        }
      }

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
    if (query.hasMarketingAttribution) {
      where.marketingAttribution = { isNot: null };
    }

    if (query.classification) {
      where.currentClassification = query.classification as any;
    }

    if (query.followUpState) {
      if (query.followUpState === 'NONE') {
        where.followUps = {
          none: {
            status: { in: ['SCHEDULED', 'OVERDUE'] }
          }
        };
      } else if (query.followUpState === 'OVERDUE') {
        where.followUps = {
          some: {
            OR: [
              { status: 'OVERDUE' },
              { status: 'SCHEDULED', scheduledAt: { lt: new Date() } }
            ]
          }
        };
      } else if (query.followUpState === 'SCHEDULED') {
        where.followUps = {
          some: {
            status: 'SCHEDULED',
            scheduledAt: { gte: new Date() }
          }
        };
      } else {
        where.followUps = {
          some: {
            status: query.followUpState as any
          }
        };
      }
    }

    if (query.search) {
      const searchTerms = query.search.trim().split(/\s+/).filter(Boolean);
      if (searchTerms.length > 0) {
        where.AND = searchTerms.map(term => ({
          OR: [
            { firstName: { contains: term, mode: 'insensitive' } },
            { lastName: { contains: term, mode: 'insensitive' } },
            { primaryPhone: { contains: term } },
            { students: { some: { firstName: { contains: term, mode: 'insensitive' } } } },
            { students: { some: { lastName: { contains: term, mode: 'insensitive' } } } },
          ]
        }));
      }
    }

    const limit = query.limit ?? 20;
    const take = Math.min(limit + 1, 101);

    const items = await this.prisma.lead.findMany({
      where,
      take,
      ...(query.cursor ? { cursor: { id: decodeCursor(query.cursor) }, skip: 1 } : {}),
      orderBy: { createdAt: 'asc' }, // Oldest uncontacted first logic foundation
      include: {
        assignedToUser: {
          select: {
            id: true,
            email: true,
            employee: { select: { firstName: true, lastName: true } }
          }
        },
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
        assignedToUser: {
          select: {
            id: true,
            email: true,
            employee: { select: { firstName: true, lastName: true } }
          }
        },
        students: { 
          include: { 
            requirements: { include: { subject: true, grade: true, curriculum: true } },
            demos: {
              include: {
                subject: true,
                grade: true,
                curriculum: true,
                tutor: { select: { id: true, email: true, employee: { select: { firstName: true, lastName: true } } } },
                feedback: true,
                rescheduleHistory: { orderBy: { rescheduledAt: 'desc' } },
              },
              orderBy: { scheduledAt: 'desc' },
            }
          } 
        },
        invoices: {
          include: {
            student: { select: { id: true, firstName: true, lastName: true } },
            lineItems: true,
            installments: { orderBy: { sequence: 'asc' } },
            payments: { where: { status: 'SUCCESS' }, include: { receipt: true }, orderBy: { receivedAt: 'desc' } },
          },
          orderBy: { createdAt: 'desc' },
        },
        statusHistory: { orderBy: { changedAt: 'desc' } },
        assignmentHistory: { orderBy: { assignedAt: 'desc' } },
        salesNotes: { orderBy: { createdAt: 'desc' }, include: { createdByUser: { select: { id: true, email: true, employee: { select: { firstName: true, lastName: true } } } } } },
        followUps: { orderBy: { createdAt: 'desc' }, include: { createdByUser: { select: { id: true, employee: { select: { firstName: true, lastName: true } } } }, completedByUser: { select: { id: true, employee: { select: { firstName: true, lastName: true } } } } } },
        marketingAttribution: true,
        marketingInteractions: { where: { isOriginal: true }, take: 1 },
      },
    });
  }

  async update(id: string, dto: UpdateLeadDto, userId: string, hasReadAll: boolean) {
    await this.checkOwnership(id, userId, hasReadAll);

    const oldLead = await this.prisma.lead.findUnique({ where: { id } });

    const newLead = await this.prisma.$transaction(async (tx: PrismaTxClient) => {
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

    return this.prisma.$transaction(async (tx: PrismaTxClient) => {
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
    return this.prisma.$transaction(async (tx: PrismaTxClient) => {
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
    return this.prisma.$transaction(async (tx: PrismaTxClient) => {
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

  async reopen(id: string, userId: string) {
    return this.prisma.$transaction(async (tx: PrismaTxClient) => {
      const oldLead = await tx.lead.findUniqueOrThrow({ where: { id } });
      
      if (oldLead.status !== 'LOST' && oldLead.status !== 'NOT_INTERESTED' && !oldLead.isArchived) {
        throw new ForbiddenException('Lead is not in a reopenable state');
      }

      let newOwnerId = oldLead.assignedToUserId;
      let assignmentType = null;
      let reason = 'Reopened lead';

      if (newOwnerId) {
        const owner = await tx.user.findUnique({
          where: { id: newOwnerId }
        });
        const ownerState = await tx.roundRobinCounsellorState.findUnique({
          where: { userId: newOwnerId }
        });
        
        if (!owner || owner.status !== 'ACTIVE' || (ownerState && ownerState.dailyState !== 'ACTIVE')) {
          newOwnerId = null;
          assignmentType = 'REOPENED';
          reason = 'Reopened lead, previous owner inactive/ineligible';
        }
      }

      const updated = await tx.lead.update({
        where: { id },
        data: {
          status: 'NEW',
          isArchived: false,
          archivedAt: null,
          archivedByUserId: null,
          assignedToUserId: newOwnerId
        },
      });

      if (assignmentType) {
        await tx.leadAssignmentHistory.create({
          data: {
            leadId: id,
            oldOwnerUserId: oldLead.assignedToUserId,
            newOwnerUserId: newOwnerId,
            reason,
            assignmentType: 'REOPENED',
            assignedByUserId: userId,
          },
        });
      }

      await tx.leadStatusHistory.create({
        data: {
          leadId: id,
          oldStatus: oldLead.status,
          newStatus: 'NEW',
          reason: 'Lead reopened',
          changedByUserId: userId,
        },
      });

      await this.audit.recordInTx(tx, {
        entityType: 'Lead',
        entityId: id,
        action: 'REOPEN',
        actorUserId: userId,
        oldValue: oldLead,
        newValue: updated,
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

  async getAssignmentHistory(id: string, userId: string, hasReadAll: boolean) {
    await this.checkOwnership(id, userId, hasReadAll);
    const history = await this.prisma.leadAssignmentHistory.findMany({
      where: { leadId: id },
      orderBy: { assignedAt: 'desc' },
      include: {
        newOwnerUser: { include: { employee: true } },
        oldOwnerUser: { include: { employee: true } },
        assignedByUser: { include: { employee: true } },
      }
    });

    // Map to a format similar to what the UI expected from DistributionEvent
    return {
      data: history.map(h => ({
        id: h.id,
        assignmentMethod: h.assignmentType,
        isReassignment: !!h.oldOwnerUserId,
        assignedAt: h.assignedAt,
        newOwner: h.newOwnerUser ? {
          employee: {
            firstName: h.newOwnerUser.employee?.firstName || '',
            lastName: h.newOwnerUser.employee?.lastName || ''
          }
        } : null,
      })),
      pagination: { hasNextPage: false, nextCursor: null, limit: 50 }
    };
  }

  async getTimeline(id: string, userId: string, hasReadAll: boolean) {
    await this.checkOwnership(id, userId, hasReadAll);
    const lead = await this.prisma.lead.findUnique({
      where: { id },
      include: {
        students: { include: { demos: true } },
        invoices: true,
        followUps: true
      }
    });
    if (!lead) return [];

    const entityIds = [id]; // Lead
    lead.students.forEach(s => {
      entityIds.push(s.id); // Student
      s.demos.forEach(d => entityIds.push(d.id)); // Demo
    });
    lead.invoices.forEach(inv => entityIds.push(inv.id)); // Invoice
    lead.followUps.forEach(f => entityIds.push(f.id)); // FollowUp

    const events = await this.prisma.auditEvent.findMany({
      where: {
        entityId: { in: entityIds }
      },
      orderBy: { timestamp: 'desc' },
      include: { actor: { include: { employee: true } } }
    });

    return events.map(ev => ({
      id: ev.id,
      type: ev.action,
      occurredAt: ev.timestamp,
      actor: ev.actor?.employee ? `${ev.actor.employee.firstName} ${ev.actor.employee.lastName}` : ev.actor?.username || 'System',
      metadata: ev.newValue,
      entityType: ev.entityType
    }));
  }
}
