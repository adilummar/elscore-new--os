import { InvalidPhoneError, normalizePhone } from './phone.util';

describe('normalizePhone', () => {
  it('defaults to India and normalizes formatting', () => {
    expect(normalizePhone('98765 43210').normalized).toBe('919876543210');
    expect(normalizePhone('098765-43210').normalized).toBe('919876543210');
    expect(normalizePhone('+91 98765 43210', '+91').normalized).toBe('919876543210');
    expect(normalizePhone('919876543210').normalized).toBe('919876543210');
  });
  it('treats equivalent inputs as the same candidate', () => {
    expect(normalizePhone('9876543210', '91').normalized).toBe(normalizePhone('+919876543210', '+91').normalized);
  });
  it('supports international codes', () => {
    const p = normalizePhone('50 123 4567', '+971');
    expect(p).toEqual({ countryCode: '+971', nationalNumber: '501234567', normalized: '971501234567' });
  });
  it('does not collide across countries', () => {
    expect(normalizePhone('5012345678', '+1').normalized).not.toBe(normalizePhone('5012345678', '+44').normalized);
  });
  it('rejects mismatched country code and bad numbers', () => {
    expect(() => normalizePhone('+971501234567', '+91')).toThrow(InvalidPhoneError);
    expect(() => normalizePhone('12345', '+91')).toThrow(InvalidPhoneError);
    expect(() => normalizePhone('', '+91')).toThrow(InvalidPhoneError);
    expect(() => normalizePhone('9876543210', 'abc')).toThrow(InvalidPhoneError);
  });
});
