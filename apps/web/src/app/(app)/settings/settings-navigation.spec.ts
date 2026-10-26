import * as fs from 'fs';
import * as path from 'path';
import { getSettingsNavigationLinks } from './settings-navigation-links';

describe('Settings Navigation & Layout Regression Tests', () => {
  describe('getSettingsNavigationLinks', () => {
    it('always includes Overview as the first link', () => {
      const links = getSettingsNavigationLinks(() => false);
      expect(links).toHaveLength(1);
      expect(links[0]).toEqual({ name: 'Overview', href: '/settings' });
    });

    it('returns all 15 settings tabs when user has all relevant permissions', () => {
      const allPermissions = new Set([
        'user.read',
        'employee.read-all',
        'role.read',
        'role.assign',
        'pricing.manage',
        'payroll.run.read',
        'vacancy.read',
        'candidate.read',
        'onboarding.read',
        'performance.read.own',
        'reference.manage',
        'attendance.settings.manage',
        'audit.view',
      ]);
      const links = getSettingsNavigationLinks((p) => allPermissions.has(p));

      expect(links.map((l) => l.name)).toEqual([
        'Overview',
        'Users',
        'Employees',
        'Roles',
        'Permissions',
        'Delegations',
        'Pricing',
        'Payroll & Payables',
        'Workforce & Vacancies',
        'Candidates & Offers',
        'Onboarding & Probation',
        'Performance',
        'Reference Data',
        'Attendance',
        'Audit',
      ]);

      expect(links.map((l) => l.href)).toEqual([
        '/settings',
        '/settings/users',
        '/settings/employees',
        '/settings/roles',
        '/settings/permissions',
        '/settings/delegations',
        '/settings/pricing',
        '/settings/payroll',
        '/settings/vacancies',
        '/settings/candidates',
        '/settings/onboarding',
        '/settings/performance',
        '/settings/reference-data',
        '/settings/attendance',
        '/settings/audit',
      ]);
    });

    it('correctly includes HR-specific modules when HR permissions are granted', () => {
      const hrPermissions = new Set([
        'employee.read-all',
        'payroll.run.read',
        'vacancy.read',
        'candidate.read',
        'onboarding.read',
        'performance.read.own',
      ]);
      const links = getSettingsNavigationLinks((p) => hrPermissions.has(p));

      const hrTabNames = [
        'Employees',
        'Payroll & Payables',
        'Workforce & Vacancies',
        'Candidates & Offers',
        'Onboarding & Probation',
        'Performance',
      ];

      for (const name of hrTabNames) {
        expect(links.some((l) => l.name === name)).toBe(true);
      }
    });

    it('excludes HR modules when permissions are missing', () => {
      const links = getSettingsNavigationLinks((p) => p === 'pricing.manage');
      expect(links.map((l) => l.name)).toEqual(['Overview', 'Pricing']);
    });
  });

  describe('Single-Source-of-Truth Architecture Regression', () => {
    const settingsDir = path.resolve(__dirname);

    it('verifies that SettingsLayout is the sole renderer of SettingsNavigation', () => {
      const layoutPath = path.join(settingsDir, 'layout.tsx');
      expect(fs.existsSync(layoutPath)).toBe(true);
      const layoutContent = fs.readFileSync(layoutPath, 'utf8');

      // SettingsLayout must render SettingsNavigation
      expect(layoutContent).toContain('SettingsNavigation');
      expect(layoutContent).toContain('<SettingsNavigation />');
      expect(layoutContent).toContain('{children}');
    });

    it('guarantees that no individual page component renders a duplicate SettingsNavigation', () => {
      function findPageFiles(dir: string): string[] {
        let results: string[] = [];
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);
          if (entry.isDirectory()) {
            results = results.concat(findPageFiles(fullPath));
          } else if (entry.name === 'page.tsx') {
            results.push(fullPath);
          }
        }
        return results;
      }

      const pageFiles = findPageFiles(settingsDir);
      expect(pageFiles.length).toBeGreaterThan(0);

      const violatingPages: string[] = [];

      for (const file of pageFiles) {
        const content = fs.readFileSync(file, 'utf8');
        if (content.includes('<SettingsNavigation') || content.includes('SettingsNavigation')) {
          const relativePath = path.relative(settingsDir, file);
          violatingPages.push(relativePath);
        }
      }

      // Zero settings pages should import or render SettingsNavigation
      expect(violatingPages).toEqual([]);
    });

    it('specifically verifies performance, candidates, onboarding, and vacancies pages', () => {
      const targetPages = [
        'performance/page.tsx',
        'candidates/page.tsx',
        'onboarding/page.tsx',
        'vacancies/page.tsx',
      ];

      for (const pageRelPath of targetPages) {
        const filePath = path.join(settingsDir, pageRelPath);
        expect(fs.existsSync(filePath)).toBe(true);
        const content = fs.readFileSync(filePath, 'utf8');

        expect(content).not.toContain('<SettingsNavigation');
        expect(content).not.toContain('SettingsNavigation');
      }
    });
  });
});
