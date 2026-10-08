import { AuditContext } from '../../common/audit/audit.context';

import { FollowUpAggregateController } from './follow-up.controller';
import { FollowUpService } from './follow-up.service';

describe('CEO God View aggregate follow-up data scope', () => {
  const counsellor = { id: 'counsellor-a', email: 'a@example.com' };
  const salesHead = { id: 'sales-head', email: 'head@example.com' };
  const initiatingCeo = { id: 'ceo-1', email: 'ceo@example.com' };
  const targetCeo = { id: 'ceo-2', email: 'ceo2@example.com' };

  const rbac = {
    getPermissionsForUser: jest.fn((userId: string) => {
      if (userId === 'counsellor-a') return new Set(['followup.read']);
      if (userId === 'sales-head' || userId === 'ceo-1' || userId === 'ceo-2') {
        return new Set(['followup.read', 'followup.read-all']);
      }
      return new Set(['followup.read']);
    }),
  };

  const prisma = {
    followUp: {
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
    },
  };

  const controller = new FollowUpAggregateController(
    new FollowUpService(
      prisma as any,
      {} as any,
      {} as any,
      { get: jest.fn().mockReturnValue('Asia/Kolkata') } as any,
      {} as any,
    ),
    rbac as any,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.followUp.findMany.mockResolvedValue([]);
    prisma.followUp.count.mockResolvedValue(0);
  });

  function asInitiatingCeo<T>(run: () => Promise<T>): Promise<T> {
    return AuditContext.run({ realActorId: 'ceo-1', isGodView: true }, run);
  }

  it('does not grant followup.read-all while viewing a Sales Counsellor', async () => {
    await asInitiatingCeo(async () => {
      await controller.findAll({}, counsellor);
      await controller.getSummary(counsellor);
    });

    expect(rbac.getPermissionsForUser).toHaveBeenCalledWith('counsellor-a');
    expect(rbac.getPermissionsForUser).not.toHaveBeenCalledWith('ceo-1');
    expect(prisma.followUp.findMany.mock.calls[0][0].where.lead.assignedToUserId).toBe('counsellor-a');
    expect(prisma.followUp.count.mock.calls[0][0].where.lead.assignedToUserId).toBe('counsellor-a');
  });

  it('keeps a normal CEO aggregate company-wide', async () => {
    await controller.findAll({}, initiatingCeo);

    expect(rbac.getPermissionsForUser).toHaveBeenCalledWith('ceo-1');
    expect(prisma.followUp.findMany.mock.calls[0][0].where.lead).toBeUndefined();
  });

  it('keeps Sales Head follow-up scope while a CEO views that Sales Head', async () => {
    await asInitiatingCeo(() => controller.findAll({}, salesHead));

    expect(rbac.getPermissionsForUser).toHaveBeenCalledWith('sales-head');
    expect(prisma.followUp.findMany.mock.calls[0][0].where.lead).toBeUndefined();
  });

  it('keeps the target CEO follow-up scope while another CEO is viewing them', async () => {
    await asInitiatingCeo(() => controller.getSummary(targetCeo));

    expect(rbac.getPermissionsForUser).toHaveBeenCalledWith('ceo-2');
    expect(prisma.followUp.count.mock.calls[0][0].where.lead).toBeUndefined();
  });
});
