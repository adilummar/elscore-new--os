import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * The Mentoring-only permission grant (apps/api/scripts/mentoring-permission-grant.sql) is reviewed and run by
 * an operator, never by the application. These tests keep it honest: it must match prisma/seed.ts exactly, stay
 * inside the mentoring.* catalog, never delete or update anything, and default to a dry run.
 */
const read = (relative: string) => readFileSync(join(__dirname, relative), 'utf8').replace(/\r\n/g, '\n');
const seed = read('../../../prisma/seed.ts');
const sql = read('../../../scripts/mentoring-permission-grant.sql');
const sqlWithoutComments = sql.replace(/--.*$/gm, '');
// Scan SQL statements only: temp tables are created ON COMMIT DROP (not a DROP statement) and error messages
// are string literals that may contain words such as "grant".
const statementsOnly = sqlWithoutComments.replace(/ON COMMIT DROP/gi, '').replace(/'[^']*'/g, "''");

const codes = (text: string) => Array.from(text.matchAll(/'(mentoring\.[a-z.-]+)'/g)).map((m) => m[1]);
const catalog = Array.from(seed.matchAll(/code: '([a-z_.-]+)',\n\s+resource: '[^']+',\n\s+action: '([^']+)'/g)).map((m) => ({
  code: m[1],
  action: m[2],
}));
const mentoringCatalog = catalog.filter((p) => p.code.startsWith('mentoring.'));

function roleBlock(name: string): string[] {
  const start = seed.indexOf(`\n  ${name}: [`);
  expect(start).toBeGreaterThan(-1);
  return codes(seed.slice(start, seed.indexOf('\n  ],', start)));
}
const excluded = codes(
  seed.slice(seed.indexOf('const MENTORING_OPERATIONAL_CODES'), seed.indexOf(']);', seed.indexOf('const MENTORING_OPERATIONAL_CODES'))),
);

const expectedFromSeed: Record<string, string[]> = {
  MENTORING_HEAD: roleBlock('MENTORING_HEAD'),
  MENTOR: roleBlock('MENTOR'),
  DEMO_COUNSELOR: roleBlock('DEMO_COUNSELOR'),
  SALES_HEAD: roleBlock('SALES_HEAD'),
  CEO: mentoringCatalog.map((p) => p.code).filter((c) => !excluded.includes(c)),
  CO_FOUNDER: mentoringCatalog.filter((p) => ['read', 'read-all', 'view'].includes(p.action)).map((p) => p.code),
};

const wanted: Record<string, string[]> = {};
for (const match of sql.matchAll(/\('([A-Z_]+)',\s*'(mentoring\.[a-z.-]+)'\)/g)) {
  (wanted[match[1]] ??= []).push(match[2]);
}

describe('mentoring-permission-grant.sql (reviewed script, NOT run by the application)', () => {
  it('grants exactly what prisma/seed.ts defines for each role (no drift)', () => {
    expect(Object.keys(wanted).sort()).toEqual(Object.keys(expectedFromSeed).sort());
    for (const [role, expected] of Object.entries(expectedFromSeed)) {
      expect([...(wanted[role] ?? [])].sort()).toEqual([...expected].sort());
    }
  });

  it('only ever names mentoring.* permissions that exist in the catalog', () => {
    const catalogCodes = new Set(mentoringCatalog.map((p) => p.code));
    for (const permission of Object.values(wanted).flat()) expect(catalogCodes.has(permission)).toBe(true);
    const allQuotedCodes = Array.from(sqlWithoutComments.matchAll(/'([a-z_]+\.[a-z_.-]+)'/g)).map((m) => m[1]);
    expect(allQuotedCodes.filter((c) => !c.startsWith('mentoring.'))).toEqual([]);
  });

  it('is limited to INSERTs: no UPDATE, DELETE, TRUNCATE, DROP or ALTER anywhere', () => {
    expect(statementsOnly).not.toMatch(/\b(UPDATE|DELETE|TRUNCATE|DROP|ALTER|GRANT|REVOKE|CREATE\s+(?!TEMP))\b/i);
    const inserts = Array.from(sqlWithoutComments.matchAll(/INSERT\s+INTO\s+([a-z_]+)/gi)).map((m) => m[1].toLowerCase());
    expect(new Set(inserts)).toEqual(new Set(['_wanted', 'role_permissions', 'audit_events']));
  });

  it('is idempotent and keeps the grant itself to role_permissions', () => {
    expect(sqlWithoutComments).toMatch(/ON CONFLICT \(role_id, permission_id\) DO NOTHING/);
    expect(sqlWithoutComments).not.toMatch(/user_permissions|user_roles/i);
  });

  it('keeps the CEO read-only and the retry permission with the Sales Head only', () => {
    for (const permission of excluded) expect(wanted.CEO).not.toContain(permission);
    expect(excluded).toHaveLength(13);
    expect(excluded).toContain('mentoring.handover.retry');
    const holders = Object.entries(wanted)
      .filter(([, permissions]) => permissions.includes('mentoring.handover.retry'))
      .map(([role]) => role);
    expect(holders).toEqual(['SALES_HEAD']);
    expect(wanted.MENTORING_HEAD).not.toContain('mentoring.handover.retry');
  });

  it('contains the scope, CEO and baseline guards, and stops on a failed precondition', () => {
    expect(sql).toContain("permission_code NOT LIKE 'mentoring.%'");
    expect(sql).toContain('The CEO must not receive operational Mentoring permissions');
    expect(sql).toContain('mentoring.handover.retry is reserved for the Sales Head');
    expect(sql).toContain('Non-Mentoring role permissions changed');
    expect(sql).toContain('Run the approved seed first');
  });

  it('is a DRY RUN by default: one transaction that ends in ROLLBACK with no active COMMIT', () => {
    const statements = sqlWithoutComments.split(';').map((s) => s.trim().toUpperCase());
    expect(statements).toContain('BEGIN');
    expect(statements).toContain('ROLLBACK');
    expect(statements).not.toContain('COMMIT');
    expect(sqlWithoutComments.trim().endsWith('ROLLBACK;')).toBe(true);
  });

  it('is marked as not executed and explains how to run it', () => {
    expect(sql).toContain('*** NOT EXECUTED ***');
    expect(sql).toContain('DRY RUN');
  });
});
