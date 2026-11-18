import { createHash } from 'crypto';

import { ActivationVerificationSection } from '@prisma/client';

import { PrismaService, PrismaTxClient } from '../../common/prisma/prisma.service';

import { withLegacyValues } from './handover-legacy';
import { HANDOVER_FIELDS, isMeaningfulValue, stableJson } from './mentoring-handover-fields';

/**
 * Section-based activation verification.
 *
 * Verification is one fact per section, not one per field. A section is Verified only while the information it covers is exactly what
 * the Mentor verified: the Verified row stores a fingerprint of that information, and a section whose current fingerprint differs is
 * Not Verified again. Sections that did not change keep their status. Every verification, withdrawal and invalidation is audited.
 */
export type SectionId = ActivationVerificationSection;

export interface SectionDefinition {
  id: SectionId;
  label: string;
  /** What the section covers, shown to the Mentor beside the single verify action. */
  covers: string;
  /** Handover field keys that belong to the section. Every handover field belongs to exactly one section. */
  fields: readonly string[];
  /** Whether the live subject requirements and tutor assignments are part of the section's information. */
  includesTutorsAndSubjects?: boolean;
}

export const VERIFICATION_SECTIONS: readonly SectionDefinition[] = [
  {
    id: 'STUDENT_PARENT_INFO',
    label: 'Student & Parent Information',
    covers: 'Student profile, parent and contact information, and preferred language.',
    fields: [
      'student.firstName', 'student.lastName', 'student.dateOfBirth', 'student.gender', 'student.schoolName', 'student.grade',
      'student.curriculum', 'student.cityLocation', 'student.notes',
      'parent.name', 'parent.relationship', 'parent.primaryPhone', 'parent.whatsappNumber', 'parent.altPhone1', 'parent.altPhone2',
      'academic.preferredLanguage',
    ],
  },
  {
    id: 'SUBJECTS_TUTORS_TIMETABLE',
    label: 'Subjects, Tutors & Timetable',
    covers: 'Academic requirements, tutor preferences and assignments, and the class timetable.',
    fields: [
      'academic.weakAreas', 'academic.learningRequirements', 'academic.examPreparation', 'academic.subjectNotes',
      'tutor.preferredQualifications', 'tutor.preferredLanguage', 'tutor.requirements', 'tutor.assignments', 'timetable.schedule',
    ],
    includesTutorsAndSubjects: true,
  },
  {
    id: 'MARKS_EXAMINATIONS',
    label: 'Marks & Examinations',
    covers: 'Previous academic performance and upcoming examination details.',
    // The older fields stay in the fingerprint so earlier information is still covered by the verification.
    fields: [
      'academic.previousPerformance', 'academic.previousPerformanceReason', 'academic.previousMarks',
      'examination.upcoming', 'examination.upcomingReason', 'examination.upcomingDates', 'examination.syllabusPortions',
    ],
  },
  {
    id: 'EXPECTATIONS_ENGAGEMENT',
    label: 'Student Learning Profile',
    covers: 'Parent expectations, student engagement, and learning difficulties or concerns.',
    fields: ['parentExpectations', 'studentEngagement', 'student.learningConcerns'],
  },
];

export const SECTION_IDS: readonly SectionId[] = VERIFICATION_SECTIONS.map((s) => s.id);

export function isSectionId(value: string): value is SectionId {
  return (SECTION_IDS as readonly string[]).includes(value);
}

export function sectionForField(fieldKey: string): SectionId | null {
  return VERIFICATION_SECTIONS.find((s) => s.fields.includes(fieldKey))?.id ?? null;
}

/** The section(s) a change to these field keys can affect. */
export function sectionsForFields(fieldKeys: readonly string[]): SectionId[] {
  return Array.from(new Set(fieldKeys.map(sectionForField).filter((s): s is SectionId => s !== null)));
}

/** A fingerprint is the hash of the section's information in a fixed order, so it changes only when that information does. */
export function fingerprintOf(parts: Record<string, unknown>): string {
  const ordered = Object.keys(parts)
    .sort()
    .map((k) => [k, parts[k]]);
  return createHash('sha256').update(stableJson(ordered)).digest('hex');
}

type Db = PrismaTxClient | PrismaService;

async function effectiveValues(db: Db, handoverId: string): Promise<Map<string, unknown>> {
  const handover = await db.enrollmentHandover.findUniqueOrThrow({ where: { id: handoverId }, select: { transferredFields: true } });
  const out = new Map<string, unknown>();
  const transferred: Array<{ field: string; value: unknown }> = Array.isArray(handover.transferredFields)
    ? (handover.transferredFields as unknown as Array<{ field: string; value: unknown }>)
    : [];
  for (const entry of transferred) if (entry && typeof entry.field === 'string') out.set(entry.field, entry.value);
  const rows = await db.enrollmentHandoverField.findMany({ where: { handoverId } });
  for (const row of rows) out.set(row.fieldKey, row.value);
  return withLegacyValues(out);
}

