import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * The schedule rules live in two places because the API and the page cannot share a file at build time. The API copy is
 * the authority; this fails the moment the page copy drifts from it, so the page can never accept what the API refuses.
 */
const normalise = (text: string) => text.replace(/\r\n/g, '\n');

describe('subject schedule rules', () => {
  it('the page copy is identical to the API copy', () => {
    const api = normalise(readFileSync(join(__dirname, '../../../../../api/src/modules/mentoring/subject-schedule.ts'), 'utf8'));
    const web = normalise(readFileSync(join(__dirname, 'subject-schedule.ts'), 'utf8'));
    expect(web).toBe(api);
  });

  it('the page copy of the rules test is identical to the API copy, so both run the same cases', () => {
    const api = normalise(readFileSync(join(__dirname, '../../../../../api/src/modules/mentoring/subject-schedule.spec.ts'), 'utf8'));
    const web = normalise(readFileSync(join(__dirname, 'subject-schedule.spec.ts'), 'utf8'));
    expect(web).toBe(api);
  });
});
