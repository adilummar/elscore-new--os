export const INITIAL_CONTACT_SLA_MS = 15 * 60 * 1000;

export function overdueLabel(createdAt: string | Date, now: Date): string {
  const created = new Date(createdAt).getTime();
  const overdueMs = now.getTime() - (created + INITIAL_CONTACT_SLA_MS);
  const minutes = Math.max(0, Math.floor(overdueMs / 60000));
  return `${minutes} min overdue`;
}

export function assigneeLabel(
  user:
    | {
        email?: string | null;
        employee?: { firstName?: string | null; lastName?: string | null } | null;
      }
    | null
    | undefined,
): string {
  if (!user) return 'Unassigned';
  const first = user.employee?.firstName?.trim();
  if (first) {
    const last = user.employee?.lastName?.trim();
    return last ? `${first} ${last}` : first;
  }
  return user.email || 'Unassigned';
}
