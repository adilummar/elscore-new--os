import { Test, TestingModule } from '@nestjs/testing';
import { LeadStatus } from '@prisma/client';

import { PrismaService } from '../../common/prisma/prisma.service';

import { DashboardService, INITIAL_CONTACT_SLA_MS } from './dashboard.service';
import { assigneeLabel, overdueLabel } from './delayed-contact';

const NOW = new Date('2026-10-03T12:00:00.000Z');
const THRESHOLD = new Date(NOW.getTime() - INITIAL_CONTACT_SLA_MS);

function matchesDelayedWhere(lead: {
  status: LeadStatus;
  isArchived: boolean;
  createdAt: Date;
  assignedToUserId: string | null;
  history: { newStatus: LeadStatus }[];
}, where: {
  isArchived: boolean;
  status: LeadStatus;
  createdAt: { lte: Date };
  assignedToUserId?: string;
  statusHistory: { none: { newStatus: { not: LeadStatus } } };
}) {
  if (lead.isArchived !== where.isArchived) return false;
  if (lead.status !== where.status) return false;
  if (lead.createdAt.getTime() > where.createdAt.lte.getTime()) return false;
  if (where.assignedToUserId && lead.assignedToUserId !== where.assignedToUserId) return false;
  const leftNew = lead.history.some((row) => row.newStatus !== LeadStatus.NEW);
  return !leftNew;
}

