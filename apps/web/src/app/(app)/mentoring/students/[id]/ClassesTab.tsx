"use client";

import * as React from 'react';
import { Badge } from '@/components/ui/Badge';
import { audioUrl } from '../../workspace-view';
import { ClassWorkspaceDrawer } from '../../ClassWorkspaceDrawer';
import { mentoringApi } from '../../mentoring-client';
import { ClassCounts, ClassRecord, ClassesData, TONES, TONE_ORDER, clock, dateText, minutesText } from '../../student-hub-view';

const STATE_FILTERS: Array<[string, string]> = [
  ['', 'All records'], ['AWAITING_TUTOR_UPDATE', 'Awaiting tutor update'], ['AWAITING_MENTOR_VERIFICATION', 'Awaiting Mentor verification'], ['RETURNED_FOR_CORRECTION', 'Returned for correction'],
  ['VERIFIED', 'Verified'], ['NOT_CONDUCTED', 'Not conducted'], ['RESCHEDULED', 'Rescheduled'], ['CANCELLED', 'Cancelled'], ['SCHEDULED', 'Scheduled'],
];

/**
 * The Classes tab: every class record the system holds, nothing synthesised. The five figures are kept apart. Verifying, returning and marking
 * a class incomplete are done in the existing class workspace opened from the drawer, which the API checks again for who may do it.
 */
