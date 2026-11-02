import { readFileSync } from 'fs';
import { join } from 'path';

import { DEPARTMENT_ROLE_CODES, filterRolesForDepartment } from './department-roles';

const read = (relative: string) => readFileSync(join(__dirname, relative), 'utf8').replace(/\r\n/g, '\n');
const seed = read('../../../../api/prisma/seed.ts');
const usersPage = read('../../app/(app)/settings/users/page.tsx');

const seededRoleCodes = Array.from(seed.matchAll(/\n  \{\n    code: '([A-Z_]+)',\n    name: /g)).map((m) => m[1]);
const seededRoleCodesCompact = Array.from(seed.matchAll(/\n  \{ code: '([A-Z_]+)', name: /g)).map((m) => m[1]);
const allSeededRoles = new Set([...seededRoleCodes, ...seededRoleCodesCompact]);
const seededDepartments = Array.from(seed.matchAll(/\{ code: '([A-Z_]+)', name: '[^']+' \}/g)).map((m) => m[1]);

// What the API's role list returns: every role, as {id, code, name}.
const apiRoles = Array.from(allSeededRoles).map((code) => ({ id: `id-${code}`, code, name: code }));
const optionsFor = (departmentCode?: string) => filterRolesForDepartment(apiRoles, departmentCode).map((r) => r.code).sort();

describe('Create User form: roles offered per department', () => {
  it('the Mentoring department offers exactly MENTORING_HEAD and MENTOR (it was empty before)', () => {
    expect(optionsFor('MENTORING')).toEqual(['MENTOR', 'MENTORING_HEAD']);
  });

  it('DEMO_COUNSELOR is never offered under Mentoring', () => {
    expect(DEPARTMENT_ROLE_CODES.MENTORING).not.toContain('DEMO_COUNSELOR');
    expect(optionsFor('MENTORING')).not.toContain('DEMO_COUNSELOR');
  });

  it('DEMO_COUNSELOR is offered with the other demo roles under ACADEMICS, and nowhere else', () => {
    expect(optionsFor('ACADEMICS')).toEqual(expect.arrayContaining(['DEMO_COUNSELOR', 'DEMO_COORDINATOR', 'DEMO_HEAD', 'DEMO_ADMIN']));
    const holders = Object.entries(DEPARTMENT_ROLE_CODES).filter(([, roles]) => roles.includes('DEMO_COUNSELOR')).map(([dept]) => dept);
    expect(holders).toEqual(['ACADEMICS']);
  });

  it('MENTORING_HEAD is offered only under Mentoring', () => {
    const holders = Object.entries(DEPARTMENT_ROLE_CODES).filter(([, roles]) => roles.includes('MENTORING_HEAD')).map(([dept]) => dept);
    expect(holders).toEqual(['MENTORING']);
  });

  it('every seeded department has a role list (no empty dropdown for ADMIN either)', () => {
    for (const code of ['ADMIN', 'MARKETING', 'SALES', 'ACADEMICS', 'FINANCE', 'HR', 'MENTORING']) {
      expect(seededDepartments).toContain(code);
      expect(optionsFor(code).length).toBeGreaterThan(0);
    }
  });

  it('keeps the existing mapping of every other department unchanged', () => {
    expect(optionsFor('ADMIN')).toEqual(['CEO', 'CO_FOUNDER', 'OPERATIONS_MANAGER']);
    expect(optionsFor('MARKETING')).toEqual(['DESIGNER', 'MARKETING_HEAD', 'PERFORMANCE_MARKETER']);
    expect(optionsFor('SALES')).toEqual(['SALES_COUNSELLOR', 'SALES_HEAD']);
    expect(optionsFor('FINANCE')).toEqual(['ACCOUNTANT', 'FINANCE_EXECUTIVE', 'FINANCE_HEAD', 'FINANCE_MANAGER']);
    expect(optionsFor('HR')).toEqual(['HR_ASSISTANT', 'HR_EXECUTIVE', 'HR_MANAGER']);
    expect(optionsFor('ACADEMICS')).toEqual(
      ['ACADEMIC_HEAD', 'DEMO_ADMIN', 'DEMO_COORDINATOR', 'DEMO_COUNSELOR', 'DEMO_HEAD', 'MENTOR', 'TUTOR'],
    );
  });

  it('CEO and CO_FOUNDER stay under Administration (ADMIN) only, never under Mentoring', () => {
    expect(optionsFor('MENTORING')).not.toContain('CEO');
    expect(optionsFor('MENTORING')).not.toContain('CO_FOUNDER');
  });

  it('returns every role when no department is selected and none for an unknown department', () => {
    expect(filterRolesForDepartment(apiRoles)).toHaveLength(apiRoles.length);
    expect(filterRolesForDepartment(apiRoles, 'NOT_A_DEPARTMENT')).toEqual([]);
  });

  it('only returns roles the API sent, in the API order', () => {
    const subset = [apiRoles.find((r) => r.code === 'MENTOR')!, apiRoles.find((r) => r.code === 'MENTORING_HEAD')!];
    expect(filterRolesForDepartment(subset, 'MENTORING').map((r) => r.code)).toEqual(['MENTOR', 'MENTORING_HEAD']);
  });
});

describe('department-role mapping versus the seed', () => {
  it('every department key exists in the seed, including MENTORING', () => {
    for (const code of Object.keys(DEPARTMENT_ROLE_CODES)) expect(seededDepartments).toContain(code);
    expect(seededDepartments).toContain('MENTORING');
  });

  it('every mapped role code exists in the seed', () => {
    for (const code of Object.values(DEPARTMENT_ROLE_CODES).flat()) expect(allSeededRoles.has(code)).toBe(true);
  });

  it('every seeded Mentoring role can be created through the form', () => {
    const mapped = new Set(Object.values(DEPARTMENT_ROLE_CODES).flat());
    for (const code of ['MENTORING_HEAD', 'MENTOR', 'DEMO_COUNSELOR']) expect(mapped.has(code)).toBe(true);
  });
});

describe('Users page wiring', () => {
  it('uses the shared mapping and does not keep a private copy', () => {
    expect(usersPage).toContain("from '@/lib/rbac/department-roles'");
    expect(usersPage).toContain('filterRolesForDepartment(');
    expect(usersPage).not.toContain('roleMapping');
  });
});
