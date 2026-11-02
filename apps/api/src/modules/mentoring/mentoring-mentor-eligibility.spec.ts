/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-member-access */
import { readFileSync } from 'fs';
import { join } from 'path';

import { BadRequestException, ConflictException } from '@nestjs/common';

import { PERMISSIONS_KEY } from '../../common/rbac/require-permissions.decorator';
import { UserRoleService } from '../user/user-role.service';
import { UserService } from '../user/user.service';

import { MentoringAllocationController } from './mentoring-allocation.controller';
import { MentoringAllocationService } from './mentoring-allocation.service';
import { mentorIneligibleReason } from './mentoring-eligibility';
import { MentoringHistoryService } from './mentoring-history.service';
import { MentoringStaffService } from './mentoring-staff.service';
import { FakeDb } from './testing/mentoring-fake-db';

jest.mock('argon2', () => ({ hash: jest.fn().mockResolvedValue('hashed'), argon2id: 2 }));

/**
 * Regression suite for "the Mentor the Head created never shows up for allocation".
 * Cause: allocation, the Mentor dropdown and the workload table all read mentoring_staff_profiles, and creating
 * a user never created one. A new user is also PENDING_SETUP until first sign-in, which the old rule rejected.
 */
const HEAD = 'head-1';

function world() {
  const db = new FakeDb();
  const audit = { recordInTx: jest.fn().mockResolvedValue(undefined), record: jest.fn().mockResolvedValue(undefined) };
  const history = new MentoringHistoryService(audit as any);
  const allocation = new MentoringAllocationService(db as any, history);
  const staff = new MentoringStaffService(db as any, history);
  const rbac = { invalidateCache: jest.fn().mockResolvedValue(undefined) };
  const users = new UserService(
    db as any, audit as any, rbac as any, { invalidate: jest.fn().mockResolvedValue(undefined) } as any,
    { nextIdInTx: jest.fn().mockResolvedValue('EMP-0001') } as any, { revokeAllUserTokens: jest.fn() } as any,
  );
  const userRoles = new UserRoleService(db as any, audit as any, rbac as any);

  const roles: Record<string, string> = {};
  for (const code of ['MENTOR', 'MENTORING_HEAD', 'DEMO_COUNSELOR', 'TUTOR']) {
    roles[code] = (db.seed('role', { code, isProtected: false }) as any).id;
  }
  const departments: Record<string, string> = {};
  for (const code of ['MENTORING', 'ACADEMICS']) departments[code] = (db.seed('department', { code }) as any).id;

  // The acting Mentoring Head (a user with the MENTORING_HEAD role).
  db.seed('user', { id: HEAD, status: 'ACTIVE', userRoles: [{ role: { code: 'MENTORING_HEAD' } }] });
  db.seed('userRole', { userId: HEAD, roleId: roles.MENTORING_HEAD, role: { code: 'MENTORING_HEAD' }, user: { status: 'ACTIVE' } });
  db.seed('mentoringSetting', { id: 'default', allocationMode: 'AUTO', defaultCapacity: 40, siblingAffinity: true });

  const createUser = (role: string, dept: string, email = `${role.toLowerCase()}@x.test`) =>
    users.create(
      { email, password: 'a-long-password', firstName: 'First', lastName: 'Last', departmentId: departments[dept], roleId: roles[role] },
      HEAD,
    );
  const userId = (email: string) => db.rows('user').find((u) => u.email === email)!.id as string;
  const profileOf = (id: string) => db.rows('mentoringStaffProfile').find((p) => p.userId === id);
  const awaiting = (id = 'act-1', leadId = 'lead-1') =>
    db.seed('mentoringActivation', { id, leadId, studentId: `stu-${id}`, handoverId: `ho-${id}`, status: 'AWAITING_ALLOCATION', currentStage: 1, currentMentorUserId: null });
  const activation = (id = 'act-1') => db.rows('mentoringActivation').find((a) => a.id === id)!;
  const setMode = (allocationMode: 'AUTO' | 'MANUAL') => Object.assign(db.rows('mentoringSetting')[0], { allocationMode });

  /** A staff profile built directly (the legacy path), for the eligibility matrix. */
  const profile = (id: string, o: { role?: string; active?: boolean; accepting?: boolean; userStatus?: string; employment?: string; roles?: string[]; capacity?: number | null; load?: number } = {}) => {
    db.seed('user', { id, status: o.userStatus ?? 'ACTIVE' });
    db.seed('employee', { userId: id, firstName: id, lastName: 'M', employmentStatus: o.employment ?? 'ACTIVE' });
    db.seed('mentoringStaffProfile', { userId: id, role: o.role ?? 'MENTOR', capacity: o.capacity ?? null, isActive: o.active ?? true, acceptsAllocation: o.accepting ?? true });
    for (const code of o.roles ?? ['MENTOR']) db.seed('userRole', { userId: id, roleId: roles[code], role: { code } });
    for (let i = 0; i < (o.load ?? 0); i++) {
      db.seed('mentoringActivation', { id: `${id}-open-${i}`, leadId: `L-${id}-${i}`, studentId: `S-${id}-${i}`, status: 'ACTIVATION_IN_PROGRESS', currentStage: 1, currentMentorUserId: id });
    }
  };
  return { db, audit, allocation, staff, users, userRoles, roles, departments, createUser, userId, profileOf, awaiting, activation, setMode, profile };
}

