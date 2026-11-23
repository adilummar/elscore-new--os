import { randomInt } from 'crypto';

// Ambiguous characters (0/O, 1/l/I) are left out because HR reads the password out to the tutor.
const UPPER = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const LOWER = 'abcdefghijkmnpqrstuvwxyz';
const DIGITS = '23456789';
const SYMBOLS = '!@#$%*?';
const ALL = UPPER + LOWER + DIGITS + SYMBOLS;

const pick = (set: string) => set[randomInt(set.length)];

/**
 * One-time temporary password for a new tutor account: cryptographically random, at least one
 * character from each class. It is returned to HR once and only its Argon2id hash is stored.
 */
export function generateTemporaryPassword(length = 14): string {
  if (length < 12) throw new Error('Temporary passwords must be at least 12 characters');
  const chars = [pick(UPPER), pick(LOWER), pick(DIGITS), pick(SYMBOLS)];
  while (chars.length < length) chars.push(pick(ALL));
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join('');
}
