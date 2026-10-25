/**
 * Role-permission decisions for prisma/seed.ts.
 * The seed does not open a database by itself.
 *
 * Initial provisioning runs only when the user table is empty.
 * A later run does not recreate grants an administrator removed.
 * Set SEED_RECONCILE_ROLE_PERMISSIONS=true to insert missing catalog links.
 * That opt-in still does not delete or rewrite an existing link.
 */

export const SEED_RECONCILE_ROLE_PERMISSIONS_ENV = 'SEED_RECONCILE_ROLE_PERMISSIONS';

/** Grants covered by the populated-database tests. The skip rule applies to every code. */
export const SENSITIVE_HR_PERMISSIONS = [
  'user.reset-password',
  'user.create',
  'onboarding.finalize',
  'compensation.approve',
  'payroll.run.finalize',
] as const;

export type RolePermissionSeedAction = 'provision-missing' | 'leave-unchanged';

export function reconcileRolePermissionsRequested(value: string | undefined): boolean {
  return value === 'true';
}

export function planRolePermissionSeed(input: {
  existingUserCount: number;
  reconcileRequested: boolean;
}): RolePermissionSeedAction {
  if (!Number.isInteger(input.existingUserCount) || input.existingUserCount < 0) {
    throw new Error('existingUserCount must be a non-negative integer');
  }
  if (input.existingUserCount === 0 || input.reconcileRequested) {
    return 'provision-missing';
  }
  return 'leave-unchanged';
}

export interface RolePermissionLink {
  roleCode: string;
  permissionCode: string;
}

/**
 * Links the seed may insert. `leave-unchanged` inserts nothing.
 * The returned list is additive. Callers must not delete existing links.
 */
export function selectRolePermissionInserts(
  action: RolePermissionSeedAction,
  missingLinks: readonly RolePermissionLink[],
): RolePermissionLink[] {
  if (action === 'leave-unchanged') {
    return [];
  }
  return missingLinks.map((link) => ({ ...link }));
}

/** Empty on purpose. A rerun must not rewrite stored role or permission fields. */
export function preservedCatalogUpdate(): Record<string, never> {
  return {};
}
