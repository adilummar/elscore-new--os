import { MENTOR_ROLE_CODE, MENTORING_HEAD_ROLE_CODE } from './mentoring.constants';

/**
 * The single definition of who can be allocated students. Automatic allocation, manual assignment and the
 * workload table all call this, so they can never disagree.
 *
 * A user created by the Mentoring Head starts as PENDING_SETUP until the first sign-in, and must still be
 * allocatable; INACTIVE and SUSPENDED accounts are not.
 */
export const MENTOR_ELIGIBLE_USER_STATUSES: readonly string[] = ['ACTIVE', 'PENDING_SETUP'];

export interface MentorEligibilityInput {
  profile: { role: string; isActive: boolean; acceptsAllocation: boolean };
  /** null when the user row cannot be found. */
  userStatus: string | null;
  /** null when the user has no employee record (accepted, the same as before). */
  employmentStatus: string | null;
  roleCodes: ReadonlySet<string>;
}

/**
 * Returns why the user cannot be allocated students, or null when eligible.
 * `forAutomatic` adds the "accepts automatic allocation" switch; the Head can still assign manually to a
 * Mentor who has opted out of automatic allocation. Capacity is checked separately by each caller.
 */
export function mentorIneligibleReason(input: MentorEligibilityInput, options: { forAutomatic: boolean }): string | null {
  if (input.profile.role !== 'MENTOR') return 'Only Mentors are allocated students (Demo Counselors work assigned tasks)';
  if (!input.profile.isActive) return 'The Mentor profile is inactive';
  if (input.userStatus === null) return 'The user account was not found';
  if (!MENTOR_ELIGIBLE_USER_STATUSES.includes(input.userStatus)) return `The user account is ${input.userStatus}`;
  if (!input.roleCodes.has(MENTOR_ROLE_CODE)) return 'The user does not hold the Mentor role';
  if (input.roleCodes.has(MENTORING_HEAD_ROLE_CODE)) return 'The Mentoring Head is an administrator and is not allocated students';
  if (input.employmentStatus !== null && input.employmentStatus !== 'ACTIVE') return `Employment status is ${input.employmentStatus}`;
  if (options.forAutomatic && !input.profile.acceptsAllocation) return 'Not accepting automatic allocation';
  return null;
}
