"use client";

import * as React from 'react';
import { DEFAULT_PENDING_HINT, buildOverview, OverviewRow } from '../../handover-inventory';
import { fmtDate } from '../../labels';

/** A small status dot. The meaning is also in the heading text and the accessible label, never colour alone. */
function Dot({ tone, label }: { tone: 'green' | 'red'; label: string }) {
  return <span role="img" aria-label={label} title={label} className={`mt-1.5 inline-block h-2 w-2 shrink-0 rounded-full ${tone === 'green' ? 'bg-emerald-500' : 'bg-red-500'}`} />;
}

function Rows({ rows, tone, label, empty }: { rows: OverviewRow[]; tone: 'green' | 'red'; label: string; empty: string }) {
  if (rows.length === 0) return <p className="text-slate-500">{empty}</p>;
  return (
    <ul role="list" className="divide-y divide-slate-100">
      {rows.map((row) => (
        <li key={row.fieldKey} className="flex items-start gap-2 py-2">
          <Dot tone={tone} label={label} />
          <div className="min-w-0 flex-1">
            <p className="text-xs text-slate-500">{row.label}</p>
            {row.value && <p className="whitespace-pre-line break-words text-slate-900 [overflow-wrap:anywhere]">{row.value}</p>}
            {(row.note !== DEFAULT_PENDING_HINT || row.changedSince) && (
              <p className="text-xs text-slate-500">
                {row.note}
                {row.changedSince ? '. Updated in the parent meeting; this is the value Sales sent.' : ''}
              </p>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}

interface Props {
  handover: unknown;
}

/**
 * Stage 1. What Sales handed over and what is still needed, read-only. Collecting and verifying happen in Stage 2.
 * The received list always shows the original Sales values.
 */
export function HandoverOverview({ handover }: Props) {
  const { received, required, collectedSince } = buildOverview(handover);
  const handedOver = fmtDate((handover as { completedAt?: string } | null)?.completedAt);
  return (
    <section aria-label="Admission handover overview" className="rounded-lg border border-slate-200 bg-white p-4 text-sm">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 className="font-semibold text-slate-900">Admission handover</h2>
        <p className="text-xs text-slate-500">
          {handedOver ? `Handed over on ${handedOver}. ` : ''}
          {received.length} received, {required.length} still required
          {collectedSince > 0 ? `, ${collectedSince} collected since by the Mentor` : ''}
        </p>
      </div>
      <div className="mt-3 grid gap-x-8 gap-y-4 md:grid-cols-2">
        <div className="min-w-0">
          <h3 className="flex items-center gap-2 font-medium text-slate-700">
            <span aria-hidden className="inline-block h-2 w-2 rounded-full bg-emerald-500" />
            Received from Sales <span className="font-normal text-slate-500">{received.length}</span>
          </h3>
          <Rows rows={received} tone="green" label="Received" empty="Sales has not passed on any information yet." />
        </div>
        <div className="min-w-0">
          <h3 className="flex items-center gap-2 font-medium text-slate-700">
            <span aria-hidden className="inline-block h-2 w-2 rounded-full bg-red-500" />
            Still required <span className="font-normal text-slate-500">{required.length}</span>
          </h3>
          {required.length > 0 && <p className="text-xs text-slate-500">{DEFAULT_PENDING_HINT} Where Sales left a field blank, the row says so.</p>}
          <Rows rows={required} tone="red" label="Missing" empty="Nothing is missing." />
        </div>
      </div>
    </section>
  );
}
