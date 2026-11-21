"use client";

import * as React from 'react';
import { DEFAULT_PENDING_HINT, buildOverview, OverviewRow } from '../../handover-inventory';
import { fmtDate } from '../../labels';
import { sectionsOf } from '../../section-verification-view';

/** A small status dot. The meaning is also in the heading text and the accessible label, never colour alone. */
function Dot({ tone, label }: { tone: 'green' | 'amber'; label: string }) {
  return <span role="img" aria-label={label} title={label} className={`inline-block h-2 w-2 shrink-0 rounded-full ${tone === 'green' ? 'bg-emerald-500' : 'bg-amber-500'}`} />;
}

/** What Sales sent: one small card per field, label above value, source below. */
function ReceivedCards({ rows }: { rows: OverviewRow[] }) {
  if (rows.length === 0) return <p className="text-slate-500">Sales has not passed on any information yet.</p>;
  return (
    <ul role="list" className="grid gap-2 sm:grid-cols-2">
      {rows.map((row) => (
        <li key={row.fieldKey} className="min-w-0 rounded-lg bg-slate-50 p-3 ring-1 ring-slate-200/70">
          <div className="flex items-center gap-2">
            <Dot tone="green" label="Received" />
            <p className="text-xs font-medium text-slate-600">{row.label}</p>
          </div>
          {row.value && <p className="mt-1 whitespace-pre-line break-words text-sm font-medium text-slate-900 [overflow-wrap:anywhere]">{row.value}</p>}
          {(row.note !== DEFAULT_PENDING_HINT || row.changedSince) && (
            <p className="mt-1 text-xs text-slate-600">
              {row.note}
              {row.changedSince ? '. Updated in the parent meeting; this is the value Sales sent.' : ''}
            </p>
          )}
        </li>
      ))}
    </ul>
  );
}

/** What is still missing, as compact tags. A note appears only when Sales left the field blank on purpose. */
function MissingTags({ rows }: { rows: OverviewRow[] }) {
  return (
    <ul role="list" className="flex flex-wrap gap-2">
      {rows.map((row) => (
        <li key={row.fieldKey} className="max-w-full rounded-lg bg-amber-50/70 px-2.5 py-1.5 ring-1 ring-amber-200/80">
          <div className="flex items-center gap-2">
            <Dot tone="amber" label="Missing" />
            <span className="text-xs font-medium text-slate-800">{row.label}</span>
          </div>
          {row.note !== DEFAULT_PENDING_HINT && <p className="mt-0.5 pl-4 text-xs text-slate-600">{row.note}</p>}
        </li>
      ))}
    </ul>
  );
}

interface Props {
  handover: unknown;
}

/**
 * Stage 1. What Sales handed over and what is still needed, read-only. Collecting and verifying happen in Stage 2, where the missing fields
 * sit in the same four sections they are grouped by here. The received list always shows the original Sales values.
 */
export function HandoverOverview({ handover }: Props) {
  const { received, required, optional, collectedSince } = buildOverview(handover);
  const handedOver = fmtDate((handover as { completedAt?: string } | null)?.completedAt);

  // Missing fields grouped by the four sections of Stage 2. The Sales subject list belongs to the subjects section; anything else goes to the first.
  const sections = sectionsOf(handover);
  const groups = sections.map((s) => ({
    key: s.sectionId,
    label: s.label,
    rows: required.filter((r) => (s.fieldKeys.includes(r.fieldKey) || (r.fieldKey === 'academic.subjects' && s.sectionId === 'SUBJECTS_TUTORS_TIMETABLE')) || (s === sections[0] && !sections.some((o) => o.fieldKeys.includes(r.fieldKey)) && r.fieldKey !== 'academic.subjects')),
  })).filter((g) => g.rows.length > 0);

  return (
    <section aria-label="Admission handover overview" className="rounded-xl bg-white p-4 text-sm shadow-card ring-1 ring-slate-200/70 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-2">
        <div>
          <h2 className="text-base font-semibold text-slate-900">Admission handover</h2>
          {handedOver && <p className="mt-0.5 text-xs text-slate-600">Handed over on {handedOver}</p>}
        </div>
        <p className="text-xs text-slate-700" data-testid="handover-summary">
          {received.length} received, {required.length} still required
          {collectedSince > 0 ? `, ${collectedSince} collected since by the Mentor` : ''}
        </p>
      </div>
      <div className="mt-5 grid gap-6 md:grid-cols-2">
        <div className="min-w-0">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
            <span aria-hidden className="inline-block h-2 w-2 rounded-full bg-emerald-500" />
            Received from Sales <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-800">{received.length}</span>
          </h3>
          <div className="mt-3"><ReceivedCards rows={received} /></div>
        </div>

        <div className="min-w-0">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
            <span aria-hidden className="inline-block h-2 w-2 rounded-full bg-amber-500" />
            Still required <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-800">{required.length}</span>
          </h3>
          {required.length > 0 && <p className="mt-1 text-xs text-slate-600">{DEFAULT_PENDING_HINT} Where Sales left a field blank, the row says so.</p>}
          <div className="mt-3 space-y-2">
            {required.length === 0 ? <p className="text-slate-500">Nothing is missing.</p>
              : groups.length > 0 ? groups.map((g) => (
                <details key={g.key} open className="group rounded-lg ring-1 ring-slate-200/70" data-section-group={g.key}>
                  <summary className="flex min-h-[2.75rem] cursor-pointer list-none items-center justify-between gap-2 rounded-lg px-3 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500">
                    <span>{g.label}</span>
                    <span className="text-xs font-normal text-slate-600">{g.rows.length} {g.rows.length === 1 ? 'field' : 'fields'}</span>
                  </summary>
                  <div className="px-3 pb-3"><MissingTags rows={g.rows} /></div>
                </details>
              ))
              : <MissingTags rows={required} />}
            {optional.length > 0 && (
              <details className="rounded-lg bg-slate-50 ring-1 ring-slate-200/70" data-testid="optional-fields">
                <summary className="flex min-h-[2.75rem] cursor-pointer list-none items-center justify-between gap-2 rounded-lg px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500">
                  <span>Optional, can stay empty</span>
                  <span className="text-xs font-normal text-slate-600">{optional.length} {optional.length === 1 ? 'field' : 'fields'}</span>
                </summary>
                <ul role="list" className="flex flex-wrap gap-2 px-3 pb-3">
                  {optional.map((row) => <li key={row.fieldKey} className="rounded-lg bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 ring-1 ring-slate-200">{row.label}</li>)}
                </ul>
              </details>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
