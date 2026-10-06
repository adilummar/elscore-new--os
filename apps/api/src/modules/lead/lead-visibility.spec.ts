import { readFileSync } from 'fs';
import { join } from 'path';

import { ForbiddenException } from '@nestjs/common';

import { DashboardService } from '../dashboard/dashboard.service';

import { LeadService } from './lead.service';

type LeadRow = {
  id: string;
  firstName: string;
  lastName: string;
  primaryPhone: string;
  isArchived: boolean;
  assignedToUserId: string | null;
  status: string;
  createdAt: Date;
  students: Array<{ firstName: string; lastName: string }>;
};

const leads: LeadRow[] = [
  {
    id: 'lead-a',
    firstName: 'Amina',
    lastName: 'Khan',
    primaryPhone: '0501111111',
    isArchived: false,
    assignedToUserId: 'counsellor-a',
    status: 'NEW',
    createdAt: new Date('2026-10-01T00:00:00.000Z'),
    students: [{ firstName: 'ChildA', lastName: 'Khan' }],
  },
  {
    id: 'lead-b',
    firstName: 'Bilal',
    lastName: 'Noor',
    primaryPhone: '0502222222',
    isArchived: false,
    assignedToUserId: 'counsellor-b',
    status: 'CONTACTED',
    createdAt: new Date('2026-10-02T00:00:00.000Z'),
    students: [{ firstName: 'ChildB', lastName: 'Noor' }],
  },
  {
    id: 'lead-a-extra',
    firstName: 'Amina',
    lastName: 'Second',
    primaryPhone: '0501112222',
    isArchived: false,
    assignedToUserId: 'counsellor-a',
    status: 'NEW',
    createdAt: new Date('2026-10-03T00:00:00.000Z'),
    students: [],
  },
  {
    id: 'lead-a-archived',
    firstName: 'Archived',
    lastName: 'Amina',
    primaryPhone: '0503333333',
    isArchived: true,
    assignedToUserId: 'counsellor-a',
    status: 'LOST',
    createdAt: new Date('2026-09-01T00:00:00.000Z'),
    students: [],
  },
  {
    id: 'lead-b-archived',
    firstName: 'Archived',
    lastName: 'Bilal',
    primaryPhone: '0504444444',
    isArchived: true,
    assignedToUserId: 'counsellor-b',
    status: 'LOST',
    createdAt: new Date('2026-09-02T00:00:00.000Z'),
    students: [],
  },
];

function textIncludes(value: string | undefined, needle: string, insensitive: boolean) {
  if (!value) return false;
  return insensitive
    ? value.toLowerCase().includes(needle.toLowerCase())
    : value.includes(needle);
}

function statusMatches(status: string, filter: unknown) {
  if (!filter) return true;
  if (typeof filter === 'string') return status === filter;
  const clause = filter as { not?: string; in?: string[] };
  if (clause.not) return status !== clause.not;
  if (clause.in) return clause.in.includes(status);
  return true;
}

function matchesClause(lead: LeadRow, clause: any): boolean {
  if (clause.assignedToUserId !== undefined && lead.assignedToUserId !== clause.assignedToUserId) return false;
  if (clause.isArchived !== undefined && lead.isArchived !== clause.isArchived) return false;
  if (clause.status && !statusMatches(lead.status, clause.status)) return false;
  if (clause.OR && !clause.OR.some((item: any) => matchesClause(lead, item))) return false;
  if (clause.firstName?.contains && !textIncludes(lead.firstName, clause.firstName.contains, clause.firstName.mode === 'insensitive')) return false;
  if (clause.lastName?.contains && !textIncludes(lead.lastName, clause.lastName.contains, clause.lastName.mode === 'insensitive')) return false;
  if (clause.primaryPhone?.contains && !lead.primaryPhone.includes(clause.primaryPhone.contains)) return false;
  if (clause.students?.some?.firstName?.contains) {
    const needle = clause.students.some.firstName.contains as string;
    if (!lead.students.some((student) => textIncludes(student.firstName, needle, true))) return false;
  }
  if (clause.students?.some?.lastName?.contains) {
    const needle = clause.students.some.lastName.contains as string;
    if (!lead.students.some((student) => textIncludes(student.lastName, needle, true))) return false;
  }
  if (clause.AND && !clause.AND.every((item: any) => matchesClause(lead, item))) return false;
  return true;
}

function visibleLeads(where: any, take?: number) {
  const matched = leads
    .filter((lead) => matchesClause(lead, where))
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  return take ? matched.slice(0, take) : matched;
}

function serviceWith(prisma: any) {
  return new LeadService(
    prisma,
    { recordInTx: jest.fn() } as any,
    { nextIdInTx: jest.fn() } as any,
    {} as any,
  );
}

