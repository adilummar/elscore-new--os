"use client";

import * as React from 'react';
import { Check } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { InventoryRow, RowFilter, buildInventory, matchesFilter } from '../../handover-inventory';
import { isStaleMessage, saveField, setVerification, verifyBlockedReason } from '../../field-actions';
import { EditorValue, initialEditorValue, isEditorDirty } from '../../handover-editing';
import { isScheduleValue } from '../../subject-schedule';
import { FieldInput } from './FieldInput';
import { TutorTools } from '../../tutor-types';
import { ScheduleSuggestion, SubjectScheduleView } from './SubjectScheduleEditor';

type Filter = RowFilter;

const SUBJECTS_NOTE = 'Set by Sales and locked after handover. Record anything else about the subjects under Subject Requirement Details.';

interface CardProps {
  row: InventoryRow;
  visible: boolean;
  canEdit: boolean;
  onSave: (fieldKey: string, value: unknown, basedOn: unknown) => Promise<void>;
  onVerify: (fieldKey: string, verified: boolean, basedOn: unknown) => Promise<void>;
  onRefresh: () => Promise<void>;
  onDirtyChange: (id: string, dirty: boolean) => void;
  suggestions: ScheduleSuggestion[];
  onCreateSubject?: (name: string) => Promise<void>;
  tutorTools?: TutorTools;
}

function StatusText({ row, dirty }: { row: InventoryRow; dirty: boolean }) {
  if (row.collection === 'PENDING') {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-red-700">
        <span aria-hidden className="inline-block h-1.5 w-1.5 rounded-full bg-red-500" />
        Pending collection
      </span>
    );
  }
  const unsaved = dirty ? <span className="text-xs font-medium text-amber-700">Unsaved changes</span> : null;
  if (row.verification === 'VERIFIED') {
    return (
      <span className="inline-flex items-center gap-2">
        <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700"><Check aria-hidden className="h-3.5 w-3.5" />Verified</span>
        {unsaved}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-2">
      <span className={`text-xs font-medium ${row.verification === 'CHANGED' ? 'text-amber-700' : 'text-slate-600'}`}>
        {row.verification === 'CHANGED' ? 'Changed since verified' : 'Not verified'}
      </span>
      {unsaved}
    </span>
  );
}

