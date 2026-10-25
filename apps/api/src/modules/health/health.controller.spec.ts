import { HTTP_CODE_METADATA } from '@nestjs/common/constants';

import { HealthController } from './health.controller';

/**
 * GET /health is counted as HTTP 200 by apps/api/test/rate-limit.e2e-spec.ts.
 * The controller therefore keeps @HttpCode(200). Dependency failure is reported
 * in the JSON body. Changing that status would need a separate compatibility pass.
 */
function makeController(options: {
  database?: 'up' | 'down';
  ping?: string | Error;
}) {
  const prisma = {
    $queryRaw: jest.fn().mockImplementation(() => {
      if (options.database === 'down') {
        return Promise.reject(new Error('db unavailable'));
      }
      return Promise.resolve([{ '?column?': 1 }]);
    }),
  };

  const queue = {
    get client() {
      if (options.ping instanceof Error) {
        return Promise.reject(options.ping);
      }
      return Promise.resolve({
        ping: jest.fn().mockResolvedValue(options.ping ?? 'PONG'),
      });
    },
  };

  return new HealthController(prisma as any, queue as any);
}

describe('HealthController', () => {
  it('keeps HTTP 200 so existing health consumers are unchanged', () => {
    expect(Reflect.getMetadata(HTTP_CODE_METADATA, HealthController.prototype.check)).toBe(200);
  });

  it('reports database and Redis as up together', async () => {
    await expect(makeController({}).check()).resolves.toEqual({
      status: 'ok',
      api: 'up',
      database: 'up',
      redis: 'up',
    });
  });

  it('reports a database failure without hiding Redis', async () => {
    await expect(makeController({ database: 'down' }).check()).resolves.toEqual({
      status: 'error',
      api: 'up',
      database: 'down',
      redis: 'up',
    });
  });

  it('reports Redis down when ping is not PONG', async () => {
    await expect(makeController({ ping: 'LOADING' }).check()).resolves.toEqual({
      status: 'error',
      api: 'up',
      database: 'up',
      redis: 'down',
    });
  });

  it('reports Redis down when the queue client cannot be reached', async () => {
    await expect(
      makeController({ ping: new Error('connection refused') }).check(),
    ).resolves.toEqual({
      status: 'error',
      api: 'up',
      database: 'up',
      redis: 'down',
    });
  });

  it('reports both dependencies down', async () => {
    await expect(
      makeController({ database: 'down', ping: new Error('connection refused') }).check(),
    ).resolves.toEqual({
      status: 'error',
      api: 'up',
      database: 'down',
      redis: 'down',
    });
  });
});
