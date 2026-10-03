import { Test, TestingModule } from '@nestjs/testing';

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
