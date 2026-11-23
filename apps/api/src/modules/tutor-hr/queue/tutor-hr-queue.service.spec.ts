import { ConfigService } from '@nestjs/config';

import { JOBS, QUEUES } from '../../../common/queue/queue.constants';
import configuration from '../../../common/config/configuration';
import { HiringEscalationService } from '../hiring/hiring-escalation.service';

import {
  BullMqClasses,
  OVERDUE_SCAN_SCHEDULER_KEY,
  resolveTutorHrQueueConfig,
  TutorHrQueueService,
} from './tutor-hr-queue.service';

const ENV_KEYS = ['TUTOR_HR_QUEUE_ENABLED', 'TUTOR_HR_QUEUE_NAME', 'TUTOR_HR_QUEUE_PREFIX', 'TUTOR_HR_OVERDUE_SCAN_CRON', 'APP_ENV', 'NODE_ENV'];

/** ConfigService stand-in backed by the real configuration factory. */
function configFrom(env: Record<string, string | undefined>): ConfigService {
  const saved = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
  for (const k of ENV_KEYS) delete process.env[k];
  Object.assign(process.env, env);
  const tree = configuration();
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
  const get = (path: string) => path.split('.').reduce<unknown>((o, key) => (o as Record<string, unknown> | undefined)?.[key], tree);
  return { get } as unknown as ConfigService;
}

function fakeBullMq() {
  const queues: Array<{ name: string; opts: any; upsertJobScheduler: jest.Mock; on: jest.Mock; close: jest.Mock }> = [];
  const workers: Array<{ name: string; processor: (job: any) => Promise<unknown>; opts: any; on: jest.Mock; close: jest.Mock }> = [];
  class FakeQueue {
    upsertJobScheduler = jest.fn().mockResolvedValue(undefined);
    on = jest.fn();
    close = jest.fn().mockResolvedValue(undefined);
    constructor(public name: string, public opts: any) { queues.push(this); }
  }
  class FakeWorker {
    on = jest.fn();
    close = jest.fn().mockResolvedValue(undefined);
    constructor(public name: string, public processor: (job: any) => Promise<unknown>, public opts: any) { workers.push(this); }
  }
  return { classes: { Queue: FakeQueue, Worker: FakeWorker } as unknown as BullMqClasses, queues, workers };
}

describe('Tutor HR queue configuration', () => {
  it('defaults to queue "tutor-hr" under the same prefix as the other queues (elscore-<APP_ENV>)', () => {
    const c = resolveTutorHrQueueConfig(configFrom({ APP_ENV: 'staging', NODE_ENV: 'production' }));
    expect(c).toEqual({ enabled: true, name: QUEUES.TUTOR_HR, prefix: 'elscore-staging', overdueScanCron: '*/5 * * * *' });
  });

  it('falls back to NODE_ENV for the prefix when APP_ENV is unset, like QueueModule', () => {
    expect(resolveTutorHrQueueConfig(configFrom({ NODE_ENV: 'production' })).prefix).toBe('elscore-production');
  });

  it('honours TUTOR_HR_QUEUE_NAME, TUTOR_HR_QUEUE_PREFIX, TUTOR_HR_OVERDUE_SCAN_CRON and TUTOR_HR_QUEUE_ENABLED', () => {
    const c = resolveTutorHrQueueConfig(configFrom({
      APP_ENV: 'staging', TUTOR_HR_QUEUE_NAME: 'tutor-hr-x', TUTOR_HR_QUEUE_PREFIX: 'elscore-tutor-staging',
      TUTOR_HR_OVERDUE_SCAN_CRON: '*/10 * * * *', TUTOR_HR_QUEUE_ENABLED: 'false',
    }));
    expect(c).toEqual({ enabled: false, name: 'tutor-hr-x', prefix: 'elscore-tutor-staging', overdueScanCron: '*/10 * * * *' });
  });

  it.each([['TUTOR_HR_QUEUE_NAME', 'bad:name'], ['TUTOR_HR_QUEUE_PREFIX', 'a:b'], ['TUTOR_HR_OVERDUE_SCAN_CRON', '5 minutes']])(
    'rejects an invalid %s',
    (key, value) => {
      expect(() => resolveTutorHrQueueConfig(configFrom({ APP_ENV: 'staging', [key]: value }))).toThrow(key);
    },
  );
});

