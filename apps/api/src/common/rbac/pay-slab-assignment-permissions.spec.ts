import * as fs from 'fs';
import * as path from 'path';

/**
 * Pay Slab assignment permissions: assigning a slab to a tutor and viewing the tutor Salary tab belong to
 * HR_MANAGER (HR Head) and HR_EXECUTIVE (HR Staff) only. The grant script must match the seed exactly.
 */
// Loaded at run time: prisma/ is outside the API tsconfig rootDir, so a static import would break `tsc`.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const seed = require(path.join(__dirname, '../../../prisma/seed')) as {
  PERMISSIONS: Array<{ code: string; resource: string; action: string }>;
  ROLE_PERMISSIONS: Record<string, string[]>;
};

const CODES = ['tutor_hr.pay_slab.assign', 'tutor_hr.tutor_salary.view'];
const HOLDERS = ['HR_MANAGER', 'HR_EXECUTIVE'];

describe('Pay Slab assignment permissions in the seed', () => {
  it('both codes exist in the catalog', () => {
    const catalog = new Map(seed.PERMISSIONS.map((p) => [p.code, p]));
    for (const c of CODES) expect(catalog.has(c)).toBe(true);
    expect(catalog.get('tutor_hr.pay_slab.assign')).toMatchObject({ resource: 'tutor_hr_pay_slab', action: 'assign' });
    expect(catalog.get('tutor_hr.tutor_salary.view')).toMatchObject({ resource: 'tutor_hr_tutor_salary', action: 'view' });
  });

  it('are granted to HR_MANAGER and HR_EXECUTIVE, and to no other role (not CEO, Co-Founder, Tutor Head, Coordinators)', () => {
    for (const [role, codes] of Object.entries(seed.ROLE_PERMISSIONS)) {
      const has = CODES.filter((c) => codes.includes(c));
      if (HOLDERS.includes(role)) expect(has).toEqual(CODES);
      else expect({ role, has }).toEqual({ role, has: [] });
    }
  });
});

describe('pay_slab_assignment_permission_grant.sql', () => {
  const sql = fs
    .readFileSync(
      path.join(__dirname, '../../../prisma/tutor-hr-grants/pay_slab_assignment_permission_grant.sql'),
      'utf8',
    )
    .replace(/\r\n/g, '\n');
  const start = sql.indexOf('INSERT INTO wanted_links VALUES');
  const links = [...sql.slice(start, sql.indexOf(';\n', start)).matchAll(/\('([^']+)', '([^']+)'\)/g)].map(
    (m) => `${m[1]}|${m[2]}`,
  );

  it('lists exactly the assignment links the seed gives, and nothing else', () => {
    const fromSeed = Object.entries(seed.ROLE_PERMISSIONS)
      .flatMap(([role, codes]) => codes.filter((c) => CODES.includes(c)).map((c) => `${role}|${c}`))
      .sort();
    expect([...links].sort()).toEqual(fromSeed);
    expect(links).toHaveLength(4);
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
