"use client";

import * as React from 'react';
import { fmt, pretty } from '../../labels';

export interface EarlierItem {
  key: string;
  label: string;
  group: string;
  state: string;
  value?: unknown;
  note?: string | null;
  reason?: string | null;
  evidenceRef?: string | null;
  exceptionReason?: string | null;
  updatedByName?: string | null;
  updatedAt?: string | null;
}

function valueText(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value);
  } catch {
    return '';
  }
}

/**
 * Results saved on Stage 1 before it became a single review. They no longer count towards any stage, but the
 * comments, evidence and values are kept and shown here, read-only, so nothing a Mentor or Counselor recorded is lost.
 */
export function EarlierResults({ items }: { items: EarlierItem[] }) {
  if (items.length === 0) return null;
  return (
    <details className="rounded-lg border border-slate-200 bg-white p-4 text-sm">
      <summary className="cursor-pointer font-medium text-slate-800">Earlier Stage 1 results ({items.length})</summary>
      <p className="mt-2 text-xs text-slate-500">Saved before Stage 1 became a single review. Kept for reference. They do not count towards any stage.</p>
      <ul role="list" className="mt-2 divide-y divide-slate-100">
        {items.map((item) => (
          <li key={item.key} className="py-2">
            <p className="break-words text-slate-800 [overflow-wrap:anywhere]">{item.label}</p>
            <p className="text-xs text-slate-500">
              {item.group}. {pretty(item.state)}
              {item.updatedByName ? `, ${item.updatedByName}` : ''}
              {item.updatedAt ? `, ${fmt(item.updatedAt)}` : ''}
            </p>
            {item.reason && <p className="break-words text-xs text-slate-600 [overflow-wrap:anywhere]">Reason: {item.reason}</p>}
            {item.note && <p className="break-words text-xs text-slate-600 [overflow-wrap:anywhere]">Comment: {item.note}</p>}
            {item.evidenceRef && <p className="break-words text-xs text-slate-600 [overflow-wrap:anywhere]">Evidence: {item.evidenceRef}</p>}
            {valueText(item.value) && <p className="break-words text-xs text-slate-600 [overflow-wrap:anywhere]">Entered: {valueText(item.value)}</p>}
            {item.exceptionReason && <p className="break-words text-xs text-amber-800 [overflow-wrap:anywhere]">Exception reason: {item.exceptionReason}</p>}
          </li>
        ))}
      </ul>
    </details>
  );
}
