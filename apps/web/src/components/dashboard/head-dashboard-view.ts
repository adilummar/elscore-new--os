/** Pure arrangements of what the Mentoring API already sent, for the Mentoring Head's department view. */

export interface StageCell { stage: number; name: string; count: number; stuck: number; longestDays: number }

/** Students still in activation, grouped by the stage they are at (1 to 7). Active and cancelled students are not in the pipeline. */
export function pipeline(activations: Array<{ status: string; stageNumber?: number | null; stageName?: string | null; blocked?: boolean; daysPending?: number }>, stages = 7): StageCell[] {
  const cells: StageCell[] = Array.from({ length: stages }, (_, i) => ({ stage: i + 1, name: '', count: 0, stuck: 0, longestDays: 0 }));
  for (const a of activations) {
    if (a.status === 'ACTIVE' || a.status === 'ACTIVATED' || a.status === 'CANCELLED') continue;
    const n = Number(a.stageNumber);
    if (!Number.isInteger(n) || n < 1 || n > stages) continue;
    const c = cells[n - 1];
    c.count += 1;
    if (a.stageName && !c.name) c.name = a.stageName;
    if (a.blocked || a.status === 'ACTIVATION_BLOCKED' || a.status === 'ACTIVATION_ON_HOLD') c.stuck += 1;
    c.longestDays = Math.max(c.longestDays, a.daysPending ?? 0);
  }
  return cells;
}

export interface TodayCell { key: string; label: string; href: string; n: number; attention: boolean }

/** The team's classes today by state, each opening Classes with that filter. */
export function todayCells(counts: Record<string, number> | undefined | null): TodayCell[] {
  const c = counts ?? {};
  const n = (k: string) => Number(c[k] ?? 0);
  return [
    { key: 'SCHEDULED', label: 'Still to come', href: '/mentoring/classes?state=SCHEDULED', n: n('SCHEDULED'), attention: false },
    { key: 'AWAITING_TUTOR_UPDATE', label: 'Waiting for the tutor', href: '/mentoring/classes?card=classes_awaiting_update', n: n('AWAITING_TUTOR_UPDATE'), attention: n('AWAITING_TUTOR_UPDATE') > 0 },
    { key: 'AWAITING_MENTOR_VERIFICATION', label: 'Waiting for a Mentor', href: '/mentoring/classes?card=classes_awaiting_verification', n: n('AWAITING_MENTOR_VERIFICATION'), attention: n('AWAITING_MENTOR_VERIFICATION') > 0 },
    { key: 'VERIFIED', label: 'Verified', href: '/mentoring/classes?card=classes_verified', n: n('VERIFIED'), attention: false },
    { key: 'NOT_HELD', label: 'Not held or moved', href: '/mentoring/classes?card=classes_not_conducted', n: n('NOT_CONDUCTED') + n('RESCHEDULED'), attention: false },
  ];
}

export interface MentorLine { mentorUserId: string; name: string; students: number; toVerify: number; pendingTasks: number; verifiedHours: number; scheduledHours: number; percent: number }

/** One line per Mentor, the most work waiting first. Hours are verified against scheduled; no scheduled hours means 0%, never a guess. */
export function mentorLines(rows: Array<{ mentorUserId: string; name: string; assignedStudents?: number; pendingVerification?: number; pendingTasks?: number; consumedHours?: number; scheduledHours?: number }>): MentorLine[] {
  return rows.map((m) => {
    const scheduled = Number(m.scheduledHours ?? 0);
    const verified = Number(m.consumedHours ?? 0);
    return { mentorUserId: m.mentorUserId, name: m.name, students: Number(m.assignedStudents ?? 0), toVerify: Number(m.pendingVerification ?? 0), pendingTasks: Number(m.pendingTasks ?? 0), verifiedHours: verified, scheduledHours: scheduled, percent: scheduled > 0 ? Math.min(100, Math.round((verified / scheduled) * 100)) : 0 };
  }).sort((a, b) => b.pendingTasks - a.pendingTasks || b.toVerify - a.toVerify || a.name.localeCompare(b.name));
}
