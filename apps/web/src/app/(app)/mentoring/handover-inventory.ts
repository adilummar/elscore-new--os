/**
 * The complete list of information Mentoring needs for a student, built from what the API reports.
 *
 * Stage 1 shows it as an overview of what Sales handed over. Stage 2 shows every field with its value, source,
 * collection status and meeting verification. Two facts are kept apart on purpose:
 *   - collection: does the field have a real value, and where did it come from;
 *   - verification: did the Mentor confirm that value with the parent during the meeting.
 * A value being present never implies it was verified. Nothing here invents or fills in a value.
 */
import { fmtDate } from './labels';
import {
  EditableFieldMeta,
  PresentedField,
  describeRequirement,
  formatHandoverValue,
  formatRowsValue,
  handoverFieldLabel,
  isMeaningfulValue,
  presentHandover,
} from './handover-presentation';

export interface FieldSection {
  key: string;
  label: string;
  fields: readonly string[];
}

/** Every field Mentoring works with, in the order the Mentor goes through them with the parent. */
export const FIELD_SECTIONS: readonly FieldSection[] = [
  {
    key: 'student',
    label: 'Student',
    fields: ['student.firstName', 'student.lastName', 'student.dateOfBirth', 'student.gender', 'student.schoolName', 'student.grade', 'student.curriculum', 'student.cityLocation', 'student.notes'],
  },
  {
    key: 'parent',
    label: 'Parent and contact',
    fields: ['parent.name', 'parent.relationship', 'parent.primaryPhone', 'parent.whatsappNumber', 'parent.altPhone1', 'academic.preferredLanguage'],
  },
  {
    key: 'subjects',
    label: 'Subjects, tutor and timetable',
    fields: [
      'academic.subjects', 'academic.weakAreas', 'academic.learningRequirements', 'academic.examPreparation', 'academic.subjectNotes',
      'tutor.preferredQualifications', 'tutor.preferredLanguage', 'tutor.requirements', 'tutor.assignments', 'timetable.schedule',
    ],
  },
  {
    key: 'academic',
    label: 'Marks and examinations',
    fields: ['academic.previousPerformance', 'academic.previousPerformanceReason', 'academic.previousMarks', 'examination.upcoming', 'examination.upcomingReason'],
  },
  {
    key: 'expectations',
    label: 'Student learning profile',
    fields: ['parentExpectations', 'studentEngagement', 'student.learningConcerns'],
  },
];

/** Fields an earlier handover may still carry but that are no longer asked for. "Current Grade (as entered)" was a second grade beside Grade / Class. */
const RETIRED_FIELD_KEYS: ReadonlySet<string> = new Set([
  'student.currentGrade',
  // Combined into other fields. Their saved values are shown there (the API derives the combined field), and nothing is deleted.
  'parent.altPhone2',
  'examination.upcomingDates',
  'examination.syllabusPortions',
]);
/** Kept only to show what an earlier version saved: never asked for, and shown only when it holds a value. */
const SHOWN_ONLY_WHEN_FILLED: ReadonlySet<string> = new Set(['academic.previousMarks']);

export const ALL_FIELD_KEYS: readonly string[] = FIELD_SECTIONS.flatMap((s) => s.fields);

export type CollectionStatus = 'FROM_SALES' | 'UPDATED' | 'COLLECTED' | 'PENDING';

export const COLLECTION_LABELS: Readonly<Record<CollectionStatus, string>> = {
  FROM_SALES: 'Received from Sales',
  UPDATED: 'Updated by Mentoring',
  COLLECTED: 'Collected by Mentoring',
  PENDING: 'Pending collection',
};

export interface InventoryRow {
  fieldKey: string;
  label: string;
  /** The current value as text; null while the field is pending. */
  value: string | null;
  /** The current value in the shape the editor works with. */
  rawValue: unknown;
  collection: CollectionStatus;
  /** Where the value came from and who last touched it, for example "Updated by Mina Mentor, 7 Nov 2026". */
  sourceText: string | null;
  /** The original Sales value, only when Mentoring has replaced it. */
  salesValue: string | null;
  /** Why a pending field is pending. */
  hint: string | null;
  /** Null when the field cannot be edited here (the Sales subject list). */
  editor: EditableFieldMeta | null;
  /** The Mentor may leave this field empty. An empty optional field is not "still to collect" and blocks nothing. */
  optional: boolean;
}

export interface InventorySection {
  key: string;
  label: string;
  rows: InventoryRow[];
}

