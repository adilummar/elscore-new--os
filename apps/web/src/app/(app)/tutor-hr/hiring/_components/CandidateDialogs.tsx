"use client";

import { useEffect, useState } from 'react';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import {
  addEnquiry, advanceStage, bookDemo, changeDecision, getReferenceLists, getSlabs, getSources, getStaff,
  logCall, reassignDemo, recordAttendance, rescheduleDemo, setCvReceived, setLeadStatus, submitEvaluation, updateDetails,
} from '../actions';
import {
  CALL_STATUSES, DECISIONS, DECISIONS_WITH_REMARKS, DEFAULT_MOTHER_TONGUE, LEAD_STATUSES, MANUAL_STAGES, STAGES, WEEKDAYS,
  fromLocalInput, labelOf, remarksRequired, toLocalInput, todayLocal,
} from '../constants';
import { ActionDialog, ErrorNote, Field, runAction, textareaClass } from './kit';
import { SlabRates, slabLabel } from './slab-display';

type Common = { isOpen: boolean; onClose: () => void; onDone: (msg?: string) => void };

function useAction(onDone: Common['onDone'], onClose: Common['onClose']) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const exec = async <T,>(p: Promise<any>, msg: string | ((r: any) => string)) => {
    setBusy(true);
    const r = await runAction<T>(p, setError);
    setBusy(false);
    if (r !== null) { onClose(); onDone(typeof msg === 'function' ? msg(r) : msg); }
    return r;
  };
  return { busy, error, setError, exec };
}

/** Conflict warnings returned by booking calls are non-blocking; surface them after success. */
const conflictNote = (r: any) =>
  r?.conflicts?.length ? ` Heads up: ${r.conflicts.length} other demo(s) for this person within 30 minutes.` : '';

