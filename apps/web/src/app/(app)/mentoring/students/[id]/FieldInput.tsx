"use client";

import * as React from 'react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { EditorRow, EditorValue, emptyRow } from '../../handover-editing';
import { EditableFieldMeta } from '../../handover-presentation';
import { isScheduleValue } from '../../subject-schedule';
import { TutorTools } from '../../tutor-types';
import { ScheduleSuggestion, SubjectScheduleEditor } from './SubjectScheduleEditor';

const AREA_CLASS =
  'block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500';

interface Props {
  id: string;
  label: string;
  meta: EditableFieldMeta;
  value: EditorValue;
  onChange: (value: EditorValue) => void;
  disabled?: boolean;
  /** Subject schedule only. */
  previous?: unknown;
  suggestions?: ScheduleSuggestion[];
  onCreateSubject?: (name: string) => Promise<void>;
  tutorTools?: TutorTools;
}

/** Placeholder text per control, so an empty field says what to enter. */
export function placeholderFor(label: string, meta: EditableFieldMeta): string {
  switch (meta.type) {
    case 'PHONE':
      return 'e.g. +91 98765 43210';
    case 'DATE':
      return 'Select date';
    case 'SELECT':
      return 'Select';
    default:
      return `Enter ${label.toLowerCase()}`;
  }
}

/**
 * The control that suits the field: a date picker for dates, a select for fixed choices, a phone input, a text area
 * for notes, a small table for lists. Nothing is turned into a generic text input.
 */
export function FieldInput({ id, label, meta, value, onChange, disabled = false, previous, suggestions, onCreateSubject, tutorTools }: Props) {
  const text = typeof value === 'string' ? value : '';
  const rows = Array.isArray(value) ? value : [];
  const setRow = (index: number, key: string, cell: string) => onChange(rows.map((row, i) => (i === index ? { ...row, [key]: cell } : row)));
  const placeholder = placeholderFor(label, meta);

  switch (meta.type) {
    case 'TEXT':
      return <Input id={id} aria-label={label} placeholder={placeholder} disabled={disabled} value={text} maxLength={meta.maxLength ?? undefined} onChange={(e) => onChange(e.target.value)} />;
    case 'PHONE':
      return <Input id={id} aria-label={label} type="tel" inputMode="tel" placeholder={placeholder} disabled={disabled} value={text} onChange={(e) => onChange(e.target.value)} />;
    case 'DATE':
      return <Input id={id} aria-label={label} type="date" disabled={disabled} value={text} min={meta.minDate ?? undefined} max={meta.maxDate ?? undefined} onChange={(e) => onChange(e.target.value)} />;
    case 'SELECT':
      return (
        <Select id={id} aria-label={label} disabled={disabled} value={text} onChange={(e) => onChange(e.target.value)}>
          <option value="">{placeholder}</option>
          {(meta.options ?? []).map((option) => (
            <option key={option} value={option}>{option}</option>
          ))}
        </Select>
      );
    case 'TEXTAREA':
      return <textarea id={id} aria-label={label} rows={3} placeholder={placeholder} disabled={disabled} maxLength={meta.maxLength ?? undefined} className={AREA_CLASS} value={text} onChange={(e) => onChange(e.target.value)} />;
    case 'SCHEDULE':
      return isScheduleValue(value) ? (
        <SubjectScheduleEditor id={id} label={label} meta={meta} value={value} onChange={onChange} disabled={disabled} previous={previous} suggestions={suggestions} onCreateSubject={onCreateSubject} tutorTools={tutorTools} />
      ) : null;
    case 'ROWS':
      return (
        <div className="space-y-2" id={id}>
          {rows.map((row: EditorRow, index: number) => (
            <div key={index} className="flex flex-wrap items-center gap-2">
              {(meta.columns ?? []).map((column) => (
                <div key={column.key} className="min-w-[8rem] flex-1">
                  {column.type === 'select' ? (
                    <Select aria-label={`${label} row ${index + 1} ${column.label}`} disabled={disabled} value={row[column.key] ?? ''} onChange={(e) => setRow(index, column.key, e.target.value)}>
                      <option value="">{column.label}</option>
                      {(column.options ?? []).map((option) => <option key={option} value={option}>{option}</option>)}
                    </Select>
                  ) : (
                    <Input
                      aria-label={`${label} row ${index + 1} ${column.label}`}
                      type={column.type === 'date' ? 'date' : column.type === 'time' ? 'time' : 'text'}
                      placeholder={column.label}
                      disabled={disabled}
                      value={row[column.key] ?? ''}
                      onChange={(e) => setRow(index, column.key, e.target.value)}
                    />
                  )}
                </div>
              ))}
              <Button type="button" size="sm" variant="ghost" aria-label={`Remove row ${index + 1}`} disabled={disabled || rows.length === 1} onClick={() => onChange(rows.filter((_, i) => i !== index))}>
                Remove
              </Button>
            </div>
          ))}
          <Button type="button" size="sm" variant="outline" disabled={disabled} onClick={() => onChange([...rows, emptyRow(meta)])}>Add row</Button>
        </div>
      );
    default:
      return null;
  }
}
