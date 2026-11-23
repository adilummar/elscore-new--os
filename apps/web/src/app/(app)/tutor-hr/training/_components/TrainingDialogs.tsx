"use client";

import { useEffect, useState } from 'react';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { fmtDateTime, fromLocalInput, toLocalInput } from '../../hiring/constants';
import { ActionDialog, Field, runAction, textareaClass } from '../../hiring/_components/kit';
import Link from 'next/link';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { ErrorNote } from '../../hiring/_components/kit';
import {
  addParticipants, correctAttempt, createSession, listConductors, listTrainees, markReadyForAssignment, recordAttempt, rescheduleSession,
} from '../actions';
import { ATTENDANCE, isPass, remarksRequired } from '../constants';

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

/** Session 1 conductors are Tutor Coordinators / the Tutor Head; Session 2 conductors are HR. */
function useConductors(open: boolean, sessionNumber: number) {
  const [staff, setStaff] = useState<any[]>([]);
  useEffect(() => { if (open) listConductors(sessionNumber).then((r) => setStaff(r.ok ? r.data : [])); }, [open, sessionNumber]);
  return staff;
}
const staffLabel = (s: any) => (s.name === s.email ? s.email : `${s.name} (${s.email})`);

// ── Schedule (Head) ──
export function ScheduleSessionDialog(c: Common) {
  const [num, setNum] = useState('1');
  const staff = useConductors(c.isOpen, Number(num));
  const [when, setWhen] = useState('');
  const [who, setWho] = useState('');
  const { busy, error, exec } = useAction(c.onDone, c.onClose);
  return (
    <ActionDialog isOpen={c.isOpen} onClose={c.onClose} title="Schedule training session" submitLabel="Schedule" busy={busy} error={error}
      disabled={!when || !who}
      onSubmit={() => exec(createSession({ sessionNumber: Number(num), scheduledAt: fromLocalInput(when), conductorUserId: who }), `Session ${num} scheduled`)}>
      <Field label="Session" required>
        <Select value={num} onChange={(e) => { setNum(e.target.value); setWho(''); }}>
          <option value="1">Session 1</option>
          <option value="2">Session 2</option>
        </Select>
      </Field>
      <Field label="Date and time" required><Input type="datetime-local" required min={toLocalInput()} value={when} onChange={(e) => setWhen(e.target.value)} /></Field>
      <Field label="Conducted by" required hint={num === '1' ? 'Session 1: a Tutor Coordinator or the Tutor Head.' : 'Session 2: the HR Department.'}>
        <Select required value={who} onChange={(e) => setWho(e.target.value)}>
          <option value="">Select staff member</option>
          {staff.map((s) => <option key={s.id} value={s.id}>{staffLabel(s)}</option>)}
        </Select>
      </Field>
    </ActionDialog>
  );
}

// ── Reschedule (Head) ──
export function RescheduleSessionDialog({ session, ...c }: Common & { session: any }) {
  const staff = useConductors(c.isOpen, session.sessionNumber);
  const [when, setWhen] = useState(toLocalInput(session.scheduledAt));
  const [who, setWho] = useState(session.conductorUserId);
  const [reason, setReason] = useState('');
  const { busy, error, exec } = useAction(c.onDone, c.onClose);
  return (
    <ActionDialog isOpen={c.isOpen} onClose={c.onClose} title={`Reschedule Session ${session.sessionNumber}`}
      description={`Currently ${fmtDateTime(session.scheduledAt)}. The earlier time stays in history.`}
      submitLabel="Reschedule" busy={busy} error={error} disabled={!when || reason.trim().length < 3}
      onSubmit={() => exec(rescheduleSession(session.id, {
        scheduledAt: fromLocalInput(when), conductorUserId: who !== session.conductorUserId ? who : undefined, reason: reason.trim(),
      }), 'Session rescheduled')}>
      <Field label="New date and time" required><Input type="datetime-local" required min={toLocalInput()} value={when} onChange={(e) => setWhen(e.target.value)} /></Field>
      <Field label="Conducted by" required>
        <Select value={who} onChange={(e) => setWho(e.target.value)}>
          {staff.map((s) => <option key={s.id} value={s.id}>{staffLabel(s)}</option>)}
        </Select>
      </Field>
      <Field label="Reason" required><textarea rows={2} maxLength={1000} className={textareaClass} value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
    </ActionDialog>
  );
}