/** The current fingerprint of every section for an activation. */
export async function currentFingerprints(db: Db, activation: { id: string; handoverId: string; studentId: string }): Promise<Record<SectionId, string>> {
  const values = await effectiveValues(db, activation.handoverId);
  const result = {} as Record<SectionId, string>;
  for (const section of VERIFICATION_SECTIONS) {
    const parts: Record<string, unknown> = {};
    for (const key of section.fields) {
      const v = values.get(key);
      parts[key] = isMeaningfulValue(v) ? v : null;
    }
    if (section.includesTutorsAndSubjects) {
      const [requirements, tutors] = await Promise.all([
        db.requirement.findMany({ where: { studentId: activation.studentId }, select: { subjectId: true, monthlyHours: true } }),
        db.mentoringTutorAssignment.findMany({
          where: { activationId: activation.id, status: { in: ['ACTIVE', 'NEEDS_REVIEW'] } },
          select: { subjectId: true, tutorProfileId: true, status: true, scheduleSnapshot: true },
        }),
      ]);
      parts['@requirements'] = requirements.map((r) => [r.subjectId, r.monthlyHours === null || r.monthlyHours === undefined ? null : Number(String(r.monthlyHours))]).sort();
      parts['@tutors'] = tutors.map((t) => [t.subjectId, t.tutorProfileId, t.status, t.scheduleSnapshot ?? null]).sort((a, b) => stableJson(a).localeCompare(stableJson(b)));
    }
    result[section.id] = fingerprintOf(parts);
  }
  return result;
}

async function audit(tx: Db, activationId: string, sectionId: SectionId, status: 'VERIFIED' | 'UNVERIFIED' | 'INVALIDATED', actorUserId: string | null, detail: Record<string, unknown>) {
  await tx.activationSectionVerificationEvent.create({ data: { activationId, sectionId, status, actorUserId, detail: detail as never } });
  await tx.auditEvent.create({
    data: {
      entityType: 'ActivationSectionVerification',
      entityId: activationId,
      action: status,
      actorUserId,
      newValue: { sectionId, status, ...detail } as never,
    },
  });
}

/**
 * Returns to Not Verified every verified section whose information is no longer what was verified. Idempotent: sections that did not
 * change are left alone. Called after anything that can change a section's information, and whenever the verification state is read.
 */
export async function reconcileSectionVerifications(db: Db, activationId: string, actorUserId: string | null = null): Promise<SectionId[]> {
  const activation = await db.mentoringActivation.findUnique({ where: { id: activationId }, select: { id: true, handoverId: true, studentId: true } });
  if (!activation) return [];
  const rows = await db.activationSectionVerification.findMany({ where: { activationId, verified: true } });
  if (rows.length === 0) return [];
  const now = await currentFingerprints(db, activation);
  const invalidated: SectionId[] = [];
  for (const row of rows) {
    if (row.fingerprint === now[row.sectionId]) continue;
    await db.activationSectionVerification.update({ where: { id: row.id }, data: { verified: false, fingerprint: null } });
    await audit(db, activationId, row.sectionId, 'INVALIDATED', actorUserId, {
      previousVerifiedByUserId: row.verifiedByUserId,
      previousVerifiedAt: row.verifiedAt,
      cause: 'INFORMATION_CHANGED',
    });
    invalidated.push(row.sectionId);
  }
  return invalidated;
}

/** Verifies or withdraws the verification of one section. The caller has already checked the user may do this. */
export async function setSectionVerification(
  tx: PrismaTxClient,
  activation: { id: string; handoverId: string; studentId: string },
  sectionId: SectionId,
  verified: boolean,
  userId: string,
): Promise<{ sectionId: SectionId; verified: boolean; changed: boolean }> {
  await reconcileSectionVerifications(tx, activation.id, userId);
  const existing = await tx.activationSectionVerification.findUnique({ where: { activationId_sectionId: { activationId: activation.id, sectionId } } });
  if (!verified) {
    if (!existing?.verified) return { sectionId, verified: false, changed: false };
    await tx.activationSectionVerification.update({ where: { id: existing.id }, data: { verified: false, fingerprint: null } });
    await audit(tx, activation.id, sectionId, 'UNVERIFIED', userId, { previousVerifiedByUserId: existing.verifiedByUserId, previousVerifiedAt: existing.verifiedAt });
    return { sectionId, verified: false, changed: true };
  }
  if (existing?.verified) return { sectionId, verified: true, changed: false };
  const fingerprint = (await currentFingerprints(tx, activation))[sectionId];
  const now = new Date();
  if (existing) {
    await tx.activationSectionVerification.update({ where: { id: existing.id }, data: { verified: true, fingerprint, verifiedByUserId: userId, verifiedAt: now } });
  } else {
    await tx.activationSectionVerification.create({ data: { activationId: activation.id, sectionId, verified: true, fingerprint, verifiedByUserId: userId, verifiedAt: now } });
  }
  await audit(tx, activation.id, sectionId, 'VERIFIED', userId, { fingerprint });
  return { sectionId, verified: true, changed: true };
}

export interface SectionState {
  id: SectionId;
  label: string;
  covers: string;
  fieldKeys: readonly string[];
  status: 'VERIFIED' | 'NOT_VERIFIED';
  verifiedByUserId: string | null;
  verifiedAt: Date | null;
}

/** The four sections and their current status. Brings stale verifications up to date first, so what is shown is what is stored. */
export async function sectionStates(db: Db, activationId: string): Promise<SectionState[]> {
  await reconcileSectionVerifications(db, activationId, null);
  const rows = await db.activationSectionVerification.findMany({ where: { activationId } });
  return VERIFICATION_SECTIONS.map((s) => {
    const row = rows.find((r) => r.sectionId === s.id);
    const verified = !!row?.verified;
    return {
      id: s.id,
      label: s.label,
      covers: s.covers,
      fieldKeys: s.fields,
      status: verified ? 'VERIFIED' : 'NOT_VERIFIED',
      verifiedByUserId: verified ? (row?.verifiedByUserId ?? null) : null,
      verifiedAt: verified ? (row?.verifiedAt ?? null) : null,
    };
  });
}

/** Guard used by tests: every handover field belongs to exactly one section. */
export function unassignedFields(): string[] {
  return Object.keys(HANDOVER_FIELDS).filter((k) => VERIFICATION_SECTIONS.filter((s) => s.fields.includes(k)).length !== 1);
}
