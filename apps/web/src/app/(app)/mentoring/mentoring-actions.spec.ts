import { readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';

import { fetchApi } from '@/lib/api/client';

import { mentoringApiAction } from './actions';
import { PERMISSION_PHRASES, REASON_LABELS, EVENT_TYPE_LABELS, PRIORITY_LABELS, friendlyMentoringError, pretty } from './labels';

jest.mock('@/lib/api/client', () => ({ fetchApi: jest.fn() }));

const apiError = (message: string, status: number) => Object.assign(new Error(message), { status });
const mockedFetch = fetchApi as jest.Mock;

describe('mentoringApiAction (the cause of the red "Server Components" banner)', () => {
  beforeEach(() => mockedFetch.mockReset());

  it('returns the data on success', async () => {
    mockedFetch.mockResolvedValue({ ok: 1 });
    await expect(mentoringApiAction('/mentoring/students/a1')).resolves.toEqual({ ok: true, data: { ok: 1 } });
  });

  it('returns the 409 from stage verification as a result instead of throwing (digest 3510538622 on staging)', async () => {
    mockedFetch.mockRejectedValue(apiError('Mandatory checklist items are not resolved', 409));
    await expect(mentoringApiAction('/mentoring/students/a1/stages/1/verify', 'POST', {})).resolves.toEqual({
      ok: false,
      message: 'Mandatory checklist items are not resolved',
    });
  });

  it('returns the 403 for a missing permission as a result instead of throwing (digest 2824095486 on staging)', async () => {
    mockedFetch.mockRejectedValue(apiError('Access denied. Required permissions: mentoring.stage.verify', 403));
    const result = await mentoringApiAction('/mentoring/students/a1/stages/1/verify', 'POST', {});
    expect(result).toEqual({ ok: false, message: 'Access denied. Required permissions: mentoring.stage.verify' });
  });

  it('hides the detail of a server failure behind a generic message', async () => {
    mockedFetch.mockRejectedValue(apiError('connect ECONNREFUSED 10.0.0.5:5432', 500));
    const result = await mentoringApiAction('/mentoring/students/a1');
    expect(result.ok).toBe(false);
    expect(JSON.stringify(result)).not.toMatch(/ECONNREFUSED|10\.0\.0\.5/);
  });

  it('still rethrows an expired session so sign-in redirects keep working', async () => {
    mockedFetch.mockRejectedValue(apiError('UNAUTHORIZED', 401));
    await expect(mentoringApiAction('/mentoring/students/a1')).rejects.toThrow('UNAUTHORIZED');
  });

  it.each(['/users', '/mentoring/../users', '/mentoringx/../../auth'])('refuses the path %s without calling the API', async (path) => {
    const result = await mentoringApiAction(path);
    expect(result.ok).toBe(false);
    expect(mockedFetch).not.toHaveBeenCalled();
  });

  it('forwards method and body unchanged', async () => {
    mockedFetch.mockResolvedValue({});
    await mentoringApiAction('/mentoring/allocation/a1/assign', 'POST', { mentorUserId: 'm1' });
    expect(mockedFetch).toHaveBeenCalledWith('/mentoring/allocation/a1/assign', { method: 'POST', body: JSON.stringify({ mentorUserId: 'm1' }) });
  });
});

describe('mentoringApi (client wrapper)', () => {
  // The wrapper imports the real action module, so mock the action itself here.
  it('gives screens an Error carrying the real message, in plain language', async () => {
    jest.resetModules();
    jest.doMock('./actions', () => ({
      mentoringApiAction: jest.fn().mockResolvedValue({ ok: false, message: 'Access denied. Required permissions: mentoring.stage.verify' }),
    }));
    const { mentoringApi } = await import('./mentoring-client');
    await expect(mentoringApi('/mentoring/students/a1/stages/1/verify', 'POST', {})).rejects.toThrow('You do not have permission to verify stages.');
  });

  it('returns the data on success', async () => {
    jest.resetModules();
    jest.doMock('./actions', () => ({ mentoringApiAction: jest.fn().mockResolvedValue({ ok: true, data: [{ id: 1 }] }) }));
    const { mentoringApi } = await import('./mentoring-client');
    await expect(mentoringApi('/mentoring/tasks')).resolves.toEqual([{ id: 1 }]);
  });

  it('keeps the API wording for business errors such as an unresolved checklist', async () => {
    jest.resetModules();
    jest.doMock('./actions', () => ({ mentoringApiAction: jest.fn().mockResolvedValue({ ok: false, message: 'Mandatory checklist items are not resolved' }) }));
    const { mentoringApi } = await import('./mentoring-client');
    await expect(mentoringApi('/mentoring/x', 'POST')).rejects.toThrow('Mandatory checklist items are not resolved');
  });
});

describe('friendlyMentoringError', () => {
  it('rewrites permission codes in plain language', () => {
    expect(friendlyMentoringError('Access denied. Required permissions: mentoring.approval.final')).toBe('You do not have permission to give final activation approval.');
    expect(friendlyMentoringError('Access denied. Required permissions: mentoring.allocation.manage, mentoring.staff.manage')).toBe(
      'You do not have permission to allocate students or manage Mentors and Demo Counselors.',
    );
  });

  it('never shows a raw permission code, even for one it does not know', () => {
    const text = friendlyMentoringError('Access denied. Required permissions: mentoring.brand.new');
    expect(text).not.toContain('mentoring.');
    expect(text).toBe('You do not have permission to do this.');
  });

  it('leaves every other message exactly as the API wrote it', () => {
    expect(friendlyMentoringError('Mandatory checklist items are not resolved')).toBe('Mandatory checklist items are not resolved');
  });

  it('knows every permission the Mentoring routes require', () => {
    const catalog = Array.from(
      readFileSync(join(__dirname, '../../../../../api/prisma/seed.ts'), 'utf8').matchAll(/code: '(mentoring\.[a-z.-]+)'/g),
    ).map((m) => m[1]);
    expect(catalog.length).toBeGreaterThanOrEqual(18);
    for (const code of catalog) expect(PERMISSION_PHRASES[code]).toBeDefined();
  });
});

describe('plain-language labels', () => {
  it('maps the system reason codes and event types the backend writes', () => {
    const allocation = readFileSync(join(__dirname, '../../../../../api/src/modules/mentoring/mentoring-allocation.service.ts'), 'utf8');
    for (const code of ['MANUAL_MODE', 'NO_ELIGIBLE_MENTOR', 'LEAST_LOADED', 'SIBLING_AFFINITY']) {
      expect(allocation).toContain(`'${code}'`);
      expect(REASON_LABELS[code]).toBeDefined();
      expect(pretty(code)).toBe(REASON_LABELS[code]);
    }
    for (const type of ['ALLOCATION_QUEUED', 'MENTOR_ALLOCATED', 'STAGE_VERIFIED', 'WORKFLOW_RESUMED', 'TASK_SUBMITTED']) {
      expect(EVENT_TYPE_LABELS[type]).toBeDefined();
    }
    expect(PRIORITY_LABELS).toEqual({ LOW: 'Low', MEDIUM: 'Medium', HIGH: 'High', URGENT: 'Urgent' });
  });

  it('an unknown code still reads as words, never as an upper-case identifier', () => {
    expect(pretty('SOME_NEW_EVENT')).toBe('Some new event');
  });
});

describe('every Mentoring screen uses the result-returning wrapper', () => {
  const files = (dir: string): string[] =>
    readdirSync(dir).flatMap((name) => {
      const full = join(dir, name);
      return statSync(full).isDirectory() ? files(full) : /\.(ts|tsx)$/.test(name) && !name.endsWith('.spec.ts') ? [full] : [];
    });

  it('no screen imports the server action directly or throws API errors to the browser', () => {
    for (const file of files(__dirname)) {
      const code = readFileSync(file, 'utf8');
      if (file.endsWith('mentoring-client.ts') || file.endsWith('actions.ts')) continue;
      expect({ file, importsRawAction: /mentoringApiAction|from '\.\.?\/(\.\.\/)?actions'/.test(code) }).toEqual({ file, importsRawAction: false });
    }
  });

  it('the server action file only exports the result-returning action', () => {
    const code = readFileSync(join(__dirname, 'actions.ts'), 'utf8');
    expect(code).toContain('"use server"');
    expect(Array.from(code.matchAll(/export (?:async )?function (\w+)/g)).map((m) => m[1])).toEqual(['mentoringApiAction']);
  });
});
