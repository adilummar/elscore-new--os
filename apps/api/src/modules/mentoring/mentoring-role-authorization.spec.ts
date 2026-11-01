import { readFileSync } from 'fs';
import { join } from 'path';

import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { RbacGuard } from '../../common/rbac/rbac.guard';
import { LeadController } from '../lead/lead.controller';

import { MentoringAccessService } from './mentoring-access.service';
import { MentoringAllocationController } from './mentoring-allocation.controller';
import { MentoringTaskController } from './mentoring-task.controller';
import { MentoringWorkflowController } from './mentoring-workflow.controller';

/**
 * Route authorization, exercised through the REAL RbacGuard and the REAL controller metadata.
 * Role permission sets are derived from prisma/seed.ts, so these tests fail if the seed regresses.
 * (Existing database rows only change when an authorised seed run is performed.)
 */
const seed = readFileSync(join(__dirname, '../../../prisma/seed.ts'), 'utf8').replace(/\r\n/g, '\n');

const catalog = Array.from(
  seed.matchAll(/code: '([a-z_.-]+)',\n\s+resource: '[^']+',\n\s+action: '([^']+)'/g),
).map((m) => ({ code: m[1], action: m[2] }));

function seedBlock(name: string): string[] {
  const start = seed.indexOf(`\n  ${name}: [`);
  expect(start).toBeGreaterThan(-1);
  const block = seed.slice(start, seed.indexOf('\n  ],', start));
  return Array.from(block.matchAll(/'([a-z_.-]+)'/g)).map((m) => m[1]);
}

const operationalExclusions = new Set(
  Array.from(
    seed
      .slice(seed.indexOf('const MENTORING_OPERATIONAL_CODES'), seed.indexOf(']);', seed.indexOf('const MENTORING_OPERATIONAL_CODES')))
      .matchAll(/'(mentoring\.[a-z.-]+)'/g),
  ).map((m) => m[1]),
);

const ROLE_PERMISSIONS: Record<string, Set<string>> = {
  CEO: new Set(catalog.map((p) => p.code).filter((c) => !operationalExclusions.has(c))),
  SALES_HEAD: new Set(seedBlock('SALES_HEAD')),
  MENTORING_HEAD: new Set(seedBlock('MENTORING_HEAD')),
  MENTOR: new Set(seedBlock('MENTOR')),
  DEMO_COUNSELOR: new Set(seedBlock('DEMO_COUNSELOR')),
  NOBODY: new Set(),
};

function contextFor(controller: new (...args: never[]) => unknown, method: string, user: { id: string } | undefined): ExecutionContext {
  return {
    getHandler: () => (controller.prototype as Record<string, () => unknown>)[method],
    getClass: () => controller,
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  } as unknown as ExecutionContext;
}

async function canCall(role: string, controller: new (...args: never[]) => unknown, method: string): Promise<boolean> {
  const perms = ROLE_PERMISSIONS[role];
  const rbac = { hasPermissions: (_id: string, required: string[]) => Promise.resolve(required.every((p) => perms.has(p))) };
  const guard = new RbacGuard(new Reflector(), rbac as never);
  try {
    return await guard.canActivate(contextFor(controller, method, { id: `${role}-user` }));
  } catch (error) {
    if (error instanceof ForbiddenException) return false;
    throw error;
  }
}

const WORKFLOW = MentoringWorkflowController;
const ALLOCATION = MentoringAllocationController;
const TASKS = MentoringTaskController;

type Route = [string, new (...args: never[]) => unknown, string];
const operationalRoutes: Route[] = [
  ['retry handover', LeadController, 'retryMentoringHandover'],
  ['start stage', WORKFLOW, 'startStage'],
  ['update checklist item', WORKFLOW, 'updateItem'],
  ['verify stage', WORKFLOW, 'verifyStage'],
  ['authorise exception', WORKFLOW, 'authorizeException'],
  ['pause workflow', WORKFLOW, 'pause'],
  ['block workflow', WORKFLOW, 'block'],
  ['resume workflow', WORKFLOW, 'resume'],
  ['final approval', WORKFLOW, 'decideApproval'],
  ['cancel activation', WORKFLOW, 'cancel'],
  ['allocate', ALLOCATION, 'assign'],
  ['reassign', ALLOCATION, 'reassign'],
  ['temporary transfer', ALLOCATION, 'transfer'],
  ['end transfer', ALLOCATION, 'endTransfer'],
  ['return to queue', ALLOCATION, 'returnToQueue'],
  ['run auto allocation', ALLOCATION, 'runAuto'],
  ['change allocation settings', ALLOCATION, 'updateSettings'],
  ['manage staff profile', ALLOCATION, 'upsertStaff'],
  ['create task', TASKS, 'create'],
  ['start task', TASKS, 'start'],
  ['collect information', TASKS, 'collect'],
  ['submit task', TASKS, 'submit'],
  ['pause task', TASKS, 'hold'],
  ['resume task', TASKS, 'resume'],
  ['verify task', TASKS, 'verify'],
  ['return task', TASKS, 'returnTask'],
  ['cancel task', TASKS, 'cancel'],
];

describe('CEO: company-wide read-only visibility into Mentoring', () => {
  it.each(operationalRoutes)('CEO is rejected by the server for: %s', async (_label, controller, method) => {
    expect(await canCall('CEO', controller, method)).toBe(false);
  });

  it('CEO can open every read endpoint that is permission-gated', async () => {
    expect(await canCall('CEO', ALLOCATION, 'queue')).toBe(true);
    expect(await canCall('CEO', ALLOCATION, 'workload')).toBe(true);
    expect(await canCall('CEO', ALLOCATION, 'settings')).toBe(true);
    expect(await canCall('CEO', ALLOCATION, 'listStaff')).toBe(true);
  });

  it('CEO holds exactly the approved Mentoring read permissions and no retry permission', () => {
    const mentoring = [...ROLE_PERMISSIONS.CEO].filter((c) => c.startsWith('mentoring.')).sort();
    expect(mentoring).toEqual(
      [
        'mentoring.allocation.read',
        'mentoring.audit.read',
        'mentoring.staff.read',
        'mentoring.student.read-all',
        'mentoring.student.read-assigned',
      ].sort(),
    );
    expect(ROLE_PERMISSIONS.CEO.has('mentoring.handover.retry')).toBe(false);
  });

  it('all 13 operational Mentoring permissions are excluded from the CEO', () => {
    expect(operationalExclusions.size).toBe(13);
    for (const code of operationalExclusions) {
      expect(catalog.some((p) => p.code === code)).toBe(true);
      expect(ROLE_PERMISSIONS.CEO.has(code)).toBe(false);
    }
  });

  it('the CEO sees every student through the department-wide scope (read), not an assignment scope', async () => {
    const access = new MentoringAccessService({ getPermissionsForUser: () => Promise.resolve(ROLE_PERMISSIONS.CEO) } as never);
    const scope = await access.scopeFor('ceo-1');

    expect(scope.all).toBe(true);
    expect(access.visibilityWhere(scope)).toEqual({});
    expect(access.canSeeParentContact(scope, { currentMentorUserId: 'someone-else' })).toBe(true);
  });

  it('the permission guard has no CEO shortcut, so removing the seed permission really removes access', () => {
    const rbacDir = join(__dirname, '../../common/rbac');
    for (const file of ['rbac.guard.ts', 'rbac.service.ts']) {
      const source = readFileSync(join(rbacDir, file), 'utf8').replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
      expect(source).not.toMatch(/['"]CEO['"]/);
    }
  });
});

describe('Handover retry authorization', () => {
  it('the Sales Head keeps retry access and nothing else in Mentoring', async () => {
    expect(await canCall('SALES_HEAD', LeadController, 'retryMentoringHandover')).toBe(true);
    expect(await canCall('SALES_HEAD', WORKFLOW, 'verifyStage')).toBe(false);
    expect(await canCall('SALES_HEAD', ALLOCATION, 'assign')).toBe(false);
  });

  it('the Mentoring Head, Mentor, Demo Counselor and users with no role cannot retry', async () => {
    for (const role of ['MENTORING_HEAD', 'MENTOR', 'DEMO_COUNSELOR', 'NOBODY']) {
      expect(await canCall(role, LeadController, 'retryMentoringHandover')).toBe(false);
    }
  });

  it('only the Sales Head holds the retry permission in the seed', () => {
    const holders = Object.entries(ROLE_PERMISSIONS)
      .filter(([, perms]) => perms.has('mentoring.handover.retry'))
      .map(([role]) => role);
    expect(holders).toEqual(['SALES_HEAD']);
  });

  it('retry is reachable only through the permission-guarded route', () => {
    const lead = readFileSync(join(__dirname, '../lead/lead.controller.ts'), 'utf8');
    const callers = Array.from(
      readFileSync(join(__dirname, '../lead/lead.service.ts'), 'utf8').matchAll(/retryForLead\(/g),
    ).length;
    expect(lead).toMatch(/@RequirePermissions\('mentoring\.handover\.retry'\)\s+async retryMentoringHandover/);
    expect(callers).toBe(1);
  });
});

describe('Server-side rejection of unauthorised requests', () => {
  it('a request without an authenticated identity is rejected', async () => {
    const rbac = { hasPermissions: () => Promise.resolve(true) };
    const guard = new RbacGuard(new Reflector(), rbac as never);
    await expect(guard.canActivate(contextFor(LeadController, 'retryMentoringHandover', undefined))).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('a user with no permissions is rejected on every operational route', async () => {
    for (const [, controller, method] of operationalRoutes) {
      expect(await canCall('NOBODY', controller, method)).toBe(false);
    }
  });

  it('each role can only reach the operational routes it was approved for', async () => {
    const reachable = async (role: string) => {
      const out: string[] = [];
      for (const [label, controller, method] of operationalRoutes) if (await canCall(role, controller, method)) out.push(label);
      return out;
    };

    expect(await reachable('DEMO_COUNSELOR')).toEqual(['start task', 'collect information', 'submit task', 'pause task', 'resume task']);
    expect(await reachable('SALES_HEAD')).toEqual(['retry handover']);
    expect(await reachable('MENTOR')).toEqual(
      expect.arrayContaining(['start stage', 'update checklist item', 'verify stage', 'verify task']),
    );
    expect(await reachable('MENTOR')).not.toContain('final approval');
    expect(await reachable('MENTOR')).not.toContain('allocate');
    expect(await reachable('MENTORING_HEAD')).toEqual(
      expect.arrayContaining(['final approval', 'allocate', 'authorise exception', 'cancel activation']),
    );
    expect(await reachable('MENTORING_HEAD')).not.toContain('verify stage');
    expect(await reachable('MENTORING_HEAD')).not.toContain('retry handover');
  });
});
