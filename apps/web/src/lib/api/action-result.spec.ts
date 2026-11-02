import { readFileSync } from 'fs';
import { join } from 'path';

import { GENERIC_ACTION_ERROR, toActionResult } from './action-result';

const read = (relative: string) => readFileSync(join(__dirname, relative), 'utf8').replace(/\r\n/g, '\n');
const apiError = (message: string, status?: number) => Object.assign(new Error(message), status === undefined ? {} : { status });

describe('toActionResult', () => {
  it('returns the data on success', async () => {
    await expect(toActionResult(async () => ({ id: 'u1' }))).resolves.toEqual({ ok: true, data: { id: 'u1' } });
  });

  it('returns the API validation message instead of throwing (so production builds do not mask it)', async () => {
    const result = await toActionResult(async () => {
      throw apiError('firstName should not be empty, lastName should not be empty', 400);
    });
    expect(result).toEqual({ ok: false, message: 'firstName should not be empty, lastName should not be empty' });
  });

  it.each([403, 404, 409, 422])('passes a %i message through', async (status) => {
    const result = await toActionResult(async () => {
      throw apiError('Not allowed here', status);
    });
    expect(result).toEqual({ ok: false, message: 'Not allowed here' });
  });

  it('rethrows an expired session so the sign-in redirect still works', async () => {
    await expect(
      toActionResult(async () => {
        throw apiError('UNAUTHORIZED', 401);
      }),
    ).rejects.toThrow('UNAUTHORIZED');
  });

  it.each([
    ['a 500 with internal detail', apiError('connect ECONNREFUSED 10.0.0.5:5432', 500)],
    ['a network failure', new Error('fetch failed')],
    ['an error with no status', apiError('something internal')],
    ['a non-Error throw', 'boom'],
  ])('hides the detail of %s behind a generic message', async (_label, thrown) => {
    const result = await toActionResult(async () => {
      throw thrown;
    });
    expect(result).toEqual({ ok: false, message: GENERIC_ACTION_ERROR });
    expect(JSON.stringify(result)).not.toMatch(/ECONNREFUSED|10\.0\.0\.5|fetch failed|internal/);
  });
});

describe('wiring', () => {
  it('the API client records the HTTP status on the errors it throws', () => {
    expect(read('./client.ts')).toContain('.status = response.status');
  });

  it('createUserAction returns a result and does not let the API error escape', () => {
    const actions = read('../../app/(app)/settings/actions.ts');
    const start = actions.indexOf('export async function createUserAction');
    const body = actions.slice(start, actions.indexOf('\nexport async function', start + 10));
    expect(body).toContain('toActionResult(');
  });
});
