import { maskBankAccount, maskPanNumber } from './financial-masking.util';

describe('Financial Identifier Privacy Masking (SEC-COMP-004)', () => {
  describe('maskBankAccount', () => {
    it('masks standard 12-digit account number', () => {
      expect(maskBankAccount('123456789012')).toBe('•••• 9012');
    });

    it('masks 16-digit account number', () => {
      expect(maskBankAccount('1122334455667788')).toBe('•••• 7788');
    });

    it('safely handles short input <= 4 characters', () => {
      expect(maskBankAccount('1234')).toBe('•••• 1234');
      expect(maskBankAccount('99')).toBe('•••• 99');
      expect(maskBankAccount('1')).toBe('•••• 1');
    });

    it('safely handles null, undefined, empty, and whitespace strings', () => {
      expect(maskBankAccount(null)).toBe('—');
      expect(maskBankAccount(undefined)).toBe('—');
      expect(maskBankAccount('')).toBe('—');
      expect(maskBankAccount('   ')).toBe('—');
    });

    it('trims leading and trailing whitespace', () => {
      expect(maskBankAccount('  123456789012  ')).toBe('•••• 9012');
    });
  });

  describe('maskPanNumber', () => {
    it('masks standard 10-character PAN number', () => {
      expect(maskPanNumber('ABCDE1234F')).toBe('••••••234F');
    });

    it('safely handles short input <= 4 characters', () => {
      expect(maskPanNumber('ABCD')).toBe('••••ABCD');
      expect(maskPanNumber('AB')).toBe('••••AB');
      expect(maskPanNumber('A')).toBe('••••A');
    });

    it('safely handles null, undefined, empty, and whitespace strings', () => {
      expect(maskPanNumber(null)).toBe('—');
      expect(maskPanNumber(undefined)).toBe('—');
      expect(maskPanNumber('')).toBe('—');
      expect(maskPanNumber('   ')).toBe('—');
    });

    it('trims leading and trailing whitespace', () => {
      expect(maskPanNumber('  ABCDE1234F  ')).toBe('••••••234F');
    });
  });
});
