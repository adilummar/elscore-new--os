"use client";

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { Select } from '@/components/ui/Select';
import { ActionDialog, ErrorNote, Field, runAction, textareaClass } from '../../hiring/_components/kit';
import { addHrNote, addQualification, changeTutorStatus, editHrNote, updateQualification, updateTutorProfile } from '../actions';
import { ADDRESS_PARTS, GENDERS, MARITAL_STATUSES, TUTOR_STATUSES } from '../constants';

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
  return { busy, error, exec };
}

// ── Status ──
export function StatusDialog({ id, current, ...c }: Common & { id: string; current: string }) {
  const [status, setStatus] = useState('');
  const [reason, setReason] = useState('');
  const { busy, error, exec } = useAction(c.onDone, c.onClose);
  useEffect(() => { if (c.isOpen) { setStatus(''); setReason(''); } }, [c.isOpen]);
  return (
    <ActionDialog isOpen={c.isOpen} onClose={c.onClose} title="Change tutor status"
      description="A reason is required. The previous status, reason, time and your name are kept in History & Status."
      submitLabel="Change status" busy={busy} error={error} danger={status === 'SUSPENDED' || status === 'DISCONTINUED'}
      disabled={!status || reason.trim().length < 3}
      onSubmit={() => exec(changeTutorStatus(id, status, reason.trim()), 'Status changed')}>
      <Field label="New status" required>
        <Select required value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">Select status</option>
          {TUTOR_STATUSES.filter((s) => s.value !== current).map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
        </Select>
      </Field>
      {status === 'ACTIVE' && current === 'INACTIVE' && (
        <p className="text-xs text-slate-500">Until class records are connected, HR sets Active manually after the tutor&apos;s first class.</p>
      )}
      <Field label="Reason" required><textarea rows={3} maxLength={1000} className={textareaClass} value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
    </ActionDialog>
  );
}

// ── Profile ──
const addr = (p: any, prefix: 'perm' | 'cur') =>
  Object.fromEntries(ADDRESS_PARTS.map((a) => [a.key.toLowerCase(), p?.[`${prefix}${a.key}`] ?? (a.key === 'Country' ? 'India' : '')]));
const contact = (c: any) => ({ name: c?.name ?? '', phone: c?.phone ?? '', relationship: c?.relationship ?? '' });
const trimmed = (o: Record<string, string>) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, (v ?? '').trim()]));
/** Blank fields are sent as null, which clears them. */
const orNull = (o: Record<string, string>) => Object.fromEntries(Object.entries(trimmed(o)).map(([k, v]) => [k, v === '' ? null : v]));
const filled = (o: Record<string, string>) => Object.values(o).some((v) => (v ?? '').trim());