// ── Participants (HR Staff) ──
export function AddParticipantsDialog({ session, ...c }: Common & { session: any }) {
  const [eligible, setEligible] = useState<any[] | null>(null);
  const [picked, setPicked] = useState<string[]>([]);
  const { busy, error, setError, exec } = useAction(c.onDone, c.onClose);
  useEffect(() => {
    if (!c.isOpen) return;
    setPicked([]); setEligible(null);
    listTrainees(`eligibleFor=${session.sessionNumber}`).then((r) => (r.ok ? setEligible(r.data) : setError(r.message)));
  }, [c.isOpen, session.sessionNumber, setError]);
  const toggle = (id: string) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  return (
    <ActionDialog isOpen={c.isOpen} onClose={c.onClose} title={`Add trainees to Session ${session.sessionNumber}`}
      description={session.sessionNumber === 2
        ? 'Only trainees who passed Session 1 (attended with the task completed) are listed.'
        : 'Hired trainees who still need Session 1, including repeats, are listed.'}
      submitLabel={`Add ${picked.length || ''} trainee${picked.length === 1 ? '' : 's'}`.replace('  ', ' ')}
      busy={busy} error={error} disabled={!picked.length}
      onSubmit={() => exec(addParticipants(session.id, picked), (r) => `${r.added} trainee(s) added`)}>
      {eligible === null ? <p className="text-sm text-slate-500">Loading…</p> : eligible.length === 0 ? (
        <p className="text-sm text-slate-500">Nobody is waiting for Session {session.sessionNumber}.</p>
      ) : (
        <fieldset className="max-h-72 overflow-auto space-y-1">
          <legend className="sr-only">Trainees</legend>
          {eligible.map((t) => (
            <label key={t.candidate.id} className="flex items-center gap-3 rounded-md px-2 py-1.5 hover:bg-slate-50 cursor-pointer text-sm">
              <input type="checkbox" className="h-4 w-4 rounded border-slate-300" checked={picked.includes(t.candidate.id)} onChange={() => toggle(t.candidate.id)} />
              <span className="flex-1 min-w-0">
                <span className="font-medium text-slate-900">{t.candidate.name}</span>
                <span className="text-slate-500"> · {t.candidate.phone}</span>
              </span>
              {t.repeats[`session${session.sessionNumber}`] > 0 && <span className="text-xs text-amber-700">Repeat</span>}
            </label>
          ))}
        </fieldset>
      )}
    </ActionDialog>
  );
}

// ── Attendance (conductor) and correction (Head) ──
function ResultFields({ f, set }: { f: any; set: (k: string, v: any) => void }) {
  const needsRemarks = remarksRequired(f.attendance);
  return (
    <>
      <Field label="Attendance" required>
        <Select required value={f.attendance} onChange={(e) => { set('attendance', e.target.value); if (e.target.value === 'NOT_ATTENDED') set('taskCompleted', false); }}>
          <option value="">Select attendance</option>
          {ATTENDANCE.map((a) => <option key={a.value} value={a.value}>{a.label}</option>)}
        </Select>
      </Field>
      <label className="flex items-center gap-2 text-sm text-slate-700">
        <input type="checkbox" className="h-4 w-4 rounded border-slate-300" disabled={f.attendance === 'NOT_ATTENDED'}
          checked={!!f.taskCompleted} onChange={(e) => set('taskCompleted', e.target.checked)} />
        Task completed
      </label>
      <Field label={f.attendance === 'NOT_ATTENDED' ? 'Reason (optional)' : 'Remarks'} required={needsRemarks}
        hint={needsRemarks ? 'Say why the trainee left before the session finished.' : undefined}>
        <textarea rows={2} maxLength={2000} className={textareaClass} value={f.remarks} onChange={(e) => set('remarks', e.target.value)} />
      </Field>
      {f.attendance && (
        <p className="text-xs text-slate-500">
          {isPass(f) ? 'This counts as a pass.' : 'Not a pass: the trainee will need to repeat this session.'}
        </p>
      )}
    </>
  );
}

export function RecordAttemptDialog({ attempt, trainee, onBehalf, ...c }: Common & { attempt: any; trainee: string; onBehalf?: boolean }) {
  const [f, setF] = useState<any>({ attendance: '', taskCompleted: false, remarks: '' });
  const set = (k: string, v: any) => setF((p: any) => ({ ...p, [k]: v }));
  useEffect(() => { if (c.isOpen) setF({ attendance: '', taskCompleted: false, remarks: '' }); }, [c.isOpen]);
  const { busy, error, exec } = useAction(c.onDone, c.onClose);
  return (
    <ActionDialog isOpen={c.isOpen} onClose={c.onClose} title={`Record attendance: ${trainee}`}
      description={`Locked once saved; only the Head of Tutor Management can correct it.${onBehalf ? ' You are recording on the conductor’s behalf.' : ''}`}
      submitLabel="Save attendance" busy={busy} error={error}
      disabled={!f.attendance || (remarksRequired(f.attendance) && !f.remarks.trim())}
      onSubmit={() => exec(recordAttempt(attempt.id, { attendance: f.attendance, taskCompleted: !!f.taskCompleted, remarks: f.remarks.trim() || undefined }),
        (r) => (r.trainingCompleted ? 'Saved. Training is complete.' : r.passed ? 'Saved. Session passed.' : 'Saved. A repeat session is needed.'))}>
      <ResultFields f={f} set={set} />
    </ActionDialog>
  );
}

