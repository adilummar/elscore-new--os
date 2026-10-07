import { ForbiddenException } from '@nestjs/common';

import { AuditContext } from '../../common/audit/audit.context';

import { LeadController } from './lead.controller';
import { LeadService } from './lead.service';

describe('LeadController visibility scope', () => {
  const leadService = {
    findAll: jest.fn().mockResolvedValue({ data: [], pagination: {} }),
    findOne: jest.fn(),
    getTimeline: jest.fn(),
    setArchive: jest.fn(),
    reopen: jest.fn(),
  };
  const rbac = { getPermissionsForUser: jest.fn() };
  const controller = new LeadController(leadService as any, rbac as any);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('asks the service for a counsellor’s own leads without read-all', async () => {
    rbac.getPermissionsForUser.mockResolvedValue(new Set(['lead.read', 'lead.update']));

    await controller.findAll({ search: 'Bilal' }, { id: 'counsellor-a', email: 'a@example.com' });
    await controller.findOne('lead-b', { id: 'counsellor-a', email: 'a@example.com' });
    await controller.getTimeline('lead-b', { id: 'counsellor-a', email: 'a@example.com' });

    expect(leadService.findAll).toHaveBeenCalledWith({ search: 'Bilal' }, 'counsellor-a', false);
    expect(leadService.findOne).toHaveBeenCalledWith('lead-b', 'counsellor-a', false);
    expect(leadService.getTimeline).toHaveBeenCalledWith('lead-b', 'counsellor-a', false);
  });

  it('preserves Sales Head and CEO read-all scope', async () => {
    rbac.getPermissionsForUser.mockResolvedValue(new Set(['lead.read', 'lead.read-all']));

    await controller.findAll({}, { id: 'sales-head', email: 'head@example.com' });
    await controller.archive('lead-b', { id: 'sales-head', email: 'head@example.com' });
    await controller.reopen('lead-a', { id: 'ceo', email: 'ceo@example.com' });

    expect(leadService.findAll).toHaveBeenCalledWith({}, 'sales-head', true);
    expect(leadService.setArchive).toHaveBeenCalledWith('lead-b', true, 'sales-head', true);
    expect(leadService.reopen).toHaveBeenCalledWith('lead-a', 'ceo', true);
  });

  it('still applies ownership when a counsellor can archive', async () => {
    rbac.getPermissionsForUser.mockResolvedValue(new Set(['lead.archive', 'lead.reopen']));

    await controller.archive('lead-b', { id: 'counsellor-a', email: 'a@example.com' });
    await controller.reopen('lead-a', { id: 'counsellor-b', email: 'b@example.com' });

    expect(leadService.setArchive).toHaveBeenCalledWith('lead-b', true, 'counsellor-a', false);
    expect(leadService.reopen).toHaveBeenCalledWith('lead-a', 'counsellor-b', false);
  });
});

describe('CEO God View lead data scope', () => {
  const counsellor = { id: 'counsellor-a', email: 'a@example.com' };
  const salesHead = { id: 'sales-head', email: 'head@example.com' };
  const initiatingCeo = { id: 'ceo-1', email: 'ceo@example.com' };
  const targetCeo = { id: 'ceo-2', email: 'ceo2@example.com' };
  const foreignLeadId = 'lead-b';

  const rbac = {
    getPermissionsForUser: jest.fn((userId: string) => {
      if (userId === 'counsellor-a') {
        return new Set([
          'lead.read',
          'lead.update',
          'lead.status.change',
          'lead.archive',
          'lead.reopen',
          'salesnote.create',
          'salesnote.update',
          'salesnote.delete',
        ]);
      }
      if (userId === 'sales-head' || userId === 'ceo-1' || userId === 'ceo-2') {
        return new Set(['lead.read', 'lead.read-all']);
      }
      return new Set(['lead.read']);
    }),
  };

  const prisma = {
    lead: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
    },
  };

  const controller = new LeadController(
    new LeadService(prisma as any, {} as any, {} as any, {} as any),
    rbac as any,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.lead.findMany.mockResolvedValue([]);
    prisma.lead.findUnique.mockResolvedValue({ assignedToUserId: 'counsellor-b' });
  });

  function asInitiatingCeo<T>(run: () => Promise<T>): Promise<T> {
    return AuditContext.run({ realActorId: 'ceo-1', isGodView: true }, run);
  }

  it('does not grant lead.read-all while viewing a Sales Counsellor', async () => {
    await asInitiatingCeo(() => controller.findAll({}, counsellor));

    expect(rbac.getPermissionsForUser).toHaveBeenCalledWith('counsellor-a');
    expect(rbac.getPermissionsForUser).not.toHaveBeenCalledWith('ceo-1');
    expect(prisma.lead.findMany.mock.calls[0][0].where.assignedToUserId).toBe('counsellor-a');
  });

  it('forbids direct access and mutations on another counsellor lead', async () => {
    await asInitiatingCeo(async () => {
      await expect(controller.findOne(foreignLeadId, counsellor)).rejects.toBeInstanceOf(ForbiddenException);
      await expect(controller.update(foreignLeadId, { firstName: 'Changed' } as any, counsellor)).rejects.toBeInstanceOf(ForbiddenException);
      await expect(controller.updateStatus(foreignLeadId, { status: 'CONTACTED' } as any, counsellor)).rejects.toBeInstanceOf(ForbiddenException);
      await expect(controller.archive(foreignLeadId, counsellor)).rejects.toBeInstanceOf(ForbiddenException);
      await expect(controller.unarchive(foreignLeadId, counsellor)).rejects.toBeInstanceOf(ForbiddenException);
      await expect(controller.reopen(foreignLeadId, counsellor)).rejects.toBeInstanceOf(ForbiddenException);
      await expect(controller.createNote(foreignLeadId, { content: 'note' } as any, counsellor)).rejects.toBeInstanceOf(ForbiddenException);
      await expect(controller.updateNote(foreignLeadId, 'note-1', { content: 'edited' } as any, counsellor)).rejects.toBeInstanceOf(ForbiddenException);
      await expect(controller.deleteNote(foreignLeadId, 'note-1', counsellor)).rejects.toBeInstanceOf(ForbiddenException);
      await expect(controller.getTimeline(foreignLeadId, counsellor)).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  it('keeps a normal CEO session company-wide', async () => {
    await controller.findAll({}, initiatingCeo);

    expect(rbac.getPermissionsForUser).toHaveBeenCalledWith('ceo-1');
    expect(prisma.lead.findMany.mock.calls[0][0].where.assignedToUserId).toBeUndefined();
  });

  it('keeps Sales Head scope while a CEO views that Sales Head', async () => {
    await asInitiatingCeo(() => controller.findAll({}, salesHead));

    expect(rbac.getPermissionsForUser).toHaveBeenCalledWith('sales-head');
    expect(prisma.lead.findMany.mock.calls[0][0].where.assignedToUserId).toBeUndefined();
  });

  it('keeps the target CEO scope while another CEO is viewing them', async () => {
    await asInitiatingCeo(() => controller.findAll({}, targetCeo));

    expect(rbac.getPermissionsForUser).toHaveBeenCalledWith('ceo-2');
    expect(prisma.lead.findMany.mock.calls[0][0].where.assignedToUserId).toBeUndefined();
  });
});
