import { getHrSubItems, isHrRouteActive, isNavItemActive, HR_ROUTES } from './sidebar-navigation';

describe('sidebar-navigation', () => {
  describe('getHrSubItems', () => {
    it('returns all 7 sub-items when user has full HR permissions', () => {
      const hrPermissions = new Set([
        'employee.read-all',
        'vacancy.read',
        'candidate.read',
        'onboarding.read',
        'payroll.run.read',
        'performance.read.own',
        'tutor_lead.read',
      ]);
      const hasPermission = (p: string) => hrPermissions.has(p);

      const items = getHrSubItems(hasPermission, false);
      expect(items).toHaveLength(7);
      expect(items.map((i) => i.name)).toEqual([
        'Employees',
        'Workforce & Vacancies',
        'Candidates & Offers',
        'Onboarding & Probation',
        'Payroll & Payables',
        'Performance',
        'Tutor HR',
      ]);
      expect(items.map((i) => i.href)).toEqual([
        '/settings/employees',
        '/settings/vacancies',
        '/settings/candidates',
        '/settings/onboarding',
        '/settings/payroll',
        '/settings/performance',
        '/tutor-hr',
      ]);
    });

    it('returns all 7 sub-items for CEO regardless of explicit permissions', () => {
      const hasPermission = () => false;
      const items = getHrSubItems(hasPermission, true);
      expect(items).toHaveLength(7);
      expect(items.map((i) => i.name)).toEqual([
        'Employees',
        'Workforce & Vacancies',
        'Candidates & Offers',
        'Onboarding & Probation',
        'Payroll & Payables',
        'Performance',
        'Tutor HR',
      ]);
    });

    it('returns empty array when user has no HR permissions', () => {
      const nonHrPermissions = new Set(['lead.read', 'lead.create', 'demo.read']);
      const hasPermission = (p: string) => nonHrPermissions.has(p);

      const items = getHrSubItems(hasPermission, false);
      expect(items).toEqual([]);
    });

    it('handles selective/granular permission grants correctly', () => {
      // Only Vacancies
      const vacancyUser = (p: string) => p === 'vacancy.read';
      const vacancyItems = getHrSubItems(vacancyUser, false);
      expect(vacancyItems).toHaveLength(1);
      expect(vacancyItems[0].name).toBe('Workforce & Vacancies');
      expect(vacancyItems[0].href).toBe('/settings/vacancies');

      // Only Candidates & Offers
      const candidateUser = (p: string) => p === 'candidate.read';
      const candidateItems = getHrSubItems(candidateUser, false);
      expect(candidateItems).toHaveLength(1);
      expect(candidateItems[0].name).toBe('Candidates & Offers');

      // Only Onboarding
      const onboardingUser = (p: string) => p === 'onboarding.read';
      const onboardingItems = getHrSubItems(onboardingUser, false);
      expect(onboardingItems).toHaveLength(1);
      expect(onboardingItems[0].name).toBe('Onboarding & Probation');

      // Only Payroll
      const payrollUser = (p: string) => p === 'payroll.run.read';
      const payrollItems = getHrSubItems(payrollUser, false);
      expect(payrollItems).toHaveLength(1);
      expect(payrollItems[0].name).toBe('Payroll & Payables');

      // Only Performance (team scope)
      const performanceUser = (p: string) => p === 'performance.read.team';
      const performanceItems = getHrSubItems(performanceUser, false);
      expect(performanceItems).toHaveLength(1);
      expect(performanceItems[0].name).toBe('Performance');

      // Only Tutor HR (manage scope)
      const tutorUser = (p: string) => p === 'tutor_lead.manage';
      const tutorItems = getHrSubItems(tutorUser, false);
      expect(tutorItems).toHaveLength(1);
      expect(tutorItems[0].name).toBe('Tutor HR');
    });

    it('resolves employee read alternative permissions', () => {
      const operationalEmployeeRead = (p: string) => p === 'employee.read';
      const items = getHrSubItems(operationalEmployeeRead, false);
      expect(items).toHaveLength(1);
      expect(items[0].name).toBe('Employees');
      expect(items[0].href).toBe('/settings/employees');
    });
  });

  describe('isHrRouteActive', () => {
    it('returns true for exact HR module routes', () => {
      for (const route of HR_ROUTES) {
        expect(isHrRouteActive(route)).toBe(true);
      }
    });

    it('returns true for nested child routes of HR modules', () => {
      expect(isHrRouteActive('/settings/employees/EMP-001')).toBe(true);
      expect(isHrRouteActive('/settings/vacancies/new')).toBe(true);
      expect(isHrRouteActive('/settings/candidates/123/interview')).toBe(true);
      expect(isHrRouteActive('/settings/onboarding/tasks')).toBe(true);
      expect(isHrRouteActive('/settings/payroll/run/preview')).toBe(true);
      expect(isHrRouteActive('/settings/performance/cycles/2026-Q1')).toBe(true);
      expect(isHrRouteActive('/tutor-hr/pipeline/tutor-123')).toBe(true);
      expect(isHrRouteActive('/employees/overview')).toBe(true);
    });

    it('returns false for unrelated settings and application routes', () => {
      expect(isHrRouteActive('/dashboard')).toBe(false);
      expect(isHrRouteActive('/sales')).toBe(false);
      expect(isHrRouteActive('/leads')).toBe(false);
      expect(isHrRouteActive('/leads/123')).toBe(false);
      expect(isHrRouteActive('/attendance')).toBe(false);
      expect(isHrRouteActive('/leaves')).toBe(false);
      expect(isHrRouteActive('/settings')).toBe(false);
      expect(isHrRouteActive('/settings/pricing')).toBe(false);
      expect(isHrRouteActive('/settings/roles')).toBe(false);
    });

    it('returns false for null, undefined, and empty string', () => {
      expect(isHrRouteActive(null)).toBe(false);
      expect(isHrRouteActive(undefined)).toBe(false);
      expect(isHrRouteActive('')).toBe(false);
    });
  });

  describe('isNavItemActive', () => {
    it('returns true for Settings link on root settings hub and non-HR settings subpages', () => {
      expect(isNavItemActive('/settings', '/settings')).toBe(true);
      expect(isNavItemActive('/settings', '/settings/users')).toBe(true);
      expect(isNavItemActive('/settings', '/settings/roles')).toBe(true);
      expect(isNavItemActive('/settings', '/settings/permissions')).toBe(true);
      expect(isNavItemActive('/settings', '/settings/delegations')).toBe(true);
      expect(isNavItemActive('/settings', '/settings/pricing')).toBe(true);
      expect(isNavItemActive('/settings', '/settings/reference-data')).toBe(true);
      expect(isNavItemActive('/settings', '/settings/attendance')).toBe(true);
      expect(isNavItemActive('/settings', '/settings/audit')).toBe(true);
    });

    it('regression: does not highlight Settings link when on HR module routes', () => {
      expect(isNavItemActive('/settings', '/settings/vacancies')).toBe(false);
      expect(isNavItemActive('/settings', '/settings/payroll')).toBe(false);
      expect(isNavItemActive('/settings', '/settings/performance')).toBe(false);
      expect(isNavItemActive('/settings', '/settings/employees')).toBe(false);
      expect(isNavItemActive('/settings', '/settings/candidates')).toBe(false);
      expect(isNavItemActive('/settings', '/settings/onboarding')).toBe(false);
      expect(isNavItemActive('/settings', '/employees')).toBe(false);
      expect(isNavItemActive('/settings', '/tutor-hr')).toBe(false);
    });

    it('regression: does not highlight Settings link on nested child routes of HR modules', () => {
      expect(isNavItemActive('/settings', '/settings/vacancies/new')).toBe(false);
      expect(isNavItemActive('/settings', '/settings/payroll/run/123')).toBe(false);
      expect(isNavItemActive('/settings', '/settings/performance/cycles/2026-Q1')).toBe(false);
      expect(isNavItemActive('/settings', '/settings/employees/EMP-001')).toBe(false);
      expect(isNavItemActive('/settings', '/settings/candidates/CAN-999/interview')).toBe(false);
      expect(isNavItemActive('/settings', '/settings/onboarding/tasks/TASK-1')).toBe(false);
    });

    it('correctly identifies active states for standard non-settings nav items', () => {
      expect(isNavItemActive('/dashboard', '/dashboard')).toBe(true);
      expect(isNavItemActive('/dashboard', '/attendance')).toBe(false);
      expect(isNavItemActive('/attendance', '/attendance')).toBe(true);
      expect(isNavItemActive('/leaves', '/leaves')).toBe(true);
      expect(isNavItemActive('/staffs', '/staffs')).toBe(true);
      expect(isNavItemActive('/sales', '/sales')).toBe(true);
      expect(isNavItemActive('/sales', '/sales/pipeline')).toBe(true);
      expect(isNavItemActive('/leads', '/leads')).toBe(true);
      expect(isNavItemActive('/leads', '/leads/123')).toBe(true);
    });

    it('returns false for null, undefined, or empty pathname', () => {
      expect(isNavItemActive('/settings', null)).toBe(false);
      expect(isNavItemActive('/settings', undefined)).toBe(false);
      expect(isNavItemActive('/settings', '')).toBe(false);
    });
  });
});
