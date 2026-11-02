import { PrismaTxClient } from '../../common/prisma/prisma.service';

import { MENTOR_ROLE_CODE } from './mentoring.constants';

export const MENTORING_DEPARTMENT_CODE = 'MENTORING';

export type MentorProfileSource = 'USER_CREATION' | 'ROLE_ASSIGNMENT' | 'SYNC';

/**
 * A Mentor in the Mentoring department needs a staff profile before allocation can see them. This creates it
 * (default capacity, accepting allocation) inside the caller's transaction, and is a no-op when:
 *  - the user does not hold the Mentor role,
 *  - the user's employee record is not in the Mentoring department (Mentors elsewhere, for example Academics,
 *    keep their existing duties and are not allocated Mentoring students), or
 *  - a profile already exists (it is never changed here).
 */
export async function ensureMentorStaffProfileInTx(
  tx: PrismaTxClient,
  userId: string,
  actorUserId: string | null,
  source: MentorProfileSource,
): Promise<'CREATED' | 'EXISTS' | 'NOT_APPLICABLE'> {
  const hasRole = await tx.userRole.count({ where: { userId, role: { code: MENTOR_ROLE_CODE } } });
  if (!hasRole) return 'NOT_APPLICABLE';

  const employee = await tx.employee.findFirst({ where: { userId }, select: { departmentId: true } });
  if (!employee?.departmentId) return 'NOT_APPLICABLE';
  const department = await tx.department.findUnique({ where: { id: employee.departmentId }, select: { code: true } });
  if (department?.code !== MENTORING_DEPARTMENT_CODE) return 'NOT_APPLICABLE';

  const existing = await tx.mentoringStaffProfile.findUnique({ where: { userId } });
  if (existing) return 'EXISTS';

  const created = await tx.mentoringStaffProfile.create({
    data: { userId, role: 'MENTOR', capacity: null, isActive: true, acceptsAllocation: true },
  });
  await tx.auditEvent.create({
    data: {
      entityType: 'MentoringStaffProfile',
      entityId: created.id,
      action: 'CREATE',
      actorUserId,
      newValue: created as never,
      metadata: { source } as never,
    },
  });
  return 'CREATED';
}
