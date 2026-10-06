export type StudentDeletionError = Error & {
  code?: string;
  blockers?: string[];
};

const BLOCKER_LABELS: Record<string, string> = {
  DEMO: 'Demos',
  QUOTATION: 'Quotations',
  INVOICE: 'Invoices',
  TARGET_CREDIT: 'Sales target credits',
  ATTENDANCE: 'Attendance',
  ENROLLED: 'Enrolled',
  NOT_ENROLLING: 'Not enrolling',
};

export function blockerLabels(blockers: string[] | undefined): string[] {
  return (blockers ?? []).map((blocker) => BLOCKER_LABELS[blocker] ?? blocker);
}

export function deletionErrorView(error: StudentDeletionError): {
  message: string;
  blockers: string[];
} {
  if (error.code === 'STUDENT_IN_USE') {
    return {
      message: error.message || 'This Student cannot be deleted. Historical business records must be preserved.',
      blockers: blockerLabels(error.blockers),
    };
  }

  return {
    message: error.message || 'Failed to delete student',
    blockers: [],
  };
}

export function studentsAfterDeletion<T extends { id: string }>(students: T[], deletedId: string): T[] {
  return students.filter((student) => student.id !== deletedId);
}
