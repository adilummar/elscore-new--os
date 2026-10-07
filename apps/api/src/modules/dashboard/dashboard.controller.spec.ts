import { Test, TestingModule } from '@nestjs/testing';

import { AuditContext } from '../../common/audit/audit.context';
import { RbacService } from '../../common/rbac/rbac.service';

import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';

describe('DashboardController delayed leads visibility', () => {
  let controller: DashboardController;
  let rbac: { getPermissionsForUser: jest.Mock };
  let dashboard: { getDelayedLeads: jest.Mock };

  beforeEach(async () => {
    rbac = { getPermissionsForUser: jest.fn() };
    dashboard = { getDelayedLeads: jest.fn().mockResolvedValue({ delayedCount: 0, delayedLeads: [] }) };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [DashboardController],
      providers: [
        { provide: DashboardService, useValue: dashboard },
        { provide: RbacService, useValue: rbac },
      ],
    }).compile();

    controller = module.get(DashboardController);
  });

  it('gives a Sales Counsellor only their own delayed leads', async () => {
    rbac.getPermissionsForUser.mockResolvedValue(new Set(['lead.read']));

    await controller.getDelayedLeads({ id: 'counsellor-1', email: 'c@example.com' });

    expect(rbac.getPermissionsForUser).toHaveBeenCalledWith('counsellor-1');
    expect(dashboard.getDelayedLeads).toHaveBeenCalledWith('counsellor-1', false);
  });

  it('gives lead.read-all the company delayed-lead scope', async () => {
    rbac.getPermissionsForUser.mockResolvedValue(new Set(['lead.read-all']));

    await controller.getDelayedLeads({ id: 'head-1', email: 'h@example.com' });

    expect(dashboard.getDelayedLeads).toHaveBeenCalledWith('head-1', true);
  });

  it('uses the already-swapped God View target as the current user', async () => {
    rbac.getPermissionsForUser.mockResolvedValue(new Set(['lead.read']));

    await controller.getDelayedLeads({ id: 'target-counsellor', email: 'target@example.com' });

    expect(rbac.getPermissionsForUser).toHaveBeenCalledWith('target-counsellor');
    expect(dashboard.getDelayedLeads).toHaveBeenCalledWith('target-counsellor', false);
  });
});

describe('CEO God View dashboard data scope', () => {
  const counsellor = { id: 'counsellor-a', email: 'a@example.com' };
  const salesHead = { id: 'sales-head', email: 'head@example.com' };
  const initiatingCeo = { id: 'ceo-1', email: 'ceo@example.com' };
  const targetCeo = { id: 'ceo-2', email: 'ceo2@example.com' };

  const rbac = {
    getPermissionsForUser: jest.fn((userId: string) => {
      if (userId === 'counsellor-a') return new Set(['lead.read']);
      if (userId === 'sales-head' || userId === 'ceo-1' || userId === 'ceo-2') {
        return new Set(['lead.read', 'lead.read-all']);
      }
      return new Set(['lead.read']);
    }),
  };

  const prisma = {
    lead: {
      count: jest.fn().mockResolvedValue(0),
      groupBy: jest.fn().mockResolvedValue([]),
      findMany: jest.fn().mockResolvedValue([]),
    },
  };

  const controller = new DashboardController(new DashboardService(prisma as any), rbac as any);

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.lead.count.mockResolvedValue(0);
    prisma.lead.groupBy.mockResolvedValue([]);
    prisma.lead.findMany.mockResolvedValue([]);
  });

  function asInitiatingCeo<T>(run: () => Promise<T>): Promise<T> {
    return AuditContext.run({ realActorId: 'ceo-1', isGodView: true }, run);
  }

  it('scopes KPI, pipeline, sources, and delayed leads to the counsellor target', async () => {
    await asInitiatingCeo(async () => {
      await controller.getKpi(counsellor);
      await controller.getPipeline(counsellor);
      await controller.getSources(counsellor);
      await controller.getDelayedLeads(counsellor);
    });

    expect(rbac.getPermissionsForUser).toHaveBeenCalledWith('counsellor-a');
    expect(rbac.getPermissionsForUser).not.toHaveBeenCalledWith('ceo-1');
    expect(prisma.lead.count.mock.calls[0][0].where.assignedToUserId).toBe('counsellor-a');
    expect(prisma.lead.groupBy.mock.calls[0][0].where.assignedToUserId).toBe('counsellor-a');
    expect(prisma.lead.groupBy.mock.calls[1][0].where.assignedToUserId).toBe('counsellor-a');
    expect(prisma.lead.findMany.mock.calls[0][0].where.assignedToUserId).toBe('counsellor-a');
  });

  it('keeps a normal CEO dashboard company-wide', async () => {
    await controller.getKpi(initiatingCeo);

    expect(rbac.getPermissionsForUser).toHaveBeenCalledWith('ceo-1');
    expect(prisma.lead.count.mock.calls[0][0].where.assignedToUserId).toBeUndefined();
  });

  it('keeps Sales Head dashboard scope while a CEO views that Sales Head', async () => {
    await asInitiatingCeo(() => controller.getDelayedLeads(salesHead));

    expect(rbac.getPermissionsForUser).toHaveBeenCalledWith('sales-head');
    expect(prisma.lead.findMany.mock.calls[0][0].where.assignedToUserId).toBeUndefined();
  });

  it('keeps the target CEO dashboard scope while another CEO is viewing them', async () => {
    await asInitiatingCeo(() => controller.getPipeline(targetCeo));

    expect(rbac.getPermissionsForUser).toHaveBeenCalledWith('ceo-2');
    expect(prisma.lead.groupBy.mock.calls[0][0].where.assignedToUserId).toBeUndefined();
  });
});
