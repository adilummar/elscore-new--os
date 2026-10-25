/**
 * Identity decisions for prisma/seed.ts.
 * The seed does not open these rules against a database by itself.
 * Callers must not grant CEO or HR roles to the system actor.
 */

export const SYSTEM_ACTOR_ID = 'SYSTEM';
export const SYSTEM_ACTOR_EMAIL = 'system@elscore.internal';

export const SYSTEM_ACTOR_INTERACTIVE_DENIAL =
  'The system actor cannot be used as an interactive account.';

/**
 * True for the reserved audit identity, by id or email.
 * Existing role rows are not removed by this check.
 */
export function isSystemActorIdentity(identity: {
  id?: string | null;
  email?: string | null;
}): boolean {
  if (identity.id === SYSTEM_ACTOR_ID) {
    return true;
  }
  return identity.email?.trim().toLowerCase() === SYSTEM_ACTOR_EMAIL;
}

/**
 * Prisma filter clause to exclude the system actor from user queries by ID and email.
 */
export const EXCLUDE_SYSTEM_ACTOR_WHERE = {
  id: { not: SYSTEM_ACTOR_ID },
  email: { not: SYSTEM_ACTOR_EMAIL },
};

/**
 * The bootstrap CEO admin is created only when the user table is empty.
 * Any existing user, including a non-admin user, suppresses that create.
 */
export function shouldCreateInitialCeoAdmin(existingUserCount: number): boolean {
  if (!Number.isInteger(existingUserCount) || existingUserCount < 0) {
    throw new Error('existingUserCount must be a non-negative integer');
  }
  return existingUserCount === 0;
}

export interface SystemActorCreateData {
  id: string;
  email: string;
  passwordHash: string;
  status: 'ACTIVE';
  employee: {
    create: {
      businessId: 'SYS-0000';
      departmentId: string;
      employmentStatus: 'ACTIVE';
      firstName: 'System';
      lastName: 'Automated';
    };
  };
}

/**
 * Audit actor used as actorUserId "SYSTEM".
 * No userRoles are attached, so this create is not a CEO or HR login.
 * passwordHash is a non-hash placeholder; it is not a usable password.
 */
export function systemActorCreateData(departmentId: string): SystemActorCreateData {
  return {
    id: SYSTEM_ACTOR_ID,
    email: SYSTEM_ACTOR_EMAIL,
    passwordHash: 'none',
    status: 'ACTIVE',
    employee: {
      create: {
        businessId: 'SYS-0000',
        departmentId,
        employmentStatus: 'ACTIVE',
        firstName: 'System',
        lastName: 'Automated',
      },
    },
  };
}
