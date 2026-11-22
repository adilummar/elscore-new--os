"use client";

import { useCallback, useEffect, useState } from 'react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { usePermissions } from '@/components/providers/AuthProvider';
import { addAdSpend, createSource, getAllSources, getSchedule, setSchedule } from '../actions';
import { fmtDateTime, todayLocal } from '../constants';
import { ErrorNote, Field, NoAccess, PageHeader, textareaClass } from '../_components/kit';

const DAYS = [
  { v: 1, l: 'Mon' }, { v: 2, l: 'Tue' }, { v: 3, l: 'Wed' }, { v: 4, l: 'Thu' }, { v: 5, l: 'Fri' }, { v: 6, l: 'Sat' }, { v: 0, l: 'Sun' },
];

export default function HiringSettingsPage() {
  const { hasPermission } = usePermissions();
  return hasPermission('tutor_hiring.settings') ? <SettingsInner /> : <NoAccess what="Hiring settings" />;
}

function SettingsInner() {
  const [sched, setSched] = useState<any>(null);
  const [sources, setSources] = useState<any[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // schedule form
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [days, setDays] = useState<number[]>([]);
  const [tz, setTz] = useState('Asia/Kolkata');
  // source form
  const [srcName, setSrcName] = useState('');
  // ad spend form
  const [spend, setSpend] = useState({ sourceId: '', periodStart: todayLocal(), periodEnd: todayLocal(), amount: '', currency: '', notes: '' });
  const [busy, setBusy] = useState('');

  const load = useCallback(async () => {
    const [a, b] = await Promise.all([getSchedule(), getAllSources()]);
    if (a.ok) setSched(a.data); else setError(a.message);
    if (b.ok) setSources(b.data);
  }, []);
  useEffect(() => { load(); }, [load]);

  const act = async (key: string, p: Promise<any>, ok: string, after?: () => void) => {
    setBusy(key); setError(null); setMsg(null);
    const r = await p;
    setBusy('');
    if (r.ok) { setMsg(ok); after?.(); load(); } else setError(r.message);
  };

  return (
    <div className="space-y-6 max-w-3xl">
      <PageHeader title="Hiring settings" />
      {msg && <div role="status" className="rounded-md border border-brand-200 bg-brand-50 px-3 py-2 text-sm text-brand-800">{msg}</div>}
      <ErrorNote message={error} />

      <Card>
        <CardHeader><CardTitle>Working hours</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-slate-600">
            Evaluation deadlines are two working hours after a demo completes. Until working hours are saved, no deadlines or overdue alerts are produced.
          </p>
          {sched?.current ? (
            <p className="text-sm text-slate-800">
              Current: <Badge variant="success">{sched.current.startTime}–{sched.current.endTime}</Badge>{' '}
              {sched.current.workingDays.map((d: number) => DAYS.find((x) => x.v === d)?.l).join(', ')} · {sched.current.timezone}
            </p>
          ) : <Badge variant="warning">Not configured</Badge>}
          <form className="grid grid-cols-1 sm:grid-cols-2 gap-4" onSubmit={(e) => {
            e.preventDefault();
            act('sched', setSchedule({ startTime: start, endTime: end, workingDays: days, timezone: tz }), 'Working hours saved', () => { setStart(''); setEnd(''); setDays([]); });
          }}>
            <Field label="Start time" required htmlFor="s-start"><Input id="s-start" type="time" required value={start} onChange={(e) => setStart(e.target.value)} /></Field>
            <Field label="End time" required htmlFor="s-end"><Input id="s-end" type="time" required value={end} onChange={(e) => setEnd(e.target.value)} /></Field>
            <fieldset className="sm:col-span-2">
              <legend className="text-sm font-medium text-slate-700 mb-1.5">Working days <span className="text-red-500">*</span></legend>
              <div className="flex flex-wrap gap-2">
                {DAYS.map((d) => {
                  const on = days.includes(d.v);
                  return (
                    <button key={d.v} type="button" aria-pressed={on} onClick={() => setDays(on ? days.filter((x) => x !== d.v) : [...days, d.v])}
                      className={`px-3 h-9 rounded-md text-sm border ${on ? 'bg-brand-600 border-brand-600 text-white' : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-50'}`}>{d.l}</button>
                  );
                })}
              </div>
            </fieldset>
            <Field label="Timezone" required htmlFor="s-tz"><Input id="s-tz" required value={tz} onChange={(e) => setTz(e.target.value)} /></Field>
            <div className="sm:col-span-2 flex justify-end">
              <Button type="submit" isLoading={busy === 'sched'} disabled={!start || !end || days.length === 0}>Save working hours</Button>
            </div>
          </form>
          {sched?.history?.length > 1 && (
            <details className="text-sm text-slate-600">
              <summary className="cursor-pointer">Earlier versions</summary>
              <ul className="mt-1 space-y-1">{sched.history.map((h: any) => <li key={h.id}>From {fmtDateTime(h.effectiveFrom)}: {h.startTime}–{h.endTime}, {h.timezone}</li>)}</ul>
            </details>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Lead sources</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <ul className="flex flex-wrap gap-2">
            {sources.length === 0 && <li className="text-sm text-slate-500">No sources yet. Add the sources your team records leads from.</li>}
            {sources.map((s) => <li key={s.id}><Badge variant={s.isActive ? 'info' : 'default'}>{s.name}{s.isActive ? '' : ' (inactive)'}</Badge></li>)}
          </ul>
          <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); act('src', createSource(srcName.trim()), 'Source added', () => setSrcName('')); }}>
            <Input aria-label="New source name" placeholder="New source name" maxLength={100} value={srcName} onChange={(e) => setSrcName(e.target.value)} />
            <Button type="submit" isLoading={busy === 'src'} disabled={!srcName.trim()}>Add</Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Advertising spend</CardTitle></CardHeader>
        <CardContent>
          <p className="text-sm text-slate-600 mb-4">Enter spend only from your own records. Nothing is estimated or prorated by the system.</p>
          <form className="grid grid-cols-1 sm:grid-cols-2 gap-4" onSubmit={(e) => {
            e.preventDefault();
            act('spend', addAdSpend({ ...spend, amount: Number(spend.amount), notes: spend.notes.trim() || undefined }), 'Ad spend recorded', () => setSpend({ ...spend, amount: '', notes: '' }));
          }}>
            <Field label="Source" required>
              <Select required value={spend.sourceId} onChange={(e) => setSpend({ ...spend, sourceId: e.target.value })}>
                <option value="">Select source</option>
                {sources.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </Select>
            </Field>
            <Field label="Currency (3 letters)" required><Input required maxLength={3} placeholder="e.g. AED" value={spend.currency} onChange={(e) => setSpend({ ...spend, currency: e.target.value.toUpperCase() })} /></Field>
            <Field label="Period start" required><Input type="date" required value={spend.periodStart} onChange={(e) => setSpend({ ...spend, periodStart: e.target.value })} /></Field>
            <Field label="Period end" required><Input type="date" required min={spend.periodStart} value={spend.periodEnd} onChange={(e) => setSpend({ ...spend, periodEnd: e.target.value })} /></Field>
            <Field label="Amount" required><Input type="number" required min={0} step="0.01" value={spend.amount} onChange={(e) => setSpend({ ...spend, amount: e.target.value })} /></Field>
            <Field label="Notes"><textarea rows={1} maxLength={500} className={textareaClass} value={spend.notes} onChange={(e) => setSpend({ ...spend, notes: e.target.value })} /></Field>
            <div className="sm:col-span-2 flex justify-end">
              <Button type="submit" isLoading={busy === 'spend'} disabled={!spend.sourceId || spend.currency.length !== 3 || spend.amount === ''}>Record spend</Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
