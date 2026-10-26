import {
  Briefcase,
  Users,
  UserPlus,
  UserCheck,
  DollarSign,
  Award,
  GraduationCap,
  type LucideIcon,
} from 'lucide-react';

export interface HrSubItem {
  name: string;
  href: string;
  icon: LucideIcon;
  permission: string;
}

/**
 * Derives accessible sub-items for the expandable HR Management sidebar group
 * based on the authenticated user's permissions.
 */
export function getHrSubItems(
  hasPermission: (perm: string) => boolean,
  isCeo: boolean = false
): HrSubItem[] {
  const items: HrSubItem[] = [];

  // 1. Employees (Phase 1 & 2)
  if (
    isCeo ||
    hasPermission('employee.read-all') ||
    hasPermission('employee.read') ||
    hasPermission('analytics.ceo.read')
  ) {
    items.push({
      name: 'Employees',
      href: '/settings/employees',
      icon: Briefcase,
      permission: 'employee.read-all',
    });
  }

  // 2. Workforce & Vacancies (Phase 4)
  if (isCeo || hasPermission('vacancy.read')) {
    items.push({
      name: 'Workforce & Vacancies',
      href: '/settings/vacancies',
      icon: Users,
      permission: 'vacancy.read',
    });
  }

  // 3. Candidates & Offers (Phase 5)
  if (isCeo || hasPermission('candidate.read') || hasPermission('offer.read')) {
    items.push({
      name: 'Candidates & Offers',
      href: '/settings/candidates',
      icon: UserPlus,
      permission: 'candidate.read',
    });
  }

  // 4. Onboarding & Probation (Phase 6)
  if (isCeo || hasPermission('onboarding.read') || hasPermission('probation.read')) {
    items.push({
      name: 'Onboarding & Probation',
      href: '/settings/onboarding',
      icon: UserCheck,
      permission: 'onboarding.read',
    });
  }

  // 5. Payroll & Payables (Phase 3)
  if (isCeo || hasPermission('payroll.run.read') || hasPermission('tutor.payable.read')) {
    items.push({
      name: 'Payroll & Payables',
      href: '/settings/payroll',
      icon: DollarSign,
      permission: 'payroll.run.read',
    });
  }

  // 6. Performance Management (Phase 7)
  if (
    isCeo ||
    hasPermission('performance.read.own') ||
    hasPermission('performance.read.team') ||
    hasPermission('performance.read.all')
  ) {
    items.push({
      name: 'Performance',
      href: '/settings/performance',
      icon: Award,
      permission: 'performance.read.own',
    });
  }

  // 7. Tutor HR (Recruitment Pipeline)
  if (isCeo || hasPermission('tutor_lead.read') || hasPermission('tutor_lead.manage')) {
    items.push({
      name: 'Tutor HR',
      href: '/tutor-hr',
      icon: GraduationCap,
      permission: 'tutor_lead.read',
    });
  }

  return items;
}

export const HR_ROUTES = [
  '/settings/employees',
  '/employees',
  '/settings/vacancies',
  '/settings/candidates',
  '/settings/onboarding',
  '/settings/payroll',
  '/settings/performance',
  '/tutor-hr',
];

/**
 * Checks whether the current pathname matches an HR Management sub-route.
 */
export function isHrRouteActive(pathname?: string | null): boolean {
  if (!pathname) return false;
  return HR_ROUTES.some((route) => pathname.startsWith(route));
}

/**
 * Checks whether a top-level sidebar navigation item should be marked active.
 * For `/settings`, returns true only for the root settings hub or non-HR settings subpages
 * (e.g. `/settings/users`, `/settings/roles`), preventing collision with HR Management routes.
 */
export function isNavItemActive(itemHref: string, pathname?: string | null): boolean {
  if (!pathname) return false;
  if (itemHref === '/settings') {
    return pathname === '/settings' || (pathname.startsWith('/settings/') && !isHrRouteActive(pathname));
  }
  return pathname === itemHref || pathname.startsWith(itemHref + '/');
}
