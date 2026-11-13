"use client";

import * as React from 'react';
import { AlertTriangle, Check, Clock } from 'lucide-react';

import { CheckRow, TimingRow, timingHistory } from './class-sections-view';
import { PANEL } from './mentoring-ui';
import type { WorkspaceData } from './workspace-view';

/** A checklist. Each item says whether it is done in words and with an icon, never by colour alone. */
export function Checklist({ title, rows, testId }: { title: string; rows: CheckRow[]; testId: string }) {
  const done = rows.filter((r) => r.done).length;
  return (
    <section aria-label={title} className={`${PANEL} p-4`} data-testid={testId}>
      <div className="flex items-baseline justify-between gap-2">
        <h4 className="text-sm font-semibold text-slate-900">{title}</h4>
        <span className="text-xs font-medium text-slate-600">{done} of {rows.length} done</span>
      </div>
      <ul className="mt-2 divide-y divide-slate-100">
        {rows.map((r) => (
          <li key={r.key} className="flex items-start gap-3 py-2.5 text-sm" data-done={r.done}>
            <span className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${r.done ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-600'}`}>
              {r.done ? <Check className="h-3.5 w-3.5" aria-hidden="true" /> : <Clock className="h-3.5 w-3.5" aria-hidden="true" />}
            </span>
            <div><p className="font-medium text-slate-900">{r.label}</p><p className="text-slate-700">{r.done ? 'Done' : 'Not done'}: {r.detail}</p></div>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function TutorUpdate({ rows }: { rows: Array<{ label: string; value: string }> }) {
  return (
    <section aria-label="Tutor update" className={`${PANEL} p-4`} data-testid="tutor-update">
      <h4 className="text-sm font-semibold text-slate-900">Update from the tutor</h4>
      {rows.length === 0
        ? <p className="mt-1 text-sm text-slate-700">The tutor has not submitted the class update yet.</p>
        : <dl className="mt-3 grid gap-x-6 gap-y-3 sm:grid-cols-2">{rows.map((r) => <div key={r.label}><dt className="text-xs font-medium text-slate-600">{r.label}</dt><dd className="text-sm text-slate-900">{r.value}</dd></div>)}</dl>}
    </section>
  );
}

export function Timing({ rows, w }: { rows: TimingRow[]; w: Pick<WorkspaceData, 'after'> }) {
  const history = timingHistory(w);
  return (
    <section aria-label="Scheduled and actual time" className={`${PANEL} p-4`} data-testid="timing">
      <dl className="grid gap-4 sm:grid-cols-3">
        {rows.map((r) => <div key={r.label}><dt className="text-xs font-medium text-slate-600">{r.label}</dt><dd className={`mt-0.5 text-base ${r.differs ? 'font-semibold text-amber-900' : 'text-slate-900'}`}>{r.value}</dd></div>)}
      </dl>
      {rows.some((r) => r.differs) && (
        <p className="mt-4 flex items-start gap-2 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />The actual time differs from the schedule. The approved timetable is not changed. Verification decides the minutes that count.</p>
      )}
      {history.length > 0 && (
        <div className="mt-4">
          <p className="text-xs font-medium text-slate-700">Changes to the reported time</p>
          <ul className="mt-1 space-y-0.5 text-sm text-slate-700">{history.map((h) => <li key={h.version}>Submission {h.version}, {h.at.slice(0, 16).replace('T', ' ')} UTC{h.by ? `, by ${h.by}` : ''}</li>)}</ul>
        </div>
      )}
    </section>
  );
}
