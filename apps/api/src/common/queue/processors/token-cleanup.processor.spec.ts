import { Job } from 'bullmq';

import { TokenCleanupProcessor } from './token-cleanup.processor';

// ─── Mock PrismaService ───────────────────────────────────────────────────────

const mockPrisma = {
  refreshToken: {
    deleteMany: jest.fn(),
  },
};

function makeProcessor(): TokenCleanupProcessor {
  return new TokenCleanupProcessor(mockPrisma as any);
}

function makeJob(data: Partial<{ idempotencyKey: string; revokedOlderThanDays: number }> = {}): Job {
  return {
    id: 'test-job-1',
    name: 'cleanup-refresh-tokens',
    attemptsMade: 0,
    data: {
      idempotencyKey: 'test-run',
      ...data,
    },
  } as unknown as Job;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('TokenCleanupProcessor', () => {
  let processor: TokenCleanupProcessor;

  beforeEach(() => {
    jest.clearAllMocks();
    processor = makeProcessor();
    mockPrisma.refreshToken.deleteMany.mockResolvedValue({ count: 0 });
  });

  /**
   * R-5 Test 1: Deletes expired tokens
   */
  it('deletes expired refresh tokens', async () => {
    mockPrisma.refreshToken.deleteMany
      .mockResolvedValueOnce({ count: 5 })  // expired
      .mockResolvedValueOnce({ count: 0 });  // old-revoked

    await processor.process(makeJob());

    // First call: delete expired tokens (expiresAt < now)
    const firstCall = mockPrisma.refreshToken.deleteMany.mock.calls[0][0];
    expect(firstCall.where.expiresAt.lt).toBeInstanceOf(Date);
    expect(firstCall.where).not.toHaveProperty('revokedAt');
  });

  /**
   * R-5 Test 2: Deletes old-revoked tokens
   */
  it('deletes old-revoked non-expired tokens', async () => {
    mockPrisma.refreshToken.deleteMany
      .mockResolvedValueOnce({ count: 0 })   // expired
      .mockResolvedValueOnce({ count: 3 });  // old-revoked

    await processor.process(makeJob({ revokedOlderThanDays: 30 }));

    const secondCall = mockPrisma.refreshToken.deleteMany.mock.calls[1][0];
    expect(secondCall.where.revokedAt.lt).toBeInstanceOf(Date);
    expect(secondCall.where.revokedAt.not).toBeNull();
  });

  /**
   * R-5 Test 3: Idempotent — running twice produces no error
   */
  it('is idempotent — second run succeeds even when nothing to delete', async () => {
    mockPrisma.refreshToken.deleteMany.mockResolvedValue({ count: 0 });

    await processor.process(makeJob());
    await processor.process(makeJob()); // second run — no rows left

    expect(mockPrisma.refreshToken.deleteMany).toHaveBeenCalledTimes(4); // 2×2 calls
  });

  /**
   * R-5 Test 4: Both delete operations run even if expired count is 0
   */
  it('runs both delete operations regardless of expired count', async () => {
    mockPrisma.refreshToken.deleteMany.mockResolvedValue({ count: 0 });

    await processor.process(makeJob());

    expect(mockPrisma.refreshToken.deleteMany).toHaveBeenCalledTimes(2);
  });

  /**
   * R-5 Test 5: Uses custom revokedOlderThanDays
   */
  it('respects custom revokedOlderThanDays cutoff', async () => {
    mockPrisma.refreshToken.deleteMany.mockResolvedValue({ count: 0 });

    const job = makeJob({ revokedOlderThanDays: 7 });
    await processor.process(job);

    const secondCall = mockPrisma.refreshToken.deleteMany.mock.calls[1][0];
    const cutoff: Date = secondCall.where.revokedAt.lt;

    // The cutoff should be approximately 7 days ago
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const diffMs = Math.abs(cutoff.getTime() - sevenDaysAgo.getTime());
    expect(diffMs).toBeLessThan(5000); // within 5 seconds
  });
});
