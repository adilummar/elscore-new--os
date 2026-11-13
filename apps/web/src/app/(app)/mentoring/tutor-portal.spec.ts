import { readFileSync } from 'fs';
import { join } from 'path';

import { fetchApi } from '@/lib/api/client';

import { getMyCalendarAction } from './schedule-actions';

jest.mock('@/lib/api/client', () => ({ fetchApi: jest.fn() }));

describe('the tutor portal request', () => {
  const mocked = fetchApi as jest.Mock;
  beforeEach(() => mocked.mockReset());

  it('goes to the tutor portal route with only dates, and returns the API message on a refusal', async () => {
    mocked.mockResolvedValue({ days: [] });
    await expect(getMyCalendarAction('2026-11-09', '2026-11-15')).resolves.toEqual({ ok: true, data: { days: [] } });
    expect(mocked).toHaveBeenCalledWith('/tutor-portal/calendar?from=2026-11-09&to=2026-11-15');
    mocked.mockRejectedValue(Object.assign(new Error('You do not have a tutor profile.'), { status: 404 }));
    await expect(getMyCalendarAction('2026-11-09', '2026-11-09')).resolves.toEqual({ ok: false, message: 'You do not have a tutor profile.' });
  });

  it('refuses a date that could change the route, without calling the API', async () => {
    for (const [from, to] of [['2026-11-09&tutor=x', '2026-11-09'], ['2026-11-09', 'soon'], ['../x', '2026-11-09']]) {
      await expect(getMyCalendarAction(from, to)).resolves.toMatchObject({ ok: false });
    }
    expect(mocked).not.toHaveBeenCalled();
  });

  it('has no way to name a tutor: no id in the action, the client or the page', () => {
    // The repository stores LF; a Windows checkout with autocrlf has CRLF. Compare the text, not the checkout's line endings.
    const read = (p: string) => readFileSync(join(__dirname, p), 'utf8').replace(/\r\n/g, '\n');
    const action = read('schedule-actions.ts').match(/export async function getMyCalendarAction[\s\S]*?\n}\n/)?.[0] ?? '';
    expect(action).toContain('getMyCalendarAction(from: string, to: string)');
    expect(action).not.toMatch(/tutorProfileId|tutorId/);
    const page = read('../tutor-portal/page.tsx');
    expect(page).not.toMatch(/useParams|tutorProfileId|params\./);
    expect(page).toContain('getMyCalendar(from, to)');
  });
});