export interface Inventory {
  sections: InventorySection[];
  total: number;
  collected: number;
  /** Required fields still empty. Optional empty fields are counted apart. */
  pending: number;
  optionalPending: number;
}

interface FieldValueRow {
  fieldKey: string;
  value?: unknown;
  origin?: string;
  updatedByName?: string | null;
  updatedAt?: string | null;
  collectedByName?: string | null;
  collectedAt?: string | null;
}

const list = <T>(value: unknown, guard: (row: unknown) => row is T): T[] => (Array.isArray(value) ? value.filter(guard) : []);
const hasKey = (row: unknown): row is { fieldKey: string } => !!row && typeof row === 'object' && typeof (row as { fieldKey?: unknown }).fieldKey === 'string';

function byLine(...parts: Array<string | null | undefined>): string {
  return parts.filter((p): p is string => !!p && p.length > 0).join(', ');
}

export const DEFAULT_PENDING_HINT = 'Not asked during the Sales admission. The Mentor collects this.';

/** One row per field (several Sales subject lines are one field), grouped into sections, with real counts. */
export function buildInventory(handover: unknown): Inventory {
  const source = (handover && typeof handover === 'object' ? handover : {}) as { fieldValues?: unknown; editableFields?: unknown };
  const { collected, missing } = presentHandover(handover);
  // A field that is in no Sales list (one added after the handover was captured) still needs its input definition.
  const editors = new Map<string, EditableFieldMeta>(
    (Array.isArray(source.editableFields) ? source.editableFields : [])
      .filter((e): e is EditableFieldMeta => !!e && typeof e === 'object' && typeof (e as { key?: unknown }).key === 'string')
      .map((e) => [e.key, e]),
  );
  const valueRows = new Map(list<FieldValueRow>(source.fieldValues, hasKey).map((r) => [r.fieldKey, r]));

  const collectedByField = new Map<string, PresentedField[]>();
  for (const row of collected) collectedByField.set(row.fieldKey, [...(collectedByField.get(row.fieldKey) ?? []), row]);
  const missingByField = new Map(missing.map((row) => [row.fieldKey, row]));

  const rowFor = (fieldKey: string): InventoryRow => {
    const label = handoverFieldLabel(fieldKey);
    const parts = collectedByField.get(fieldKey);
    if (!parts) {
      const pending = missingByField.get(fieldKey);
      return {
        fieldKey, label, value: null, rawValue: null, collection: 'PENDING',
        sourceText: pending && pending.hint !== DEFAULT_PENDING_HINT ? 'Not provided by Sales' : 'Not collected by Sales', salesValue: null,
        hint: pending?.hint ?? DEFAULT_PENDING_HINT, editor: pending?.editor ?? editors.get(fieldKey) ?? null,
        optional: (pending?.editor ?? editors.get(fieldKey))?.optional === true,
      };
    }
    const first = parts[0];
    const detail = valueRows.get(fieldKey);
    const collection: CollectionStatus = first.source === 'MENTOR_COLLECTED' ? 'COLLECTED' : first.source === 'MENTORING_UPDATED' ? 'UPDATED' : 'FROM_SALES';
    const sourceText =
      collection === 'FROM_SALES'
        ? COLLECTION_LABELS.FROM_SALES
        : collection === 'COLLECTED'
          ? byLine(`Collected by ${detail?.collectedByName ?? 'Mentoring'}`, fmtDate(detail?.collectedAt ?? first.updatedAt))
          : byLine(`Updated${first.updatedByName ? ` by ${first.updatedByName}` : ' by Mentoring'}`, fmtDate(first.updatedAt));
    return {
      fieldKey,
      label,
      value: parts.map((p) => p.value).filter((v): v is string => !!v).join('\n'),
      rawValue: first.rawValue,
      collection,
      sourceText,
      salesValue: first.salesValue,
      hint: null,
      editor: first.editor,
      optional: (first.editor ?? editors.get(fieldKey))?.optional === true,
    };
  };

  const known = new Set(ALL_FIELD_KEYS);
  const extras = [...collectedByField.keys(), ...missingByField.keys()].filter((key, index, all) => !known.has(key) && !RETIRED_FIELD_KEYS.has(key) && all.indexOf(key) === index);
  const sections: InventorySection[] = [
    ...FIELD_SECTIONS.map((section) => ({
      key: section.key,
      label: section.label,
      rows: section.fields.map(rowFor).filter((row) => !(SHOWN_ONLY_WHEN_FILLED.has(row.fieldKey) && row.collection === 'PENDING')),
    })),
    ...(extras.length > 0 ? [{ key: 'other', label: 'Other information', rows: extras.map(rowFor) }] : []),
  ];
  const rows = sections.flatMap((s) => s.rows);
  const collectedRows = rows.filter((r) => r.collection !== 'PENDING');
  const emptyRows = rows.filter((r) => r.collection === 'PENDING');
  return {
    sections,
    total: rows.length,
    collected: collectedRows.length,
    pending: emptyRows.filter((r) => !r.optional).length,
    optionalPending: emptyRows.filter((r) => r.optional).length,
  };
}

