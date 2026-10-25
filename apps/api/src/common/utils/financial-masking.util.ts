/**
 * Financial Identifier Privacy Utilities (HR Phase 2 Remediation)
 *
 * Provides safe masking helpers for sensitive banking and tax identifiers:
 * - Bank Account Number
 * - Permanent Account Number (PAN)
 *
 * Gracefully handles null, undefined, empty strings, whitespace,
 * short inputs, and malformed inputs without throwing exceptions.
 */

/**
 * Safely masks a bank account number showing only the last 4 digits.
 */
export function maskBankAccount(account?: string | null): string {
  if (!account) return '—';
  const clean = account.trim();
  if (clean.length === 0) return '—';
  if (clean.length <= 4) return '•••• ' + clean;
  return '•••• ' + clean.slice(-4);
}

/**
 * Safely masks a PAN number showing only the last 4 characters.
 */
export function maskPanNumber(pan?: string | null): string {
  if (!pan) return '—';
  const clean = pan.trim();
  if (clean.length === 0) return '—';
  if (clean.length <= 4) return '••••' + clean;
  return '••••••' + clean.slice(-4);
}