export function ClassesTab({ activationId }: { activationId: string }) {
  const [data, setData] = React.useState<ClassesData | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [state, setState] = React.useState('');
  const [open, setOpen] = React.useState<ClassRecord | null>(null);
  const [reload, setReload] = React.useState(0);

  React.useEffect(() => {
    let live = true;
    mentoringApi(`/mentoring/mentor-students/${activationId}/classes${state ? `?state=${encodeURIComponent(state)}` : ''}`)
      .then((d: ClassesData) => { if (live) { setData(d); setError(null); } })
      .catch((e: unknown) => { if (live) setError(e instanceof Error && e.message ? e.message : 'The classes could not be loaded.'); });
    return () => { live = false; };
  }, [activationId, state, reload]);

  if (error) return <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error} <button type="button" className="underline" onClick={() => setReload((n) => n + 1)}>Try again</button></p>;
  if (!data) return <p className="text-sm text-slate-500">Loading the classes</p>;
  const b = data.balance;
  const c = data.counts.period;

  return (
    <div className="space-y-4" data-testid="classes-tab">
      <section aria-label="Class balance this month" className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
        {([
          ['Allocated', minutesText(b.allocatedMinutes), 'Monthly hours on the requirements'],
          ['Scheduled', minutesText(b.scheduledMinutes), 'On the timetable, cancelled classes left out'],
          ['Consumed', minutesText(b.consumedMinutes), `${c.consumedClasses} verified class${c.consumedClasses === 1 ? '' : 'es'}`],
          ['Remaining', minutesText(b.remainingMinutes), b.over ? 'More than allocated has been consumed' : 'Allocated minus consumed'],
          ['Pending', minutesText(b.pendingMinutes), `${c.awaitingTutor} awaiting tutor, ${c.awaitingMentor} awaiting you`],
        ] as Array<[string, string, string]>).map(([k, v, hint]) => (
          <div key={k} className="rounded-md border border-slate-200 bg-white p-3" data-testid={`balance-${k.toLowerCase()}`}>
            <p className="text-xs text-slate-500">{k}</p><p className="text-lg font-semibold text-slate-900">{v}</p><p className="text-xs text-slate-500">{hint}</p>
          </div>
        ))}
      </section>
      <p className="text-xs text-slate-500">{data.note}</p>

      <div className="flex flex-wrap items-center gap-3">
        <ul className="flex flex-wrap gap-2 text-xs" aria-label="Colour key">
          {TONE_ORDER.map((t) => <li key={t} className={`rounded-full border px-2 py-0.5 ${TONES[t].chip}`}>{TONES[t].label}</li>)}
        </ul>
        <select aria-label="Show classes" className="ml-auto h-9 rounded-md border border-slate-300 px-2 text-sm" value={state} onChange={(e) => setState(e.target.value)}>
          {STATE_FILTERS.map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </div>
      <Totals all={data.counts.allTime} />

      {data.records.length === 0
        ? <p className="rounded-md border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500" data-testid="classes-empty">No class records yet. A record appears when something happens to a scheduled class, such as a reminder or the tutor&apos;s update.</p>
        : (
          <ul className="space-y-2" aria-label="Class records">
            {data.records.map((r) => (
              <li key={r.key}>
                <button type="button" onClick={() => setOpen(r)} data-testid="class-record" data-tone={r.tone} data-key={r.key}
                  className={`flex w-full flex-wrap items-center gap-x-4 gap-y-1 rounded-md border border-l-4 border-slate-200 bg-white p-3 text-left text-sm hover:bg-slate-50 ${TONES[r.tone].bar}`}>
                  <span className="font-medium text-slate-900">{dateText(r.date)}, {clock(r.startMinute)} to {clock(r.endMinute)}</span>
                  <span>{r.subjectName}</span>
                  <span className="text-slate-600">{r.tutorName}</span>
                  <Badge className={`ml-auto ${TONES[r.tone].chip}`}>{r.stateLabel}</Badge>
                  <span className="w-full text-xs text-slate-500">
                    {r.consumption === 'CONSUMED' ? `Consumed: ${minutesText(r.verifiedMinutes)} verified` : 'Not consumed'}
                    {r.moved ? ' · Moved from its original time' : ''}
                    {r.tutorSubmitted ? ' · Tutor update sent' : ''}
                    {r.voiceUploaded ? ' · Voice recording uploaded' : ''}
                    {r.returned ? ` · Returned: ${r.returned.reason}` : ''}
                    {r.cancelled ? ` · Cancelled: ${r.cancelled.reason}` : ''}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      {data.truncated && <p className="text-xs text-amber-800">Only the 500 most recent records are shown.</p>}
      {open && <ClassDrawer record={open} canVerify={data.canVerify} onClose={() => setOpen(null)} onChanged={() => setReload((n) => n + 1)} />}
    </div>
  );
}

function Totals({ all }: { all: ClassCounts }) {
  return (
    <p className="text-sm text-slate-700" data-testid="class-totals">
      {all.records} record{all.records === 1 ? '' : 's'} · {all.consumedClasses} consumed · {all.awaitingMentor} awaiting Mentor · {all.awaitingTutor} awaiting tutor · {all.returned} returned · {all.notConducted} not conducted · {all.cancelled} cancelled
    </p>
  );
}

interface Detail {
  sessionId: string; date: string; startMinute: number; endMinute: number; status: string; moved: boolean; subjectName: string; tutorName: string; stateLabel: string; meetLink: string | null;
  update: null | { actualStartMinute: number | null; actualEndMinute: number | null; actualMinutes: number | null; attendance: string | null; participation: string | null; topicsCovered: string | null; homework: string | null; portionsCompleted: string | null; classNotes: string | null; evaluationRemarks: string | null; notConductedReason: string | null; submittedAt: string | null; version: number };
  voice: { uploaded: boolean; shared: boolean; fileName: string | null; attachmentId: string | null };
  verified: { at: string; minutes: number } | null;
  returned: { reason: string; kind: string } | null;
  mentorRemarks: string | null;
  consumption: 'CONSUMED' | 'NOT_CONSUMED';
  history: Array<{ kind: string; at: string; reason: string | null; from: string | null; to: string | null }>;
  adjustments: Array<{ at: string; previousMinutes: number; newMinutes: number; deltaMinutes: number; reason: string; appliedToRecord: boolean }>;
}

/** The right-side drawer: what the record says, then the existing class workspace for verification. */
export function ClassDrawer({ record, canVerify, onClose, onChanged }: { record: ClassRecord; canVerify: boolean; onClose: () => void; onChanged: () => void }) {
  const [tab, setTab] = React.useState<'summary' | 'workspace'>('summary');
  const [d, setD] = React.useState<Detail | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  React.useEffect(() => {
    if (!record.sessionId) return;
    let live = true;
    mentoringApi(`/mentoring/classes/${record.sessionId}`).then((x: Detail) => { if (live) setD(x); }).catch((e: unknown) => { if (live) setError(e instanceof Error && e.message ? e.message : 'The class could not be opened.'); });
    return () => { live = false; };
  }, [record.sessionId]);
  React.useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-slate-900/30" onClick={onClose} data-testid="class-drawer">
      <aside role="dialog" aria-modal="true" aria-label="Class details" className="h-full w-full max-w-2xl overflow-y-auto bg-white p-4 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-start gap-3">
          <div className="mr-auto">
            <h2 className="text-lg font-semibold text-slate-900">{record.subjectName}</h2>
            <p className="text-sm text-slate-600">{dateText(record.date)}, {clock(record.startMinute)} to {clock(record.endMinute)} · {record.tutorName}</p>
          </div>
          <Badge className={TONES[record.tone].chip}>{record.stateLabel}</Badge>
          <button type="button" className="rounded border px-2 py-1 text-sm" onClick={onClose} aria-label="Close class details">Close</button>
        </div>
        <div role="tablist" className="mb-3 flex gap-1 border-b border-slate-200">
          {([['summary', 'Details'], ['workspace', canVerify ? 'Verify and manage' : 'Class workspace']] as const).map(([k, label]) => (
            <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className={`px-3 py-1.5 text-sm ${tab === k ? 'border-b-2 border-brand-600 font-semibold text-brand-700' : 'text-slate-600'}`}>{label}</button>
          ))}
        </div>
        {!canVerify && <p className="mb-3 rounded-md bg-slate-100 px-3 py-2 text-sm text-slate-700">You can read this class. Only the assigned Mentor verifies, returns or adjusts it.</p>}
        {tab === 'summary' && (error ? <p role="alert" className="text-sm text-red-700">{error}</p> : !d ? <p className="text-sm text-slate-500">Loading the class</p> : <Summary d={d} />)}
        {tab === 'workspace' && record.sessionId && <ClassWorkspaceDrawer role="MENTOR" classKey={record.key} layout="sections" onClose={onClose} onChanged={onChanged} />}
      </aside>
    </div>
  );
}

const Row = ({ k, v }: { k: string; v: React.ReactNode }) => <div><dt className="text-xs text-slate-500">{k}</dt><dd className="text-sm text-slate-900">{v ?? 'Not recorded'}</dd></div>;

function Summary({ d }: { d: Detail }) {
  const moves = d.history.filter((h) => h.kind.includes('RESCHEDULE') || h.to === 'RESCHEDULED');
  return (
    <div className="space-y-4 text-sm">
      <section aria-label="Schedule"><h3 className="mb-1 font-semibold">Schedule</h3>
        <dl className="grid grid-cols-2 gap-2">
          <Row k="Date and time" v={`${dateText(d.date)}, ${clock(d.startMinute)} to ${clock(d.endMinute)}`} />
          <Row k="Scheduled length" v={minutesText(d.endMinute - d.startMinute)} />
          <Row k="Meet link" v={d.meetLink ? <a className="text-brand-700 underline" href={d.meetLink} target="_blank" rel="noreferrer">Open</a> : 'None added'} />
        </dl>
        <ul className="mt-2 space-y-1 text-xs text-slate-600" aria-label="Reschedule history">
          {moves.length === 0 ? <li>Never rescheduled.</li> : moves.map((h, i) => <li key={i}>{dateText(h.at)}: {h.kind.replace(/_/g, ' ').toLowerCase()}{h.reason ? `, ${h.reason}` : ''}</li>)}
        </ul>
      </section>
      <section aria-label="Delivery"><h3 className="mb-1 font-semibold">Delivery</h3>
        {d.update
          ? <dl className="grid grid-cols-2 gap-2">
              <Row k="Actual time" v={d.update.actualStartMinute !== null && d.update.actualEndMinute !== null ? `${clock(d.update.actualStartMinute)} to ${clock(d.update.actualEndMinute)} (${minutesText(d.update.actualMinutes)})` : null} />
              <Row k="Attendance" v={d.update.attendance} /><Row k="Participation" v={d.update.participation} />
              {d.update.notConductedReason && <Row k="Not conducted because" v={d.update.notConductedReason} />}
            </dl>
          : <p className="text-slate-500">The tutor has not reported this class.</p>}
      </section>
      <section aria-label="Tutor submission"><h3 className="mb-1 font-semibold">Tutor submission</h3>
        {d.update
          ? <dl className="grid grid-cols-2 gap-2">
              <Row k="Topics covered" v={d.update.topicsCovered} /><Row k="Portions completed" v={d.update.portionsCompleted} /><Row k="Homework" v={d.update.homework} />
              <Row k="Class evaluation" v={d.update.evaluationRemarks} /><Row k="Notes" v={d.update.classNotes} /><Row k="Version" v={`${d.update.version}`} />
            </dl>
          : <p className="text-slate-500">Nothing submitted yet.</p>}
        {d.voice.uploaded && d.voice.attachmentId
          ? <div className="mt-2"><p className="text-xs text-slate-500">Voice recording{d.voice.fileName ? `: ${d.voice.fileName}` : ''}{d.voice.shared ? ' · shared in the group' : ''}</p><audio controls preload="none" className="mt-1 w-full" src={audioUrl('MENTOR', d.voice.attachmentId)} /></div>
          : <p className="mt-2 text-xs text-slate-500">No voice recording uploaded.</p>}
      </section>
      <section aria-label="Mentor verification"><h3 className="mb-1 font-semibold">Mentor verification</h3>
        <dl className="grid grid-cols-2 gap-2">
          <Row k="Status" v={d.stateLabel} />
          <Row k="Verified" v={d.verified ? `${dateText(d.verified.at)}, ${minutesText(d.verified.minutes)}` : 'Not verified'} />
          {d.returned && <Row k="Returned to the tutor" v={d.returned.reason} />}
          <Row k="Mentor remarks" v={d.mentorRemarks} />
        </dl>
      </section>
      <section aria-label="Consumption and compensation"><h3 className="mb-1 font-semibold">Consumption and compensation</h3>
        <p data-testid="drawer-consumption">{d.consumption === 'CONSUMED' ? `Consumed: ${minutesText(d.verified?.minutes ?? 0)}` : 'Not consumed. A class counts only after the Mentor verifies it.'}</p>
        {d.adjustments.length > 0 && <ul className="mt-1 space-y-1 text-xs text-slate-600">{d.adjustments.map((a, i) => <li key={i}>{dateText(a.at)}: {minutesText(a.previousMinutes)} to {minutesText(a.newMinutes)}. {a.reason}{a.appliedToRecord ? '' : ' (payroll had already taken this class, so the correction is a separate record)'}</li>)}</ul>}
      </section>
    </div>
  );
}
