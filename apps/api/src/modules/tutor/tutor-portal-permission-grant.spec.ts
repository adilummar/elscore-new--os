import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * The tutor portal grant (apps/api/scripts/tutor-portal-permission-grant.sql) is reviewed and run by an operator, never
 * by the application. These tests keep it honest: it must match prisma/seed.ts, grant one permission to one role, never
 * delete or update anything, and default to a dry run.
 */
const read = (relative: string) => readFileSync(join(__dirname, relative), 'utf8').replace(/\r\n/g, '\n');
const seed = read('../../../prisma/seed.ts');
const sql = read('../../../scripts/tutor-portal-permission-grant.sql');
const statements = sql.replace(/--.*$/gm, '').replace(/ON COMMIT DROP/gi, '').replace(/'[^']*'/g, "''");

describe('the tutor portal permission grant', () => {
  it('grants exactly the one permission the seed gives the Tutor role, and to no one else', () => {
    const wanted = Array.from(sql.matchAll(/\('([A-Z_]+)', '([a-z._-]+)'\)/g)).map((m) => [m[1], m[2]]);
    expect(wanted).toEqual([['TUTOR', 'tutor.portal.read']]);
    const start = seed.indexOf('\n  TUTOR: [');
    const block = seed.slice(start, seed.indexOf('\n  ],', start));
    expect(block).toContain("'tutor.portal.read'");
    // No other role in the seed holds it.
    const everywhere = seed.match(/'tutor\.portal\.read'/g) ?? [];
    expect(everywhere).toHaveLength(2); // the catalog entry and the Tutor role
  });

  it('is in the permission catalog, not delegable', () => {
    expect(seed).toMatch(/code: 'tutor\.portal\.read',\n\s+resource: 'tutor\.portal',\n\s+action: 'read',[^}]*isDelegatable: false/);
  });

  it('only inserts, never deletes or updates, and writes nothing outside role links and the audit log', () => {
    expect(statements).not.toMatch(/\b(DELETE|UPDATE|TRUNCATE|DROP|ALTER)\b/i);
    const inserts = Array.from(statements.matchAll(/INSERT INTO (\w+)/gi)).map((m) => m[1]);
    expect(new Set(inserts)).toEqual(new Set(['_wanted', 'role_permissions', 'audit_events']));
    expect(statements).toMatch(/ON CONFLICT \(role_id, permission_id\) DO NOTHING/);
  });

  it('is a dry run until someone changes the last line, and checks it only grants this one thing', () => {
    expect(sql.trim().endsWith('ROLLBACK;')).toBe(true);
    expect(sql).not.toMatch(/^COMMIT;/m);
    expect(sql).toContain("This script may only grant tutor.portal.read to TUTOR");
    expect(sql).toContain('Other role permissions changed');
  });
});