/** The fake database does not expand `include: { userRoles }`, so give the user the roles the service reads. */
const withRoles = (w: ReturnType<typeof world>, id: string, ...codes: string[]) => {
  w.db.rows('user').find((u) => u.id === id)!.userRoles = codes.map((code) => ({ roleId: w.roles[code], role: { code } }));
};

describe('1. Mentoring Head creates a valid Mentor', () => {
  it('creates the user, employee, role AND the Mentor staff profile in one step', async () => {
    const w = world();
    await w.createUser('MENTOR', 'MENTORING', 'asha@x.test');
    const id = w.userId('asha@x.test');

    expect(w.db.rows('user').find((u) => u.id === id)).toMatchObject({ status: 'PENDING_SETUP' });
    expect(w.db.rows('employee').find((e) => e.userId === id)).toMatchObject({ departmentId: w.departments.MENTORING });
    expect(w.profileOf(id)).toMatchObject({ role: 'MENTOR', isActive: true, acceptsAllocation: true, capacity: null });
  });

  it('audits the profile creation with its source', async () => {
    const w = world();
    await w.createUser('MENTOR', 'MENTORING', 'asha@x.test');
    const audit = w.db.rows('auditEvent').find((a) => a.entityType === 'MentoringStaffProfile');
    expect(audit).toMatchObject({ action: 'CREATE', actorUserId: HEAD, metadata: { source: 'USER_CREATION' } });
  });

  it.each([
    ['a Mentoring Head', 'MENTORING_HEAD', 'MENTORING'],
    ['a Demo Counselor', 'DEMO_COUNSELOR', 'ACADEMICS'],
    ['a Mentor in Academics (existing duties, not allocated Mentoring students)', 'MENTOR', 'ACADEMICS'],
    ['a Tutor', 'TUTOR', 'ACADEMICS'],
  ])('does not create a Mentor profile for %s', async (_label, role, dept) => {
    const w = world();
    await w.createUser(role, dept, 'someone@x.test');
    expect(w.db.rows('mentoringStaffProfile')).toHaveLength(0);
  });

  it('assigning the Mentor role later to a Mentoring-department user also creates the profile', async () => {
    const w = world();
    await w.createUser('TUTOR', 'MENTORING', 'later@x.test');
    const id = w.userId('later@x.test');
    expect(w.profileOf(id)).toBeUndefined();

    withRoles(w, id, 'TUTOR');
    await w.userRoles.assignRole(id, w.roles.MENTOR, HEAD);
    expect(w.profileOf(id)).toMatchObject({ role: 'MENTOR', isActive: true });
  });

  it('never overwrites an existing profile', async () => {
    const w = world();
    await w.createUser('TUTOR', 'MENTORING', 'later@x.test');
    const id = w.userId('later@x.test');
    w.db.seed('mentoringStaffProfile', { userId: id, role: 'MENTOR', capacity: 7, isActive: false, acceptsAllocation: false });
    withRoles(w, id, 'TUTOR');
    await w.userRoles.assignRole(id, w.roles.MENTOR, HEAD);
    expect(w.db.rows('mentoringStaffProfile')).toHaveLength(1);
    expect(w.profileOf(id)).toMatchObject({ capacity: 7, isActive: false, acceptsAllocation: false });
  });
});