// ── Call ──
export function CallDialog({ id, ...c }: Common & { id: string }) {
  const [status, setStatus] = useState('ATTENDED');
  const [calledAt, setCalledAt] = useState(toLocalInput());
  const [remarks, setRemarks] = useState('');
  const [followUp, setFollowUp] = useState('');
  const { busy, error, exec } = useAction(c.onDone, c.onClose);
  return (
    <ActionDialog isOpen={c.isOpen} onClose={c.onClose} title="Log call" submitLabel="Save call" busy={busy} error={error}
      onSubmit={() => exec(logCall(id, {
        status, calledAt: fromLocalInput(calledAt), remarks: remarks.trim() || undefined,
        followUpAt: followUp ? fromLocalInput(followUp) : undefined,
      }), 'Call logged')}>
      <Field label="Outcome" required>
        <Select value={status} onChange={(e) => setStatus(e.target.value)}>
          {CALL_STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
        </Select>
      </Field>
      <Field label="Called at" required><Input type="datetime-local" required max={toLocalInput()} value={calledAt} onChange={(e) => setCalledAt(e.target.value)} /></Field>
      <Field label="Remarks"><textarea rows={3} maxLength={2000} className={textareaClass} value={remarks} onChange={(e) => setRemarks(e.target.value)} /></Field>
      <Field label="Follow-up" hint="Optional reminder date and time."><Input type="datetime-local" value={followUp} onChange={(e) => setFollowUp(e.target.value)} /></Field>
    </ActionDialog>
  );
}

// ── Enquiry ──
export function EnquiryDialog({ id, ...c }: Common & { id: string }) {
  const [sources, setSources] = useState<any[]>([]);
  const [sourceId, setSourceId] = useState('');
  const [date, setDate] = useState(todayLocal());
  const [notes, setNotes] = useState('');
  const { busy, error, exec } = useAction(c.onDone, c.onClose);
  useEffect(() => { if (c.isOpen) getSources().then((r) => r.ok && setSources(r.data)); }, [c.isOpen]);
  return (
    <ActionDialog isOpen={c.isOpen} onClose={c.onClose} title="Add enquiry" description="Earlier enquiries and sources are kept." submitLabel="Add enquiry" busy={busy} error={error} disabled={!sourceId}
      onSubmit={() => exec(addEnquiry(id, { sourceId, enquiryDate: date, notes: notes.trim() || undefined }), 'Enquiry added')}>
      <Field label="Source" required>
        <Select required value={sourceId} onChange={(e) => setSourceId(e.target.value)}>
          <option value="">Select source</option>
          {sources.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </Select>
      </Field>
      <Field label="Enquiry date" required><Input type="date" required max={todayLocal()} value={date} onChange={(e) => setDate(e.target.value)} /></Field>
      <Field label="Notes"><textarea rows={2} maxLength={1000} className={textareaClass} value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
    </ActionDialog>
  );
}

// ── Stage ──
export function StageDialog({ id, current, ...c }: Common & { id: string; current: string }) {
  const idx = MANUAL_STAGES.findIndex((s) => s.value === current);
  const next = idx >= 0 ? MANUAL_STAGES[idx + 1] : undefined;
  const [remarks, setRemarks] = useState('');
  const { busy, error, exec } = useAction(c.onDone, c.onClose);
  if (!next) return null;
  return (
    <ActionDialog isOpen={c.isOpen} onClose={c.onClose} title={`Complete ${labelOf(STAGES, current)}`}
      description={`This moves the candidate to ${next.label}. Stages cannot be skipped or reversed.`}
      submitLabel={`Move to ${next.label}`} busy={busy} error={error}
      onSubmit={() => exec(advanceStage(id, next.value, remarks.trim() || undefined), `Moved to ${next.label}`)}>
      <Field label="Remarks"><textarea rows={2} maxLength={1000} className={textareaClass} value={remarks} onChange={(e) => setRemarks(e.target.value)} /></Field>
    </ActionDialog>
  );
}

// ── Lead status ──
export function LeadStatusDialog({ id, current, ...c }: Common & { id: string; current: string }) {
  const [status, setStatus] = useState('');
  const [remarks, setRemarks] = useState('');
  const { busy, error, exec } = useAction(c.onDone, c.onClose);
  useEffect(() => { if (c.isOpen) { setStatus(''); setRemarks(''); } }, [c.isOpen]);
  const needsRemarks = remarksRequired(status);
  return (
    <ActionDialog isOpen={c.isOpen} onClose={c.onClose} title="Change lead status"
      description={`Currently ${labelOf(LEAD_STATUSES, current)}. Every change is kept in history.`}
      submitLabel="Save status" busy={busy} error={error} danger={status === 'REJECTED'}
      disabled={!status || (needsRemarks && !remarks.trim())}
      onSubmit={() => exec(setLeadStatus(id, status, remarks.trim() || undefined), 'Lead status saved')}>
      <Field label="Lead status" required>
        <Select required value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">Select status</option>
          {LEAD_STATUSES.filter((s) => s.value !== current).map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
        </Select>
      </Field>
      <Field label="Remarks" required={needsRemarks} hint={needsRemarks ? 'Record the reason for this change.' : undefined}>
        <textarea rows={2} maxLength={1000} className={textareaClass} value={remarks} onChange={(e) => setRemarks(e.target.value)} />
      </Field>
    </ActionDialog>
  );
}

// ── Decision ──
export function DecisionDialog({ id, stage, current, ...c }: Common & { id: string; stage: string; current: string | null }) {
  const [decision, setDecision] = useState('');
  const [remarks, setRemarks] = useState('');
  const { busy, error, exec } = useAction(c.onDone, c.onClose);
  useEffect(() => { if (c.isOpen) { setDecision(''); setRemarks(''); } }, [c.isOpen]);
  const atDemo = stage === 'LIVE_DEMO_INTERVIEW';
  const available = !atDemo ? [] : DECISIONS.filter((d) => {
    if (d.value === current) return false;
    if (d.value === 'HIRED') return current === 'ACCEPTED';
    return true;
  });
  const showRemarks = DECISIONS_WITH_REMARKS.includes(decision);
  const needsRemarks = remarksRequired(decision);
  return (
    <ActionDialog isOpen={c.isOpen} onClose={c.onClose} title="Set decision"
      description="Recorded by the staff member assigned to the demo (or the Head of Tutor Management). Kept in history."
      submitLabel="Save decision" busy={busy} error={error}
      danger={decision === 'REJECTED'} disabled={!decision || (needsRemarks && !remarks.trim())}
      onSubmit={() => exec(changeDecision(id, decision, showRemarks ? remarks.trim() || undefined : undefined),
        decision === 'HIRED' ? 'Marked Hired. The candidate has moved to Training.' : 'Decision saved')}>
      {!atDemo ? (
        <p className="text-sm text-slate-600">Decisions are recorded after the Live Demo &amp; Interview. Before that, use Lead Status for Rejected or Not Interested.</p>
      ) : (
        <Field label="Decision" required>
          <Select required value={decision} onChange={(e) => setDecision(e.target.value)}>
            <option value="">Select decision</option>
            {available.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
          </Select>
        </Field>
      )}
      {decision === 'ACCEPTED' && <p className="text-xs text-slate-500">Requires an attended demo with a submitted evaluation.</p>}
      {decision === 'HIRED' && <p className="text-xs text-slate-500">The candidate moves to Training automatically. This decision cannot be changed afterwards.</p>}
      {needsRemarks && <p className="text-xs text-slate-500">This also sets the lead status to {labelOf(LEAD_STATUSES, decision)}.</p>}
      {showRemarks && (
        <Field label="Remarks" required={needsRemarks}><textarea rows={2} maxLength={1000} className={textareaClass} value={remarks} onChange={(e) => setRemarks(e.target.value)} /></Field>
      )}
    </ActionDialog>
  );
}

// ── CV ──
export function CvDialog({ id, current, ...c }: Common & { id: string; current?: string | null }) {
  const [when, setWhen] = useState(toLocalInput(current));
  const { busy, error, exec } = useAction(c.onDone, c.onClose);
  return (
    <ActionDialog isOpen={c.isOpen} onClose={c.onClose} title="CV received" description="Only the date and time the CV arrived is recorded." submitLabel="Save" busy={busy} error={error}
      onSubmit={() => exec(setCvReceived(id, fromLocalInput(when)), 'CV received time saved')}>
      <Field label="Received on" required><Input type="datetime-local" required max={toLocalInput()} value={when} onChange={(e) => setWhen(e.target.value)} /></Field>
    </ActionDialog>
  );
}

// ── Details Shared ──
function MultiPick({ label, items, value, onChange, empty }: { label: string; items: any[]; value: string[]; onChange: (v: string[]) => void; empty: string }) {
  return (
    <fieldset>
      <legend className="text-sm font-medium text-slate-700 mb-1.5">{label}</legend>
      {items.length === 0 ? <p className="text-xs text-slate-500">{empty}</p> : (
        <div className="flex flex-wrap gap-2">
          {items.map((it) => {
            const on = value.includes(it.id);
            return (
              <button type="button" key={it.id} aria-pressed={on}
                onClick={() => onChange(on ? value.filter((v) => v !== it.id) : [...value, it.id])}
                className={`px-3 h-8 rounded-full text-xs font-medium border transition-colors ${on ? 'bg-brand-600 border-brand-600 text-white' : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-50'}`}>
                {it.name}
              </button>
            );
          })}
        </div>
      )}
    </fieldset>
  );
}

type Slot = { dayOfWeek: number; startTime: string; endTime: string };
/** Active availability as HH:mm windows (the API stores time-of-day as 1970-01-01T..Z). */
const savedSlots = (lead: any): Slot[] =>
  (lead.availability ?? []).map((a: any) => ({
    dayOfWeek: a.dayOfWeek, startTime: String(a.startTime).slice(11, 16), endTime: String(a.endTime).slice(11, 16),
  }));

export function DetailsDialog({ lead, ...c }: Common & { lead: any }) {
  const [refs, setRefs] = useState<Record<string, any[]>>({ subjects: [], grades: [], curricula: [], languages: [], motherTongues: [] });
  const [f, setF] = useState<any>({});
  const { busy, error, exec } = useAction(c.onDone, c.onClose);

  useEffect(() => {
    if (!c.isOpen) return;
    getReferenceLists().then((r) => {
      if (!r.ok) return;
      setRefs(r.data);
      // Business default: Malayalam, unless the candidate already has a mother tongue.
      if (!lead.motherTongueId) {
        const ml = r.data.motherTongues.find((m: any) => m.name?.trim().toLowerCase() === DEFAULT_MOTHER_TONGUE.toLowerCase());
        if (ml) setF((p: any) => (p.motherTongueId ? p : { ...p, motherTongueId: ml.id }));
      }
    });
    setF({
      name: lead.name ?? '',
      motherTongueId: lead.motherTongueId ?? '',
      subjectIds: lead.subjects?.map((x: any) => x.subjectId) ?? [],
      gradeIds: lead.grades?.map((x: any) => x.gradeId) ?? [],
      languageIds: lead.languages?.map((x: any) => x.languageId) ?? [],
      curriculumIds: lead.curricula?.map((x: any) => x.curriculumId) ?? [],
      online: lead.onlineTeachingExperience ?? '',
      offline: lead.offlineTeachingExperience ?? '',
      rate: lead.expectedHourlyRate != null ? String(lead.expectedHourlyRate) : '',
      additionalPhone: lead.additionalPhone ?? '',
      email: lead.email ?? '',
      detailsDescription: lead.detailsDescription ?? '',
      remarks: lead.remarks ?? '',
      respondedAt: lead.detailsRespondedAt ? toLocalInput(lead.detailsRespondedAt) : '',
      availability: savedSlots(lead),
    });
  }, [c.isOpen, lead]);
  const set = (k: string, v: any) => setF((p: any) => ({ ...p, [k]: v }));
  const slots: Slot[] = f.availability ?? [];
  const setSlot = (i: number, patch: Partial<Slot>) => set('availability', slots.map((s, j) => (j === i ? { ...s, ...patch } : s)));

  const submit = () => {
    const body: any = {
      subjectIds: f.subjectIds, gradeIds: f.gradeIds, languageIds: f.languageIds, curriculumIds: f.curriculumIds,
    };
    if (f.name?.trim()) body.name = f.name.trim();
    if (f.motherTongueId) body.motherTongueId = f.motherTongueId;
    if (f.online !== '') body.onlineTeachingExperience = Number(f.online);
    if (f.offline !== '') body.offlineTeachingExperience = Number(f.offline);
    if (f.rate !== '') body.expectedHourlyRate = Number(f.rate);
    if (f.additionalPhone?.trim()) body.additionalPhone = f.additionalPhone.trim();
    if (!lead.convertedTutorProfileId && f.email?.trim() && f.email.trim().toLowerCase() !== (lead.email ?? '').toLowerCase()) body.email = f.email.trim();
    if (f.detailsDescription?.trim()) body.detailsDescription = f.detailsDescription.trim();
    if (f.remarks?.trim()) body.remarks = f.remarks.trim();
    if (f.respondedAt) body.detailsRespondedAt = fromLocalInput(f.respondedAt);
    // Only send availability when it changed, so unchanged saves do not add history entries.
    if (JSON.stringify(slots) !== JSON.stringify(savedSlots(lead))) body.availability = slots;
    return exec(updateDetails(lead.id, body), 'Details saved');
  };

  return (
    <Modal isOpen={c.isOpen} onClose={c.onClose} size="lg">
      <form className="space-y-5 pr-2" onSubmit={(e) => { e.preventDefault(); submit(); }}>
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Details shared</h2>
          <p className="text-sm text-slate-500">Saving details does not change the stage. Complete the stage separately.</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Full name" htmlFor="d-name"><Input id="d-name" maxLength={200} value={f.name ?? ''} onChange={(e) => set('name', e.target.value)} /></Field>
          <Field label="Mother tongue" htmlFor="d-mt">
            <Select id="d-mt" value={f.motherTongueId ?? ''} onChange={(e) => set('motherTongueId', e.target.value)}>
              <option value="">Not specified</option>
              {refs.motherTongues.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </Select>
          </Field>
          <Field label="Online teaching experience (years)" htmlFor="d-on"><Input id="d-on" type="number" min={0} max={80} value={f.online ?? ''} onChange={(e) => set('online', e.target.value)} /></Field>
          <Field label="Offline teaching experience (years)" htmlFor="d-off"><Input id="d-off" type="number" min={0} max={80} value={f.offline ?? ''} onChange={(e) => set('offline', e.target.value)} /></Field>
          <Field label="Expected hourly rate" htmlFor="d-rate"><Input id="d-rate" type="number" min={0} step="0.01" value={f.rate ?? ''} onChange={(e) => set('rate', e.target.value)} /></Field>
          <Field label="Email" htmlFor="d-em" hint={lead.convertedTutorProfileId ? 'This is now the tutor login ID.' : 'Required before Ready for Assignment; it becomes the login ID.'}>
            <Input id="d-em" type="email" maxLength={254} disabled={!!lead.convertedTutorProfileId} value={f.email ?? ''} onChange={(e) => set('email', e.target.value)} />
          </Field>
          <Field label="Additional phone" htmlFor="d-ph"><Input id="d-ph" maxLength={30} value={f.additionalPhone ?? ''} onChange={(e) => set('additionalPhone', e.target.value)} /></Field>
        </div>
        <MultiPick label="Subjects" items={refs.subjects} value={f.subjectIds ?? []} onChange={(v) => set('subjectIds', v)} empty="No subjects available." />
        <MultiPick label="Grades" items={refs.grades} value={f.gradeIds ?? []} onChange={(v) => set('gradeIds', v)} empty="No grades available." />
        <MultiPick label="Curricula" items={refs.curricula} value={f.curriculumIds ?? []} onChange={(v) => set('curriculumIds', v)} empty="No curricula available." />
        <MultiPick label="Communication languages" items={refs.languages} value={f.languageIds ?? []} onChange={(v) => set('languageIds', v)} empty="Languages are not available to your role." />
        <fieldset>
          <legend className="text-sm font-medium text-slate-700 mb-1.5">Available teaching time</legend>
          {slots.length === 0 && <p className="text-xs text-slate-500 mb-2">No availability recorded.</p>}
          <ul className="space-y-2">
            {slots.map((s, i) => (
              <li key={i} className="flex flex-wrap items-center gap-2">
                <Select aria-label="Day" value={String(s.dayOfWeek)} onChange={(e) => setSlot(i, { dayOfWeek: Number(e.target.value) })} className="w-28">
                  {WEEKDAYS.map((d, n) => <option key={d} value={n}>{d}</option>)}
                </Select>
                <Input aria-label="From" type="time" value={s.startTime} onChange={(e) => setSlot(i, { startTime: e.target.value })} className="w-32" />
                <span className="text-slate-500 text-sm">to</span>
                <Input aria-label="To" type="time" value={s.endTime} onChange={(e) => setSlot(i, { endTime: e.target.value })} className="w-32" />
                <Button type="button" size="sm" variant="outline" onClick={() => set('availability', slots.filter((_, j) => j !== i))}>Remove</Button>
              </li>
            ))}
          </ul>
          <Button type="button" size="sm" variant="outline" className="mt-2"
            onClick={() => set('availability', [...slots, { dayOfWeek: 1, startTime: '17:00', endTime: '20:00' }])}>Add time slot</Button>
        </fieldset>
        <Field label="Candidate response received on" required hint="Entered manually from the candidate's reply. Needed to complete Details Shared.">
          <Input type="datetime-local" max={toLocalInput()} value={f.respondedAt ?? ''} onChange={(e) => set('respondedAt', e.target.value)} />
        </Field>
        <Field label="Description"><textarea rows={3} maxLength={5000} className={textareaClass} value={f.detailsDescription ?? ''} onChange={(e) => set('detailsDescription', e.target.value)} /></Field>
        <Field label="Remarks"><textarea rows={2} maxLength={2000} className={textareaClass} value={f.remarks ?? ''} onChange={(e) => set('remarks', e.target.value)} /></Field>
        <ErrorNote message={error} />
        <div className="flex justify-end gap-2 border-t border-slate-100 pt-3">
          <Button type="button" variant="outline" onClick={c.onClose}>Cancel</Button>
          <Button type="submit" isLoading={busy}>Save details</Button>
        </div>
      </form>
    </Modal>
  );
}

// ── Demos ──
function useStaff(open: boolean) {
  const [staff, setStaff] = useState<any[]>([]);
  useEffect(() => { if (open) getStaff().then((r) => r.ok && setStaff(r.data)); }, [open]);
  return staff;
}

export function BookDemoDialog({ id, ...c }: Common & { id: string }) {
  const staff = useStaff(c.isOpen);
  const [when, setWhen] = useState('');
  const [who, setWho] = useState('');
  const { busy, error, exec } = useAction(c.onDone, c.onClose);
  return (
    <ActionDialog isOpen={c.isOpen} onClose={c.onClose} title="Book demo / interview" submitLabel="Book demo" busy={busy} error={error} disabled={!when || !who}
      onSubmit={() => exec(bookDemo(id, { scheduledAt: fromLocalInput(when), assignedToUserId: who }), (r) => 'Demo booked.' + conflictNote(r))}>
      <Field label="Date and time" required><Input type="datetime-local" required min={toLocalInput()} value={when} onChange={(e) => setWhen(e.target.value)} /></Field>
      <Field label="Assign to" required>
        <Select required value={who} onChange={(e) => setWho(e.target.value)}>
          <option value="">Select staff member</option>
          {staff.map((s) => <option key={s.id} value={s.id}>{s.name === s.email ? s.email : `${s.name} (${s.email})`}</option>)}
        </Select>
      </Field>
    </ActionDialog>
  );
}

export function RescheduleDialog({ booking, ...c }: Common & { booking: any }) {
  const [when, setWhen] = useState('');
  const [reason, setReason] = useState('');
  const { busy, error, exec } = useAction(c.onDone, c.onClose);
  return (
    <ActionDialog isOpen={c.isOpen} onClose={c.onClose} title="Reschedule demo" description="The earlier booking stays in history with your reason." submitLabel="Reschedule" busy={busy} error={error} disabled={!when || reason.trim().length < 3}
      onSubmit={() => exec(rescheduleDemo(booking.id, { scheduledAt: fromLocalInput(when), reason: reason.trim() }), (r) => 'Demo rescheduled.' + conflictNote(r))}>
      <Field label="New date and time" required><Input type="datetime-local" required min={toLocalInput()} value={when} onChange={(e) => setWhen(e.target.value)} /></Field>
      <Field label="Reason" required><textarea rows={2} maxLength={1000} className={textareaClass} value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
    </ActionDialog>
  );
}

export function ReassignDialog({ booking, ...c }: Common & { booking: any }) {
  const staff = useStaff(c.isOpen);
  const [who, setWho] = useState('');
  const [reason, setReason] = useState('');
  const { busy, error, exec } = useAction(c.onDone, c.onClose);
  return (
    <ActionDialog isOpen={c.isOpen} onClose={c.onClose} title="Reassign demo" description="The previous assignment is kept in history." submitLabel="Reassign" busy={busy} error={error} disabled={!who || reason.trim().length < 3}
      onSubmit={() => exec(reassignDemo(booking.id, { toUserId: who, reason: reason.trim() }), (r) => 'Demo reassigned.' + conflictNote(r))}>
      <Field label="Assign to" required>
        <Select required value={who} onChange={(e) => setWho(e.target.value)}>
          <option value="">Select staff member</option>
          {staff.filter((s) => s.id !== booking.assignedToUserId).map((s) => <option key={s.id} value={s.id}>{s.name === s.email ? s.email : `${s.name} (${s.email})`}</option>)}
        </Select>
      </Field>
      <Field label="Reason" required><textarea rows={2} maxLength={1000} className={textareaClass} value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
    </ActionDialog>
  );
}

export function AttendanceDialog({ booking, currentUserId, ...c }: Common & { booking: any; currentUserId?: string }) {
  const [status, setStatus] = useState<'ATTENDED' | 'NOT_ATTENDED'>('ATTENDED');
  const [at, setAt] = useState(toLocalInput());
  const { busy, error, exec } = useAction(c.onDone, c.onClose);
  const onBehalf = !!currentUserId && currentUserId !== booking.assignedToUserId;
  return (
    <ActionDialog isOpen={c.isOpen} onClose={c.onClose} title="Record demo outcome"
      description={`Conducted by ${booking.assignedTo?.email ?? 'the assigned staff member'}.${onBehalf ? ' You are recording this on their behalf (Head override).' : ''}`}
      submitLabel="Save outcome" busy={busy} error={error}
      onSubmit={() => exec(recordAttendance(booking.id, status === 'ATTENDED' ? { status, completedAt: fromLocalInput(at) } : { status }),
        status === 'ATTENDED' ? 'Marked attended. Evaluation is now due.' : 'Marked not attended')}>
      <Field label="Outcome" required>
        <Select value={status} onChange={(e) => setStatus(e.target.value as any)}>
          <option value="ATTENDED">Attended</option>
          <option value="NOT_ATTENDED">Not attended</option>
        </Select>
      </Field>
      {status === 'ATTENDED' && (
        <Field label="Completed at" required hint="Starts the two-working-hour evaluation window.">
          <Input type="datetime-local" required min={toLocalInput(booking.scheduledAt)} max={toLocalInput()} value={at} onChange={(e) => setAt(e.target.value)} />
        </Field>
      )}
    </ActionDialog>
  );
}

export function EvaluationDialog({ booking, ...c }: Common & { booking: any }) {
  const [slabs, setSlabs] = useState<any[]>([]);
  const [methods, setMethods] = useState('');
  const [skills, setSkills] = useState('');
  const [rating, setRating] = useState('');
  const [slab, setSlab] = useState('');
  const [remarks, setRemarks] = useState('');
  const { busy, error, exec } = useAction(c.onDone, c.onClose);
  useEffect(() => { if (c.isOpen) getSlabs().then((r) => r.ok && setSlabs(r.data)); }, [c.isOpen]);
  return (
    <Modal isOpen={c.isOpen} onClose={c.onClose} size="lg">
      <form className="space-y-4 pr-2" onSubmit={(e) => { e.preventDefault(); exec(submitEvaluation(booking.id, {
        teachingMethods: methods.trim(), technicalSkills: skills.trim(), englishRating: Number(rating),
        salarySlabId: slab || undefined, remarks: remarks.trim() || undefined,
      }), 'Evaluation submitted'); }}>
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Demo evaluation</h2>
          <p className="text-sm text-slate-500">An evaluation cannot be edited once submitted.</p>
        </div>
        <Field label="Teaching methods" required><textarea required rows={3} maxLength={5000} className={textareaClass} value={methods} onChange={(e) => setMethods(e.target.value)} /></Field>
        <Field label="Technical skills" required><textarea required rows={3} maxLength={5000} className={textareaClass} value={skills} onChange={(e) => setSkills(e.target.value)} /></Field>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="English rating (1 to 5)" required>
            <Select required value={rating} onChange={(e) => setRating(e.target.value)}>
              <option value="">Select rating</option>
              {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}</option>)}
            </Select>
          </Field>
          <Field label="Recommended pay slab" hint={slabs.length ? undefined : 'No pay slabs exist yet.'}>
            <Select value={slab} onChange={(e) => setSlab(e.target.value)}>
              <option value="">Not selected</option>
              {slabs.map((s) => <option key={s.id} value={s.id}>{slabLabel(s)}</option>)}
            </Select>
            <SlabRates slab={slabs.find((s) => s.id === slab)} />
          </Field>
        </div>
        <Field label="Remarks"><textarea rows={2} maxLength={2000} className={textareaClass} value={remarks} onChange={(e) => setRemarks(e.target.value)} /></Field>
        <ErrorNote message={error} />
        <div className="flex justify-end gap-2 border-t border-slate-100 pt-3">
          <Button type="button" variant="outline" onClick={c.onClose}>Cancel</Button>
          <Button type="submit" isLoading={busy} disabled={!methods.trim() || !skills.trim() || !rating}>Submit evaluation</Button>
        </div>
      </form>
    </Modal>
  );
}
