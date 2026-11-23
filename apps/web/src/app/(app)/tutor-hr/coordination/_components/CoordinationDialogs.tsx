"use client";

import { useEffect, useState } from 'react';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { fromLocalInput, toLocalInput } from '../../hiring/constants';
import { ActionDialog, Field, runAction, textareaClass } from '../../hiring/_components/kit';
import { assignCoordinator, createObservation, deleteObservation, editObservation, listCoordinators } from '../actions';

type Common = { isOpen: boolean; onClose: () => void; onDone: (msg?: string) => void };

function useAction(onDone: Common['onDone'], onClose: Common['onClose']) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const exec = async (p: Promise<any>, msg: string | ((r: any) => string)) => {
    setBusy(true);
    const r = await runAction<any>(p, setError);
    setBusy(false);
    if (r !== null) { onClose(); onDone(typeof msg === 'function' ? msg(r) : msg); }
  };
  return { busy, error, setError, exec };
}

/** Head only: assign, reassign or unassign one or more tutors. */
export function AssignDialog({ tutors, ...c }: Common & { tutors: Array<{ id: string; name: string; coordinator?: { id: string } | null }> }) {
  const [coordinators, setCoordinators] = useState<any[]>([]);
  const [to, setTo] = useState('');
  const [reason, setReason] = useState('');
  const { busy, error, setError, exec } = useAction(c.onDone, c.onClose);
  useEffect(() => {
    if (!c.isOpen) return;
    setTo(''); setReason('');
    listCoordinators().then((r) => (r.ok ? setCoordinators(r.data) : setError(r.message)));
  }, [c.isOpen, setError]);
  const unassign = to === 'none';
  const reassigning = tutors.some((t) => t.coordinator);
  return (
    <ActionDialog isOpen={c.isOpen} onClose={c.onClose}
      title={tutors.length === 1 ? `Assign coordinator: ${tutors[0].name}` : `Assign coordinator to ${tutors.length} tutors`}
      description="The previous coordinator and this change are kept in the assignment history. Coordinators are notified in the OS."
      submitLabel={unassign ? 'Unassign' : 'Save'} busy={busy} error={error} danger={unassign}
      disabled={!to || (unassign && reason.trim().length < 3)}
      onSubmit={() => exec(assignCoordinator(tutors.map((t) => t.id), unassign ? null : to, reason.trim() || undefined), (r) => `${r.changed} tutor(s) updated`)}>
      <Field label="Tutor Coordinator" required>
        <Select required value={to} onChange={(e) => setTo(e.target.value)}>
          <option value="">Select coordinator</option>
          {coordinators.map((x) => <option key={x.id} value={x.id}>{x.name === x.email ? x.email : `${x.name} (${x.email})`} · {x.assignedTutors} assigned</option>)}
          {reassigning && <option value="none">Unassign (no coordinator)</option>}
        </Select>
      </Field>
      {coordinators.length === 0 && <p className="text-xs text-slate-500">No active users have the Tutor Coordinator role yet.</p>}
      <Field label="Reason" required={unassign}><textarea rows={2} maxLength={1000} className={textareaClass} value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
    </ActionDialog>
  );
}

/** Create (coordinator or Head) or edit (Head only) a class observation. */
export function ObservationDialog({ tutorId, tutorName, observation, ...c }: Common & { tutorId: string; tutorName: string; observation?: any }) {
  const [at, setAt] = useState('');
  const [pos, setPos] = useState('');
  const [neg, setNeg] = useState('');
  const { busy, error, exec } = useAction(c.onDone, c.onClose);
  useEffect(() => {
    if (!c.isOpen) return;
    setAt(toLocalInput(observation?.observedAt)); setPos(observation?.positiveFeedback ?? ''); setNeg(observation?.negativeFeedback ?? '');
  }, [c.isOpen, observation]);
  const body = () => ({ observedAt: fromLocalInput(at), positiveFeedback: pos.trim() || undefined, negativeFeedback: neg.trim() || undefined });
  return (
    <ActionDialog isOpen={c.isOpen} onClose={c.onClose} title={observation ? `Edit observation: ${tutorName}` : `Class observation: ${tutorName}`}
      description={observation ? 'The previous values are kept in the revision history.' : 'Saved observations are read-only for coordinators. Only the Head can correct them.'}
      submitLabel="Save observation" busy={busy} error={error} disabled={!at || (!pos.trim() && !neg.trim())}
      onSubmit={() => exec(observation ? editObservation(observation.id, body()) : createObservation(tutorId, body()), 'Observation saved')}>
      <Field label="Observed class date and time" required><Input type="datetime-local" required max={toLocalInput()} value={at} onChange={(e) => setAt(e.target.value)} /></Field>
      <Field label="Positive feedback"><textarea rows={3} maxLength={5000} className={textareaClass} value={pos} onChange={(e) => setPos(e.target.value)} /></Field>
      <Field label="Negative feedback"><textarea rows={3} maxLength={5000} className={textareaClass} value={neg} onChange={(e) => setNeg(e.target.value)} /></Field>
    </ActionDialog>
  );
}

/** Head only: hides the observation with a reason; it stays in history. */
export function DeleteObservationDialog({ observation, ...c }: Common & { observation: any }) {
  const [reason, setReason] = useState('');
  const { busy, error, exec } = useAction(c.onDone, c.onClose);
  useEffect(() => { if (c.isOpen) setReason(''); }, [c.isOpen]);
  return (
    <ActionDialog isOpen={c.isOpen} onClose={c.onClose} title="Delete observation"
      description="The observation is removed from the coordinator and HR views but kept, with your reason, in history."
      submitLabel="Delete" danger busy={busy} error={error} disabled={reason.trim().length < 3}
      onSubmit={() => exec(deleteObservation(observation.id, reason.trim()), 'Observation deleted')}>
      <Field label="Reason" required><textarea rows={2} maxLength={1000} className={textareaClass} value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
    </ActionDialog>
  );
}
