"use client";

import * as React from 'react';
import { AlertTriangle, Check, Clock } from 'lucide-react';

import { CheckRow, ReminderCheck, TimingRow, timingHistory } from './class-sections-view';
import { ChipTone, FOCUS, PANEL, StatusChip } from './mentoring-ui';
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

// ─── The before-class checkbox ───────────────────────────────────────────────────────────────────────────────────
const REMINDER_TONE: Record<ReminderCheck['status'], ChipTone> = { PENDING: 'neutral', PREPARED: 'warning', SENT: 'success', NOT_NEEDED: 'neutral' };

/**
 * The before-class checklist: one item with a real checkbox. It is ticked only when the API says the reminder was recorded as shared. Ticking it
 * (where the person may act) asks for one confirmation and then calls the existing "I shared it" action, so the server checks who may do it and
 * keeps the record. A prepared message never ticks it.
 */
export function ReminderCheckbox({ check, busy, onConfirm }: { check: ReminderCheck; busy: boolean; onConfirm: (shareId: string) => void }) {
  const [asking, setAsking] = React.useState(false);
  const confirmRef = React.useRef<HTMLButtonElement>(null);
  const boxRef = React.useRef<HTMLInputElement>(null);
  React.useEffect(() => { if (asking) confirmRef.current?.focus(); }, [asking]);
  const disabled = !check.canTick || busy;
  const hint = check.status === 'PREPARED' && !check.canTick ? 'Only the assigned Mentor or the tutor can record this.' : null;
  return (
    <section aria-label="Before-class checklist" className={`${PANEL} p-4`} data-testid="before-checklist" data-status={check.status}>
      <div className="flex items-baseline justify-between gap-2">
        <h4 className="text-sm font-semibold text-slate-900">Before-class checklist</h4>
        <span className="text-xs font-medium text-slate-600">{check.done ? 1 : 0} of 1 done</span>
      </div>
      <div className="mt-3 flex items-start gap-3">
        <input ref={boxRef} id="reminder-sent-check" type="checkbox" checked={check.done} disabled={disabled || check.done} aria-describedby="reminder-sent-status"
          onChange={() => { if (!check.done) setAsking(true); }}
          className="mt-0.5 h-5 w-5 shrink-0 rounded border-slate-400 text-brand-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60" />
        <div className="min-w-0 flex-1">
          <label htmlFor="reminder-sent-check" className="text-sm font-medium text-slate-900">Tutor has sent the class reminder to the student</label>
          <p id="reminder-sent-status" className="mt-1 flex flex-wrap items-center gap-2 text-sm text-slate-700">
            <StatusChip tone={REMINDER_TONE[check.status]}>{check.label}</StatusChip>
            <span>{check.detail}</span>
          </p>
          {hint && <p className="mt-1 text-xs text-slate-600">{hint}</p>}
          {asking && !check.done && (
            <div role="group" aria-label="Confirm the reminder was shared" className="mt-3 rounded-md bg-slate-50 p-3 text-sm text-slate-800" data-testid="reminder-confirm">
              <p>Record that the reminder was shared with the student? This records who said so and when. It is not proof that the student read it.</p>
              <div className="mt-2 flex flex-wrap gap-2">
                <button ref={confirmRef} type="button" disabled={busy || !check.shareId} onClick={() => { if (check.shareId) { setAsking(false); onConfirm(check.shareId); } }}
                  className="inline-flex min-h-9 items-center rounded-md bg-brand-600 px-3 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2">Record as sent</button>
                <button type="button" onClick={() => { setAsking(false); boxRef.current?.focus(); }}
                  className="inline-flex min-h-9 items-center rounded-md bg-white px-3 text-sm font-medium text-slate-800 ring-1 ring-inset ring-slate-300 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500">Cancel</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

// ─── A tab bar ───────────────────────────────────────────────────────────────────────────────────────────────────
/** A horizontal tab bar that scrolls sideways on narrow screens. Arrow keys, Home and End move between tabs; the open tab is the only one in the tab order. */
export function TabBar({ label, tabs, value, onChange, idPrefix = 'ws' }: { label: string; tabs: ReadonlyArray<{ key: string; label: string }>; value: string; onChange: (key: string) => void; idPrefix?: string }) {
  const refs = React.useRef<Record<string, HTMLButtonElement | null>>({});
  const move = (to: number) => { const t = tabs[(to + tabs.length) % tabs.length]; onChange(t.key); refs.current[t.key]?.focus(); };
  const onKey = (e: React.KeyboardEvent, i: number) => {
    if (e.key === 'ArrowRight') { e.preventDefault(); move(i + 1); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); move(i - 1); }
    else if (e.key === 'Home') { e.preventDefault(); move(0); }
    else if (e.key === 'End') { e.preventDefault(); move(tabs.length - 1); }
  };
  return (
    <div className="-mx-1 mb-4 overflow-x-auto px-1">
      <div role="tablist" aria-label={label} className="flex min-w-max gap-1 border-b border-slate-200">
        {tabs.map((t, i) => {
          const on = t.key === value;
          return (
            <button key={t.key} ref={(el) => { refs.current[t.key] = el; }} type="button" role="tab" id={`${idPrefix}-tab-${t.key}`} aria-selected={on} aria-controls={`${idPrefix}-panel-${t.key}`} tabIndex={on ? 0 : -1}
              onClick={() => onChange(t.key)} onKeyDown={(e) => onKey(e, i)}
              className={`-mb-px inline-flex min-h-11 items-center border-b-2 px-4 text-sm ${FOCUS} ${on ? 'border-brand-600 font-semibold text-slate-900' : 'border-transparent font-medium text-slate-600 hover:text-slate-900'}`}>{t.label}</button>
          );
        })}
      </div>
    </div>
  );
}
