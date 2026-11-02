import { readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';

import { ForbiddenException } from '@nestjs/common';

import { RbacService } from '../../common/rbac/rbac.service';

import { MentoringAccessService } from './mentoring-access.service';

/**
 * Mentoring access follows roles, permissions and assignment — never department membership. Demo Counselors
 * are not part of the Mentoring department; they only see students they have an assigned task for.
 * Role permission sets are read from prisma/seed.ts so these tests fail if the seed regresses.
 */
const seed = readFileSync(join(__dirname, '../../../prisma/seed.ts'), 'utf8').replace(/\r\n/g, '\n');

const catalog = Array.from(seed.matchAll(/code: '([a-z_.-]+)',\n\s+resource: '[^']+',\n\s+action: '([^']+)'/g)).map((m) => ({
  code: m[1],
  action: m[2],
}));
const mentoringCatalog = catalog.filter((p) => p.code.startsWith('mentoring.'));
const actionOf = new Map(mentoringCatalog.map((p) => [p.code, p.action]));

const roleBlock = (name: string): string[] => {
  const start = seed.indexOf(`\n  ${name}: [`);
  expect(start).toBeGreaterThan(-1);
  return Array.from(seed.slice(start, seed.indexOf('\n  ],', start)).matchAll(/'(mentoring\.[a-z.-]+)'/g)).map((m) => m[1]);
};
const operational = new Set(
  Array.from(
    seed
      .slice(seed.indexOf('const MENTORING_OPERATIONAL_CODES'), seed.indexOf(']);', seed.indexOf('const MENTORING_OPERATIONAL_CODES')))
      .matchAll(/'(mentoring\.[a-z.-]+)'/g),
  ).map((m) => m[1]),
);

const grants: Record<string, string[]> = {
  MENTORING_HEAD: roleBlock('MENTORING_HEAD'),
  MENTOR: roleBlock('MENTOR'),
  DEMO_COUNSELOR: roleBlock('DEMO_COUNSELOR'),
  CEO: mentoringCatalog.map((p) => p.code).filter((c) => !operational.has(c)),
  CO_FOUNDER: mentoringCatalog.filter((p) => ['read', 'read-all', 'view'].includes(p.action)).map((p) => p.code),
};

const accessFor = (permissions: string[]) => {
  const rbac = { getPermissionsForUser: jest.fn().mockResolvedValue(new Set(permissions)) } as unknown as RbacService;
  return new MentoringAccessService(rbac);
};

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return name === 'testing' ? [] : sourceFiles(full);
    return name.endsWith('.ts') && !name.endsWith('.spec.ts') ? [full] : [];
  });
}

describe('Mentoring access does not depend on department membership', () => {
  it('no Mentoring source file reads a department when deciding access (comments excluded)', () => {
    for (const file of sourceFiles(__dirname)) {
      const code = readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
      expect({ file, usesDepartment: /department/i.test(code) }).toEqual({ file, usesDepartment: false });
    }
  });

  it('scope is computed from the user id and permissions alone', () => {
    expect(MentoringAccessService.prototype.scopeFor.length).toBe(1);
  });

  it('a user holding no Mentoring permission has no access, whatever department they belong to', async () => {
    const service = accessFor(['lead.read', 'student.read']);
    const scope = await service.scopeFor('user-in-mentoring-department-without-permissions');
    expect(scope.all).toBe(false);
    expect(scope.assigned).toBe(false);
    expect(() => service.visibilityWhere(scope)).toThrow(ForbiddenException);
  });
});

describe('Demo Counselor: assigned-task access only', () => {
  it('holds exactly the assigned-student read and task-work permissions', () => {
    expect([...grants.DEMO_COUNSELOR].sort()).toEqual(['mentoring.student.read-assigned', 'mentoring.task.work']);
  });

  it('is scoped in the query to students with an assigned task, never department-wide', async () => {
    const service = accessFor(grants.DEMO_COUNSELOR);
    const scope = await service.scopeFor('counselor-1');
    expect(scope.all).toBe(false);
    expect(scope.assigned).toBe(true);
    expect(service.visibilityWhere(scope)).toEqual({
      OR: [{ currentMentorUserId: 'counselor-1' }, { tasks: { some: { assigneeUserId: 'counselor-1' } } }],
    });
    expect(service.canSeeParentContact(scope, { currentMentorUserId: 'someone-else' })).toBe(false);
  });
});

describe('Mentoring Head and Mentor keep their intended scope', () => {
  it('the Mentoring Head sees every student and sees parent contacts', async () => {
    const service = accessFor(grants.MENTORING_HEAD);
    const scope = await service.scopeFor('head-1');
    expect(scope.all).toBe(true);
    expect(service.visibilityWhere(scope)).toEqual({});
    expect(service.canSeeParentContact(scope, { currentMentorUserId: 'other' })).toBe(true);
    expect(grants.MENTORING_HEAD).toEqual(expect.arrayContaining(['mentoring.approval.final', 'mentoring.allocation.manage']));
  });

  it('the Mentor sees only own students and verifies stages but cannot approve or allocate', async () => {
    const service = accessFor(grants.MENTOR);
    const scope = await service.scopeFor('mentor-1');
    expect(scope.all).toBe(false);
    expect(scope.assigned).toBe(true);
    expect(grants.MENTOR).toEqual(expect.arrayContaining(['mentoring.stage.verify', 'mentoring.stage.work']));
    expect(grants.MENTOR).not.toContain('mentoring.approval.final');
    expect(grants.MENTOR).not.toContain('mentoring.allocation.manage');
  });
});

describe('CEO and CO_FOUNDER stay read-only', () => {
  it.each(['CEO', 'CO_FOUNDER'])('%s holds only read/view Mentoring permissions', (role) => {
    expect(grants[role].length).toBeGreaterThan(0);
    for (const code of grants[role]) expect(actionOf.get(code)).toMatch(/^(read|view)/);
    for (const code of grants[role]) expect(operational.has(code)).toBe(false);
  });

  it('both can see all students but neither can approve, allocate, verify or manage staff', async () => {
    for (const role of ['CEO', 'CO_FOUNDER']) {
      const scope = await accessFor(grants[role]).scopeFor(`${role}-1`);
      expect(scope.all).toBe(true);
      for (const code of ['mentoring.approval.final', 'mentoring.allocation.manage', 'mentoring.stage.verify', 'mentoring.staff.manage', 'mentoring.task.create', 'mentoring.handover.retry']) {
        expect(grants[role]).not.toContain(code);
      }
    }
  });

  it('neither role is a Mentoring department role', () => {
    const web = readFileSync(join(__dirname, '../../../../web/src/lib/rbac/department-roles.ts'), 'utf8');
    const mentoringLine = web.split('\n').find((line) => line.trimStart().startsWith('MENTORING:')) ?? '';
    expect(mentoringLine).toContain('MENTORING_HEAD');
    expect(mentoringLine).not.toMatch(/CEO|CO_FOUNDER|DEMO_COUNSELOR/);
  });
});
