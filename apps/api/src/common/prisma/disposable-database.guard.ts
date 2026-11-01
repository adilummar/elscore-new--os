/**
 * Safety guard for destructive test operations (cleanDatabase(), the e2e suites).
 *
 * A database is treated as disposable only when ALL of these hold:
 *   - NODE_ENV is "test" and APP_ENV is not "production" or "staging"
 *   - the connection string targets this machine (localhost / 127.0.0.1 / ::1) and does not use query
 *     parameters that can redirect the connection elsewhere (host, hostaddr, port, service, ...)
 *   - the database name contains a "test" or "e2e" word and no word that names a real environment
 *     (prod, production, staging, stage, live, dev, development, uat, demo)
 *   - (at run time) the server reports the same database name that the URL names
 *
 * Messages never contain the password or the full connection string.
 */

export class UnsafeDatabaseError extends Error {
  constructor(reason: string) {
    super(
      `Refusing to run a destructive test operation: ${reason}. ` +
        'Use a disposable local database whose name contains "test" or "e2e" ' +
        '(for example elscore_e2e_test) and export DATABASE_URL explicitly for the run.',
    );
    this.name = 'UnsafeDatabaseError';
  }
}

export interface DisposableDatabaseTarget {
  host: string;
  port: number;
  database: string;
}

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);
const REQUIRED_WORDS = ['test', 'e2e'];
const FORBIDDEN_WORDS = ['prod', 'production', 'staging', 'stage', 'live', 'dev', 'development', 'uat', 'demo'];
const REDIRECTING_PARAMS = ['host', 'hostaddr', 'port', 'service', 'servicefile', 'dbname', 'user', 'passfile'];

export function assertDisposableDatabase(
  databaseUrl: string | undefined,
  env: NodeJS.ProcessEnv = process.env,
): DisposableDatabaseTarget {
  if (env.NODE_ENV !== 'test') {
    throw new UnsafeDatabaseError(`NODE_ENV is "${env.NODE_ENV ?? 'unset'}", not "test"`);
  }
  if (env.APP_ENV === 'production' || env.APP_ENV === 'staging') {
    throw new UnsafeDatabaseError(`APP_ENV is "${env.APP_ENV}"`);
  }
  if (!databaseUrl || !databaseUrl.trim()) {
    throw new UnsafeDatabaseError('DATABASE_URL is not set in the process environment');
  }

  let url: URL;
  try {
    url = new URL(databaseUrl);
  } catch {
    throw new UnsafeDatabaseError('DATABASE_URL is not a valid connection URL');
  }
  if (url.protocol !== 'postgresql:' && url.protocol !== 'postgres:') {
    throw new UnsafeDatabaseError('DATABASE_URL is not a PostgreSQL URL');
  }

  const host = url.hostname.toLowerCase();
  if (!LOCAL_HOSTS.has(host)) {
    throw new UnsafeDatabaseError(`database host "${host || '(empty)'}" is not this machine`);
  }

  for (const key of url.searchParams.keys()) {
    if (REDIRECTING_PARAMS.includes(key.toLowerCase())) {
      throw new UnsafeDatabaseError(`connection parameter "${key}" could redirect the connection`);
    }
  }

  const database = decodeURIComponent(url.pathname.replace(/^\//, ''));
  if (!database) throw new UnsafeDatabaseError('DATABASE_URL names no database');

  const words = database.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  const forbidden = words.find((w) => FORBIDDEN_WORDS.includes(w));
  if (forbidden) {
    throw new UnsafeDatabaseError(`database name "${database}" contains the word "${forbidden}"`);
  }
  if (!words.some((w) => REQUIRED_WORDS.includes(w))) {
    throw new UnsafeDatabaseError(`database name "${database}" does not contain the word "test" or "e2e"`);
  }

  return { host, port: url.port ? Number(url.port) : 5432, database };
}

/** Confirms the live connection really is the database the URL named. */
export async function assertConnectedToDisposableDatabase(
  client: { $queryRaw: (query: TemplateStringsArray) => Promise<unknown> },
  target: DisposableDatabaseTarget,
): Promise<void> {
  const rows = (await client.$queryRaw`SELECT current_database() AS db`) as Array<{ db: string }>;
  const actual = rows?.[0]?.db;
  if (actual !== target.database) {
    throw new UnsafeDatabaseError(
      `the server reports database "${actual ?? 'unknown'}" but DATABASE_URL names "${target.database}"`,
    );
  }
}
