/**
 * When a student's next exam in a subject is due. Pure rules, no database and no framework.
 *
 * An exam is due once the student has had three hours (180 minutes) of Mentor-verified, consumed class time in that subject since
 * the last exam that was actually conducted. The count is for one student and one subject. It is read from what is recorded and
 * is never stored, so nothing can drift or be reset by a side effect:
 *
 *  - Only a VERIFIED class with verified minutes above zero counts. A scheduled, reported-but-unverified, returned, cancelled or
 *    not-conducted class adds nothing.
 *  - Only an exam of kind EXAM that was conducted (conducted === true) starts the next count. A scheduled, rescheduled, cancelled
 *    or formally not-conducted exam does not, and neither does a re-exam: a re-exam repeats an earlier paper and is not the next
 *    exam in the cycle.
 *  - A class counts toward the next exam when its date is after the date of that last conducted exam.
 */
export const EXAM_DUE_MINUTES = 180;

export interface DueClass { date: string; verifiedMinutes: number }
export interface DueExam { id: string; kind: string; date: string; conducted: boolean | null; dropped?: boolean }

export interface ExamDue {
  /** The date of the last conducted exam, or null when the subject has had none. */
  lastConductedDate: string | null;
  /** Verified, consumed minutes since then. */
  verifiedMinutes: number;
  thresholdMinutes: number;
  /** Minutes still needed, zero once due. */
  remainingMinutes: number;
  /** 0 to 100, for a progress bar. */
  progressPercent: number;
  due: boolean;
  /** The next exam already on the calendar for this subject, if there is one. Scheduling it does not change the count. */
  scheduledExam: { id: string; date: string } | null;
}

export function examDue(classes: readonly DueClass[], exams: readonly DueExam[], today: string): ExamDue {
  const conducted = exams.filter((e) => e.kind === 'EXAM' && e.conducted === true).map((e) => e.date).sort();
  const lastConductedDate = conducted.length ? conducted[conducted.length - 1] : null;
  const verifiedMinutes = classes
    .filter((c) => c.verifiedMinutes > 0 && (lastConductedDate === null || c.date > lastConductedDate))
    .reduce((sum, c) => sum + c.verifiedMinutes, 0);
  const upcoming = exams
    .filter((e) => e.kind === 'EXAM' && e.conducted === null && !e.dropped && e.date >= today)
    .sort((a, b) => a.date.localeCompare(b.date))[0];
  return {
    lastConductedDate,
    verifiedMinutes,
    thresholdMinutes: EXAM_DUE_MINUTES,
    remainingMinutes: Math.max(0, EXAM_DUE_MINUTES - verifiedMinutes),
    progressPercent: Math.min(100, Math.round((verifiedMinutes / EXAM_DUE_MINUTES) * 100)),
    due: verifiedMinutes >= EXAM_DUE_MINUTES,
    scheduledExam: upcoming ? { id: upcoming.id, date: upcoming.date } : null,
  };
}
