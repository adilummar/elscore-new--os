"use client";

import * as React from 'react';
import { Check } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { InventoryRow, buildInventory } from '../../handover-inventory';
import { isStaleMessage, saveField } from '../../field-actions';
import { EditorValue, initialEditorValue, isEditorDirty } from '../../handover-editing';
import { isScheduleValue } from '../../subject-schedule';
import { SubjectsPanel } from './SubjectsPanel';
import { SectionView, resetNotice, resetSections, sectionsOf, verifiedCount, verifiedLine } from '../../section-verification-view';
import { FieldInput } from './FieldInput';
import { TutorTools } from '../../tutor-types';
import { ScheduleSuggestion, SubjectScheduleView } from './SubjectScheduleEditor';

const ALL_FIELDS = 'ALL_FIELDS';
const SUBJECTS_NOTE = 'Set by Sales and locked after handover. Record anything else about the subjects under Subject Requirement Details.';

/** Saves this card's unsaved edit. Resolves true when the card is saved or had nothing to save, false when the save was refused. */
type Saver = () => Promise<boolean>;

interface CardProps {
  row: InventoryRow;
  canEdit: boolean;
  onSave: (fieldKey: string, value: unknown, basedOn: unknown) => Promise<void>;
  onRefresh: () => Promise<void>;
  onDirtyChange: (id: string, dirty: boolean) => void;
  /** Lets the section ask this card to save, so one button at the bottom of the section saves every edited field. */
  onRegister: (fieldKey: string, saver: Saver | null) => void;
  /** The student's Grade / Class as saved, passed to the subject schedule so it never asks for a second grade. */
  studentGrade: string | null;
  /** Reports the primary contact number as typed, and gives the WhatsApp card the number it can copy. */
  onPrimaryPhone: (value: string) => void;
  primaryPhone: string;
  suggestions: ScheduleSuggestion[];
  onCreateSubject?: (name: string) => Promise<void>;
  tutorTools?: TutorTools;
}

function StatusText({ row, dirty }: { row: InventoryRow; dirty: boolean }) {
  if (row.collection === 'PENDING' && row.optional) {
    return dirty ? <span className="text-xs font-medium text-amber-700">Unsaved changes</span> : <span className="text-xs font-medium text-slate-600">Optional</span>;
  }
  if (row.collection === 'PENDING') {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-800">
        <span aria-hidden className="inline-block h-1.5 w-1.5 rounded-full bg-amber-500" />
        Pending collection
      </span>
    );
  }
  return dirty ? <span className="text-xs font-medium text-amber-700">Unsaved changes</span> : <span className="text-xs text-slate-600">Collected</span>;
}

