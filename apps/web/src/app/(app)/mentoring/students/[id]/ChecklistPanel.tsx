"use client";

import * as React from 'react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import {
  ChecklistItemView,
  ITEM_STATUS_LABELS,
  computeProgress,
  describeRequirements,
  groupChecklist,
  isItemResolved,
  itemStatus,
  missingInformation,
} from '../../checklist-progress';
import { fmt } from '../../labels';

const AREA_CLASS =
  'block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500';

/** The states a Mentor can set by hand, in the words shown on screen. */
const STATE_CHOICES: Array<[string, string]> = [
  ['PENDING_COLLECTION', 'Pending'],
  ['COLLECTED', 'Collected, awaiting verification'],
  ['VERIFIED', 'Completed'],
  ['UNAVAILABLE', 'Unavailable or pending (reason required)'],
  ['NOT_APPLICABLE', 'Not applicable (reason required)'],
];

/** Plain colour for the one-word status next to an item. Completed items show a ticked box instead of a word. */
const STATUS_TONE: Record<string, string> = {
  AWAITING_VERIFICATION: 'text-blue-700',
  UNAVAILABLE: 'text-slate-600',
  NOT_APPLICABLE: 'text-slate-600',
  EXCEPTION: 'text-amber-800',
};

export interface ItemUpdate {
  state?: string;
  note?: string | null;
  reason?: string | null;
  evidenceRef?: string | null;
}

interface PanelProps {
  items: ChecklistItemView[];
  /** The assigned Mentor, with the stage open for work. The API enforces the same rule. */
  editable: boolean;
  /** The Mentoring Head, who can authorise an exception for an outstanding mandatory item. */
  canAuthorizeException: boolean;
  busy: boolean;
  onUpdate: (itemKey: string, update: ItemUpdate) => Promise<void>;
  onAuthorizeException: (itemKey: string, reason: string) => Promise<void>;
  onDirtyChange: (id: string, dirty: boolean) => void;
}

