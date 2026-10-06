import { Injectable } from '@nestjs/common';
import { LeadStatus } from '@prisma/client';

import { PrismaService } from '../../common/prisma/prisma.service';

/** Initial contact SLA. A lead at least this old, still NEW, and never contacted is delayed. */
export const INITIAL_CONTACT_SLA_MS = 15 * 60 * 1000;

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async getKpi(userId: string, readAll: boolean) {
    const where = readAll ? { isArchived: false } : { assignedToUserId: userId, isArchived: false };
    
    const [totalLeads, contactedLeads, demoBooked, enrolled] = await Promise.all([
      this.prisma.lead.count({ where }),
      this.prisma.lead.count({ where: { ...where, status: { not: 'NEW' } } }),
      this.prisma.lead.count({ where: { ...where, status: { in: ['DEMO_BOOKED', 'DEMO_COMPLETED'] } } }),
      this.prisma.lead.count({ where: { ...where, status: { in: ['ENROLLED', 'PAID'] } } }),
    ]);

    const conversionRate = totalLeads > 0 ? ((enrolled / totalLeads) * 100).toFixed(1) + '%' : '0%';

    return {
      totalLeads,
      contactedLeads,
      demoBooked,
      enrolled,
      conversionRate,
    };
  }

  async getPipeline(userId: string, readAll: boolean) {
    const where = readAll ? { isArchived: false } : { assignedToUserId: userId, isArchived: false };
    
    const stats = await this.prisma.lead.groupBy({
      by: ['status'],
      where,
      _count: { id: true },
    });

    const pipeline = stats.map(s => ({
      status: s.status,
      count: s._count.id,
    }));

    return { pipeline };
  }

  async getSources(userId: string, readAll: boolean) {
    const where = readAll ? { isArchived: false } : { assignedToUserId: userId, isArchived: false };
    
    const stats = await this.prisma.lead.groupBy({
      by: ['source'],
      where,
      _count: { id: true },
    });

    return {
      sources: stats
        .map(s => ({
          source: (s.source as string) || 'UNKNOWN',
          count: s._count.id,
        }))
        .sort((a, b) => b.count - a.count)
    };
  }

  async getTeam(userId: string, readAll: boolean) {
    if (!readAll) return { team: [] };
    
    const users = await this.prisma.user.findMany({
      where: { assignedLeads: { some: {} } },
      include: { employee: true }
    });

    const stats = await Promise.all(users.map(async u => {
      const employee = (u as any).employee;
      const assigned = await this.prisma.lead.count({ where: { assignedToUserId: u.id, isArchived: false } });
      const enrolled = await this.prisma.lead.count({ where: { assignedToUserId: u.id, status: { in: ['ENROLLED', 'PAID'] }, isArchived: false } });
      return {
        name: employee ? `${employee.firstName} ${employee.lastName}` : u.email,
        assigned,
        enrolled
      };
    }));

    return {
      team: stats.sort((a, b) => b.enrolled - a.enrolled).slice(0, 5)
    };
  }

  /**
   * Leads that are still inside the initial 15-minute contact SLA.
   *
   * LeadStatusHistory is written for every application status change:
   * creation inserts newStatus=NEW, updateStatus inserts the destination
   * status, and reopen inserts newStatus=NEW without deleting earlier rows.
   * A non-NEW history row therefore means the lead has been contacted at
   * least once, including NEW → CONTACTED → NEW.
   */
  async getDelayedLeads(userId: string, readAll: boolean, now = new Date()) {
    const where = this.delayedLeadWhere(userId, readAll, now);

    const [delayedCount, delayedLeads] = await Promise.all([
      this.prisma.lead.count({ where }),
      this.prisma.lead.findMany({
        where,
        orderBy: { createdAt: 'asc' },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          createdAt: true,
          primaryPhone: true,
          whatsappNumber: true,
          assignedToUser: {
            select: {
              id: true,
              email: true,
              employee: { select: { firstName: true, lastName: true } },
            },
          },
        },
      }),
    ]);

    return { delayedCount, delayedLeads };
  }

  private delayedLeadWhere(userId: string, readAll: boolean, now: Date) {
    return {
      isArchived: false,
      status: LeadStatus.NEW,
      createdAt: { lte: new Date(now.getTime() - INITIAL_CONTACT_SLA_MS) },
      ...(readAll ? {} : { assignedToUserId: userId }),
      statusHistory: {
        none: {
          newStatus: { not: LeadStatus.NEW },
        },
      },
    };
  }
}
