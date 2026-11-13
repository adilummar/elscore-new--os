"use client";

import * as React from 'react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';

import { STATE_TONE, hoursText, timeLabel } from './class-view';
import { mentoringApi } from './mentoring-client';
import { longDayLabel } from './timetable-view';
import {
  ACTIVITY_CHOICES, ActivityDraft, ActivityInfo, ActivityOptions, AUDIO_ACCEPT, COMPLETION_CHOICES, MessagePreview, SHARE_STATE, WorkspaceData, WorkspaceRole, activityProblems, audioProblem, audioUrl, copyText, draftOfActivity, emptyActivity,
  exceptionKind, fileSizeText, payloadOfActivity, verifyHint, voiceUploadUrl, workspaceBase,
} from './workspace-view';
import { FollowUps, StatusStrip, VersionHistory } from './ClassWorkspaceExtras';
import { Checklist, Timing, TutorUpdate } from './ClassSections';
import { SECTIONS, afterChecklist, beforeChecklist, timingRows, tutorUpdateRows } from './class-sections-view';
import { call } from './workspace-api';

const AREA = 'block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500 disabled:bg-slate-50';
const when = (iso: string | null) => (iso ? `${iso.slice(0, 10)} ${iso.slice(11, 16)} UTC` : '');
type Tab = 'before' | 'after' | 'review';


// ─── A message the person copies and shares themselves ──────────────────────────────────────────────────────────
interface MessageProps { role: WorkspaceRole; classKey: string; m: MessagePreview; busy: boolean; canAct: boolean; needsLink?: boolean; run: (label: string, fn: () => Promise<unknown>, done: string) => void }

export function MessageBlock({ role, classKey, m, busy, canAct, needsLink = false, run }: MessageProps) {
  const [link, setLink] = React.useState('');
  const [manual, setManual] = React.useState<string | null>(null);
  const share = m.share;
  const copy = () => run(`copy-${m.key}`, async () => {
    const made = await call(role, `/${classKey}/shares`, 'POST', { templateKey: m.key, ...(needsLink && link.trim() ? { values: { meetLink: link.trim() } } : {}) });
    const ok = await copyText(made.text);
    if (!ok) setManual(made.text);
    await call(role, `/shares/${made.shareId}/copied`, 'POST');
  }, 'The message is copied. Paste it into the group yourself, then confirm that you shared it.');
  return (
    <section aria-label={m.name} className="rounded-md border border-slate-200 bg-white p-3" data-testid={`message-${m.key}`}>
      <div className="mb-1 flex flex-wrap items-center gap-2">
        <h4 className="mr-auto text-sm font-semibold text-slate-900">{m.name}</h4>
        <Badge variant={share?.confirmedAt ? 'success' : share?.copiedAt ? 'warning' : 'default'} data-testid="share-state">{SHARE_STATE(share)}</Badge>
      </div>
      {m.ok && m.text ? <pre className="max-h-64 overflow-auto whitespace-pre-wrap rounded-md bg-slate-50 p-2 text-sm text-slate-900" data-testid="message-text">{m.text}</pre> : <p className="text-sm text-amber-800" data-testid="message-missing">{m.message ?? 'The message cannot be made yet.'}</p>}
      {needsLink && !m.ok && m.missing.includes('meetLink') && canAct && (
        <label className="mt-2 block text-sm"><span className="mb-1 block text-slate-700">Meet link for this class</span><Input value={link} placeholder="https://meet.google.com/" onChange={(e) => setLink(e.target.value)} /></label>
      )}
      {manual && <textarea readOnly aria-label="Select and copy this message" className={`${AREA} mt-2`} rows={4} value={manual} onFocus={(e) => e.currentTarget.select()} />}
      {canAct && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <Button type="button" size="sm" variant="outline" disabled={busy || (!m.ok && !(needsLink && link.trim()))} onClick={copy}>Copy message</Button>
          <Button type="button" size="sm" disabled={busy || !share || !!share.confirmedAt} onClick={() => run('confirm', () => call(role, `/shares/${share!.id}/confirm`, 'POST'), 'Recorded that you shared it.')}>I shared it in the group</Button>
        </div>
      )}
      {share?.confirmedAt && <p className="mt-1 text-xs text-slate-600">Recorded as shared by {share.confirmedBy ?? 'a user'} on {when(share.confirmedAt)}. This is a record of what was said, not proof that anyone read it.</p>}
    </section>
  );
}

