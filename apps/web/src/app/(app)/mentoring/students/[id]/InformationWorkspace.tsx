"use client";

import * as React from 'react';
import { Button } from '@/components/ui/Button';
import { InventoryRow, RowFilter, buildInventory, matchesFilter } from '../../handover-inventory';
import { isStaleMessage, saveField } from '../../field-actions';
import { EditorValue, initialEditorValue, isEditorDirty } from '../../handover-editing';
import { isScheduleValue } from '../../subject-schedule';
import { FieldInput } from './FieldInput';
import { SectionVerificationPanel } from './SectionVerificationPanel';
import { TutorTools } from '../../tutor-types';
import { ScheduleSuggestion, SubjectScheduleView } from './SubjectScheduleEditor';

type Filter = RowFilter;

const SUBJECTS_NOTE = 'Set by Sales and locked after handover. Record anything else about the subjects under Subject Requirement Details.';

interface CardProps {
  row: InventoryRow;
  visible: boolean;
  canEdit: boolean;
  onSave: (fieldKey: string, value: unknown, basedOn: unknown) => Promise<void>;
  onRefresh: () => Promise<void>;
  onDirtyChange: (id: string, dirty: boolean) => void;
  suggestions: ScheduleSuggestion[];
  onCreateSubject?: (name: string) => Promise<void>;
  tutorTools?: TutorTools;
}

