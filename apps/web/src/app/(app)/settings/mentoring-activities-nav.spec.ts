import { getSettingsNavigationLinks } from './settings-navigation-links';

describe('the Mentoring Activities settings link', () => {
  it('shows only with the permission that manages Mentoring templates', () => {
    expect(getSettingsNavigationLinks((p) => p === 'mentoring.template.manage').map((l) => l.href)).toEqual(['/settings', '/settings/mentoring-activities']);
    expect(getSettingsNavigationLinks(() => false).some((l) => l.href === '/settings/mentoring-activities')).toBe(false);
  });
});