function ItemRow({ item, editable, canAuthorizeException, busy, onUpdate, onAuthorizeException, onDirtyChange }: Omit<PanelProps, 'items'> & { item: ChecklistItemView }) {
  const [open, setOpen] = React.useState(false);
  const [exceptionOpen, setExceptionOpen] = React.useState(false);
  const [state, setState] = React.useState(item.state);
  const [note, setNote] = React.useState(item.note ?? '');
  const [reason, setReason] = React.useState(item.reason ?? '');
  const [evidence, setEvidence] = React.useState(item.evidenceRef ?? '');
  const [exceptionReason, setExceptionReason] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);

  // Follow the saved state whenever the page reloads it from the server.
  React.useEffect(() => {
    setState(item.state); setNote(item.note ?? ''); setReason(item.reason ?? ''); setEvidence(item.evidenceRef ?? '');
  }, [item.state, item.note, item.reason, item.evidenceRef]);

  const status = itemStatus(item);
  const waitingFor = missingInformation(item);
  const blocked = waitingFor.length > 0 && item.state !== 'VERIFIED';
  const needsReason = state === 'UNAVAILABLE' || state === 'NOT_APPLICABLE';
  const detailsDirty = state !== item.state || note !== (item.note ?? '') || reason !== (item.reason ?? '') || evidence !== (item.evidenceRef ?? '');
  React.useEffect(() => {
    onDirtyChange(`item:${item.key}`, open && detailsDirty);
    return () => onDirtyChange(`item:${item.key}`, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, detailsDirty]);
  React.useEffect(() => {
    onDirtyChange(`exception:${item.key}`, exceptionOpen && exceptionReason.trim().length > 0);
    return () => onDirtyChange(`exception:${item.key}`, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exceptionOpen, exceptionReason]);

  const run = async (fn: () => Promise<void>, done?: () => void) => {
    setSaving(true);
    setError(null);
    try {
      await fn();
      done?.();
    } catch (e: any) {
      setError(e?.message || 'This could not be saved. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const saveDetails = () => {
    if (needsReason && !reason.trim()) { setError('A reason is required when an item is unavailable or not applicable'); return; }
    return run(
      () => onUpdate(item.key, { state, note: note.trim() || null, evidenceRef: evidence.trim() || null, ...(needsReason ? { reason: reason.trim() } : {}) }),
      () => setOpen(false),
    );
  };

  const cancelDetails = () => { setOpen(false); setError(null); setState(item.state); setNote(item.note ?? ''); setReason(item.reason ?? ''); setEvidence(item.evidenceRef ?? ''); };

  return (
    <li className="space-y-1 py-2" data-item={item.key}>
      <div className="flex items-start gap-3">
        <input
          type="checkbox"
          className="mt-1 h-4 w-4 shrink-0 rounded border-slate-300"
          aria-label={`${item.label}: ${item.state === 'VERIFIED' ? 'completed' : 'not completed'}`}
          title={blocked ? `Collect first: ${waitingFor.join(', ')}` : undefined}
          checked={item.state === 'VERIFIED'}
          disabled={!editable || busy || saving || blocked}
          onChange={(e) => run(() => onUpdate(item.key, { state: e.target.checked ? 'VERIFIED' : 'PENDING_COLLECTION' }))}
        />
        <div className="min-w-0 flex-1">
          <p className="break-words text-slate-800 [overflow-wrap:anywhere]">
            {item.label}
            {!item.mandatory && <span className="ml-2 text-xs text-slate-500">Advisory</span>}
            {status !== 'PENDING' && status !== 'COMPLETED' && !(status === 'EXCEPTION' && item.exceptionDetail) && <span className={`ml-2 text-xs ${STATUS_TONE[status] ?? ''}`}>{ITEM_STATUS_LABELS[status]}</span>}
          </p>
          {blocked && <p className="text-xs text-red-700">Waiting for {waitingFor.join(', ')}</p>}
          {(item.updatedByName || item.updatedAt) && item.state !== 'PENDING_COLLECTION' && (
            <p className="text-xs text-slate-500">{item.state === 'VERIFIED' ? 'Completed' : 'Updated'}{item.updatedByName ? ` by ${item.updatedByName}` : ''}{item.updatedAt ? `, ${fmt(item.updatedAt)}` : ''}</p>
          )}
          {item.exceptionDetail && (
            <p className="break-words text-xs text-amber-800 [overflow-wrap:anywhere]">
              Exception authorised{item.exceptionDetail.authorizedByName ? ` by ${item.exceptionDetail.authorizedByName}` : ''}, {fmt(item.exceptionDetail.at)}. Reason: {item.exceptionDetail.reason}
            </p>
          )}
          {item.reason && (item.state === 'UNAVAILABLE' || item.state === 'NOT_APPLICABLE') && <p className="break-words text-xs text-slate-600 [overflow-wrap:anywhere]">Reason: {item.reason}</p>}
          {item.note && <p className="break-words text-xs text-slate-600 [overflow-wrap:anywhere]">Comment: {item.note}</p>}
          {item.evidenceRef && <p className="break-words text-xs text-slate-600 [overflow-wrap:anywhere]">Evidence: {item.evidenceRef}</p>}
        </div>
        <div className="flex shrink-0 gap-1">
          {editable && !open && <Button type="button" size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => setOpen(true)}>Details</Button>}
          {canAuthorizeException && item.mandatory && !isItemResolved(item) && !exceptionOpen && (
            <Button type="button" size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => setExceptionOpen(true)}>Authorise exception</Button>
          )}
        </div>
      </div>

      {open && editable && (
        <div className="ml-7 grid gap-2 rounded-md bg-slate-50 p-2 md:grid-cols-2">
          <Select aria-label={`${item.label} status`} value={state} onChange={(e) => setState(e.target.value)}>
            {STATE_CHOICES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </Select>
          <Input aria-label={`${item.label} evidence link or reference`} placeholder="Evidence link or reference (optional)" value={evidence} onChange={(e) => setEvidence(e.target.value)} />
          <textarea aria-label={`${item.label} comment`} rows={2} placeholder="Comment (optional)" className={`${AREA_CLASS} md:col-span-2`} value={note} onChange={(e) => setNote(e.target.value)} />
          {needsReason && <Input aria-label={`${item.label} reason`} placeholder="Reason (required)" value={reason} onChange={(e) => setReason(e.target.value)} />}
          {error && <p role="alert" className="text-xs font-medium text-red-600 md:col-span-2">{error}</p>}
          <div className="flex gap-2 md:col-span-2">
            <Button type="button" size="sm" isLoading={saving} onClick={saveDetails}>Save</Button>
            <Button type="button" size="sm" variant="ghost" disabled={saving} onClick={cancelDetails}>Cancel</Button>
          </div>
        </div>
      )}

      {exceptionOpen && canAuthorizeException && (
        <div className="ml-7 space-y-2 rounded-md bg-amber-50 p-2">
          <p className="text-xs text-amber-900">An exception lets this stage be verified without completing the item. It is recorded with your name, the time and the reason.</p>
          <textarea aria-label={`${item.label} exception reason`} rows={2} placeholder="Reason for the exception (required)" className={AREA_CLASS} value={exceptionReason} onChange={(e) => setExceptionReason(e.target.value)} />
          {error && !open && <p role="alert" className="text-xs font-medium text-red-600">{error}</p>}
          <div className="flex gap-2">
            <Button type="button" size="sm" isLoading={saving} disabled={!exceptionReason.trim()} onClick={() => run(() => onAuthorizeException(item.key, exceptionReason.trim()), () => { setExceptionOpen(false); setExceptionReason(''); })}>Authorise exception</Button>
            <Button type="button" size="sm" variant="ghost" disabled={saving} onClick={() => { setExceptionOpen(false); setExceptionReason(''); setError(null); }}>Cancel</Button>
          </div>
        </div>
      )}
      {!open && !exceptionOpen && error && <p role="alert" className="ml-7 text-xs font-medium text-red-600">{error}</p>}
    </li>
  );
}

/** A stage's checklist: progress, then the requirements, each saved on its own with who, when, comment and evidence. */
export function ChecklistPanel({ items, ...rest }: PanelProps) {
  const progress = computeProgress(items);
  const groups = groupChecklist(items);
  const outstanding = progress.outstandingMandatory.length;

  return (
    <section aria-label="Checklist" className="rounded-lg border border-slate-200 bg-white p-4 text-sm">
      <div className="space-y-1">
        <p className="font-semibold text-slate-900">{describeRequirements(progress)}</p>
        <p className="text-xs text-slate-500">
          {outstanding > 0 ? `${outstanding} still to resolve before the stage can be completed` : 'Every requirement is resolved'}
          {progress.resolvedOther - progress.exceptions > 0 ? `, ${progress.resolvedOther - progress.exceptions} marked unavailable or not applicable` : ''}
          {progress.exceptions > 0 ? `, ${progress.exceptions} authorised as an exception` : ''}
        </p>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress.percent} aria-label="Checklist progress">
          <div className="h-full rounded-full bg-emerald-500" style={{ width: `${progress.percent}%` }} />
        </div>
      </div>

      {groups.map((group) => {
        const resolved = group.items.filter(isItemResolved).length;
        return (
          <div key={group.key ?? 'items'} className="mt-3" role="group" aria-label={group.label ?? 'Requirements'}>
            {group.label && (
              <h3 className="flex items-baseline justify-between gap-2 border-t border-slate-100 pt-3 text-sm font-medium text-slate-700">
                {group.label}
                <span className="text-xs font-normal text-slate-500">{resolved} of {group.items.length}</span>
              </h3>
            )}
            <ul role="list" className="divide-y divide-slate-100">
              {group.items.map((item) => <ItemRow key={item.key} item={item} {...rest} />)}
            </ul>
          </div>
        );
      })}
    </section>
  );
}