export function EditProfileDialog({ tutor, ...c }: Common & { tutor: any }) {
  const [f, setF] = useState<any>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!c.isOpen) return;
    const p = tutor.personal ?? {};
    setError(null);
    setF({
      firstName: tutor.employee.firstName ?? '', lastName: tutor.employee.lastName ?? '',
      gender: p.gender ?? '', maritalStatus: p.maritalStatus ?? '',
      perm: addr(p, 'perm'), cur: addr(p, 'cur'), same: !!p.currentSameAsPermanent,
      // The full account number is never prefilled; leave blank to keep it unchanged.
      bank: { accountHolder: p.bankAccountHolder ?? '', bank: p.bankName ?? '', branch: p.bankBranch ?? '', accountNumber: '', ifsc: p.bankIfsc ?? '' },
      primary: contact(tutor.emergencyContacts.find((x: any) => x.kind === 'PRIMARY')),
      secondary: contact(tutor.emergencyContacts.find((x: any) => x.kind === 'SECONDARY')),
      hadSecondary: tutor.emergencyContacts.some((x: any) => x.kind === 'SECONDARY'),
    });
  }, [c.isOpen, tutor]);
  const set = (k: string, v: any) => setF((p: any) => ({ ...p, [k]: v }));
  const setIn = (group: string, k: string, v: string) => setF((p: any) => ({ ...p, [group]: { ...p[group], [k]: v } }));

  const submit = async () => {
    const body: any = {
      firstName: f.firstName.trim(), lastName: f.lastName.trim(),
      permanentAddress: orNull(f.perm), currentSameAsPermanent: f.same,
    };
    if (f.gender) body.gender = f.gender;
    if (f.maritalStatus) body.maritalStatus = f.maritalStatus;
    if (!f.same) body.currentAddress = orNull(f.cur);
    const bank: Record<string, string | null> = orNull(f.bank);
    if (!bank.accountNumber) delete bank.accountNumber; // blank keeps the saved number
    body.bank = bank;
    if (filled(f.primary)) body.primaryContact = trimmed(f.primary);
    if (filled(f.secondary)) body.secondaryContact = trimmed(f.secondary);
    else if (f.hadSecondary) body.secondaryContact = null;
    setBusy(true);
    const r = await runAction<any>(updateTutorProfile(tutor.id, body), setError);
    setBusy(false);
    if (r) { c.onClose(); c.onDone(r.changed?.length ? 'Profile saved' : 'No changes'); }
  };

  const contactFields = (group: 'primary' | 'secondary', required: boolean) => (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
      <Field label="Name" required={required}><Input value={f[group]?.name ?? ''} maxLength={200} onChange={(e) => setIn(group, 'name', e.target.value)} /></Field>
      <Field label="Phone" required={required}><Input value={f[group]?.phone ?? ''} maxLength={30} inputMode="tel" onChange={(e) => setIn(group, 'phone', e.target.value)} /></Field>
      <Field label="Relationship" required={required}><Input value={f[group]?.relationship ?? ''} maxLength={100} onChange={(e) => setIn(group, 'relationship', e.target.value)} /></Field>
    </div>
  );
  const addressFields = (group: 'perm' | 'cur', disabled = false) => (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
      {ADDRESS_PARTS.map((a) => (
        <Field key={a.key} label={a.label}>
          <Input disabled={disabled} value={f[group]?.[a.key.toLowerCase()] ?? ''} maxLength={200} onChange={(e) => setIn(group, a.key.toLowerCase(), e.target.value)} />
        </Field>
      ))}
    </div>
  );

  if (!f.perm) return null;
  return (
    <Modal isOpen={c.isOpen} onClose={c.onClose} size="lg">
      <form className="space-y-5 pr-2" onSubmit={(e) => { e.preventDefault(); submit(); }}>
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Edit profile: {tutor.tutorId}</h2>
          <p className="text-sm text-slate-500">Every change is recorded with who made it and when.</p>
        </div>
        <section className="space-y-3">
          <h3 className="text-sm font-semibold text-slate-800">Personal</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="First name" required><Input required value={f.firstName} maxLength={100} onChange={(e) => set('firstName', e.target.value)} /></Field>
            <Field label="Last name"><Input value={f.lastName} maxLength={100} onChange={(e) => set('lastName', e.target.value)} /></Field>
            <Field label="Gender">
              <Select value={f.gender} onChange={(e) => set('gender', e.target.value)}>
                <option value="">Not specified</option>
                {GENDERS.map((g) => <option key={g.value} value={g.value}>{g.label}</option>)}
              </Select>
            </Field>
            <Field label="Marital status">
              <Select value={f.maritalStatus} onChange={(e) => set('maritalStatus', e.target.value)}>
                <option value="">Not specified</option>
                {MARITAL_STATUSES.map((g) => <option key={g.value} value={g.value}>{g.label}</option>)}
              </Select>
            </Field>
          </div>
          <p className="text-xs text-slate-500">Phone {tutor.employee.phone} and login email {tutor.employee.user.email} are the tutor&apos;s registered contact and login; they are not changed here.</p>
        </section>
        <section className="space-y-3">
          <h3 className="text-sm font-semibold text-slate-800">Permanent address</h3>
          {addressFields('perm')}
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" className="h-4 w-4 rounded border-slate-300" checked={f.same} onChange={(e) => set('same', e.target.checked)} />
            Current address same as permanent address
          </label>
          {!f.same && (<><h3 className="text-sm font-semibold text-slate-800">Current address</h3>{addressFields('cur')}</>)}
        </section>
        <section className="space-y-3">
          <h3 className="text-sm font-semibold text-slate-800">Emergency contacts</h3>
          <div role="note" className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">{tutor.emergencyContactAlert}</div>
          <p className="text-xs font-medium text-slate-600">Primary (compulsory; must differ from the tutor&apos;s phone)</p>
          {contactFields('primary', true)}
          <p className="text-xs font-medium text-slate-600">Second contact (optional; clear all three fields to remove)</p>
          {contactFields('secondary', false)}
        </section>
        <section className="space-y-3">
          <h3 className="text-sm font-semibold text-slate-800">Bank details</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Account holder name"><Input value={f.bank.accountHolder} maxLength={200} onChange={(e) => setIn('bank', 'accountHolder', e.target.value)} /></Field>
            <Field label="Bank"><Input value={f.bank.bank} maxLength={200} onChange={(e) => setIn('bank', 'bank', e.target.value)} /></Field>
            <Field label="Branch"><Input value={f.bank.branch} maxLength={200} onChange={(e) => setIn('bank', 'branch', e.target.value)} /></Field>
            <Field label="IFSC"><Input value={f.bank.ifsc} maxLength={11} onChange={(e) => setIn('bank', 'ifsc', e.target.value.toUpperCase())} /></Field>
            <Field label="Account number" hint={tutor.personal?.bankAccountNumber ? `Saved: ${String(tutor.personal.bankAccountNumber).replace(/.(?=.{4})/g, '•')}. Leave blank to keep it.` : undefined}>
              <Input value={f.bank.accountNumber} inputMode="numeric" autoComplete="off" maxLength={20} onChange={(e) => setIn('bank', 'accountNumber', e.target.value.replace(/\D/g, ''))} />
            </Field>
          </div>
        </section>
        <ErrorNote message={error} />
        <div className="flex justify-end gap-2 border-t border-slate-100 pt-3">
          <Button type="button" variant="outline" onClick={c.onClose}>Cancel</Button>
          <Button type="submit" isLoading={busy} disabled={!f.firstName.trim()}>Save profile</Button>
        </div>
      </form>
    </Modal>
  );
}

