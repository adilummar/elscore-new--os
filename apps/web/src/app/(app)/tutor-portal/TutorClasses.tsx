"use client";

import * as React from 'react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import {
  ACTIVITIES, ATTENDANCE_CHOICES, ClassItem, EarningsData, PARTICIPATION_CHOICES, STATE_TONE, UpdateDraft, draftFromClass, hoursText, payloadOfUpdate, timeLabel, toggleActivity, updateProblems,
} from '../mentoring/class-view';
import { dayLabel, longDayLabel } from '../mentoring/timetable-view';

import { tutorPortalApi } from './client';

const AREA = 'block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500';
const when = (iso: string) => `${dayLabel(iso.slice(0, 10))}, ${iso.slice(11, 16)} UTC`;
const money = (n: number | null, currency: string | null) => (n === null ? 'No rate set' : `${currency ?? 'AED'} ${n.toFixed(2)}`);

// ─── The update form ─────────────────────────────────────────────────────────────────────────────────────────────
interface FormProps { c: ClassItem; draft: UpdateDraft; busy?: boolean; error?: string | null; onChange: (d: UpdateDraft) => void; onSubmit: () => void; onCancel: () => void }

export function ClassUpdateForm({ c, draft, busy = false, error = null, onChange, onSubmit, onCancel }: FormProps) {
  const set = <K extends keyof UpdateDraft>(k: K, v: UpdateDraft[K]) => onChange({ ...draft, [k]: v });
  const problems = updateProblems(draft);
  const conducted = draft.conducted === 'yes';
  const id = (k: string) => `update-${c.key}-${k}`;
  return (
    <section aria-label="Class update" className="rounded-md border border-slate-200 bg-slate-50 p-3" data-testid="update-form">
      <h4 className="mb-2 text-sm font-semibold text-slate-900">Class update, {c.subjectName}, {longDayLabel(c.date)}, {timeLabel(c)}</h4>
      <fieldset className="mb-2">
        <legend className="mb-1 text-sm font-medium text-slate-700">Was the class conducted?</legend>
        <div className="flex gap-4 text-sm">
          {([['yes', 'Yes, it was conducted'], ['no', 'No, it was not conducted']] as const).map(([v, label]) => (
            <label key={v} className="flex items-center gap-1.5"><input type="radio" name={id('conducted')} checked={draft.conducted === v} onChange={() => set('conducted', v)} />{label}</label>
          ))}
        </div>
      </fieldset>

      {draft.conducted === 'no' && (
        <label className="block text-sm" htmlFor={id('reason')}><span className="mb-1 block font-medium text-slate-700">Why was it not conducted? <span className="text-red-600">required</span></span><textarea id={id('reason')} rows={2} className={AREA} value={draft.notConductedReason} onChange={(e) => set('notConductedReason', e.target.value)} /></label>
      )}

      {conducted && (
        <div className="space-y-3">
          <div className="grid gap-2 sm:grid-cols-3">
            <label className="block text-sm" htmlFor={id('start')}><span className="mb-1 block font-medium text-slate-700">Actual start time <span className="text-red-600">required</span></span><Input id={id('start')} type="time" value={draft.actualStart} onChange={(e) => set('actualStart', e.target.value)} /></label>
            <label className="block text-sm" htmlFor={id('end')}><span className="mb-1 block font-medium text-slate-700">Actual end time <span className="text-red-600">required</span></span><Input id={id('end')} type="time" value={draft.actualEnd} onChange={(e) => set('actualEnd', e.target.value)} /></label>
            <div className="text-sm"><span className="mb-1 block font-medium text-slate-700">Actual teaching duration</span><p className="rounded-md bg-white px-3 py-2 text-slate-900" data-testid="actual-duration">{draft.actualStart && draft.actualEnd && draft.actualEnd > draft.actualStart ? hoursText(minutesBetween(draft.actualStart, draft.actualEnd)) : 'Worked out from the times'}</p></div>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="block text-sm" htmlFor={id('subject')}><span className="mb-1 block font-medium text-slate-700">Subject covered</span><Input id={id('subject')} value={draft.subjectCovered} placeholder={c.subjectName} onChange={(e) => set('subjectCovered', e.target.value)} /></label>
            <label className="block text-sm" htmlFor={id('topics')}><span className="mb-1 block font-medium text-slate-700">Topics covered <span className="text-red-600">required</span></span><Input id={id('topics')} value={draft.topicsCovered} onChange={(e) => set('topicsCovered', e.target.value)} /></label>
            <label className="block text-sm" htmlFor={id('attendance')}><span className="mb-1 block font-medium text-slate-700">Attendance <span className="text-red-600">required</span></span>
              <select id={id('attendance')} className={AREA} value={draft.attendance} onChange={(e) => set('attendance', e.target.value)}><option value="">Choose</option>{ATTENDANCE_CHOICES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
            <label className="block text-sm" htmlFor={id('participation')}><span className="mb-1 block font-medium text-slate-700">Student participation</span>
              <select id={id('participation')} className={AREA} value={draft.participation} onChange={(e) => set('participation', e.target.value)}><option value="">Not rated</option>{PARTICIPATION_CHOICES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
          </div>

          <fieldset>
            <legend className="mb-1 text-sm font-medium text-slate-700">Post-class activities (choose as many as apply)</legend>
            <div className="grid gap-1 sm:grid-cols-2 lg:grid-cols-3">
              {ACTIVITIES.map(([code, label]) => (
                <label key={code} className="flex items-center gap-1.5 text-sm"><input type="checkbox" checked={draft.activities.includes(code)} onChange={() => set('activities', toggleActivity(draft.activities, code))} />{label}</label>
              ))}
            </div>
            {draft.activities.includes('OTHER') && (
              <label className="mt-2 block text-sm" htmlFor={id('other')}><span className="mb-1 block font-medium text-slate-700">Describe the other activity <span className="text-red-600">required</span></span><Input id={id('other')} value={draft.otherActivity} onChange={(e) => set('otherActivity', e.target.value)} /></label>
            )}
          </fieldset>

          <label className="block text-sm" htmlFor={id('evaluation')}><span className="mb-1 block font-medium text-slate-700">Remarks, class evaluation</span>
            <textarea id={id('evaluation')} rows={3} className={AREA} value={draft.evaluationRemarks} placeholder="Understanding, attention and participation, progress, difficulties, how effective the class was, what to improve" onChange={(e) => set('evaluationRemarks', e.target.value)} /></label>
          <label className="block text-sm" htmlFor={id('covered')}><span className="mb-1 block font-medium text-slate-700">Remarks, topics covered in class</span>
            <textarea id={id('covered')} rows={3} className={AREA} value={draft.coveredRemarks} placeholder="Topics taught, chapters, exercises done, activities, homework given, topics remaining" onChange={(e) => set('coveredRemarks', e.target.value)} /></label>
          <label className="block text-sm" htmlFor={id('notes')}><span className="mb-1 block font-medium text-slate-700">Class notes</span><textarea id={id('notes')} rows={2} className={AREA} value={draft.classNotes} onChange={(e) => set('classNotes', e.target.value)} /></label>
        </div>
      )}

      {draft.conducted !== '' && (
        <label className="mt-3 flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1" checked={draft.voiceSent} onChange={(e) => set('voiceSent', e.target.checked)} /><span>I have sent my voice update to the Mentor. <span className="text-slate-500">The Mentor confirms when it arrives. Nothing is recorded or stored here.</span></span></label>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button type="button" size="sm" isLoading={busy} disabled={busy || problems.length > 0} onClick={onSubmit}>Submit class update</Button>
        <Button type="button" size="sm" variant="ghost" onClick={onCancel}>Cancel</Button>
        {problems.length > 0 && <p className="text-xs text-slate-500" data-testid="update-missing">Still needed: {problems.join(', ')}.</p>}
      </div>
      <p className="mt-1 text-xs text-slate-600">Submitting sends the update to your Mentor. The class counts as completed only after the Mentor verifies it.</p>
      {error && <p role="alert" className="mt-2 text-xs font-medium text-red-600">{error}</p>}
    </section>
  );
}

const minutesBetween = (a: string, b: string) => Number(b.slice(0, 2)) * 60 + Number(b.slice(3, 5)) - (Number(a.slice(0, 2)) * 60 + Number(a.slice(3, 5)));

// ─── One of my classes ───────────────────────────────────────────────────────────────────────────────────────────
export function MyClassCard({ c, onUpdate }: { c: ClassItem; onUpdate: () => void }) {
  const can = ['SCHEDULED', 'RESCHEDULED', 'RETURNED_FOR_CORRECTION', 'AWAITING_MENTOR_VERIFICATION'].includes(c.status);
  return (
    <article aria-label={`${c.subjectName} ${timeLabel(c)}`} className="rounded-md border border-slate-200 bg-white p-3" data-testid="my-class" data-state={c.state}>
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="mr-auto text-sm font-semibold text-slate-900">{c.subjectName}<span className="ml-2 font-normal text-slate-500">{dayLabel(c.date)}, {timeLabel(c)}</span></h3>
        {c.moved && <Badge variant="info">Moved</Badge>}
        <Badge variant={STATE_TONE[c.state]}>{c.stateLabel}</Badge>
      </div>
      <p className="mt-1 text-sm text-slate-700">{c.studentName}, {hoursText(c.scheduledMinutes)} scheduled{c.verified ? `, ${hoursText(c.verified.minutes)} verified` : ''}.</p>
      {c.returned && <p role="alert" className="mt-1 rounded-md bg-red-50 px-2 py-1 text-sm text-red-800">Your Mentor returned this update: {c.returned.reason}</p>}
      {can && <div className="mt-2"><Button type="button" size="sm" variant={c.status === 'RETURNED_FOR_CORRECTION' ? 'primary' : 'outline'} onClick={onUpdate}>{c.update ? 'Correct class update' : 'Submit class update'}</Button></div>}
    </article>
  );
}

/** The signed-in tutor's own classes for a range, each with its update form. */
export function MyClasses({ from, to }: { from: string; to: string }) {
  const [classes, setClasses] = React.useState<ClassItem[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [open, setOpen] = React.useState<string | null>(null);
  const [draft, setDraft] = React.useState<UpdateDraft | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [formError, setFormError] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    try {
      setClasses(await tutorPortalApi(`/tutor-portal/classes?from=${from}&to=${to}`));
      setError(null);
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : 'Your classes could not be loaded.');
    }
  }, [from, to]);
  React.useEffect(() => { void load(); }, [load]);

  const submit = async (c: ClassItem) => {
    if (!draft) return;
    setBusy(true);
    setFormError(null);
    try {
      await tutorPortalApi(`/tutor-portal/classes/${c.key}/update`, 'PUT', payloadOfUpdate(draft));
      setNotice('Your class update was sent to your Mentor.');
      setOpen(null);
      await load();
    } catch (e) {
      setFormError(e instanceof Error && e.message ? e.message : 'The update could not be sent.');
    }
    setBusy(false);
  };

  return (
    <section aria-label="My class updates" className="space-y-2" data-testid="my-classes">
      <h2 className="text-base font-semibold text-slate-900">Class updates</h2>
      {error && <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      {notice && <p role="status" className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{notice}</p>}
      {classes && classes.length === 0 && <p className="rounded-md border border-dashed border-slate-300 p-3 text-sm text-slate-500">You have no classes in these dates.</p>}
      {classes?.map((c) => (
        <div key={c.key} className="space-y-2">
          <MyClassCard c={c} onUpdate={() => { setNotice(null); setFormError(null); setDraft(draftFromClass(c)); setOpen(c.key); }} />
          {open === c.key && draft && <ClassUpdateForm c={c} draft={draft} busy={busy} error={formError} onChange={setDraft} onSubmit={() => void submit(c)} onCancel={() => setOpen(null)} />}
        </div>
      ))}
    </section>
  );
}

// ─── My completed classes and earnings ───────────────────────────────────────────────────────────────────────────
export function EarningsView({ data }: { data: EarningsData }) {
  const t = data.totals;
  return (
    <div className="space-y-3" data-testid="earnings">
      <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {([['Verified teaching time', hoursText(t.verifiedMinutes)], ['Pending Mentor verification', hoursText(t.pendingMinutes)], ['Estimated amount', t.estimatedAmount.toFixed(2)], ['Classes with no rate set', String(t.classesWithoutRate)]] as Array<[string, string]>).map(([k, v]) => (
          <div key={k} className="rounded-md border border-slate-200 bg-white px-3 py-2"><dt className="text-xs text-slate-500">{k}</dt><dd className="text-sm font-semibold text-slate-900">{v}</dd></div>
        ))}
      </dl>
      <p className="text-xs text-slate-600">{data.note}</p>

      <section aria-label="Verified classes" className="rounded-md border border-slate-200 bg-white">
        <h3 className="border-b border-slate-200 px-3 py-2 text-sm font-semibold text-slate-900">Verified classes</h3>
        {data.verified.length === 0 ? <p className="px-3 py-3 text-sm text-slate-500">No class has been verified in these dates.</p> : (
          <table className="w-full text-sm"><thead className="text-left text-xs text-slate-500"><tr><th className="px-3 py-1.5 font-medium">Date</th><th className="px-3 py-1.5 font-medium">Subject</th><th className="px-3 py-1.5 font-medium">Verified</th><th className="px-3 py-1.5 font-medium">Estimate</th><th className="px-3 py-1.5 font-medium">Payroll</th></tr></thead>
            <tbody>
              {data.verified.map((v) => (
                <tr key={v.sessionId} className="border-t border-slate-100 align-top" data-testid="verified-row">
                  <td className="px-3 py-1.5">{dayLabel(v.date)}</td>
                  <td className="px-3 py-1.5">{v.subject}</td>
                  <td className="px-3 py-1.5">{hoursText(v.verifiedMinutes)}<span className="block text-xs text-slate-500">{hoursText(v.scheduledMinutes)} scheduled{v.actualMinutes != null ? `, ${hoursText(v.actualMinutes)} reported` : ''}</span></td>
                  <td className="px-3 py-1.5">{money(v.estimatedAmount, v.currency)}</td>
                  <td className="px-3 py-1.5">{v.payroll ? <>{v.payroll.period ?? 'Payroll run'}<span className="block text-xs text-slate-500">{v.payroll.paymentStatus === 'PAID' ? `Paid${v.payroll.paidAt ? ` ${dayLabel(v.payroll.paidAt.slice(0, 10))}` : ''}` : 'Unpaid'}, {money(v.payroll.amount, v.payroll.currency)}</span></> : <span className="text-slate-500">Not in a payroll run yet</span>}
                    {v.adjustments.map((a) => <span key={a.at} className="block text-xs text-amber-800">Correction {a.deltaMinutes > 0 ? '+' : ''}{a.deltaMinutes} min: {a.reason}</span>)}</td>
                </tr>
              ))}
            </tbody></table>
        )}
      </section>

      <section aria-label="Pending verification" className="rounded-md border border-slate-200 bg-white">
        <h3 className="border-b border-slate-200 px-3 py-2 text-sm font-semibold text-slate-900">Pending Mentor verification</h3>
        {data.pending.length === 0 ? <p className="px-3 py-3 text-sm text-slate-500">Nothing is waiting for your Mentor.</p> : (
          <ul className="divide-y divide-slate-100 text-sm">
            {data.pending.map((p) => <li key={p.sessionId} className="px-3 py-1.5" data-testid="pending-row">{dayLabel(p.date)}, {p.subject}, {hoursText(p.pendingMinutes)}. {p.status === 'RETURNED_FOR_CORRECTION' ? 'Returned to you for correction.' : 'Waiting for the Mentor.'}</li>)}
          </ul>
        )}
      </section>
    </div>
  );
}

const monthRange = () => {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  const pad = (n: number) => String(n).padStart(2, '0');
  return { from: `${y}-${pad(m + 1)}-01`, to: `${y}-${pad(m + 1)}-${pad(new Date(y, m + 1, 0).getDate())}` };
};

/** The signed-in tutor's own verified classes and earnings for a month. */
export function MyEarnings() {
  const [range, setRange] = React.useState(monthRange);
  const [data, setData] = React.useState<EarningsData | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  React.useEffect(() => {
    let cancelled = false;
    tutorPortalApi(`/tutor-portal/earnings?from=${range.from}&to=${range.to}`)
      .then((d: EarningsData) => !cancelled && (setData(d), setError(null)))
      .catch((e: unknown) => !cancelled && setError(e instanceof Error && e.message ? e.message : 'Your earnings could not be loaded.'));
    return () => { cancelled = true; };
  }, [range]);
  return (
    <section aria-label="My completed classes and earnings" className="space-y-2" data-testid="my-earnings">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="mr-auto text-base font-semibold text-slate-900">My completed classes and earnings</h2>
        <label className="text-sm"><span className="sr-only">From</span><Input type="date" className="h-9" value={range.from} onChange={(e) => e.target.value && setRange({ ...range, from: e.target.value })} /></label>
        <label className="text-sm"><span className="sr-only">To</span><Input type="date" className="h-9" value={range.to} onChange={(e) => e.target.value && setRange({ ...range, to: e.target.value })} /></label>
      </div>
      {error && <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      {data && <EarningsView data={data} />}
    </section>
  );
}
