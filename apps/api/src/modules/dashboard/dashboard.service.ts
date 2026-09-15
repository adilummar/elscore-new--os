import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';

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
}
