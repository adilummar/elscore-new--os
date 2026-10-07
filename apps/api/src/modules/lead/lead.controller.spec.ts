import { LeadController } from './lead.controller';

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
