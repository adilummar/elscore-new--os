import {
  assertConnectedToDisposableDatabase,
  assertDisposableDatabase,
  UnsafeDatabaseError,
} from './disposable-database.guard';
import { PrismaService } from './prisma.service';

const testEnv = (extra: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv => ({ NODE_ENV: 'test', ...extra });
const url = (database: string, host = 'localhost', port = '5432', query = '') =>
  `postgresql://user:SECRET-PW-123@${host}:${port}/${database}${query}`;

describe('assertDisposableDatabase', () => {
  it.each([
    ['elscore_os_test (the CI database)', url('elscore_os_test')],
    ['elscore_e2e_test on a non-default port', url('elscore_e2e_test', '127.0.0.1', '55432')],
    ['IPv6 loopback', url('elscore_e2e_run1', '[::1]')],
    ['schema parameter is harmless', url('elscore_os_test', 'localhost', '5432', '?schema=public&connection_limit=5')],
  ])('accepts %s', (_label, databaseUrl) => {
    expect(() => assertDisposableDatabase(databaseUrl, testEnv())).not.toThrow();
  });

  it.each([
    ['the staging database', url('elscore_os_staging')],
    ['the production database', url('elscore_os_prod')],
    ['a development database', url('elscore_os_dev')],
    ['a name that mixes test with staging', url('elscore_staging_test')],
    ['a name that mixes e2e with production', url('prod_e2e')],
    ['a name with no test marker', url('elscore')],
    ['a database whose word only contains test (contest)', url('contest_data')],
    ['a remote host', url('elscore_os_test', 'db.example.com')],
    ['a private-network host', url('elscore_os_test', '10.0.0.5')],
    ['a host parameter that redirects the connection', url('elscore_os_test', 'localhost', '5432', '?host=db.example.com')],
    ['a hostaddr parameter', url('elscore_os_test', 'localhost', '5432', '?hostaddr=203.0.113.9')],
    ['a port parameter', url('elscore_os_test', 'localhost', '5432', '?port=5433')],
    ['a multi-host list', 'postgresql://u:p@localhost,db.example.com/elscore_os_test'],
    ['an empty database name', 'postgresql://u:p@localhost:5432/'],
    ['a non-postgres URL', 'mysql://u:p@localhost/elscore_os_test'],
    ['garbage', 'not a url'],
  ])('rejects %s', (_label, databaseUrl) => {
    expect(() => assertDisposableDatabase(databaseUrl, testEnv())).toThrow(UnsafeDatabaseError);
  });

  it('rejects a missing DATABASE_URL (so a .env file can never be the source for a destructive run)', () => {
    expect(() => assertDisposableDatabase(undefined, testEnv())).toThrow(/not set/);
    expect(() => assertDisposableDatabase('   ', testEnv())).toThrow(/not set/);
  });

  it.each([
    ['NODE_ENV unset', {}],
    ['NODE_ENV=production', { NODE_ENV: 'production' }],
    ['NODE_ENV=development', { NODE_ENV: 'development' }],
  ])('rejects %s even for a test-looking database', (_label, env) => {
    expect(() => assertDisposableDatabase(url('elscore_os_test'), env)).toThrow(UnsafeDatabaseError);
  });

  it.each(['staging', 'production'])('rejects APP_ENV=%s', (appEnv) => {
    expect(() => assertDisposableDatabase(url('elscore_os_test'), testEnv({ APP_ENV: appEnv }))).toThrow(/APP_ENV/);
  });

  it('never leaks the password or the full connection string in an error', () => {
    for (const databaseUrl of [url('elscore_os_prod'), url('elscore_os_test', 'db.example.com'), url('elscore_os_test', 'localhost', '5432', '?host=x')]) {
      try {
        assertDisposableDatabase(databaseUrl, testEnv());
        throw new Error('expected a rejection');
      } catch (error) {
        const message = (error as Error).message;
        expect(message).not.toContain('SECRET-PW-123');
        expect(message).not.toContain('postgresql://');
      }
    }
  });

  it('returns the validated target', () => {
    expect(assertDisposableDatabase(url('elscore_e2e_test', 'localhost', '55432'), testEnv())).toEqual({
      host: 'localhost',
      port: 55432,
      database: 'elscore_e2e_test',
    });
  });
});

describe('assertConnectedToDisposableDatabase (run-time cross-check)', () => {
  const target = { host: 'localhost', port: 5432, database: 'elscore_e2e_test' };

  it('passes when the server reports the same database', async () => {
    const client = { $queryRaw: jest.fn().mockResolvedValue([{ db: 'elscore_e2e_test' }]) };
    await expect(assertConnectedToDisposableDatabase(client, target)).resolves.toBeUndefined();
  });

  it('refuses when the live connection is a different database than the URL says', async () => {
    const client = { $queryRaw: jest.fn().mockResolvedValue([{ db: 'elscore_os_staging' }]) };
    await expect(assertConnectedToDisposableDatabase(client, target)).rejects.toThrow(/elscore_os_staging/);
  });

  it('refuses when the server answers nothing', async () => {
    const client = { $queryRaw: jest.fn().mockResolvedValue([]) };
    await expect(assertConnectedToDisposableDatabase(client, target)).rejects.toBeInstanceOf(UnsafeDatabaseError);
  });
});

describe('PrismaService.cleanDatabase', () => {
  const originalEnv = { ...process.env };
  const build = (reportedDb: string) => {
    const executeRaw = jest.fn().mockResolvedValue(1);
    const queryRaw = jest.fn().mockResolvedValue([{ db: reportedDb }]);
    const service = Object.create(PrismaService.prototype) as PrismaService;
    Object.assign(service, { $executeRaw: executeRaw, $queryRaw: queryRaw });
    return { service, executeRaw };
  };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('truncates only when the URL and the live connection both name a disposable local database', async () => {
    process.env.NODE_ENV = 'test';
    process.env.DATABASE_URL = url('elscore_e2e_test');
    const { service, executeRaw } = build('elscore_e2e_test');

    await service.cleanDatabase();

    expect(executeRaw).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['the staging database name', url('elscore_os_staging'), 'elscore_os_staging'],
    ['the production database name', url('elscore_os_prod'), 'elscore_os_prod'],
    ['a remote host with a test-looking name', url('elscore_os_test', 'db.example.com'), 'elscore_os_test'],
  ])('never truncates %s', async (_label, databaseUrl, reportedDb) => {
    process.env.NODE_ENV = 'test';
    process.env.DATABASE_URL = databaseUrl;
    const { service, executeRaw } = build(reportedDb);

    await expect(service.cleanDatabase()).rejects.toBeInstanceOf(UnsafeDatabaseError);
    expect(executeRaw).not.toHaveBeenCalled();
  });

  it('never truncates when the connection reports a different database than DATABASE_URL (misdirected URL)', async () => {
    process.env.NODE_ENV = 'test';
    process.env.DATABASE_URL = url('elscore_e2e_test');
    const { service, executeRaw } = build('elscore_os_staging');

    await expect(service.cleanDatabase()).rejects.toBeInstanceOf(UnsafeDatabaseError);
    expect(executeRaw).not.toHaveBeenCalled();
  });

  it('keeps the original NODE_ENV rule', async () => {
    process.env.NODE_ENV = 'development';
    process.env.DATABASE_URL = url('elscore_e2e_test');
    const { service, executeRaw } = build('elscore_e2e_test');

    await expect(service.cleanDatabase()).rejects.toThrow('only permitted in test environments');
    expect(executeRaw).not.toHaveBeenCalled();
  });
});
