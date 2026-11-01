import { ConflictException } from '@nestjs/common';

import { LeadService } from './lead.service';

function setup(oldStatus: string) {
  const tx = {
    lead: {
      findUniqueOrThrow: jest.fn().mockResolvedValue({ id: 'lead-1', status: oldStatus, assignedToUserId: 'u-1' }),
      update: jest.fn().mockImplementation(({ data }: any) => Promise.resolve({ id: 'lead-1', ...data })),
    },
    leadStatusHistory: { create: jest.fn().mockResolvedValue({}) },
    leadAssignmentHistory: { create: jest.fn() },
  };
  const prisma = {
    lead: { findUnique: jest.fn().mockResolvedValue({ assignedToUserId: 'u-1' }) },
    $transaction: jest.fn().mockImplementation((fn: (t: unknown) => unknown) => Promise.resolve(fn(tx))),
  };
  const audit = { recordInTx: jest.fn().mockResolvedValue(undefined) };
  const handover = {
    assertCanLeaveEnrolled: jest.fn().mockResolvedValue(undefined),
    ensureHandoverInTx: jest.fn().mockResolvedValue({ created: [] }),
  };
  const service = new LeadService(prisma as any, audit as any, {} as any, {} as any, handover as any);
  return { service, tx, handover };
}

const dto = (status: string) => ({ status, reason: 'test' }) as any;

describe('LeadService.updateStatus Mentoring handover', () => {
  it('hands over inside the transaction when the lead becomes ENROLLED', async () => {
    const { service, tx, handover } = setup('NEGOTIATION');

    await service.updateStatus('lead-1', dto('ENROLLED'), 'u-1', false);

    expect(handover.ensureHandoverInTx).toHaveBeenCalledWith(tx, 'lead-1', 'u-1');
    expect(handover.assertCanLeaveEnrolled).not.toHaveBeenCalled();
  });

  it('also hands over when a lead reaches PAID without a prior ENROLLED', async () => {
    const { service, handover } = setup('NEGOTIATION');

    await service.updateStatus('lead-1', dto('PAID'), 'u-1', false);

    expect(handover.ensureHandoverInTx).toHaveBeenCalledTimes(1);
  });

  it('repeating ENROLLED calls the idempotent handover again, not a second creation path', async () => {
    const { service, handover } = setup('ENROLLED');

    await service.updateStatus('lead-1', dto('ENROLLED'), 'u-1', false);

    expect(handover.assertCanLeaveEnrolled).toHaveBeenCalledWith(expect.anything(), 'lead-1', 'ENROLLED');
    expect(handover.ensureHandoverInTx).toHaveBeenCalledTimes(1);
  });

  it('does not hand over for other statuses', async () => {
    const { service, handover } = setup('NEW');

    await service.updateStatus('lead-1', dto('CONTACTED'), 'u-1', false);

    expect(handover.ensureHandoverInTx).not.toHaveBeenCalled();
  });

  it('rejects leaving ENROLLED while an activation is open and writes no status history', async () => {
    const { service, tx, handover } = setup('ENROLLED');
    handover.assertCanLeaveEnrolled.mockRejectedValue(new ConflictException('open activation'));

    await expect(service.updateStatus('lead-1', dto('LOST'), 'u-1', false)).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(tx.lead.update).not.toHaveBeenCalled();
    expect(tx.leadStatusHistory.create).not.toHaveBeenCalled();
  });

  it('propagates a handover failure so the status change rolls back', async () => {
    const { service, handover } = setup('NEGOTIATION');
    handover.ensureHandoverInTx.mockRejectedValue(new Error('transfer failed'));

    await expect(service.updateStatus('lead-1', dto('ENROLLED'), 'u-1', false)).rejects.toThrow('transfer failed');
  });
});