function FieldCard({ row, canEdit, onSave, onRefresh, onDirtyChange, onRegister, studentGrade, onPrimaryPhone, primaryPhone, suggestions, onCreateSubject, tutorTools }: CardProps) {
  const meta = row.editor;
  const editable = canEdit && meta !== null;
  const serverSig = JSON.stringify(row.rawValue ?? null);
  const initial = React.useMemo<EditorValue>(() => (meta ? initialEditorValue(meta, row.rawValue) : ''), [meta, serverSig]); // eslint-disable-line react-hooks/exhaustive-deps
  const [value, setValue] = React.useState<EditorValue>(initial);
  // The stored value this draft started from. A save is checked against it, so a change made by someone else is caught.
  const [base, setBase] = React.useState<unknown>(row.rawValue ?? null);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const isWhatsapp = row.fieldKey === 'parent.whatsappNumber';
  // "WhatsApp number is the same as primary contact number": the box follows the primary number while this is ticked.
  const [sameAsPrimary, setSameAsPrimary] = React.useState<boolean>(() => isWhatsapp && typeof row.rawValue === 'string' && row.rawValue !== '' && row.rawValue === primaryPhone);
  React.useEffect(() => {
    if (row.fieldKey === 'parent.primaryPhone') onPrimaryPhone(typeof value === 'string' ? value : '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  React.useEffect(() => {
    if (isWhatsapp && sameAsPrimary && value !== primaryPhone) setValue(primaryPhone);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sameAsPrimary, primaryPhone]);

  const dirty = meta ? isEditorDirty(meta, initialEditorValue(meta, base), value) : false;
  const serverMoved = dirty && serverSig !== JSON.stringify(base ?? null);

  // Follow the stored value after a save or a reload, unless the Mentor has an unsaved draft.
  React.useEffect(() => {
    if (!dirty) {
      setValue(initial);
      setBase(row.rawValue ?? null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serverSig]);

  React.useEffect(() => {
    onDirtyChange(row.fieldKey, dirty);
    return () => onDirtyChange(row.fieldKey, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dirty]);

  const pending = row.collection === 'PENDING';
  const wide = meta?.type === 'TEXTAREA' || meta?.type === 'ROWS' || meta?.type === 'SCHEDULE';
  const inputId = `field-${row.fieldKey}`;

  const saveNow = async (): Promise<boolean> => {
    if (!meta || !dirty) return true;
    setSaving(true);
    setError(null);
    const outcome = await saveField(meta, value, base, (cleaned, basedOn) => onSave(row.fieldKey, cleaned, basedOn));
    setSaving(false);
    if (outcome.kind === 'saved') {
      // What was just stored is the new starting point, so the card is clean even before the reload arrives.
      setBase(outcome.value);
      setValue(initialEditorValue(meta, outcome.value));
      return true;
    }
    setError(outcome.message); // the draft stays, so the Mentor can correct it and try again
    return false;
  };
  // The section calls the latest version of this function, so it always saves what is on screen now.
  const saveRef = React.useRef(saveNow);
  saveRef.current = saveNow;
  React.useEffect(() => {
    onRegister(row.fieldKey, dirty ? () => saveRef.current() : null);
    return () => onRegister(row.fieldKey, null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dirty]);

  const loadLatest = async () => {
    setError(null);
    setValue(initialEditorValue(meta!, base)); // dropping the draft lets the stored value replace it after the reload
    await onRefresh();
  };

  return (
    <li
      className={`rounded-md border p-3 ${error ? 'border-red-300' : dirty ? 'border-amber-300' : 'border-slate-200'} ${wide ? 'sm:col-span-2 2xl:col-span-3' : ''}`}
      data-field={row.fieldKey}
      data-status={pending ? (row.optional ? 'optional' : 'pending') : 'collected'}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <label htmlFor={inputId} className="text-sm font-medium text-slate-800">{row.label}</label>
        <StatusText row={row} dirty={dirty} />
      </div>

      <div className="mt-2">
        {editable && meta ? (
          <FieldInput
            id={inputId}
            label={row.label}
            meta={meta}
            value={value}
            onChange={(next) => setValue(next)}
            disabled={saving || (isWhatsapp && sameAsPrimary)}
            previous={base}
            suggestions={suggestions}
            studentGrade={studentGrade}
            onCreateSubject={onCreateSubject ? async (name) => { await onCreateSubject(name); await onRefresh(); } : undefined}
            tutorTools={tutorTools}
          />
        ) : pending ? (
          <p className="text-sm text-slate-400">No value yet</p>
        ) : isScheduleValue(row.rawValue) ? (
          <SubjectScheduleView value={row.rawValue} assignments={tutorTools?.assignments} tools={tutorTools} />
        ) : (
          <p className="whitespace-pre-line break-words text-sm text-slate-900 [overflow-wrap:anywhere]">{row.value}</p>
        )}
      </div>

      {editable && isWhatsapp && (
        <label className="mt-2 flex items-start gap-2 text-xs text-slate-700">
          <input type="checkbox" className="mt-0.5 h-4 w-4 rounded border-slate-300" checked={sameAsPrimary} disabled={saving} onChange={(e) => setSameAsPrimary(e.target.checked)} />
          <span>WhatsApp number is the same as primary contact number.</span>
        </label>
      )}
      {FIELD_HINTS[row.fieldKey] && <p className="mt-1 text-xs text-slate-600">{FIELD_HINTS[row.fieldKey]}</p>}

      <div className="mt-2 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div className="min-w-0 space-y-0.5 text-xs text-slate-500">
          {row.sourceText && <p>Source: {row.sourceText}</p>}
          {row.salesValue && <p className="break-words [overflow-wrap:anywhere]">Sales value: {row.salesValue}</p>}
          {row.fieldKey === 'academic.subjects' && <p>{SUBJECTS_NOTE}</p>}
        </div>
        {dirty && editable && (
          <Button type="button" size="sm" variant="ghost" disabled={saving} onClick={() => { setValue(initialEditorValue(meta!, base)); setError(null); }}>Undo changes</Button>
        )}
      </div>

      {serverMoved && !error && <p className="mt-1 text-xs text-amber-700">This value was changed by someone else while you were editing. Saving will ask you to load the latest value.</p>}
      {error && (
        <p role="alert" className="mt-1 text-xs font-medium text-red-600">
          {error}
          {isStaleMessage(error) && editable && (
            <button type="button" className="ml-2 underline" onClick={loadLatest}>Load latest value</button>
          )}
        </p>
      )}
    </li>
  );
}

interface Props {
  handover: unknown;
  /** True only for the assigned Mentor while the workflow is in progress and the meeting is open. The API checks the same. */
  canEdit?: boolean;
  onSave?: (fieldKey: string, value: unknown, basedOn: unknown) => Promise<void>;
  /** Verifies or withdraws one of the four sections. The API checks who may and what the section covers. */
  onVerifySection?: (sectionId: string, verified: boolean) => Promise<void>;
  onRefresh?: () => Promise<void>;
  onDirtyChange?: (id: string, dirty: boolean) => void;
  /** Adds a subject to the master list. Only passed for people who may manage reference data. */
  onCreateSubject?: (name: string) => Promise<void>;
  /** Tutor selection for the subject schedule. */
  tutorTools?: TutorTools;
  /** Adds a subject the parent asked for. The API counts its hours toward the Mentor's capacity and refuses it when they would not fit. */
  onAddSubject?: (subjectId: string, monthlyHours: number) => Promise<void>;
}

/** The `academic.subjects` list as the API sent it: Sales lines plus the ones the Mentor added. */
function subjectEntry(handover: unknown): unknown {
  const transferred = handover && typeof handover === 'object' ? (handover as { transferredFields?: unknown }).transferredFields : null;
  const entry = Array.isArray(transferred) ? transferred.find((e) => e && typeof e === 'object' && (e as { field?: unknown }).field === 'academic.subjects') : null;
  return entry ? (entry as { value?: unknown }).value : [];
}

/** The subject lines Sales entered, offered as quick starting points for the schedule cards. */
function salesSuggestions(handover: unknown): ScheduleSuggestion[] {
  const transferred = (handover && typeof handover === 'object' ? (handover as { transferredFields?: unknown }).transferredFields : null);
  const entry = Array.isArray(transferred) ? transferred.find((e) => e && typeof e === 'object' && (e as { field?: unknown }).field === 'academic.subjects') : null;
  const lines = entry && Array.isArray((entry as { value?: unknown }).value) ? ((entry as { value: unknown[] }).value) : [];
  return lines
    .filter((l): l is Record<string, unknown> => !!l && typeof l === 'object')
    .map((l) => ({ subject: typeof l.subject === 'string' ? l.subject.trim() : '', grade: typeof l.grade === 'string' ? l.grade.trim() : '', monthlyHours: l.monthlyHours === null || l.monthlyHours === undefined ? null : String(l.monthlyHours).trim() || null }))
    .filter((l) => l.subject);
}

/**
 * The fields of each step, in named parts. Every field is still its own card with its own value, source and status; the parts only
 * say what belongs together. A field the lists do not name goes in a last, unnamed part.
 */
const SUBSECTIONS: Record<string, ReadonlyArray<{ label: string; fields: readonly string[] }>> = {
  STUDENT_PARENT_INFO: [
    { label: 'Student profile', fields: ['student.firstName', 'student.lastName', 'student.dateOfBirth', 'student.gender', 'student.schoolName', 'student.grade', 'student.curriculum', 'student.cityLocation', 'student.notes'] },
    { label: 'Parent and contact information', fields: ['parent.name', 'parent.relationship', 'parent.primaryPhone', 'parent.whatsappNumber', 'parent.altPhone1', 'academic.preferredLanguage'] },
  ],
  SUBJECTS_TUTORS_TIMETABLE: [
    { label: 'A. Academic requirements', fields: ['academic.subjects', 'academic.weakAreas', 'academic.learningRequirements', 'academic.examPreparation', 'academic.subjectNotes'] },
    { label: 'B. Tutor preferences', fields: ['tutor.preferredQualifications', 'tutor.preferredLanguage', 'tutor.requirements'] },
    { label: 'C. Tutor assignment', fields: ['tutor.assignments'] },
    { label: 'D. Preferred timetable', fields: ['timetable.schedule'] },
  ],
  MARKS_EXAMINATIONS: [
    { label: 'A. Previous academic performance', fields: ['academic.previousPerformance', 'academic.previousPerformanceReason', 'academic.previousMarks'] },
    { label: 'B. Upcoming examination details', fields: ['examination.upcoming', 'examination.upcomingReason'] },
  ],
  EXPECTATIONS_ENGAGEMENT: [
    { label: 'A. Parent expectations', fields: ['parentExpectations'] },
    { label: 'B. Student engagement', fields: ['studentEngagement'] },
    { label: 'C. Learning difficulties and concerns', fields: ['student.learningConcerns'] },
  ],
};

/** A short line under a field that is only filled in when something is missing. */
const FIELD_HINTS: Readonly<Record<string, string>> = {
  'academic.previousPerformanceReason': 'Fill this in only if the marks cannot be collected. The reason lets the requirement be completed.',
  'examination.upcomingReason': 'Fill this in only if the examination details are pending or unavailable. The reason lets the requirement be completed.',
  'tutor.assignments': 'Each subject can have one tutor.',
};

function groupRows(sectionId: string, rows: InventoryRow[]): Array<{ label: string | null; rows: InventoryRow[] }> {
  const plan = SUBSECTIONS[sectionId];
  if (!plan) return [{ label: null, rows }];
  const used = new Set<string>();
  const parts = plan.map((p) => {
    const mine = p.fields.map((k) => rows.find((r) => r.fieldKey === k)).filter((r): r is InventoryRow => !!r);
    mine.forEach((r) => used.add(r.fieldKey));
    return { label: p.label as string | null, rows: mine };
  }).filter((p) => p.rows.length > 0);
  const rest = rows.filter((r) => !used.has(r.fieldKey));
  return rest.length > 0 ? [...parts, { label: null, rows: rest }] : parts;
}

/** The Sales subject list is read-only and belongs to the subjects section; anything the sections do not name goes to the first one. */
function rowsOfSection(sections: SectionView[], rows: InventoryRow[]): Map<string, InventoryRow[]> {
  const out = new Map<string, InventoryRow[]>(sections.map((s) => [s.sectionId, []]));
  for (const row of rows) {
    const owner =
      sections.find((s) => s.fieldKeys.includes(row.fieldKey)) ??
      (row.fieldKey === 'academic.subjects' ? sections.find((s) => s.sectionId === 'SUBJECTS_TUTORS_TIMETABLE') : undefined) ??
      sections[0];
    out.get(owner.sectionId)!.push(row);
  }
  return out;
}

/**
 * Stage 2 as four steps. The steps run across the top (1 to 4) and a bar under each fills as its section is completed. Each step shows
 * its own fields, which are edited in place with no save button of their own; one button at the bottom of the section saves every edited
 * field and then verifies the section. Editing a verified section returns that section, and only that one, to Not Verified (the API does this).
 */
export function InformationWorkspace({ handover, canEdit = false, onSave, onVerifySection, onRefresh, onDirtyChange, onCreateSubject, tutorTools, onAddSubject }: Props) {
  const inventory = buildInventory(handover);
  // A response without the four sections (an older API) still shows every field, in one group with nothing to verify.
  const fromApi = sectionsOf(handover);
  const sections: SectionView[] = fromApi.length > 0 ? fromApi : [{ sectionId: ALL_FIELDS, label: 'Student information', covers: '', fieldKeys: [], status: 'NOT_VERIFIED', verifiedByName: null, verifiedAt: null } as unknown as SectionView];
  const verifiable = fromApi.length > 0;
  // An edit that returns a verified section to Not verified says so, with the reason, instead of changing the badge silently.
  const previous = React.useRef<SectionView[]>(fromApi);
  const [resets, setResets] = React.useState<SectionView[]>([]);
  React.useEffect(() => {
    const reset = resetSections(previous.current, fromApi);
    if (reset.length > 0) setResets((cur) => [...cur.filter((c) => !reset.some((x) => x.sectionId === c.sectionId)), ...reset]);
    // A section verified again no longer needs the notice.
    setResets((cur) => cur.filter((c) => fromApi.find((x) => x.sectionId === c.sectionId)?.status !== 'VERIFIED'));
    previous.current = fromApi;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [handover]);
  const suggestions = React.useMemo(() => salesSuggestions(handover), [handover]);
  const save = onSave ?? (async () => undefined);
  const verifySection = onVerifySection ?? (async () => undefined);
  const refresh = onRefresh ?? (async () => undefined);
  const dirty = onDirtyChange ?? (() => undefined);

  const allRows = inventory.sections.flatMap((s) => s.rows);
  const bySection = rowsOfSection(sections, allRows);
  const primaryRow = allRows.find((r) => r.fieldKey === 'parent.primaryPhone');
  const primarySaved = primaryRow && typeof primaryRow.rawValue === 'string' ? primaryRow.rawValue : '';
  const gradeRow = allRows.find((r) => r.fieldKey === 'student.grade');
  const studentGrade = gradeRow && gradeRow.collection !== 'PENDING' && typeof gradeRow.rawValue === 'string' ? gradeRow.rawValue : null;

  const [active, setActive] = React.useState<number>(() => {
    const firstOpen = sections.findIndex((s) => s.status !== 'VERIFIED');
    return firstOpen < 0 ? 0 : firstOpen;
  });
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  // The primary number as it stands now (an unsaved edit counts), so the WhatsApp number can follow it.
  const [primaryDraft, setPrimaryDraft] = React.useState<string | null>(null);

  // Edited cards register a saver. Held in a ref so the section can call them in order, and mirrored in state to show the unsaved count.
  const savers = React.useRef(new Map<string, Saver>());
  const [dirtyKeys, setDirtyKeys] = React.useState<Set<string>>(() => new Set());
  const register = React.useCallback((fieldKey: string, saver: Saver | null) => {
    if (saver) savers.current.set(fieldKey, saver); else savers.current.delete(fieldKey);
    setDirtyKeys((cur) => {
      const has = cur.has(fieldKey);
      if (!!saver === has) return cur;
      const next = new Set(cur);
      if (saver) next.add(fieldKey); else next.delete(fieldKey);
      return next;
    });
  }, []);

  const current = sections[Math.min(active, sections.length - 1)];
  const done = verifiedCount(sections);

  const completeSection = async (s: SectionView, index: number) => {
    setBusy(true);
    setError(null);
    try {
      // Save every edited field of this section first, in order. If one is refused, stop: nothing is verified on top of a failed save.
      for (const row of bySection.get(s.sectionId) ?? []) {
        const saver = savers.current.get(row.fieldKey);
        if (saver && !(await saver())) {
          setError('Some changes could not be saved. Fix the fields marked below, then try again.');
          return;
        }
      }
      await verifySection(s.sectionId, true);
      if (index < sections.length - 1) setActive(index + 1);
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : 'The section could not be verified. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const withdraw = async (s: SectionView) => {
    setBusy(true);
    setError(null);
    try {
      await verifySection(s.sectionId, false);
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : 'The verification could not be withdrawn. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section aria-label="Student information" className="min-w-0 rounded-xl bg-white p-4 text-sm shadow-card ring-1 ring-slate-200/70 sm:p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-base font-semibold text-slate-900">Student information</h2>
        {verifiable && <span className="text-xs text-slate-600" data-testid="section-verified-count">{done} of {sections.length} sections verified</span>}
      </div>

      {verifiable && <nav aria-label="Verification sections" className="mt-4" data-testid="section-steps">
        {resets.length > 0 && (
          <div role="status" data-testid="section-reset-notice" className="mb-3 space-y-1 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            {resets.map((x) => <p key={x.sectionId}>{resetNotice(x)}</p>)}
          </div>
        )}
        <ol className="grid grid-cols-4 gap-1.5 sm:gap-2">
          {sections.map((s, i) => {
            // Progress counts the fields the Mentor has to fill. Optional fields never hold a step back.
            const required = (bySection.get(s.sectionId) ?? []).filter((r) => !r.optional);
            const collected = required.filter((r) => r.collection !== 'PENDING').length;
            const verified = s.status === 'VERIFIED';
            const pct = verified ? 100 : required.length ? Math.round((collected / required.length) * 100) : 0;
            const isCurrent = i === active;
            return (
              <li key={s.sectionId} data-section={s.sectionId} data-status={s.status.toLowerCase()} className="flex">
                <button
                  type="button"
                  onClick={() => setActive(i)}
                  aria-current={isCurrent ? 'step' : undefined}
                  className={`flex w-full flex-col gap-2 rounded-xl border p-2.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 sm:p-3 ${isCurrent ? 'border-brand-300 bg-brand-50 shadow-sm' : verified ? 'border-emerald-200 bg-emerald-50/40 hover:bg-emerald-50' : 'border-slate-200 bg-white hover:bg-slate-50'}`}
                >
                  <span className="flex items-center gap-2">
                    <span aria-hidden="true" className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${verified ? 'bg-emerald-600 text-white' : isCurrent ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-600'}`}>{verified ? <Check className="h-4 w-4" /> : i + 1}</span>
                    <span className={`hidden text-xs font-medium sm:inline ${verified ? 'text-emerald-700' : 'text-slate-600'}`}>{verified ? 'Verified' : required.length === 0 ? 'Optional fields' : `${collected} of ${required.length} fields`}</span>
                  </span>
                  <span className="text-xs font-semibold leading-snug text-slate-900 sm:text-sm"><span className="sr-only">Step {i + 1}: </span>{s.label}</span>
                  <span className="mt-auto block h-1.5 w-full overflow-hidden rounded-full bg-slate-200" role="progressbar" aria-label={`${s.label} progress`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}>
                    <span className={`block h-full rounded-full transition-[width] duration-300 motion-reduce:transition-none ${verified ? 'bg-emerald-500' : 'bg-brand-500'}`} style={{ width: `${pct}%` }} />
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
      </nav>}

      {/* Every section stays mounted and the others are hidden, so an unsaved draft is never lost by moving between steps. */}
      {sections.map((s, i) => {
        const isSubjects = s.sectionId === 'SUBJECTS_TUTORS_TIMETABLE';
        // The subject list has its own panel, so its read-only card is not repeated here.
        const rows = (bySection.get(s.sectionId) ?? []).filter((r) => !(isSubjects && r.fieldKey === 'academic.subjects'));
        const requiredRows = rows.filter((r) => !r.optional);
        const pending = requiredRows.filter((r) => r.collection === 'PENDING').length;
        const unsaved = rows.filter((r) => dirtyKeys.has(r.fieldKey)).length;
        const verified = s.status === 'VERIFIED';
        const shown = s.sectionId === current.sectionId;
        return (
          <section key={s.sectionId} aria-label={s.label} hidden={!shown} className={`${shown ? '' : 'hidden '}mt-5`} data-testid="section-panel" data-section-panel={s.sectionId}>
            <header>
              <h3 className="text-base font-semibold text-slate-900">{verifiable ? `${i + 1}. ` : ''}{s.label}</h3>
              <p className="mt-0.5 text-xs text-slate-600">{s.covers}</p>
              {pending > 0 && <p className="mt-1 text-xs font-medium text-amber-800">{pending} of {requiredRows.length} fields still to collect</p>}
            </header>

            {isSubjects && (
              <SubjectsPanel
                lines={subjectEntry(handover)}
                assignments={tutorTools?.assignments ?? []}
                schedule={allRows.find((r) => r.fieldKey === 'timetable.schedule')?.rawValue}
                options={allRows.find((r) => r.fieldKey === 'timetable.schedule')?.editor?.schedule?.subjects ?? []}
                canAdd={canEdit && !!onAddSubject}
                onAdd={onAddSubject ? async (subjectId, hours) => { await onAddSubject(subjectId, hours); await refresh(); } : undefined}
              />
            )}
            {groupRows(s.sectionId, rows).map((part, partIndex) => (
              <div key={part.label ?? `rest-${partIndex}`} className="mt-4" data-subsection={part.label ?? undefined}>
                {part.label && <h4 className="border-b border-slate-100 pb-1 text-sm font-semibold text-slate-800">{part.label}</h4>}
                <ul role="list" className="mt-2 grid gap-2 sm:grid-cols-2 2xl:grid-cols-3">
                  {part.rows.map((row) => (
                    <FieldCard key={row.fieldKey} row={row} canEdit={canEdit} onSave={save} onRefresh={refresh} onDirtyChange={dirty} onRegister={register} studentGrade={studentGrade} onPrimaryPhone={setPrimaryDraft} primaryPhone={primaryDraft ?? primarySaved} suggestions={suggestions} onCreateSubject={onCreateSubject} tutorTools={tutorTools} />
                  ))}
                </ul>
              </div>
            ))}

            {verifiable && <footer className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4" data-testid="section-footer">
              <div className="min-w-0 text-xs">
                {verified && unsaved === 0 ? <p className="font-medium text-emerald-700">{verifiedLine(s)}</p>
                  : unsaved > 0 ? <p className="font-medium text-amber-700">{unsaved} unsaved {unsaved === 1 ? 'change' : 'changes'}. They are saved when you verify this section.</p>
                  : <p className="text-slate-600">Not verified yet.</p>}
                {error && shown && <p role="alert" className="mt-1 font-medium text-red-600">{error}</p>}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {i > 0 && <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={() => setActive(i - 1)}>Previous section</Button>}
                {canEdit && (verified && unsaved === 0 ? (
                  <Button type="button" size="sm" variant="outline" isLoading={busy} onClick={() => withdraw(s)} aria-label={`Withdraw verification: ${s.label}`}>Withdraw verification</Button>
                ) : (
                  <Button type="button" size="sm" isLoading={busy} onClick={() => completeSection(s, i)} aria-label={`${unsaved > 0 ? 'Save and verify section' : 'Verify section'}: ${s.label}`}>{unsaved > 0 ? 'Save and verify section' : 'Verify section'}</Button>
                ))}
                {!canEdit && i < sections.length - 1 && <Button type="button" size="sm" variant="outline" onClick={() => setActive(i + 1)}>Next section</Button>}
              </div>
            </footer>}
          </section>
        );
      })}
    </section>
  );
}
