import { assertDisposableDatabase } from '../src/common/prisma/disposable-database.guard';

/**
 * Runs once before any e2e suite. The e2e suites delete and truncate data, so the whole run is refused
 * unless the database is demonstrably disposable and local. Connection settings must be exported for the
 * run (DATABASE_URL, and REDIS_HOST/REDIS_PORT if you do not use the defaults); .env files are not a source
 * of truth for destructive tests.
 */
export default function globalSetup(): void {
  const target = assertDisposableDatabase(process.env.DATABASE_URL);

  const redisHost = (process.env.REDIS_HOST ?? 'localhost').toLowerCase();
  if (!['localhost', '127.0.0.1', '::1'].includes(redisHost)) {
    throw new Error(`Refusing to run e2e tests: REDIS_HOST "${redisHost}" is not this machine.`);
  }

  // eslint-disable-next-line no-console
  console.log(`[e2e] disposable database check passed: ${target.host}:${target.port}/${target.database}`);
}
