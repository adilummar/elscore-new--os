import { CHECKLIST } from '../mentoring.constants';

/**
 * REFERENCE implementation of the proposed Stage 1 checklist backfill (apps/api/scripts/stage1-checklist-backfill.sql).
 * It is used only by tests, to prove the carry-over rules on data shaped like the real tables. It is not part of
 * the application build (this folder is excluded) and is never run against a database.
 *
 * Before the checklist split, Stage 1 held eight requirement rows (definition version 1). Seven of those keys
 * became requirement GROUPS in version 2 and their work is now recorded per item. The backfill carries each old
 * result over to the items of its group so no progress, comment, evidence, verification or exception is lost.
 */
export const LEGACY_STAGE1_KEYS = [
  'student_parent_verified',
  'tutor_subject_confirmed',
  'weekly_timetable_verified',
  'academic_requirements_recorded',
  'previous_marks',
  'examination_details',
  'parent_expectations',
  'missing_info_identified',
] as const;

export const CARRIED_NOTE = 'Carried over from the earlier checklist.';

/** legacy group key -> the new item keys, in display order (the first one also receives note, evidence and value). */
export function legacyGroupMap(): Record<string, string[]> {
  const map: Record<string, string[]> = {};
  for (const def of CHECKLIST[1]) {
    // missing_info_identified kept its key, so its existing row is already the right row.
    if (!def.group || def.key === 'missing_info_identified') continue;
    (map[def.group] ??= []).push(def.key);
  }
  return map;
}

export const NEW_STAGE1_KEYS: readonly string[] = CHECKLIST[1].map((d) => d.key);

export interface LegacyRow {
  stageId: string;
  itemKey: string;
  state: string;
  value: unknown;
  note: string | null;
  reason: string | null;
  evidenceRef: string | null;
  updatedByUserId: string | null;
  createdAt: Date;
  updatedAt: Date;
  definitionVersion: number;
}

export interface LegacyException {
  stageId: string;
  itemKey: string;
  reason: string;
  authorizedByUserId: string;
  createdAt: Date;
}

export interface PlannedRow {
  stageId: string;
  itemKey: string;
  definitionVersion: 2;
  mandatory: true;
  state: string;
  value: unknown;
  note: string | null;
  reason: string | null;
  evidenceRef: string | null;
  updatedByUserId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface BackfillPlan {
  rows: PlannedRow[];
  exceptions: LegacyException[];
}

/**
 * Plans the inserts for ONE Stage 1 (all rows and exceptions of that stage). Insert-only: existing rows are never
 * changed, and anything already present (same stage + key) is skipped, which makes a second run a no-op.
 * A stage with no version-1 rows is left alone; the application creates its rows when the stage is opened.
 */
export function planStage1Backfill(stageId: string, rows: LegacyRow[], exceptions: LegacyException[], now: Date = new Date()): BackfillPlan {
  const legacy = rows.filter((r) => r.stageId === stageId && r.definitionVersion === 1);
  if (legacy.length === 0) return { rows: [], exceptions: [] };

  const have = new Set(rows.filter((r) => r.stageId === stageId).map((r) => r.itemKey));
  const planned: PlannedRow[] = [];
  const plannedKeys = new Set<string>();
  const groups = legacyGroupMap();

  for (const [groupKey, itemKeys] of Object.entries(groups)) {
    const old = legacy.find((r) => r.itemKey === groupKey);
    itemKeys.forEach((itemKey, index) => {
      if (have.has(itemKey) || !old) return;
      const first = index === 0;
      const carriedState = old.state !== 'PENDING_COLLECTION';
      const note = first ? [carriedState ? CARRIED_NOTE : null, old.note].filter(Boolean).join(' ') || null : carriedState ? CARRIED_NOTE : null;
      planned.push({
        stageId, itemKey, definitionVersion: 2, mandatory: true,
        state: old.state,
        value: first ? old.value : null,
        note,
        reason: old.reason,
        evidenceRef: first ? old.evidenceRef : null,
        updatedByUserId: old.updatedByUserId,
        createdAt: old.createdAt,
        updatedAt: old.updatedAt,
      });
      plannedKeys.add(itemKey);
    });
  }

  // Any item of the new definition that still has no row gets a pending one, as the application would create.
  for (const itemKey of NEW_STAGE1_KEYS) {
    if (have.has(itemKey) || plannedKeys.has(itemKey)) continue;
    planned.push({
      stageId, itemKey, definitionVersion: 2, mandatory: true, state: 'PENDING_COLLECTION', value: null, note: null, reason: null,
      evidenceRef: null, updatedByUserId: null, createdAt: now, updatedAt: now,
    });
  }

  const haveExceptions = new Set(exceptions.filter((e) => e.stageId === stageId).map((e) => e.itemKey));
  const carriedExceptions: LegacyException[] = [];
  for (const e of exceptions.filter((x) => x.stageId === stageId)) {
    for (const itemKey of groups[e.itemKey] ?? []) {
      if (!haveExceptions.has(itemKey)) carriedExceptions.push({ ...e, itemKey });
    }
  }
  return { rows: planned, exceptions: carriedExceptions };
}
