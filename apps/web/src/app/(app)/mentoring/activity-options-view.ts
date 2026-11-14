/** The activity options list in Settings: ordering and the duplicate check (the API checks it again and is the one that refuses). */
export interface ActivityOption { id: string; code: string; label: string; isActive: boolean; sortOrder: number }

/** Two names are the same activity when they match after trimming, single spacing and ignoring capitals. */
export const keyOf = (label: string) => label.trim().replace(/\s+/g, ' ').toLowerCase();

export const sortedOptions = (rows: ActivityOption[]) => [...rows].sort((a, b) => a.sortOrder - b.sortOrder || a.label.localeCompare(b.label));

/** The option with this name, other than the one being renamed, if there is one. */
export const duplicateOf = (label: string, rows: ActivityOption[], exceptId: string | null) => rows.find((o) => o.id !== exceptId && keyOf(o.label) === keyOf(label)) ?? null;

export function labelProblem(label: string, rows: ActivityOption[], exceptId: string | null): string | null {
  const clean = label.trim().replace(/\s+/g, ' ');
  if (!clean) return 'Write the name of the activity.';
  if (clean.length > 60) return 'The name must be 60 characters or fewer.';
  const same = duplicateOf(clean, rows, exceptId);
  if (same) return `"${same.label}" is already on the list${same.isActive ? '' : ', switched off. Switch it on instead'}.`;
  return null;
}
