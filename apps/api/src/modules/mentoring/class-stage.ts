/**
 * The class workflow: Before Class, After Class, Actual Time, Verification. Pure rules, no database and no framework.
 *
 * Before Class and After Class are stored: a Mentor submits a checklist, and the record says who and when. Actual Time and Verification are not
 * stored as stages. They are read from what is recorded (the actual times, the class status), so opening a stage never completes it.
 *
 * A ticked item is the Mentor's own statement. The evidence (a message copied and confirmed, a voice file, the activities) stays separate and is
 * shown beside it, never merged into it.
 */
export type StoredStage = 'BEFORE' | 'AFTER';
export const STORED_STAGES: readonly StoredStage[] = ['BEFORE', 'AFTER'];
export const STAGE_ORDER = ['BEFORE', 'AFTER', 'TIMING', 'VERIFICATION'] as const;
export type StageKey = (typeof STAGE_ORDER)[number];
export const STAGE_LABELS: Record<StageKey, string> = { BEFORE: 'Before Class', AFTER: 'After Class', TIMING: 'Actual Time', VERIFICATION: 'Verification' };

export const BEFORE_ITEMS = ['reminderSent'] as const;
export const AFTER_ITEMS = ['checklistShared', 'voiceShared', 'activitiesGiven'] as const;
const ITEM_LABELS: Record<string, string> = {
  reminderSent: 'Tutor has sent the class reminder to the student',
  checklistShared: 'After-class checklist shared',
  voiceShared: 'Voice recording shared',
  activitiesGiven: 'Activities given',
};

export interface ActivityChoice { code: string; label: string }
export interface StageChecklist { items: Record<string, boolean>; activities?: ActivityChoice[]; otherDescription?: string }
export type Checked<T> = { ok: true; value: T } | { ok: false; message: string };

export const isStoredStage = (v: unknown): v is StoredStage => typeof v === 'string' && (STORED_STAGES as readonly string[]).includes(v);

/**
 * Checks what a Mentor sends when submitting a stage. Every required item must be ticked, and "Activities given" needs at least one activity from
 * the managed list (an option that was switched off since is still accepted if this class already had it). Labels are copied from the list at
 * submission, so the record keeps the wording it was made with.
 */
export function checkStageSubmission(stage: StoredStage, raw: unknown, options: readonly (ActivityChoice & { active: boolean })[], previous?: StageChecklist | null): Checked<StageChecklist> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ok: false, message: 'Send the checklist.' };
  const r = raw as Record<string, unknown>;
  const itemsIn = r.items && typeof r.items === 'object' && !Array.isArray(r.items) ? (r.items as Record<string, unknown>) : null;
  if (!itemsIn) return { ok: false, message: 'Send the checklist items.' };
  const keys = stage === 'BEFORE' ? BEFORE_ITEMS : AFTER_ITEMS;
  const items: Record<string, boolean> = {};
  for (const k of keys) {
    if (typeof itemsIn[k] !== 'boolean') return { ok: false, message: `Say whether "${ITEM_LABELS[k]}" is done.` };
    items[k] = itemsIn[k] as boolean;
  }
  for (const k of Object.keys(itemsIn)) if (!(keys as readonly string[]).includes(k)) return { ok: false, message: 'That item is not on this checklist.' };
  const missing = keys.filter((k) => !items[k]).map((k) => ITEM_LABELS[k]);
  if (missing.length) return { ok: false, message: `Tick every item before continuing. Still to do: ${missing.join('; ')}.` };
  if (stage === 'BEFORE') return { ok: true, value: { items } };

  const codes = Array.isArray(r.activities) ? r.activities : r.activities === undefined ? [] : null;
  if (codes === null || codes.some((c) => typeof c !== 'string')) return { ok: false, message: 'Choose the activities from the list.' };
  const unique = [...new Set(codes as string[])];
  if (unique.length === 0) return { ok: false, message: 'Choose at least one activity that was given.' };
  const kept = new Set((previous?.activities ?? []).map((a) => a.code));
  const chosen: ActivityChoice[] = [];
  for (const code of unique) {
    const found = options.find((o) => o.code === code);
    if (!found || (!found.active && !kept.has(code))) return { ok: false, message: 'One of the activities is not on the current list. Choose from the list.' };
    chosen.push({ code, label: kept.has(code) ? (previous?.activities ?? []).find((a) => a.code === code)?.label ?? found.label : found.label });
  }
  const other = typeof r.otherDescription === 'string' ? r.otherDescription.trim() : '';
  if (other.length > 200) return { ok: false, message: 'Describe the other activity in 200 characters or fewer.' };
  if (chosen.some((c) => c.code === 'OTHER') && !other) return { ok: false, message: 'Describe the other activity.' };
  return { ok: true, value: { items, activities: chosen, ...(chosen.some((c) => c.code === 'OTHER') ? { otherDescription: other } : {}) } };
}