// ── Qualifications ──
export function QualificationDialog({ id, existing, ...c }: Common & { id: string; existing?: any }) {
  const [name, setName] = useState('');
  const [institution, setInstitution] = useState('');
  const [year, setYear] = useState('');
  const { busy, error, exec } = useAction(c.onDone, c.onClose);
  useEffect(() => {
    if (!c.isOpen) return;
    setName(existing?.name ?? ''); setInstitution(existing?.institution ?? ''); setYear(existing?.yearOfCompletion ? String(existing.yearOfCompletion) : '');
  }, [c.isOpen, existing]);
  const body = () => ({ name: name.trim(), institution: institution.trim(), yearOfCompletion: year ? Number(year) : undefined });
  return (
    <ActionDialog isOpen={c.isOpen} onClose={c.onClose} title={existing ? 'Edit qualification' : 'Add qualification'}
      description="Certificate upload will be added later." submitLabel="Save" busy={busy} error={error}
      disabled={!name.trim() || !institution.trim()}
      onSubmit={() => exec(existing ? updateQualification(id, existing.id, body()) : addQualification(id, body()), 'Qualification saved')}>
      <Field label="Qualification" required><Input required value={name} maxLength={200} onChange={(e) => setName(e.target.value)} /></Field>
      <Field label="Institution / university" required><Input required value={institution} maxLength={200} onChange={(e) => setInstitution(e.target.value)} /></Field>
      <Field label="Year of completion"><Input type="number" min={1950} max={new Date().getFullYear() + 1} value={year} onChange={(e) => setYear(e.target.value)} /></Field>
    </ActionDialog>
  );
}

// ── HR notes ──
export function NoteDialog({ id, note, ...c }: Common & { id: string; note?: any }) {
  const [body, setBody] = useState('');
  const { busy, error, exec } = useAction(c.onDone, c.onClose);
  useEffect(() => { if (c.isOpen) setBody(note?.body ?? ''); }, [c.isOpen, note]);
  return (
    <ActionDialog isOpen={c.isOpen} onClose={c.onClose} title={note ? 'Edit HR note' : 'Add HR note'}
      description="Confidential: visible to HR Staff and HR Head only. Edits keep the earlier text."
      submitLabel="Save note" busy={busy} error={error} disabled={!body.trim() || (note && body.trim() === note.body)}
      onSubmit={() => exec(note ? editHrNote(id, note.id, body.trim()) : addHrNote(id, body.trim()), 'Note saved')}>
      <Field label="Note" required><textarea rows={5} maxLength={5000} className={textareaClass} value={body} onChange={(e) => setBody(e.target.value)} /></Field>
    </ActionDialog>
  );
}
