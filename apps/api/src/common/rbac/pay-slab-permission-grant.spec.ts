import * as fs from 'fs';
import * as path from 'path';

/**
 * Guards prisma/tutor-hr-grants/pay_slab_permission_grant.sql against drift from seed.ts: the script is the only
 * way the Pay Slab links reach a database that already has users.
 */
// eslint-disable-next-line @typescript-eslint/no-require-imports
const seed = require(path.join(__dirname, '../../../prisma/seed')) as {
  ROLE_PERMISSIONS: Record<string, string[]>;
};
const sql = fs
  .readFileSync(
    path.join(__dirname, '../../../prisma/tutor-hr-grants/pay_slab_permission_grant.sql'),
    'utf8',
  )
  .replace(/\r\n/g, '\n');

// Only the first two Pay Slab codes; the assignment codes have their own script and spec.
const PAY_SLAB_GRANT_CODES = ['tutor_hr.pay_slab.read', 'tutor_hr.pay_slab.create'];

const section = sql.slice(
  sql.indexOf('INSERT INTO wanted_links VALUES'),
  sql.indexOf(';\n', sql.indexOf('INSERT INTO wanted_links VALUES')),
);
const links = [...section.matchAll(/\('([^']+)', '([^']+)'\)/g)].map((m) => `${m[1]}|${m[2]}`);

describe('pay_slab_permission_grant.sql', () => {
  it('lists exactly the Pay Slab links the seed gives, and nothing else', () => {
    const fromSeed = Object.entries(seed.ROLE_PERMISSIONS)
      .flatMap(([role, codes]) =>
        codes.filter((c) => PAY_SLAB_GRANT_CODES.includes(c)).map((c) => `${role}|${c}`),
      )
      .sort();
    expect([...links].sort()).toEqual(fromSeed);
    expect(links).toHaveLength(4);
    expect(new Set(links.map((l) => l.split('|')[0]))).toEqual(
      new Set(['HR_MANAGER', 'HR_EXECUTIVE']),
    );
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
  });
});