describe('2, 5. The created Mentor appears in the eligible-Mentor API and the workload table', () => {
  it('lists the Mentor with name, role, open students, open tasks and status', async () => {
    const w = world();
    await w.createUser('MENTOR', 'MENTORING', 'asha@x.test');
    const id = w.userId('asha@x.test');
    w.db.rows('employee').find((e) => e.userId === id)!.firstName = 'Asha';

    const load = await w.allocation.workload();
    const row = load.staff.find((s: any) => s.userId === id)!;
    expect(row).toMatchObject({
      name: expect.stringContaining('Asha'), role: 'MENTOR', openStudents: 0, openTasks: 0, capacity: 40,
      isActive: true, userStatus: 'PENDING_SETUP', employmentStatus: 'ACTIVE', eligibleForManual: true, eligibleForAuto: true, ineligibleReason: null,
    });
  });

  it('the table is not empty when valid Mentors exist, and counts their open work', async () => {
    const w = world();
    w.profile('m1', { load: 2 });
    w.db.seed('mentoringTask', { id: 't1', assigneeUserId: 'm1', activationId: 'x', status: 'OPEN' });
    const load = await w.allocation.workload();
    expect(load.staff).toHaveLength(1);
    expect(load.staff[0]).toMatchObject({ openStudents: 2, openTasks: 1 });
  });

  it('the Mentoring Head, who has no profile, is not listed as a Mentor', async () => {
    const w = world();
    w.profile('m1');
    const load = await w.allocation.workload();
    expect(load.staff.map((s: any) => s.userId)).toEqual(['m1']);
  });
});

describe('3, 4. Manual allocation', () => {
  it('lets the Head allocate to the newly created Mentor and persists it with history', async () => {
    const w = world();
    w.setMode('MANUAL');
    await w.createUser('MENTOR', 'MENTORING', 'asha@x.test');
    const id = w.userId('asha@x.test');
    w.awaiting();

    const dropdown = (await w.allocation.workload()).staff.filter((s: any) => s.eligibleForManual && s.role === 'MENTOR');
    expect(dropdown.map((s: any) => s.userId)).toEqual([id]);

    await w.allocation.allocate('act-1', { mentorUserId: id, reason: 'Subject match' }, HEAD);

    expect(w.activation()).toMatchObject({ currentMentorUserId: id, status: 'ACTIVATION_IN_PROGRESS' });
    expect(w.db.rows('mentorAssignment')).toEqual([
      expect.objectContaining({ mentorUserId: id, type: 'MANUAL', currentKey: 'act-1', reason: 'Subject match' }),
    ]);
    expect(w.db.rows('mentoringStage')).toHaveLength(7);
  });

  it('audits the decision (rule, load and capacity) in the Mentoring history', async () => {
    const w = world();
    w.setMode('MANUAL');
    w.profile('m1', { load: 3 });
    w.awaiting();
    await w.allocation.allocate('act-1', { mentorUserId: 'm1' }, HEAD);
    expect(w.db.rows('mentorAssignment')[0].decision).toMatchObject({ rule: 'MANUAL', load: 3, capacity: 40 });
    expect(w.db.rows('mentoringEvent').map((e) => e.type)).toEqual(expect.arrayContaining(['MENTOR_ALLOCATED']));
  });

  it('gives an actionable message when the user has no Mentor staff profile', async () => {
    const w = world();
    w.db.seed('user', { id: 'no-profile', status: 'ACTIVE' });
    w.awaiting();
    await expect(w.allocation.allocate('act-1', { mentorUserId: 'no-profile' }, HEAD)).rejects.toThrow(/Add missing Mentors/);
  });
});

