import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * The complaint grant (apps/api/scripts/mentoring-complaint-permission-grant.sql) is reviewed and run by an operator, never by the
 * application. These tests keep it honest: it must match prisma/seed.ts, grant one permission to two roles, never delete or update
 * anything, and default to a dry run.
 */
const read = (relative: string) => readFileSync(join(__dirname, relative), 'utf8').replace(/\r\n/g, '\n');
const seed = read('../../../prisma/seed.ts');
const sql = read('../../../scripts/mentoring-complaint-permission-grant.sql');
const statements = sql.replace(/--.*$/gm, '').replace(/ON COMMIT DROP/gi, '').replace(/'[^']*'/g, "''");
const roleBlock = (name: string) => {
  const start = seed.indexOf(`\n  ${name}: [`);
  return seed.slice(start, seed.indexOf('\n  ],', start));
};

describe('the mentoring complaint permission grant', () => {
  it('grants exactly the one permission the seed gives the Mentor and the Mentoring Head, and to no one else', () => {
    const wanted = Array.from(sql.matchAll(/\('([A-Z_]+)', '([a-z._-]+)'\)/g)).map((m) => [m[1], m[2]]);
    expect(wanted.sort()).toEqual([['MENTOR', 'mentoring.complaint.handle'], ['MENTORING_HEAD', 'mentoring.complaint.handle']]);
    expect(roleBlock('MENTOR')).toContain("'mentoring.complaint.handle'");
    expect(roleBlock('MENTORING_HEAD')).toContain("'mentoring.complaint.handle'");
    for (const role of ['DEMO_COUNSELOR', 'SALES_HEAD', 'TUTOR']) expect(roleBlock(role)).not.toContain('mentoring.complaint.handle');
    // The catalog entry, the CEO exclusion list, the Head and the Mentor: four places, and the CEO is excluded.
    expect(seed.match(/'mentoring\.complaint\.handle'/g) ?? []).toHaveLength(4);
    expect(seed).toMatch(/code: 'mentoring\.complaint\.handle',\n\s+resource: 'mentoring\.complaint',\n\s+action: 'handle',[^}]*isDelegatable: false/);
  });

  it('only inserts, never deletes or updates, and writes nothing outside role links and the audit log', () => {
    expect(statements).not.toMatch(/\b(DELETE|UPDATE|TRUNCATE|DROP|ALTER)\b/i);
    const inserts = Array.from(statements.matchAll(/INSERT INTO (\w+)/gi)).map((m) => m[1]);
    expect(new Set(inserts)).toEqual(new Set(['_wanted', 'role_permissions', 'audit_events']));
    expect(statements).toMatch(/ON CONFLICT \(role_id, permission_id\) DO NOTHING/);
    expect(statements).not.toMatch(/user_permissions|user_roles/i);
  });

  it('is a dry run until someone changes the last line, and checks it only grants this one thing', () => {
    expect(sql.trim().endsWith('ROLLBACK;')).toBe(true);
    expect(sql).not.toMatch(/^COMMIT;/m);
    expect(sql).toContain('*** NOT EXECUTED ***');
    expect(sql).toContain('This script may only grant mentoring.complaint.handle to MENTOR and MENTORING_HEAD');
    expect(sql).toContain('Other role permissions changed');
    expect(sql).toContain('Another role holds mentoring.complaint.handle');
  });
});