describe('Sales counsellor lead visibility', () => {
  const seed = readFileSync(join(__dirname, '../../../prisma/seed.ts'), 'utf8');

  function prismaForReads() {
    const prisma: any = {
      lead: {
        findMany: jest.fn(({ where, take }: { where: any; take?: number }) => visibleLeads(where, take)),
        findUnique: jest.fn(({ where }: { where: { id: string } }) => leads.find((lead) => lead.id === where.id) ?? null),
        count: jest.fn(({ where }: { where: any }) => visibleLeads(where).length),
        groupBy: jest.fn(({ where }: { where: any }) => {
          const counts = new Map<string, number>();
          for (const lead of visibleLeads(where)) {
            counts.set(lead.status, (counts.get(lead.status) ?? 0) + 1);
          }
          return [...counts.entries()].map(([status, count]) => ({ status, _count: { id: count } }));
        }),
      },
    };
    return prisma;
  }

  it('keeps lead.read-all on Sales Head and CEO, and off Sales Counsellor', () => {
    const head = seed.slice(seed.indexOf('SALES_HEAD: ['), seed.indexOf('SALES_COUNSELLOR: ['));
    const counsellor = seed.slice(seed.indexOf('SALES_COUNSELLOR: ['), seed.indexOf('FINANCE_HEAD: ['));
    expect(head).toContain("'lead.read-all'");
    expect(counsellor).not.toContain('lead.read-all');
    expect(seed).toContain('CEO: ALL_PERMISSION_CODES');
    expect(seed).toContain("code: 'lead.read-all'");
  });

  it('returns only the caller’s assigned leads, including search, archive, and pagination', async () => {
    const prisma = prismaForReads();
    const service = serviceWith(prisma);

    const listA = await service.findAll({}, 'counsellor-a', false);
    expect(listA.data.map((lead: { id: string }) => lead.id)).toEqual(['lead-a-extra', 'lead-a']);
    expect(prisma.lead.findMany.mock.calls[0][0].where.assignedToUserId).toBe('counsellor-a');

    const listB = await service.findAll({}, 'counsellor-b', false);
    expect(listB.data.map((lead: { id: string }) => lead.id)).toEqual(['lead-b']);

    const searchA = await service.findAll({ search: 'Bilal' }, 'counsellor-a', false);
    expect(searchA.data).toEqual([]);
    const searchWhere = prisma.lead.findMany.mock.calls.at(-1)[0].where;
    expect(searchWhere.assignedToUserId).toBe('counsellor-a');
    expect(searchWhere.AND).toEqual(expect.any(Array));

    const searchB = await service.findAll({ search: 'Amina' }, 'counsellor-b', false);
    expect(searchB.data).toEqual([]);

    const archivedA = await service.findAll({ isArchived: true }, 'counsellor-a', false);
    expect(archivedA.data.map((lead: { id: string }) => lead.id)).toEqual(['lead-a-archived']);

    const page = await service.findAll({ limit: 1 }, 'counsellor-a', false);
    expect(page.data.map((lead: { id: string }) => lead.id)).toEqual(['lead-a-extra']);
    expect(page.pagination.hasNextPage).toBe(true);
    expect(page.pagination.limit).toBe(1);

    await expect(service.findAll({}, '', false)).rejects.toThrow(ForbiddenException);
  });

  it('denies direct lead, timeline, and archive access to the other counsellor', async () => {
    const prisma = prismaForReads();
    prisma.$transaction = jest.fn();
    const service = serviceWith(prisma);

    await expect(service.findOne('lead-b', 'counsellor-a', false)).rejects.toThrow(ForbiddenException);
    await expect(service.findOne('lead-a', 'counsellor-b', false)).rejects.toThrow(ForbiddenException);
    await expect(service.getTimeline('lead-b', 'counsellor-a', false)).rejects.toThrow(ForbiddenException);
    await expect(service.setArchive('lead-b', true, 'counsellor-a', false)).rejects.toThrow(ForbiddenException);
    await expect(service.reopen('lead-a', 'counsellor-b', false)).rejects.toThrow(ForbiddenException);
    expect(prisma.$transaction).not.toHaveBeenCalled();

    const own = await service.findOne('lead-a', 'counsellor-a', false);
    if (!own) throw new Error('expected own lead');
    expect(own.id).toBe('lead-a');
  });

  it('lets Sales Head and CEO read both counsellors’ leads', async () => {
    const prisma = prismaForReads();
    const service = serviceWith(prisma);

    const head = await service.findAll({}, 'sales-head', true);
    expect(head.data.map((lead: { id: string }) => lead.id)).toEqual(['lead-a-extra', 'lead-b', 'lead-a']);
    expect(prisma.lead.findMany.mock.calls[0][0].where.assignedToUserId).toBeUndefined();

    const ceo = await service.findOne('lead-b', 'ceo', true);
    if (!ceo) throw new Error('expected lead');
    expect(ceo.id).toBe('lead-b');

    const filtered = await service.findAll({ assignedToUserId: 'counsellor-b' }, 'sales-head', true);
    expect(filtered.data.map((lead: { id: string }) => lead.id)).toEqual(['lead-b']);
  });

  it('scopes dashboard counts to the assigned counsellor and keeps company scope for read-all', async () => {
    const prisma = prismaForReads();
    const dashboard = new DashboardService(prisma);

    const counsellor = await dashboard.getKpi('counsellor-a', false);
    expect(counsellor.totalLeads).toBe(2);
    expect(prisma.lead.count.mock.calls[0][0].where).toEqual({
      assignedToUserId: 'counsellor-a',
      isArchived: false,
    });

    const head = await dashboard.getKpi('sales-head', true);
    expect(head.totalLeads).toBe(3);
    expect(prisma.lead.count.mock.calls[4][0].where).toEqual({ isArchived: false });
  });
});
