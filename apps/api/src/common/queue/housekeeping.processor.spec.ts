import { Job } from 'bullmq';

import { HousekeepingProcessor } from './housekeeping.processor';
import { JOBS } from './queue.constants';

describe('HousekeepingProcessor', () => {
  it.each([
    [JOBS.TOKEN_CLEANUP, 'token'],
    [JOBS.ROUND_ROBIN_DAILY_RESET, 'roundRobin'],
    [JOBS.ROUND_ROBIN_HISTORY_CLEANUP, 'roundRobin'],
    [JOBS.ATTENDANCE_AUTO_CHECKOUT, 'attendance'],
  ])('routes %s to exactly one handler', async (name, expected) => {
    const handlers = {
      token: { process: jest.fn() },
      roundRobin: { process: jest.fn() },
      attendance: { process: jest.fn() },
    };
    const processor = new HousekeepingProcessor(
      handlers.token as any,
      handlers.roundRobin as any,
      handlers.attendance as any,
    );
    const job = { id: 'job-1', name, data: {}, attemptsMade: 0 } as unknown as Job;

    await processor.process(job);

    expect(handlers[expected as keyof typeof handlers].process).toHaveBeenCalledWith(job);
    expect(
      Object.values(handlers).reduce(
        (total, handler) => total + handler.process.mock.calls.length,
        0,
      ),
    ).toBe(1);
  });
});
