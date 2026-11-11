"use client";

import * as React from 'react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import {
  ClassItem, DailyData, STATE_CHOICES, STATE_TONE, TUTOR_CONFIRMATION_LABELS, VERIFICATION_LABELS, activityLabel, hoursText, timeLabel,
} from '../../class-view';
import { ClassWorkspaceDrawer } from '../../ClassWorkspaceDrawer';
import { mentoringApi } from '../../mentoring-client';
import { addDays, dayLabel, longDayLabel } from '../../timetable-view';

const AREA = 'block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500 disabled:bg-slate-50';
const todayIso = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
};
const when = (iso: string) => `${dayLabel(iso.slice(0, 10))}, ${iso.slice(11, 16)} UTC`;

// ─── One class ───────────────────────────────────────────────────────────────────────────────────────────────────
interface CardProps {
  c: ClassItem;
  canWork: boolean;
  busy?: boolean;
  onPrepare: () => void;
  onSend: () => void;
  onReschedule: () => void;
  onReview: () => void;
  onWorkspace?: () => void;
}

export function ClassCard({ c, canWork, busy = false, onPrepare, onSend, onReschedule, onReview, onWorkspace }: CardProps) {
  const remindable = c.status === 'SCHEDULED' || c.status === 'RESCHEDULED' || c.status === 'RETURNED_FOR_CORRECTION';
  const reviewable = c.sessionId !== null && ['AWAITING_MENTOR_VERIFICATION', 'RETURNED_FOR_CORRECTION', 'VERIFIED', 'NOT_CONDUCTED'].includes(c.status);
  return (
    <article aria-label={`${c.subjectName} ${timeLabel(c)}`} className="rounded-md border border-slate-200 bg-white p-3" data-testid="class-card" data-key={c.key} data-state={c.state}>
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <h3 className="mr-auto text-sm font-semibold text-slate-900">{c.subjectName}<span className="ml-2 font-normal text-slate-500">{timeLabel(c)}</span></h3>
        {c.moved && <Badge variant="info">Moved</Badge>}
        <Badge variant={STATE_TONE[c.state]} data-testid="class-state">{c.stateLabel}</Badge>
      </div>
      <dl className="grid grid-cols-1 gap-x-4 gap-y-1 text-sm sm:grid-cols-2 lg:grid-cols-3">
        {([
          ['Student', c.studentName], ['Tutor', c.tutorName], ['Date', longDayLabel(c.date)], ['Scheduled duration', hoursText(c.scheduledMinutes)],
          ['Tutor confirmation', TUTOR_CONFIRMATION_LABELS[c.tutorConfirmation]], ['Mentor verification', VERIFICATION_LABELS[c.mentorVerification]],
        ] as Array<[string, string]>).map(([k, v]) => <div key={k}><dt className="text-xs text-slate-500">{k}</dt><dd className="text-slate-900">{v}</dd></div>)}
      </dl>
      <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-0.5 text-xs" aria-label="Class checklist">
        {c.checklist.map((i) => <li key={i.key} className={i.done ? 'text-emerald-700' : 'text-slate-500'} data-done={i.done}>{i.label}: {i.done ? 'done' : 'pending'}</li>)}
      </ul>
      {c.sla && <p className="mt-1 text-xs text-slate-600" data-testid="class-sla">{c.sla.label}{c.sla.overdueMinutes > 0 ? `, ${hoursText(c.sla.overdueMinutes)} overdue` : ''}. Review due {when(c.sla.dueAt)}.</p>}
      {c.returned && <p className="mt-1 text-xs text-red-700">Returned to the tutor: {c.returned.reason}</p>}
      {canWork && (
        <div className="mt-2 flex flex-wrap gap-2">
          {remindable && <Button type="button" size="sm" variant="outline" disabled={busy} onClick={onPrepare}>Prepare reminder</Button>}
          {remindable && <Button type="button" size="sm" variant="outline" disabled={busy} onClick={onSend}>Send reminder</Button>}
          {(c.status === 'SCHEDULED' || c.status === 'RESCHEDULED') && <Button type="button" size="sm" variant="outline" disabled={busy} onClick={onReschedule}>Reschedule</Button>}
          {reviewable && <Button type="button" size="sm" disabled={busy} onClick={onReview}>{c.status === 'AWAITING_MENTOR_VERIFICATION' ? 'Review and verify' : 'View update'}</Button>}
        </div>
      )}
      {onWorkspace && c.status !== 'CANCELLED' && <div className="mt-2"><Button type="button" size="sm" variant="outline" onClick={onWorkspace}>Open class workspace</Button></div>}
      {!canWork && reviewable && <div className="mt-2"><Button type="button" size="sm" variant="outline" onClick={onReview}>View update</Button></div>}
    </article>
  );
}