describe('TutorHrQueueService', () => {
  const escalation = { runScan: jest.fn() } as unknown as jest.Mocked<HiringEscalationService>;

  beforeEach(() => jest.clearAllMocks());

  it('creates its own queue and worker (not housekeeping) and schedules the overdue scan', async () => {
    const fake = fakeBullMq();
    const svc = new TutorHrQueueService(configFrom({ APP_ENV: 'staging' }), escalation, fake.classes);
    await svc.onApplicationBootstrap();

    expect(fake.queues).toHaveLength(1);
    expect(fake.workers).toHaveLength(1);
    expect(fake.queues[0].name).toBe('tutor-hr');
    expect(fake.queues[0].name).not.toBe(QUEUES.HOUSEKEEPING);
    expect(fake.queues[0].opts.prefix).toBe('elscore-staging');
    expect(fake.workers[0].name).toBe('tutor-hr');
    expect(fake.workers[0].opts).toMatchObject({ prefix: 'elscore-staging', concurrency: 1 });
    expect(fake.workers[0].opts.connection).toMatchObject({ maxRetriesPerRequest: null });
    expect(fake.queues[0].upsertJobScheduler).toHaveBeenCalledWith(
      OVERDUE_SCAN_SCHEDULER_KEY,
      { pattern: '*/5 * * * *' },
      expect.objectContaining({ name: JOBS.TUTOR_EVALUATION_OVERDUE_SCAN, data: { idempotencyKey: OVERDUE_SCAN_SCHEDULER_KEY } }),
    );
  });

  it('starts nothing when disabled', async () => {
    const fake = fakeBullMq();
    const svc = new TutorHrQueueService(configFrom({ APP_ENV: 'staging', TUTOR_HR_QUEUE_ENABLED: 'false' }), escalation, fake.classes);
    await svc.onApplicationBootstrap();
    expect(fake.queues).toHaveLength(0);
    expect(fake.workers).toHaveLength(0);
  });

  it('runs the escalation scan for the scan job and rejects any other job name', async () => {
    const fake = fakeBullMq();
    const svc = new TutorHrQueueService(configFrom({ APP_ENV: 'staging' }), escalation, fake.classes);
    await svc.onApplicationBootstrap();
    escalation.runScan.mockResolvedValue({ scanned: 2 } as never);

    await expect(fake.workers[0].processor({ id: '1', name: JOBS.TUTOR_EVALUATION_OVERDUE_SCAN, attemptsMade: 0 })).resolves.toEqual({ scanned: 2 });
    expect(escalation.runScan).toHaveBeenCalledTimes(1);

    await expect(fake.workers[0].processor({ id: '2', name: JOBS.TOKEN_CLEANUP, attemptsMade: 0 })).rejects.toThrow('Unknown job');
    expect(escalation.runScan).toHaveBeenCalledTimes(1);
  });

  it('does not throw from bootstrap when Redis is unavailable', async () => {
    const fake = fakeBullMq();
    const Base = fake.classes.Queue as any;
    class FailingQueue extends Base {
      constructor(name: string, opts: unknown) {
        super(name, opts);
        this.upsertJobScheduler = jest.fn().mockRejectedValue(new Error('connect ECONNREFUSED 127.0.0.1:6379'));
      }
    }
    const svc = new TutorHrQueueService(configFrom({ APP_ENV: 'staging' }), escalation, { ...fake.classes, Queue: FailingQueue as never });
    await expect(svc.onApplicationBootstrap()).resolves.toBeUndefined();
  });

  it('closes the worker and the queue on shutdown', async () => {
    const fake = fakeBullMq();
    const svc = new TutorHrQueueService(configFrom({ APP_ENV: 'staging' }), escalation, fake.classes);
    await svc.onApplicationBootstrap();
    await svc.onModuleDestroy();
    expect(fake.workers[0].close).toHaveBeenCalled();
    expect(fake.queues[0].close).toHaveBeenCalled();
  });
});
