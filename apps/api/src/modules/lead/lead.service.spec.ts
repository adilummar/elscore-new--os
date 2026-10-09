import { LeadService } from './lead.service';
import { LeadSource } from '@prisma/client';

describe('LeadService', () => {
  const prisma = {
    $queryRaw: jest.fn().mockResolvedValue([]),
    $transaction: jest.fn().mockImplementation(cb => cb(prisma)),
    lead: {
      create: jest.fn().mockResolvedValue({ id: 'mock-lead' }),
      findUnique: jest.fn(),
      findMany: jest.fn(),
    },
    student: { create: jest.fn() },
    requirement: { create: jest.fn() },
    marketingAttribution: { create: jest.fn() },
    leadStatusHistory: { create: jest.fn() },
    leadAssignmentHistory: { create: jest.fn() },
  };
  const audit = { recordInTx: jest.fn() };
  const idGen = { nextIdInTx: jest.fn().mockResolvedValue('ID-123') };
  const roundRobin = { getNextAssignee: jest.fn().mockResolvedValue({}) };

  const service = new LeadService(prisma as any, audit as any, idGen as any, roundRobin as any);

  it('excludes continueAnyway from the lead create payload', async () => {
    await service.create({
      firstName: 'Test',
      primaryPhone: '1234567890',
      source: LeadSource.DIRECT,
      continueAnyway: true,
      students: []
    }, 'user-id', true);

    expect(prisma.lead.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        firstName: 'Test',
        primaryPhone: '1234567890',
        source: LeadSource.DIRECT,
      })
    });
    
    // Explicitly verify continueAnyway is not in the argument
    const callData = prisma.lead.create.mock.calls[0][0].data;
    expect(callData).not.toHaveProperty('continueAnyway');
  });
});
