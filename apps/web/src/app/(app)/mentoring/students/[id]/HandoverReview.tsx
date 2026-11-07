"use client";

import * as React from 'react';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { ChecklistItemView, isItemResolved } from '../../checklist-progress';
import { fmt } from '../../labels';

interface Props {
  /** The single Stage 1 requirement (the handover review). */
  item: ChecklistItemView | undefined;
  /** Stored status of Stage 1. */
  stageStatus: string | undefined;
  /** The assigned Mentor, with Stage 1 open. The API enforces the same rule and holds the stage permissions. */
  editable: boolean;
  /** How many fields Sales handed over and how many are still required, shown in the confirmation. */
  received: number;
  required: number;
  /**
   * Records the review (when it is not recorded yet) and completes Stage 1. Throws an Error whose message is shown
   * when the API refuses, for example while a Counselor task is waiting for the Mentor's verification.
   */
  onSubmit: () => Promise<void>;
  /** Opens the confirmation on first render. Used by tests. */
  defaultOpen?: boolean;
}

/**
 * Stage 1 has one action: the assigned Mentor reviews what Sales handed over and submits the handover. Submitting
 * records the review and completes the stage. Collecting the missing information is Stage 2 work, so it is never
 * required here. Nobody else sees an action: the Mentoring Head, the CEO, the CO_FOUNDER and Counselors have no
 * Stage 1 permission, so the panel only tells them who submits.
 */
export function HandoverReview({ item, stageStatus, editable, received, required, onSubmit, defaultOpen = false }: Props) {
  const [open, setOpen] = React.useState(defaultOpen);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  if (!item) return null;

  const completed = stageStatus === 'COMPLETED';
  const recorded = isItemResolved(item);
  const who = item.updatedByName ? ` by ${item.updatedByName}` : '';
  const when = item.updatedAt ? `, ${fmt(item.updatedAt)}` : '';

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await onSubmit();
      setOpen(false);
    } catch (e: any) {
      setError(e?.message || 'The handover could not be submitted. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const heading = completed ? 'Handover submitted' : recorded ? 'Review recorded, ready to submit' : 'Review and submit the handover';
  let detail: string;
  if (completed) detail = `Stage 1 is complete${who}${when}. The Meeting with Parents is next.`;
  else if (editable && recorded) detail = `You recorded the review${who}${when}. Submit the handover to complete Stage 1 and open the Meeting with Parents.`;
  else if (editable) detail = 'Read what Sales handed over and what is still required, then submit. Missing information is collected in the Meeting with Parents, so you can submit even while fields are missing.';
  else if (recorded) detail = 'The review is recorded. The assigned Mentor submits the handover.';
  else detail = 'Awaiting review. The assigned Mentor reviews and submits the handover.';

  return (
    <section aria-label="Handover review" className="rounded-lg border border-slate-200 bg-white p-4 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0 max-w-2xl">
          <p className="font-medium text-slate-900">{heading}</p>
          <p className="text-xs text-slate-500">{detail}</p>
        </div>
        {editable && !completed && (
          <Button type="button" size="md" onClick={() => { setError(null); setOpen(true); }}>
            {recorded ? 'Submit handover' : 'Review and submit handover'}
          </Button>
        )}
      </div>
      {error && !open && <p role="alert" className="mt-2 text-xs font-medium text-red-600">{error}</p>}

      <Modal isOpen={open} onClose={() => { if (!busy) setOpen(false); }} size="md">
        <div role="dialog" aria-modal="true" aria-labelledby="handover-submit-title" className="space-y-3 pr-6">
          <h2 id="handover-submit-title" className="text-lg font-semibold text-slate-900">Submit the admission handover</h2>
          <p className="text-sm text-slate-700">By submitting you confirm that you have read:</p>
          <ul className="list-disc space-y-1 pl-5 text-sm text-slate-700">
            <li>what Sales handed over ({received} {received === 1 ? 'item' : 'items'} received)</li>
            <li>what is still required ({required} {required === 1 ? 'item' : 'items'})</li>
          </ul>
          <p className="text-sm text-slate-700">
            Missing information does not stop you here. You collect it with the parent in the next stage. Submitting completes Stage 1 and opens the Meeting with Parents. The original Sales data is not changed.
          </p>
          {error && <p role="alert" className="text-sm font-medium text-red-600">{error}</p>}
          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="ghost" disabled={busy} onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="button" isLoading={busy} onClick={submit}>Confirm and submit</Button>
          </div>
        </div>
      </Modal>
    </section>
  );
}