// ─── The review ──────────────────────────────────────────────────────────────────────────────────────────────────
interface ReviewProps {
  c: ClassItem;
  canWork: boolean;
  busy?: boolean;
  error?: string | null;
  onClose: () => void;
  onNotes: (notes: Record<string, unknown>) => void;
  onVerify: (verifiedMinutes: number | null, reason: string) => void;
  onReturn: (reason: string, kind: 'CORRECTION' | 'INCOMPLETE') => void;
  onAdjust: (minutes: number, reason: string) => void;
}

export function ClassReview({ c, canWork, busy = false, error = null, onClose, onNotes, onVerify, onReturn, onAdjust }: ReviewProps) {
  const u = c.update;
  const [remarks, setRemarks] = React.useState(c.mentorRemarks ?? '');
  const [voiceRemarks, setVoiceRemarks] = React.useState(u?.voice.remarks ?? '');
  const [minutes, setMinutes] = React.useState(String(u?.actualMinutes ?? c.verified?.minutes ?? c.scheduledMinutes));
  const [reason, setReason] = React.useState('');
  const [returnReason, setReturnReason] = React.useState('');
  const [adjustMinutes, setAdjustMinutes] = React.useState(String(c.verified?.minutes ?? 0));
  const [adjustReason, setAdjustReason] = React.useState('');
  const differs = u?.actualMinutes != null && Number(minutes) !== u.actualMinutes;
  const waiting = c.status === 'AWAITING_MENTOR_VERIFICATION';
  const verified = c.status === 'VERIFIED';
  const field = (label: string, value: React.ReactNode) => (value ? <div><dt className="text-xs text-slate-500">{label}</dt><dd className="whitespace-pre-wrap text-slate-900">{value}</dd></div> : null);
  return (
    <section aria-label="Class review" className="rounded-md border border-brand-200 bg-white p-3" data-testid="class-review">
      <div className="mb-2 flex items-start justify-between gap-2">
        <h3 className="text-sm font-semibold text-slate-900">{c.subjectName}, {c.studentName}, {longDayLabel(c.date)}, {timeLabel(c)}</h3>
        <Button type="button" size="sm" variant="ghost" onClick={onClose}>Close</Button>
      </div>
      {!u ? <p className="text-sm text-slate-500">The tutor has not submitted an update for this class.</p> : (
        <dl className="grid gap-x-4 gap-y-2 text-sm sm:grid-cols-2">
          {field('Class conducted', u.conducted ? 'Yes' : 'No')}
          {field('Reason not conducted', u.notConductedReason)}
          {field('Actual time', u.actualStartMinute != null && u.actualEndMinute != null ? `${timeLabel({ startMinute: u.actualStartMinute, endMinute: u.actualEndMinute })} (${hoursText(u.actualMinutes ?? 0)})` : null)}
          {field('Subject covered', u.subjectCovered)}
          {field('Topics covered', u.topicsCovered)}
          {field('Attendance', u.attendance ? u.attendance.charAt(0) + u.attendance.slice(1).toLowerCase() : null)}
          {field('Participation', u.participation ? u.participation.charAt(0) + u.participation.slice(1).toLowerCase() : null)}
          {field('Post-class activities', u.activities.length ? u.activities.map((a) => (a === 'OTHER' && u.otherActivity ? `Other: ${u.otherActivity}` : activityLabel(a))).join(', ') : null)}
          {field('Remarks, class evaluation', u.evaluationRemarks)}
          {field('Remarks, topics covered in class', u.coveredRemarks)}
          {field('Class notes', u.classNotes)}
        </dl>
      )}
      <ul className="mt-3 space-y-0.5 text-sm" aria-label="Review checklist">
        {c.checklist.map((i) => <li key={i.key} data-done={i.done}><span className="font-medium">{i.label}</span>: {i.detail}</li>)}
      </ul>
      {(c.blockers ?? []).length > 0 && waiting && (
        <div className="mt-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-900" data-testid="verify-blockers">
          <p className="mb-0.5 font-medium">This class cannot be verified yet</p>
          <ul role="list" aria-label="What is missing" className="space-y-0.5">{(c.blockers ?? []).map((b) => <li key={b}>{b}</li>)}</ul>
          <p className="mt-1">Open the class workspace to add what is missing, or ask the Mentoring Head for an exception.</p>
        </div>
      )}
      {(c.warnings ?? []).length > 0 && waiting && (
        <div className="mt-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          <p className="mb-0.5 font-medium">Before you verify</p>
          <ul role="list" aria-label="Before you verify" className="space-y-0.5">{(c.warnings ?? []).map((w) => <li key={w}>{w}</li>)}</ul>
        </div>
      )}

      {canWork && u && (
        <div className="mt-3 space-y-3 border-t border-slate-100 pt-3">
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="block text-sm"><span className="mb-1 block font-medium text-slate-700">Mentor remarks</span><textarea className={AREA} rows={2} value={remarks} onChange={(e) => setRemarks(e.target.value)} /></label>
            <label className="block text-sm"><span className="mb-1 block font-medium text-slate-700">Voice update remarks</span><textarea className={AREA} rows={2} value={voiceRemarks} onChange={(e) => setVoiceRemarks(e.target.value)} /></label>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => onNotes({ mentorRemarks: remarks, voiceRemarks })}>Save remarks</Button>
            {!u.voice.receivedAt && <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => onNotes({ voiceReceived: true, voiceRemarks })}>Confirm the voice update arrived</Button>}
            {u.voice.receivedAt && !verified && <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => onNotes({ voiceReceived: false })}>Voice update not received</Button>}
          </div>

          {waiting && (
            <div className="space-y-2 rounded-md bg-slate-50 p-3">
              {u.conducted && (
                <div className="grid gap-2 sm:grid-cols-2">
                  <label className="block text-sm"><span className="mb-1 block font-medium text-slate-700">Verified minutes</span><Input type="number" min={0} max={720} value={minutes} onChange={(e) => setMinutes(e.target.value)} /></label>
                  {differs && <label className="block text-sm"><span className="mb-1 block font-medium text-slate-700">Why does it differ from the tutor? <span className="text-red-600">required</span></span><textarea className={AREA} rows={2} value={reason} onChange={(e) => setReason(e.target.value)} /></label>}
                </div>
              )}
              <div className="flex flex-wrap gap-2">
                <Button type="button" size="sm" isLoading={busy} disabled={busy || (differs && !reason.trim()) || (!!u.conducted && (c.blockers ?? []).length > 0)} onClick={() => onVerify(u.conducted ? Number(minutes) : null, reason)}>{u.conducted ? 'Verify class' : 'Confirm class not conducted'}</Button>
              </div>
              <label className="block text-sm"><span className="mb-1 block font-medium text-slate-700">Reason to send it back</span><textarea className={AREA} rows={2} value={returnReason} onChange={(e) => setReturnReason(e.target.value)} /></label>
              <div className="flex flex-wrap gap-2">
                <Button type="button" size="sm" variant="outline" disabled={busy || !returnReason.trim()} onClick={() => onReturn(returnReason, 'CORRECTION')}>Return to tutor for correction</Button>
                <Button type="button" size="sm" variant="outline" disabled={busy || !returnReason.trim()} onClick={() => onReturn(returnReason, 'INCOMPLETE')}>Mark incomplete</Button>
              </div>
            </div>
          )}

          {verified && (
            <div className="space-y-2 rounded-md bg-slate-50 p-3">
              <p className="text-sm text-slate-700">Verified for {hoursText(c.verified?.minutes ?? 0)}. A correction is recorded as an adjustment and payroll history is kept.</p>
              <div className="grid gap-2 sm:grid-cols-2">
                <label className="block text-sm"><span className="mb-1 block font-medium text-slate-700">Corrected minutes (0 cancels the pay)</span><Input type="number" min={0} max={720} value={adjustMinutes} onChange={(e) => setAdjustMinutes(e.target.value)} /></label>
                <label className="block text-sm"><span className="mb-1 block font-medium text-slate-700">Why <span className="text-red-600">required</span></span><textarea className={AREA} rows={2} value={adjustReason} onChange={(e) => setAdjustReason(e.target.value)} /></label>
              </div>
              <Button type="button" size="sm" variant="outline" disabled={busy || !adjustReason.trim() || Number(adjustMinutes) === c.verified?.minutes} onClick={() => onAdjust(Number(adjustMinutes), adjustReason)}>Record correction</Button>
            </div>
          )}
        </div>
      )}
      {error && <p role="alert" className="mt-2 text-xs font-medium text-red-600">{error}</p>}
      {(c.history ?? []).length > 0 && (
        <details className="mt-3 text-xs text-slate-600"><summary className="cursor-pointer font-medium">History</summary>
          <ol className="mt-1 space-y-0.5">{(c.history ?? []).map((h, i) => <li key={`${h.kind}-${i}`}>{h.kind.replace(/_/g, ' ').toLowerCase()}, {when(h.at)}{h.reason ? `: ${h.reason}` : ''}</li>)}</ol>
        </details>
      )}
      {(c.adjustments ?? []).length > 0 && <ul className="mt-2 text-xs text-slate-600" aria-label="Corrections">{(c.adjustments ?? []).map((a) => <li key={a.at}>{when(a.at)}: {a.previousMinutes} to {a.newMinutes} minutes. {a.reason}{a.appliedToRecord ? '' : ' Payroll had already taken the class, so HR applies it.'}</li>)}</ul>}
    </section>
  );
}

