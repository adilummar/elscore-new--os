import { ChecklistItemDefinition } from './mentoring.constants';

/**
 * Group and overall completion of a checklist, derived only from what is stored: the definition, the saved item rows and the authorised
 * exceptions. Nothing here is taken from the page. A group is a label on its items; it has no status of its own to edit.
 *
 * An item counts as:
 *   - excepted   : the Mentoring Head authorised an exception for it (recorded with a reason, who and when);
 *   - completed  : the Mentor completed (VERIFIED) it;
 *   - unavailable: the Mentor marked it unavailable or not applicable and gave a reason. Only requirements about information that can
 *                  legitimately be missing allow this (see canBeUnavailable); every other requirement needs an authorised exception;
 *   - pending    : anything else.
 * A group is Complete only when none of its mandatory items is pending.
 */
export interface ChecklistRowState {
  itemKey: string;
  state: string;
  reason: string | null;
}

export type ItemOutcome = 'COMPLETED' | 'UNAVAILABLE' | 'EXCEPTED' | 'PENDING';
export type GroupStatus = 'COMPLETE' | 'IN_PROGRESS' | 'NOT_STARTED';

export interface GroupSummary {
  key: string;
  label: string;
  total: number;
  completed: number;
  unavailable: number;
  excepted: number;
  pending: number;
  complete: boolean;
  status: GroupStatus;
  itemKeys: string[];
}

export interface ChecklistSummary {
  groups: GroupSummary[];
  groupsTotal: number;
  groupsComplete: number;
  /** Mandatory items still pending, across all groups and the items that belong to no group. */
  unresolved: string[];
  /** True only when every group is complete and no mandatory item is pending. */
  complete: boolean;
}

/** Requirements about information that can legitimately be missing may be marked unavailable with a reason. Actions cannot be. */
export function canBeUnavailable(definition: Pick<ChecklistItemDefinition, 'fields'>): boolean {
  return (definition.fields?.length ?? 0) > 0;
}

export const MIN_REASON_LENGTH = 5;
/** A reason that says something: not blank and not a stray character or two. */
export function isMeaningfulReason(reason: string | null | undefined): boolean {
  return (reason?.trim().length ?? 0) >= MIN_REASON_LENGTH;
}

export function outcomeOf(row: ChecklistRowState | undefined, excepted: boolean): ItemOutcome {
  if (excepted) return 'EXCEPTED';
  if (!row) return 'PENDING';
  if (row.state === 'VERIFIED') return 'COMPLETED';
  if ((row.state === 'UNAVAILABLE' || row.state === 'NOT_APPLICABLE') && row.reason?.trim()) return 'UNAVAILABLE';
  return 'PENDING';
}

export function summarizeChecklist(
  definitions: ReadonlyArray<Pick<ChecklistItemDefinition, 'key' | 'mandatory' | 'group' | 'groupLabel'>>,
  rows: ChecklistRowState[],
  exceptionKeys: ReadonlySet<string>,
): ChecklistSummary {
  const byKey = new Map(rows.map((r) => [r.itemKey, r]));
  const outcomes = new Map(definitions.map((d) => [d.key, outcomeOf(byKey.get(d.key), exceptionKeys.has(d.key))]));
  const groups: GroupSummary[] = [];
  for (const d of definitions) {
    if (!d.group) continue;
    let g = groups.find((x) => x.key === d.group);
    if (!g) {
      g = { key: d.group, label: d.groupLabel ?? d.group, total: 0, completed: 0, unavailable: 0, excepted: 0, pending: 0, complete: false, status: 'NOT_STARTED', itemKeys: [] };
      groups.push(g);
    }
    const outcome = outcomes.get(d.key) as ItemOutcome;
    g.total += 1;
    g.itemKeys.push(d.key);
    if (outcome === 'COMPLETED') g.completed += 1;
    else if (outcome === 'UNAVAILABLE') g.unavailable += 1;
    else if (outcome === 'EXCEPTED') g.excepted += 1;
    else if (d.mandatory) g.pending += 1;
  }
  for (const g of groups) {
    g.complete = g.pending === 0;
    g.status = g.complete ? 'COMPLETE' : g.completed + g.unavailable + g.excepted > 0 ? 'IN_PROGRESS' : 'NOT_STARTED';
  }
  const unresolved = definitions.filter((d) => d.mandatory && outcomes.get(d.key) === 'PENDING').map((d) => d.key);
  return {
    groups,
    groupsTotal: groups.length,
    groupsComplete: groups.filter((g) => g.complete).length,
    unresolved,
    complete: unresolved.length === 0 && groups.every((g) => g.complete),
  };
}
