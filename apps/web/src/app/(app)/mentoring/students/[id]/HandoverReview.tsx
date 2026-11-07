"use client";

import * as React from 'react';
import { Check } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { ChecklistItemView, isItemResolved } from '../../checklist-progress';
import { fmt } from '../../labels';

/** The one label for the Stage 1 completion action, used by the stage action bar and by the review panel. */
export const COMPLETE_STAGE_1_LABEL = 'Complete Stage 1 and move to Meeting with Parents';

interface Props {
  /** The single Stage 1 requirement (the handover review). */
  item: ChecklistItemView | undefined;
  /** Stored status of Stage 1. */
  stageStatus: string | undefined;
  /** When Stage 1 was completed, for the completed message. */
  completedAt?: string | null;
  /** Name of the stage the workflow moves to, for the completed message. */
  nextStageName?: string;
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
  /** Lets the stage action bar open the same confirmation. When omitted the panel keeps its own state. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Opens the confirmation on first render. Used by tests. */
  defaultOpen?: boolean;
}

/**
 * Stage 1 has one action: the assigned Mentor acknowledges what Sales handed over and moves the student to the
 * Meeting with Parents. Collecting the missing information is Stage 2 work, so it is never required here. Nobody else
 * sees an action: the Mentoring Head, the CEO, the CO_FOUNDER and Counselors have no Stage 1 permission, so the panel
 * only tells them who completes the stage.
 */
export function HandoverReview({ item, stageStatus, completedAt, nextStageName = 'Meeting with Parents', editable, received, required, onSubmit, open: openProp, onOpenChange, defaultOpen = false }: Props) {
  const [ownOpen, setOwnOpen] = React.useState(defaultOpen);
  const open = openProp ?? ownOpen;
  const setOpen = (value: boolean) => (onOpenChange ? onOpenChange(value) : setOwnOpen(value));
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  if (!item) return null;

  const completed = stageStatus === 'COMPLETED';
  const recorded = isItemResolved(item);
  const who = item.updatedByName ? ` by ${item.updatedByName}` : '';
  const whenAt = completedAt ?? item.updatedAt;
  const when = whenAt ? ` on ${fmt(whenAt)}` : '';

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await onSubmit();
      setOpen(false);
    } catch (e: any) {
      setError(e?.message || 'Stage 1 could not be completed. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const heading = completed ? 'Stage 1 completed' : recorded ? 'Review recorded, ready to complete' : 'Complete Stage 1';
  let detail: string;
  if (completed) detail = `Stage 1 completed${who}${when}. Active stage: ${nextStageName}.`;
  else if (editable && recorded) detail = `You recorded the review${who}${when}. Complete Stage 1 to move the student to the ${nextStageName}.`;
  else if (editable) detail = 'Read what Sales handed over and what is still required, then complete the stage. Missing information is collected in the Meeting with Parents, so you can complete Stage 1 even while fields are missing.';
  else if (recorded) detail = 'The review is recorded. The assigned Mentor completes Stage 1.';
  else detail = 'Awaiting review. The assigned Mentor reviews the handover and completes Stage 1.';

  return (
    <section aria-label="Handover review" className="rounded-lg border border-slate-200 bg-white p-4 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0 max-w-2xl">
          <p className="flex items-center gap-2 font-medium text-slate-900">
            {completed && <Check aria-hidden className="h-4 w-4 text-emerald-600" />}
            {heading}
          </p>
          <p className="text-xs text-slate-500">{detail}</p>
        </div>
        {editable && !completed && (
          <Button type="button" size="md" onClick={() => { setError(null); setOpen(true); }}>
            {COMPLETE_STAGE_1_LABEL}
          </Button>
        )}
      </div>
      {error && !open && <p role="alert" className="mt-2 text-xs font-medium text-red-600">{error}</p>}

      <Modal isOpen={open} onClose={() => { if (!busy) setOpen(false); }} size="md">
        <div role="dialog" aria-modal="true" aria-labelledby="handover-submit-title" className="space-y-3 pr-6">
          <h2 id="handover-submit-title" className="text-lg font-semibold text-slate-900">Complete Stage 1</h2>
          <p className="text-sm text-slate-700">By completing Stage 1 you confirm that you have read:</p>
          <ul className="list-disc space-y-1 pl-5 text-sm text-slate-700">
            <li>what Sales handed over ({received} {received === 1 ? 'item' : 'items'} received)</li>
            <li>what is still required ({required} {required === 1 ? 'item' : 'items'})</li>
          </ul>
          <p className="text-sm text-slate-700">
            Missing information does not stop you here. You collect it with the parent in the next stage. Completing Stage 1 moves the student to the {nextStageName}. The original Sales data is not changed.
          </p>
          {error && <p role="alert" className="text-sm font-medium text-red-600">{error}</p>}
          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="ghost" disabled={busy} onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="button" isLoading={busy} onClick={submit}>Confirm and complete Stage 1</Button>
          </div>
        </div>
      </Modal>
    </section>
  );
}
