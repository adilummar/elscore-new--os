import { readFileSync } from 'fs';
import { join } from 'path';

import { PERMISSIONS_KEY } from '../../common/rbac/require-permissions.decorator';

import { MentoringAllocationController } from './mentoring-allocation.controller';
import { MentoringTaskController } from './mentoring-task.controller';
import { MentoringWorkflowController } from './mentoring-workflow.controller';

const required = (proto: object, method: string): string[] | undefined =>
  Reflect.getMetadata(PERMISSIONS_KEY, (proto as Record<string, any>)[method]);

describe('Mentoring route permissions', () => {
  const W = MentoringWorkflowController.prototype;
  const A = MentoringAllocationController.prototype;
  const T = MentoringTaskController.prototype;

  it.each([
    [W, 'startStage', 'mentoring.stage.work'],
    [W, 'updateItem', 'mentoring.stage.work'],
    [W, 'verifyStage', 'mentoring.stage.verify'],
    [W, 'authorizeException', 'mentoring.exception.authorize'],
    [W, 'pause', 'mentoring.workflow.pause'],
    [W, 'block', 'mentoring.workflow.pause'],
    [W, 'resume', 'mentoring.workflow.pause'],
    [W, 'decideApproval', 'mentoring.approval.final'],
    [W, 'cancel', 'mentoring.activation.cancel'],
    [A, 'queue', 'mentoring.allocation.read'],
    [A, 'workload', 'mentoring.staff.read'],
    [A, 'settings', 'mentoring.allocation.read'],
    [A, 'updateSettings', 'mentoring.allocation.configure'],
    [A, 'runAuto', 'mentoring.allocation.manage'],
    [A, 'assign', 'mentoring.allocation.manage'],
    [A, 'reassign', 'mentoring.allocation.manage'],
    [A, 'transfer', 'mentoring.allocation.manage'],
    [A, 'endTransfer', 'mentoring.allocation.manage'],
    [A, 'returnToQueue', 'mentoring.allocation.manage'],
    [A, 'listStaff', 'mentoring.staff.read'],
    [A, 'listCounselors', 'mentoring.task.create'],
    [A, 'upsertStaff', 'mentoring.staff.manage'],
    [T, 'create', 'mentoring.task.create'],
    [T, 'start', 'mentoring.task.work'],
    [T, 'collect', 'mentoring.task.work'],
    [T, 'submit', 'mentoring.task.work'],
    [T, 'hold', 'mentoring.task.work'],
    [T, 'resume', 'mentoring.task.work'],
    [T, 'verify', 'mentoring.task.verify'],
    [T, 'returnTask', 'mentoring.task.verify'],
    [T, 'cancel', 'mentoring.task.create'],
  ])('%#: %s requires %s', (proto, method, permission) => {
    expect(required(proto, method)).toEqual([permission]);
  });

  it('read endpoints without a route permission are authorised by scope in the service layer', () => {
    // list / workspace / events / task list / comments call MentoringAccessService.requireAnyScope or
    // visibilityWhere, which rejects users with neither mentoring.student.read-all nor read-assigned.
    for (const method of ['list', 'workspace', 'events']) expect(required(W, method)).toBeUndefined();
    for (const method of ['list', 'comment']) expect(required(T, method)).toBeUndefined();
  });
});

describe('Mentoring role mappings in the seed', () => {
  const seed = readFileSync(join(__dirname, '../../../prisma/seed.ts'), 'utf8').replace(/\r\n/g, '\n');

  const block = (name: string): string => {
    const start = seed.indexOf(`\n  ${name}: [`);
    expect(start).toBeGreaterThan(-1);
    return seed.slice(start, seed.indexOf('\n  ],', start));
  };
  const has = (role: string, code: string) => block(role).includes(`'${code}'`);

  it('Demo Counselors can work tasks but can never verify, pause, approve or allocate', () => {
    expect(has('DEMO_COUNSELOR', 'mentoring.task.work')).toBe(true);
    for (const code of ['mentoring.stage.verify', 'mentoring.stage.work', 'mentoring.workflow.pause', 'mentoring.approval.final', 'mentoring.allocation.manage', 'mentoring.task.verify', 'mentoring.student.read-all']) {
      expect(has('DEMO_COUNSELOR', code)).toBe(false);
    }
  });

  it('Mentors verify stages but cannot approve final activation or allocate', () => {
    for (const code of ['mentoring.stage.work', 'mentoring.stage.verify', 'mentoring.workflow.pause', 'mentoring.task.create']) expect(has('MENTOR', code)).toBe(true);
    for (const code of ['mentoring.approval.final', 'mentoring.allocation.manage', 'mentoring.exception.authorize', 'mentoring.student.read-all']) expect(has('MENTOR', code)).toBe(false);
  });

  it('only the Mentoring Head approves, allocates and authorises exceptions; the Head does not verify stages', () => {
    for (const code of ['mentoring.approval.final', 'mentoring.allocation.manage', 'mentoring.exception.authorize', 'mentoring.student.read-all']) expect(has('MENTORING_HEAD', code)).toBe(true);
    for (const code of ['mentoring.stage.verify', 'mentoring.stage.work']) expect(has('MENTORING_HEAD', code)).toBe(false);
  });

  it('the CEO is explicitly stripped of every operational Mentoring permission', () => {
    expect(seed).toContain('CEO: ALL_PERMISSION_CODES.filter((code) => !MENTORING_OPERATIONAL_CODES.has(code))');
    const set = seed.slice(seed.indexOf('const MENTORING_OPERATIONAL_CODES'), seed.indexOf(']);', seed.indexOf('const MENTORING_OPERATIONAL_CODES')));
    for (const code of ['mentoring.stage.verify', 'mentoring.approval.final', 'mentoring.allocation.manage', 'mentoring.task.work', 'mentoring.workflow.pause']) {
      expect(set).toContain(`'${code}'`);
    }
    expect(set).not.toContain('mentoring.student.read-all');
  });

  it('every permission used by a Mentoring route exists in the permission catalog', () => {
    const catalog = Array.from(seed.matchAll(/code: '(mentoring\.[a-z.-]+)'/g)).map((m) => m[1]);
    for (const proto of [MentoringWorkflowController.prototype, MentoringAllocationController.prototype, MentoringTaskController.prototype]) {
      for (const name of Object.getOwnPropertyNames(proto)) {
        const perms = name === 'constructor' ? undefined : required(proto, name);
        for (const p of perms ?? []) expect(catalog).toContain(p);
      }
    }
  });
});
