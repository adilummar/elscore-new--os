import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';

import { AuditService } from '../../../common/audit/audit.service';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { RbacService } from '../../../common/rbac/rbac.service';

import { CreateAdSpendDto, ReportQueryDto } from './hiring-demo.dto';
import { HiringDemoService } from './hiring-demo.service';
import { HiringDecision, HiringStage } from './hiring-rules';
import { HiringScheduleService } from './hiring-schedule.service';

/**
 * Metric definitions (documented so numbers can be audited):
 *  - enquiryRecords:      rows in tutor_lead_enquiries (a candidate can have several).
 *  - uniqueCandidates:    distinct candidates with at least one matching enquiry.
 *  - contacted:           candidates with at least one call whose status is ATTENDED.
 *  - cvReceived:          candidates with a CV received date/time.
 *  - shortlisted:         candidates that have reached the Live Demo & Interview stage.
 *  - demoAttended:        candidates with at least one demo booking marked ATTENDED.
 *  - selected:            current decision is ACCEPTED or HIRED.
 *  - tutorsHired:         current decision is HIRED (a recruitment outcome, not a Tutor record).
 *  - trainingCompleted:   not available; Training is not implemented yet.
 */
@Injectable()
export class HiringReportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly rbac: RbacService,
    private readonly demos: HiringDemoService,
    private readonly schedules: HiringScheduleService,
    private readonly config: ConfigService,
  ) {}

  private baseWhere(q: ReportQueryDto): Prisma.TutorLeadWhereInput {
    const enquiryFilter: Prisma.TutorLeadEnquiryWhereInput = {
      ...(q.sourceId ? { sourceId: q.sourceId } : {}),
      ...(q.from || q.to
        ? { enquiryDate: { ...(q.from ? { gte: new Date(q.from) } : {}), ...(q.to ? { lte: new Date(q.to) } : {}) } }
        : {}),
    };
    return {
      deletedAt: null,
      hiringStage: q.stage ? (q.stage as HiringStage) : { not: null },
      ...(q.decision ? { decision: q.decision as HiringDecision } : {}),
      ...(q.managerId ? { assignedToUserId: q.managerId } : {}),
      enquiries: { some: enquiryFilter },
    };
  }

  async summary(q: ReportQueryDto) {
    if (q.from && q.to && new Date(q.to) < new Date(q.from)) throw new BadRequestException('"to" must not be before "from"');
    const where = this.baseWhere(q);
    const enquiryWhere: Prisma.TutorLeadEnquiryWhereInput = {
      ...(q.sourceId ? { sourceId: q.sourceId } : {}),
      ...(q.from || q.to
        ? { enquiryDate: { ...(q.from ? { gte: new Date(q.from) } : {}), ...(q.to ? { lte: new Date(q.to) } : {}) } }
        : {}),
      tutorLead: { is: { ...where, enquiries: undefined } },
    };

    const [enquiryRecords, uniqueCandidates, contacted, cvReceived, shortlisted, demoAttended, selected, hired] = await Promise.all([
      this.prisma.tutorLeadEnquiry.count({ where: enquiryWhere }),
      this.prisma.tutorLead.count({ where }),
      this.prisma.tutorLead.count({ where: { AND: [where, { calls: { some: { status: 'ATTENDED' } } }] } }),
      this.prisma.tutorLead.count({ where: { AND: [where, { cvReceivedAt: { not: null } }] } }),
      this.prisma.tutorLead.count({ where: { AND: [where, { hiringStage: 'LIVE_DEMO_INTERVIEW' }] } }),
      this.prisma.tutorLead.count({ where: { AND: [where, { demoBookings: { some: { status: 'ATTENDED' } } }] } }),
      this.prisma.tutorLead.count({ where: { AND: [where, { decision: { in: ['ACCEPTED', 'HIRED'] } }] } }),
      this.prisma.tutorLead.count({ where: { AND: [where, { decision: 'HIRED' }] } }),
    ]);

    const sources = await this.prisma.tutorLeadSource.findMany({ select: { id: true, name: true }, orderBy: { name: 'asc' } });
    const enquiriesBySource = await this.prisma.tutorLeadEnquiry.groupBy({
      by: ['sourceId'], where: enquiryWhere, _count: { _all: true },
    });
    const uniqueBySource = await Promise.all(
      sources.map(async (s) => ({
        sourceId: s.id,
        uniqueCandidates: await this.prisma.tutorLead.count({
          where: { ...where, enquiries: { some: { ...(enquiryWhere as object), tutorLead: undefined, sourceId: s.id } } },
        }),
      })),
    );

    // Advertising spend: only what staff entered; overlapping periods are included whole, never prorated.
    const spendRows = await this.prisma.tutorAdSpend.findMany({
      where: {
        ...(q.sourceId ? { sourceId: q.sourceId } : {}),
        ...(q.from ? { periodEnd: { gte: new Date(q.from) } } : {}),
        ...(q.to ? { periodStart: { lte: new Date(q.to) } } : {}),
      },
      include: { source: { select: { name: true } } },
      orderBy: { periodStart: 'desc' },
    });
    const totalsByCurrency: Record<string, string> = {};
    for (const r of spendRows) {
      totalsByCurrency[r.currency] = (Number(totalsByCurrency[r.currency] ?? 0) + Number(r.amount)).toFixed(2);
    }

    return {
      definitions: {
        uniqueCandidates: 'Distinct candidate profiles with a matching enquiry',
        enquiryRecords: 'Enquiry rows; a candidate may have several',
        outcomes: 'Counts of unique candidates by their current state',
      },
      enquiries: { enquiryRecords, uniqueCandidates },
      outcomes: {
        contacted, cvReceived, shortlisted, demoAttended, selected, tutorsHired: hired,
        trainingCompleted: null as number | null,
        trainingCompletedNote: 'Training is not implemented yet',
      },
      bySource: sources.map((s) => ({
        sourceId: s.id,
        source: s.name,
        enquiryRecords: enquiriesBySource.find((e) => e.sourceId === s.id)?._count._all ?? 0,
        uniqueCandidates: uniqueBySource.find((u) => u.sourceId === s.id)?.uniqueCandidates ?? 0,
      })),
      advertising: {
        status: spendRows.length ? 'ENTERED' : 'NOT_ENTERED',
        totalsByCurrency,
        entries: spendRows.map((r) => ({
          id: r.id, source: r.source.name, periodStart: r.periodStart, periodEnd: r.periodEnd,
          amount: r.amount.toString(), currency: r.currency, notes: r.notes,
        })),
      },
    };
  }

  async addAdSpend(dto: CreateAdSpendDto, actorUserId: string) {
    if (new Date(dto.periodEnd) < new Date(dto.periodStart)) throw new BadRequestException('Period end must not be before period start');
    const source = await this.prisma.tutorLeadSource.findUnique({ where: { id: dto.sourceId } });
    if (!source) throw new BadRequestException('Source not found');
    const row = await this.prisma.tutorAdSpend.create({
      data: {
        sourceId: dto.sourceId, periodStart: new Date(dto.periodStart), periodEnd: new Date(dto.periodEnd),
        amount: dto.amount, currency: dto.currency, notes: dto.notes, enteredByUserId: actorUserId,
      },
    });
    await this.audit.record({ entityType: 'TutorAdSpend', entityId: row.id, action: 'TUTOR_AD_SPEND_ENTERED', actorUserId, newValue: { sourceId: dto.sourceId, amount: dto.amount, currency: dto.currency } });
    return row;
  }

  /** Landing-page data. Department-wide figures only for tutor_hiring.read-all holders. */
  async dashboard(userId: string) {
    const all = await this.rbac.hasPermissions(userId, ['tutor_hiring.read-all']);
    const tz = (await this.schedules.getEffective())?.timezone ?? this.config.get<string>('crm.businessTimezone') ?? 'Asia/Kolkata';
    const day = new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(new Date()); // YYYY-MM-DD local
    const today = await this.demos.workload({ from: day, to: day }, userId);
    const pending = await this.demos.pendingEvaluations(userId);
    const stageCounts = await this.prisma.tutorLead.groupBy({
      by: ['hiringStage'], where: { deletedAt: null, hiringStage: { not: null } }, _count: { _all: true },
    });
    const decisionCounts = await this.prisma.tutorLead.groupBy({
      by: ['decision'], where: { deletedAt: null, hiringStage: { not: null }, decision: { not: null } }, _count: { _all: true },
    });
    const recent = await this.prisma.auditEvent.findMany({
      where: { entityType: 'TutorLead', action: { startsWith: 'TUTOR_' } },
      orderBy: { timestamp: 'desc' }, take: 10,
    });
    return {
      scope: all ? 'DEPARTMENT' : 'OWN',
      pipeline: stageCounts.map((s) => ({ stage: s.hiringStage, candidates: s._count._all })),
      decisions: decisionCounts.map((d) => ({ decision: d.decision, candidates: d._count._all })),
      todaysDemos: today.data,
      workloadSummary: today.summary,
      pendingEvaluations: pending.filter((p) => p.evaluationSla.state === 'PENDING'),
      overdueEvaluations: pending.filter((p) => p.evaluationSla.state === 'OVERDUE'),
      slaNotConfigured: pending.some((p) => p.evaluationSla.state === 'SLA_NOT_CONFIGURED'),
      recentActivity: recent,
    };
  }
}