// ─── Activities ──────────────────────────────────────────────────────────────────────────────────────────────────
function ActivityForm({ initial, busy, onSave, onCancel, submitLabel, options, legacy = false }: { initial: ActivityDraft; busy: boolean; submitLabel: string; onSave: (d: ActivityDraft) => void; onCancel?: () => void; options?: ActivityOptions; legacy?: boolean }) {
  const [d, setD] = React.useState(initial);
  const problems = activityProblems(d, { studentGradeId: options?.studentGradeId ?? null, legacy });
  const differs = !!d.gradeId && !!options?.studentGradeId && d.gradeId !== options.studentGradeId;
  const set = <K extends keyof ActivityDraft>(k: K, v: ActivityDraft[K]) => setD({ ...d, [k]: v });
  return (
    <div className="space-y-2 rounded-md bg-slate-50 p-3" data-testid="activity-form">
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="block text-sm"><span className="mb-1 block text-slate-700">Title</span><Input value={d.title} onChange={(e) => set('title', e.target.value)} /></label>
        <label className="block text-sm"><span className="mb-1 block text-slate-700">Kind of activity</span>
          <select className={AREA} value={d.type} onChange={(e) => set('type', e.target.value)}>{ACTIVITY_CHOICES.map(([k, label]) => <option key={k} value={k}>{label}</option>)}</select>
        </label>
        {d.type === 'OTHER' && <label className="block text-sm"><span className="mb-1 block text-slate-700">Describe the other kind</span><Input value={d.typeDescription} onChange={(e) => set('typeDescription', e.target.value)} /></label>}
        <label className="block text-sm"><span className="mb-1 block text-slate-700">Topic{legacy ? '' : <span className="text-red-600"> required</span>}</span><Input value={d.topic} onChange={(e) => set('topic', e.target.value)} /></label>
        <label className="block text-sm"><span className="mb-1 block text-slate-700">Grade it suits{legacy ? '' : <span className="text-red-600"> required</span>}</span>
          <select className={AREA} value={d.gradeId} onChange={(e) => set('gradeId', e.target.value)}><option value="">Choose</option>{(options?.grades ?? []).map((g) => <option key={g.id} value={g.id}>{g.name}{g.id === options?.studentGradeId ? ' (the student)' : ''}</option>)}</select></label>
        <label className="block text-sm"><span className="mb-1 block text-slate-700">Learning level{legacy ? '' : <span className="text-red-600"> required</span>}</span>
          <select className={AREA} value={d.learningLevel} onChange={(e) => set('learningLevel', e.target.value)}><option value="">Choose</option>{(options?.levels ?? []).map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}</select></label>
        <label className="block text-sm"><span className="mb-1 block text-slate-700">Option group, if this is one of several options</span><Input value={d.optionGroupKey} placeholder="For example Practice set" onChange={(e) => set('optionGroupKey', e.target.value)} /></label>
        {d.optionGroupKey.trim() !== '' && <label className="block text-sm"><span className="mb-1 block text-slate-700">Name of this option</span><Input value={d.optionLabel} placeholder="For example Easier version" onChange={(e) => set('optionLabel', e.target.value)} /></label>}
        <label className="block text-sm"><span className="mb-1 block text-slate-700">Due date, if any</span><Input type="date" value={d.dueDate} onChange={(e) => set('dueDate', e.target.value)} /></label>
      </div>
      {differs && <label className="block text-sm"><span className="mb-1 block text-slate-700">Why does this grade suit the student? <span className="text-red-600">required</span></span><textarea className={AREA} rows={2} value={d.suitabilityNote} onChange={(e) => set('suitabilityNote', e.target.value)} /></label>}
      {d.optionGroupKey.trim() !== '' && <p className="text-xs text-slate-600">All the options in a group count as one activity. Up to {options?.maxOptionsPerGroup ?? 3} options in a group, and each one must be shared.</p>}
      <label className="block text-sm"><span className="mb-1 block text-slate-700">Instructions for the student</span><textarea className={AREA} rows={3} value={d.instructions} onChange={(e) => set('instructions', e.target.value)} /></label>
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" size="sm" disabled={busy || problems.length > 0} onClick={() => onSave(d)}>{submitLabel}</Button>
        {onCancel && <Button type="button" size="sm" variant="ghost" onClick={onCancel}>Cancel</Button>}
        {problems.length > 0 && <span className="text-xs text-slate-500">Still needed: {problems.join(', ')}.</span>}
      </div>
    </div>
  );
}

