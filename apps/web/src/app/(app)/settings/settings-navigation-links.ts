export interface SettingsNavLink {
  name: string;
  href: string;
}

export function getSettingsNavigationLinks(hasPermission: (permission: string) => boolean): SettingsNavLink[] {
  return [
    { name: 'Overview', href: '/settings' },
    ...(hasPermission('user.read') ? [{ name: 'Users', href: '/settings/users' }] : []),
    ...(hasPermission('employee.read-all') ? [{ name: 'Employees', href: '/settings/employees' }] : []),
    ...(hasPermission('role.read') ? [{ name: 'Roles', href: '/settings/roles' }] : []),
    ...(hasPermission('role.read') ? [{ name: 'Permissions', href: '/settings/permissions' }] : []),
    ...(hasPermission('role.assign') ? [{ name: 'Delegations', href: '/settings/delegations' }] : []),
    ...(hasPermission('pricing.manage') ? [{ name: 'Pricing', href: '/settings/pricing' }] : []),
    ...(hasPermission('payroll.run.read') ? [{ name: 'Payroll & Payables', href: '/settings/payroll' }] : []),
    ...(hasPermission('vacancy.read') ? [{ name: 'Workforce & Vacancies', href: '/settings/vacancies' }] : []),
    ...(hasPermission('candidate.read') ? [{ name: 'Candidates & Offers', href: '/settings/candidates' }] : []),
    ...(hasPermission('onboarding.read') ? [{ name: 'Onboarding & Probation', href: '/settings/onboarding' }] : []),
    ...(hasPermission('performance.read.own') ? [{ name: 'Performance', href: '/settings/performance' }] : []),
    ...(hasPermission('reference.manage') ? [{ name: 'Reference Data', href: '/settings/reference-data' }] : []),
    ...(hasPermission('attendance.settings.manage') ? [{ name: 'Attendance', href: '/settings/attendance' }] : []),
    ...(hasPermission('audit.view') ? [{ name: 'Audit', href: '/settings/audit' }] : [])
  ];
}
