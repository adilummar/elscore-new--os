import { generateTemporaryPassword } from './temp-password.util';

describe('generateTemporaryPassword', () => {
  it('has the requested length and every character class', () => {
    for (let i = 0; i < 200; i++) {
      const p = generateTemporaryPassword();
      expect(p).toHaveLength(14);
      expect(p).toMatch(/[A-Z]/);
      expect(p).toMatch(/[a-z]/);
      expect(p).toMatch(/[2-9]/);
      expect(p).toMatch(/[!@#$%*?]/);
      expect(p).not.toMatch(/[0O1lI\s]/);
    }
  });
  it('does not repeat across calls and refuses short passwords', () => {
    const seen = new Set(Array.from({ length: 500 }, () => generateTemporaryPassword()));
    expect(seen.size).toBe(500);
    expect(() => generateTemporaryPassword(8)).toThrow();
  });
});