export type RowFilter = 'ALL' | 'PENDING';

/** The rows each Stage 2 filter shows. Verification is per section now, so the filters are about collection only. */
export function matchesFilter(filter: RowFilter, row: Pick<InventoryRow, 'collection'>): boolean {
  return filter === 'PENDING' ? row.collection === 'PENDING' : true;
}

// ─── Stage 1 overview ──────────────────────────────────────────────────────────

export interface OverviewRow {
  fieldKey: string;
  label: string;
  /** What Sales passed on; null for a required field. */
  value: string | null;
  /** Where Sales took it from (for a received field) or why it is still needed (for a required field). */
  note: string;
  /** A received value Mentoring has changed since the handover. The Sales value shown here is the original. */
  changedSince: boolean;
}

export interface HandoverOverview {
  received: OverviewRow[];
  required: OverviewRow[];
  /** Empty fields the Mentor may leave empty. Listed apart from the required ones. */
  optional: OverviewRow[];
  /** Fields Sales did not have that the Mentor has collected since. */
  collectedSince: number;
}

const SALES_SOURCE_LABELS: Readonly<Record<string, string>> = {
  LEAD: 'Sales lead record',
  STUDENT: 'Sales student record',
  REQUIREMENT: 'Sales subject requirements',
};

/**
 * Stage 1: what Sales handed over (always the original snapshot, never a Mentoring value), and what is still needed
 * now. A field the Mentor has since collected is no longer "still required", and is counted separately.
 */
export function buildOverview(handover: unknown): HandoverOverview {
  const source = (handover && typeof handover === 'object' ? handover : {}) as { transferredFields?: unknown; fieldValues?: unknown };
  const transferred = Array.isArray(source.transferredFields) ? source.transferredFields : [];
  const mentoring = new Map(list<FieldValueRow>(source.fieldValues, hasKey).map((r) => [r.fieldKey, r]));
  const inventory = buildInventory(handover);
  const rowOf = new Map(inventory.sections.flatMap((s) => s.rows).map((r) => [r.fieldKey, r]));

  const received: OverviewRow[] = [];
  const receivedKeys = new Set<string>();
  for (const entry of transferred) {
    if (!entry || typeof entry !== 'object' || typeof (entry as { field?: unknown }).field !== 'string') continue;
    const { field, value, source: origin } = entry as { field: string; value: unknown; source?: string };
    const text =
      field === 'academic.subjects'
        ? (Array.isArray(value) ? value : []).map((r) => (r && typeof r === 'object' ? describeRequirement(r as Record<string, unknown>) : null)).filter((l): l is string => !!l).join('\n')
        : isMeaningfulValue(value)
          ? Array.isArray(value) ? formatRowsValue(field, value) : formatHandoverValue(field, value)
          : '';
    if (!text || receivedKeys.has(field) || RETIRED_FIELD_KEYS.has(field)) continue;
    receivedKeys.add(field);
    received.push({
      fieldKey: field,
      label: handoverFieldLabel(field),
      value: text,
      note: SALES_SOURCE_LABELS[origin ?? ''] ?? 'Sales',
      changedSince: isMeaningfulValue(mentoring.get(field)?.value),
    });
  }

  const order = (key: string) => ALL_FIELD_KEYS.indexOf(key) === -1 ? ALL_FIELD_KEYS.length : ALL_FIELD_KEYS.indexOf(key);
  received.sort((a, b) => order(a.fieldKey) - order(b.fieldKey));

  const required: OverviewRow[] = [];
  const optional: OverviewRow[] = [];
  for (const section of inventory.sections) {
    for (const row of section.rows) {
      if (row.collection !== 'PENDING') continue;
      (row.optional ? optional : required).push({ fieldKey: row.fieldKey, label: row.label, value: null, note: row.hint ?? DEFAULT_PENDING_HINT, changedSince: false });
    }
  }

  const collectedSince = Array.from(rowOf.values()).filter((r) => r.collection === 'COLLECTED' && !receivedKeys.has(r.fieldKey)).length;
  return { received, required, optional, collectedSince };
}