// ─── The reschedule form ─────────────────────────────────────────────────────────────────────────────────────────
export function RescheduleForm({ c, busy = false, error = null, onSubmit, onCancel }: { c: ClassItem; busy?: boolean; error?: string | null; onSubmit: (v: { newDate: string; newStart: string; newEnd: string; reason: string }) => void; onCancel: () => void }) {
  const clock = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
  const [v, setV] = React.useState({ newDate: c.date, newStart: clock(c.startMinute), newEnd: clock(c.endMinute), reason: '' });
  const same = v.newDate === c.date && v.newStart === clock(c.startMinute) && v.newEnd === clock(c.endMinute);
  return (
    <section aria-label="Reschedule class" className="rounded-md border border-slate-200 bg-slate-50 p-3" data-testid="reschedule-form">
      <h4 className="mb-2 text-sm font-semibold text-slate-900">Reschedule {c.subjectName} on {longDayLabel(c.date)}, {timeLabel(c)}</h4>
      <div className="grid gap-2 sm:grid-cols-3">
        <label className="block text-sm"><span className="mb-1 block text-slate-700">New date</span><Input type="date" value={v.newDate} onChange={(e) => setV({ ...v, newDate: e.target.value })} /></label>
        <label className="block text-sm"><span className="mb-1 block text-slate-700">New start</span><Input type="time" value={v.newStart} onChange={(e) => setV({ ...v, newStart: e.target.value })} /></label>
        <label className="block text-sm"><span className="mb-1 block text-slate-700">New end</span><Input type="time" value={v.newEnd} onChange={(e) => setV({ ...v, newEnd: e.target.value })} /></label>
      </div>
      <label className="mt-2 block text-sm"><span className="mb-1 block text-slate-700">Reason <span className="text-red-600">required</span></span><textarea className={AREA} rows={2} value={v.reason} onChange={(e) => setV({ ...v, reason: e.target.value })} /></label>
      <p className="mt-1 text-xs text-slate-600">The tutor availability and the other classes of this student are checked, the tutor is told in the app, and the original time is kept in the history.</p>
      <div className="mt-2 flex gap-2">
        <Button type="button" size="sm" isLoading={busy} disabled={busy || same || !v.reason.trim()} onClick={() => onSubmit(v)}>Move the class</Button>
        <Button type="button" size="sm" variant="ghost" onClick={onCancel}>Cancel</Button>
      </div>
      {error && <p role="alert" className="mt-2 text-xs font-medium text-red-600">{error}</p>}
    </section>
  );
}

