/** Pure helpers for the Subjects panel of the Student information step. No React, so they are tested directly. */

export interface SubjectLine {
  key: string;
  subjectId: string | null;
  subject: string;
  grade: string;
  hoursText: string;
  addedByMentor: boolean;
  /** "From Sales", or "Added by Maya, 20 Nov 2026". */
  origin: string;
}

const text = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');

function dayText(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

/** The student's subjects from the handover: what Sales entered and what the Mentor added since. A missing hours figure is said, never shown as 0. */
export function subjectLines(raw: unknown): SubjectLine[] {
  if (!Array.isArray(raw)) return [];
  const out: SubjectLine[] = [];
  raw.forEach((item, index) => {
    if (!item || typeof item !== 'object') return;
    const r = item as Record<string, unknown>;
    const subject = text(r.subject);
    if (!subject) return;
    const hours = r.monthlyHours === null || r.monthlyHours === undefined ? NaN : Number(r.monthlyHours);
    const added = r.addedByMentor === true;
    const who = text(r.addedByName);
    const when = typeof r.addedAt === 'string' ? dayText(r.addedAt) : '';
    out.push({
      key: text(r.requirementId) || `${subject}-${index}`,
      subjectId: text(r.subjectId) || null,
      subject,
      grade: text(r.grade),
      hoursText: Number.isFinite(hours) && hours > 0 ? `${hours} h a month` : 'Hours not set',
      addedByMentor: added,
      origin: added ? `Added by ${who || 'the Mentor'}${when ? `, ${when}` : ''}` : 'From Sales',
    });
  });
  return out;
}

/** Why the Add subject form cannot be submitted yet, or null when it can. */
export function subjectProblem(subjectId: string, hours: string): string | null {
  if (!subjectId) return 'Choose a subject.';
  const n = Number(hours);
  if (hours.trim() === '' || !Number.isFinite(n) || n <= 0) return 'Enter the hours a month.';
  if (n > 200) return 'Hours a month cannot be more than 200.';
  return null;
}