function ActivityRow({ a, role, busy, canEdit, canRespond, run, options }: { a: ActivityInfo; role: WorkspaceRole; busy: boolean; canEdit: boolean; canRespond: boolean; run: (label: string, fn: () => Promise<unknown>, done: string) => void; options?: ActivityOptions }) {
  const [editing, setEditing] = React.useState(false);
  const [response, setResponse] = React.useState(a.studentResponse ?? '');
  const [completion, setCompletion] = React.useState(a.completion);
  const [remarks, setRemarks] = React.useState((role === 'TUTOR' ? a.tutorRemarks : a.mentorRemarks) ?? '');
  const mine = (id: string) => `/activities/${id}`;
  return (
    <li className="rounded-md border border-slate-200 bg-white p-3" data-testid="activity" data-shared={!!a.sharedAt}>
      <div className="flex flex-wrap items-center gap-2">
        <h4 className="mr-auto text-sm font-semibold text-slate-900">{a.position}. {a.title}</h4>
        <Badge variant="default">{a.type === 'OTHER' && a.typeDescription ? `Other: ${a.typeDescription}` : a.typeLabel}</Badge>
        <Badge variant={a.sharedAt ? 'success' : 'warning'}>{a.sharedAt ? 'Sharing recorded' : 'Not shared yet'}</Badge>
      </div>
      <p className="text-xs text-slate-600">Topic: {a.topic || 'not recorded'}{a.gradeName ? `. ${a.gradeName}` : ''}{a.learningLevelLabel ? `, ${a.learningLevelLabel.toLowerCase()}` : ''}{a.dueDate ? `. Due ${a.dueDate}.` : ''}</p>
      {a.optionGroupKey && <p className="text-xs text-slate-600" data-testid="activity-option">Option {a.optionLabel} in the group {a.optionGroupKey}. The group counts as one activity.</p>}
      {a.suitabilityNote && <p className="text-xs text-slate-600">Why this grade suits the student: {a.suitabilityNote}</p>}
      <p className="mt-1 whitespace-pre-wrap text-sm text-slate-800">{a.instructions}</p>
      {a.sharedAt && <p className="text-xs text-slate-600">Shared by {a.sharedBy ?? 'a user'} on {when(a.sharedAt)}.</p>}
      {role === 'TUTOR' && canEdit && !editing && (
        <div className="mt-2 flex flex-wrap gap-2">
          <Button type="button" size="sm" disabled={busy || !!a.sharedAt} onClick={() => run('share-activity', () => call(role, `${mine(a.id)}/shared`, 'POST'), 'Recorded that you shared this activity.')}>I shared this activity</Button>
          <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => setEditing(true)}>Edit</Button>
          <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => run('remove-activity', () => call(role, `${mine(a.id)}/remove`, 'POST'), 'The activity was removed. It stays in the class history.')}>Remove</Button>
        </div>
      )}
      {role === 'TUTOR' && editing && <div className="mt-2"><ActivityForm initial={draftOfActivity(a)} busy={busy} options={options} legacy={!a.learningLevel} submitLabel="Save changes" onCancel={() => setEditing(false)} onSave={(d) => { setEditing(false); run('edit-activity', () => call(role, mine(a.id), 'PUT', payloadOfActivity(d)), a.sharedAt ? 'Saved. Sharing was cleared, so share the changed activity again.' : 'Saved.'); }} /></div>}
      {canRespond && (
        <details className="mt-2 text-sm"><summary className="cursor-pointer font-medium text-slate-700">What the student did: {a.completionLabel}</summary>
          <div className="mt-2 space-y-2">
            <label className="block"><span className="mb-1 block text-slate-700">Student response</span><textarea className={AREA} rows={2} value={response} onChange={(e) => setResponse(e.target.value)} /></label>
            <label className="block"><span className="mb-1 block text-slate-700">Completion</span><select className={AREA} value={completion} onChange={(e) => setCompletion(e.target.value)}>{COMPLETION_CHOICES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
            <label className="block"><span className="mb-1 block text-slate-700">{role === 'TUTOR' ? 'Tutor remarks' : 'Mentor remarks'}</span><textarea className={AREA} rows={2} value={remarks} onChange={(e) => setRemarks(e.target.value)} /></label>
            <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => run('response', () => call(role, `${mine(a.id)}/response`, 'PUT', { ...(response.trim() ? { response } : {}), completion, ...(role === 'TUTOR' ? { tutorRemarks: remarks } : { mentorRemarks: remarks }) }), 'Saved what the student did.')}>Save</Button>
            <p className="text-xs text-slate-500">This never holds up verification of the class.</p>
          </div>
        </details>
      )}
    </li>
  );
}

