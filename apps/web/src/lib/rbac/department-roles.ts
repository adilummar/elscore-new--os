/**
 * Which roles the "Create User" form offers for each department.
 *
 * This is an organisational classification used only to filter the form. It is NOT an authorization rule:
 * the API grants access from the user's roles and permissions (and, for Mentoring, assignment-based scope),
 * never from department membership.
 *
 * - MENTORING lists only the two roles that belong to the Mentoring department.
 * - DEMO_COUNSELOR is deliberately NOT a Mentoring role. It sits with the other demo roles under ACADEMICS and
 *   works Mentoring tasks only through its explicit permissions and assigned-task scope.
 * - MENTOR keeps its existing ACADEMICS entry and is also offered under MENTORING.
 */
export const DEPARTMENT_ROLE_CODES: Readonly<Record<string, readonly string[]>> = {
  // The department code is ADMIN (name "Administration"). The key used to be ADMINISTRATION, which matched no
  // department, so that dropdown was empty as well.
  ADMIN: ['CEO', 'CO_FOUNDER', 'OPERATIONS_MANAGER'],
  MARKETING: ['MARKETING_HEAD', 'PERFORMANCE_MARKETER', 'DESIGNER'],
  SALES: ['SALES_HEAD', 'SALES_COUNSELLOR'],
  ACADEMICS: ['ACADEMIC_HEAD', 'DEMO_HEAD', 'DEMO_ADMIN', 'MENTOR', 'DEMO_COORDINATOR', 'DEMO_COUNSELOR', 'TUTOR'],
  FINANCE: ['FINANCE_HEAD', 'FINANCE_MANAGER', 'FINANCE_EXECUTIVE', 'ACCOUNTANT'],
  HR: ['HR_MANAGER', 'HR_EXECUTIVE', 'HR_ASSISTANT'],
  MENTORING: ['MENTORING_HEAD', 'MENTOR'],
};

/** Roles offered for a department. With no department selected every role is returned (the field is disabled then). */
export function filterRolesForDepartment<T extends { code: string }>(roles: readonly T[], departmentCode?: string): T[] {
  if (!departmentCode) return [...roles];
  const allowed = DEPARTMENT_ROLE_CODES[departmentCode] ?? [];
  return roles.filter((role) => allowed.includes(role.code));
}
