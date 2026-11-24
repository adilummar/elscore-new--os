import * as fs from 'fs';
import * as path from 'path';

/**
 * Guards the manual script prisma/tutor-hr-grants/tutor_hr_permission_grant.sql against drift from seed.ts.
 * The script is the only way the Tutor HR permission links reach a populated database (the seed leaves
 * links unchanged there), so it must say exactly what the seed says.
 */
// Loaded at run time: prisma/ is outside the API tsconfig rootDir, so a static import would break `tsc`.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const seed = require(path.join(__dirname, '../../../prisma/seed')) as {
  PERMISSIONS: Array<{ code: string }>;
  ROLE_PERMISSIONS: Record<string, string[]>;
  ROLES: Array<{
    code: string;
    name: string;
    description?: string;
    isSystem: boolean;
    isProtected: boolean;
    isCustom: boolean;
  }>;
};
const { PERMISSIONS, ROLE_PERMISSIONS, ROLES } = seed;
const SQL_PATH = path.join(
  __dirname,
  '../../../prisma/tutor-hr-grants/tutor_hr_permission_grant.sql',
);
const sql = fs.readFileSync(SQL_PATH, 'utf8').replace(/\r\n/g, '\n');

/** The permission codes added by the Tutor HR release (absent from the catalog on staging's line 236f5fb). */
const RELEASE_CODES = [
  'demo.reschedule',
  'demo.cancel',
  'tutor_hiring.read-all',
  'tutor_hiring.reassign',
  'tutor_hiring.report',
  'tutor_coordination.read',
  'tutor_coordination.observe',
  'tutor_coordination.manage',
  'tutor_hr.profile.read',
  'tutor_hr.profile.manage',
  'tutor_hr.notes.manage',
  'tutor_hr.ready_for_assignment',
  'tutor_hr.tutors.read',
  'tutor_training.read',
  'tutor_training.schedule',
  'tutor_training.participants',
  'tutor_training.record',
  'tutor_training.override',
  'tutor_hiring.override',
  'tutor_hiring.settings',
];
const NEW_ROLES = ['TUTOR_HEAD', 'TUTOR_COORDINATOR'];

function section(name: string): string {
  const start = sql.indexOf(`INSERT INTO ${name} VALUES`);
  expect(start).toBeGreaterThan(-1);
  return sql.slice(start, sql.indexOf(';\n', start));
}

const links = [...section('wanted_links').matchAll(/\('([^']+)', '([^']+)'\)/g)].map(
  (m) => `${m[1]}|${m[2]}`,
);
const releaseCodesInSql = [...section('release_codes').matchAll(/\('([^']+)'\)/g)].map((m) => m[1]);

describe('tutor_hr_permission_grant.sql', () => {
  it('lists each link once', () => {
    expect(new Set(links).size).toBe(links.length);
    expect(links.length).toBe(80);
  });

  it('release code list equals the catalog codes added by the release', () => {
    expect([...releaseCodesInSql].sort()).toEqual([...RELEASE_CODES].sort());
    const catalog = new Set(PERMISSIONS.map((p) => p.code));
    for (const c of RELEASE_CODES) expect(catalog.has(c)).toBe(true);
  });

  it('every link is in the seed role mapping (inserts nothing the seed does not grant)', () => {
    for (const l of links) {
      const [role, code] = l.split('|');
      expect(ROLE_PERMISSIONS[role]).toBeDefined();
      expect(ROLE_PERMISSIONS[role]).toContain(code);
    }
  });

  it('contains every seed link for a release code, for every role', () => {
    const inSql = new Set(links);
    for (const [role, codes] of Object.entries(ROLE_PERMISSIONS)) {
      for (const code of codes) {
        if (RELEASE_CODES.includes(code)) expect(inSql.has(`${role}|${code}`)).toBe(true);
      }
    }
  });

  it('gives TUTOR_HEAD and TUTOR_COORDINATOR their complete seed mapping and nothing else new', () => {
    for (const role of NEW_ROLES) {
      const fromSql = links.filter((l) => l.startsWith(`${role}|`)).map((l) => l.split('|')[1]);
      expect([...fromSql].sort()).toEqual([...ROLE_PERMISSIONS[role]].sort());
    }
    for (const l of links) {
      const [role, code] = l.split('|');
      if (!NEW_ROLES.includes(role)) expect(RELEASE_CODES).toContain(code);
    }
  });

  it('creates the two new roles with the seed definitions', () => {
    for (const role of NEW_ROLES) {
      const def = ROLES.find((r) => r.code === role)!;
      expect(sql).toContain(
        `('${role}', '${def.name}', '${def.description!.replace(/'/g, "''")}', ${def.isSystem}, ${def.isProtected}, ${def.isCustom})`,
      );
    }
  });

  it('only inserts, never deletes or alters, and keeps COMMIT commented out', () => {
    const code = sql
      .split('\n')
      .filter((l) => !l.trim().startsWith('--'))
      .join('\n')
      .replace(/ON COMMIT DROP/g, ''); // temp tables only
    // Statement keywords only: permission codes such as 'tutor_lead.update' are data, not statements.
    expect(code).not.toMatch(/^[ \t]*(DELETE|UPDATE|TRUNCATE|DROP|ALTER)\s/im);
    expect(code).not.toMatch(/\bCOMMIT\b/i);
    expect(code).toMatch(/ON CONFLICT \(role_id, permission_id\) DO NOTHING/);
    expect(sql.trimEnd().split('\n').pop()).toBe('-- COMMIT;');
    expect(sql).not.toMatch(/^[^-\n]*SEED_RECONCILE_ROLE_PERMISSIONS/m);
  });
});