// ─── The voice recording ─────────────────────────────────────────────────────────────────────────────────────────
function VoicePanel({ role, classKey, w, busy, run }: { role: WorkspaceRole; classKey: string; w: WorkspaceData; busy: boolean; run: (label: string, fn: () => Promise<unknown>, done: string) => void }) {
  const v = w.after.voice;
  const [file, setFile] = React.useState<File | null>(null);
  const [problem, setProblem] = React.useState<string | null>(null);
  const upload = () => {
    const p = audioProblem(file);
    setProblem(p);
    if (p || !file) return;
    run('upload', async () => {
      const form = new FormData();
      form.set('file', file);
      const res = await fetch(voiceUploadUrl(classKey), { method: 'POST', body: form });
      if (!res.ok) {
        let message = 'The recording could not be uploaded.';
        try { const j = await res.json(); if (j && typeof j.message === 'string') message = j.message; } catch { /* keep the plain message */ }
        throw new Error(message);
      }
      setFile(null);
    }, 'The recording is uploaded. Share it in the group yourself, then confirm.');
  };
  return (
    <section aria-label="Voice recording" className="rounded-md border border-slate-200 bg-white p-3" data-testid="voice-panel">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <h4 className="mr-auto text-sm font-semibold text-slate-900">Voice recording</h4>
        <Badge variant={v ? 'success' : 'warning'}>{v ? 'Uploaded' : 'Not uploaded'}</Badge>
        <Badge variant={v?.sharedAt ? 'success' : 'warning'}>{v?.sharedAt ? 'Shared in the group' : 'Sharing not confirmed'}</Badge>
        <Badge variant={v?.mentorVerifiedAt ? 'success' : 'default'}>{v?.mentorVerifiedAt ? 'Verified by the Mentor' : 'Not verified by the Mentor'}</Badge>
      </div>
      {v && (
        <div className="space-y-1">
          <p className="text-sm text-slate-800">{v.fileName}, {fileSizeText(v.size)}. Uploaded by {v.uploadedBy ?? 'a user'} on {when(v.uploadedAt)}.</p>
          <audio controls preload="none" src={audioUrl(role, v.id)} className="w-full" aria-label="Voice recording player" />
          {v.sharedAt && <p className="text-xs text-slate-600">Shared by {v.sharedBy ?? 'a user'} on {when(v.sharedAt)}.</p>}
          {v.mentorVerifiedAt && <p className="text-xs text-slate-600">Verified by {v.mentorVerifiedBy ?? 'the Mentor'} on {when(v.mentorVerifiedAt)}.</p>}
          {w.after.earlierVoice > 0 && <p className="text-xs text-slate-500">{w.after.earlierVoice} earlier recording kept on record.</p>}
        </div>
      )}
      {role === 'TUTOR' && w.after.canEdit && (
        <div className="mt-2 space-y-2">
          <label className="block text-sm"><span className="mb-1 block text-slate-700">{v ? 'Upload a new recording' : 'Choose the recording'} (up to 15 MB)</span>
            <input type="file" accept={AUDIO_ACCEPT} className="block w-full text-sm" onChange={(e) => { setFile(e.target.files?.[0] ?? null); setProblem(null); }} />
          </label>
          {problem && <p role="alert" className="text-xs font-medium text-red-600">{problem}</p>}
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" variant="outline" disabled={busy || !file} onClick={upload}>Upload recording</Button>
            <Button type="button" size="sm" disabled={busy || !v || !!v.sharedAt} onClick={() => run('voice-shared', () => call(role, `/${classKey}/voice/shared`, 'POST'), 'Recorded that you shared the recording.')}>I shared the recording in the group</Button>
          </div>
        </div>
      )}
    </section>
  );
}

