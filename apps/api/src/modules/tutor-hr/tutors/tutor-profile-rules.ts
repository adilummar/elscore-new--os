/** Pure rules for the HR tutor profile (Tutor Management Requirements, sections 3 and 9). */

export const TUTOR_STATUSES = ['ACTIVE', 'INACTIVE', 'PAUSED', 'SUSPENDED', 'DISCONTINUED'] as const;
export type TutorStatus = (typeof TUTOR_STATUSES)[number];

export const GENDERS = ['MALE', 'FEMALE', 'OTHER', 'PREFER_NOT_TO_SAY'] as const;
export const MARITAL_STATUSES = ['SINGLE', 'MARRIED', 'DIVORCED', 'WIDOWED', 'PREFER_NOT_TO_SAY'] as const;

export const EMERGENCY_CONTACT_ALERT = 'You may receive a verification call to the emergency contact number provided.';

export class TutorProfileRuleError extends Error {}

/** HR may move a tutor between any two statuses; a reason is always required. */
export function assertStatusChange(current: TutorStatus, next: TutorStatus, reason?: string | null): void {
  if (!TUTOR_STATUSES.includes(next)) throw new TutorProfileRuleError('Unknown status');
  if (current === next) throw new TutorProfileRuleError('The tutor already has this status');
  if (!reason?.trim()) throw new TutorProfileRuleError('A reason is required for every status change');
}

/** Bank account numbers are shown as the last 4 digits everywhere except to HR Staff / HR Head. */
export function maskAccountNumber(n?: string | null): string | null {
  if (!n) return null;
  const digits = n.replace(/\s/g, '');
  return digits.length <= 4 ? '••••' : `••••${digits.slice(-4)}`;
}

export const ADDRESS_FIELDS = ['House', 'Village', 'District', 'Pin', 'State', 'Country'] as const;
type AddressKey = `perm${(typeof ADDRESS_FIELDS)[number]}` | `cur${(typeof ADDRESS_FIELDS)[number]}`;
export type AddressRecord = Partial<Record<AddressKey, string | null>>;

/** "Current address same as permanent": the current fields take the permanent values. */
export function copyPermanentToCurrent<T extends AddressRecord>(d: T): T {
  const out: AddressRecord = { ...d };
  for (const f of ADDRESS_FIELDS) out[`cur${f}`] = d[`perm${f}`] ?? null;
  return out as T;
}

/** Digits-only comparison key, tolerant of +91 / 0 prefixes on Indian numbers. */
export function phoneKey(p?: string | null): string {
  let d = (p ?? '').replace(/\D/g, '').replace(/^0+/, '');
  if (d.length === 12 && d.startsWith('91')) d = d.slice(2);
  return d;
}

/** The primary emergency contact number must differ from the tutor's registered phone. */
export function assertPrimaryDiffers(primaryPhone: string, tutorPhones: Array<string | null | undefined>): void {
  const key = phoneKey(primaryPhone);
  if (tutorPhones.some((t) => t && phoneKey(t) === key)) {
    throw new TutorProfileRuleError("The primary emergency contact number must differ from the tutor's registered phone");
  }
}

/** Items still missing from a profile; shown to HR so incomplete profiles are obvious. */
export function profileGaps(p: {
  hasPrimaryContact: boolean; gender?: string | null; permDistrict?: string | null; bankAccountNumber?: string | null; qualifications: number;
}): string[] {
  const gaps: string[] = [];
  if (!p.hasPrimaryContact) gaps.push('Primary emergency contact');
  if (!p.gender) gaps.push('Gender');
  if (!p.permDistrict) gaps.push('Permanent address');
  if (!p.bankAccountNumber) gaps.push('Bank details');
  if (!p.qualifications) gaps.push('Educational qualifications');
  return gaps;
}
