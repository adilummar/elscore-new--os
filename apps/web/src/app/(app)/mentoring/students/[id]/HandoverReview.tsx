"use client";

import * as React from 'react';
import { Button } from '@/components/ui/Button';
import { ChecklistItemView, isItemResolved } from '../../checklist-progress';
import { fmt } from '../../labels';

interface Props {
  /** The single Stage 1 requirement (the handover review). */
  item: ChecklistItemView | undefined;
  /** The assigned Mentor, with Stage 1 open. The API enforces the same rule. */
  editable: boolean;
  onConfirm: (confirmed: boolean) => Promise<void>;
}

/**
 * Stage 1 has one requirement: the Mentor confirms they reviewed what Sales handed over and what is still needed.
 * Collecting the missing information is Stage 2 work, so there is nothing else to tick here.
 */
export function HandoverReview({ item, editable, onConfirm }: Props) {
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  if (!item) return null;
  const done = isItemResolved(item);

  const run = async (confirmed: boolean) => {
    setBusy(true);
    setError(null);
    try {
      await onConfirm(confirmed);
    } catch (e: any) {
      setError(e?.message || 'This could not be saved. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section aria-label="Handover review" className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white p-4 text-sm">
      <div className="min-w-0">
        <p className="font-medium text-slate-900">{done ? 'Handover reviewed' : 'Review the handover'}</p>
        <p className="text-xs text-slate-500">
          {done
            ? `${item.exception ? 'Exception authorised' : item.state === 'VERIFIED' ? 'Confirmed' : 'Marked unavailable'}${item.updatedByName ? ` by ${item.updatedByName}` : ''}${item.updatedAt ? `, ${fmt(item.updatedAt)}` : ''}. Complete the stage to move on to the meeting with the parents.`
            : 'Confirm that you have read what Sales handed over and what is still required. You collect the missing information in the next stage.'}
        </p>
        {error && <p role="alert" className="text-xs font-medium text-red-600">{error}</p>}
      </div>
      {editable && (
        done && item.state === 'VERIFIED' ? (
          <Button type="button" size="sm" variant="ghost" isLoading={busy} onClick={() => run(false)}>Undo</Button>
        ) : !done ? (
          <Button type="button" size="sm" isLoading={busy} onClick={() => run(true)}>Confirm handover reviewed</Button>
        ) : null
      )}
    </section>
  );
}
