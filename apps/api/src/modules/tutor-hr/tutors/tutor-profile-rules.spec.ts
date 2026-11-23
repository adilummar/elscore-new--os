import {
  assertPrimaryDiffers, assertStatusChange, copyPermanentToCurrent, maskAccountNumber, phoneKey, profileGaps, TutorProfileRuleError,
} from './tutor-profile-rules';

describe('tutor profile rules', () => {
  it('allows any status change but always needs a reason', () => {
    expect(() => assertStatusChange('INACTIVE', 'ACTIVE', 'started classes')).not.toThrow();
    expect(() => assertStatusChange('DISCONTINUED', 'INACTIVE', 'rejoined, not teaching yet')).not.toThrow();
    expect(() => assertStatusChange('SUSPENDED', 'ACTIVE', 'suspension lifted')).not.toThrow();
    expect(() => assertStatusChange('ACTIVE', 'PAUSED', '  ')).toThrow(/reason/);
    expect(() => assertStatusChange('ACTIVE', 'ACTIVE', 'x')).toThrow(TutorProfileRuleError);
  });

  it('masks account numbers to the last 4 digits', () => {
    expect(maskAccountNumber('123456789012')).toBe('••••9012');
    expect(maskAccountNumber('123')).toBe('••••');
    expect(maskAccountNumber(null)).toBeNull();
  });

  it('copies the permanent address into the current address', () => {
    const out = copyPermanentToCurrent({ permHouse: 'Rose Villa', permDistrict: 'Malappuram', permPin: '676505', curHouse: 'old' });
    expect(out).toMatchObject({ curHouse: 'Rose Villa', curDistrict: 'Malappuram', curPin: '676505', curState: null });
  });

  it('rejects a primary emergency number equal to the tutor phone in any format', () => {
    expect(phoneKey('+91 98765 43210')).toBe(phoneKey('09876543210'));
    expect(() => assertPrimaryDiffers('+919876543210', ['9876543210'])).toThrow(/must differ/);
    expect(() => assertPrimaryDiffers('+919876543211', ['+919876543210', null])).not.toThrow();
  });

  it('lists what is missing from a profile', () => {
    expect(profileGaps({ hasPrimaryContact: false, qualifications: 0 })).toEqual([
      'Primary emergency contact', 'Gender', 'Permanent address', 'Bank details', 'Educational qualifications',
    ]);
    expect(profileGaps({ hasPrimaryContact: true, gender: 'FEMALE', permDistrict: 'x', bankAccountNumber: '1', qualifications: 1 })).toEqual([]);
  });
});