describe('6. Automatic allocation', () => {
  it('selects the newly created Mentor (a PENDING_SETUP account) and records the decision', async () => {
    const w = world();
    await w.createUser('MENTOR', 'MENTORING', 'asha@x.test');
    const id = w.userId('asha@x.test');
    w.awaiting();

    const result = await w.allocation.autoAllocateInTx(w.db as any, 'act-1', 'system');

    expect(result).toEqual({ allocated: true, mentorUserId: id });
    expect(w.db.rows('mentorAssignment')[0]).toMatchObject({ type: 'AUTO', mentorUserId: id });
    expect(w.db.rows('mentorAssignment')[0].decision.candidates).toEqual([{ userId: id, load: 0, capacity: 40 }]);
  });

  it('the Head can run allocation for students already waiting when the mode is switched on', async () => {
    const w = world();
    w.setMode('MANUAL');
    w.profile('m1');
    w.awaiting('act-1', 'lead-1'); w.awaiting('act-2', 'lead-2');
    await w.allocation.autoAllocateInTx(w.db as any, 'act-1', 'system');
    expect(w.activation('act-1').currentMentorUserId).toBeNull();

    w.setMode('AUTO');
    const results = await w.allocation.runAutoForQueue(HEAD);
    expect(results.every((r) => r.allocated)).toBe(true);
    expect(w.activation('act-1').currentMentorUserId).toBe('m1');
    expect(w.activation('act-2').currentMentorUserId).toBe('m1');
  });

  it('uses least-loaded selection with the existing tie-breaks', async () => {
    const w = world();
    w.profile('m1', { load: 3 }); w.profile('m2', { load: 1 }); w.profile('m3', { load: 2 });
    w.awaiting();
    expect(await w.allocation.autoAllocateInTx(w.db as any, 'act-1', 'system')).toEqual({ allocated: true, mentorUserId: 'm2' });
  });
});