function FieldCard({ row, visible, canEdit, onSave, onVerify, onRefresh, onDirtyChange, suggestions, onCreateSubject, tutorTools }: CardProps) {
  const meta = row.editor;
  const editable = canEdit && meta !== null;
  const serverSig = JSON.stringify(row.rawValue ?? null);
  const initial = React.useMemo<EditorValue>(() => (meta ? initialEditorValue(meta, row.rawValue) : ''), [meta, serverSig]); // eslint-disable-line react-hooks/exhaustive-deps
  const [value, setValue] = React.useState<EditorValue>(initial);
  // The stored value this draft started from. A save is checked against it, so a change made by someone else is caught.
  const [base, setBase] = React.useState<unknown>(row.rawValue ?? null);
  const [saving, setSaving] = React.useState(false);
  const [verifying, setVerifying] = React.useState(false);
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

  const toggleVerified = async (checked: boolean) => {
    setVerifying(true);
    setError(null);
    const outcome = await setVerification(checked, { collection: row.collection, hasUnsavedChange: dirty, storedValue: row.rawValue }, (verified, basedOn) => onVerify(row.fieldKey, verified, basedOn));
    if (outcome.kind !== 'done') setError(outcome.message);
    setVerifying(false);
  };

  const verifyDisabledReason = verifyBlockedReason(row.collection, dirty);

  return (
    <li
      className={`${visible ? '' : 'hidden '}rounded-md border border-slate-200 p-3 ${wide ? 'sm:col-span-2' : ''}`}
      data-field={row.fieldKey}
      data-status={pending ? 'pending' : 'collected'}
      data-verification={pending ? 'none' : row.verification.toLowerCase()}
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
          <SubjectScheduleView value={row.rawValue} assignments={tutorTools?.assignments} />
        ) : (
          <p className="whitespace-pre-line break-words text-sm text-slate-900 [overflow-wrap:anywhere]">{row.value}</p>
        )}
      </div>

      <div className="mt-2 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div className="min-w-0 space-y-0.5 text-xs text-slate-500">
          {row.sourceText && <p>Source: {row.sourceText}</p>}
          {row.salesValue && <p className="break-words [overflow-wrap:anywhere]">Sales value: {row.salesValue}</p>}
          {row.verification !== 'NOT_VERIFIED' && !pending && row.verifiedText && (
            <p className={row.verification === 'VERIFIED' ? 'text-emerald-700' : 'text-amber-700'}>{row.verifiedText}</p>
          )}
          {row.fieldKey === 'academic.subjects' && <p>{SUBJECTS_NOTE}</p>}
        </div>

        {canEdit && (
          <div className="flex flex-wrap items-center gap-3">
            <label className={`inline-flex items-center gap-2 text-xs ${verifyDisabledReason ? 'text-slate-400' : 'text-slate-700'}`} title={verifyDisabledReason ?? undefined}>
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-slate-300"
                checked={row.verification === 'VERIFIED'}
                disabled={Boolean(verifyDisabledReason) || verifying || saving}
                onChange={(e) => toggleVerified(e.target.checked)}
                aria-label={`I have verified this information: ${row.label}`}
              />
              I have verified this information
            </label>
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
  onVerify?: (fieldKey: string, verified: boolean, basedOn: unknown) => Promise<void>;
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

const FILTERS: Array<[Filter, string]> = [['ALL', 'All'], ['PENDING', 'Pending collection'], ['NOT_VERIFIED', 'Not verified'], ['VERIFIED', 'Verified']];

/**
 * Stage 2. Every field is a card the Mentor can edit in place, save, and confirm with a checkbox. Saving a value and
 * verifying it are separate actions with separate stored records; a verified value that is edited stops counting as
 * verified until it is confirmed again. All counts come from the stored values and confirmations.
 */
export function InformationWorkspace({ handover, canEdit = false, onSave, onVerify, onRefresh, onDirtyChange, onCreateSubject, tutorTools }: Props) {
  const inventory = buildInventory(handover);
  const suggestions = React.useMemo(() => salesSuggestions(handover), [handover]);
  const [filter, setFilter] = React.useState<Filter>('ALL');
  const save = onSave ?? (async () => undefined);
  const verify = onVerify ?? (async () => undefined);
  const refresh = onRefresh ?? (async () => undefined);
  const dirty = onDirtyChange ?? (() => undefined);

  const counts: Record<Filter, number> = { ALL: inventory.total, PENDING: inventory.pending, NOT_VERIFIED: inventory.unverified, VERIFIED: inventory.verified };
  const visible = (row: InventoryRow) => matchesFilter(filter, row);
  const anyVisible = inventory.sections.some((s) => s.rows.some(visible));

  const stats: Array<[string, number, string]> = [
    ['Total fields', inventory.total, 'text-slate-900'],
    ['Collected', inventory.collected, 'text-slate-900'],
    ['Pending collection', inventory.pending, 'text-red-700'],
    ['Verified', inventory.verified, 'text-emerald-700'],
    ['Collected, not verified', inventory.unverified, 'text-amber-700'],
  ];

  return (
    <section aria-label="Student information" className="min-w-0 rounded-lg border border-slate-200 bg-white p-4 text-sm">
      <h2 className="font-semibold text-slate-900">Student information</h2>
      <dl className="mt-2 flex flex-wrap gap-2" data-testid="information-counts">
        {stats.map(([label, number, tone]) => (
          <div key={label} className="min-w-[7rem] flex-1 rounded-md bg-slate-50 px-3 py-2">
            <dt className="text-xs text-slate-500">{label}</dt>
            <dd className={`text-lg font-semibold ${tone}`}>{number}</dd>
          </div>
        ))}
      </dl>

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
                  <FieldCard key={row.fieldKey} row={row} visible={visible(row)} canEdit={canEdit} onSave={save} onVerify={verify} onRefresh={refresh} onDirtyChange={dirty} suggestions={suggestions} onCreateSubject={onCreateSubject} tutorTools={tutorTools} />
                ))}
              </ul>
            </div>
          );
        })}
        {!anyVisible && (
          <p className="py-4 text-slate-500">
            {filter === 'PENDING' ? 'Nothing is pending collection.' : filter === 'VERIFIED' ? 'Nothing has been verified yet.' : 'Everything collected has been verified.'}
          </p>
        )}
      </div>
    </section>
  );
}
