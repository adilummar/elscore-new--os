/**
 * Sequence rows required before IdGeneratorService can issue business IDs.
 *
 * seed.ts inserts a missing row from this catalog.
 * The update payload is empty, so a rerun does not change nextNumber, prefix,
 * or padding on a row that already exists.
 *
 * Prefixes are stored verbatim. IdGeneratorService formats `${prefix}-${padded}`.
 * STA and TCR keep a trailing hyphen in the stored prefix. A later seed does not
 * rewrite that prefix on an existing row.
 *
 * PAY and TUT remain in the catalog because a database may already have those
 * rows. Payroll and tutor payables do not use them; they use PR and TPR.
 */

export interface SequenceDefinition {
  entityType: string;
  prefix: string;
  padding: number;
  /** Present on some historical entries. Create uses 1. Update ignores this field. */
  nextNumber?: number;
}

export const SEQUENCE_DEFINITIONS: readonly SequenceDefinition[] = [
  { entityType: 'STA', prefix: 'STA-', padding: 7 }, // Student Attendance
  { entityType: 'TCR', prefix: 'TCR-', padding: 7 }, // Tutor Class Record

  { entityType: 'EMP', prefix: 'EMP', padding: 4 },
  { entityType: 'VAC', prefix: 'VAC', padding: 4 }, // Workforce Vacancy
  { entityType: 'CAN', prefix: 'CAN', padding: 4 }, // Candidate
  { entityType: 'APP', prefix: 'APP', padding: 4 }, // Job Application
  { entityType: 'OFF', prefix: 'OFF', padding: 4 }, // Job Offer
  { entityType: 'ONB', prefix: 'ONB', padding: 4 }, // Onboarding case
  { entityType: 'TL', prefix: 'TL', padding: 4 }, // Tutor Lead

  { entityType: 'LED', prefix: 'LED', nextNumber: 1, padding: 4 }, // Lead
  { entityType: 'RQT', prefix: 'RQT', nextNumber: 1, padding: 4 }, // Requirement (canonical runtime key)
  { entityType: 'QUO', prefix: 'QUO', nextNumber: 1, padding: 4 }, // Quotation
  { entityType: 'STU', prefix: 'STU', padding: 4 },
  { entityType: 'FUP', prefix: 'FUP', nextNumber: 1, padding: 4 }, // FollowUp
  { entityType: 'DMO', prefix: 'DMO', nextNumber: 1, padding: 4 }, // Demo-ups (Slice 2B)
  { entityType: 'TUT', prefix: 'TUT', padding: 4 },
  { entityType: 'DEM', prefix: 'DEM', padding: 4 },
  { entityType: 'ADM', prefix: 'ADM', padding: 4 },
  { entityType: 'PAY', prefix: 'PAY', padding: 4 },
  { entityType: 'PR', prefix: 'PR', padding: 4 }, // Employee payroll run
  { entityType: 'TPR', prefix: 'TPR', padding: 4 }, // Tutor payable run
  { entityType: 'INV', prefix: 'INV', padding: 4 },
  { entityType: 'PMT', prefix: 'PMT', padding: 4 },
  { entityType: 'RCT', prefix: 'RCT', padding: 4 },
  { entityType: 'CLS', prefix: 'CLS', padding: 4 },
  { entityType: 'REN', prefix: 'REN', padding: 4 },
  { entityType: 'MTG', prefix: 'MTG', padding: 4 },
  { entityType: 'CYC', prefix: 'CYC', padding: 4 }, // Performance Cycle
  { entityType: 'GOL', prefix: 'GOL', padding: 4 }, // Employee Goal
  { entityType: 'REV', prefix: 'REV', padding: 4 }, // Performance Review
  { entityType: 'PIP', prefix: 'PIP', padding: 4 }, // Performance Improvement Plan
];

export interface SequenceUpsertArgs {
  where: { entityType: string };
  update: Record<string, never>;
  create: {
    entityType: string;
    prefix: string;
    padding: number;
    nextNumber: number;
  };
}

/**
 * Upsert plan used by the seed.
 * Existing rows are not rewritten. A missing row starts at nextNumber 1.
 */
export function sequenceUpsertArgs(seq: SequenceDefinition): SequenceUpsertArgs {
  return {
    where: { entityType: seq.entityType },
    update: {},
    create: {
      entityType: seq.entityType,
      prefix: seq.prefix,
      padding: seq.padding,
      nextNumber: 1,
    },
  };
}
