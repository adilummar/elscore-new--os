import { DEFERRED_TABS, GENDERS, MARITAL_STATUSES, PROFILE_TABS, TUTOR_STATUSES, formatAddress, visibleTabs } from './constants';

describe('tutor constants', () => {
  it('has the five separate statuses and the confirmed options', () => {
    expect(TUTOR_STATUSES.map((s) => s.value)).toEqual(['ACTIVE', 'INACTIVE', 'PAUSED', 'SUSPENDED', 'DISCONTINUED']);
    expect(GENDERS.map((g) => g.label)).toEqual(['Male', 'Female', 'Other', 'Prefer not to say']);
    expect(MARITAL_STATUSES.map((g) => g.label)).toEqual(['Single', 'Married', 'Divorced', 'Widowed', 'Prefer not to say']);
  });
  it('hides HR-only sections from viewers without HR notes access', () => {
    expect(visibleTabs(false)).not.toContain('HR Internal Notes');
    expect(visibleTabs(false)).not.toContain('History & Status');
    expect(visibleTabs(true)).toEqual([...PROFILE_TABS]);
    expect(DEFERRED_TABS).toContain('Salary');
    expect(DEFERRED_TABS).not.toContain('Feedback & Observations');
  });
  it('formats addresses without empty parts', () => {
    expect(formatAddress({ permHouse: 'Rose Villa', permDistrict: 'Malappuram', permPin: null }, 'perm')).toBe('Rose Villa, Malappuram');
  });
});
