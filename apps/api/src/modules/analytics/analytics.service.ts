import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';

@Injectable()
export class AnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  private getDates(query: { from?: string; to?: string }) {
    const fromDate = query.from ? new Date(query.from) : undefined;
    const toDate = query.to ? new Date(query.to) : undefined;
    return { fromDate, toDate };
  }

  async getOverview(query: { from?: string; to?: string }) {
    const { fromDate, toDate } = this.getDates(query);
    const dateFilter = fromDate || toDate ? {
      ...(fromDate && { gte: fromDate }),
      ...(toDate && { lte: toDate }),
    } : undefined;

    const [activeLeads, newLeads, enrolledHistory, collections, activeEmployees] = await Promise.all([
      // Active Leads (Current state)
      this.prisma.lead.count({
        where: {
          isArchived: false,
          status: { notIn: ['LOST', 'JUNK', 'NOT_INTERESTED'] }
        }
      }),
      // New Leads (Period)
      this.prisma.lead.count({
        where: {
          isArchived: false,
          ...(dateFilter && { createdAt: dateFilter })
        }
      }),
      // Enrolled (Period)
      this.prisma.leadStatusHistory.count({
        where: {
          newStatus: 'ENROLLED',
          ...(dateFilter && { changedAt: dateFilter })
        }
      }),
      // Actual Collections (Period)
      this.prisma.payment.aggregate({
        _sum: { amount: true },
        where: {
          status: 'SUCCESS',
          ...(dateFilter && { receivedAt: dateFilter })
        }
      }),
      // Active Employees (Current state)
      this.prisma.employee.count({
        where: { employmentStatus: 'ACTIVE' }
      })
    ]);

    const enrolled = enrolledHistory;
    const conversionRate = newLeads > 0 ? ((enrolled / newLeads) * 100).toFixed(1) + '%' : '0%';
    const actualCollections = collections._sum?.amount ? Number(collections._sum.amount) : 0;

    return {
      activeLeads,
      newLeads,
      enrolled,
      actualCollections,
      conversionRate,
      activeEmployees,
    };
  }

  async getMarketing(query: { from?: string; to?: string }) {
    const { fromDate, toDate } = this.getDates(query);
    const dateFilter = fromDate || toDate ? {
      ...(fromDate && { gte: fromDate }),
      ...(toDate && { lte: toDate }),
    } : undefined;

    // Period Marketing Leads
    const periodWhere = {
      isArchived: false,
      marketingAttribution: { isNot: null },
      ...(dateFilter && { createdAt: dateFilter })
    };

    const [totalMarketing, newMarketing, enrolled, paid] = await Promise.all([
      this.prisma.lead.count({ where: { isArchived: false, marketingAttribution: { isNot: null } } }),
      this.prisma.lead.count({ where: periodWhere }),
      this.prisma.lead.count({ where: { ...periodWhere, status: 'ENROLLED' } }),
      this.prisma.lead.count({ where: { ...periodWhere, status: 'PAID' } })
    ]);

    // Group by source (channel)
    const sourceStats = await this.prisma.marketingAttribution.groupBy({
      by: ['channel'],
      _count: { leadId: true },
      where: {
        lead: { isArchived: false, ...(dateFilter && { createdAt: dateFilter }) }
      }
    });

    // Detailed hierarchy from MarketingInteraction
    const interactions = await this.prisma.marketingInteraction.groupBy({
      by: ['provider', 'campaignName', 'adsetName', 'adName'],
      _count: { leadId: true },
      where: {
        isOriginal: true,
        lead: { isArchived: false, ...(dateFilter && { createdAt: dateFilter }) }
      }
    });

    return {
      totalMarketing,
      newMarketing,
      enrolled,
      paid,
      conversionRate: newMarketing > 0 ? ((enrolled / newMarketing) * 100).toFixed(1) + '%' : '0%',
      sources: sourceStats.map(s => ({
        channel: s.channel || 'UNKNOWN',
        leads: s._count.leadId
      })),
      hierarchy: interactions
    };
  }

  async getSales(query: { from?: string; to?: string }) {
    const { fromDate, toDate } = this.getDates(query);
    const dateFilter = fromDate || toDate ? {
      ...(fromDate && { gte: fromDate }),
      ...(toDate && { lte: toDate }),
    } : undefined;

    // Salesperson performance (Current ownership, but period creations/stats for that owner)
    const counsellors = await this.prisma.user.findMany({
      where: { userRoles: { some: { role: { code: { in: ['SALES_COUNSELLOR', 'SALES_HEAD'] } } } }, status: 'ACTIVE' },
      select: {
        id: true,
        email: true,
        employee: { select: { firstName: true, lastName: true } }
      }
    });

    const performance = await Promise.all(counsellors.map(async (c) => {
      const baseWhere = { assignedToUserId: c.id, isArchived: false };
      const periodWhere = { ...baseWhere, ...(dateFilter && { createdAt: dateFilter }) };

      const [assigned, newLeads, contacted, enrolled] = await Promise.all([
        this.prisma.lead.count({ where: baseWhere }),
        this.prisma.lead.count({ where: periodWhere }),
        this.prisma.lead.count({ where: { ...periodWhere, status: { notIn: ['NEW', 'LOST', 'JUNK'] } } }),
        this.prisma.lead.count({ where: { ...periodWhere, status: { in: ['ENROLLED', 'PAID'] } } })
      ]);

      return {
        id: c.id,
        name: c.employee ? `${c.employee.firstName} ${c.employee.lastName}` : c.email,
        assigned,
        newLeads,
        contacted,
        enrolled,
        conversionRate: newLeads > 0 ? ((enrolled / newLeads) * 100).toFixed(1) + '%' : '0%'
      };
    }));

    return { performance };
  }

  async getPipeline(query: { from?: string; to?: string }) {
    // Current state, ignores period mostly, unless we filter by leads created in period
    const { fromDate, toDate } = this.getDates(query);
    const dateFilter = fromDate || toDate ? {
      ...(fromDate && { gte: fromDate }),
      ...(toDate && { lte: toDate }),
    } : undefined;

    const stats = await this.prisma.lead.groupBy({
      by: ['status'],
      _count: { id: true },
      where: {
        isArchived: false,
        ...(dateFilter && { createdAt: dateFilter })
      }
    });

    return stats.map(s => ({
      status: s.status,
      count: s._count.id
    }));
  }

  async getDemos(query: { from?: string; to?: string }) {
    const { fromDate, toDate } = this.getDates(query);
    const dateFilter = fromDate || toDate ? {
      ...(fromDate && { gte: fromDate }),
      ...(toDate && { lte: toDate }),
    } : undefined;

    const baseWhere = dateFilter ? { scheduledAt: dateFilter } : {};

    const [scheduled, completed, cancelled, noShow] = await Promise.all([
      this.prisma.demo.count({ where: { ...baseWhere, status: 'SCHEDULED' } }),
      this.prisma.demo.count({ where: { ...baseWhere, status: 'COMPLETED' } }),
      this.prisma.demo.count({ where: { ...baseWhere, status: 'CANCELLED' } }),
      this.prisma.demo.count({ where: { ...baseWhere, status: 'NO_SHOW' } })
    ]);

    const total = scheduled + completed + cancelled + noShow;

    return {
      scheduled, completed, cancelled, noShow, total,
      completionRate: total > 0 ? ((completed / total) * 100).toFixed(1) + '%' : '0%'
    };
  }

  async getFinance(query: { from?: string; to?: string }) {
    const { fromDate, toDate } = this.getDates(query);
    const dateFilter = fromDate || toDate ? {
      ...(fromDate && { gte: fromDate }),
      ...(toDate && { lte: toDate }),
    } : undefined;

    const [periodCollections, outstanding] = await Promise.all([
      this.prisma.payment.aggregate({
        _sum: { amount: true },
        where: { status: 'SUCCESS', ...(dateFilter && { receivedAt: dateFilter }) }
      }),
      this.prisma.installment.aggregate({
        _sum: { amount: true },
        where: { status: 'PENDING' } // Outstanding is current state
      })
    ]);

    return {
      periodCollections: periodCollections._sum?.amount ? Number(periodCollections._sum.amount) : 0,
      outstanding: outstanding._sum?.amount ? Number(outstanding._sum.amount) : 0
    };
  }

  async getHr() {
    // HR is purely current state in V1
    const [total, active, inactive] = await Promise.all([
      this.prisma.employee.count(),
      this.prisma.employee.count({ where: { employmentStatus: 'ACTIVE' } }),
      this.prisma.employee.count({ where: { employmentStatus: { not: 'ACTIVE' } } })
    ]);

    const deptStats = await this.prisma.employee.groupBy({
      by: ['departmentId'],
      _count: { id: true },
      where: { employmentStatus: 'ACTIVE' }
    });

    const departments = await this.prisma.department.findMany();
    const headcountByDept = deptStats.map(d => {
      const dept = departments.find(dep => dep.id === d.departmentId);
      return {
        department: dept?.name || 'Unknown',
        count: d._count.id
      };
    });

    return { total, active, inactive, headcountByDept };
  }

  async getAttention() {
    const now = new Date();
    const [overdueFollowUps, overdueInstallments] = await Promise.all([
      this.prisma.followUp.count({
        where: { status: { in: ['SCHEDULED', 'OVERDUE'] }, scheduledAt: { lt: now } }
      }),
      this.prisma.installment.count({
        where: { status: 'PENDING', dueDate: { lt: now } }
      })
    ]);

    return {
      overdueFollowUps,
      overdueInstallments
    };
  }
}
