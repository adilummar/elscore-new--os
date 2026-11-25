import * as fs from 'fs';
import * as path from 'path';

/**
 * Guards prisma/tutor-hr-grants/tutor_training_schedule_hr_grant.sql against drift from seed.ts. The script is the
 * only way the two HR links reach a populated database, so it must say exactly what the seed says.
 */
// Loaded at run time: prisma/ is outside the API tsconfig rootDir, so a static import would break `tsc`.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const seed = require(path.join(__dirname, '../../../prisma/seed')) as {
  PERMISSIONS: Array<{ code: string }>;
  ROLE_PERMISSIONS: Record<string, string[]>;
};
const { PERMISSIONS, ROLE_PERMISSIONS } = seed;
const GRANTS = path.join(__dirname, '../../../prisma/tutor-hr-grants');
const read = (file: string) => fs.readFileSync(path.join(GRANTS, file), 'utf8').replace(/\r\n/g, '\n');

const sql = read('tutor_training_schedule_hr_grant.sql');
const firstSql = read('tutor_hr_permission_grant.sql');
const CODE = 'tutor_training.schedule';

const linksOf = (text: string) => {
  const start = text.indexOf('INSERT INTO wanted_links VALUES');
  expect(start).toBeGreaterThan(-1);
  const block = text.slice(start, text.indexOf(';\n', start));
  return [...block.matchAll(/\('([^']+)', '([^']+)'\)/g)].map((m) => `${m[1]}|${m[2]}`);
};
const links = linksOf(sql);

describe('tutor_training_schedule_hr_grant.sql', () => {
  it('inserts exactly the two HR links for tutor_training.schedule', () => {
    expect([...links].sort()).toEqual([`HR_EXECUTIVE|${CODE}`, `HR_MANAGER|${CODE}`]);
  });

  it('every link is in the seed role mapping, and the code exists in the catalog', () => {
    expect(PERMISSIONS.some((p) => p.code === CODE)).toBe(true);
    for (const l of links) {
      const [role, code] = l.split('|');
      expect(ROLE_PERMISSIONS[role]).toContain(code);
    }
  });

  it('together with the first release script it covers every seed link for the code', () => {
    const covered = new Set([...linksOf(firstSql), ...links]);
    for (const [role, codes] of Object.entries(ROLE_PERMISSIONS)) {
      if (codes.includes(CODE)) expect(covered.has(`${role}|${CODE}`)).toBe(true);
    }
  });

  it('does not overlap the first script (each link is inserted by exactly one script)', () => {
    const first = new Set(linksOf(firstSql));
    for (const l of links) expect(first.has(l)).toBe(false);
  });

  it('only inserts, never deletes or alters, and keeps COMMIT commented out', () => {
    const code = sql
      .split('\n')
      .filter((l) => !l.trim().startsWith('--'))
      .join('\n')
      .replace(/ON COMMIT DROP/g, '');
    expect(code).not.toMatch(/^[ \t]*(DELETE|UPDATE|TRUNCATE|DROP|ALTER)\s/im);
    expect(code).not.toMatch(/\bCOMMIT\b/i);
    expect(code).toMatch(/ON CONFLICT \(role_id, permission_id\) DO NOTHING/);
    expect(sql.trimEnd().split('\n').pop()).toBe('-- COMMIT;');
    expect(sql).not.toMatch(/^[^-\n]*SEED_RECONCILE_ROLE_PERMISSIONS/m);
  });
});