describe('7-11. One eligibility rule for automatic, manual and workload', () => {
  const cases: Array<[string, Parameters<ReturnType<typeof world>['profile']>[1], boolean, boolean]> = [
    // [label, profile options, eligible manually, eligible automatically]
    ['a valid active Mentor', {}, true, true],
    ['a Mentor whose account is PENDING_SETUP (just created)', { userStatus: 'PENDING_SETUP' }, true, true],
    ['an inactive Mentor profile', { active: false }, false, false],
    ['an INACTIVE user account', { userStatus: 'INACTIVE' }, false, false],
    ['a SUSPENDED user account', { userStatus: 'SUSPENDED' }, false, false],
    ['a Mentor on leave', { employment: 'ON_LEAVE' }, false, false],
    ['a user without the Mentor role', { roles: [] }, false, false],
    ['the Mentoring Head who also holds the Mentor role', { roles: ['MENTOR', 'MENTORING_HEAD'] }, false, false],
    ['a Demo Counselor profile', { role: 'DEMO_COUNSELOR', roles: ['DEMO_COUNSELOR'] }, false, false],
    ['a Mentor who opted out of automatic allocation', { accepting: false }, true, false],
  ];

  it.each(cases)('%s: workload, manual and automatic agree', async (_label, options, manual, auto) => {
    // workload view
    const w = world();
    w.profile('m1', options);
    const row = (await w.allocation.workload()).staff[0];
    expect({ manual: row.eligibleForManual, auto: row.eligibleForAuto }).toEqual({ manual, auto });
    if (!manual) expect(row.ineligibleReason).toEqual(expect.any(String));

    // manual assignment
    const m = world();
    m.profile('m1', options); m.awaiting();
    const manualResult = m.allocation.allocate('act-1', { mentorUserId: 'm1' }, HEAD);
    if (manual) await expect(manualResult).resolves.toBeDefined();
    else await expect(manualResult).rejects.toBeInstanceOf(BadRequestException);

    // automatic allocation
    const a = world();
    a.profile('m1', options); a.awaiting();
    const autoResult = await a.allocation.autoAllocateInTx(a.db as any, 'act-1', 'system');
    expect(autoResult.allocated).toBe(auto);
  });

  it('the shared rule is the only place that decides (unit)', () => {
    const base = { profile: { role: 'MENTOR', isActive: true, acceptsAllocation: true }, userStatus: 'ACTIVE', employmentStatus: 'ACTIVE', roleCodes: new Set(['MENTOR']) };
    expect(mentorIneligibleReason(base, { forAutomatic: true })).toBeNull();
    expect(mentorIneligibleReason({ ...base, userStatus: 'PENDING_SETUP' }, { forAutomatic: true })).toBeNull();
    expect(mentorIneligibleReason({ ...base, userStatus: null }, { forAutomatic: false })).toMatch(/not found/);
    expect(mentorIneligibleReason({ ...base, employmentStatus: null }, { forAutomatic: true })).toBeNull();
  });
});

describe('11. Capacity is enforced', () => {
  it('automatic allocation skips a Mentor at capacity, and manual needs an override reason', async () => {
    const w = world();
    w.profile('full', { load: 2, capacity: 2 });
    w.awaiting();
    expect(await w.allocation.autoAllocateInTx(w.db as any, 'act-1', 'system')).toMatchObject({ allocated: false, reason: 'NO_ELIGIBLE_MENTOR' });
    await expect(w.allocation.allocate('act-1', { mentorUserId: 'full' }, HEAD)).rejects.toBeInstanceOf(ConflictException);
    await expect(w.allocation.allocate('act-1', { mentorUserId: 'full', overCapacityReason: 'Exam cover' }, HEAD)).resolves.toBeDefined();
  });
});

describe('12. No eligible Mentor leaves the student queued', () => {
  it('keeps the student in the queue and notifies the Head', async () => {
    const w = world();
    w.profile('inactive', { active: false });
    w.profile('counselor', { role: 'DEMO_COUNSELOR', roles: ['DEMO_COUNSELOR'] });
    w.awaiting();

    const result = await w.allocation.autoAllocateInTx(w.db as any, 'act-1', 'system');

    expect(result).toMatchObject({ allocated: false, reason: 'NO_ELIGIBLE_MENTOR' });
    expect(w.activation()).toMatchObject({ status: 'AWAITING_ALLOCATION', currentMentorUserId: null });
    expect(w.db.rows('notification').map((n) => n.recipientUserId)).toEqual([HEAD]);
    expect(w.db.rows('mentoringEvent').map((e) => e.type)).toContain('ALLOCATION_QUEUED');
  });
});

describe('13. Sibling grouping is preserved', () => {
  it('a sibling goes to the same Mentor, even a newly created PENDING_SETUP one', async () => {
    const w = world();
    await w.createUser('MENTOR', 'MENTORING', 'asha@x.test');
    const id = w.userId('asha@x.test');
    w.profile('other', { load: 0 });
    w.db.seed('mentoringActivation', { id: 'older', leadId: 'family-1', studentId: 'stu-older', status: 'ACTIVATION_IN_PROGRESS', currentStage: 1, currentMentorUserId: id });
    w.awaiting('act-1', 'family-1');

    expect(await w.allocation.autoAllocateInTx(w.db as any, 'act-1', 'system')).toEqual({ allocated: true, mentorUserId: id });
  });
});

