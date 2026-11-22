"use client";

import * as React from 'react';
import { AlertTriangle, Inbox } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/utils';
import {
  DECISION_VARIANT, DECISIONS, LEAD_STATUS_VARIANT, LEAD_STATUSES, SLA_LABEL, STAGES, labelOf,
} from '../constants';

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: React.ReactNode }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-2xl font-bold text-slate-900 tracking-tight">{title}</h1>
        {subtitle && <p className="text-slate-500 text-sm mt-1">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function StageBadge({ stage }: { stage?: string | null }) {
  return <Badge variant="info">{labelOf(STAGES, stage)}</Badge>;
}

export function LeadStatusBadge({ status }: { status?: string | null }) {
  const s = status ?? 'PROCESSING';
  return <Badge variant={LEAD_STATUS_VARIANT[s] ?? 'default'}>{labelOf(LEAD_STATUSES, s)}</Badge>;
}

export function DecisionBadge({ decision }: { decision?: string | null }) {
  if (!decision) return <span className="text-xs text-slate-400">No decision</span>;
  return <Badge variant={DECISION_VARIANT[decision] ?? 'default'}>{labelOf(DECISIONS, decision)}</Badge>;
}

export function SlaBadge({ state }: { state?: string | null }) {
  const s = SLA_LABEL[state ?? 'NOT_APPLICABLE'] ?? SLA_LABEL.NOT_APPLICABLE;
  if (state === 'NOT_APPLICABLE' || !state) return null;
  return (
    <Badge variant={s.variant} className="gap-1">
      {state === 'OVERDUE' && <AlertTriangle className="w-3 h-3" aria-hidden />}
      {s.label}
    </Badge>
  );
}

export function StatCard({ label, value, hint, tone = 'default' }: { label: string; value: React.ReactNode; hint?: string; tone?: 'default' | 'danger' | 'warning' }) {
  return (
    <Card className={cn('p-4', tone === 'danger' && 'border-red-200 bg-red-50/40', tone === 'warning' && 'border-amber-200 bg-amber-50/40')}>
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-bold text-slate-900 tabular-nums">{value}</p>
      {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
    </Card>
  );
}

export function Field({ label, required, hint, error, children, htmlFor }: { label: string; required?: boolean; hint?: string; error?: string; children: React.ReactNode; htmlFor?: string }) {
  // Associate the label with its control even when the caller did not pass an id.
  const autoId = React.useId();
  const only = React.Children.count(children) === 1 && React.isValidElement(children) ? (children as React.ReactElement<any>) : null;
  const id = htmlFor ?? (only && typeof only.type !== 'string' ? (only.props.id ?? autoId) : only?.props.id ?? autoId);
  const control = only && !only.props.id && !htmlFor ? React.cloneElement(only, { id }) : children;
  return (
    <div className="space-y-1.5">
      <label htmlFor={htmlFor ?? (only ? id : undefined)} className="text-sm font-medium text-slate-700">
        {label} {required && <span className="text-red-500" aria-hidden>*</span>}
      </label>
      {control}
      {hint && !error && <p className="text-xs text-slate-500">{hint}</p>}
      {error && <p className="text-xs text-red-600" role="alert">{error}</p>}
    </div>
  );
}

export const textareaClass =
  'flex w-full rounded-md border border-slate-300 bg-surface px-3 py-2 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500';

export function NoAccess({ what }: { what: string }) {
  return (
    <div role="alert" className="max-w-xl rounded-md border border-slate-200 bg-white p-6">
      <p className="font-semibold text-slate-900">You do not have access to {what}</p>
      <p className="mt-1 text-sm text-slate-500">Ask a Tutor Head or administrator if you need this permission.</p>
    </div>
  );
}

export function Empty({ title, hint, action }: { title: string; hint?: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-10 px-4 text-slate-500">
      <Inbox className="w-8 h-8 mb-2 text-slate-300" aria-hidden />
      <p className="font-medium text-slate-700">{title}</p>
      {hint && <p className="text-sm mt-1 max-w-sm">{hint}</p>}
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}

export function ErrorNote({ message }: { message?: string | null }) {
  if (!message) return null;
  return (
    <div role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
      {message}
    </div>
  );
}

export function SkeletonRows({ rows = 4 }: { rows?: number }) {
  return (
    <div className="space-y-2 p-4" aria-busy="true" aria-label="Loading">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="h-10 rounded-md bg-slate-100 animate-pulse" />
      ))}
    </div>
  );
}

/** Small action dialog: title, body, error, and a primary submit. */
export function ActionDialog({
  isOpen, onClose, title, description, children, submitLabel, onSubmit, busy, error, danger, disabled,
}: {
  isOpen: boolean; onClose: () => void; title: string; description?: string; children?: React.ReactNode;
  submitLabel: string; onSubmit: () => void; busy?: boolean; error?: string | null; danger?: boolean; disabled?: boolean;
}) {
  return (
    <Modal isOpen={isOpen} onClose={onClose} size="md">
      <form
        className="space-y-4 pr-2"
        onSubmit={(e) => { e.preventDefault(); onSubmit(); }}
      >
        <div>
          <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
          {description && <p className="text-sm text-slate-500 mt-1">{description}</p>}
        </div>
        {children}
        <ErrorNote message={error} />
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="submit" variant={danger ? 'danger' : 'primary'} isLoading={busy} disabled={disabled}>{submitLabel}</Button>
        </div>
      </form>
    </Modal>
  );
}

/** Run a server action, surfacing its message. Returns the data or null. */
export async function runAction<T>(
  p: Promise<{ ok: true; data: T } | { ok: false; message: string; code?: string }>,
  setError: (m: string | null) => void,
): Promise<T | null> {
  setError(null);
  const r = await p;
  if (!r.ok) { setError(r.message); return null; }
  return r.data;
}
