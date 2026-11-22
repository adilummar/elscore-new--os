/**
 * Phone normalization for candidate duplicate detection.
 * Output is a canonical E.164-style digit string without "+" (e.g. "919876543210"),
 * used as the unique key. Country code defaults to India (+91).
 */
export const DEFAULT_COUNTRY_CODE = '+91';

export interface NormalizedPhone {
  /** e.g. "+91" */
  countryCode: string;
  /** National significant number, digits only, no trunk zero. */
  nationalNumber: string;
  /** countryCode digits + national number, e.g. "919876543210". */
  normalized: string;
}

export class InvalidPhoneError extends Error {}

export function normalizeCountryCode(raw: string | undefined | null): string {
  const digits = (raw ?? DEFAULT_COUNTRY_CODE).replace(/\D/g, '');
  if (!/^[1-9]\d{0,3}$/.test(digits)) throw new InvalidPhoneError('Invalid country code');
  return `+${digits}`;
}

export function normalizePhone(rawPhone: string, rawCountryCode?: string | null): NormalizedPhone {
  if (!rawPhone || !rawPhone.trim()) throw new InvalidPhoneError('Phone number is required');
  const countryCode = normalizeCountryCode(rawCountryCode);
  const ccDigits = countryCode.slice(1);

  const hadPlus = rawPhone.trim().startsWith('+');
  let digits = rawPhone.replace(/\D/g, '');
  if (hadPlus || digits.startsWith('00')) {
    // International format typed in the phone field: it must carry the selected country code.
    if (digits.startsWith('00')) digits = digits.slice(2);
    if (!digits.startsWith(ccDigits)) {
      throw new InvalidPhoneError('Phone number does not match the selected country code');
    }
    digits = digits.slice(ccDigits.length);
  }
  digits = digits.replace(/^0+/, ''); // trunk prefix

  // India: tolerate a pasted "91XXXXXXXXXX" without "+".
  if (ccDigits === '91' && digits.length === 12 && digits.startsWith('91')) digits = digits.slice(2);

  if (ccDigits === '91' && !/^[6-9]\d{9}$/.test(digits)) {
    throw new InvalidPhoneError('Indian mobile numbers must be 10 digits starting with 6-9');
  }
  if (digits.length < 4 || ccDigits.length + digits.length > 15) {
    throw new InvalidPhoneError('Phone number length is invalid');
  }
  return { countryCode, nationalNumber: digits, normalized: ccDigits + digits };
}
