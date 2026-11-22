"use client";

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card, CardContent } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { PhoneInput, COUNTRIES } from '@/components/ui/PhoneInput';
import { Select } from '@/components/ui/Select';
import { addEnquiry, checkDuplicate, getSources, registerCandidate } from '../../actions';
import { fmtDateTime, todayLocal } from '../../constants';
import { ErrorNote, Field, StageBadge, textareaClass } from '../../_components/kit';

function splitPhone(value: string) {
  const sorted = [...COUNTRIES].sort((a, b) => b.dialCode.length - a.dialCode.length);
  const c = sorted.find((x) => value.startsWith(x.dialCode));
  return c ? { country: c, complete: value.length - c.dialCode.length === c.subscriberDigits } : null;
}

export default function RegisterLeadPage() {
  const router = useRouter();
  const [sources, setSources] = useState<any[]>([]);
  const [phone, setPhone] = useState('+91');
  const [sourceId, setSourceId] = useState('');
  const [leadDate, setLeadDate] = useState(todayLocal());
  const [name, setName] = useState('');
  const [notes, setNotes] = useState('');
  const [dup, setDup] = useState<any>(null);
  const [checking, setChecking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  useEffect(() => { getSources().then((r) => r.ok && setSources(r.data)); }, []);

  const parsed = splitPhone(phone);

  // Duplicate detection runs as soon as the number is complete, before the form is submitted.
  useEffect(() => {
    setDup(null); setInfo(null);
    if (!parsed?.complete) return;
    let cancelled = false;
    setChecking(true);
    checkDuplicate(phone, parsed.country.dialCode).then((r) => {
      if (cancelled) return;
      setChecking(false);
      if (r.ok) setDup(r.data.duplicate ? r.data.existing : null);
      else setError(r.message);
    });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phone]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!parsed?.complete || dup) return;
    setBusy(true); setError(null);
    const r = await registerCandidate({
      phone, countryCode: parsed.country.dialCode, sourceId, leadDate,
      name: name.trim() || undefined, notes: notes.trim() || undefined,
    });
    setBusy(false);
    if (r.ok) { router.push(`/tutor-hr/hiring/candidates/${r.data.id}`); return; }
    if (r.code === 'DUPLICATE_CANDIDATE') {
      const c = await checkDuplicate(phone, parsed.country.dialCode);
      if (c.ok && c.data.duplicate) { setDup(c.data.existing); return; }
    }
    setError(r.message);
  };

  const addAsEnquiry = async () => {
    if (!dup || !sourceId) return;
    setBusy(true); setError(null);
    const r = await addEnquiry(dup.id, { sourceId, enquiryDate: leadDate, notes: notes.trim() || undefined });
    setBusy(false);
    if (r.ok) router.push(`/tutor-hr/hiring/candidates/${dup.id}`);
    else setError(r.message);
  };

  return (
    <div className="max-w-2xl space-y-5">
      <div className="flex items-center gap-3">
        <Link href="/tutor-hr/hiring/candidates" aria-label="Back to candidates" className="text-slate-500 hover:text-slate-900"><ArrowLeft className="w-5 h-5" /></Link>
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Register lead</h1>
          <p className="text-sm text-slate-500">Only a phone number, a source and the lead date are needed to start.</p>
        </div>
      </div>

      <form onSubmit={submit}>
        <Card>
          <CardContent className="space-y-5 pt-6">
            <Field label="Phone number" required hint={checking ? 'Checking for an existing candidate…' : undefined}>
              <PhoneInput value={phone} onChange={setPhone} />
            </Field>

            {dup && (
              <div role="alert" className="rounded-md border border-amber-300 bg-amber-50 p-4 space-y-3">
                <p className="flex items-center gap-2 font-medium text-amber-900"><AlertTriangle className="w-4 h-4" aria-hidden />This number already belongs to a candidate</p>
                <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm text-amber-900">
                  <dt className="text-amber-700">Candidate</dt><dd>{dup.name ?? 'Unnamed lead'} ({dup.candidateId})</dd>
                  <dt className="text-amber-700">Stage</dt><dd><StageBadge stage={dup.stage} /></dd>
                  <dt className="text-amber-700">Registered</dt><dd>{fmtDateTime(dup.registeredAt)}</dd>
                  <dt className="text-amber-700">Owner</dt><dd className="break-all">{dup.owner ?? '—'}</dd>
                </dl>
                <div className="flex flex-wrap gap-2">
                  <Link href={`/tutor-hr/hiring/candidates/${dup.id}`}><Button type="button" variant="outline" size="sm">Open existing candidate</Button></Link>
                  <Button type="button" size="sm" onClick={addAsEnquiry} disabled={!sourceId || busy} title={sourceId ? undefined : 'Select a source first'}>
                    Record as a new enquiry
                  </Button>
                </div>
                {!sourceId && <p className="text-xs text-amber-800">Pick a source below to record this as a repeat enquiry.</p>}
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Lead source" required htmlFor="source">
                <Select id="source" required value={sourceId} onChange={(e) => setSourceId(e.target.value)}>
                  <option value="">Select source</option>
                  {sources.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </Select>
                {sources.length === 0 && <p className="text-xs text-amber-700">No lead sources are configured yet. A Tutor Head must add them in Hiring settings.</p>}
              </Field>
              <Field label="Lead date" required htmlFor="leadDate">
                <Input id="leadDate" type="date" required max={todayLocal()} value={leadDate} onChange={(e) => setLeadDate(e.target.value)} />
              </Field>
            </div>
            <Field label="Name" htmlFor="name" hint="Optional now; can be added in Details Shared.">
              <Input id="name" maxLength={200} value={name} onChange={(e) => setName(e.target.value)} />
            </Field>
            <Field label="Notes" htmlFor="notes">
              <textarea id="notes" rows={3} maxLength={1000} className={textareaClass} value={notes} onChange={(e) => setNotes(e.target.value)} />
            </Field>

            <ErrorNote message={error ?? info} />
            <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
              <Link href="/tutor-hr/hiring/candidates"><Button type="button" variant="outline">Cancel</Button></Link>
              <Button type="submit" isLoading={busy} disabled={!parsed?.complete || !!dup || !sourceId || !leadDate || checking}>Register lead</Button>
            </div>
          </CardContent>
        </Card>
      </form>
    </div>
  );
}