// ─── The Mentor review ───────────────────────────────────────────────────────────────────────────────────────────
export function ReviewPanel({ w, classKey, busy, run, canWork, onClosed }: { w: WorkspaceData; classKey: string; busy: boolean; canWork: boolean; run: (label: string, fn: () => Promise<unknown>, done: string) => void; onClosed: () => void }) {
  const r = w.review;
  const [reason, setReason] = React.useState('');
  const [cancelReason, setCancelReason] = React.useState('');
  const [note, setNote] = React.useState('');
  const x = r.exception;
  const xs = exceptionKind(x);
  const sessionId = w.class.sessionId;
  const waiting = w.class.status === 'AWAITING_MENTOR_VERIFICATION';
  return (
    <div className="space-y-3" data-testid="review-panel">
      <dl className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
        {([['Scheduled', hoursText(r.minutes.scheduled)], ['Reported by the tutor', r.minutes.reported == null ? 'Not reported' : hoursText(r.minutes.reported)], ['Verified', r.minutes.verified == null ? 'Not verified' : hoursText(r.minutes.verified)], ['Consumed', hoursText(r.minutes.consumed)]] as Array<[string, string]>).map(([k, v]) => <div key={k}><dt className="text-xs text-slate-500">{k}</dt><dd className="text-slate-900">{v}</dd></div>)}
      </dl>
      <p className="text-sm text-slate-700" data-testid="consumption">{r.consumption === 'CONSUMED' ? 'This class is consumed.' : 'This class is not consumed. It counts only once the Mentor verifies it.'}</p>
      <ul className="space-y-0.5 text-sm" aria-label="Review checklist">{w.class.checklist.map((i) => <li key={i.key} data-done={i.done}><span className="font-medium">{i.label}</span>: {i.detail}</li>)}</ul>
      {waiting && <p className={`rounded-md px-3 py-2 text-sm ${r.blockers.length ? 'bg-amber-50 text-amber-900' : 'bg-emerald-50 text-emerald-800'}`} data-testid="verify-hint">{verifyHint(r)}</p>}
      <FollowUps role="MENTOR" classKey={classKey} items={r.followUps ?? []} busy={busy} canWork={canWork} run={run} />
      {r.cancelled && <p className="rounded-md bg-slate-100 px-3 py-2 text-sm text-slate-800">Cancelled by {r.cancelled.by ?? 'a user'} on {when(r.cancelled.at)}. Reason: {r.cancelled.reason}</p>}

      {canWork && waiting && sessionId && (
        <Button type="button" size="sm" disabled={busy || !r.canVerify} onClick={() => run('verify', () => mentoringApi(`/mentoring/classes/${sessionId}/verify`, 'POST', {}), 'The class is verified.')}>Verify class</Button>
      )}

      {xs !== 'NONE' && (
        <p className="rounded-md border border-slate-200 px-3 py-2 text-sm" data-testid="exception-state">
          Exception {xs === 'REQUESTED' ? 'requested' : xs === 'APPROVED' ? 'approved' : 'rejected'}. Asked by {x.requestedBy ?? 'a Mentor'} on {when(x.requestedAt)}: {x.reason}
          {x.decidedAt ? ` Decided by ${x.decidedBy ?? 'the Mentoring Head'} on ${when(x.decidedAt)}.` : ''}{x.decisionNote ? ` Note: ${x.decisionNote}` : ''}
        </p>
      )}
      {canWork && waiting && !r.canVerify && (xs === 'NONE' || xs === 'REJECTED') && (
        <div className="space-y-2 rounded-md bg-slate-50 p-3">
          <label className="block text-sm"><span className="mb-1 block font-medium text-slate-700">Ask the Mentoring Head for an exception <span className="text-red-600">reason required</span></span><textarea className={AREA} rows={2} value={reason} onChange={(e) => setReason(e.target.value)} /></label>
          <Button type="button" size="sm" variant="outline" disabled={busy || !reason.trim()} onClick={() => run('exception', () => call('MENTOR', `/${classKey}/exception`, 'POST', { reason }), 'The exception was sent to the Mentoring Head.')}>Request exception</Button>
        </div>
      )}
      {w.canDecideException && xs === 'REQUESTED' && (
        <div className="space-y-2 rounded-md bg-slate-50 p-3">
          <label className="block text-sm"><span className="mb-1 block font-medium text-slate-700">Note, required to reject</span><textarea className={AREA} rows={2} value={note} onChange={(e) => setNote(e.target.value)} /></label>
          <div className="flex gap-2">
            <Button type="button" size="sm" disabled={busy} onClick={() => run('approve', () => call('MENTOR', `/${classKey}/exception/decide`, 'POST', { approve: true, note }), 'The exception is approved.')}>Approve exception</Button>
            <Button type="button" size="sm" variant="outline" disabled={busy || !note.trim()} onClick={() => run('reject', () => call('MENTOR', `/${classKey}/exception/decide`, 'POST', { approve: false, note }), 'The exception is rejected.')}>Reject exception</Button>
          </div>
        </div>
      )}

      {canWork && ['SCHEDULED', 'RESCHEDULED', 'RETURNED_FOR_CORRECTION'].includes(w.class.status) && (
        <div className="space-y-2 rounded-md border border-red-100 p-3">
          <label className="block text-sm"><span className="mb-1 block font-medium text-slate-700">Cancel this class <span className="text-red-600">reason required</span></span><textarea className={AREA} rows={2} value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} /></label>
          <Button type="button" size="sm" variant="outline" disabled={busy || !cancelReason.trim()} onClick={() => run('cancel', async () => { await call('MENTOR', `/${classKey}/cancel`, 'POST', { reason: cancelReason }); onClosed(); }, 'The class is cancelled. The tutor was told, and it is never consumed.')}>Cancel class</Button>
        </div>
      )}
    </div>
  );
}

