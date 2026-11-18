/**
 * Section-based activation verification as the Student Workspace shows it. The API decides what is verified and what returns to
 * Not Verified; the page only displays the four sections it is sent and sends one action per section.
 */
export type SectionId = 'STUDENT_PARENT_INFO' | 'SUBJECTS_TUTORS_TIMETABLE' | 'MARKS_EXAMINATIONS' | 'EXPECTATIONS_ENGAGEMENT';

export interface SectionView {
  sectionId: SectionId;
  label: string;
  covers: string;
  fieldKeys: string[];
  status: 'VERIFIED' | 'NOT_VERIFIED';
  verifiedByName: string | null;
  verifiedAt: string | null;
}

export const SECTION_ORDER: readonly SectionId[] = ['STUDENT_PARENT_INFO', 'SUBJECTS_TUTORS_TIMETABLE', 'MARKS_EXAMINATIONS', 'EXPECTATIONS_ENGAGEMENT'];

const isSection = (x: unknown): x is SectionView =>
  !!x && typeof x === 'object' && typeof (x as SectionView).sectionId === 'string' && typeof (x as SectionView).label === 'string';

/** The sections in the fixed order, from whatever the workspace response holds. Anything that is not one of the four is ignored. */
export function sectionsOf(handover: unknown): SectionView[] {
  const raw = handover && typeof handover === 'object' ? (handover as { sectionVerifications?: unknown }).sectionVerifications : null;
  const list = Array.isArray(raw) ? raw.filter(isSection) : [];
  return SECTION_ORDER.map((id) => list.find((s) => s.sectionId === id)).filter((s): s is SectionView => !!s);
}

export const verifiedCount = (sections: SectionView[]): number => sections.filter((s) => s.status === 'VERIFIED').length;

/** "Verified by Mina Mentor, 7 Nov 2026" or null while Not Verified. */
export function verifiedLine(s: SectionView): string | null {
  if (s.status !== 'VERIFIED') return null;
  const when = s.verifiedAt ? new Date(s.verifiedAt) : null;
  const date = when && !Number.isNaN(when.getTime()) ? when.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : null;
  const base = s.verifiedByName ? `Verified by ${s.verifiedByName}` : 'Verified';
  return date ? `${base}, ${date}` : base;
}
