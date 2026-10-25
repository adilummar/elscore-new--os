import {
  SENSITIVE_HR_PERMISSIONS,
  planRolePermissionSeed,
  preservedCatalogUpdate,
  reconcileRolePermissionsRequested,
  selectRolePermissionInserts,
} from './seed-permission-plan';

const removedHrGrants = SENSITIVE_HR_PERMISSIONS.map((permissionCode) => ({
  roleCode: 'HR_MANAGER',
  permissionCode,
}));

describe('role-permission seed plan', () => {
  it('provisions missing links on an empty user table', () => {
    const action = planRolePermissionSeed({
      existingUserCount: 0,
      reconcileRequested: false,
    });

    expect(action).toBe('provision-missing');
    expect(selectRolePermissionInserts(action, removedHrGrants)).toEqual(removedHrGrants);
    expect(removedHrGrants.map((link) => link.permissionCode)).toEqual([
      'user.reset-password',
      'user.create',
      'onboarding.finalize',
      'compensation.approve',
      'payroll.run.finalize',
    ]);
  });

  it('does not restore sensitive grants removed on a populated database', () => {
    const action = planRolePermissionSeed({
      existingUserCount: 3,
      reconcileRequested: false,
    });

    expect(action).toBe('leave-unchanged');
    expect(selectRolePermissionInserts(action, removedHrGrants)).toEqual([]);
  });

  it('inserts missing links only when reconciliation is explicitly requested', () => {
    expect(reconcileRolePermissionsRequested(undefined)).toBe(false);
    expect(reconcileRolePermissionsRequested('false')).toBe(false);
    expect(reconcileRolePermissionsRequested('TRUE')).toBe(false);
    expect(reconcileRolePermissionsRequested('true')).toBe(true);

    const action = planRolePermissionSeed({
      existingUserCount: 3,
      reconcileRequested: true,
    });
    const inserts = selectRolePermissionInserts(action, removedHrGrants);

    expect(action).toBe('provision-missing');
    expect(inserts).toEqual(removedHrGrants);
    expect(inserts).not.toContainEqual(expect.objectContaining({ action: 'delete' }));
  });

  it('does not rewrite stored role or permission fields', () => {
    expect(preservedCatalogUpdate()).toEqual({});
  });

  it('rejects an invalid user count', () => {
    expect(() =>
      planRolePermissionSeed({ existingUserCount: -1, reconcileRequested: false }),
    ).toThrow(/non-negative integer/);
  });
});