// ─── The drawer ──────────────────────────────────────────────────────────────────────────────────────────────────
/** One class: before it (reminder), after it (update, recording, activities) and the Mentor review. Used by the tutor and the Mentor. */
/**
 * `layout="tabs"` (the default, used by the tutor and the student panel) shows one section at a time. `layout="sections"` (the Mentor's class page)
 * shows Before class, After class, Actual time and Verification one under the other, each with its own checklist, under a section menu.
 */
export function ClassWorkspaceDrawer({ role, classKey, onClose, onChanged, layout = 'tabs' }: { role: WorkspaceRole; classKey: string; onClose: () => void; onChanged?: () => void; layout?: 'tabs' | 'sections' }) {
  const [w, setW] = React.useState<WorkspaceData | null>(null);
  const [tab, setTab] = React.useState<Tab>('before');
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState<string | null>(null);
  const [link, setLink] = React.useState('');
  const [adding, setAdding] = React.useState(false);

  const load = React.useCallback(async () => {
    try {
      const d: WorkspaceData = await call(role, `/${classKey}`);
      setW(d);
      setLink(d.before.meetLink ?? '');
      setError(null);
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : 'The class could not be opened.');
    }
  }, [role, classKey]);
  React.useEffect(() => { void load(); }, [load]);

  const run = (label: string, fn: () => Promise<unknown>, done: string) => {
    void (async () => {
      setBusy(true);
      setError(null);
      setNotice(null);
      try {
        await fn();
        setNotice(done);
        await load();
        onChanged?.();
      } catch (e) {
        setError(e instanceof Error && e.message ? e.message : 'That could not be done.');
      }
      setBusy(false);
    })();
  };

  const sections = layout === 'sections';
  const show = (k: Tab | 'timing') => sections || tab === k;
  const mentor = role === 'MENTOR';
  const canWork = mentor ? !!w?.canWork : true;
  const tabs: Array<[Tab, string]> = [['before', 'Before class'], ['after', 'After class'], ...(mentor ? ([['review', 'Mentor review']] as Array<[Tab, string]>) : [])];
  const closedAfter = w ? !w.after.canEdit : false;
  const cancelled = w?.class.status === 'CANCELLED';
  return (
    <section aria-label="Class workspace" className={sections ? '' : 'rounded-md border border-brand-200 bg-white p-3 shadow-sm'} data-testid="class-workspace">
      {!sections && <div className="mb-2 flex items-start justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-slate-900">{w ? `${w.class.subjectName}, ${w.student.name}` : 'Class'}</h3>
          {w && <p className="text-xs text-slate-600">{longDayLabel(w.class.date)}, {timeLabel(w.class)}. Tutor: {w.tutorName}.{w.mentorName ? ` Mentor: ${w.mentorName}.` : ''}</p>}
        </div>
        <div className="flex items-center gap-2">
          {w && <Badge variant={STATE_TONE[w.class.state] ?? 'default'}>{w.class.stateLabel}</Badge>}
          {w && <Badge variant={w.class.consumption === 'CONSUMED' ? 'success' : 'default'} data-testid="consumption-badge">{w.class.consumption === 'CONSUMED' ? 'Consumed' : 'Not consumed'}</Badge>}
          <Button type="button" size="sm" variant="ghost" onClick={onClose}>Close</Button>
        </div>
      </div>}
      {sections && (
        <nav aria-label="Sections of this class" className="-mx-1 mb-3 overflow-x-auto px-1">
          <ul className="flex min-w-max gap-1 border-b border-slate-200">{SECTIONS.filter((x) => mentor || x.key !== 'verification').map((x) => <li key={x.key}><a href={`#sec-${x.key}`} className="inline-flex min-h-10 items-center px-3 text-sm font-medium text-slate-700 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500">{x.label}</a></li>)}</ul>
        </nav>
      )}
      {!sections && <div role="tablist" aria-label="Class workspace sections" className="mb-3 flex gap-1 border-b border-slate-200">
        {tabs.map(([k, label]) => <button key={k} type="button" role="tab" id={`ws-tab-${k}`} aria-selected={tab === k} aria-controls={`ws-panel-${k}`} className={`px-3 py-1.5 text-sm ${tab === k ? 'border-b-2 border-brand-600 font-semibold text-brand-700' : 'text-slate-600'}`} onClick={() => setTab(k)}>{label}</button>)}
      </div>}
      {error && <p role="alert" className="mb-2 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      {notice && <p role="status" className="mb-2 rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{notice}</p>}
      {!w && !error && <p className="text-sm text-slate-500">Loading the class</p>}
      {w && cancelled && <p className="mb-2 rounded-md bg-slate-100 px-3 py-2 text-sm text-slate-800">This class was cancelled. Nothing more can be done on it.</p>}

      {w && show('before') && (
        <div role={sections ? undefined : 'tabpanel'} id={sections ? 'sec-before' : 'ws-panel-before'} aria-labelledby={sections ? undefined : 'ws-tab-before'} className={`space-y-3 ${sections ? 'mb-6 scroll-mt-4' : ''}`}>
          {sections && <h3 className="text-base font-semibold text-slate-900">Before class</h3>}
          {sections && !cancelled && <Checklist title="Before-class checklist" rows={beforeChecklist(w)} testId="before-checklist" />}
          <p className="text-sm text-slate-700">The reminder is due {w.before.leadMinutes} minutes before the class, at {when(w.before.targetAt)}.</p>
          {w.before.warning && <p role="alert" className={`rounded-md px-3 py-2 text-sm ${w.before.warning.level === 'red' ? 'bg-red-50 text-red-800' : 'bg-amber-50 text-amber-900'}`} data-testid="reminder-warning" data-level={w.before.warning.level}>{w.before.warning.text}</p>}
          <div className="text-sm">
            <p className="font-medium text-slate-700">Google Meet link</p>
            {mentor && canWork && !cancelled && !closedAfter ? (
              <div className="mt-1 flex flex-wrap gap-2"><span className="min-w-[16rem] flex-1"><Input aria-label="Google Meet link" value={link} placeholder="https://meet.google.com/" onChange={(e) => setLink(e.target.value)} /></span>
                <Button type="button" size="sm" variant="outline" disabled={busy || link === (w.before.meetLink ?? '')} onClick={() => run('meet', () => call('MENTOR', `/${classKey}/meet-link`, 'PUT', { link }), 'The Meet link is saved.')}>Save link</Button></div>
            ) : <p className="text-slate-900">{w.before.meetLink ?? 'No link has been set for this class.'}</p>}
          </div>
          {!cancelled && <MessageBlock role={role} classKey={classKey} m={w.before.message} busy={busy} canAct={canWork && !closedAfter} needsLink={!w.before.meetLink} run={run} />}
        </div>
      )}

      {w && show('after') && (
        <div role={sections ? undefined : 'tabpanel'} id={sections ? 'sec-after' : 'ws-panel-after'} aria-labelledby={sections ? undefined : 'ws-tab-after'} className={`space-y-3 ${sections ? 'mb-6 scroll-mt-4' : ''}`}>
          {sections && <h3 className="text-base font-semibold text-slate-900">After class</h3>}
          {sections && !cancelled && <Checklist title="After-class checklist" rows={afterChecklist(w)} testId="after-checklist" />}
          {sections && !cancelled && <TutorUpdate rows={tutorUpdateRows(w)} />}
          {!cancelled && (
            <>
              <StatusStrip c={w.class} />
              <div className="space-y-2">{w.after.messages.map((m) => <MessageBlock key={m.key} role={role} classKey={classKey} m={m} busy={busy} canAct={canWork && w.after.canEdit} run={run} />)}</div>
              <VoicePanel role={role} classKey={classKey} w={w} busy={busy} run={run} />
              <section aria-label="Post-class activities" className="space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <h4 className="mr-auto text-sm font-semibold text-slate-900">Post-class activities</h4>
                  <Badge variant={(w.after.activityCounts?.created ?? w.after.activities.length) >= w.after.minimumActivities ? 'success' : 'warning'} data-testid="activity-count">{w.after.activityCounts?.created ?? w.after.activities.length} of at least {w.after.minimumActivities} created, {w.after.activityCounts?.shared ?? w.after.activities.filter((a) => a.sharedAt).length} shared. Options of one group count once.</Badge>
                </div>
                <ul className="space-y-2" aria-label="Activities">{w.after.activities.map((a) => <ActivityRow key={a.id} a={a} role={role} busy={busy} canEdit={w.after.canEdit} canRespond={canWork} run={run} options={w.after.activityOptions} />)}</ul>
                {role === 'TUTOR' && w.after.canEdit && (adding
                  ? <ActivityForm initial={emptyActivity(w.after.activityOptions?.studentGradeId ?? null)} options={w.after.activityOptions} busy={busy} submitLabel="Add activity" onCancel={() => setAdding(false)} onSave={(d) => { setAdding(false); run('add-activity', () => call(role, `/${classKey}/activities`, 'POST', payloadOfActivity(d)), 'The activity was added.'); }} />
                  : <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => setAdding(true)}>Add an activity</Button>)}
              </section>
              <VersionHistory versions={w.after.versions ?? []} />
              {role === 'TUTOR' && <FollowUps role="TUTOR" classKey={classKey} items={w.review.followUps ?? []} busy={busy} canWork run={run} />}
            </>
          )}
        </div>
      )}

      {w && sections && !cancelled && (
        <div id="sec-timing" className="mb-6 scroll-mt-4 space-y-3">
          <h3 className="text-base font-semibold text-slate-900">Actual time</h3>
          <Timing rows={timingRows(w)} w={w} />
        </div>
      )}

      {w && show('review') && mentor && (
        <div role={sections ? undefined : 'tabpanel'} id={sections ? 'sec-verification' : 'ws-panel-review'} aria-labelledby={sections ? undefined : 'ws-tab-review'} className={sections ? 'scroll-mt-4 space-y-3' : undefined}>
          {sections && <h3 className="text-base font-semibold text-slate-900">Verification</h3>}
          <ReviewPanel w={w} classKey={classKey} busy={busy} run={run} canWork={canWork} onClosed={onClose} />
        </div>
      )}
    </section>
  );
}