describe('DashboardService delayed contact SLA', () => {
  let service: DashboardService;
  let prisma: {
    lead: {
      count: jest.Mock;
      findMany: jest.Mock;
    };
  };

  beforeEach(async () => {
    prisma = {
      lead: {
        count: jest.fn().mockResolvedValue(0),
        findMany: jest.fn().mockResolvedValue([]),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DashboardService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get(DashboardService);
  });

  function whereFromCall() {
    const countWhere = prisma.lead.count.mock.calls[0][0].where;
    const listWhere = prisma.lead.findMany.mock.calls[0][0].where;
    expect(listWhere).toBe(countWhere);
    expect(prisma.lead.findMany.mock.calls[0][0].orderBy).toEqual({ createdAt: 'asc' });
    return countWhere;
  }

  it('excludes a lead younger than 15 minutes and includes one at or beyond the boundary', async () => {
    await service.getDelayedLeads('counsellor-1', true, NOW);
    const where = whereFromCall();

    expect(where.createdAt).toEqual({ lte: THRESHOLD });
    expect(where.status).toBe(LeadStatus.NEW);
    expect(where.isArchived).toBe(false);
    expect(where.statusHistory).toEqual({ none: { newStatus: { not: LeadStatus.NEW } } });

    const base = {
      status: LeadStatus.NEW,
      isArchived: false,
      assignedToUserId: 'counsellor-1',
      history: [{ newStatus: LeadStatus.NEW }],
    };
    expect(matchesDelayedWhere({ ...base, createdAt: new Date(NOW.getTime() - 14 * 60 * 1000) }, where)).toBe(false);
    expect(matchesDelayedWhere({ ...base, createdAt: THRESHOLD }, where)).toBe(true);
    expect(matchesDelayedWhere({ ...base, createdAt: new Date(NOW.getTime() - 16 * 60 * 1000) }, where)).toBe(true);
  });

  it('includes an untouched NEW lead older than 15 minutes', async () => {
    const createdAt = new Date(NOW.getTime() - 27 * 60 * 1000);
    const row = {
      id: 'lead-1',
      firstName: 'Ahmed',
      lastName: 'Khan',
      createdAt,
      primaryPhone: '+971500000000',
      whatsappNumber: null,
      assignedToUser: { id: 'counsellor-1', email: 'mary@example.com', employee: { firstName: 'Mary', lastName: 'Joseph' } },
    };
    prisma.lead.count.mockResolvedValue(1);
    prisma.lead.findMany.mockResolvedValue([row]);

    const result = await service.getDelayedLeads('head-1', true, NOW);
    const where = whereFromCall();
    expect(matchesDelayedWhere({
      status: LeadStatus.NEW,
      isArchived: false,
      createdAt,
      assignedToUserId: 'counsellor-1',
      history: [{ newStatus: LeadStatus.NEW }],
    }, where)).toBe(true);
    expect(result.delayedCount).toBe(1);
    expect(result.delayedLeads).toEqual([row]);
    expect(overdueLabel(createdAt, NOW)).toBe('12 min overdue');
    expect(assigneeLabel(row.assignedToUser)).toBe('Mary Joseph');
  });

  it('excludes NEW → CONTACTED and NEW → CONTACTED → NEW', async () => {
    await service.getDelayedLeads('head-1', true, NOW);
    const where = whereFromCall();
    const createdAt = new Date(NOW.getTime() - 40 * 60 * 1000);
    const contacted = {
      status: LeadStatus.CONTACTED,
      isArchived: false,
      createdAt,
      assignedToUserId: 'counsellor-1',
      history: [{ newStatus: LeadStatus.NEW }, { newStatus: LeadStatus.CONTACTED }],
    };
    const returnedToNew = {
      ...contacted,
      status: LeadStatus.NEW,
      history: [
        { newStatus: LeadStatus.NEW },
        { newStatus: LeadStatus.CONTACTED },
        { newStatus: LeadStatus.NEW },
      ],
    };
    expect(matchesDelayedWhere(contacted, where)).toBe(false);
    expect(matchesDelayedWhere(returnedToNew, where)).toBe(false);
  });

  it('returns the current assignee after reassignment and null when unassigned', async () => {
    const current = { id: 'counsellor-2', email: 'john@example.com', employee: { firstName: 'John', lastName: 'Diaz' } };
    prisma.lead.count.mockResolvedValue(2);
    prisma.lead.findMany.mockResolvedValue([
      { id: 'lead-2', firstName: 'Sara', lastName: 'Ahmed', createdAt: THRESHOLD, primaryPhone: '0501111111', whatsappNumber: '971501111111', assignedToUser: current },
      { id: 'lead-3', firstName: 'Rahul', lastName: null, createdAt: THRESHOLD, primaryPhone: '0502222222', whatsappNumber: null, assignedToUser: null },
    ]);

    const result = await service.getDelayedLeads('head-1', true, NOW);
    expect(result.delayedLeads[0].assignedToUser).toEqual(current);
    expect(assigneeLabel(result.delayedLeads[0].assignedToUser)).toBe('John Diaz');
    expect(result.delayedLeads[1].assignedToUser).toBeNull();
    expect(assigneeLabel(result.delayedLeads[1].assignedToUser)).toBe('Unassigned');
    expect(prisma.lead.findMany.mock.calls[0][0].select.assignedToUser).toBeDefined();
    expect(overdueLabel(THRESHOLD, NOW)).toBe('0 min overdue');
  });

  it('excludes archived leads', async () => {
    await service.getDelayedLeads('head-1', true, NOW);
    const where = whereFromCall();
    expect(matchesDelayedWhere({
      status: LeadStatus.NEW,
      isArchived: true,
      createdAt: new Date(NOW.getTime() - 60 * 60 * 1000),
      assignedToUserId: null,
      history: [{ newStatus: LeadStatus.NEW }],
    }, where)).toBe(false);
  });

  it('limits a counsellor to currently assigned leads and lets read-all see every eligible lead', async () => {
    await service.getDelayedLeads('counsellor-1', false, NOW);
    const counsellorWhere = whereFromCall();
    expect(counsellorWhere.assignedToUserId).toBe('counsellor-1');

    const createdAt = new Date(NOW.getTime() - 30 * 60 * 1000);
    const mine = {
      status: LeadStatus.NEW,
      isArchived: false,
      createdAt,
      assignedToUserId: 'counsellor-1',
      history: [{ newStatus: LeadStatus.NEW }],
    };
    const theirs = { ...mine, assignedToUserId: 'counsellor-2' };
    expect(matchesDelayedWhere(mine, counsellorWhere)).toBe(true);
    expect(matchesDelayedWhere(theirs, counsellorWhere)).toBe(false);

    prisma.lead.count.mockClear();
    prisma.lead.findMany.mockClear();
    await service.getDelayedLeads('head-1', true, NOW);
    const headWhere = prisma.lead.count.mock.calls[0][0].where;
    expect(headWhere.assignedToUserId).toBeUndefined();
    expect(matchesDelayedWhere(mine, headWhere)).toBe(true);
    expect(matchesDelayedWhere(theirs, headWhere)).toBe(true);
  });

  it('uses one predicate for the count and the list', async () => {
    prisma.lead.count.mockResolvedValue(2);
    prisma.lead.findMany.mockResolvedValue([{ id: 'a' }, { id: 'b' }]);
    const result = await service.getDelayedLeads('head-1', true, NOW);
    whereFromCall();
    expect(result.delayedCount).toBe(result.delayedLeads.length);
  });
});