export function CorrectAttemptDialog({ attempt, trainee, ...c }: Common & { attempt: any; trainee: string }) {
  const initial = () => ({ attendance: attempt.attendance ?? '', taskCompleted: !!attempt.taskCompleted, remarks: attempt.remarks ?? '', reason: '' });
  const [f, setF] = useState<any>(initial);
  const set = (k: string, v: any) => setF((p: any) => ({ ...p, [k]: v }));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (c.isOpen) setF(initial()); }, [c.isOpen, attempt.id]);
  const { busy, error, exec } = useAction(c.onDone, c.onClose);
  return (
    <ActionDialog isOpen={c.isOpen} onClose={c.onClose} title={`Correct attendance: ${trainee}`}
      description="The previous values are kept in the correction history." submitLabel="Save correction" busy={busy} error={error}
      disabled={!f.attendance || f.reason.trim().length < 3 || (remarksRequired(f.attendance) && !f.remarks.trim())}
      onSubmit={() => exec(correctAttempt(attempt.id, {
        attendance: f.attendance, taskCompleted: !!f.taskCompleted, remarks: f.remarks.trim() || undefined, reason: f.reason.trim(),
      }), 'Correction saved')}>
      <ResultFields f={f} set={set} />
      <Field label="Reason for correction" required><textarea rows={2} maxLength={1000} className={textareaClass} value={f.reason} onChange={(e) => set('reason', e.target.value)} /></Field>
    </ActionDialog>
  );
}

// ── Ready for Assignment (Head of Tutor Management; HR Manager as backup) ──
/**
 * Final verification. On success the temporary password is shown here once, for handover,
 * and is held only in this dialog's state: closing the dialog discards it.
 */
export function ReadyForAssignmentDialog({ trainee, ...c }: Common & { trainee: any }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<any>(null);
  const [copied, setCopied] = useState(false);
  useEffect(() => { if (c.isOpen) { setError(null); setCreated(null); setCopied(false); } }, [c.isOpen]);
  const email = trainee.candidate.email as string | null;

  const close = () => {
    const done = created;
    setCreated(null); // drop the password from memory before anything else
    c.onClose();
    if (done) c.onDone(`${trainee.candidate.name} is now tutor ${done.tutorId}.`);
  };
  const confirm = async () => {
    setBusy(true);
    const r = await runAction<any>(markReadyForAssignment(trainee.candidate.id), setError);
    setBusy(false);
    if (r) setCreated(r);
  };
  const copy = async () => {
    if (!created) return;
    try {
      await navigator.clipboard.writeText(`Login: ${created.loginEmail}\nTemporary password: ${created.temporaryPassword}`);
      setCopied(true);
    } catch { setError('Copy failed; select the text instead.'); }
  };

  return (
    <Modal isOpen={c.isOpen} onClose={close} size="md">
      <div className="space-y-4 pr-2">
        {!created ? (
          <>
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Ready for Assignment</h2>
              <p className="text-sm text-slate-500 mt-1">
                This is the final verification. The OS creates the tutor account and a new Tutor ID, and moves {trainee.candidate.name} into Tutors. It cannot be undone here.
              </p>
            </div>
            <dl className="text-sm grid grid-cols-3 gap-2">
              <dt className="text-slate-500">Trainee</dt><dd className="col-span-2 text-slate-900">{trainee.candidate.name} · {trainee.candidate.businessId}</dd>
              <dt className="text-slate-500">Login ID</dt>
              <dd className="col-span-2 text-slate-900 break-all">
                {email || <span className="text-red-700">No email yet. <Link className="underline" href={`/tutor-hr/hiring/candidates/${trainee.candidate.id}`}>Add it in the candidate details</Link>.</span>}
              </dd>
              <dt className="text-slate-500">Training</dt><dd className="col-span-2 text-slate-900">Session 2 passed {fmtDateTime(trainee.session2PassedAt)}</dd>
            </dl>
            <ErrorNote message={error} />
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={close}>Cancel</Button>
              <Button type="button" onClick={confirm} isLoading={busy} disabled={!email}>Mark Ready for Assignment</Button>
            </div>
          </>
        ) : (
          <>
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Tutor {created.tutorId} created</h2>
              <p className="text-sm text-slate-500 mt-1">Give these login details to the tutor. They must change the password at first login.</p>
            </div>
            <div role="alert" className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
              The temporary password is shown only now. It is not stored and cannot be shown again; if it is lost, reset the password from the user account.
            </div>
            <dl className="text-sm grid grid-cols-3 gap-2">
              <dt className="text-slate-500">Tutor ID</dt><dd className="col-span-2 font-semibold text-slate-900">{created.tutorId}</dd>
              <dt className="text-slate-500">Login ID</dt><dd className="col-span-2 text-slate-900 break-all">{created.loginEmail}</dd>
              <dt className="text-slate-500">Temporary password</dt>
              <dd className="col-span-2"><code className="select-all rounded bg-slate-100 px-2 py-1 font-mono text-base text-slate-900">{created.temporaryPassword}</code></dd>
            </dl>
            <ErrorNote message={error} />
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={copy}>{copied ? 'Copied' : 'Copy login details'}</Button>
              <Button type="button" onClick={close}>I have handed it over</Button>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
