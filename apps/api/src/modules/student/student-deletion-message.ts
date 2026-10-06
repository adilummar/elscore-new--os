export const STUDENT_DELETION_BLOCKERS = [
  'DEMO',
  'QUOTATION',
  'INVOICE',
  'TARGET_CREDIT',
  'ATTENDANCE',
  'ENROLLED',
  'NOT_ENROLLING',
] as const;

export type StudentDeletionBlocker = (typeof STUDENT_DELETION_BLOCKERS)[number];

const RECORD_LABELS: Record<Exclude<StudentDeletionBlocker, 'ENROLLED' | 'NOT_ENROLLING'>, string> = {
  DEMO: 'demos',
  QUOTATION: 'quotations',
  INVOICE: 'invoices',
  TARGET_CREDIT: 'sales target credits',
  ATTENDANCE: 'attendance records',
};

function joinLabels(labels: string[]): string {
  if (labels.length <= 1) return labels[0] ?? 'related business records';
  if (labels.length === 2) return `${labels[0]} and ${labels[1]}`;
  return `${labels.slice(0, -1).join(', ')}, and ${labels[labels.length - 1]}`;
}

export function studentDeletionBlockedMessage(blockers: StudentDeletionBlocker[]): string {
  const records = blockers.filter(
    (blocker): blocker is keyof typeof RECORD_LABELS => blocker in RECORD_LABELS,
  );
  const enrollment = blockers.find((blocker) => blocker === 'ENROLLED' || blocker === 'NOT_ENROLLING');

  if (records.length === 0 && enrollment === 'ENROLLED') {
    return 'This Student cannot be deleted because their enrollment state is enrolled. Only unused pending Students can be removed.';
  }

  if (records.length === 0 && enrollment === 'NOT_ENROLLING') {
    return 'This Student cannot be deleted because their enrollment state is not enrolling. Only unused pending Students can be removed.';
  }

  if (records.length === 0) {
    return 'This Student cannot be deleted because related business records were added. Historical business records must be preserved.';
  }

  const labels = records.map((blocker) => RECORD_LABELS[blocker]);
  if (enrollment === 'ENROLLED') labels.push('an enrolled enrollment state');
  if (enrollment === 'NOT_ENROLLING') labels.push('a not-enrolling enrollment state');

  return `This Student cannot be deleted because they have existing ${joinLabels(labels)}. Historical business records must be preserved.`;
}