/** The same checklist, whatever order its keys or activities came in. Used to make a repeated submission do nothing. */
export function sameChecklist(a: StageChecklist | null | undefined, b: StageChecklist | null | undefined): boolean {
  const norm = (c: StageChecklist | null | undefined) => JSON.stringify(c ? { items: Object.fromEntries(Object.entries(c.items).sort(([x], [y]) => x.localeCompare(y))), activities: [...(c.activities ?? [])].sort((x, y) => x.code.localeCompare(y.code)), other: c.otherDescription ?? '' } : null);
  return norm(a) === norm(b);
}

export type StepState = 'COMPLETE' | 'CURRENT' | 'PENDING' | 'ATTENTION';
export interface ClassFacts { status: string; tutorSubmitted: boolean; actualRecorded: boolean }
export interface StageStatus { key: StageKey; label: string; state: StepState; reachable: boolean }

/**
 * Where the class is in its workflow. A stored stage is complete only when it was submitted. Actual Time is complete once an actual time is
 * recorded (by the tutor or corrected by the Mentor). Verification is complete once the Mentor verified the class (or confirmed it was not
 * conducted). Nothing is complete because it was opened. A stage can be opened once the one before it is done, or once the tutor has reported the
 * class: a class that is already waiting for the Mentor must never be locked behind a stage that was never filled in.
 */
export function stageStatuses(stored: Partial<Record<StoredStage, boolean>>, f: ClassFacts, selected?: StageKey): StageStatus[] {
  const closed = f.status === 'VERIFIED' || f.status === 'NOT_CONDUCTED';
  const reported = f.tutorSubmitted || closed || f.status === 'AWAITING_MENTOR_VERIFICATION' || f.status === 'RETURNED_FOR_CORRECTION';
  const done: Record<StageKey, boolean> = { BEFORE: !!stored.BEFORE, AFTER: !!stored.AFTER, TIMING: f.actualRecorded, VERIFICATION: closed };
  const reach: Record<StageKey, boolean> = { BEFORE: true, AFTER: !!stored.BEFORE || reported, TIMING: !!stored.AFTER || reported, VERIFICATION: !!stored.AFTER || reported };
  const suggested = STAGE_ORDER.find((k) => reach[k] && !done[k]) ?? 'VERIFICATION';
  return STAGE_ORDER.map((key) => ({
    key,
    label: STAGE_LABELS[key],
    reachable: reach[key],
    state: key === 'VERIFICATION' && f.status === 'RETURNED_FOR_CORRECTION' ? 'ATTENTION' : done[key] ? 'COMPLETE' : (selected ?? suggested) === key ? 'CURRENT' : 'PENDING',
  }));
}

/** The first stage that can be worked on and is not done: where a Mentor should land when nothing was chosen. */
export function suggestedStage(stored: Partial<Record<StoredStage, boolean>>, f: ClassFacts): StageKey {
  return (stageStatuses(stored, f).find((s) => s.state === 'CURRENT')?.key ?? 'VERIFICATION');
}

export const durationOf = (start: number | null, end: number | null): number | null => (start !== null && end !== null && end > start ? end - start : null);
