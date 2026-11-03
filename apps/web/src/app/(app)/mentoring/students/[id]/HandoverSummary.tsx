import * as React from 'react';
import { Badge } from '@/components/ui/Badge';
import { PresentedField, presentHandover } from '../../handover-presentation';

const BADGE_CLASS = 'shrink-0 px-2 py-0 text-[11px]';

function FieldList({ fields, emptyText }: { fields: PresentedField[]; emptyText: string }) {
  if (fields.length === 0) return <p className="rounded-md bg-slate-50 px-3 py-2 text-slate-500">{emptyText}</p>;
  return (
    <ul role="list" className="divide-y divide-slate-100 rounded-md border border-slate-100">
      {fields.map((field) => (
        <li key={field.key} className="flex items-start justify-between gap-3 px-3 py-2">
          <div className="min-w-0 flex-1">
            <p className="text-xs text-slate-500">{field.label}</p>
            {field.status === 'COLLECTED' ? (
              <p className="break-words text-slate-900 [overflow-wrap:anywhere]">{field.value}</p>
            ) : (
              field.hint && <p className="text-xs text-slate-500">{field.hint}</p>
            )}
          </div>
          {field.status === 'COLLECTED' ? (
            <Badge variant="success" className={BADGE_CLASS}>Collected</Badge>
          ) : (
            <Badge variant="danger" className={BADGE_CLASS}>Not collected</Badge>
          )}
        </li>
      ))}
    </ul>
  );
}

/**
 * Admission handover: what Sales passed on and what Mentoring still has to gather. Labels, values and counts come
 * from presentHandover(); nothing here reads a raw field path, and a partial handover never throws.
 */
export function HandoverSummary({ handover }: { handover: unknown }) {
  const { collected, missing } = presentHandover(handover);
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
          <h3 className="font-medium text-slate-700">Information received from Sales ({collected.length})</h3>
          <FieldList fields={collected} emptyText="No information has been received from Sales yet." />
        </div>
        <div className="min-w-0 space-y-2">
          <h3 className="font-medium text-slate-700">Information still required ({missing.length})</h3>
          <FieldList fields={missing} emptyText="All required information has been collected." />
        </div>
      </div>
    </section>
  );
}
