"use client";

import * as React from 'react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { fmt } from '../../labels';
import { HANDOVER_SOURCE_LABELS, PresentedField, presentHandover } from '../../handover-presentation';
import { FieldEditor } from './FieldEditor';

const BADGE_CLASS = 'shrink-0 px-2 py-0 text-[11px]';

interface RowProps {
  field: PresentedField;
  canEdit: boolean;
  onSave: (fieldKey: string, value: unknown) => Promise<void>;
  onDirtyChange: (id: string, dirty: boolean) => void;
}

function FieldRow({ field, canEdit, onSave, onDirtyChange }: RowProps) {
  const [editing, setEditing] = React.useState(false);
  const collected = field.status === 'COLLECTED';
  const editable = canEdit && field.editor !== null;

  return (
    <li className="px-3 py-2">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-xs text-slate-500">{field.label}</p>
          {!editing && collected && <p className="whitespace-pre-line break-words text-slate-900 [overflow-wrap:anywhere]">{field.value}</p>}
          {!editing && !collected && field.hint && <p className="text-xs text-slate-500">{field.hint}</p>}
          {!editing && collected && field.source && (
            <p className="text-xs text-slate-500">
              {HANDOVER_SOURCE_LABELS[field.source]}
              {field.source !== 'SALES' && field.updatedByName ? ` · ${field.updatedByName}` : ''}
              {field.source !== 'SALES' && field.updatedAt ? ` · ${fmt(field.updatedAt)}` : ''}
            </p>
          )}
          {!editing && field.salesValue && <p className="break-words text-xs text-slate-500 [overflow-wrap:anywhere]">Sales value: {field.salesValue}</p>}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {collected ? (
            <Badge variant="success" className={BADGE_CLASS}>Collected</Badge>
          ) : (
            <Badge variant="danger" className={BADGE_CLASS}>Not collected</Badge>
          )}
          {editable && !editing && (
            <Button type="button" size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={() => setEditing(true)}>
              {collected ? 'Edit' : 'Add'}
            </Button>
          )}
        </div>
      </div>
      {editing && field.editor && (
        <div className="mt-2">
          <FieldEditor
            label={field.label}
            meta={field.editor}
            current={field.rawValue}
            onCancel={() => setEditing(false)}
            onDirtyChange={(dirty) => onDirtyChange(field.key, dirty)}
            onSave={async (value) => {
              await onSave(field.fieldKey, value);
              setEditing(false);
            }}
          />
        </div>
      )}
    </li>
  );
}

function FieldList({ fields, emptyText, ...rest }: { fields: PresentedField[]; emptyText: string } & Omit<RowProps, 'field'>) {
  if (fields.length === 0) return <p className="rounded-md bg-slate-50 px-3 py-2 text-slate-500">{emptyText}</p>;
  return (
    <ul role="list" className="divide-y divide-slate-100 rounded-md border border-slate-100">
      {fields.map((field) => (
        <FieldRow key={field.key} field={field} {...rest} />
      ))}
    </ul>
  );
}

interface Props {
  handover: unknown;
  /** True only for the assigned Mentor while the workflow is in progress; the API enforces the same rule. */
  canEdit?: boolean;
  onSave?: (fieldKey: string, value: unknown) => Promise<void>;
  onDirtyChange?: (id: string, dirty: boolean) => void;
}

/**
 * Admission handover: what Sales passed on, what Mentoring has added or corrected, and what is still required.
 * Labels, values and counts come from presentHandover(); nothing here reads a raw field path, and a partial
 * handover never throws. Editing never touches the Sales data: values are saved beside it by the API.
 */
export function HandoverSummary({ handover, canEdit = false, onSave, onDirtyChange }: Props) {
  const { collected, missing } = presentHandover(handover);
  const save = onSave ?? (async () => undefined);
  const dirty = onDirtyChange ?? (() => undefined);
  return (
    <section aria-label="Admission handover information" className="space-y-3 rounded-lg border border-slate-200 bg-white p-4 text-sm">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-semibold text-slate-900">Admission handover</h2>
        <p className="text-xs text-slate-500">
          {collected.length} collected · {missing.length} still required
        </p>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <div className="min-w-0 space-y-2">
          <h3 className="font-medium text-slate-700">Information collected ({collected.length})</h3>
          <FieldList fields={collected} emptyText="No information has been received from Sales yet." canEdit={canEdit} onSave={save} onDirtyChange={dirty} />
        </div>
        <div className="min-w-0 space-y-2">
          <h3 className="font-medium text-slate-700">Information still required ({missing.length})</h3>
          <FieldList fields={missing} emptyText="All required information has been collected." canEdit={canEdit} onSave={save} onDirtyChange={dirty} />
        </div>
      </div>
    </section>
  );
}