describe('Head-triggered sync for Mentors created before this fix', () => {
  it('creates the missing profile for Mentoring-department Mentors only, audits it, and is idempotent', async () => {
    const w = world();
    // Created the old way: user + employee + role, no profile.
    const legacy = (id: string, dept: string, status = 'PENDING_SETUP') => {
      w.db.seed('user', { id, status });
      w.db.seed('employee', { userId: id, departmentId: w.departments[dept], firstName: id, lastName: 'L', employmentStatus: 'ACTIVE' });
      w.db.seed('userRole', { userId: id, roleId: w.roles.MENTOR, role: { code: 'MENTOR' } });
    };
    legacy('in-mentoring', 'MENTORING'); legacy('in-academics', 'ACADEMICS');

    expect(await w.staff.syncMentorsFromRoles(HEAD)).toEqual({ created: 1, alreadyHadProfile: 0, skipped: 1 });
    expect(w.profileOf('in-mentoring')).toMatchObject({ role: 'MENTOR', isActive: true, acceptsAllocation: true });
    expect(w.profileOf('in-academics')).toBeUndefined();
    expect(w.db.rows('auditEvent').find((a) => a.entityType === 'MentoringStaffProfile')).toMatchObject({ metadata: { source: 'SYNC' }, actorUserId: HEAD });

    expect(await w.staff.syncMentorsFromRoles(HEAD)).toEqual({ created: 0, alreadyHadProfile: 1, skipped: 1 });
    expect(w.db.rows('mentoringStaffProfile')).toHaveLength(1);

    // …and the synced Mentor is immediately allocatable.
    w.awaiting();
    expect(await w.allocation.autoAllocateInTx(w.db as any, 'act-1', 'system')).toEqual({ allocated: true, mentorUserId: 'in-mentoring' });
  });
});

describe('15. Authorization: CEO and CO_FOUNDER stay read-only', () => {
  const seed = readFileSync(join(__dirname, '../../../prisma/seed.ts'), 'utf8').replace(/\r\n/g, '\n');
  const required = (method: string): string[] | undefined =>
    Reflect.getMetadata(PERMISSIONS_KEY, (MentoringAllocationController.prototype as Record<string, any>)[method]);

  it('the sync route needs the staff-management permission, like every other staff write', () => {
    expect(required('syncStaff')).toEqual(['mentoring.staff.manage']);
    expect(required('upsertStaff')).toEqual(['mentoring.staff.manage']);
    expect(required('workload')).toEqual(['mentoring.staff.read']);
  });

  it('only the Mentoring Head is granted staff management; the CEO and CO_FOUNDER are not', () => {
    const grants = (name: string) => {
      const start = seed.indexOf(`\n  ${name}: [`);
      return start < 0 ? [] : Array.from(seed.slice(start, seed.indexOf('\n  ],', start)).matchAll(/'(mentoring\.[a-z.-]+)'/g)).map((m) => m[1]);
    };
    expect(grants('MENTORING_HEAD')).toContain('mentoring.staff.manage');
    for (const role of ['MENTOR', 'DEMO_COUNSELOR']) expect(grants(role)).not.toContain('mentoring.staff.manage');
    expect(seed).toContain('CEO: ALL_PERMISSION_CODES.filter((code) => !MENTORING_OPERATIONAL_CODES.has(code))');
    const operational = seed.slice(seed.indexOf('const MENTORING_OPERATIONAL_CODES'), seed.indexOf(']);', seed.indexOf('const MENTORING_OPERATIONAL_CODES')));
    expect(operational).toContain("'mentoring.staff.manage'");
    expect(operational).toContain("'mentoring.allocation.manage'");
  });
});
