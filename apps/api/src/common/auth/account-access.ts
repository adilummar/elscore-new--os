/**
 * Tutor account lockout (confirmed 2026-11-23): a tutor whose status is Suspended or Discontinued
 * cannot log in, refresh a session or use an already-issued access token. Paused and Inactive
 * tutors keep access. Reactivating the tutor restores access.
 *
 * The user-facing message never reveals the status or its reason.
 */
export const TUTOR_BLOCKED_STATUSES: readonly string[] = ['SUSPENDED', 'DISCONTINUED'];

export const ACCOUNT_NOT_ACTIVE_CODE = 'ACCOUNT_NOT_ACTIVE';
export const ACCOUNT_NOT_ACTIVE_MESSAGE = 'Your account is not active. Please contact HR.';

export function isTutorAccessBlocked(tutorStatus?: string | null): boolean {
  return !!tutorStatus && TUTOR_BLOCKED_STATUSES.includes(tutorStatus);
}

/** Exception body shared by login, refresh and token validation. */
export const accountNotActiveBody = () => ({ code: ACCOUNT_NOT_ACTIVE_CODE, message: ACCOUNT_NOT_ACTIVE_MESSAGE });

/** Prisma select that reaches the tutor status from a user row (null for non-tutors). */
export const tutorStatusSelect = {
  employee: { select: { tutorProfile: { select: { tutorOperationalStatus: true } } } },
} as const;

export function tutorStatusOf(u: { employee?: { tutorProfile?: { tutorOperationalStatus: string } | null } | null }): string | null {
  return u.employee?.tutorProfile?.tutorOperationalStatus ?? null;
}