function StatusText({ row, dirty }: { row: InventoryRow; dirty: boolean }) {
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

function FieldCard({ row, visible, canEdit, onSave, onRefresh, onDirtyChange, suggestions, onCreateSubject, tutorTools }: CardProps) {
  const meta = row.editor;
  const editable = canEdit && meta !== null;
  const serverSig = JSON.stringify(row.rawValue ?? null);
  const initial = React.useMemo<EditorValue>(() => (meta ? initialEditorValue(meta, row.rawValue) : ''), [meta, serverSig]); // eslint-disable-line react-hooks/exhaustive-deps
  const [value, setValue] = React.useState<EditorValue>(initial);
  // The stored value this draft started from. A save is checked against it, so a change made by someone else is caught.
  const [base, setBase] = React.useState<unknown>(row.rawValue ?? null);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [saved, setSaved] = React.useState(false);

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

  React.useEffect(() => {
    if (!saved) return;
    const timer = setTimeout(() => setSaved(false), 2500);
    return () => clearTimeout(timer);
  }, [saved]);

  const pending = row.collection === 'PENDING';
  const wide = meta?.type === 'TEXTAREA' || meta?.type === 'ROWS' || meta?.type === 'SCHEDULE';
  const inputId = `field-${row.fieldKey}`;

  const save = async () => {
    if (!meta) return;
    setSaving(true);
    setError(null);
    const outcome = await saveField(meta, value, base, (cleaned, basedOn) => onSave(row.fieldKey, cleaned, basedOn));
    if (outcome.kind === 'saved') {
      // What was just stored is the new starting point, so the card is clean even before the reload arrives.
      setBase(outcome.value);
      setValue(initialEditorValue(meta, outcome.value));
      setSaved(true);
    } else setError(outcome.message); // the draft stays, so the Mentor can correct it or save again
    setSaving(false);
  };

  const loadLatest = async () => {
    setError(null);
    setValue(initialEditorValue(meta!, base)); // dropping the draft lets the stored value replace it after the reload
    await onRefresh();
  };

  return (
    <li
      className={`${visible ? '' : 'hidden '}rounded-md border border-slate-200 p-3 ${wide ? 'sm:col-span-2' : ''}`}
      data-field={row.fieldKey}
      data-status={pending ? 'pending' : 'collected'}
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
            onChange={(next) => { setValue(next); setSaved(false); }}
            disabled={saving}
            previous={base}
            suggestions={suggestions}
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

      <div className="mt-2 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div className="min-w-0 space-y-0.5 text-xs text-slate-500">
          {row.sourceText && <p>Source: {row.sourceText}</p>}
          {row.salesValue && <p className="break-words [overflow-wrap:anywhere]">Sales value: {row.salesValue}</p>}
          {row.fieldKey === 'academic.subjects' && <p>{SUBJECTS_NOTE}</p>}
        </div>

        {canEdit && (
          <div className="flex flex-wrap items-center gap-3">
            {dirty && editable && (
              <span className="flex items-center gap-2">
                <Button type="button" size="sm" isLoading={saving} onClick={save}>Save</Button>
                <Button type="button" size="sm" variant="ghost" disabled={saving} onClick={() => { setValue(initialEditorValue(meta!, base)); setError(null); }}>Undo changes</Button>
              </span>
            )}
            {saved && !dirty && <span role="status" className="text-xs font-medium text-emerald-700">Saved</span>}
          </div>
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

const FILTERS: Array<[Filter, string]> = [['ALL', 'All'], ['PENDING', 'Pending collection']];

/**
 * Stage 2. Every field is a card the Mentor can edit in place and save. Verification is not per field: the four sections above the fields
 * each have one Verify action, and editing information in a verified section returns that section to Not Verified (the API does this).
 */
export function InformationWorkspace({ handover, canEdit = false, onSave, onVerifySection, onRefresh, onDirtyChange, onCreateSubject, tutorTools }: Props) {
  const inventory = buildInventory(handover);
  const suggestions = React.useMemo(() => salesSuggestions(handover), [handover]);
  const [filter, setFilter] = React.useState<Filter>('ALL');
  const save = onSave ?? (async () => undefined);
  const verifySection = onVerifySection ?? (async () => undefined);
  const refresh = onRefresh ?? (async () => undefined);
  const dirty = onDirtyChange ?? (() => undefined);

  const counts: Record<Filter, number> = { ALL: inventory.total, PENDING: inventory.pending };
  const visible = (row: InventoryRow) => matchesFilter(filter, row);
  const anyVisible = inventory.sections.some((s) => s.rows.some(visible));

  const stats: Array<[string, number, string]> = [
    ['Total fields', inventory.total, 'text-slate-900'],
    ['Collected', inventory.collected, 'text-slate-900'],
    ['Pending collection', inventory.pending, 'text-amber-800'],
  ];

  return (
    <section aria-label="Student information" className="min-w-0 rounded-xl bg-white p-4 text-sm shadow-card ring-1 ring-slate-200/70 sm:p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-base font-semibold text-slate-900">Student information</h2>
        <span className="text-xs text-slate-600">{inventory.collected} of {inventory.total} fields collected</span>
      </div>
      <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-100" role="progressbar" aria-label="Fields collected" aria-valuemin={0} aria-valuemax={inventory.total} aria-valuenow={inventory.collected}>
        <div className="h-full rounded-full bg-emerald-500" style={{ width: `${inventory.total ? Math.round((inventory.collected / inventory.total) * 100) : 0}%` }} />
      </div>
      <dl className="mt-3 flex flex-wrap gap-x-6 gap-y-1" data-testid="information-counts">
        {stats.map(([label, number, tone]) => (
          <div key={label} className="flex items-baseline gap-2">
            <dt className="text-xs text-slate-600">{label}</dt>
            <dd className={`text-sm font-semibold ${tone}`}>{number}</dd>
          </div>
        ))}
      </dl>

      <SectionVerificationPanel handover={handover} canEdit={canEdit} onVerify={async (id, verified) => { await verifySection(id, verified); }} />

      <div role="group" aria-label="Show" className="mt-3 flex flex-wrap gap-1">
        {FILTERS.map(([key, label]) => (
          <button
            key={key}
            type="button"
            aria-pressed={filter === key}
            onClick={() => setFilter(key)}
            className={`rounded-md border px-2.5 py-1 text-xs ${filter === key ? 'border-brand-600 bg-brand-50 font-medium text-slate-900' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}
          >
            {label} {counts[key]}
          </button>
        ))}
      </div>

      <div className="mt-2 divide-y divide-slate-200">
        {inventory.sections.map((section) => {
          const sectionVisible = section.rows.some(visible);
          const pending = section.rows.filter((r) => r.collection === 'PENDING').length;
          return (
            <div key={section.key} className={`${sectionVisible ? '' : 'hidden '}py-3 first:pt-1`}>
              <h3 className="flex items-baseline gap-2 text-sm font-medium text-slate-700">
                {section.label}
                {pending > 0 && <span className="text-xs font-normal text-red-700">{pending} pending</span>}
              </h3>
              {/* Cards are hidden, not removed, when filtered out, so an unsaved draft is never lost by changing the filter. */}
              <ul role="list" className="mt-2 grid gap-2 sm:grid-cols-2">
                {section.rows.map((row) => (
                  <FieldCard key={row.fieldKey} row={row} visible={visible(row)} canEdit={canEdit} onSave={save} onRefresh={refresh} onDirtyChange={dirty} suggestions={suggestions} onCreateSubject={onCreateSubject} tutorTools={tutorTools} />
                ))}
              </ul>
            </div>
          );
        })}
        {!anyVisible && (
          <p className="py-4 text-slate-500">
            Nothing is pending collection.
          </p>
        )}
      </div>
    </section>
  );
}
