// Shared (client + server safe) Tutors constants.
import type { BadgeVariant } from '../hiring/constants';

export const TUTOR_STATUSES = [
  { value: 'ACTIVE', label: 'Active' },
  { value: 'INACTIVE', label: 'Inactive' },
  { value: 'PAUSED', label: 'Paused' },
  { value: 'SUSPENDED', label: 'Suspended' },
  { value: 'DISCONTINUED', label: 'Discontinued' },
] as const;

export const STATUS_VARIANT: Record<string, BadgeVariant> = {
  ACTIVE: 'success', INACTIVE: 'default', PAUSED: 'warning', SUSPENDED: 'danger', DISCONTINUED: 'default',
};

export const GENDERS = [
  { value: 'MALE', label: 'Male' },
  { value: 'FEMALE', label: 'Female' },
  { value: 'OTHER', label: 'Other' },
  { value: 'PREFER_NOT_TO_SAY', label: 'Prefer not to say' },
] as const;

export const MARITAL_STATUSES = [
  { value: 'SINGLE', label: 'Single' },
  { value: 'MARRIED', label: 'Married' },
  { value: 'DIVORCED', label: 'Divorced' },
  { value: 'WIDOWED', label: 'Widowed' },
  { value: 'PREFER_NOT_TO_SAY', label: 'Prefer not to say' },
] as const;

/** Profile sections in the order the requirements list them. */
export const PROFILE_TABS = [
  'Profile', 'Students', 'Availability', 'Exams', 'Salary', 'Class History', 'Feedback & Observations', 'HR Internal Notes', 'History & Status',
] as const;
export type ProfileTab = (typeof PROFILE_TABS)[number];

/** Sections that depend on Mentoring class records or Pay Slab and are not built yet. */
export const DEFERRED_TABS: ProfileTab[] = ['Students', 'Availability', 'Exams', 'Salary', 'Class History', 'Feedback & Observations'];

/** HR-only sections; hidden from everyone without HR Internal Notes access (including the Tutor Head). */
export const HR_ONLY_TABS: ProfileTab[] = ['HR Internal Notes', 'History & Status'];

export function visibleTabs(canSeeHrOnly: boolean): ProfileTab[] {
  return PROFILE_TABS.filter((t) => canSeeHrOnly || !HR_ONLY_TABS.includes(t));
}

export const ADDRESS_PARTS = [
  { key: 'House', label: 'House number / name' },
  { key: 'Village', label: 'Village / town' },
  { key: 'District', label: 'District' },
  { key: 'Pin', label: 'PIN code' },
  { key: 'State', label: 'State' },
  { key: 'Country', label: 'Country' },
] as const;

export function formatAddress(p: any, prefix: 'perm' | 'cur'): string {
  return ADDRESS_PARTS.map((a) => p?.[`${prefix}${a.key}`]).filter(Boolean).join(', ');
}
