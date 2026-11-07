"use client";

import * as React from 'react';
import { Button } from '@/components/ui/Button';
import { DEFAULT_PENDING_HINT, InventoryRow, buildInventory } from '../../handover-inventory';
import { FieldEditor } from './FieldEditor';

type Filter = 'ALL' | 'PENDING' | 'UNVERIFIED';

interface RowProps {
  row: InventoryRow;
  canEdit: boolean;
  onSave: (fieldKey: string, value: unknown) => Promise<void>;
  onVerify: (fieldKey: string, verified: boolean) => Promise<void>;
  onDirtyChange: (id: string, dirty: boolean) => void;
}

const SUBJECTS_NOTE = 'Set by Sales and locked after handover. Record anything else about the subjects under Subject Requirement Details.';

function PendingMark() {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-red-700">
      <span aria-hidden className="inline-block h-1.5 w-1.5 rounded-full bg-red-500" />
      Pending collection
    </span>
  );
}

function FieldRow({ row, canEdit, onSave, onVerify, onDirtyChange }: RowProps) {
  const [editing, setEditing] = React.useState(false);
  const [expanded, setExpanded] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const pending = row.collection === 'PENDING';
  const editor = canEdit ? row.editor : null;
  const isRows = row.editor?.type === 'ROWS';

  const save = async (value: unknown) => {
    await onSave(row.fieldKey, value);
    setEditing(false);
    setExpanded(false);
  };
  const verify = async (verified: boolean) => {
    setBusy(true);
    setError(null);
    try {
      await onVerify(row.fieldKey, verified);
    } catch (e: any) {
      setError(e?.message || 'This could not be saved. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <li className="py-3" data-field={row.fieldKey} data-status={pending ? 'pending' : 'collected'}>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
        <div className="min-w-0 flex-1">
          <p className="text-xs text-slate-500">{row.label}</p>
          {pending ? (
            <div className="space-y-0.5">
              <PendingMark />
              {/* The usual reason is the same on every pending row, so only an unusual reason is worth repeating. */}
              {row.hint && row.hint !== DEFAULT_PENDING_HINT && <p className="text-xs text-slate-500">{row.hint}</p>}
            </div>
          ) : (
            !editing && <p className="whitespace-pre-line break-words text-slate-900 [overflow-wrap:anywhere]">{row.value}</p>
          )}
          {!pending && !editing && (
            <div className="space-y-0.5 text-xs text-slate-500">
              {row.sourceText && <p>{row.sourceText}</p>}
              {row.salesValue && <p className="break-words [overflow-wrap:anywhere]">Sales value: {row.salesValue}</p>}
              <p className={row.verification === 'VERIFIED' ? 'text-emerald-700' : row.verification === 'CHANGED' ? 'text-amber-700' : ''}>
                {row.verification === 'NOT_VERIFIED' ? 'Not verified in the meeting' : row.verifiedText}
              </p>
              {row.fieldKey === 'academic.subjects' && <p>{SUBJECTS_NOTE}</p>}
            </div>
          )}
        </div>

        {!pending && !editing && canEdit && (
          <div className="flex shrink-0 gap-1">
            {row.verification === 'VERIFIED' ? (
              <Button type="button" size="sm" variant="ghost" className="h-7 px-2 text-xs" isLoading={busy} onClick={() => verify(false)} aria-label={`Withdraw verification of ${row.label}`}>
                Undo verification
              </Button>
            ) : (
              <Button type="button" size="sm" variant="outline" className="h-7 px-2 text-xs" isLoading={busy} onClick={() => verify(true)} aria-label={`Verify ${row.label}`}>
                Verify
              </Button>
            )}
            {editor && (
              <Button type="button" size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={() => setEditing(true)} aria-label={`Edit ${row.label}`}>
                Edit
              </Button>
            )}
          </div>
        )}
      </div>

      {error && <p role="alert" className="mt-1 text-xs font-medium text-red-600">{error}</p>}

      {editing && editor && (
        <div className="mt-2">
          <FieldEditor
            label={row.label}
            meta={editor}
            current={row.rawValue}
            onCancel={() => setEditing(false)}
            onDirtyChange={(dirty) => onDirtyChange(row.fieldKey, dirty)}
            onSave={save}
          />
        </div>
      )}

      {pending && editor && (
        <div className="mt-2">
          {isRows && !expanded ? (
            <Button type="button" size="sm" variant="outline" onClick={() => setExpanded(true)} aria-label={`Collect ${row.label}`}>
              Collect
            </Button>
          ) : (
            <FieldEditor
              label={row.label}
              meta={editor}
              current={null}
              alwaysOpen={!isRows}
              onCancel={() => setExpanded(false)}
              onDirtyChange={(dirty) => onDirtyChange(row.fieldKey, dirty)}
              onSave={save}
            />
          )}
        </div>
      )}
    </li>
  );
}

interface Props {
  handover: unknown;
  /** True only for the assigned Mentor while the workflow is in progress and the meeting is open. The API checks the same. */
  canEdit?: boolean;
  onSave?: (fieldKey: string, value: unknown) => Promise<void>;
  onVerify?: (fieldKey: string, verified: boolean) => Promise<void>;
  onDirtyChange?: (id: string, dirty: boolean) => void;
}

const FILTERS: Array<[Filter, string]> = [['ALL', 'All'], ['PENDING', 'Pending collection'], ['UNVERIFIED', 'Not verified']];

/**
 * Stage 2. Everything Mentoring needs for the student on one page: what is already known (with its source, collection
 * status and meeting verification) and what is still pending, each with an input the Mentor can fill in place.
 */
export function InformationWorkspace({ handover, canEdit = false, onSave, onVerify, onDirtyChange }: Props) {
  const inventory = buildInventory(handover);
  const [filter, setFilter] = React.useState<Filter>('ALL');
  const save = onSave ?? (async () => undefined);
  const verify = onVerify ?? (async () => undefined);
  const dirty = onDirtyChange ?? (() => undefined);

  const counts: Record<Filter, number> = { ALL: inventory.total, PENDING: inventory.pending, UNVERIFIED: inventory.unverified };
  const visible = (row: InventoryRow) =>
    filter === 'ALL' || (filter === 'PENDING' ? row.collection === 'PENDING' : row.collection !== 'PENDING' && row.verification !== 'VERIFIED');

  return (
    <section aria-label="Student information" className="min-w-0 rounded-lg border border-slate-200 bg-white p-4 text-sm">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2">
        <div>
          <h2 className="font-semibold text-slate-900">Student information</h2>
          <p className="text-xs text-slate-500" data-testid="information-counts">
            {inventory.collected} of {inventory.total} collected, {inventory.pending} pending, {inventory.verified} verified in the meeting
          </p>
        </div>
        <div role="group" aria-label="Show" className="flex flex-wrap gap-1">
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
      </div>

      <div className="mt-2 divide-y divide-slate-200">
        {inventory.sections.map((section) => {
          const rows = section.rows.filter(visible);
          if (rows.length === 0) return null;
          const pending = section.rows.filter((r) => r.collection === 'PENDING').length;
          return (
            <div key={section.key} className="py-3 first:pt-1">
              <h3 className="flex items-baseline gap-2 text-sm font-medium text-slate-700">
                {section.label}
                {pending > 0 && <span className="text-xs font-normal text-red-700">{pending} pending</span>}
              </h3>
              <ul role="list" className="divide-y divide-slate-100">
                {rows.map((row) => (
                  <FieldRow key={row.fieldKey} row={row} canEdit={canEdit} onSave={save} onVerify={verify} onDirtyChange={dirty} />
                ))}
              </ul>
            </div>
          );
        })}
        {inventory.sections.every((s) => s.rows.filter(visible).length === 0) && (
          <p className="py-4 text-slate-500">{filter === 'PENDING' ? 'Nothing is pending collection.' : 'Everything collected has been verified.'}</p>
        )}
      </div>
    </section>
  );
}
