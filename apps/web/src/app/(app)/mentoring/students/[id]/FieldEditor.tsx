"use client";

import * as React from 'react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { EditorRow, EditorValue, emptyRow, initialEditorValue, isEditorDirty, validateEditorValue } from '../../handover-editing';
import { EditableFieldMeta } from '../../handover-presentation';

const AREA_CLASS =
  'block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500';

interface Props {
  label: string;
  meta: EditableFieldMeta;
  /** The current value in the editor's shape (a string, or a list of rows). */
  current: unknown;
  /** Saves the value; throws an Error whose message is shown to the user when the save fails. */
  onSave: (value: unknown) => Promise<void>;
  onCancel: () => void;
  onDirtyChange: (dirty: boolean) => void;
}

/** Compact inline editor with an input suited to the field and explicit Save and Cancel. */
export function FieldEditor({ label, meta, current, onSave, onCancel, onDirtyChange }: Props) {
  const initial = React.useMemo(() => initialEditorValue(meta, current), [meta, current]);
  const [value, setValue] = React.useState<EditorValue>(initial);
  const [error, setError] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);

  const dirty = isEditorDirty(meta, initial, value);
  React.useEffect(() => {
    onDirtyChange(dirty);
    return () => onDirtyChange(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dirty]);

  const save = async () => {
    const result = validateEditorValue(meta, value);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onSave(result.value);
    } catch (e: any) {
      setError(e?.message || 'The information could not be saved. Please try again.');
      setSaving(false);
    }
  };

  const text = typeof value === 'string' ? value : '';
  const rows = Array.isArray(value) ? value : [];
  const setRow = (index: number, key: string, cell: string) =>
    setValue(rows.map((row, i) => (i === index ? { ...row, [key]: cell } : row)));

  return (
    <div className="space-y-2">
      {meta.type === 'TEXT' && <Input aria-label={label} value={text} maxLength={meta.maxLength ?? undefined} onChange={(e) => setValue(e.target.value)} />}
      {meta.type === 'PHONE' && <Input aria-label={label} type="tel" inputMode="tel" placeholder="e.g. +91 98765 43210" value={text} onChange={(e) => setValue(e.target.value)} />}
      {meta.type === 'DATE' && (
        <Input aria-label={label} type="date" value={text} min={meta.minDate ?? undefined} max={meta.maxDate ?? undefined} onChange={(e) => setValue(e.target.value)} />
      )}
      {meta.type === 'SELECT' && (
        <Select aria-label={label} value={text} onChange={(e) => setValue(e.target.value)}>
          <option value="">Select…</option>
          {(meta.options ?? []).map((option) => (
            <option key={option} value={option}>{option}</option>
          ))}
        </Select>
      )}
      {meta.type === 'TEXTAREA' && (
        <textarea aria-label={label} rows={3} maxLength={meta.maxLength ?? undefined} className={AREA_CLASS} value={text} onChange={(e) => setValue(e.target.value)} />
      )}
      {meta.type === 'ROWS' && (
        <div className="space-y-2">
          {rows.map((row: EditorRow, index: number) => (
            <div key={index} className="flex flex-wrap items-center gap-2 rounded-md border border-slate-200 p-2">
              {(meta.columns ?? []).map((column) => (
                <div key={column.key} className="min-w-[8rem] flex-1">
                  {column.type === 'select' ? (
                    <Select aria-label={`${label} row ${index + 1} ${column.label}`} value={row[column.key] ?? ''} onChange={(e) => setRow(index, column.key, e.target.value)}>
                      <option value="">{column.label}…</option>
                      {(column.options ?? []).map((option) => <option key={option} value={option}>{option}</option>)}
                    </Select>
                  ) : (
                    <Input
                      aria-label={`${label} row ${index + 1} ${column.label}`}
                      type={column.type === 'date' ? 'date' : column.type === 'time' ? 'time' : 'text'}
                      placeholder={column.label}
                      value={row[column.key] ?? ''}
                      onChange={(e) => setRow(index, column.key, e.target.value)}
                    />
                  )}
                </div>
              ))}
              <Button type="button" size="sm" variant="ghost" aria-label={`Remove row ${index + 1}`} disabled={rows.length === 1} onClick={() => setValue(rows.filter((_, i) => i !== index))}>
                Remove
              </Button>
            </div>
          ))}
          <Button type="button" size="sm" variant="outline" onClick={() => setValue([...rows, emptyRow(meta)])}>Add row</Button>
        </div>
      )}

      {error && <p role="alert" className="text-xs font-medium text-red-600">{error}</p>}
      <div className="flex gap-2">
        <Button type="button" size="sm" isLoading={saving} onClick={save}>Save</Button>
        <Button type="button" size="sm" variant="ghost" disabled={saving} onClick={onCancel}>Cancel</Button>
      </div>
    </div>
  );
}
