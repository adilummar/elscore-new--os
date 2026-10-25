import { InternalServerErrorException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { IdGeneratorService } from './id-generator.service';

// ─── Mock PrismaService ───────────────────────────────────────────────────────

const makeMockTx = (overrides?: Partial<typeof mockTxSequence>) => ({
  sequence: { ...mockTxSequence, ...overrides },
});

const mockTxSequence = {
  update: jest.fn(),
};

const mockPrisma = {
  $transaction: jest.fn(),
  sequence: { update: jest.fn() },
};

function makeService(): IdGeneratorService {
  return new IdGeneratorService(mockPrisma as any);
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('IdGeneratorService', () => {
  let service: IdGeneratorService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = makeService();
  });

  /**
   * R-4: nextId() must NOT exist on the service.
   */
  it('does NOT expose a public nextId() method', () => {
    expect((service as any).nextId).toBeUndefined();
  });

  it('generates a correctly formatted ID using nextIdInTx()', async () => {
    const mockTx = makeMockTx();
    mockTx.sequence.update.mockResolvedValueOnce({
      entityType: 'EMP',
      prefix: 'EMP',
      nextNumber: 2,
      padding: 4,
    });

    const id = await service.nextIdInTx(mockTx as any, 'EMP');
    expect(id).toBe('EMP-0001');
  });

  it('pads the number to the configured width', async () => {
    const mockTx = makeMockTx();
    mockTx.sequence.update.mockResolvedValueOnce({
      entityType: 'EMP',
      prefix: 'EMP',
      nextNumber: 11,
      padding: 4,
    });

    const id = await service.nextIdInTx(mockTx as any, 'EMP');
    expect(id).toBe('EMP-0010');
  });

  it('uses the prefix from the sequence record', async () => {
    const mockTx = makeMockTx();
    mockTx.sequence.update.mockResolvedValueOnce({
      entityType: 'STU',
      prefix: 'STU',
      nextNumber: 43,
      padding: 4,
    });

    const id = await service.nextIdInTx(mockTx as any, 'STU');
    expect(id).toBe('STU-0042');
  });

  it('calls tx.sequence.update with increment inside the provided transaction', async () => {
    const mockTx = makeMockTx();
    mockTx.sequence.update.mockResolvedValueOnce({
      entityType: 'LED',
      prefix: 'LED',
      nextNumber: 2,
      padding: 4,
    });

    await service.nextIdInTx(mockTx as any, 'LED');

    expect(mockTx.sequence.update).toHaveBeenCalledWith({
      where: { entityType: 'LED' },
      data: { nextNumber: { increment: 1 } },
    });
  });

  it('produces unique IDs on sequential calls', async () => {
    const mockTx = makeMockTx();
    mockTx.sequence.update
      .mockResolvedValueOnce({ prefix: 'EMP', nextNumber: 2, padding: 4 })
      .mockResolvedValueOnce({ prefix: 'EMP', nextNumber: 3, padding: 4 })
      .mockResolvedValueOnce({ prefix: 'EMP', nextNumber: 4, padding: 4 });

    const id1 = await service.nextIdInTx(mockTx as any, 'EMP');
    const id2 = await service.nextIdInTx(mockTx as any, 'EMP');
    const id3 = await service.nextIdInTx(mockTx as any, 'EMP');

    expect(new Set([id1, id2, id3]).size).toBe(3);
    expect([id1, id2, id3]).toEqual(['EMP-0001', 'EMP-0002', 'EMP-0003']);
  });

  it('uses a stored prefix verbatim, including a prefix that already contains a hyphen', async () => {
    const mockTx = makeMockTx();
    mockTx.sequence.update.mockResolvedValueOnce({
      entityType: 'STA',
      prefix: 'STA-',
      nextNumber: 2,
      padding: 7,
    });

    const id = await service.nextIdInTx(mockTx as any, 'STA');
    expect(id).toBe('STA--0000001');
  });

  it('fails with SEQUENCE_NOT_CONFIGURED when the sequence row is missing', async () => {
    const mockTx = makeMockTx();
    mockTx.sequence.update.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('Record to update not found.', {
        code: 'P2025',
        clientVersion: '5.19.1',
      }),
    );

    await expect(service.nextIdInTx(mockTx as any, 'ONB')).rejects.toBeInstanceOf(
      InternalServerErrorException,
    );

    try {
      await service.nextIdInTx(mockTx as any, 'ONB');
      throw new Error('expected the missing sequence to fail');
    } catch (error) {
      expect(error).toBeInstanceOf(InternalServerErrorException);
      const body = (error as InternalServerErrorException).getResponse();
      expect(body).toMatchObject({
        code: 'SEQUENCE_NOT_CONFIGURED',
        message: expect.stringContaining('ONB'),
      });
      expect(JSON.stringify(body)).not.toMatch(/localhost|postgres:|password|secret/i);
      expect(JSON.stringify(body)).not.toContain('Record to update not found');
    }
  });

  it('rethrows errors that are not a missing sequence row', async () => {
    const mockTx = makeMockTx();
    const failure = new Error('connection reset');
    mockTx.sequence.update.mockRejectedValueOnce(failure);

    await expect(service.nextIdInTx(mockTx as any, 'EMP')).rejects.toBe(failure);
  });
});
