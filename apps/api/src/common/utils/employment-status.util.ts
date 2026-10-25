import { EmploymentStatus } from '@prisma/client';

/**
 * Returns true if the employee is in an active working lifecycle state
 * (PROBATION, ACTIVE, or NOTICE_PERIOD).
 * In these states, the employee is eligible for daily work, attendance check-in,
 * and operational tasks (e.g. sales leads, demo coordination).
 */
export function isEligibleForWork(status: EmploymentStatus | string | null | undefined): boolean {
  if (!status) return false;
  return (
    status === EmploymentStatus.ACTIVE ||
    status === EmploymentStatus.PROBATION ||
    status === EmploymentStatus.NOTICE_PERIOD ||
    status === 'ACTIVE' ||
    status === 'PROBATION' ||
    status === 'NOTICE_PERIOD'
  );
}

/**
 * Returns true if an employee is blocked from submitting leave requests
 * (TERMINATED, SUSPENDED, or INACTIVE).
 */
export function isBlockedFromLeave(status: EmploymentStatus | string | null | undefined): boolean {
  if (!status) return true;
  return (
    status === EmploymentStatus.TERMINATED ||
    status === EmploymentStatus.SUSPENDED ||
    status === EmploymentStatus.INACTIVE ||
    status === 'TERMINATED' ||
    status === 'SUSPENDED' ||
    status === 'INACTIVE'
  );
}