// ─── The page section ────────────────────────────────────────────────────────────────────────────────────────────
/** Daily classes for one student: the day's classes from the tutor assignments, the tutor's updates, and the Mentor's decisions. */
export function DailyClassesPanel({ activationId }: { activationId: string }) {
  const [date, setDate] = React.useState(todayIso);
  const [subjectId, setSubjectId] = React.useState('');
  const [tutorProfileId, setTutorProfileId] = React.useState('');
  const [state, setState] = React.useState('');
  const [data, setData] = React.useState<DailyData | null>(null);
  const [known, setKnown] = React.useState<{ subjects: Map<string, string>; tutors: Map<string, string> }>({ subjects: new Map(), tutors: new Map() });
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState<string | null>(null);
  const [actionError, setActionError] = React.useState<string | null>(null);
  const [reviewing, setReviewing] = React.useState<ClassItem | null>(null);
  const [moving, setMoving] = React.useState<ClassItem | null>(null);
  const [workspace, setWorkspace] = React.useState<string | null>(null);
  const base = `/mentoring/students/${activationId}/classes`;

  const query = React.useMemo(() => `date=${date}${subjectId ? `&subjectId=${encodeURIComponent(subjectId)}` : ''}${tutorProfileId ? `&tutorProfileId=${encodeURIComponent(tutorProfileId)}` : ''}${state ? `&state=${state}` : ''}`, [date, subjectId, tutorProfileId, state]);
  const load = React.useCallback(async () => {
    try {
      const d: DailyData = await mentoringApi(`${base}?${query}`);
      setData(d);
      setKnown((k) => {
        const subjects = new Map(k.subjects);
        const tutors = new Map(k.tutors);
        for (const c of d.classes) { subjects.set(c.subjectId, c.subjectName); tutors.set(c.tutorProfileId, c.tutorName); }
        return { subjects, tutors };
      });
      setError(null);
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : 'The classes could not be loaded.');
    }
  }, [base, query]);
  React.useEffect(() => { void load(); }, [load]);

  const openReview = async (c: ClassItem) => {
    if (!c.sessionId) return;
    setActionError(null);
    try {
      setReviewing(await mentoringApi(`/mentoring/classes/${c.sessionId}`));
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'The class could not be opened.');
    }
  };
  const act = async (label: string, run: () => Promise<unknown>, done: string, after?: () => Promise<void>) => {
    setBusy(label);
    setActionError(null);
    setNotice(null);
    try {
      await run();
      setNotice(done);
      await load();
      if (after) await after();
    } catch (e) {
      setActionError(e instanceof Error && e.message ? e.message : 'That could not be done.');
    }
    setBusy(null);
  };
  const reload = async () => {
    if (reviewing?.sessionId) setReviewing(await mentoringApi(`/mentoring/classes/${reviewing.sessionId}`));
  };

  const shift = (n: number) => setDate((d) => addDays(d, n));
  const canWork = data?.canWork ?? false;
  return (
    <section aria-label="Daily classes" className="space-y-3" data-testid="daily-classes">
      <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Choose the day">
        <h2 className="mr-auto text-base font-semibold text-slate-900">{data ? `${data.student.name}, daily classes` : 'Daily classes'}</h2>
        <Button type="button" size="sm" variant="outline" onClick={() => shift(-1)}>Yesterday</Button>
        <Button type="button" size="sm" variant="outline" onClick={() => setDate(todayIso())}>Today</Button>
        <Button type="button" size="sm" variant="outline" onClick={() => shift(1)}>Tomorrow</Button>
        <span className="w-44"><Input aria-label="Choose a date" type="date" className="h-9" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} /></span>
      </div>
      <p className="text-sm font-medium text-slate-700" aria-live="polite">{longDayLabel(date)}</p>
      <div className="flex flex-wrap gap-2" role="group" aria-label="Filters">
        <label className="text-sm"><span className="sr-only">Subject</span><Select value={subjectId} onChange={(e) => setSubjectId(e.target.value)}><option value="">All subjects</option>{[...known.subjects].map(([id, name]) => <option key={id} value={id}>{name}</option>)}</Select></label>
        <label className="text-sm"><span className="sr-only">Tutor</span><Select value={tutorProfileId} onChange={(e) => setTutorProfileId(e.target.value)}><option value="">All tutors</option>{[...known.tutors].map(([id, name]) => <option key={id} value={id}>{name}</option>)}</Select></label>
        <label className="text-sm"><span className="sr-only">Class status</span><Select value={state} onChange={(e) => setState(e.target.value)}><option value="">Any status</option>{STATE_CHOICES.map(([k, label]) => <option key={k} value={k}>{label}</option>)}</Select></label>
      </div>
      {error && <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      {notice && <p role="status" className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{notice}</p>}
      {actionError && !reviewing && !moving && <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{actionError}</p>}
      {!data && !error && <p className="text-sm text-slate-500">Loading the classes</p>}
      {data && data.classes.length === 0 && <p className="rounded-md border border-dashed border-slate-300 p-3 text-sm text-slate-500" data-testid="no-classes">No classes {subjectId || tutorProfileId || state ? 'match these filters' : 'are scheduled'} on this date.</p>}
      <div className="space-y-2">
        {data?.classes.map((c) => (
          <ClassCard
            key={c.key}
            c={c}
            canWork={canWork}
            busy={busy !== null}
            onPrepare={() => act(c.key, () => mentoringApi('/mentoring/classes/remind/prepare', 'POST', { key: c.key }), 'Reminder prepared. It has not been sent yet.')}
            onSend={() => act(c.key, () => mentoringApi('/mentoring/classes/remind/send', 'POST', { key: c.key }), 'Reminder sent to the tutor.')}
            onReschedule={() => { setActionError(null); setMoving(c); }}
            onReview={() => void openReview(c)}
            onWorkspace={() => setWorkspace(workspace === c.key ? null : c.key)}
          />
        ))}
      </div>
      {workspace && <ClassWorkspaceDrawer role="MENTOR" classKey={workspace} onClose={() => setWorkspace(null)} onChanged={() => void load()} />}
      {moving && (
        <RescheduleForm c={moving} busy={busy !== null} error={actionError} onCancel={() => setMoving(null)}
          onSubmit={(v) => act(moving.key, () => mentoringApi('/mentoring/classes/reschedule', 'POST', { key: moving.key, ...v }), 'The class was moved and the tutor was told.', async () => setMoving(null))} />
      )}
      {reviewing && (
        <ClassReview
          c={reviewing} canWork={canWork} busy={busy !== null} error={actionError} onClose={() => setReviewing(null)}
          onNotes={(n) => act('notes', () => mentoringApi(`/mentoring/classes/${reviewing.sessionId}/notes`, 'PUT', n), 'Saved.', reload)}
          onVerify={(m, reason) => act('verify', () => mentoringApi(`/mentoring/classes/${reviewing.sessionId}/verify`, 'POST', { ...(m !== null ? { verifiedMinutes: m } : {}), ...(reason.trim() ? { reason } : {}) }), 'The class is verified.', async () => setReviewing(null))}
          onReturn={(reason, kind) => act('return', () => mentoringApi(`/mentoring/classes/${reviewing.sessionId}/return`, 'POST', { reason, kind }), kind === 'INCOMPLETE' ? 'Marked incomplete and returned to the tutor.' : 'Returned to the tutor for correction.', async () => setReviewing(null))}
          onAdjust={(minutes, reason) => act('adjust', () => mentoringApi(`/mentoring/classes/${reviewing.sessionId}/adjust`, 'POST', { minutes, reason }), 'The correction is recorded.', reload)}
        />
      )}
    </section>
  );
}
