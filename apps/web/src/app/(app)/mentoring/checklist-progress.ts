/**
 * Checklist presentation for a stage: item status, grouping and progress.
 * `isItemResolved` follows the same rule the API enforces when a stage is verified (the API is the authority):
 * an item is resolved when the Mentor completed it, marked it unavailable / not applicable WITH a reason,
 * or the Mentoring Head authorised an exception for it. An ordinary tick is never an exception.
 */
export interface ChecklistItemView {
  key: string;
  label: string;
  mandatory: boolean;
  state: string;
  reason?: string | null;
  note?: string | null;
  evidenceRef?: string | null;
  group?: string | null;
  groupLabel?: string | null;
  /** The information this requirement depends on, and whether each piece has a value yet. */
  requires?: Array<{ key: string; label: string; collected: boolean }>;
  exception?: boolean;
  exceptionDetail?: { reason: string; authorizedByName: string | null; at: string } | null;
  updatedByName?: string | null;
  updatedAt?: string | null;
}

export type ItemStatus = 'COMPLETED' | 'AWAITING_VERIFICATION' | 'UNAVAILABLE' | 'NOT_APPLICABLE' | 'EXCEPTION' | 'PENDING';

export const ITEM_STATUS_LABELS: Readonly<Record<ItemStatus, string>> = {
  COMPLETED: 'Completed',
  AWAITING_VERIFICATION: 'Collected, awaiting verification',
  UNAVAILABLE: 'Unavailable',
  NOT_APPLICABLE: 'Not applicable',
  EXCEPTION: 'Exception authorised',
  PENDING: 'Pending',
};

/** Green for done, amber for an exception or something waiting on someone, neutral for pending and reasoned skips. */
export const ITEM_STATUS_VARIANT: Readonly<Record<ItemStatus, 'success' | 'warning' | 'default' | 'info'>> = {
  COMPLETED: 'success',
  AWAITING_VERIFICATION: 'info',
  UNAVAILABLE: 'default',
  NOT_APPLICABLE: 'default',
  EXCEPTION: 'warning',
  PENDING: 'default',
};

const hasReason = (item: ChecklistItemView) => typeof item.reason === 'string' && item.reason.trim().length > 0;

export function isItemResolved(item: ChecklistItemView): boolean {
  if (item.exception) return true;
  if (item.state === 'VERIFIED') return true;
  return (item.state === 'UNAVAILABLE' || item.state === 'NOT_APPLICABLE') && hasReason(item);
}

export function itemStatus(item: ChecklistItemView): ItemStatus {
  if (item.state === 'VERIFIED') return 'COMPLETED';
  if (item.exception) return 'EXCEPTION';
  if (item.state === 'UNAVAILABLE' && hasReason(item)) return 'UNAVAILABLE';
  if (item.state === 'NOT_APPLICABLE' && hasReason(item)) return 'NOT_APPLICABLE';
  if (item.state === 'COLLECTED') return 'AWAITING_VERIFICATION';
  return 'PENDING';
}

export interface ChecklistGroup {
  /** Null for stages whose items are not grouped. */
  key: string | null;
  label: string | null;
  items: ChecklistItemView[];
}

/** Groups items by requirement, keeping the order they came in. Ungrouped items form one group without a heading. */
export function groupChecklist(items: readonly ChecklistItemView[]): ChecklistGroup[] {
  const groups: ChecklistGroup[] = [];
  for (const item of items) {
    const key = item.group ?? null;
    let group = groups.find((g) => g.key === key);
    if (!group) {
      group = { key, label: item.groupLabel ?? null, items: [] };
      groups.push(group);
    }
    group.items.push(item);
  }
  return groups;
}

export interface ChecklistProgress {
  total: number;
  /** Items the Mentor completed. */
  completed: number;
  /** Resolved without being completed: unavailable / not applicable with a reason, or an authorised exception. */
  resolvedOther: number;
  exceptions: number;
  /** Mandatory items that still block verification. */
  outstandingMandatory: string[];
  groupsTotal: number;
  groupsResolved: number;
  /** 0-100, based on resolved items. */
  percent: number;
}

export function computeProgress(items: readonly ChecklistItemView[]): ChecklistProgress {
  const total = items.length;
  const completed = items.filter((i) => i.state === 'VERIFIED').length;
  const resolved = items.filter(isItemResolved);
  const groups = groupChecklist(items);
  return {
    total,
    completed,
    resolvedOther: resolved.length - completed,
    exceptions: items.filter((i) => i.exception).length,
    outstandingMandatory: items.filter((i) => i.mandatory && !isItemResolved(i)).map((i) => i.key),
    groupsTotal: groups.length,
    groupsResolved: groups.filter((g) => g.items.every(isItemResolved)).length,
    percent: total === 0 ? 0 : Math.round((resolved.length / total) * 100),
  };
}

/** Information a requirement is still waiting for, by name. Empty when it depends on nothing or everything is collected. */
export function missingInformation(item: ChecklistItemView): string[] {
  return (item.requires ?? []).filter((r) => !r.collected).map((r) => r.label);
}

/** The headline above the meeting checklist, for example "5 of 16 requirements completed". */
export function describeRequirements(progress: ChecklistProgress): string {
  return `${progress.completed} of ${progress.total} requirements completed`;
}

/** The sentence shown above a stage checklist, for example "17 of 26 completed · 2 unavailable or excepted". */
export function describeProgress(progress: ChecklistProgress): string {
  const parts = [`${progress.completed} of ${progress.total} completed`];
  if (progress.resolvedOther > 0) parts.push(`${progress.resolvedOther} unavailable or excepted`);
  return parts.join(' · ');
}
